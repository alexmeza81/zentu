# Evaluación de Talento v4 — Elección forzada (definitivo)

**Fecha:** 2026-08-06
**Estado:** Modelo aprobado por el usuario; Edge Function desplegada; integración a dashboards pendiente (requiere aprobación para cutover a prod)
**Supersede:** v3 (`2026-08-05-evaluacion-talento-v3-design.md`)

## Por qué v4

El usuario probó v3 y **seguía sintiendo que había una "respuesta correcta"**. Causa raíz: los ítems de v3 (y v1) tenían opciones ordenadas de mejor a peor → cualquiera elige la ideal para quedar bien. Mide *si sabes la respuesta correcta*, no *cómo eres*.

**Fix v4 — elección forzada (ipsativo):** en cada pregunta las 4 opciones son **todas válidas** y cada una mapea a un **eje distinto**. No hay opción "correcta": eliges la que más se parece a ti. Como el mapeo opción→eje vive en el servidor, ni sabiendo el truco puedes inflarlo; y como elegir un estilo "gasta" la elección, **no puedes salir alto en todo** → radar de fortalezas honesto.

**Trade-off aceptado:** mide *afinidad/estilo relativo* (perfil de fortalezas), no competencia absoluta. Para un marketplace de talento es más útil y mucho más difícil de falsear.

## Modelo

- **18 preguntas:** 16 puntuables de elección forzada + 2 de control (atención + consistencia).
- **8 ejes** (sin cambio vs v3): pensamiento_critico, comunicacion_asertiva, trabajo_equipo, resiliencia, adaptabilidad, autogestion, liderazgo, competencia_digital.
- **Cobertura balanceada:** cada eje aparece como opción exactamente **8 veces** (16 ítems × 4 opciones = 64 = 8×8).
- **Puntaje (afinidad):** `ejes[eje] = round(picks[eje] / exposiciones[eje] × 100)`, con exposiciones = 8 para todos. Rango 0-100; promedio ~25 (reparte entre 8 ejes). Es afinidad relativa, NO "qué tan bueno".
- **Fortalezas** = 2 ejes con mayor afinidad; **estilo a explorar** = el de menor.
- **Sin índice global** (no tiene sentido en ipsativo; la suma es ~constante).

## Seguridad / anti-trampa (prácticas del .md aplicadas)

1. **Mapeo opción→eje (la clave) SOLO en el servidor.** El cliente recibe los textos de opción (no secretos) y envía el **índice canónico** elegido. Nunca conoce el eje.
2. **Orden de opciones barajado** por sesión en el cliente (se envía el índice canónico, no el mostrado).
3. **Sin "opción máxima"** → no aplica deseabilidad social; no hay nada obvio que elegir.
4. **Control de atención** ("elige la tercera opción", sin barajar) → bandera `atencion_fallida`.
5. **Control de consistencia**: un ítem parafrasea a I13; si el eje elegido difiere → `inconsistente`.
6. **Tiempo de respuesta** (si se envía) < 1.5 s mediana → `apresurado` (señal, no invalida).
7. Precedencia de validez: `atencion_fallida > inconsistente > apresurado > valido`.
8. **Versionado**: `instrumento_version = "fc-v1"` guardado en cada sesión.

## CLAVE del instrumento (opción→eje, orden canónico 0..3)

> Vive en la Edge Function `evaluar-competencias`. El cliente solo tiene los textos (abajo), NO estos ejes.

| Ítem | idx0 | idx1 | idx2 | idx3 |
|---|---|---|---|---|
| I1 | adaptabilidad | comunicacion_asertiva | trabajo_equipo | autogestion |
| I2 | pensamiento_critico | liderazgo | competencia_digital | autogestion |
| I3 | pensamiento_critico | trabajo_equipo | liderazgo | comunicacion_asertiva |
| I4 | resiliencia | adaptabilidad | pensamiento_critico | trabajo_equipo |
| I5 | competencia_digital | comunicacion_asertiva | adaptabilidad | autogestion |
| I6 | resiliencia | liderazgo | trabajo_equipo | pensamiento_critico |
| I7 | pensamiento_critico | autogestion | trabajo_equipo | resiliencia |
| I8 | adaptabilidad | comunicacion_asertiva | liderazgo | competencia_digital |
| I9 | autogestion | competencia_digital | resiliencia | adaptabilidad |
| I10 | pensamiento_critico | liderazgo | trabajo_equipo | comunicacion_asertiva |
| I11 | resiliencia | adaptabilidad | competencia_digital | comunicacion_asertiva |
| I12 | autogestion | liderazgo | competencia_digital | trabajo_equipo |
| I13 | pensamiento_critico | liderazgo | trabajo_equipo | adaptabilidad |
| I14 | resiliencia | autogestion | adaptabilidad | comunicacion_asertiva |
| I15 | comunicacion_asertiva | pensamiento_critico | competencia_digital | resiliencia |
| I16 | autogestion | liderazgo | resiliencia | competencia_digital |
| CTRL-CONS (=I13) | pensamiento_critico | liderazgo | trabajo_equipo | adaptabilidad |

CTRL-ATT: 4 opciones neutras; la esperada es índice 2 ("tercera opción"); no baraja.

Los textos de las 16 preguntas y sus opciones están en el prototipo `_prototipo_test_v4.html` (fuente de verdad del contenido para el cliente).

## Edge Function `evaluar-competencias` (desplegada, v2/fc-v1)

- **Entrada:** `{ respuestas: { I1..I16, "CTRL-ATT", "CTRL-CONS": índiceCanónico 0..3 }, timings? }`.
- Autentica JWT, lee Bloque 1, **puntúa con la clave privada**, calcula afinidad + validez, invoca DeepSeek (solo interpreta; enmarca ejes bajos como "estilos a explorar", nunca debilidades), fallback por reglas.
- **Salida** `test_results.clasificacion`:
```
{ ejes:{8 ejes 0-100}, fortalezas:[eje,eje], desarrollo:eje, validez, arquetipo,
  modelo_eval:"eleccion_forzada",
  cintillo, descripcion_breve, tags[], resumen, recomendacion,
  feedback_estudiante:{fortalezas,areas_mejora,recomendaciones,mensaje_completo} }
```
- Scorer con **11/11 tests** (afinidad, exposiciones=8, precedencia de validez, idempotencia, rangos).
- NO toca `clasificar-test` (v1 sigue sirviendo a producción hasta el cutover).

## Vista de resultado — Opción C (top-3 + barras)

El radar de 8 ejes se veía amontonado en móvil; se reemplazó por la **Opción C**: las **3 fortalezas dominantes como tarjetas** (#1/#2/#3 con puntaje) + **el resto como barras compactas**, ordenadas de mayor a menor. Escala **normalizada al máximo del candidato** (su eje más alto llena la barra) para dar contraste. Helper `strengthsC(ejes)` (inline, sin librerías) compartido por ambas vistas.

- **Estudiante:** top-3 tarjetas + barras + cintillo + descripcion_breve + feedback del mentor + fortalezas / estilo a explorar. (No ve validez.)
- **Reclutador:** mismo bloque C + resumen + roles + **badge de validez**. No ve `feedback_estudiante`. Nota visible: los puntajes son afinidad relativa, no "qué tan bueno".
- `radarSVG` queda definido pero sin uso (disponible por si se quiere reintroducir como detalle).

## Pendiente (requiere aprobación para tocar producción)

1. Integrar el módulo v4 (18 tap elección forzada, barajado, envía índices canónicos) en `dashboard.html` + `dashboard-preview.html`; invoca `evaluar-competencias`.
2. Migrar el radar + afinidad + validez al modal del reclutador (`zentu-company-dashboard.html`).
3. Regenerar el flat `student_dashboard.html`.
4. Prueba e2e viva (login de estudiante → DeepSeek).
5. Cutover a `www.zentu.app` (fast-forward de `main`).

## Decisiones de Claude (revisar)

1. Puntaje = afinidad relativa (no rescalado a 100 el top); el usuario aprobó el prototipo así.
2. Se eliminó `indice_global` (no aplica a ipsativo).
3. 16 ítems con cobertura perfecta (8/eje) construida por diseño; contenido en el prototipo v4.
4. Consistencia por par parafraseado (I13); atención por opción fija sin barajar.
