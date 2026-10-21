# 07 — Roadmap

## Fase 1 — MVP
1. Base: proyecto Next.js, Supabase, multi-tenant, RLS y pruebas de aislamiento.
2. Escuelas, usuarios, invitaciones, grupos y marca. Panel del operador (altas, condiciones, pagos y alertas).
3. Arqueros, tutores, consentimiento e importación masiva.
4. Evaluaciones y notas, radar de evolución.
5. Videos privados con comentarios y control de cuota.
6. Portal de familia (código + PIN), con modo claro y oscuro.
7. Asistencia, con toma de lista sin conexión.
8. Cuotas de arqueros con ciclo individual, mails de aviso y resumen de cobranza.
9. PWA y pulido mobile para el profesor.

## Fase 2
- Línea de tiempo con fotos e hitos.
- Informe PDF compartible, con permiso de la familia.
- Comparador de video lado a lado, con comparaciones guardadas y publicadas para la familia ([spec 03](../specs/03-videos.md), sección 12).
- Dictado por voz de comentarios de video (se transcribe a texto y no se guarda el audio).
- Dibujo sobre el video (anotaciones vectoriales sobre un cuadro pausado).
- Contenido para Instagram: piezas con la marca de la escuela listas para descargar y publicar a mano, con consentimiento de redes aparte ([spec 08](../specs/08-contenido-redes.md)).
- Objetivos y plan de trabajo individual.
- Link mágico para la familia.
- Exportar a Excel/CSV los informes de asistencia y cobranza.
- Archivado automático de videos viejos.

## Fase 3
- Registro de partidos (atajadas, goles recibidos, valla invicta, videos de jugadas).
- WhatsApp para avisos.
- Montos de cuotas y cobro online con MercadoPago y conciliación.
- Cobro automático de la suscripción de las escuelas.
- Catálogo de planes fijos, si el volumen lo justifica.
- Multi-sede.
- Rúbrica configurable por escuela.
- Lesiones y carga física.

## Orden de specs
`00-auth-y-tenancy` → `01-arqueros-y-fichas` → `02-evaluaciones` → `03-videos` → `04-portal-familia` → `05-asistencia` → `06-pagos-y-avisos` → `07-planes-y-suscripciones` → `08-contenido-redes` (Fase 2).

## Tareas de contenido previas al lanzamiento
- Redactar y validar las guías de puntajes de las 8 categorías de la rúbrica.
- Redactar y revisar con un profesional el texto del consentimiento, la política de privacidad y los términos de uso.
- Confirmar los precios vigentes de Mux (o del proveedor de video elegido), Supabase y Vercel.
- Antes de lanzar la Fase 2: redactar y revisar con un profesional el consentimiento de uso en redes, y elegir el proveedor de voz a texto (precio, español rioplatense y no retención del audio).
