-- Hito 4: videos, comentarios, vínculo con evaluaciones y cola de avisos (specs 03 y 04).
-- Los nombres siguen docs/09-glosario.md.
--
-- Reglas de seguridad (igual que en los hitos anteriores):
--  * RLS activada en todas las tablas; el staff de la escuela solo LEE. Toda escritura pasa por
--    el servidor con la clave secreta.
--  * La familia no tiene cuenta de Supabase Auth: el servidor consulta con la clave secreta,
--    filtrando por tutor vinculado, video publicado y consentimiento vigente. Estas tablas no
--    tienen ninguna política para tutores.
--  * Cada tabla hija lleva school_id y una clave foránea compuesta (id, school_id).
--  * El proveedor de video (Mux) recibe solo el archivo y el id del video: ningún dato personal.

-- ───────────────────────────── video ─────────────────────────────
create table public.video (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.school (id) on delete cascade,
  goalkeeper_id uuid not null,
  -- Nunca se borra a un usuario (solo se desactiva): sus videos se conservan con su nombre.
  author_id uuid references auth.users (id) on delete set null,
  -- Se guarda el proveedor para poder migrar (docs/03, notas).
  provider text not null default 'mux' check (provider in ('mux')),
  provider_upload_id text,
  provider_asset_id text,
  provider_playback_id text,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  -- Una categoría de la rúbrica (clave) u "other" (spec 03, RF-07).
  topic text not null check (
    topic in (
      'save_technique', 'aerial_play', 'footwork', 'positioning', 'reflexes', 'communication',
      'physical_coordination', 'mindset', 'other'
    )
  ),
  duration_sec numeric(8, 2) check (duration_sec is null or duration_sec >= 0),
  processing_status text not null default 'uploading'
    check (processing_status in ('uploading', 'processing', 'ready', 'error')),
  error_reason text check (error_reason is null or char_length(error_reason) <= 300),
  publication_status text not null default 'draft'
    check (publication_status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, school_id),
  foreign key (goalkeeper_id, school_id)
    references public.goalkeeper (id, school_id) on delete cascade,
  -- RF-11: solo se publica un video que terminó de procesarse.
  constraint video_published_is_ready check (
    publication_status = 'draft' or processing_status = 'ready'
  ),
  constraint video_published_has_date check (
    (publication_status = 'published') = (published_at is not null)
  )
);

create index video_lookup_idx on public.video (school_id, goalkeeper_id, created_at desc);
create index video_author_idx on public.video (author_id);
create index video_upload_idx on public.video (provider_upload_id) where provider_upload_id is not null;
create index video_asset_idx on public.video (provider_asset_id) where provider_asset_id is not null;

create trigger video_set_updated_at
  before update on public.video
  for each row execute function app.set_updated_at();

-- RF-03: solo se sube a arqueros activos y con consentimiento vigente. El servidor lo valida
-- primero (con mensajes claros); esto es la red de seguridad.
create or replace function app.require_video_allowed()
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
  if not exists (
    select 1 from public.consent c
    where c.goalkeeper_id = new.goalkeeper_id and c.school_id = new.school_id
      and c.type = 'media' and c.revoked_at is null
  ) then
    raise exception 'consent_required' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger video_requires_allowed
  before insert on public.video
  for each row execute function app.require_video_allowed();

-- ───────────────────────────── video_comment ─────────────────────────────
create table public.video_comment (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.school (id) on delete cascade,
  video_id uuid not null,
  author_id uuid references auth.users (id) on delete set null,
  -- Segundo del video; nulo si el comentario es general (RF-15).
  second integer check (second is null or second >= 0),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (video_id, school_id) references public.video (id, school_id) on delete cascade
);

create index video_comment_lookup_idx on public.video_comment (video_id, second, created_at);
create index video_comment_school_idx on public.video_comment (school_id);

create trigger video_comment_set_updated_at
  before update on public.video_comment
  for each row execute function app.set_updated_at();

-- ───────────────────────────── evaluation_video ─────────────────────────────
create table public.evaluation_video (
  evaluation_id uuid not null,
  video_id uuid not null,
  school_id uuid not null references public.school (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (evaluation_id, video_id),
  foreign key (evaluation_id, school_id)
    references public.evaluation (id, school_id) on delete cascade,
  foreign key (video_id, school_id) references public.video (id, school_id) on delete cascade
);

create index evaluation_video_video_idx on public.evaluation_video (video_id);
create index evaluation_video_school_idx on public.evaluation_video (school_id);

-- RF-19: un video solo respalda evaluaciones del mismo arquero.
create or replace function app.require_same_goalkeeper_for_evaluation_video()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select goalkeeper_id from public.evaluation where id = new.evaluation_id)
     is distinct from (select goalkeeper_id from public.video where id = new.video_id) then
    raise exception 'video_goalkeeper_mismatch' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger evaluation_video_same_goalkeeper
  before insert on public.evaluation_video
  for each row execute function app.require_same_goalkeeper_for_evaluation_video();

-- ───────────────────────────── video_notice ─────────────────────────────
-- Cola del mail "video publicado": los que se publican seguidos se agrupan en una ventana de
-- 30 minutos (spec 03, RF-13). Solo la usa el servidor.
create table public.video_notice (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.school (id) on delete cascade,
  goalkeeper_id uuid not null,
  video_id uuid not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  foreign key (goalkeeper_id, school_id)
    references public.goalkeeper (id, school_id) on delete cascade,
  foreign key (video_id, school_id) references public.video (id, school_id) on delete cascade,
  -- Un video se avisa una sola vez, aunque se despublique y se vuelva a publicar.
  unique (video_id)
);

create index video_notice_pending_idx on public.video_notice (goalkeeper_id, created_at)
  where sent_at is null;
create index video_notice_school_idx on public.video_notice (school_id);

-- ───────────────────────────── video_provider_cleanup ─────────────────────────────
-- Borrados pendientes en el proveedor (spec 03, caso borde): el video ya no figura en la
-- aplicación, pero el archivo del proveedor se sigue reintentando hasta confirmarlo. Sin clave
-- foránea a la escuela: debe sobrevivir al borrado de la escuela o del arquero.
create table public.video_provider_cleanup (
  id uuid primary key default gen_random_uuid(),
  school_id uuid,
  provider text not null default 'mux',
  asset_id text,
  upload_id text,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  constraint cleanup_has_target check (asset_id is not null or upload_id is not null)
);

-- ───────────────────────────── privilegios y RLS ─────────────────────────────
revoke all on table
  public.video, public.video_comment, public.evaluation_video, public.video_notice,
  public.video_provider_cleanup
  from anon, authenticated;

-- El identificador del archivo en el proveedor no sale de los servidores.
grant select (
  id, school_id, goalkeeper_id, author_id, provider, title, topic, duration_sec,
  processing_status, error_reason, publication_status, published_at, created_at, updated_at
) on public.video to authenticated;
grant select on table public.video_comment, public.evaluation_video to authenticated;

alter table public.video enable row level security;
alter table public.video_comment enable row level security;
alter table public.evaluation_video enable row level security;
alter table public.video_notice enable row level security;
alter table public.video_provider_cleanup enable row level security;

-- RF-25: el staff ve todos los videos de su escuela (borradores incluidos).
create policy video_select on public.video
  for select to authenticated
  using (school_id = (select app.current_school_id()));

create policy video_comment_select on public.video_comment
  for select to authenticated
  using (school_id = (select app.current_school_id()));

create policy evaluation_video_select on public.evaluation_video
  for select to authenticated
  using (school_id = (select app.current_school_id()));

-- video_notice y video_provider_cleanup: RLS activada y sin políticas = solo la clave secreta.
