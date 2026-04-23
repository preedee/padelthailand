# Matchday — Version Roadmap (v0.1 → v1.0)

> **Status:** DRAFT — proposed decomposition, sequence and increments pending Pap's review.
> **Source:** Derived from `matchday-build-prompt.md §5 (v1 in-scope)` and `matchday-v1-detailed-specs.md`.
> **Format:** Follows `Plans/version-anatomy.md`.

---

> **v0.1.0 — "Foundation"**  `In Progress`  ·  target Apr 2026
>
> Next.js 15 + Supabase scaffold, auth, and core schema with RLS.
>
> - Next.js 15 + Tailwind 4 + shadcn/ui scaffold
> - Supabase project, migrations, RLS baseline
> - Auth: email magic link + Google/Facebook/Apple
> - i18n harness (TH + EN)
> - Design system tokens from `matchday-design-system.md`
>
> [Spec →]

> **v0.2.0 — "Player Identity"**  `Planned`  ·  Q2 '26  ·  `Player`
>
> Player signup, profile, and authenticated home.
>
> - Player profile: name, DOB, gender, city/country, phone/LINE/WhatsApp, hand/side
> - Signup + sign-in flows (email + social)
> - `/me/settings` + `/me/registrations` (empty state)
> - Player home `/`
>
> [Spec →]

> **v0.3.0 — "Organizer + Venues"**  `Planned`  ·  Q2 '26  ·  `Organizer` `Venue`
>
> TO onboarding, venue management, draft tournament creation.
>
> - TO application flow + admin approval (`/organizer/apply`, `/admin/organizer-applications`)
> - Venue create/select (name, city, court count + names, address)
> - Tournament create as `draft`: name, dates, venue, draw size, last-set rule
> - Organizer dashboard + tournament management hub
> - Organizer public profile `/organizer/[slug]`
>
> [Spec →]

> **v0.4.0 — "Registration"**  `Planned`  ·  Q3 '26  ·  `Player` `Organizer`
>
> Solo + doubles registration with partner matching and waitlist.
>
> - Tournament lifecycle: `draft → registration_open → registration_closed`
> - Solo registration
> - Doubles registration + partner search modal + invite tokens
> - TO registrations tab: auto-accept, waitlist, waitlist promotion email
> - Withdrawal + add/remove partner
>
> [Spec →]

> **v0.5.0 — "Draw Engine"**  `Planned`  ·  Q3 '26  ·  `Organizer`
>
> Single-elim bracket generation with manual seeding and byes.
>
> - Bracket sizing (4–128, top seeds get byes)
> - Manual drag-drop seeding UI
> - Bye placement algorithm
> - Draw as persistent document (decoupled from tournament state)
> - Publish draw → tournament `published`
>
> [Spec →]

> **v0.6.0 — "Scheduling"**  `Planned`  ·  Q3 '26  ·  `Organizer`
>
> Court × time grid scheduling with auto-schedule and conflict detection.
>
> - Court × time grid (15-min increments)
> - Per-round duration config
> - Auto-schedule algorithm + drag-drop manual adjustments
> - Court availability blocking
> - Conflict detection (player double-book, bracket dependency)
> - Multi-day support
>
> [Spec →]

> **v0.7.0 — "Live Scoring"**  `Planned`  ·  Q3 '26  ·  `Organizer`
>
> TO score entry, bracket cascade, retirement, score-edit undo.
>
> - Per-set score entry (best-of-1 / best-of-3)
> - Standard set + tiebreak + super tiebreak validation
> - Retirement (partial scores → opponent advances)
> - Bracket cascade: winner auto-advances
> - Cascading undo for score edits + walkover undo
> - Tournament `live` state on first match start
>
> [Spec →]

> **v0.8.0 — "Realtime + Spectator"**  `Planned`  ·  Q3 '26  ·  `Spectator` `Player`
>
> Supabase Realtime bracket updates and TV-friendly spectator mode.
>
> - Realtime channel design + broadcast triggers
> - Live bracket view (~100 concurrent viewers)
> - Match status indicators (upcoming / in progress / completed)
> - Spectator mode `?spectator=true` (hides nav, enlarges bracket, TV-ready)
> - Presence / viewer count
>
> [Spec →]

> **v0.9.0 — "Placements + Polish"**  `Planned`  ·  Q3 '26  ·  `Organizer` `Player`
>
> Placements, cancellation, social sharing, and pre-launch polish.
>
> - Placements auto-derived (1st/2nd/optional 3rd-place match)
> - Manual placement override (audit-logged)
> - Tournament cancellation flow (notify + void registrations)
> - OpenGraph rich previews for LINE/WhatsApp sharing
> - Email template inventory complete
>
> [Spec →]

> **v1.0.0 — "General Availability"**  `Planned`  ·  Q4 '26  ·  `Organizer` `Player` `Spectator` `Venue`
>
> Production-hardened, first real Thailand padel tournament runs on Matchday.
>
> - Performance + accessibility pass
> - Security review (secrets, RLS coverage, audit log)
> - All v1 ISC criteria from build-prompt §15 met
> - Pap on-site for first tournament
>
> [Spec →]

---

## Open questions for Pap

1. **Sequence:** Could swap Scheduling (v0.6) and Live Scoring (v0.7) — a tournament can run without a printed schedule.
2. **Increments:** 9 sub-versions may be too many. Candidates to merge: v0.5+v0.6 (Draw+Schedule), v0.8+v0.9 (Realtime+Polish).
3. **Status of v0.1.0:** Marked `In Progress` based on the existing scaffold edits in `product-hub/` — confirm.
