-- One private tracker snapshot per authenticated Supabase user.
create table if not exists public.jee_tracker_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
-- Limit stored snapshots and reject unexpected top-level JSON values.
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'jee_tracker_state_state_size_check'
      and conrelid = 'public.jee_tracker_state'::regclass
  ) then
    alter table public.jee_tracker_state
      add constraint jee_tracker_state_state_size_check
      check (jsonb_typeof(state) = 'object' and octet_length(state::text) <= 4194304) not valid;
  end if;
end $$;
alter table public.jee_tracker_state enable row level security;
revoke all on table public.jee_tracker_state from anon, authenticated;
grant select, insert, update on table public.jee_tracker_state to authenticated;
drop policy if exists "Users read only their tracker" on public.jee_tracker_state;
drop policy if exists "Users create only their tracker" on public.jee_tracker_state;
drop policy if exists "Users update only their tracker" on public.jee_tracker_state;
create policy "Users read only their tracker" on public.jee_tracker_state for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users create only their tracker" on public.jee_tracker_state for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update only their tracker" on public.jee_tracker_state for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='jee_tracker_state') then
    alter publication supabase_realtime add table public.jee_tracker_state;
  end if;
end $$;
