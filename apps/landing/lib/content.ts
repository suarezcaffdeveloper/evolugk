export const WHATSAPP = process.env.NEXT_PUBLIC_WHATSAPP ?? "5491100000000";

export const waLink = (text: string) =>
  `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`;

export const DEMO_LINK = waLink("Hola, quiero una demo de EvoluGK para mi escuela de arqueros.");

/** Las 8 categorías de la rúbrica (spec 02-evaluaciones). */
export const CATEGORIES = [
  "Atajada",
  "Juego aéreo",
  "Juego con los pies",
  "Posicionamiento",
  "Reflejos",
  "Comunicación",
  "Físico y coordinación",
  "Mentalidad",
] as const;

/** Datos de ejemplo (ficticios) para el radar interactivo. */
export const RADAR_INGRESO = [4, 3, 5, 4, 5, 6, 4, 5];
export const RADAR_HOY = [8, 7, 7, 8, 8, 7, 8, 9];

export const CHAPTERS = [
  { id: "top", label: "Inicio" },
  { id: "idea", label: "La idea" },
  { id: "evolucion", label: "Evolución" },
  { id: "funciones", label: "Funciones" },
  { id: "videos", label: "Video" },
  { id: "familias", label: "Familias" },
  { id: "equipo", label: "Tu equipo" },
  { id: "como-empezar", label: "Cómo empezar" },
  { id: "datos", label: "Datos" },
  { id: "privacidad", label: "Privacidad" },
  { id: "planes", label: "Planes" },
  { id: "preguntas", label: "Preguntas" },
  { id: "demo", label: "Demo" },
];

export const NAV = [
  { href: "#funciones", label: "Funciones" },
  { href: "#evolucion", label: "Evolución" },
  { href: "#familias", label: "Familias" },
  { href: "#planes", label: "Planes" },
  { href: "#preguntas", label: "Preguntas" },
];

export const SWITCHES = [
  {
    sentence: "Evaluá en menos de un minuto.",
    detail: "8 categorías, puntaje de 1 a 10 y una nota. Queda en borrador hasta que la publicás.",
  },
  {
    sentence: "Tomá asistencia con un toque.",
    detail: "Botón “todos presentes”, justificadas e invitados. El porcentaje se calcula sobre los últimos 90 días.",
  },
  {
    sentence: "Comentá cada jugada en video.",
    detail: "Clips de hasta 3 minutos, con comentarios del profe en el segundo exacto.",
  },
  {
    sentence: "Las familias ven todo.",
    detail: "Entran con un código y un PIN de 6 dígitos. Sin contraseñas, sin registrarse.",
  },
  {
    sentence: "Las cuotas se avisan solas.",
    detail: "Hasta 4 avisos por mail por cuota impaga, sin duplicados, todos los días a las 9:00.",
  },
];

export const STAGES = [
  {
    name: "Alta de la escuela",
    text: "Cargás el nombre, el logo y el color de tu escuela. El portal de las familias sale con tu marca desde el primer día.",
  },
  {
    name: "Arqueros y grupos",
    text: "Sumás arqueros y tutores uno por uno o con una importación masiva. EvoluGK detecta los duplicados y registra el consentimiento de imagen.",
  },
  {
    name: "Invitás a las familias",
    text: "Cada tutor recibe un código y un PIN de 6 dígitos para entrar al portal. Lo compartís por el canal que ya usás.",
  },
  {
    name: "Evaluás y subís videos",
    text: "Los profesores evalúan desde el celular, toman asistencia y comentan clips. Al publicar, la familia recibe un aviso por mail.",
  },
  {
    name: "La familia ve la evolución",
    text: "Radar, comparación ingreso vs. hoy, línea de tiempo, videos, asistencia y estado de la cuota. Todo en un solo lugar.",
  },
];

export const FACTS = [
  { value: "8", label: "categorías de evaluación" },
  { value: "1", label: "minuto para evaluar a un arquero" },
  { value: "3", label: "minutos como máximo por clip" },
  { value: "0", label: "contraseñas para las familias" },
  { value: "90", label: "días de asistencia en el porcentaje" },
  { value: "4", label: "avisos de cuota por mail" },
  { value: "100%", label: "con la marca de tu escuela" },
];

export const PLAN_INCLUDES = [
  "Evaluaciones y radar de evolución",
  "Videos con comentarios",
  "Portal de familias con tu marca",
  "Asistencia y cuotas con avisos",
];

export const PLANS = [
  { name: "Inicial", size: "30", text: "Para escuelas que arrancan y quieren ordenar el seguimiento de cada arquero." },
  { name: "Escuela", size: "80", text: "Para escuelas con varios grupos y un equipo de profesores trabajando a la vez." },
  { name: "Academia", size: "150", text: "Para academias con mucha estructura y muchas familias que informar." },
];

export const ROADMAP = [
  "Informe en PDF",
  "Comparador de videos",
  "Objetivos y plan individual",
  "Registro de partidos",
  "Avisos por WhatsApp",
  "Cobro online con MercadoPago",
  "Varias sedes",
  "Línea de tiempo con fotos e hitos",
];

export const FAQ = [
  { tab: "Familias", q: "¿Las familias tienen que crear una cuenta?", a: "No. Cada tutor entra con un código y un PIN de 6 dígitos que le da la escuela. Después de 5 intentos fallidos el acceso se bloquea 15 minutos, y la sesión dura 30 días." },
  { tab: "Cuotas", q: "¿EvoluGK cobra las cuotas?", a: "Hoy no. Lleva el control: estado, vencimientos, adelantos de hasta 12 meses y avisos automáticos por mail. El cobro online llega más adelante." },
  { tab: "Videos", q: "¿Cuántos videos puedo subir?", a: "Cada clip puede durar hasta 3 minutos en hasta 1080p. Tu plan define los minutos de video; te avisamos al llegar al 80%." },
  { tab: "Privacidad", q: "¿Qué pasa con los datos de los menores?", a: "Solo se suben videos de arqueros con consentimiento de imagen vigente. Los videos se reproducen con enlaces que vencen y cada escuela ve únicamente sus datos." },
  { tab: "Marca", q: "¿Puedo usar el logo y los colores de mi escuela?", a: "Sí. El portal de las familias lleva tu logo, tu nombre y tu color. Si todavía no los cargaste, se ve con un diseño neutro con el nombre de la escuela." },
  { tab: "Equipo", q: "¿Qué ve cada persona de mi equipo?", a: "El administrador ve todo, incluidas las cuotas y la marca. Los profesores ven a los arqueros de la escuela, pero nada económico. Las familias solo ven a sus hijos." },
];
