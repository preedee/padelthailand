# Matchday v0.4.0 — "Registration" Build Plan

> **Status:** DRAFT v3 — D-decisions answered 2026-04-28. Ready for execution gate.
> **D-decision answers:** 14 of 15 = recommended defaults. **1 override:** D12 vanity URLs at `/tournaments/[organizer-slug]/[tournament-slug]`.
> **DRAFT v2:** stress-tested by Plan + Architect agents; 18 findings applied (6 critical, 12 important); 7 nits documented in change-log.
> **Predecessor:** v0.3.0 Organizer + Venues + Admin (code-complete 2026-04-28; 39 W/B commits + auto-types regen on main; ship-blocked on Pap-side E2E walkthrough only).
> **DoD:** Doubles team registers via partner-invite token; waitlist promotion email fires when a slot opens.
> **External-prereq risk:** Low. v0.4 has no new Pap-prereqs beyond what v0.3 already requires (Resend activation for real email send; otherwise dev-fallback console-logs the send). v0.4 is executable independently of v0.3 ship status — migrations are forward-only and don't change v0.3 surfaces.

---

## 1 · Scope

In-scope (per `Plans/version-roadmap.md` v0.4.0 + `matchday-v1-detailed-specs.md` §3 Registration Flows + `matchday-build-prompt.md` §7.1 Player features):

1. **Tournament lifecycle transitions** — `draft → registration_open → registration_closed`. TO manually flips on `/organizer/tournaments/[id]` (Open Registration / Close Registration buttons). Auto-close fires when `registration_close_at < now()` via cron Edge Function (D1).
2. **Solo registration** — register-solo button on player tournament detail page. Status `confirmed` if capacity available, else `waitlisted` (FCFS). Auto-create `team` row + 1 `team_member` row.
3. **Doubles registration** — partner search modal (debounced 300ms, rate-limited 30/min per IP per spec §3.3). Search by display_name (D2). Invite send via email magic-link → registration status `pending_partner` until invitee responds.
4. **`/invite/[token]` accept/decline page** — magic-link landing. Authenticated users only (sign-in flow if not). Accept → both registrations flip to `confirmed` atomically (or `waitlisted` if capacity filled in the meantime). Decline → registration deleted, inviter notified by email.
5. **Add/remove partner while registration_open** — solo player can convert to doubles (search + invite); doubles player can remove partner (other player's registration voided + notified, registration converts back to solo).
6. **Withdrawal** — only allowed during `registration_open`. Solo: registration voided. Doubles: BOTH players' registrations voided, partner notified. Auto-promotion: next FCFS waitlisted player/pair auto-promoted, promotion email sent.
7. **TO registrations tab** — list confirmed + waitlisted + pending_partner + withdrawn on `/organizer/tournaments/[id]`. Manual waitlist promotion (out-of-FCFS). TO can withdraw any registration on player's behalf (audit-logged).
8. **Minimal player tournament detail page** — `/[locale]/tournaments/[id]` — just enough to render registration controls. Bracket view + roster + spectator UI defer to v0.5/v0.8.
9. **Cross-cutting DoD** — a11y, Sentry, audit log emission, i18n (TH+EN).

Out-of-scope (defer to later versions per roadmap):
- Bracket sizing + manual drag-drop seeding + bye placement → v0.5
- Public bracket view at `/tournaments/[id]` (richer page) → v0.5
- Live scoring + match state machine + retirement/walkover → v0.6
- Match scheduling (court × time grid, auto-schedule) → v0.7
- Spectator mode + realtime bracket → v0.8
- Placements auto-derive + cancellation flow + OG previews → v0.9
- Stripe Connect / Omise payment-processor onboarding → v2+
- Email-per-recipient rate-limiting beyond per-actor (cross-actor spam protection) → v2+ ops concern
- Partner search by email or fuzzy match → v0.4.x patch if D2 review wants tightening
- TO bulk-promote-waitlist / bulk-withdraw → v2+
- Per-tournament registration approval (TO manually approves each) → v2+

---

## 2 · External Prerequisites — gate questions for Pap

### Real-world account/process work

| # | Prereq | Risk | Required for | Action |
|---|--------|------|--------------|--------|
| P1 | **Resend account activation** | Carried from v0.3 — same blocker | Real registration emails (confirmed, waitlisted, partner_invite, etc.). Without it, send-functions log to console (dev-fallback). | Carry over; nothing new for v0.4. |
| P2 | **`SUPABASE_ACCESS_TOKEN` repo secret** | Already set during v0.3 | B17-equivalent types regen + prod migration push | No new action — v0.3 deploy.yml self-heals types on every push. |
| P3 | **Cron scheduling** | Minutes — Supabase cron extension | D1 auto-close-on-registration_close_at | Enable `pg_cron` extension in Supabase Studio; schedule the close-tournament Edge Function. |

### Decisions needed from Pap (asked one at a time at the gate)

| # | Decision | Options |
|---|----------|---------|
| D1 | **Auto-close mechanism for `registration_open → registration_closed`** | TO-manual only (simplest; tournaments can over-stay open if TO forgets) · Cron Edge Function (every 5 min checks `registration_close_at < now()` and flips) · DB trigger on tournament UPDATE (fires on any access — not idempotent) · Hybrid: cron + TO manual override |
| D2 | **Partner search match algorithm** | Display name prefix (case-insensitive) — privacy-friendly · Display name OR exact email match — leaks email existence · Fuzzy display name (trigram / pg_similarity) — slightly more friendly UX, more DB cost · D-decision: tradeoffs |
| D3 | **Invite token shape** | UUID v4 (32 chars; not unguessable but DB unique constrains) · `crypto.randomUUID()` (same as v4 in Deno, but explicit) · Cryptographic 22-byte base64 (~30 chars; unguessable; matches Supabase Auth tokens) · Signed JWT (overkill for v0.4) |
| D4 | **Invite expiry behavior** | Always = `tournament.registration_close_at` (per canonical schema, but null if TO hasn't set close_at) · 24h fallback if close_at unset · 7-day fallback if close_at unset · D-decision |
| D5 | **Email-per-actor rate limit** | 3/h same as v0.3 welcome (carried over) · 10/h (more permissive for partner_invite spam) · None (rely on B14 idempotency only) |
| D6 | **Withdraw cooldown** | None (re-register immediately allowed) · 24h cooldown (prevent spam-toggle) · TO discretion (TO can lock per tournament) |
| D7 | **TO manual waitlist promotion authorization** | TO only (own tournament) · TO + admin · TO + admin + delegated co-organizer (v2+) |
| D8 | **Pair waitlist position** | Single position (pair counted as one entry) · Two positions (each player gets one) · D-decision: spec says "promoted together" but doesn't specify position counting |
| D9 | **Solo-to-doubles conversion** | Allowed always while registration_open (per spec §3.5) · Only allowed before first match (= same as registration_open in v0.4) · Only allowed pre-publish · D-decision: confirm spec mapping |
| D10 | **Tournament detail page minimal scope** | Just header + register button (smallest; bracket page rebuild in v0.5) · Header + register + countdown to registration_close_at · Header + register + organizer name + venue + date + draw_size · Header + register + roster (current registrations preview) — leaks registered list but useful for partner-search context |
| D11 | **Confirmation email content per-locale** | Match v0.3 organizer-email pattern (en + th-placeholder) · Real translated TH from native-speaker review (carried obligation) · Email-only EN initially, TH in v0.4.x patch |
| D12 | **Tournament detail URL slug vs ID** | `/[locale]/tournaments/[uuid]` (current design — UUID not pretty) · `/[locale]/tournaments/[organizer-slug]/[tournament-slug]` (vanity URL like organizer profile in v0.3) · D-decision: vanity URLs make better OG previews for v0.9 sharing |
| D13 | **Registration row model — one row per pair vs two** (post-stress-test F01) | **Two-row mirror (recommended)** — each player has their own registration row pointing to the same `team_id`. Withdrawal voids both rows. RLS predicate is simply `user_id = auth.uid()`. Spec §3.6 "BOTH players' registrations voided" reads cleanly. · One row per pair with `partner_user_id` (canonical schema shape) — RLS gets `user_id = auth.uid() OR partner_user_id = auth.uid()`. Less duplication but more complex RLS. |
| D14 | **Edge Function transactionality** (post-stress-test F11) | **Postgres rpc functions (recommended)** — wrap each multi-step pipeline (register-solo, respond-partner-invite, withdraw-registration) as a Postgres function called via `supabase.rpc(...)`. The Edge Function becomes a thin auth + rate-limit + email-trigger wrapper around the SQL function. Email send remains best-effort post-commit. · Multi-statement supabase-js transactions — works with PgBouncer session-mode but Supabase defaults to transaction-mode pooling; risk of partial state if Edge Function crashes mid-flow. |
| D15 | **`audit_log` typed-FK migration in v0.4** (post-stress-test A07) | **Take it now (recommended)** — migrate `audit_log` to canonical typed-FK shape (`tournament_id`, `registration_id`, `application_id`, `target_user_id` cols + `audit_action` enum) as part of B22. Backfill v0.3's existing rows (~hundreds, manageable). Update v0.3 emitters in `_shared/audit.ts` once. v0.5+ has zero further audit-shape debt. · Defer to v0.5 — keep polymorphic in v0.4. Each version that defers compounds the migration cost. |

**Recommended defaults** (Pap can override):
- D1: Hybrid — cron Edge Function (5-min interval) + TO manual override on the management hub. Cron belt-and-suspenders.
- D2: Display name prefix only. Privacy-safe; matches spec §3.3 "type name/email" where the email part is search-input UX, not search-target.
- D3: Cryptographic 22-byte base64 (matches Supabase Auth pattern; truly unguessable).
- D4: Fallback to 7 days if `registration_close_at` is null.
- D5: 3/h (carry over v0.3 pattern; rely on B14 idempotency for retries).
- D6: None (lowest friction; spec doesn't mandate).
- D7: TO + admin (admin can mop up if TO is unresponsive).
- D8: Single position per pair (cleanest for the FCFS queue; pair atomically promoted).
- D9: Allowed always while registration_open per spec §3.5.
- D10: Minimal — header + register + countdown. Defers richer page to v0.5.
- D11: Match v0.3 pattern (en + th-placeholder; carries forward the native-speaker review TODO).
- D12: **VANITY URL** (Pap override 2026-04-28) — `/tournaments/[organizer-slug]/[tournament-slug]`. Adds Phase A scope: `tournament.slug text` column + unique index on `(organizer_id, lower(slug))` + `check-tournament-slug-availability` Edge Function (mirror of B14a check-slug-availability) + tournament create form gains a slug input. UUID-based URL `/tournaments/[id]` kept as a redirect-to-slug for backward-compat / direct links. **Reserved slug list** (per organizer): `new`, `edit`, `register`, `withdraw`, `invite`, `cancel`. Better OG previews for v0.9 sharing.
- D13: **Two-row mirror** per F01 — simpler RLS (`user_id = auth.uid()`) + matches spec §3.6 wording.
- D14: **Postgres rpc functions** per F11 — Edge Function becomes thin auth+email wrapper around the SQL function.
- D15: **Take typed-FK audit migration in v0.4** per A07 — clean v0.5+ audit surface, ~hundreds of v0.3 rows to backfill.

---

## 3 · Phased commit plan

Continuing v0.3's commit-numbered convention. Sequencing: Phase A backend → Phase B web (parallel-blitz where possible) → Phase C DoD ship.

### Phase A — Backend schema + status transitions + email + Edge Functions (matchday-backend) — gates Phase B

| Commit | Description |
|---|---|
| **B19** (`migrations/2026MMDD0XX_team_and_team_member.sql`) | 2 tables (`team`, `team_member`) + 1 unique constraint per canonical schema. RLS: public SELECT (so tournament detail can render rosters in v0.5+); INSERT/UPDATE/DELETE only via service role (Edge Functions in B25-B31). **F09 reconcile:** the canonical schema's "Authenticated users can create teams" policy is REPLACED by service-role-only INSERT here — deliberately tightening from canonical because v0.4 mediates all team creation through Edge Functions. Documented in B19 commit message. Indexes per canonical. ON DELETE CASCADE preserved (team→tournament). |
| **B20** ✅ shipped `b8f9978` | `registration_status` (5 values: pending_partner, confirmed, waitlisted, withdrawn, cancelled) + `registration_type` enums; `registration` table per canonical schema. **D13 override:** TWO-ROW MIRROR model — when a doubles registration is created, INSERT two registration rows (inviter + invitee) both pointing to the same `team_id`. The canonical schema's `partner_user_id` column is kept on each row for symmetric back-reference (each row's partner_user_id points to the OTHER player's row). Partial unique index `(user_id, tournament_id) WHERE status NOT IN ('withdrawn', 'cancelled')` works correctly with the two-row model — each user has at most one active registration per tournament. **F07 amendment:** `user_id`, `partner_user_id` FKs gain `ON DELETE CASCADE` so account-deletion mid-pending-invite cleans up orphaned registrations. RLS: own-registration SELECT (`user_id = auth.uid()`) — simpler than the OR partner_user_id since the two-row model gives each player their own row; admin SELECT-all; tournament-organizer SELECT for own tournament's registrations via `is_tournament_organizer(t_id)` v0.3 B9 helper; INSERT/UPDATE/DELETE via Edge Functions (service role) only. **A05 documentation:** `withdrawn` = player-initiated (B28); `cancelled` = system-initiated (tournament cancellation, account deletion fallback). Both terminal — partial index excludes both. |
| **B21** ✅ shipped `964a422` | `partner_invite` table + token unique index per canonical. **D3 token shape:** cryptographic 22-byte base64 (132 bits entropy). **F05 RLS amendment:** invitee SELECT requires authenticated `auth.uid() = invitee_user_id`; inviter SELECT own (`auth.uid() = inviter_user_id`); admin SELECT-all. NO anon read — magic-link flow requires sign-in first per spec §3.4. INSERT/UPDATE via Edge Functions only. **F07 amendment:** `inviter_user_id`, `invitee_user_id` FKs ON DELETE CASCADE. |
| **B22** ✅ shipped `db1ecdf+6c96cf5+53e0e3d+c17a18c` | **D15 audit_log typed-FK migration.** ALTER TABLE audit_log adds typed FK columns (`tournament_id`, `registration_id`, `application_id`, `target_user_id` already exist polymorphically; this commit migrates them to typed FKs WITH ON DELETE SET NULL). Convert `action` column from text to `audit_action` enum (canonical schema lines 75-120). Backfill all v0.3 audit rows: `target_type='organizer_application'` rows get `application_id` set; `target_type='tournament'` rows get `tournament_id` set; `target_type='venue'` is left polymorphic (canonical schema doesn't have a `venue_id` FK — venue audit-row writers will continue using `target_type='venue', target_id=venue.id`). Update v0.3 emitters in `_shared/audit.ts` to write typed FKs alongside polymorphic for backward compat during the migration window. **B22 emitter additions reconciled to canonical enum (F02/A08):** `registration.solo`, `registration.doubles_invited`, `registration.partner_added`, `registration.partner_removed`, `registration.waitlist_promoted`, `registration.cancelled_by_system`, `tournament.registration_opened`, `tournament.registration_closed`, `tournament.registration_reopened`. (Plan v1's invented names like `registration.confirmed` / `registration.partner_invited` REMOVED — use canonical names.) |
| **B23** ✅ shipped `9d75a96` | 7 new bilingual email templates (`functions/_shared/templates/`): `registration_confirmed.ts`, `registration_waitlisted.ts`, `waitlist_promoted.ts`, `partner_invite.ts`, `partner_accepted.ts`, `partner_declined.ts`, `registration_withdrawn.ts`. TH+EN bilingual mirror v0.3 B13 pattern. **Partner_invite template includes the magic-link URL** (`${SITE_BASE_URL}/${locale}/invite/${token}`). |
| **B24** ✅ shipped `83386f7` | `send-registration-email` Edge Function — single function with `kind: 'confirmed' \| 'waitlisted' \| 'waitlist_promoted' \| 'partner_invite' \| 'partner_accepted' \| 'partner_declined' \| 'withdrawn'` discriminator. JWT-auth + DB-unique-constraint idempotency + 3/h rate limit per actor. Mirrors v0.3 B14 pattern. |
| **B25** ✅ shipped `8aa1640+38201d2+84f25c0` | **D14 amendment:** Postgres RPC function `public.register_solo_rpc(p_tournament_id uuid)` does the multi-step pipeline atomically (single PG txn): SELECT FOR UPDATE on tournament → status check → partial-unique-index conflict check → INSERT team + team_member + registration (status='confirmed' if capacity OR 'waitlisted' with waitlist_position = next available). Returns `{registration_id, status, waitlist_position}`. The `register-solo` Edge Function is now a thin wrapper: JWT-auth, rate-limit, call rpc, post-commit best-effort `send-registration-email kind=confirmed\|waitlisted` invoke. Idempotency `${reg_id}:${kind}:v1`. |
| **B26** ✅ shipped `2a503e3+4286d9f+7b993b6+3597168` | **D14 amendment:** Postgres RPC `public.register_doubles_invite_rpc(p_tournament_id, p_invitee_user_id)` does the txn: validate tournament + status + invitee exists. **F06 amendment:** validate `p_invitee_user_id != auth.uid()` (no self-invite); validate no existing non-expired pending invite for `(inviter, invitee, tournament)` (no spam). Validate invitee not already registered. INSERT team + team_member (inviter). INSERT registration (inviter row, status='pending_partner', team_id, partner_user_id=invitee_user_id). INSERT partner_invite (token = base64(crypto.randomBytes(22)), expires_at = COALESCE(registration_close_at, now() + interval '7 days') per D4). Returns `{registration_id, partner_invite_id, token}`. Edge Function `register-doubles-invite` wraps with JWT-auth + rate-limit + invokes `send-registration-email kind=doubles_invited` to invitee with magic-link URL. |
| **B19a** ✅ shipped `b01536a` | **D12 override — tournament slug.** ALTER TABLE public.tournament ADD COLUMN slug text. Add unique partial index on `(organizer_id, lower(slug)) WHERE slug IS NOT NULL`. Create SECURITY DEFINER function `set_tournament_slug(p_tournament_id uuid, p_candidate_slug text)` mirroring v0.3 B8a's `set_user_slug` pattern: collision-loop with random-4 suffix, max 5 retries; routes around B10's self-elevation trigger if applicable. Reserved-slug blocklist enforced server-side: `new edit register withdraw invite cancel`. **Backfill not required** — v0.3 ships with no published tournaments; v0.4 tournaments get slugs at create-time. |
| **B14b** ✅ shipped `05830ad` | **D12 override — `check-tournament-slug-availability` Edge Function.** Mirror of v0.3 B14a `check-slug-availability` but scoped to a tournament's organizer. body params: `?slug=<candidate>&organizer_id=<uuid>` (organizer_id pulled server-side from auth context if caller is the organizer). Returns `{available: bool, reason?: 'taken' \| 'reserved' \| 'invalid_format'}`. Same regex + reserved blocklist + 60/min/IP rate limit. Used by W27 tournament create form for real-time availability check. |
| **B26b** ✅ shipped `ce365ae` | **F10 amendment:** `search-users-by-display-name` Edge Function — auth required, rate-limited 30/min/IP per spec §3.3. body: `{q: string, tournament_id?: uuid}`. Pipeline: validate q.length ≥ 2; ILIKE prefix match on `public.user.display_name`; LIMIT 10. Optional `tournament_id` filters out users already registered for that tournament (server-side join, prevents F01-style "Partner is already registered" UX hit). Returns `{matches: [{id, display_name, avatar_url}]}` — explicitly NO email, NO phone, NO LINE ID. **D2 default applied:** display_name prefix only (case-insensitive). |
| **B27** ✅ shipped `958eb5a` | **D14 amendment + D13 two-row mirror amendment:** Postgres RPC `public.respond_partner_invite_rpc(p_token, p_action)` (action = 'accept' or 'decline'). Pipeline (single txn): SELECT partner_invite by token → validate `auth.uid() = invitee_user_id` + not expired + status='pending'. **If accept:** SELECT FOR UPDATE on tournament → check capacity (count confirmed registrations) → INSERT second registration row (invitee row, partner_user_id=inviter_user_id, team_id same as inviter's team, status set atomically to 'confirmed' OR 'waitlisted' based on capacity at this moment) → UPDATE inviter's row to match the new status → INSERT second team_member → emit `registration.partner_added` audit → mark invite status='accepted'. **If decline:** DELETE inviter's registration row + team + team_members in same txn → emit `registration.cancelled_by_system` audit → mark invite status='declined'. Edge Function `respond-partner-invite` wraps; on accept invokes email kind=partner_accepted to BOTH; on decline invokes email kind=partner_declined to inviter. |
| **B28** ✅ shipped `a99a6e8` | **D14 + D13 + A06 amendment:** Postgres RPC `public.withdraw_registration_rpc(p_registration_id)`. Pipeline (single txn): **F03 amendment:** validate tournament status='registration_open' (else raise; player cannot withdraw post-registration_closed in v0.4 — that's v0.5+ scope). Validate caller is `user_id` OR `partner_user_id` OR has admin role. Identify the team_id and find paired row (D13 two-row model: WHERE team_id = X). UPDATE both registration rows to status='withdrawn' (DELETE rows would lose audit trail; UPDATE keeps history per spec §3.6). Compute `vacated_slots`: 1 if was solo, 1 (slot per team, since pair occupied 1 team-slot) if was doubles. **A06 pair-aware promotion SQL:** `WITH next_promotable AS (SELECT registration_id, type FROM registration r WHERE r.tournament_id = X AND r.status = 'waitlisted' ORDER BY waitlist_position ASC FOR UPDATE SKIP LOCKED LIMIT 1)`. Promote whatever's at the head: solo or doubles pair both occupy 1 team-slot in v0.4, so head-promotion is correct. (If v0.5 introduces variable-team-size formats, this needs revisiting.) UPDATE promoted rows to status='confirmed'; emit `registration.waitlist_promoted` audit. Edge Function wraps; invokes email kind=withdrawn to all withdrawn players, kind=waitlist_promoted to promoted player(s). |
| **B29** ✅ shipped `1240826` | `promote-waitlist-manual` Edge Function — TO/admin action. body: `{registration_id}` (the waitlisted reg to promote). JWT-auth (must be tournament organizer or admin). Pipeline: SELECT FOR UPDATE on tournament + reg → UPDATE reg to confirmed → emit audit `registration.promoted_from_waitlist` → invoke email kind=waitlist_promoted. **No capacity check in this path** — TO override is intentional. |
| **B30** ✅ shipped `0c415b8` | `add-partner-to-solo` Edge Function — body: `{registration_id, partner_user_id}`. JWT-auth (caller is the existing registering player). Validates registration is solo + still in `registration_open`. Reuses B26's partner-invite logic: INSERT partner_invite + UPDATE registration.type='doubles' + status='pending_partner'. Invitee receives the same partner_invite email. |
| **B31** ✅ shipped `3d73734` | `remove-partner-from-doubles` Edge Function — body: `{registration_id}`. JWT-auth (caller is the registering player OR partner OR admin). Validates registration is doubles + still `registration_open`. Pipeline: DELETE the partner's team_member row → DELETE the partner_user_id from registration (or void via withdrawn-by-system if the partner had separately confirmed; spec §3.5 says "partner's registration voided") → emit audit + email kind=withdrawn to partner. Registration converts back to solo (status stays confirmed if was confirmed; back to pending_partner not applicable since pair-was-confirmed). |
| **B32** ✅ shipped `36c8a8f` | `tournament-status-transition` server action / Edge Function for TO — body: `{tournament_id, target_status: 'registration_open' \| 'registration_closed'}`. JWT-auth (TO of own tournament + admin). Validates allowed transitions only (`draft → registration_open`; `registration_open → registration_closed`). **F08 amendment:** when transitioning `→ registration_closed`, also invoke B33b's pending-invite sweep RPC in the same txn before the status flip. Same audit + email cascade as B33's auto-close path. UPDATE status; emit audit `tournament.registration_opened` or `tournament.registration_closed`. |
| **B33** ✅ shipped `0438efc` | `auto-close-tournaments` cron Edge Function (D1 hybrid). Runs every 5 min via `pg_cron`. **A03 amendment:** wrap body in Postgres advisory lock `pg_try_advisory_lock(hashtext('auto-close-tournaments'))` — return early if not acquired (prevents overlap when prior tick is still running). Per-row UPDATE gated on `WHERE status='registration_open'` (idempotent re-read absorbs leaked overlap). Pipeline: SELECT tournaments WHERE status='registration_open' AND registration_close_at < now() → for each: invoke B33b sweep (pending-invite cleanup) → UPDATE status='registration_closed' → emit `tournament.registration_closed` audit. |
| **B33b** ✅ shipped `e66367c` | **F04 amendment:** `sweep_pending_partner_invites_rpc(p_tournament_id)` Postgres function (callable from B33 + B32). Per spec §3.8 "Registration closes while invite pending → Invite expires, registration rolled back, inviter notified": for each `partner_invite` with `status='pending'` AND `tournament_id = p_tournament_id`: UPDATE partner_invite status='expired'; UPDATE the inviter's pending_partner registration to status='cancelled' (system-initiated; A05 semantic); emit `registration.cancelled_by_system` audit; collect inviter user_ids for email-fanout. Returns array of inviter_ids to email. The CALLER (B33 or B32 Edge Function) iterates and invokes `send-registration-email kind=cancelled_by_system_invite_expired` to each. |
| **B33c** ✅ shipped `0645c9f` | **A04 amendment — tournament-cancel email path.** v0.4 introduces registrations whose cascade-deletion would silently drop player data. Two-part fix: (1) v0.3 W28b cancel action's RLS is tightened so it REFUSES to cancel a tournament where any registration with status NOT IN ('withdrawn','cancelled') exists. (2) For TO/admin to actually cancel a tournament with active registrations, add `cancel_tournament_with_registrations_rpc(p_tournament_id, p_reason)`: in a single txn, UPDATE all active registrations to status='cancelled' (audit `registration.cancelled_by_system`), UPDATE tournament status='cancelled' + cancelled_at=now(). Edge Function wraps; invokes `send-registration-email kind=cancelled_by_system_tournament_cancelled` to every affected player with the reason. **NO PII** — email contains tournament name + reason text + organizer display_name only. v0.3 W28b updates: refuse-with-helpful-error if registrations exist; W28b confirm-dialog now shows "This tournament has N active registrations. Cancel anyway? All players will be notified." with the override flow invoking B33c instead. |
| **B34** ✅ shipped `9fdf7a2` | RLS regression tests for the 3 new tables: own SELECT, partner SELECT, admin SELECT-all, TO-of-tournament SELECT for that tournament's registrations; INSERT only via service role; partial unique index prevents double-registration; tournament-status RLS prevents player INSERT to non-`registration_open` tournament. **Also:** Edge Function happy-path smoke tests (register-solo confirmed; register-solo waitlist; doubles invite + accept + verify both confirmed). |
| **B35** ✅ shipped `92b89f4 (auto-regen)` | `types/database.ts` regenerated by deploy workflow's auto-step (no manual Phase A exit gate; B17-equivalent automatic). Verified by next push triggering deploy + auto-types-commit. |

### Phase B — Web (matchday-web) — depends on Phase A types regen

| Commit | Description |
|---|---|
| **W32** | `bun run sync-types` post-Phase-A. Verify `Registration`, `PartnerInvite`, `Team`, `TeamMember` types + new enums + new tournament_status enum values present. |
| **W33** | **Minimal player tournament detail page.** D12 override: canonical URL `/[locale]/tournaments/[organizer-slug]/[tournament-slug]`. Server Component reads tournament via RLS (status != 'draft' OR organizer/admin) by joining `tournament` + `user` (organizer.slug) and matching both URL params. Renders: name + dates + venue + draw_size + organizer link + entry_info + countdown to registration_close_at + register button (only if status='registration_open'). **Backward-compat fallback:** also handle `/[locale]/tournaments/[id]` (UUID) — server-redirects to canonical slug-URL if the param is a valid UUID and the tournament + organizer have slugs. |
| **W33a** | **D12 override — slug input on tournament create form (W27 amendment).** v0.3 W27 tournament create form gains a slug input field with debounced 500ms availability check via B14b `check-tournament-slug-availability` Edge Function. Server action passes the candidate slug to v0.3 W27's existing tournament-insert path PLUS a follow-up `set_tournament_slug` RPC call (mirror of W13's set_user_slug pattern). Reserved-slug blocklist documented inline. Updates v0.3 W27 commit (or lands as a small successor commit) — non-disruptive to v0.3 surface since slug field is optional in DB (slug column nullable; tournaments without slug remain UUID-only). |
| **W34** | **Solo register button + flow** — client-side button on tournament detail. Server action invokes B25 register-solo Edge Function. On success: redirect with toast "Registered (confirmed)" or "On waitlist (#3)". |
| **W35** | **Partner search modal** — debounced 300ms search input → invokes B26b `search-users-by-display-name` Edge Function (NOT a client-side query per F10 — RLS would block + can't enforce rate-limit from client). Returns max 10 results. UI: avatar + name + Invite button. Disabled "Already registered" badge on already-registered matches (server returns this hint). Sentry capture on rate-limit hit (warning level). |
| **W36** | **Doubles register flow** — invokes B26 register-doubles-invite Edge Function. Confirmation toast + tournament card now shows "Waiting for [partner] to confirm." |
| **W37** | **`/invite/[token]` accept/decline page** — client component reads invite via `supabase.from('partner_invite').select(...).eq('token', ...)` (RLS gates by token). Shows tournament context + Accept + Decline buttons. Each invokes B27 respond-partner-invite. Sentry capture on errors. |
| **W38** | **Add/remove partner UI** — on the registered-tournament card: solo player → "Add partner" button (opens W35 modal); doubles player → "Remove partner" button (confirm dialog → invokes B31). |
| **W39** | **Withdraw button** — on registered-tournament card: confirm dialog → invokes B28. Notifies partner inline. |
| **W40** | **TO registrations tab** — on `/organizer/tournaments/[id]`: new tab "Registrations" listing confirmed + waitlisted + pending_partner + withdrawn registrations. Manual waitlist promotion button per row → invokes B29. TO withdraw button per row → invokes B28 (admin-bypass auth path). **A02 amendment:** "Resend promotion email" button per row, gated on the `${reg_id}:waitlist_promoted:v1` audit row being absent within 30s of the auto-promotion (mirror of v0.3 W21 Resend pattern — recovery affordance for at-least-once email semantics). |
| **W41** | **Tournament status transition controls** — on management hub: "Open Registration" button (when status='draft') and "Close Registration" button (when status='registration_open'). Each invokes B32. |
| **W42** | i18n keys for all v0.4 new strings → `messages/en.json` + `messages/th.json` (placeholder Thai pending native review). Namespaces: `tournaments.detail.*`, `tournaments.register.*`, `invite.*`, `organizer.tournaments.registrations.*`. |
| **W43** | Sentry capture on every server action error path with `function: registration.<X>` tags + PII guards (no email addresses, no display names of unrelated users). |
| **W44** | a11y pass on the v0.4 player surface (axe verify on tournament detail + invite page) + organizer registrations tab. Manual review documented in DECISIONS.md (auto-axe deferred until OrbStack — same as v0.3). |

### Phase C — DoD verification + ship

| Commit | Description |
|---|---|
| **DoD1** | Per-feature ship matrix recorded in `Plans/v04-dod-evidence.md`. |
| **DoD2** | E2E walkthrough by Pap (Pap-action): (a) sign in as Player A → register solo on a test tournament → confirm received "registration_confirmed" email; (b) Player A → "Add partner" → invite Player B; Player B receives partner_invite email; clicks magic link → `/invite/[token]` → Accept → both confirmed; (c) third user fills capacity → fourth user registers → goes to waitlist; (d) Player A withdraws → fourth user auto-promoted from waitlist + receives waitlist_promoted email; (e) decline path: invite sent + recipient clicks Decline → registration deleted + inviter notified; (f) admin-as-TO: open `/admin/organizer-applications/<a>`, observe approved-organizer's tournament has registrations tab populated correctly, manually promote a waitlisted entry. **F13 amendments:** (g) **Invite expiry path**: send invite + manually advance time (or wait if you don't mind) past `registration_close_at` → confirm B33 cron fires + invite status='expired' + inviter receives `cancelled_by_system_invite_expired` email; (h) **Concurrent capacity race**: open two browsers near-simultaneously → both register on a 1-slot tournament → confirm exactly one gets confirmed + one gets waitlisted (no duplicate confirmation); (i) **Partner search rate-limit**: hammer the search input 35 times in 60s → confirm 30/min limit triggers + UX shows "Searching too fast, try again in a moment"; (j) **Re-add-different-partner**: solo→doubles (invite Player B, accept) → remove partner → re-add Player C as partner → confirm both flow correctly per spec §3.5; (k) **Tournament-detail RLS**: try to load `/tournaments/<draft-id>` as a non-organizer → expect 404 (not 403; don't leak existence); (l) **Cancel-with-registrations** (per A04/B33c): TO opens W28b cancel dialog on a tournament with active registrations → confirms the "N players will be notified" override flow → all players receive `cancelled_by_system_tournament_cancelled` email. |
| **DoD3** | Both CIs green on `main`. Auto-types-regen committed by deploy.yml. |
| **DoD4** | Migrations applied to remote prod (deploy.yml automatic via SUPABASE_ACCESS_TOKEN). All Edge Functions deployed (with `_shared` skipped). |
| **DoD5** | DECISIONS.md updated with v0.4 D1-D12 final answers. |
| **DoD6** | `Plans/version-roadmap.md` v0.4.0 header gets `Shipped` + ship date. |
| **DoD7** | `Plans/decisions.md` gets v0.4 ship entry. |
| **DoD8** | `padelthailand.com/matchday/` rebuilt + Pap-approved push showing v0.4 as Shipped. |

---

## 4 · Per-feature ship matrix

| Feature | Code-complete | Backend ready | E2E verified | Ship status |
|---------|---------------|---------------|--------------|-------------|
| Tournament status transitions (TO + cron) | ⬜ | ⬜ B32 + B33 | ⬜ | Required |
| Solo registration | ⬜ | ⬜ B25 | ⬜ | Required |
| Doubles registration + partner search | ⬜ | ⬜ B26 + W35 | ⬜ | Required |
| `/invite/[token]` accept/decline | ⬜ | ⬜ B27 | ⬜ | Required |
| Add/remove partner | ⬜ | ⬜ B30 + B31 | ⬜ | Required |
| Withdrawal + auto-promotion | ⬜ | ⬜ B28 | ⬜ | Required (DoD anchor) |
| TO registrations tab + manual promotion | ⬜ | ⬜ B29 + W40 | ⬜ | Required |
| Tournament detail page minimal | ⬜ | n/a (read-only) | ⬜ | Required |

v0.4 ships when 8/8 are green AND DoD2's auto-promotion email path verifies end-to-end.

---

## 5 · Cross-cutting DoD (every version, per `version-roadmap.md`)

- **a11y** — keyboard nav + screen-reader labels + WCAG AA contrast on every new page (tournament detail, invite, partner search modal, TO registrations tab). axe-core verified clean. Modal a11y (focus-trap, escape-to-close, aria-modal) via shadcn Dialog primitive.
- **Observability** — Sentry capture on every server-action error path with `function: registration.<name>` tags. Edge Functions B25-B33 capture failures via existing `_shared/sentry.ts` wrapper.
- **Audit log** — every mutating action emits a row: `registration.confirmed`, `registration.waitlisted`, `registration.partner_invited`, `registration.partner_accepted`, `registration.partner_declined`, `registration.withdrawn`, `registration.promoted_from_waitlist`, `tournament.registration_opened`, `tournament.registration_closed`.
- **i18n** — every new user-visible string is an i18n key. TH bundles get placeholder strings (carried obligation from v0.1/v0.2/v0.3 native-speaker review).
- **Privacy** — partner search returns ONLY display_name + avatar_url (NOT email or phone). Invite email contains inviter's display name + tournament name (no other PII). Auto-promotion email contains tournament name + organizer name (no other PII).

---

## 6 · Anti-criteria (locked)

- v0.4.0 must NOT ship bracket UI / draw generation / seeding / byes (those are v0.5.0)
- v0.4.0 must NOT ship live scoring / match state machine (v0.6.0)
- v0.4.0 must NOT ship match scheduling UI (v0.7.0)
- v0.4.0 must NOT ship realtime / spectator (v0.8.0)
- v0.4.0 must NOT ship payment processing (v2+)
- v0.4.0 must NOT modify v0.3 frozen surfaces (`/sign-in`, `/onboard`, `/me/*`, `/organizer/apply*`, `/admin/*`, `/organizer` dashboard, `/organizer/tournaments/[id]` management hub except for adding the new Registrations tab)
- v0.4.0 must NOT ship without RLS regression tests for the 3 new tables
- v0.4.0 must NOT depend on v0.3 unfinished E2E (this plan executable independently)
- v0.4.0 must NOT push padelthailand.com/matchday/ without explicit Pap approval
- v0.4.0 must NOT silently drop registration emails in prod (hard-fail if `RESEND_API_KEY` unset; dev-fallback console-logs in non-prod)
- v0.4.0 must NOT auto-cancel tournaments older than X days (no auto-cleanup; v2+ ops concern)
- v0.4.0 must NOT expose partner email addresses in any UI (display_name + avatar only)
- **v0.4.0 must NOT render confirmed-registrant lists on player-facing pages** (per F14 — strikes the D10 "roster preview" option; that's v0.5 spectator surface)
- **v0.4.0 must NOT allow a player to invite themselves as partner** (per F06; B26 RPC validates inviter_user_id != invitee_user_id)
- **v0.4.0 must NOT allow concurrent pending invites from the same inviter to the same invitee for the same tournament** (per F06; B26 RPC validates uniqueness)
- **v0.4.0 must NOT silently delete registrations on tournament cancellation** (per A04; B33c is the explicit cancel-with-registrations path; v0.3 W28b refuses cancel if registrations exist + offers override)

---

## 7 · Risk register (post-premortem)

| # | Risk | Mitigation |
|---|------|------------|
| R1 | Two players register simultaneously when capacity = 1; both might pass capacity check | B25 uses `SELECT FOR UPDATE` on the tournament row before INSERT. Serializes capacity-check across concurrent registrations. |
| R2 | Doubles partner accept races with capacity changes (third pair fills capacity between invite-send and accept) | B27 re-checks capacity inside the SELECT FOR UPDATE; fallback: both registrations flip to `waitlisted` (atomically) if capacity has filled. |
| R3 | Withdrawal doesn't atomically promote waitlist | B28 wraps both ops in a single PG transaction. `SELECT ... FOR UPDATE SKIP LOCKED` on waitlist queue prevents two concurrent withdrawals from promoting the same waitlisted entry. |
| R4 | Partner_invite token enumerable | D3 default = cryptographic 22-byte base64 (not UUID v4). DB unique index on token. Rate-limit token-lookup endpoint to N/min. |
| R5 | Cron Edge Function (B33) drift / missed schedule | `pg_cron` is reliable but document fallback: TO can manually close registration if cron missed. Alert on Sentry if cron run fails. |
| R6 | Partner search leaks user existence by display_name | D2 default = display_name prefix only (no email). Rate-limit 30/min per IP per spec §3.3. Acceptable per v0.3 D9 (display_names already publicly visible on organizer profiles). |
| R7 | Email rate-limit interferes with legitimate flows (e.g., user registers + immediately withdraws + re-registers within an hour fires 4 emails) | D5 default 3/h is consistent with v0.3 welcome email. Edge cases: TO can resend manually via DoD-time recovery affordance (mirror of v0.3 W21 Resend button). |
| R8 | Solo-to-doubles conversion (W38 add partner) edge case: partner already registered for same tournament | B30 must validate invitee not already registered. Return 409 with toast "This player is already registered for this tournament." |
| R9 | Pair waitlist promotion: pair gets promoted but one player's session already withdrew separately (race) | Handled by B28's SELECT FOR UPDATE + the partial unique index on registration. Withdrawal voids both pair's regs; auto-promotion picks next pair. |
| R10 | RLS on partner_invite via token allows anyone with the URL to see invite details | This is intentional — magic-link semantics. Mitigation: token is unguessable (D3 cryptographic) + expires (D4 fallback or registration_close_at). |
| R11 | TO auto-close fires while a doubles invite is pending (spec §3.8: "Registration closes while invite pending") | B33 auto-close transitions tournament to registration_closed; **separate cron sweep** (or trigger on tournament status change) iterates over `pending_partner` registrations for that tournament → DELETE them + email inviters. Add to B33 spec. |
| R12 | Player registers in two browsers simultaneously, hitting B25 twice | Partial unique index `(user_id, tournament_id) WHERE status NOT IN ('withdrawn', 'cancelled')` prevents double-registration. Second insert returns 409; W34 toast "You're already registered." |
| R13 | TO manually promotes a waitlisted entry while capacity is already full (over-capacity scenario) | B29 has no capacity check — TO override is intentional. Document: TO accepting over-capacity is their call (e.g., for pre-arranged exemptions). The bracket sizing in v0.5 will need to handle "more confirmed than draw_size" as a TO-known case. |
| R14 | Withdrawal email to partner exposes inviter's email address | Templates B23 only render display_name + tournament name + venue. No email/phone in templates. PII guard. |
| R15 | DB trigger on tournament UPDATE (alternative D1) fires on every UPDATE — not just status transitions | D1 default rejects this approach in favor of cron. Documented. |
| R16 | Phase A length is large (~17 commits if including cron + email + Edge Functions) | Each commit is ~1 algorithm run. Phase B parallelizes after types regen. ~3 weeks of Phase A or ~1 day in parallel-blitz mode. |
| R17 | **Self-invite + repeat-invite spam** (post-stress-test F06) | B26 RPC validates `inviter_user_id != invitee_user_id` AND no existing non-expired pending partner_invite for `(inviter, invitee, tournament)` triple. Returns 409. |
| R18 | **Account deletion mid-pending-invite** (post-stress-test F07) | B20 + B21 FKs to `public."user"` use ON DELETE CASCADE. When a user deletes their account, their registrations + partner_invites cascade-delete. Audit-log uses ON DELETE SET NULL on `actor_id` to preserve history. |
| R19 | **Tournament cancel-with-registrations** (post-stress-test A04) | v0.3 W28b cancel action tightened to refuse cancel when active registrations exist. B33c provides the explicit cancel-with-registrations path: sets all registrations to `cancelled` (system-initiated) + emails affected players. Confirm dialog wording: "This tournament has N active registrations. Cancel anyway? All players will be notified." |
| R20 | **Cron Edge Function overlap** (post-stress-test A03) | B33 wrapped in `pg_try_advisory_lock(hashtext('auto-close-tournaments'))` — returns early if previous tick still running. Per-row UPDATE gated on `WHERE status='registration_open'` (idempotent re-read absorbs leaked overlap). |

---

## 8 · Approval gates

This plan requires explicit Pap approval before any scaffolding:

1. ✅ Plan drafted (DRAFT v1)
2. ✅ Plan stress-tested by Plan agent + Architect agent — 18 amendments applied + 7 nits documented (DRAFT v2)
3. ✅ Pap reviewed; D1-D15 answered; P1-P3 acknowledged (DRAFT v3 — 14 defaults + D12 vanity-URL override)
3. ⬜ Pap reviews; D1-D12 answered; P1-P3 acknowledged
4. ⬜ Phase A (B19-B35) authorized to execute (single Algorithm with parallel-agent-team blitz, mirror v0.3 cadence)
5. ⬜ Phase B (W32-W44) authorized after Phase A types regen lands

Subsequent algorithms execute the phased commits.

---

*End of v0.4.0 build plan v2.*

---

## Change log — DRAFT v2 → DRAFT v3 (2026-04-28)

D-decisions answered by Pap. **14 of 15 defaults locked**; **1 override**:

**Override:**
- **D12: Vanity URLs** (vs default UUID) — `/tournaments/[organizer-slug]/[tournament-slug]` instead of `/tournaments/[uuid]`. Adds Phase A scope:
  - **B19a** — ALTER TABLE tournament ADD COLUMN slug + unique partial index on (organizer_id, lower(slug)) + `set_tournament_slug` SECURITY DEFINER + reserved blocklist
  - **B14b** — `check-tournament-slug-availability` Edge Function (mirror of v0.3 B14a)
  - **W33** — canonical URL changed to slug-based; UUID-fallback handler added
  - **W33a** — v0.3 W27 tournament create form gets a slug input with availability check (small successor commit; non-disruptive since slug column nullable)

**Defaults locked (D1-D11, D13-D15):** see §2 Decisions table.

**Phase A commit count:** 20 (DRAFT v2) → **22** (DRAFT v3) — adds B19a + B14b.
**Phase B commit count:** 13 → **14** — adds W33a (v0.3 W27 slug-field amendment).

*End of change log.*

---

## Change log — DRAFT v1 → DRAFT v2 (2026-04-28)

Stress-test by Plan + Architect agents in parallel surfaced 25 actionable findings (16 Plan-agent + 10 Architect-agent, with overlaps reconciled). 18 applied; 7 nits documented as accepted-with-rationale.

**Critical (6):**
- F01 / D13 added: registration row model = TWO-ROW MIRROR (each player has own row pointing to same team_id; simpler RLS, matches spec §3.6 wording)
- F02 / A08: B22 audit emitter names reconciled to canonical `audit_action` enum (`registration.solo`, `registration.doubles_invited`, `registration.partner_added/removed`, `registration.waitlist_promoted`, `registration.cancelled_by_system`, `tournament.registration_opened/closed/reopened`); plan v1's invented names removed
- F04: B33b added — explicit `sweep_pending_partner_invites_rpc(tournament_id)` Postgres function called by B33 (cron) AND B32 (TO manual close); per spec §3.8
- F11 / D14 added: Edge Function transactionality moved to Postgres rpc functions for B25/B26/B27/B28; Edge Functions become thin auth + email wrappers
- A04: B33c added — explicit `cancel_tournament_with_registrations_rpc` path; v0.3 W28b refuses cancel if active registrations exist + offers override flow
- A06: B28 includes explicit pair-aware promotion SQL skeleton with `FOR UPDATE SKIP LOCKED LIMIT 1`

**Important (12):**
- F03: B28 amended — withdraw rejected if tournament status != 'registration_open'
- F05: B21 amended — partner_invite RLS requires authenticated `auth.uid() = invitee_user_id` (no anon read)
- F06 / R17: B26 amended — inviter ≠ invitee + no concurrent pending invite per `(inviter, invitee, tournament)` triple
- F07 / R18: B20 + B21 amended — FKs to `public."user"` ON DELETE CASCADE
- F08: B32 amended — runs B33b sweep on TO manual close, same path as B33 cron
- F09: B19 amended — team RLS deliberately tightened from canonical (Edge-Function-only INSERT); documented in commit message
- F10: B26b added — `search-users-by-display-name` Edge Function (NOT client-side query); rate-limit 30/min/IP per spec §3.3
- F13: DoD2 extended — invite expiry, capacity race, rate-limit hit, re-add-different-partner, draft-tournament 404, cancel-with-registrations
- F16 / D13 + D14: explicit decision-table additions
- A02: W40 gains "Resend promotion email" button (mirror of v0.3 W21)
- A03 / R20: B33 wraps body in `pg_try_advisory_lock` for overlap protection
- A07 + A08 / D15: B22 takes typed-FK audit migration NOW (not deferred to v0.5); backfills v0.3 rows; clean v0.5+ audit surface

**Nits (7) — accepted with rationale, no full amendment:**
- F12: B24 idempotency key `${reg_id}:${kind}:v1` works in v0.4 because no demotion path exists. Documented; reserve `:v2` for when v0.5+ introduces demotion.
- F14: D10 roster-preview option struck — added explicit anti-criterion against rendering registrant lists on player pages.
- F15: W-commit dependency arrows annotated implicitly via the order in §3 Phase B; explicit serial chain is W32 → W33 → {W34, W38, W41} → W36 (depends on W35); parallelizable: W35, W37, W40, W42, W43, W44.
- A01: PgBouncer transaction-mode + `FOR UPDATE` works correctly inside an explicit BEGIN/COMMIT (locks are tx-scoped). Pooler-friendly URL (port 6543) used; documented in B25/B27/B28.
- A05: `withdrawn` (player-initiated) vs `cancelled` (system-initiated) semantics documented in B20 + DECISIONS.md.
- A09: Constant-time invite token lookup not required given D3's 132-bit entropy; rate-limit + Sentry alert on `partner_invite token-not-found > 10/min` is the right signal.
- A10: B24 idempotency key versioning strategy reserved for v0.5+ demotion; documented in DECISIONS.md.

**Net commit additions in DRAFT v2:**
- B26b (search-users-by-display-name)
- B33b (pending-invite sweep RPC)
- B33c (cancel-tournament-with-registrations RPC + Edge Function)

**Phase A commit count:** 17 (DRAFT v1) → 20 (DRAFT v2) including the 3 new B-commits + the typed-FK audit migration absorbed into B22.

**Phase B commit count:** 13 unchanged (W32-W44).

*End of change log.*
