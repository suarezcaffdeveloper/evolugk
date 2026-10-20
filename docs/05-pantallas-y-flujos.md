# 05 — Pantallas y flujos (MVP)

## Profesor (mobile-first)
Pantallas:
1. **Inicio:** mis grupos, acción rápida "Tomar asistencia".
2. **Asistencia:** lista del grupo, un toque por presente/ausente, guardar.
3. **Arquero (ficha):** datos, radar de evolución, evaluaciones, notas, videos.
4. **Nueva evaluación:** 7 categorías con control de 1–10, comentario, "visible para la familia".
5. **Nota rápida:** texto corto, flag de visibilidad.
6. **Subir video:** grabar o elegir clip, título, tema, comentarios con marca de tiempo.

Flujo de cancha: Inicio → Asistencia (≤ 30 s) → entrada a un arquero → grabar clip → título → listo.
Meta: evaluación completa en menos de 1 minuto.

## Admin de escuela
- **Panel:** arqueros activos, cuotas vencidas, avisos de faltas seguidas, uso de arqueros y de video contra los topes.
- **Mi plan:** arqueros activos y minutos de video contra sus topes, estado de la suscripción y próximo vencimiento (sin precio).
- **Arqueros:** alta/edición, grupo, tutores, consentimiento.
- **Grupos y profesores:** crear grupos, invitar profesores, asignar grupos.
- **Cuotas:** panel de por vencer y vencidas, registrar pago, resumen de cobranza mensual (sin montos).
- **Acceso de familias:** generar código y PIN, enviar link mágico, revocar sesiones.
- **Marca:** logo y colores.

## Familia
Pantallas (con marca de la escuela):
1. **Ingreso:** código + PIN.
2. **Selector de arquero** (si hay varios hijos).
3. **Evolución:** gráfico radar actual y comparación "ingreso vs. hoy"; historial de evaluaciones.
4. **Videos:** lista por fecha y tema, reproductor con comentarios.
5. **Asistencia y cuota:** porcentaje de asistencia, estado de cuota (al día / vence / vencida).

## Plataforma (operador)
- Alta de escuela con condiciones a medida (precio, topes, prueba), registro de pagos, estado de cuenta, suspensión y reactivación, panel de alertas, resumen de ingresos y uso de video.

## Flujos críticos
1. **Alta de arquero:** crear arquero → vincular tutor → registrar consentimiento → generar acceso.
2. **Evaluación trimestral:** elegir arquero → puntajes → guardar → aparece en el radar de la familia si está marcada visible.
3. **Video:** subida directa → procesando → listo → visible a la familia.
4. **Vencimiento:** cron → mail al tutor → registro de envío.

## Estados vacíos y errores
- Sin evaluaciones: invitar a cargar la primera.
- Video procesando o con error: mostrar estado y reintentar.
- Tope de minutos de video alcanzado: aviso claro al profesor y al admin.
