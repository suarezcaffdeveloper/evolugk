import { createHmac, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMuxProvider, readMuxConfig, type MuxConfig } from "./mux-provider";

const SECRET = "secreto-de-prueba-del-webhook";

// Una clave RSA de prueba, en el mismo formato que entrega Mux (PEM en base64).
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PRIVATE_KEY_BASE64 = Buffer.from(
  privateKey.export({ type: "pkcs1", format: "pem" }) as string,
).toString("base64");

const config: MuxConfig = {
  tokenId: "id",
  tokenSecret: "secret",
  webhookSecret: SECRET,
  signingKeyId: "key-id-de-prueba",
  signingPrivateKey: PRIVATE_KEY_BASE64,
  testAssets: false,
};
const provider = createMuxProvider(config);

/** Un aviso firmado como lo firma Mux: `t=<segundos>,v1=<HMAC-SHA256 de "<t>.<cuerpo>">`. */
function signed(event: object, options: { secret?: string; timestamp?: number } = {}) {
  const body = JSON.stringify(event);
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", options.secret ?? SECRET)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return { body, headers: new Headers({ "mux-signature": `t=${timestamp},v1=${signature}` }) };
}

const envelope = (type: string, data: object) => ({
  type,
  id: "evt_1",
  created_at: new Date().toISOString(),
  object: { type: "asset", id: "x" },
  environment: { name: "Development", id: "e" },
  attempts: [],
  data,
});

describe("avisos de Mux", () => {
  it("traduce 'asset listo' con duración e id de reproducción firmado", async () => {
    const { body, headers } = signed(
      envelope("video.asset.ready", {
        id: "asset_1",
        passthrough: "video-uuid",
        duration: 75.5,
        playback_ids: [
          { id: "publico", policy: "public" },
          { id: "firmado", policy: "signed" },
        ],
      }),
    );
    expect(await provider.parseWebhook(body, headers)).toEqual({
      type: "asset_ready",
      assetId: "asset_1",
      videoId: "video-uuid",
      durationSec: 75.5,
      playbackId: "firmado",
    });
  });

  it("traduce 'subida con asset creado' con el id de nuestro video", async () => {
    const { body, headers } = signed(
      envelope("video.upload.asset_created", {
        id: "upload_1",
        asset_id: "asset_1",
        new_asset_settings: { passthrough: "video-uuid" },
      }),
    );
    expect(await provider.parseWebhook(body, headers)).toEqual({
      type: "upload_asset_created",
      uploadId: "upload_1",
      assetId: "asset_1",
      videoId: "video-uuid",
    });
  });

  it("traduce errores de procesamiento y de subida", async () => {
    const errored = signed(
      envelope("video.asset.errored", {
        id: "asset_1",
        passthrough: "video-uuid",
        errors: { messages: ["Formato no soportado"] },
      }),
    );
    expect(await provider.parseWebhook(errored.body, errored.headers)).toMatchObject({
      type: "asset_errored",
      message: "Formato no soportado",
    });

    const failed = signed(
      envelope("video.upload.errored", { id: "upload_1", error: { message: "se cortó" } }),
    );
    expect(await provider.parseWebhook(failed.body, failed.headers)).toEqual({
      type: "upload_failed",
      uploadId: "upload_1",
      message: "se cortó",
    });
  });

  it("ignora los avisos que no le importan a la aplicación", async () => {
    const { body, headers } = signed(envelope("video.asset.updated", { id: "asset_1" }));
    expect(await provider.parseWebhook(body, headers)).toEqual({ type: "ignored" });
  });

  it("rechaza una firma falsa, un cuerpo alterado, un aviso viejo y un aviso sin firma", async () => {
    const event = envelope("video.asset.ready", { id: "a", duration: 10, playback_ids: [] });

    const forged = signed(event, { secret: "otro-secreto" });
    await expect(provider.parseWebhook(forged.body, forged.headers)).rejects.toThrow();

    const original = signed(event);
    await expect(
      provider.parseWebhook(original.body.replace("10", "11"), original.headers),
    ).rejects.toThrow();

    const old = signed(event, { timestamp: Math.floor(Date.now() / 1000) - 3600 });
    await expect(provider.parseWebhook(old.body, old.headers)).rejects.toThrow();

    await expect(provider.parseWebhook(original.body, new Headers())).rejects.toThrow();
  });

  it("sin el secreto del webhook no acepta nada", async () => {
    const sinSecreto = createMuxProvider({ ...config, webhookSecret: null });
    const { body, headers } = signed(envelope("video.asset.ready", { id: "a" }));
    await expect(sinSecreto.parseWebhook(body, headers)).rejects.toThrow(/MUX_WEBHOOK_SECRET/);
  });
});

describe("reproducción firmada", () => {
  const decode = (token: string) =>
    JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;

  it("firma tokens de reproducción, miniatura y storyboard que vencen en el plazo pedido", async () => {
    const tokens = await provider.signPlayback("playback-123", 3600);
    for (const [token, audience] of [
      [tokens.playback, "v"],
      [tokens.thumbnail, "t"],
      [tokens.storyboard, "s"],
    ] as const) {
      const claims = decode(token);
      expect(claims.sub).toBe("playback-123");
      expect(claims.aud).toBe(audience);
      expect(claims.kid).toBe("key-id-de-prueba");
      expect((claims.exp as number) - Math.floor(Date.now() / 1000)).toBeGreaterThan(3500);
      expect((claims.exp as number) - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(3600);
    }
  });

  it("sin claves de firma no firma nada, con un mensaje claro", async () => {
    const sinClaves = createMuxProvider({ ...config, signingKeyId: null, signingPrivateKey: null });
    await expect(sinClaves.signPlayback("x", 60)).rejects.toThrow(/MUX_SIGNING_KEY_ID/);
  });
});

describe("configuración", () => {
  it("exige las claves de la API", () => {
    expect(() => readMuxConfig({} as NodeJS.ProcessEnv)).toThrow(/MUX_TOKEN_ID/);
  });

  it("lee las claves opcionales y el modo de prueba", () => {
    const read = readMuxConfig({
      MUX_TOKEN_ID: " id ",
      MUX_TOKEN_SECRET: "secret",
      MUX_WEBHOOK_SECRET: "wh",
      MUX_SIGNING_KEY_ID: "kid",
      MUX_SIGNING_PRIVATE_KEY: "pk",
      MUX_TEST_ASSETS: "true",
    } as unknown as NodeJS.ProcessEnv);
    expect(read).toEqual({
      tokenId: "id",
      tokenSecret: "secret",
      webhookSecret: "wh",
      signingKeyId: "kid",
      signingPrivateKey: "pk",
      testAssets: true,
    });
    expect(
      readMuxConfig({ MUX_TOKEN_ID: "a", MUX_TOKEN_SECRET: "b" } as unknown as NodeJS.ProcessEnv),
    ).toMatchObject({ webhookSecret: null, signingKeyId: null, testAssets: false });
  });
});
