# Matchday v0.2.0 — "Player Identity" Build Plan

> **Status:** DRAFT v2 — amended after Plan-agent stress-test 2026-04-26.
> **Predecessor:** v0.1.0 Foundation (shipped 2026-04-25)
> **DoD:** All 4 sign-in methods work AND a transactional email sends from the prod-configured domain (with DKIM/SPF pass).
> **External-prereq risk:** Apple Developer enrollment is the long pole.

---

## 1 · Scope

In-scope:
1. **Social sign-in** — Google + Facebook + Apple (added to existing magic-link)
2. **Email infrastructure** — Resend integration, transactional template engine, dev/prod sender separation, bounce/complaint webhook
3. **Player profile** — DOB, gender, city, country, nationality, phone, LINE ID, WhatsApp, hand, side
4. **`/me/settings`** — view + edit profile
5. **`/me/registrations`** — empty-state stub
6. **Authenticated player home `/`** — minimal landing
7. **Unauthenticated landing `/`** — per `matchday-v1-detailed-specs.md` §18 Screen 1
8. **Cross-cutting DoD** — a11y, Sentry observability, audit log emission (per `version-roadmap.md` cross-cutting checklist)

Out-of-scope:
- TO/admin/registrations/brackets → v0.3+
- Rating, federation, payments → v2+
- Native-Thai i18n review (carried from v0.1.0; remains placeholder)

---

## 2 · External Prerequisites — gate questions for Pap

### Real-world account/process work (timing risk varies)

| # | Prereq | Risk | Required for | Action |
|---|--------|------|--------------|--------|
| P1 | **Apple Developer Program** ($99/yr) | **2-7+ weeks possible** in 2026 | Apple Sign-In | Start enrollment NOW |
| P2 | **Facebook Developer App** | Hours — `email`+`public_profile` need NO review | Facebook OAuth | Create app, set redirect URIs, Live mode |
| P3 | **Google Cloud OAuth Client** | Hours | Google OAuth | Create OAuth 2.0 Web Client |
| P4 | **Resend account + API key** | Minutes | Email | Sign up, copy API key |
| P5 | **Domain registered + DNS control** | Hours-days | Prod-configured DoD | Pick + register |
| P6 | **Resend domain verification (DKIM+SPF)** | ~24h propagation | Email deliverability | After P5 |
| P7 | **Vercel project + custom domain** | Minutes after P5 | Prod deploy | Connect repo, link domain |

### Decisions needed from Pap (will be asked one at a time)

| # | Decision | Options |
|---|----------|---------|
| D1 | Domain choice | Own (e.g., `matchday.app`/`.io`/`.co`) · subdomain (`app.padelthailand.com`) · defer (blocks DoD) |
| D2 | Apple Sign-In strategy | Enroll now, accept potential weeks of waiting · descope to v0.2.1 if not approved by code-complete |
| D3 | Domain shape | **Shape A**: apex (`matchday.app` for both Vercel + Resend sender) · **Shape B**: subdomain partition (`app.matchday.app` + `mail.matchday.app`) |
| D4 | Account-linking semantics | Allow same-email across providers to merge into one user (requires linking flow) · Treat each provider+email pair as a separate user (simpler, v0.2.0 default) |
| D5 | Vercel account | Pap's existing personal Vercel · new account scoped to matchday |
| D6 | DOB minimum age | 13 (US COPPA-style) · 16 (EU GDPR child-consent) · 18 · no enforcement |
| D7 | Country/nationality picker | ISO-3166-1 alpha-2 (250 entries) · ISO-3166-1 + custom display labels · TH+SG+ID+VN curated short list with "Other" |
| D8 | DoD interpretation | Code-functional with my test accounts · End-to-end with Pap's real provider configurations |

**Recommended defaults** (Pap can override):
- D3: Shape A (apex) for v0.2.0 simplicity
- D4: Separate users (defer linking to v0.2.x or later)
- D6: 13+ (lowest defensible)
- D7: ISO-3166-1 alpha-2 with i18n display
- D8: End-to-end with Pap's configurations

---

## 3 · Phased commit plan

Continuing v0.1.0's commit-numbered convention. **Sequencing reordered after stress-test:** schema + web UI parallelizable; email infra LANDS LAST (depends on profile-completion event + P4-P6).

### Phase A.1 — Schema + types (matchday-backend) — gates Phase B

| Commit | Description |
|---|---|
| **B1** (`migrations/20260426*_player_profile.sql`) | 3 enums (`gender`, `playing_hand`, `preferred_side`); ALTER TABLE adds 11 columns: `dob date`, `gender public.gender`, `city text`, `country text`, `nationality text`, `phone text`, `line_id text`, `whatsapp text`, `playing_hand public.playing_hand`, `preferred_side public.preferred_side`, `profile_completed_at timestamptz`. All nullable. **No new RLS policy** — existing v0.1.0 "user can update own row" policy already covers new columns. Trigger updated to capture `display_name` from social-auth `raw_user_meta_data` shapes (Google `name`; Facebook `name`; Apple `full_name.givenName + familyName` first sign-in only) and store in `public.user`. CHECK constraint enforces D6 minimum age via `dob <= now() - interval 'X years'`. |
| **B2** | RLS regression test extends `001_init_rls.test.ts` to cover: own profile UPDATE allowed; other profile UPDATE denied; anon UPDATE denied; **`roles` column unchanged via mass-assignment** (self-elevation guard). |
| **B3** | `types/database.ts` regenerated locally + pushed to main. CI on backend regenerates and validates types match schema. **Gate for W1:** matchday-web's W1 must wait for B3 to land in `main`. |
| **B4** | Audit-log emitter helpers added (`supabase/functions/_shared/audit.ts`) for `profile.updated`, `profile.completed`. Cross-cutting DoD requirement. |

### Phase B — Web auth + profile UI (matchday-web) — depends on Phase A.1

| Commit | Description |
|---|---|
| **W0** | Configure OAuth providers in Supabase Auth dashboard (client ID + secret per provider). Set Supabase Auth redirect-URL allowlist for prod domain. **Not a code commit** — checklist task; recorded in DECISIONS.md. |
| **W1** | Pull updated `types/database.ts` via `bun run sync-types`. Verify `User` type includes 11 new columns. |
| **W2** | Sentry SDK init in `instrumentation.ts` + `sentry.client.config.ts` + `sentry.server.config.ts`; env-var-gated (`SENTRY_DSN`); source-map upload step in `next.config.ts`. Smoke-test error captured in dev. |
| **W3** | Update `/sign-in` page per §18 Screen 2: 3 social buttons (Google, Facebook, Apple) above magic-link section. Each button env-var-gated — only renders if `NEXT_PUBLIC_OAUTH_<provider>_ENABLED === "true"`. **a11y:** each button has accessible name (`aria-label="Sign in with Google"` etc.), not icon-only. |
| **W4** | Profile-completion route `/[locale]/onboard`. Form: required (display_name, dob, city, country, nationality), optional (gender, phone, line_id, whatsapp, hand, side). Country/nationality use ISO-3166-1 alpha-2 picker per D7. Phone + WhatsApp normalized to E.164 client+server. ZodSchema validation client+server. Server action upserts `public.user` and sets `profile_completed_at`; emits `profile.completed` audit row. **`roles` column NOT in form** (self-elevation guard). a11y: label associations + error announcements via `aria-live`. |
| **W5** | Profile-completion middleware redirect gate. Logic: if authenticated AND `profile_completed_at IS NULL` AND path NOT IN exemption list → redirect to `/[locale]/onboard`. **Exemption list** (regex-aware): `^/(en\|th)/onboard$`, `^/(en\|th)/sign-in$`, `^/auth/.*`, `^/api/.*`, `^/$`. Composes with existing next-intl middleware — auth gate runs AFTER locale resolution. |
| **W6** | `/[locale]/me/settings` page — view + edit profile. Reuses W4 form components. Updates emit `profile.updated` audit row. |
| **W7** | `/[locale]/me/registrations` page — empty state per spec. "No registrations yet" + CTA "Browse tournaments" (placeholder URL until v0.4). |
| **W8** | Authenticated player home `/[locale]/` — minimal landing. Hero + "Coming soon: tournaments" + footer. |
| **W9** | Unauthenticated landing `/[locale]/` (when not signed in) — full §18 Screen 1 structure. |
| **W10** | i18n keys for ALL new strings added to `messages/en.json` + `messages/th.json` (placeholder Thai pending native review). |

### Phase A.2 — Email infrastructure (matchday-backend) — lands AFTER W4 + P4-P6

| Commit | Description |
|---|---|
| **B5** | Resend SDK wired into Edge Functions (`supabase/functions/_shared/email.ts`). Welcome email template (TH+EN). **Hard rule:** if `RESEND_API_KEY` unset AND `NODE_ENV === 'production'` → throw. Dev fallback (`NODE_ENV !== 'production'`) logs to console. **Sender separation:** `RESEND_FROM_DEV="onboarding@resend.dev"` vs `RESEND_FROM_PROD="noreply@<prod-domain>"` — explicit env vars, not implicit. |
| **B6** | Edge Function `send-welcome-email` invoked from `profile.completed` audit hook. Includes signature verification (Supabase JWT), per-user rate limit (3/hour), idempotency key (`{user_id}:welcome:v1`). |
| **B7** | Resend webhook receiver Edge Function (`resend-webhook`). Handles `email.bounced`, `email.complained`, `email.delivered`. Writes to `audit_log` for observability. |

### Phase C — DoD verification + ship

| Commit | Description |
|---|---|
| **D1** | Per-method matrix recorded in `Plans/v02-dod-evidence.md` for each enabled OAuth provider: `provider · enabled? · configured? · sign-in works? · profile completes? · audit row?`. Apple row may be `pending` — that triggers D9 ship-decision branch. |
| **D2** | Welcome email send: (a) Resend dashboard shows `delivered`, (b) raw email headers show `spf=pass dkim=pass`, (c) test recipient on a non-Gmail provider also receives. |
| **D3** | Both CIs green on `main`. |
| **D4** | Vercel deploy live on prod custom domain. OAuth callback URL = `https://<prod-domain>/auth/callback` confirmed in each provider's dashboard. |
| **D5** | Privacy notice + consent UI on `/onboard` (collecting nationality + DOB + LINE ID + phone — PDPA/GDPR adjacent). Acceptance copy: "I agree to the [privacy policy]" with link to a stub privacy policy page. |
| **D6** | DECISIONS.md updated with v0.2.0 outcomes (which prereqs landed, which deferred, decisions D1-D8 final answers). |
| **D7** | `Plans/version-roadmap.md` v0.2.0 header gets `Shipped` + ship date. |
| **D8** | `Plans/decisions.md` gets v0.2.0 ship entry. |
| **D9** | **Ship-decision branch:** if Apple is approved + working, ship full v0.2.0; else ship as v0.2.0 with explicit "Apple deferred to v0.2.1" note in DECISIONS + roadmap; v0.2.1 follow-up algorithm scheduled. |
| **D10** | Product-hub rebuilt; padelthailand.com/matchday/ updated per standing rule (Pap-approved push). |

---

## 4 · Domain hierarchy (default = Shape A; D3 confirms)

**Shape A — apex (recommended default):**
- Vercel: `<prod-domain>` (apex)
- Auth callbacks: `https://<prod-domain>/auth/callback`
- Resend sender: `noreply@<prod-domain>` (DKIM signs apex)

Shape B available if Pap wants email/app domain partition.

---

## 5 · Per-method ship matrix (replaces Path1/Path2 binary)

At code-complete time, each row independently green-or-red:

| Method | Code-complete | Provider configured | E2E verified | Ship status |
|--------|---------------|---------------------|--------------|-------------|
| Magic link | ✅ from v0.1.0 | n/a | n/a | Always green |
| Google OAuth | ⬜ | ⬜ | ⬜ | Required for v0.2.0 |
| Facebook OAuth | ⬜ | ⬜ | ⬜ | Required for v0.2.0 |
| Apple Sign-In | ⬜ | ⬜ (P1 long pole) | ⬜ | If pending → defer to v0.2.1 |

v0.2.0 ships when 3/4 are green AND email DoD met. Apple becomes v0.2.1 if not ready.

---

## 6 · Cross-cutting DoD (every version, per version-roadmap)

- **a11y** — keyboard nav + screen reader labels + WCAG AA contrast on /sign-in, /onboard, /me/*
- **Observability** — Sentry capturing errors (W2); key page loads logged
- **Audit log** — every mutating action writes a row (`profile.completed`, `profile.updated`, `email.sent`, `email.bounced`, `email.complained`)

---

## 7 · Anti-criteria (locked)

- v0.2.0 must NOT add registration features (those are v0.4.0)
- v0.2.0 must NOT hardcode OAuth credentials (env-var only)
- v0.2.0 must NOT promise DoD coverage that depends on unverified Pap prereqs
- v0.2.0 must NOT ship without RLS regression tests for new profile UPDATE coverage
- v0.2.0 must NOT silently no-op email sends in prod (hard-fail if `RESEND_API_KEY` unset in prod)
- v0.2.0 must NOT push padelthailand.com/matchday/ without explicit Pap approval
- v0.2.0 must NOT expose `roles` column in profile form (self-elevation guard)

---

## 8 · Risk register (post-stress-test)

| # | Risk | Mitigation |
|---|------|------------|
| R1 | Apple Dev approval delayed | Per-method matrix; ship 3/4, Apple → v0.2.1 |
| R2 | Resend DKIM/SPF DNS propagation stalls | 72h max; if blocked → use Resend onboarding sender for dev, declare DoD partial-ship blocked-on-DNS |
| R3 | Vercel custom domain DNS misconfig | OAuth callbacks fail in prod; mitigation: D1 verification step in `Plans/v02-dod-evidence.md` exercises each provider end-to-end on the prod URL before ship |
| R4 | Supabase Auth provider config drift (Studio settings not in migrations) | W0 records exact config in DECISIONS.md; CI does NOT cover this — manual checklist |
| R5 | Account linking ambiguity (same email across providers) | D4 decision: separate users default; document in privacy notice |
| R6 | PDPA/GDPR — collecting nationality, DOB, LINE ID | D5 commit adds privacy notice + consent UI |
| R7 | Phone format collision (E.164 vs local) | W4 normalizes both phone + WhatsApp to E.164 before write |
| R8 | Email reaches spam folder | DKIM+SPF verified in D2; non-Gmail recipient test |

---

## 9 · Approval gates

This plan requires explicit Pap approval before any scaffolding:

1. ✅ Plan reviewed by Plan agent — amended
2. ⬜ External-prereqs gate answered (D1-D8 + P1-P7 status)
3. ⬜ Plan approved (or amended)
4. ⬜ Phase A.1 (B1-B4) authorized to execute

Subsequent algorithms execute the phased commits.

---

*End of v0.2.0 build plan v2.*
