-- ============================================================================
-- LOCKDOWN DE PILOTO — ZentU (2026-08-18)
-- Solo la cuenta del fundador (alexmeza.m81@gmail.com), actuando como
-- reclutador, puede ver el POOL de candidatos y sus RESULTADOS DE TEST.
-- Los estudiantes siguen viendo SOLO su propia info (sin cambios).
-- Correr en Supabase → SQL Editor.
--
-- REVERSIBLE: para volver a abrir el pool a TODAS las empresas, re-aplica
-- 2026-08-18-rls-hardening.sql (esas políticas usan "exists company" en vez
-- del email).
-- ============================================================================

-- Candidatos (students): visibles solo para el correo del fundador.
-- (auth.jwt() envuelto en subselect = se evalúa una vez, no por fila.)
drop policy if exists "reclutable pool read" on public.students;
create policy "reclutable pool read" on public.students
  for select to authenticated
  using (
    estado = 'en_busqueda'
    and coalesce(suspendido, false) = false
    and (select auth.jwt() ->> 'email') = 'alexmeza.m81@gmail.com'
  );

-- Resultados del test de los candidatos: igual, solo el fundador.
drop policy if exists "reclutable test read" on public.test_results;
create policy "reclutable test read" on public.test_results
  for select to authenticated
  using (
    (select auth.jwt() ->> 'email') = 'alexmeza.m81@gmail.com'
    and student_id in (select id from public.students where estado = 'en_busqueda')
  );

-- ============================================================================
-- Notas:
-- - El estudiante sigue viendo su propio perfil y test (políticas "own").
-- - El admin (is_admin) sigue viendo todo por sus políticas.
-- - Cuando entres a la app como reclutador con alexmeza.m81@gmail.com verás a
--   todos los candidatos reclutables; cualquier otra cuenta NO verá el pool.
-- - Al abrir a empresas reales, revierte con 2026-08-18-rls-hardening.sql.
-- ============================================================================
