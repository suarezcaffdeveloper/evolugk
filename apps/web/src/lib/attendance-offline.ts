import type { EntryStatus, SessionStatus } from "./attendance";

/**
 * Modelo local de una lista de asistencia (spec 05, RF-26 a RF-29). Es la fuente de verdad en el
 * celular: cada toque se aplica acá primero, al instante, y las marcas pendientes se sincronizan
 * con el servidor cuando hay conexión. Son funciones puras: no tocan el navegador ni la red.
 */

export type LocalEntry = {
  goalkeeperId: string;
  firstName: string;
  lastName: string;
  status: EntryStatus;
  reason: string | null;
  isGuest: boolean;
  /** Hora de la marca vigente en el servidor (ISO), si la hay. */
  markedAt: string | null;
};

/** Una marca hecha en este celular que el servidor todavía no confirmó. */
export type PendingMark = {
  status: EntryStatus;
  reason: string | null;
  /** Hora de la marca en este celular (ISO): desempata contra otros dispositivos (RF-29). */
  markedAt: string;
  guest: boolean;
};

export type LocalSession = {
  /** Null mientras la sesión solo existe en este celular (creada sin conexión). */
  sessionId: string | null;
  groupId: string;
  groupName: string;
  date: string;
  status: SessionStatus;
  suspensionReason: string | null;
  entries: LocalEntry[];
  pending: Record<string, PendingMark>;
  /** Última vez que se sincronizó con el servidor (ISO), o null si nunca. */
  syncedAt: string | null;
};

export const sessionKey = (groupId: string, date: string) => `${groupId}:${date}`;

const byName = (a: LocalEntry, b: LocalEntry) =>
  Number(a.isGuest) - Number(b.isGuest) ||
  a.lastName.localeCompare(b.lastName, "es") ||
  a.firstName.localeCompare(b.firstName, "es");

export type Person = { id: string; firstName: string; lastName: string };

/** Lista nueva armada con los miembros del grupo que se precargaron (RF-27), todos sin marcar. */
export function newLocalSession(
  group: { id: string; name: string; members: Person[] },
  date: string,
): LocalSession {
  return {
    sessionId: null,
    groupId: group.id,
    groupName: group.name,
    date,
    status: "open",
    suspensionReason: null,
    entries: group.members
      .map((m) => ({
        goalkeeperId: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
        status: "unmarked" as const,
        reason: null,
        isGuest: false,
        markedAt: null,
      }))
      .sort(byName),
    pending: {},
    syncedAt: null,
  };
}

/** Marca a un arquero (un toque, RF-11). Una justificada lleva su motivo; el resto no. */
export function markEntry(
  session: LocalSession,
  goalkeeperId: string,
  status: Exclude<EntryStatus, "unmarked">,
  now: Date,
  reason: string | null = null,
): LocalSession {
  if (session.status === "suspended") return session; // RN-02
  const cleanReason = status === "excused" ? reason?.trim() || null : null;
  const markedAt = now.toISOString();
  return {
    ...session,
    entries: session.entries.map((e) =>
      e.goalkeeperId === goalkeeperId ? { ...e, status, reason: cleanReason, markedAt } : e,
    ),
    pending: {
      ...session.pending,
      [goalkeeperId]: {
        status,
        reason: cleanReason,
        markedAt,
        guest: session.entries.find((e) => e.goalkeeperId === goalkeeperId)?.isGuest ?? false,
      },
    },
  };
}

/** "Todos presentes" marca a los que están sin marcar; no pisa lo ya marcado (RF-07). */
export function markAllPresent(session: LocalSession, now: Date): LocalSession {
  return session.entries
    .filter((e) => e.status === "unmarked")
    .reduce(
      (acc, e, i) => markEntry(acc, e.goalkeeperId, "present", new Date(now.getTime() + i)),
      session,
    );
}

/** Suma un invitado a la lista de hoy (RF-09 y RN-05): sin marcar, solo en esta sesión. */
export function addGuest(session: LocalSession, person: Person): LocalSession {
  if (session.entries.some((e) => e.goalkeeperId === person.id)) return session;
  return {
    ...session,
    entries: [
      ...session.entries,
      {
        goalkeeperId: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        status: "unmarked" as const,
        reason: null,
        isGuest: true,
        markedAt: null,
      },
    ].sort(byName),
    // El invitado se avisa al servidor aunque todavía no esté marcado, para que figure en la sesión.
    pending: {
      ...session.pending,
      [person.id]: {
        status: "unmarked",
        reason: null,
        markedAt: new Date(0).toISOString(),
        guest: true,
      },
    },
  };
}

export type ServerEntry = {
  goalkeeperId: string;
  firstName: string;
  lastName: string;
  status: EntryStatus;
  reason: string | null;
  isGuest: boolean;
  markedAt: string | null;
};

export type ServerSession = {
  sessionId: string;
  groupId: string;
  groupName: string;
  date: string;
  status: SessionStatus;
  suspensionReason: string | null;
  entries: ServerEntry[];
};

/**
 * Combina el estado del servidor con lo que todavía está pendiente en este celular. El servidor
 * manda, salvo que una marca local sea más nueva que la suya (último cambio por hora de marca,
 * RF-29): esa se conserva como pendiente y se vuelve a enviar. Las marcas confirmadas (`acknowledged`)
 * se sacan de la cola.
 */
export function mergeServer(
  local: LocalSession,
  server: ServerSession,
  acknowledged: Record<string, string> = {},
  now: Date = new Date(),
): LocalSession {
  const pending: Record<string, PendingMark> = {};
  for (const [goalkeeperId, mark] of Object.entries(local.pending)) {
    // Ya enviada y confirmada tal cual: sale de la cola.
    if (acknowledged[goalkeeperId] === mark.markedAt) continue;
    const serverEntry = server.entries.find((e) => e.goalkeeperId === goalkeeperId);
    const newerLocally =
      mark.status !== "unmarked" &&
      (!serverEntry?.markedAt ||
        new Date(mark.markedAt).getTime() > new Date(serverEntry.markedAt).getTime());
    // Un invitado que el servidor todavía no conoce sigue pendiente aunque no tenga marca.
    const unknownGuest = mark.guest && !serverEntry;
    if (newerLocally || unknownGuest) pending[goalkeeperId] = mark;
  }

  const entries: LocalEntry[] = server.entries.map((e) => {
    const mark = pending[e.goalkeeperId];
    return mark && mark.status !== "unmarked"
      ? { ...e, status: mark.status, reason: mark.reason, markedAt: mark.markedAt }
      : e;
  });
  // Invitados locales que el servidor todavía no tiene.
  for (const e of local.entries) {
    if (
      e.isGuest &&
      !entries.some((x) => x.goalkeeperId === e.goalkeeperId) &&
      pending[e.goalkeeperId]
    ) {
      entries.push(e);
    }
  }

  return {
    sessionId: server.sessionId,
    groupId: server.groupId,
    groupName: server.groupName,
    date: server.date,
    status: server.status,
    suspensionReason: server.suspensionReason,
    entries: entries.sort(byName),
    pending,
    syncedAt: now.toISOString(),
  };
}

export type MarkPayload = {
  goalkeeperId: string;
  status: EntryStatus;
  reason: string | null;
  markedAt: string;
  guest: boolean;
};

/** Lo que se envía al servidor al sincronizar. */
export function pendingPayload(session: LocalSession): MarkPayload[] {
  return Object.entries(session.pending)
    .map(([goalkeeperId, mark]) => ({ goalkeeperId, ...mark }))
    .sort((a, b) => a.markedAt.localeCompare(b.markedAt));
}

export const hasPending = (session: LocalSession) => Object.keys(session.pending).length > 0;

/** Lo ya enviado, para sacarlo de la cola cuando el servidor lo confirma. */
export function acknowledgedOf(payload: MarkPayload[]): Record<string, string> {
  return Object.fromEntries(payload.map((m) => [m.goalkeeperId, m.markedAt]));
}

export function countByStatus(session: LocalSession) {
  const count = (status: EntryStatus) => session.entries.filter((e) => e.status === status).length;
  return {
    present: count("present"),
    absent: count("absent"),
    excused: count("excused"),
    unmarked: count("unmarked"),
    total: session.entries.length,
  };
}

/** "hace 3 minutos" para el estado de sincronización (RF-28). */
export function syncedAgo(syncedAt: string | null, now: Date): string {
  if (!syncedAt) return "todavía no se sincronizó";
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(syncedAt).getTime()) / 1000));
  if (seconds < 45) return "hace instantes";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} ${hours === 1 ? "hora" : "horas"}`;
  const days = Math.round(hours / 24);
  return `hace ${days} ${days === 1 ? "día" : "días"}`;
}
