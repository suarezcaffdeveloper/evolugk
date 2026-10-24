"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { OfflineSupport } from "@/components/offline-support";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { FormAlert, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/cn";
import { argentinaDate, formatCalendarDate } from "@/lib/dates";
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
  type LocalSession,
} from "@/lib/attendance-offline";
import { cleanOtherAccounts, kvAllWithPrefix, kvGet, kvSet, openLocalDb } from "@/lib/offline-db";
import { ATTENDANCE_ERROR_MESSAGES, type AttendanceActionError } from "@/lib/attendance-messages";
import { openSessionAction, refreshBootstrapAction, syncSessionAction } from "./actions";
import type { AttendanceBootstrap } from "@/server/attendance";

type Bootstrap = AttendanceBootstrap & { generatedAt: string };

type Props = {
  slug: string;
  userId: string;
  initial: Bootstrap;
};

const subscribeOnline = (notify: () => void) => {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
};
const useOnline = () =>
  useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );

const SESSION_PREFIX = "session:";
const LAST_GROUP_KEY = "evolugk-asistencia-grupo";

/**
 * Toma de lista (spec 05, F1 y F2). Cada toque se guarda primero en el celular, al instante, y se
 * sincroniza con el servidor en segundo plano: con señal buena es inmediato y sin señal queda
 * pendiente hasta que vuelva (RF-26). El grupo y sus miembros se precargan al abrir esta pantalla
 * con conexión (RF-27).
 */
export function AttendanceApp({ slug, userId, initial }: Props) {
  const online = useOnline();
  const [db, setDb] = useState<IDBDatabase | null>(null);
  const [bootstrap, setBootstrap] = useState<Bootstrap>(initial);
  const [sessions, setSessions] = useState<Record<string, LocalSession>>({});
  const [groupId, setGroupId] = useState<string>(initial.groups[0]?.id ?? "");
  const [date, setDate] = useState(() => argentinaDate(new Date()));
  const [today] = useState(() => argentinaDate(new Date()));
  const [now, setNow] = useState(() => new Date());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [guestQuery, setGuestQuery] = useState("");
  const [guestsOpen, setGuestsOpen] = useState(false);
  const syncingRef = useRef(false);
  const sessionsRef = useRef<Record<string, LocalSession>>({});

  const key = groupId ? sessionKey(groupId, date) : "";
  const current = key ? sessions[key] : undefined;

  // Mantiene una copia del estado para los temporizadores sin leer refs durante el render.
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  // Reloj para "sincronizada hace X".
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const persist = useCallback(
    async (session: LocalSession) => {
      const k = sessionKey(session.groupId, session.date);
      setSessions((all) => ({ ...all, [k]: session }));
      sessionsRef.current = { ...sessionsRef.current, [k]: session };
      if (db) await kvSet(db, `${SESSION_PREFIX}${k}`, session);
    },
    [db],
  );

  // Apertura de la base local, listas guardadas y limpieza de cuentas anteriores.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const opened = await openLocalDb(userId);
        const stored = await kvAllWithPrefix<LocalSession>(opened, SESSION_PREFIX);
        const savedBootstrap = await kvGet<Bootstrap>(opened, "bootstrap");
        if (cancelled) return;
        setDb(opened);
        setSessions(Object.fromEntries(stored.map((s) => [sessionKey(s.groupId, s.date), s])));
        // Se usa la precarga más nueva: la de esta página puede venir de una copia vieja sin conexión.
        if (savedBootstrap && savedBootstrap.generatedAt > initial.generatedAt) {
          setBootstrap(savedBootstrap);
        } else {
          await kvSet(opened, "bootstrap", initial);
        }
        const last = localStorage.getItem(LAST_GROUP_KEY);
        const groups =
          (savedBootstrap?.generatedAt ?? "") > initial.generatedAt
            ? savedBootstrap!.groups
            : initial.groups;
        if (last && groups.some((g) => g.id === last)) setGroupId(last);
        await cleanOtherAccounts(userId, async (other) => {
          const all = await kvAllWithPrefix<LocalSession>(other, SESSION_PREFIX);
          return all.some(hasPending);
        });
      } catch {
        if (!cancelled) {
          setLoadError(
            "Este navegador no permite guardar datos en el celular: la lista se guarda solo con conexión.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, initial]);

  // Precarga: con conexión se refrescan los grupos y arqueros (RF-27).
  const [refreshTick, setRefreshTick] = useState(0);
  useEffect(() => {
    if (!db || !online) return;
    let cancelled = false;
    (async () => {
      try {
        const fresh = await refreshBootstrapAction(slug);
        if (cancelled) return;
        if (!fresh.ok) {
          if (fresh.error === "session_expired")
            setBanner(ATTENDANCE_ERROR_MESSAGES.session_expired);
          return;
        }
        const next: Bootstrap = {
          groups: fresh.groups,
          goalkeepers: fresh.goalkeepers,
          generatedAt: fresh.generatedAt,
        };
        setBootstrap(next);
        await kvSet(db, "bootstrap", next);
      } catch {
        // Sin señal real aunque el navegador diga "en línea": se sigue con lo guardado.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, online, slug, refreshTick]);

  // ───────────────────────────── sincronización ─────────────────────────────

  const syncSession = useCallback(
    async (target: LocalSession) => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      setSyncing(true);
      try {
        const payload = pendingPayload(target);
        const result = await syncSessionAction(slug, {
          groupId: target.groupId,
          date: target.date,
          marks: payload,
        });
        if (!result.ok) {
          if (result.error === "suspended") {
            // La sesión se suspendió en otro dispositivo: se muestra su estado y se descartan las marcas.
            const refreshed = await openSessionAction(slug, target.groupId, target.date);
            if (refreshed.ok) {
              await persist({
                ...mergeServer({ ...target, pending: {} }, refreshed.state),
              });
            }
            setBanner(ATTENDANCE_ERROR_MESSAGES.suspended);
          } else {
            setBanner(ATTENDANCE_ERROR_MESSAGES[result.error as AttendanceActionError]);
          }
          return;
        }
        // Se lee lo más reciente del estado local: el profesor pudo marcar mientras se sincronizaba.
        const k = sessionKey(target.groupId, target.date);
        const latest = sessionsRef.current[k] ?? target;
        await persist(mergeServer(latest, result.state, acknowledgedOf(payload)));
        setBanner(null);
      } catch {
        // Sin conexión o servidor ocupado: las marcas siguen pendientes y se reintentan solas.
      } finally {
        syncingRef.current = false;
        setSyncing(false);
      }
    },
    [slug, persist],
  );

  const pendingSessions = useMemo(() => Object.values(sessions).filter(hasPending), [sessions]);

  // Con conexión, lo pendiente se envía solo: al marcar (con una pausa corta para juntar toques),
  // al volver la señal y cada tanto por si el primer intento falló.
  const pendingSignature = pendingSessions
    .map(
      (s) =>
        `${sessionKey(s.groupId, s.date)}:${Object.keys(s.pending).length}:${Object.values(
          s.pending,
        )
          .map((p) => p.markedAt)
          .join(",")}`,
    )
    .join("|");
  useEffect(() => {
    if (!online || !db || pendingSessions.length === 0) return;
    const first = pendingSessions[0];
    const timer = setTimeout(() => void syncSession(first), 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, db, pendingSignature, syncing]);
  useEffect(() => {
    if (!online || !db) return;
    const timer = setInterval(() => {
      const waiting = Object.values(sessionsRef.current).find(hasPending);
      if (waiting) void syncSession(waiting);
    }, 15_000);
    return () => clearInterval(timer);
  }, [online, db, syncSession]);

  // ───────────────────────────── abrir la lista elegida ─────────────────────────────

  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  useEffect(() => {
    if (!db || !groupId) return;
    const group = bootstrap.groups.find((g) => g.id === groupId);
    if (!group) return;
    let cancelled = false;
    (async () => {
      setOpening(true);
      setOpenError(null);
      try {
        const existing = sessionsRef.current[key];
        if (online) {
          // Con conexión se abre (o se crea) la sesión en el servidor: así se une con la existente (RF-02)
          // y se ven las marcas de otros dispositivos. Si hay marcas propias pendientes, se conservan.
          const result = await openSessionAction(slug, groupId, date);
          if (cancelled) return;
          if (result.ok) {
            await persist(mergeServer(existing ?? newLocalSession(group, date), result.state));
            return;
          }
          if (result.error === "session_expired")
            setBanner(ATTENDANCE_ERROR_MESSAGES.session_expired);
          else if (!existing) setOpenError(ATTENDANCE_ERROR_MESSAGES[result.error]);
          if (existing) return;
          return;
        }
        // Sin conexión: se usa la lista guardada. Una nueva solo para hoy, con el grupo precargado.
        if (existing) return;
        if (date !== today) {
          setOpenError(
            "Sin conexión solo se puede tomar la lista de hoy. Las listas de otras fechas necesitan conexión.",
          );
          return;
        }
        await persist(newLocalSession(group, date));
      } catch {
        // Falló la red aunque el navegador diga que hay conexión: se trabaja con la copia local.
        if (!cancelled && !sessionsRef.current[key]) {
          if (date === today) await persist(newLocalSession(group, date));
          else setOpenError("No pudimos abrir esa lista. Revisá tu conexión e intentá de nuevo.");
        }
      } finally {
        if (!cancelled) setOpening(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `key` resume groupId y date.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, key, online, bootstrap.groups.length]);

  // ───────────────────────────── acciones de la pantalla ─────────────────────────────

  const update = (change: (session: LocalSession) => LocalSession) => {
    if (!current) return;
    void persist(change(current));
  };

  const goalkeepersOutside = useMemo(() => {
    if (!current) return [];
    const inList = new Set(current.entries.map((e) => e.goalkeeperId));
    const q = guestQuery.trim().toLowerCase();
    return bootstrap.goalkeepers
      .filter((g) => !inList.has(g.id))
      .filter((g) => !q || `${g.firstName} ${g.lastName}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [bootstrap.goalkeepers, current, guestQuery]);

  const counts = current ? countByStatus(current) : null;
  const suspended = current?.status === "suspended";

  return (
    <div className="space-y-4">
      <OfflineSupport onReady={() => setOfflineReady(true)} />

      <div className="flex flex-wrap items-center gap-2" aria-live="polite">
        <Chip tone={online ? "success" : "warning"}>
          {online ? "Con conexión" : "Sin conexión"}
        </Chip>
        {offlineReady && <Chip>Lista para usar sin conexión</Chip>}
        {syncing && <Chip>Sincronizando…</Chip>}
      </div>

      {loadError && <Notice tone="warning">{loadError}</Notice>}
      {banner && (
        <FormAlert>
          {banner}{" "}
          {banner === ATTENDANCE_ERROR_MESSAGES.session_expired && (
            <a href={`/${slug}/login`} className="font-bold underline">
              Ingresar
            </a>
          )}
        </FormAlert>
      )}

      {pendingSessions.length > 0 && (
        <Card className="space-y-2 border-warning/50 bg-warning/10 p-4">
          <h2 className="font-display text-base font-bold">Pendientes de sincronizar</h2>
          <ul className="space-y-1.5">
            {pendingSessions.map((session) => (
              <li
                key={sessionKey(session.groupId, session.date)}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span>
                  <strong>{session.groupName}</strong> · {formatCalendarDate(session.date)} ·{" "}
                  {Object.keys(session.pending).length}{" "}
                  {Object.keys(session.pending).length === 1 ? "marca" : "marcas"}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!online || syncing}
                  onClick={() => void syncSession(session)}
                >
                  Sincronizar
                </Button>
              </li>
            ))}
          </ul>
          {!online && (
            <p className="text-sm text-ink-muted">
              Se guardaron en este celular y se envían solas cuando vuelva la conexión.
            </p>
          )}
        </Card>
      )}

      {bootstrap.groups.length === 0 ? (
        <Card className="space-y-1 text-center">
          <p className="font-display text-lg font-bold">Todavía no hay grupos</p>
          <p className="text-ink-muted">
            La administración tiene que crear al menos un grupo para poder tomar lista.
          </p>
        </Card>
      ) : (
        <>
          <Card className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="grupo" className="mb-1.5 block text-sm font-semibold">
                Grupo
              </label>
              <select
                id="grupo"
                value={groupId}
                onChange={(event) => {
                  setGroupId(event.target.value);
                  localStorage.setItem(LAST_GROUP_KEY, event.target.value);
                }}
                className="h-11 w-full appearance-auto rounded-control border border-line bg-surface px-3 text-base focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
              >
                {bootstrap.groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="fecha" className="mb-1.5 block text-sm font-semibold">
                Fecha
              </label>
              <Input
                id="fecha"
                type="date"
                value={date}
                max={today}
                onChange={(event) => event.target.value && setDate(event.target.value)}
              />
            </div>
          </Card>

          {openError && <FormAlert>{openError}</FormAlert>}
          {opening && !current && (
            <div className="h-40 animate-pulse rounded-card bg-line" aria-busy="true" />
          )}

          {current && counts && (
            <>
              <Card className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-display text-lg font-bold">{current.groupName}</h2>
                    <p className="text-sm text-ink-muted">{formatCalendarDate(current.date)}</p>
                  </div>
                  <p className="text-sm font-semibold" data-testid="counts">
                    {counts.present} presentes · {counts.absent} ausentes · {counts.excused}{" "}
                    justificadas
                    {counts.unmarked > 0 && ` · ${counts.unmarked} sin marcar`}
                  </p>
                </div>

                {suspended && (
                  <Notice tone="warning">
                    Sesión suspendida: {current.suspensionReason}. No cuenta para nadie y no admite
                    marcas.
                  </Notice>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    disabled={suspended || counts.unmarked === 0}
                    onClick={() => update((s) => markAllPresent(s, new Date()))}
                  >
                    Todos presentes
                  </Button>
                  <Button variant="ghost" onClick={() => setGuestsOpen((open) => !open)}>
                    Agregar invitado
                  </Button>
                  {current.sessionId && online && (
                    <Link
                      href={`/${slug}/panel/asistencia/sesion/${current.sessionId}`}
                      className="inline-flex h-11 items-center rounded-control px-4 font-semibold text-ink-muted hover:text-ink"
                    >
                      Detalle y cambios
                    </Link>
                  )}
                </div>

                {guestsOpen && !suspended && (
                  <div className="space-y-2 rounded-control border border-line bg-canvas p-3">
                    <label htmlFor="invitado" className="block text-sm font-semibold">
                      Buscar un arquero de otro grupo
                    </label>
                    <Input
                      id="invitado"
                      type="search"
                      value={guestQuery}
                      onChange={(event) => setGuestQuery(event.target.value)}
                      autoComplete="off"
                    />
                    <ul className="space-y-1">
                      {goalkeepersOutside.map((g) => (
                        <li key={g.id}>
                          <button
                            type="button"
                            onClick={() => {
                              update((s) => addGuest(s, g));
                              setGuestQuery("");
                              setGuestsOpen(false);
                            }}
                            className="flex min-h-11 w-full items-center justify-between rounded-control border border-line bg-surface px-3 text-left hover:bg-accent-soft"
                          >
                            <span className="font-semibold">
                              {g.lastName}, {g.firstName}
                            </span>
                            <span className="text-sm text-ink-muted">Sumar</span>
                          </button>
                        </li>
                      ))}
                      {goalkeepersOutside.length === 0 && (
                        <li className="text-sm text-ink-muted">No hay arqueros para sumar.</li>
                      )}
                    </ul>
                  </div>
                )}
              </Card>

              {current.entries.length === 0 ? (
                <Card className="text-center text-ink-muted">
                  Este grupo no tiene arqueros activos. Podés sumar invitados.
                </Card>
              ) : (
                <ul className="space-y-2">
                  {current.entries.map((entry) => (
                    <EntryRow
                      key={entry.goalkeeperId}
                      entry={entry}
                      disabled={suspended}
                      onMark={(status, reason) =>
                        update((s) => markEntry(s, entry.goalkeeperId, status, new Date(), reason))
                      }
                    />
                  ))}
                </ul>
              )}

              <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-2 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur">
                <p className="text-sm text-ink-muted" data-testid="sync-status">
                  {hasPending(current)
                    ? `Pendiente de sincronizar (${Object.keys(current.pending).length})`
                    : `Sincronizada ${syncedAgo(current.syncedAt, now)}`}
                </p>
                <Button
                  disabled={
                    !online || syncing || (!hasPending(current) && Boolean(current.sessionId))
                  }
                  onClick={() => void syncSession(current)}
                >
                  {syncing ? "Guardando…" : "Guardar"}
                </Button>
              </div>
            </>
          )}
        </>
      )}

      <p className="text-sm text-ink-muted">
        <button
          type="button"
          className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
          onClick={() => setRefreshTick((n) => n + 1)}
          disabled={!online}
        >
          Actualizar grupos y arqueros
        </button>
        {" · "}Se precargan al abrir esta pantalla con conexión.
      </p>
    </div>
  );
}

const OPTIONS = [
  { status: "present", label: "Presente", on: "border-success bg-success text-on-success" },
  { status: "absent", label: "Ausente", on: "border-danger bg-danger text-on-danger" },
  { status: "excused", label: "Justificada", on: "border-warning bg-warning text-on-warning" },
] as const;

function EntryRow({
  entry,
  disabled,
  onMark,
}: {
  entry: LocalSession["entries"][number];
  disabled: boolean;
  onMark: (status: "present" | "absent" | "excused", reason: string | null) => void;
}) {
  const unmarked = entry.status === "unmarked";
  const [reason, setReason] = useState(entry.reason ?? "");
  return (
    <li
      className={cn(
        "space-y-2 rounded-card border bg-surface p-3 shadow-card",
        unmarked ? "border-warning/60 border-l-4" : "border-line",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">
          {entry.lastName}, {entry.firstName}
        </p>
        <span className="flex gap-1.5">
          {entry.isGuest && <Chip>Invitado</Chip>}
          {unmarked && <Chip tone="warning">Sin marcar</Chip>}
        </span>
      </div>
      <div
        role="group"
        aria-label={`Asistencia de ${entry.firstName} ${entry.lastName}`}
        className="grid grid-cols-3 gap-1.5"
      >
        {OPTIONS.map((option) => (
          <button
            key={option.status}
            type="button"
            disabled={disabled}
            aria-pressed={entry.status === option.status}
            onClick={() => onMark(option.status, option.status === "excused" ? reason : null)}
            className={cn(
              "h-12 rounded-control border text-sm font-bold transition-colors disabled:opacity-50",
              entry.status === option.status
                ? option.on
                : "border-line bg-canvas hover:bg-accent-soft",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      {entry.status === "excused" && (
        <div className="space-y-1">
          <label htmlFor={`motivo-${entry.goalkeeperId}`} className="block text-sm font-semibold">
            Motivo (solo lo ve el equipo)
          </label>
          <Input
            id={`motivo-${entry.goalkeeperId}`}
            value={reason}
            maxLength={200}
            disabled={disabled}
            onChange={(event) => setReason(event.target.value)}
            onBlur={() => {
              if ((entry.reason ?? "") !== reason.trim()) onMark("excused", reason);
            }}
            autoComplete="off"
          />
        </div>
      )}
    </li>
  );
}
