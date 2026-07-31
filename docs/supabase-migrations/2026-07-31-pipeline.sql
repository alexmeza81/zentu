-- Migración: Pipeline del reclutador (aplicada vía MCP apply_migration el 2026-07-31)
-- Tablas: pipeline_stages, pipeline_candidates (RLS por empresa) + ensure_pipeline_stages()

create table if not exists public.pipeline_stages (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  nombre      text not null,
  posicion    int  not null default 0,
  color       text not null default '#7B68EE',
  created_at  timestamptz not null default now()
);
create index if not exists idx_pipeline_stages_company_pos on public.pipeline_stages (company_id, posicion);

create table if not exists public.pipeline_candidates (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  student_id  uuid not null references public.students(id)  on delete cascade,
  stage_id    uuid not null references public.pipeline_stages(id) on delete restrict,
  posicion    int  not null default 0,
  nota        text,
  created_at  timestamptz not null default now(),
  unique (company_id, student_id)
);
create index if not exists idx_pipeline_candidates_company_stage_pos on public.pipeline_candidates (company_id, stage_id, posicion);

alter table public.pipeline_stages     enable row level security;
alter table public.pipeline_candidates enable row level security;

create policy "pipeline_stages own" on public.pipeline_stages
  for all to authenticated
  using (company_id in (select id from public.companies where user_id = auth.uid()))
  with check (company_id in (select id from public.companies where user_id = auth.uid()));

create policy "pipeline_candidates own" on public.pipeline_candidates
  for all to authenticated
  using (company_id in (select id from public.companies where user_id = auth.uid()))
  with check (company_id in (select id from public.companies where user_id = auth.uid()));

create or replace function public.ensure_pipeline_stages(p_company uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
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
