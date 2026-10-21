"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { useUploads } from "@/components/upload-tray";
import {
  formatDuration,
  MAX_VIDEO_SECONDS,
  VIDEO_TOPIC_LABELS,
  VIDEO_TOPICS,
} from "@/lib/video-schemas";
import { readVideoDuration } from "@/lib/video-file";
import { Select } from "../../goalkeeper-fields";
import { startUploadAction } from "./actions";

type Picked = { file: File; durationSec: number };

type Props = { slug: string; goalkeeperId: string; goalkeeperName: string };

/**
 * Subir un video (spec 03, F1): grabar con la cámara o elegir de la galería, tema y, si se quiere,
 * un título. La subida sigue en segundo plano: al enviar se vuelve a la lista y el profesor puede
 * seguir trabajando mientras la bandeja de subidas muestra el avance.
 */
export function UploadForm({ slug, goalkeeperId, goalkeeperName }: Props) {
  const router = useRouter();
  const uploads = useUploads();
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onPick(file: File | undefined) {
    setPicked(null);
    setFileError(null);
    if (!file) return;
    try {
      const durationSec = await readVideoDuration(file);
      // Se detecta acá un video de 4 minutos grabado por error (spec 03, casos borde).
      if (durationSec > MAX_VIDEO_SECONDS) {
        setFileError(
          `El video dura ${formatDuration(durationSec)}: el máximo es 3 minutos. Recortalo y volvé a elegirlo.`,
        );
        return;
      }
      setPicked({ file, durationSec });
    } catch {
      setFileError(
        "No pudimos leer este video. Puede que el formato no sea compatible: probá grabarlo de nuevo con la cámara.",
      );
    }
  }

  function submit() {
    if (!picked) return setError("Elegí o grabá un video.");
    if (!topic) return setError("Elegí el tema del video.");
    setError(null);
    startTransition(async () => {
      const result = await startUploadAction(slug, goalkeeperId, {
        topic,
        title,
        durationSec: picked.durationSec,
      });
      if (!result.ok) return setError(result.message);
      uploads.begin({
        slug,
        goalkeeperId,
        videoId: result.videoId,
        uploadUrl: result.uploadUrl,
        file: picked.file,
        label:
          title.trim() ||
          `${VIDEO_TOPIC_LABELS[topic as keyof typeof VIDEO_TOPIC_LABELS]} · ${goalkeeperName}`,
      });
      router.push(`/${slug}/panel/arqueros/${goalkeeperId}/videos?subiendo=1`);
    });
  }

  return (
    <div className="space-y-5">
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">Video</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button type="button" size="lg" onClick={() => camera.current?.click()}>
            Grabar con la cámara
          </Button>
          <Button
            type="button"
            size="lg"
            variant="secondary"
            onClick={() => gallery.current?.click()}
          >
            Elegir de la galería
          </Button>
        </div>
        <input
          ref={camera}
          type="file"
          accept="video/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-label="Grabar un video con la cámara"
          onChange={(event) => void onPick(event.target.files?.[0])}
        />
        <input
          ref={gallery}
          type="file"
          accept="video/*"
          className="sr-only"
          tabIndex={-1}
          aria-label="Elegir un video de la galería"
          onChange={(event) => void onPick(event.target.files?.[0])}
        />
        {picked && (
          <Notice tone="success">
            {picked.file.name} · {formatDuration(picked.durationSec)} ·{" "}
            {(picked.file.size / (1024 * 1024)).toFixed(1)} MB
          </Notice>
        )}
        {fileError && <FormAlert>{fileError}</FormAlert>}
        <p className="text-sm text-ink-muted">Hasta 3 minutos, en calidad de hasta 1080p.</p>
      </fieldset>

      <Field label="Tema" htmlFor="topic">
        <Select
          id="topic"
          name="topic"
          onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setTopic(event.target.value)}
        >
          <option value="">Elegí un tema</option>
          {VIDEO_TOPICS.map((value) => (
            <option key={value} value={value}>
              {VIDEO_TOPIC_LABELS[value]}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Título (opcional)"
        htmlFor="title"
        hint="Si lo dejás vacío, usamos el tema y la fecha."
      >
        <Input
          id="title"
          value={title}
          maxLength={120}
          onChange={(event) => setTitle(event.target.value)}
          autoComplete="off"
        />
      </Field>

      {error && <FormAlert>{error}</FormAlert>}

      <Button size="lg" onClick={submit} disabled={pending || !picked || !topic}>
        {pending ? "Preparando…" : "Subir"}
      </Button>
    </div>
  );
}
