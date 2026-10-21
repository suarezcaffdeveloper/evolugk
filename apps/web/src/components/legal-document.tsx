import Link from "next/link";
import { LEGAL_IS_DRAFT, type LegalDocument as Doc } from "@/lib/legal-text";
import { Card } from "./ui/card";
import { Notice } from "./ui/notice";

/** Página de un texto legal: título, índice y secciones. Igual para todas las escuelas. */
export function LegalDocument({
  doc,
  other,
}: {
  doc: Doc;
  other: { href: string; label: string };
}) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-5 px-4 pb-16 pt-6">
      <Link href="/" className="text-sm font-semibold text-ink-muted hover:text-ink">
        ← EvoluGK
      </Link>

      <header className="space-y-2">
        <h1 className="font-display text-3xl font-bold leading-tight">{doc.title}</h1>
        <p className="text-ink-muted">{doc.intro}</p>
      </header>

      {LEGAL_IS_DRAFT && (
        <Notice tone="warning">
          Este texto es un borrador y todavía está pendiente de revisión legal. Puede cambiar antes
          del lanzamiento.
        </Notice>
      )}

      <nav aria-label="Secciones" className="rounded-card border border-line bg-surface p-4">
        <ol className="space-y-1 text-sm">
          {doc.sections.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="text-ink-muted underline-offset-4 hover:text-ink hover:underline"
              >
                {section.heading}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <Card className="space-y-8 p-6">
        {doc.sections.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-6 space-y-3">
            <h2 className="font-display text-xl font-bold">{section.heading}</h2>
            {section.blocks.map((block, index) =>
              block.type === "p" ? (
                <p key={index}>{block.text}</p>
              ) : (
                <ul key={index} className="list-disc space-y-1.5 pl-5">
                  {block.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ),
            )}
          </section>
        ))}
      </Card>

      <p className="text-sm">
        <Link
          href={other.href}
          className="font-semibold text-ink-muted underline-offset-4 hover:text-ink hover:underline"
        >
          {other.label}
        </Link>
      </p>
    </main>
  );
}

/** Enlaces a los dos textos, para pies de página y pantallas de consentimiento. */
export function LegalLinks({ newTab = false }: { newTab?: boolean }) {
  const props = newTab ? { target: "_blank", rel: "noopener noreferrer" } : {};
  const cls = "font-semibold underline underline-offset-4 hover:text-ink";
  return (
    <>
      <Link href="/privacidad" className={cls} {...props}>
        Política de privacidad
      </Link>
      {" · "}
      <Link href="/terminos" className={cls} {...props}>
        Términos y condiciones
      </Link>
    </>
  );
}
