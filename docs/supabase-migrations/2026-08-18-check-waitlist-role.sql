-- Fix: el login de estudiantes/empresas llama a public.check_waitlist_role(p_email)
-- pero la función NO existe en la BD -> el gate devuelve null y bloquea a TODOS
-- con "Este correo no está en nuestra lista de acceso".
--
-- Esta migración crea la función. Devuelve 'student' si el correo está en
-- waitlist_estudiantes, 'company' si está en waitlist_empresas, si no NULL.
-- Lanzamiento abierto: basta con estar en la waitlist (no exige acceso_otorgado).
--
-- NOTA: se asume que la columna de correo es `email` en ambas tablas
-- (confirmado para waitlist_estudiantes desde el código del dashboard).
-- Si waitlist_empresas usa otra columna (p.ej. email_corporativo), ajusta esa línea.

create or replace function public.check_waitlist_role(p_email text)
returns text
language sql
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from public.waitlist_estudiantes where lower(email) = lower(p_email)) then 'student'
    when exists (select 1 from public.waitlist_empresas    where lower(email) = lower(p_email)) then 'company'
    else null
  end;
$$;

grant execute on function public.check_waitlist_role(text) to anon, authenticated;

-- (Opcional) Si quieres volver a gatear por acceso_otorgado, cambia cada EXISTS por:
--   ... where lower(email) = lower(p_email) and acceso_otorgado is true ...

-- Para darte acceso de estudiante para probar (ajusta columnas requeridas si hace falta):
-- insert into public.waitlist_estudiantes (email, nombre, apellido)
-- values ('alexmeza.m81@gmail.com', 'Alex', 'Meza')
-- on conflict do nothing;
