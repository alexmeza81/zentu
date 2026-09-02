// Supabase Edge Function: enviar-acceso-abierto
// Manda el aviso de "ya puedes entrar" a la waitlist, uno por uno, vía Resend.
// - Auth: requiere usuario Y is_admin(). La llave de Resend vive como secreto del
//   servidor; nunca puede estar en el navegador, porque con ella cualquiera podría
//   mandar correo en nombre de zentu.app.
// - Idempotente: solo escribe a quien tiene acceso_email_enviado_at en null, y marca
//   cada envío en cuanto Resend confirma. Un doble clic no reenvía.
// - La plantilla se lee del propio sitio, así cambiar el copy es un git push y no
//   hace falta volver a desplegar esta función.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const PLANTILLA = "https://www.zentu.app/docs/correo-acceso-abierto.html";
const REMITENTE = "Alex de ZentU <hola@zentu.app>";
const ASUNTO = "Ya puedes entrar a ZentU";
const BAJA = "mailto:hola@zentu.app?subject=Baja%20de%20ZentU";
// Tope por corrida. El plan gratis de Resend son 100 al día; quedarse por debajo
// deja margen para los códigos de acceso, que salen por el mismo dominio.
const TOPE_POR_CORRIDA = 80;
// Resend limita peticiones por segundo; una pausa corta evita los 429.
const PAUSA_MS = 550;

async function logErr(fn: string, message: unknown, detail?: unknown) {
  try {
    const url = Deno.env.get("SUPABASE_URL"), sk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !sk) return;
    await fetch(`${url}/rest/v1/error_log`, {
      method: "POST",
      headers: { apikey: sk, Authorization: `Bearer ${sk}`, "Content-Type": "application/json" },
      body: JSON.stringify({ source: "edge", fn, message: String(message).slice(0, 600), detail: detail ?? null }),
    });
  } catch (_e) { /* noop */ }
}

const escapar = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
           .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");

    const authHeader = req.headers.get("Authorization") || "";
    const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });

    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: "No autenticado" }, 401);

    const { data: isAdmin } = await asUser.rpc("is_admin");
    if (!isAdmin) return json({ error: "Solo un administrador puede enviar este aviso." }, 403);

    if (!resendKey) {
      return json({
        error: "Falta el secreto RESEND_API_KEY en Supabase.",
        comoArreglarlo: "Project Settings → Edge Functions → Secrets → Add new secret, con nombre RESEND_API_KEY.",
      }, 400);
    }

    const body = await req.json().catch(() => ({}));
    const publico = body?.publico === "empresas" ? "empresas" : "estudiantes";
    const tabla = publico === "empresas" ? "waitlist_empresas" : "waitlist_estudiantes";
    // Corrida en seco: cuenta a quién le tocaría, sin mandar nada.
    const enSeco = body?.en_seco === true;
    const soloA: string | null = typeof body?.solo_a === "string" ? body.solo_a.toLowerCase() : null;

    // Antes de escribir a nadie, comprobar que el acceso está realmente abierto:
    // el correo dice "ya puedes entrar" y sería falso si el portero sigue cerrado.
    const admin = createClient(url, serviceKey);
    const { data: cfg } = await admin.from("app_config").select("*").eq("id", true).maybeSingle();
    const abierto = publico === "empresas" ? cfg?.empresas_abierto : cfg?.estudiantes_abierto;
    if (!abierto) {
      return json({
        error: `El acceso a ${publico} está cerrado. El correo diría "ya puedes entrar" y no sería cierto.`,
        comoArreglarlo: "Abre el acceso en el panel de admin, pestaña Lanzamiento, y vuelve a intentar.",
      }, 409);
    }

    // Solo quien no ha recibido el aviso.
    let q = admin.from(tabla).select("id,email,nombre").is("acceso_email_enviado_at", null).order("created_at");
    if (soloA) q = q.eq("email", soloA);
    const { data: pendientes, error: errLectura } = await q;
    if (errLectura) throw errLectura;

    const lista = (pendientes || []).filter((r: any) => r.email);
    if (!lista.length) return json({ ok: true, enviados: 0, fallidos: 0, pendientes: 0, mensaje: "No hay nadie pendiente de aviso." });

    const tanda = lista.slice(0, TOPE_POR_CORRIDA);
    const restantes = lista.length - tanda.length;

    if (enSeco) {
      return json({ ok: true, en_seco: true, seEnviarianA: tanda.length, quedarianPendientes: restantes,
                    muestra: tanda.slice(0, 5).map((r: any) => r.email) });
    }

    // Plantilla desde el sitio, una sola vez para toda la tanda.
    const resp = await fetch(PLANTILLA, { headers: { "cache-control": "no-cache" } });
    if (!resp.ok) throw new Error(`No se pudo leer la plantilla (HTTP ${resp.status})`);
    const plantilla = await resp.text();

    let enviados = 0;
    const fallidos: { email: string; motivo: string }[] = [];

    for (const fila of tanda) {
      const nombre = (fila.nombre || "").trim();
      const html = plantilla
        .replace(/\{\{\{FIRST_NAME\}\}\}/g, escapar(nombre))
        .replace(/\{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}/g, BAJA)
        // Sin nombre el saludo quedaría "Hola ,": se colapsa a "Hola,".
        .replace(/Hola\s+,/g, "Hola,");

      try {
        const envio = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: REMITENTE, to: [fila.email], reply_to: "hola@zentu.app", subject: ASUNTO, html }),
        });
        const res = await envio.json().catch(() => ({}));

        if (!envio.ok || !res?.id) {
          fallidos.push({ email: fila.email, motivo: res?.message || `HTTP ${envio.status}` });
        } else {
          // Se marca solo cuando Resend confirmó: si esto falla, el peor caso es
          // un reenvío, nunca dar por avisado a quien no recibió nada.
          await admin.from(tabla)
            .update({ acceso_email_enviado_at: new Date().toISOString(), acceso_email_id: res.id })
            .eq("id", fila.id);
          enviados++;
        }
      } catch (e) {
        fallidos.push({ email: fila.email, motivo: String(e).slice(0, 120) });
      }
      await dormir(PAUSA_MS);
    }

    if (fallidos.length) await logErr("enviar-acceso-abierto", `${fallidos.length} envío(s) fallaron`, fallidos.slice(0, 20));

    return json({
      ok: true, publico, enviados, fallidos: fallidos.length,
      detalleFallidos: fallidos.slice(0, 10),
      pendientes: restantes,
      mensaje: restantes
        ? `Se enviaron ${enviados}. Quedan ${restantes} para la próxima corrida (tope de ${TOPE_POR_CORRIDA} por vez).`
        : `Se enviaron ${enviados}. No queda nadie pendiente.`,
    });
  } catch (e) {
    await logErr("enviar-acceso-abierto", e);
    return json({ error: "No se pudo completar el envío: " + String(e).slice(0, 200) }, 500);
  }
});
