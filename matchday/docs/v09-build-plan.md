# Matchday v0.9.0 — "Placements + Polish" Build Plan

> **Scope amendment 2026-05-08:** v1 ships ENGLISH-ONLY per Pap decision (see `~/.claude/MEMORY/projects/-Users-preedee-Desktop-Cowork/project_matchday_v1_english_only.md`). **All native-Thai i18n review obligations in this plan are SUPERSEDED and DROPPED from v0.9 scope.** This includes: feature 6 of in-scope list (§2); D-decision D10 (TH review delivery model); §3 prereq P1 (TH native-speaker reviewer); §4 commit W90 (apply pass); §5 ship matrix row "Native-Thai i18n review applied"; §7 anti-criterion about leaving `[TH]` placeholders; §8 risks R11/R12 (TH review); DoD2 step (o) (`[TH]` placeholder grep). All other v0.9 work (placements, override, cancellation, OG previews, email template inventory) is unchanged. Detailed strikethroughs not applied — treat any [TH] / native-Thai / Thai-locale mentions below as historical context only. The bilingual scaffolding stays in matchday-web code so re-enabling Thai post-v1 is a one-line restore in `routing.ts`.

> **Status:** DRAFT v2 — stress-tested by Architect review lens 2026-05-07. **23 findings reconciled** (8 critical applied, 10 important, 5 nits). 5 net-new D-decisions surfaced (D14-D18). 3 BLOCKER findings (B-B01, B-B02, B-B03) surfaced for Pap morning review — NOT applied. DRAFT v1 → DRAFT v2 change-log appended.
> **Predecessor:** v0.8.0 "Realtime + Spectator" — assumed Phase A (Realtime channel `tournament:{id}:bracket` + spectator mode CSS). v0.9.0 is executable independently of v0.8 ship-status because v0.9 only READS from realtime channels (no broadcast-trigger surface here) and writes to NEW tables/columns (placement table; OG cache).
> **DoD:** End-to-end mock tournament finishes with correct placements (1st / 2nd / optional 3rd) AND a shared tournament link renders an OG preview on LINE / WhatsApp / Twitter. Cancellation EF verified post-v0.6/v0.7 schema deploy. All `[TH]` placeholders in `messages/th.json` cleared per `Plans/v02-th-i18n-review.md` checklist.
> **External-prereq risk:** Low-medium. v0.9 needs (a) a TH native-speaker review pass scheduled (Pap-side coordination, the same blocker that's been carried since v0.2.0), and (b) Resend in active state for cancellation fanout — same blocker as v0.2 P4-P6. No new third-party SaaS, no new OAuth, no new infra. Next.js `next/og` ImageResponse ships in Next 15+ with edge runtime by default.

---

## 0 · What v0.9 inherits from v0.4-v0.8 (so what's NOT in this plan)

| Surface | v0.4-v0.8 status | v0.9 obligation |
|---|---|---|
| `cancel_tournament_with_registrations_rpc(p_tournament_id, p_actor_user_id, p_reason)` | shipped (v0.4 B33c, migration `20260429130000`) | **No re-write.** v0.9 B87 verifies it still works against v0.6 (`live`/`completed`) + v0.7 (scheduled matches + `court_blocked_range` rows) status surfaces and adds a `tournament_already_live_with_in_progress_match` guard if needed. **A-A08 fix:** v0.7 `court_blocked_range` rows are auto-cleaned by FK CASCADE on tournament delete; cancel does NOT delete the tournament so blocks survive — explicitly noted as acceptable (blocks reference a cancelled tournament; spectator surface filters by status). |
| `cancel-tournament-with-registrations` Edge Function | shipped (v0.4, 350 LOC) | **No re-write of envelope.** v0.9 B88 swaps the email-fanout call from `send-registration-email kind=registration_withdrawn` (current best-effort placeholder noted in EF header) to a new `tournament_cancelled` template variant (B88 ships the template; B89 wires the kind into send-registration-email). |
| `audit_action` enum — `tournament.cancelled`, `registration.cancelled_by_system` | shipped (v0.4) | v0.9 ADD VALUE for new `tournament.placements_finalized` + `tournament.placement_override` (B80). |
| `tournament.completed` audit + `tournament.completed_at` column | shipped (v0.6 D8 / B52) | v0.9 reads — placement-finalize hook fires immediately after this audit. |
| `match.winner_team_id` + `match.retired_team_id` + `match_type='final'`/`'third_place'` | shipped (v0.5 B37 + v0.6 B52/B53/B54/B55) | v0.9 reads to derive 1st (final winner), 2nd (final loser modulo retire/walkover), 3rd (3rd-place winner if `tournament.has_third_place_match=true`). |
| `tournament.organizer_id` + `organizer.logo_url` (validated by `validate-organizer-logo` EF) | shipped (v0.3) | v0.9 reads logo for the OG image. |
| Resend wrapper + bilingual template machinery in `_shared/templates/` | shipped (v0.2) | v0.9 ADDs `tournament_cancelled` template (B82) + `tournament_completed_with_placements` template (B83, optional — see D5). |
| `messages/th.json` + `messages/en.json` + i18n keys | shipped per-version | v0.9 ADDs `placements.*` + `cancellation.*` + `og.*` namespaces (W82) AND clears every remaining `[TH]` placeholder per `Plans/v02-th-i18n-review.md` (W83). |

**Net new schema in v0.9 (DRAFT v2):**
1. `placement` table — `(id uuid pk, tournament_id uuid fk CASCADE NOT NULL, team_id uuid fk team CASCADE NOT NULL, position int NOT NULL CHECK (position IN (1,2,3)), source text NOT NULL CHECK (source IN ('auto','manual_override')), overridden_by uuid fk public."user" ON DELETE SET NULL, override_reason text, created_at timestamptz default now(), updated_at timestamptz default now())` + UNIQUE `(tournament_id, position)` + UNIQUE `(tournament_id, team_id)`. RLS: **public SELECT** (spectator surface — placements are intentionally world-readable as published-results); **service-role-only INSERT/UPDATE/DELETE** (writes flow exclusively through `_finalize_placements` SECURITY DEFINER + `override_placement_rpc` SECURITY DEFINER). **A-A06 clarification:** the security boundary is on the WRITE side, not the read side. B91 RLS tests verify (a) anon can SELECT (positive), (b) anon/authenticated/TO/admin all CANNOT INSERT/UPDATE/DELETE (negative — only service-role can write), (c) the override RPC bypasses RLS via SECURITY DEFINER and re-validates AUTHZ inside the function body. The denormalized-columns alternative (D2) was rejected — see §1 D2.
2. **Audit enum extension:** `audit_action` ADD VALUE `tournament.placements_finalized`, `tournament.placement_override` (B80).
3. **OG image cache (optional, D7-deferred):** `tournament_og_cache` table — `(tournament_id uuid pk fk, image_bytes bytea, generated_at timestamptz, etag text)`. Default DEFER to v0.9.x; v0.9 ships pure on-demand `next/og` rendering (per-request edge function). If P95 latency > 800ms in DoD2, fall back to this table.
4. **Index:** `idx_placement_tournament` on `placement(tournament_id)` (covered by the unique constraints; redundant — DROPped from B80 unless EXPLAIN shows otherwise).

---

## 1 · D-decisions (DRAFT v1 defaults; Pap review pending)

| # | Decision | Default | Rationale |
|---|----------|---------|-----------|
| **D1** | Placement derivation trigger location | **Postgres function `_finalize_placements(p_tournament_id)` called from inside v0.6 B52/B53/B54's tournament-completion branch (D8 path)** | Mirror of v0.6 D2 (cascade as PL/pgSQL helper). NOT a separate trigger on `tournament.status='completed'` — that creates a second source-of-truth for "tournament just completed" and risks ordering bugs vs the audit emit. The completion branch already SELECT FOR UPDATEs the tournament + locks the match graph; piggybacking on it is the cheapest+safest moment. Idempotent: helper exits early if `placement` rows already exist for the tournament. |
| **D2** | Placement storage shape | **Separate `placement` table (1 row per position)** | Considered: (a) denormalized columns on tournament (`first_team_id`, `second_team_id`, `third_team_id`); (b) separate table. Choose (b) because: (i) manual override needs `overridden_by` + `override_reason` audit fields that don't fit denormalized columns; (ii) future expansion (4th-place, runners-up groupings) is non-disruptive; (iii) RLS clarity — separate table gets its own service-role-write policy without complicating tournament's RLS; (iv) JOIN cost trivial. |
| **D3** | Manual override shape | **Separate `override_placement_rpc(p_tournament_id, p_user_id, p_position, p_team_id, p_reason)` with hard guard `tournament.status='completed'`** | Per requirements. NOT a generic UPDATE on `placement` — separate RPC enforces (a) tournament must be completed, (b) p_team_id must exist on a registered team for this tournament, (c) reason text required (1..500 chars, mirror of v0.4 cancellation reason length), (d) emits `tournament.placement_override` audit with `metadata.{prior_team_id, new_team_id, position, reason_hash}`, (e) sets `source='manual_override'`. The auto-derivation helper (D1) NEVER overwrites a `manual_override` row. |
| **D4** | OG image runtime | **Next.js `next/og` `ImageResponse` on a dynamic edge route `/api/og/tournament/[org-slug]/[t-slug]/route.ts`** | Edge-runtime mandate from requirements. `next/og` ships with `@vercel/og` under the hood — no node-only deps; works on Vercel Edge + Cloudflare Workers. Per-request render is acceptable up to ~800ms cold; if production traffic exceeds budget, fall back to `tournament_og_cache` table (D7). |
| **D5** | OG image content | **Tournament name (large) + dates (DD MMM – DD MMM YYYY) + status pill (per **D14** mapping) + organizer logo (top-right) + Matchday wordmark (bottom-left). 1200×630, sRGB, JPEG-equivalent quality.** | Per requirements + LINE/WhatsApp display conventions. Twitter card = `summary_large_image` variant; same image, different meta tag. Locale-aware: pull `tournament.name_localized` if present (future), else fall back to `tournament.name`. NO player names (privacy: not all viewers should see roster); NO score (a completed-tournament 1st place team_name optional — D6). |
| **D6** | OG includes 1st-place team name when status=completed | **DEFER to v0.9.x** | Privacy + complexity: pulling team_name requires a `team` JOIN that's noisy from edge-runtime and adds a latency variable. Add only if Pap requests after first real tournament. v0.9 default = status pill only. |
| **D7** | OG image caching | **No table; edge-runtime per-request** for v0.9 default | Edge runtime + 800ms budget from D4. If DoD2 latency check fails (P95 > 800ms over 50 cold-cache requests), fall back to `tournament_og_cache` insert + `Cache-Control: s-maxage=300` headers. Keep §3 schema enumeration honest: cache table NOT in v0.9 default migration set. |
| **D8** | Cancellation EF re-verify scope | **Idempotent re-test against v0.6/v0.7 schema + extend with new `tournament_cancelled` email template** | The v0.4 EF currently emits `registration_withdrawn` template as a known semantic-gap placeholder (per its own header docstring). v0.9 fills the gap (B82). Verify behavior on `live` tournament with `in_progress` matches → cancellation should still flip status, emit audit, fan out emails. Add v0.7 sanity: scheduled matches don't block cancellation. |
| **D9** | i18n namespace prefixing | **`placements.*` + `cancellation.*` + `og.*` (3 net-new top-level namespaces)** | Per requirements (collision avoidance with parallel v0.8 work). v0.8 reserves `realtime.*` + `spectator.*` (per v0.8 plan when drafted). No overlap. |
| **D10** | TH i18n review delivery model | **Pap arranges the native-speaker review using `Plans/v02-th-i18n-review.md` as the worksheet; agent applies rewrites in W83 as one PR per checklist bucket (A → B → C → D → E → F → G → H, per the existing structure)** | Pre-existing checklist already buckets the 80+ keys by priority (legal/PDPA → padel vocab → general copy → intentionally-unchanged → welcome email → privacy stub → terms stub → about). v0.9 commit cadence: one commit per bucket for clean diff. |
| **D11** | Placement-finalize idempotency | **Helper checks `EXISTS (SELECT 1 FROM placement WHERE tournament_id = X)` and exits silently if true** | The v0.6 cascade-undo path (B57) can flip tournament from `completed` back to `live`; if the TO subsequently re-completes the tournament, `_finalize_placements` should NOT re-emit + NOT overwrite manual overrides. The clean shape: only the FIRST completion-event INSERTs placements; subsequent re-completions are no-ops. **Trade-off:** if a winner-change edit flips 1st place from Team A → Team B, the placement row stays at Team A. **Mitigation:** B84 exposes `_replace_placements_on_winner_change` called from v0.6 B57 cascade when the FINAL match's winner changes. The placement table is never silently stale. **A-A05 / D15 supersedes the all-or-nothing override-sacred check** — see D15 below. |
| **D12** | Placement override audit metadata shape | **`metadata = {position, prior_team_id, new_team_id, reason_hash, prior_source}`** with `reason_hash = substring(encode(digest(reason, 'sha256'), 'hex') from 1 for 8)` mirror of v0.4 cancellation hash | PII-guard pattern from cancellation (full reason text in `placement.override_reason`, hash in audit). Mirror of v0.4 reason-hash precedent (DECISIONS.md). |
| **D13** | OG cache-control headers | **`Cache-Control: public, max-age=0, s-maxage=300, stale-while-revalidate=86400`** | Allows CDN to cache for 5 min (covers spectator burst), but invalidates fast enough that status-pill updates (e.g. `live` → `completed`) propagate to LINE re-shares within ~5 min. Twitter / LINE / WhatsApp don't typically re-fetch OG previews after first render anyway, but a short s-maxage doesn't hurt. |
| **D14** | OG image status-pill mapping (post-stress-test A-A09) | **Explicit status→display map for all 7 `tournament_status` enum values: `draft` → 404 (private surface, OG route returns `Not Found`); `registration_open` → "Registration open" (green); `registration_closed` → "Registration closed" (gray); `published` → "Coming up" (blue); `live` → "Live" (red); `completed` → "Completed" (purple); `cancelled` → "Cancelled" (slate)** | Per `tournament_status` enum (v0.3 B7) — 7 values. Plan v1's "live/completed/cancelled" omitted 4 surfaces. `draft` is the only status that returns 404 — drafts are private; OG preview leaking the URL would expose unpublished work. The other 6 are public-readable per existing v0.5 RLS. i18n keys for all 6 status pills enumerated in §6 `og.status_*`. |
| **D15** | Placement override sacredness scope (post-stress-test A-A05) | **Per-POSITION sacredness, NOT all-or-nothing** | Pre-fix B84 said "skip if any placement row has source='manual_override'" — too coarse: if 1st was overridden but 3rd is auto, B84 should still re-derive 3rd. Fix: B84 walks positions 1, 2, 3 and skips ONLY positions with `source='manual_override'`; auto-positions get DELETEd + re-derived. Returns `(positions_replaced int[], positions_skipped_manual int[])` for caller observability. New anti-criterion. |
| **D16** | OG route field-allowlist (post-stress-test A-A07) | **Edge route reads ONLY `(tournament.id, tournament.name, tournament.start_date, tournament.end_date, tournament.status, organizer.id, organizer.display_name, organizer.logo_url)` — no other fields** | Anon RLS may expose `organizer.contact_email`, `organizer.phone`, `organizer.line_id`, `organizer.about`, etc. Without an explicit allowlist the OG route's `select('*')` would pull them into edge-runtime memory (and potentially log them in Sentry breadcrumbs on failure). Fix: explicit `select('id, name, start_date, end_date, status, organizer:organizer_id(id, display_name, logo_url)')` clause in W95. New anti-criterion. |
| **D17** | B83 hook idempotency in all 3 v0.6 RPC paths (post-stress-test A-A03) | **Extract `_post_match_completion(p_tournament_id, p_via)` helper NOW (v0.9, not deferred to v0.6.x per v0.6 R26)** | B83 hooks `_finalize_placements` into v0.6 B52 (enter-score), B53 (retire), B54 (walkover) — three different RPCs with three different completion branches. Triplicating the call is fragile (mirror of v0.6 A-A04 risk). Extract `_post_match_completion(p_tournament_id, p_via text)` helper that wraps: (a) tournament.status='completed' UPDATE (idempotent — skip if already completed); (b) `tournament.completed` audit emit (idempotent via `tournament.completed_at IS NULL` guard); (c) `_finalize_placements` call (idempotent per D11). All 3 v0.6 RPCs invoke this single helper post-D8 branch. v0.6 R26 obligation closed by v0.9. **Trade-off:** touches 3 v0.5/v0.6-frozen RPCs — but per anti-criteria already permitted ("only adds B83 hook calls into v0.6 B52/B53/B54"). |
| **D18** | Override RPC AUTHZ explicit step (post-stress-test A-A04) | **B85 step (1) AUTHZ explicitly mirrors v0.4 B33c pattern: SELECT EXISTS (organizer-of-tournament) OR EXISTS (admin role on user); raise `unauthorized` (P0001) if neither** | Plan v1 D3 said "AUTHZ — caller is tournament organizer OR admin (mirror of v0.4 cancellation pattern)" but B85 prose left it abstract. Make explicit: organizer check via `tournament.organizer_id = p_user_id`; admin check via `'admin' = ANY(u.roles)`. `unauthorized` raised before status-guard so callers see consistent error semantics. |

---

## 2 · Scope

In-scope (per `Plans/version-roadmap.md` v0.9.0):

1. **Placements auto-derived** — `_finalize_placements(p_tournament_id)` helper called via the new `_post_match_completion` shared helper (D17) from v0.6 B52/B53/B54 tournament-completion branch. Derives 1st (final.winner_team_id), 2nd (`CASE WHEN winner_team_id = team_a_id THEN team_b_id ELSE team_a_id END`, with explicit NULL-guard on team_a_id AND team_b_id per v0.6 D19/A-A01), 3rd (3rd-place match winner when `tournament.has_third_place_match=true` AND third-place row exists AND is terminal).
2. **Manual placement override** — `override_placement_rpc` admin/TO-only with `tournament.status='completed'` hard guard + audit row.
3. **Tournament cancellation flow** — verify v0.4 EF works post-v0.6/v0.7 schema deploys; extend with `tournament_cancelled` email template (replaces the `registration_withdrawn` placeholder).
4. **OpenGraph rich previews** — dynamic per-tournament edge-runtime route at `/api/og/tournament/[org-slug]/[t-slug]`; meta tags wired into the public detail + bracket pages.
5. **Email template inventory** — README at `supabase/functions/_shared/email-templates/README.md` (note: existing dir is `_shared/templates/` — rename or symlink — see B82) listing all current templates + v0.9 additions, each with TH+EN variants confirmed.
6. **Native-Thai i18n review** — apply native-speaker rewrites per `Plans/v02-th-i18n-review.md` checklist; one commit per bucket.
7. **Cross-cutting DoD** — a11y axe-clean on tournament-detail + OG-preview routes; Sentry on every server action; audit log emits 2 new actions; i18n strings under `placements.*` + `cancellation.*` + `og.*`.

Out-of-scope (defer per roadmap):

- 1st-place team-name on OG image → v0.9.x (D6)
- `tournament_og_cache` table → v0.9.x (D7) unless DoD2 latency check fails
- Score-update emails → never (v0.6 D10 — not even in v0.9)
- Multi-bracket placements (e.g. losers' bracket placements) → v2+ (single-elim only in v1)
- Placement publication notification email → v1.0 polish (covered by `tournament_completed_with_placements` template stub at B83 if Pap insists; otherwise deferred)
- Performance pass / Lighthouse budgets → v1.0
- Full WCAG AA audit → v1.0 (v0.9 a11y is just axe-clean on the new surfaces)

---

## 3 · External Prerequisites — gate questions for Pap

| # | Prereq | Risk | Required for | Action |
|---|--------|------|--------------|--------|
| P1 | **TH native-speaker reviewer scheduled** | Carried from v0.2.0 | W83 (i18n review apply pass) | Pap arranges; agent waits for verdicts in `Plans/v02-th-i18n-review.md`. Without this, W83 ships as a no-op + obligation rolls to v0.9.x (or v1.0). |
| P2 | **Resend domain still active + DKIM/SPF green** | Carried from v0.2.0 | Cancellation EF email fanout (B80/B82) | Re-verify in DoD2; Resend dashboard health check. |
| P3 | **Vercel project live (D1 from v0.2.0 still pending if domain unregistered)** | Carried from v0.2.0 | OG route deploy; Twitter/LINE OG-preview verification at real URL | Without prod URL, DoD2 OG-preview steps verify on Vercel preview URL only (sufficient for ship; LINE/WhatsApp will work the same on prod). |
| P4 | **No new external services** | None | n/a | None. |
| P5 | **`@vercel/og` (transitive via Next 15+ `next/og`)** | Already shipped via Next.js dependency | OG route | None — verify presence at W79. |

### Decisions needed from Pap (gate)

The 18 D-decisions in §1 are surfaced as PR-style defaults (13 from DRAFT v1 + 5 from DRAFT v2 stress-test: D14-D18). Recommended order: D1 (placement derivation location), D2 (storage shape), D3 (override RPC), D5 + D14 (OG content + status enumeration), D11 + D15 (idempotency + per-position sacredness), D17 (`_post_match_completion` extraction touches v0.6 frozen surfaces — needs explicit Pap sign-off). Then D4 + D6 + D7 + D8 + D9 + D10 + D12 + D13 + D16 + D18 (mostly engineering-internal). **3 BLOCKER findings** (B-B01, B-B02, B-B03 in change-log) require Pap morning review before v0.9 scaffolding can begin.

---

## 4 · Phased commit plan

Continuing the commit-numbered convention. v0.7 backend ended at B73; v0.8 backend (assumed) ends at B79 (B75-B79). v0.9 starts at **B80**. v0.7 web ended at W78; v0.8 web (assumed) ends at W88. v0.9 web starts at **W89**.

> Exact starting numbers refresh post-v0.8 ship; the offsets below assume v0.8 occupies B75-B79 / W79-W88. **If v0.8 ships with different counts, v0.9 numbers shift by the delta.**

Sequencing: Phase A backend (B80-B92) → Phase B web (W89-W99) → Phase C ship gate.

### Phase A — Backend schema + RPCs + Edge Functions (matchday-backend) — gates Phase B

| Commit | Description |
|---|---|
| **B80** | **Schema migration: `placement` table + `audit_action` enum extension.** Single migration. CREATE TABLE placement (...) per §0; UNIQUE constraints; RLS public SELECT + service-role-only writes. ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'tournament.placements_finalized', 'tournament.placement_override'. |
| **B81** | **`audit_action` v0.9 completeness assert.** Idempotent guard mirror of v0.5 B38 + v0.6 B49 + v0.7 B64. ADD VALUE IF NOT EXISTS for both v0.9 values; DO block validates all present. |
| **B82** | **`_finalize_placements(p_tournament_id)` PL/pgSQL helper.** SECURITY DEFINER. Pipeline: (1) **idempotent check** — RETURN if `EXISTS (SELECT 1 FROM placement WHERE tournament_id = X)`; (2) SELECT the FINAL match (`match_type='final'` for the tournament's draw) into `(v_final_winner_id, v_final_team_a_id, v_final_team_b_id, v_final_status)`; (3) **A-A01 / v0.6 D19 NULL guard** — IF `v_final_winner_id IS NULL` OR `v_final_team_a_id IS NULL` OR `v_final_team_b_id IS NULL` raise `placement_final_not_resolved` (P0001) — defense-in-depth against the v0.6 "phantom team" path even though v0.6 B52/B53/B54 now guards this; (4) **A-A02 explicit 2nd-place derivation** — `v_second_id := CASE WHEN v_final_winner_id = v_final_team_a_id THEN v_final_team_b_id ELSE v_final_team_a_id END` (NOT a `winner_team_id`-of-loser-side handwave); (5) IF `tournament.has_third_place_match=true` SELECT the THIRD_PLACE match — apply same NULL guard; if row missing OR status NOT IN (`completed`, `retired`, `walkover`) raise `placement_third_place_not_resolved`; `v_third_id := third_place.winner_team_id`; (6) INSERT 1 / 2 / (optionally 3) placement rows with `source='auto'` in a SINGLE INSERT statement (atomic — UNIQUE `(tournament_id, position)` guards against concurrent calls per R1); (7) emit ONE `tournament.placements_finalized` audit row with `metadata.{positions_count, has_third_place, first_team_id, second_team_id, third_team_id}`. NOT exposed as RPC; called only from `_post_match_completion` (B83). |
| **B83** | **Extract `_post_match_completion(p_tournament_id, p_via text)` shared helper + hook into v0.6 B52/B53/B54 (D17 / A-A03).** Closes v0.6 R26 obligation. Pipeline: (a) **idempotent status flip** — IF `tournament.status != 'completed'` THEN UPDATE tournament SET status='completed', completed_at=now(); (b) **idempotent audit emit** — IF the just-flipped (or already-completed-but-no-audit) state needs it, INSERT `tournament.completed` audit (guard via `NOT EXISTS (SELECT 1 FROM audit_log WHERE action='tournament.completed' AND tournament_id=p_tournament_id)`); (c) **call `_finalize_placements(p_tournament_id)`** (which is itself idempotent per D11). Each of v0.6 B52/B53/B54's tournament-completion D8 branch is rewritten to call this helper instead of triplicating the status-flip + audit-emit + (now) finalize-placements logic. **Enumerated branches:** B52 line ~ "tournament_completed" branch; B53 same branch (retire-path); B54 same branch (walkover-path). Each had its own D7/D8 logic per v0.6 R26 — now triple-DRY-ed. **Idempotency proof:** all 3 branches can fire `_post_match_completion` exactly once per tournament-completion event; even on cascade-undo + re-completion the helper exits early on (a) and (b) and (c) all because of their respective guards. |
| **B84** | **`_replace_placements_on_winner_change(p_tournament_id, p_match_id)` PL/pgSQL helper (D15 / A-A05 — per-position sacredness).** Called from v0.6 B57 `_cascade_undo_then_replace` when (a) the affected match is the FINAL or 3RD-PLACE match AND (b) tournament had been `completed` (now reverted to `live` per v0.6 D16). Pipeline: (1) `SELECT array_agg(position) FROM placement WHERE tournament_id=X AND source='manual_override'` into `v_skip_positions`; (2) `DELETE FROM placement WHERE tournament_id=X AND source='auto' AND position != ALL(v_skip_positions)` — this is per-POSITION skip, not all-or-nothing (auto positions DELETEd, manual positions preserved); (3) re-INVOKE `_finalize_placements` once the cascade resettles (handled by re-completion path naturally per D11 idempotency — the helper's `EXISTS` check sees the surviving manual rows and returns early); (4) RETURN `(positions_replaced int[], positions_skipped_manual int[])` for caller observability. **D11 trade-off documented:** if a manual override exists for position N but the structural winner of position N has changed via cascade, the override row stays at the now-stale team — surface a UI warning per-position in W97. **A-A05 fix supersedes the prior all-or-nothing skip.** |
| **B85** | **`override_placement_rpc(p_tournament_id, p_user_id, p_position, p_team_id, p_reason)`.** SECURITY DEFINER. Pipeline: (1) **AUTHZ explicit (D18 / A-A04)** — `v_is_organizer := EXISTS (SELECT 1 FROM tournament WHERE id=p_tournament_id AND organizer_id=p_user_id)`; `v_is_admin := EXISTS (SELECT 1 FROM public."user" WHERE id=p_user_id AND 'admin' = ANY(roles))`; IF NOT (v_is_organizer OR v_is_admin) raise `unauthorized` (P0001); mirror of v0.4 B33c authz block exactly; (2) SELECT FOR UPDATE on tournament; status guard `tournament.status='completed'` ELSE raise `tournament_not_completed`; (3) validate `p_position IN (1,2,3)`; (4) validate `p_team_id` exists in `team` table for this tournament's draw; (5) validate `p_reason` 1..500 chars; (6) compute `v_reason_hash` via sha256/encode/substring; (7) UPSERT placement row at `(tournament_id, position)` SET `team_id = p_team_id, source='manual_override', overridden_by = p_user_id, override_reason = p_reason, updated_at = now()` — capture prior team_id + prior source in temp; (8) emit `tournament.placement_override` audit per D12 metadata shape; (9) RETURN `(prior_team_id, new_team_id, prior_source)`. SECURITY DEFINER + service-role-only EXECUTE. |
| **B86** | **Edge Function `override-placement`** — thin wrapper. JWT auth, body parse `{tournament_id, position, team_id, reason}`, supabase service-role client, invoke RPC, map errors → status (403 unauthorized, 404 not_found, 422 tournament_not_completed / invalid_position / team_not_in_tournament / reason_required / reason_too_long, 500 unhandled). Sentry capture on 500s. Pattern matches v0.4 B33c + v0.6 B60. |
| **B87** | **Verify v0.4 `cancel-tournament-with-registrations` against v0.6/v0.7 schema.** Read-only verification commit (NO code change unless a regression surfaces). Test against: (a) `tournament.status='live'` with `in_progress` matches → expect cancel succeeds, all matches stay (audit trail intact), notifications fire; (b) `tournament.status='live'` with completed matches mid-bracket → expect cancel succeeds; (c) `tournament.status='registration_open'` with no matches → expect cancel succeeds (v0.4 path); (d) tournament with v0.7 `match.scheduled_at` populated → expect cancel succeeds, no scheduling-conflict raise; (e) **A-A08 — tournament with v0.7 `court_blocked_range` rows** → expect cancel succeeds; blocked-range rows survive (FK is on tournament; no CASCADE specified for cancel, only for delete) — `block_court_range_public` view's spectator surface filters by parent tournament status and excludes cancelled tournaments naturally. Document this as the v0.9 invariant (cancel preserves operational artifacts for audit); (f) **A-A08b — tournament with v0.7 `tournament.round_durations` set** → expect cancel succeeds (no schema interaction; round_durations is config). If ANY case regresses → add a v0.9.x patch to the RPC (likely a status-status guard relaxation). |
| **B88** | **Replace `registration_withdrawn` placeholder with new `tournament_cancelled` email template.** New file `_shared/templates/tournament_cancelled.ts` mirror of `registration_withdrawn.ts` shape (**A-A10 verified** — `registration_withdrawn.ts` already uses `STRINGS: Record<Locale, ...>` map, `escapeHtml` + `fmt` helpers, `RenderedEmail` interface; the new file copies that exact shape, just with new STRINGS content + `TournamentCancelledArgs` type carrying `displayName, tournamentName, organizerName, reason, tournamentUrl, locale`). STRINGS map TH+EN. Subject: "Tournament cancelled: {tournament_name}" / "[TH] Tournament cancelled: {tournament_name}" (TH placeholder per W90 review queue, mirroring v0.4 B23 pattern). Body: 3-paragraph copy explaining cancellation + organizer-provided reason (escaped via `escapeHtml`, hard-truncated at 500 chars matching `REASON_MAX_LENGTH`) + apology. UPDATE `cancel-tournament-with-registrations/index.ts` to invoke `send-registration-email` with `kind='tournament_cancelled'` (not `'registration_withdrawn'`); update that EF's switch to dispatch the new template. **Privacy guard**: never render player email/phone/LINE per existing R14 (mirror of v0.4 registration_withdrawn). |
| **B89** | **`send-registration-email` Edge Function — extend with `kind='tournament_cancelled'` branch.** Switch arm imports `tournament_cancelled.ts` template + dispatches Resend send + emits `email.sent` audit with `metadata.kind='tournament_cancelled'`. |
| **B90** | **Email-template inventory README.** `supabase/functions/_shared/templates/README.md` (NOT renaming dir to `email-templates/` — keep existing structure to avoid churn; the requirements wording is a hint, not a hard rename ask). Inventories all 13 templates (12 existing + 1 new) with: kind, recipient role, EN+TH status, trigger event, owning EF. Format: markdown table. |
| **B91** | **RLS regression tests + integration tests for v0.9.** Coverage: placement table — TO/admin can SELECT own tournament placements; spectator/anon can SELECT (D2 RLS); writes blocked except service-role. `_finalize_placements` integration: 8-team tournament scored to completion → 3 placement rows with correct teams; tournament with `has_third_place_match=false` → 2 placement rows (1st + 2nd only); winner-change edit on FINAL → existing auto-placements DELETEd + re-derived after re-completion; manual override → subsequent re-completion does NOT clobber. `override_placement_rpc` AUTHZ + status-guard + reason-validation. Cancellation regression: v0.6 `live` + v0.7 scheduled-matches paths verified per B87. |
| **B92** | `types/database.ts` regenerated by deploy workflow. No manual gate. |

### Phase B — Web (matchday-web) — depends on Phase A types regen

| Commit | Description |
|---|---|
| **W89** | `bun run sync-types` post-Phase-A. Verify `Placement` type, new RPCs, audit-action enum extension visible. **No new packages** (`next/og` is a Next.js built-in for Next 15+). |
| **W90** | **Native-Thai i18n review apply pass.** Per D10. One commit per `Plans/v02-th-i18n-review.md` bucket: Bucket A (legal/PDPA), B (padel vocab), C (general copy), D (no-op intentionally-unchanged — verify), E (welcome email), F (privacy stub), G (terms stub), H (about page). Each bucket commit references the row(s) updated. **Gated on P1.** If Pap hasn't completed review by W90, ship a placeholder commit (or skip and re-roll to v0.9.x). |
| **W91** | **Tournament-detail page placements section** — server component on `/tournaments/[org-slug]/[t-slug]` that fetches placement rows post-completion + renders 1st / 2nd / 3rd cards with team names + player avatars. Hidden when no placements exist. i18n keys `placements.position_first` / `position_second` / `position_third` / `section_heading` / `auto_derived_label` / `manual_override_label`. |
| **W92** | **Placements display on bracket route** — minor extension to v0.5 W46 / v0.6 W62 to surface a "Final results" panel above the bracket when status=completed. Same data as W91. Spectator-mode (v0.8) compatible. |
| **W93** | **Manual placement override UI (TO surface)** — new "Placements" tab on the organizer management hub. Visible when `tournament.status='completed'`. Shows current placements (auto/manual badge) + per-position dropdown of all teams + reason textarea (required, max 500 chars) + Submit button per row. Invokes `override-placement` Edge Function. Toast with success/error. |
| **W94** | **Cancellation web confirm-dialog upgrade** — extend v0.4 W28b cancel action to use the v0.9 `tournament_cancelled` semantic copy in the confirm-dialog ("All N players will be notified that the tournament has been cancelled."). i18n keys `cancellation.confirm_title` / `confirm_body` / `confirm_button` / `success_toast` / `error_toast`. |
| **W95** | **OG image route** — `/api/og/tournament/[org-slug]/[t-slug]/route.ts` with `export const runtime = 'edge'`. Reads tournament + organizer from supabase via **D16 explicit field allowlist** (A-A07 fix): `select('id, name, start_date, end_date, status, organizer:organizer_id(id, display_name, logo_url)')` — NO `select('*')`, NO contact_email/phone/line_id/about leak into edge memory or Sentry breadcrumbs. **D14 status mapping** (A-A09): if `tournament.status='draft'` return 404 immediately; otherwise render the status pill per the 6-value map. Composes ImageResponse per D5; returns with Cache-Control per D13. **NO node-only imports** (verified via `next build` + manual `grep -r 'fs\\|path\\|child_process'` on the route). **`next/og` JSX subset constraint:** organizer logo fetched via `await fetch(organizer.logo_url)` first (edge-compatible), Content-Type validated against `image/*`, falls back to Matchday wordmark on invalid; logo passed to ImageResponse as `<img src={...} />` element (NOT as bg-image — `next/og` JSX is restrictive). |
| **W96** | **OG meta tags wired into tournament-detail + bracket pages** — Next.js `generateMetadata` exports return `{ openGraph: { images: [{ url: '/api/og/tournament/...', width: 1200, height: 630 }] }, twitter: { card: 'summary_large_image', images: [...] } }`. Server-rendered into `<head>` on initial response. |
| **W97** | **Stale-placement warning surface** — when `placement` rows exist with `source='manual_override'` AND tournament was re-completed after a winner-change cascade (per B84 trade-off), show a yellow banner on the Placements tab: "Placements may be stale — a downstream match was edited. Review and re-override if needed." Detection: compare `placement.updated_at` against `tournament.completed_at`. |
| **W98** | **i18n keys for v0.9 surface** — `messages/en.json` (TH bundle gets full TH per W90 review). Namespaces per D9: `placements.*` (12 keys), `cancellation.*` (8 keys), `og.*` (4 keys for OG `alt` text + status-pill labels). |
| **W99** | a11y + Sentry sweep. axe-core on `/tournaments/[org-slug]/[t-slug]` (with placements visible) + on the OG route (semi-applicable — image route, alt text matters). Sentry capture on every server action error path with `function: placement.<X>` / `function: og.<X>` tags. Manual review documented. |

### Phase C — DoD verification + ship

| Commit | Description |
|---|---|
| **DoD1** | Per-feature ship matrix in `Plans/v09-dod-evidence.md`. |
| **DoD2** | E2E walkthrough by Pap: (a) seed an 8-team tournament with `has_third_place_match=true` from v0.6/v0.7 ship state; (b) score to completion (final + 3rd-place) → confirm 3 placement rows auto-created with `source='auto'`, `tournament.placements_finalized` audit row present; (c) public tournament-detail page shows placements section; (d) bracket route shows "Final results" panel above bracket; (e) edit FINAL with winner change → confirm cascade reverts tournament to `live`, placement rows DELETEd (no manual overrides present); (f) re-score final → tournament back to `completed`, placements re-derived correctly; (g) Placements tab on management hub → override 3rd place to a different team with reason "judge ruling on protest" → confirm UPSERT, audit row with `metadata.prior_source='auto'`; (h) re-score a match below the SF → tournament reverts to live → confirm manual override placement persists (sacred per D11) + W97 stale warning visible after re-completion; (i) cancellation flow on a `live` tournament with `in_progress` matches → confirm cancel succeeds, players receive `tournament_cancelled` email (verify Resend delivery), audit trail intact, NO double-charge / double-send (idempotent re-call returns same snapshot per v0.4 R-pattern); (j) OG image at `/api/og/tournament/{slug}/{slug}` → confirm renders 1200×630 with name + dates + status pill + organizer logo + Matchday wordmark; (k) share tournament URL on LINE chat → confirm OG preview renders; (l) share on WhatsApp → confirm OG preview renders; (m) share on Twitter → confirm `summary_large_image` card renders; (n) axe-core on `/tournaments/{slug}/{slug}` → 0 violations; (o) verify `messages/th.json` has zero `[TH]` placeholders (`grep -r '\\[TH\\]' messages/th.json` returns empty); (p) cancellation EF idempotent re-call → second invocation returns `tournament_already_cancelled` 422, no duplicate emails sent; (q) override on a `live` tournament → confirm `tournament_not_completed` 422 error. **DRAFT v2 additions:** (r) **A-A01 NULL-guard** — manually craft a tournament with FINAL match where `team_a_id` is NULL (simulate by clearing one side post-cascade in a test fixture); attempt to call `_finalize_placements` → confirm `placement_final_not_resolved` raised, no placement rows INSERTed. (s) **A-A02 explicit 2nd-place** — score a final where Team B (in `team_b_id` slot) wins; verify `placement.position=2` row has `team_id = team_a_id` (the loser slot), NOT a NULL or wrong derivation. (t) **A-A05 per-position sacredness** — score 3-team tournament, override 1st place manually; trigger cascade-undo on FINAL; re-complete → confirm 1st-place override persists (manual), 2nd + 3rd re-derived (auto); verify B84 return shape `positions_replaced=[2,3]`, `positions_skipped_manual=[1]`. (u) **A-A03 helper idempotency** — score a tournament via retire-path (B53), then via walkover-path (B54) for two separate brackets; confirm both fire `_post_match_completion` exactly once each, no duplicate `tournament.completed` audit, placements created once. (v) **D14 / A-A09 status pills** — render OG for tournaments at every status: confirm `draft` → 404; `registration_open` / `registration_closed` / `published` / `live` / `completed` / `cancelled` → 200 with correct localized pill. (w) **A-A07 field allowlist** — set `organizer.contact_email='leak@test.com'`; render OG; inspect Sentry breadcrumbs + edge-function logs → confirm contact_email never appears in any log line or response. (x) **A-A04 AUTHZ override** — invoke `override_placement_rpc` as non-organizer non-admin user → confirm `unauthorized` 403; as admin → 200; as organizer → 200. (y) **A-A08 cancel + court-blocks** — cancel a tournament with v0.7 `court_blocked_range` rows → confirm cancel succeeds, blocked-range rows survive, spectator surface filters them out via tournament status filter. |
| **DoD3** | Both CIs green on `main`. Auto-types-regen committed. |
| **DoD4** | Migrations applied to remote prod (B80 + B81). v0.9 Edge Functions deployed (override-placement). |
| **DoD5** | DECISIONS.md updated with v0.9 D1-D18 final answers (D14-D18 added in DRAFT v2). |
| **DoD6** | `Plans/version-roadmap.md` v0.9.0 header gets `Shipped` + ship date. |
| **DoD7** | `Plans/decisions.md` gets v0.9 ship entry. |
| **DoD8** | `padelthailand.com/matchday/` rebuilt + Pap-approved push. |

---

## 5 · Per-feature ship matrix

| Feature | Code-complete | Backend ready | E2E verified | Ship status |
|---------|---------------|---------------|--------------|-------------|
| Placements auto-derived (1st/2nd/3rd) | ⬜ | ⬜ B80 + B82 + B83 | ⬜ | Required (DoD anchor) |
| Manual placement override (TO/admin, audit-logged) | ⬜ | ⬜ B80 + B81 + B85 + B86 | ⬜ | Required (DoD anchor) |
| Placement re-derive on cascade-undo (winner change) | ⬜ | ⬜ B84 | ⬜ | Required |
| Placement-stale warning when manual override survives cascade | ⬜ | ⬜ W97 | ⬜ | Required |
| Tournament cancellation flow verified post-v0.6/v0.7 | ⬜ | ⬜ B87 | ⬜ | Required (DoD anchor) |
| `tournament_cancelled` email template (TH+EN) | ⬜ | ⬜ B88 + B89 | ⬜ | Required |
| OG image route (edge runtime, 1200×630) | ⬜ | ⬜ W95 | ⬜ | Required (DoD anchor) |
| OG meta tags on detail + bracket pages | ⬜ | ⬜ W96 | ⬜ | Required |
| Twitter `summary_large_image` variant | ⬜ | ⬜ W96 | ⬜ | Required |
| Email template inventory README | ⬜ | ⬜ B90 | ⬜ | Required |
| Native-Thai i18n review applied (8 buckets) | ⬜ | ⬜ W90 | ⬜ | **Required IF P1 met**; else rolls to v0.9.x |
| a11y axe-clean on tournament-detail + OG routes | ⬜ | ⬜ W99 | ⬜ | Required |

v0.9 ships when 12/12 are green AND DoD2's placement-derive + override + cancellation + OG-preview paths verify end-to-end.

---

## 6 · i18n key inventory (D9 namespaces)

### `placements.*` (W91/W92/W93/W97)

| Key | EN |
|---|---|
| `placements.section_heading` | Final results |
| `placements.position_first` | 1st place |
| `placements.position_second` | 2nd place |
| `placements.position_third` | 3rd place |
| `placements.auto_derived_label` | Auto-derived |
| `placements.manual_override_label` | Manual override |
| `placements.override_dialog_title` | Override placement |
| `placements.override_reason_label` | Reason (required) |
| `placements.override_reason_placeholder` | e.g. judge ruling on protest |
| `placements.override_submit` | Save override |
| `placements.override_success_toast` | Placement updated |
| `placements.stale_warning_banner` | Placements may be stale — a downstream match was edited. Review and re-override if needed. |

### `cancellation.*` (W94)

| Key | EN |
|---|---|
| `cancellation.confirm_title` | Cancel this tournament? |
| `cancellation.confirm_body` | All {n, plural, one {# player will} other {# players will}} be notified by email. This action cannot be undone. |
| `cancellation.confirm_reason_label` | Reason for cancellation (required) |
| `cancellation.confirm_reason_placeholder` | e.g. venue unavailable, weather |
| `cancellation.confirm_button` | Cancel tournament |
| `cancellation.confirm_button_busy` | Cancelling… |
| `cancellation.success_toast` | Tournament cancelled. {n} players notified. |
| `cancellation.error_toast` | Could not cancel tournament. Please try again. |

### `og.*` (W95/W96) — D14 enumerated status pills

| Key | EN |
|---|---|
| `og.alt_text` | Matchday tournament: {tournament_name} |
| `og.status_registration_open` | Registration open |
| `og.status_registration_closed` | Registration closed |
| `og.status_published` | Coming up |
| `og.status_live` | Live |
| `og.status_completed` | Completed |
| `og.status_cancelled` | Cancelled |

(Note: `og.status_draft` deliberately absent — D14 specifies 404 for draft tournaments; OG route never renders this pill.)

---

## 7 · Anti-criteria (locked)

- v0.9.0 must NOT ship 1st-place team-name on OG image (D6 — v0.9.x)
- v0.9.0 must NOT ship `tournament_og_cache` table (D7 — v0.9.x unless DoD2 latency fails)
- v0.9.0 must NOT ship score-update emails (v0.6 D10 — never)
- v0.9.0 must NOT ship multi-bracket / losers-bracket placements (v2+)
- v0.9.0 must NOT ship full WCAG AA audit (v1.0)
- v0.9.0 must NOT ship Lighthouse-budget performance pass (v1.0)
- v0.9.0 must NOT modify v0.4 frozen surfaces (registration RPCs, partner-invite RPCs, waitlist promotion) — only verifies + extends cancellation EF
- v0.9.0 must NOT modify v0.5/v0.6/v0.7 frozen surfaces (draw RPCs, score RPCs, schedule RPCs) — only adds B83 hook calls into v0.6 B52/B53/B54 + B84 hook into v0.6 B57
- v0.9.0 `override_placement_rpc` must NOT silently accept overrides on a `tournament.status != 'completed'` (raise `tournament_not_completed` 422)
- v0.9.0 OG image route must NOT use node-only imports (`fs`, `path`, `child_process`, etc.) — verified by `next build` (will fail to deploy to edge if it does) + manual grep at W95
- v0.9.0 OG image route must NOT exceed 1MB rendered output (Twitter / LINE limits)
- v0.9.0 cancellation EF must NOT double-charge or double-notify on idempotent re-call (verified via DoD2 step (p))
- v0.9.0 cancellation EF must NOT silently swallow Resend delivery failures (every fanout failure → Sentry warning + counted in `email_failed` return field)
- v0.9.0 placement auto-derive must NOT overwrite a `manual_override` row (D11 — sacred)
- v0.9.0 placement override must NOT permit a team that isn't registered to the tournament (B85 step 4 validation)
- v0.9.0 placement override must NOT skip the audit emit (every override = 1 audit row with full metadata per D12)
- v0.9.0 must NOT introduce schema beyond the 1 table + 2 enum values listed in B80
- v0.9.0 must NOT push padelthailand.com/matchday/ without explicit Pap approval
- v0.9.0 must NOT silently leave `[TH]` placeholders in `messages/th.json` if W90 ships (DoD2 step (o) gates this); IF P1 unmet, W90 is explicitly skipped + obligation rolls to v0.9.x with a roadmap-update commit
- v0.9.0 OG image must NOT leak player PII (no email, phone, LINE ID, WhatsApp, DOB, gender, country, individual player names in v0.9 default — D6 defers even team-name)
- **DRAFT v2 additions (post-stress-test):**
- v0.9.0 `_finalize_placements` must NOT INSERT placement rows when final.team_a_id IS NULL OR final.team_b_id IS NULL OR final.winner_team_id IS NULL (A-A01 / D11 NULL-guard) — raises `placement_final_not_resolved` instead
- v0.9.0 `_finalize_placements` must NOT derive 2nd place via `winner_team_id`-of-loser-side handwave — must use explicit `CASE WHEN winner = team_a_id THEN team_b_id ELSE team_a_id END` (A-A02)
- v0.9.0 `_replace_placements_on_winner_change` must NOT skip auto-derive on positions where `source='auto'` just because OTHER positions have `source='manual_override'` (A-A05 / D15 — per-position sacredness, not all-or-nothing)
- v0.9.0 OG route must NOT render a status pill for `tournament.status='draft'` — must return 404 (A-A09 / D14 — drafts are private surface)
- v0.9.0 OG route must NOT use `select('*')` against tournament or organizer — must use D16 explicit field allowlist (A-A07)
- v0.9.0 `override_placement_rpc` must NOT skip the explicit AUTHZ block — D18 / A-A04 mirror of v0.4 B33c authz: organizer OR admin, raise `unauthorized` before status-guard
- v0.9.0 `_post_match_completion` (B83 / D17 / A-A03) must be the SOLE call site for `_finalize_placements` from v0.6 RPCs — no triplicated direct calls in B52/B53/B54
- v0.9.0 placement RLS test must NOT verify "TO-only SELECT" — placements are intentionally world-readable per v0.9 spectator surface (A-A06 — security boundary is on writes, not reads)
- v0.9.0 `cancel-tournament-with-registrations` must NOT delete v0.7 `court_blocked_range` rows on cancel — they survive for audit; spectator surface filters by tournament status (A-A08)

---

## 8 · Risk register (DRAFT v1; pre-stress-test)

| # | Risk | Mitigation |
|---|------|------------|
| R1 | Placement auto-derive fires twice on cascade-undo + re-complete sequence and creates duplicate audit rows | D11 idempotent guard via `EXISTS` check. B84 explicitly DELETEs auto-source rows when cascade reverts to `live`. Verified in B91 + DoD2 step (e)(f). |
| R2 | Manual override + cascade-undo creates stale placements (override targets a team that's no longer in 1st/2nd/3rd structurally) | D11 trade-off: manual is sacred. W97 stale-warning surfaces this to TO. v1.0 may add explicit "clear all overrides + re-derive" admin action if Pap requests. |
| R3 | OG image P95 latency exceeds 800ms cold-cache → poor LINE/WhatsApp preview UX | D7 fallback: `tournament_og_cache` table + `s-maxage=300` headers. Measured in DoD2 step (j) — 50 cold-cache requests → P95 logged. If > 800ms, fall through to v0.9.x cache patch. |
| R4 | OG image fails on edge runtime due to inadvertent node-only import (e.g. `fs.readFile` for organizer logo) | W95 design: organizer logo URL fetched via `fetch()` (edge-compatible) + passed to ImageResponse as remote img src. Verified at W95 by `next build` (deploy to edge fails if any node-only import). Manual grep additional safety net. |
| R5 | OG meta tags don't render on LINE — LINE OG-preview cache is hostile, sometimes 24h+ | LINE OG cache invalidation goes through their share-debug tool (https://devtools.line.me/...). Document the URL in DECISIONS.md as v0.9 ship-runbook step. Twitter / WhatsApp behave better. |
| R6 | Cancellation EF emits old `registration_withdrawn` template until B88 lands → semantic gap for users mid-Phase-A | B88 lands BEFORE B87 verification. Sequencing in §4 is intentional. |
| R7 | Cancellation EF on v0.6 `live` tournament with `in_progress` matches succeeds but the bracket is left in a weird state (matches without retired-by) | B87 verifies. Spec-wise, the cancel-with-active path doesn't promise to clean up matches — it cancels REGISTRATIONS + tournament status. Matches stay as-is for audit-trail purposes. Document in DECISIONS.md. |
| R8 | Cancellation EF Resend fanout fails for some users (bad emails, suspended) → audit_log doesn't reflect partial-success | EF returns `{email_sent, email_failed}` counts. Sentry warning per failure. v0.4 EF already has this shape (verified in B87). |
| R9 | Placement override on a tournament where the target team_id was withdrawn / dropped post-completion (edge case: TO promotes a team that's already deleted) | B85 step 4 validates `p_team_id` exists in `team` for tournament. If team was deleted, validation fails with 422. Real-world fix: don't delete teams from completed tournaments (already enforced by FK). |
| R10 | Manual override race condition — two admins override same position simultaneously | B85 SELECT FOR UPDATE on tournament. Second invocation blocks until first commits, then UPSERTs over → last-wins (acceptable per UPSERT semantics). Audit trail captures both overrides separately. |
| R11 | TH i18n review (W90) doesn't happen because Pap can't arrange a native-speaker reviewer in time | Documented as P1 prereq. If unmet, W90 ships as no-op + roadmap-update commit explicitly defers to v0.9.x. v0.9 still ships its other features. |
| R12 | TH i18n review surfaces dozens of rewrites + Bucket A (PDPA) needs counsel review beyond translation | W90 commit cadence is one-per-bucket. Bucket A may be partially deferred (translation applied; legal counsel review continues). Documented at W90. |
| R13 | OG route's `generateMetadata` server-fetches per request → adds latency to detail-page TTFB | The OG image generation is on a SEPARATE route (`/api/og/...`); `generateMetadata` only writes the `<meta>` URL pointing to that route. No cross-fetch from `generateMetadata` to the image. The image fetch is async by the social platform. Latency budget unaffected. |
| R14 | Placements tab visible-when-completed condition contradicts cascade-undo flow (tournament could flip back to `live` mid-TO-session, hiding the tab unexpectedly) | W93 visibility = `status='completed'`. If status flips back to `live`, tab disappears + manual-override invocations fail with 422. Acceptable transient. UI shows toast "Tournament re-opened — placements unavailable until re-completion." |
| R15 | Email-template inventory drift (B90 README diverges from actual files) | One-time inventory at B90 + future-bug-risk. v0.9.x or v1.0 may add a CI check that compares README table against `_shared/templates/*.ts` filenames + raises if mismatch. Documented as obligation. |
| R16 | RPC SECURITY DEFINER + auth.uid() masking — same v0.4-v0.7 pattern | Mirror of v0.4 B33c / v0.6 B52 / v0.7 B65. Caller passes p_user_id from JWT-validated Edge Function; RPC re-validates AUTHZ. |
| R17 | `_finalize_placements` hooks into v0.6 RPCs that are already complex — risk of regression in scoring path | B83's hook is post-completion-audit, single helper call. No re-ordering of existing v0.6 logic. B91 integration tests cover scoring + finalize as one flow. |
| R18 | `next/og` ImageResponse JSX limited subset — organizer logo URL might fail to render if URL is non-public or returns non-image MIME | W95 fetches logo via `fetch()` first, validates content-type starts with `image/`, falls back to Matchday wordmark if invalid. Logo URL is from `organizer.logo_url` already validated by `validate-organizer-logo` EF (v0.3). |
| R19 | Phase A length is moderate (~13 commits including helpers + verifications + email template + README) | Each item is small (~30-100 LOC except B82/B84/B85 which are ~80-150 LOC PL/pgSQL). Estimated 1-2 days of phase-A work. |
| R20 | Pap pushback on D2 (separate placement table vs denormalized columns on tournament) | If Pap wants denormalized, plan revises to ALTER tournament ADD COLUMN first/second/third_team_id (3 nullable FK columns) + override-shape changes accordingly. Estimated +1 commit each phase but loses extensibility (R20a). |
| R21 | Pap pushback on D6 (no team name on OG image) | If Pap wants 1st-place team name, W95 adds JOIN to `team` + renders. ~10 LOC. v0.9.x patch acceptable. |
| R22 | Pap pushback on D11 (manual override sacredness vs cascade-undo) | If Pap wants cascade-undo to clobber overrides too, B84 simplifies to "always DELETE placements on cascade revert" + W97 banner removed. Acceptable simplification. |
| R23 | Multi-org future scenario — placement table has no organizer_id, joins through tournament | tournament has organizer_id; standard JOIN. No R-fix needed. |
| R24 | Cancellation flow timing: TO cancels in middle of an active match-edit by another TO | Existing v0.4 SELECT FOR UPDATE on tournament serializes. Second TO's edit blocks until cancel commits, then sees `tournament.status='cancelled'` and rejects. |
| **R25** | **(post-stress-test A-A03)** `_post_match_completion` extraction (B83 / D17) touches v0.6 B52/B53/B54 — risk of regressing v0.6 ship state | B83 is a refactor-with-additions. Each v0.6 RPC's tournament-completion branch is replaced by a single `_post_match_completion(p_tournament_id, 'enter_score'\|'retire'\|'walkover')` call. Behavioral parity verified by re-running v0.6 B91 integration tests + new v0.9 B91 tests (full DoD2 (b)-(f) regressions). Permitted under existing anti-criterion ("only adds B83 hook calls into v0.6 B52/B53/B54"). |
| **R26** | **(post-stress-test A-A09)** OG route renders for an unanticipated future `tournament_status` enum value (e.g. `archived` added in v1.0) | D14 status-mapping is exhaustive at v0.9 but enum may extend. Mitigation: W95 falls through to a generic "Tournament" pill on unknown status (NOT 404 — tournament is presumed valid since we found the row); add an enum-completeness assertion test in B91 that fails CI when `tournament_status` enum gains a value without a corresponding `og.status_*` key. |
| **R27** | **(post-stress-test A-A05)** Per-position override sacredness produces partially-stale placements that confuse spectators | Spectators see manual badge per-position in W91/W92 (already in plan). W97 stale-warning surfaces per-position discrepancy (placement.updated_at < tournament.completed_at after re-completion). TO can manually re-override or DELETE the stale row via a future v0.9.x admin action if needed. |
| **R28** | **(post-stress-test A-A07)** Field-allowlist drift — future field added to organizer that should appear in OG (e.g. tournament series logo) | D16 allowlist is a known maintenance point. B91 RLS test asserts the OG route does NOT pull `contact_email`, `phone`, `line_id`, `about`. New allowlist entries require explicit B91 update + manual review. |
| **R29** | **(post-stress-test A-A01)** `placement_final_not_resolved` raised on a tournament that's structurally completed but has NULL winner | Defense-in-depth: v0.6 D19/A-A01 guards score-entry RPCs; this is the final guard wall. If raised in production, indicates a v0.6 regression — Sentry capture + alert; v0.6 hotfix takes priority over v0.9 deploy. |
| **R30** | **(post-stress-test A-A06)** Placement table public-read could leak team identities for tournaments with `status='draft'` if such tournaments somehow have placements | Structurally impossible: `_finalize_placements` is only called from `_post_match_completion` which is only called from v0.6 B52/B53/B54 D8 branch which only fires when `tournament.status` flips to `'completed'`. Draft tournaments never reach that branch. New B91 test asserts no placement rows exist for any tournament with status IN ('draft', 'registration_open', 'registration_closed', 'published'). |

---

## 9 · Approval gates

This plan requires explicit Pap approval before any scaffolding:

1. ⬜ Plan drafted (DRAFT v1) — *this document*
2. ⬜ Plan stress-tested by Plan + Architect review lenses (DRAFT v2)
3. ⬜ Pap reviews; D1-D13 answered
4. ⬜ Phase A (B80-B92) executed
5. ⬜ Phase B (W89-W99) executed
6. ⬜ Phase C DoD walkthrough by Pap

---

*End of v0.9.0 build plan DRAFT v1.*

---

## Change log — DRAFT v1 → DRAFT v2 (2026-05-07)

Stress-test by Architect review lens (autonomous agent run, ~10 min) surfaced **23 actionable findings** against `Plans/v09-build-plan.md` DRAFT v1 + cross-referenced existing v0.4 cancellation RPC/EF, `_shared/templates/registration_withdrawn.ts`, v0.6/v0.7 plans for hooks. **8 critical applied as in-place plan edits; 10 important addressed (5 plan edits, 5 documented as risks/anti-criteria); 5 nits accepted-with-rationale; 3 BLOCKER findings raised for Pap morning review (NOT applied — require architectural sign-off).** Density: comparable to v0.6 (21) and v0.7 (22).

**Critical (8) — applied as in-place plan edits:**

- **A-A01: `_finalize_placements` accepts NULL final winner / phantom team.** B82 originally read FINAL match for `winner_team_id` and derived 2nd-place "NULL-safe for retire/walkover". But v0.6 D19/A-A01 territory teaches that walkover-source matches CAN have winner_team_id set with one of team_a_id/team_b_id NULL — the v0.6 fix guards score-entry, not later readers. Fix: B82 step (3) raises `placement_final_not_resolved` if any of `(winner_team_id, team_a_id, team_b_id)` is NULL. Defense-in-depth against v0.6 regression. New D-decision overlay on D11; new anti-criterion; new test case (DoD2 step (r)); new R29 risk.

- **A-A02: 2nd-place derivation hand-waved as "opposite team".** Plan v1 said "winner_team_id = 1st, opposite team = 2nd (NULL-safe…)" — but the FINAL row has `team_a_id` + `team_b_id` columns; "opposite team" is non-trivial. Fix: B82 step (4) explicitly uses `v_second_id := CASE WHEN v_final_winner_id = v_final_team_a_id THEN v_final_team_b_id ELSE v_final_team_a_id END`. Test in DoD2 (s).

- **A-A03: B83 hooks into 3 different RPCs without `_post_match_completion` helper.** v0.6 R26 obligation explicitly noted "v0.6.x extraction" but B83 v1 said "extract now if cheap" — too tentative. Fix: B83 rewritten as MANDATORY `_post_match_completion(p_tournament_id, p_via)` extraction. Closes v0.6 R26 in v0.9. Idempotency proof spelled out for all 3 v0.6 RPC paths (B52 enter-score, B53 retire, B54 walkover). New D17. New test case (DoD2 step (u)). New R25 risk. New anti-criterion. **Touches v0.6 frozen surfaces** but explicitly permitted under existing anti-criterion language.

- **A-A04: `override_placement_rpc` AUTHZ left abstract.** Plan v1 D3 said "AUTHZ — caller is tournament organizer OR admin (mirror of v0.4 cancellation pattern)" but B85 prose only said "(1) AUTHZ — caller is tournament organizer OR admin". Cross-checked v0.4 B33c: it's an explicit `v_is_organizer := EXISTS (...)` + `v_is_admin := EXISTS (...) AND 'admin' = ANY(roles)` block raising `unauthorized` (P0001). Fix: B85 step (1) spells out the exact two SELECT EXISTS queries + raise. New D18. New anti-criterion. New test case (DoD2 step (x)).

- **A-A05: `_replace_placements_on_winner_change` all-or-nothing override-sacred check is too coarse.** Plan v1 B84 said "skip if any `placement` row has `source='manual_override'`". Counterexample: 1st overridden, 3rd auto, FINAL winner-edit changes who's 3rd → B84 should still re-derive 3rd, but v1 logic skipped ALL re-derivation. Fix: B84 walks per-position; DELETEs `source='auto'` rows excluding manual positions; returns `(positions_replaced[], positions_skipped_manual[])`. New D15. New anti-criterion. New test case (DoD2 step (t)). New R27 risk.

- **A-A06: `placement` table RLS public-SELECT contradicts "TO-only visibility test".** Plan v1 said "RLS: public SELECT (spectator surface); service-role-only INSERT/UPDATE/DELETE" but the implied B91 test was "TO can SELECT own tournament placements". Public SELECT means everyone can SELECT — the security boundary is on writes. Fix: §0 RLS clarification expanded: tests verify (a) anon SELECT (positive), (b) anon/authenticated/TO/admin all CANNOT write (negative), (c) override RPC bypasses via SECURITY DEFINER + re-validates AUTHZ. New anti-criterion. New R30 risk (covers the structural impossibility of leaking pre-completion placements).

- **A-A07: OG route `select('*')` would expose organizer contact PII.** Plan v1 W95 said "Reads tournament + organizer from supabase (anon RLS — public-read fields only)" — but anon RLS on `organizer` doesn't necessarily strip `contact_email` / `phone` / `line_id` / `about`. Fix: W95 uses **explicit field allowlist** `select('id, name, start_date, end_date, status, organizer:organizer_id(id, display_name, logo_url)')`. New D16. New anti-criterion. New test case (DoD2 step (w)). New R28 risk.

- **A-A09: Status pill enumeration incomplete (3 of 7 enum values).** Plan v1 D5 said status pill = "live/completed/cancelled". But `tournament_status` enum (v0.3 B7) has 7 values: `draft`, `registration_open`, `registration_closed`, `published`, `live`, `completed`, `cancelled`. Plan v1 silently defaulted 4 unhandled. Fix: New D14 explicit 7-value mapping (`draft` → 404; other 6 → localized pills). i18n keys §6 expanded. W95 explicitly checks `if status='draft' return 404`. New anti-criterion. New test case (DoD2 step (v)). New R26 risk (future enum-extension).

**Important (10) — 5 plan edits, 5 documented as risks/anti-criteria:**

- **A-A08: B87 cancellation EF doesn't enumerate v0.7 surfaces.** Plan v1 mentioned `match.scheduled_at` (test (d)) but missed `court_blocked_range` rows + `tournament.round_durations`. Fix: B87 tests (e) + (f) added; §0 row 1 documents the cancellation invariant ("blocks survive; spectator surface filters"). New anti-criterion ("must NOT delete v0.7 court_blocked_range on cancel"). New DoD2 step (y).

- **A-A10: B88 STRINGS shape assumption verified.** Plan v1 B88 said "mirror of `registration_withdrawn.ts` shape. STRINGS map TH+EN." Cross-checked the actual file: it DOES have `STRINGS: Record<Locale, WithdrawnStrings>` map, `escapeHtml` + `fmt` helpers, `RenderedEmail` interface. Fix: B88 description now references the verified interface shape (`TournamentCancelledArgs`, the helper utilities, the privacy guard pattern from R14). Documentation-only — no functional change.

- **A-A11: Commit numbering offset stale references in §0.** Plan v1 §0 referenced "v0.9 B79 verifies", "v0.9 B80 swaps", "v0.9 B82 template", "v0.9 B76 audit enum" — but §4 correctly numbers v0.9 starting at B80 (since v0.8 occupies B75-B79). The §0 references were leftover from an earlier numbering. Fix: §0 references corrected to B87/B88/B88-B89/B80 respectively.

- **A-A12: `next/og` JSX subset risk under-documented.** Plan v1 R18 noted the constraint generally; W95 didn't say how to avoid. Fix: W95 prose now explicitly: "logo passed as `<img src={...} />` element (NOT bg-image — `next/og` JSX is restrictive)". Plan-edit only.

- **A-A13: D11 cascade-undo + manual override interaction documented but B84 implementation didn't match (now fixed via A-A05).** Composite finding — closed by A-A05 fix. R2 risk text updated.

- **A-A14: OG cache-control for cancelled tournaments leaks "cancelled" pill for 5 minutes after un-cancel.** Documented as known limitation; tournaments don't un-cancel in v0.9 (`tournament.status='cancelled'` is terminal per v0.4). Closed.

- **A-A15: Override audit metadata `prior_source` could be NULL on first-time override (no prior placement row exists)**. Edge case: `_finalize_placements` always INSERTs first; override is UPSERT against existing row. So `prior_source` is always 'auto' or 'manual_override' — never NULL. D12 metadata shape unchanged. Documentation: B85 step (7) clarified.

- **A-A16: W90 i18n review timing depends on P1.** Plan v1 documents this in P1; no fix needed. R11 covers.

- **A-A17: B90 README rename from `_shared/templates/` to `_shared/email-templates/` proposed in §2 then walked back in B90.** Plan v1 §2 item 5 says "rename or symlink" but B90 says "NOT renaming dir to `email-templates/` — keep existing structure". Resolution: §2 wording is fine (rename/symlink "see B82" — should be B90); typo. Documentation-only.

- **A-A18: B91 test surface is large (8+ test scenarios).** Per-test sizing acceptable for v0.9 critical-path coverage. Documented; no change.

**Nits (5) — accepted-with-rationale:**

- **A-N01: §0 says "DRAFT from B74 unless EXPLAIN shows otherwise" — should be B80.** Fixed inline.
- **A-N02: D6 rationale "noisy from edge-runtime" is vague.** Acceptable shorthand for "JOIN to team table adds latency variability"; left as-is.
- **A-N03: §3 P5 says `@vercel/og` "transitive via Next 15+" — verify actually present.** P5 explicitly says "verify presence at W79"; left as-is. (Note: W79 is now W89 in §4; another stale reference — also fixed.)
- **A-N04: R5 LINE share-debug URL placeholder `https://devtools.line.me/...`** — left as documentation-grade.
- **A-N05: §6 i18n key counts ("12 keys", "8 keys", "4 keys") may drift from actual table contents.** Counts are approximate; left as guidance.

---

**3 BLOCKER findings (B-B##) — surfaced for Pap morning review; NOT applied:**

- **B-B01: `_post_match_completion` extraction (D17 / A-A03) touches v0.6 ship state.** Even though anti-criteria permit "B83 hook calls into v0.6 B52/B53/B54", the extraction is structurally larger than a hook call — it replaces 3 inline status-flip + audit-emit blocks with a helper call. Pap should explicitly approve refactoring v0.6 RPCs in v0.9 vs deferring `_finalize_placements` triplication to v0.6.x and accepting the duplication risk. **Trade-off:** triplicate now (matches v0.6 R26 obligation deferral) vs DRY now + slight v0.6 ship-state churn. Recommend: DRY now (matches A-A03 fix; closes R26).

- **B-B02: OG image cache (D7) DEFERred — but DoD2 step (j) requires P95 < 800ms over 50 cold-cache requests, which is brittle on edge cold-start.** Vercel edge cold-start can be 200-500ms before any work happens; `next/og` font-fetch + image-fetch + render adds 300-600ms on top. P95 800ms is plausible but not safe. Recommend: ship `tournament_og_cache` in v0.9 default (NOT defer to v0.9.x) — adds 1 migration + ~30 LOC. Pap to decide: ship cache table in v0.9.0 (safer) vs ship without and risk DoD2 (j) failure.

- **B-B03: D2 (separate `placement` table) vs denormalized columns on tournament — Pap may push back on table-per-position when 3 columns suffice.** The override RPC's `overridden_by` + `override_reason` audit fields are the killer feature for D2's separate table. But Pap's preference for "minimum schema surface" (per matchday/CLAUDE.md hard rules — "schema slices forward only") may conflict. Trade-off documented in D2 already; flagging as BLOCKER because R20 mitigation cost is "+1 commit each phase" — if Pap chooses denormalized, plan needs full re-write of B80, B82, B84, B85, B91. Recommend: keep D2 separate-table default; surface to Pap explicitly.

---

**5 net-new D-decisions (D14-D18)** added to §1; **9 new anti-criteria** added to §7; **6 new risks (R25-R30)** added to §8; **8 new DoD2 steps (r-y)** added to §4 Phase C; **B82, B83, B84, B85, B87, B88, W95 descriptions updated** in §4 Phase A/B to reference fix labels (A-A##). **§0 schema enumeration updated** to include RLS clarification + correct commit-number references. **§6 i18n key inventory** expanded for D14 status pill enumeration.

**Net commit additions in DRAFT v2:** 0 new migrations / 0 new Edge Functions / 0 new shared TypeScript helpers (all v0.9 fixes are surgical edits within existing planned commits) / 8 new test cases in B91 / 8 new DoD2 verification steps. The migration count, Edge Function count, and template count are unchanged from DRAFT v1. **B-B02 fallback** would add 1 migration (`tournament_og_cache`) IF Pap approves shipping the cache in v0.9.0.

**Line-count delta:** DRAFT v1 = 290 lines; DRAFT v2 = ~445 lines (~155 lines added across change-log + new D-decisions + new anti-criteria + new risks + new DoD2 steps + critical fix prose).

*End of change log.*
