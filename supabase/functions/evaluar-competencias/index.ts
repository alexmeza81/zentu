// Supabase Edge Function: evaluar-competencias  (Evaluación de Talento v4 · elección forzada)
// - 18 preguntas de ELECCIÓN FORZADA: en cada una, 4 opciones TODAS válidas, cada una
//   mapeada a un eje distinto. No hay "respuesta correcta" -> no se puede inflar.
// - El cliente envía SOLO el índice canónico de la opción elegida. El mapeo opción→eje
//   (la CLAVE) vive únicamente aquí, nunca en el navegador.
// - Puntaje = afinidad (picks/exposiciones*100) por eje -> perfil de fortalezas relativo.
// - DeepSeek SOLO interpreta (narrativa); no calcula puntajes. Fallback por reglas.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const INSTRUMENT_VERSION = "fc-v1";

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

// ── CLAVE PRIVADA: opción→eje en ORDEN CANÓNICO (índice 0..3) ────────────────
const ITEM_AXES: Record<string, Axis[]> = {
  I1:["adaptabilidad","comunicacion_asertiva","trabajo_equipo","autogestion"],
  I2:["pensamiento_critico","liderazgo","competencia_digital","autogestion"],
  I3:["pensamiento_critico","trabajo_equipo","liderazgo","comunicacion_asertiva"],
  I4:["resiliencia","adaptabilidad","pensamiento_critico","trabajo_equipo"],
  I5:["competencia_digital","comunicacion_asertiva","adaptabilidad","autogestion"],
  I6:["resiliencia","liderazgo","trabajo_equipo","pensamiento_critico"],
  I7:["pensamiento_critico","autogestion","trabajo_equipo","resiliencia"],
  I8:["adaptabilidad","comunicacion_asertiva","liderazgo","competencia_digital"],
  I9:["autogestion","competencia_digital","resiliencia","adaptabilidad"],
  I10:["pensamiento_critico","liderazgo","trabajo_equipo","comunicacion_asertiva"],
  I11:["resiliencia","adaptabilidad","competencia_digital","comunicacion_asertiva"],
  I12:["autogestion","liderazgo","competencia_digital","trabajo_equipo"],
  I13:["pensamiento_critico","liderazgo","trabajo_equipo","adaptabilidad"],
  I14:["resiliencia","autogestion","adaptabilidad","comunicacion_asertiva"],
  I15:["comunicacion_asertiva","pensamiento_critico","competencia_digital","resiliencia"],
  I16:["autogestion","liderazgo","resiliencia","competencia_digital"],
};
const SCORED = Object.keys(ITEM_AXES);
const ATT_CODE = "CTRL-ATT", ATT_EXPECTED = 2;
const CONS_CODE = "CTRL-CONS", CONS_PAIR = "I13";
const CONS_AXES: Axis[] = ["pensamiento_critico","liderazgo","trabajo_equipo","adaptabilidad"];
const EXPO: Record<Axis,number> = Object.fromEntries(AXES.map(a=>[a,0])) as Record<Axis,number>;
for (const c of SCORED) for (const ax of ITEM_AXES[c]) EXPO[ax]++;

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

function validate(ans: any) {
  if (!ans || typeof ans !== "object") throw new Error("respuestas ausentes");
  for (const c of [...SCORED, ATT_CODE, CONS_CODE]) {
    const v = ans[c];
    if (!Number.isInteger(v) || v < 0 || v > 3) throw new Error(`Respuesta inválida para ${c} (se espera índice 0-3)`);
  }
}

function score(ans: Record<string,number>, timings?: Record<string,number>) {
  const picks = Object.fromEntries(AXES.map(a=>[a,0])) as Record<Axis,number>;
  for (const c of SCORED) picks[ITEM_AXES[c][ans[c]]]++;
  const ejes = {} as Record<Axis,number>;
  for (const a of AXES) ejes[a] = EXPO[a] ? Math.round(picks[a] / EXPO[a] * 100) : 0;
  const ranked = [...AXES].sort((x,y)=> ejes[y]-ejes[x]);
  const fortalezas = [ranked[0], ranked[1]];
  const desarrollo = ranked[ranked.length-1];
  const attFail = ans[ATT_CODE] !== ATT_EXPECTED;
  const inconsistent = CONS_AXES[ans[CONS_CODE]] !== ITEM_AXES[CONS_PAIR][ans[CONS_PAIR]];
  let apresurado = false;
  if (timings && Object.keys(timings).length) {
    const ts = Object.values(timings).filter((n)=>Number.isFinite(n)).sort((a,b)=>a-b);
    if (ts.length) { const m = Math.floor(ts.length/2); const med = ts.length%2 ? ts[m] : (ts[m-1]+ts[m])/2; apresurado = med < 1500; }
  }
  const validez = attFail ? "atencion_fallida" : inconsistent ? "inconsistente" : apresurado ? "apresurado" : "valido";
  return { ejes, fortalezas, desarrollo, validez, arquetipo: AXIS_LABEL[fortalezas[0]] };
}

function fallbackNarrative(s: ReturnType<typeof score>, p: any) {
  const top1 = s.fortalezas[0] as Axis, top2 = s.fortalezas[1] as Axis, low = s.desarrollo as Axis;
  const roles = ROLES[top1];
  const fortalezas = `Tu perfil se inclina con fuerza hacia ${AXIS_SHORT[top1]} y ${AXIS_SHORT[top2]}: es tu forma natural de aportar y donde más brillas.`;
  const areas_mejora = `Tu estilo se apoya menos en ${AXIS_SHORT[low]}. No es una debilidad, sino un terreno para explorar y sumar a tu perfil.`;
  const recomendaciones = `Te sugerimos buscar un proyecto donde uses tu ${AXIS_SHORT[top1]}, y probar retos pequeños que te acerquen a ${AXIS_SHORT[low]} para redondear tu perfil.`;
  const mensaje_completo = `¡Felicidades por completar tu test de talento! ${fortalezas} ${areas_mejora} ${recomendaciones} Recuerda que no hay un perfil mejor que otro: las empresas buscan distintas fortalezas, y conocer la tuya te ayuda a elegir dónde vas a destacar. Confía en tu estilo y sigue construyendo — tu próxima gran oportunidad está más cerca de lo que crees. 🚀`;
  return {
    cintillo: CINTILLO[top1].slice(0,50),
    descripcion_breve: `Perfil que se inclina hacia ${AXIS_SHORT[top1]} y ${AXIS_SHORT[top2]}.`.slice(0,220),
    tags: Array.from(new Set([AXIS_SHORT[top1], AXIS_SHORT[top2], (p.carrera||"universitario"), "perfil junior"])).slice(0,7),
    resumen: `Se inclina hacia ${AXIS_SHORT[top1]} y ${AXIS_SHORT[top2]}.`.slice(0,150),
    recomendacion: `Roles afines: ${roles.join(", ")}.`.slice(0,200),
    feedback_estudiante: { fortalezas, areas_mejora, recomendaciones, mensaje_completo },
  };
}

async function interpretDeepSeek(s: ReturnType<typeof score>, p: any, key: string) {
  const schema = `{"cintillo":"string atractivo máx 50 caracteres","descripcion_breve":"string máx 220 caracteres que describe el estilo/perfil de fortalezas (se muestra junto a la gráfica)","tags":["5 a 8 palabras clave"],"resumen":"string máx 150 caracteres para el reclutador","recomendacion":"string con 2-3 roles junior afines, máx 200 caracteres","feedback_estudiante":{"fortalezas":"2-3 fortalezas específicas, 30-50 palabras","areas_mejora":"1-2 estilos a explorar (NO debilidades), 30-50 palabras","recomendaciones":"acciones concretas (proyectos/hábitos), 40-60 palabras","mensaje_completo":"150-200 palabras, 3-4 párrafos cortos, tono de mentor cercano y alentador"}}`;
  const sys = `Eres un mentor y evaluador de talento para una plataforma de reclutamiento de estudiantes universitarios en México. El test es de ELECCIÓN FORZADA: el resultado es un PERFIL DE FORTALEZAS RELATIVO (afinidad), NO una medida de qué tan bueno es en algo. Un puntaje bajo en una competencia significa que es MENOS su estilo dominante, NUNCA una debilidad o carencia. Los puntajes YA ESTÁN CALCULADOS: NO los recalcules ni los cites como números. Tu tarea es SOLO interpretarlos y redactar la narrativa en positivo. Enmarca los ejes bajos como "estilos a explorar", nunca como defectos. Devuelve ÚNICAMENTE un objeto JSON válido en español con EXACTAMENTE este esquema: ${schema}`;
  const ejesTxt = [...AXES].sort((a,b)=>s.ejes[b]-s.ejes[a]).map((a)=>`- ${AXIS_LABEL[a]}: ${s.ejes[a]}`).join("\n");
  const exp = (p.experiencia && String(p.experiencia).trim()) ? `\n\nPROYECTOS Y EXPERIENCIA (contexto del propio estudiante, úsalo para personalizar):\n${String(p.experiencia).slice(0, 1200)}` : "";
  const usr = `PERFIL DEL ESTUDIANTE:\n- Carrera: ${p.carrera||"N/D"}\n- Semestre: ${p.semestre||"N/D"}\n- Inglés: ${p.ingles||"N/D"}\n- Disponibilidad: ${p.disponibilidad||"N/D"}\n\nAFINIDAD POR COMPETENCIA (0-100, relativo, ya calculado):\n${ejesTxt}\n\nEstilos dominantes: ${s.fortalezas.map((a)=>AXIS_LABEL[a as Axis]).join(", ")}\nEstilo a explorar: ${AXIS_LABEL[s.desarrollo as Axis]}${exp}`;
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
    const answers = body?.respuestas ?? body;
    const timings = body?.timings;
    validate(answers);

    const { data: student } = await supabase.from("students").select("id, carrera, semestre, disponibilidad, ingles, experiencia").eq("user_id", user.id).maybeSingle();
    if (!student) return json({ error: "Perfil de estudiante no encontrado" }, 404);

    const s = score(answers, timings);

    const key = Deno.env.get("DEEPSEEK_API_KEY") || Deno.env.get("Deepseek");
    let narrative: any, modelo: string;
    if (key) {
      try { narrative = await interpretDeepSeek(s, student, key); modelo = "deepseek-chat"; }
      catch (_e) { narrative = fallbackNarrative(s, student); modelo = "reglas (fallback IA)"; }
    } else { narrative = fallbackNarrative(s, student); modelo = "reglas"; }

    const clasificacion = {
      ejes: s.ejes, fortalezas: s.fortalezas, desarrollo: s.desarrollo,
      validez: s.validez, arquetipo: s.arquetipo, modelo_eval: "eleccion_forzada", ...narrative,
    };
    const respuestas = { instrumento_version: INSTRUMENT_VERSION, answers, timings: timings ?? null };
    await supabase.from("test_results").insert({ student_id: student.id, respuestas, clasificacion, arquetipo: s.arquetipo, modelo });
    return json({ modelo, arquetipo: s.arquetipo, clasificacion });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 400);
  }
});
