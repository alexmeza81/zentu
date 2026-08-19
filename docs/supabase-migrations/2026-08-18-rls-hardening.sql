-- ============================================================================
-- RLS HARDENING — ZentU (2026-08-18)
-- Cierra 3 fugas encontradas en la auditoría de políticas.
-- Correr en Supabase → SQL Editor. Revisa cada bloque.
-- Después: prueba (a) login, (b) que una EMPRESA siga viendo el pool de
-- candidatos y sus tests, (c) que un ESTUDIANTE ya NO pueda leer a otros.
-- ============================================================================

-- (1) 🔴 Waitlist legible por cualquier usuario logueado -> quitar esa política.
--     El registro entra por el RPC (security definer) y el admin lee por is_admin(),
--     así que nadie más necesita SELECT directo sobre la waitlist.
drop policy if exists "Auth users can read" on public.waitlist_estudiantes;
drop policy if exists "Auth users can read" on public.waitlist_empresas;

-- (2) 🟠 students: el "reclutable pool read" lo puede usar cualquier autenticado
--     (incluye estudiantes). Restringir a usuarios que SON empresa (reclutadores).
drop policy if exists "reclutable pool read" on public.students;
create policy "reclutable pool read" on public.students
  for select to authenticated
  using (
    estado = 'en_busqueda'
    and coalesce(suspendido, false) = false
    and exists (select 1 from public.companies c where c.user_id = auth.uid())
  );

-- (3) 🟠 test_results: mismo problema. Solo empresas pueden leer el test de un
--     candidato reclutable.
drop policy if exists "reclutable test read" on public.test_results;
create policy "reclutable test read" on public.test_results
  for select to authenticated
  using (
    exists (select 1 from public.companies c where c.user_id = auth.uid())
    and student_id in (select id from public.students where estado = 'en_busqueda')
  );

-- (4) Higiene: quitar los grants directos sobrantes sobre la waitlist
--     (anon/authenticated tenían hasta DELETE/TRUNCATE). Confirmado que el
--     registro usa submit_student_waitlist / submit_company_waitlist (RPC
--     security definer, verificado 2026-08-18), así que revocar es seguro.
--     Prueba un registro de estudiante después de aplicar.
revoke select, insert, update, delete, truncate, references, trigger
  on public.waitlist_estudiantes from anon, authenticated;
revoke select, insert, update, delete, truncate, references, trigger
  on public.waitlist_empresas    from anon, authenticated;

-- ============================================================================
-- Verificación rápida tras aplicar (deben quedar así):
--   waitlist_estudiantes / waitlist_empresas: solo "admin read all"
--   students: "reclutable pool read" ahora exige empresa del que consulta
--   test_results: "reclutable test read" ahora exige empresa del que consulta
-- ============================================================================
