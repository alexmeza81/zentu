# Evaluación de Talento v3 — Diseño (definitivo)

**Fecha:** 2026-08-05 (revisado madrugada 2026-08-06)
**Estado:** Aprobado en dirección; en implementación autónoma en rama segura
**Reemplaza a:** `2026-08-05-evaluacion-talento-v2-design.md` (v2 tenía 2 preguntas abiertas; se eliminaron por decisión del usuario)

## Cambios vs v2

| v2 | v3 |
|---|---|
| Híbrido 8 tap + 2 abiertas | **Solo tap**, 18 preguntas |
| 5 competencias | **8 ejes** |
| Clave de puntuación en el cliente | **Clave solo en el servidor** (Edge Function) |
| DeepSeek ajustaba puntajes ±20 | **DeepSeek NO toca puntajes**; solo interpreta |
| Evidencia textual (de abiertas) | Sin abiertas → sin evidencia textual; en su lugar **radar + texto breve** |
| Resultado: barras | **Gráfica de telaraña (radar) SVG** + texto breve, en estudiante y reclutador |

## Objetivo

Test de talento **no adivinable**, **confiable** y **poco tedioso** (~8 min, móvil) que clasifique el perfil del candidato en 8 ejes y lo presente de forma moderna (radar + narrativa IA). La IA (DeepSeek) **interpreta** puntajes deterministas; no los calcula.

## Los 8 ejes

Escala 0-100 cada uno. `key` / nombre / definición (se muestran al usuario y se pasan a DeepSeek):

| key | Eje | Definición |
|---|---|---|
| `pensamiento_critico` | Pensamiento crítico | Analizar la información con lógica para resolver problemas complejos de forma eficiente. |
| `comunicacion_asertiva` | Comunicación asertiva | Expresar ideas con claridad y practicar la escucha activa para un buen clima laboral. |
| `trabajo_equipo` | Trabajo en equipo | Colaborar de forma positiva para alcanzar metas comunes y compartir información. |
| `resiliencia` | Resiliencia | Superar la frustración y recuperarse rápido ante problemas o crisis. |
| `adaptabilidad` | Adaptabilidad y aprendizaje | Ajustarse con rapidez a cambios, métodos y herramientas nuevas, y aprender lo nuevo. |
| `autogestion` | Autogestión y organización | Planear, priorizar y cumplir con poca o ninguna supervisión. |
| `liderazgo` | Liderazgo e iniciativa | Tomar la delantera, proponer mejoras y movilizar a otros. |
| `competencia_digital` | Competencia digital y datos | Soltura con herramientas digitales y lectura básica de datos. |

> **Decisión tomada por Claude (revisar):** los 3 ejes nuevos (autogestión, liderazgo, competencia digital) se tomaron del .md `prompt_claude_code.md`. Si prefieres otros, se cambian sin afectar la arquitectura.

## Prácticas del `.md` que se aplican

1. **La clave de puntuación nunca se manda al cliente.** El navegador solo recibe *escenario + textos de opción*. Los puntos por opción viven en la Edge Function. El cliente envía el **índice canónico** de la opción elegida; el servidor puntúa.
2. **Opciones con clave graduada** (0-100), no correcta/incorrecta binaria.
3. **Ítems de control → bandera de validez** (atención + consistencia). Deseabilidad social y tiempo de respuesta como señales calculadas.
4. **Barajar el orden de opciones** por sesión (cada opción conserva su índice canónico para puntuar bien).
5. **Guardar la respuesta cruda siempre**; los puntajes son derivados y recalculables.
6. **Versionado del instrumento**: cada sesión guarda `instrumento_version`; el contenido activo no se edita, se clona a una versión nueva.
7. **Tiempo de respuesta** como señal (no invalida automáticamente).
8. **Percentiles: diferidos.** Pre-lanzamiento con ~0 cohorte → se guardan puntajes crudos ahora; percentiles cuando haya ≥30 evaluaciones.
9. **Cautela de sesgo**: el instrumento no está validado; orienta, no excluye. Documentado.

## Estructura de las 18 preguntas

- **16 puntuables (SJT):** 2 por eje. `base[eje] = promedio de los puntos de sus 2 ítems` (0-100).
- **2 de control** (no puntúan eje): 1 de atención + 1 de consistencia (parafrasea un ítem puntuable).
- El candidato ve 18 tarjetas tap, una a la vez, con barra de progreso. Opciones barajadas.

### Clave del instrumento (versión 1) — `[opciónTexto → puntos]`

Formato: cada ítem lista sus opciones en **orden canónico** (índice 0..3) con sus puntos. En pantalla se barajan.

**PC1 · pensamiento_critico** — "Te entregan un reporte lleno de datos y una fecha límite ajustada. ¿Qué haces primero?"
0. Identifico las 2-3 preguntas clave que el reporte debe responder y busco esos datos → **100**
1. Leo todo el reporte de inicio a fin para no perderme nada → **60**
2. Le pregunto a alguien qué es lo más importante → **40**
3. Empiezo por las secciones que me resultan más fáciles → **20**

**PC2 · pensamiento_critico** — "Debes elegir entre dos opciones y los datos están incompletos. ¿Qué haces?"
0. Analizo pros y contras con lo que tengo y decido, dejando claro el supuesto → **100**
1. Busco más datos antes de decidir, aunque tome tiempo → **65**
2. Elijo la opción que se siente más segura → **40**
3. Dejo que alguien más decida → **20**

**CA1 · comunicacion_asertiva** — "En una reunión no estás de acuerdo con una idea del grupo. ¿Qué haces?"
0. Expongo mi punto con respeto y argumentos, y escucho su reacción → **100**
1. Lo comento después, en privado, con quien propuso → **60**
2. Me guardo la opinión para no generar conflicto → **35**
3. Lo digo de forma directa y tajante → **30**

**CA2 · comunicacion_asertiva** — "Tienes que explicar algo técnico a alguien sin experiencia. ¿Cómo lo haces?"
0. Uso analogías simples y evito tecnicismos → **100**
1. Le doy todos los detalles para que no falte nada → **55**
2. Le paso documentación para que lo lea → **40**
3. Asumo que entenderá sobre la marcha → **25**

**TE1 · trabajo_equipo** — "Un compañero no está entregando su parte y afecta al equipo. ¿Qué haces?"
0. Hablo con él para entender qué pasa y le ofrezco ayuda → **100**
1. Cubro su parte para que el equipo no se atrase → **65**
2. Lo comento con el líder para que intervenga → **45**
3. Sigo con lo mío; cada quien es responsable de lo suyo → **20**

**TE2 · trabajo_equipo** — "El equipo toma una decisión distinta a la tuya. ¿Qué haces?"
0. La apoyo y aporto para que funcione → **100**
1. La sigo aunque no esté del todo convencido → **65**
2. Hago mi parte sin involucrarme → **40**
3. Insisto en que la mía era mejor → **30**

**RE1 · resiliencia** — "Recibes una crítica dura a un trabajo en el que te esforzaste. ¿Cómo lo tomas?"
0. La uso como aprendizaje concreto y mejoro la siguiente versión → **100**
1. Me afecta al inicio, pero lo supero y sigo → **70**
2. Me desanima un buen rato antes de retomar → **40**
3. Siento que no soy bueno para esto → **15**

**RE2 · resiliencia** — "Un plan en el que trabajaste falla a la mitad del camino. ¿Qué haces?"
0. Reviso qué falló, ajusto el enfoque y sigo → **100**
1. Reinicio desde cero con más cuidado → **55**
2. Sigo con el plan por si mejora más adelante → **35**
3. Lo dejo y busco otra tarea → **15**

**AD1 · adaptabilidad** — "A media semana cambian por completo las prioridades de tu proyecto. ¿Cómo reaccionas?"
0. Me reorganizo rápido, ajusto mi plan y sigo → **100**
1. Lo acepto, aunque me toma un rato reenfocarme → **65**
2. Termino primero lo que ya había empezado y luego cambio → **40**
3. Me frustra y me cuesta arrancar de nuevo → **20**

**AD2 · adaptabilidad** — "Te asignan una herramienta nueva que no conoces y hay que usarla ya. ¿Qué haces?"
0. La aprendo por mi cuenta rápido (tutoriales, prueba y error) → **100**
1. Pido una capacitación breve antes de usarla → **65**
2. La uso lo mínimo y me apoyo en lo que ya sé → **40**
3. Prefiero seguir con la herramienta anterior → **20**

**AU1 · autogestion** — "Tienes 3 entregas el mismo día. ¿Cómo te organizas?"
0. Priorizo por urgencia e impacto y bloqueo tiempos → **100**
1. Empiezo por la más rápida para ir avanzando → **60**
2. Trabajo en las 3 al mismo tiempo → **40**
3. Empiezo por la que más me gusta → **30**

**AU2 · autogestion** — "Trabajas sin supervisión y nadie revisa tu avance. ¿Qué haces?"
0. Me fijo metas y llevo mi propio seguimiento → **100**
1. Avanzo constante aunque sin registro formal → **65**
2. Trabajo cuando me siento inspirado → **35**
3. Me relajo si nadie está pendiente → **20**

**LI1 · liderazgo** — "En un proyecto en equipo sin líder asignado, ¿qué haces?"
0. Propongo un plan y coordino a todos → **100**
1. Sugiero ideas pero espero que otro coordine → **55**
2. Hago mi parte lo mejor posible → **50**
3. Espero instrucciones → **25**

**LI2 · liderazgo** — "Notas algo que se podría mejorar, aunque nadie te lo pidió. ¿Qué haces?"
0. Propongo la mejora y me ofrezco a implementarla → **100**
1. Lo comento por si a alguien le interesa → **60**
2. Lo anoto pero no digo nada → **40**
3. Pienso que no es mi responsabilidad → **25**

**CD1 · competencia_digital** — "Necesitas presentar los resultados de un mes de trabajo. ¿Cómo lo haces?"
0. Armo un tablero o gráfica simple que cuente la historia con datos → **100**
1. Hago una lista ordenada de lo que hice → **55**
2. Escribo un texto largo explicando todo → **45**
3. Lo cuento de memoria en la reunión → **25**

**CD2 · competencia_digital** — "Tienes que aprender una app o herramienta digital nueva para la tarea. ¿Qué haces?"
0. Exploro, veo un tutorial corto y pruebo sus funciones → **100**
1. Pido que alguien me la enseñe paso a paso → **60**
2. Uso solo lo básico que ya entiendo → **40**
3. La evito si puedo → **20**

**CTRL-ATT · atención (no puntúa)** — "Para confirmar que estás leyendo con atención, elige la **tercera** opción."
0. Primera opción
1. Segunda opción
2. Tercera opción → **esperada (index 2)**
3. Cuarta opción
→ Si la elegida ≠ index 2 → señal `atencion_fallida`.

**CTRL-CONS · consistencia (no puntúa)** — parafrasea RE2 — "Cuando algo que planeaste sale mal a mitad de camino, lo más común en ti es…"
0. Revisar qué falló y ajustar para seguir → equivalente a RE2/0 (**100**)
1. Volver a empezar desde cero → equivalente a RE2/1 (**55**)
2. Seguir igual esperando que mejore → equivalente a RE2/2 (**35**)
3. Abandonarlo → equivalente a RE2/3 (**15**)
→ Si `|puntoEquivalente(CTRL-CONS) − punto(RE2)| > 40` → señal `inconsistente`.

## Cálculo (determinista, en la Edge Function)

1. **Punto de ítem** = puntos de la opción elegida según la clave (índice canónico).
2. **base[eje]** = promedio de los puntos de sus 2 ítems (0-100, entero).
3. **índice global** = promedio de los 8 ejes (pesos iguales).
4. **Fortalezas** = 2 ejes con mayor base; **Área de desarrollo** = eje con menor base.
5. **Señales de validez** (precedencia): `atencion_fallida` > `deseabilidad_alta` > `inconsistente` > `apresurado` > `valido`.
   - `deseabilidad_alta`: ≥ 90% de los 16 ítems puntuables en la opción de 100 puntos.
   - `apresurado`: mediana de tiempo por ítem < 1500 ms (si hay timings).
6. **Percentiles:** diferidos (no se calculan en v3).

## Clasificación con DeepSeek (solo interpreta)

DeepSeek **no calcula ni modifica** los puntajes. Recibe: contexto Bloque 1 (carrera, semestre, inglés, disponibilidad) + los 8 `base[eje]` + fortalezas/desarrollo + bandera de validez, y devuelve narrativa.

### Entrada del cliente a la Edge Function `evaluar-competencias`
```json
{
  "respuestas": { "PC1": 0, "PC2": 2, "CA1": 0, ..., "CTRL-ATT": 2, "CTRL-CONS": 0 },
  "timings":    { "PC1": 4200, ... }        // opcional (ms por ítem)
}
```
Valores = **índice canónico** de la opción elegida (0..3). El servidor tiene la clave privada.

### Salida (guardada en `test_results.clasificacion`, jsonb)
```json
{
  "ejes": {
    "pensamiento_critico": 0-100, "comunicacion_asertiva": 0-100,
    "trabajo_equipo": 0-100, "resiliencia": 0-100, "adaptabilidad": 0-100,
    "autogestion": 0-100, "liderazgo": 0-100, "competencia_digital": 0-100
  },
  "indice_global": 0-100,
  "fortalezas": ["eje", "eje"],
  "desarrollo": "eje",
  "validez": "valido | atencion_fallida | deseabilidad_alta | inconsistente | apresurado",
  "arquetipo": "eje dominante en etiqueta legible",
  "cintillo": "≤50 chars",
  "descripcion_breve": "≤220 chars, el 'texto breve' del perfil (para estudiante y reclutador)",
  "tags": ["5-8 keywords"],
  "resumen": "≤150 chars, para reclutador",
  "recomendacion": "roles sugeridos ≤200 chars",
  "feedback_estudiante": {
    "fortalezas": "30-50 palabras",
    "areas_mejora": "30-50 palabras",
    "recomendaciones": "40-60 palabras",
    "mensaje_completo": "150-200 palabras, tono mentor"
  }
}
```

### Fallback determinista (DeepSeek no disponible)
- `ejes`, `indice_global`, `fortalezas`, `desarrollo`, `validez`, `arquetipo` = calculados (siempre disponibles).
- `cintillo`/`descripcion_breve`/`tags`/`resumen`/`recomendacion`/`feedback_estudiante` = plantillas parametrizadas por eje dominante + área de desarrollo.

## Datos / esquema

Reutiliza `test_results` (columnas existentes): `respuestas` (jsonb), `clasificacion` (jsonb), `arquetipo` (text), `modelo` (text). Añadir por migración **aditiva** (no destructiva): `instrumento_version` (text, default 'v1'). Sin borrar nada.

- `respuestas` = `{ instrumento_version, answers:{...}, timings:{...} }` (respuesta cruda).
- `clasificacion` = objeto de salida de arriba.
- `modelo` = `"deepseek-chat"` | `"fallback"`.

## Arquitectura de la Edge Function

**Nueva función `evaluar-competencias`** (NO se toca `clasificar-test`, que sigue sirviendo al frontend v1 en producción hasta el corte).

1. Autentica por JWT; lee Bloque 1 del estudiante.
2. Valida completitud (18 respuestas, índices 0..3).
3. Puntúa con la **clave privada** (constante en la función) → 8 ejes + global + validez.
4. Construye prompt e invoca DeepSeek (temperature 0.4, json_object). Si falla → fallback.
5. Guarda en `test_results` y responde `{ modelo, clasificacion }`.

La clave (`SCORING_KEY`), el mapa eje→ítems, ítems de control y definiciones viven **solo aquí**.

## Vista de resultado — gráfica de telaraña (radar)

**Radar SVG** dibujado a mano (sin librerías externas; self-contained), 8 ejes, con:
- Polígono de rejilla (25/50/75/100), etiquetas de eje, polígono de datos relleno con el degradado morado→azul de ZentU.
- Responsivo, tema claro/oscuro no requerido (el dashboard es claro).

**Estudiante:** radar + `cintillo` + `descripcion_breve` + mensaje del mentor + fortalezas/área. (No ve la bandera de validez.)

**Reclutador (modal "Perfil de talento"):** **el mismo radar** + los 8 puntajes + `resumen` + roles + **badge de validez** (si ≠ `valido`, se muestra discreto: "revisar"). No ve `feedback_estudiante`.

## Compatibilidad hacia atrás

Ambos dashboards detectan el formato de `clasificacion`:
- `ejes` presente → v3 (radar 8 ejes).
- `competencias` → v2 (5 competencias) — no llegó a producción, improbable.
- `dimensiones` → v1 (5 dimensiones, barras).
- sin test → habilidades declaradas.

## Manejo de errores

| Caso | Comportamiento |
|---|---|
| DeepSeek timeout/error/sin key | Fallback determinista + feedback por plantilla. Siempre hay resultado. |
| Falta alguna respuesta / índice inválido | Edge Function 400; el cliente no deja enviar incompleto. |
| Validez ≠ válido | Se guarda la bandera; el reclutador ve un aviso discreto; NO se descarta al candidato. |
| Registro v1/v2 previo | Se renderiza con su formato viejo. |

## Fuera de alcance (v3)

- Percentiles y cohortes (diferido a cuando haya ≥30 evaluaciones).
- Detección de respuestas generadas por IA con modelo dedicado.
- Instrumento en tabla de BD con panel de admin (por ahora la clave vive en la Edge Function; versionado por string).
- Proctoring / verificación de identidad.
- Corte a producción (cutover del frontend a la nueva función + deploy) — requiere aprobación del usuario.

## Verificación

- `node --check` sobre el JS de cada HTML tocado; `deno`/build check de la Edge Function vía deploy.
- Edge Function en vivo: entrada de ejemplo → salida con esquema correcto (DeepSeek y fallback); caso de atención fallida e inconsistencia.
- Playwright sobre el preview del estudiante: 18 tap → radar + narrativa.
- Harness del reclutador: `renderDetail` con `ejes` mock → modal con radar + validez; confirmar que NO referencia `feedback_estudiante`.

## Log de decisiones tomadas por Claude (para revisión del usuario)

1. Los 3 ejes nuevos (autogestión, liderazgo, competencia digital) — elegidos del .md.
2. 16 puntuables (2/eje) + 2 de control = 18. Deseabilidad social y tiempo como señales calculadas, no como ítems.
3. Clave de puntuación en la Edge Function (no en tabla de BD) — más ligero, mantiene el patrón de ZentU; versionado por string.
4. DeepSeek no modifica puntajes (solo narra) — más defendible que el ±20 de v2.
5. Radar en SVG propio (sin librería).
6. Nueva función `evaluar-competencias` en vez de sobrescribir `clasificar-test`.
7. Migración aditiva `instrumento_version`; sin tocar columnas existentes.
