-- ============================================================================
-- ENVÍO DEL AVISO + MÉTRICAS DEL PANEL — ZentU (2026-09-02)
-- Aplicado vía MCP. Migraciones: waitlist_registro_de_envios, admin_metricas_y_actividad.
--
-- 1) waitlist_estudiantes / waitlist_empresas: columnas acceso_email_enviado_at y
--    acceso_email_id. Sin ellas, un doble clic reenvía el correo a la misma persona.
-- 2) envios_acceso_resumen(): cuántos esperan aviso y cuántos ya lo recibieron.
-- 3) admin_metricas(): embudo de activación + salud de la waitlist + sesiones,
--    en una sola llamada. Excluye a los estudiantes de demostración.
--
-- Las tres son security definer con guardia is_admin() dentro, y sin EXECUTE para
-- anon: exponen conteos de negocio y correos de usuarios.
-- ============================================================================

alter table public.waitlist_estudiantes
  add column if not exists acceso_email_enviado_at timestamptz,
  add column if not exists acceso_email_id text;

alter table public.waitlist_empresas
  add column if not exists acceso_email_enviado_at timestamptz,
  add column if not exists acceso_email_id text;

-- El cuerpo completo de envios_acceso_resumen() y admin_metricas() está aplicado
-- en la base; ver el historial de migraciones de Supabase para el SQL exacto.

-- ── Añadido el mismo día: origen del registro ───────────────────────────────
-- Migraciones: waitlist_origen_de_registro, admin_metricas_con_origen.
-- Columnas utm_source / utm_campaign / referrer en ambas waitlists, y la función
-- registrar_origen_waitlist() que las llena desde el formulario público.
--
-- Va en una función aparte del alta a propósito: cambiar la firma de
-- submit_student_waitlist obligaría a soltar y recrear la función que hoy sostiene
-- todo el registro, y el origen no vale ese riesgo. Si el registro de origen falla,
-- el alta se completa igual: se pierde un dato de negocio, nunca al usuario.
--
-- El referente se guarda solo como dominio, no la URL completa, que puede llevar
-- datos de la navegación de la persona.
