-- Lets the owner's unlocked /admin/courts/ page correct a club's court counts (run once, after 0002_admin_submissions.sql).
--
-- The counts are saved as hand corrections in clubs.clubs.manual, the same place the SQL snippets used before. The public view
-- already prefers them over the scraped values, so nothing else changes. Like 0002, every function answers only when given the
-- admin key (clubs._admin_ok), so the public key alone can neither read the override list nor change a club.

-- which clubs have a hand-set court count right now, and what Google/the scraper says for each (the page shows it, so you can see
-- what Reset To Google would give). The Google numbers are read from the club row itself; a missing column shows as null.
create or replace function clubs.admin_court_overrides(k text) returns jsonb language plpgsql security definer set search_path = clubs, pg_temp as $$
begin
  if not clubs._admin_ok(k) then return jsonb_build_object('ok', false, 'error', 'Not allowed.'); end if;
  return jsonb_build_object('ok', true, 'overrides', coalesce((
    select jsonb_object_agg(c.place_id, jsonb_build_object(
             'total', to_jsonb(c) -> 'courts_total', 'indoor', to_jsonb(c) -> 'courts_indoor',
             'covered', to_jsonb(c) -> 'courts_covered', 'outdoor', to_jsonb(c) -> 'courts_outdoor'))
      from clubs.clubs c
     where c.manual ?| array['courts_total', 'courts_indoor', 'courts_covered', 'courts_outdoor']
  ), '{}'::jsonb));
end $$;

-- set a club's court counts: how many are indoor, covered and outdoor (the total is their sum)
create or replace function clubs.admin_set_courts(k text, pid text, n_indoor int, n_covered int, n_outdoor int) returns jsonb language plpgsql security definer set search_path = clubs, pg_temp as $$
declare m jsonb; g jsonb;
begin
  if not clubs._admin_ok(k) then return jsonb_build_object('ok', false, 'error', 'Not allowed.'); end if;
  if n_indoor is null or n_covered is null or n_outdoor is null
     or least(n_indoor, n_covered, n_outdoor) < 0 or greatest(n_indoor, n_covered, n_outdoor) > 99 then
    return jsonb_build_object('ok', false, 'error', 'Counts must be whole numbers from 0 to 99.');
  end if;
  update clubs.clubs c
     set manual = coalesce(c.manual, '{}'::jsonb) || jsonb_build_object(
           'courts_total', n_indoor + n_covered + n_outdoor, 'courts_indoor', n_indoor, 'courts_covered', n_covered, 'courts_outdoor', n_outdoor)
   where c.place_id = pid
  returning c.manual, jsonb_build_object(
              'total', to_jsonb(c) -> 'courts_total', 'indoor', to_jsonb(c) -> 'courts_indoor',
              'covered', to_jsonb(c) -> 'courts_covered', 'outdoor', to_jsonb(c) -> 'courts_outdoor') into m, g;
  if not found then return jsonb_build_object('ok', false, 'error', 'No club with that id.'); end if;
  return jsonb_build_object('ok', true, 'manual', m, 'google', g);
end $$;

-- drop the hand-set court counts, so the club goes back to what Google and the scraper say (other hand corrections stay)
create or replace function clubs.admin_clear_courts(k text, pid text) returns jsonb language plpgsql security definer set search_path = clubs, pg_temp as $$
begin
  if not clubs._admin_ok(k) then return jsonb_build_object('ok', false, 'error', 'Not allowed.'); end if;
  update clubs.clubs c
     set manual = coalesce(c.manual, '{}'::jsonb) - 'courts_total' - 'courts_indoor' - 'courts_covered' - 'courts_outdoor'
   where c.place_id = pid;
  if not found then return jsonb_build_object('ok', false, 'error', 'No club with that id.'); end if;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function clubs.admin_court_overrides(text) from public;
revoke all on function clubs.admin_set_courts(text, text, int, int, int) from public;
revoke all on function clubs.admin_clear_courts(text, text) from public;
grant execute on function clubs.admin_court_overrides(text) to anon, authenticated;
grant execute on function clubs.admin_set_courts(text, text, int, int, int) to anon, authenticated;
grant execute on function clubs.admin_clear_courts(text, text) to anon, authenticated;
