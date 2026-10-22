"use client";

// Versión perezosa: el reproductor (~1,2 MB) se descarga cuando el video entra en pantalla y no
// antes de que la página pueda hidratarse. El tipo se importa aparte porque no pesa nada.
import MuxPlayer from "@mux/mux-player-react/lazy";
import type { MuxPlayerRefAttributes } from "@mux/mux-player-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/video-schemas";
import { Button } from "./ui/button";
import { FormAlert } from "./ui/field";

type Tokens = { playback: string; thumbnail: string; storyboard: string };
type TokenResponse = { playbackId: string; tokens: Tokens; expiresInSeconds: number };

export type StageComment = {
  id: string;
  authorId?: string | null;
  authorName: string | null;
  second: number | null;
  body: string;
};

export type CommentActions = {
  add: (input: {
    body: string;
    second: number | null;
  }) => Promise<{ error?: string; ok?: boolean }>;
  update: (
    commentId: string,
    input: { body: string; second: number | null },
  ) => Promise<{ error?: string; ok?: boolean }>;
  remove: (commentId: string) => Promise<{ error?: string; ok?: boolean }>;
};

type Props = {
  slug: string;
  videoId: string;
  title: string;
  comments: StageComment[];
  /** Solo el staff comenta (RF-16). Sin esto, los comentarios son de solo lectura. */
  staff?: { userId: string; isAdmin: boolean; actions: CommentActions };
};

/** Se pide un token nuevo un poco antes de que venza el de 1 hora (RF-22). */
const REFRESH_MARGIN_SECONDS = 5 * 60;

/**
 * Reproductor privado con comentarios. El token firmado se pide al servidor, que verifica la
 * sesión en cada pedido; se renueva solo antes de vencer. Tocar un comentario con marca de tiempo
 * salta a ese momento (RF-18). No hay descarga ni links públicos, y la analítica del reproductor
 * está desactivada (el portal no usa seguimiento de terceros).
 */
export function VideoStage({ slug, videoId, title, comments, staff }: Props) {
  const player = useRef<MuxPlayerRefAttributes>(null);
  const [source, setSource] = useState<TokenResponse | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  // Cambia para pedir un token nuevo: al reintentar y antes de que venza el de 1 hora (RF-22).
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/${slug}/video-token/${videoId}`, { cache: "no-store" });
        if (cancelled) return;
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          setFailure(
            response.status === 404
              ? "Este video no está disponible."
              : (body?.error ?? "No pudimos cargar el video."),
          );
          return;
        }
        const data = (await response.json()) as TokenResponse;
        if (cancelled) return;
        setSource(data);
        setFailure(null);
      } catch {
        if (!cancelled) setFailure("No pudimos cargar el video. Revisá tu conexión.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, videoId, attempt]);

  // Renovación automática mientras la página siga abierta.
  useEffect(() => {
    if (!source) return;
    const wait = Math.max(30, source.expiresInSeconds - REFRESH_MARGIN_SECONDS) * 1000;
    const timer = setTimeout(() => setAttempt((n) => n + 1), wait);
    return () => clearTimeout(timer);
  }, [source]);

  const seek = (second: number) => {
    const element = player.current;
    if (!element) return;
    element.currentTime = second;
    void element.play().catch(() => undefined);
  };
  const currentSecond = () => Math.floor(player.current?.currentTime ?? 0);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-card border border-line bg-black">
        {source ? (
          <MuxPlayer
            ref={player}
            playbackId={source.playbackId}
            tokens={source.tokens}
            streamType="on-demand"
            loading="viewport"
            title={title}
            // Sin analítica ni cookies del reproductor, y sin atajos que no hacen falta.
            disableTracking
            disableCookies
            accentColor="var(--accent)"
            style={{ aspectRatio: "16 / 9", width: "100%", display: "block" }}
          />
        ) : (
          <div
            className="flex aspect-video w-full items-center justify-center p-6 text-center text-sm text-white/80"
            aria-busy={!failure}
          >
            {failure ? (
              <div className="space-y-3">
                <p>{failure}</p>
                <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>
                  Reintentar
                </Button>
              </div>
            ) : (
              "Cargando video…"
            )}
          </div>
        )}
      </div>

      <section aria-label="Comentarios" className="space-y-3">
        <h2 className="font-display text-lg font-bold">Comentarios</h2>
        {comments.length === 0 ? (
          <p className="text-ink-muted">Todavía no hay comentarios.</p>
        ) : (
          <ul className="space-y-3">
            {comments.map((comment) => (
              <CommentRow key={comment.id} comment={comment} onSeek={seek} staff={staff} />
            ))}
          </ul>
        )}
        {staff && <CommentForm actions={staff.actions} currentSecond={currentSecond} />}
      </section>
    </div>
  );
}

function CommentRow({
  comment,
  onSeek,
  staff,
}: {
  comment: StageComment;
  onSeek: (second: number) => void;
  staff?: Props["staff"];
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(comment.body);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const canManage = staff && (staff.isAdmin || comment.authorId === staff.userId);

  const save = () =>
    startTransition(async () => {
      const result = await staff!.actions.update(comment.id, { body, second: comment.second });
      if (result.error) setError(result.error);
      else {
        setError(null);
        setEditing(false);
      }
    });
  const remove = () =>
    startTransition(async () => {
      const result = await staff!.actions.remove(comment.id);
      if (result.error) setError(result.error);
    });

  return (
    <li className="space-y-1 rounded-control border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {comment.second !== null ? (
          <button
            type="button"
            onClick={() => onSeek(comment.second as number)}
            aria-label={`Ir al minuto ${formatDuration(comment.second)} del video`}
            className="inline-flex h-8 items-center rounded-full bg-accent px-3 font-bold tabular-nums text-on-accent hover:brightness-110"
          >
            {formatDuration(comment.second)}
          </button>
        ) : (
          <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold">
            General
          </span>
        )}
        {comment.authorName && <span className="font-semibold">{comment.authorName}</span>}
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={3}
            maxLength={1000}
            aria-label="Editar el comentario"
            className="w-full rounded-control border border-line bg-surface px-3 py-2 text-base focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={pending}>
              Guardar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-line">{comment.body}</p>
      )}

      {canManage && !editing && (
        <div className="flex gap-1 pt-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)} disabled={pending}>
            Editar
          </Button>
          <Button size="sm" variant="ghost" onClick={remove} disabled={pending}>
            Borrar
          </Button>
        </div>
      )}
      {error && <FormAlert>{error}</FormAlert>}
    </li>
  );
}

function CommentForm({
  actions,
  currentSecond,
}: {
  actions: CommentActions;
  currentSecond: () => number;
}) {
  const [body, setBody] = useState("");
  const [withTimestamp, setWithTimestamp] = useState(true);
  const [moment, setMoment] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      const second = withTimestamp ? currentSecond() : null;
      const result = await actions.add({ body, second });
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setBody("");
    });

  return (
    <div className="space-y-3 rounded-card border border-line bg-surface p-3">
      <label htmlFor="comment-body" className="block text-sm font-semibold">
        Nuevo comentario
      </label>
      <textarea
        id="comment-body"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onFocus={() => setMoment(currentSecond())}
        rows={3}
        maxLength={1000}
        className="w-full rounded-control border border-line bg-surface px-3 py-2 text-base focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
      />
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={withTimestamp}
          onChange={(event) => {
            setWithTimestamp(event.target.checked);
            setMoment(currentSecond());
          }}
          className={cn("h-5 w-5 accent-[var(--accent)]")}
        />
        <span>
          Marcar el momento del video
          {withTimestamp && (
            <span className="text-ink-muted">
              {" "}
              (se guarda el segundo en el que está el video al enviar; ahora,{" "}
              {formatDuration(moment)})
            </span>
          )}
        </span>
      </label>
      {error && <FormAlert>{error}</FormAlert>}
      <Button onClick={submit} disabled={pending || body.trim() === ""}>
        {pending ? "Guardando…" : "Agregar comentario"}
      </Button>
    </div>
  );
}
