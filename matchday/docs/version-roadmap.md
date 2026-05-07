# Matchday — Version Roadmap (v0.1 → v1.0)

> **Status:** DRAFT v3 — simplified 2026-04-24.
> **All versions:** `Planned` · target Q2 '26
> **Format:** `Plans/version-anatomy.md` · **Decisions log:** `Plans/decisions.md`
> **Feature checklist:** `- [x]` = shipped, `- [ ]` = pending. Per-version status pill is the headline; per-feature checkboxes show fine-grained progress.

---

## Prerequisites (in place before v0.1)

- Domain registration + DNS
- Apple Developer account (Sign in with Apple)
- Facebook OAuth app + review submission
- Google OAuth app
- Email provider account (Resend / SES decision)
- Branding + design sprint
- Sentry / observability provider account

## Cross-cutting Definition of Done (every version)

- **Accessibility:** keyboard nav + screen reader labels + WCAG AA contrast
- **Observability:** errors instrumented in Sentry; key page loads logged
- **Audit log:** mutating actions write an audit row (who, what, when)

---

> **v0.1.0 — "Foundation"** · `Shipped` · 2026-04-25
>
> Next.js + Supabase scaffold, magic-link auth, RLS baseline, realtime architecture spike.
>
> - [x] Next.js 15 + Tailwind 4 + shadcn/ui scaffold
> - [x] Supabase project + first migration
> - [x] RLS baseline + policy testing harness
> - [x] Auth: email magic link only
> - [x] i18n harness (TH + EN)
> - [x] Design system tokens from `matchday-design-system.md`
> - [x] **Realtime spike:** Supabase Realtime POC — broadcast/subscribe + payload size sanity check
>
> **Done when:** Realtime POC validates 2-client round-trip <500ms; magic-link login + RLS gates on protected tables both work.

> **v0.2.0 — "Player Identity"** · `In Progress` · 2026-04-27 · `Player`
>
> Magic-link auth, email infrastructure, player profile, authenticated home. **Scope amendment (2026-04-28):** Google + Facebook OAuth deferred to v0.2.1+ alongside Apple (gate D2 expanded to all three social providers). v0.2.0 ships with magic-link only; the social buttons are env-var-gated (`NEXT_PUBLIC_OAUTH_*_ENABLED`) and stay off until v0.2.1.
>
> - [x] Magic-link sign-in (email-only)
> - [⏭️] Social sign-in: Google + Facebook + Apple — **deferred to v0.2.1+** (code shipped + button shells in place; providers not yet configured)
> - [x] **Email infrastructure:** Resend wrapper + bilingual welcome template + send-welcome-email Edge Function (idempotent + rate-limited) + Resend webhook receiver (Svix-verified). matchday-web W4 server action invokes via `supabase.functions.invoke`. Activation gated on Pap creating Resend account + domain DKIM/SPF.
> - [x] Player profile: name, DOB, gender, city/country, phone/LINE/WhatsApp, hand/side
> - [x] `/me/settings` + `/me/registrations` (empty state)
> - [x] Player home `/`
> - [x] Cross-cutting DoD: a11y axe-verified clean on public routes (4.10.2, 0 violations); Sentry runtime + `withSentryConfig` build wrapper wired (env-var-gated); audit log emits `profile.*` + `email.*` rows; privacy notice + consent UI on `/onboard`.
> - [⚠️] Native-Thai i18n review pending — checklist ready at `Plans/v02-th-i18n-review.md`.
>
> **Done when:** Magic-link sign-in works on prod and a transactional welcome email sends from the prod-configured domain. **Ship-blocker (2026-04-28):** Pap-side prereqs — Resend account + DKIM/SPF on `matchday.padelthailand.com` (P4-P6), Vercel deploy (P7). Domain (D1) resolved → `matchday.padelthailand.com`.

> **v0.3.0 — "Organizer + Venues + Admin"** · `Shipped` · 2026-04-28 · `Organizer` `Venue` `Admin`
>
> TO onboarding, admin approval, venue management, draft tournament creation.
>
> - [x] TO application flow (`/organizer/apply`, `/organizer/apply/status`)
> - [x] Admin dashboard + organizer applications list + detail (`/admin`, `/admin/organizer-applications`)
> - [x] Venue create/select (name, city, court count + names, address)
> - [x] Tournament create as `draft`: name, dates, venue, draw size, last-set rule
> - [x] Organizer dashboard + tournament management hub
> - [x] Organizer public profile `/organizer/[slug]`
>
> **Done when:** A player applies → admin approves → approved TO creates a venue + draft tournament invisible to the public.

> **v0.4.0 — "Registration"** · `Shipped` · 2026-04-28 · `Player` `Organizer`
>
> Solo + doubles registration with partner matching and waitlist.
>
> - [x] Tournament lifecycle: `draft → registration_open → registration_closed`
> - [x] Solo registration
> - [x] Doubles registration + partner search modal + invite tokens
> - [x] `/invite/[token]` accept/decline flow
> - [x] TO registrations tab: auto-accept, waitlist, waitlist promotion email
> - [x] Withdrawal + add/remove partner
>
> **Done when:** Doubles team registers via partner-invite token; waitlist promotion email fires when a slot opens.

> **v0.5.0 — "Draw Engine + Public Bracket"** · `Shipped` · 2026-04-28 · `Organizer` `Spectator`
>
> Single-elim bracket generation with manual seeding, byes, and read-only public view.
>
> - [x] Bracket sizing (4–128, top seeds get byes)
> - [x] Manual drag-drop seeding UI
> - [x] Bye placement algorithm
> - [x] Draw as persistent document (decoupled from tournament state)
> - [x] Publish draw → tournament `published`
> - [x] **Public read-only bracket view** at `/tournaments/[organizer-slug]/[tournament-slug]/bracket` (D11 vanity URL; UUID-fallback redirects to canonical slug; page refresh; realtime arrives v0.8)
>
> **Done when:** A published bracket renders correctly to an unauthenticated viewer for both power-of-2 and non-power-of-2 draw sizes. **Phase A (B36-B47) + Phase B (W45-W54) shipped 2026-04-28; Phase C ship gate is DoD2 walkthrough by Pap (15 sub-checks: a-o).**

> **v0.6.0 — "Live Scoring"** · `In Progress` · 2026-04-29 · `Organizer`
>
> TO score entry, bracket cascade, retirement, score-edit undo.
>
> - [ ] Per-set score entry (best-of-1 / best-of-3)
> - [ ] Standard set + tiebreak + super tiebreak validation
> - [ ] Retirement (partial scores → opponent advances)
> - [ ] Bracket cascade: winner auto-advances
> - [ ] Cascading undo for score edits + walkover undo
> - [ ] Tournament `live` state on first match start
>
> **Done when:** A mock 8-team tournament is scored end-to-end with cascade, retirement, and undo all passing E2E tests.

> **v0.7.0 — "Scheduling"** · `In Progress` · 2026-04-29 · `Organizer`
>
> Court × time grid scheduling with auto-schedule and conflict detection.
>
> - [ ] Court × time grid (15-min increments)
> - [ ] Per-round duration config
> - [ ] Auto-schedule algorithm + drag-drop manual adjustments
> - [ ] Court availability blocking
> - [ ] Conflict detection (player double-book, bracket dependency)
> - [ ] Multi-day support
>
> **Done when:** Auto-schedule produces a conflict-free schedule for a representative 16-team multi-day tournament.

> **v0.8.0 — "Realtime + Spectator"** · `In Progress` · 2026-05-07 · `Spectator` `Player`
>
> Supabase Realtime bracket updates and TV-friendly spectator mode.
>
> - [ ] Realtime channel design + broadcast triggers
> - [ ] Live bracket view (~100 concurrent viewers)
> - [ ] Match status indicators (upcoming / in progress / completed)
> - [ ] Spectator mode `?spectator=true` (hides nav, enlarges bracket, TV-ready)
> - [ ] Presence / viewer count
>
> **Done when:** 100 concurrent simulated viewers receive score updates within 1 second.

> **v0.9.0 — "Placements + Polish"** · `In Progress` · 2026-05-07 · `Organizer` `Player`
>
> Placements, cancellation, social sharing, pre-launch polish.
>
> - [ ] Placements auto-derived (1st/2nd/optional 3rd-place match)
> - [ ] Manual placement override (audit-logged)
> - [ ] Tournament cancellation flow (notify + void registrations)
> - [ ] OpenGraph rich previews for LINE/WhatsApp sharing
> - [ ] Email template inventory complete
> - [ ] **Native-Thai i18n review** — replace all `[TH]` placeholders in `messages/th.json` with reviewed copy (carry-over obligation from v0.2.0+; checklist at `Plans/v02-th-i18n-review.md`)
>
> **Done when:** End-to-end mock tournament finishes with correct placements and a shared link renders an OG preview on LINE.

> **v1.0.0 — "General Availability"**  ·  `Organizer` `Player` `Spectator` `Venue`
>
> Production-hardened, first real Thailand padel tournament runs on Matchday.
>
> - [ ] Performance pass (Lighthouse budgets met)
> - [ ] Accessibility audit (WCAG AA)
> - [ ] Security review (secrets, RLS coverage, audit log completeness)
> - [ ] All v1 ISC criteria from build-prompt §15 met
> - [ ] Pap on-site for first tournament
>
> **Done when:** A real Thailand padel tournament runs end-to-end on Matchday without engineering intervention.

---

## Known risks

| # | Risk | Where it bites | Mitigation |
|---|---|---|---|
| 1 | Supabase Realtime at 100 concurrent viewers | v0.8 | Realtime spike in v0.1 + scaled test before v0.6 |
| 2 | Auto-schedule fails to converge on hard cases | v0.7 | Ship manual-only first; auto-schedule as enhancement |
| 3 | Doubles partner-invite race conditions | v0.4 | Edge Function with row-level lock, not direct mutation |
