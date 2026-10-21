# 01 — Visión y alcance

## Problema
Las escuelas de arqueros (porteros) de fútbol llevan el seguimiento de sus alumnos en planillas, WhatsApp y videos sueltos. Las familias no ven el progreso real del arquero y las escuelas no tienen una forma ordenada de demostrar la evolución ("mirá cómo llegó y cómo está hoy").

## Propuesta de valor
Una plataforma única (SaaS) donde cada escuela tiene su espacio, con foco en la **evolución individual del arquero**:
- Ficha del arquero y evaluaciones periódicas con una rúbrica estándar.
- Videos personalizados con comentarios del profesor.
- Portal para la familia con marca de la escuela.
- Gestión de apoyo: asistencia, seguimiento de cuotas, resumen de cobranza y avisos de vencimiento.

La gestión administrativa es soporte; el diferencial es el progreso.

## Usuarios
| Usuario | Qué busca |
|---|---|
| Dueño/admin de escuela | Ordenar alumnos y cuotas, mostrar resultados, retener familias |
| Profesor | Cargar asistencia, evaluaciones y videos rápido, desde el celular, en la cancha |
| Familia / arquero | Ver la evolución, los videos y el estado de cuota, sin crear cuenta |
| Operador de la plataforma (nosotros) | Dar de alta escuelas, definir sus condiciones, registrar sus pagos y controlar costos |

## Mercado y modelo
- Argentina (ARS). Avisos por mail al inicio; WhatsApp y MercadoPago a futuro.
- SaaS con suscripción mensual por escuela, con condiciones a medida: precio, tope de arqueros y tope de minutos de video. El cobro se hace por fuera del sistema.

## Alcance del MVP
1. Alta de escuela (por el operador), con logo y colores propios.
2. Usuarios de escuela: admin y profesor.
3. Grupos/categorías por edad.
4. Arqueros: ficha, tutores, consentimiento de la familia.
5. Evaluación trimestral con rúbrica fija y notas rápidas entre medio.
6. Videos privados con comentarios del profesor.
7. Portal de familia por código + PIN: ficha y evolución (radar), videos, asistencia y estado de cuota.
8. Asistencia por grupo, con un toque.
9. Cuotas: ciclo individual por arquero, registro manual del pago, resumen de cobranza mensual y mails de aviso de vencimiento. Sin montos ni cobro online.

## Fuera del MVP
Línea de tiempo con fotos e hitos, registro de partidos, objetivos y plan individual, informe PDF compartible, comparador de video lado a lado, dictado por voz y dibujo sobre el video, contenido para Instagram, WhatsApp, MercadoPago, multi-sede, rúbrica configurable, lesiones y carga física. Ver [07-roadmap](07-roadmap.md).

## Principios
- **Mobile-first para el profesor:** cargar una evaluación o un video no debe tomar más de un minuto.
- **Aislamiento total entre escuelas:** son datos de menores.
- **Sin fricción para la familia:** sin contraseñas.
- **Proveedor de video intercambiable.**

## Supuestos a confirmar
- "Una sola escuela simple" se interpreta como una sede por escuela, con grupos por edad y roles admin/profesor.
- Precio y topes de cada escuela: se negocian por separado (ver [06](06-planes-y-costos.md) y la [spec 07](../specs/07-planes-y-suscripciones.md)).
