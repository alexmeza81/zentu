// Supabase Edge Function: match-oferta-ia
// Match "premium" con IA: puntúa una vacante contra el pool de estudiantes reclutables
// de forma holística (DeepSeek) y guarda el resultado en offer_matches (cache).
// - Auth: requiere usuario. Por ahora GATEADO A ADMIN (is_admin()). En el futuro aquí va
//   el chequeo de suscripción/créditos premium.
// - Lee el pool y escribe con service_role (bypassa RLS) tras verificar dueño/admin.
// - Nunca manda nombres/emails a la IA (solo perfil anonimizado por índice).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const BATCH = 25;
const MAX_STUDENTS = 200; // tope de seguridad por corrida

function clampPct(v: any): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

async function scoreBatch(offerText: string, cands: any[], key: string) {
  const sys = "Eres un evaluador experto de encaje candidato–vacante para reclutamiento de " +
    "estudiantes y recién egresados en LATAM. Puntúa de 0 a 100 qué tan bien encaja CADA candidato " +
    "con la vacante, de forma HOLÍSTICA: relación real entre su carrera y el área (aunque el nombre " +
    "difiera, p.ej. Derecho↔Legal, Sistemas↔Software), sus habilidades y experiencia en texto, y sus " +
    "fortalezas del test. Sé consistente y calibrado: 85-100 excelente, 65-84 bueno, 45-64 parcial, " +
    "<45 bajo. Devuelve SOLO JSON con esta forma exacta: " +
    "{\"matches\":[{\"i\":<indice del candidato>,\"pct\":<entero 0-100>,\"razon\":\"<motivo en <=90 caracteres>\"}]} " +
    "e incluye a TODOS los candidatos recibidos, sin texto adicional.";
  const usr = "VACANTE:\n" + offerText + "\n\nCANDIDATOS (JSON):\n" + JSON.stringify(cands);
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "deepseek-chat", temperature: 0.2, response_format: { type: "json_object" },
      messages: [{ role: "system", content: sys }, { role: "user", content: usr }],
    }),
  });
  if (!res.ok) throw new Error("DeepSeek " + res.status);
  const data = await res.json();
  const parsed = JSON.parse(data?.choices?.[0]?.message?.content || "{}");
  return Array.isArray(parsed?.matches) ? parsed.matches : [];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authHeader = req.headers.get("Authorization") || "";
    const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });

    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: "No autenticado" }, 401);

    // Gate premium (por ahora: solo admin). Aquí irá el chequeo de suscripción/créditos.
    const { data: isAdmin } = await asUser.rpc("is_admin");
    if (!isAdmin) return json({ error: "Función premium: disponible para tu plan próximamente." }, 403);

    const body = await req.json().catch(() => ({}));
    const offerId = typeof body?.offer_id === "string" ? body.offer_id : "";
    if (!offerId) return json({ error: "Falta offer_id" }, 400);

    // La oferta debe ser visible para el usuario (RLS: dueño o admin).
    const { data: offer } = await asUser.from("job_offers")
      .select("id, company_id, titulo, area, tags, descripcion").eq("id", offerId).maybeSingle();
    if (!offer) return json({ error: "Vacante no encontrada o sin acceso" }, 403);

    const key = Deno.env.get("DEEPSEEK_API_KEY") || Deno.env.get("Deepseek");
    if (!key) return json({ error: "IA no disponible (sin API key)" }, 503);
    if (!serviceKey) return json({ error: "Configuración incompleta (service role)" }, 500);
    const admin = createClient(url, serviceKey);

    // Pool de estudiantes reclutables (service role para leer todo el pool).
    const { data: studentsRaw } = await admin.from("students")
      .select("id, carrera, semestre, ingles, hard_skills, industrias, experiencia, estado, suspendido")
      .eq("estado", "en_busqueda").limit(MAX_STUDENTS + 50);
    const students = (studentsRaw || []).filter((s: any) => s.suspendido !== true).slice(0, MAX_STUDENTS);
    if (!students.length) return json({ ok: true, offer_id: offerId, count: 0, matches: [], modelo: "deepseek-chat" });

    // Fortalezas del test (última evaluación por estudiante).
    const ids = students.map((s: any) => s.id);
    const { data: tests } = await admin.from("test_results")
      .select("student_id, arquetipo, clasificacion, completado_at").in("student_id", ids)
      .order("completado_at", { ascending: false });
    const testByStudent: Record<string, any> = {};
    (tests || []).forEach((t: any) => { if (!testByStudent[t.student_id]) testByStudent[t.student_id] = t; });

    const offerText = [
      "Título: " + (offer.titulo || ""),
      offer.area ? "Área: " + offer.area : "",
      Array.isArray(offer.tags) && offer.tags.length ? "Requisitos/tags: " + offer.tags.join(", ") : "",
      offer.descripcion ? "Descripción: " + String(offer.descripcion).slice(0, 1200) : "",
    ].filter(Boolean).join("\n");

    // Payload anonimizado por índice (sin nombres/emails).
    const cands = students.map((s: any, i: number) => {
      const t = testByStudent[s.id];
      const fort = t?.clasificacion?.fortalezas;
      return {
        i,
        carrera: s.carrera || null,
        semestre: s.semestre || null,
        ingles: s.ingles || null,
        skills: Array.isArray(s.hard_skills) ? s.hard_skills.slice(0, 12) : [],
        industrias: Array.isArray(s.industrias) ? s.industrias.slice(0, 6) : [],
        arquetipo: t?.arquetipo || null,
        fortalezas: Array.isArray(fort) ? fort.slice(0, 3) : (fort ? [String(fort)] : []),
        experiencia: s.experiencia ? String(s.experiencia).slice(0, 400) : null,
      };
    });

    // Puntuar en lotes.
    const rows: any[] = [];
    for (let start = 0; start < cands.length; start += BATCH) {
      const slice = cands.slice(start, start + BATCH);
      let matches: any[] = [];
      try { matches = await scoreBatch(offerText, slice, key); }
      catch (_e) { matches = []; } // si un lote falla, se omite (no rompe toda la corrida)
      for (const m of matches) {
        const idx = Number(m?.i);
        const st = students[idx];
        if (!st) continue;
        rows.push({
          offer_id: offerId,
          student_id: st.id,
          company_id: offer.company_id,
          pct: clampPct(m?.pct),
          razon: typeof m?.razon === "string" ? m.razon.trim().slice(0, 160) : null,
          modelo: "deepseek-chat",
        });
      }
    }
    if (!rows.length) return json({ error: "La IA no devolvió puntajes. Intenta de nuevo." }, 502);

    // Recalculo completo: borra los de esta oferta y reinserta.
    await admin.from("offer_matches").delete().eq("offer_id", offerId);
    const { error: insErr } = await admin.from("offer_matches").insert(rows);
    if (insErr) return json({ error: "No se pudieron guardar los resultados: " + insErr.message }, 500);

    return json({
      ok: true, offer_id: offerId, count: rows.length, modelo: "deepseek-chat",
      matches: rows.map((r) => ({ student_id: r.student_id, pct: r.pct, razon: r.razon })),
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 400);
  }
});
