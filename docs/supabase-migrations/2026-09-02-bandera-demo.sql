-- 2026-09-02 · Bandera de demostración en waitlist y empresas
--
-- Contexto: los primeros registros son amigos y cuentas de prueba del fundador
-- (Dinzzy incluida). Mezclarlos con los reales hace que las métricas del
-- lanzamiento mientan desde el primer día. Se marcan como demo y se excluyen
-- de las cuentas, sin tocar sus permisos: quien esté marcado sigue entrando y
-- probando con normalidad, porque check_waitlist_role() no mira esta bandera.
--
-- Aplicado en tres migraciones: waitlist_bandera_demo, companies_bandera_demo
-- y metricas_excluyen_waitlist_demo.

-- ── 1. La bandera ───────────────────────────────────────────────────────────
alter table public.waitlist_estudiantes add column if not exists demo boolean not null default false;
alter table public.waitlist_empresas    add column if not exists demo boolean not null default false;
alter table public.companies            add column if not exists demo boolean not null default false;

comment on column public.waitlist_estudiantes.demo is
  'Registro de demostración. Solo para métricas: check_waitlist_role no la mira, así que quien esté marcado sigue pudiendo entrar.';
comment on column public.waitlist_empresas.demo is
  'Registro de demostración. Solo para métricas: check_waitlist_role no la mira, así que quien esté marcado sigue pudiendo entrar.';
comment on column public.companies.demo is
  'Empresa de demostración. Solo afecta a métricas y al selector del panel de admin: no cambia permisos ni acceso.';

-- ── 2. Las métricas dejan de contar a los de prueba ─────────────────────────
-- admin_metricas() y envios_acceso_resumen() se reescribieron para filtrar
-- `demo = false` en las dos waitlist. La lista de sesiones es la excepción a
-- propósito: sigue mostrando a todos, con un campo `es_demo`, porque es la
-- pantalla para vigilar si alguien se atora al entrar.
-- (Cuerpo completo en la migración metricas_excluyen_waitlist_demo.)

-- ── 3. El envío tampoco les escribe ─────────────────────────────────────────
-- La Edge Function enviar-acceso-abierto filtra `demo = false` al buscar
-- pendientes. Sin eso, el panel diría "nadie pendiente" —su resumen sí los
-- excluye— mientras la función les seguiría mandando el correo.
