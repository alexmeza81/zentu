# Checklist de lanzamiento — ZentU (piloto: estudiantes de 1 facultad)

Fecha: 2026-08-18. Estado tras la auditoría de esta sesión.

## 🔴 Bloqueadores — resolver ANTES de abrir a estudiantes reales

- [ ] **Correo OTP (entrega).** El login manda un código por email. Supabase por
  defecto tiene límites bajos y cae en spam → si no llega, **nadie entra**.
  **Acción (solo tú):** Supabase → Authentication → Emails → configurar **SMTP propio**
  (Resend o SendGrid). Probar a Gmail, Outlook y Hotmail.

- [ ] **Verificar que el registro (signup) exista.** `submit_student_waitlist` /
  `submit_company_waitlist` NO están en las migraciones del repo (igual que la
  función de login que estaba rota). Corre la **query 4** de
  `docs/supabase-migrations/2026-08-18-rls-audit.sql`. Si no aparecen, el registro
  está roto y hay que crearlas.

- [ ] **RLS — verificar el alcance de usuarios autenticados.** Confirmado que
  **anon NO puede leer** (RLS activo bloquea; `students`/`test_results`/waitlist con
  datos devuelven 0 filas a anon ✓). Falta confirmar que un **estudiante logueado
  solo vea SU fila** (no la de sus compañeros). Corre la **query 1 y 2** del audit y
  revisa que `students`/`test_results`/`messages` tengan una política que ate por
  `user_id = auth.uid()` (o participante), no un `SELECT` abierto.

- [ ] **Endurecer grants de waitlist (higiene).** `anon`/`authenticated` tienen
  SELECT/INSERT/UPDATE/DELETE/**TRUNCATE** directos sobre `waitlist_estudiantes` y
  `waitlist_empresas`. Hoy RLS los tapa, pero es exceso de permisos. **Acción:**
  ```sql
  revoke select, insert, update, delete, truncate, references, trigger
    on public.waitlist_estudiantes from anon, authenticated;
  revoke select, insert, update, delete, truncate, references, trigger
    on public.waitlist_empresas    from anon, authenticated;
  ```
  ⚠️ Hazlo **solo si** el registro va por el RPC `submit_student_waitlist`
  (security definer, que ignora estos grants). Prueba un registro después.

- [ ] **Logo del correo de auth.** Ya restauramos `logo.png` en prod. Verifica en
  Supabase → Auth → Email Templates que el `<img src>` apunte a
  `https://www.zentu.app/logo.png` (no a SVG). Manda un código de prueba.

## 🟠 Importante — poco después del lanzamiento

- [ ] **Monitoreo de errores.** Sin esto, no te enteras cuando un usuario truena.
  Agrega algo simple (Sentry free, o un `window.onerror` que reporte).
- [ ] **Costo/límite de DeepSeek.** Cada test = 1 llamada. Pon alerta de gasto y un
  límite en el panel de DeepSeek.
- [ ] **Sembrar contenido.** Para 1 facultad son estudiantes; si el lado de empresas
  está vacío, el estudiante ve el dashboard sin ofertas ni mensajes. Ten al menos
  unas ofertas de prueba o un estado "pronto" para que no se sienta muerto.
- [ ] **Backup/restore probado** de la BD (Supabase point-in-time o export).

## ✅ Ya resuelto en esta sesión

- [x] **Login arreglado** (`check_waitlist_role` creada; tu correo autorizado).
- [x] **RLS activo bloquea a anon** en las tablas core (verificado por conteo).
- [x] **XSS por `javascript:` en enlaces de LinkedIn** — sanitizador `safeUrl`
  (solo http/https) en dashboard de estudiante y reclutador.
- [x] **Test IA marcado como orientativo** ("no es un filtro de contratación") en el
  modal del reclutador — mitiga riesgo de sesgo/legal.
- [x] **Mensajes, fotos y salida de DeepSeek** se renderizan con `escapeHTML`.
- [x] **Sin secretos en el cliente** (la key de DeepSeek vive en la Edge Function).
- [x] **Logo del correo** restaurado en prod.

## 🟡 Limitaciones de fondo (aceptables para el piloto)

- Sin SSR/SEO (páginas públicas no rankean; adquisición por canal directo).
- Percentiles del test **diferidos** hasta tener cohorte (~30+); por ahora es
  afinidad relativa.
- Sin staging: todo cambio va contra prod. Para el piloto, evita cambios en vivo
  durante las horas de uso.
- Marketplace de dos lados: con 1 facultad siembras el lado estudiante; el valor
  pleno llega cuando haya empresas activas.

## Nota de responsabilidad (test IA)

El instrumento **no está validado** psicométricamente. Úsalo para **orientar
conversaciones**, no como filtro excluyente de contratación. Antes de que influya en
decisiones de reclutamiento, documenta cómo se usa y revisa si hay diferencias
sistemáticas de puntaje entre grupos (sesgo). Ya está etiquetado como orientativo en
la UI del reclutador.
