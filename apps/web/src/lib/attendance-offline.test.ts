import { describe, expect, it } from "vitest";
import {
  acknowledgedOf,
  addGuest,
  countByStatus,
  hasPending,
  markAllPresent,
  markEntry,
  mergeServer,
  newLocalSession,
  pendingPayload,
  sessionKey,
  syncedAgo,
  type ServerSession,
} from "./attendance-offline";

const group = {
  id: "g1",
  name: "Infantil",
  members: [
    { id: "b", firstName: "Beto", lastName: "Zeta" },
    { id: "a", firstName: "Ana", lastName: "Alfa" },
    { id: "c", firstName: "Carla", lastName: "Mu" },
  ],
};
const T0 = new Date("2026-10-21T20:00:00Z");
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

const server = (
  entries: ServerSession["entries"],
  status: ServerSession["status"] = "open",
): ServerSession => ({
  sessionId: "s1",
  groupId: "g1",
  groupName: "Infantil",
  date: "2026-10-21",
  status,
  suspensionReason: status === "suspended" ? "Lluvia" : null,
  entries,
});
const serverEntry = (
  id: string,
  status: "unmarked" | "present" | "absent" | "excused",
  markedAt: string | null = null,
) => ({
  goalkeeperId: id,
  firstName: id.toUpperCase(),
  lastName: "X",
  status,
  reason: null,
  isGuest: false,
  markedAt,
});

describe("lista nueva", () => {
  it("arma la lista con los miembros precargados, sin marcar y ordenados por apellido", () => {
    const session = newLocalSession(group, "2026-10-21");
    expect(session.sessionId).toBeNull();
    expect(session.entries.map((e) => e.goalkeeperId)).toEqual(["a", "c", "b"]);
    expect(session.entries.every((e) => e.status === "unmarked" && !e.isGuest)).toBe(true);
    expect(hasPending(session)).toBe(false);
  });

  it("la clave de una lista es el grupo y la fecha", () => {
    expect(sessionKey("g1", "2026-10-21")).toBe("g1:2026-10-21");
  });
});

describe("marcar (RF-06, RF-07, RF-11)", () => {
  it("un toque marca al arquero y deja la marca pendiente con su hora", () => {
    const session = markEntry(newLocalSession(group, "2026-10-21"), "a", "present", at(1));
    expect(session.entries.find((e) => e.goalkeeperId === "a")?.status).toBe("present");
    expect(session.pending.a).toEqual({
      status: "present",
      reason: null,
      markedAt: at(1).toISOString(),
      guest: false,
    });
    expect(hasPending(session)).toBe(true);
  });

  it("cambiar de opinión reemplaza la marca pendiente", () => {
    let session = newLocalSession(group, "2026-10-21");
    session = markEntry(session, "a", "present", at(1));
    session = markEntry(session, "a", "absent", at(2));
    expect(session.pending.a.status).toBe("absent");
    expect(Object.keys(session.pending)).toHaveLength(1);
  });

  it("la justificada lleva su motivo y las demás no", () => {
    let session = newLocalSession(group, "2026-10-21");
    session = markEntry(session, "a", "excused", at(1), "  Examen  ");
    session = markEntry(session, "b", "absent", at(2), "no va");
    expect(session.pending.a.reason).toBe("Examen");
    expect(session.pending.b.reason).toBeNull();
  });

  it("CA-01: todos presentes y 2 desmarcados dan 1 presente y 2 ausentes de 3", () => {
    let session = markAllPresent(newLocalSession(group, "2026-10-21"), at(1));
    expect(countByStatus(session)).toMatchObject({ present: 3, unmarked: 0 });
    session = markEntry(session, "a", "absent", at(5));
    session = markEntry(session, "b", "absent", at(6));
    expect(countByStatus(session)).toMatchObject({ present: 1, absent: 2, unmarked: 0, total: 3 });
  });

  it("'todos presentes' no pisa lo que ya estaba marcado", () => {
    let session = markEntry(newLocalSession(group, "2026-10-21"), "a", "absent", at(1));
    session = markAllPresent(session, at(2));
    expect(session.entries.find((e) => e.goalkeeperId === "a")?.status).toBe("absent");
    expect(countByStatus(session)).toMatchObject({ present: 2, absent: 1 });
  });

  it("una sesión suspendida no admite marcas (RN-02)", () => {
    const suspended = { ...newLocalSession(group, "2026-10-21"), status: "suspended" as const };
    expect(markEntry(suspended, "a", "present", at(1))).toBe(suspended);
  });

  it("CA-12: se puede guardar con arqueros sin marcar; quedan contados aparte", () => {
    const session = markEntry(newLocalSession(group, "2026-10-21"), "a", "present", at(1));
    expect(countByStatus(session)).toMatchObject({ present: 1, unmarked: 2 });
  });
});

describe("invitados (RF-09, RN-05)", () => {
  it("se suma como invitado sin marcar, al final, y se avisa al servidor aunque no esté marcado", () => {
    const session = addGuest(newLocalSession(group, "2026-10-21"), {
      id: "z",
      firstName: "Zoe",
      lastName: "Visita",
    });
    expect(session.entries.at(-1)).toMatchObject({
      goalkeeperId: "z",
      isGuest: true,
      status: "unmarked",
    });
    expect(pendingPayload(session)).toEqual([
      expect.objectContaining({ goalkeeperId: "z", guest: true, status: "unmarked" }),
    ]);
  });

  it("no se agrega dos veces", () => {
    let session = newLocalSession(group, "2026-10-21");
    session = addGuest(session, { id: "z", firstName: "Zoe", lastName: "Visita" });
    expect(addGuest(session, { id: "z", firstName: "Zoe", lastName: "Visita" })).toBe(session);
    // Un miembro del grupo tampoco se agrega como invitado.
    expect(addGuest(session, { id: "a", firstName: "Ana", lastName: "Alfa" })).toBe(session);
  });

  it("al marcar al invitado, la marca viaja como de invitado", () => {
    let session = addGuest(newLocalSession(group, "2026-10-21"), {
      id: "z",
      firstName: "Zoe",
      lastName: "Visita",
    });
    session = markEntry(session, "z", "present", at(2));
    expect(session.pending.z).toMatchObject({ guest: true, status: "present" });
  });
});

describe("sincronizar (RF-26, RF-29)", () => {
  it("lo confirmado sale de la cola y lo demás queda pendiente", () => {
    let local = newLocalSession(group, "2026-10-21");
    local = markEntry(local, "a", "present", at(1));
    const sent = pendingPayload(local);
    // Mientras se sincroniza, el profesor marca a otro.
    local = markEntry(local, "b", "absent", at(3));

    const merged = mergeServer(
      local,
      server([
        serverEntry("a", "present", at(1).toISOString()),
        serverEntry("b", "unmarked"),
        serverEntry("c", "unmarked"),
      ]),
      acknowledgedOf(sent),
      at(4),
    );
    expect(Object.keys(merged.pending)).toEqual(["b"]);
    expect(merged.entries.find((e) => e.goalkeeperId === "b")?.status).toBe("absent"); // sigue a la vista
    expect(merged.sessionId).toBe("s1");
    expect(merged.syncedAt).toBe(at(4).toISOString());
  });

  it("RF-29: si el servidor tiene una marca más nueva que la mía, prevalece la del servidor", () => {
    let local = newLocalSession(group, "2026-10-21");
    local = markEntry(local, "a", "present", at(1));
    const sent = pendingPayload(local);
    const merged = mergeServer(
      local,
      server([
        serverEntry("a", "absent", at(5).toISOString()),
        serverEntry("b", "unmarked"),
        serverEntry("c", "unmarked"),
      ]),
      acknowledgedOf(sent),
    );
    expect(merged.entries.find((e) => e.goalkeeperId === "a")?.status).toBe("absent");
    expect(hasPending(merged)).toBe(false);
  });

  it("una marca mía más nueva que la del servidor se conserva y se vuelve a enviar", () => {
    let local = newLocalSession(group, "2026-10-21");
    local = markEntry(local, "a", "present", at(9));
    // No se envió todavía (no hay confirmación).
    const merged = mergeServer(
      local,
      server([
        serverEntry("a", "absent", at(5).toISOString()),
        serverEntry("b", "unmarked"),
        serverEntry("c", "unmarked"),
      ]),
    );
    expect(merged.entries.find((e) => e.goalkeeperId === "a")?.status).toBe("present");
    expect(merged.pending.a.status).toBe("present");
  });

  it("el estado del servidor (suspensión, miembros nuevos de otro dispositivo) reemplaza al local", () => {
    const local = newLocalSession(group, "2026-10-21");
    const merged = mergeServer(
      local,
      server(
        [
          serverEntry("a", "present", at(1).toISOString()),
          serverEntry("d", "absent", at(2).toISOString()),
        ],
        "suspended",
      ),
    );
    expect(merged.status).toBe("suspended");
    expect(merged.suspensionReason).toBe("Lluvia");
    expect(merged.entries.map((e) => e.goalkeeperId).sort()).toEqual(["a", "d"]);
  });

  it("un invitado que el servidor todavía no conoce sigue pendiente", () => {
    let local = addGuest(newLocalSession(group, "2026-10-21"), {
      id: "z",
      firstName: "Zoe",
      lastName: "Visita",
    });
    local = markEntry(local, "z", "present", at(2));
    const merged = mergeServer(local, server([serverEntry("a", "unmarked")]));
    expect(merged.pending.z).toBeDefined();
    expect(merged.entries.some((e) => e.goalkeeperId === "z")).toBe(true);
  });

  it("el payload sale ordenado por hora de marca", () => {
    let local = newLocalSession(group, "2026-10-21");
    local = markEntry(local, "b", "present", at(5));
    local = markEntry(local, "a", "present", at(2));
    expect(pendingPayload(local).map((m) => m.goalkeeperId)).toEqual(["a", "b"]);
  });
});

describe("estado de la sincronización (RF-28)", () => {
  const now = new Date("2026-10-21T20:00:00Z");
  it("dice cuándo se sincronizó", () => {
    expect(syncedAgo(null, now)).toBe("todavía no se sincronizó");
    expect(syncedAgo("2026-10-21T19:59:30Z", now)).toBe("hace instantes");
    expect(syncedAgo("2026-10-21T19:57:00Z", now)).toBe("hace 3 minutos");
    expect(syncedAgo("2026-10-21T19:59:00Z", now)).toBe("hace 1 minuto");
    expect(syncedAgo("2026-10-21T17:00:00Z", now)).toBe("hace 3 horas");
    expect(syncedAgo("2026-10-19T20:00:00Z", now)).toBe("hace 2 días");
  });
});
