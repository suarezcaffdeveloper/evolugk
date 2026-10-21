import { describe, expect, it } from "vitest";
import {
  ageOn,
  goalkeeperSchema,
  groupSchema,
  guardianSchema,
  measurementSchema,
} from "./goalkeeper-schemas";

const base = {
  firstName: " Lucas ",
  lastName: "Ríos",
  birthDate: "2012-05-01",
  joinedOn: "2024-03-01",
};

describe("edad", () => {
  it("cuenta los años cumplidos", () => {
    expect(ageOn("2008-06-15", "2026-06-14")).toBe(17);
    expect(ageOn("2008-06-15", "2026-06-15")).toBe(18);
    expect(ageOn("2012-05-01", "2026-10-21")).toBe(14);
  });
});

describe("ficha del arquero", () => {
  it("acepta los datos mínimos y limpia espacios y vacíos", () => {
    const parsed = goalkeeperSchema.parse({ ...base, level: "", currentClub: "  ", goal: "" });
    expect(parsed.firstName).toBe("Lucas");
    expect(parsed.level).toBeNull();
    expect(parsed.currentClub).toBeNull();
    expect(parsed.goal).toBeNull();
  });

  it("exige nombre, apellido y fechas", () => {
    const result = goalkeeperSchema.safeParse({
      firstName: "",
      lastName: "",
      birthDate: "",
      joinedOn: "",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza fechas inexistentes y un ingreso anterior al nacimiento", () => {
    expect(goalkeeperSchema.safeParse({ ...base, birthDate: "2012-02-31" }).success).toBe(false);
    const early = goalkeeperSchema.safeParse({ ...base, joinedOn: "2010-01-01" });
    expect(early.success).toBe(false);
  });

  it("rechaza niveles y pies que no están en la lista", () => {
    expect(goalkeeperSchema.safeParse({ ...base, level: "experto" }).success).toBe(false);
    expect(goalkeeperSchema.safeParse({ ...base, preferredFoot: "ambos" }).success).toBe(false);
    expect(
      goalkeeperSchema.safeParse({ ...base, level: "advanced", preferredFoot: "left" }).success,
    ).toBe(true);
  });
});

describe("tutor", () => {
  const guardian = { firstName: "Laura", lastName: "Pérez", phone: "11 5555-0000" };

  it("pide nombre, apellido y teléfono; el mail es opcional", () => {
    expect(guardianSchema.parse(guardian).email).toBeNull();
    expect(guardianSchema.safeParse({ ...guardian, phone: "" }).success).toBe(false);
    expect(guardianSchema.safeParse({ ...guardian, firstName: " " }).success).toBe(false);
  });

  it("valida el formato del teléfono y del mail", () => {
    expect(guardianSchema.safeParse({ ...guardian, phone: "abc" }).success).toBe(false);
    expect(guardianSchema.safeParse({ ...guardian, phone: "123" }).success).toBe(false);
    expect(guardianSchema.safeParse({ ...guardian, email: "no-es-mail" }).success).toBe(false);
    expect(guardianSchema.parse({ ...guardian, email: " Laura@Mail.com " }).email).toBe(
      "laura@mail.com",
    );
  });
});

describe("medida", () => {
  it("acepta coma decimal y solo altura o solo peso", () => {
    expect(measurementSchema.parse({ date: "2026-10-01", heightCm: "151,5" }).heightCm).toBe(151.5);
    expect(measurementSchema.parse({ date: "2026-10-01", weightKg: "42" }).weightKg).toBe(42);
  });

  it("exige al menos un valor y rangos razonables", () => {
    expect(measurementSchema.safeParse({ date: "2026-10-01" }).success).toBe(false);
    expect(measurementSchema.safeParse({ date: "2026-10-01", heightCm: "5" }).success).toBe(false);
    expect(measurementSchema.safeParse({ date: "2026-10-01", weightKg: "abc" }).success).toBe(
      false,
    );
  });
});

describe("grupo", () => {
  it("pide nombre y deja el horario opcional", () => {
    expect(groupSchema.parse({ name: " Sub-12 ", schedule: "" })).toEqual({
      name: "Sub-12",
      schedule: null,
    });
    expect(groupSchema.safeParse({ name: " " }).success).toBe(false);
  });
});
