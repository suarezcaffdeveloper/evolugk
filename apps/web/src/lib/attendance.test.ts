import { describe, expect, it } from "vitest";
import {
  absenceStreak,
  attendanceSummary,
  dayStatusOf,
  groupMonthSummary,
  isInWindow,
  isLowAttendance,
  monthCalendar,
  parseMonth,
  shiftMonth,
  type AttendanceRecord,
  type EntryStatus,
} from "./attendance";

const TODAY = "2026-10-21";

const record = (
  date: string,
  entryStatus: EntryStatus,
  sessionStatus: AttendanceRecord["sessionStatus"] = "open",
): AttendanceRecord => ({ date, entryStatus, sessionStatus });

describe("porcentaje de asistencia (RF-16)", () => {
  it("CA-04: 10 sesiones, 6 presentes, 2 ausentes y 2 justificadas dan 6 ÷ 8 = 75%", () => {
    const records = [
      ...Array.from({ length: 6 }, (_, i) =>
        record(`2026-10-${String(i + 1).padStart(2, "0")}`, "present"),
      ),
      record("2026-10-07", "absent"),
      record("2026-10-08", "absent"),
      record("2026-10-09", "excused"),
      record("2026-10-10", "excused"),
    ];
    const summary = attendanceSummary(records, TODAY);
    expect(summary).toMatchObject({ present: 6, absent: 2, excused: 2, counted: 8, percent: 75 });
  });

  it("CA-05: una sesión suspendida no cuenta para nadie", () => {
    const summary = attendanceSummary(
      [record("2026-10-01", "present"), record("2026-10-02", "absent", "suspended")],
      TODAY,
    );
    expect(summary).toMatchObject({ present: 1, absent: 0, suspended: 1, percent: 100 });
  });

  it("los arqueros sin marcar no cuentan (RF-08)", () => {
    const summary = attendanceSummary(
      [record("2026-10-01", "present"), record("2026-10-02", "unmarked")],
      TODAY,
    );
    expect(summary).toMatchObject({ unmarked: 1, counted: 1, percent: 100 });
  });

  it("sin sesiones, o con todas justificadas, muestra 'sin datos' y no 0%", () => {
    expect(attendanceSummary([], TODAY).percent).toBeNull();
    expect(
      attendanceSummary([record("2026-10-01", "excused"), record("2026-10-02", "excused")], TODAY)
        .percent,
    ).toBeNull();
  });

  it("solo cuenta los últimos 90 días, contando hoy", () => {
    // 90 días contando hoy: del 24/07 al 21/10.
    expect(isInWindow("2026-07-24", TODAY)).toBe(true);
    expect(isInWindow("2026-07-23", TODAY)).toBe(false);
    expect(isInWindow(TODAY, TODAY)).toBe(true);
    expect(isInWindow("2026-10-22", TODAY)).toBe(false);

    const summary = attendanceSummary(
      [record("2026-07-23", "absent"), record("2026-07-24", "present")],
      TODAY,
    );
    expect(summary).toMatchObject({ absent: 0, present: 1, percent: 100 });
  });

  it("redondea al entero más cercano", () => {
    const records = [
      record("2026-10-01", "present"),
      record("2026-10-02", "present"),
      record("2026-10-03", "absent"),
    ];
    expect(attendanceSummary(records, TODAY).percent).toBe(67);
  });
});

describe("baja asistencia (RF-23)", () => {
  it("menos de 70% con datos; 70% justo no; sin datos no", () => {
    expect(isLowAttendance(69)).toBe(true);
    expect(isLowAttendance(70)).toBe(false);
    expect(isLowAttendance(null)).toBe(false);
  });
});

describe("racha de ausencias (RN-03, RF-24)", () => {
  it("cuenta las ausencias seguidas sin justificar más recientes", () => {
    expect(
      absenceStreak([
        record("2026-10-01", "present"),
        record("2026-10-08", "absent"),
        record("2026-10-15", "absent"),
        record("2026-10-20", "absent"),
      ]),
    ).toBe(3);
  });

  it("una asistencia o una justificada cortan la racha", () => {
    expect(
      absenceStreak([
        record("2026-10-01", "absent"),
        record("2026-10-08", "absent"),
        record("2026-10-15", "present"),
        record("2026-10-20", "absent"),
      ]),
    ).toBe(1);
    expect(
      absenceStreak([
        record("2026-10-01", "absent"),
        record("2026-10-08", "excused"),
        record("2026-10-15", "absent"),
        record("2026-10-20", "absent"),
      ]),
    ).toBe(2);
  });

  it("ignora las sesiones suspendidas y los arqueros sin marcar", () => {
    expect(
      absenceStreak([
        record("2026-10-01", "absent"),
        record("2026-10-08", "absent", "suspended"),
        record("2026-10-15", "unmarked"),
        record("2026-10-20", "absent"),
        record("2026-10-21", "absent"),
      ]),
    ).toBe(3);
  });

  it("sin ausencias recientes la racha es cero", () => {
    expect(absenceStreak([])).toBe(0);
    expect(absenceStreak([record("2026-10-01", "absent"), record("2026-10-02", "present")])).toBe(
      0,
    );
  });

  it("no depende del orden en que llegan los registros", () => {
    expect(
      absenceStreak([
        record("2026-10-20", "absent"),
        record("2026-10-01", "present"),
        record("2026-10-15", "absent"),
        record("2026-10-08", "absent"),
      ]),
    ).toBe(3);
  });
});

describe("calendario mensual (RF-17)", () => {
  it("arma semanas de lunes a domingo con huecos al principio y al final", () => {
    // Octubre de 2026 empieza en jueves y termina en sábado.
    const weeks = monthCalendar(2026, 10, []);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[0].slice(0, 3)).toEqual([null, null, null]);
    expect(weeks[0][3]).toMatchObject({ day: 1 });
    const last = weeks[weeks.length - 1];
    expect(last.filter(Boolean).at(-1)).toMatchObject({ day: 31, date: "2026-10-31" });
    expect(last[last.length - 1]).toBeNull(); // el domingo 1/11 no es del mes
  });

  it("marca el estado de cada día con registros", () => {
    const weeks = monthCalendar(2026, 10, [
      record("2026-10-06", "present"),
      record("2026-10-08", "absent"),
      record("2026-10-13", "excused"),
      record("2026-10-15", "absent", "suspended"),
    ]);
    const byDate = new Map(
      weeks
        .flat()
        .filter(Boolean)
        .map((c) => [c!.date, c!.status]),
    );
    expect(byDate.get("2026-10-06")).toBe("present");
    expect(byDate.get("2026-10-08")).toBe("absent");
    expect(byDate.get("2026-10-13")).toBe("excused");
    expect(byDate.get("2026-10-15")).toBe("suspended");
    expect(byDate.get("2026-10-07")).toBeNull();
  });

  it("un año bisiesto tiene 29 días en febrero", () => {
    const days = monthCalendar(2028, 2, []).flat().filter(Boolean);
    expect(days).toHaveLength(29);
  });

  it("si un día tuvo varias sesiones, se muestra la ausencia antes que la presencia", () => {
    expect(dayStatusOf([record("2026-10-06", "present"), record("2026-10-06", "absent")])).toBe(
      "absent",
    );
    expect(dayStatusOf([])).toBeNull();
  });
});

describe("meses", () => {
  it("lee y valida el mes de la URL", () => {
    expect(parseMonth("2026-10")).toEqual({ year: 2026, month: 10 });
    expect(parseMonth("2026-13")).toBeNull();
    expect(parseMonth("hola")).toBeNull();
    expect(parseMonth(undefined)).toBeNull();
  });

  it("avanza y retrocede cruzando el año", () => {
    expect(shiftMonth(2026, 12, 1)).toBe("2027-01");
    expect(shiftMonth(2026, 1, -1)).toBe("2025-12");
    expect(shiftMonth(2026, 10, 0)).toBe("2026-10");
  });
});

describe("resumen por grupo y mes (RF-22)", () => {
  it("cuenta entrenamientos con marcas y promedia presentes sobre presentes y ausentes", () => {
    const summary = groupMonthSummary([
      { sessionStatus: "open", entries: ["present", "present", "absent", "excused"] },
      { sessionStatus: "open", entries: ["present", "absent", "unmarked"] },
      { sessionStatus: "suspended", entries: ["present"] },
      { sessionStatus: "open", entries: ["unmarked", "unmarked"] }, // RN-07: no cuenta
    ]);
    expect(summary).toEqual({ trainings: 2, average: 60 }); // 3 presentes de 5
  });

  it("sin datos no hay promedio", () => {
    expect(groupMonthSummary([])).toEqual({ trainings: 0, average: null });
    expect(groupMonthSummary([{ sessionStatus: "open", entries: ["excused"] }])).toEqual({
      trainings: 1,
      average: null,
    });
  });
});
