import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense, type CSSProperties } from "react";
import { Card } from "@/components/ui/card";
import { normalizeSlug } from "@/lib/slug";
import { familyHome, getFamilySession } from "@/server/guardian/session";
import { getSchoolBranding } from "@/server/tenant";
import { FamilyLoginForm } from "./family-login-form";

export const metadata: Metadata = {
  title: "Ingreso de familias · EvoluGK",
  robots: { index: false },
};

export default function SchoolHomePage({ params }: PageProps<"/[slug]">) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-5 px-4 pb-16">
      <Suspense fallback={<LoginSkeleton />}>
        <FamilyLogin params={params} />
      </Suspense>
    </main>
  );
}

async function FamilyLogin({ params }: Pick<PageProps<"/[slug]">, "params">) {
  const { slug: rawSlug } = await params;
  const slug = normalizeSlug(rawSlug);

  // Quien ya tiene una sesión de familia vigente va directo al portal.
  if (await getFamilySession(slug)) redirect(familyHome(slug));

  const school = await getSchoolBranding(slug);

  return (
    <>
      <div className="rise-in space-y-1 text-center">
        <p className="text-sm font-semibold text-ink-muted">Bienvenido a</p>
        <h1 className="font-display text-3xl font-bold leading-tight">{school?.name}</h1>
      </div>

      <Card className="rise-in space-y-5 p-6" style={{ "--i": 1 } as CSSProperties}>
        <div className="space-y-1">
          <h2 className="font-display text-xl font-bold">Ingreso de familias</h2>
          <p className="text-sm text-ink-muted">
            Usá el código y el PIN que te dio la escuela para ver a tu arquero.
          </p>
        </div>
        <FamilyLoginForm slug={slug} />
      </Card>

      <p className="rise-in text-center text-sm" style={{ "--i": 2 } as CSSProperties}>
        <Link
          href={`/${slug}/login`}
          className="font-semibold text-ink-muted underline-offset-4 hover:text-ink hover:underline"
        >
          Ingreso del equipo
        </Link>
      </p>
    </>
  );
}

function LoginSkeleton() {
  return (
    <div className="space-y-4 rounded-card border border-line bg-surface p-6" aria-busy="true">
      <div className="h-7 w-48 animate-pulse rounded bg-line" />
      <div className="h-11 animate-pulse rounded bg-line" />
      <div className="h-11 animate-pulse rounded bg-line" />
      <div className="h-12 animate-pulse rounded bg-line" />
    </div>
  );
}
