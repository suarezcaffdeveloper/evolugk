"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { detectPlatform, isDismissed, type InstallPlatform } from "@/lib/install-hint";

const STORAGE_KEY = "evolugk-install-dismissed";

/** Evento no estándar de Chrome y Edge: avisa que la app se puede instalar. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// ── lectura del navegador, sin guardar estado en un efecto ──────────────────────────────────
const listeners = new Set<() => void>();
const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  return () => void listeners.delete(onChange);
};

function readPlatform(): InstallPlatform | "server" {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return detectPlatform({
    userAgent: navigator.userAgent,
    standalone,
    maxTouchPoints: navigator.maxTouchPoints,
  });
}

function readDismissed(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isDismissed(stored === null ? null : Number(stored), Date.now());
  } catch {
    // Sin almacenamiento (ventana privada, datos bloqueados): se sugiere igual.
    return false;
  }
}

function dismiss() {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // Sin almacenamiento: el aviso se oculta solo hasta que se recargue la pantalla.
  }
  listeners.forEach((notify) => notify());
}

/**
 * Sugiere instalar la app de la escuela en el celular (spec 04, RF-40). En Android muestra el botón
 * que dispara la instalación; en iPhone y iPad, que no tienen ese botón, explica el paso a mano.
 * No aparece si la app ya está instalada, ni durante 30 días después de tocar "Ahora no".
 */
export function InstallPrompt({ className }: { className?: string }) {
  const platform = useSyncExternalStore(subscribe, readPlatform, () => "server" as const);
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => true);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      // Se guarda el evento para ofrecer la instalación desde nuestro propio botón.
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (platform === "server" || platform === "installed" || dismissed || installed) return null;

  const canInstall = installEvent !== null;
  // Fuera de iOS solo se sugiere si el navegador confirmó que se puede instalar.
  if (platform === "other" && !canInstall) return null;

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    setInstallEvent(null);
    if (outcome === "dismissed") dismiss();
  }

  return (
    <Card className={className} role="region" aria-label="Instalar la app">
      <p className="font-semibold">Instalá la app en tu celular</p>
      <p className="mt-1 text-sm text-ink-muted">
        {platform === "ios"
          ? "Tocá el botón Compartir del navegador y después «Agregar a inicio». Se abre como cualquier otra app."
          : "Se abre desde tu pantalla de inicio, como cualquier otra app, sin buscar el link."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {platform !== "ios" && <Button onClick={install}>Instalar</Button>}
        <Button variant="ghost" onClick={dismiss}>
          Ahora no
        </Button>
      </div>
    </Card>
  );
}
