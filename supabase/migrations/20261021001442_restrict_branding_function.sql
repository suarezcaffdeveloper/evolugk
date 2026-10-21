-- La marca de una escuela solo la necesita el servidor de Next para armar el login y
-- resolver /{slug}. Se retira el acceso desde internet (anon y authenticated): el servidor
-- la llama con la clave secreta. Así no queda una función SECURITY DEFINER expuesta por la API
-- (aviso de seguridad de Supabase) y no se puede recorrer la lista de escuelas por adivinanza.
--
-- Sigue devolviendo vacío para escuelas suspendidas o inexistentes (spec 00, RF-02).

revoke all on function public.get_school_branding(text) from public, anon, authenticated;
grant execute on function public.get_school_branding(text) to service_role;
