/** Mensajes de la toma de lista, compartidos por las acciones del servidor y la pantalla. */
export type AttendanceActionError =
  | "session_expired"
  | "invalid_date"
  | "group_not_found"
  | "group_archived"
  | "suspended"
  | "not_found"
  | "failed";

export const ATTENDANCE_ERROR_MESSAGES: Record<AttendanceActionError, string> = {
  session_expired:
    "Tu sesión venció. Ingresá de nuevo: las marcas de este celular quedan guardadas y se envían después.",
  invalid_date: "La fecha no puede ser futura.",
  group_not_found: "Ese grupo ya no existe.",
  group_archived: "Ese grupo está archivado: no se pueden tomar listas nuevas.",
  suspended: "La sesión está suspendida: no admite marcas.",
  not_found: "No encontramos la sesión.",
  failed: "No pudimos guardar. Probá de nuevo en un momento.",
};
