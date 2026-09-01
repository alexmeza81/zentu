-- ============================================================================
-- LANZAMIENTO PROGRESIVO — ZentU (2026-09-01)
--
-- Hasta ahora, estar en la waitlist YA daba acceso: check_waitlist_role solo
-- comprobaba que el correo existiera en la tabla. Eso convierte la waitlist en
-- una puerta abierta, cuando la intención es que sea una cola de espera.
--
-- Esta migración añade dos interruptores (estudiantes y empresas, independientes)
-- para poder abrir por público y por fecha. Los admins quedan exentos para no
-- quedarse fuera de su propia app durante los ensayos.
--
-- REVERSIBLE: los interruptores se apagan y se encienden desde el panel de admin
-- (o con el UPDATE del final), así que el lanzamiento se puede ensayar en vacío.
-- ============================================================================

-- ── 1. Tabla de configuración ───────────────────────────────────────────────
-- Una sola fila. El id fijo evita que se creen varias por accidente.
create table if not exists public.app_config (
  id                  boolean primary key default true,
  estudiantes_abierto boolean not null default false,
  empresas_abierto    boolean not null default false,
  abierto_estudiantes_at timestamptz,
  abierto_empresas_at    timestamptz,
  updated_at          timestamptz not null default now(),
  constraint app_config_una_sola_fila check (id)
);

insert into public.app_config (id) values (true) on conflict (id) do nothing;

alter table public.app_config enable row level security;

-- Lectura pública: la landing la consulta ANTES de que nadie inicie sesión.
-- Son dos banderas de lanzamiento, no hay nada sensible que proteger.
drop policy if exists "app_config lectura publica" on public.app_config;
create policy "app_config lectura publica" on public.app_config
  for select to anon, authenticated using (true);

-- Escritura: solo admin.
drop policy if exists "app_config escritura admin" on public.app_config;
create policy "app_config escritura admin" on public.app_config
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

revoke insert, delete, truncate on public.app_config from anon, authenticated;
grant select on public.app_config to anon, authenticated;
grant update on public.app_config to authenticated;

-- Sella la fecha de apertura la primera vez que cada bandera se enciende.
create or replace function public.app_config_sella_fecha()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estudiantes_abierto and not coalesce(old.estudiantes_abierto, false) then
    new.abierto_estudiantes_at := now();
  end if;
  if new.empresas_abierto and not coalesce(old.empresas_abierto, false) then
    new.abierto_empresas_at := now();
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists app_config_sella_fecha_trg on public.app_config;
create trigger app_config_sella_fecha_trg before update on public.app_config
  for each row execute function public.app_config_sella_fecha();

-- ── 2. El portero ahora exige que el acceso esté abierto ────────────────────
-- Antes: estar en la waitlist bastaba.
-- Ahora: hay que estar en la waitlist Y que su público esté abierto.
-- Excepción: los admins entran siempre, para poder ensayar el lanzamiento.
create or replace function public.check_waitlist_role(p_email text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select case
    -- Admins: acceso permanente, sin importar los interruptores, para poder
    -- ensayar el lanzamiento y no quedarse fuera de la propia app. Se compara
    -- contra la tabla admins en vez de codificar un correo, porque esta función
    -- corre ANTES del login (rol anon) y auth.jwt() está vacío, así que is_admin()
    -- no sirve aquí. Es SECURITY DEFINER, así que puede leer admins pese al RLS.
    when exists (select 1 from public.admins where lower(email) = lower(p_email)) then
      case
        when exists (select 1 from public.waitlist_empresas where lower(email) = lower(p_email))
             and not exists (select 1 from public.waitlist_estudiantes where lower(email) = lower(p_email))
          then 'company'
        else 'student'   -- por defecto entra como estudiante, aunque no esté en ninguna lista
      end
    when exists (select 1 from public.waitlist_estudiantes where lower(email) = lower(p_email))
         and (select estudiantes_abierto from public.app_config where id) then 'student'
    when exists (select 1 from public.waitlist_empresas where lower(email) = lower(p_email))
         and (select empresas_abierto from public.app_config where id) then 'company'
    else null
  end;
$$;

grant execute on function public.check_waitlist_role(text) to anon, authenticated;

-- ── 3. Conteo para el panel de admin ────────────────────────────────────────
-- Cuánta gente hay esperando aviso. El admin ya lee las tablas completas, pero
-- esto le da el número sin depender de que haya cargado todo.
create or replace function public.waitlist_conteo()
returns table (estudiantes bigint, empresas bigint)
language sql
security definer
set search_path = public
stable
as $$
  select (select count(*) from public.waitlist_estudiantes),
         (select count(*) from public.waitlist_empresas);
$$;

revoke execute on function public.waitlist_conteo() from anon, authenticated;
grant execute on function public.waitlist_conteo() to authenticated;

-- ============================================================================
-- Para abrir/cerrar a mano (el panel de admin hace exactamente esto):
--   update public.app_config set estudiantes_abierto = true  where id;
--   update public.app_config set estudiantes_abierto = false where id;
-- ============================================================================
