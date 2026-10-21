"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert, inputClassName } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatAccessCode } from "@/lib/access-code";
import { toCsv } from "@/lib/csv";
import { cn } from "@/lib/cn";
import type { ImportReport } from "@/server/goalkeeper-import";
import { importAction, type ImportState } from "./actions";

function download(filename: string, rows: string[][]) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function ImportForm({ slug }: { slug: string }) {
  const [state, formAction] = useActionState<ImportState, FormData>(
    importAction.bind(null, slug),
    {},
  );

  return (
    <div className="space-y-5">
      <form action={formAction} className="space-y-4">
        {state.error && <FormAlert>{state.error}</FormAlert>}
        <div className="space-y-1.5">
          <label htmlFor="file" className="block text-sm font-semibold">
            Archivo (.xlsx o .csv)
          </label>
          <input
            id="file"
            name="file"
            type="file"
            required
            accept=".xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className={cn(inputClassName, "h-auto py-2")}
          />
        </div>
        <SubmitButton size="lg" pendingText="Importando…">
          Importar
        </SubmitButton>
      </form>

      {state.report && <Report slug={slug} report={state.report} />}
    </div>
  );
}

function Report({ slug, report }: { slug: string; report: ImportReport }) {
  const failed = report.failed.length;
  return (
    <section aria-label="Resultado de la importación" className="space-y-4">
      <Notice tone={failed === 0 ? "success" : "warning"}>
        Se importaron {report.imported} de {report.total} {report.total === 1 ? "fila" : "filas"}.
        {failed > 0 && ` ${failed} no se pudieron importar.`}
      </Notice>

      {report.credentials.length > 0 && (
        <div className="space-y-2 rounded-control border border-line p-3">
          <p className="font-semibold">
            Accesos de {report.credentials.length}{" "}
            {report.credentials.length === 1 ? "tutor nuevo" : "tutores nuevos"}
          </p>
          <p className="text-sm text-ink-muted">
            Descargalos ahora: el PIN se muestra una sola vez y después no se puede volver a ver
            (solo generar uno nuevo desde la ficha). Cada tutor cambia el PIN la primera vez que
            ingresa.
          </p>
          <Button
            type="button"
            size="sm"
            onClick={() =>
              download("accesos-importacion.csv", [
                ["Tutor", "Teléfono", "Arqueros", "Código de acceso", "PIN inicial"],
                ...report.credentials.map((c) => [
                  c.guardianName,
                  c.phone,
                  c.goalkeepers.join(" / "),
                  formatAccessCode(c.accessCode),
                  c.pin,
                ]),
              ])
            }
          >
            Descargar accesos (CSV)
          </Button>
        </div>
      )}

      {report.linkedToExistingGuardians > 0 && (
        <p className="text-sm text-ink-muted">
          {report.linkedToExistingGuardians}{" "}
          {report.linkedToExistingGuardians === 1
            ? "arquero quedó vinculado"
            : "arqueros quedaron vinculados"}{" "}
          a un tutor que ya existía (mismo teléfono): conserva su código y su PIN.
        </p>
      )}

      {report.warnings.length > 0 && (
        <div className="space-y-1">
          <p className="font-semibold">Avisos</p>
          <ul className="space-y-1 text-sm text-ink-muted">
            {report.warnings.map((w) => (
              <li key={`${w.line}-${w.message}`}>
                <span className="font-semibold text-ink">Fila {w.line}:</span> {w.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {failed > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">Filas que no se importaron</p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                download("filas-con-errores.csv", [
                  ["Fila", "Arquero", "Motivo"],
                  ...report.failed.map((f) => [String(f.line), f.name, f.reasons.join(" ")]),
                ])
              }
            >
              Descargar reporte (CSV)
            </Button>
          </div>
          <ul className="space-y-2 text-sm">
            {report.failed.map((f) => (
              <li key={f.line} className="rounded-control border border-line p-2.5">
                <span className="font-semibold">
                  Fila {f.line}
                  {f.name ? ` · ${f.name}` : ""}
                </span>
                <span className="block text-ink-muted">{f.reasons.join(" ")}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-ink-muted">
            Corregí esas filas y volvé a subir el archivo: las que ya se importaron no se duplican.
          </p>
        </div>
      )}

      <Link
        href={`/${slug}/panel/arqueros`}
        className="inline-flex h-11 items-center rounded-control border border-line bg-surface px-4 font-semibold hover:bg-accent-soft"
      >
        Ver el listado
      </Link>
    </section>
  );
}
