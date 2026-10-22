import type { ReactNode } from "react";
import { InstallPrompt } from "@/components/install-prompt";
import { UploadProvider } from "@/components/upload-tray";

/**
 * Marco del panel del equipo. Mantiene las subidas de video en segundo plano mientras el profesor
 * navega entre pantallas (spec 03, RF-05): el profesor no tiene que esperar en la pantalla de subida.
 */
export default function PanelLayout({ children }: { children: ReactNode }) {
  return (
    <UploadProvider>
      <InstallPrompt className="mx-auto mt-2 w-[calc(100%-2rem)] max-w-2xl" />
      {children}
    </UploadProvider>
  );
}
