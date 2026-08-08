-- Lock the public schema down to the app's own connection.
--
-- WHY THIS SHAPE, AND NOT PER-ROW POLICIES
--
-- Nothing in this app talks to Supabase's PostgREST API. The server connects
-- straight to Postgres with postgres-js (src/server/db/index.ts) and storage
-- goes through the service_role key (src/server/storage.ts). Both of those
-- bypass RLS: the table owner is exempt unless FORCE ROW LEVEL SECURITY is
-- set, and service_role is exempt by design.
--
-- There is also no Supabase Auth here. Sign-in is Roblox OAuth into our own
-- `sessions` table, so there is no JWT and `auth.uid()` is always null. A
-- policy like `USING (auth.uid() = user_id)` would not protect anything — it
-- would evaluate to null (deny) for every caller that RLS actually applies
-- to, which is the same as having no policy at all, but with the appearance
-- of having thought about it.
--
-- So: RLS ON, zero policies. Every role RLS applies to — `anon` and
-- `authenticated`, the two the public API key maps to — gets nothing. The app
-- is untouched. That is the real hole being closed: the REST endpoint at
-- /rest/v1/ is reachable by anyone holding the anon key, and the anon key is
-- not a secret.
--
-- Re-run this after any migration that adds a table. It is idempotent.

-- 1. RLS on every table in public, including ones added later. Written as a
--    loop rather than a list so a new table cannot be missed by someone
--    updating a migration and forgetting this file.
do $$
declare t record;
begin
  for t in
    select tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- 2. Belt and braces: take the grants away too.
--
--    RLS alone is enough, but only while it stays on. If someone adds a
--    permissive policy later "to make something work", the grants are what
--    decides whether that mistake is reachable from the internet. Revoking
--    them means the API has no privileges to fall back on.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- Future tables created by migrations inherit the same treatment. Note this
-- applies to objects created by the role that runs this statement — run it as
-- the same role your migrations use.
alter default privileges in schema public
  revoke all on tables from anon, authenticated;
alter default privileges in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges in schema public
  revoke all on functions from anon, authenticated;

-- 3. Verify. Every row should read rls = true, and the grant columns empty.
select
  c.relname as table_name,
  c.relrowsecurity as rls,
  c.relforcerowsecurity as forced,
  coalesce(
    (select count(*) from pg_policies p
      where p.schemaname = 'public' and p.tablename = c.relname),
    0
  ) as policies,
  has_table_privilege('anon', c.oid, 'SELECT') as anon_can_select,
  has_table_privilege('authenticated', c.oid, 'SELECT') as auth_can_select
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;
