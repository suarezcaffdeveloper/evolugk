"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  createGroupAction,
  setGroupArchivedAction,
  updateGroupAction,
  type GroupState,
} from "./actions";

export function CreateGroupForm({ slug }: { slug: string }) {
  const [state, formAction] = useActionState<GroupState, FormData>(
    createGroupAction.bind(null, slug),
    {},
  );
  const errors = state.errors ?? {};
  return (
    <form action={formAction} noValidate className="space-y-3">
      {state.error && <FormAlert>{state.error}</FormAlert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre" htmlFor="name" error={errors.name}>
          <Input id="name" name="name" required autoComplete="off" />
        </Field>
        <Field label="Horario (opcional)" htmlFor="schedule" error={errors.schedule}>
          <Input id="schedule" name="schedule" placeholder="Lunes y miércoles 18 h" />
        </Field>
      </div>
      <SubmitButton pendingText="Creando…">Crear grupo</SubmitButton>
    </form>
  );
}

export function GroupRow({
  slug,
  group,
}: {
  slug: string;
  group: { id: string; name: string; schedule: string | null; archived: boolean };
}) {
  const [editing, setEditing] = useState(false);
  const [editState, editAction] = useActionState<GroupState, FormData>(
    async (previous, formData) => {
      const result = await updateGroupAction(slug, group.id, previous, formData);
      if (result.ok) setEditing(false);
      return result;
    },
    {},
  );
  const [archiveState, archiveAction] = useActionState<GroupState, FormData>(
    async (previous) => setGroupArchivedAction(slug, group.id, !group.archived, previous),
    {},
  );
  const errors = editState.errors ?? {};

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{group.name}</p>
          {group.schedule && <p className="text-sm text-ink-muted">{group.schedule}</p>}
        </div>
        <div className="flex gap-2">
          {!group.archived && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
              {editing ? "Cerrar" : "Editar"}
            </Button>
          )}
          <form action={archiveAction}>
            <SubmitButton
              size="sm"
              variant="secondary"
              pendingText={group.archived ? "Restaurando…" : "Archivando…"}
              aria-label={`${group.archived ? "Restaurar" : "Archivar"} ${group.name}`}
            >
              {group.archived ? "Restaurar" : "Archivar"}
            </SubmitButton>
          </form>
        </div>
      </div>
      {archiveState.error && <FormAlert>{archiveState.error}</FormAlert>}
      {editing && (
        <form action={editAction} noValidate className="space-y-3 rounded-control bg-canvas p-3">
          {editState.error && <FormAlert>{editState.error}</FormAlert>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre" htmlFor={`name-${group.id}`} error={errors.name}>
              <Input id={`name-${group.id}`} name="name" defaultValue={group.name} required />
            </Field>
            <Field label="Horario" htmlFor={`schedule-${group.id}`} error={errors.schedule}>
              <Input
                id={`schedule-${group.id}`}
                name="schedule"
                defaultValue={group.schedule ?? ""}
              />
            </Field>
          </div>
          <SubmitButton size="sm" pendingText="Guardando…">
            Guardar
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
