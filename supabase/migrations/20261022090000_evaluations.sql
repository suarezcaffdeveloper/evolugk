-- Hito 3: evaluaciones, rúbrica, notas y novedades de la familia (specs 02 y 04).
-- Los nombres siguen docs/09-glosario.md.
--
-- Reglas de seguridad (igual que en los hitos 1 y 2):
--  * RLS activada en todas las tablas; el staff de la escuela solo LEE. Toda escritura pasa por
--    el servidor con la clave secreta.
--  * La familia no tiene cuenta de Supabase Auth: el servidor consulta con la clave secreta
--    filtrando por tutor vinculado, evaluaciones publicadas y notas visibles. Estas tablas no
--    tienen ninguna política para tutores.
--  * Cada tabla hija lleva school_id y una clave foránea compuesta (id, school_id): una fila no
--    puede apuntar a un registro de otra escuela.
--  * Los borradores los ven solo su autor y los admins (spec 02, RF-11), tampoco por SQL directo.

-- ───────────────────────────── rúbrica (global y fija) ─────────────────────────────
create table public.rubric_version (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique check (version > 0),
  valid_from date not null,
  created_at timestamptz not null default now()
);

create table public.rubric_category (
  id uuid primary key default gen_random_uuid(),
  rubric_version_id uuid not null references public.rubric_version (id) on delete restrict,
  key text not null check (key ~ '^[a-z_]+$'),
  name text not null,
  position smallint not null check (position > 0),
  guide_low text not null,
  guide_mid text not null,
  guide_high text not null,
  unique (rubric_version_id, key),
  unique (rubric_version_id, position)
);

-- ───────────────────────────── evaluation ─────────────────────────────
create table public.evaluation (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.school (id) on delete cascade,
  goalkeeper_id uuid not null,
  -- Nunca se borra a un usuario (solo se desactiva), pero si ocurriera la evaluación se conserva.
  author_id uuid references auth.users (id) on delete set null,
  rubric_version_id uuid not null references public.rubric_version (id) on delete restrict,
  date date not null,
  type text not null check (type in ('entry', 'periodic')),
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  -- Se completa al mandar el mail a la familia: republicar no vuelve a avisar (spec 02, casos borde).
  notified_at timestamptz,
  comment text check (comment is null or char_length(comment) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, school_id),
  foreign key (goalkeeper_id, school_id)
    references public.goalkeeper (id, school_id) on delete cascade,
  -- RN-07: una evaluación no puede tener fecha futura.
  constraint evaluation_date_not_future check (date <= current_date),
  constraint evaluation_published_has_date check ((status = 'published') = (published_at is not null))
);

-- RN-02: a lo sumo una evaluación de ingreso por arquero.
create unique index evaluation_one_entry
  on public.evaluation (goalkeeper_id)
  where type = 'entry';

create index evaluation_lookup_idx
  on public.evaluation (school_id, goalkeeper_id, date desc, created_at desc);
create index evaluation_author_idx on public.evaluation (author_id);

create trigger evaluation_set_updated_at
  before update on public.evaluation
  for each row execute function app.set_updated_at();

-- RF-08 y CA-09: solo se evalúa a arqueros activos. El servidor lo valida primero; esto es la red de seguridad.
create or replace function app.require_active_goalkeeper()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.goalkeeper g
    where g.id = new.goalkeeper_id and g.school_id = new.school_id and g.status = 'active'
  ) then
    raise exception 'goalkeeper_not_active' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger evaluation_requires_active_goalkeeper
  before insert on public.evaluation
  for each row execute function app.require_active_goalkeeper();

-- ───────────────────────────── evaluation_score ─────────────────────────────
-- Una categoría omitida (RF-07) simplemente no tiene fila, o la tiene con puntaje nulo y solo comentario.
create table public.evaluation_score (
  evaluation_id uuid not null,
  category_id uuid not null references public.rubric_category (id) on delete restrict,
  school_id uuid not null references public.school (id) on delete cascade,
  score smallint check (score is null or score between 1 and 10),
  comment text check (comment is null or char_length(comment) <= 500),
  primary key (evaluation_id, category_id),
  foreign key (evaluation_id, school_id)
    references public.evaluation (id, school_id) on delete cascade,
  constraint score_or_comment check (score is not null or comment is not null)
);

create index evaluation_score_school_idx on public.evaluation_score (school_id);

-- ───────────────────────────── evaluation_revision ─────────────────────────────
create table public.evaluation_revision (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.school (id) on delete cascade,
  evaluation_id uuid not null,
  edited_by uuid references auth.users (id) on delete set null,
  edited_at timestamptz not null default now(),
  detail jsonb not null default '{}'::jsonb,
  foreign key (evaluation_id, school_id)
    references public.evaluation (id, school_id) on delete cascade
);

create index evaluation_revision_lookup_idx
  on public.evaluation_revision (evaluation_id, edited_at desc);
create index evaluation_revision_school_idx on public.evaluation_revision (school_id);

-- ───────────────────────────── note ─────────────────────────────
create table public.note (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.school (id) on delete cascade,
  goalkeeper_id uuid not null,
  author_id uuid references auth.users (id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  -- RF-19: por defecto interna; la familia la ve solo si el profesor la marca.
  visible_to_family boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (goalkeeper_id, school_id)
    references public.goalkeeper (id, school_id) on delete cascade
);

create index note_lookup_idx on public.note (school_id, goalkeeper_id, created_at desc);

-- ───────────────────────────── guardian_seen ─────────────────────────────
-- Indicador "nuevo" del portal (spec 04, RF-38 y RF-39): qué novedades ya abrió cada tutor.
create table public.guardian_seen (
  guardian_id uuid not null,
  goalkeeper_id uuid not null,
  school_id uuid not null references public.school (id) on delete cascade,
  kind text not null check (kind in ('evaluation', 'note', 'video')),
  ref_id uuid not null,
  seen_at timestamptz not null default now(),
  primary key (guardian_id, kind, ref_id),
  foreign key (guardian_id, school_id) references public.guardian (id, school_id) on delete cascade,
  foreign key (goalkeeper_id, school_id)
    references public.goalkeeper (id, school_id) on delete cascade
);

create index guardian_seen_goalkeeper_idx on public.guardian_seen (goalkeeper_id);
create index guardian_seen_school_idx on public.guardian_seen (school_id);

-- ───────────────────────────── privilegios y RLS ─────────────────────────────
revoke all on table
  public.rubric_version, public.rubric_category, public.evaluation, public.evaluation_score,
  public.evaluation_revision, public.note, public.guardian_seen
  from anon, authenticated;

grant select on table
  public.rubric_version, public.rubric_category, public.evaluation, public.evaluation_score,
  public.evaluation_revision, public.note
  to authenticated;

-- guardian_seen: sin ningún acceso desde internet (solo el servidor).

alter table public.rubric_version enable row level security;
alter table public.rubric_category enable row level security;
alter table public.evaluation enable row level security;
alter table public.evaluation_score enable row level security;
alter table public.evaluation_revision enable row level security;
alter table public.note enable row level security;
alter table public.guardian_seen enable row level security;

-- Rúbrica: lectura para todo usuario con sesión; escritura solo con la clave secreta (operador).
create policy rubric_version_select on public.rubric_version
  for select to authenticated
  using (true);

create policy rubric_category_select on public.rubric_category
  for select to authenticated
  using (true);

-- Evaluaciones: el staff ve las publicadas de su escuela; los borradores, solo su autor y los admins.
create policy evaluation_select on public.evaluation
  for select to authenticated
  using (
    school_id = (select app.current_school_id())
    and (
      status = 'published'
      or author_id = (select auth.uid())
      or (select app.is_school_admin())
    )
  );

-- Puntajes y revisiones siguen la visibilidad de su evaluación (la subconsulta ya aplica la política anterior).
create policy evaluation_score_select on public.evaluation_score
  for select to authenticated
  using (
    school_id = (select app.current_school_id())
    and exists (
      select 1 from public.evaluation e
      where e.id = evaluation_score.evaluation_id and e.school_id = evaluation_score.school_id
    )
  );

create policy evaluation_revision_select on public.evaluation_revision
  for select to authenticated
  using (
    school_id = (select app.current_school_id())
    and exists (
      select 1 from public.evaluation e
      where e.id = evaluation_revision.evaluation_id and e.school_id = evaluation_revision.school_id
    )
  );

-- Notas: todo el staff de la escuela ve las notas (internas y visibles).
create policy note_select on public.note
  for select to authenticated
  using (school_id = (select app.current_school_id()));

-- guardian_seen: RLS activada y sin políticas = nadie, salvo la clave secreta.

-- ───────────────────────────── rúbrica estándar, versión 1 ─────────────────────────────
-- Las guías son un borrador de la plataforma; antes del lanzamiento las valida una persona del
-- ámbito del arquero (spec 02, RF-04c). Se corrigen con una migración nueva.
insert into public.rubric_version (id, version, valid_from)
values ('00000000-0000-4000-8000-000000000001', 1, '2026-01-01');

insert into public.rubric_category
  (rubric_version_id, key, name, position, guide_low, guide_mid, guide_high)
values
  ('00000000-0000-4000-8000-000000000001', 'save_technique', 'Atajada', 1,
   'Le cuesta ubicar el cuerpo detrás de la pelota; suelta o rechaza al medio.',
   'Ataja bien los tiros simples; duda con los potentes, los rasantes o los esquinados.',
   'Elige bien entre atrapar, desviar o rechazar, y retiene con seguridad.'),
  ('00000000-0000-4000-8000-000000000001', 'aerial_play', 'Juego aéreo', 2,
   'Evita salir en los centros o llega tarde; golpea la pelota sin control.',
   'Sale a los centros claros; todavía duda cuando hay rivales o la pelota es lejana.',
   'Domina el área: decide rápido, sale con firmeza y gana el balón en el aire.'),
  ('00000000-0000-4000-8000-000000000001', 'footwork', 'Juego con los pies', 3,
   'Despeja sin dirección o se complica con la pelota en los pies.',
   'Pasa bien a corta distancia y con su pie hábil; le cuesta con el otro pie o bajo presión.',
   'Resuelve con ambos pies, elige bien el pase y ayuda a salir jugando.'),
  ('00000000-0000-4000-8000-000000000001', 'positioning', 'Posicionamiento', 4,
   'Se queda pegado a la línea o se adelanta sin criterio; no ajusta su posición.',
   'Se ubica bien en situaciones habituales; se desacomoda en jugadas rápidas o con varios rivales.',
   'Anticipa la jugada y ajusta su posición todo el tiempo para achicar los ángulos.'),
  ('00000000-0000-4000-8000-000000000001', 'reflexes', 'Reflejos', 5,
   'Reacciona tarde ante tiros cercanos o con desvíos.',
   'Responde bien cuando ve venir el remate; le cuesta cuando la pelota cambia de dirección.',
   'Reacciona al instante, explosivo, incluso en jugadas inesperadas.'),
  ('00000000-0000-4000-8000-000000000001', 'communication', 'Comunicación', 6,
   'Casi no habla con la defensa; no organiza ni pide la pelota.',
   'Da indicaciones cuando se lo piden o en jugadas claras; le falta constancia.',
   'Dirige a la defensa con voz clara y a tiempo durante todo el partido.'),
  ('00000000-0000-4000-8000-000000000001', 'physical_coordination', 'Físico y coordinación', 7,
   'Se desequilibra al saltar o caer; poca agilidad y velocidad de piernas.',
   'Buena base física; la coordinación falla en movimientos combinados o al fatigarse.',
   'Ágil, coordinado y fuerte; se recupera rápido y repite esfuerzos sin perder técnica.'),
  ('00000000-0000-4000-8000-000000000001', 'mindset', 'Mentalidad', 8,
   'Se frustra con los errores, pierde la concentración o evita el protagonismo.',
   'Mantiene la concentración en general; le cuesta reponerse después de un error.',
   'Seguro y concentrado; se levanta rápido de los errores y quiere la responsabilidad.');
