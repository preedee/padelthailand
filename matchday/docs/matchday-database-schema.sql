-- ============================================================================
-- Matchday v1 — Database Schema
-- ============================================================================
-- Supabase PostgreSQL · RLS enforced on every table
-- Status: Draft · 2026-04-18
--
-- Principles (from matchday-build-prompt.md §9.0):
-- 1. Every entity exists in v1 schema, even if v1 doesn't write to it
-- 2. Nullable columns reserve space for v2+ features
-- 3. No destructive migrations needed when v2 ships
-- 4. Sport is a first-class dimension (not an enum constant)
-- 5. User roles are data, not code constants
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

create type gender_type as enum ('male', 'female', 'other', 'prefer_not_to_say');
create type playing_hand as enum ('right', 'left', 'ambidextrous');
create type preferred_side as enum ('drive', 'reverse', 'both');

create type tournament_status as enum (
  'draft',
  'registration_open',
  'registration_closed',
  'published',
  'live',
  'completed',
  'cancelled'
);

create type tournament_format as enum (
  'single_elim',
  'double_elim',      -- v2
  'round_robin',      -- v4
  'groups_knockout'   -- v4
);

create type match_format as enum ('best_of_1', 'best_of_3');

create type last_set_rule as enum ('full_set', 'tiebreak', 'super_tiebreak');

create type match_status as enum (
  'bye',
  'upcoming',
  'in_progress',
  'completed',
  'retired',
  'walkover'
);

create type match_type as enum ('standard', 'third_place');

create type registration_status as enum (
  'pending_partner',
  'confirmed',
  'waitlisted',
  'withdrawn',
  'cancelled'        -- voided by system (e.g., tournament cancelled)
);

create type registration_type as enum ('solo', 'doubles');

create type organizer_application_status as enum (
  'draft',
  'submitted',
  'under_review',
  'approved',
  'rejected'
);

create type draw_status as enum ('draft', 'published');

create type audit_action as enum (
  -- Tournament
  'tournament.created',
  'tournament.published',
  'tournament.registration_closed',
  'tournament.registration_reopened',
  'tournament.draw_published',
  'tournament.draw_unpublished',
  'tournament.started',
  'tournament.completed',
  'tournament.reopened',
  'tournament.cancelled',
  -- Registration
  'registration.solo',
  'registration.doubles_invited',
  'registration.partner_accepted',
  'registration.partner_declined',
  'registration.partner_added',
  'registration.partner_removed',
  'registration.withdrawn',
  'registration.waitlist_promoted',
  'registration.cancelled_by_system',
  -- Draw
  'draw.generated',
  'draw.regenerated',
  'draw.seed_updated',
  'draw.published',
  'draw.unpublished',
  -- Match
  'match.started',
  'match.scored',
  'match.score_edited',
  'match.walkover',
  'match.walkover_undone',
  'match.retired',
  -- Placements
  'placement.auto_derived',
  'placement.overridden',
  -- Admin
  'organizer.application_submitted',
  'organizer.approved',
  'organizer.rejected',
  'organizer.role_revoked',
  -- User
  'user.role_changed'
);

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- --------------------------------------------------------------------------
-- Sport (first-class dimension, not a constant)
-- --------------------------------------------------------------------------
create table sport (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,       -- 'padel', 'tennis', 'pickleball', etc.
  name_key    text not null,              -- i18n key: 'sport.padel'
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Seed padel as the first sport
insert into sport (slug, name_key) values ('padel', 'sport.padel');

-- --------------------------------------------------------------------------
-- User (extends Supabase auth.users)
-- --------------------------------------------------------------------------
create table "user" (
  id                          uuid primary key references auth.users(id) on delete cascade,
  display_name                text not null,
  email                       text not null,
  date_of_birth               date not null,
  gender                      gender_type,             -- optional
  city                        text not null,
  country                     char(2) not null,         -- ISO-3166-1 alpha-2
  nationality                 char(2) not null,         -- ISO-3166-1 alpha-2
  phone                       text,                     -- optional, with country code
  line_id                     text,                     -- optional
  whatsapp_number             text,                     -- optional, with country code
  playing_hand                playing_hand,              -- optional
  preferred_side              preferred_side,            -- optional
  roles                       text[] not null default array['player'],
  avatar_url                  text,
  locale                      text not null default 'en', -- 'th' or 'en'
  -- v2+ reserved columns
  organizer_logo_url          text,                     -- set on TO application approval
  stripe_connect_account_id   text,                     -- v5 payments
  omise_recipient_id          text,                     -- v5 payments
  tps_user_id                 text,                     -- v3 TPS account linking
  -- Timestamps
  deleted_at                  timestamptz,              -- soft delete (PDPA/GDPR)
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index idx_user_email on "user"(email);
create index idx_user_display_name on "user"(display_name);
create index idx_user_roles on "user" using gin(roles);
create index idx_user_country on "user"(country);

-- --------------------------------------------------------------------------
-- Venue (Matchday-native in v1, no TPS dependency)
-- --------------------------------------------------------------------------
create table venue (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  city          text not null,
  country       char(2) not null default 'TH',    -- ISO-3166-1 alpha-2
  address       text,
  court_count   int not null,
  court_names   text[] not null,                   -- e.g., {'Court 1', 'Court 2', 'Court 3'}
  location_lat  double precision,                  -- optional GPS
  location_lng  double precision,
  created_by    uuid not null references "user"(id),
  -- v2+ reserved
  venue_source  text not null default 'matchday',  -- 'matchday' | 'tps_sync' in v2
  tps_club_id   text,                              -- v3 TPS club sync
  photo_urls    text[],                             -- v2+ venue photos
  -- Timestamps
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_venue_country on venue(country);
create index idx_venue_created_by on venue(created_by);

-- --------------------------------------------------------------------------
-- Tournament
-- --------------------------------------------------------------------------
create table tournament (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null,
  sport_id                uuid not null references sport(id) default (
    select id from sport where slug = 'padel'
  ),
  status                  tournament_status not null default 'draft',
  format                  tournament_format not null default 'single_elim',
  match_format            match_format not null default 'best_of_3',
  last_set_rule           last_set_rule not null default 'super_tiebreak',
  has_third_place_match   boolean not null default false,
  venue_id                uuid not null references venue(id),
  organizer_id            uuid not null references "user"(id),
  start_date              date not null,
  end_date                date not null,
  draw_size               int not null,             -- bracket size (power of 2)
  level_band              text,                      -- free-text, e.g. "Intermediate 3.0-4.0"
  entry_info              text,                      -- free-text payment/entry instructions
  registration_open_at    timestamptz,
  registration_close_at   timestamptz,
  -- Scheduling config
  day_start_time          time not null default '09:00',
  day_end_time            time not null default '18:00',
  -- v2+ reserved
  sanctioning_profile_id  uuid,                     -- v7 federation sanctioning
  rating_provider_id      uuid,                     -- v3 rating integration
  entry_fee_amount        bigint,                   -- v5 payments (minor units)
  entry_fee_currency      char(3),                  -- v5 payments (ISO-4217)
  sponsor_data            jsonb,                    -- v4 tournament sponsorship
  -- Timestamps
  published_at            timestamptz,              -- when draw was published
  started_at              timestamptz,              -- when tournament went live
  completed_at            timestamptz,
  cancelled_at            timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index idx_tournament_status on tournament(status);
create index idx_tournament_organizer on tournament(organizer_id);
create index idx_tournament_venue on tournament(venue_id);
create index idx_tournament_sport on tournament(sport_id);
create index idx_tournament_start_date on tournament(start_date);

-- --------------------------------------------------------------------------
-- Round Duration (configurable match duration per round)
-- --------------------------------------------------------------------------
create table round_duration (
  id              uuid primary key default gen_random_uuid(),
  tournament_id   uuid not null references tournament(id) on delete cascade,
  round_number    int not null,         -- 1 = first round, increasing toward final
  round_label     text not null,        -- 'Round 1', 'Quarter-finals', 'Semi-finals', 'Final', '3rd Place'
  duration_minutes int not null,        -- 15, 30, 45, 60, 75, 90, 105, 120
  unique(tournament_id, round_number)
);

-- --------------------------------------------------------------------------
-- Court Availability (blocked time ranges per court)
-- --------------------------------------------------------------------------
create table court_availability (
  id              uuid primary key default gen_random_uuid(),
  tournament_id   uuid not null references tournament(id) on delete cascade,
  court_name      text not null,        -- matches venue.court_names entry
  blocked_date    date not null,
  blocked_start   time not null,
  blocked_end     time not null,
  reason          text,                 -- optional: "Lesson booked"
  created_at      timestamptz not null default now()
);

create index idx_court_avail_tournament on court_availability(tournament_id);

-- --------------------------------------------------------------------------
-- Team (for doubles pairing; solo players also have a team of 1)
-- --------------------------------------------------------------------------
create table team (
  id              uuid primary key default gen_random_uuid(),
  tournament_id   uuid not null references tournament(id) on delete cascade,
  created_at      timestamptz not null default now()
);

create table team_member (
  id        uuid primary key default gen_random_uuid(),
  team_id   uuid not null references team(id) on delete cascade,
  user_id   uuid not null references "user"(id),
  unique(team_id, user_id)
);

create index idx_team_member_user on team_member(user_id);
create index idx_team_tournament on team(tournament_id);

-- --------------------------------------------------------------------------
-- Registration
-- --------------------------------------------------------------------------
create table registration (
  id                uuid primary key default gen_random_uuid(),
  tournament_id     uuid not null references tournament(id) on delete cascade,
  team_id           uuid not null references team(id) on delete cascade,
  user_id           uuid not null references "user"(id),      -- the registering player
  partner_user_id   uuid references "user"(id),                -- doubles partner (null for solo)
  type              registration_type not null,
  status            registration_status not null default 'confirmed',
  waitlist_position int,                                        -- null if not waitlisted
  registered_at     timestamptz not null default now(),
  confirmed_at      timestamptz,
  withdrawn_at      timestamptz,
  -- v5 reserved
  payment_id        uuid,                                       -- v5 payment link
  -- Timestamps
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index idx_registration_user_tournament
  on registration(user_id, tournament_id)
  where status not in ('withdrawn', 'cancelled');
create index idx_registration_tournament on registration(tournament_id);
create index idx_registration_status on registration(tournament_id, status);
create index idx_registration_team on registration(team_id);

-- --------------------------------------------------------------------------
-- Partner Invite
-- --------------------------------------------------------------------------
create table partner_invite (
  id                uuid primary key default gen_random_uuid(),
  registration_id   uuid not null references registration(id) on delete cascade,
  tournament_id     uuid not null references tournament(id),
  inviter_user_id   uuid not null references "user"(id),
  invitee_user_id   uuid not null references "user"(id),
  token             text unique not null,       -- magic link token
  status            text not null default 'pending'
                    check (status in ('pending', 'accepted', 'declined', 'expired')),
  responded_at      timestamptz,
  expires_at        timestamptz not null,       -- = tournament.registration_close_at
  created_at        timestamptz not null default now()
);

create index idx_partner_invite_token on partner_invite(token);
create index idx_partner_invite_invitee on partner_invite(invitee_user_id);

-- --------------------------------------------------------------------------
-- Draw
-- --------------------------------------------------------------------------
create table draw (
  id              uuid primary key default gen_random_uuid(),
  tournament_id   uuid not null references tournament(id) on delete cascade,
  status          draw_status not null default 'draft',
  published_at    timestamptz,
  created_by      uuid not null references "user"(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_draw_tournament on draw(tournament_id);

-- --------------------------------------------------------------------------
-- Draw Seed (persistent, auto-saved per drag)
-- --------------------------------------------------------------------------
create table draw_seed (
  id              uuid primary key default gen_random_uuid(),
  draw_id         uuid not null references draw(id) on delete cascade,
  team_id         uuid not null references team(id),
  seed_position   int not null,
  unique(draw_id, seed_position),
  unique(draw_id, team_id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- Match
-- --------------------------------------------------------------------------
create table match (
  id                uuid primary key default gen_random_uuid(),
  draw_id           uuid not null references draw(id) on delete cascade,
  tournament_id     uuid not null references tournament(id),  -- denormalized for RLS/queries
  round             int not null,           -- 1 = first round, increasing toward final
  position          int not null,           -- position within round, 1-indexed
  match_type        match_type not null default 'standard',
  -- Teams
  team_a_id         uuid references team(id),
  team_b_id         uuid references team(id),   -- null = bye
  team_a_seed       int,
  team_b_seed       int,
  -- Bracket progression
  next_match_id     uuid references match(id),
  next_match_slot   text check (next_match_slot in ('team_a', 'team_b')),
  -- Status
  status            match_status not null default 'upcoming',
  -- Scheduling
  scheduled_court   text,                   -- court name from venue
  scheduled_at      timestamptz,            -- start time
  -- Scores (per-set, used in v1 for TO live scoring)
  set1_team_a       int,
  set1_team_b       int,
  set2_team_a       int,
  set2_team_b       int,
  set3_team_a       int,                    -- nullable: only if match goes to 3 sets
  set3_team_b       int,
  -- Result
  winner_team_id    uuid references team(id),
  retired_team_id   uuid references team(id),  -- which team retired (null if normal completion)
  -- Scoring metadata
  scored_at         timestamptz,
  scored_by         uuid references "user"(id),  -- the TO/admin who entered the score
  -- v2+ reserved
  rating_delta_json jsonb,                  -- v3 rating integration
  -- Timestamps
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_match_draw on match(draw_id);
create index idx_match_tournament on match(tournament_id);
create index idx_match_status on match(tournament_id, status);
create index idx_match_team_a on match(team_a_id);
create index idx_match_team_b on match(team_b_id);
create index idx_match_next on match(next_match_id);
create index idx_match_scheduled on match(tournament_id, scheduled_at);

-- --------------------------------------------------------------------------
-- Placement (auto-derived, TO can override)
-- --------------------------------------------------------------------------
create table placement (
  id              uuid primary key default gen_random_uuid(),
  tournament_id   uuid not null references tournament(id) on delete cascade,
  team_id         uuid not null references team(id),
  rank            int not null,             -- 1 = winner, 2 = finalist, etc.
  is_auto_derived boolean not null default true,  -- false if TO overrode
  unique(tournament_id, rank),
  unique(tournament_id, team_id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_placement_tournament on placement(tournament_id);

-- --------------------------------------------------------------------------
-- Organizer Application
-- --------------------------------------------------------------------------
create table organizer_application (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references "user"(id),
  status          organizer_application_status not null default 'draft',
  form_data       jsonb not null default '{}',  -- all form fields (LINE ID, WhatsApp, etc.)
  submitted_at    timestamptz,
  reviewed_by     uuid references "user"(id),
  reviewed_at     timestamptz,
  review_reason   text,                         -- required when rejected
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_org_app_user on organizer_application(user_id);
create index idx_org_app_status on organizer_application(status);

-- --------------------------------------------------------------------------
-- Audit Log (immutable)
-- --------------------------------------------------------------------------
create table audit_log (
  id              uuid primary key default gen_random_uuid(),
  action          audit_action not null,
  actor_id        uuid not null references "user"(id),
  tournament_id   uuid references tournament(id),
  match_id        uuid references match(id),
  registration_id uuid references registration(id),
  application_id  uuid references organizer_application(id),
  target_user_id  uuid references "user"(id),     -- for role changes
  before_snapshot jsonb,                           -- state before change
  after_snapshot  jsonb,                            -- state after change
  metadata        jsonb,                           -- additional context
  created_at      timestamptz not null default now()
);

-- Audit log is append-only: no UPDATE or DELETE allowed (enforced by RLS)
create index idx_audit_action on audit_log(action);
create index idx_audit_actor on audit_log(actor_id);
create index idx_audit_tournament on audit_log(tournament_id);
create index idx_audit_created on audit_log(created_at desc);

-- ============================================================================
-- V2+ RESERVED TABLES (exist in v1, always empty)
-- ============================================================================

-- --------------------------------------------------------------------------
-- Rating Provider (v3)
-- --------------------------------------------------------------------------
create table rating_provider (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,       -- 'wpr', 'apr', etc.
  name        text not null,
  api_base    text,
  is_active   boolean not null default false,
  config      jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- Player Provider Link (v3 — links Matchday user to external rating provider)
-- --------------------------------------------------------------------------
create table player_provider_link (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references "user"(id),
  provider_id           uuid not null references rating_provider(id),
  provider_player_id    text not null,      -- external ID in the provider's system
  current_rating        jsonb,              -- cached rating snapshot
  last_synced_at        timestamptz,
  unique(user_id, provider_id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- Rating Push (v3 — outbound match result push to rating provider)
-- --------------------------------------------------------------------------
create table rating_push (
  id              uuid primary key default gen_random_uuid(),
  match_id        uuid not null references match(id),
  provider_id     uuid not null references rating_provider(id),
  status          text not null default 'pending'
                  check (status in ('pending', 'sent', 'acknowledged', 'failed')),
  request_payload jsonb,
  response_payload jsonb,
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- Sanctioning (v7 — federation tournament link)
-- --------------------------------------------------------------------------
create table sanctioning (
  id                      uuid primary key default gen_random_uuid(),
  tournament_id           uuid not null references tournament(id),
  federation_name         text not null,
  sanctioning_profile     jsonb not null default '{}',
  approved_at             timestamptz,
  created_at              timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- Payment (v5 — entry fee transactions)
-- --------------------------------------------------------------------------
create table payment (
  id                    uuid primary key default gen_random_uuid(),
  registration_id       uuid not null references registration(id),
  provider_slug         text not null,          -- 'stripe', 'omise', etc.
  provider_txn_id       text,                   -- provider's transaction ID
  amount_minor          bigint not null,         -- minor units (satang, cents)
  currency_code         char(3) not null,        -- ISO-4217
  status                text not null default 'pending'
                        check (status in ('pending', 'completed', 'refunded', 'failed')),
  idempotency_key       uuid not null unique,
  checkout_session_url  text,
  webhook_event_id      text,
  reconciled_at         timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- Score (v2 — richer polymorphic per-sport scoring)
-- --------------------------------------------------------------------------
create table score (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references match(id),
  sport_id    uuid not null references sport(id),
  format      text not null,              -- scoring format identifier
  data        jsonb not null,             -- polymorphic score data per sport/format
  submitted_by uuid not null references "user"(id),
  confirmed   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Auto-update updated_at on row modification
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Apply to all tables with updated_at
create trigger trg_user_updated_at before update on "user"
  for each row execute function update_updated_at();
create trigger trg_venue_updated_at before update on venue
  for each row execute function update_updated_at();
create trigger trg_tournament_updated_at before update on tournament
  for each row execute function update_updated_at();
create trigger trg_registration_updated_at before update on registration
  for each row execute function update_updated_at();
create trigger trg_draw_updated_at before update on draw
  for each row execute function update_updated_at();
create trigger trg_draw_seed_updated_at before update on draw_seed
  for each row execute function update_updated_at();
create trigger trg_match_updated_at before update on match
  for each row execute function update_updated_at();
create trigger trg_placement_updated_at before update on placement
  for each row execute function update_updated_at();
create trigger trg_org_app_updated_at before update on organizer_application
  for each row execute function update_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================
-- Every table has RLS enabled. Policies define who can read/write.
-- auth.uid() = the current Supabase Auth user's ID
-- ============================================================================

-- Helper: check if user has a specific role
create or replace function user_has_role(role_name text)
returns boolean as $$
  select exists (
    select 1 from "user"
    where id = auth.uid()
    and role_name = any(roles)
  );
$$ language sql security definer stable;

-- Helper: check if user is the tournament organizer
create or replace function is_tournament_organizer(t_id uuid)
returns boolean as $$
  select exists (
    select 1 from tournament
    where id = t_id
    and organizer_id = auth.uid()
  );
$$ language sql security definer stable;

-- ---- User ----
alter table "user" enable row level security;

create policy "Users can read own profile"
  on "user" for select using (id = auth.uid());

create policy "Users can read other users basic info"
  on "user" for select using (true);  -- public profiles for partner search

create policy "Users can update own profile"
  on "user" for update using (id = auth.uid());

create policy "Users can insert own profile"
  on "user" for insert with check (id = auth.uid());

create policy "Admins can read all users"
  on "user" for select using (user_has_role('admin'));

create policy "Admins can update any user"
  on "user" for update using (user_has_role('admin'));

-- ---- Venue ----
alter table venue enable row level security;

create policy "Anyone can read venues"
  on venue for select using (true);

create policy "Organizers can create venues"
  on venue for insert with check (user_has_role('organizer'));

create policy "Venue creator can update"
  on venue for update using (created_by = auth.uid());

create policy "Admins can manage venues"
  on venue for all using (user_has_role('admin'));

-- ---- Tournament ----
alter table tournament enable row level security;

create policy "Public tournaments are readable"
  on tournament for select using (
    status != 'draft' or organizer_id = auth.uid() or user_has_role('admin')
  );

create policy "Organizers can create tournaments"
  on tournament for insert with check (
    user_has_role('organizer') and organizer_id = auth.uid()
  );

create policy "TO can update own tournament"
  on tournament for update using (organizer_id = auth.uid());

create policy "Admins can manage any tournament"
  on tournament for all using (user_has_role('admin'));

-- ---- Round Duration ----
alter table round_duration enable row level security;

create policy "Anyone can read round durations"
  on round_duration for select using (true);

create policy "TO can manage round durations"
  on round_duration for all using (is_tournament_organizer(tournament_id));

create policy "Admins can manage round durations"
  on round_duration for all using (user_has_role('admin'));

-- ---- Court Availability ----
alter table court_availability enable row level security;

create policy "Anyone can read court availability"
  on court_availability for select using (true);

create policy "TO can manage court availability"
  on court_availability for all using (is_tournament_organizer(tournament_id));

create policy "Admins can manage court availability"
  on court_availability for all using (user_has_role('admin'));

-- ---- Team ----
alter table team enable row level security;

create policy "Anyone can read teams"
  on team for select using (true);

create policy "Authenticated users can create teams"
  on team for insert with check (auth.uid() is not null);

alter table team_member enable row level security;

create policy "Anyone can read team members"
  on team_member for select using (true);

create policy "Authenticated users can manage team members"
  on team_member for all using (auth.uid() is not null);

-- ---- Registration ----
alter table registration enable row level security;

create policy "Players can read own registrations"
  on registration for select using (user_id = auth.uid() or partner_user_id = auth.uid());

create policy "TO can read tournament registrations"
  on registration for select using (is_tournament_organizer(tournament_id));

create policy "Anyone can read confirmed registrations count"
  on registration for select using (true);  -- needed for public registration counter

create policy "Authenticated users can register"
  on registration for insert with check (auth.uid() is not null and user_id = auth.uid());

create policy "Players can update own registration"
  on registration for update using (user_id = auth.uid());

create policy "TO can manage registrations"
  on registration for all using (is_tournament_organizer(tournament_id));

create policy "Admins can manage registrations"
  on registration for all using (user_has_role('admin'));

-- ---- Partner Invite ----
alter table partner_invite enable row level security;

create policy "Inviter and invitee can read"
  on partner_invite for select using (
    inviter_user_id = auth.uid() or invitee_user_id = auth.uid()
  );

create policy "Authenticated users can create invites"
  on partner_invite for insert with check (inviter_user_id = auth.uid());

create policy "Invitee can respond"
  on partner_invite for update using (invitee_user_id = auth.uid());

-- ---- Draw ----
alter table draw enable row level security;

create policy "Published draws are public"
  on draw for select using (
    status = 'published' or is_tournament_organizer(tournament_id) or user_has_role('admin')
  );

create policy "TO can manage draws"
  on draw for all using (is_tournament_organizer(tournament_id));

create policy "Admins can manage draws"
  on draw for all using (user_has_role('admin'));

-- ---- Draw Seed ----
alter table draw_seed enable row level security;

create policy "Anyone can read published draw seeds"
  on draw_seed for select using (true);  -- seeds are public once draw exists

create policy "TO can manage draw seeds"
  on draw_seed for all using (
    exists (select 1 from draw where draw.id = draw_seed.draw_id
            and is_tournament_organizer(draw.tournament_id))
  );

create policy "Admins can manage draw seeds"
  on draw_seed for all using (user_has_role('admin'));

-- ---- Match ----
alter table match enable row level security;

create policy "Anyone can read matches"
  on match for select using (true);  -- brackets are public

create policy "TO can manage matches"
  on match for all using (is_tournament_organizer(tournament_id));

create policy "Admins can manage matches"
  on match for all using (user_has_role('admin'));

-- ---- Placement ----
alter table placement enable row level security;

create policy "Anyone can read placements"
  on placement for select using (true);

create policy "TO can manage placements"
  on placement for all using (is_tournament_organizer(tournament_id));

create policy "Admins can manage placements"
  on placement for all using (user_has_role('admin'));

-- ---- Organizer Application ----
alter table organizer_application enable row level security;

create policy "Applicant can read own applications"
  on organizer_application for select using (user_id = auth.uid());

create policy "Applicant can create application"
  on organizer_application for insert with check (user_id = auth.uid());

create policy "Applicant can update draft application"
  on organizer_application for update using (user_id = auth.uid() and status = 'draft');

create policy "Admins can read all applications"
  on organizer_application for select using (user_has_role('admin'));

create policy "Admins can update applications"
  on organizer_application for update using (user_has_role('admin'));

-- ---- Audit Log ----
alter table audit_log enable row level security;

-- Audit log: append-only. No updates, no deletes.
create policy "Authenticated users can insert audit logs"
  on audit_log for insert with check (auth.uid() is not null);

create policy "Admins can read all audit logs"
  on audit_log for select using (user_has_role('admin'));

create policy "TO can read own tournament audit logs"
  on audit_log for select using (
    tournament_id is not null and is_tournament_organizer(tournament_id)
  );

-- No UPDATE or DELETE policies on audit_log (immutable)

-- ---- V2+ Reserved Tables (empty, minimal RLS) ----
alter table rating_provider enable row level security;
create policy "Anyone can read rating providers" on rating_provider for select using (true);

alter table player_provider_link enable row level security;
create policy "Users can read own links" on player_provider_link for select using (user_id = auth.uid());

alter table rating_push enable row level security;
create policy "Admins can manage rating pushes" on rating_push for all using (user_has_role('admin'));

alter table sanctioning enable row level security;
create policy "Anyone can read sanctioning" on sanctioning for select using (true);

alter table payment enable row level security;
create policy "Users can read own payments" on payment for select using (
  exists (select 1 from registration where registration.id = payment.registration_id and registration.user_id = auth.uid())
);

alter table score enable row level security;
create policy "Anyone can read scores" on score for select using (true);

-- ============================================================================
-- END
-- ============================================================================
