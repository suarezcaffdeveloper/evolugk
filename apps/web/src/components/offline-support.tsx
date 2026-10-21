"use client";

import { useEffect } from "react";

/**
 * Registra el service worker que permite abrir la asistencia sin conexión y le pide que guarde lo
 * que esta pantalla necesita (sus archivos y la propia página). Solo en producción: en desarrollo
 * los archivos cambian todo el tiempo y una copia guardada confundiría.
 */
export function OfflineSupport({ onReady }: { onReady?: () => void }) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let cancelled = false;

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "precached" && !cancelled) onReady?.();
    };
    navigator.serviceWorker.addEventListener("message", onMessage);

    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        const urls = [
          location.pathname,
          ...performance
            .getEntriesByType("resource")
            .map((entry) => entry.name)
            .filter((name) => new URL(name).pathname.startsWith("/_next/static/")),
        ];
        registration.active?.postMessage({ type: "precache", urls });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, [onReady]);

  return null;
}

/**
 * En la pantalla de ingreso se borra la copia guardada de la asistencia: quien llega acá cerró
 * sesión o la perdió, y el celular no debe seguir guardando la lista de la cuenta anterior. Las
 * marcas pendientes no se tocan (viven por cuenta en IndexedDB y esperan a que esa cuenta vuelva).
 */
export function ClearOfflineCache() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.controller?.postMessage({ type: "clear" });
    if ("caches" in window) {
      void caches
        .keys()
        .then((keys) =>
          keys
            .filter((key) => key.startsWith("evolugk-offline-"))
            .forEach((key) => void caches.delete(key)),
        );
    }
  }, []);
  return null;
}
