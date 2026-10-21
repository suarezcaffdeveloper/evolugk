/**
 * Interfaz propia del proveedor de video (spec 03, RN-02). La aplicación solo habla con esto; Mux
 * es la primera implementación y se puede cambiar por otra sin tocar el resto (docs/04).
 *
 * El proveedor recibe únicamente el archivo y el identificador del video (`videoId`, un UUID):
 * nunca datos personales del arquero (spec 03, sección 10).
 */

export type ProviderUpload = {
  /** Identificador de la subida en el proveedor. */
  uploadId: string;
  /** Dirección a la que el celular sube el archivo directamente (RF-04). */
  uploadUrl: string;
};

export type ProviderUploadState = {
  status: "waiting" | "asset_created" | "errored" | "cancelled" | "timed_out";
  assetId: string | null;
  errorMessage: string | null;
};

export type ProviderAssetState = {
  status: "preparing" | "ready" | "errored";
  /** Duración en segundos; solo cuando el proveedor ya la conoce. */
  durationSec: number | null;
  playbackId: string | null;
  errorMessage: string | null;
};

/** Tokens firmados de corta duración para reproducir un video privado (RF-22). */
export type PlaybackTokens = {
  playback: string;
  thumbnail: string;
  storyboard: string;
};

/** Aviso del proveedor ya verificado y traducido a lo que le importa a la aplicación. */
export type ProviderEvent =
  | { type: "upload_asset_created"; uploadId: string; assetId: string; videoId: string | null }
  | {
      type: "asset_ready";
      assetId: string;
      videoId: string | null;
      durationSec: number | null;
      playbackId: string | null;
    }
  | { type: "asset_errored"; assetId: string; videoId: string | null; message: string }
  | { type: "upload_failed"; uploadId: string; message: string }
  | { type: "ignored" };

export interface VideoProvider {
  readonly name: "mux";
  /** Crea una subida directa. `corsOrigin` es el origen desde el que sube el navegador. */
  createUpload(input: { videoId: string; corsOrigin: string }): Promise<ProviderUpload>;
  getUpload(uploadId: string): Promise<ProviderUploadState | null>;
  getAsset(assetId: string): Promise<ProviderAssetState | null>;
  /** Borra el archivo. Si ya no existe se considera borrado: es seguro repetirlo. */
  deleteAsset(assetId: string): Promise<void>;
  /** Cancela una subida que nunca se completó. Seguro de repetir. */
  cancelUpload(uploadId: string): Promise<void>;
  signPlayback(playbackId: string, ttlSeconds: number): Promise<PlaybackTokens>;
  /** Verifica la firma del aviso y lo traduce. Lanza si la firma no es válida. */
  parseWebhook(rawBody: string, headers: Headers): Promise<ProviderEvent>;
}
