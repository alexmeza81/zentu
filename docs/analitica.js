// Analítica de ZentU — una visita, una fila. Sin cookies y sin datos personales.
//
// Qué NO manda, a propósito: IP, user agent, la URL completa ni nada identificable.
// Solo la ruta, el canal (utm) y el dominio de procedencia. El id de visita vive en
// sessionStorage y muere al cerrar la pestaña: no sirve para seguir a nadie entre
// sesiones, así que no hace falta banner de consentimiento.
//
// Nunca bloquea ni rompe la página: todo va dentro de un try, y si falla, falla en
// silencio. Una analítica que tira el sitio es peor que no tener analítica.
(function () {
  try {
    var U = 'https://jlivxulenqbgsybqodiv.supabase.co';
    var K = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsaXZ4dWxlbnFiZ3N5YnFvZGl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwMjQ5ODEsImV4cCI6MjA4MzYwMDk4MX0.qG4Tx7yB9185vypoZa91y3PPCdphwqXRz8WQKsKBH5g';

    // Fuera bots y rastreadores: inflan las visitas y no son gente.
    if (/bot|crawl|spider|slurp|headless|lighthouse|preview|monitor/i.test(navigator.userAgent || '')) return;
    // Fuera también las pruebas locales.
    if (location.protocol === 'file:' || /localhost|127\.0\.0\.1/.test(location.hostname)) return;

    var ruta = (location.pathname || '/').slice(0, 120);

    // Id de pestaña, efímero. Solo sirve para no contar diez veces a quien recarga.
    var visita = null;
    try {
      visita = sessionStorage.getItem('zentu_visita');
      if (!visita) {
        visita = Math.random().toString(36).slice(2) + Date.now().toString(36);
        sessionStorage.setItem('zentu_visita', visita);
      }
      // Una fila por ruta y por pestaña: recargar no vuelve a contar.
      var yaVistas = (sessionStorage.getItem('zentu_rutas') || '').split('|');
      if (yaVistas.indexOf(ruta) !== -1) return;
      sessionStorage.setItem('zentu_rutas', yaVistas.concat(ruta).join('|').slice(-800));
    } catch (e) { /* modo privado: se cuenta igual, sin deduplicar */ }

    var q = new URLSearchParams(location.search);
    var ref = null;
    try {
      if (document.referrer && document.referrer.indexOf(location.host) === -1) {
        ref = new URL(document.referrer).hostname.slice(0, 200);
      }
    } catch (e) {}

    var cuerpo = JSON.stringify({
      path: ruta,
      visita: visita,
      utm_source: (q.get('utm_source') || q.get('ref') || '').slice(0, 120) || null,
      utm_campaign: (q.get('utm_campaign') || '').slice(0, 120) || null,
      referrer: ref
    });

    // sendBeacon sobrevive a que la persona navegue enseguida; fetch es el respaldo.
    var url = U + '/rest/v1/page_views';
    var cabeceras = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
    fetch(url, { method: 'POST', headers: cabeceras, body: cuerpo, keepalive: true }).catch(function () {});
  } catch (e) { /* nunca romper la página por una métrica */ }
})();
