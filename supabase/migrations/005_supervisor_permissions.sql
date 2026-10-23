-- ============================================================================
-- SVR Production Log — 005: supervisor catalog permissions
--
-- Supervisors can maintain machines and parts and create/edit daily logs.
-- Only administrators can manage users or delete logs.
-- Safe to run on an existing database.
-- ============================================================================

drop policy if exists machines_insert on public.machines;
create policy machines_insert on public.machines
  for insert to authenticated
  with check (public.app_role() in ('admin', 'supervisor'));

drop policy if exists machines_update on public.machines;
create policy machines_update on public.machines
  for update to authenticated
  using (public.app_role() in ('admin', 'supervisor'))
  with check (public.app_role() in ('admin', 'supervisor'));

drop policy if exists parts_insert on public.parts;
create policy parts_insert on public.parts
  for insert to authenticated
  with check (public.app_role() in ('admin', 'supervisor'));

drop policy if exists parts_update on public.parts;
create policy parts_update on public.parts
  for update to authenticated
  using (public.app_role() in ('admin', 'supervisor'))
  with check (public.app_role() in ('admin', 'supervisor'));
