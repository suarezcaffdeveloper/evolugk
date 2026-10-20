# 06 — Costos y condiciones comerciales

No hay un catálogo de planes en el MVP. Cada escuela tiene **condiciones a medida** que carga el operador: precio mensual en pesos, tope de arqueros activos y tope de minutos de video. Detalle en [specs/07-planes-y-suscripciones.md](../specs/07-planes-y-suscripciones.md).

Este documento reúne los costos de la plataforma para ayudar a decidir esos precios y topes en cada negociación.

## Qué define cada escuela
| Condición | Quién la define | Qué controla |
|---|---|---|
| Precio mensual (ARS) | Operador, por escuela | Lo que se cobra por fuera |
| Tope de arqueros activos | Operador, por escuela | Aviso al 90% y al superar el 100%; no bloquea |
| Tope de minutos de video | Operador, por escuela | Aviso al 80%; bloqueo de subidas al 100% |
| Período de prueba | Operador, al crear la escuela | Duración libre (por ejemplo 30 días) |

Los pagos se cobran por fuera del sistema y se registran a mano. Un pago puede cubrir uno o varios meses.

## Costo estimado del video
Escenario de referencia: 50 escuelas, 40 arqueros cada una (2.000 arqueros), 3 clips de 1 minuto por arquero por mes. Tras un año: ~72.000 minutos guardados y ~40.000 minutos vistos por mes.

| | Mux | Cloudflare Stream |
|---|---|---|
| Almacenamiento | ~US$0,0024/min; la mitad tras 30 días sin verse (~US$85–175/mes) | US$5 cada 1.000 min (~US$360/mes) |
| Reproducción | ~US$0,0008/min, 100.000 min gratis por mes (~US$0) | US$1 cada 1.000 min (~US$40/mes) |
| Total aprox. | ~US$90–175/mes | ~US$400/mes |

Equivale a **US$0,05–0,20 por arquero por mes**. Los precios de Mux no coinciden entre sus páginas; **confirmar en mux.com antes de fijar precios**. Fuentes: Mux (docs.mux.com/pricing) y Cloudflare (developers.cloudflare.com/stream/pricing).

El costo crece con los minutos acumulados, no con la cantidad de escuelas.

## Cómo usar esto al negociar
- Un arquero con 3 clips de 1 minuto por mes suma unos 36 minutos por año: sirve para estimar el tope de minutos según el tamaño de la escuela.
- Un tope de minutos bajo protege el costo; el operador puede subirlo en cualquier momento.
- El precio por escuela debería cubrir el video, más la parte proporcional de los costos fijos.

## Palancas de control
- Clips de hasta 3 minutos, no partidos completos.
- Tope de minutos por escuela, con bloqueo al 100%.
- Borrado manual de videos por el admin (el archivado automático queda fuera del MVP).
- Proveedor intercambiable (interfaz `VideoProvider`).

## Otros costos a estimar
Supabase (base de datos y storage), Vercel, mail transaccional, dominio, y la verificación en dos pasos del operador (sin costo si se usa una app de autenticación). A cotizar antes de fijar precios.
