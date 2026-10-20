# Design Brief — EvoluGK (nombre de trabajo)

_Generado con /design-grill el 2026-10-20. Actualizar este archivo cuando cambien las decisiones de diseño._

## Product Context
- **Categoría:** SaaS multi-escuela con dos superficies: un **portal de familia** (tipo consumer) y una **app de gestión** para profesor y admin.
- **Usuarios:**
  - *Familia / arquero:* madres, padres o tutores de un arquero de fútbol (o el propio arquero adulto). Entran desde el celular, a ratos, con poca paciencia técnica. Quieren ver cómo evoluciona el arquero.
  - *Profesor:* en la cancha, con el celular, entre ejercicios y con poco tiempo. Carga asistencia, evaluaciones y videos.
  - *Admin de escuela y operador:* en compu y celular, gestionan arqueros, cuotas y la suscripción.
- **Dispositivo / contexto principal:** **mobile-first**. El profesor además usa compu en el escritorio.
- **Pantalla que define el producto:** el **Inicio del portal de la familia** (resumen del arquero). Segunda pantalla clave: la **carga de una evaluación** por el profesor en el celular.

## Brand Personality
**5 adjetivos:** cercano, claro, motivador, confiable, atento al detalle.
**Emoción objetivo:** **orgullo** para la familia y **fluidez** para el profesor.
**Tono:** un entrenador de confianza. Serio con los datos, humano en el trato: explica sin tecnicismos, celebra el progreso y no abruma. Registro de *The Athletic con calidez*, más cercano a una app de seguimiento de crecimiento que a un panel de gestión.

## Visual References
- **Strava** — gráficos de progreso grandes y legibles, un solo color de acento, la sensación de celebrar un logro personal. Para el radar y la evolución.
- **Duolingo** — transiciones con un toque de juego y refuerzo positivo cuando algo mejora, sin ser infantil. Para el orgullo de la familia.
- **Linear** — velocidad percibida, estados claros, interacciones rápidas. Para la app del profesor.

## What to Avoid
- **Look de "sistema de gestión":** azul corporativo, tablas apretadas, menús laterales con veinte opciones.
- **Estética de club deportivo genérica:** escudos, texturas de césped, tipografías deportivas pesadas o cursivas.
- **Gráficos fríos de panel de datos:** tortas o barras sin contexto que no cuentan una historia.
- **La identidad de la landing actual** (verde botella y oro, octógono, Jost): se descartó para el producto.

## Color System
- **Modo por defecto:** **Claro**, con modo oscuro opcional.
- **Temperatura:** cálida (fondos crema, no grises fríos).
- **Dirección de color primaria:** **naranja fuerte y profundo, no fluorescente**, inspirado en las camisetas de arquero.
- **Enfoque de paleta:** un solo acento fuerte más neutros cálidos; un segundo tono frío (verde azulado) solo para comparar "ingreso vs. hoy" en los gráficos.
- **Saturación:** saturada, sin llegar a flúor.
- **Valores de partida (a validar en el prototipo):**

| Rol | Modo claro | Modo oscuro |
|---|---|---|
| Fondo | `#FBF7F2` (crema) | `#16120F` |
| Superficie / tarjeta | `#FFFFFF` | `#201A16` |
| Borde | `#E8DFD3` | `#35302B` |
| Texto principal | `#1F1A17` | `#F5EEE6` |
| Texto secundario | `#6B5F55` | `#B8AB9E` |
| Acento (botones con texto blanco) | `#C2410C` (≈5:1 con blanco) | `#EA6A2A` |
| Acento decorativo (gráficos, rellenos grandes) | `#E8590C` | `#FB7A3A` |
| Comparación / "ingreso" en gráficos | `#0F766E` | `#2DB5A8` |
| Éxito | `#2F7D4F` | `#4DB37A` |
| Aviso | `#B7791F` | `#E0A94A` |
| Error | `#B42318` | `#F0766B` |

- **Color de cada escuela:** reemplaza el acento en el portal de esa escuela. El sistema deriva los tonos (hover, fondo suave, texto sobre acento) y **ajusta o rechaza** colores con contraste insuficiente, en modo claro y oscuro.

## Typography
- **Familia:** dos fuentes de Google Fonts, ambas con tildes y ñ.
- **Títulos y números grandes:** *Bricolage Grotesque*, peso 700 — expresiva y amable.
- **Texto, formularios y tablas:** *Figtree*, pesos 400/500/600 — muy legible en pantallas chicas y cercana.
- **Cifras:** números tabulares (mismo ancho) para puntajes, porcentajes y fechas.
- **Densidad:** balanceada. Espaciosa en el portal, más compacta en la app del profesor/admin.

## Component Style
- **Esquinas:** redondeadas — **12 px** en tarjetas, **10 px** en botones y campos. Sin píldora completa.
- **Elevación:** sutil — sombras suaves y cálidas que crecen un poco al pasar el cursor o tocar.
- **Densidad:** **doble** — portal espacioso con tarjetas grandes; app del profesor compacta pero con áreas táctiles de **mínimo 44 px**.
- **Bordes:** finos y suaves (1 px, color crema oscuro).
- **Resumen:** esquinas amables, sombras suaves, aire en el portal y compacto con áreas táctiles grandes en el profesor.

## Animation
- **Nivel:** **expresivo en el portal, sutil en la app del profesor.**
- **Portal:** el radar se dibuja al abrirse; al pasar a "ingreso vs. hoy" una forma se transforma en la otra; los puntajes y porcentajes cuentan hasta su valor; tarjetas y listas entran escalonadas; la etiqueta "nuevo" aparece con un destello leve; un video o evaluación nueva puede celebrarse con un detalle discreto (sin confeti infantil).
- **App del profesor:** transiciones de 100–200 ms, feedback inmediato al tocar (por ejemplo, al marcar "presente"), carga que se percibe rápida.
- **Interacción clave:** el radar "ingreso vs. hoy".
- **Curvas:** ease-out suave, sin rebotes exagerados.
- **Accesibilidad:** se respeta "reducir movimiento" del sistema; se animan solo opacidad y transformaciones.

## Dark Mode
- **Requerido desde el inicio como opción.** El modo claro es el principal y el que se diseña primero; el oscuro lo elige la persona con un control visible y se recuerda en el dispositivo (no sigue automáticamente al sistema). Todos los tokens se definen en ambos modos desde el primer día.

## Decisions Made
| Decisión | Qué se decidió | Por qué |
|---|---|---|
| Personalidad | Cercano, claro, motivador, confiable, atento al detalle; tono The Athletic con calidez | Un entrenador de confianza, serio con los datos y humano en el trato |
| Emoción | Orgullo (familia) y fluidez (profesor) | Son los dos usuarios principales con necesidades distintas |
| Referencias | Strava, Duolingo, Linear | Progreso legible, refuerzo positivo, velocidad |
| Color | Naranja fuerte profundo sobre crema cálido, con neutros cálidos | Sale de la camiseta de arquero; se aleja del azul corporativo |
| Tipografía | Bricolage Grotesque + Figtree | Carácter en títulos, legibilidad en el uso diario |
| Componentes | 12/10 px, sombras sutiles, densidad doble, bordes finos | Cercanía en el portal, eficiencia en la cancha |
| Animación | Expresiva en el portal, sutil en el profesor | Celebrar el progreso sin frenar al profesor |
| Modo oscuro | Opcional, elegido por la persona; claro es el principal | Pedido explícito del producto |
| Marca de escuela | El portal usa el color y logo de la escuela; EvoluGK aparece discreto | Coincide con la spec 04 |
| Pantalla clave | Inicio del portal; luego carga de evaluación en el celular | Es lo que más se ve y donde más se juega la fluidez |

## Ruled Out
_Direcciones rechazadas. No volver a proponerlas sin reabrir la decisión._

| Dirección | Por qué se descartó |
|---|---|
| Azul corporativo como color principal | Parece software de gestión, justo lo que queremos evitar |
| Tablas apretadas y menús laterales con muchas opciones | Choca con "claro" y "fluidez" |
| Estética genérica de club deportivo (escudos, césped, tipografías deportivas pesadas o cursivas) | Genérica y alejada del tono cercano y cuidado |
| Gráficos fríos de panel (tortas y barras sin contexto) | No cuentan la historia de la evolución |
| Identidad de la landing (verde botella y oro, octógono, Jost) | Decisión explícita: el producto tendrá otra identidad |
| Naranja fluorescente | Se pidió un naranja fuerte pero no flúor; además falla en contraste |
| Modo oscuro por defecto | El modo claro es el principal para familias y profesores |
| Tipografía geométrica fría (Inter y similares) | Poco cálida para el tono buscado |
| Esquinas tipo píldora completa y sombras dramáticas | Infantil o recargado para un producto con datos |
| Rebotes exagerados y confeti infantil | Contradicen "atento al detalle" y la sobriedad de los datos |

## Open Questions
- Nombre definitivo del producto y logotipo (hoy: EvoluGK como nombre de trabajo).
- Set de íconos (propuesta: una librería de trazo uniforme, por ejemplo Lucide).
- Estilo de avatares sin foto (iniciales sobre el color de la escuela) y de estados vacíos (ilustración o solo texto).
- Textos de microcopy: tono exacto de los mensajes de celebración.
- Valores finales de color a validar con un prototipo de una tarjeta y un botón en ambos modos.
