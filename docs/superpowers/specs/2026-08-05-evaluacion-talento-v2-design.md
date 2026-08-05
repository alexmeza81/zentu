# Evaluación de Talento v2 — Diseño

**Fecha:** 2026-08-05
**Estado:** Aprobado en diseño, pendiente de plan de implementación
**Autor:** Alex Meza + Claude

## Objetivo

Rediseñar el test de talento de ZentU para que:
1. **No sea adivinable / gameable** — que no exista una "respuesta correcta" obvia que cualquiera pueda elegir para inflar su perfil.
2. **Refleje al individuo real** — que el resultado esté anclado a cómo piensa y qué ha vivido ESE candidato, no un perfil genérico que dos personas distintas sacarían igual.
3. **Clasifique skills y potencial** de forma moderna y fácil, aprovechando la integración con DeepSeek.

Restricción de UX: el test debe ser **corto y poco tedioso** (~6-7 min, móvil, público universitario LATAM) para no disparar el abandono.

## Problema con el test actual (v1)

- 8 preguntas: 4 autoevaluaciones técnicas 1-5, 3 escenarios A-D con respuesta obvia, 1 de aprendizaje.
- Las autoevaluaciones 1-5 y los escenarios con opción claramente "buena" son **fácilmente gameables**.
- El resultado no está anclado a evidencia auténtica del candidato → **no discrimina** entre personas.
- Clasifica en 5 dimensiones (analítica, creativa, liderazgo, ejecutora, técnica) que se reemplazan en v2.

## Decisiones de diseño (acordadas)

| Decisión | Valor |
|---|---|
| Formato | Híbrido: **8 preguntas "tap" (opción)** + **2 retos abiertos** |
| Duración | ~6-7 min |
| Competencias | 5 (ver abajo), reemplazan las dimensiones v1 |
| Comparabilidad | Puntajes 0-100 calibrados y comparables entre candidatos |
| Evidencia | DeepSeek cita 1-2 frases textuales del candidato por competencia (para el reclutador) |
| Motor | Pesos deterministas en las tap + DeepSeek para calibración/evidencia/feedback |
| Fallback | Si DeepSeek falla → puntaje base determinista + feedback por plantilla |

## Las 5 competencias

Escala 0-100 cada una. Definiciones (se muestran al usuario y se pasan a DeepSeek):

| key | Competencia | Definición |
|---|---|---|
| `adaptabilidad` | Adaptabilidad | Ajustarse con rapidez a nuevos métodos, herramientas o cambios en el entorno de trabajo. |
| `comunicacion_asertiva` | Comunicación asertiva | Expresar ideas con claridad y practicar la escucha activa para mantener un buen clima laboral. |
| `trabajo_equipo` | Trabajo en equipo | Colaborar de manera positiva con otros para alcanzar metas comunes y compartir información. |
| `resiliencia` | Resiliencia | Superar la frustración y recuperarse rápido ante los problemas o momentos de crisis. |
| `pensamiento_critico` | Pensamiento crítico | Analizar la información de forma lógica para resolver problemas complejos de manera eficiente. |

Las hard skills quedan como **dato declarado aparte** (perfil del estudiante), no las mide el test.

## Arquitectura del flujo

```
Bloque 1 (ya en DB): carrera, semestre, inglés, disponibilidad  ── contexto ──┐
                                                                              │
Estudiante responde:                                                          ▼
  Parte A: 8 tap (opción)  ──► pesos deterministas ──► base[competencia] 0-100 ──► Edge Function
  Parte B: 2 abiertas (texto)  ─────────────────────────────────────────────────►  clasificar-test (v3)
                                                                                        │
                                                                    ┌───────────────────┴───────────┐
                                                                    ▼                                ▼
                                                          DeepSeek disponible              DeepSeek falla/timeout
                                                          - puntajes finales calibrados     - usa base determinista
                                                          - evidencia textual               - feedback por plantilla
                                                          - feedback mentor                  (nunca bloquea)
                                                                    │
                                                                    ▼
                                                    test_results.clasificacion (jsonb)
```

## Parte A — Las 8 preguntas "tap"

Cada ítem: un mini-escenario realista + 3-4 opciones **todas plausibles** (mide criterio, no la "correcta"). Cada opción tiene un **peso 0-100** en la competencia que ancla el ítem. Avance tipo tarjeta (una a la vez, con barra de progreso).

**Cobertura:** Pensamiento crítico ×2, Adaptabilidad ×2, Resiliencia ×2, Trabajo en equipo ×1, Comunicación asertiva ×1. Las 2 abiertas refuerzan las competencias con una sola tap.

**Scoring determinista:** `base[competencia] = promedio de los pesos de las opciones elegidas en los ítems anclados a esa competencia`.

### Ítems (contenido definitivo)

**Q1 — Pensamiento crítico** · "Te entregan un reporte lleno de datos y una fecha límite ajustada. ¿Qué haces primero?"
- A) Identifico las 2-3 preguntas clave que el reporte debe responder y busco esos datos. → 100
- B) Leo todo el reporte de inicio a fin para no perderme nada. → 60
- C) Le pregunto a alguien qué es lo más importante. → 40
- D) Empiezo por las secciones que me resultan más fáciles. → 20

**Q2 — Adaptabilidad** · "A media semana cambian por completo las prioridades de tu proyecto. ¿Cómo reaccionas?"
- A) Me reorganizo rápido, ajusto mi plan y sigo. → 100
- B) Lo acepto, aunque me toma un rato reenfocarme. → 65
- C) Termino primero lo que ya había empezado y luego cambio. → 40
- D) Me frustra y me cuesta arrancar de nuevo. → 20

**Q3 — Trabajo en equipo** · "Un compañero no está entregando su parte y afecta al equipo. ¿Qué haces?"
- A) Hablo con él para entender qué pasa y le ofrezco ayuda. → 100
- B) Cubro su parte para que el equipo no se atrase. → 65
- C) Lo comento con el líder para que intervenga. → 45
- D) Sigo con lo mío; cada quien es responsable de lo suyo. → 20

**Q4 — Resiliencia** · "Recibes una crítica dura a un trabajo en el que te esforzaste. ¿Cómo lo tomas?"
- A) La uso como aprendizaje concreto y mejoro la siguiente versión. → 100
- B) Me afecta al inicio, pero lo supero y sigo. → 70
- C) Me desanima un buen rato antes de retomar. → 40
- D) Siento que no soy bueno para esto. → 15

**Q5 — Comunicación asertiva** · "En una reunión no estás de acuerdo con una idea del grupo. ¿Qué haces?"
- A) Expongo mi punto con respeto y argumentos, y escucho su reacción. → 100
- B) Lo comento después, en privado, con quien propuso. → 60
- C) Me guardo la opinión para no generar conflicto. → 35
- D) Lo digo de forma directa y tajante. → 30

**Q6 — Pensamiento crítico** · "Debes elegir entre dos opciones y los datos están incompletos. ¿Qué haces?"
- A) Analizo pros y contras con lo que tengo y decido, dejando claro el supuesto. → 100
- B) Busco más datos antes de decidir, aunque tome tiempo. → 65
- C) Elijo la opción que se siente más segura. → 40
- D) Dejo que alguien más decida. → 20

**Q7 — Adaptabilidad** · "Te asignan una herramienta nueva que no conoces y hay que usarla ya. ¿Qué haces?"
- A) La aprendo por mi cuenta rápido (tutoriales, prueba y error). → 100
- B) Pido una capacitación breve antes de usarla. → 65
- C) La uso lo mínimo y me apoyo en lo que ya sé. → 40
- D) Prefiero seguir con la herramienta anterior. → 20

**Q8 — Resiliencia** · "Un plan en el que trabajaste falla a la mitad del camino. ¿Qué haces?"
- A) Reviso qué falló, ajusto el enfoque y sigo. → 100
- B) Reinicio desde cero con más cuidado. → 55
- C) Sigo con el plan por si mejora más adelante. → 35
- D) Lo dejo y busco otra tarea. → 15

## Parte B — Los 2 retos abiertos

Texto libre, 3-5 líneas cada uno. Aquí DeepSeek extrae **evidencia**, verifica **autenticidad** y ajusta los puntajes. Placeholder y contador de caracteres visibles; mínimo sugerido ~120 caracteres (no bloqueante).

**Open 1 — ancla Trabajo en equipo + Comunicación asertiva:**
> "Cuéntanos de una vez real en la que tuviste que trabajar con alguien difícil o resolver un desacuerdo en equipo. ¿Qué hiciste y cómo terminó?"

**Open 2 — ancla Resiliencia + Pensamiento crítico + Adaptabilidad:**
> "Piensa en un problema o reto reciente que te costó resolver. ¿Cómo lo abordaste paso a paso y qué aprendiste?"

## Clasificación con DeepSeek

### Entrada del cliente a la Edge Function
```json
{
  "taps":  { "q1": "A", "q2": "B", "q3": "A", "q4": "A", "q5": "C", "q6": "A", "q7": "B", "q8": "A" },
  "open":  { "open1": "texto...", "open2": "texto..." }
}
```

La Edge Function:
1. Valida que existan las 8 tap (con opción válida) y las 2 abiertas.
2. Lee Bloque 1 del estudiante (carrera, semestre, inglés, disponibilidad) vía JWT autenticado.
3. Calcula `base[competencia]` determinista con los pesos.
4. Construye el prompt (contexto + textos de ítems y opciones elegidas + textos abiertos + rúbrica + definiciones) y llama a DeepSeek (`deepseek-chat`, `response_format json_object`, `temperature 0.4`).
5. Valida el JSON de salida; si falla o hay timeout → **fallback determinista**.
6. Guarda en `test_results`.

### Rúbrica de calibración (en el prompt)
Bandas por competencia para consistencia entre candidatos:
- 0-30 bajo · 31-60 medio · 61-85 alto · 86-100 sobresaliente.

Instrucciones clave a DeepSeek:
- Parte de `base[competencia]` como ancla; ajusta con las respuestas abiertas. No te alejes más de ±20 del base salvo que las abiertas den evidencia fuerte en contra (y entonces explica en el feedback).
- `evidencia`: cita **textual y verbatim** una frase del candidato (de sus respuestas abiertas) que justifique cada competencia. Si no hay evidencia suficiente en las abiertas, deja la cadena vacía (no inventes).
- Feedback en tono de mentor/coach, cálido y concreto, menciona respuestas específicas.

### Salida (guardada en `test_results.clasificacion`, jsonb)
```json
{
  "competencias": {
    "adaptabilidad": 0-100,
    "comunicacion_asertiva": 0-100,
    "trabajo_equipo": 0-100,
    "resiliencia": 0-100,
    "pensamiento_critico": 0-100
  },
  "evidencia": {
    "adaptabilidad": "frase textual del candidato o \"\"",
    "comunicacion_asertiva": "...",
    "trabajo_equipo": "...",
    "resiliencia": "...",
    "pensamiento_critico": "..."
  },
  "arquetipo": "competencia dominante en etiqueta legible (ej. 'Pensamiento crítico')",
  "cintillo": "≤50 chars",
  "tags": ["5-8 keywords"],
  "resumen": "≤150 chars, para reclutador",
  "recomendacion": "roles sugeridos, ≤200 chars",
  "feedback_estudiante": {
    "fortalezas": "30-50 palabras",
    "areas_mejora": "30-50 palabras",
    "recomendaciones": "40-60 palabras",
    "mensaje_completo": "150-200 palabras, tono mentor"
  }
}
```

### Fallback determinista (DeepSeek no disponible)
- `competencias` = `base` (redondeado).
- `evidencia` = todas vacías.
- `arquetipo` = competencia con mayor base.
- `cintillo`/`tags`/`resumen`/`recomendacion`/`feedback_estudiante` = plantillas parametrizadas por la competencia dominante y las 2 más bajas (mismo patrón que el fallback v1).

## Datos / esquema

Reutiliza columnas existentes de `test_results` (creadas en la migración `test_classification_columns`): `respuestas` (jsonb), `clasificacion` (jsonb), `arquetipo` (text), `modelo` (text).

- `respuestas` = `{ taps: {...}, open: {...} }`.
- `clasificacion` = objeto de salida de arriba.
- `arquetipo` = competencia dominante.
- `modelo` = `"deepseek-chat"` o `"fallback"`.

**No se requieren nuevas columnas ni migración de esquema.** Los registros v1 previos conservan su `clasificacion` con `dimensiones` (formato viejo).

## Vista estudiante

Archivos: `ZENTU FINALS /app/student/dashboard.html` (real) + `dashboard-preview.html` (mock) + regenerar `zentu-deploy/student_dashboard.html` (transform de rutas).

- **Parte A:** tarjetas tap (reutiliza estilos `.test-opt`, `.scale-*` no aplican; se usa opción). Barra de progreso 1/10…8/10.
- **Parte B:** 2 `textarea` con placeholder + contador (pasos 9 y 10).
- **Envío:** `sb.functions.invoke('clasificar-test', { body: { taps, open } })`.
- **Resultado:** hero + cintillo + mensaje del mentor + tarjetas de feedback + **barras de las 5 competencias** + roles. La `evidencia` **NO** se muestra al estudiante (es para el reclutador).
- Campo "Nivel de inglés" ya existe (v1).

## Vista reclutador

Archivo: `zentu-deploy/zentu-company-dashboard.html`, función `renderDetail`.

- Reemplazar `DIMS` (5 dimensiones viejas) por `COMPS` (5 competencias).
- Bloque "Perfil de talento · Test IA": arquetipo (badge) + cintillo + resumen + **5 competencias con barra 0-100** + **la frase de evidencia bajo cada competencia** (si existe) + tags + roles.
- No se muestra `feedback_estudiante` (privado del estudiante).

## Compatibilidad hacia atrás

- Ambos dashboards detectan el formato: si `clasificacion.competencias` existe → v2; si `clasificacion.dimensiones` existe → v1 (render viejo); si no hay test → fallback a habilidades declaradas.
- Registros v1 siguen renderizando sin romperse.

## Manejo de errores

| Caso | Comportamiento |
|---|---|
| DeepSeek timeout / error / sin key | Fallback determinista + feedback por plantilla. El estudiante siempre ve resultado. |
| Respuestas abiertas muy cortas/genéricas | `evidencia` vacía; puntajes se apoyan en el base determinista (no se infla). |
| Falta alguna tap o abierta | La Edge Function responde 400; el cliente no permite enviar hasta completar. |
| Registro v1 previo | Se renderiza con el formato viejo (`dimensiones`). |

## Fuera de alcance (v2)

- Detección explícita de respuestas generadas por IA (marca/flag dedicada).
- Nivel de confianza por competencia como campo separado.
- Proctoring / verificación de identidad.
- Test adaptativo (ramificación según respuestas).
- Adjuntar evidencia externa (proyectos, portafolio) al test.

## Verificación

- `node --check` sobre el JS extraído de cada HTML tocado.
- Prueba de la Edge Function en vivo: entrada de ejemplo → salida con esquema correcto (DeepSeek y fallback).
- Playwright sobre el preview del estudiante: completar 8 tap + 2 abiertas → render de la vista de resultado.
- Harness del reclutador: `renderDetail` con `competencias` mock → modal con barras + evidencia; confirmar que NO referencia `feedback_estudiante`.
