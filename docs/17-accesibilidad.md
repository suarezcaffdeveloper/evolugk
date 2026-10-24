# 17 — Accesibilidad

- **Estado:** Hito 7 (implementado)
- **Objetivo:** WCAG 2.1 nivel AA en todo el producto, en modo claro y oscuro.
- **Cómo se verificó:** axe-core 4.14 (reglas WCAG 2 A/AA, WCAG 2.1 A/AA y buenas prácticas) sobre el build de producción, más un recorrido por teclado. Cada pantalla en tres variantes: celular claro, celular oscuro y escritorio claro.

## Alcance de la auditoría
- **114 escaneos** sobre 38 pantallas: las públicas (ingreso, recuperar contraseña, legales, 404), el panel de la administración, el del profesor y el portal de familia (incluido el primer ingreso, en sus dos pasos).
- **21 escaneos** sobre pantallas con **estados** que una pantalla vacía no muestra: la lista de asistencia con presentes, ausentes, justificadas e invitado, el detalle de la sesión, los informes con datos y el calendario de la familia.
- **Recorrido por teclado** en 39 pantallas: foco visible en cada parada, nombre accesible y tamaño de los objetivos.
- **No cubierto:** las pantallas del operador que requieren verificación en dos pasos (inicio, detalle de escuela, ingresos, alta de escuela, 2FA). Solo se escaneó su ingreso. Usan los mismos componentes que el resto, pero no se midieron.

## Qué se encontró y se arregló
| # | Hallazgo | Dónde | Arreglo |
|---|---|---|---|
| 1 | **Sin enlace para saltar al contenido** (WCAG 2.4.1, nivel A). Las 39 pantallas | Todo el producto | "Saltar al contenido" como primer elemento del `<body>` (visible solo al enfocarlo) y `id="contenido"` en los 39 `<main>` |
| 2 | **Contraste del texto de estado en modo claro** (1.4.3): chip `warning` 2,9:1 y `success` 3,9:1; texto `warning` 3,6:1 | Etiquetas de estado ("Consentimiento pendiente", "Al día"…) en 10 pantallas | Tokens `--warning-ink` y `--success-ink` (claro: `#855710` y `#25663f`, ≥ 5:1 sobre el peor fondo). En oscuro no cambia |
| 3 | **Texto blanco sobre colores de estado sólidos**: 2,1 a 2,8:1 en oscuro y 3,6:1 sobre "Justificada" en claro | Botones de asistencia ya marcados, calendario de asistencia, botón de peligro | Tokens `--on-success`, `--on-warning`, `--on-danger`: blanco o tinta oscura según el modo (5,0 / 4,7 / 6,6:1 en claro; 6,6 / 8,2 / 6,2:1 en oscuro) |
| 4 | **Objetivos táctiles chicos** (14 a 20 px de alto). 147 casos en 59 elementos distintos | Pie legal (32 pantallas), enlaces "← Volver…" (28), índice de los textos legales, "Ver calendario", "Editar", "Actualizar grupos", ingreso del equipo, "Sin evaluar", resúmenes desplegables | Altura mínima de 44 px en los enlaces y botones propios; 24 px o más en el pie y el índice |

**Antes → después** (primer escaneo contra el último):
- Violaciones de axe: **30 nodos → 0**, en las 114 + 21 pruebas.
- Pantallas sin enlace para saltar: **39 → 0**. (3 aparecen igual en el script de teclado: enfocan un campo al cargar y mi `Tab` parte desde ahí; el enlace está en el layout raíz.)
- Objetivos de menos de 24 px: **147 casos → 12** en la segunda pasada. Después se arreglaron los 3 enlaces de ingreso y "Sin evaluar", y se **midieron** en el build: ingreso del equipo, "¿Olvidaste tu contraseña?", "Volver al ingreso" y "← EvoluGK" miden 44 px de alto; el pie legal, 40 px; el índice de los textos legales, 32 px. "Sin evaluar" no se volvió a medir (su altura mínima es de 44 px por estilo).

## Lo que ya estaba bien
- `lang="es-AR"`, un solo `<main>` y un `<h1>` por pantalla, jerarquía de títulos sin saltos.
- **Foco visible** en todos los elementos recorridos (`:focus-visible` global) y **nombre accesible** en todos: 0 casos en ambos controles.
- Formularios con etiqueta asociada y errores anunciados (`role="alert"`).
- Contenido dinámico anunciado (`aria-live`): estado de conexión y sincronización de la asistencia, bandeja de subidas, avisos (`role="status"`).
- Botones de marcar asistencia: grupo con nombre del arquero y `aria-pressed`.
- `prefers-reduced-motion` respetado en las animaciones.
- Modo oscuro sin violaciones de contraste desde el primer escaneo.
- Sin diálogos modales: no hay trampas de foco.

## Excepciones conocidas (6 objetivos < 24 px)
- **5 casillas y opciones nativas** dentro de su `<label>` (consentimiento, "Visible para la familia", puntajes de la evaluación, rol del equipo): el área tocable es la de toda la etiqueta, no la del cuadradito.
- **El enlace "Política de privacidad" dentro de una frase** del consentimiento: los enlaces en un texto corrido están exceptuados (WCAG 2.5.8) y agrandarlo rompería el interlineado.

## Reglas para no retroceder
- **Texto sobre un color de estado:** usar `text-success-ink`, `text-warning-ink` (sobre fondos tenues, como `Chip`) y `text-on-success`, `text-on-warning`, `text-on-danger` (sobre fondos sólidos). No usar `text-white` ni `text-success`/`text-warning` para texto chico.
- **Enlaces y botones propios:** al menos `min-h-11`. Un enlace dentro de una frase no lo necesita.
- **Pantalla nueva:** su `<main>` lleva `id="contenido"`.
- Para un color de escuela, el contraste ya está garantizado por `resolveAccent`.

## Prueba permanente
`e2e/accesibilidad.spec.ts`: 14 pantallas clave (una de cada tipo: ingreso, lista, formulario, ficha, portal) × modo claro y oscuro = 28 pruebas. Cada una exige **cero violaciones de axe** y el enlace para saltar como primer elemento. Se comprobó que **falla** si se revierte el color del chip de advertencia.

```
E2E_PROD=1 E2E_PORT=3100 pnpm test:e2e e2e/accesibilidad.spec.ts
```

## Pendiente
- **Lector de pantalla real** (TalkBack en Android, VoiceOver en iPhone) en la toma de lista y en el portal: axe cubre una parte de los problemas; el orden de lectura y los anuncios hay que oírlos.
- **Zoom y texto grande:** probar el portal con el tamaño de letra del sistema al máximo y con zoom al 200 %.
- **Pantallas del operador** con verificación en dos pasos (ver "No cubierto").
- `/proto`: página de prototipo con chips de estado sin los tokens nuevos. Si sigue existiendo en producción, quitarla o corregirla (ver [15 — Seguridad](15-seguridad.md)).
