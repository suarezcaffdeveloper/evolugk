import Mux, { NotFoundError } from "@mux/mux-node";
import type {
  PlaybackTokens,
  ProviderAssetState,
  ProviderEvent,
  ProviderUploadState,
  VideoProvider,
} from "./provider";

export type MuxConfig = {
  tokenId: string;
  tokenSecret: string;
  webhookSecret: string | null;
  /** Clave de firma de reproducción (Settings → Signing Keys en Mux). No es el token de la API. */
  signingKeyId: string | null;
  signingPrivateKey: string | null;
  /** Assets de prueba (cuenta gratuita): con marca de agua, 10 segundos y se borran a las 24 h. */
  testAssets: boolean;
};

export function readMuxConfig(env: NodeJS.ProcessEnv = process.env): MuxConfig {
  const tokenId = env.MUX_TOKEN_ID?.trim();
  const tokenSecret = env.MUX_TOKEN_SECRET?.trim();
  if (!tokenId || !tokenSecret) {
    throw new Error("Faltan MUX_TOKEN_ID y MUX_TOKEN_SECRET (apps/web/.env.local).");
  }
  return {
    tokenId,
    tokenSecret,
    webhookSecret: env.MUX_WEBHOOK_SECRET?.trim() || null,
    signingKeyId: env.MUX_SIGNING_KEY_ID?.trim() || null,
    signingPrivateKey: env.MUX_SIGNING_PRIVATE_KEY?.trim() || null,
    testAssets: env.MUX_TEST_ASSETS?.trim() === "true",
  };
}

const str = (value: unknown): string | null => (typeof value === "string" && value ? value : null);

/** Proveedor de video sobre Mux. Todas las reproducciones son firmadas (nunca hay links públicos). */
export function createMuxProvider(config: MuxConfig): VideoProvider {
  const mux = new Mux({
    tokenId: config.tokenId,
    tokenSecret: config.tokenSecret,
    webhookSecret: config.webhookSecret,
    jwtSigningKey: config.signingKeyId,
    jwtPrivateKey: config.signingPrivateKey,
  });

  return {
    name: "mux",

    async createUpload({ videoId, corsOrigin }) {
      const upload = await mux.video.uploads.create({
        cors_origin: corsOrigin,
        // El archivo más caro de guardar es el de 4K: se limita a 1080p (RF-09). La reproducción
        // siempre es firmada. `passthrough` es el único dato nuestro que viaja: un UUID.
        new_asset_settings: {
          playback_policies: ["signed"],
          video_quality: "basic",
          max_resolution_tier: "1080p",
          passthrough: videoId,
          ...(config.testAssets ? { test: true } : {}),
        },
        ...(config.testAssets ? { test: true } : {}),
      });
      if (!upload.url) throw new Error("Mux no devolvió la dirección de subida.");
      return { uploadId: upload.id, uploadUrl: upload.url };
    },

    async getUpload(uploadId): Promise<ProviderUploadState | null> {
      try {
        const upload = await mux.video.uploads.retrieve(uploadId);
        return {
          status: upload.status,
          assetId: upload.asset_id ?? null,
          errorMessage: upload.error?.message ?? null,
        };
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    async getAsset(assetId): Promise<ProviderAssetState | null> {
      try {
        const asset = await mux.video.assets.retrieve(assetId);
        return {
          status: asset.status,
          durationSec: typeof asset.duration === "number" ? asset.duration : null,
          playbackId: asset.playback_ids?.find((p) => p.policy === "signed")?.id ?? null,
          errorMessage: asset.errors?.messages?.join(" ") ?? null,
        };
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    async deleteAsset(assetId) {
      try {
        await mux.video.assets.delete(assetId);
      } catch (error) {
        if (error instanceof NotFoundError) return; // ya no existe: queda borrado
        throw error;
      }
    },

    async cancelUpload(uploadId) {
      try {
        await mux.video.uploads.cancel(uploadId);
      } catch (error) {
        // Si la subida ya no está "esperando" (ya creó el asset, ya venció) no hay nada que cancelar.
        if (error instanceof NotFoundError) return;
        if (error instanceof Mux.APIError && error.status && error.status < 500) return;
        throw error;
      }
    },

    async signPlayback(playbackId, ttlSeconds): Promise<PlaybackTokens> {
      if (!config.signingKeyId || !config.signingPrivateKey) {
        throw new Error(
          "Faltan MUX_SIGNING_KEY_ID y MUX_SIGNING_PRIVATE_KEY para firmar la reproducción.",
        );
      }
      const tokens = await mux.jwt.signPlaybackId(playbackId, {
        type: ["video", "thumbnail", "storyboard"],
        expiration: `${ttlSeconds}s`,
      });
      return {
        playback: tokens["playback-token"] ?? "",
        thumbnail: tokens["thumbnail-token"] ?? "",
        storyboard: tokens["storyboard-token"] ?? "",
      };
    },

    async parseWebhook(rawBody, headers): Promise<ProviderEvent> {
      if (!config.webhookSecret) {
        throw new Error("Falta MUX_WEBHOOK_SECRET para verificar los avisos de Mux.");
      }
      // Verifica la firma y la antigüedad del aviso: lanza si no es de Mux.
      const event = await mux.webhooks.unwrap(rawBody, headers, config.webhookSecret);
      const data = event.data as Record<string, unknown>;

      switch (event.type) {
        case "video.upload.asset_created": {
          const uploadId = str(data.id);
          const assetId = str(data.asset_id);
          if (!uploadId || !assetId) return { type: "ignored" };
          const settings = data.new_asset_settings as { passthrough?: unknown } | undefined;
          return {
            type: "upload_asset_created",
            uploadId,
            assetId,
            videoId: str(settings?.passthrough),
          };
        }
        case "video.asset.ready": {
          const assetId = str(data.id);
          if (!assetId) return { type: "ignored" };
          const playbackIds = (data.playback_ids as { id?: unknown; policy?: unknown }[]) ?? [];
          return {
            type: "asset_ready",
            assetId,
            videoId: str(data.passthrough),
            durationSec: typeof data.duration === "number" ? data.duration : null,
            playbackId: str(playbackIds.find((p) => p.policy === "signed")?.id),
          };
        }
        case "video.asset.errored": {
          const assetId = str(data.id);
          if (!assetId) return { type: "ignored" };
          const errors = data.errors as { messages?: unknown } | undefined;
          const messages = Array.isArray(errors?.messages) ? errors.messages.join(" ") : "";
          return {
            type: "asset_errored",
            assetId,
            videoId: str(data.passthrough),
            message: messages || "El proveedor no pudo procesar el video.",
          };
        }
        case "video.upload.errored":
        case "video.upload.cancelled": {
          const uploadId = str(data.id);
          if (!uploadId) return { type: "ignored" };
          const error = data.error as { message?: unknown } | undefined;
          return {
            type: "upload_failed",
            uploadId,
            message: str(error?.message) ?? "La subida no se completó.",
          };
        }
        default:
          return { type: "ignored" };
      }
    },
  };
}
