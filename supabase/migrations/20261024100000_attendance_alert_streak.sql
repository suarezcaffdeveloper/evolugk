-- Hito 5: el aviso de ausencias seguidas recuerda desde qué fecha empezó la racha, para no volver
-- a generarse mientras sea la misma racha (por ejemplo, después de que el admin lo descarta).
alter table public.admin_alert add column streak_started_on date;
