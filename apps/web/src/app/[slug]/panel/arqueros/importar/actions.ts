"use server";

import { revalidatePath } from "next/cache";
import { argentinaDate } from "@/lib/dates";
import { requireSchoolAdmin } from "@/server/auth/guards";
import { importGoalkeepers, type ImportReport } from "@/server/goalkeeper-import";
import { readImportFile } from "@/server/goalkeeper-import-file";
import { createServiceClient } from "@/server/supabase";

export type ImportState = {
  error?: string;
  /** Resultado de la importación, con los accesos nuevos. Vive solo en esta respuesta. */
  report?: ImportReport;
};

/**
 * Importa el archivo subido. Vuelve a verificar en el servidor que sea la administración: los
 * profesores no importan (spec 01, sección 3).
 */
export async function importAction(
  slug: string,
  _previous: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const session = await requireSchoolAdmin(slug);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Elegí un archivo para importar." };
  }

  const sheet = await readImportFile(file);
  if (!sheet.ok) return { error: sheet.message };

  const report = await importGoalkeepers(createServiceClient(), {
    schoolId: session.school.id,
    actorId: session.user.id,
    rows: sheet.rows,
    today: argentinaDate(new Date()),
  });

  revalidatePath(`/${session.school.slug}/panel/arqueros`);
  return { report };
}
