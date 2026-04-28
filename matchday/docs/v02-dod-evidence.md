# Matchday v0.2.0 — DoD Evidence (interim status)

> **Status:** CODE-COMPLETE for the implemented surface (incl. Phase A.2 email infra), **DoD BLOCKED** on external prereqs.
> **As of:** 2026-04-27
> **Plan:** `Plans/v02-build-plan.md` v2
> **Pap-side activation checklist:** `Plans/v02-activation-checklist.md` — single paste-friendly list of every secret/env-var Pap needs to configure

---

## DoD recap

From `Plans/version-roadmap.md`:
> v0.2.0 — "Player Identity" — **Done when:** All 4 sign-in methods work AND a transactional email sends from the prod-configured domain.

This document captures the honest state right now. Neither half of the
DoD is met yet, and that's expected per gate D1 (domain deferred).

---

## Per-method sign-in matrix

Scoring per `Plans/v02-build-plan.md` v2 §5:

| Method | Code-complete | Provider configured | E2E verified | Status |
|---|---|---|---|---|
| **Magic link** | ✅ from v0.1.0 | n/a (Supabase built-in sender) | ✅ verified locally during v0.1.0 DoD | **Working** |
| **Google OAuth** | ✅ button + callback wired (W3 commit 3677633) | ⬜ Pending P3 (Google Cloud OAuth client) + W0 dashboard config | ⬜ pending provider config | **Code-complete, blocked on P3** |
| **Facebook OAuth** | ✅ button + callback wired | ⬜ Pending P2 (Facebook Developer App) + W0 dashboard config | ⬜ | **Code-complete, blocked on P2** |
| **Apple Sign-In** | ✅ button + callback wired (per gate D2 — env-var-gated indefinitely) | ⬜ Pending P1 (Apple Developer Program enrollment, $99/yr, long pole) | ⬜ | **Code-complete, deferred to v0.2.1+ per D2** |

**DoD half 1 ("All 4 sign-in methods work"):** ⬜ NOT MET — 1 of 4 working
end-to-end. Code is complete for the other 3; configuration in Supabase
Auth dashboard + provider OAuth apps is needed (W0 runbook in
`DECISIONS.md` describes the exact steps).

---

## Email infrastructure

| Component | Status |
|---|---|
| Resend SDK installed (matchday-backend) | ✅ B5 (commit 045f38c) — `npm:resend@4` via deno.json imports map |
| Welcome email template (TH+EN) | ✅ B5 (commit 045f38c) — `_shared/templates/welcome.ts`, HTML-escaped displayName |
| dev/prod sender separation | ✅ B5 — `RESEND_FROM_PROD` / `RESEND_FROM_DEV`; resolver throws if env unset |
| Hard-fail in prod if `RESEND_API_KEY` unset | ✅ B5 — `email.ts:getApiKey()` |
| `send-welcome-email` Edge Function (B6) | ✅ B6 (commit 2d7149e) — JWT-auth, idempotent, rate-limited (3/h) |
| Bounce/complaint webhook receiver (B7) | ✅ B7 (commit 0fb4aaf, fix 274a4ff) — Svix-verified, service-role behind `_shared/system-audit.ts` wrapper |
| `/simplify` review pass | ✅ commit b3c0e05 — 5 cleanups (parallelize, dedupe isProduction, drop impossible branches) |
| Idempotency-lookup partial index | ✅ matchday-backend d544d65 + remote prod applied — `idx_audit_log_email_sent_key` |
| Resend account (P4) | ⬜ Pending — Pap creates when ready |
| Resend domain DKIM/SPF (P6) | ⬜ Blocked on D1 (domain) + P5 (registration) |
| `spf=pass dkim=pass` headers verified | ⬜ Cannot verify — no domain |
| Non-Gmail recipient delivery test | ⬜ Cannot verify — no domain |
| matchday-web W4 server action calls `send-welcome-email` | ✅ matchday-web 1778de4 (initial fetch) → f8abf74 (refactored to `supabase.functions.invoke` + Promise.all parallel with audit insert) |
| Edge Function secrets sync in deploy.yml | ✅ matchday-backend f9a96da (SENTRY_DSN_EDGE) + 1d23299 (RESEND_API_KEY/RESEND_FROM_PROD/RESEND_WEBHOOK_SECRET) — when Pap sets the GH secrets and runs Deploy, all four push to Supabase's project secret store. Activation runbook in `matchday/DECISIONS.md`. |

**DoD half 2 ("transactional email sends from the prod-configured
domain"):** ⬜ NOT MET — both code (Phase A.2) and prereqs (P4, P5, P6)
are pending.

---

## Cross-cutting DoD (every version, per `version-roadmap.md`)

| Item | Status |
|---|---|
| Accessibility — keyboard nav + screen-reader labels + WCAG AA | ✅ matchday-web cc05c5e + 637170e — skip-link, sr-only h1s, Label htmlFor on CountryPicker, autoComplete attrs, aria-busy, focus-on-fail, consent aria-describedby. axe-core 4.10.2 verified clean (0 violations) on `/en/sign-in` + `/en` after `--primary` swap to `#3367D6` (5.3:1 vs white) in commit 7d03c0d. Authenticated routes deferred until OrbStack/Supabase running. |
| Observability — errors instrumented in Sentry | ✅ W2 (commit e335c13) — env-var-gated; transmits when `SENTRY_DSN` is set. Live verification runbook in `matchday/DECISIONS.md` (smoke-tested 2026-04-27). `withSentryConfig` source-map upload wrapper wired in commit 198f252 + CI env passthrough in 2003cc3. **Edge Function instrumentation** wired in commit f9b0d7b (`@sentry/deno`, `_shared/sentry.ts` wrapper, captures on Resend / audit / signature-verification failures, deliberate 4xx no-capture policy). **Auth-flow capture surface complete:** W4 onboard side-effects (c328907), 404 catch-all (d708a71), auth/callback missing-code + exchange-failed (71e91b1), sign-in OAuth + magic-link OTP error paths (e1507dc) — all use `function: auth.<name>` tag convention with PII guards (no auth code, no email address, only email-domain segment after `@` for OTP failures). |
| Audit log — mutating actions write a row | ✅ — `profile.created` (trigger), `profile.completed` (W4), `profile.updated` (W6) all emit audit rows |
| Privacy notice + consent UI | ✅ W4 — consent checkbox blocks /onboard submit until accepted |
| Native-Thai i18n review | ⚠️ Checklist ready 2026-04-27 (`matchday/Plans/v02-th-i18n-review.md`) — 80+ keys bucketed by priority. Native-speaker review pending. Carried from v0.1.0 deferral. |

---

## Ship status — code surface

**matchday-backend** (Phase A.1 + A.2 complete on `main`):

| Commit | Purpose |
|---|---|
| eb686b8 | B1 — schema migration: 11 cols + 3 enums + trigger + 13+ CHECK |
| ed14833 | B2 — RLS regression test + CI workflow extension |
| d765bce | B4 — shared audit emitter helpers (`functions/_shared/audit.ts`) |
| 6da0f82 | lint fix — jsr import routed through deno.json imports map |
| b7a7946 | B3 — types/database.ts regenerated, published for matchday-web |
| fc1594f | docs(env) — `.env.example` documenting v0.2.0 env surface |
| 045f38c | B5 — Resend wrapper + bilingual welcome template |
| 2d7149e | B6 — `send-welcome-email` Edge Function |
| 0fb4aaf | B7 — `resend-webhook` + `system-audit` wrapper |
| 274a4ff | fix(webhook) — switched to `npm:svix` (Resend SDK has no `.webhooks`) |
| b3c0e05 | refactor(email) — /simplify pass on Phase A.2 |

CI status: ✅ green on `main` (latest run 24971241273).
Migration applied to remote prod: ✅ ref `hqcwmjninvunoexccrbz`.
Edge Functions deployed to remote prod: ⬜ pending — `supabase functions deploy` not yet run for the 3 new functions.

**matchday-web** (Phase B complete on `main`):

| Commit | Purpose |
|---|---|
| 082e209 | W1 — sync types from matchday-backend |
| 3677633 | W3 — social OAuth buttons + i18n bundles + shadcn primitives |
| f33e172 | W4 — `/[locale]/onboard` profile-completion form (page + form + actions + iso3166 + zod schema + country picker) |
| 7396c70 | W5 — middleware: next-intl + Supabase auth + profile-completion redirect gate |
| 130c176 | W6 — `/me/settings` view+edit page |
| e335c13 | W2 — Sentry SDK init env-var-gated |
| fc073a0 | W7+W8+W9 — `/me/registrations` stub + auth-aware `/[locale]` (player home + marketing landing) |

CI status: ✅ green on `main` (run 24960186974).
Vercel deploy: ⬜ not configured (D5 = moot per D1).

**matchday** (umbrella, gates + plans):

| File | Update |
|---|---|
| `DECISIONS.md` | v0.2.0 gate section + W0 dashboard config runbook |
| `Plans/v02-build-plan.md` | v2 (post-stress-test amendments) |
| `Plans/v02-dod-evidence.md` | this document |

---

## What's needed for v0.2.0 to ship as `Shipped`

Everything below the line is what flips the per-method matrix to fully
green and unblocks the email-DoD:

### Pap actions (real-world)
1. **Register a domain** (D1 — choose `matchday.app` / `.io` / subdomain).
2. **Create Resend account** (P4) → API key.
3. **Add DNS records** for Resend sender domain verification (P5+P6).
4. **Create Vercel project** + connect to `matchday-web` GitHub repo + link domain (P7).
5. **Create Google Cloud OAuth Client** (P3).
6. **Create Facebook Developer App** (P2).
7. **(Optional / when ready)** Apple Developer Program enrollment (P1 — long pole, $99/yr).
8. **Run W0 dashboard config** for each enabled provider per `DECISIONS.md` runbook.

### My actions (code, when prereqs available)
1. ~~**Phase A.2** — B5/B6/B7 email infra~~ ✅ done 2026-04-27 (commits 045f38c, 2d7149e, 0fb4aaf, 274a4ff, b3c0e05).
2. **W4 hookup** — call `send-welcome-email` from matchday-web's W4 server action after profile completion. Separate Algorithm.
3. **`supabase functions deploy`** — deploy the 3 new Edge Functions to remote prod when Pap is ready.
4. **Vercel deploy.yml** — flip from stub to real auto-deploy on push to main.
3. **DoD verification pass** — exercise each enabled method end-to-end on prod URL; capture DKIM/SPF headers; verify non-Gmail delivery; record per-method matrix as ✅.
4. **Flip `Plans/version-roadmap.md`** v0.2.0 → `Shipped` + ship date.
5. **Append `Plans/decisions.md`** ship entry.
6. **Update `padelthailand.com/matchday/`** per standing rule.

### Path 1 vs Path 2 (per build plan v2)
- **Path 1 (full DoD):** all 4 methods + email DoD met → ship as v0.2.0.
- **Path 2 (partial):** 3/4 methods (Apple deferred per D2) + email DoD met → ship as v0.2.0; Apple becomes v0.2.1.

D2 already commits Pap to Path 2 by default. The trigger to ship is the
email DoD landing — not Apple landing.

---

## Roadmap status update

`Plans/version-roadmap.md` will be flipped to reflect "In Progress" via
the inline-header pattern (mirroring the v0.1.0 `Shipped` flip done
2026-04-26):

```
> **v0.2.0 — "Player Identity"** · `In Progress` · 2026-04-26 · `Player`
```

This shows on padelthailand.com/matchday/ as a yellow "in progress" pill
once the product-hub site is rebuilt — but per the standing publish rule,
that rebuild only happens on `Shipped` flips, not interim status changes.
So the rebuild waits until Path 1 or Path 2 actually completes.
