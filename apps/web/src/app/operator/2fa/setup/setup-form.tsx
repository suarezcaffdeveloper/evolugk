"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { Enrollment } from "@/server/auth/operator-auth";
import { CodeForm } from "../../code-field";
import {
  beginEnrollmentAction,
  completeEnrollmentAction,
  operatorLogoutAction,
  type CodeState,
} from "../../actions";

/** "ABCD EFGH IJKL…": la clave en grupos de 4, más fácil de copiar a mano. */
const groupSecret = (secret: string) => secret.replace(/(.{4})/g, "$1 ").trim();

/**
 * Inscripción de la app de autenticación. La inscripción se crea cuando la persona toca el botón,
 * y su identificador queda en el estado del formulario (no en el HTML del servidor).
 */
export function SetupFlow() {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const [codeState, codeAction] = useActionState<CodeState, FormData>(completeEnrollmentAction, {});

  function generate() {
    setError(undefined);
    startTransition(async () => {
      const result = await beginEnrollmentAction();
      if (result.ok) setEnrollment(result.enrollment);
      else setError(result.message);
    });
  }

  return (
    <div className="space-y-5 text-sm">
      <div className="space-y-2">
        <p className="font-semibold">1. Instalá una app de autenticación</p>
        <p className="text-ink-muted">
          Por ejemplo Google Authenticator, Microsoft Authenticator, Authy o 1Password.
        </p>
      </div>

      <div className="space-y-3">
        <p className="font-semibold">2. Escaneá el código QR</p>
        {error && <FormAlert>{error}</FormAlert>}

        {!enrollment ? (
          <Button onClick={generate} disabled={pending} className="w-full" size="lg">
            {pending ? "Generando…" : "Generar código QR"}
          </Button>
        ) : (
          <>
            {/* Imagen incrustada (data URI) generada por Supabase: no hay nada que optimizar ni descargar. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={enrollment.qrCode}
              alt="Código QR para agregar EvoluGK a tu app de autenticación"
              width={192}
              height={192}
              className="rise-in mx-auto h-48 w-48 rounded-control border border-line bg-white p-2"
            />
            <details className="text-ink-muted">
              <summary className="cursor-pointer font-medium text-ink">
                ¿No podés escanearlo?
              </summary>
              <p className="mt-2">Ingresá esta clave a mano en tu app:</p>
              <p className="mt-1 break-all rounded-control bg-canvas p-2 font-mono text-base text-ink">
                {groupSecret(enrollment.secret)}
              </p>
            </details>
            <button
              type="button"
              onClick={generate}
              disabled={pending}
              className="text-ink-muted underline underline-offset-2 hover:text-ink"
            >
              {pending ? "Generando…" : "Generar otro código"}
            </button>
          </>
        )}
      </div>

      {enrollment && (
        <div className="rise-in space-y-3">
          <p className="font-semibold">3. Ingresá el código que muestra la app</p>
          <CodeForm action={codeAction} error={codeState.error} submitLabel="Activar y entrar">
            <input type="hidden" name="factorId" value={enrollment.factorId} />
          </CodeForm>
        </div>
      )}

      <form action={operatorLogoutAction}>
        <SubmitButton variant="ghost" size="sm" className="w-full" pendingText="Saliendo…">
          Cancelar y salir
        </SubmitButton>
      </form>
    </div>
  );
}
