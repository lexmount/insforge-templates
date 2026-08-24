-- Driftwatch — Website Change Monitor
create extension if not exists pgcrypto;

create table if not exists public.monitor_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null,
  url text not null,
  category text not null default 'Product',
  interval_minutes integer not null default 360 check (interval_minutes between 30 and 10080),
  status text not null default 'quiet' check (status in ('quiet', 'changed', 'checking', 'failed')),
  last_hash text not null default '',
  last_checked_at timestamptz,
  next_check_at timestamptz not null default now(),
  error_message text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (btrim(name) <> '' and url ~ '^https?://')
);

create table if not exists public.monitor_snapshots (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.monitor_targets(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  content_hash text not null,
  title text not null default '',
  content_excerpt text not null default '',
  content_markdown text not null default '',
  word_count integer not null default 0 check (word_count >= 0),
  fetch_mode text not null check (fetch_mode in ('moli', 'basic-http')),
  captured_at timestamptz not null default now()
);

create table if not exists public.monitor_changes (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.monitor_targets(id) on delete cascade,
  previous_snapshot_id uuid references public.monitor_snapshots(id) on delete set null,
  current_snapshot_id uuid not null references public.monitor_snapshots(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  summary text not null,
  change_type text not null default 'content',
  significance text not null default 'medium' check (significance in ('low', 'medium', 'high')),
  before_excerpt text not null default '',
  after_excerpt text not null default '',
  detected_at timestamptz not null default now()
);

create index if not exists monitor_targets_user_created_idx on public.monitor_targets(user_id, created_at desc);
create index if not exists monitor_targets_due_idx on public.monitor_targets(next_check_at) where status <> 'checking';
create index if not exists monitor_snapshots_target_idx on public.monitor_snapshots(target_id, captured_at desc);
create index if not exists monitor_changes_target_idx on public.monitor_changes(target_id, detected_at desc);

alter table public.monitor_targets enable row level security;
alter table public.monitor_snapshots enable row level security;
alter table public.monitor_changes enable row level security;

create policy monitor_targets_owner_all on public.monitor_targets for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy monitor_snapshots_owner_all on public.monitor_snapshots for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy monitor_changes_owner_all on public.monitor_changes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.monitor_targets to authenticated;
grant select, insert, update, delete on public.monitor_snapshots to authenticated;
grant select, insert, update, delete on public.monitor_changes to authenticated;

create trigger monitor_targets_updated_at before update on public.monitor_targets
  for each row execute function system.update_updated_at();
