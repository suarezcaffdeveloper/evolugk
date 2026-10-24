# 18 — Rendimiento

- **Estado:** Hito 7 (implementado)
- **Objetivo:** que el portal y el panel se sientan rápidos en un celular de gama media con señal regular, que es donde se usan.

## Cómo se midió
- **Lighthouse 12** (perfil móvil por defecto: Moto G con 4G lento y CPU 4× más lenta, todo **simulado**) sobre el **build de producción** (`next build` + `next start`), con sesión de verdad: se pasa la cookie de cada rol con `--extra-headers`.
- **9 pantallas:** ingreso de familias y del equipo, inicio, evolución y asistencia del portal, y en el panel el inicio, la lista de arqueros, la toma de lista y la ficha del arquero.
- **Datos realistas:** una escuela con un grupo de 30 arqueros y 24 días de asistencia, no una escuela vacía.
- **Tamaño de los bundles:** `next experimental-analyze --output`, que atribuye el peso a cada módulo y escribe `.next/diagnostics/route-bundle-stats.json` (JavaScript de primera carga de cada ruta).
- Lighthouse se corre con `npx lighthouse@12`; no es una dependencia del repo.

## Qué se encontró y se arregló
| # | Hallazgo | Causa | Arreglo |
|---|---|---|---|
| 1 | **441 KB (132 KB comprimido) de JavaScript de más** en la ficha del arquero, el alta y la importación | `lib/access-code.ts` importaba `node:crypto` y la tarjeta de credenciales (código de cliente) importaba de ahí `formatAccessCode`. Para que ese import "funcione" en el navegador, el empaquetador metió un polyfill de `crypto` y `Buffer` | `lib/access-code.ts` quedó con funciones puras; el generador aleatorio pasó a `server/guardian/access-code.ts` (`server-only`). `lib/pin.ts` también declara `server-only` |
| 2 | **~1,2 MB de JavaScript de más** en las dos pantallas de video | El reproductor de Mux se importaba de forma estática y se descargaba antes de poder hidratar la página | `@mux/mux-player-react/lazy` con `loading="viewport"`: se descarga cuando el video entra en pantalla |
| 3 | **Desplazamiento de diseño (CLS) de 0,13 a 0,20** en casi todas las pantallas con sesión | El pie del marco de la escuela quedaba pegado al borde inferior mientras la pantalla mostraba su esqueleto de carga y bajaba de golpe al llegar el contenido | El pie no se ve mientras haya un esqueleto (`:has([aria-busy="true"], .animate-pulse)`); un elemento oculto no cuenta como desplazamiento |

## Resultados
| Pantalla | Puntaje | TBT | CLS | JS transferido |
|---|---|---|---|---|
| Ingreso de familias | 95 → 98 | 113 → 50 ms | 0 → 0 | 154 → 154 KB |
| Ingreso del equipo | 96 → 97 | 101 → 59 ms | 0 → 0 | 154 → 154 KB |
| Portal: inicio | 88 → 84* | 108 → 192 ms | 0,131 → **0** † | 156 → 156 KB |
| Portal: evolución | 92 → 93 | 130 → 103 ms | 0 → 0 | 156 → 156 KB |
| Portal: asistencia | 93 → 94 | 137 → 69 ms | 0,042 → 0,042 | 154 → 154 KB |
| Panel: inicio | 90 → 96 | 52 → 92 ms | 0,131 → **0** | 157 → 157 KB |
| Panel: lista de arqueros | 87 → 91 | 66 → 92 ms | 0,131 → **0** | 155 → 155 KB |
| Panel: toma de lista | 83 → 92 | 121 → 81 ms | 0,203 → 0,072 | 162 → 159 KB |
| **Panel: ficha del arquero** | **75 → 93** | **618 → 121 ms** | 0,131 → **0** | **327 → 199 KB** |

**JavaScript de primera carga sin comprimir, la ruta más pesada:** 1.704 KB → **628 KB**. Las páginas de video (staff y familia) pasaron de ~1,7 MB a ~610 KB, la ficha de 1.069 a 628 KB y el alta de 1.044 a 602 KB.

\* El puntaje del inicio del portal bajó 4 puntos y su TBT subió: es la variación entre corridas (±500 ms en LCP y decenas de ms en TBT entre dos corridas idénticas), no un efecto de los cambios, que no tocan esa pantalla.
† Medido en un build idéntico al final salvo por un experimento con la animación de entrada (descartado). El segundo escaneo del conjunto completo, con la regla del pie todavía sin cubrir el esqueleto de esa pantalla, mostraba 0,131.

## Lo que no mejoró, y por qué no se tocó
- **LCP de 2,4 a 3,3 s** (simulado). El servidor responde en 10 a 50 ms; el desglose lo atribuye al "retraso de renderizado" del elemento. Se probó la hipótesis de la animación de entrada (`rise-in`) desactivándola: el LCP **no mejoró** (2.436 → 2.970, 3.298 → 3.064, 3.344 → 3.621 ms), y entre corridas idénticas varía ±500 ms. Como no hay una causa medible, no se cambió nada. Conviene medirlo con datos reales de uso (ver "Pendiente").
- **JavaScript base de ~154 KB** en todas las pantallas: es React y Next. Lighthouse marca ~27 KB de React sin usar en el ingreso, que no se puede recortar desde la aplicación.
- **CLS de 0,042 y 0,072** en asistencia: dentro del umbral bueno (< 0,1).

## Reglas para no retroceder
- **Los archivos de `lib/` y `components/` no importan módulos de Node.** Si necesitan Node, se declaran `import "server-only"`. Lo exige `src/lib/client-safe.test.ts` (se comprobó que falla si se quita la marca de `pin.ts`).
- **Cualquier dependencia pesada de una sola pantalla** se carga de forma perezosa (como el reproductor), no en el bundle de la pantalla.
- Para volver a medir una ruta: `next experimental-analyze --output` y leer `.next/diagnostics/route-bundle-stats.json`.

## Pendiente
- **Medir con datos reales de uso** en producción (por ejemplo, Core Web Vitals de Vercel): Lighthouse simula la red y la CPU; el LCP real depende de la región del servidor respecto de la base de datos.
- **Las páginas de video con un video real.** El reproductor perezoso se verificó con el e2e de videos (pasa), pero no se midió con Lighthouse porque la escuela de prueba no tiene videos procesados.
- **Probar en un celular de gama baja real** la toma de lista con el grupo completo.
- Dependencias que hoy se cargan en el cliente solo para validar formularios: `zod` suma ~105 KB sin comprimir en la ficha y el alta. Es un candidato si se quiere bajar más; no se tocó porque no es el cuello de botella medido.
