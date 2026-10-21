import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal-document";
import { PRIVACY_POLICY } from "@/lib/legal-text";

export const metadata: Metadata = {
  title: "Política de privacidad · EvoluGK",
  description: "Qué datos guarda EvoluGK, para qué los usa y qué derechos tenés sobre ellos.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalDocument
      doc={PRIVACY_POLICY}
      other={{ href: "/terminos", label: "Ver los términos y condiciones" }}
    />
  );
}
