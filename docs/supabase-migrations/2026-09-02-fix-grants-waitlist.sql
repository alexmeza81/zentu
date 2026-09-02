-- ============================================================================
-- FIX: el panel de admin mostraba la waitlist vacía (2026-09-02)
--
-- Síntoma: con 4 registros reales en la BD, la pestaña Waitlist del panel salía
-- sin filas y el contador de Lanzamiento decía 0.
--
-- Causa: el endurecimiento de grants (ver el punto "Endurecer grants de waitlist"
-- en docs/LANZAMIENTO-checklist.md) revocó TODOS los privilegios de tabla a
-- authenticated sobre waitlist_estudiantes y waitlist_empresas. En Postgres los
-- GRANT se evalúan ANTES que las políticas RLS, así que la política
-- "admin read all" (is_admin()) quedó inalcanzable: ni el admin podía leer.
--
-- Arreglo: conceder SELECT a authenticated y dejar que RLS haga la restricción
-- real. Es el mismo patrón que ya usa public.students y que funciona bien.
--
-- anon sigue sin ningún privilegio sobre estas tablas: el registro público entra
-- por submit_student_waitlist / submit_company_waitlist, que son SECURITY DEFINER
-- y por tanto ignoran estos grants.
-- ============================================================================

grant select on public.waitlist_estudiantes to authenticated;
grant select on public.waitlist_empresas    to authenticated;

-- Comprobado tras aplicar:
--   admin           → ve 4 estudiantes y 1 empresa
--   usuario normal  → ve 0 y 0 (is_admin() = false)
--   anon (REST)     → 42501 permission denied
--   registro por RPC → sigue concedido a anon (security definer)
