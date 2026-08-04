-- Clasificación del test (DeepSeek) — aplicado vía MCP el 2026-08-04
alter table public.students add column if not exists ingles text; -- Básico|Intermedio|Avanzado|Bilingüe
alter table public.test_results
  add column if not exists respuestas    jsonb,
  add column if not exists clasificacion jsonb,
  add column if not exists arquetipo     text,
  add column if not exists modelo        text;
-- Edge Function: supabase/functions/clasificar-test/index.ts (verify_jwt=true)
-- Secreto pendiente: DEEPSEEK_API_KEY (mientras no exista, la función usa el fallback por reglas).
