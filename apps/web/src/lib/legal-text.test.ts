import { describe, expect, it } from "vitest";
import { LEGAL_IS_DRAFT, LEGAL_VERSION, PRIVACY_POLICY, TERMS_OF_USE } from "./legal-text";

const documents = [PRIVACY_POLICY, TERMS_OF_USE];

const textOf = (doc: (typeof documents)[number]) =>
  doc.sections
    .flatMap((s) => s.blocks.flatMap((b) => (b.type === "p" ? [b.text] : b.items)))
    .join("\n");

describe("textos legales", () => {
  it("cada sección tiene identificador único, título y contenido", () => {
    for (const doc of documents) {
      const ids = doc.sections.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const section of doc.sections) {
        expect(section.heading.trim()).not.toBe("");
        expect(section.blocks.length).toBeGreaterThan(0);
      }
    }
  });

  it("mientras queden datos por completar entre corchetes, sigue marcado como borrador", () => {
    const pending = documents.some((doc) => /\[[^\]]+\]/.test(textOf(doc)));
    if (pending) expect(LEGAL_IS_DRAFT).toBe(true);
  });

  it("menciona lo que el producto hace con el consentimiento, el PIN y las cookies", () => {
    const privacy = textOf(PRIVACY_POLICY);
    expect(privacy).toContain("retirar el consentimiento");
    expect(privacy).toContain("al instante");
    expect(privacy).toContain("15 minutos");
    expect(privacy).toContain("90 días");
    expect(privacy).toContain("Ley 25.326");
    expect(privacy).toMatch(/no usamos cookies de publicidad/i);
  });

  it("las dos versiones coinciden con la versión publicada", () => {
    expect(textOf(PRIVACY_POLICY)).toContain(LEGAL_VERSION);
    expect(textOf(TERMS_OF_USE)).toContain(LEGAL_VERSION);
  });
});
