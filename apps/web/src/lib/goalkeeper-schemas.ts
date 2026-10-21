import { z } from "zod";

/** Validaciones de arqueros, tutores, medidas y grupos (spec 01). Mensajes en español (es-AR). */

export const LEVELS = ["beginner", "intermediate", "advanced"] as const;
export const FEET = ["right", "left", "both"] as const;
export const STATUSES = ["active", "inactive", "graduated"] as const;
export const RELATIONSHIPS = [
  "mother",
  "father",
  "guardian",
  "grandparent",
  "other",
  "self",
] as const;

export type Level = (typeof LEVELS)[number];
export type Foot = (typeof FEET)[number];
export type GoalkeeperStatus = (typeof STATUSES)[number];
export type Relationship = (typeof RELATIONSHIPS)[number];

export const LEVEL_LABELS: Record<Level, string> = {
  beginner: "Inicial",
  intermediate: "Intermedio",
  advanced: "Avanzado",
};
export const FOOT_LABELS: Record<Foot, string> = {
  right: "Derecho",
  left: "Izquierdo",
  both: "Ambos",
};
export const STATUS_LABELS: Record<GoalkeeperStatus, string> = {
  active: "Activo",
  inactive: "Inactivo",
  graduated: "Egresado",
};
export const RELATIONSHIP_LABELS: Record<Relationship, string> = {
  mother: "Madre",
  father: "Padre",
  guardian: "Tutor/a",
  grandparent: "Abuelo/a",
  other: "Otro",
  self: "Él mismo",
};

/** Edad en años cumplidos a una fecha de referencia ("AAAA-MM-DD"). */
export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

export const ADULT_AGE = 18;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ingresá una fecha válida.")
  .refine((value) => {
    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  }, "Ingresá una fecha válida.");

/** Texto opcional: vacío o solo espacios se guarda como nulo. */
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} puede tener hasta ${max} caracteres.`)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional()
    .transform((value) => value ?? null);

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T, message: string) =>
  z
    .union([z.enum(values, { error: message }), z.literal("")])
    .nullable()
    .optional()
    .transform((value) => (value ? (value as T[number]) : null));

const requiredName = (label: string) =>
  z
    .string({ error: `Ingresá ${label}.` })
    .trim()
    .min(1, `Ingresá ${label}.`)
    .max(80, `${label[0].toUpperCase()}${label.slice(1)} puede tener hasta 80 caracteres.`);

/** Teléfono: se aceptan espacios, guiones, paréntesis y "+"; se guarda como lo escribió la persona. */
export const phoneSchema = z
  .string({ error: "Ingresá un teléfono." })
  .trim()
  .min(1, "Ingresá un teléfono.")
  .max(40, "El teléfono es demasiado largo.")
  .refine((value) => /^[\d\s()+\-.]+$/.test(value), "El teléfono solo puede tener números.")
  .refine((value) => value.replace(/\D/g, "").length >= 6, "El teléfono es demasiado corto.");

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional()
  .transform((value) => value ?? null)
  .refine(
    (value) => value === null || z.email().safeParse(value).success,
    "El mail no tiene un formato válido.",
  );

export const guardianSchema = z.object({
  firstName: requiredName("el nombre"),
  lastName: requiredName("el apellido"),
  phone: phoneSchema,
  email: emailField,
});
export type GuardianInput = z.output<typeof guardianSchema>;

export const goalkeeperSchema = z
  .object({
    firstName: requiredName("el nombre"),
    lastName: requiredName("el apellido"),
    birthDate: isoDate,
    joinedOn: isoDate,
    preferredFoot: optionalEnum(FEET, "Elegí el pie hábil."),
    level: optionalEnum(LEVELS, "Elegí el nivel."),
    currentClub: optionalText(120, "El club"),
    category: optionalText(60, "La categoría"),
    goal: optionalText(1000, "El objetivo"),
    emergencyName: optionalText(120, "El nombre del contacto"),
    emergencyPhone: optionalText(40, "El teléfono del contacto"),
    emergencyRelationship: optionalText(60, "El parentesco"),
  })
  .superRefine((value, ctx) => {
    if (value.joinedOn < value.birthDate) {
      ctx.addIssue({
        code: "custom",
        path: ["joinedOn"],
        message: "La fecha de ingreso no puede ser anterior al nacimiento.",
      });
    }
  });
export type GoalkeeperInput = z.output<typeof goalkeeperSchema>;

/** Los datos no pueden ser futuros; se comparan con "hoy" en Argentina, que se pasa de afuera. */
export function futureDateIssue(date: string, today: string, message: string): string | null {
  return date > today ? message : null;
}

export const measurementSchema = z
  .object({
    date: isoDate,
    heightCm: z
      .union([z.string().trim(), z.number()])
      .optional()
      .transform((v) => (v === "" || v === undefined ? null : Number(String(v).replace(",", "."))))
      .refine(
        (v) => v === null || (Number.isFinite(v) && v >= 30 && v <= 260),
        "La altura va de 30 a 260 cm.",
      ),
    weightKg: z
      .union([z.string().trim(), z.number()])
      .optional()
      .transform((v) => (v === "" || v === undefined ? null : Number(String(v).replace(",", "."))))
      .refine(
        (v) => v === null || (Number.isFinite(v) && v >= 5 && v <= 250),
        "El peso va de 5 a 250 kg.",
      ),
  })
  .superRefine((value, ctx) => {
    if (value.heightCm === null && value.weightKg === null) {
      ctx.addIssue({
        code: "custom",
        path: ["heightCm"],
        message: "Cargá la altura, el peso o ambos.",
      });
    }
  });
export type MeasurementInput = z.output<typeof measurementSchema>;

export const groupSchema = z.object({
  name: z
    .string({ error: "Ingresá el nombre del grupo." })
    .trim()
    .min(1, "Ingresá el nombre del grupo.")
    .max(80, "El nombre puede tener hasta 80 caracteres."),
  schedule: optionalText(200, "El horario"),
});
export type GroupInput = z.output<typeof groupSchema>;

export function isStatus(value: unknown): value is GoalkeeperStatus {
  return STATUSES.includes(value as GoalkeeperStatus);
}
export function isLevel(value: unknown): value is Level {
  return LEVELS.includes(value as Level);
}
export function isRelationship(value: unknown): value is Relationship {
  return RELATIONSHIPS.includes(value as Relationship);
}
