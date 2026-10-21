/**
 * Textos legales de la plataforma: política de privacidad y términos y condiciones (spec 04,
 * RF-07 y RF-31; spec 01, pregunta abierta 2).
 *
 * ES UN BORRADOR. Lo redactó el equipo de producto a partir de lo que el sistema hace realmente
 * (docs/11-textos-legales.md lista cada afirmación para verificarla) y TIENE QUE REVISARLO Y
 * APROBARLO UN PROFESIONAL antes del lanzamiento. Mientras `LEGAL_IS_DRAFT` sea true, cada página
 * muestra un aviso visible. Al aprobarse: completar los datos de `LEGAL_OPERATOR`, poner
 * `LEGAL_IS_DRAFT` en false y subir `LEGAL_VERSION`.
 *
 * Es el mismo texto para todas las escuelas (la escuela no lo modifica).
 */

export const LEGAL_IS_DRAFT = true;

/** Versión de los dos textos. Cambia cuando cambia cualquiera de ellos. */
export const LEGAL_VERSION = "2026-10-borrador";
export const LEGAL_UPDATED = "21 de octubre de 2026";

/**
 * Datos de quien opera la plataforma. Los corchetes marcan lo que falta completar con los datos
 * reales de la empresa o de la persona responsable.
 */
export const LEGAL_OPERATOR = {
  name: "[Razón social o nombre del responsable de EvoluGK]",
  taxId: "[CUIT]",
  address: "[Domicilio legal]",
  email: "[Mail de contacto para temas de privacidad]",
} as const;

export type LegalBlock = { type: "p"; text: string } | { type: "list"; items: string[] };
export type LegalSection = { id: string; heading: string; blocks: LegalBlock[] };
export type LegalDocument = {
  title: string;
  intro: string;
  sections: LegalSection[];
};

const p = (text: string): LegalBlock => ({ type: "p", text });
const list = (...items: string[]): LegalBlock => ({ type: "list", items });

// ───────────────────────────── política de privacidad ─────────────────────────────

export const PRIVACY_POLICY: LegalDocument = {
  title: "Política de privacidad",
  intro:
    "Acá te contamos, sin vueltas, qué datos guarda EvoluGK sobre los arqueros y sus familias, para qué los usa, quién puede verlos y qué podés hacer vos con ellos.",
  sections: [
    {
      id: "quienes-somos",
      heading: "1. Quiénes intervienen",
      blocks: [
        p(
          `EvoluGK es una plataforma que usan las escuelas de arqueros para seguir la evolución de cada deportista y comunicarse con las familias. La opera ${LEGAL_OPERATOR.name} (${LEGAL_OPERATOR.taxId}), con domicilio en ${LEGAL_OPERATOR.address}.`,
        ),
        p(
          "Cada escuela es la responsable de los datos de sus arqueros y de sus familias: decide a quién dar de alta, qué cargar y cuándo borrarlo. EvoluGK los trata por cuenta de la escuela, solo para prestar el servicio. Además, EvoluGK es responsable de los datos de las cuentas del equipo de las escuelas y del funcionamiento y la seguridad de la plataforma.",
        ),
        p(`Para consultas sobre esta política podés escribir a ${LEGAL_OPERATOR.email}.`),
      ],
    },
    {
      id: "datos",
      heading: "2. Qué datos tratamos",
      blocks: [
        p("Sobre cada arquero, según lo que cargue la escuela y las funciones que use:"),
        list(
          "Datos básicos: nombre, apellido, fecha de nacimiento y fecha de ingreso a la escuela.",
          "Datos físicos y deportivos: altura y peso (con su historial), pie hábil, nivel, club actual, categoría, objetivo, grupos y estado (activo, inactivo o egresado).",
          "Seguimiento deportivo: evaluaciones, comentarios y notas del equipo, y la asistencia a los entrenamientos.",
          "Fotos y videos de los entrenamientos, únicamente si hay consentimiento vigente (ver el punto 6).",
          "Un contacto de emergencia (nombre, teléfono y parentesco), que ve solo el equipo de la escuela y nunca se muestra en el portal de las familias.",
        ),
        p("Sobre cada tutor (la persona que accede al portal de las familias):"),
        list(
          "Nombre, apellido, teléfono y, si lo informa, mail.",
          "Un código de acceso y un PIN. El PIN se guarda cifrado de forma irreversible: nadie, ni la escuela ni EvoluGK, puede verlo.",
          "Datos de sus sesiones abiertas, para poder cerrarlas cuando lo pida.",
        ),
        p(
          "Sobre el equipo de la escuela (administración y profesores): nombre, apellido, mail y rol.",
        ),
        p(
          "Además, el sistema guarda un registro de las acciones importantes (por ejemplo, quién dio de alta o eliminó a un arquero, o quién dio o retiró un consentimiento) para poder auditar lo que pasó.",
        ),
      ],
    },
    {
      id: "para-que",
      heading: "3. Para qué usamos los datos",
      blocks: [
        list(
          "Mostrar a cada familia la evolución de su arquero.",
          "Que el equipo de la escuela registre evaluaciones, videos, asistencia y medidas.",
          "Mandar avisos de la escuela a las familias (por ejemplo, una evaluación o un video nuevo, o el vencimiento de una cuota) cuando la familia tiene mail cargado.",
          "Mantener la plataforma segura, detectar errores y mejorarla.",
        ),
        p(
          "No vendemos datos, no mostramos publicidad, no armamos perfiles comerciales y no usamos los videos ni las fotos para nada que no sea el seguimiento deportivo dentro de la plataforma.",
        ),
      ],
    },
    {
      id: "menores",
      heading: "4. Datos de menores",
      blocks: [
        p(
          "La mayoría de los arqueros son menores de edad. Por eso el portal lo usan sus tutores, y el consentimiento de imagen y video lo da siempre un tutor y no el equipo de la escuela. Un arquero mayor de 18 años puede ser su propio tutor y gestionar su acceso y su consentimiento.",
        ),
      ],
    },
    {
      id: "quien-ve",
      heading: "5. Quién puede ver los datos",
      blocks: [
        list(
          "Las familias ven únicamente a los arqueros vinculados a su acceso, y solo lo que la escuela marcó como visible: evaluaciones y videos publicados, y notas marcadas para la familia. Un tutor no ve los datos de otros tutores.",
          "El equipo de una escuela ve solo los datos de su escuela. Una escuela nunca ve los datos de otra.",
          "El equipo de EvoluGK no consulta los datos de los arqueros en el uso normal del servicio; solo puede hacerlo por razones de soporte técnico o de seguridad.",
        ),
      ],
    },
    {
      id: "consentimiento",
      heading: "6. Fotos y videos: el consentimiento",
      blocks: [
        p(
          "Las fotos y los videos de un arquero solo se suben y se muestran si un tutor dio el consentimiento de imagen y video desde el portal. Alcanza con que lo dé uno de los tutores. Se guarda quién lo dio, cuándo y qué versión del texto aceptó.",
        ),
        p(
          "Podés retirar el consentimiento cuando quieras desde la sección Privacidad del portal. Al retirarlo, las fotos y los videos de ese arquero dejan de mostrarse al instante, en todos los dispositivos, y la escuela recibe un aviso. La escuela decide después si los borra definitivamente. Si volvés a dar el consentimiento, el contenido que no se haya borrado vuelve a mostrarse.",
        ),
        p(
          "El uso de imágenes en redes sociales de la escuela, si algún día se ofrece, requerirá un consentimiento aparte, independiente y opcional.",
        ),
      ],
    },
    {
      id: "proveedores",
      heading: "7. Proveedores que intervienen",
      blocks: [
        p(
          "Para funcionar, EvoluGK usa servicios de terceros que tratan datos por nuestra cuenta y con las mismas obligaciones de confidencialidad y seguridad:",
        ),
        list(
          "Alojamiento de la base de datos y de las cuentas del equipo (Supabase).",
          "Alojamiento de la aplicación (Vercel).",
          "Almacenamiento y reproducción de videos (Mux). El proveedor recibe los videos y un identificador, pero no los datos personales del arquero.",
          "Envío de mails (Resend).",
        ),
        p(
          "Algunos de estos proveedores pueden almacenar los datos en servidores ubicados fuera de la Argentina. En ese caso nos aseguramos de que ofrezcan niveles de protección adecuados y de que la transferencia se haga conforme a la normativa vigente.",
        ),
      ],
    },
    {
      id: "conservacion",
      heading: "8. Cuánto tiempo guardamos los datos",
      blocks: [
        list(
          "Mientras la escuela use la plataforma. Un arquero inactivo o egresado conserva su historial, y su familia puede seguir viéndolo, pero no se cargan datos nuevos de asistencia ni de cuotas.",
          "Cuando la escuela elimina definitivamente a un arquero, se borran su ficha, sus medidas, evaluaciones y notas, y todos sus videos, también en el proveedor de video. Los videos borrados no se pueden recuperar. Solo queda un registro de auditoría de quién lo eliminó y cuándo, sin datos personales del arquero.",
          "Si una escuela se suspende, conservamos sus datos intactos durante 90 días. Después, el operador de la plataforma decide si los borra.",
        ),
      ],
    },
    {
      id: "seguridad",
      heading: "9. Cómo cuidamos los datos",
      blocks: [
        list(
          "Cada escuela tiene sus datos aislados de los de las demás, con controles en la base de datos y no solo en la aplicación.",
          "El PIN se guarda cifrado, los intentos fallidos se limitan (cinco errores bloquean el acceso durante 15 minutos) y las sesiones se pueden cerrar en un dispositivo o en todos.",
          "Los videos son privados: no hay links públicos y se reproducen con direcciones firmadas de corta duración. La aplicación no ofrece descarga.",
          "Se audita quién hace las acciones sensibles.",
        ),
        p(
          "Ninguna medida es perfecta: por ejemplo, no se puede impedir que alguien grabe la pantalla de su propio celular. Por eso pedimos a las familias que usen el contenido solo para uso personal y familiar (ver los Términos y condiciones).",
        ),
      ],
    },
    {
      id: "cookies",
      heading: "10. Cookies y seguimiento",
      blocks: [
        p(
          "El portal usa solo lo imprescindible: una cookie que mantiene tu sesión abierta, otra que recuerda el último arquero que elegiste y una preferencia en tu dispositivo para el modo claro u oscuro. No usamos cookies de publicidad ni de seguimiento, no compartimos datos con redes publicitarias y no medimos tu uso con herramientas de analítica. Solo guardamos registros técnicos de errores para poder corregirlos.",
        ),
      ],
    },
    {
      id: "derechos",
      heading: "11. Tus derechos",
      blocks: [
        p(
          "Como titular de los datos (o como tutor del arquero) podés pedir acceder a ellos, rectificarlos o actualizarlos, y solicitar su supresión, conforme a la Ley 25.326 de Protección de los Datos Personales. Podés actualizar tu teléfono y tu mail en cualquier momento desde Mis datos. Para el resto, pedíselo a la escuela, que es la responsable de los datos; EvoluGK la ayuda a darte una respuesta. También podés escribirnos a " +
            `${LEGAL_OPERATOR.email}.`,
        ),
        p(
          "El acceso a tus datos es gratuito a intervalos no menores a seis meses, salvo que acredites un interés legítimo. Si considerás que no se respetaron tus derechos, podés presentar una denuncia ante la Agencia de Acceso a la Información Pública, que es el órgano de control de la ley.",
        ),
      ],
    },
    {
      id: "cambios",
      heading: "12. Cambios en esta política",
      blocks: [
        p(
          `Si cambiamos esta política, publicamos la nueva versión en esta misma página con su fecha. Versión ${LEGAL_VERSION}, actualizada el ${LEGAL_UPDATED}.`,
        ),
      ],
    },
  ],
};

// ───────────────────────────── términos y condiciones ─────────────────────────────

export const TERMS_OF_USE: LegalDocument = {
  title: "Términos y condiciones",
  intro:
    "Estas son las reglas para usar EvoluGK, el portal donde las familias siguen la evolución de sus arqueros y donde el equipo de cada escuela trabaja.",
  sections: [
    {
      id: "aceptacion",
      heading: "1. Quién puede usar EvoluGK y qué aceptás",
      blocks: [
        p(
          "El portal de familias es para los tutores de los arqueros (o para los propios arqueros mayores de 18 años) a quienes la escuela les dio un código de acceso. El panel del equipo es para el personal de la escuela que fue invitado. Al ingresar y usar la plataforma aceptás estos términos y la Política de privacidad.",
        ),
      ],
    },
    {
      id: "servicio",
      heading: "2. Qué es el servicio, y qué no",
      blocks: [
        p(
          "EvoluGK es una herramienta que cada escuela contrata para registrar y compartir el seguimiento de sus arqueros. La relación deportiva y económica (la actividad, las cuotas, las evaluaciones y las decisiones sobre cada arquero) es entre la familia y la escuela. EvoluGK no es parte de esa relación y no es responsable por ella.",
        ),
      ],
    },
    {
      id: "acceso",
      heading: "3. Tu acceso",
      blocks: [
        list(
          "El código y el PIN son personales. No los compartas con personas que no sean tutores del arquero.",
          "La primera vez tenés que cambiar el PIN inicial por uno propio.",
          "Si perdés el PIN o creés que otra persona lo conoce, pedile a la escuela que genere uno nuevo.",
          "Tras cinco intentos fallidos el acceso se bloquea durante 15 minutos. La escuela puede desbloquearlo o revocar un acceso en cualquier momento.",
          "Tu sesión dura 30 días y podés cerrarla en un dispositivo o en todos desde el portal.",
        ),
      ],
    },
    {
      id: "uso",
      heading: "4. Uso aceptable",
      blocks: [
        p("Al usar EvoluGK te comprometés a:"),
        list(
          "Usar los videos, las fotos y los datos solo con fines personales y familiares, para acompañar a tu arquero.",
          "No difundir, publicar ni compartir fuera de tu familia videos, fotos o datos de ningún arquero, y en especial de otros menores. Esto incluye las capturas y grabaciones de pantalla.",
          "No intentar entrar a datos que no son tuyos, ni probar o vulnerar la seguridad de la plataforma.",
          "No usar la plataforma con fines comerciales ni de manera que afecte su funcionamiento.",
          "Si sos parte del equipo de una escuela: cargar solo información veraz y necesaria, y respetar el consentimiento de cada arquero antes de subir fotos o videos.",
        ),
      ],
    },
    {
      id: "contenido",
      heading: "5. Contenido",
      blocks: [
        p(
          "Los datos, evaluaciones, videos y comentarios que carga cada escuela siguen siendo de la escuela y de las familias a las que corresponden. Al cargarlos, la escuela autoriza a EvoluGK a almacenarlos y mostrarlos únicamente para prestar el servicio. La aplicación, su diseño y su marca son de EvoluGK.",
        ),
      ],
    },
    {
      id: "consentimiento",
      heading: "6. Consentimiento de imagen y video",
      blocks: [
        p(
          "Las fotos y los videos de un arquero solo se muestran con el consentimiento de un tutor, que puede retirarse en cualquier momento desde Privacidad. Los detalles están en la Política de privacidad.",
        ),
      ],
    },
    {
      id: "evaluaciones",
      heading: "7. Evaluaciones, medidas y comentarios",
      blocks: [
        p(
          "Las evaluaciones, los comentarios y las notas son la opinión profesional del equipo de la escuela en un momento determinado. Sirven para acompañar el progreso y no garantizan resultados deportivos. La altura, el peso y demás medidas son informativas: no constituyen un diagnóstico ni un consejo médico. Ante cualquier duda de salud, consultá a un profesional.",
        ),
      ],
    },
    {
      id: "disponibilidad",
      heading: "8. Disponibilidad",
      blocks: [
        p(
          "Hacemos lo posible para que EvoluGK funcione todo el tiempo, pero no podemos garantizar que no haya interrupciones por mantenimiento, fallas de internet o de nuestros proveedores. El portal necesita conexión a internet para funcionar. Si una escuela está suspendida, el portal muestra un mensaje y no deja ver datos hasta que se reactive.",
        ),
      ],
    },
    {
      id: "suspension",
      heading: "9. Suspensión del acceso",
      blocks: [
        p(
          "La escuela puede revocar o limitar un acceso. EvoluGK puede suspender un acceso o una escuela ante un uso que infrinja estos términos, ponga en riesgo la seguridad o los datos de otras personas, o por falta de pago de la escuela. Los datos se conservan según lo que dice la Política de privacidad.",
        ),
      ],
    },
    {
      id: "responsabilidad",
      heading: "10. Responsabilidad",
      blocks: [
        p(
          "En la medida en que la ley lo permita, EvoluGK no responde por los daños que surjan de decisiones tomadas a partir de la información cargada por las escuelas, del uso indebido de las credenciales por parte de quien las comparta, ni de interrupciones fuera de su control. Nada de lo dicho en estos términos limita los derechos que la ley reconoce a las personas ni la responsabilidad que no pueda excluirse.",
        ),
      ],
    },
    {
      id: "ley",
      heading: "11. Ley aplicable",
      blocks: [
        p(
          "Estos términos se rigen por las leyes de la República Argentina. Para cualquier controversia serán competentes los tribunales que correspondan según la ley aplicable. [Jurisdicción a confirmar con el asesor legal.]",
        ),
      ],
    },
    {
      id: "cambios",
      heading: "12. Cambios y contacto",
      blocks: [
        p(
          `Podemos actualizar estos términos y publicaremos la nueva versión en esta página con su fecha. Versión ${LEGAL_VERSION}, actualizada el ${LEGAL_UPDATED}. Consultas: ${LEGAL_OPERATOR.email}.`,
        ),
      ],
    },
  ],
};
