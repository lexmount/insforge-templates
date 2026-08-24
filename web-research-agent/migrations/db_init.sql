-- Threadline — Web Research Agent
create extension if not exists pgcrypto;

create table if not exists public.research_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  title text not null,
  question text not null,
  status text not null default 'running' check (status in ('running', 'ready', 'failed')),
  summary text not null default '',
  error_message text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (btrim(title) <> '' and btrim(question) <> '')
);

create table if not exists public.research_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.research_projects(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  url text not null,
  final_url text not null default '',
  domain text not null,
  title text not null,
  excerpt text not null default '',
  content_markdown text not null default '',
  content_hash text not null,
  word_count integer not null default 0 check (word_count >= 0),
  fetch_mode text not null check (fetch_mode in ('moli', 'basic-http')),
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (project_id, url)
);

create table if not exists public.research_claims (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.research_projects(id) on delete cascade,
  source_id uuid not null references public.research_sources(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  claim text not null,
  quote text not null default '',
  citation_label text not null,
  confidence numeric(4,3) not null default 0.7 check (confidence >= 0 and confidence <= 1),
  created_at timestamptz not null default now()
);

create index if not exists research_projects_user_created_idx on public.research_projects(user_id, created_at desc);
create index if not exists research_sources_project_idx on public.research_sources(project_id, created_at);
create index if not exists research_claims_project_idx on public.research_claims(project_id, created_at);

alter table public.research_projects enable row level security;
alter table public.research_sources enable row level security;
alter table public.research_claims enable row level security;

create policy research_projects_owner_all on public.research_projects for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy research_sources_owner_all on public.research_sources for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy research_claims_owner_all on public.research_claims for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.research_projects to authenticated;
grant select, insert, update, delete on public.research_sources to authenticated;
grant select, insert, update, delete on public.research_claims to authenticated;

create trigger research_projects_updated_at before update on public.research_projects
  for each row execute function system.update_updated_at();
