-- ============================================================================
-- AUDITORÍA DE RLS (solo lectura) — ZentU
-- Córrelo en Supabase → SQL Editor. NO modifica nada.
-- Objetivo: ver qué tablas tienen Row Level Security y qué políticas existen,
-- para detectar fugas de datos antes del lanzamiento.
-- ============================================================================

-- 1) ¿RLS habilitado por tabla? (rls_enabled=false en una tabla con datos = FUGA)
select
  c.relname                              as tabla,
  c.relrowsecurity                       as rls_enabled,
  c.relforcerowsecurity                  as rls_forced,
  (select count(*) from pg_policies p
     where p.schemaname = 'public' and p.tablename = c.relname) as num_politicas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relrowsecurity asc, c.relname;   -- primero las que NO tienen RLS

-- 2) Detalle de políticas por tabla (qué rol, qué comando, con qué condición)
select
  tablename        as tabla,
  policyname       as politica,
  cmd              as comando,     -- SELECT/INSERT/UPDATE/DELETE/ALL
  roles            as roles,
  qual             as using_expr,  -- condición de lectura
  with_check       as check_expr   -- condición de escritura
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;

-- 3) Tablas core que DEBEN tener RLS (chequeo rápido): si alguna sale con
--    rls_enabled=false, es hueco de seguridad.
select c.relname as tabla, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname='public' and c.relkind='r'
  and c.relname in (
    'students','companies','test_results','messages','consent_log',
    'waitlist_estudiantes','waitlist_empresas',
    'job_offers','job_applications','pipeline_stages','pipeline_candidates'
  )
order by c.relrowsecurity asc, c.relname;

-- 4) ¿Las funciones de registro/login existen? (evita el bug que ya tuvimos)
select p.proname as funcion,
       pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public'
  and p.proname in ('submit_student_waitlist','submit_company_waitlist',
                    'check_waitlist_role','ensure_my_company','is_admin')
order by p.proname;

-- 5) Grants sobre las tablas de waitlist para anon (NO debería poder SELECT):
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema='public'
  and table_name in ('waitlist_estudiantes','waitlist_empresas')
  and grantee in ('anon','authenticated')
order by table_name, grantee, privilege_type;

-- ============================================================================
-- CÓMO LEER EL RESULTADO
-- - Query 1/3: cualquier tabla core con rls_enabled=false = FUGA -> hay que
--   activar RLS y agregar políticas (ver 2026-08-18-rls-hardening.sql).
-- - Query 2: revisa que 'students' NO tenga un SELECT abierto a authenticated
--   sin condición (dejaría que cualquier estudiante lea a todos).
-- - Query 4: si submit_student_waitlist / submit_company_waitlist NO aparecen,
--   el registro está roto (crear como se hizo con check_waitlist_role).
-- - Query 5: anon con SELECT sobre waitlist_* = cualquiera puede scrapear
--   correos. Debe estar SOLO el RPC (security definer) para insertar.
-- ============================================================================
