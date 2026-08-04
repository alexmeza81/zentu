// Supabase Edge Function: clasificar-test
// Clasifica a un estudiante a partir de su perfil (Bloque 1, leído de la BD) + 8 respuestas del test.
// Usa DeepSeek si DEEPSEEK_API_KEY está configurada; si no, cae a una clasificación por reglas (determinista).
// La API key vive como secreto del servidor — NUNCA se expone al cliente.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const ENG: Record<string, number> = { "Basico": .25, "Básico": .25, "Intermedio": .5, "Avanzado": .75, "Bilingue": 1, "Bilingüe": 1 };
const ARCH: Record<string, string> = { A: "Analítico", B: "Innovador", C: "Líder", D: "Ejecutor" };
const ARCH_PRIORITY = ["Líder", "Analítico", "Innovador", "Ejecutor"];
const ROLES: Record<string, string[]> = {
  "Analítico": ["Analista de Datos Jr.", "Analista de Negocios Jr."],
  "Innovador": ["Diseñador UX/UI Jr.", "Growth / Performance Mkt Jr."],
  "Líder": ["Project Manager Jr.", "Coordinador de Operaciones Jr."],
  "Ejecutor": ["Ejecutivo de Ventas / SDR Jr.", "Coordinador de Marketing Jr."],
};
const LEARN: Record<string, number> = { a: 1, b: .6, c: .7, d: .2 };
const LABEL: Record<string, string> = {
  pensamiento_analitico: "Pensamiento analítico", creatividad_innovacion: "Creatividad e innovación",
  liderazgo_colaboracion: "Liderazgo y colaboración", ejecucion_resultados: "Ejecución y resultados",
  habilidades_tecnicas: "Habilidades técnicas", comunicacion: "Comunicación", aprendizaje_continuo: "Aprendizaje continuo",
};

function validate(a: any) {
  for (const k of ["technical_analysis", "technical_tools", "technical_writing", "technical_project"]) {
    const v = a?.[k]; if (!Number.isInteger(v) || v < 1 || v > 5) throw new Error(`${k} debe ser un entero 1-5`);
  }
  for (const k of ["scenario1", "scenario2", "scenario3"]) if (!["A", "B", "C", "D"].includes(a?.[k])) throw new Error(`${k} debe ser A, B, C o D`);
  if (!["a", "b", "c", "d"].includes(a?.learning)) throw new Error("learning debe ser a, b, c o d");
}
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function fallback(a: any, p: any) {
  const sc = [a.scenario1, a.scenario2, a.scenario3];
  const cnt = (L: string) => sc.filter((x) => x === L).length;
  const eng = ENG[p.ingles] ?? .4;
  const comp: Record<string, number> = {
    pensamiento_analitico: clamp((.6 * (a.technical_analysis / 5) + .4 * (cnt("A") / 3)) * 100),
    creatividad_innovacion: clamp((.7 * (cnt("B") / 3) + .3 * (a.technical_tools / 5)) * 100),
    liderazgo_colaboracion: clamp((.7 * (cnt("C") / 3) + .3 * (a.technical_project / 5)) * 100),
    ejecucion_resultados: clamp((.6 * (cnt("D") / 3) + .4 * (a.technical_project / 5)) * 100),
    habilidades_tecnicas: clamp(((a.technical_analysis + a.technical_tools + a.technical_writing + a.technical_project) / 4) / 5 * 100),
    comunicacion: clamp((.6 * (a.technical_writing / 5) + .4 * eng) * 100),
    aprendizaje_continuo: clamp((LEARN[a.learning] ?? .5) * 100),
  };
  let best = "Ejecutor", bestN = -1;
  for (const arch of ARCH_PRIORITY) { const L = Object.keys(ARCH).find((k) => ARCH[k] === arch)!; const n = cnt(L); if (n > bestN) { bestN = n; best = arch; } }
  const entries = Object.entries(comp).sort((x, y) => y[1] - x[1]);
  const roles = (ROLES[best] || []).map((rol, i) => ({ rol, afinidad: clamp(60 + comp.habilidades_tecnicas * .3 - i * 8), por_que: `Encaja con tu perfil ${best.toLowerCase()} y tu nivel técnico.` }));
  const avg = entries.reduce((s, e) => s + e[1], 0) / entries.length;
  const listo = (Number(p.semestre) >= 7) && avg >= 60;
  return {
    arquetipo: best,
    resumen: `Perfil predominantemente ${best.toLowerCase()}. Destaca en ${LABEL[entries[0][0]].toLowerCase()} y ${LABEL[entries[1][0]].toLowerCase()}.`,
    competencias: comp,
    fortalezas: [LABEL[entries[0][0]], LABEL[entries[1][0]]],
    areas_mejora: [LABEL[entries[entries.length - 1][0]], LABEL[entries[entries.length - 2][0]]],
    roles_sugeridos: roles,
    nivel_preparacion: listo ? "Listo para prácticas o rol junior" : "En desarrollo",
  };
}

async function classifyDeepSeek(a: any, p: any, key: string) {
  const sc1: Record<string, string> = { A: "Busca patrones en datos históricos", B: "Prueba algo innovador, fuera de la caja", C: "Reúne al equipo y asigna roles", D: "Lo resuelve solo, rápido, con lo que tiene" };
  const sc2: Record<string, string> = { A: "Investiga y verifica que los datos sean ciertos", B: "Genera ideas y propone el enfoque creativo", C: "Organiza el cronograma y motiva al equipo", D: "Ejecuta y entrega en tiempo y forma" };
  const sc3: Record<string, string> = { A: "Analiza la crítica en frío para ver si es lógica", B: "La usa para reinventar su trabajo", C: "La toma como desafío para demostrar su valía", D: "Corrige y sigue adelante sin darle vueltas" };
  const learn: Record<string, string> = { a: "Curso estructurado con certificado (Coursera/Platzi/Udemy)", b: "Tutoriales sueltos (YouTube/TikTok) para un problema puntual", c: "Preguntó a compañeros/profesores y practicó", d: "No ha tenido tiempo por la carga universitaria" };
  const schema = `{"arquetipo":"Analítico|Innovador|Líder|Ejecutor","resumen":"string","competencias":{"pensamiento_analitico":0-100,"creatividad_innovacion":0-100,"liderazgo_colaboracion":0-100,"ejecucion_resultados":0-100,"habilidades_tecnicas":0-100,"comunicacion":0-100,"aprendizaje_continuo":0-100},"fortalezas":["string"],"areas_mejora":["string"],"roles_sugeridos":[{"rol":"string","afinidad":0-100,"por_que":"string"}],"nivel_preparacion":"string"}`;
  const sys = `Eres un evaluador de talento para una plataforma de reclutamiento de estudiantes universitarios en México. Clasifica al estudiante de forma objetiva, empática y accionable. Devuelve ÚNICAMENTE un objeto JSON válido con EXACTAMENTE este esquema (todo en español, puntajes enteros 0-100, entre 2 y 3 roles sugeridos realistas para perfil junior y coherentes con su carrera): ${schema}`;
  const usr = `PERFIL:\n- Carrera: ${p.carrera || "N/D"}\n- Semestre: ${p.semestre || "N/D"}\n- Inglés: ${p.ingles || "N/D"}\n- Disponibilidad: ${p.disponibilidad || "N/D"}\n\nHABILIDADES TÉCNICAS (autoevaluación 1-5):\n- Análisis de datos: ${a.technical_analysis}\n- Herramientas digitales: ${a.technical_tools}\n- Redacción y ortografía: ${a.technical_writing}\n- Gestión de proyectos: ${a.technical_project}\n\nESCENARIOS DE PERSONALIDAD:\n1) Ante un problema nuevo: ${sc1[a.scenario1]}\n2) Rol natural en equipo: ${sc2[a.scenario2]}\n3) Ante crítica negativa: ${sc3[a.scenario3]}\n\nAPRENDIZAJE RECIENTE: ${learn[a.learning]}`;
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "deepseek-chat", temperature: .3, response_format: { type: "json_object" }, messages: [{ role: "system", content: sys }, { role: "user", content: usr }] }),
  });
  if (!res.ok) throw new Error("DeepSeek HTTP " + res.status);
  const data = await res.json();
  const parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
  if (!parsed?.competencias || !parsed?.arquetipo) throw new Error("Respuesta IA con formato inesperado");
  return parsed;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "No autenticado" }, 401);

    const answers = await req.json();
    validate(answers);

    const { data: student } = await supabase.from("students").select("id, carrera, semestre, disponibilidad, ingles").eq("user_id", user.id).maybeSingle();
    if (!student) return json({ error: "Perfil de estudiante no encontrado" }, 404);

    const key = Deno.env.get("DEEPSEEK_API_KEY") || Deno.env.get("Deepseek");
    let clasificacion: any, modelo: string;
    if (key) {
      try { clasificacion = await classifyDeepSeek(answers, student, key); modelo = "deepseek-chat"; }
      catch (_e) { clasificacion = fallback(answers, student); modelo = "reglas (fallback IA)"; }
    } else { clasificacion = fallback(answers, student); modelo = "reglas"; }

    await supabase.from("test_results").insert({ student_id: student.id, respuestas: answers, clasificacion, arquetipo: clasificacion.arquetipo, modelo });
    return json({ modelo, clasificacion });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 400);
  }
});
