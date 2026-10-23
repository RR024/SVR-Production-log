-- ============================================================================
-- SVR Production Log — 002: roles, grants and Row Level Security
--
-- Model
--   * Every signed-in user has one row in public.profiles with a role.
--   * Catalog tables (machines, parts) are read by any role, written by admins.
--   * production_logs / production_entries are READ-ONLY through the API.
--     All writes go through the SECURITY DEFINER RPCs in 003_functions.sql,
--     which check the caller's role and run in one transaction.
--   * Users can never change their own role; only set_user_role() (admin) can.
-- ============================================================================

-- ---------- role helper ----------------------------------------------------
create or replace function public.app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = auth.uid();
$$;

revoke all on function public.app_role() from public, anon;
grant execute on function public.app_role() to authenticated;

-- ---------- auto-create a profile for each new auth user -------------------
-- New users start as 'viewer'. An admin promotes them in the Users page.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1), ''),
    new.email,
    'viewer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Back-fill profiles for users that already exist (as viewers, never admins).
insert into public.profiles (id, full_name, email, role)
select u.id,
       coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(u.email, '@', 1), ''),
       u.email,
       'viewer'
from auth.users u
on conflict (id) do nothing;

-- ---------- table privileges ----------------------------------------------
-- Supabase grants broad default privileges; strip them and grant the minimum.
revoke all on public.profiles           from anon, authenticated;
revoke all on public.machines           from anon, authenticated;
revoke all on public.parts              from anon, authenticated;
revoke all on public.production_logs    from anon, authenticated;
revoke all on public.production_entries from anon, authenticated;

grant select on public.profiles           to authenticated;
grant select on public.machines           to authenticated;
grant select on public.parts              to authenticated;
grant select on public.production_logs    to authenticated;
grant select on public.production_entries to authenticated;

-- Catalog writes (RLS below restricts them to admins). No DELETE is granted:
-- machines and parts are deactivated, never removed.
grant insert, update on public.machines to authenticated;
grant insert, update on public.parts    to authenticated;

-- ---------- RLS ------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.machines           enable row level security;
alter table public.parts              enable row level security;
alter table public.production_logs    enable row level security;
alter table public.production_entries enable row level security;

-- profiles: any user with a role can read (needed to show "created by").
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (public.app_role() is not null);
-- No insert/update/delete policies: profiles change only via the auth trigger
-- and set_user_role(). That is what prevents self-assigned admin.

-- machines
drop policy if exists machines_select on public.machines;
create policy machines_select on public.machines
  for select to authenticated
  using (public.app_role() is not null);

drop policy if exists machines_insert on public.machines;
create policy machines_insert on public.machines
  for insert to authenticated
  with check (public.app_role() = 'admin');

drop policy if exists machines_update on public.machines;
create policy machines_update on public.machines
  for update to authenticated
  using (public.app_role() = 'admin')
  with check (public.app_role() = 'admin');

-- parts
drop policy if exists parts_select on public.parts;
create policy parts_select on public.parts
  for select to authenticated
  using (public.app_role() is not null);

drop policy if exists parts_insert on public.parts;
create policy parts_insert on public.parts
  for insert to authenticated
  with check (public.app_role() = 'admin');

drop policy if exists parts_update on public.parts;
create policy parts_update on public.parts
  for update to authenticated
  using (public.app_role() = 'admin')
  with check (public.app_role() = 'admin');

-- production_logs / production_entries: read-only for every role.
drop policy if exists production_logs_select on public.production_logs;
create policy production_logs_select on public.production_logs
  for select to authenticated
  using (public.app_role() is not null);

drop policy if exists production_entries_select on public.production_entries;
create policy production_entries_select on public.production_entries
  for select to authenticated
  using (public.app_role() is not null);
