-- Public submission forms for padelthailand.com/submit/ (Correction and Missing a Club).
-- Run once in the Supabase SQL Editor of the project "padelthailand" (zmnchzfvbflexrlciadn).
--
-- Visitors can only call clubs.submit_form(). They cannot read, change or delete submissions, and nothing a
-- visitor sends goes on the site until you review it here (Table Editor > clubs > submissions) and set status = 'live'
-- or 'rejected'. Only whitelisted fields are stored, every field is length-checked, links must be https, a hidden
-- trap field (website_url) silently drops bots (a correction needs no name or email; a club submission does), and at most 40 submissions per rolling hour are accepted site-wide.

grant usage on schema clubs to anon, authenticated;   -- already true for the registry views; harmless to repeat

create table if not exists clubs.submissions (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  kind        text not null check (kind in ('club', 'correction')),
  status      text not null default 'pending' check (status in ('pending', 'live', 'rejected')),
  data        jsonb not null,
  reviewed_at timestamptz,
  note        text
);
create index if not exists submissions_status_idx on clubs.submissions (status, created_at desc);
alter table clubs.submissions enable row level security;   -- no policies: the public roles cannot touch the table
revoke all on clubs.submissions from anon, authenticated;

create or replace function clubs.submit_form(p jsonb) returns jsonb
language plpgsql security definer set search_path = clubs, pg_temp as $$
declare
  kind text := p ->> 'type';
  specs jsonb;
  s jsonb;
  k text; label text; mx int; req boolean; ty text; v text;
  d jsonb := '{}';
begin
  if p is null or jsonb_typeof(p) <> 'object' then return jsonb_build_object('ok', false, 'error', 'Unknown form.'); end if;
  -- the hidden trap field: pretend it worked, store nothing
  if btrim(coalesce(p ->> 'website_url', '')) <> '' then return jsonb_build_object('ok', true, 'status', 'pending'); end if;

  -- [key, label, max length, required, type]
  if kind = 'club' then
    specs := '[["clubName","Club name",200,true,"text"],["city","City",100,true,"text"],["address","Address",500,false,"text"],
               ["courts","Number of courts",2,false,"int"],["bookingUrl","Booking link",500,false,"url"],["phone","Phone",40,false,"text"],
               ["instagram","Instagram",100,false,"text"],["website","Website",500,false,"url"],["notes","Notes",2000,false,"text"],
               ["contactName","Your name",100,true,"text"],["contactEmail","Your email",200,true,"email"]]'::jsonb;
  elsif kind = 'correction' then
    specs := '[["pageUrl","Page link",500,true,"url"],["whatIsWrong","What is wrong",2000,true,"text"],["correctValue","Correct information",2000,false,"text"],
               ["isOwner","Owner",3,false,"text"],["contactName","Your name",100,false,"text"],["contactEmail","Your email",200,false,"email"]]'::jsonb;
  else
    return jsonb_build_object('ok', false, 'error', 'Unknown form.');
  end if;

  for s in select * from jsonb_array_elements(specs) loop
    k := s ->> 0; label := s ->> 1; mx := (s ->> 2)::int; req := (s ->> 3)::boolean; ty := s ->> 4;
    v := btrim(replace(coalesce(p ->> k, ''), E'\r', ''));
    if v = '' then
      if req then return jsonb_build_object('ok', false, 'error', label || ' is required.', 'field', k); end if;
      continue;
    end if;
    if char_length(v) > mx then return jsonb_build_object('ok', false, 'error', label || ' is too long.', 'field', k); end if;
    if ty = 'url' and v !~* '^https://[^[:space:]]+$' then return jsonb_build_object('ok', false, 'error', label || ' must be a full link starting with https://', 'field', k); end if;
    if ty = 'email' and v !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then return jsonb_build_object('ok', false, 'error', 'Please enter a valid email address.', 'field', k); end if;
    if ty = 'int' and (v !~ '^[0-9]{1,2}$' or v::int < 1 or v::int > 60) then return jsonb_build_object('ok', false, 'error', label || ' must be between 1 and 60.', 'field', k); end if;
    if k = 'isOwner' then v := case when lower(v) = 'yes' then 'Yes' else 'No' end; end if;
    d := d || jsonb_build_object(k, v);
  end loop;

  -- flood guard: 40 submissions per rolling hour, all forms together
  if (select count(*) from clubs.submissions where created_at > now() - interval '1 hour') >= 40 then
    return jsonb_build_object('ok', false, 'error', 'We are getting a lot of submissions right now. Please try again in an hour, or message us on Instagram.');
  end if;

  perform clubs._purge_contacts();   -- from 0002: contact details go 12 months after review
  insert into clubs.submissions (kind, data) values (kind, d);
  return jsonb_build_object('ok', true, 'status', 'pending');
end $$;

revoke all on function clubs.submit_form(jsonb) from public;
grant execute on function clubs.submit_form(jsonb) to anon, authenticated;
