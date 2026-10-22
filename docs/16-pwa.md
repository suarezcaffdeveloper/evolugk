# 16 — App instalable (PWA)

- **Estado:** Hito 7 (implementado)
- **Spec:** [04 — Portal de familia](../specs/04-portal-familia.md), RF-40

Cada escuela tiene **su propia app instalable**, con su nombre y su color. Se instala desde el navegador del celular y se abre desde la pantalla de inicio, sin barra del navegador.

## Qué publica cada escuela
| Ruta | Qué es |
|---|---|
| `/{slug}/manifest.webmanifest` | Manifest: nombre, nombre corto, color, `scope` y `start_url` de la escuela, e íconos |
| `/{slug}/icono/192.png`, `512.png` | Íconos comunes, con esquinas redondeadas |
| `/{slug}/icono/maskable-512.png` | Ícono recortable de Android: el fondo llega al borde y las iniciales quedan en la zona segura |
| `/{slug}/icono/180.png` | Ícono de iOS (`apple-touch-icon`): sin transparencia ni esquinas, iOS pone las suyas |

- **Se enlazan** desde el layout de la escuela (`generateMetadata`): `<link rel="manifest">`, ícono de iOS y nombre de la app. El color de la barra (`theme-color`) se renderiza dentro del layout y React lo sube al `<head>`: no puede ir en `generateViewport` porque con la caché de componentes esa función no admite datos de la escuela y rompe el build.
- **`scope` = `/{slug}/`:** la app instalada vive solo dentro de su escuela. Un link a otra escuela se abre en el navegador.
- **`start_url` = `/{slug}?origen=app`:** la portada. Con sesión de familia vigente redirige al portal; si la sesión venció, queda en el ingreso (spec 04, casos borde).
- **Escuela inexistente o suspendida:** 404 en el manifest y en los íconos, igual que sus pantallas (spec 00, RF-02). Un tamaño no declarado también da 404.
- **Caché corta** (5 minutos el manifest, 1 hora los íconos): si la escuela cambia nombre o color, la app lo toma pronto.

## El ícono
Son las **iniciales de la escuela sobre su color**, el mismo criterio del avatar de la pantalla (`initialsOf`). El color pasa por `resolveAccent`, así que las iniciales mantienen el contraste mínimo (4,5:1) sea cual sea el color elegido.

> **Todavía no hay logo.** `school.logo_url` existe en la base pero ninguna pantalla permite cargarlo: hoy todas las escuelas usan iniciales. Cuando exista la carga de logo, el ícono debería usarlo. Se deja afuera a propósito leer una URL arbitraria desde el servidor para generar el ícono (riesgo de SSRF): el logo tendría que subirse a un almacenamiento propio.

> Las letras llevan un trazo del mismo color para que se vean en negrita: `next/og` trae solo la fuente en peso normal y no lee `woff2`, el único formato de fuente del repo.

## Sugerencia de instalación (`components/install-prompt.tsx`)
Aparece **dentro del portal de familia** (después del primer ingreso, RF-40) y en el panel del equipo, donde el profesor toma lista desde el celular.

- **Android y Chrome/Edge:** botón "Instalar" que dispara el aviso nativo. Solo se muestra si el navegador confirmó que se puede instalar (`beforeinstallprompt`).
- **iPhone y iPad:** no existe ese botón; se explica el paso ("Compartir" → "Agregar a inicio").
- **No aparece** si la app ya está instalada, ni durante **30 días** después de tocar "Ahora no" (se recuerda en el navegador; sin almacenamiento, se sugiere igual).
- Las reglas (`lib/install-hint.ts`) son puras y tienen pruebas.

## Sin conexión
Instalar la app **no** la hace funcionar sin conexión: solo la toma de asistencia lo hace (ver [13 — Asistencia](13-asistencia.md)). El service worker no cambió.

## Pruebas
- Reglas puras: `src/lib/pwa.test.ts` (manifest, nombre corto, contraste del ícono) y `src/lib/install-hint.test.ts`.
- End-to-end: `e2e/pwa.spec.ts` (manifest e íconos de una escuela, 404 de una inexistente, sugerencia en iPhone). Contra el build: `E2E_PROD=1 E2E_PORT=3100 pnpm test:e2e e2e/pwa.spec.ts`.

## Pendiente para probar a mano
- Instalar en un **Android real** (Chrome): que aparezca el botón, que el ícono se vea bien con la forma que elija el celular y que la app se abra a pantalla completa.
- Instalar en un **iPhone real** (Safari): ícono, nombre y que la sesión de familia siga abierta al abrir desde el inicio. En iOS, la app instalada tiene su propio almacenamiento: la sesión del navegador no se hereda y hay que volver a ingresar.
- Con **HTTPS en producción**: la instalación no funciona sin él (en `localhost` sí).
