# 02 — Roles y permisos

## Roles
| Rol | Autenticación | Alcance |
|---|---|---|
| `platform_admin` | Email + contraseña (Supabase Auth) | Toda la plataforma |
| `school_admin` | Email + contraseña | Su escuela |
| `coach` (profesor) | Email + contraseña | Su escuela; todos los arqueros (los grupos son organizativos) |
| `guardian` (familia/arquero) | Código + PIN | Solo los arqueros vinculados |

## Matriz de permisos (MVP)
| Acción | platform_admin | school_admin | coach | guardian |
|---|:-:|:-:|:-:|:-:|
| Crear/suspender/reactivar escuelas, definir condiciones y registrar pagos de la suscripción | ✔ | | | |
| Ver uso y costo de video por escuela | ✔ | ✔ (propio) | | |
| Configurar marca (logo, colores) | | ✔ | | |
| Gestionar usuarios de la escuela | | ✔ | | |
| Gestionar grupos | | ✔ | | |
| Alta/edición de arqueros y tutores | | ✔ | | |
| Registrar consentimiento | | ✔ | | |
| Tomar asistencia | | ✔ | ✔ | |
| Cargar evaluaciones y notas | | ✔ | ✔ (cualquier arquero) | |
| Subir videos y comentarios | | ✔ | ✔ (cualquier arquero) | |
| Dictar comentarios, dibujar sobre videos y crear comparaciones *(Fase 2)* | | ✔ | ✔ (cualquier arquero) | |
| Ver anotaciones y comparaciones publicadas *(Fase 2)* | | ✔ | ✔ | ✔ (sus arqueros) |
| Ver, aprobar y descargar piezas para redes *(Fase 2)* | | ✔ | | |
| Dar o retirar el consentimiento de redes *(Fase 2)* | | | | ✔ |
| Registrar pagos de cuotas, ver resumen de cobranza | | ✔ | | |
| Ver ficha, evolución y videos | | ✔ | ✔ (todos) | ✔ (sus arqueros) |
| Ver asistencia y estado de cuota propios | | ✔ | | ✔ |

## Reglas
- El profesor **no ve** información económica.
- La familia ve solo lo marcado como visible. Las notas internas del profesor tienen un flag `visible_to_family` (por defecto falso).
- Un tutor puede estar vinculado a varios arqueros (hermanos).
- Un arquero puede tener varios tutores.
- Toda acción sensible (alta de pago, borrado de video, cambio de consentimiento) queda en un registro de auditoría.

## Acceso de familia
1. La escuela genera un código de acceso por tutor, con un PIN inicial de 6 dígitos que el tutor puede cambiar.
2. Sesión de familia de 30 días, revocable por la escuela.
3. 5 intentos fallidos de PIN bloquean 15 minutos; el admin puede desbloquear antes.
4. PIN olvidado: lo resetea el admin.
5. Link mágico: fuera del MVP.

Detalle completo en [specs/00-auth-y-tenancy.md](../specs/00-auth-y-tenancy.md).
