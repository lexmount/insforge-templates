create table public.insight_flow_agent_configs (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  base_url text not null,
  target_mode text not null default 'model' check (target_mode in ('model', 'agent')),
  target text not null,
  disable_tools boolean not null default false,
  api_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    btrim(base_url) <> '' and length(base_url) <= 2048 and
    btrim(target) <> '' and length(target) <= 200 and
    length(api_key) between 1 and 512
  )
);

alter table public.insight_flow_agent_configs enable row level security;

create policy insight_flow_agent_configs_owner_select
  on public.insight_flow_agent_configs for select to authenticated
  using (user_id = (select auth.uid()));

create policy insight_flow_agent_configs_owner_insert
  on public.insight_flow_agent_configs for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy insight_flow_agent_configs_owner_update
  on public.insight_flow_agent_configs for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.insight_flow_agent_configs from anon;
revoke update on public.insight_flow_agent_configs from authenticated;
grant usage on schema public to authenticated;
grant select, insert on public.insight_flow_agent_configs to authenticated;
grant update (base_url, target_mode, target, disable_tools, api_key)
  on public.insight_flow_agent_configs to authenticated;

create function public.save_insight_flow_agent_config(
  p_base_url text,
  p_target_mode text,
  p_target text,
  p_disable_tools boolean,
  p_api_key text
)
returns void
language sql
set search_path = pg_catalog, public, pg_temp
as $$
  insert into public.insight_flow_agent_configs (
    user_id, base_url, target_mode, target, disable_tools, api_key
  ) values (
    (select auth.uid()), p_base_url, p_target_mode, p_target, p_disable_tools, p_api_key
  )
  on conflict (user_id) do update set
    base_url = excluded.base_url,
    target_mode = excluded.target_mode,
    target = excluded.target,
    disable_tools = excluded.disable_tools,
    api_key = excluded.api_key
  where public.insight_flow_agent_configs.user_id = (select auth.uid());
$$;

revoke all on function public.save_insight_flow_agent_config(text, text, text, boolean, text) from public, anon;
grant execute on function public.save_insight_flow_agent_config(text, text, text, boolean, text) to authenticated;

create trigger insight_flow_agent_configs_updated_at
  before update on public.insight_flow_agent_configs
  for each row execute function system.update_updated_at();
