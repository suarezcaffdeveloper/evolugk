import type {
  PlaybackTokens,
  ProviderAssetState,
  ProviderEvent,
  ProviderUpload,
  ProviderUploadState,
  VideoProvider,
} from "@/server/video/provider";

/**
 * Proveedor de video en memoria, para pruebas. Imita lo esencial de Mux: crea subidas, genera un
 * asset cuando "termina" la subida, y puede fallar a pedido (borrados, creación de subidas).
 */
export class FakeVideoProvider implements VideoProvider {
  readonly name = "mux" as const;

  uploads = new Map<
    string,
    { videoId: string; assetId: string | null; status: ProviderUploadState["status"] }
  >();
  assets = new Map<string, ProviderAssetState & { videoId: string }>();
  deleted: string[] = [];
  cancelled: string[] = [];
  /** Hace fallar el borrado de assets mientras sea true. */
  failDeletes = false;
  failUploads = false;
  private counter = 0;

  async createUpload(input: { videoId: string; corsOrigin: string }): Promise<ProviderUpload> {
    if (this.failUploads) throw new Error("proveedor caído");
    const uploadId = `up_${(this.counter += 1)}`;
    this.uploads.set(uploadId, { videoId: input.videoId, assetId: null, status: "waiting" });
    return { uploadId, uploadUrl: `https://fake.upload/${uploadId}` };
  }

  async getUpload(uploadId: string): Promise<ProviderUploadState | null> {
    const upload = this.uploads.get(uploadId);
    if (!upload) return null;
    return { status: upload.status, assetId: upload.assetId, errorMessage: null };
  }

  async getAsset(assetId: string): Promise<ProviderAssetState | null> {
    const asset = this.assets.get(assetId);
    return asset ? { ...asset } : null;
  }

  async deleteAsset(assetId: string): Promise<void> {
    if (this.failDeletes) throw new Error("proveedor caído");
    this.assets.delete(assetId);
    this.deleted.push(assetId);
  }

  async cancelUpload(uploadId: string): Promise<void> {
    if (this.failDeletes) throw new Error("proveedor caído");
    this.cancelled.push(uploadId);
  }

  async signPlayback(playbackId: string, ttlSeconds: number): Promise<PlaybackTokens> {
    return {
      playback: `play.${playbackId}.${ttlSeconds}`,
      thumbnail: `thumb.${playbackId}.${ttlSeconds}`,
      storyboard: `story.${playbackId}.${ttlSeconds}`,
    };
  }

  async parseWebhook(): Promise<ProviderEvent> {
    return { type: "ignored" };
  }

  /** El celular terminó de subir: el proveedor crea el asset (todavía "preparing"). */
  finishUpload(uploadId: string): { assetId: string; event: ProviderEvent } {
    const upload = this.uploads.get(uploadId);
    if (!upload) throw new Error("subida inexistente");
    const assetId = `as_${(this.counter += 1)}`;
    upload.assetId = assetId;
    upload.status = "asset_created";
    this.assets.set(assetId, {
      videoId: upload.videoId,
      status: "preparing",
      durationSec: null,
      playbackId: null,
      errorMessage: null,
    });
    return {
      assetId,
      event: { type: "upload_asset_created", uploadId, assetId, videoId: upload.videoId },
    };
  }

  /** El proveedor terminó de procesar el asset. */
  makeReady(assetId: string, durationSec: number): ProviderEvent {
    const asset = this.assets.get(assetId);
    if (!asset) throw new Error("asset inexistente");
    asset.status = "ready";
    asset.durationSec = durationSec;
    asset.playbackId = `pb_${assetId}`;
    return {
      type: "asset_ready",
      assetId,
      videoId: asset.videoId,
      durationSec,
      playbackId: asset.playbackId,
    };
  }

  makeErrored(assetId: string, message: string): ProviderEvent {
    const asset = this.assets.get(assetId);
    if (!asset) throw new Error("asset inexistente");
    asset.status = "errored";
    asset.errorMessage = message;
    return { type: "asset_errored", assetId, videoId: asset.videoId, message };
  }
}
