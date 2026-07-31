# Diseño — Workspace del reclutador: Pipeline + Sección de Mensajes

**Fecha:** 2026-07-31
**Autor:** Alex Meza (con Claude)
**Estado:** Aprobado (diseño) — pendiente review del spec

## Contexto

El dashboard del reclutador (`zentu-company-dashboard.html`, Tailwind, escritorio) hoy es
una sola vista: un pool abierto de candidatos reclutables (`students` con `estado='en_busqueda'`),
con filtros, tarjetas con match de roles, y un modal de detalle que incluye un panel de
"Mensaje directo" (chat 1-a-1 que escribe en la tabla `messages`).

Este proyecto convierte ese dashboard en un **workspace de 3 secciones** y agrega dos
capacidades nuevas:

1. **Pipeline** (kanban) con etapas **personalizables** por empresa, donde caen los
   candidatos a los que el reclutador da **"like"**.
2. **Sección de Mensajes** dedicada (bandeja de dos paneles) que reúne todas las
   conversaciones del reclutador en un solo lugar.

El "like" es un **shortlist privado**: agrega al candidato al pipeline de *esa* empresa;
el estudiante **no** se entera y la app del estudiante **no** cambia en esta versión.

## Objetivos

- Navegación de 3 secciones: **Candidatos** · **Pipeline** · **Mensajes**.
- Dar/quitar "like" a un candidato desde el pool y desde el modal de detalle.
- Kanban con arrastrar-y-soltar de candidatos entre etapas.
- Etapas totalmente personalizables por empresa: agregar, renombrar, reordenar,
  cambiar color y eliminar (moviendo a los candidatos, no perdiéndolos).
- Bandeja de mensajes de dos paneles (lista de conversaciones + hilo) con no leídos.
- Todo con RLS: cada empresa solo ve/edita su propio pipeline, etapas y mensajes.

## No-objetivos (esta versión)

- Notificar al estudiante del like / match mutuo / cambios en la app del estudiante.
- Colaboración multi-usuario dentro de una misma empresa (hoy 1 empresa = 1 cuenta).
- Realtime (actualización en vivo sin recargar). Se refresca al navegar/recargar.
- Notas por candidato editables en UI enriquecida (el campo existe pero UI es mínima).
- Reordenamiento manual fino de tarjetas dentro de una columna con persistencia de
  posición arbitraria más allá de lo necesario para el drag (ver "Orden dentro de columna").

## Arquitectura

Frontend: se mantiene el archivo único `zentu-company-dashboard.html` (Tailwind CDN +
supabase-js). Se introduce un shell de navegación que muestra/oculta 3 contenedores de
sección. La lógica de datos usa el cliente Supabase ya presente (`sb`).

Backend: 2 tablas nuevas (`pipeline_stages`, `pipeline_candidates`) con RLS por empresa,
y una función `ensure_pipeline_stages()` (SECURITY DEFINER) que siembra las etapas por
defecto la primera vez. Se reutiliza `companies` (fila del reclutador vía
`ensure_my_company()`) y `messages` (chat existente).

### Modelo de datos

```sql
-- Etapas del pipeline, personalizables por empresa
create table public.pipeline_stages (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  nombre      text not null,
  posicion    int  not null default 0,      -- orden de columnas (asc)
  color       text not null default '#7B68EE',
  created_at  timestamptz not null default now()
);
create index on public.pipeline_stages (company_id, posicion);

-- Candidatos dentro del pipeline de una empresa (resultado de un "like")
create table public.pipeline_candidates (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  student_id  uuid not null references public.students(id)  on delete cascade,
  stage_id    uuid not null references public.pipeline_stages(id) on delete restrict,
  posicion    int  not null default 0,      -- orden dentro de la columna (asc)
  nota        text,                          -- nota privada del reclutador (opcional)
  created_at  timestamptz not null default now(),
  unique (company_id, student_id)            -- un candidato aparece una vez por empresa
);
create index on public.pipeline_candidates (company_id, stage_id, posicion);
```

**RLS (ambas tablas):** una sola policy `FOR ALL TO authenticated` cuyo `USING` (y por
tanto `WITH CHECK`) es `company_id in (select id from companies where user_id = auth.uid())`.
Así el reclutador solo ve/inserta/actualiza/borra filas de su propia empresa.

> Nota anti-recursión: estas policies referencian solo `companies` (no `messages`), y la
> policy de `companies` "companies visible via message" usa la función SECURITY DEFINER
> `company_ids_that_messaged_me()`, que no toca pipeline. No hay ciclos.

### Función de siembra de etapas por defecto

```sql
create or replace function public.ensure_pipeline_stages(p_company uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  -- Solo el dueño de la empresa puede sembrar sus etapas
  select user_id into v_owner from public.companies where id = p_company;
  if v_owner is null or v_owner <> auth.uid() then
    return;
  end if;

  if exists (select 1 from public.pipeline_stages where company_id = p_company) then
    return;
  end if;

  insert into public.pipeline_stages (company_id, nombre, posicion, color) values
    (p_company, 'Nuevos',     0, '#7B68EE'),
    (p_company, 'Contactado', 1, '#4A9EFF'),
    (p_company, 'Entrevista', 2, '#F59E0B'),
    (p_company, 'Oferta',     3, '#10B981'),
    (p_company, 'Contratado', 4, '#22C55E');
end;
$$;

revoke execute on function public.ensure_pipeline_stages(uuid) from anon, public;
grant  execute on function public.ensure_pipeline_stages(uuid) to authenticated;
```

Se invoca al abrir la sección Pipeline (después de `ensure_my_company()`), garantizando
que toda empresa tenga al menos las 5 etapas por defecto antes de renderizar el tablero.

### Semántica de operaciones

- **Like** (`likeCandidate(studentId)`): asegura etapas → obtiene la primera etapa
  (menor `posicion`) → `insert` en `pipeline_candidates (company_id, student_id, stage_id,
  posicion=<max+1 de esa etapa>)`. Idempotente vía `unique (company_id, student_id)`
  (un `insert ... on conflict do nothing`).
- **Unlike** (`unlikeCandidate(studentId)`): `delete` la fila de
  `pipeline_candidates` de esa empresa+candidato. Lo saca del tablero.
- **Mover de etapa** (drag): `update pipeline_candidates set stage_id=<destino>,
  posicion=<al final del destino> where id=<pc.id>`.
- **Agregar etapa**: `insert pipeline_stages (nombre, posicion=<max+1>, color)`.
- **Renombrar/color**: `update pipeline_stages set nombre/color`.
- **Reordenar columnas** (drag del encabezado): `update` de `posicion` de las etapas
  afectadas.
- **Eliminar etapa**: si tiene candidatos, la UI pide una etapa destino; primero
  `update pipeline_candidates set stage_id=<destino>` de los afectados, luego
  `delete pipeline_stages`. (El FK `on delete restrict` protege contra borrado accidental
  con candidatos.) No se permite borrar la última etapa que quede.

### Orden dentro de columna

`posicion` en `pipeline_candidates` da el orden vertical dentro de una etapa. Al soltar una
tarjeta se coloca al final de la columna destino (`max(posicion)+1`). El reordenamiento
manual fino dentro de la misma columna es un no-objetivo; basta con que el orden sea
estable y que mover entre columnas funcione. (Orden de respaldo: `created_at`.)

## Componentes de UI

### Shell de navegación
Barra superior con el logo/tag + 3 pestañas (**Candidatos**, **Pipeline**, **Mensajes**)
+ email de empresa + "Salir". Cada pestaña muestra/oculta su contenedor de sección. La
pestaña **Mensajes** muestra un badge con el total de no leídos (mensajes de estudiantes
sin leer dirigidos a esta empresa).

### Sección Candidatos (pool) — cambios
- Cada tarjeta y el modal de detalle ganan un **botón de like** (corazón). Estado:
  vacío = no está en pipeline; lleno/activo = "En pipeline".
- Al dar like, feedback inmediato (optimista) y la tarjeta muestra "En pipeline".
- Filtro opcional: "Ocultar los que ya están en mi pipeline".

### Sección Pipeline (kanban)
- Columnas = etapas ordenadas por `posicion`. Encabezado de columna: punto de color +
  nombre + contador + menú (Renombrar, Color, Eliminar). Botón **"+ Agregar etapa"** al
  final de la fila de columnas.
- Tarjeta de candidato compacta: avatar/iniciales, nombre, carrera, % de mejor match.
  Clic → abre el **mismo modal de detalle** (con match, test, contacto, mensaje directo,
  y el botón de like para quitarlo).
- **Drag & drop**: arrastrar una tarjeta a otra columna la mueve de etapa (persiste).
  Arrastrar el encabezado de una columna reordena las etapas (persiste).
- Estado vacío: si no hay candidatos likeados, mensaje guía ("Dale like a un candidato en
  la pestaña Candidatos para agregarlo a tu pipeline").
- Implementación de DnD: API nativa HTML5 Drag and Drop (`draggable`, `dragstart`,
  `dragover`, `drop`), sin librerías externas (CSP/sin bundler).

### Sección Mensajes (bandeja de dos paneles)
- **Panel izquierdo**: lista de conversaciones agrupadas por `student_id` (candidatos con
  los que hay mensajes), con avatar, nombre, preview del último mensaje, hora y no leídos.
- **Panel derecho**: hilo de la conversación seleccionada — encabezado con el candidato,
  burbujas (empresa a la derecha, estudiante a la izquierda) y composer (misma lógica de
  envío `messages` que ya funciona). Al abrir un hilo, marca como leídos los mensajes del
  estudiante.
- El botón "Mensaje directo" del modal de detalle sigue existiendo y alimenta esta misma
  bandeja.

## Flujo de datos

1. **init**: sesión → `ensure_my_company()` → `companyId`. Carga pool de candidatos.
2. **Abrir Pipeline**: `ensure_pipeline_stages(companyId)` → cargar `pipeline_stages`
   (orden) + `pipeline_candidates` (join a datos de `students`) → render kanban.
3. **Like** desde pool: insert en `pipeline_candidates`; refresca estado de la tarjeta.
4. **Drag** en kanban: update `stage_id`/`posicion`; re-render optimista con reversión en
   error.
5. **Abrir Mensajes**: cargar `messages` de la empresa (agrupados por estudiante) + datos
   de `students` para nombres/avatars → render bandeja; badge de no leídos.

## Manejo de errores

- Todas las escrituras son optimistas con **reversión** si Supabase devuelve error
  (patrón ya usado en la mensajería): se revierte el estado local y se avisa al usuario.
- `like` idempotente (`on conflict do nothing`) evita duplicados por doble clic.
- Eliminar etapa con candidatos exige destino en la UI; el FK `on delete restrict` es la
  red de seguridad a nivel de BD.

## Estrategia de pruebas

Al no haber framework de tests en este repo estático, la verificación es:
- `node --check` sobre el JS extraído del HTML (sintaxis) en cada tarea.
- Pruebas visuales/funcionales con Playwright usando un **arnés mock** (bootstrap que
  inyecta `companyId`, etapas y candidatos de muestra, y stubea `sb`) para no depender de
  login real, verificando: render del kanban, drag entre columnas, agregar/renombrar/
  eliminar etapa, like/unlike, y la bandeja de mensajes (lista + hilo + envío).
- Verificación de RLS impersonando al reclutador vía SQL (insert/select/update/delete en
  `pipeline_*`) confirmando aislamiento por empresa y ausencia de recursión.
- Chequeo de `get_advisors(security)` tras las migraciones.

## Orden de construcción (decomposición)

Se implementa en 3 fases; cada una es desplegable y probable de forma independiente.

- **Fase A — Shell de navegación**: convertir el dashboard en 3 secciones (Candidatos ya
  existe; Pipeline y Mensajes como contenedores vacíos con placeholder). Base para B y C.
- **Fase B — Pipeline** (lo grande, prioridad): migraciones + `ensure_pipeline_stages` +
  like/unlike en el pool + tablero kanban + drag & drop + gestión de etapas.
- **Fase C — Sección Mensajes**: bandeja de dos paneles reutilizando `messages`.

Se puede desplegar A+B primero y C después. Cada fase tendrá su propio plan de
implementación (writing-plans) si conviene, o un plan único con tareas por fase.
