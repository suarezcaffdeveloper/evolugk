-- Hito 6: cuotas de los arqueros (spec 06) y suscripciones de las escuelas (spec 07).
-- Los nombres siguen docs/09-glosario.md.
--
-- Reglas de seguridad (igual que en los hitos anteriores):
--  * RLS activada en todas las tablas; toda escritura pasa por el servidor con la clave secreta.
--  * Las cuotas y sus avisos son solo del admin de la escuela (el profesor no las ve). La familia
--    no tiene cuenta de Supabase Auth: el servidor consulta filtrando por tutor vinculado.
--  * Las tablas de suscripción (pagos, cambios y alertas) son solo del operador: no tienen
--    ninguna política para el staff de las escuelas.

-- ───────────────────────────── goalkeeper: ciclo de cuotas y exención ─────────────────────────────
alter table public.goalkeeper
  add column fees_start_on date,
  add column fee_exempt boolean not null default false,
  add column fee_exempt_note text check (fee_exempt_note is null or char_length(fee_exempt_note) <= 300);

-- ───────────────────────────── fee ─────────────────────────────
-- Una cuota no guarda monto (RN-04). El estado guardado es 'open' (todavía sin resolver), 'paid'
-- o 'void'; "pendiente", "por vencer" y "vencida" se calculan por fecha (RF-11).
-- series_start_on es el inicio de cuotas con el que se generó: al reactivar a un arquero, quitar
-- una exención o cambiar el inicio, empieza una serie nueva y los números vuelven a 1 sin chocar
-- con las cuotas viejas.
create table public.fee (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.school (id) on delete cascade,
  goalkeeper_id uuid not null,
  series_start_on date not null,
  number integer not null check (number >= 1),
  due_on date not null,
  grace_until date not null,
  status text not null default 'open' check (status in ('open', 'paid', 'void')),
  paid_on date,
  is_automatic boolean not null default false,
  note text check (note is null or char_length(note) <= 300),
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, school_id),
  -- RN-02: no hay dos cuotas del mismo número en la misma serie de un arquero.
  unique (goalkeeper_id, series_start_on, number),
  foreign key (goalkeeper_id, school_id)
    references public.goalkeeper (id, school_id) on delete cascade,
  constraint fee_grace_after_due check (grace_until >= due_on),
  -- Una cuota pagada lleva su fecha de pago real; las demás no (RF-13).
  constraint fee_paid_on_consistency check ((status = 'paid') = (paid_on is not null))
);

create index fee_school_status_idx on public.fee (school_id, status, due_on);
create index fee_goalkeeper_idx on public.fee (goalkeeper_id, due_on desc);

create trigger fee_set_updated_at
  before update on public.fee
  for each row execute function app.set_updated_at();

-- ───────────────────────────── fee_revision ─────────────────────────────
-- Cada pago, deshacer, anulación o cambio de una cuota (RF-15): quién, cuándo y qué cambió.
create table public.fee_revision (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.school (id) on delete cascade,
  fee_id uuid not null,
  edited_by uuid references auth.users (id) on delete set null,
  edited_at timestamptz not null default now(),
  action text not null check (action in ('paid', 'unpaid', 'voided', 'restored', 'created', 'auto_paid', 'rescheduled')),
  old_status text,
  new_status text,
  old_paid_on date,
  new_paid_on date,
  note text check (note is null or char_length(note) <= 300),
  foreign key (fee_id, school_id) references public.fee (id, school_id) on delete cascade
);

create index fee_revision_fee_idx on public.fee_revision (fee_id, edited_at desc);
create index fee_revision_school_idx on public.fee_revision (school_id);

-- ───────────────────────────── notification_log ─────────────────────────────
-- Registro de envíos (RF-28): un aviso por cuota, tipo y destinatario, aunque el proceso diario
-- corra más de una vez. La fila se reserva ('pending') antes de enviar para que dos procesos
-- simultáneos no manden el mismo mail.
create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.school (id) on delete cascade,
  type text not null check (
    type in ('fee_5_days_before', 'fee_due_day', 'fee_grace_ends', 'fee_3_days_after')
  ),
  fee_id uuid not null,
  recipient text not null check (recipient = lower(btrim(recipient))),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  detail text check (detail is null or char_length(detail) <= 300),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  foreign key (fee_id, school_id) references public.fee (id, school_id) on delete cascade,
  unique (fee_id, type, recipient)
);

create index notification_log_school_idx on public.notification_log (school_id, created_at desc);

-- ───────────────────────────── subscription_payment ─────────────────────────────
create table public.subscription_payment (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.school (id) on delete cascade,
  paid_on date not null,
  amount_ars numeric(12, 2) not null check (amount_ars > 0),
  months_covered integer not null check (months_covered between 1 and 60),
  note text check (note is null or char_length(note) <= 300),
  recorded_by uuid references auth.users (id) on delete set null,
  -- "Cubierto hasta" antes de este pago: sirve para deshacerlo (CA-14).
  covered_before date not null,
  covered_after date not null,
  voided boolean not null default false,
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint subscription_payment_void_consistency check (voided = (voided_at is not null))
);

create index subscription_payment_school_idx on public.subscription_payment (school_id, paid_on desc);

-- ───────────────────────────── subscription_change ─────────────────────────────
create table public.subscription_change (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.school (id) on delete cascade,
  field text not null,
  old_value text,
  new_value text,
  note text check (note is null or char_length(note) <= 300),
  made_by uuid references auth.users (id) on delete set null,
  made_at timestamptz not null default now()
);

create index subscription_change_school_idx on public.subscription_change (school_id, made_at desc);

-- ───────────────────────────── platform_alert ─────────────────────────────
-- Alertas del operador (spec 07, RF-29 a RF-31). Se recalculan todos los días: una alerta
-- cuya causa desapareció se resuelve sola; el operador también puede descartarla.
create table public.platform_alert (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.school (id) on delete cascade,
  type text not null check (
    type in (
      'trial_ending', 'trial_expired', 'expiring_soon', 'overdue', 'grace_ended',
      'goalkeeper_limit_90', 'goalkeeper_limit_exceeded', 'video_limit_80', 'video_limit_100'
    )
  ),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  dismissed boolean not null default false,
  -- Se envió en el mail diario al operador (para mandar solo las novedades, RF-30).
  notified_at timestamptz,
  constraint platform_alert_dismissed_resolved check (not dismissed or resolved_at is not null)
);

-- Una sola alerta abierta por escuela y tipo.
create unique index platform_alert_one_open
  on public.platform_alert (school_id, type)
  where resolved_at is null;

create index platform_alert_open_idx on public.platform_alert (created_at desc) where resolved_at is null;

-- ───────────────────────────── privilegios y RLS ─────────────────────────────
revoke all on table
  public.fee, public.fee_revision, public.notification_log,
  public.subscription_payment, public.subscription_change, public.platform_alert
  from anon, authenticated;

-- Solo el admin de la escuela lee cuotas, su historial y los envíos (spec 06, RF-36).
grant select on table public.fee, public.fee_revision, public.notification_log to authenticated;

alter table public.fee enable row level security;
alter table public.fee_revision enable row level security;
alter table public.notification_log enable row level security;
alter table public.subscription_payment enable row level security;
alter table public.subscription_change enable row level security;
alter table public.platform_alert enable row level security;

create policy fee_select on public.fee
  for select to authenticated
  using (school_id = (select app.current_school_id()) and (select app.is_school_admin()));

create policy fee_revision_select on public.fee_revision
  for select to authenticated
  using (school_id = (select app.current_school_id()) and (select app.is_school_admin()));

create policy notification_log_select on public.notification_log
  for select to authenticated
  using (school_id = (select app.current_school_id()) and (select app.is_school_admin()));

-- subscription_payment, subscription_change y platform_alert: sin políticas ni privilegios. Los
-- lee y escribe solo el servidor con la clave secreta (rol de servicio), en nombre del operador.
