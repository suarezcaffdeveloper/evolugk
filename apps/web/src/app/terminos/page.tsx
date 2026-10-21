import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal-document";
import { TERMS_OF_USE } from "@/lib/legal-text";

export const metadata: Metadata = {
  title: "Términos y condiciones · EvoluGK",
  description: "Las reglas para usar el portal de familias y el panel de las escuelas de EvoluGK.",
};

export default function TermsPage() {
  return (
    <LegalDocument
      doc={TERMS_OF_USE}
      other={{ href: "/privacidad", label: "Ver la política de privacidad" }}
    />
  );
}
