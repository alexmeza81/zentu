// Supabase Edge Function: importar-oferta
// El reclutador pega un ENLACE de la oferta o el TEXTO de la descripción.
// - Si es URL: se baja server-side (con guard anti-SSRF y redirects manuales validados),
//   se intenta extraer JSON-LD JobPosting (datos estructurados) y se limpia el texto.
// - El contenido (estructurado + texto) se manda a DeepSeek para normalizarlo a nuestro
//   esquema de vacante. Fallback determinista si no hay IA disponible.
// - NUNCA guarda nada: solo devuelve el borrador para que el reclutador lo revise/edite.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const MODALIDADES = ["Remoto", "Híbrido", "Presencial"];

// ── Anti-SSRF ────────────────────────────────────────────────
function isPrivateIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;            // link-local + metadata 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;  // CGNAT
  return false;
}
function validateUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("URL inválida"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Solo se permiten enlaces http/https");
  if (u.port && !["80", "443", ""].includes(u.port)) throw new Error("Puerto no permitido");
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".")) throw new Error("Host no permitido");
  if (host.includes(":")) throw new Error("Host no permitido"); // IPv6 literal
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) && isPrivateIPv4(host)) throw new Error("Host no permitido");
  return u;
}
function isPrivateIPv6(ip: string): boolean {
  const s = ip.toLowerCase();
  if (s === "::1" || s === "::") return true;                       // loopback / unspecified
  if (/^fe[89ab]/.test(s)) return true;                            // fe80::/10 link-local
  if (/^f[cd]/.test(s)) return true;                               // fc00::/7 unique-local
  const m = s.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);               // IPv4-mapped ::ffff:a.b.c.d
  if (m) return isPrivateIPv4(m[1]);
  return false;
}
async function assertPublicHost(host: string) {
  // IP literal ya validada como pública en validateUrl (las privadas/IPv6 se bloquean allí).
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return;
  // Hostname: resolvemos A y AAAA y FALLAMOS CERRADO — si no verificamos que resuelve a
  // IPs públicas, bloqueamos. Residual: DNS rebinding entre esta resolución y el fetch
  // (Deno no permite fijar la IP del socket); el fail-closed + A/AAAA reduce el riesgo real.
  let a: string[] = [], aaaa: string[] = [];
  try { a = await Deno.resolveDns(host, "A"); } catch { /* sin registro A */ }
  try { aaaa = await Deno.resolveDns(host, "AAAA"); } catch { /* sin registro AAAA */ }
  if (!a.length && !aaaa.length) throw new Error("No se pudo resolver el host (bloqueado por seguridad)");
  if (a.some(isPrivateIPv4) || aaaa.some(isPrivateIPv6)) throw new Error("Host resuelve a IP privada");
}
// Lee el cuerpo por streaming con TOPE de bytes (evita agotar memoria con páginas enormes).
async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const cl = Number(res.headers.get("content-length") || 0);
  if (cl && cl > maxBytes) throw new Error("Contenido demasiado grande");
  const reader = res.body?.getReader();
  if (!reader) return (await res.text()).slice(0, maxBytes);
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.length;
      if (total > maxBytes) { try { await reader.cancel(); } catch { /* noop */ } throw new Error("Contenido demasiado grande"); }
      chunks.push(value);
    }
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.length; }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}
async function safeFetch(rawUrl: string): Promise<Response> {
  let url = rawUrl;
  for (let i = 0; i < 4; i++) {
    const u = validateUrl(url);
    await assertPublicHost(u.hostname);
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    let res: Response;
    try {
      res = await fetch(u.toString(), {
        redirect: "manual",
        signal: ctl.signal,
        headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "es-MX,es;q=0.9,en;q=0.8" },
      });
    } finally { clearTimeout(t); }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error("Redirección sin destino");
      url = new URL(loc, u).toString();
      continue;
    }
    return res;
  }
  throw new Error("Demasiadas redirecciones");
}

// ── Parsing ──────────────────────────────────────────────────
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
function extractJsonLd(html: string): any | null {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const candidates: any[] = [];
  for (const b of blocks) {
    try {
      const parsed = JSON.parse(b[1].trim());
      const arr = Array.isArray(parsed) ? parsed : (parsed["@graph"] ? parsed["@graph"] : [parsed]);
      for (const node of arr) candidates.push(node);
    } catch { /* ignora JSON-LD malformado */ }
  }
  const hasType = (n: any) => { const t = n?.["@type"]; return Array.isArray(t) ? t.includes("JobPosting") : t === "JobPosting"; };
  return candidates.find(hasType) || null;
}
function structuredHint(jp: any): string {
  if (!jp) return "";
  const loc = jp.jobLocation?.address || jp.jobLocation?.[0]?.address || {};
  const sal = jp.baseSalary?.value || jp.baseSalary || null;
  const hint = {
    title: jp.title || null,
    company: jp.hiringOrganization?.name || null,
    employmentType: jp.employmentType || null,
    remote: jp.jobLocationType === "TELECOMMUTE" ? "Remoto" : null,
    location: [loc.addressLocality, loc.addressRegion, loc.addressCountry].filter(Boolean).join(", ") || null,
    salary: sal ? (typeof sal === "object" ? [sal.minValue, sal.maxValue, sal.value, sal.unitText, sal.currency].filter(Boolean).join(" ") : String(sal)) : null,
  };
  return "DATOS ESTRUCTURADOS (JobPosting):\n" + JSON.stringify(hint) + "\n\n";
}

// ── DeepSeek: normaliza a nuestro esquema ────────────────────
async function extractDeepSeek(sourceText: string, key: string) {
  const sys = "Eres un asistente que EXTRAE los datos de una oferta de empleo desde texto crudo y los devuelve en JSON con EXACTAMENTE estas claves: " +
    "\"titulo\" (string, el puesto), " +
    "\"area\" (string corta de categoría, p.ej. 'Datos','Marketing','Tecnología','Finanzas','Ventas','RRHH','Diseño','Operaciones','Legal','Producto'), " +
    "\"modalidad\" (uno de: 'Remoto','Híbrido','Presencial', o '' si no se indica), " +
    "\"ubicacion\" (ciudad y/o país, o ''), " +
    "\"salario\" (el salario TAL COMO aparece en el texto, o '' si no aparece — NO lo inventes), " +
    "\"tags\" (array de 3 a 8 habilidades o herramientas clave, cortas y en singular, p.ej. ['SQL','Python','Excel']), " +
    "\"descripcion\" (resumen claro en español de 400 a 900 caracteres del rol, responsabilidades y requisitos). " +
    "Si un dato no aparece usa '' o []. Responde SOLO con el JSON, sin texto adicional.";
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "deepseek-chat", temperature: 0.2, response_format: { type: "json_object" },
      messages: [{ role: "system", content: sys }, { role: "user", content: sourceText.slice(0, 7000) }],
    }),
  });
  if (!res.ok) throw new Error("DeepSeek " + res.status);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || "{}";
  return JSON.parse(content);
}

function coerceOffer(o: any) {
  const str = (v: any, max = 400) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  let modalidad = str(o?.modalidad, 20);
  if (!MODALIDADES.includes(modalidad)) modalidad = "";
  let tags: string[] = Array.isArray(o?.tags) ? o.tags.map((t: any) => String(t).trim()).filter(Boolean).slice(0, 8) : [];
  return {
    titulo: str(o?.titulo, 120),
    area: str(o?.area, 60),
    modalidad,
    ubicacion: str(o?.ubicacion, 80),
    salario: str(o?.salario, 60),
    tags,
    descripcion: str(o?.descripcion, 2000),
  };
}
function fallbackOffer(jp: any, text: string) {
  const remote = jp?.jobLocationType === "TELECOMMUTE" ? "Remoto" : "";
  const loc = jp?.jobLocation?.address || {};
  return coerceOffer({
    titulo: jp?.title || (text.slice(0, 80)),
    area: "",
    modalidad: remote,
    ubicacion: [loc.addressLocality, loc.addressRegion].filter(Boolean).join(", "),
    salario: "",
    tags: [],
    descripcion: jp?.description ? stripHtml(String(jp.description)) : text.slice(0, 900),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "No autenticado" }, 401);

    const body = await req.json().catch(() => ({}));
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!url && text.length < 20) return json({ error: "Pega un enlace válido o el texto de la oferta (mínimo 20 caracteres)." }, 400);

    let jsonld: any = null;
    let pageText = text;
    let source: "url" | "text" = text ? "text" : "url";

    if (url) {
      try {
        const res = await safeFetch(url);
        if (!res.ok) throw new Error("La página respondió " + res.status);
        const ct = (res.headers.get("content-type") || "").toLowerCase();
        const raw = (await readCapped(res, 2_000_000)).slice(0, 250000);
        if (ct.includes("html") || raw.includes("<")) {
          jsonld = extractJsonLd(raw);
          pageText = stripHtml(raw).slice(0, 8000);
        } else {
          pageText = raw.slice(0, 8000);
        }
        source = "url";
      } catch (e) {
        // El sitio nos bloqueó o no se pudo leer: si además pegaron texto, seguimos con el texto.
        if (text.length >= 20) { source = "text"; pageText = text; }
        else return json({ error: "No pudimos leer esa página (" + String((e as Error)?.message || e) + "). Copia y pega el texto de la oferta y reintenta." }, 422);
      }
    }

    const sourceText = (jsonld ? structuredHint(jsonld) : "") + "CONTENIDO:\n" + pageText;
    const key = Deno.env.get("DEEPSEEK_API_KEY") || Deno.env.get("Deepseek");
    let offer, modelo: string;
    if (key) {
      try { offer = coerceOffer(await extractDeepSeek(sourceText, key)); modelo = "deepseek-chat"; }
      catch (_e) { offer = fallbackOffer(jsonld, pageText); modelo = "reglas (fallback IA)"; }
    } else {
      offer = fallbackOffer(jsonld, pageText); modelo = "reglas";
    }

    if (!offer.titulo && !offer.descripcion) return json({ error: "No se encontraron datos de una oferta en ese contenido." }, 422);
    return json({ ok: true, offer, source, structured: !!jsonld, modelo });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 400);
  }
});
