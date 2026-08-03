-- Migración: Vacantes (job_offers) + Aplicaciones (job_applications)
-- Aplicada vía MCP apply_migration el 2026-08-02.

create table if not exists public.job_offers (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  empresa_nombre text,
  titulo        text not null,
  area          text,
  ubicacion     text,
  modalidad     text,
  salario       text,
  descripcion   text,
  tags          text[] not null default '{}',
  estado        text not null default 'publicada',   -- 'publicada' | 'cerrada'
  created_at    timestamptz not null default now()
);
create index if not exists idx_job_offers_company on public.job_offers(company_id);
create index if not exists idx_job_offers_estado on public.job_offers(estado);

create table if not exists public.job_applications (
  id          uuid primary key default gen_random_uuid(),
  offer_id    uuid not null references public.job_offers(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  estado      text not null default 'aplicada',       -- 'aplicada' | 'guardada'
  created_at  timestamptz not null default now(),
  unique (offer_id, student_id)
);
create index if not exists idx_job_applications_company on public.job_applications(company_id);
create index if not exists idx_job_applications_student on public.job_applications(student_id);

alter table public.job_offers       enable row level security;
alter table public.job_applications enable row level security;

create policy "job_offers own" on public.job_offers for all to authenticated
  using (company_id in (select id from public.companies where user_id = auth.uid()))
  with check (company_id in (select id from public.companies where user_id = auth.uid()));
create policy "job_offers public read" on public.job_offers for select to authenticated
  using (estado = 'publicada');

create policy "job_applications participants" on public.job_applications for all to authenticated
  using (
    student_id in (select id from public.students where user_id = auth.uid())
    or company_id in (select id from public.companies where user_id = auth.uid())
  )
  with check (student_id in (select id from public.students where user_id = auth.uid()));

-- Deriva company_id desde la oferta (el estudiante no lo envía)
create or replace function public.set_application_company()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select company_id into new.company_id from public.job_offers where id = new.offer_id;
  return new;
end $$;
drop trigger if exists trg_set_application_company on public.job_applications;
create trigger trg_set_application_company before insert on public.job_applications
  for each row execute function public.set_application_company();

-- Al APLICAR, agrega al candidato al pipeline de la empresa (primera etapa; siembra etapas si faltan)
create or replace function public.on_application_to_pipeline()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_stage uuid; v_pos int;
begin
  if new.estado <> 'aplicada' then return new; end if;
  if not exists (select 1 from public.pipeline_stages where company_id = new.company_id) then
    insert into public.pipeline_stages (company_id, nombre, posicion, color) values
      (new.company_id,'Nuevos',0,'#7B68EE'),(new.company_id,'Contactado',1,'#4A9EFF'),
      (new.company_id,'Entrevista',2,'#F59E0B'),(new.company_id,'Oferta',3,'#10B981'),
      (new.company_id,'Contratado',4,'#22C55E');
  end if;
  select id into v_stage from public.pipeline_stages where company_id = new.company_id order by posicion limit 1;
  select coalesce(max(posicion),-1)+1 into v_pos from public.pipeline_candidates where company_id = new.company_id and stage_id = v_stage;
  insert into public.pipeline_candidates (company_id, student_id, stage_id, posicion)
    values (new.company_id, new.student_id, v_stage, v_pos)
    on conflict (company_id, student_id) do nothing;
  return new;
end $$;
drop trigger if exists trg_application_to_pipeline on public.job_applications;
create trigger trg_application_to_pipeline after insert on public.job_applications
  for each row execute function public.on_application_to_pipeline();
