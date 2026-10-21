import { describe, expect, it } from "vitest";
import {
  commentSchema,
  defaultVideoTitle,
  formatDuration,
  isStaleUpload,
  quotaOf,
  uploadInputSchema,
  videoEditSchema,
} from "./video-schemas";

describe("duración y título", () => {
  it("formatea minutos y segundos", () => {
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(180)).toBe("3:00");
    expect(formatDuration(59.6)).toBe("1:00");
    expect(formatDuration(0)).toBe("0:00");
  });

  it("genera el título con el tema y la fecha cuando falta (RF-06)", () => {
    expect(defaultVideoTitle("aerial_play", "2026-10-21")).toBe(
      "Juego aéreo · 21 de octubre de 2026",
    );
  });
});

describe("subida", () => {
  const base = { topic: "reflexes", title: "", durationSec: 90 };

  it("acepta un clip de hasta 3 minutos, con el título vacío como nulo", () => {
    expect(uploadInputSchema.parse(base).title).toBeNull();
    expect(uploadInputSchema.safeParse({ ...base, durationSec: 180 }).success).toBe(true);
  });

  it("rechaza más de 3 minutos (CA-02)", () => {
    const result = uploadInputSchema.safeParse({ ...base, durationSec: 181 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain("3 minutos");
  });

  it("exige un tema válido y una duración legible", () => {
    expect(uploadInputSchema.safeParse({ ...base, topic: "otro" }).success).toBe(false);
    expect(uploadInputSchema.safeParse({ ...base, durationSec: 0 }).success).toBe(false);
    expect(uploadInputSchema.safeParse({ ...base, durationSec: Number.NaN }).success).toBe(false);
  });
});

describe("edición y comentarios", () => {
  it("el título editado no puede quedar vacío", () => {
    expect(videoEditSchema.safeParse({ topic: "other", title: "  " }).success).toBe(false);
  });

  it("el comentario puede ser general (sin marca) o tener un segundo entero", () => {
    expect(commentSchema.parse({ body: "Bien", second: "" }).second).toBeNull();
    expect(commentSchema.parse({ body: "Bien", second: "12" }).second).toBe(12);
    expect(commentSchema.safeParse({ body: "Bien", second: "-1" }).success).toBe(false);
    expect(commentSchema.safeParse({ body: "Bien", second: "1.5" }).success).toBe(false);
    expect(commentSchema.safeParse({ body: " ", second: null }).success).toBe(false);
  });
});

describe("cuota de minutos", () => {
  it("por debajo del 80% todo normal", () => {
    expect(quotaOf(60 * 479, 600).level).toBe("ok");
  });

  it("al 80% avisa y al 100% bloquea (RF-30)", () => {
    expect(quotaOf(60 * 480, 600).level).toBe("warning");
    expect(quotaOf(60 * 599.9, 600).level).toBe("warning");
    expect(quotaOf(60 * 600, 600).level).toBe("blocked");
    expect(quotaOf(60 * 700, 600)).toMatchObject({ level: "blocked", percent: 117 });
  });

  it("un tope de cero minutos bloquea todo", () => {
    expect(quotaOf(0, 0).level).toBe("blocked");
  });

  it("calcula los minutos usados con un decimal", () => {
    expect(quotaOf(95, 600).usedMinutes).toBe(1.6);
  });
});

describe("subida interrumpida", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  it("solo una subida demasiado vieja se considera interrumpida", () => {
    expect(isStaleUpload("uploading", "2026-10-21T11:45:00Z", now)).toBe(false);
    expect(isStaleUpload("uploading", "2026-10-21T11:20:00Z", now)).toBe(true);
    expect(isStaleUpload("processing", "2026-10-21T08:00:00Z", now)).toBe(false);
  });
});
