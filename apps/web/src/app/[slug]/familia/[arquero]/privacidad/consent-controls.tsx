"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ConsentStatus } from "@/server/goalkeepers";
import { grantConsentAction, revokeConsentAction } from "../../actions";

/**
 * Dar o retirar el consentimiento (spec 04, RF-32 y RF-33). Retirar pide confirmación y explica
 * que los videos y fotos se ocultan al instante.
 */
export function ConsentControls({
  slug,
  goalkeeperId,
  firstName,
  status,
}: {
  slug: string;
  goalkeeperId: string;
  firstName: string;
  status: ConsentStatus;
}) {
  const [confirming, setConfirming] = useState(false);

  if (status !== "valid") {
    return (
      <form action={grantConsentAction.bind(null, slug, goalkeeperId)} className="space-y-3">
        <p className="text-sm text-ink-muted">
          Mientras el consentimiento no esté vigente, no se muestran videos ni fotos de {firstName}.
        </p>
        <SubmitButton pendingText="Guardando…">
          {status === "revoked" ? "Volver a dar el consentimiento" : "Aceptar el consentimiento"}
        </SubmitButton>
      </form>
    );
  }

  if (!confirming) {
    return (
      <Button type="button" variant="secondary" onClick={() => setConfirming(true)}>
        Retirar el consentimiento
      </Button>
    );
  }

  return (
    <form
      action={revokeConsentAction.bind(null, slug, goalkeeperId)}
      className="space-y-3"
      aria-label="Confirmar el retiro del consentimiento"
    >
      <Notice tone="warning">
        Si lo retirás, los videos y las fotos de {firstName} dejan de mostrarse al instante, en
        todos los dispositivos. Podés volver a darlo cuando quieras.
      </Notice>
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingText="Retirando…">Sí, retirar el consentimiento</SubmitButton>
        <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
