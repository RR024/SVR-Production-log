-- ============================================================================
-- SVR Production Log — 004: promote the FIRST administrator (run once, by hand)
--
-- Run in the Supabase SQL editor (which runs as the database owner) after the
-- person has signed up / been invited. Replace the email, then run.
-- After this, admins manage everyone else from the app's Users page.
-- This file is deliberately NOT a function callable from the client.
-- ============================================================================

update public.profiles
   set role = 'admin'
 where email = 'owner@example.com';   -- <- change me

-- Confirm:
-- select id, full_name, email, role from public.profiles order by created_at;
