// Supabase Edge Function: evaluar-competencias  (Evaluación de Talento v3)
// - El estudiante responde 18 preguntas tap (16 puntuables + 2 de control).
// - El cliente envía SOLO el índice canónico de la opción elegida; la CLAVE de
//   puntuación vive únicamente aquí (nunca en el navegador).
// - La matemática puntúa (8 ejes 0-100, determinista). DeepSeek SOLO interpreta
//   (texto del perfil + feedback); no calcula ni modifica los puntajes.
// - La API key de DeepSeek vive como secreto del servidor.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const INSTRUMENT_VERSION = "v1";

// ── Ejes ──────────────────────────────────────────────────────────────────
const AXES = ["pensamiento_critico","comunicacion_asertiva","trabajo_equipo","resiliencia","adaptabilidad","autogestion","liderazgo","competencia_digital"] as const;
type Axis = typeof AXES[number];
const AXIS_LABEL: Record<Axis,string> = {
  pensamiento_critico:"Pensamiento crítico", comunicacion_asertiva:"Comunicación asertiva",
  trabajo_equipo:"Trabajo en equipo", resiliencia:"Resiliencia", adaptabilidad:"Adaptabilidad y aprendizaje",
  autogestion:"Autogestión y organización", liderazgo:"Liderazgo e iniciativa", competencia_digital:"Competencia digital y datos",
};
const AXIS_SHORT: Record<Axis,string> = {
  pensamiento_critico:"pensamiento crítico", comunicacion_asertiva:"comunicación asertiva",
  trabajo_equipo:"trabajo en equipo", resiliencia:"resiliencia", adaptabilidad:"adaptabilidad",
  autogestion:"autogestión", liderazgo:"liderazgo", competencia_digital:"competencia digital",
};

// ── CLAVE PRIVADA del instrumento (índice canónico → puntos) ────────────────
const ITEMS: Record<string,{axis:Axis;points:[number,number,number,number]}> = {
  PC1:{axis:"pensamiento_critico",points:[100,60,40,20]}, PC2:{axis:"pensamiento_critico",points:[100,65,40,20]},
  CA1:{axis:"comunicacion_asertiva",points:[100,60,35,30]}, CA2:{axis:"comunicacion_asertiva",points:[100,55,40,25]},
  TE1:{axis:"trabajo_equipo",points:[100,65,45,20]}, TE2:{axis:"trabajo_equipo",points:[100,65,40,30]},
  RE1:{axis:"resiliencia",points:[100,70,40,15]}, RE2:{axis:"resiliencia",points:[100,55,35,15]},
  AD1:{axis:"adaptabilidad",points:[100,65,40,20]}, AD2:{axis:"adaptabilidad",points:[100,65,40,20]},
  AU1:{axis:"autogestion",points:[100,60,40,30]}, AU2:{axis:"autogestion",points:[100,65,35,20]},
  LI1:{axis:"liderazgo",points:[100,55,50,25]}, LI2:{axis:"liderazgo",points:[100,60,40,25]},
  CD1:{axis:"competencia_digital",points:[100,55,45,25]}, CD2:{axis:"competencia_digital",points:[100,60,40,20]},
};
const ATT_CODE = "CTRL-ATT", ATT_EXPECTED = 2;             // debe elegir la 3a opción
const CONS_CODE = "CTRL-CONS", CONS_PAIR = "RE2";           // parafrasea RE2
const CONS_POINTS: [number,number,number,number] = [100,55,35,15];

const ROLES: Record<Axis,string[]> = {
  pensamiento_critico:["Analista de Datos Jr.","Analista de Negocios Jr."],
  comunicacion_asertiva:["Ejecutivo de Cuenta Jr.","Coordinador de Comunicación Jr."],
  trabajo_equipo:["Coordinador de Operaciones Jr.","Asistente de Proyectos Jr."],
  resiliencia:["Ejecutivo de Ventas / SDR Jr.","Especialista de Atención a Clientes Jr."],
  adaptabilidad:["Generalista de Startups Jr.","Coordinador de Proyectos Jr."],
  autogestion:["Asistente Ejecutivo Jr.","Coordinador Administrativo Jr."],
  liderazgo:["Project Manager Jr.","Líder de Equipo Jr."],
  competencia_digital:["Analista de Datos Jr.","Especialista en Herramientas Digitales Jr."],
};
const CINTILLO: Record<Axis,string> = {
  pensamiento_critico:"Mente analítica y resolutiva", comunicacion_asertiva:"Comunica con claridad",
  trabajo_equipo:"Colabora y suma al equipo", resiliencia:"Resiliencia a prueba de todo",
  adaptabilidad:"Se adapta y aprende rápido", autogestion:"Organización y autonomía",
  liderazgo:"Iniciativa que moviliza", competencia_digital:"Perfil digital y de datos",
};

// ── Validación de entrada ───────────────────────────────────────────────────
function validate(ans: any) {
  if (!ans || typeof ans !== "object") throw new Error("respuestas ausentes");
  const codes = [...Object.keys(ITEMS), ATT_CODE, CONS_CODE];
  for (const c of codes) {
    const v = ans[c];
    if (!Number.isInteger(v) || v < 0 || v > 3) throw new Error(`Respuesta inválida para ${c} (se espera índice 0-3)`);
  }
}

// ── Scorer determinista (función pura) ──────────────────────────────────────
function score(ans: Record<string,number>, timings?: Record<string,number>) {
  const acc: Record<string,number[]> = {};
  for (const a of AXES) acc[a] = [];
  let maxCount = 0;
  for (const [code, def] of Object.entries(ITEMS)) {
    const pts = def.points[ans[code]];
    acc[def.axis].push(pts);
    if (pts === 100) maxCount++;
  }
  const ejes = {} as Record<Axis,number>;
  for (const a of AXES) ejes[a] = Math.round(acc[a].reduce((s,x)=>s+x,0) / acc[a].length);
  const ranked = [...AXES].sort((x,y)=> ejes[y]-ejes[x]);
  const indice_global = Math.round(AXES.reduce((s,a)=>s+ejes[a],0) / AXES.length);
  const fortalezas = [ranked[0], ranked[1]];
  const desarrollo = ranked[ranked.length-1];

  // ── Validez (con precedencia) ──
  const attFail = ans[ATT_CODE] !== ATT_EXPECTED;
  const desirability = maxCount / Object.keys(ITEMS).length >= 0.9;
  const consDelta = Math.abs(CONS_POINTS[ans[CONS_CODE]] - ITEMS[CONS_PAIR].points[ans[CONS_PAIR]]);
  const inconsistent = consDelta > 40;
  let apresurado = false;
  if (timings && Object.keys(timings).length) {
    const ts = Object.values(timings).filter((n)=>Number.isFinite(n)).sort((a,b)=>a-b);
    if (ts.length) { const mid = Math.floor(ts.length/2); const median = ts.length%2 ? ts[mid] : (ts[mid-1]+ts[mid])/2; apresurado = median < 1500; }
  }
  const validez = attFail ? "atencion_fallida" : desirability ? "deseabilidad_alta" : inconsistent ? "inconsistente" : apresurado ? "apresurado" : "valido";

  return { ejes, indice_global, fortalezas, desarrollo, validez, arquetipo: AXIS_LABEL[fortalezas[0]] };
}

// ── Fallback (sin DeepSeek): narrativa por plantilla ────────────────────────
function fallbackNarrative(s: ReturnType<typeof score>, p: any) {
  const top1 = s.fortalezas[0] as Axis, top2 = s.fortalezas[1] as Axis, low = s.desarrollo as Axis;
  const roles = ROLES[top1];
  const nivel = (Number(p.semestre) >= 7) ? "listo para prácticas o rol junior" : "en desarrollo";
  const fortalezas = `Destacas en ${AXIS_SHORT[top1]} y ${AXIS_SHORT[top2]}. Tus decisiones reflejan un criterio sólido y consistente para dar el salto al mundo profesional.`;
  const areas_mejora = `Tu mayor área de oportunidad está en ${AXIS_SHORT[low]}: trabajarla equilibrará tu perfil y te abrirá más puertas.`;
  const recomendaciones = `Te sugerimos sumarte a un proyecto donde practiques ${AXIS_SHORT[low]}, tomar un curso corto enfocado en esa área y mantener el hábito de aprender de forma constante.`;
  const mensaje_completo = `¡Felicidades por completar tu test de talento! ${fortalezas} ${areas_mejora} ${recomendaciones} Vas por muy buen camino: cada paso suma a tu perfil, y las empresas valoran justo esa mezcla de talento y ganas de crecer. Confía en tu proceso y sigue construyendo — tu próxima gran oportunidad está más cerca de lo que crees. 🚀`;
  return {
    cintillo: CINTILLO[top1].slice(0,50),
    descripcion_breve: `Perfil con fortaleza en ${AXIS_SHORT[top1]} y ${AXIS_SHORT[top2]}; ${nivel}.`.slice(0,220),
    tags: Array.from(new Set([AXIS_SHORT[top1], AXIS_SHORT[top2], (p.carrera||"universitario"), "perfil junior", "proactividad"])).slice(0,7),
    resumen: `Perfil con fortaleza en ${AXIS_SHORT[top1]}, ${nivel}.`.slice(0,150),
    recomendacion: `Roles sugeridos: ${roles.join(", ")}.`.slice(0,200),
    feedback_estudiante: { fortalezas, areas_mejora, recomendaciones, mensaje_completo },
  };
}

// ── DeepSeek: SOLO interpreta los puntajes (no los calcula) ─────────────────
async function interpretDeepSeek(s: ReturnType<typeof score>, p: any, key: string) {
  const schema = `{"cintillo":"string atractivo máx 50 caracteres","descripcion_breve":"string máx 220 caracteres que describe el perfil en tono claro y positivo (se muestra junto a la gráfica)","tags":["5 a 8 palabras clave"],"resumen":"string máx 150 caracteres para el reclutador","recomendacion":"string con 2-3 roles junior sugeridos, máx 200 caracteres","feedback_estudiante":{"fortalezas":"2-3 fortalezas específicas, 30-50 palabras","areas_mejora":"1-2 áreas de oportunidad, 30-50 palabras","recomendaciones":"acciones concretas (cursos/proyectos/hábitos), 40-60 palabras","mensaje_completo":"150-200 palabras, 3-4 párrafos cortos, tono de mentor/coach cercano y alentador"}}`;
  const sys = `Eres un mentor y evaluador de talento para una plataforma de reclutamiento de estudiantes universitarios en México. Los puntajes de las 8 competencias YA ESTÁN CALCULADOS y son definitivos: NO los recalcules ni los menciones como números. Tu tarea es SOLO interpretarlos y redactar la narrativa. Reconoce las fortalezas del estudiante, señala 1-2 áreas de oportunidad y da recomendaciones concretas, con tono positivo, cercano y alentador. Devuelve ÚNICAMENTE un objeto JSON válido en español con EXACTAMENTE este esquema: ${schema}`;
  const ejesTxt = AXES.map((a)=>`- ${AXIS_LABEL[a]}: ${s.ejes[a]}/100`).join("\n");
  const usr = `PERFIL DEL ESTUDIANTE:\n- Carrera: ${p.carrera||"N/D"}\n- Semestre: ${p.semestre||"N/D"}\n- Inglés: ${p.ingles||"N/D"}\n- Disponibilidad: ${p.disponibilidad||"N/D"}\n\nPUNTAJES POR COMPETENCIA (0-100, ya calculados):\n${ejesTxt}\n\nFortalezas principales: ${s.fortalezas.map((a)=>AXIS_LABEL[a as Axis]).join(", ")}\nÁrea de desarrollo: ${AXIS_LABEL[s.desarrollo as Axis]}\nÍndice global: ${s.indice_global}/100`;
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "deepseek-chat", temperature: .4, response_format: { type: "json_object" }, messages: [{ role: "system", content: sys }, { role: "user", content: usr }] }),
  });
  if (!res.ok) throw new Error("DeepSeek HTTP " + res.status);
  const data = await res.json();
  const parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
  if (!parsed?.descripcion_breve || !parsed?.feedback_estudiante?.mensaje_completo) throw new Error("Respuesta IA con formato inesperado");
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

    const body = await req.json();
    const answers = body?.respuestas ?? body;   // acepta {respuestas,timings} o el objeto directo
    const timings = body?.timings;
    validate(answers);

    const { data: student } = await supabase.from("students").select("id, carrera, semestre, disponibilidad, ingles").eq("user_id", user.id).maybeSingle();
    if (!student) return json({ error: "Perfil de estudiante no encontrado" }, 404);

    const s = score(answers, timings);

    const key = Deno.env.get("DEEPSEEK_API_KEY") || Deno.env.get("Deepseek");
    let narrative: any, modelo: string;
    if (key) {
      try { narrative = await interpretDeepSeek(s, student, key); modelo = "deepseek-chat"; }
      catch (_e) { narrative = fallbackNarrative(s, student); modelo = "reglas (fallback IA)"; }
    } else { narrative = fallbackNarrative(s, student); modelo = "reglas"; }

    const clasificacion = {
      ejes: s.ejes, indice_global: s.indice_global, fortalezas: s.fortalezas, desarrollo: s.desarrollo,
      validez: s.validez, arquetipo: s.arquetipo, ...narrative,
    };
    const respuestas = { instrumento_version: INSTRUMENT_VERSION, answers, timings: timings ?? null };
    await supabase.from("test_results").insert({ student_id: student.id, respuestas, clasificacion, arquetipo: s.arquetipo, modelo });
    return json({ modelo, arquetipo: s.arquetipo, clasificacion });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 400);
  }
});
