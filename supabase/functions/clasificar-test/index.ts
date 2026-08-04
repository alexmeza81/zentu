// Supabase Edge Function: clasificar-test
// Clasifica a un estudiante (5 dimensiones 0-10) + genera feedback personalizado para el estudiante.
// Bloque 1 se lee de la BD; el estudiante solo envía las 8 respuestas (Bloques 2, 3, 4).
// Usa DeepSeek si el secreto está configurado; si no (o si falla), cae a una clasificación por reglas.
// La API key vive como secreto del servidor — NUNCA en el cliente.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const ENG: Record<string, number> = { "Basico": .25, "Básico": .25, "Intermedio": .5, "Avanzado": .75, "Bilingue": 1, "Bilingüe": 1 };
const DIM_ARCH: Record<string, string> = { analitica: "Analítico", creativa: "Innovador", liderazgo: "Líder", ejecutora: "Ejecutor", tecnica: "Técnico" };
const DIM_LABEL: Record<string, string> = { analitica: "análisis", creativa: "creatividad", liderazgo: "liderazgo", ejecutora: "ejecución", tecnica: "habilidades técnicas" };
const ROLES: Record<string, string[]> = {
  "Analítico": ["Analista de Datos Jr.", "Analista de Negocios Jr."],
  "Innovador": ["Diseñador UX/UI Jr.", "Growth / Performance Mkt Jr."],
  "Líder": ["Project Manager Jr.", "Coordinador de Operaciones Jr."],
  "Ejecutor": ["Ejecutivo de Ventas / SDR Jr.", "Coordinador de Marketing Jr."],
  "Técnico": ["Desarrollador Jr.", "Analista de Datos Jr."],
};

function validate(a: any) {
  for (const k of ["technical_analysis", "technical_tools", "technical_writing", "technical_project"]) {
    const v = a?.[k]; if (!Number.isInteger(v) || v < 1 || v > 5) throw new Error(`${k} debe ser un entero 1-5`);
  }
  for (const k of ["scenario1", "scenario2", "scenario3"]) if (!["A", "B", "C", "D"].includes(a?.[k])) throw new Error(`${k} debe ser A, B, C o D`);
  if (!["a", "b", "c", "d"].includes(a?.learning)) throw new Error("learning debe ser a, b, c o d");
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
function arquetipoDe(dim: Record<string, number>) {
  let best = "analitica", bv = -1;
  for (const k in dim) if (dim[k] > bv) { bv = dim[k]; best = k; }
  return DIM_ARCH[best];
}

function fallback(a: any, p: any) {
  const sc = [a.scenario1, a.scenario2, a.scenario3];
  const cnt = (L: string) => sc.filter((x) => x === L).length;
  const cl = (n: number) => Math.max(0, Math.min(10, Math.round(n)));
  const techAvg = (a.technical_analysis + a.technical_tools + a.technical_writing + a.technical_project) / 4;
  const dim = {
    analitica: cl((.55 * (a.technical_analysis / 5) + .45 * (cnt("A") / 3)) * 10),
    creativa: cl((.7 * (cnt("B") / 3) + .3 * (a.technical_tools / 5)) * 10),
    liderazgo: cl((.7 * (cnt("C") / 3) + .3 * (a.technical_project / 5)) * 10),
    ejecutora: cl((.6 * (cnt("D") / 3) + .4 * (a.technical_project / 5)) * 10),
    tecnica: cl(techAvg / 5 * 10),
  };
  const entries = Object.entries(dim).sort((x, y) => y[1] - x[1]);
  const top1 = entries[0][0], top2 = entries[1][0], low = entries[entries.length - 1][0];
  const arq = DIM_ARCH[top1];
  const roles = ROLES[arq] || ROLES["Analítico"];
  const cintillo: Record<string, string> = { "Analítico": "Mente analítica en acción", "Innovador": "Creatividad que transforma", "Líder": "Liderazgo natural", "Ejecutor": "Ejecución imparable", "Técnico": "Perfil técnico sólido" };
  const tags = Array.from(new Set([DIM_LABEL[top1], DIM_LABEL[top2], (p.carrera || "universitario"), a.learning === "a" ? "aprendizaje continuo" : "proactividad", "perfil junior", "trabajo en equipo"])).slice(0, 7).map(cap);
  const learnTxt: Record<string, string> = { a: "aprovechar tu hábito de tomar cursos con certificado y sumar uno enfocado en tu área", b: "convertir tus tutoriales sueltos en un proyecto real de portafolio", c: "seguir aprendiendo con mentores y práctica constante", d: "reservar aunque sea 1 hora a la semana para aprender algo nuevo" };
  const fortalezas = `Destacas en ${DIM_LABEL[top1]} y ${DIM_LABEL[top2]}. Tus respuestas reflejan un perfil ${arq.toLowerCase()} con bases sólidas para dar el salto al mundo profesional.`;
  const areas_mejora = `Tu mayor área de oportunidad está en ${DIM_LABEL[low]}: trabajarla equilibrará tu perfil y te abrirá aún más puertas.`;
  const recomendaciones = `Te sugerimos ${learnTxt[a.learning]}, iniciar un proyecto donde practiques ${DIM_LABEL[low]} y mantener el hábito de aprender de forma constante.`;
  const mensaje_completo = `¡Felicidades por completar tu test de talento! ${fortalezas} ${areas_mejora} ${recomendaciones} Vas por muy buen camino: cada paso que des va sumando a tu perfil, y las empresas valoran justo esa mezcla de talento y ganas de crecer. Confía en tu proceso y sigue construyendo — tu próxima gran oportunidad está más cerca de lo que crees. 🚀`;
  const nivel = (Number(p.semestre) >= 7) ? "listo para prácticas o rol junior" : "en desarrollo";
  return {
    dimensiones: dim,
    cintillo: cintillo[arq].slice(0, 50),
    tags,
    resumen: `Perfil ${arq.toLowerCase()} con fortaleza en ${DIM_LABEL[top1]}, ${nivel}.`.slice(0, 150),
    recomendacion: `Roles sugeridos: ${roles.join(", ")}.`.slice(0, 200),
    feedback_estudiante: { fortalezas, areas_mejora, recomendaciones, mensaje_completo },
  };
}

async function classifyDeepSeek(a: any, p: any, key: string) {
  const sc1: Record<string, string> = { A: "Busca patrones en datos históricos", B: "Prueba algo innovador, fuera de la caja", C: "Reúne al equipo y asigna roles", D: "Lo resuelve solo, rápido, con lo que tiene" };
  const sc2: Record<string, string> = { A: "Investiga y verifica que los datos sean ciertos", B: "Genera ideas y propone el enfoque creativo", C: "Organiza el cronograma y motiva al equipo", D: "Ejecuta y entrega en tiempo y forma" };
  const sc3: Record<string, string> = { A: "Analiza la crítica en frío para ver si es lógica", B: "La usa para reinventar su trabajo", C: "La toma como desafío para demostrar su valía", D: "Corrige y sigue adelante sin darle vueltas" };
  const learn: Record<string, string> = { a: "Hizo un curso estructurado con certificado (Coursera/Platzi/Udemy)", b: "Vio tutoriales sueltos (YouTube/TikTok) para un problema puntual", c: "Preguntó a compañeros/profesores y practicó", d: "No ha tenido tiempo por la carga universitaria" };
  const tech: Record<string, string> = { 1: "muy bajo", 2: "bajo", 3: "medio", 4: "alto", 5: "muy alto" };
  const schema = `{"dimensiones":{"analitica":0-10,"creativa":0-10,"liderazgo":0-10,"ejecutora":0-10,"tecnica":0-10},"cintillo":"string atractivo máx 50 caracteres","tags":["5 a 8 palabras clave"],"resumen":"string máx 150 caracteres para el reclutador","recomendacion":"string con 2-3 roles junior sugeridos, máx 200 caracteres","feedback_estudiante":{"fortalezas":"2-3 fortalezas específicas, 30-50 palabras","areas_mejora":"1-2 áreas de oportunidad, 30-50 palabras","recomendaciones":"acciones concretas (cursos/proyectos/hábitos), 40-60 palabras","mensaje_completo":"150-200 palabras, 3-4 párrafos cortos, tono de mentor/coach cercano y alentador, que integre todo en un texto fluido"}}`;
  const sys = `Eres un mentor y evaluador de talento para una plataforma de reclutamiento de estudiantes universitarios en México. Debes: (1) calificar 5 dimensiones de 0 a 10 con base en las respuestas; (2) generar un feedback PERSONALIZADO y motivacional para el estudiante que reconozca sus fortalezas, señale 1-2 áreas de oportunidad y dé recomendaciones concretas (cursos, proyectos, hábitos), con tono positivo, cercano y alentador, mencionando ESPECÍFICAMENTE sus respuestas (p. ej. "notamos que tienes facilidad para el análisis de datos" o "elegiste resolver de forma colaborativa, eso es muy valioso"). Devuelve ÚNICAMENTE un objeto JSON válido en español con EXACTAMENTE este esquema: ${schema}`;
  const usr = `PERFIL DEL ESTUDIANTE:\n- Carrera: ${p.carrera || "N/D"}\n- Semestre: ${p.semestre || "N/D"}\n- Inglés: ${p.ingles || "N/D"}\n- Disponibilidad: ${p.disponibilidad || "N/D"}\n\nHABILIDADES TÉCNICAS (autoevaluación):\n- Análisis de datos: ${tech[a.technical_analysis]} (${a.technical_analysis}/5)\n- Herramientas digitales: ${tech[a.technical_tools]} (${a.technical_tools}/5)\n- Redacción y ortografía: ${tech[a.technical_writing]} (${a.technical_writing}/5)\n- Gestión de proyectos: ${tech[a.technical_project]} (${a.technical_project}/5)\n\nESCENARIOS DE PERSONALIDAD:\n1) Ante un problema nuevo: ${sc1[a.scenario1]}\n2) Rol natural en equipo: ${sc2[a.scenario2]}\n3) Ante crítica negativa: ${sc3[a.scenario3]}\n\nAPRENDIZAJE RECIENTE: ${learn[a.learning]}`;
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "deepseek-chat", temperature: .5, response_format: { type: "json_object" }, messages: [{ role: "system", content: sys }, { role: "user", content: usr }] }),
  });
  if (!res.ok) throw new Error("DeepSeek HTTP " + res.status);
  const data = await res.json();
  const parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
  if (!parsed?.dimensiones || !parsed?.feedback_estudiante?.mensaje_completo) throw new Error("Respuesta IA con formato inesperado");
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

    const arquetipo = arquetipoDe(clasificacion.dimensiones || {});
    await supabase.from("test_results").insert({ student_id: student.id, respuestas: answers, clasificacion, arquetipo, modelo });
    return json({ modelo, arquetipo, clasificacion });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 400);
  }
});
