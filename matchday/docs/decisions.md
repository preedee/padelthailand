# Matchday Roadmap — Decisions Log

Living log of decisions made during roadmap planning. Most recent first.

---

## 2026-04-28 — v0.4.0 Phase A backend shipped to remote prod (parallel-blitz)

- **22 Phase A backend commits + 5 fix-ups + auto-types-regen all on `main` and applied to remote prod ref `hqcwmjninvunoexccrbz`.** Same Option C parallel-blitz cadence as v0.3 (3 Wave 1 agents → cherry-pick + push + CI → 3 Wave 2 agents → push + CI → 1 Wave 3 agent → push + CI → trigger Deploy workflow → migrations + Edge Functions + types regen all green).
- **Phase A surface (commit SHAs in `preedee/matchday-backend` main):**
  - B14b `05830ad` `check-tournament-slug-availability` Edge Function (D12 vanity URL support)
  - B19 `55dd14c` team + team_member tables (service-role-only writes)
  - B19a `b01536a` tournament.slug column + set_tournament_slug SECURITY DEFINER + reserved blocklist
  - B20 `b8f9978` registration table (D13 two-row mirror) + 5-state status enum + partial unique index + ON DELETE CASCADE on user FK
  - B21 `964a422` partner_invite table + auth-required RLS (no anon-by-token per F05)
  - B22 `db1ecdf+6c96cf5+53e0e3d+c17a18c` audit_log typed-FK migration + audit_action enum + emitter additions; **3 fix-ups** for view-and-index drop+recreate around column type cast (SQLSTATE 0A000) and partial-index revalidation (SQLSTATE 42883)
  - B23 `9d75a96` 7 bilingual registration email templates
  - B24 `83386f7` send-registration-email Edge Function (7-kind discriminator, idempotent)
  - B25 `8aa1640+38201d2+84f25c0` register_solo_rpc + register-solo Edge Function; **2 fix-ups** for `status` OUT-parameter ambiguity (#variable_conflict use_column directive)
  - B26 `2a503e3+4286d9f+7b993b6+3597168` register_doubles_invite_rpc + Edge Function; **3 fix-ups** for pgcrypto dependency (replaced with gen_random_uuid-based token) + use_column directive
  - B26b `ce365ae` search-users-by-display-name Edge Function (rate-limited 30/min/IP, prefix match)
  - B27 `958eb5a` respond_partner_invite_rpc + Edge Function (atomic both-confirm or both-waitlist; D13 two-row mirror)
  - B28 `a99a6e8` withdraw_registration_rpc + Edge Function (status='registration_open' guard + pair-aware FOR UPDATE SKIP LOCKED auto-promote)
  - B29 `1240826` promote-waitlist-manual (TO/admin override; no capacity check)
  - B30 `0c415b8` add-partner-to-solo Edge Function + RPC
  - B31 `3d73734` remove-partner-from-doubles Edge Function + RPC
  - B32 `36c8a8f` tournament-status-transition (TO manual)
  - B33 `0438efc` auto-close-tournaments cron Edge Function (with `pg_try_advisory_lock` per A03 stress-test)
  - B33b `e66367c` sweep_pending_partner_invites_rpc (called by B32 + B33)
  - B33c `0645c9f` cancel-tournament-with-registrations Edge Function + RPC (A04 stress-test fix)
  - B34 `9fdf7a2` v0.4 RLS regression tests + CI step
  - **enum completeness `edf53fb`** — added `tournament.updated`, `tournament.admin_edited`, `tournament.admin_cancelled` to `audit_action` enum (v0.3 W28a/W28b emitters needed these; the canonical-schema import in B22 had omitted them)
  - B35 `92b89f4` (auto-regen by deploy.yml) — types/database.ts regenerated 633 → 1076 lines
- **D-decision answers:** 14 of 15 = recommended defaults. **1 override:** D12 vanity URLs at `/tournaments/[organizer-slug]/[tournament-slug]` (added B19a + B14b + W33a).
- **Stress-test findings applied:** 18 (6 critical, 12 important) from Plan + Architect agent reviews; 7 nits documented as accepted-with-rationale.
- **Total wall-clock for Phase A:** ~3 hours including 5 fix-up CI cycles. ~600k tokens spent (7 agent invocations + orchestration).
- **Lessons captured (added to MEMORY/LEARNING/REFLECTIONS/algorithm-reflections.jsonl):**
  - Pre-flight every RPC migration with `#variable_conflict use_column` when RETURNS TABLE columns share names with real columns (caught B25 then B26/B27/B28 — same class of bug).
  - Drop+recreate views AND partial indexes that reference a column before ALTER COLUMN TYPE; PG rejects revalidation otherwise.
  - Validate audit_log enum completeness against ALL emitter call sites in matchday-web BEFORE the typed-FK cast lands (the v0.3 W28a/W28b miss bit us post-Phase-A).
  - Avoid `gen_random_bytes` (pgcrypto-dependent); use `uuid_send(gen_random_uuid())` for token entropy (core PG, no extension).
- **Ship status:** v0.4 Phase A complete + deployed to prod. v0.4 ship gate is now Phase B (matchday-web W32-W44) + DoD2 E2E walkthrough. Phase B in flight via parallel-blitz session.

## 2026-04-28 — v0.3.0 Phase A backend code-complete (parallel-blitz)

- **14 of 14 Phase A backend commits landed in one session** via the parallel-agent-team blitz (Option C from session menu). Cadence: Wave 1 (3 parallel Engineer agents in worktrees) → cherry-pick + push + CI → Wave 2 (3 parallel agents) → push + CI → Wave 3 (1 agent for B15+B16) → push + CI → all green on `main`.
- **Phase A commits on `main`:**
  - B8 `6c8458d` (sql) organizer/venue/tournament tables + RLS — shipped earlier in session
  - B8a `c784fd4` user table alters (slug, organizer_logo_url, payment-reserved cols) + `set_user_slug()` SECURITY DEFINER
  - B9 `da7e923` `is_tournament_organizer(t_id)` helper
  - B10 `d1fed5c` self-elevation BEFORE UPDATE trigger
  - B11 `1e3f153` organizer-logos storage bucket + per-user-prefix policy
  - B11a `42e7cd7` `validate-organizer-logo` Edge Function (magic-byte + dimension check)
  - B12 `7eb9d77` audit emitters extended (organizer.*, tournament.*, venue.*)
  - B12a `f25441e` `admin_activity_feed` SECURITY DEFINER view (PII-masked)
  - B13 `9bf296e` 3 bilingual templates (received / approved / rejected)
  - B14 `153cc0e` `send-organizer-application-email` (kind discriminator, idempotent)
  - B14a `c4e3902` `check-slug-availability` (rate-limited, format + reserved + uniqueness)
  - B15 `9639ecc` + simplify `1ec181a` `approve-organizer-application` (atomic txn + best-effort email)
  - B16 `1fa8c38` `reject-organizer-application` (required reason ≤500 chars)
  - B18 `b329976` self-elevation + storage RLS regression tests
  - **fixup `211790f`** updated v0.2 `profile_update.test.ts` Assertion 4 to reflect the new B10 contract (was: "RLS does NOT block self-role updates" — Wave 1 CI caught it; the assertion now expects 42501 from the trigger).
- **B17 (types regen) BLOCKED** — `supabase gen types typescript --project-id hqcwmjninvunoexccrbz` requires `SUPABASE_ACCESS_TOKEN` repo secret, which is unset (same blocker as B8 prod-deploy on the deploy.yml workflow). Pap-action: set the secret on `preedee/matchday-backend`, then either re-run "Deploy to Supabase prod" (which pushes migrations) AND/OR generate types locally and commit B17.
- **Migration prod-push is parked** — same blocker. The 14 new migrations sit in `main` waiting for the secret.
- **Phase A blitz lessons captured** — agent briefings must include legacy-test names that pin the OLD contract (the v0.2 `profile_update.test.ts` was outside the W1-Schema agent's scope but its Assertion 4 broke under B10 — should have been pre-flagged); /simplify findings should be respected at SQL syntax level (B8 fix-up forced by `cannot use subquery in DEFAULT` was the same class of issue).
- **D-decision overrides applied to Phase A:** D1 cropperjs (W12 — pending), D2 user-chosen slug (B14a check-slug + B8a set_user_slug helper), D5 admin full edit + cancel (W28+W28a+W28b — Phase D), D8 IndexedDB blob auto-save (W15a — pending). Defaults: D3, D4, D6, D7, D9, D10, D11, D12.

## 2026-04-28 — v0.2.0 Player Identity code-complete (final)

- **Sign-in Sentry capture landed** — matchday-web `e1507dc` adds `Sentry.captureMessage` to the two error branches in `[locale]/sign-in/page.tsx` (signInWithOAuth → level=error, signInWithOtp → level=warning), mirroring the auth-callback pattern (71e91b1). PII guard preserved: full email never captured; only domain segment after `@`, dropped if `@` absent.
- **Auth-flow Sentry coverage now complete** — every error path in v0.2.0's auth surface emits to Sentry: W4 onboard side-effects (`c328907`), 404 catch-all (`d708a71`), auth/callback missing_code + exchange_failed (`71e91b1`), sign-in oauth_failed + otp_failed (`e1507dc`). All use `function: auth.<name>` tag convention so the Sentry dashboard can split-by-function.
- **v0.2.0 code surface = 29 algorithm runs** on matchday-web `main`, plus the matchday-backend Phase A.1 + A.2 + Sentry-edge work. No further code is required for v0.2.0 ship.
- **Ship status unchanged** — still blocked on Pap external prereqs only (D1 domain, P2 Facebook OAuth, P3 Google OAuth, P4-P6 Resend + DKIM/SPF, P7 Vercel custom domain; P1 Apple optional per D2).
- **Roadmap stays `In Progress`** — flips to `Shipped` only after Pap prereqs land + per-method DoD matrix (`Plans/v02-dod-evidence.md`) verifies on the prod URL.

## 2026-04-25 — v0.1.0 Foundation shipped

- **Status flipped** `Planned` → `Shipped` for v0.1.0 in `version-roadmap.md`. All 5 Done-when criteria met (Realtime POC <500ms p95, magic-link + RLS, TH+EN locales, both CIs green, design tokens visible).
- **Repo strategy override** — shipped on **split repos** (`matchday-web/` + `matchday-backend/`) instead of the single-repo plan in build-prompt §17 #2. Rationale: TPS muscle memory + permission/secret isolation + independent deploy cadence. Logged in `~/Desktop/Cowork/matchday/DECISIONS.md`.
- **Type-sharing approach (b)** — `matchday-web` pulls `types/` artifact from `matchday-backend` via `gh` CLI at build time. Not GitHub Packages.
- **Remote Supabase project** linked: ref `hqcwmjninvunoexccrbz`, region Singapore, free tier.

## 2026-04-24 — Simplification pass (DRAFT v3)

- **Status + date hoisted** — every version was tagged `Planned` Q2 '26; redundancy moved to a single header.
- **v0.0 demoted** from a version to a Prerequisites sidebar — pre-flight items aren't product milestones.
- **DoD trimmed** to 1 sharp exit criterion per version — multi-bullet DoDs were restating features.
- **Cross-cutting checklist** trimmed from 5 to 3 items: kept a11y, observability, audit. Dropped i18n (already in v0.1) and telemetry (deferrable until product-market fit).
- **Known risks** trimmed from 6 to 3 — removed Apple OAuth review delay, multi-day timezone edge cases, brand sprint slip (low-impact or already mitigated in spec).
- **Decisions log extracted** to this file (was inline in roadmap).

## 2026-04-24 — Architectural review (DRAFT v2)

- **Realtime spike added to v0.1** to de-risk Supabase Realtime architecture before scoring/scheduling depend on it.
- **v0.1 scope reduced** to scaffold + magic-link + RLS + realtime spike. Social auth + email infrastructure moved to v0.2.
- **Email infrastructure explicitly owned** by v0.2 (was implicit in v0.4).
- **Public read-only bracket view** added to v0.5 (was deferred to v0.8).
- **Admin role tag** added to v0.3 (3 admin screens were buried).
- **Cross-cutting concerns** (a11y, observability, audit, telemetry, i18n) handled via per-version checklist rather than a dedicated version.
- **Definition of Done bullets** added per version.
- **Known risks table** added to surface architectural unknowns.
- **Pre-flight section** added for accounts/branding/infra prerequisites.

## 2026-04-24 — Initial roadmap decisions (DRAFT v1)

- **Sequence:** Live Scoring (v0.6) ships before Scheduling (v0.7) — de-risks state-machine complexity first; a tournament can run without a printed schedule but not without scoring.
- **Increments:** 9 sub-versions before v1.0 — preserves demo-able milestones; granularity trades higher status-update cost for clearer progress signal.
- **v0.1.0 status:** `Planned` until substantive traction (Supabase wired, auth working, first migration). Reserve `In Progress` for versions with real momentum.

## 2026-04-23 — Anatomy decisions

- **Single product**, no sub-grouping (vs. Setpoint's 4-product grouping).
- **Lifecycle = 3 stages** (`Shipped` / `In Progress` / `Planned`) — momentum model.
- **Numeric + named** version labels (e.g., `v0.6.0 — "Live Scoring"`).
- **Full feature list always shown** (including Planned) — public commitment.
- **Role tag kept** — features clearly target specific user types; helps scanning.
- **Demo + Spec links kept** in anatomy template — placeholders dropped from v3 roadmap until they resolve.
- **Skipped:** functional-area sub-grouping, sport scope, breaking-change flag.
