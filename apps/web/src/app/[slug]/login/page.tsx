import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { normalizeSlug } from "@/lib/slug";
import { getStaffSession } from "@/server/auth/guards";
import { ClearOfflineCache } from "@/components/offline-support";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Ingreso del equipo · EvoluGK",
  robots: { index: false },
};

export default function StaffLoginPage({ params, searchParams }: PageProps<"/[slug]/login">) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 pb-16">
      <Suspense fallback={<FormSkeleton />}>
        <LoginContent params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function LoginContent({
  params,
  searchParams,
}: Pick<PageProps<"/[slug]/login">, "params" | "searchParams">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);

  // Quien ya tiene una sesión válida de esta escuela va directo al panel.
  if (await getStaffSession(slug)) redirect(`/${normalizeSlug(slug)}/panel`);

  return (
    <Card className="rise-in space-y-5 p-6">
      <ClearOfflineCache />
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold">Ingreso del equipo</h1>
        <p className="text-sm text-ink-muted">Administradores y profesores.</p>
      </div>
      {query.restablecida === "1" && (
        <Notice tone="success">Listo, cambiaste tu contraseña. Ingresá con la nueva.</Notice>
      )}
      <LoginForm slug={normalizeSlug(slug)} />
    </Card>
  );
}

function FormSkeleton() {
  return (
    <div className="space-y-4 rounded-card border border-line bg-surface p-6" aria-busy="true">
      <div className="h-7 w-48 animate-pulse rounded bg-line" />
      <div className="h-11 animate-pulse rounded bg-line" />
      <div className="h-11 animate-pulse rounded bg-line" />
      <div className="h-12 animate-pulse rounded bg-line" />
    </div>
  );
}
