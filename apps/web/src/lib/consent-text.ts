/**
 * Texto estándar del consentimiento de imagen y video (spec 01, RF-26; spec 04, RF-07). Es igual
 * para todas las escuelas y la escuela no lo modifica.
 *
 * Es un texto provisional: la redacción final la revisa un profesional antes del lanzamiento
 * (spec 01, pregunta abierta 2). Al cambiarlo hay que subir `CONSENT_TEXT_VERSION`: cada
 * consentimiento guarda la versión que la persona vio al aceptar.
 */
export const CONSENT_TEXT_VERSION = "2026-10-borrador-2";

export const CONSENT_TITLE = "Consentimiento de imagen y video";

export const CONSENT_PARAGRAPHS = [
  "Autorizo a la escuela a registrar fotos y videos de mi hijo o hija durante los entrenamientos, y a usarlos solo para su seguimiento y su evolución dentro de esta plataforma.",
  "Los videos y fotos los ven únicamente los profesores y administradores de la escuela y la familia de cada arquero. No se publican ni se comparten fuera de la plataforma.",
  "No se usan para ninguna otra finalidad: el uso en redes sociales, si algún día se ofrece, requiere un consentimiento aparte.",
  "Puedo retirar este consentimiento cuando quiera desde la sección Privacidad. Al retirarlo, las fotos y videos de mi hijo o hija se ocultan al instante.",
] as const;
