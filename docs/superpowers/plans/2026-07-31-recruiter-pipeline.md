# Recruiter Workspace (Pipeline + Mensajes) — Plan de Implementación

> **For agentic workers:** Este plan se ejecuta tarea por tarea. Pasos con checkbox (`- [ ]`).

**Goal:** Convertir el dashboard del reclutador en un workspace de 3 secciones (Candidatos · Pipeline · Mensajes), con un pipeline kanban de etapas personalizables donde caen los candidatos al darles "like", y una bandeja de mensajes dedicada.

**Architecture:** Archivo único `zentu-company-dashboard.html` (Tailwind CDN + supabase-js). Shell de navegación que muestra/oculta 3 contenedores de sección. 2 tablas nuevas (`pipeline_stages`, `pipeline_candidates`) con RLS por empresa + función `ensure_pipeline_stages()` (SECURITY DEFINER). Se reutiliza `companies` (vía `ensure_my_company()`) y `messages`.

**Tech Stack:** HTML/CSS/JS vanilla, Tailwind CDN, supabase-js v2, Supabase Postgres + RLS. Drag & drop con API nativa HTML5 (sin librerías).

## Global Constraints

- Un solo archivo frontend: `zentu-company-dashboard.html` (rutas planas: `acceso.html`, `favicon.svg`).
- Sin librerías externas nuevas (CSP/sin bundler): DnD nativo HTML5.
- Toda escritura a Supabase es **optimista con reversión** en error (patrón ya usado en mensajería) + `escapeHTML` en todo dato de usuario.
- RLS: las policies de `pipeline_*` referencian **solo** `companies` (nunca `messages`) para evitar recursión.
- El "like" es **shortlist privado**: no se notifica al estudiante; la app del estudiante no cambia.
- Verificación (no hay framework de tests): `node --check` del JS extraído + arnés mock con Playwright + checks de RLS por SQL impersonando al reclutador + `get_advisors(security)`.
- Idioma de UI: español. Estética: coherente con el dashboard actual (Tailwind, clase `grad` morado→azul, `escapeHTML`).
- Repo de trabajo: `Desktop/ZENTU-APP/zentu-deploy`, rama `feature/recruiter-pipeline`. Deploy: `vercel --prod --yes` (directo, sin transformar rutas).

---

## File Structure

- `zentu-company-dashboard.html` — TODO el frontend (modificado en cada tarea).
- `docs/supabase-migrations/2026-07-31-pipeline.sql` — copia de referencia de las migraciones (aplicadas vía MCP `apply_migration`).
- `.superpowers/sdd/progress.md` — ledger de progreso.

Backend (aplicado vía MCP, no archivos ejecutables):
- Tabla `public.pipeline_stages`, tabla `public.pipeline_candidates`, función `public.ensure_pipeline_stages(uuid)`.

---

## Fase A — Shell de navegación

### Task A1: Navegación de 3 secciones

**Files:**
- Modify: `zentu-company-dashboard.html`

**Interfaces:**
- Produces: `showTab(id)` (id ∈ `'candidatos'|'pipeline'|'mensajes'`); contenedores `#sec-candidatos`, `#sec-pipeline`, `#sec-mensajes`; el pool actual queda dentro de `#sec-candidatos`.

- [ ] **Step 1:** En el `<nav>` superior, agregar 3 pestañas (Candidatos, Pipeline, Mensajes) con `onclick="showTab('...')"`. La de Mensajes incluye `<span id="tabUnread">` (badge, oculto por defecto).
- [ ] **Step 2:** Envolver el contenido actual del pool (header "Candidatos disponibles" + filtros + `#grid`) en `<div id="sec-candidatos" class="tab-sec">`. Crear `<div id="sec-pipeline" class="tab-sec hidden">` y `<div id="sec-mensajes" class="tab-sec hidden">` con placeholder ("Próximamente" temporal).
- [ ] **Step 3:** Implementar `function showTab(id){ document.querySelectorAll('.tab-sec').forEach(s=>s.classList.add('hidden')); document.getElementById('sec-'+id).classList.remove('hidden'); /* marcar pestaña activa */ if(id==='pipeline') loadPipeline?.(); if(id==='mensajes') loadInbox?.(); }`. (Las funciones `loadPipeline`/`loadInbox` se definen en fases B/C; usar optional-call `?.` o guardas.)
- [ ] **Step 4:** Estado activo de pestañas: función que aplica clases activas al botón de la pestaña seleccionada.
- [ ] **Step 5 (verificar):** `node --check` del JS extraído (PASS). Arnés mock: cargar dashboard, click en cada pestaña, confirmar que solo su sección es visible y el pool sigue renderizando en Candidatos. Screenshot.
- [ ] **Step 6:** Commit `feat(recruiter): nav shell de 3 secciones`.

---

## Fase B — Pipeline

### Task B1: Migraciones + siembra de etapas

**Files:**
- Create: `docs/supabase-migrations/2026-07-31-pipeline.sql` (referencia)
- Backend vía MCP `apply_migration`.

**Interfaces:**
- Produces: tablas `pipeline_stages(id, company_id, nombre, posicion, color, created_at)`, `pipeline_candidates(id, company_id, student_id, stage_id, posicion, nota, created_at, unique(company_id,student_id))`; RPC `ensure_pipeline_stages(p_company uuid)`.

- [ ] **Step 1:** Escribir el SQL de las 2 tablas (ver spec §Modelo de datos) con índices y FKs (`stage_id ... on delete restrict`).
- [ ] **Step 2:** Habilitar RLS en ambas y crear policy `FOR ALL TO authenticated USING (company_id in (select id from public.companies where user_id = auth.uid()))`.
- [ ] **Step 3:** Crear `ensure_pipeline_stages(uuid)` SECURITY DEFINER (valida `companies.user_id = auth.uid()`; si no hay etapas, siembra Nuevos/Contactado/Entrevista/Oferta/Contratado con colores). `revoke ... from anon,public; grant ... to authenticated`.
- [ ] **Step 4:** Aplicar vía `apply_migration`. Guardar copia en `docs/supabase-migrations/2026-07-31-pipeline.sql`.
- [ ] **Step 5 (verificar):** SQL impersonando al reclutador (uid de la empresa Dinzzy `84bf4000-...`): llamar `ensure_pipeline_stages(<company>)`, confirmar 5 etapas; insert/select/update/delete en `pipeline_candidates`; confirmar que con OTRO uid no ve esas filas (aislamiento). `get_advisors(security)` sin nuevos errores críticos.
- [ ] **Step 6:** Commit `feat(pipeline): tablas + RLS + ensure_pipeline_stages`.

### Task B2: Like / Unlike en el pool

**Files:**
- Modify: `zentu-company-dashboard.html`

**Interfaces:**
- Consumes: `companyId`, `ensure_my_company` (ya existe).
- Produces: `state.likedIds` (Set de student_id en mi pipeline), `likeCandidate(id)`, `unlikeCandidate(id)`, `loadMyPipelineIds()`.

- [ ] **Step 1:** `loadMyPipelineIds()`: `select student_id from pipeline_candidates where company_id=companyId` → `state.likedIds = new Set(...)`. Llamar en `init()` tras `ensure_my_company`.
- [ ] **Step 2:** Agregar botón de like (corazón SVG) en la tarjeta del pool (`cardHTML`) y en el encabezado del modal (`renderDetail`). Estado visual según `state.likedIds.has(id)`.
- [ ] **Step 3:** `likeCandidate(id)`: asegurar etapas (`sb.rpc('ensure_pipeline_stages',{p_company:companyId})`), obtener primera etapa (menor posicion), `insert pipeline_candidates (company_id,student_id,stage_id,posicion=<max+1>)` con manejo idempotente; actualizar `state.likedIds`, re-render del botón. Optimista + revert.
- [ ] **Step 4:** `unlikeCandidate(id)`: `delete pipeline_candidates where company_id and student_id`; actualizar `state.likedIds`; re-render. Optimista + revert.
- [ ] **Step 5:** Filtro "Ocultar los que ya están en mi pipeline" (checkbox en la barra de filtros del pool) que excluye `state.likedIds` del grid.
- [ ] **Step 6 (verificar):** Arnés mock (stub de `sb` para pipeline): like marca la tarjeta "En pipeline", unlike la revierte, filtro oculta/muestra. `node --check`. Screenshot.
- [ ] **Step 7:** Commit `feat(pipeline): like/unlike en el pool`.

### Task B3: Tablero kanban (render)

**Files:**
- Modify: `zentu-company-dashboard.html`

**Interfaces:**
- Consumes: `companyId`, `computeMatches`, `SKILLS_CONFIG`, `renderDetail`.
- Produces: `state.stages` (array ordenado), `state.pipeline` (array de {pc, student}), `loadPipeline()`, `renderBoard()`, `pipelineCardHTML(student, pc)`.

- [ ] **Step 1:** `loadPipeline()`: `ensure_pipeline_stages` → cargar `pipeline_stages` (order posicion) → cargar `pipeline_candidates` de la empresa join a `students` (los datos necesarios para la tarjeta y el modal). Poblar `state.stages`, `state.pipeline`.
- [ ] **Step 2:** `renderBoard()`: fila horizontal de columnas (una por etapa) con encabezado (punto color + nombre + contador + botón menú) y lista de tarjetas; botón "+ Agregar etapa" al final. Estado vacío global si no hay candidatos.
- [ ] **Step 3:** `pipelineCardHTML`: avatar/iniciales, nombre, carrera, % mejor match (`computeMatches[0]`). `onclick` abre `openCandidate(student.id)` (reutiliza modal; el modal debe funcionar con datos ya en memoria o recargar).
- [ ] **Step 4:** Ajustar `openCandidate`/`ALL` para que el modal funcione también con candidatos del pipeline que no estén en el pool `ALL` (buscar primero en `ALL`, luego en `state.pipeline`).
- [ ] **Step 5 (verificar):** Arnés mock con 5 etapas y ~4 candidatos repartidos: kanban renderiza columnas con contadores; click en tarjeta abre modal. Screenshot. `node --check`.
- [ ] **Step 6:** Commit `feat(pipeline): tablero kanban`.

### Task B4: Drag & drop de candidatos entre etapas

**Files:**
- Modify: `zentu-company-dashboard.html`

**Interfaces:**
- Consumes: `state.stages`, `state.pipeline`, `renderBoard`.
- Produces: handlers `onCardDragStart`, `onColDragOver`, `onColDrop`; `moveCandidate(pcId, toStageId)`.

- [ ] **Step 1:** Tarjetas `draggable="true"` con `ondragstart` que guarda el `pc.id` en `state.dragPc` (y `dataTransfer`). Columnas con `ondragover="event.preventDefault()"` (permite soltar) y `ondrop`.
- [ ] **Step 2:** `moveCandidate(pcId, toStageId)`: si cambia de etapa, `update pipeline_candidates set stage_id=toStageId, posicion=<max de destino+1>`. Optimista (mover en `state.pipeline` y re-render) + revert en error.
- [ ] **Step 3:** Feedback visual: resaltar la columna destino en `dragover` (clase temporal), quitarla en `dragleave`/`drop`.
- [ ] **Step 4 (verificar):** Arnés mock: simular drop de una tarjeta en otra columna → la tarjeta cambia de columna y el stub de update se llama con el stage destino. Screenshot antes/después. `node --check`.
- [ ] **Step 5:** Commit `feat(pipeline): drag & drop de candidatos`.

### Task B5: Gestión de etapas (agregar/renombrar/color/eliminar/reordenar)

**Files:**
- Modify: `zentu-company-dashboard.html`

**Interfaces:**
- Consumes: `state.stages`, `renderBoard`, `companyId`.
- Produces: `addStage()`, `renameStage(id)`, `setStageColor(id,color)`, `deleteStage(id)`, `reorderStages(...)`, mini-menú de columna.

- [ ] **Step 1:** "+ Agregar etapa": prompt/inline input para nombre → `insert pipeline_stages (nombre, posicion=<max+1>, color por defecto)` → recargar `state.stages`, re-render.
- [ ] **Step 2:** Menú de columna (botón en el encabezado) con: Renombrar (input → `update nombre`), Color (paleta pequeña de ~6 colores → `update color`), Eliminar.
- [ ] **Step 3:** Eliminar etapa: si tiene candidatos, mostrar selector "mover candidatos a: <otra etapa>"; `update pipeline_candidates set stage_id=<destino>` de los afectados, luego `delete pipeline_stages`. Bloquear eliminar si es la única etapa.
- [ ] **Step 4:** Reordenar columnas: encabezado `draggable`; al soltar sobre otra columna, recomputar `posicion` de las etapas y `update`. Optimista + revert.
- [ ] **Step 5 (verificar):** Arnés mock: agregar etapa (aparece columna), renombrar (cambia título), color (cambia punto), eliminar con candidatos (pide destino y los reubica), reordenar (cambia orden). Screenshots. `node --check`.
- [ ] **Step 6:** Commit `feat(pipeline): gestión de etapas personalizables`.

- [ ] **Deploy Fase A+B:** `vercel --prod --yes` desde el repo durable; verificar en vivo (`curl` grep de marcadores del pipeline).

---

## Fase C — Sección Mensajes

### Task C1: Bandeja de dos paneles

**Files:**
- Modify: `zentu-company-dashboard.html`

**Interfaces:**
- Consumes: `companyId`, `messages` (tabla), datos de `students`.
- Produces: `loadInbox()`, `renderInbox()`, `openConversation(studentId)`, `sendInboxMessage()`, badge `#tabUnread`.

- [ ] **Step 1:** `loadInbox()`: `select` de `messages` de la empresa (`company_id=companyId`) ordenados; agrupar por `student_id`; cargar nombres/avatars de `students` para esos ids. Poblar `state.inbox`.
- [ ] **Step 2:** `renderInbox()`: panel izquierdo con lista de conversaciones (avatar, nombre, preview último mensaje, hora, no leídos); panel derecho con la conversación activa (encabezado + burbujas + composer). Layout de dos columnas (escritorio).
- [ ] **Step 3:** `openConversation(studentId)`: cargar/mostrar hilo; marcar como leídos los mensajes `sender_type='student'` no leídos de ese estudiante (`update messages set leido=true`).
- [ ] **Step 4:** `sendInboxMessage()`: reutilizar la lógica de `sendToStudent` (insert con `sender_type='company'`), optimista + revert; refrescar hilo y lista.
- [ ] **Step 5:** Badge `#tabUnread`: total de mensajes de estudiantes sin leer para esta empresa; actualizar en `loadInbox` y tras marcar leídos.
- [ ] **Step 6 (verificar):** Arnés mock con 2 conversaciones (una con no leídos): lista renderiza con badges; abrir conversación muestra burbujas y marca leídos (badge baja); enviar agrega burbuja. Screenshots. `node --check`.
- [ ] **Step 7:** Commit `feat(recruiter): sección de mensajes (bandeja de dos paneles)`.

- [ ] **Deploy Fase C:** `vercel --prod --yes`; verificar en vivo.

---

## Self-Review (writing-plans)

- **Cobertura del spec:** Shell (A1), tablas+RLS+seed (B1), like/unlike+filtro (B2), kanban render+modal (B3), DnD candidatos (B4), gestión de etapas incl. reordenar/eliminar-con-destino (B5), bandeja de mensajes+no leídos (C1). ✔ Cubre todos los objetivos del spec.
- **Placeholders:** Sin TBD; el SQL completo vive en el spec §Modelo de datos y se transcribe en B1. Las funciones UI están nombradas con firmas e intención concreta.
- **Consistencia de tipos:** `state.likedIds` (Set), `state.stages` (array {id,nombre,posicion,color}), `state.pipeline` (array {pc, student}), `moveCandidate(pcId,toStageId)`, `openCandidate(id)` reutilizado en B3/B4. Nombres consistentes entre tareas.
