/**
 * Datos de ejemplo para probar a mano: una escuela completa con administración, profesor, grupos,
 * arqueros de todos los estados, hermanos, un arquero adulto, consentimientos de todo tipo, medidas,
 * evaluaciones (publicadas, borrador y pendientes) y notas.
 *
 * Uso (desde la raíz del repositorio):  pnpm seed
 *
 * - Solo corre contra el proyecto de DESARROLLO de Supabase (se niega con cualquier otro).
 * - Es repetible: si la escuela de ejemplo ya existe, la borra y la vuelve a crear desde cero.
 * - Escribe las claves y los accesos generados en `apps/web/.seed-demo.local.txt` (ignorado por git)
 *   y también los muestra por pantalla. Los PIN de los tutores son los iniciales: cada uno se cambia
 *   en el primer ingreso al portal.
 *
 * Se ejecuta con Vitest para reutilizar la misma lógica de la aplicación (alta de arqueros, tutores
 * y códigos); no es una prueba.
 */
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { argentinaDate, addDays } from "../src/lib/dates";
import { formatAccessCode } from "../src/lib/access-code";
import { goalkeeperSchema, type GuardianInput } from "../src/lib/goalkeeper-schemas";
import { makeEvaluationSchema } from "../src/lib/evaluation-schemas";
import { applyMarks, openSession, type MarkInput } from "../src/server/attendance";
import {
  addNote,
  createEvaluation,
  getCurrentRubric,
  publishEvaluation,
} from "../src/server/evaluations";
import { addMeasurement, createGoalkeeper, createGroup } from "../src/server/goalkeepers";
import type { GuardianSpec } from "../src/server/goalkeepers";
import { createAdminClient, createProfile, getConfig } from "../src/test/db";

const SLUG = "escuela-demo";
const EMAIL_ADMIN = "demo-admin@example.com";
const EMAIL_COACH = "demo-profe@example.com";

/** Hace `years` años y `days` días (calendario). Sirve para fechas de nacimiento creíbles. */
const ago = (today: string, years: number, days = 0) =>
  addDays(`${Number(today.slice(0, 4)) - years}${today.slice(4)}`, -days);

type Seed = {
  first: string;
  last: string;
  yearsOld: number;
  level?: "inicial" | "intermedio" | "avanzado";
  foot?: "derecho" | "izquierdo" | "ambos";
  club?: string;
  category?: string;
  goal?: string;
  status?: "active" | "inactive" | "graduated";
  groups?: string[];
  guardian: GuardianInput & { relationship: GuardianSpec["relationship"] };
  /** Nombre de un tutor ya creado (hermanos): se vincula en vez de crear otro. */
  sameGuardianAs?: string;
  consent?: "valid" | "revoked";
  measurements?: { monthsAgo: number; height: number; weight: number }[];
};

const g = (
  firstName: string,
  lastName: string,
  phone: string,
  relationship: GuardianSpec["relationship"] = "mother",
  email: string | null = null,
) => ({ firstName, lastName, phone, email, relationship });

const SEEDS: Seed[] = [
  {
    first: "Lucas",
    last: "Fernández",
    yearsOld: 10,
    level: "inicial",
    foot: "derecho",
    club: "Club Atlético Barrio Norte",
    category: "Infantil",
    groups: ["Infantil"],
    goal: "Ganar confianza en el juego aéreo.",
    consent: "valid",
    guardian: g("Marcela", "Fernández", "11 5501-0001", "mother", "marcela.fernandez@example.com"),
    measurements: [
      { monthsAgo: 12, height: 136.0, weight: 31.5 },
      { monthsAgo: 6, height: 140.5, weight: 33.8 },
      { monthsAgo: 0, height: 144.0, weight: 36.2 },
    ],
  },
  {
    first: "Mateo",
    last: "Fernández",
    yearsOld: 8,
    level: "inicial",
    foot: "izquierdo",
    category: "Infantil",
    groups: ["Infantil"],
    consent: "valid", // hermano de Lucas
    guardian: g("Marcela", "Fernández", "11 5501-0001"),
    sameGuardianAs: "Lucas Fernández",
    measurements: [{ monthsAgo: 3, height: 128.0, weight: 26.0 }],
  },
  {
    first: "Valentina",
    last: "Suárez",
    yearsOld: 12,
    level: "intermedio",
    foot: "derecho",
    club: "Deportivo Sur",
    category: "Sub 13",
    groups: ["Juvenil"],
    consent: "valid",
    goal: "Mejorar el juego con los pies.",
    guardian: g("Carlos", "Suárez", "11 5501-0002", "father"),
    measurements: [
      { monthsAgo: 9, height: 148.0, weight: 38.0 },
      { monthsAgo: 0, height: 154.5, weight: 42.1 },
    ],
  },
  {
    first: "Joaquín",
    last: "Benítez",
    yearsOld: 13,
    level: "intermedio",
    foot: "derecho",
    category: "Sub 14",
    groups: ["Juvenil"], // consentimiento pendiente
    guardian: g("Silvia", "Benítez", "11 5501-0003"),
  },
  {
    first: "Camila",
    last: "Rojas",
    yearsOld: 14,
    level: "avanzado",
    foot: "ambos",
    club: "Atlético Central",
    category: "Sub 15",
    groups: ["Juvenil"],
    consent: "revoked",
    goal: "Llegar a la selección provincial.",
    guardian: g("Patricia", "Rojas", "11 5501-0004", "mother", "patricia.rojas@example.com"),
    measurements: [{ monthsAgo: 2, height: 165.0, weight: 55.0 }],
  },
  {
    first: "Tomás",
    last: "Acosta",
    yearsOld: 15,
    level: "avanzado",
    foot: "derecho",
    category: "Sub 16",
    groups: ["Juvenil"],
    consent: "valid",
    guardian: g("Raúl", "Acosta", "11 5501-0005", "father"),
    measurements: [
      { monthsAgo: 10, height: 171.0, weight: 62.0 },
      { monthsAgo: 4, height: 174.0, weight: 65.5 },
    ],
  },
  {
    first: "Sofía",
    last: "Medina",
    yearsOld: 9,
    level: "inicial",
    foot: "derecho",
    groups: ["Infantil"], // pendiente
    guardian: g("Laura", "Medina", "11 5501-0006"),
  },
  {
    first: "Bruno",
    last: "Gómez",
    yearsOld: 11,
    level: "intermedio",
    foot: "izquierdo",
    club: "Juniors",
    category: "Infantil",
    groups: ["Infantil"],
    consent: "valid",
    guardian: g("Elena", "Gómez", "11 5501-0007", "grandparent"),
  },
  {
    first: "Martina",
    last: "Ibarra",
    yearsOld: 11,
    level: "intermedio",
    groups: ["Infantil"],
    guardian: g("Diego", "Ibarra", "11 5501-0008", "father"),
    consent: "valid",
  },
  {
    first: "Santiago",
    last: "Ibarra",
    yearsOld: 14,
    level: "avanzado",
    groups: ["Juvenil"],
    guardian: g("Diego", "Ibarra", "11 5501-0008", "father"),
    sameGuardianAs: "Martina Ibarra",
    consent: "valid", // hermano de Martina
  },
  {
    first: "Emilia",
    last: "Vera",
    yearsOld: 13,
    level: "intermedio",
    groups: ["Juvenil"],
    status: "inactive",
    guardian: g("Natalia", "Vera", "11 5501-0009"),
    consent: "valid",
  },
  {
    first: "Agustín",
    last: "Luna",
    yearsOld: 16,
    level: "avanzado",
    foot: "derecho",
    club: "Atlético Central",
    category: "Sub 17",
    status: "graduated",
    guardian: g("Marta", "Luna", "11 5501-0010"),
    consent: "valid",
    measurements: [{ monthsAgo: 14, height: 180.0, weight: 72.0 }],
  },
  {
    first: "Federico",
    last: "Paz",
    yearsOld: 21,
    level: "avanzado",
    foot: "derecho",
    club: "Liga Amateur",
    category: "Primera",
    groups: ["Adultos"],
    consent: "valid",
    goal: "Mantener el nivel para la liga.",
    // Mayor de 18: es su propio tutor, con código y PIN propios.
    guardian: g("Federico", "Paz", "11 5501-0011", "self", "fede.paz@example.com"),
    measurements: [{ monthsAgo: 1, height: 183.0, weight: 79.5 }],
  },
  {
    first: "Olivia",
    last: "Domínguez",
    yearsOld: 7,
    level: "inicial",
    groups: ["Infantil"],
    guardian: g("Romina", "Domínguez", "11 5501-0012"), // pendiente
  },
];

it("carga los datos de ejemplo", async () => {
  getConfig(); // se niega a seguir si no es el proyecto de desarrollo
  const db = createAdminClient();
  const today = argentinaDate(new Date());

  // ── Limpieza de una corrida anterior ──
  const { data: previous } = await db.from("school").select("id").eq("slug", SLUG);
  const previousIds = (previous ?? []).map((s) => s.id as string);
  if (previousIds.length > 0) {
    await db.from("audit_log").delete().in("school_id", previousIds);
    await db.from("school").delete().in("id", previousIds);
  }
  const { data: users } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const user of users?.users ?? []) {
    if (user.email === EMAIL_ADMIN || user.email === EMAIL_COACH) {
      await db.auth.admin.deleteUser(user.id);
    }
  }

  // ── Escuela, suscripción y equipo ──
  const { data: school, error } = await db
    .from("school")
    .insert({
      name: "Escuela de Arqueros Demo",
      slug: SLUG,
      primary_color: "#15803D",
      contact_phone: "11 4000-0000",
      contact_email: "contacto@escuela-demo.example.com",
      address: "Av. Siempreviva 742, Buenos Aires",
      hours: "Lunes a viernes de 17 a 21 h",
    })
    .select("id")
    .single();
  if (error || !school) throw new Error(`No se pudo crear la escuela: ${error?.message}`);
  await db.from("subscription").insert({
    school_id: school.id,
    monthly_price_ars: 10000,
    goalkeeper_limit: 50,
    video_minutes_limit: 600,
    trial_until: "2099-01-01",
    covered_until: "2099-01-01",
  });

  const adminPassword = `Demo-${randomUUID().slice(0, 12)}`;
  const coachPassword = `Demo-${randomUUID().slice(0, 12)}`;
  const staff: { id: string; email: string }[] = [];
  for (const [email, password, role, name] of [
    [EMAIL_ADMIN, adminPassword, "school_admin", "Ana"],
    [EMAIL_COACH, coachPassword, "coach", "Pablo"],
  ] as const) {
    const { data, error: userError } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (userError || !data.user)
      throw new Error(`No se pudo crear a ${email}: ${userError?.message}`);
    const profile = await createProfile(db, {
      userId: data.user.id,
      schoolId: school.id,
      role,
      label: name,
    });
    if (profile.error) throw new Error(`No se pudo crear el perfil: ${profile.error.message}`);
    staff.push({ id: data.user.id, email });
  }
  const actor = { schoolId: school.id, actorId: staff[0].id };

  // ── Grupos (uno archivado) ──
  const groupIds = new Map<string, string>();
  for (const [name, schedule] of [
    ["Infantil", "Martes y jueves 17 h"],
    ["Juvenil", "Lunes y miércoles 18:30 h"],
    ["Adultos", "Viernes 20 h"],
  ] as const) {
    const result = await createGroup(db, { ...actor, data: { name, schedule } });
    if (!result.ok) throw new Error(`No se pudo crear el grupo ${name}`);
    groupIds.set(name, result.groupId);
  }
  await db.from("groups").insert({ school_id: school.id, name: "Verano 2025", archived: true });

  // ── Arqueros, tutores, consentimientos y medidas ──
  const guardianByName = new Map<string, string>();
  const goalkeeperIds = new Map<string, string>();
  const credentials: { tutor: string; arqueros: string[]; code: string; pin: string }[] = [];
  const consentTargets: { goalkeeperId: string; guardianId: string; kind: "valid" | "revoked" }[] =
    [];

  for (const seed of SEEDS) {
    const name = `${seed.first} ${seed.last}`;
    const linked = seed.sameGuardianAs ? guardianByName.get(seed.sameGuardianAs) : undefined;
    const { relationship, ...guardianData } = seed.guardian;
    const spec: GuardianSpec = linked
      ? { relationship, existingGuardianId: linked }
      : { relationship, data: guardianData };

    const created = await createGoalkeeper(db, {
      ...actor,
      goalkeeper: goalkeeperSchema.parse({
        firstName: seed.first,
        lastName: seed.last,
        birthDate: ago(today, seed.yearsOld, 40),
        joinedOn: ago(today, 0, 200),
        preferredFoot:
          seed.foot === "derecho"
            ? "right"
            : seed.foot === "izquierdo"
              ? "left"
              : seed.foot === "ambos"
                ? "both"
                : "",
        level:
          seed.level === "inicial"
            ? "beginner"
            : seed.level === "intermedio"
              ? "intermediate"
              : seed.level === "avanzado"
                ? "advanced"
                : "",
        currentClub: seed.club ?? "",
        category: seed.category ?? "",
        goal: seed.goal ?? "",
        emergencyName: "Contacto de emergencia",
        emergencyPhone: "11 5999-0000",
        emergencyRelationship: "Familiar",
      }),
      guardians: [spec],
      groupIds: (seed.groups ?? []).map((n) => groupIds.get(n) ?? ""),
      today,
      confirmDuplicate: true,
    });
    if (!created.ok) throw new Error(`No se pudo crear a ${name}: ${created.error}`);

    let guardianId = linked;
    if (created.credentials[0]) {
      const c = created.credentials[0];
      guardianId = c.guardianId;
      guardianByName.set(name, c.guardianId);
      credentials.push({
        tutor: c.name,
        arqueros: [name],
        code: formatAccessCode(c.accessCode),
        pin: c.pin,
      });
    } else {
      const entry = credentials.find((c) => c.arqueros.includes(seed.sameGuardianAs ?? ""));
      entry?.arqueros.push(name);
    }

    goalkeeperIds.set(name, created.goalkeeperId);
    if (seed.status && seed.status !== "active") {
      await db.from("goalkeeper").update({ status: seed.status }).eq("id", created.goalkeeperId);
    }
    if (seed.consent && guardianId) {
      consentTargets.push({ goalkeeperId: created.goalkeeperId, guardianId, kind: seed.consent });
    }
    for (const m of seed.measurements ?? []) {
      const date = addDays(today, -m.monthsAgo * 30);
      await addMeasurement(db, {
        ...actor,
        goalkeeperId: created.goalkeeperId,
        today,
        data: { date, heightCm: m.height, weightKg: m.weight },
      });
    }
  }

  // El consentimiento lo da siempre un tutor (acá se simula que ya lo dieron o lo retiraron).
  for (const target of consentTargets) {
    const grantedAt = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    await db.from("consent").insert({
      school_id: school.id,
      goalkeeper_id: target.goalkeeperId,
      guardian_id: target.guardianId,
      type: "media",
      text_version: "2026-10-borrador",
      granted_at: grantedAt,
      revoked_at: target.kind === "revoked" ? new Date().toISOString() : null,
      revoked_by: target.kind === "revoked" ? target.guardianId : null,
    });
  }

  // ── Evaluaciones y notas (hito 3) ──
  const { categories } = await getCurrentRubric(db);
  const evaluationSchema = makeEvaluationSchema(today);
  const coach = { schoolId: school.id, actorId: staff[1].id, role: "coach" as const };
  const brand = { name: "Escuela de Arqueros Demo", slug: SLUG };

  /** Puntajes en el orden de la rúbrica; 0 = categoría omitida ("sin evaluar"). */
  const evaluate = async (
    who: string,
    daysAgo: number,
    type: "entry" | "periodic",
    scores: number[],
    comment: string,
    publish = true,
  ) => {
    const goalkeeperId = goalkeeperIds.get(who);
    if (!goalkeeperId) throw new Error(`No hay un arquero ${who} para evaluar`);
    const result = await createEvaluation(db, {
      ...coach,
      goalkeeperId,
      data: evaluationSchema.parse({
        date: addDays(today, -daysAgo),
        type,
        comment,
        scores: categories.map((c, i) => ({
          categoryId: c.id,
          score: scores[i] ? String(scores[i]) : "",
        })),
      }),
    });
    if (!result.ok) throw new Error(`No se pudo evaluar a ${who}: ${result.error}`);
    if (publish) {
      await publishEvaluation(db, {
        ...coach,
        evaluationId: result.evaluationId,
        // Sin envío real: el seed no manda mails.
        transport: async () => ({ ok: true, id: null }),
        school: brand,
      });
    }
  };

  // Lucas: ingreso y dos periódicas (la última omite una categoría) + un borrador.
  await evaluate(
    "Lucas Fernández",
    200,
    "entry",
    [3, 2, 4, 3, 4, 5, 4, 5],
    "Punto de partida. Mucho por trabajar en el juego aéreo.",
  );
  await evaluate(
    "Lucas Fernández",
    110,
    "periodic",
    [5, 4, 5, 5, 6, 6, 5, 6],
    "Mejoró el posicionamiento.",
  );
  await evaluate(
    "Lucas Fernández",
    20,
    "periodic",
    [7, 5, 6, 7, 8, 7, 6, 0],
    "Gran momento. Todavía no pudimos evaluar la mentalidad en partido.",
  );
  await evaluate(
    "Lucas Fernández",
    2,
    "periodic",
    [7, 6, 6, 7, 8, 7, 7, 7],
    "Borrador sin publicar.",
    false,
  );
  // Valentina: la última evaluación tiene más de 90 días (queda "pendiente").
  await evaluate(
    "Valentina Suárez",
    190,
    "entry",
    [5, 4, 3, 5, 6, 6, 5, 6],
    "Buena técnica de base.",
  );
  await evaluate(
    "Valentina Suárez",
    120,
    "periodic",
    [6, 5, 5, 6, 7, 6, 6, 7],
    "Avanza con los pies.",
  );
  // Tomás: una sola evaluación publicada (sin gráficos de evolución todavía).
  await evaluate(
    "Tomás Acosta",
    15,
    "entry",
    [8, 7, 7, 8, 8, 9, 8, 8],
    "Nivel muy alto desde el ingreso.",
  );
  // Camila: evaluada hace poco, con consentimiento retirado (las evaluaciones no dependen de él).
  await evaluate("Camila Rojas", 30, "entry", [7, 8, 8, 7, 8, 7, 8, 9], "Gran lectura del juego.");
  // Sin evaluar nunca (pendientes): Joaquín, Sofía, Bruno, Martina, Santiago, Federico, Olivia.

  const lucas = goalkeeperIds.get("Lucas Fernández");
  if (lucas) {
    await addNote(db, {
      ...coach,
      goalkeeperId: lucas,
      data: { body: "Muy buen trabajo hoy en los centros.", visibleToFamily: true },
    });
    await addNote(db, {
      ...coach,
      goalkeeperId: lucas,
      data: { body: "Llegó con dolor en la rodilla (nota interna).", visibleToFamily: false },
    });
  }

  // ── Asistencia (hito 5) ──
  const attendanceActor = { ...coach };
  /** Toma lista de un grupo hace `daysAgo` días. `plan` indica el estado de cada arquero por nombre. */
  const takeAttendance = async (
    groupName: string,
    daysAgo: number,
    plan: Record<string, "present" | "absent" | "excused">,
    suspendedReason?: string,
  ) => {
    const opened = await openSession(db, {
      ...attendanceActor,
      groupId: groupIds.get(groupName) ?? "",
      date: addDays(today, -daysAgo),
      today,
    });
    if (!opened.ok) throw new Error(`No se pudo abrir la lista de ${groupName}: ${opened.error}`);
    const marks: MarkInput[] = [];
    for (const entry of opened.state.entries) {
      const status = plan[`${entry.firstName} ${entry.lastName}`];
      if (status) {
        marks.push({
          goalkeeperId: entry.goalkeeperId,
          status,
          reason: status === "excused" ? "Tenía examen" : null,
          markedAt: new Date(Date.now() - (daysAgo * 24 * 3600 - 60) * 1000).toISOString(),
        });
      }
    }
    if (suspendedReason) {
      await db
        .from("attendance_session")
        .update({ status: "suspended", suspension_reason: suspendedReason })
        .eq("id", opened.state.sessionId);
      return;
    }
    const saved = await applyMarks(db, {
      ...attendanceActor,
      sessionId: opened.state.sessionId,
      marks,
      // Las marcas del seed son del pasado: se aplican con la hora de esa fecha.
      now: new Date(),
    });
    if (!saved.ok) throw new Error(`No se pudo guardar la lista de ${groupName}: ${saved.error}`);
  };

  // Infantil: seis entrenamientos. Lucas asiste casi siempre; Sofía falla 3 seguidas al final (aviso
  // para el admin); Bruno y Olivia tienen baja asistencia; Mateo tiene una justificada.
  const infantil = (over: Record<string, "present" | "absent" | "excused">) => ({
    "Lucas Fernández": "present" as const,
    "Mateo Fernández": "present" as const,
    "Sofía Medina": "present" as const,
    "Bruno Gómez": "present" as const,
    "Martina Ibarra": "present" as const,
    "Olivia Domínguez": "present" as const,
    ...over,
  });
  await takeAttendance("Infantil", 35, infantil({ "Bruno Gómez": "absent" }));
  await takeAttendance(
    "Infantil",
    28,
    infantil({ "Bruno Gómez": "absent", "Olivia Domínguez": "absent" }),
  );
  await takeAttendance(
    "Infantil",
    21,
    infantil({ "Mateo Fernández": "excused", "Bruno Gómez": "absent" }),
    undefined,
  );
  await takeAttendance("Infantil", 14, {}, "Lluvia");
  await takeAttendance(
    "Infantil",
    9,
    infantil({ "Sofía Medina": "absent", "Olivia Domínguez": "absent" }),
  );
  await takeAttendance("Infantil", 7, infantil({ "Sofía Medina": "absent" }));
  await takeAttendance(
    "Infantil",
    2,
    infantil({ "Sofía Medina": "absent", "Bruno Gómez": "absent" }),
  );
  // Juvenil: una lista parcial (algunos sin marcar).
  await takeAttendance("Juvenil", 7, {
    "Valentina Suárez": "present",
    "Joaquín Benítez": "absent",
    "Camila Rojas": "present",
    "Tomás Acosta": "present",
  });

  // ── Resultado ──
  const lines = [
    "DATOS DE EJEMPLO — Escuela de Arqueros Demo",
    "",
    `Panel del equipo:    http://localhost:3000/${SLUG}/login`,
    `  Administración:    ${EMAIL_ADMIN}  /  ${adminPassword}`,
    `  Profesor:          ${EMAIL_COACH}  /  ${coachPassword}`,
    "",
    `Portal de familias:  http://localhost:3000/${SLUG}`,
    "  (PIN inicial: cada tutor lo cambia en su primer ingreso)",
    "",
    ...credentials.map(
      (c) => `  ${c.tutor.padEnd(22)} ${c.code}   PIN ${c.pin}   → ${c.arqueros.join(", ")}`,
    ),
    "",
    "Evaluaciones: Lucas (ingreso + 2 periódicas + un borrador + notas), Valentina (pendiente: más de 90",
    "días), Tomás (una sola evaluación) y Camila (ingreso). El resto nunca fue evaluado.",
    "",
    "Asistencia: Infantil con 6 entrenamientos y uno suspendido por lluvia; Sofía con 3 ausencias seguidas (aviso",
    "para la administración), Bruno y Olivia con baja asistencia, Mateo con una justificada. Juvenil con una lista",
    "parcial (algunos sin marcar).",
    "",
    "Casos para mirar: hermanos con un solo tutor (Fernández, Ibarra), arquero adulto que es su propio",
    "tutor (Paz), consentimiento pendiente (Benítez, Medina, Domínguez), retirado (Rojas), arquero",
    "inactivo (Vera) y egresado (Luna), y un grupo archivado (Verano 2025).",
  ];
  writeFileSync(".seed-demo.local.txt", `${lines.join("\n")}\n`);
  console.log(`\n${lines.join("\n")}\n`);
}, 300_000);
