"use client";

import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { describedBy, Field, FormAlert, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { useUploads } from "@/components/upload-tray";
import {
  formatDuration,
  MAX_VIDEO_SECONDS,
  VIDEO_TOPIC_LABELS,
  VIDEO_TOPICS,
} from "@/lib/video-schemas";
import { readVideoDuration } from "@/lib/video-file";
import { Select } from "../../goalkeeper-fields";
import {
  deleteAllVideosAction,
  deleteVideoAction,
  publishVideoAction,
  restartUploadAction,
  setEvaluationVideosAction,
  unpublishVideoAction,
  updateVideoAction,
  type VideoActionState,
} from "./actions";

type Ids = { slug: string; goalkeeperId: string; videoId: string };

export function PublishControls({ published, ...ids }: Ids & { published: boolean }) {
  const [state, formAction] = useActionState<VideoActionState, FormData>(
    (published ? unpublishVideoAction : publishVideoAction).bind(
      null,
      ids.slug,
      ids.goalkeeperId,
      ids.videoId,
    ),
    {},
  );
  return (
    <form action={formAction} className="space-y-2">
      <SubmitButton
        variant={published ? "secondary" : "primary"}
        pendingText={published ? "Despublicando…" : "Publicando…"}
      >
        {published ? "Despublicar" : "Publicar"}
      </SubmitButton>
      <p className="text-sm text-ink-muted">
        {published
          ? "Vuelve a borrador y la familia deja de verlo. Si ya se mandó el mail, no se retira."
          : "La familia lo va a ver en el portal y le avisamos por mail (agrupado, si publicás varios seguidos)."}
      </p>
      {state.error && <FormAlert>{state.error}</FormAlert>}
    </form>
  );
}

export function EditVideoForm({ title, topic, ...ids }: Ids & { title: string; topic: string }) {
  const [state, formAction] = useActionState<VideoActionState, FormData>(
    updateVideoAction.bind(null, ids.slug, ids.goalkeeperId, ids.videoId),
    {},
  );
  const errors = state.errors ?? {};
  return (
    <form action={formAction} noValidate className="space-y-3">
      <Field label="Título" htmlFor="video-title" error={errors.title}>
        <Input
          id="video-title"
          name="title"
          defaultValue={title}
          maxLength={120}
          required
          {...describedBy("video-title", { error: errors.title })}
        />
      </Field>
      <Field label="Tema" htmlFor="video-topic" error={errors.topic}>
        <Select id="video-topic" name="topic" defaultValue={topic}>
          {VIDEO_TOPICS.map((value) => (
            <option key={value} value={value}>
              {VIDEO_TOPIC_LABELS[value]}
            </option>
          ))}
        </Select>
      </Field>
      {state.error && <FormAlert>{state.error}</FormAlert>}
      <SubmitButton variant="secondary" pendingText="Guardando…">
        Guardar cambios
      </SubmitButton>
      {state.ok && <Notice tone="success">Cambios guardados.</Notice>}
    </form>
  );
}

/**
 * Borrar es definitivo: lo hace la administración (RF-26). Quien subió un video con error puede
 * descartarlo (RN-03). Pide una segunda confirmación.
 */
export function DeleteVideoButton({ discard, ...ids }: Ids & { discard: boolean }) {
  const [asking, setAsking] = useState(false);
  const [state, formAction] = useActionState<VideoActionState, FormData>(
    deleteVideoAction.bind(null, ids.slug, ids.goalkeeperId, ids.videoId, discard),
    {},
  );
  const verb = discard ? "Descartar" : "Borrar";
  if (!asking) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setAsking(true)}>
        {verb} video
      </Button>
    );
  }
  return (
    <form action={formAction} className="space-y-2">
      <p className="text-sm font-semibold">
        {discard
          ? "¿Descartar este video?"
          : "¿Borrar este video? No se puede recuperar: se elimina también del proveedor y se liberan sus minutos."}
      </p>
      <div className="flex flex-wrap gap-2">
        <SubmitButton size="sm" pendingText="Borrando…">
          Sí, {verb.toLowerCase()}
        </SubmitButton>
        <Button type="button" size="sm" variant="ghost" onClick={() => setAsking(false)}>
          Cancelar
        </Button>
      </div>
      {state.error && <FormAlert>{state.error}</FormAlert>}
    </form>
  );
}

/** Volver a subir un video con error o interrumpido: se elige de nuevo el archivo (RN-03). */
export function RestartUpload({ ...ids }: Ids) {
  const uploads = useUploads();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const duration = await readVideoDuration(file);
      if (duration > MAX_VIDEO_SECONDS) {
        setError(`El video dura ${formatDuration(duration)}: el máximo es 3 minutos.`);
        return;
      }
      const result = await restartUploadAction(ids.slug, ids.goalkeeperId, ids.videoId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      uploads.begin({
        ...ids,
        uploadUrl: result.uploadUrl,
        file,
        label: "Video reenviado",
      });
    } catch {
      setError("No pudimos leer este video. Puede que el formato no sea compatible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? "Preparando…" : "Volver a subir"}
      </Button>
      <input
        ref={input}
        type="file"
        accept="video/*"
        className="sr-only"
        tabIndex={-1}
        aria-label="Elegir el video para volver a subirlo"
        onChange={(event) => void onPick(event.target.files?.[0])}
      />
      {error && <FormAlert>{error}</FormAlert>}
    </div>
  );
}

/**
 * Cuando la familia retiró el consentimiento los videos se ocultan al instante (RF-32), y la
 * administración decide si además se borran. Es definitivo, así que pide confirmación.
 */
export function DeleteAllVideosButton({
  slug,
  goalkeeperId,
  count,
}: {
  slug: string;
  goalkeeperId: string;
  count: number;
}) {
  const [asking, setAsking] = useState(false);
  const [state, formAction] = useActionState<VideoActionState, FormData>(
    deleteAllVideosAction.bind(null, slug, goalkeeperId),
    {},
  );
  if (state.ok) return <Notice tone="success">Los videos se borraron.</Notice>;
  if (!asking) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setAsking(true)}>
        Borrar los {count} videos
      </Button>
    );
  }
  return (
    <form action={formAction} className="space-y-2">
      <p className="text-sm font-semibold">
        ¿Borrar los {count} videos de este arquero? No se pueden recuperar: se eliminan también del
        proveedor y se liberan sus minutos.
      </p>
      <div className="flex flex-wrap gap-2">
        <SubmitButton size="sm" pendingText="Borrando…">
          Sí, borrar todos
        </SubmitButton>
        <Button type="button" size="sm" variant="ghost" onClick={() => setAsking(false)}>
          Cancelar
        </Button>
      </div>
      {state.error && <FormAlert>{state.error}</FormAlert>}
    </form>
  );
}

/** Videos que respaldan una evaluación (spec 03, F3): se eligen entre los del mismo arquero. */
export function EvaluationVideosForm({
  slug,
  goalkeeperId,
  evaluationId,
  options,
  selected,
}: {
  slug: string;
  goalkeeperId: string;
  evaluationId: string;
  options: { id: string; title: string; subtitle: string }[];
  selected: string[];
}) {
  const [state, formAction] = useActionState<VideoActionState, FormData>(
    setEvaluationVideosAction.bind(null, slug, goalkeeperId, evaluationId),
    {},
  );
  if (options.length === 0) {
    return (
      <p className="text-ink-muted">Este arquero todavía no tiene videos listos para adjuntar.</p>
    );
  }
  return (
    <form action={formAction} className="space-y-3">
      <ul className="space-y-2">
        {options.map((video) => (
          <li key={video.id}>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-control border border-line bg-surface px-3 py-2 has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
              <input
                type="checkbox"
                name="videoIds"
                value={video.id}
                defaultChecked={selected.includes(video.id)}
                className="mt-1 h-5 w-5 accent-[var(--accent)]"
              />
              <span>
                <span className="block font-semibold">{video.title}</span>
                <span className="block text-sm text-ink-muted">{video.subtitle}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {state.error && <FormAlert>{state.error}</FormAlert>}
      <SubmitButton variant="secondary" pendingText="Guardando…">
        Guardar videos adjuntos
      </SubmitButton>
      {state.ok && <Notice tone="success">Videos adjuntos guardados.</Notice>}
    </form>
  );
}
