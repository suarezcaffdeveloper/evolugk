import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  attendanceSummary,
  monthCalendar,
  type AttendanceRecord,
  type AttendanceSummary,
  type CalendarCell,
  type EntryStatus,
  type SessionStatus,
} from "@/lib/attendance";
import type { GuardianSession } from "./access";

/**
 * Asistencia para la familia (spec 04, RF-22 y RF-23; spec 05, RF-19 y RF-20). El cliente con clave
 * secreta se saltea RLS: acá se filtra por escuela y arquero, y nunca se devuelve el motivo de una
 * justificación ni el nombre del grupo o de quien tomó lista: la familia ve solo el estado de
 * cada día ("justificada", sin motivo).
 */

type Db = SupabaseClient;

export type FamilyAttendance =
  /** Un arquero inactivo o egresado no muestra asistencia (RF-20). */
  | { available: false }
  | {
      available: true;
      summary: AttendanceSummary;
      year: number;
      month: number;
      weeks: CalendarCell[][];
    };

export async function getFamilyAttendance(
  db: Db,
  session: GuardianSession,
  goalkeeperId: string,
  month: { year: number; month: number },
  today: string,
): Promise<FamilyAttendance> {
  // Quien llama ya verificó que el arquero es del tutor; igual se filtra por escuela y arquero.
  const { data: goalkeeper } = await db
    .from("goalkeeper")
    .select("status")
    .eq("school_id", session.schoolId)
    .eq("id", goalkeeperId)
    .maybeSingle();
  if (!goalkeeper || goalkeeper.status !== "active") return { available: false };

  const { data } = await db
    .from("attendance_entry")
    .select("status, created_at, attendance_session!inner(date, status)")
    .eq("school_id", session.schoolId)
    .eq("goalkeeper_id", goalkeeperId);

  const records: AttendanceRecord[] = (data ?? []).map((row) => {
    const s = row.attendance_session as unknown as { date: string; status: SessionStatus };
    return {
      date: s.date,
      sessionStatus: s.status,
      entryStatus: row.status as EntryStatus,
      createdAt: row.created_at as string,
    };
  });

  return {
    available: true,
    summary: attendanceSummary(records, today),
    year: month.year,
    month: month.month,
    weeks: monthCalendar(month.year, month.month, records),
  };
}
