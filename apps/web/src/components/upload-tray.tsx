"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";
import { Button } from "./ui/button";
import {
  finishUploadAction,
  refreshVideosAction,
  restartUploadAction,
} from "@/app/[slug]/panel/arqueros/[id]/videos/actions";

type Phase = "uploading" | "processing" | "ready" | "error";

type Item = {
  id: string;
  slug: string;
  goalkeeperId: string;
  label: string;
  phase: Phase;
  progress: number;
  message: string | null;
  /** Se conserva en memoria para poder reintentar sin volver a elegirlo. */
  file: File;
};

type BeginInput = {
  slug: string;
  goalkeeperId: string;
  videoId: string;
  uploadUrl: string;
  file: File;
  label: string;
};

type Context = {
  items: Item[];
  begin: (input: BeginInput) => void;
};

const UploadContext = createContext<Context | null>(null);

export function useUploads(): Context {
  const context = useContext(UploadContext);
  if (!context) throw new Error("useUploads debe usarse dentro de UploadProvider");
  return context;
}

const POLL_MS = 4_000;
const POLL_MAX_MS = 15 * 60_000;

/** Mensaje claro para el profesor según lo que pasó, sin términos técnicos. */
const CONNECTION_MESSAGE = "Sin conexión: la subida sigue sola cuando vuelva la señal.";

/**
 * Administra las subidas de video en segundo plano (spec 03, RF-04 y RF-05). Vive en el marco del
 * panel, así que sigue funcionando mientras el profesor navega a otras pantallas. La subida es
 * directa a Mux, en partes, con reintentos automáticos y pausa sin conexión.
 */
export function UploadProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);

  const patch = useCallback((id: string, changes: Partial<Item>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }, []);

  /** Después de subir, consulta el estado hasta que el video esté listo o falle. */
  const watchProcessing = useCallback(
    async (item: Pick<Item, "id" | "slug" | "goalkeeperId">) => {
      const startedAt = Date.now();
      while (Date.now() - startedAt < POLL_MAX_MS) {
        try {
          const [progress] = await refreshVideosAction(item.slug, item.goalkeeperId, [item.id]);
          if (progress?.processingStatus === "ready") {
            patch(item.id, { phase: "ready", progress: 100, message: null });
            return;
          }
          if (progress?.processingStatus === "error") {
            patch(item.id, {
              phase: "error",
              message: progress.errorReason ?? "No se pudo procesar el video.",
            });
            return;
          }
        } catch {
          // Sin conexión o servidor ocupado: se vuelve a consultar.
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
      patch(item.id, {
        message: "Está tardando más de lo normal. Se va a actualizar solo en la lista de videos.",
      });
    },
    [patch],
  );

  const upload = useCallback(
    async (item: Pick<Item, "id" | "slug" | "goalkeeperId" | "file">, uploadUrl: string) => {
      const { UpChunk } = await import("@mux/upchunk");
      const job = UpChunk.createUpload({
        endpoint: uploadUrl,
        file: item.file,
        // Partes de 5 MB (múltiplo de 256 KB): si se corta la señal, solo se repite la parte en curso.
        chunkSize: 5120,
        attempts: 8,
        delayBeforeAttempt: 3,
      });
      job.on("progress", (event: CustomEvent<number>) => {
        patch(item.id, { progress: Math.min(99, Math.round(event.detail)), message: null });
      });
      job.on("attemptFailure", () => {
        patch(item.id, { message: "Se cortó la conexión. Reintentando…" });
      });
      job.on("offline", () => patch(item.id, { message: CONNECTION_MESSAGE }));
      job.on("online", () => patch(item.id, { message: null }));
      job.on("error", () => {
        patch(item.id, {
          phase: "error",
          message: "No se pudo completar la subida. Podés reintentarla.",
        });
      });
      job.on("success", () => {
        patch(item.id, { phase: "processing", progress: 100, message: null });
        void finishUploadAction(item.slug, item.goalkeeperId, item.id)
          .catch(() => null)
          .then(() => watchProcessing(item));
      });
    },
    [patch, watchProcessing],
  );

  const begin = useCallback(
    (input: BeginInput) => {
      const item: Item = {
        id: input.videoId,
        slug: input.slug,
        goalkeeperId: input.goalkeeperId,
        label: input.label,
        phase: "uploading",
        progress: 0,
        message: null,
        file: input.file,
      };
      setItems((current) => [...current.filter((i) => i.id !== item.id), item]);
      void upload(item, input.uploadUrl);
    },
    [upload],
  );

  const retry = useCallback(
    async (item: Item) => {
      patch(item.id, { phase: "uploading", progress: 0, message: "Preparando de nuevo…" });
      const result = await restartUploadAction(item.slug, item.goalkeeperId, item.id);
      if (!result.ok) {
        patch(item.id, { phase: "error", message: result.message });
        return;
      }
      patch(item.id, { message: null });
      void upload(item, result.uploadUrl);
    },
    [patch, upload],
  );

  const dismiss = useCallback((id: string) => {
    setItems((current) => current.filter((i) => i.id !== id));
  }, []);

  // Avisa antes de cerrar la pestaña con una subida en curso: el archivo vive en este navegador.
  const uploading = items.some((i) => i.phase === "uploading");
  useEffect(() => {
    if (!uploading) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  const value = useMemo(() => ({ items, begin }), [items, begin]);

  return (
    <UploadContext.Provider value={value}>
      {children}
      <UploadTray items={items} onRetry={retry} onDismiss={dismiss} />
    </UploadContext.Provider>
  );
}

const PHASE_LABEL: Record<Phase, string> = {
  uploading: "Subiendo",
  processing: "Procesando",
  ready: "Listo",
  error: "Con error",
};

/** Bandeja flotante con el estado de cada subida (RF-05): subiendo, procesando, listo o con error. */
function UploadTray({
  items,
  onRetry,
  onDismiss,
}: {
  items: Item[];
  onRetry: (item: Item) => void;
  onDismiss: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div
      role="region"
      aria-label="Subidas de video"
      aria-live="polite"
      className="fixed inset-x-3 bottom-3 z-50 space-y-2 sm:left-auto sm:right-4 sm:w-96"
    >
      {items.map((item) => (
        <div
          key={item.id}
          className="space-y-2 rounded-card border border-line bg-surface p-3 shadow-card-hover"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{item.label}</p>
              <p
                className={cn(
                  "text-sm",
                  item.phase === "error" ? "font-medium text-danger" : "text-ink-muted",
                )}
              >
                {PHASE_LABEL[item.phase]}
                {item.phase === "uploading" && ` · ${item.progress}%`}
              </p>
            </div>
            {(item.phase === "ready" || item.phase === "error") && (
              <button
                type="button"
                onClick={() => onDismiss(item.id)}
                aria-label={`Cerrar el aviso de ${item.label}`}
                className="-mr-1 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-accent-soft hover:text-ink"
              >
                ✕
              </button>
            )}
          </div>

          {(item.phase === "uploading" || item.phase === "processing") && (
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={item.phase === "processing" ? undefined : item.progress}
              aria-label={`Progreso de ${item.label}`}
              className="h-2 overflow-hidden rounded-full bg-line"
            >
              <div
                className={cn(
                  "h-full rounded-full bg-accent transition-[width] duration-300",
                  item.phase === "processing" && "animate-pulse",
                )}
                style={{ width: `${item.phase === "processing" ? 100 : item.progress}%` }}
              />
            </div>
          )}

          {item.message && <p className="text-sm text-ink-muted">{item.message}</p>}

          {item.phase === "error" && (
            <Button size="sm" variant="secondary" onClick={() => onRetry(item)}>
              Reintentar
            </Button>
          )}
          {item.phase === "processing" && (
            <p className="text-xs text-ink-muted">
              Ya podés seguir trabajando: el video va a figurar como listo cuando termine.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
