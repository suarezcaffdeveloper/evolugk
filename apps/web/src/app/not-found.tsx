/**
 * Pantalla neutra para cualquier ruta o escuela que no se pueda mostrar. A propósito no
 * distingue entre una escuela inexistente y una suspendida (spec 00, RF-02), ni da datos.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="font-display text-6xl font-bold text-accent">404</p>
      <h1 className="font-display text-2xl font-bold">No encontramos esta página</h1>
      <p className="text-ink-muted">Revisá el link que te compartieron o consultá a tu escuela.</p>
    </main>
  );
}
