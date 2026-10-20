# 00 — Auth y tenancy

- **Estado:** Aprobada
- **Depende de:** nada (spec base)
- **Habilita:** todas las demás specs

## 1. Objetivo
Definir cómo se identifica a cada escuela, quién puede entrar y con qué credenciales, y cómo se garantiza que cada usuario vea solo los datos que le corresponden. Es la base de seguridad del sistema, que maneja datos de menores.

## 2. Alcance
**Entra:**
- Identificación de la escuela por ruta (`/{slug}`).
- Alta de escuelas por el operador de la plataforma.
- Login de staff (admin y profesor) con email y contraseña.
- Invitación de profesores por mail.
- Acceso de familia con código + PIN.
- Sesiones, bloqueo por intentos fallidos y revocación.
- Aislamiento de datos entre escuelas (RLS).

**No entra (MVP):**
- Link mágico para la familia (fase 2).
- Autoregistro de escuelas.
- Un usuario de staff en varias escuelas.
- Login con Google.
- Verificación en dos pasos.

## 3. Actores
| Actor | Descripción |
|---|---|
| Operador (`platform_admin`) | Equipo de la plataforma. Crea escuelas. |
| Admin de escuela (`school_admin`) | Gestiona su escuela, profesores y accesos de familias. |
| Profesor (`coach`) | Staff de la escuela. Ve a todos los arqueros. |
| Tutor (`guardian`) | Familiar con acceso al portal. |

## 4. Requisitos funcionales

### Tenancy
- **RF-01** Cada escuela tiene un `slug` único; toda su interfaz vive bajo `/{slug}`.
- **RF-02** El `slug` se resuelve en el middleware a un `school_id`; un slug inexistente o de una escuela suspendida muestra una pantalla de error neutra.
- **RF-03** Toda tabla de negocio incluye `school_id`, y la base de datos impide leer o escribir filas de otra escuela aunque el código de la aplicación falle (RLS).
- **RF-04** Cada escuela muestra su logo y colores en el login y en el portal.

### Alta de escuelas
- **RF-05** Solo el operador crea escuelas (nombre, slug, email del primer admin y condiciones de la suscripción según la [spec 07](07-planes-y-suscripciones.md)).
- **RF-06** Al crear la escuela se envía una invitación por mail al primer admin para crear su contraseña.
- **RF-06b** Una escuela puede tener varios admins; cualquier admin puede invitar a otros admins y a profesores.
- **RF-06c** El slug tiene entre 3 y 30 caracteres (minúsculas, números y guiones), es fijo tras el alta y solo lo cambia el operador. Se reservan palabras como `admin`, `api`, `login`, `app`.
- **RF-06d** El operador entra con email, contraseña y verificación en dos pasos.
- **RF-06e** El operador puede suspender y reactivar una escuela.

### Staff (admin y profesor)
- **RF-07** Login con email y contraseña (mínimo 8 caracteres).
- **RF-08** Sesión de 30 días.
- **RF-09** Recuperación de contraseña por mail.
- **RF-10** El admin invita profesores por mail; el profesor abre el link y crea su contraseña.
- **RF-11** El invitado queda asociado a la escuela que lo invitó.
- **RF-12** Una cuenta pertenece a una sola escuela.
- **RF-13** El admin puede desactivar a un profesor; el acceso se pierde de inmediato.

### Acceso de familia
- **RF-14** El código de acceso es **por tutor**; un tutor con varios hijos ve a todos al entrar.
- **RF-15** La escuela genera el código y un PIN inicial de 6 dígitos y se los entrega al tutor fuera del sistema (WhatsApp, en mano, etc.). El PIN inicial se muestra **una sola vez** al generarlo; si se pierde, se resetea.
- **RF-16** Con el PIN inicial el tutor ingresa y puede cambiarlo. Se rechazan PIN con dígitos repetidos (111111) o secuencias (123456, 654321).
- **RF-17** Sesión de familia de 30 días, revocable por el admin.
- **RF-18** 5 intentos de PIN fallidos bloquean el acceso 15 minutos; el admin puede desbloquear antes.
- **RF-19** Si el tutor olvida el PIN, el admin lo resetea y se genera uno nuevo.
- **RF-20** El admin puede revocar el acceso de un tutor sin afectar a otros tutores del mismo arquero.

### Autorización
- **RF-21** Los profesores ven a todos los arqueros de su escuela; los grupos son organizativos y no restringen el acceso.
- **RF-22** Los profesores pueden cargar evaluaciones, notas y videos en cualquier arquero de su escuela; los datos personales y la baja de arqueros son del admin.
- **RF-23** Los profesores no acceden a cuotas ni pagos.
- **RF-24** El tutor solo ve arqueros vinculados a él, y solo lo marcado como visible para la familia.
- **RF-25** La matriz completa está en [docs/02-roles-y-permisos.md](../docs/02-roles-y-permisos.md).

## 5. Reglas de negocio
- **RN-01** Un `slug` es único en toda la plataforma.
- **RN-02** El código de acceso es único en toda la plataforma.
- **RN-03** El PIN se guarda siempre hasheado; nunca en claro.
- **RN-04** Un tutor pertenece a una sola escuela.
- **RN-05** El `school_id` de una sesión no se puede cambiar sin volver a autenticarse.
- **RN-06** Toda acción sensible queda en `audit_log`: creación de escuela, invitación, desactivación de profesor, reset o revocación de acceso.
- **RN-07** Las invitaciones por mail vencen a los 7 días y se pueden reenviar.
- **RN-08** Un tutor requiere nombre, apellido y teléfono; el mail es opcional.
- **RN-09** Una escuela suspendida conserva todos sus datos intactos durante 90 días; después el operador decide si borrarla. El borrado definitivo es manual.

## 6. Datos involucrados
Ver [docs/03-modelo-de-datos.md](../docs/03-modelo-de-datos.md): `school`, `profile`, `guardian`, `guardian_session`, `audit_log`. Campos a agregar o confirmar en `guardian`: `pin_intentos_fallidos`, `bloqueado_hasta`, `pin_cambiado` (si ya reemplazó el PIN inicial). Falta tabla de invitaciones (`invitation`: email, school_id, rol, token hasheado, vence_en, usada_en).

## 7. Flujos

**F1 — Alta de escuela:** operador completa el formulario → se crea `school` → se envía invitación al admin → el admin crea contraseña → entra a `/{slug}`.

**F2 — Invitar profesor:** admin carga email → se envía invitación → el profesor abre el link, crea contraseña → queda asociado a la escuela.

**F3 — Acceso de familia:** admin genera código y PIN del tutor → los entrega → el tutor entra en `/{slug}` con código y PIN → se crea sesión de 30 días → ve a sus arqueros.

**F4 — PIN bloqueado:** 5 fallos → bloqueo de 15 min → el tutor espera o pide al admin que desbloquee.

**F5 — PIN olvidado:** el tutor pide al admin → el admin resetea → se genera PIN inicial nuevo → el tutor ingresa y lo cambia.

## 8. Criterios de aceptación
- **CA-01** Dado un usuario de la escuela A, cuando consulta cualquier dato con el id de una fila de la escuela B, entonces no obtiene resultados ni errores que revelen que existe.
- **CA-02** Dado un profesor, cuando intenta abrir cuotas o pagos, entonces recibe un acceso denegado.
- **CA-03** Dado un tutor con 2 hijos, cuando ingresa con su código y PIN, entonces ve a ambos y a ningún otro arquero.
- **CA-04** Dado un tutor que falla el PIN 5 veces, cuando intenta una sexta vez antes de 15 minutos, entonces se le rechaza aunque el PIN sea correcto.
- **CA-05** Dado un admin que revoca la sesión de un tutor, cuando el tutor recarga el portal, entonces debe volver a ingresar.
- **CA-06** Dado un profesor desactivado, cuando intenta cualquier acción, entonces se le deniega.
- **CA-07** Dado un slug inexistente, cuando se abre `/{slug}`, entonces se ve una pantalla de error neutra sin datos de otras escuelas.
- **CA-08** Existen pruebas automáticas de aislamiento entre escuelas para cada tabla con `school_id`.

## 9. Casos borde
- Dos escuelas piden el mismo slug: se rechaza el segundo.
- Invitación vencida o ya usada: el link muestra error y el admin puede reenviar.
- Email invitado ya registrado en otra escuela: se rechaza (una cuenta por escuela).
- El admin deja a la escuela sin ningún admin activo: no se permite desactivar al último admin.
- Un tutor cambia su PIN a uno muy débil (ej. `123456`, `000000`): se rechaza.
- Se desactiva a un profesor con sesión abierta: la sesión deja de valer en la próxima petición.
- Escuela suspendida: ni staff ni familia pueden entrar.

## 10. Seguridad y privacidad
- RLS en todas las tablas con `school_id`; el `school_id` y el rol viajan en la sesión.
- PIN hasheado; intentos limitados; sin mensajes que revelen si un código existe.
- Tokens de invitación de un solo uso, guardados hasheados, con vencimiento.
- La sesión de familia usa token firmado con duración limitada y revocable.
- Registro de auditoría de acciones sensibles.

## 11. Preguntas abiertas
Ninguna pendiente. Para especificar más adelante, en otras specs:
- Qué avisos recibe un tutor sin mail (spec de pagos y avisos).
- Qué ve el tutor durante el período de suspensión de la escuela (mensaje al ingresar).
