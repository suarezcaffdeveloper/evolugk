import type { ReactNode } from "react";
import { UploadProvider } from "@/components/upload-tray";

/**
 * Marco del panel del equipo. Mantiene las subidas de video en segundo plano mientras el profesor
 * navega entre pantallas (spec 03, RF-05): el profesor no tiene que esperar en la pantalla de subida.
 */
export default function PanelLayout({ children }: { children: ReactNode }) {
  return <UploadProvider>{children}</UploadProvider>;
}
