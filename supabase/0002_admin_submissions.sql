-- Lets the owner's unlocked /admin/submissions/ page list and review the submissions (run after 0001_submissions.sql).
--
-- The table stays private to the public roles. Two functions answer only when given the admin key, and only the hash of the key
-- is stored here (the key itself lives in the Keychain, in the ADMIN_API_KEY GitHub secret, and inside the encrypted admin page).
-- Contact details are removed 12 months after a submission is reviewed: the purge runs whenever a submission arrives or the admin
-- page lists them, so no scheduled job is needed.

create table if not exists clubs.admin_secret (
  id       int primary key default 1 check (id = 1),
  key_hash text not null
);
alter table clubs.admin_secret enable row level security;   -- no policies: unreadable by the public roles
revoke all on clubs.admin_secret from anon, authenticated;
insert into clubs.admin_secret (id, key_hash) values (1, 'b0aa2fe2fa4e7e0f4de00cfba1be37dda07c4b187ab054be6972e771de3b43e4')
  on conflict (id) do update set key_hash = excluded.key_hash;

create or replace function clubs._purge_contacts() returns void language sql security definer set search_path = clubs, pg_temp as $$
  update clubs.submissions
     set data = data - 'contactName' - 'contactEmail'
   where reviewed_at is not null and reviewed_at < now() - interval '12 months'
     and (data ? 'contactName' or data ? 'contactEmail');
$$;
revoke all on function clubs._purge_contacts() from public;

create or replace function clubs._admin_ok(k text) returns boolean language sql stable security definer set search_path = clubs, pg_temp as $$
  select exists (select 1 from clubs.admin_secret where id = 1 and key_hash = encode(sha256(convert_to(coalesce(k, ''), 'UTF8')), 'hex'));
$$;
revoke all on function clubs._admin_ok(text) from public;

-- every submission, pending first, newest first
create or replace function clubs.admin_submissions(k text) returns jsonb language plpgsql security definer set search_path = clubs, pg_temp as $$
begin
  if not clubs._admin_ok(k) then return jsonb_build_object('ok', false, 'error', 'Not allowed.'); end if;
  perform clubs._purge_contacts();
  return jsonb_build_object('ok', true, 'rows', coalesce((
    select jsonb_agg(to_jsonb(s) order by (s.status = 'pending') desc, s.created_at desc)
      from (select id, created_at, kind, status, data, reviewed_at, note from clubs.submissions order by created_at desc limit 500) s
  ), '[]'::jsonb));
end $$;

-- mark one submission pending, live or rejected, with an optional note
create or replace function clubs.admin_review(k text, sid uuid, new_status text, new_note text default null) returns jsonb language plpgsql security definer set search_path = clubs, pg_temp as $$
begin
  if not clubs._admin_ok(k) then return jsonb_build_object('ok', false, 'error', 'Not allowed.'); end if;
  if new_status not in ('pending', 'live', 'rejected') then return jsonb_build_object('ok', false, 'error', 'Unknown status.'); end if;
  update clubs.submissions
     set status = new_status,
         reviewed_at = case when new_status = 'pending' then null else now() end,
         note = nullif(btrim(coalesce(new_note, '')), '')
   where id = sid;
  return jsonb_build_object('ok', found);
end $$;

revoke all on function clubs.admin_submissions(text) from public;
revoke all on function clubs.admin_review(text, uuid, text, text) from public;
grant execute on function clubs.admin_submissions(text) to anon, authenticated;
grant execute on function clubs.admin_review(text, uuid, text, text) to anon, authenticated;
