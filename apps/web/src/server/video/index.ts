import "server-only";
import { createMuxProvider, readMuxConfig } from "./mux-provider";
import type { VideoProvider } from "./provider";

let cached: VideoProvider | null = null;

/** El proveedor de video configurado por entorno (hoy, Mux). Falla con un mensaje claro si faltan las claves. */
export function getVideoProvider(): VideoProvider {
  cached ??= createMuxProvider(readMuxConfig());
  return cached;
}

export type { VideoProvider } from "./provider";
