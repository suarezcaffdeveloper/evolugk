"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { formatAccessCode } from "@/lib/access-code";
import { inputClassName } from "@/components/ui/field";
import { cn } from "@/lib/cn";

/** Texto para mandar por WhatsApp con el acceso al portal (el código y el PIN se entregan fuera del sistema). */
function buildMessage(input: {
  schoolName: string;
  name: string;
  portalUrl: string;
  accessCode: string;
  pin: string;
}) {
  return [
    `Hola ${input.name}, te damos acceso al portal de ${input.schoolName}.`,
    `Entrá a ${input.portalUrl}`,
    `Código: ${formatAccessCode(input.accessCode)}`,
    `PIN inicial: ${input.pin}`,
    "La primera vez te va a pedir que cambies el PIN.",
  ].join("\n");
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Sin permiso para el portapapeles: el texto está visible para copiarlo a mano.
        }
      }}
    >
      {copied ? "¡Copiado!" : label}
    </Button>
  );
}

export type Credential = {
  guardianId: string;
  name: string;
  accessCode: string;
  pin: string;
};

/**
 * Código y PIN inicial de un tutor. El PIN se muestra una sola vez (spec 00, RF-15): al cerrar o
 * recargar la pantalla no se puede volver a ver, solo resetear.
 */
export function CredentialsCard({
  slug,
  schoolName,
  credential,
  title,
}: {
  slug: string;
  schoolName: string;
  credential: Credential;
  title?: string;
}) {
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );

  const portalUrl = `${origin}/${slug}`;
  const message = buildMessage({
    schoolName,
    name: credential.name.split(" ")[0],
    portalUrl,
    accessCode: credential.accessCode,
    pin: credential.pin,
  });

  return (
    <div className="space-y-3 rounded-control border border-line bg-canvas p-4">
      <p className="font-semibold">{title ?? credential.name}</p>
      <dl className="grid grid-cols-2 gap-3">
        <div>
          <dt className="text-sm text-ink-muted">Código</dt>
          <dd className="font-mono text-xl font-bold tracking-wider">
            {formatAccessCode(credential.accessCode)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-ink-muted">PIN inicial</dt>
          <dd className="font-mono text-xl font-bold tracking-widest">{credential.pin}</dd>
        </div>
      </dl>
      <textarea
        readOnly
        value={message}
        rows={5}
        aria-label={`Mensaje para ${credential.name}`}
        onFocus={(event) => event.currentTarget.select()}
        className={cn(inputClassName, "h-auto py-2 text-sm")}
      />
      <div className="flex flex-wrap items-center gap-2">
        <CopyButton text={message} label="Copiar mensaje" />
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center rounded-control border border-line bg-surface px-3 text-sm font-semibold hover:bg-accent-soft"
        >
          Abrir en WhatsApp
        </a>
      </div>
      <Notice tone="warning">
        Guardá o enviá estos datos ahora: el PIN no se vuelve a mostrar. Si se pierde, se genera uno
        nuevo.
      </Notice>
    </div>
  );
}
