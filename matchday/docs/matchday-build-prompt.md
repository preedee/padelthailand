# Matchday — Claude Code Build Prompt

> **Status:** Draft v0.5 · **Updated:** 2026-04-16 · **Owner:** Pap
> **v1 target:** Run a single-elimination padel tournament end-to-end in Thailand. TO enters live scores (per-set), bracket updates in realtime via Supabase Realtime for ~100 concurrent viewers. Responsive web only. Social sign-in (Facebook/Google/Apple) + email magic link. Spectator mode for venue TVs. No payments.
> Paste this entire file into a fresh Claude Code session started from an empty `matchday/` directory. Do not pre-create code before pasting — the first action is a confirmation gate, not a code gen.

---

## 1 · Meta

- **Project name:** Matchday
- **Tagline (working):** Tournament operations for Asia-Pacific racket sports
- **Version target:** v1.0 (padel-only MVP) — see `matchday-v2-v9-reference.md` for v2-v9 roadmap
- **Sister product:** The Padel Society (TPS) — existing Flutter + Supabase + Next.js ecosystem
- **Primary founder:** Pap

---

## 2 · Mission & Strategic Wedge

### Mission
Give tournament organizers, clubs, and players across Asia-Pacific a single platform for running and playing in serious padel tournaments — with federation-grade bracket management, modern live scoring, and pluggable cross-system rating federation.

### Strategic wedge (READ CAREFULLY — every decision flows from this)
Matchday's long-term product has two pillars of equal importance: **world-class tournament operations** and **deep rating integration**. WeCourts (the Middle-East-popular incumbent) has built its product around the WPPR rating system — rating is the centerpiece of their player experience. Matchday takes the same lesson for the long run: rating is critical to the mature product, not a background service.

**For v1, only the first pillar is in scope.** The rating pillar is v3. v1 exists to serve a specific padel tournament in Thailand end-to-end — single-elimination with live TO scoring and realtime bracket updates. Matchday does not have its own mobile app — TPS is the mobile surface for players.

Matchday's wedge (long-term):
1. **Build the world-class tournament ops stack** WeCourts never publicly built — draws, seeding, live scoring, payouts, club management, live bracket UX. This is where we out-execute WeCourts on operations. **v1 builds the core of this pillar**: single-elimination format, online registration, manual seeding, live TO scoring with per-set scores, realtime bracket progression via Supabase Realtime, and auto-derived placements. Player scoring, disputes, additional formats (double-elim in v2, round robin + groups+KO in v4), and payouts are v2+.
2. **(v3) Deeply integrate with an external rating system** (provider TBD — see §17). Matchday does **NOT** build its own rating algorithm. When v2 begins, Matchday will integrate with one chosen rating system so tightly that rating feels native to Matchday — visible on every profile, match, bracket, with per-match impact breakdowns, rating-based seeding, and a rating leaderboard as a primary discovery surface. Think Spotify with music: we don't own the algorithm, but the experience is core. **None of this ships until v3.**
3. **Be Asia-Pacific-native from day one.** Not a MENA product ported to APAC. i18n, payment rails, messaging platforms, federations, and timezones are APAC-first concerns, not afterthoughts. **v1 ships fully in Thailand with TH + EN.**

**v1 focus**: build the narrow slice of pillar #1 needed to run the first tournament. Make architectural space for pillar #2 (clean data boundaries, sport abstraction, auth extensibility) without building its UX.

### 2.1 · The four differentiator pillars (v1/v2 split)

Matchday's four long-term differentiators vs WeCourts and Playtomic. v1 ships a narrow slice; v2 fills them out.

| # | Pillar | v1 scope | Future versions |
|---|---|---|---|
| 1 | **Deep rating integration** | Not in v1 | v3: Rating integration with one external provider — profiles, brackets, auto-seeding, per-match impact, leaderboard |
| 2 | **Federation Support** | Not in v1 | v7: Sanctioning UI, official tournament approval workflows, federation ranking management, referee mode |
| 3 | **Tournament Formats** | Single Elimination | v2: Double Elimination · v4: Round Robin, Groups + Knockout |
| 4 | **Tournament Configuration** | TO-mode live scoring, per-set scores, realtime bracket, auto-derived placements, spectator mode | v2: Player score entry, dispute flow · v4: Scoring configs, registration approval · v7: Referee mode |

---

## 3 · How to Use This Prompt (read this first)

You are Claude Code, receiving this prompt at the start of a fresh session in an empty `matchday/` directory.

**Your first job is NOT to write code.** Your first job is to:

1. Read this entire document.
2. Produce a short response that summarizes your understanding of the mission, scope, stack recommendation, and anti-requirements in your own words.
3. **Present the CONFIRMATION GATE** from §6 to Pap as a structured `AskUserQuestion`. Wait for his answers. Do not run `next create` or any scaffolding command until the gate has been cleared.
4. Once the gate is cleared, propose a **build plan** (repo layout, dependency list, first commit) and **ask for approval** before starting implementation.
5. Only then begin coding.

**Hard rules for this project:**
- (Flutter `MinimumOSVersion` rule removed — Matchday has no Flutter code. This rule applies to TPS only.)
- Never commit secrets, service keys, or `.env` files.
- All database access must go through Supabase Row-Level Security policies. Never bypass RLS from the client.
- All server-side logic lives in Supabase Edge Functions, not in the Next.js client.
- Every PR has two mandatory approvals: **Lead Engineer** and **Security Engineer** (mirror TPS workflow).
- Run the linter before every commit. Zero warnings. Zero exceptions.

---

## 4 · Project Context & Personas

### Standalone product
Matchday is a **standalone product** with its own brand, codebase, repositories, release cadence, auth system, and venue data. In v1, Matchday has **no runtime dependency on TPS** — it manages its own users, venues, and tournaments independently. TPS integration (account linking API) begins in v3. See `matchday-v2-v9-reference.md` for details.

Matchday does **NOT** get merged into the TPS codebase. Matchday does **NOT** inherit the TPS feature flag catalog or ticket namespace.

### Geographic target (prioritized)
Matchday expands market-by-market in strict priority order. Earlier priorities must be validated before resources move to later ones. i18n, payment rails, messaging channels, and federation partnerships are invested in the same priority order.

| Priority | Markets | Notes |
|---|---|---|
| **P1 — Home market** | 🇹🇭 Thailand | TPS's home market. Matchday launches here first. Languages: TH + EN. Payments: PromptPay + Stripe. Federation: TPA (Thai Padel Association). Messaging: LINE + WhatsApp. |
| **P2 — Primary expansion** | 🇮🇩 Indonesia | Large population, growing padel scene, distinct language + payment rails. Languages: ID (Bahasa Indonesia). Payments: GoPay, OVO, Dana, Stripe. Messaging: WhatsApp. |
| **P3 — Southeast Asia** | 🇸🇬 Singapore, 🇲🇾 Malaysia, 🇵🇭 Philippines, 🇻🇳 Vietnam (plus Cambodia, Laos, Myanmar as long tail) | Shared SEA tournament circuit potential. Languages: MS, TL, VI + EN. Payments: GrabPay, Stripe, locally-preferred rails. Messaging: WhatsApp (SG/MY/PH), Zalo (VN). |
| **P4 — Rest of Asia** | 🇯🇵 Japan, 🇰🇷 Korea, 🇮🇳 India, 🇦🇺 Australia, 🇭🇰 Hong Kong, 🇹🇼 Taiwan, 🇨🇳 China | Added only after P1-P3 are validated. Each requires meaningful new investment (language, payment, federation). Architecture must be extensible, but UI translations and payment integrations are gated on market opening. |

**Implication for v1 build**: Ship with **Thailand fully supported** end-to-end (TH locale, PromptPay, LINE notifications when messaging channels are added, TPA rule profile). Indonesia-ready architecture (no hardcoded TH assumptions). Everything else is backlog.

### Personas
| Persona | Needs in v1 | Priority in v1 |
|---|---|---|
| **Tournament Organizer** (TO) | Apply for organizer access, create tournaments with venues, manage registrations, seed players, generate draws, publish brackets, enter live scores, manage live tournament | P0 |
| **Player** | Sign up (email or social), discover tournaments, register solo or with a partner, view live bracket updates, see final placements | P0 |
| **Matchday Admin (Pap + designees)** | Review organizer applications, approve or reject, manage overall platform | P0 (new in v1) |
| **Club / Venue Owner** | Venues managed by TOs in v1; dedicated venue owner portal is v2 | v2 |
| **National Federation** | Sanction tournaments, enforce rules | v2 (architecture-ready in v1) |
| **Referee / Court Official** | Enter/validate scores during live matches | v7 |

---

## 5 · Scope

### v1 cohort & target
**v1 cohort**: a specific padel tournament in **Thailand**. This is Matchday's beta. v1 exists to serve that one tournament end-to-end, then collect feedback.

### In-scope v1 (registration + live single-elim tournament)
- Sport: **padel only**
- Surface: **responsive web only** (Next.js). **Matchday has no mobile app — TPS (The Padel Society) is the mobile interface for players.** Matchday's responsive web must work well on mobile browsers.
- Tournament format: **single elimination only**
- Tournament creation (TO flow): name, dates, venue (with court names), draw size, entry information (free-text — no payment processing), **last-set scoring rule** (full set / tiebreak / super tiebreak)
- Registration flow (solo + doubles partner matching). **No entry fee collection — entry fees are handled offline by the TO (cash, bank transfer, etc.).**
- TO manages entry list (auto-accept, waitlist handling, waitlist promotion email)
- **Tournament lifecycle**: `draft` → `registration_open` → `registration_closed` → `published` → `live` → `completed`. TO creates as `draft` (invisible to public), explicitly publishes when ready.
- Draw generation: single-elim bracket via manual drag-drop seeding (with byes for non-power-of-2 draw sizes; **top seeds get byes automatically**)
- **Live bracket view**: bracket updates in realtime via Supabase Realtime (~100 concurrent viewers). Matches show status (upcoming / in progress / completed) and scores.
- **TO live scoring**: TO enters per-set scores during the tournament (e.g. 6-4, 7-5, 10-8 super tiebreak). Supports **best-of-1 or best-of-3** (configurable per tournament). On match completion, winner auto-advances to next round. Retirement option (partial scores, opponent advances). Tournament auto-completes when final + optional 3rd-place match are scored.
- **Placements auto-derived** from bracket results (1st = winner, 2nd = finalist). **Optional 3rd-place match** — if enabled, 3rd = winner, 4th = loser; if disabled, 3rd/4th are unranked semi-final losers. TO can manually override any placement (audit-logged).
- **Match scheduling**: court x time grid with drag-drop (15-minute increments). Configurable match duration per round. Auto-schedule algorithm + manual adjustments. Court availability blocking. Conflict detection (player double-booked, bracket dependency).
- **Spectator mode**: `?spectator=true` hides nav, enlarges bracket, works on venue TVs. Auto-refreshes via Realtime.
- **Tournament cancellation**: TO cancels → all registered players notified → registrations voided.
- Venue management: **Matchday-native** — TO creates/selects venues directly in Matchday (name, city, court count, court names, address)
- Auth via **Supabase Auth** (email + magic link) + **social sign-in** (Facebook, Google, Apple)
- **Player profile**: display name, date of birth (required), gender (optional), city + country + nationality (required), phone + LINE ID + WhatsApp number (optional), playing hand + preferred side (optional)
- **Social sharing + OpenGraph**: tournament pages have rich link previews for LINE/WhatsApp sharing
- **Multi-day tournament support**: scheduling grid handles multiple days
- i18n: TH + EN

### Out-of-scope v1 (see `matchday-v2-v9-reference.md` for full v2-v9 roadmap)
- **Player score entry** — only TO enters scores in v1. Player scoring + dispute flow arrives in v2.
- **Push notifications** — v1 has email notifications + "my next match" card. Web Push (OneSignal) arrives in v2.
- **Entry fee payments** — v1 collects no money. Fees handled offline. Payments arrive in v5.
- **Additional formats** — double elimination (v2), round robin + groups+KO (v4). v1 is single-elim only.
- **Deep rating integration** — the entire rating pillar moves to v3.
- **Flutter mobile app** — Matchday has no mobile app permanently. TPS is the mobile surface.
- **TPS integration** — v1 is fully standalone. TPS account linking API arrives in v3.
- Multi-sport (v8), federation sanctioning (v7), referee mode (v7)
- Matchday's own rating algorithm (permanent — we integrate, we don't build)
- Messaging channels — WhatsApp + LINE (v6), others in expansion milestones

### TBD (blocked until Pap decides)
- Exact v1 cohort tournament identity + organizer contact

---

## 6 · Tech Stack Recommendation & CONFIRMATION GATE

### Recommendation (v1 — web only, no payments, live scoring via Realtime)
| Layer | Choice | Rationale |
|---|---|---|
| Web app | **Next.js** (App Router) + TypeScript + shadcn/ui + Tailwind | Matches TPS admin; responsive, mobile-browser-friendly; strong i18n ecosystem; fast to iterate |
| Backend | **Supabase** (PostgreSQL + Edge Functions in TypeScript/Deno + Storage + **Realtime**) | Matches TPS; RLS for security. **Supabase Realtime is used in v1** for live bracket updates during tournaments (~100 concurrent viewers). |
| **Auth** | **Supabase Auth** (email + magic link + **Facebook + Google + Apple** OAuth) | Matchday-native auth with social sign-in. No TPS SSO dependency. |
| Bracket rendering | `@g-loot/react-tournament-brackets` or equivalent off-the-shelf library | Do NOT hand-roll a custom bracket renderer in v1 |
| Venues | **Matchday-native** — TO creates venues in Matchday directly | No TPS clubs dependency in v1. TPS club catalog sync is a v2 integration. |
| Player profile | **Matchday-native** — basic profile created on signup | No TPS profile dependency in v1. TPS profile sync is a v2 integration. |
| Partner search | **Matchday-native** — search registered Matchday users | No TPS player directory dependency in v1. |
| State (Next.js) | Zustand | TPS standard |
| Feature flags | PostHog | TPS standard |
| Issue tracking | Linear (new `MD-` project) | Parallels TPS's TPS-prefixed tickets |
| CI/CD | GitHub Actions | TPS standard |
| Monitoring | Sentry + PostHog events | TPS standard |
| Email | Resend | Registration confirmation, partner invite, draw published, waitlist promotion, tournament cancellation emails in v1 |
| Scheduling UI | `dnd-kit` | Drag-drop court x time grid for match scheduling |

### v1 has NO runtime dependency on TPS
v1 Matchday is fully standalone. Auth, venues, player profiles, and partner search are all Matchday-native. TPS account linking API arrives in v3.

### Post-v1
See `matchday-v2-v9-reference.md` for the v2-v9 roadmap. Matchday has no standalone mobile app — TPS links to Matchday responsive web.

### CONFIRMATION GATE (do not skip)
Before writing **any** code, present the following to Pap as a structured `AskUserQuestion`:

1. **Stack confirmation** — approve the v1 stack: Next.js + Supabase (with Realtime for live bracket) + Supabase Auth (email + magic link + Facebook + Google + Apple OAuth) + `@g-loot/react-tournament-brackets` + `dnd-kit` + Resend (no Flutter, no Stripe, no Omise, no TPS integration in v1). If overridden, capture the new choice and the rationale in `DECISIONS.md`.
2. **Repo strategy for v1** — single `matchday-web/` repo that contains the Next.js frontend, Supabase migrations, and Edge Functions (simpler), OR two separate repos `matchday-web/` + `matchday-backend/` (mirrors TPS structure). Recommended: **single `matchday-web/` repo for v1**.
3. **v1 cohort confirmation** — confirm the target tournament identity, organizer contact, expected draw size, expected player count, and a rough target date. These numbers shape draw-generation edge cases.

Wait for answers. Write answers to `DECISIONS.md` in the root. Then propose a build plan.

---

## 7 · WeCourts-Derived Feature Catalog

Each item is atomic and ticket-ready.

**Research sources** (verified 2026-04-12 by the Matchday research pass):
1. WeCourts iOS App Store listing — https://apps.apple.com/tr/app/wecourts-padel-tournaments/id6714477722 (HTTP 200, confirms "WeCourts — Padel Tournaments", app v1.32.0, iPad-optimized, bundle `com.wecourts.mobile`)
2. WeCourts Android Google Play listing — https://play.google.com/store/apps/details?id=com.wecourts.mobile (HTTP 200, confirms Android app exists under same bundle ID)
3. World Padel Rating platform (login page) — https://app.worldpadelrating.com/login (HTTP 200, confirms separate live service used as a rating target)
4. WeCourts website (https://wecourts.com/, https://wecourts.com/verified/, https://wecourts.com/tournaments/, https://wecourts.com/venue/rsa-padel-club/) — HTTP 403 from non-MENA IPs at research time. Feature claims derived from these pages are from cached/indexed search snippets and App Store marketing copy, not direct scrape. Explicitly marked **[UNVERIFIED]** where unverifiable.

Caveat: `wecourts.com` geo-blocks non-MENA IPs, so some internals are inferred from the above sources. Items marked **[UNVERIFIED]** are inferred from competitor norms, not from direct WeCourts documentation.

### 7.1 — Player features

**v1 scope** (10 features):
- PL-V1-01: **Player profile created on signup** — on first login, Matchday presents a brief profile completion form (display name, playing hand, preferred side). Auth supports email magic link + Facebook + Google + Apple OAuth. The schema includes a nullable `gender` column for future mixed-format pairing constraints, but **v1 does NOT collect or use gender in any UX**.
- PL-V1-02: Browse tournament list — simple list view showing upcoming tournaments with date, venue, and registration status (open / closed / waitlist). v1 shows Thailand tournaments only.
- PL-V1-03: Register for a tournament solo
- PL-V1-04: **Register for doubles by searching Matchday users** — player searches registered Matchday users by name or email, selects a partner, partner receives an email invite from Matchday. Partners must have a Matchday account. If the partner declines or does not respond before registration closes, the solo half of the registration is rolled back.
- PL-V1-04b: **Add partner later** — solo player can add a partner any time while registration is open (becomes doubles). Partner must accept via invite.
- PL-V1-04c: **Remove partner** — doubles player can remove partner while registration is open (becomes solo). Partner notified.
- PL-V1-05: **View live single-elim bracket** — bracket updates in realtime via Supabase Realtime as the TO enters scores. Matches show status (upcoming / in progress / completed) and per-set scores. Bracket rendered via `@g-loot/react-tournament-brackets` or equivalent — **do not hand-roll**.
- PL-V1-06: **View "my next match" card** during a tournament — when a player is logged in and has a scheduled upcoming match, a prominent card shows court number, scheduled time, opponent(s), and round. Updates as bracket progresses (opponent from previous round decided).
- PL-V1-07: **View final placements** — auto-derived from bracket (1st = winner, 2nd = finalist, 3rd/4th = semi-finalists). Visible on the tournament page after completion.
- PL-V1-08: **Spectator mode** — `?spectator=true` on any tournament page hides navigation, enlarges bracket, auto-refreshes via Realtime. Designed for venue TVs.
- PL-V1-09: **Social sharing** — tournament pages have OpenGraph meta tags for rich link previews when shared on LINE/WhatsApp. Share button copies link.
- PL-V1-10: **Waitlist promotion notification** — email sent when a player is promoted from waitlist to confirmed.
- PL-V1-11: **Withdrawal** — player can withdraw only while registration is open. Doubles withdrawal voids both registrations. Triggers waitlist promotion (FCFS, TO can override).

**v2+ scope**: See `matchday-v2-v9-reference.md` for deferred player features (player scoring, disputes, push notifications, match history, double elim, TV display mode).

### 7.2 — Tournament organizer features

**v1 scope** (12 features):
- TO-V1-01: Create a tournament — fields: name, dates, venue (with court names), draw size, **match format** (best-of-1 / best-of-3), **last-set scoring rule** (full set / tiebreak / super tiebreak), **3rd-place match** (on/off), **free-text level band**, **free-text entry info**. No entry_fee or currency columns — Matchday collects no money in v1.
- TO-V1-02: Open / close registration window
- TO-V1-03: Manage entry list — **registrations auto-accept by default** until the draw is full, then auto-waitlist. TO can manually remove or promote from waitlist.
- TO-V1-04: Seed players manually — drag-and-drop into seed slots with auto-save. **Top seeds automatically receive first-round byes**. "Auto-fill remaining" assigns unseeded teams randomly (can regenerate for new random). TO can leave and return — seed assignments persist.
- TO-V1-05: Generate draw from seeds — single-elim bracket (with byes)
- TO-V1-06: **Schedule matches to courts and time slots** — configurable match duration per round (15-minute increments). Auto-schedule algorithm places matches respecting bracket order + court availability. Manual drag-drop adjustments on top. Court availability blocking (mark courts unavailable for time ranges). Multi-day support. Conflict detection (player double-booked, bracket dependency violations).
- TO-V1-07: Regenerate the draw if registrations change before publish
- TO-V1-08: **Publish the draw** — bracket visible to players. Post-publish editing with audit log until tournament start. **Draw published email sent to all registered players.**
- TO-V1-09: **Start tournament** — transitions tournament to `live` state. Matches become scorable.
- TO-V1-10: **Enter live scores** — TO selects a match, enters per-set scores (e.g. 6-4, 7-5). Last set follows tournament's configured rule (full set / tiebreak / super tiebreak). On submit, winner auto-advances to next round. Bracket updates via Realtime for all viewers. Audit-logged.
- TO-V1-11: **Walkover / withdrawal / retirement** — TO marks walkover (no scores, opponent advances), retirement (partial scores recorded, opponent advances), or undo walkover (cascading reset if downstream matches played).
- TO-V1-12: **Cancel tournament** — all registered players notified via email, registrations voided, tournament marked cancelled.

**v2+ scope**: See `matchday-v2-v9-reference.md` for deferred TO features (scoring configs, referee delegation, rating-based seeding, payouts, exports).

### 7.3 — Club / venue features

**v1 scope — Matchday manages venues natively.** TOs create and manage venues directly in Matchday. No TPS dependency.

**v1 features:**
- CV-V1-01: When creating a tournament, the TO selects an existing venue or creates a new one inline (name, city/location, court count, optional address)
- CV-V1-02: Tournament detail page shows the venue's name, location, and court count
- CV-V1-03: A simple "Venues" page lists all venues that have Matchday tournaments, each linking to the list of that venue's tournaments

**v2+ scope**: See `matchday-v2-v9-reference.md` for deferred venue features.

**Architectural note for v1**: The `Venue` table is Matchday-native and is the source of truth. In v2, a `venue_source` column (enum: `matchday` | `tps_sync`) can distinguish Matchday-created venues from TPS-synced ones.

### 7.4 — Referee features (v2 — see `matchday-v2-v9-reference.md` §1)
Not in v1. **v1 architectural obligation**: `User.roles` is a text array supporting additive `referee` role without schema migration.

### 7.5 — Federation features (v2 — see `matchday-v2-v9-reference.md` §2)
Not in v1. **v1 architectural obligation**: `Tournament.sanctioning_profile_id` is a nullable FK column from day one.

### 7.6 — Tournament Organizer onboarding (v1)

TPS does not yet have a TO onboarding flow, so Matchday builds this from scratch. The onboarding is **self-serve apply → admin review → approved**, with an explicit `organizer` role added to the user on approval.

#### Role model
- Every TPS user who signs in to Matchday starts with exactly one role: `player`
- A user becomes an organizer by applying; on admin approval, `organizer` is **added** (not replaced) — users can be both player and organizer
- v2 roles like `referee`, `club_staff`, `federation_official` use the same additive model
- `User.roles` is a text array column in Supabase; RLS policies check membership

#### Application workflow (states)
`draft` → `submitted` → `under_review` → `approved` OR `rejected`

- **draft**: applicant is filling the form, not yet submitted (form auto-saves)
- **submitted**: form is complete and in the admin queue
- **under_review**: admin has opened the application (optional intermediate state — UI nice-to-have)
- **approved**: admin accepted; user.roles array gains `organizer`; approval email sent; applicant can immediately create tournaments
- **rejected**: admin declined with a required reason; rejection email sent with reason; no cooldown (v1 — reapplication allowed immediately)

#### Application form (v1)

| Field | Required? | Source | Notes |
|---|---|---|---|
| Name | Required | From Matchday profile | For "Hosted by [X]" on tournament pages |
| Email | Required | From Matchday profile | For Matchday notifications |
| LINE ID | **Required** | Free text | Thai-standard contact channel |
| WhatsApp number | **Required** | Free text | APAC-standard contact channel |
| **Logo** | **Required** | File upload (image) | **500 × 500 pixels final output.** Client-side cropper enforces square aspect ratio and resizes before upload. Accepted formats: PNG, JPG. Max upload size: 2 MB. Stored in Supabase Storage (bucket: `organizer-logos`, publicly readable, write-restricted to the owning user via RLS). Used on organizer profile page, tournament pages, and admin review. |
| Agree to Matchday TO terms of service | Required | Checkbox | Matchday-specific legal agreement |
| Phone | Optional | Free text | Matchday-useful contact field |
| Instagram | Optional | URL or @handle | |
| Website | Optional | URL | |
| Facebook | Optional | URL or page name | |
| Other social media | Optional | Free text | Catch-all for platforms we didn't enumerate |
| Reference (who referred you?) | Optional | Free text | Trust graph signal for admin review |

**Design rule**: The form does NOT collect any field that Stripe Connect or Omise will collect during their own onboarding in v2 — no business entity type, no tax ID, no physical address, no bank account details, no ID document. Payment-processor KYC is the payment processor's job, not Matchday's.

#### Admin review flow (v1 minimal)
- `/admin/organizer-applications` page, visible only to users with `admin` role (Pap + any admins Pap designates)
- Simple paginated list of all applications, newest first, showing applicant name, submitted date, LINE ID, current status
- Click into an application → full read-only view of the form responses + any TPS profile data for context
- Two actions: **Approve** (no reason required) or **Reject** (requires a `reason` text field, max 500 chars)
- On Approve: transactionally add `organizer` to `User.roles`, insert audit log row, enqueue approval email
- On Reject: transactionally set application status to `rejected`, persist reason, insert audit log row, enqueue rejection email
- No bulk actions, no filters, no search in v1. Expected volume is ~1-5 applications.

#### Email notifications (via Resend)
Three transactional emails in v1:
1. **Application received** → applicant, immediately on submit. "We've received your organizer application. You'll hear from us within X days."
2. **Application approved** → applicant, on admin approval. "You're now a Matchday organizer! Here's how to create your first tournament: [link]"
3. **Application rejected** → applicant, on admin rejection. "Your application wasn't approved. Reason: [admin's reason]. You can reapply at any time."

Each email is a Resend template. Subject lines and body copy are i18n-keyed (TH + EN in v1).

#### Data model

```
OrganizerApplication
---
id                 uuid pk
user_id            uuid fk → User
status             enum ('draft', 'submitted', 'under_review', 'approved', 'rejected')
form_data          jsonb         # all form fields, including optional ones
submitted_at       timestamptz nullable
reviewed_by        uuid nullable fk → User (the admin who reviewed)
reviewed_at        timestamptz nullable
review_reason      text nullable # required when status = 'rejected'
created_at         timestamptz
updated_at         timestamptz
```

`User` additions (if not already present):
```
User.roles                      text[] default array['player']
User.organizer_logo_url         text nullable   -- set on application submit (Supabase Storage URL)
User.stripe_connect_account_id  text nullable   -- RESERVED for v2 Stripe Connect onboarding
User.omise_recipient_id         text nullable   -- RESERVED for v2 Omise onboarding
```

The two `*_account_id` columns are nullable in v1 and remain null for every user. They exist now so v2 payment-processor onboarding can populate them without a migration. This is the §9.0 full-backlog-architecture principle applied.

#### v2 additions (not in v1)
- Stripe Connect onboarding flow (redirect out to Stripe hosted onboarding, return with `stripe_connect_account_id`)
- Omise recipient onboarding flow (redirect out to Omise, return with `omise_recipient_id`)
- Per-tournament "require manual approval of registrations" toggle (v1 auto-approves all)
- Reapplication cooldown rules
- Admin filters, search, bulk actions on the review page
- TO performance dashboard (tournaments hosted, players served, revenue, disputes)
- Revoke organizer role with appeal flow
- Club-authorized organizer relationships (requires a TPS schema change to add "authorized organizers per club")

---

## 8 · Differentiator Pillars
Moved into §2.1 to eliminate duplication with the strategic wedge. See the four-pillar v1/v2 table in §2.1.

---

## 9 · Architecture Primer

### 9.0 · Architecture for the full backlog (read this first)

**Core principle**: v1's feature scope is tiny, but v1's architecture must accommodate every v2+ feature listed in this document. The schema, auth model, domain boundaries, and API surface must be designed as if you were building the full product — and then you implement only the v1 slice on top of that architecture.

This matters because migrating production data is expensive and risky. Every architectural hole you leave in v1 becomes a schema migration, a refactor, or a scramble in v2. v2 begins immediately after the v1 cohort tournament. There is no grace period to refactor.

**What "architectural readiness" means in practice:**

1. **Schema reserves space for deferred features**. Nullable columns, lookup tables, and foreign keys exist for every v2+ feature that will touch an existing table. Examples:
   - `Match.rating_delta_json` (nullable) — reserves space for v2 rating integration on existing match rows
   - `Tournament.sanctioning_profile_id` (nullable FK) — reserves space for v2 federation sanctioning
   - `Payment` table exists (empty in v1) with the shape defined in `matchday-v2-v9-reference.md` §3 — reserves space for v2 payment processing
   - `User.role` supports adding `referee`, `federation_official`, etc. without migrating existing rows
   - `Sport` is a first-class row (even though only padel exists in v1), not a constant — v2 sports are new rows, not a schema change
   - `Match` table has nullable `team_a_points`, `team_b_points`, `scored_at`, `scored_by` columns — unused in v1, reserved for v2 scoring. A separate richer `Score` table with polymorphic per-sport/per-format shape (sets, games, golden-point, point-by-point) exists empty in v1 — reserves space for v2 detailed scoring across all formats.
2. **Domain interfaces are documented even when not implemented**. The `RatingProvider` and `PaymentProvider` interfaces in §11 are design references for v2. v1 does NOT ship TypeScript definitions for them, does NOT import them, and does NOT wire any adapters. The interfaces exist in this prompt as a contract so v2 can drop implementations in without touching v1 domain code. Schema columns that will eventually reference these interfaces (nullable FKs, nullable stripe_connect_account_id, etc.) do exist in v1.
3. **Auth model supports all role types**. The v1 user/role model supports adding `referee`, `club_staff`, `federation_official`, and `admin` roles via data changes, not code changes. v1 only uses `player` and `tournament_organizer` but the model accepts the others.
4. **API-first thinking**. The Next.js app should consume a clean API surface (Supabase PostgREST + Edge Functions) that TPS's Flutter app can consume when integrating Matchday features. Avoid shoving business logic into React components where it can't be reused.
5. **i18n keyed from day one**. No hardcoded English/Thai strings in the UI. All strings are i18n keys. Adding Indonesian in v2 is a bundle file, not a code change.
6. **Event-driven seams**. Important state transitions (`tournament.published`, `registration.confirmed`, `match.finalized`) emit domain events to a Supabase-native pub/sub channel, even if v1 has no subscribers. v2 features (rating push, notifications, federation reporting) subscribe later without touching the emitter.

**What this does NOT mean:**
- It does NOT mean build the v2 features now. Do not build them.
- It does NOT mean stub out every v2 feature with a fake implementation. Leave them unimplemented.
- It does NOT mean write defensive code for v2 edge cases. Write the v1 code simply.
- It does NOT mean the v1 data model should be abstract or generic. It should be concrete and padel-specific where it matters, but leave nullable space for growth.

**When in doubt**: if a v1 change would require a destructive schema migration (dropping a column, changing a primary key, altering an enum) to support a v2 feature listed in this document, that's a sign the v1 architecture missed something. Flag it, fix it in v1.

### 9.1 · Domain model

Core entities — for the new Claude Code session to refine. **Every entity below exists in the v1 schema, even if v1 does not write to it.** Tables that are empty in v1 reserve architectural space for v2+ features.
- `User` — platform account. Includes nullable `gender` (enum `male`/`female`/`other`/`prefer_not_to_say`) — reserved for v2 mixed-format pairing constraints.
- `PlayerProfile` — padel-specific profile on top of User (playing_hand, preferred_side, years_playing, home_club_id)
- `RatingProvider` — config row stub, empty in v1
- `PlayerProviderLink` — `(player_id, provider_slug, provider_player_id, ...)` — empty in v1
- `Venue` — Matchday-native venue (name, city, court_count, address)
- `Tournament` — top-level event. Format is `single_elim` in v1. Includes `match_format` enum (`best_of_1` / `best_of_3`), `last_set_rule` enum (`full_set` / `tiebreak` / `super_tiebreak`), `has_third_place_match` boolean. Schema can extend with new format values in v2.
- `Event` — a draw/category inside a tournament (e.g., "Men's Open", "Mixed 4.0")
- `Registration` — player/team → event
- `Team` — for doubles events
- `Draw` — bracket structure for an event
- `Match` — a single match in a draw. Key columns:
  - `status` enum (`upcoming` / `in_progress` / `completed`)
  - `scheduled_court` text, `scheduled_at` timestamptz — from TO scheduling
  - `set1_team_a` int nullable, `set1_team_b` int nullable — first set score
  - `set2_team_a` int nullable, `set2_team_b` int nullable — second set score
  - `set3_team_a` int nullable, `set3_team_b` int nullable — third set (tiebreak/super tiebreak, nullable if match ends in 2 sets)
  - `winner_team_id` uuid nullable FK → Team — populated on match completion
  - `match_type` enum (`standard` / `third_place`) — distinguishes the 3rd-place match from standard bracket matches
  - `scored_at` timestamptz nullable, `scored_by` uuid nullable FK → User (the TO who entered the score)
  - Match winner determination: first team to win 2 sets. Standard sets play to 6 games (tiebreak at 6-6). Last set follows tournament's `last_set_rule`: `full_set` (standard), `tiebreak` (first to 7, win by 2), or `super_tiebreak` (first to 10, win by 2).
- `Score` — richer polymorphic score table, empty in v1, reserved for v2 detailed per-sport/per-format scoring
- `RatingPush` — outbound result push record — empty in v1
- `Sanctioning` — optional federation link for a tournament — empty in v1
- `Payment` — entry fee transaction — empty in v1

### Sport abstraction
Even in v1 (padel only), the schema and code must treat **sport** as a first-class dimension. Padel is just the first `Sport` row. Scoring rules, format compatibility, and rating provider compatibility are all per-sport-configurable. v2 adds tennis/pickleball/badminton/squash without schema migrations — only new `Sport` rows, new `ScoringRule` rows, and new `RatingProvider` rows.

### Auth
- **v1 IdP**: **Supabase Auth** — email + magic link, plus **Facebook, Google, and Apple OAuth**. Matchday manages its own user accounts.
- **v2 extensibility**: TPS account linking API (v3), plus auth federation config as a table; adding a new provider is a config change, not a code change.

### Realtime strategy

**v1**: Supabase Realtime is used for **live bracket updates during tournaments**. Channel `tournament:{id}:bracket` broadcasts bracket state changes whenever the TO enters a score or a match status changes. Designed for ~100 concurrent viewers per tournament. Clients subscribe on mount, unsubscribe on unmount. The spectator mode (`?spectator=true`) uses the same channel.

**v2**: Realtime expands to include player-submitted scores (with dispute resolution), push notifications via OneSignal, and double-elimination bracket progression.

---

## 10 · Non-Functional Requirements

### i18n
Language investment follows the market priority from §4.

- **v1 launch languages (required)**: **TH, EN** — Thailand is P1 and ships fully translated
- **P2 next**: **ID (Bahasa Indonesia)** — added when Indonesia expansion begins
- **P3 rollout**: **MS (Malay), VI (Vietnamese), TL (Tagalog)** — added per market
- **P4 rollout**: **JA, KO, HI, ZH-Hans, ZH-Hant** — added per market, later
- **Architecture**: ICU message format, per-locale JSON bundles, adding a new locale must not require code changes beyond registering the locale
- **RTL-ready**: schema and component structure do not block future Arabic/Hebrew (irrelevant to APAC launch, but cheap to preserve)
- **Dates/times**: display in user's locale + tournament venue locale side-by-side
- **Numbers**: locale-aware formatting for scores, money, ratings

**Do NOT** translate into P4 languages in v1. It's wasted effort before those markets open.

### Payments — v2 only (see `matchday-v2-v9-reference.md` §3)

**v1 does NOT process payments.** v1 TOs collect entry fees offline (cash, bank transfer, LINE Pay, etc.) and describe payment instructions in the tournament's free-text entry-info field. The full payment architecture — country dispatch policy table, hosted-checkout-only rule, Money struct shape, idempotency, generic webhook receiver, reconciliation, refund interface, launch providers (Stripe + Omise for Thailand), and v2+ rollout backlog — is specified in `matchday-v2-v9-reference.md` §3.

**v1 architectural obligations** (per §9.0 full-backlog principle):
- Nullable `stripe_connect_account_id` and `omise_recipient_id` columns on the `User` table
- Empty `Payment` table in the v1 schema (no inserts ever, no runtime code references it)
- Zero payment UI, zero payment logic, zero `CountryPaymentPolicy` rows in v1

### Messaging / notifications
- **v1**: email notifications only (registration confirmation, partner invite, waitlist promotion, draw published, tournament cancellation)
- **v2**: push notifications via OneSignal (Web Push)
- **v6+**: LINE, WhatsApp, and regional messaging channels (per-market)

### Timezones
UTC in the database, always. Display in venue-local time as primary, user-local as secondary. Multi-day tournaments must handle DST correctly (minor issue in APAC but AU observes DST).

### Accessibility
- WCAG 2.1 AA baseline on web and mobile
- Bracket view must be navigable without a mouse/touch
- TO application form (including file upload) must be screen-reader accessible

### Performance
- Bracket render: **p95 < 300ms** on a mid-range phone browser
- Web LCP: **p95 < 2.5s** on 4G
- Realtime bracket update → all subscribed clients **p95 < 1s** under 100 concurrent viewers
- Registration submit round-trip: **p95 < 1s**
- v2 target (not in v1): live score update → all subscribed clients **p95 < 1s**
- Mobile browser: responsive pages must render correctly on 375px+ viewports

---

## 11 · Integration Contracts

### v1: No external integrations
Matchday v1 is fully standalone. No TPS API calls, no OIDC federation, no service tokens, no payment providers, no rating providers. All future integrations are documented in `matchday-v2-v9-reference.md`.

**v1 architectural obligations** (leave space for future integrations per §9.0):
- Nullable `stripe_connect_account_id` + `omise_recipient_id` on `User` table
- Nullable rating columns on `User` and `Match`
- Empty `Payment`, `RatingPush`, `Sanctioning` tables in schema

---

## 12 · Security & Compliance Baseline

- **RLS on every table** with user-scoped policies. Never bypass from client. RLS policy review is part of every PR that changes a table.
- **Server-side logic in Edge Functions** only. The Next.js client never talks to the DB except through RLS-filtered PostgREST queries.
- **Parameterized queries always.** Zero string concatenation into SQL.
- **No secrets in code, ever.** Supabase secrets + Vercel env vars + platform secret managers.
- **Tournament payments** (v2 only): no card data touches our systems. Use hosted checkout (Stripe Checkout, Omise Checkout). v1 does not process payments.
- **PDPA (Thailand) + GDPR (EU expats) + Korea PIPA + Japan APPI**: player data is exportable and deletable on request. Design data model with a `deleted_at` soft-delete column on all player-owned tables.
- **Rate limiting**: public endpoints rate-limited per IP; authenticated endpoints per user. Tournament registration: max 10 req/min per user. Partner search: max 30 req/min per user.
- **Audit log**: every draw modification, post-publish edit, TO-application review action, admin override, and role-change operation is logged immutably in v1. v2 adds score changes and payouts to the audit log as new event types.
- **OWASP Top 10**: Security Engineer reviews every PR explicitly against OWASP.

### 12.0 · Email Template Inventory (v1)

All emails sent via Resend. Each template is i18n-keyed (TH + EN). 11 templates in v1:

| # | Template | Trigger | Recipient |
|---|---|---|---|
| 1 | Application received | TO submits organizer application | Applicant |
| 2 | Application approved | Admin approves TO application | Applicant |
| 3 | Application rejected | Admin rejects TO application (includes reason) | Applicant |
| 4 | Registration confirmed | Player registers solo or doubles pair is confirmed | Player (+ partner for doubles) |
| 5 | Partner invite | Player invites a partner for doubles | Partner (magic-link to accept/decline) |
| 6 | Partner removed | Doubles player removes their partner | Removed partner |
| 7 | Partner declined | Partner declines the invite | Inviter |
| 8 | Invite expired | Registration closed while invite pending | Inviter |
| 9 | Waitlist promotion | Player promoted from waitlist to confirmed | Player |
| 10 | Draw published | TO publishes the tournament draw | All registered players |
| 11 | Tournament cancelled | TO cancels the tournament | All registered players |

### 12.1 · Secrets, Environments & Deployment Topology

**Environments** (v1 — matches TPS's trunk-based CD model):

| Env | Purpose | Supabase project | Always-on? |
|---|---|---|---|
| **Local dev** | Per-engineer development | Local Supabase CLI instance with seeded data | Yes (per engineer) |
| **CI** | Ephemeral per-PR test runs for unit + RLS integration + build checks | Ephemeral Supabase test project (spun up per CI run) | On-demand |
| **Prod** | The live production environment. All testing not covered by local + CI happens here behind PostHog feature flags. | Single prod Supabase project. PITR enabled. | Yes |
| **Staging** | **On-demand only**, not always-on, spun up by Lead Engineer for specific high-risk changes: DB migrations on existing tables, payment-processor integrations (v2), multi-service coordination, features >3 days of work, first-time third-party API integrations. | Separate Supabase project created when staging is needed, torn down after. | No — spun up as needed |

**Why this mirrors TPS**: TPS's CLAUDE.md is explicit: *"Code is tested locally + CI + feature flags in production. Staging is only for: DB migrations on existing tables, payment changes, multi-service coordination, features >3 days, first-time third-party API integrations."* Matchday adopts the same philosophy — one prod environment, test-in-prod via flags, staging on-demand. This keeps Matchday's ops surface tiny and aligned with TPS's engineering culture.

**Testing-in-prod discipline** (critical — the whole model depends on it):
- Every risky change ships behind a PostHog feature flag, default OFF
- Flags are enabled first for the team (PostHog user targeting), then rolled out 5% → 25% → 50% → 100% per §13 team conventions
- Unfinished features can land in main as long as their flag is OFF and CI passes
- A flag stays at 100% for one week before removal
- The cohort tournament enables its flags only after team-level dogfood has been clean for at least 48 hours

**Secrets inventory** (v1):

| Secret | Used for | Where it lives | Rotation cadence |
|---|---|---|---|

| `RESEND_API_KEY` | Transactional emails | Vercel server env (never client) | Quarterly |
| `SENTRY_DSN` | Error tracking | Vercel env (both client and server DSNs) | On compromise only |
| `POSTHOG_API_KEY` | Event tracking + feature flags | Vercel env | Annually |
| Supabase `service_role_key` | Server-side admin operations | Supabase secrets only — NEVER in Vercel client env, NEVER in code | On compromise only |
| Supabase `anon_key` | Client-side PostgREST queries (RLS-gated) | Vercel env, public | On compromise only |

**Hard rules** (enforceable in CI):
- Any secret in a `.env` file that isn't `.env.example` MUST be gitignored
- CI runs a secret-detection check on every PR (mirrors TPS's `ci.yml` `Check for secrets in code` step); any secret in the diff blocks merge
- `NEXT_PUBLIC_*` env vars are the ONLY ones Next.js exposes to the client; everything else is server-side only
- Supabase `service_role_key` is NEVER referenced from client code, period
- New secrets added in v1 must be documented in this table via the same PR that adds them

**Deployment**:
- `main` branch → auto-deploys to prod via Vercel's main-branch integration
- Database migrations run via `supabase db push` in CI on main-branch merges
- Rollback: Vercel's instant rollback to the previous deployment
- DB rollback: Supabase PITR (point-in-time recovery) on the prod project

---

## 13 · Team Conventions & Quality Gates

Mirror The Padel Society's engineering conventions (TPS `CLAUDE.md` is the reference, but Matchday is its own repo and ticket namespace):

- **Branch naming**: `{feat|fix|hotfix|chore|refactor}/MD-{ticket}-{slug}`
- **Trunk-based CD**: only `main` is long-lived; branches <2 days; rebase before PR
- **PR required approvals**: Lead Engineer + Security Engineer. No bypass.
- **Feature flags**: PostHog, named `md-{ticket}-{slug}`. Every PR declares flag Y/N.
- **Commits**: `{type}(MD-{ticket}): {description}`
- **Linters (zero tolerance)**:
  - Next.js: `yarn lint` + `npx tsc --noEmit`
  - Edge Functions: `deno lint`
- **Never disable lint rules**, never modify linter config without Lead approval

### 13.1 · Testing Strategy (matches current TPS practices)

TPS's actual testing footprint is minimal — verified 2026-04 by inspecting the TPS repos:
- `thepadelsociety-admin/` — **no test framework installed.** `package.json` scripts are `dev`, `build`, `start`, `lint` only. No Jest, no Vitest, no Playwright.
- `mobile-app-padel/` — only the default Flutter template `widget_test.dart`. No real widget or integration tests.
- `padel-backend/` — **Deno unit tests for tournament engine logic.** Files like `supabase/functions/src/__tests__/bracket.test.ts`, `bye-placement.test.ts`, `scoring.test.ts`. Tests use `Deno.test` + `assertEquals` from `deno.land/std/assert`. Focused on pure logic (no DB, no HTTP).

Matchday adopts the same pattern exactly. **Don't over-invest in testing infrastructure TPS doesn't have.**

**Matchday testing layers in v1**:

1. **Next.js admin panel** — no test framework in v1. Matches TPS admin. CI runs `yarn lint` + `npx tsc --noEmit` + `yarn build` + dependency audit + secret scan. Correctness is enforced by lint + type check + PR review by Lead Engineer + Security Engineer, not by automated UI tests.
2. **Supabase Edge Functions + domain logic** — **Deno unit tests** for seed-to-bracket draw generation and bye placement. Files at `padel-backend/supabase/functions/src/__tests__/*.test.ts` following the TPS convention. Each test file covers one module with `Deno.test("ISC-N: ...")` blocks.
3. **Feature flags as the test mechanism in prod** — per §12.1, risky changes ship OFF by default, get enabled for the team first, roll out 5% → 25% → 50% → 100%. This is how TPS validates most features in the absence of E2E tests.
4. **Manual QA pass before launch** — Pap or a designee runs through the full flow on prod behind a flag. Not automated.

**Explicitly NOT in v1 testing** (matches TPS's current state):
- No Playwright E2E — TPS doesn't have it; Matchday doesn't either
- No RLS integration tests — TPS doesn't have them; rely on PR review of RLS policies by the Security Engineer
- No load testing framework (k6 / Artillery) — TPS doesn't have it; the cohort is small enough that realistic usage is the load test
- No visual regression, no accessibility automation, no device-matrix testing
- No test coverage targets on the Next.js side (no tests to cover)

If v1.1 or v2 needs any of the above, the Lead Engineer proposes it as a deliberate addition and it gets budgeted explicitly.

---

## 15 · v1 Acceptance Criteria (ISC)

Claude Code can self-check v1 readiness against these. Every criterion is atomic and binary-testable. v1 is intentionally narrow — the cohort tournament is the north star. Progress on this list gates v1 launch.

### Auth + Identity
- [ ] ISC-01: User can sign up and sign in via Supabase Auth email + magic link
- [ ] ISC-01b: User can sign in via Facebook, Google, or Apple OAuth
- [ ] ISC-02: Successful auth creates or updates a local `User` row keyed by Supabase `auth.uid`
- [ ] ISC-03: On first login, user sees a profile completion form (display name, playing hand, preferred side) and data is stored in `User` table
- [ ] ISC-04: User signs out cleanly; subsequent requests return 401 until re-authenticated
- [ ] ISC-05: `User.roles` defaults to `['player']` for every new user

### TO Onboarding
- [ ] ISC-08: `/organizer/apply` page is accessible to any authenticated user and presents the TO application form
- [ ] ISC-09: Application form requires LINE ID, logo upload, and ToS agreement checkbox before submission
- [ ] ISC-10: Logo upload enforces 500×500 pixel output via a client-side square-aspect-ratio cropper
- [ ] ISC-11: Logo upload accepts PNG or JPG, rejects other formats, and caps upload size at 2 MB
- [ ] ISC-12: Uploaded logos land in the Supabase Storage `organizer-logos` bucket with RLS restricting writes to the uploading user
- [ ] ISC-13: Submitting an application creates an `OrganizerApplication` row with `status = 'submitted'` and stores optional fields (phone, WhatsApp, Instagram, website, Facebook, other social, reference) in `form_data` jsonb
- [ ] ISC-14: On submission, a "Application received" email is sent to the applicant via Resend in their active locale (TH or EN)
- [ ] ISC-15: `/admin/organizer-applications` is accessible only to users with the `admin` role
- [ ] ISC-16: Admin review page lists applications in a paginated list, newest first, with name + submitted date + status
- [ ] ISC-17: Admin can open an application detail view and see all form responses
- [ ] ISC-18: Admin Approve action transactionally adds `organizer` to `User.roles` and sets application status to `approved`
- [ ] ISC-19: Admin Approve action triggers the "Application approved" email via Resend with a link to create a first tournament
- [ ] ISC-20: Admin Reject action requires a non-empty reason text and sets application status to `rejected`
- [ ] ISC-21: Admin Reject action triggers the "Application rejected" email via Resend including the admin's reason
- [ ] ISC-22: Every Approve or Reject action writes an audit log row with user, timestamp, and the action taken
- [ ] ISC-23: A rejected applicant can reapply immediately (no cooldown in v1)
- [ ] ISC-24: Users with the `organizer` role see the "Create Tournament" CTA on their dashboard; users without it do not

### Venues + Partner Search
- [ ] ISC-25: TO can create a new venue inline during tournament creation (name, city, court count, court names, address)
- [ ] ISC-26: Venues are reusable — TO can select a previously created venue when creating a new tournament
- [ ] ISC-27: Matchday user search is called with a 300 ms debounce from the partner search UI
- [ ] ISC-28: User search is rate-limited to 30 requests per minute per user

### Tournament Creation + Registration
- [ ] ISC-31: Organizer creates a tournament with fields: name, dates, venue, draw size, match format (best-of-1 / best-of-3), last-set scoring rule (full set / tiebreak / super tiebreak), 3rd-place match toggle, free-text level band, free-text entry info
- [ ] ISC-31a: New tournaments are created in `draft` status and are visible ONLY to the creating TO and Matchday admins
- [ ] ISC-31b: Draft tournaments do NOT appear in the public tournament list or in any player's registration flow
- [ ] ISC-31c: TO transitions a tournament from `draft` to `registration_open` via an explicit "Publish tournament" action on the management hub or the dashboard draft card
- [ ] ISC-31d: Draw size input is a hybrid button group (`4 / 8 / 16 / 32 / 64`) plus a "Custom" option that reveals a numeric input
- [ ] ISC-32: Tournament format is `single_elim` only in v1 (no format picker needed — hardcoded)
- [ ] ISC-33: Organizer opens and closes the registration window via explicit actions
- [ ] ISC-34: Player browses the tournament list showing date, venue, format, and registration status
- [ ] ISC-35: Player registers solo with one click; registration auto-accepts until draw capacity is reached
- [ ] ISC-36: Player registers for doubles by searching Matchday users and selecting a partner
- [ ] ISC-37: Partner receives an invite email via Resend with a magic-link confirmation URL
- [ ] ISC-38: Partner clicks the link, signs in via Supabase Auth (account auto-provisioned if needed), and sees an accept/decline prompt
- [ ] ISC-39: Partner accept transitions the doubles registration to confirmed; partner decline rolls back the solo half
- [ ] ISC-40: Registrations beyond draw capacity auto-transition to `waitlist` status
- [ ] ISC-41: Organizer can manually remove a registration or promote a waitlisted registration
- [ ] ISC-42: Solo registrants and confirmed doubles pairs receive a registration confirmation email via Resend
- [ ] ISC-42b: Waitlisted player receives an email notification when promoted to confirmed
- [ ] ISC-42c: Tournament pages have OpenGraph meta tags for rich link previews when shared on LINE/WhatsApp

### Draw Generation + Bracket View + Scheduling
- [ ] ISC-43: Organizer manually seeds single-elim players via drag-and-drop into seed slots
- [ ] ISC-44: Single-elim generator produces a bracket with correct bye placement — top seeds automatically receive first-round byes for non-power-of-2 draw sizes
- [ ] ISC-45: (Removed)
- [ ] ISC-46: Bracket view renders via `@g-loot/react-tournament-brackets` or an equivalent off-the-shelf library (not hand-rolled)
- [ ] ISC-47: (Removed)
- [ ] ISC-48: Organizer schedules each match to a specific court + time window
- [ ] ISC-49: Organizer regenerates the draw before publish without a permanent record of the discarded version
- [ ] ISC-50: Organizer publishes the draw via an explicit action; the draw becomes visible to registered players
- [ ] ISC-50b: "Draw published" email is sent to all registered players when the TO publishes the draw
- [ ] ISC-51: Post-publish edits (player swaps, withdrawals, schedule changes) are permitted until the tournament start date
- [ ] ISC-52: Every post-publish edit writes an audit log row with user, timestamp, and before/after snapshot

### Live Scoring + Bracket Progression
- [ ] ISC-53: TO can start a tournament, transitioning it to `live` state
- [ ] ISC-53b: Match status transitions: `upcoming` → `in_progress` → `completed`
- [ ] ISC-53c: TO can enter per-set scores for any match (e.g. 6-4, 7-5, 10-8)
- [ ] ISC-53d: Last set scoring follows the tournament's configured rule (full set / tiebreak / super tiebreak)
- [ ] ISC-53e: Score validation enforces valid padel/tennis scoring rules
- [ ] ISC-53f: On match completion, winner auto-advances to the next bracket slot via Edge Function
- [ ] ISC-53g: Supabase Realtime broadcasts bracket updates on channel `tournament:{id}:bracket`
- [ ] ISC-53h: All connected clients see bracket updates within 1s p95 under 100 concurrent viewers
- [ ] ISC-53i: TO can mark a walkover (no scores, opponent advances) or retirement (partial scores recorded, opponent advances)
- [ ] ISC-53i2: TO can undo a walkover — cascading reset of downstream matches if needed
- [ ] ISC-53j: Tournament auto-completes when the final match is scored
- [ ] ISC-53k: Every score entry/edit writes an audit log row

### Placements + Spectator
- [ ] ISC-54: Placements auto-derived from bracket (1st = winner, 2nd = finalist, 3rd/4th = semi-finalists)
- [ ] ISC-55: TO can manually override auto-derived placements (audit-logged)
- [ ] ISC-56: Players see final placements on the public tournament page after the event
- [ ] ISC-57: Spectator mode (`?spectator=true`) hides navigation, enlarges bracket, auto-refreshes via Realtime
- [ ] ISC-58: "My next match" card is visible on the player's tournament page showing court, time, opponent, round
- [ ] ISC-59: "My next match" updates when bracket progresses (previous-round opponent decided)

### Tournament Cancellation
- [ ] ISC-60: TO can cancel a tournament — all registered players receive cancellation email, registrations voided

### Non-functional
- [ ] ISC-61: App launches fully translated in TH and EN, including all email templates
- [ ] ISC-62: Adding a new locale requires only a new JSON bundle + a locale registration row, zero code changes elsewhere
- [ ] ISC-63: Every user-scoped DB table has RLS policies enforced and covered by at least one integration test
- [ ] ISC-64: Next.js lint and `tsc --noEmit` report zero warnings in CI
- [ ] ISC-65: Deno lint reports zero warnings on Edge Functions in CI
- [ ] ISC-66: Bracket view renders in <300 ms p95 on a mid-range phone browser
- [ ] ISC-67: Web LCP is <2.5 s p95 on 4G
- [ ] ISC-68: Realtime bracket updates propagate to all subscribed clients within 1s p95 under 100 concurrent viewers
- [ ] ISC-69: WCAG 2.1 AA accessibility smoke test passes on the registration flow, bracket view, admin review page, and TO application form
- [ ] ISC-70: Full end-to-end simulation (sign up → TO apply → admin approve → create tournament → register solo + doubles → draw → start → TO scores all matches → bracket completes → placements visible → spectator mode verified) passes in staging with zero blocker defects before v1 launch

---

## 16 · Anti-Requirements (AR — what NOT to build in v1)

### Build restrictions (what NOT to implement in v1)
- [ ] AR-01: Do NOT build Matchday's own rating algorithm, ever (we integrate with an external provider — in v3)
- [ ] AR-02: Do NOT build any rating UX in v1 — no rating display, no rating-based seeding, no rating leaderboard, no rating history. All rating work is v3.
- [ ] AR-03: Do NOT build a Flutter mobile app — Matchday is a responsive web product. TPS is the mobile surface for players.
- [ ] AR-04: Do NOT build entry fee payment collection in v1 — no Stripe integration, no Omise integration, no checkout flow. TOs collect fees offline.
- [ ] AR-05: Do NOT build player-mode or referee-mode scoring in v1 — only TO can enter scores. Player scoring + dispute flow arrives in v2. Referee mode arrives in v7.
- [ ] AR-06: Supabase Realtime in v1 is scoped to the bracket update channel only (`tournament:{id}:bracket`). Do NOT add other Realtime channels in v1.
- [ ] AR-06b: Do NOT build any tournament format other than single-elimination in v1.
- [ ] AR-07: Do NOT build referee or official features in v1
- [ ] AR-08: Do NOT build federation sanctioning UI in v1
- [ ] AR-09: Do NOT support tournament formats other than single elimination in v1. Double elim is v2; round robin + groups+KO is v4.
- [ ] AR-10: Do NOT support sports other than padel
- [ ] AR-11: Do NOT build court reservation (TPS owns this domain)
- [ ] AR-12: Do NOT build coach/lesson booking (TPS owns this domain)
- [ ] AR-13: Do NOT merge the Matchday codebase into the TPS codebase
- [ ] AR-14: Do NOT bypass Supabase RLS from any client
- [ ] AR-15: (Removed — Matchday has no Flutter code)
- [ ] AR-16: Do NOT build livestream video in v1 or v2
- [ ] AR-17: Do NOT commit secrets, `.env` files, or service role keys
- [ ] AR-18: Do NOT skip pre-commit linter runs
- [ ] AR-19: Do NOT merge a PR without both Lead Engineer and Security Engineer approval

### Architectural obligations (what the v1 code MUST do even though the feature is deferred)
These are the counter-weights to the build restrictions above — "don't build X, but DO leave room for X." See §9.0 for the philosophy.

- [ ] AR-20: DO ship the full entity schema from §9.1 in v1 — including empty tables for Payment, Score, RatingPush, Sanctioning
- [ ] AR-21: DO define the `RatingProvider` and `PaymentProvider` interfaces as TypeScript types in v1, even though no concrete adapters exist
- [ ] AR-22: DO ship a `Sport` table with padel as the first row, not a constant enum — v2 sports are data, not code changes
- [ ] AR-23: DO model user roles as data, not constants — v2 referee/federation/admin roles are role-rows, not schema changes
- [ ] AR-24: DO use the `{amount_minor, currency_code}` Money shape on any fee-related column from v1, even though no money flows in v1
- [ ] AR-25: DO emit domain events (`tournament.published`, `registration.confirmed`) from v1 even if no subscriber exists yet — v2 features subscribe without touching the emitter
- [ ] AR-26: DO NOT use `if country == X` conditionals anywhere in code (even for non-payment country-specific logic) — country behavior lives in config tables
- [ ] AR-27: DO ship all user-visible strings as i18n keys from day one, never hardcoded — adding a new locale in v2 is a bundle file, not a code change

---

## 16b · Product Roadmap

See `matchday-v2-v9-reference.md` for the full v2-v9 roadmap with detailed feature specs for each version.

---

## 17 · Open Questions (Claude Code must ask Pap)

These are v1-critical.

1. **v1 cohort tournament identity**: which specific Thailand padel tournament is v1's beta? Organizer name, venue, expected draw size, expected player count, target start date.
2. **Repo strategy**: single `matchday-web/` repo for v1 (recommended), or two repos (`matchday-web/` + `matchday-backend/`) from day one?
3. **Branding**: logo, color palette, typography, product voice — does Pap have existing brand assets, or does Matchday need a quick design sprint before v1 build starts?
4. **Organizer interaction**: how close is Pap to the v1 cohort organizer? Are they willing to be on a weekly call during the v1 build to validate assumptions and test in staging?
5. **On-site support at the cohort tournament**: who runs it? Is there a Matchday-side technical operator on site during the tournament, or is the TO trained to self-serve?

---

## 18 · Screen Specifications (UI/UX)

This section specifies the primary screens each persona sees in v1. It does NOT dictate pixel-level layout — that's for the Designer role during the v1 build — but it DOES lock in the information architecture, key actions, and the UX pattern choices that have already been made in this session so the Claude Code implementer doesn't re-debate them.

### 18.0 · Screen inventory (all personas)

~23 screens in v1 total, grouped by persona. Shared layouts (e.g., public vs. authenticated tournament detail) reduce real component count.

| # | Screen | Path | Personas |
|---|---|---|---|
| Public / unauth |
| 1 | Landing page | `/` (unauth) | Public |
| 2 | Sign-in | `/login` | Public |
| 3 | Tournament detail (public) | `/tournaments/[id]` | Public |
| Player |
| 4 | Player home / dashboard | `/` (auth) | Player |
| 5 | Tournament list | `/tournaments` | Player |
| 6 | Tournament detail (auth, with register CTA) | `/tournaments/[id]` | Player |
| 7 | Partner search modal | (modal from tournament detail) | Player |
| 8 | Partner invite accept | `/invite/[token]` | Player |
| 9 | My registrations | `/me/registrations` | Player |
| 10 | Settings | `/me/settings` | Player |
| Organizer (TO) |
| 11 | Organizer dashboard | `/organizer` | Organizer |
| 12 | Create tournament | `/organizer/tournaments/new` | Organizer |
| 13 | Tournament management hub | `/organizer/tournaments/[id]` | Organizer |
| 14 | Registrations tab | `/organizer/tournaments/[id]/registrations` | Organizer |
| 15 | Draw tab (seeding + generation + publish) | `/organizer/tournaments/[id]/draw` | Organizer |
| 16 | Schedule tab (court × time grid) | `/organizer/tournaments/[id]/schedule` | Organizer |
| 17 | Placements tab (post-tournament) | `/organizer/tournaments/[id]/placements` | Organizer |
| 18 | Organizer public profile | `/organizer/[slug]` | Public / Player |
| TO Application flow |
| 19 | Apply to be an organizer | `/organizer/apply` | Player (applying) |
| 20 | My application status | `/organizer/apply/status` | Player (applicant) |
| Matchday Admin |
| 21 | Admin dashboard | `/admin` | Admin |
| 22 | Organizer applications list | `/admin/organizer-applications` | Admin |
| 23 | Organizer application detail | `/admin/organizer-applications/[id]` | Admin |

### 18.1 · Organizer screens

#### Journey
```
Player clicks "Become an organizer" in header
  → /organizer/apply (fills form per §7.6)
  → /organizer/apply/status "Submitted"
  → (waits for approval email)
  → /organizer (first visit as approved TO, empty state)
  → "Create your first tournament"
  → /organizer/tournaments/new (single-page form)
  → /organizer/tournaments/[id] (management hub with tabs)
  → Details tab (edit meta)
  → Registrations tab (open registration, monitor signups, close)
  → Draw tab (drag-drop seeding, generate bracket, publish)
  → Schedule tab (drag matches into court × time grid)
  → (tournament happens offline)
  → Placements tab (enter final ranks)
```

#### Screen 11 — Organizer dashboard (`/organizer`)
The TO's landing page after approval. **Layout decision: grouped by status.**

**Empty state** (no tournaments yet):
- Welcome header with TO name + logo
- Primary CTA: "Create your first tournament"
- Secondary link: "View my public organizer profile"
- Help box: 3-4 bullet points on what TOs can do on Matchday

**Populated state**:
- Header: TO name + logo + "Create new tournament" button (top-right)
- **Four** grouped sections (drafts get their own section so the TO never loses track of unpublished work):
  - **Drafts** — tournaments in `draft` status, not yet visible to anyone but the TO
  - **Upcoming** — registration open or draw published but tournament hasn't started
  - **In progress** — tournament date is today or within the tournament window
  - **Past** — final placements entered or tournament end date passed
- Each tournament card: name, dates, venue, format badge, registration count / draw size, status chip, click-through to management hub
- Draft cards additionally show a subtle "Draft" tag and a secondary "Publish" button for one-click transition when the TO is ready

#### Screen 12 — Create tournament (`/organizer/tournaments/new`)
**Layout decision: single-page form.** Fields in order:

1. **Tournament name** — text, required
2. **Tournament dates** — start + end date picker, required
3. **Venue** — searchable dropdown of existing Matchday venues + "Create new venue" inline option. Show venue name, city, court count inline so the TO can confirm. Required.
4. **Draw size** — hybrid button group `4 / 8 / 16 / 32 / 64` plus a "Custom" option that reveals a numeric input. Required.
6. **Level band** — free-text (e.g. "Intermediate 3.0-4.0"), optional
7. **Entry info** — multi-line free-text, required. Example: "Entry fee 500 THB. Pay via LINE @papadel or bank transfer to Kasikorn 123-4-56789." Matchday displays this on the public tournament page; Matchday does NOT process payments in v1.
8. **Registration window** — open + close date-times. Defaults: open = now, close = tournament start − 1 day.

Bottom: **"Create tournament"** primary button. On submit, create the row with `status = draft`, redirect to `/organizer/tournaments/[new_id]`.

#### Screen 13 — Tournament management hub (`/organizer/tournaments/[id]`)
**Layout pattern: horizontal tabs.** Visible tabs: **Details · Registrations · Draw · Schedule · Scoring · Placements**.

Top header bar (persistent across tabs):
- Tournament name (large)
- Status chip: `draft` / `registration_open` / `registration_closed` / `published` / `live` / `completed` / `cancelled`
- Quick actions depending on current state:
  - `draft` → "Open registration"
  - `registration_open` → "Close registration"
  - `registration_closed` → "Publish draw" (if draw generated)
  - `published` → "Start tournament" (transitions to `live`)
  - `live` → "Cancel tournament" (destructive, confirm modal)
- Link to public tournament detail page (preview)
- Link to spectator mode (`?spectator=true`)

**Details tab**: same form as Create, in edit mode. Plus a "Danger Zone" section at the bottom with "Cancel tournament" button.

#### Screen 14 — Registrations tab (`/organizer/tournaments/[id]/registrations`)
The TO's workhorse during registration window.

Top bar:
- Counter: e.g. "14/16 registered · 2 waitlisted"
- Registration window status + time remaining to close
- Search input: filter by player name

Table columns:
- Player name
- Partner name (doubles only)
- Home club
- Status chip (`confirmed` / `pending_partner` / `waitlist` / `withdrawn`)
- Registered at (timestamp)
- Actions: Remove · Move to waitlist · Promote from waitlist

Empty state: "No registrations yet. Registration opens [date]" or "Registration is closed and had no signups."

#### Screen 15 — Draw tab (`/organizer/tournaments/[id]/draw`)
**The hardest v1 screen.** Two layouts depending on tournament format.

**Single-elimination layout** — **drag-and-drop seeding**:
- Two-pane split: left = "Unseeded players" list (drag source), right = "Seed slots" (drop targets) numbered 1..N (N = draw size)
- TO drags a player from left into a seed slot
- Filled seed slots show player name + small club badge
- "Generate draw" primary button — disabled until all required seed slots are populated; byes are auto-placed for non-power-of-2 sizes
- Below: "Bracket preview" rendered via `@g-loot/react-tournament-brackets` (or equivalent library) — read-only until published
- After generation, primary button becomes **"Publish draw"**; secondary **"Regenerate"** (destructive confirm)
- After publish, banner appears: "Draw is live. Post-publish edits are permitted until tournament start and will be audit-logged."

**Shared**:
- Draw audit log panel (collapsible): timeline of every draw edit with user + timestamp + before/after snapshot

#### Screen 16 — Schedule tab (`/organizer/tournaments/[id]/schedule`)
**Layout decision: court × time grid with drag-and-drop.** Second-hardest v1 screen.

- Header: day selector (if tournament is multi-day), "Clear schedule" destructive button
- Left sidebar: "Unscheduled matches" — drag source
- Main area: a grid
  - Rows = courts, labeled with the court names from the venue
  - Columns = time slots, configurable interval (30 min default)
  - Cells = drop targets for matches/rounds
- Conflict detection (highlighted in red):
  - Two matches scheduled in the same cell (shouldn't be possible via drop, but shown if data is inconsistent)
  - A player double-booked across two cells at the same time
  - A referee (v2) double-booked
- Library recommendation: `dnd-kit` for drag-and-drop; calendar grid can be hand-rolled as a simple CSS grid, or use `react-big-calendar` if time permits

#### Screen 16b — Scoring tab (`/organizer/tournaments/[id]/scoring`)
**Visible only when tournament is in `live` state.** The TO's scoring workhorse during the tournament.

Layout:
- **Match list** grouped by round (Round 1, Quarter-finals, Semi-finals, Final)
- Each match row shows:
  - Match status badge (`upcoming` / `in_progress` / `completed`)
  - Court + scheduled time
  - Team A names vs Team B names
  - Per-set score inputs (e.g. Set 1: `[6]-[4]`, Set 2: `[7]-[5]`)
  - Last set follows tournament's configured rule (full set / tiebreak / super tiebreak) — label shown
  - "Submit score" button per match
  - "Walkover" button (opponent auto-advances)
- Completed matches show scores in read-only with an "Edit" affordance (audit-logged)
- On score submit: server validates, persists, auto-advances winner to next round, broadcasts Realtime update
- **Live bracket preview** sidebar: compact bracket view (same Realtime subscription) so the TO can watch progression as they enter scores
- **Tournament completion**: when the final match is scored, a "Tournament complete" banner appears with auto-derived placements

#### Screen 17 — Placements tab (`/organizer/tournaments/[id]/placements`)
Hidden until tournament is `completed`.

- **Auto-derived placements** shown: 1st (winner), 2nd (finalist), 3rd/4th (semi-finalists), etc.
- TO can **override** any placement via an edit control (audit-logged) — for edge cases like disqualifications
- "Publish placements" button (if not auto-published on tournament completion)
- After publish, placements become visible on the public tournament detail page
- Placements remain editable by the TO indefinitely — every edit is audit-logged

#### Screen 18 — Organizer public profile (`/organizer/[slug]`)
Read-only public page anyone can view.

- Top: organizer logo (500×500) + name + entity type (if specified)
- Contact row: LINE ID, WhatsApp, Instagram, website, Facebook (only the ones filled in)
- Tabs: "Upcoming tournaments" and "Past tournaments", each listing the organizer's events
- No edit controls — the organizer edits their profile from `/me/settings` or equivalent

#### Screen 19 — Apply to be an organizer (`/organizer/apply`)
Already fully specced in §7.6. Visible to any authenticated player who is not already an organizer.

#### Screen 20 — My application status (`/organizer/apply/status`)
Shown after submission. Three states:
- **`submitted`**: "Your application is submitted and awaiting review. You'll receive an email when the admin team decides."
- **`approved`**: "You're now a Matchday organizer!" + CTA to `/organizer`
- **`rejected`**: "Your application wasn't approved. Reason: [admin's reason text]. You can reapply any time." + "Reapply" button that takes them back to `/organizer/apply` with the form pre-filled from their prior submission

### 18.2 · Player screens

#### Journey
```
Unauth landing → Sign in with TPS → Player home →
Tournament list → Tournament detail → Register (solo or partner search modal →
partner email invite → /invite/[token] accept) → (wait) → Tournament day →
Web Push fires → View tournament (live leaderboard / bracket / my-next-match card) →
Event ends → View placements → History in /me/registrations
```

#### Screen 4 — Player home / dashboard (`/` when authenticated)
**Layout decision: personal hub** — player's context first, discovery second.

Sections top-to-bottom:
1. **Global header** (shared across all auth pages): Matchday logo, global nav (Tournaments · My Registrations · Organizer if approved), avatar menu on the right (Profile → TPS, Settings, Sign out), TH/EN language switcher
2. **Personal greeting** with player name + avatar
3. **My upcoming tournaments** (conditional — shown only if active registrations exist): horizontal card list, each showing tournament name, dates, venue, format badge, and a next-action hint (e.g. "Your bracket is live" / "Waiting for partner to confirm" / "Match starting in 2 hours")
4. **My active tournament** (conditional — only if one of the player's tournaments is happening today or right now): large prominent card featuring the bracket link and the "my next match" card
5. **Discover tournaments**: next 5 tournaments the player is NOT yet registered for, sorted by start date ascending
6. **Empty state** (first visit, no registrations): large "Browse tournaments" CTA + short "what to expect" explainer

#### Screen 5 — Tournament list (`/tournaments`)
**Layout decision: chronological list with a name search input.** No date/level/format/location filters in v1.

- Top: a search input that filters the visible list by tournament name (client-side substring match, accent-insensitive, works for Thai + English). Useful when Thai-named and English-named tournaments co-exist in the list.
- Body: list of tournament cards, sorted by `start_date` ascending
- Each card: tournament name, host club name, dates, format badge, draw size, registration status chip (`Open` / `Closed` / `Waitlist` / `In progress` / `Completed`)
- Tap a card → tournament detail
- **Draft tournaments do NOT appear here** (only the creating TO sees drafts, on their organizer dashboard)
- Empty state: "No tournaments available right now"

#### Screen 6 — Tournament detail (`/tournaments/[id]`)
**The most important player-side screen.** Shared layout between public (unauth) and authenticated players. Some sections appear only when authenticated.

Sections top-to-bottom:
1. **Header**: tournament name, status chip, venue name + city
2. **Facts row**: dates, free-text level band
3. **Register CTA** (auth only, registration open, not already registered): two buttons — "Register solo" and "Register with a partner" — or a single "Withdraw" button if already registered
4. **Entry info** (free-text written by the TO): payment instructions, contact info, rules, etc.
5. **Live bracket view** (once draw is published): `@g-loot/react-tournament-brackets` for single-elim. Updates in realtime via Supabase Realtime as TO enters scores. Matches show status (upcoming / in progress / completed) and per-set scores. Spectator mode available via `?spectator=true`.
6. **My next match card** (auth only, player has a scheduled upcoming match): court, scheduled time, opponent names, round. Updates when bracket progresses (previous-round opponent decided).
7. **Final placements** (once the event is over): auto-derived from bracket (1st = winner, 2nd = finalist, 3rd/4th = semi-finalists). TO can override.
8. **Venue info**: address + courts + optional map
10. **Footer**: "Hosted by [organizer logo + name]" with click-through to the organizer's public profile

#### Screen 7 — Partner search modal
**Layout decision: full-screen overlay on mobile, centered modal on desktop.** Triggered from the tournament detail page when a logged-in player taps "Register with a partner".

Flow:
1. Text input with placeholder "Search by name or email" — auto-focused on open
2. 300 ms debounced query against Matchday user search
3. Max 10 results per query, shown as avatar cards (name + "Invite" button). No "Load more" in v1 — refine query instead
4. On "Invite", modal shows confirmation "Invite [partner name] to play [tournament name]?" → Send
5. On Send: emails the magic-link invite via Resend, closes the modal, and shows "Registration pending — waiting for [partner name] to confirm" on the tournament detail page
6. Empty state: "No matching users — ask your partner to create a Matchday account first"
7. Rate-limit error (30 req/min/user): "Slow down — too many searches. Try again in [N] seconds"
8. Close via the back button on mobile, X button on desktop, or Esc key on keyboard

#### Screen 8 — Partner invite accept (`/invite/[token]`)
Landing page when a partner clicks the email magic link.

States:
1. **Unauthenticated**: redirect to Matchday sign-in (email + magic link), return to the invite page after auth
2. **Authenticated, pending**: shows tournament name, dates, venue, inviting player's name + avatar, and "Will you be [inviter]'s partner in [tournament]?" with two buttons — **Accept** (primary) and **Decline** (secondary)
3. **Accepted**: both halves of the registration transition to `confirmed`; confirmation email sent to both; auto-redirect to the tournament detail page
4. **Declined**: solo half rolled back; polite confirmation screen; notification email sent to the inviter
5. **Already responded**: shows the prior response; no new action
6. **Expired** (registration window closed before the partner responded): "This invitation has expired" + link back to the tournament list
7. Magic-link tokens are single-use per response (accept or decline) and time-limited to the tournament's registration close date

#### Screen 9 — My registrations (`/me/registrations`)
Player's personal registration history.

- Top: tab selector — **Upcoming** (default) / **Past**
- Each row: tournament name, dates, format, partner (if doubles), status chip, tap to open tournament detail
- Upcoming sorted ascending; Past sorted descending
- Pending-partner rows highlighted with a subtle yellow accent and "Waiting for [partner] to confirm" subtext
- Empty state: "You haven't registered for any tournaments yet" + "Browse tournaments" CTA

#### Screen 10 — Settings (`/me/settings`)
**Layout decision: minimal.**

Sections:
1. **Profile** (editable): display name, email (read-only, from auth), playing hand, preferred side
2. **Language**: TH / EN toggle (defaults to browser locale)
3. **Notifications**: email notification preferences (v1 — Web Push arrives in v2)
4. **Sign out** button: clears the Supabase session, redirects to public landing
5. **Delete my Matchday data** (PDPA/GDPR compliance): opens a confirmation dialog that explains what gets deleted (account, registrations, notifications, audit log entries)

### 18.3 · Admin screens

Three screens. Volume is very low (Pap + possibly 1-2 designees; a handful of organizer applications per month in v1). All admin screens are gated to users with `admin` in their `User.roles` array.

#### Screen 21 — Admin dashboard (`/admin`)
Thin landing page for admin users.

- **Header**: "Matchday Admin" + signed-in admin name
- **Pending applications counter**: "3 organizer applications awaiting review" (or "0 — all caught up") with a link to Screen 22
- **Recent activity feed** (v1.1 optional; cut from v1 if tight): last 10 admin actions from the audit log (approvals, rejections, role grants)
- **Quick links**: Organizer applications · Audit log (v2) · System health (v2)
- No dashboard metrics in v1 — this is a landing page, not an analytics surface

#### Screen 22 — Organizer applications list (`/admin/organizer-applications`)
Fully specced in §7.6. Summary of the layout:

- Paginated list of all `OrganizerApplication` rows, newest first
- Columns: applicant name · submitted date · LINE ID · status chip (`submitted` / `under_review` / `approved` / `rejected`) · click-through to detail
- **No filters, no search, no bulk actions in v1** — expected volume is ~1-5 applications total for the cohort
- Empty state: "No applications yet"

#### Screen 23 — Organizer application detail (`/admin/organizer-applications/[id]`)
Full read-only view of a single application.

- **Header**: applicant name + submitted date + current status chip
- **Applicant profile box**: avatar, name, email, phone
- **Application form responses**: all fields from the §7.6 form displayed as a labeled key/value list
  - Required fields (LINE ID, logo preview, ToS acknowledgment timestamp)
  - Optional fields (phone, WhatsApp, Instagram, website, Facebook, other social, reference) — shown only if filled
- **Logo preview**: displayed at 500×500
- **Actions** (conditional on current status):
  - `submitted` or `under_review` → **Approve** (primary) and **Reject with reason** (secondary)
  - `approved` → read-only banner "Approved on [date] by [admin]"
  - `rejected` → read-only banner "Rejected on [date] by [admin]. Reason: [reason]"
- **Reject action**: opens a modal requiring a reason text (min 10 chars, max 500 chars). Submit → audit log write → rejection email via Resend → banner updates
- **Approve action**: single-click → transactional `User.roles += 'organizer'` + audit log write + approval email via Resend → banner updates
- **Audit log section** (always visible): timeline of every action taken on this application, with user + timestamp + action + optional reason

### 18.4 · Public / unauthenticated screens

Three screens. These are the surfaces a non-logged-in visitor sees.

#### Screen 1 — Landing page (`/` when unauthenticated)
The marketing surface. Design + branding is a Designer-role deliverable during the v1 build, not prescribed here. The structural spec:

- **Hero**: product name "Matchday" + short tagline ("Tournament operations for Asia-Pacific racket sports") + primary CTA "Sign up" / "Sign in"
- **What it does** (3-column value prop): "Run padel tournaments with live scoring" · "Players see brackets update in realtime" · "From registration to final results — all in one place"
- **Sample tournament cards** (live pull from upcoming published tournaments — same data that powers Screen 5, but no auth required to read)
- **How it works** (TO flow in 4 steps): Apply → Create → Publish → Run
- **Part of TPS ecosystem** section: explains that Matchday is built by The Padel Society team for the Asia-Pacific padel community
- **Footer**: Matchday logo · privacy · terms · contact · language switcher (TH/EN)

#### Screen 2 — Sign-in (`/login`)
The auth entry point. Deliberately minimal.

- **Page content**: Matchday logo centered + three social sign-in buttons (Facebook, Google, Apple) + divider "or" + email input + "Send magic link" button
- Social sign-in: one-click OAuth flow via Supabase Auth
- Email magic link: on submit, Supabase Auth sends a magic link email
- On successful auth, Matchday creates or updates the local `User` row and redirects to `/` (player home). New users see the profile completion form.
- **Error states**:
  - Invalid email → "Please enter a valid email address."
  - Magic link expired → "This link has expired. Request a new one."
  - Rate limit → "Too many sign-in attempts. Try again in a few minutes."
  - OAuth error → "Sign-in was cancelled. Try again."

#### Screen 3 — Tournament detail (public) (`/tournaments/[id]` when unauthenticated)
Shared layout with Screen 6 (authenticated tournament detail). Differences when viewed by an unauthenticated visitor:

- **Register CTA is replaced** with "Sign in to register" — clicking it starts the sign-in flow and returns to this tournament detail page after auth
- **My next match card is hidden** (no auth = no player context)
- **Bracket view is visible** (public data)
- **Final placements are visible** when the event is over
- **Entry info, venue info, organizer info** — all visible
- Draft tournaments return 404 Not Found to unauthenticated visitors (and to any non-admin authenticated visitor who is not the creating TO)

---

**§18 complete**: 23 screens specified across 4 persona groups (Organizer, Player, Admin, Public). Screen inventory table in §18.0 is authoritative.

---

## 19 · First Action

**You (Claude Code in the fresh session) must do this as your very first response to this prompt:**

1. Reply with:
   ```
   Matchday build prompt received. Summary of my understanding: [2-3 paragraphs
   covering the mission, v1 scope, live scoring + Realtime architecture, and the
   cohort target].
   Before I write any code, I need to complete the confirmation gate.
   ```
2. Present the §6 CONFIRMATION GATE questions via `AskUserQuestion`.
3. Present the §17 Open Questions via a second `AskUserQuestion`.
4. Write answers to `DECISIONS.md` at the repo root.
5. Propose a phased build plan and ask for approval to begin.
6. Only after build plan approval, begin scaffolding.

**Do not skip any step above.** This prompt exists because Pap wants alignment before code.

---

---

## 20 · Appendix — Competitive Research Summary

This appendix captures the competitive landscape as of 2026-04-12. It's not authoritative spec — it's context so the Claude Code session understands what Matchday is differentiating against without re-running the research.

### 20.1 · Competitors investigated

| Product | Category | Platform | Verdict |
|---|---|---|---|
| **WeCourts** | Rating-first padel platform | Web + iOS + Android | Strong in MENA. Rating (WPPR) is the moat; organizer tooling is thin. Geo-blocks non-MENA IPs. |
| **Padelution** | Multi-format padel tournament tool | Web + iOS + Android + macOS | Finnish, launched June 2025, ~2K downloads, free, no monetization disclosed. Bracket-only "Quick Tournaments"; Americano lives in a separate heavier Events/Leagues module. Not in the "instant Americano" space. |
| **Americano Padel App** | Americano-specialized tournament app | iOS + Android (Flutter) + Flutter Web spectator | Strongest head-to-head competitor. 75+ countries, 4.9 rating, player-freemium + TO subscription. Mobile-first — no web TO dashboard. 6 format variants at launch. Anonymous device-scoped auth. TV display link is premium-gated Flutter Web canvas (unreliable on venue TVs). |
| **Playtomic Tournaments** | Booking-first padel super-app's tournament module | Mobile + web | Industry leader for padel booking. Tournament module is secondary and thin. Weak in Asia. |
| **BracketMaker / americanopadel.app / Padelpuffin / Padel Point / PadelMix** | Niche Americano tools | Mix | Long tail of small tools. Mostly PDF generators or watch companions. |

### 20.2 · Where Matchday is structurally better than competitors (v1 alone)

1. **Web-first TO dashboard** — Americano Padel App has no web UI for organizers. Matchday's web-first approach is better for tablet-based event running in Thai clubs.
2. **Durable accounts** — Americano Padel App uses anonymous Firebase auth (lose phone = lose tournament); Matchday's email-based accounts provide data portability and durability.
3. **Explicit rotation math** — §9.2 has a deterministic classification for every player count (perfect vs. imperfect) with honest TO preview. Competitors gloss over imperfect counts.
4. **Named-court selection** — Matchday lets TOs pick specific courts by name from the host club's list. Competitors use generic court numbers.
5. **Deep rating integration** (v2) — none of the competitors have this. WPPR-style "see exactly how your rating changed" is a clean wedge for v2.
6. **Transparent free limits** — when Matchday adds payment in v2, be explicit about tier caps (Americano Padel App hides theirs, which erodes trust).
7. **Thai-first localization** — competitors are Nordic/European/English-only.

### 20.3 · Features to steal for v2 (not v1)

- **TV display / spectator mode** — the single-URL live leaderboard for venue TVs. **Build as plain HTML, not framework canvas** (see `matchday-v2-v9-reference.md` §5.1 for the architectural rationale).
- **Personal records / lifetime stats** — engagement mechanic seen in competitor apps.
- **Max-Teams button group UX** for Draw Size input — adopted in v1 (§18.1 Screen 12).
- **BYE fairness compensation** — can evaluate for v2 formats if needed.

### 20.4 · Anti-patterns to avoid (from competitive failures)

- **Generic error strings** — "An error occurred, please try again" with no actionable guidance (Americano Padel App) → Matchday validates setup upfront and surfaces specific messages (v1 polish phase).
- **Hidden tier caps** — Americano Padel App hides free-tier player/court limits → Matchday should be explicit when pricing arrives.
- **Framework-canvas TV display** — fails on smart TVs / Chromecast (Americano Padel App) → v2 Matchday builds plain HTML.
- **Instant-public tournaments** — Padelution lists tournaments immediately, no draft/private mode → Matchday v1 has explicit draft state (§5, §18.1).
- **Player names locked after creation** — Padelution gotcha with tiny warning → Matchday uses profile data from user accounts so identity mutations flow from the source.
- **Anonymous device-scoped auth** — Americano Padel App's data durability risk → Matchday uses Supabase email-based accounts.

### 20.5 · Geographic whitespace

No competitor has meaningful Asian market presence. Playtomic is weak in Asia. WeCourts is MENA. Americano Padel App is Europe + Nordics. Padelution is Finland. **Asia-Pacific (Thailand + SE Asia + Indonesia) is whitespace for the entire Americano + tournament-management category.** Matchday's Asia-first positioning (Thai + English at launch, TPS integration, LINE messaging roadmap, PromptPay payments roadmap, APAC federation integrations roadmap) is a legitimate structural differentiator that the existing market leaders cannot easily replicate.

---

*End of Matchday Build Prompt v0.4*
