-- ============================================================================
-- SVR Production Log — 003: RPC functions
--
-- Write RPCs (SECURITY DEFINER, fixed empty search_path, role-checked):
--   create_production_log, update_production_log, delete_production_log,
--   set_user_role
-- Read RPCs (SECURITY INVOKER, so RLS still applies):
--   list_production_logs, dashboard_stats, report_summary, report_rows
--
-- Permissions policy
--   create / edit log : admin, supervisor
--   delete log        : admin only
--   viewers           : read only
-- ============================================================================

-- ---------- internal: validate a JSON array of entries ---------------------
create or replace function public._validate_entries(p_entries jsonb, p_log_id bigint)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e         jsonb;
  i         int := 0;
  v_machine numeric;
  v_part    numeric;
  v_qty     numeric;
begin
  if p_entries is null
     or jsonb_typeof(p_entries) <> 'array'
     or jsonb_array_length(p_entries) = 0 then
    raise exception 'At least one production entry is required.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_entries) > 200 then
    raise exception 'A log can contain at most 200 entries.' using errcode = '22023';
  end if;

  for e in select value from jsonb_array_elements(p_entries) loop
    i := i + 1;

    if jsonb_typeof(e) <> 'object'
       or jsonb_typeof(e -> 'machine_id') <> 'number'
       or jsonb_typeof(e -> 'part_id') <> 'number'
       or jsonb_typeof(e -> 'quantity') <> 'number' then
      raise exception 'Entry %: machine, part and quantity are required.', i using errcode = '22023';
    end if;

    v_machine := (e ->> 'machine_id')::numeric;
    v_part    := (e ->> 'part_id')::numeric;
    v_qty     := (e ->> 'quantity')::numeric;

    if v_machine <> trunc(v_machine) or v_part <> trunc(v_part) then
      raise exception 'Entry %: invalid machine or part.', i using errcode = '22023';
    end if;
    if v_qty < 0 or v_qty <> trunc(v_qty) or v_qty > 2147483647 then
      raise exception 'Entry %: quantity must be a whole number of 0 or more.', i using errcode = '22023';
    end if;

    -- A machine/part must be active, unless this log already used it
    -- (so historical logs stay editable after something is deactivated).
    if not exists (
      select 1 from public.machines m
      where m.id = v_machine::bigint
        and (m.is_active or exists (
              select 1 from public.production_entries pe
              where pe.log_id = p_log_id and pe.machine_id = m.id))
    ) then
      raise exception 'Entry %: the selected machine does not exist or is inactive.', i using errcode = '22023';
    end if;

    if not exists (
      select 1 from public.parts pt
      where pt.id = v_part::bigint
        and (pt.is_active or exists (
              select 1 from public.production_entries pe
              where pe.log_id = p_log_id and pe.part_id = pt.id))
    ) then
      raise exception 'Entry %: the selected part does not exist or is inactive.', i using errcode = '22023';
    end if;
  end loop;
end;
$$;

revoke all on function public._validate_entries(jsonb, bigint) from public, anon, authenticated;

-- ---------- create ---------------------------------------------------------
create or replace function public.create_production_log(
  p_log_date date,
  p_notes    text,
  p_entries  jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := public.app_role();
  v_id   bigint;
begin
  if v_role is null or v_role not in ('admin', 'supervisor') then
    raise exception 'You do not have permission to create production logs.' using errcode = '42501';
  end if;
  if p_log_date is null then
    raise exception 'Production date is required.' using errcode = '22023';
  end if;

  perform public._validate_entries(p_entries, null);

  insert into public.production_logs (log_date, notes, created_by)
  values (p_log_date, nullif(btrim(p_notes), ''), auth.uid())
  returning id into v_id;

  insert into public.production_entries (log_id, machine_id, part_id, quantity, notes)
  select v_id,
         (e ->> 'machine_id')::bigint,
         (e ->> 'part_id')::bigint,
         (e ->> 'quantity')::numeric::int,
         nullif(btrim(e ->> 'notes'), '')
  from jsonb_array_elements(p_entries) e;

  return v_id;
exception
  when unique_violation then
    raise exception 'A production log already exists for %. Open that log and edit it instead.',
      to_char(p_log_date, 'DD Mon YYYY') using errcode = '23505';
end;
$$;

-- ---------- update ---------------------------------------------------------
-- Keeps the same log id; entries are replaced inside one transaction.
create or replace function public.update_production_log(
  p_log_id   bigint,
  p_log_date date,
  p_notes    text,
  p_entries  jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := public.app_role();
begin
  if v_role is null or v_role not in ('admin', 'supervisor') then
    raise exception 'You do not have permission to edit production logs.' using errcode = '42501';
  end if;
  if p_log_date is null then
    raise exception 'Production date is required.' using errcode = '22023';
  end if;

  perform 1 from public.production_logs where id = p_log_id for update;
  if not found then
    raise exception 'Production log #% was not found. It may have been deleted.', p_log_id
      using errcode = 'P0002';
  end if;

  perform public._validate_entries(p_entries, p_log_id);

  update public.production_logs
     set log_date = p_log_date,
         notes    = nullif(btrim(p_notes), '')
   where id = p_log_id;

  delete from public.production_entries where log_id = p_log_id;

  insert into public.production_entries (log_id, machine_id, part_id, quantity, notes)
  select p_log_id,
         (e ->> 'machine_id')::bigint,
         (e ->> 'part_id')::bigint,
         (e ->> 'quantity')::numeric::int,
         nullif(btrim(e ->> 'notes'), '')
  from jsonb_array_elements(p_entries) e;

  return p_log_id;
exception
  when unique_violation then
    raise exception 'Another production log already exists for %. Pick a different date or edit that log.',
      to_char(p_log_date, 'DD Mon YYYY') using errcode = '23505';
end;
$$;

-- ---------- delete (admin only) -------------------------------------------
create or replace function public.delete_production_log(p_log_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.app_role() is distinct from 'admin' then
    raise exception 'Only administrators can delete production logs.' using errcode = '42501';
  end if;

  delete from public.production_logs where id = p_log_id; -- entries cascade
  if not found then
    raise exception 'Production log #% was not found. It may already be deleted.', p_log_id
      using errcode = 'P0002';
  end if;
end;
$$;

-- ---------- role administration -------------------------------------------
create or replace function public.set_user_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.app_role() is distinct from 'admin' then
    raise exception 'Only administrators can change user roles.' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('admin', 'supervisor', 'viewer') then
    raise exception 'Invalid role.' using errcode = '22023';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own role.' using errcode = '42501';
  end if;

  update public.profiles set role = p_role where id = p_user_id;
  if not found then
    raise exception 'User not found.' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------- read: paginated history ----------------------------------------
create or replace function public.list_production_logs(
  p_search     text   default null,
  p_date       date   default null,
  p_from       date   default null,
  p_to         date   default null,
  p_machine_id bigint default null,
  p_part_id    bigint default null,
  p_limit      int    default 20,
  p_offset     int    default 0
)
returns table (
  id             bigint,
  log_date       date,
  notes          text,
  created_by     uuid,
  creator_name   text,
  created_at     timestamptz,
  updated_at     timestamptz,
  total_quantity bigint,
  entry_count    bigint,
  total_count    bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select nullif(btrim(p_search), '') as q
  ),
  filtered as (
    select l.*
    from public.production_logs l, params
    where (p_date is null or l.log_date = p_date)
      and (p_from is null or l.log_date >= p_from)
      and (p_to   is null or l.log_date <= p_to)
      and (p_machine_id is null or exists (
            select 1 from public.production_entries e
            where e.log_id = l.id and e.machine_id = p_machine_id))
      and (p_part_id is null or exists (
            select 1 from public.production_entries e
            where e.log_id = l.id and e.part_id = p_part_id))
      and (params.q is null
           or l.id::text = ltrim(params.q, '#')
           or coalesce(l.notes, '') ilike
              '%' || replace(replace(replace(params.q, '\', '\\'), '%', '\%'), '_', '\_') || '%')
  ),
  counted as (select count(*) as c from filtered)
  select f.id,
         f.log_date,
         f.notes,
         f.created_by,
         p.full_name,
         f.created_at,
         f.updated_at,
         coalesce(s.total, 0)::bigint,
         coalesce(s.cnt, 0)::bigint,
         (select c from counted)
  from filtered f
  left join public.profiles p on p.id = f.created_by
  left join lateral (
    select sum(e.quantity) as total, count(*) as cnt
    from public.production_entries e
    where e.log_id = f.id
  ) s on true
  order by f.log_date desc, f.id desc
  limit greatest(least(coalesce(p_limit, 20), 100), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- ---------- read: dashboard counters ---------------------------------------
-- p_today is the client's local factory date, so no timezone is assumed here.
create or replace function public.dashboard_stats(p_today date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'active_machines', (select count(*) from public.machines where is_active),
    'active_parts',    (select count(*) from public.parts where is_active),
    'total_logs',      (select count(*) from public.production_logs),
    'today_quantity',  coalesce((
        select sum(e.quantity)
        from public.production_entries e
        join public.production_logs l on l.id = e.log_id
        where l.log_date = p_today), 0)
  );
$$;

-- ---------- read: report aggregates ----------------------------------------
create or replace function public.report_summary(
  p_from       date   default null,
  p_to         date   default null,
  p_machine_id bigint default null,
  p_part_id    bigint default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with base as (
    select l.id as log_id, l.log_date, e.machine_id, e.part_id, e.quantity
    from public.production_entries e
    join public.production_logs l on l.id = e.log_id
    where (p_from is null or l.log_date >= p_from)
      and (p_to   is null or l.log_date <= p_to)
      and (p_machine_id is null or e.machine_id = p_machine_id)
      and (p_part_id    is null or e.part_id    = p_part_id)
  )
  select jsonb_build_object(
    'total_quantity', coalesce((select sum(quantity) from base), 0),
    'log_count',      (select count(distinct log_id) from base),
    'entry_count',    (select count(*) from base),
    'by_day', coalesce((
        select jsonb_agg(jsonb_build_object('date', x.d, 'quantity', x.q) order by x.d)
        from (select log_date as d, sum(quantity) as q from base group by log_date) x), '[]'::jsonb),
    'by_machine', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', m.id, 'code', m.machine_code, 'name', m.machine_name, 'quantity', x.q)
               order by x.q desc, m.machine_code)
        from (select machine_id, sum(quantity) as q from base group by machine_id) x
        join public.machines m on m.id = x.machine_id), '[]'::jsonb),
    'by_part', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', pt.id, 'code', pt.part_code, 'name', pt.part_name, 'quantity', x.q)
               order by x.q desc, pt.part_code)
        from (select part_id, sum(quantity) as q from base group by part_id) x
        join public.parts pt on pt.id = x.part_id), '[]'::jsonb)
  );
$$;

-- ---------- read: flat rows for CSV export ---------------------------------
create or replace function public.report_rows(
  p_from       date   default null,
  p_to         date   default null,
  p_machine_id bigint default null,
  p_part_id    bigint default null,
  p_limit      int    default 1000,
  p_offset     int    default 0
)
returns table (
  log_id       bigint,
  log_date     date,
  machine_code text,
  machine_name text,
  part_code    text,
  part_name    text,
  quantity     integer,
  entry_notes  text,
  log_notes    text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select l.id, l.log_date, m.machine_code, m.machine_name,
         pt.part_code, pt.part_name, e.quantity, e.notes, l.notes
  from public.production_entries e
  join public.production_logs l on l.id = e.log_id
  join public.machines m        on m.id = e.machine_id
  join public.parts pt          on pt.id = e.part_id
  where (p_from is null or l.log_date >= p_from)
    and (p_to   is null or l.log_date <= p_to)
    and (p_machine_id is null or e.machine_id = p_machine_id)
    and (p_part_id    is null or e.part_id    = p_part_id)
  order by l.log_date desc, l.id desc, e.id
  limit greatest(least(coalesce(p_limit, 1000), 1000), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- ---------- execute privileges --------------------------------------------
-- Supabase grants EXECUTE to anon/public by default; remove it, then grant
-- only to signed-in users. (Each function re-checks the role internally.)
revoke all on function public.create_production_log(date, text, jsonb)        from public, anon;
revoke all on function public.update_production_log(bigint, date, text, jsonb) from public, anon;
revoke all on function public.delete_production_log(bigint)                   from public, anon;
revoke all on function public.set_user_role(uuid, text)                       from public, anon;
revoke all on function public.list_production_logs(text, date, date, date, bigint, bigint, int, int) from public, anon;
revoke all on function public.dashboard_stats(date)                           from public, anon;
revoke all on function public.report_summary(date, date, bigint, bigint)      from public, anon;
revoke all on function public.report_rows(date, date, bigint, bigint, int, int) from public, anon;

grant execute on function public.create_production_log(date, text, jsonb)        to authenticated;
grant execute on function public.update_production_log(bigint, date, text, jsonb) to authenticated;
grant execute on function public.delete_production_log(bigint)                   to authenticated;
grant execute on function public.set_user_role(uuid, text)                       to authenticated;
grant execute on function public.list_production_logs(text, date, date, date, bigint, bigint, int, int) to authenticated;
grant execute on function public.dashboard_stats(date)                           to authenticated;
grant execute on function public.report_summary(date, date, bigint, bigint)      to authenticated;
grant execute on function public.report_rows(date, date, bigint, bigint, int, int) to authenticated;
