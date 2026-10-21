import { resolveAccent } from "@/lib/color";
import type { EmailMessage } from "./transport";

/** Escapa texto que se inserta en HTML. Los nombres de escuela los carga una persona: nunca se confía en ellos. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const DEFAULT_ACCENT = "#C2410C";
const TIME_ZONE = "America/Argentina/Buenos_Aires";

export const ROLE_LABELS = { school_admin: "Administración", coach: "Profesor" } as const;
export type InvitableRole = keyof typeof ROLE_LABELS;

/** "26 de octubre de 2026", en hora de Argentina. */
export function formatLongDate(date: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "long",
    timeZone: TIME_ZONE,
  }).format(date);
}

type Layout = {
  schoolName: string;
  accentColor?: string | null;
  heading: string;
  paragraphs: string[];
  buttonLabel: string;
  link: string;
  footnote: string;
};

/** Envuelve el contenido en un HTML simple y robusto para clientes de mail (estilos en línea). */
function renderLayout({
  schoolName,
  accentColor,
  heading,
  paragraphs,
  buttonLabel,
  link,
  footnote,
}: Layout) {
  let accent = DEFAULT_ACCENT;
  let onAccent = "#FFFFFF";
  try {
    const resolved = resolveAccent(accentColor ?? DEFAULT_ACCENT).light;
    accent = resolved.accent;
    onAccent = resolved.onAccent;
  } catch {
    // Color inválido: se usa el del producto.
  }

  const body = paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#1F1A17;">${p}</p>`)
    .join("");

  return `<!doctype html>
<html lang="es-AR">
<body style="margin:0;padding:0;background:#FBF7F2;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF7F2;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border:1px solid #E8DFD3;border-radius:12px;">
        <tr><td style="padding:24px 28px 8px;">
          <p style="margin:0;font-size:14px;font-weight:bold;color:#6B5F55;">${escapeHtml(schoolName)}</p>
          <h1 style="margin:8px 0 16px;font-size:24px;line-height:1.25;color:#1F1A17;">${escapeHtml(heading)}</h1>
        </td></tr>
        <tr><td style="padding:0 28px;">${body}</td></tr>
        <tr><td style="padding:8px 28px 24px;">
          <a href="${escapeHtml(link)}" style="display:inline-block;background:${accent};color:${onAccent};text-decoration:none;font-weight:bold;font-size:16px;padding:12px 24px;border-radius:10px;">${escapeHtml(buttonLabel)}</a>
        </td></tr>
        <tr><td style="padding:0 28px 24px;">
          <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#6B5F55;">Si el botón no funciona, copiá y pegá este link en tu navegador:</p>
          <p style="margin:0;font-size:13px;line-height:1.5;word-break:break-all;color:#6B5F55;">${escapeHtml(link)}</p>
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #E8DFD3;">
          <p style="margin:0;font-size:12px;line-height:1.5;color:#6B5F55;">${footnote}</p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:12px;color:#6B5F55;">Con tecnología de EvoluGK</p>
    </td></tr>
  </table>
</body>
</html>`;
}

export function invitationEmail(input: {
  to: string;
  schoolName: string;
  role: InvitableRole;
  link: string;
  expiresAt: Date;
  accentColor?: string | null;
}): EmailMessage {
  const role = ROLE_LABELS[input.role];
  const expires = formatLongDate(input.expiresAt);
  const school = escapeHtml(input.schoolName);

  return {
    to: input.to,
    subject: `Te invitaron a ${input.schoolName} en EvoluGK`,
    html: renderLayout({
      schoolName: input.schoolName,
      accentColor: input.accentColor,
      heading: "Te invitaron a sumarte al equipo",
      paragraphs: [
        `Te invitaron a ${school} en EvoluGK, con el rol de <strong>${escapeHtml(role)}</strong>.`,
        "Para empezar, elegí tu contraseña y completá tu nombre.",
        `El link vence el ${escapeHtml(expires)}.`,
      ],
      buttonLabel: "Aceptar la invitación",
      link: input.link,
      footnote:
        "Si no esperabas este mail, podés ignorarlo: no se crea ninguna cuenta hasta que aceptes.",
    }),
    text: [
      `Te invitaron a ${input.schoolName} en EvoluGK, con el rol de ${role}.`,
      "",
      "Para empezar, elegí tu contraseña y completá tu nombre en este link:",
      input.link,
      "",
      `El link vence el ${expires}.`,
      "",
      "Si no esperabas este mail, podés ignorarlo: no se crea ninguna cuenta hasta que aceptes.",
    ].join("\n"),
  };
}

export function passwordResetEmail(input: {
  to: string;
  schoolName: string;
  link: string;
  accentColor?: string | null;
}): EmailMessage {
  return {
    to: input.to,
    subject: `Restablecé tu contraseña de ${input.schoolName}`,
    html: renderLayout({
      schoolName: input.schoolName,
      accentColor: input.accentColor,
      heading: "Restablecé tu contraseña",
      paragraphs: [
        "Pediste cambiar tu contraseña. Tocá el botón para elegir una nueva.",
        "El link vence en 1 hora y solo se puede usar una vez.",
      ],
      buttonLabel: "Elegir una contraseña nueva",
      link: input.link,
      footnote:
        "Si no lo pediste vos, ignorá este mail: tu contraseña actual sigue siendo la misma.",
    }),
    text: [
      "Pediste cambiar tu contraseña. Elegí una nueva en este link:",
      input.link,
      "",
      "El link vence en 1 hora y solo se puede usar una vez.",
      "",
      "Si no lo pediste vos, ignorá este mail: tu contraseña actual sigue siendo la misma.",
    ].join("\n"),
  };
}

export function evaluationPublishedEmail(input: {
  to: string;
  schoolName: string;
  goalkeeperName: string;
  link: string;
  accentColor?: string | null;
}): EmailMessage {
  const name = escapeHtml(input.goalkeeperName);
  return {
    to: input.to,
    subject: `Nueva evaluación de ${input.goalkeeperName} en ${input.schoolName}`,
    html: renderLayout({
      schoolName: input.schoolName,
      accentColor: input.accentColor,
      heading: `Hay una nueva evaluación de ${input.goalkeeperName}`,
      paragraphs: [
        `Los profesores de ${escapeHtml(input.schoolName)} publicaron una evaluación de <strong>${name}</strong>.`,
        "Entrá al portal para ver los puntajes, los comentarios y cómo viene evolucionando.",
      ],
      buttonLabel: "Ver la evaluación",
      link: input.link,
      footnote:
        "Recibís este mail porque sos tutor o tutora de este arquero. Para entrar necesitás tu código de acceso y tu PIN.",
    }),
    text: [
      `Los profesores de ${input.schoolName} publicaron una evaluación de ${input.goalkeeperName}.`,
      "",
      "Entrá al portal para ver los puntajes, los comentarios y cómo viene evolucionando:",
      input.link,
      "",
      "Recibís este mail porque sos tutor o tutora de este arquero. Para entrar necesitás tu código de acceso y tu PIN.",
    ].join("\n"),
  };
}

export function videosPublishedEmail(input: {
  to: string;
  schoolName: string;
  goalkeeperName: string;
  /** Títulos de los videos publicados en la ventana (se agrupan en un solo mail). */
  titles: string[];
  link: string;
  accentColor?: string | null;
}): EmailMessage {
  const many = input.titles.length > 1;
  const name = escapeHtml(input.goalkeeperName);
  const list = input.titles.map((title) => `<li>${escapeHtml(title)}</li>`).join("");
  const heading = many
    ? `Hay ${input.titles.length} videos nuevos de ${input.goalkeeperName}`
    : `Hay un video nuevo de ${input.goalkeeperName}`;
  return {
    to: input.to,
    subject: `${heading} en ${input.schoolName}`,
    html: renderLayout({
      schoolName: input.schoolName,
      accentColor: input.accentColor,
      heading,
      paragraphs: [
        `Los profesores de ${escapeHtml(input.schoolName)} publicaron ${many ? "videos" : "un video"} de <strong>${name}</strong>:`,
        `<ul style="margin:0;padding-left:20px;">${list}</ul>`,
        "Entrá al portal para verlos y leer los comentarios de los profesores.",
      ],
      buttonLabel: many ? "Ver los videos" : "Ver el video",
      link: input.link,
      footnote:
        "Recibís este mail porque sos tutor o tutora de este arquero. Para entrar necesitás tu código de acceso y tu PIN.",
    }),
    text: [
      `Los profesores de ${input.schoolName} publicaron ${many ? "videos" : "un video"} de ${input.goalkeeperName}:`,
      ...input.titles.map((title) => `- ${title}`),
      "",
      "Entrá al portal para verlos y leer los comentarios de los profesores:",
      input.link,
      "",
      "Recibís este mail porque sos tutor o tutora de este arquero. Para entrar necesitás tu código de acceso y tu PIN.",
    ].join("\n"),
  };
}
