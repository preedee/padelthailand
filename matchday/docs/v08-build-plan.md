# Matchday v0.8.0 — "Realtime + Spectator" Build Plan

> **Status:** DRAFT v2 — Architect stress-test applied 2026-05-07; pending Pap review.
> **Predecessor:** v0.7.0 "Scheduling" — Phase A code-complete; Phase B in-flight; v0.6.0 "Live Scoring" Phase A code-complete. v0.8.0 is executable independently because it only ADDS realtime publication membership + a new spectator route + a viewer-count badge — no mutations on v0.6/v0.7 frozen surfaces.
> **DoD:** 100 concurrent simulated viewers receive score updates within 1 second; `/spectator` route is axe-clean; Lighthouse mobile ≥ 90; Sentry captures realtime errors; `audit_log.action='spectator.session_started'` emits on first concurrent viewer in a tournament; i18n strings shipped in `spectator.*` and `bracket_live.*` namespaces in TH+EN.
> **External-prereq risk:** Low. v0.8 has no new Pap-prereqs. Supabase Realtime is already enabled (v0.1 spike validated 2-client round-trip <500ms p95). The `match` table is already in `supabase_realtime` publication via the already-shipped migration `20260503010000_v08_realtime_publication.sql`.

---

## 0 · What v0.8 inherits from v0.5/v0.6/v0.7 (so what's NOT in this plan)

v0.8 builds on a fully-loaded match + tournament + draw shape. This plan opens with what's already on `main`:

| Surface | v0.5/v0.6/v0.7 status | v0.8 obligation |
|---|---|---|
| `public.match` table — all scoring + scheduling columns nullable | shipped (v0.5 B37) | **No ALTER.** v0.8 only READS via realtime subscribers. |
| `public.match` in `supabase_realtime` publication | shipped (`20260503010000_v08_realtime_publication.sql`) | **No-op.** Builds on this; idempotent guard already present. |
| `public.tournament` table — `status`, `started_at`, `completed_at` | shipped (v0.3 B7 + v0.6 writes) | v0.8 adds tournament + draw to the publication for tournament-status flips. |
| `public.draw` table — generated state | shipped (v0.5 B37) | v0.8 may add to publication if spectator surface needs draw-publish events (DEFER per D-decision). |
| `public.audit_action` enum — 18+ values | shipped (v0.4 + v0.5 + v0.6 + v0.7) | v0.8 ADDs `spectator.session_started` (single new value). |
| `Sentry.captureRequestError` wired in `instrumentation.ts` | shipped (v0.2 W2) | v0.8 adds `Sentry.captureException` to realtime error handlers + Sentry breadcrumb on reconnect. |
| Public bracket page `/tournaments/[org-slug]/[t-slug]/bracket` | shipped (v0.5 W46 + v0.6 W62) | v0.8 ENHANCES — adds realtime hook, `?spectator=true` mode, viewer-count badge. |

**Net new schema in v0.8 (DRAFT v2 — amended for race-safe dedup):**
1. `audit_action` enum addition — `spectator.session_started` (single ADD VALUE IF NOT EXISTS).
2. `tournament` + `draw` tables added to `supabase_realtime` publication (idempotent migration mirroring `20260503010000`).
3. **NEW (A-A05):** Partial unique index `idx_audit_spectator_session_started_unique` on `audit_log(target_id, action) WHERE action = 'spectator.session_started'` — race-safe backing for B77 EF dedup. Single new migration `20260507020000_v08_audit_spectator_session_dedup_index.sql`.
4. **One new Edge Function** (`realtime-presence-audit`, B77) — added to inventory; CLAUDE.md §3 compliant. **No new tables, no new columns, no new RPCs.**

---

## 1 · D-decisions (DRAFT v1 defaults; Pap review pending)

| # | Decision | Default | Rationale |
|---|----------|---------|-----------|
| **D1** | Realtime channel topology | **One channel per tournament: `tournament-{tournament_id}-bracket`** (hyphen-delimited; tournament_id is uuid) | Matches stack-confirmation Q1 intent. Channel names use ONLY hyphens as separators (NOT colons) — Supabase Realtime channel names must satisfy `/^[\w:-]+$/` and the colon form `tournament:{id}:bracket` historically conflicted with Phoenix topic-prefix conventions. Hyphen form is unambiguous. Per-tournament scoping bounds payload to ~7-32 matches × small row size; well under Supabase's per-message budget at 100 viewers. Per-match channels would explode connection count. **A-A06 fix.** |
| **D2** | Broadcast vs Postgres-Changes | **Postgres-Changes (default publication membership) — no manual `realtime.broadcast_changes` triggers** | Already-shipped migration commits to publication membership. Postgres-Changes events are RLS-aware (subscribers see only what their RLS policies permit). Manual broadcast triggers add code surface for v0.9+ if custom payload shaping is needed; not required for v0.8 minimum-viable. |
| **D3** | Subscriber filter shape | **Client-side `match.tournament_id=eq.{N}` filter on the channel subscription** | Postgres-Changes supports per-column `eq` filters; subscribers receive only their tournament's events. Avoids fan-out spam at 10+ concurrent live tournaments. |
| **D4** | Score-update render strategy | **In-place state mutation in `useRealtimeBracket` Zustand slice — NO `router.refresh()`, NO full-page rerender** | The shipped migration's docstring suggested `router.refresh()` as the v0.8 minimum-viable path. Promoting to in-place mutation (per anti-criterion §7) keeps the bracket smooth for spectators. The bracket library `@g-loot/react-tournament-brackets` accepts a `matches` prop — mutating that prop's state in Zustand triggers React reconciliation only on changed nodes. |
| **D5** | Auto-reconnect strategy | **Supabase Realtime client's built-in `presence` + `system` event handlers — re-subscribe on `CHANNEL_ERROR` or `TIMED_OUT`** | Supabase-js v2 has reconnect baked in but the listener must explicitly re-subscribe to the channel after disconnect. Hook implements `onError` → wait 1s → resubscribe with exponential backoff (max 30s). |
| **D6** | Spectator mode toggle mechanism | **Query param `?spectator=true` on the existing bracket route** | No new route. Page-level guard reads `searchParams.spectator === 'true'` server-side AND client-side; layout swaps to spectator shell (no nav, large fonts). Reserves a future `/spectator/[org-slug]/[t-slug]` if vanity URL is requested in v0.9. |
| **D7** | Spectator mode admin-action visibility | **Server-side: don't render TO buttons even if user is the TO** | Spectator mode = read-only intent. Even if an authenticated TO opens `?spectator=true`, the server component skips the Edit/Score/Schedule buttons. Avoids accidental TO interaction during a TV display. |
| **D8** | Esc-to-exit hint | **Persistent bottom-right caption bar with localized "Press Esc to exit spectator mode" text. Esc key handler routes back to non-spectator URL.** | Discoverable + low visual weight + WCAG-accessible (caption text 12px, contrast AA on muted-foreground). |
| **D9** | Presence implementation | **Supabase Realtime Presence on `tournament:{id}:bracket` channel — each subscriber `track({ user_id?, anon_id })`** | Built-in. Returns presence state object keyed by socket id. Aggregate `Object.keys(state).length` = viewer count. Anonymous viewers track an ephemeral UUID (not persisted). |
| **D10** | Viewer count debounce | **2-second leading-edge debounce on the displayed count — updates within 2s but doesn't flicker on rapid join/leave** | Per DoD ("updates within 2s"). Spectator-mode TV display doesn't need sub-second viewer-count granularity. |
| **D11** | Background-tab exclusion | **Browser `Page Visibility API` — call `channel.untrack()` when document hidden, `channel.track()` when visible** | Per DoD ("excludes background tabs"). Implemented in the `useRealtimeBracket` hook lifecycle. |
| **D12** | First-concurrent-viewer audit emit | **Edge Function `realtime-presence-audit` (NEW, thin) — invoked client-side on initial successful subscription if viewer count was 0 → 1** | Audit emission MUST go through Edge Function (CLAUDE.md hard rule: all server-side logic in Edge Functions). Client invokes via `supabase.functions.invoke('realtime-presence-audit', { body: { tournament_id, audit_kind: 'session_started' }})`. EF AUTHZ-guards: any caller (auth or anon) can emit, but the EF rate-limits per-tournament to 1 emit per minute (idempotent on `tournament.first_spectator_at IS NULL` — but to avoid schema bloat, use audit_log query for the dedup check). |
| **D13** | i18n namespace separation | **Top-level `spectator.*` + `bracket_live.*` namespaces, NOT folded under existing `tournaments.*`** | v0.9 polish work runs in parallel; namespace isolation prevents merge conflicts on `messages/en.json` + `messages/th.json`. Per build prompt cross-cutting DoD. |
| **D14** | Lighthouse mobile target | **≥ 90 on `/tournaments/[org-slug]/[t-slug]/bracket?spectator=true`** | Per DoD. Realistic given no new images, no new heavy JS — only the realtime subscriber + Zustand slice. Bundle delta target: < 8KB gzipped. |
| **D15** | Spectator mode font sizing | **CSS `clamp(1.25rem, 2.5vw, 2.5rem)` for match cards + `clamp(2rem, 4vw, 4.5rem)` for tournament title** | TV-friendly per design system "Bracket View Styling" → "Spectator mode: Bracket fills viewport, no nav, large text via `clamp()`". |
| **D16** | Reconnect on transient loss UX | **No skeleton — last-known state stays visible; subtle `border-warning` pulse on the viewer-count badge while disconnected** | Spectator TV display: full-page skeleton would be jarring. Last-known state is correct enough; the badge pulse signals stale-state. On successful reconnect, badge returns to default + auto-fetches fresh state via single re-render. |
| **D17** | Anon presence + Supabase Realtime auth model | **Anonymous spectators connect with the public `anon` API key; the supabase-js client auto-mints an anon JWT (no Supabase Auth user). Presence `track()` succeeds because RLS is evaluated against `auth.role()='anon'`, not `auth.uid()`.** | Resolves the "does anon presence work?" gap. Supabase Realtime requires *some* JWT (anon role JWT counts) to authenticate the websocket; the anon key is publicly safe. Presence payloads carry only the ephemeral `anon_id` UUID — no `user_id` for unauthenticated viewers. RLS policies on `match`/`tournament`/`draw` already permit `anon` SELECT for published tournaments (v0.5 B37 `bracket_public_read` policy). **A-A08 fix.** |
| **D18** | Spectator UX on EF error (audit emit failure) | **Silent failure — fire-and-forget. UI never blocks, never renders error to spectator. Sentry captures the failure with `function: realtime.presence_audit` tag.** | Audit emission is internal observability, not user-facing. A spectator who can't trigger the first-viewer audit should still see the bracket. Blocking or showing error noise on a TV display would degrade UX for an event the spectator doesn't know exists. Backend health is monitored via Sentry, not user surfaces. **A-A09 fix (closes ISC gap).** |
| **D19** | Tournament status flip to `cancelled` while spectators connected | **Server-side: RLS re-evaluates on the `tournament.status` UPDATE event itself; subscribers receive the `tournament.updated` event with `status='cancelled'`, then the W80 reducer detects the flip and unsubscribes the channel + renders a localized "Tournament cancelled" state (no further `match` events expected). NO further `match` UPDATE events leak (B78 test (e) verifies).** | The unhandled-edge-case finding from the stress test. Cancellation mid-stream must be a clean teardown, not a silent stop. Localized message: `bracket_live.tournament_cancelled`. Single-direction flip (no recovery from cancelled). **A-A03 fix.** |
| **D20** | B74 migration docstring vs D4 in-place mutation | **B74's docstring (lines 17-21) suggesting `router.refresh()` is now STALE GUIDANCE — superseded by D4. The migration file itself remains correct (publication membership is the right primitive). DRAFT v2 explicitly overrides the docstring; the migration file is NOT amended (would generate a meaningless empty-diff migration). Phase B W80 description carries the override intent.** | Documentation-debt finding (NOT a risk per R18 reframe). The migration was authored before this plan's D4 anti-criterion existed. Out-of-scope to amend the shipped file; in-scope to make the override unambiguous in plan. v0.8.x or v0.9 may add a docstring-correction migration if Pap wants the historical record cleaner. **A-A02 fix (R18 promotion).** |

---

## 2 · Scope

In-scope (per `Plans/version-roadmap.md` v0.8.0 + cross-cutting DoD):

1. **Realtime channel design + broadcast triggers** — publication membership extended to `tournament` + `draw` tables (already includes `match`); no manual broadcast triggers (D2).
2. **Live bracket view (~100 concurrent viewers)** — `useRealtimeBracket` Zustand slice subscribes to `tournament:{id}:bracket`; in-place state mutation per D4; auto-reconnect per D5.
3. **Match status indicators (visual)** — Upcoming / In Progress / Completed / Retired / Walkover / Bye badges per design-system "Status Colors". Mobile-readable (12px caption, 4.5:1 contrast); WCAG AA.
4. **Spectator mode `?spectator=true`** — query-param-gated mode (D6); hides nav (D7); large-font CSS (D15); Esc-to-exit hint (D8); auto-refresh on reconnect (D16).
5. **Presence / viewer count** — Supabase Realtime Presence (D9); 2-second debounce (D10); background-tab exclusion (D11); top-right badge.
6. **`spectator.session_started` audit on first concurrent viewer** — Edge Function `realtime-presence-audit` (D12) emits `audit_log` row.
7. **Cross-cutting DoD** — a11y axe-clean on `/spectator` (`?spectator=true`); Sentry capture on realtime errors; i18n strings in TH+EN under `spectator.*` and `bracket_live.*`; Lighthouse mobile ≥ 90.

Out-of-scope (defer per roadmap):

- Realtime schedule updates (court/time grid changes) → v0.9 if Pap requests
- Spectator-mode chat / commentary → v2+
- Tournament-list realtime (which tournaments are LIVE) → v0.9 (placement polish)
- Vanity spectator URL `/spectator/[org-slug]/[t-slug]` → v0.9 if Pap requests
- Persistent presence (storing who watched) → never (privacy + complexity)
- Realtime score-edit cascade animations → v0.9 polish
- Push notifications when a player's match starts → v2+ (no mobile app surface)
- WebRTC / livestream video → never (per stack confirmation Q1)

---

## 3 · External Prerequisites — gate questions for Pap

| # | Prereq | Risk | Required for | Action |
|---|--------|------|--------------|--------|
| P1 | **No new external services** | None | n/a | None. |
| P2 | **`SUPABASE_ACCESS_TOKEN` repo secret** | Already set | Migration push | None. |
| P3 | **No new packages** | None | Phase B uses Supabase Realtime client (already in `@supabase/supabase-js` v2) + Zustand (already in v0.1 stack) + existing `@g-loot/react-tournament-brackets`. | None. |
| P4 | **Sentry DSN env var (optional but recommended)** | Already set per v0.2 runbook | Realtime error capture (cross-cutting DoD) | None — degrades to no-op if unset. |
| P5 | **k6 / artillery for 100-viewer load test** | New dev-time tool | DoD verification | Pap installs `k6` via brew (free). |

### Decisions needed from Pap (gate)

The 16 D-decisions in §1 are surfaced as PR-style defaults. Recommended order: D1 (channel topology), D2 (broadcast vs Postgres-Changes), D4 (in-place mutation), D6 (spectator mode toggle), D9 (presence implementation), D12 (first-viewer audit emit). Then remaining D3, D5, D7, D8, D10, D11, D13-D16 (engineering-internal).

---

## 4 · Phased commit plan

Continuing the commit-numbered convention. v0.7 backend ended at B73; v0.8 starts at **B75** (B74 was the already-shipped publication-membership migration). v0.7 web ended at W78; v0.8 web starts at **W79**.

Sequencing: Phase A backend (B75-B79) → Phase B web (W79-W88) → Phase C ship gate.

### Phase A — Backend schema + publication + Edge Function (matchday-backend) — gates Phase B

| Commit | Description |
|---|---|
| **B75** | **Schema migration: extend supabase_realtime publication to tournament + draw tables.** Single migration (`20260507010000_v08_extend_realtime_publication.sql`). Idempotent guard mirroring shipped B74 pattern: `if not exists (select 1 from pg_publication_tables where tablename in ('tournament','draw') and pubname='supabase_realtime') then alter publication add table public.tournament, public.draw end if`. Verification DO block raises notice with current member list. |
| **B76** | **audit_action enum addition: `spectator.session_started`.** Single ALTER TYPE … ADD VALUE IF NOT EXISTS. Idempotent self-healing pattern mirror of v0.5 B38 + v0.6 B49 + v0.7 B64. DO block validates value present in `enum_range(null::audit_action)`; raises if missing. |
| **B77** | **Edge Function `realtime-presence-audit` + dedup index.** TS/Deno. Body shape: `{ tournament_id: uuid, audit_kind: 'session_started' }`. Pipeline: (1) parse + validate body; (2) optional JWT (anon allowed); (3) Supabase service-role client; (4) **race-safe dedup via INSERT ... ON CONFLICT DO NOTHING (A-A05):** rather than `SELECT 1 then INSERT` (TOCTOU at concurrent first-viewer arrival per R7), perform a single `INSERT INTO audit_log (...) VALUES (...) ON CONFLICT (target_id, action) WHERE action = 'spectator.session_started' DO NOTHING RETURNING id` — backed by a NEW partial unique index `idx_audit_spectator_session_started_unique` on `audit_log(target_id, action) WHERE action = 'spectator.session_started' AND created_at > now() - interval '1 hour'`. **NOTE:** Postgres partial-index predicates cannot reference `now()` (immutable-only); the practical pattern is a **non-time-bounded unique partial index** on `(target_id, action) WHERE action = 'spectator.session_started'` PLUS an explicit "older than 1h?" check before the INSERT. If recent row exists → return 200 `{ deduped: true }`; if no recent row but unique violation on insert → upsert pattern: `DELETE WHERE older + INSERT ON CONFLICT DO NOTHING`. Wrap in single transaction. (5) return 200 `{ emitted: true }` on successful insert; `{ deduped: true }` on conflict-or-recent. Sentry capture on 5xx. **NEW MIGRATION REQUIRED:** the partial unique index is a B77 dependency — added as a sub-step of B77 (single-file migration `20260507020000_v08_audit_spectator_session_dedup_index.sql`). **CLAUDE.md compliance:** all logic in EF; no client direct write. **deno.json imports map:** all `jsr:` imports (e.g., `jsr:@supabase/supabase-js`) routed through the existing `supabase/functions/deno.json` imports map per matchday-backend CLAUDE.md gotcha. |
| **B78** | **Realtime publication smoke test + RLS broadcast-leak regression (TS, in `supabase/tests/realtime/`).** New test file `presence-audit.test.ts`. Asserts: (a) channel `tournament-{N}-bracket` (hyphen-delimited per D1) receives a Postgres-Changes event when `match` row UPDATED for a published tournament; (b) presence-audit EF returns `emitted: true` on first call, `deduped: true` on second within an hour; (c) audit_log row written with correct shape; (d) **RLS broadcast-leak regression (A-A07):** anonymous client subscribes to `tournament-{DRAFT_N}-bracket`, an UPDATE on a draft-tournament `match` row fires — assert NO event reaches the anonymous subscriber (Postgres-Changes filters at the broadcast layer using anon RLS evaluation against the new row state); (e) **cancelled-flip leak regression (A-A03):** subscribe to a published tournament, flip its status to `cancelled` via TO action — assert subscriber receives the `cancelled` UPDATE itself but receives NO subsequent `match` UPDATE on that tournament. Reuses v0.1 round-trip harness pattern. |
| **B79** | `types/database.ts` regenerated by deploy workflow (auto-step). No manual gate. |

### Phase B — Web (matchday-web) — depends on Phase A types regen

| Commit | Description |
|---|---|
| **W79** | `bun run sync-types` post-Phase-A. Verify `audit_action` enum includes `spectator.session_started`. **No new packages.** |
| **W80** | **`useRealtimeBracket` Zustand slice + hook** (`src/lib/realtime/useRealtimeBracket.ts`). Subscribes to `tournament-{id}-bracket` channel (D1 hyphen form). Listens for Postgres-Changes events on `match` (UPDATE), `tournament` (UPDATE), `draw` (UPDATE). **Reducer guards (A-A02):** ignore `tournament` UPDATE events where the changed columns are NOT in `{ status, started_at, completed_at }` — bounds R19 broadcast amplification on `updated_at` touches; ignore `match` UPDATE if parent `tournament.status IN ('draft', 'cancelled')` (defense-in-depth even though RLS should already block — see anti-criterion #1 reversal). On event: in-place merge via Zustand `set((s) => ({ matches: s.matches.map(...) }))` producing a NEW array reference (D4 + R3); React reconciles only changed nodes. On `CHANNEL_ERROR` / `TIMED_OUT`: exponential backoff with **±500ms jitter** (A-A04 promotion of R4 to D5) resubscribe; max 30s ceiling. Sentry capture on every error path with `function: realtime.bracket` tag. Page Visibility API integration (D11). |
| **W81** | **`useRealtimePresence` hook** (`src/lib/realtime/useRealtimePresence.ts`). Wraps Supabase Realtime Presence on the same channel `tournament-{id}-bracket`. `track({ anon_id: crypto.randomUUID() })` on mount (anon JWT path verified per D17); `untrack()` on unmount + on visibility-hidden. Returns aggregated `viewerCount` (debounced 2s leading-edge per D10). Returns `isFirstViewer: boolean` derived from prior count vs. current count transition (used by W82 audit emit). **Stale-presence smoke (A-A09):** unit test simulates browser-kill (no `untrack` called) → asserts viewer count drops within Supabase's `presence_timeout` (~30s) without manual cleanup. |
| **W82** | **First-viewer audit emit** — server-action wrapper `emitSpectatorSessionStarted(tournamentId)` calls `supabase.functions.invoke('realtime-presence-audit', { body: { tournament_id, audit_kind: 'session_started' }})`. Invoked from W81 hook when `isFirstViewer` flips true. **Error-path UX (D18):** fire-and-forget — UI NEVER blocks, NEVER renders an error to spectator on EF failure (audit emit is observability, not user-facing); failures captured in Sentry with `function: realtime.presence_audit` tag + breadcrumb of `tournament_id`. EF 5xx + network errors both swallow silently after Sentry capture. Spectator UI continues unchanged. |
| **W83** | **Match status badge component** (`src/components/bracket/MatchStatusBadge.tsx`). Renders pill per design-system "Status Colors": Upcoming (gray) / In Progress (green + pulse) / Completed (default + checkmark) / Retired (warning + "RET") / Walkover (muted-fg + "W/O") / Bye (muted + "BYE"). 12px caption, 4.5:1 contrast verified. Mobile-readable. WCAG AA. i18n keys under `bracket_live.status.*`. |
| **W84** | **Public bracket page realtime integration** — extend v0.5 W46 / v0.6 W62 / v0.7 W75 page (`src/app/[locale]/tournaments/[org-slug]/[t-slug]/bracket/page.tsx`). Wire `useRealtimeBracket` + `useRealtimePresence` into the existing client component. Replace any `router.refresh()` patterns with in-place state mutation (D4 anti-criterion). Render `MatchStatusBadge` on each match node. |
| **W85** | **Spectator-mode shell** (`src/app/[locale]/tournaments/[org-slug]/[t-slug]/bracket/spectator-shell.tsx`). Reads `searchParams.spectator === 'true'` server-side. When true: hide global nav (`<SpectatorLayout>` wraps children); hide TO admin actions per D7; apply CSS variables for D15 `clamp()` font sizing; render "Press Esc to exit" caption per D8; client-side Esc key handler routes to URL with `?spectator` removed. |
| **W86** | **Viewer-count badge** (`src/components/bracket/ViewerCountBadge.tsx`). Top-right fixed-position badge. Shows `viewerCount` from `useRealtimePresence`. While `channel.state !== 'subscribed'`, applies `border-warning` pulse per D16 (last-known count remains visible). Localized "N viewers" / "N ผู้ชม" via i18n. Hides when `viewerCount === 0` AND not connected (avoids flicker on initial load). |
| **W87** | **i18n keys** — `messages/en.json` + `messages/th.json` ([TH] placeholders per v0.9 native-Thai obligation). Namespaces: `spectator.exit_hint`, `spectator.exit_aria_label`, `spectator.disconnected`, `bracket_live.status.upcoming`, `bracket_live.status.in_progress`, `bracket_live.status.completed`, `bracket_live.status.retired`, `bracket_live.status.walkover`, `bracket_live.status.bye`, `bracket_live.viewer_count` (ICU plural form). |
| **W88** | a11y + Sentry + Lighthouse sweep. Manual axe-core run on `/spectator` (and `?spectator=true` URL) → 0 violations. Sentry capture verified on realtime error path (deliberate disconnect → see breadcrumb). Lighthouse mobile run → ≥ 90 on `?spectator=true` URL. Manual review documented. |

### Phase C — DoD verification + ship

| Commit | Description |
|---|---|
| **DoD1** | Per-feature ship matrix in `Plans/v08-dod-evidence.md`. |
| **DoD2** | E2E walkthrough by Pap: (a) load a v0.6-scored, v0.7-scheduled tournament's bracket page in incognito → confirm subscribed badge visible; (b) in a 2nd browser, score a match via TO Scores tab → confirm 1st browser updates the score in-place WITHOUT full-page reload (DevTools Network tab: no document re-request); (c) measure update latency end-to-end with `performance.now()` → < 1s; (d) open `?spectator=true` → confirm nav hidden, fonts large, Esc hint bottom-right; (e) press Esc → confirm URL flips to non-spectator + nav returns; (f) open same URL in 100 simulated clients via k6 → confirm viewer-count badge shows ~100 within 2s; (g) score a match while 100 viewers connected → confirm all clients receive update within 1s p95 (Sentry transaction sampling helps verify); (h) kill the local network for 5s on one viewer → confirm badge pulses warning, then auto-reconnects + state catches up; (i) audit_log row check — first viewer connection on a fresh tournament emits one `spectator.session_started` row; subsequent within 1h emit nothing (deduped); (j) run axe-core on `/spectator` → 0 violations; (k) run Lighthouse mobile on `?spectator=true` → ≥ 90; (l) verify with TO browser open + spectator browser open: TO scores match → both browsers update; spectator never sees admin buttons even if logged in as TO. **(m) NEW (D19 cancelled-flip):** with 5 spectator browsers connected to a published tournament, TO flips status to `cancelled` → confirm all 5 browsers receive the cancellation event within 1s, render the localized "Tournament cancelled" state, and stop receiving further `match` events. **(n) NEW (D18 EF-error-UX):** force B77 EF to return 500 (override deploy) → confirm spectator UI continues normally with no error toast/modal/redirect; Sentry receives the captured exception. **(o) NEW (D5 jitter):** kill prod Realtime endpoint; observe 100 simulated clients reconnect — assert reconnect distribution spans >250ms (NOT a thundering herd). **(p) NEW (W81 stale-presence):** force-quit a spectator browser tab (not graceful close) → assert viewer count drops within 35s without any client-side cleanup invocation. **(q) NEW (B77 dedup race):** spawn 10 simulated first-viewer connects concurrently against an empty audit_log → assert exactly 1 `spectator.session_started` row written, not 10. |
| **DoD3** | Both CIs green on `main`. Auto-types-regen committed. |
| **DoD4** | Migrations applied to remote prod (B75 + B76). EF `realtime-presence-audit` deployed. |
| **DoD5** | DECISIONS.md updated with v0.8 D1-D16 final answers. |
| **DoD6** | `Plans/version-roadmap.md` v0.8.0 header gets `Shipped` + ship date. |
| **DoD7** | `Plans/decisions.md` gets v0.8 ship entry. |
| **DoD8** | `padelthailand.com/matchday/` rebuilt + Pap-approved push showing v0.8 as Shipped. |

---

## 5 · Per-feature ship matrix

| Feature | Code-complete | Backend ready | E2E verified | Ship status |
|---------|---------------|---------------|--------------|-------------|
| Realtime channel design + publication | ⬜ | ⬜ B74 (shipped) + B75 | ⬜ | Required (DoD anchor) |
| Live bracket view (in-place state mutation) | ⬜ | ⬜ B75 + W80 + W84 | ⬜ | Required (DoD anchor) |
| Auto-reconnect on transient loss | ⬜ | ⬜ W80 | ⬜ | Required |
| Match status indicators (6 states) | ⬜ | ⬜ W83 | ⬜ | Required |
| Spectator mode `?spectator=true` | ⬜ | ⬜ W85 | ⬜ | Required (DoD anchor) |
| Esc-to-exit hint + handler | ⬜ | ⬜ W85 | ⬜ | Required |
| Presence / viewer count | ⬜ | ⬜ W81 + W86 | ⬜ | Required (DoD anchor) |
| Background-tab exclusion | ⬜ | ⬜ W81 | ⬜ | Required |
| `spectator.session_started` audit emit | ⬜ | ⬜ B76 + B77 + W82 | ⬜ | Required |
| a11y axe-clean on `/spectator` | ⬜ | ⬜ W88 | ⬜ | Required |
| Lighthouse mobile ≥ 90 | ⬜ | ⬜ W88 | ⬜ | Required |
| Sentry realtime error capture | ⬜ | ⬜ W80 + W88 | ⬜ | Required |
| Tournament-cancelled mid-stream teardown (D19) | ⬜ | ⬜ W80 reducer + B78 (e) | ⬜ | Required (DoD anchor — A-A03) |
| EF-error UX silent fail (D18) | ⬜ | ⬜ W82 + DoD2 (n) | ⬜ | Required (A-A09) |
| Race-safe audit dedup (B77 partial unique index) | ⬜ | ⬜ B77 sub-migration + DoD2 (q) | ⬜ | Required (A-A05) |

v0.8 ships when 15/15 are green AND DoD2's 100-viewer + sub-1s + reconnect + cancelled-flip + dedup-race paths verify end-to-end.

---

## 6 · i18n key inventory

| Namespace | Key | English | Thai (placeholder) |
|---|---|---|---|
| `spectator` | `exit_hint` | "Press Esc to exit spectator mode" | "[TH] Press Esc to exit spectator mode" |
| `spectator` | `exit_aria_label` | "Exit spectator mode" | "[TH] Exit spectator mode" |
| `spectator` | `disconnected` | "Reconnecting…" | "[TH] Reconnecting…" |
| `bracket_live` | `status.upcoming` | "Upcoming" | "[TH] Upcoming" |
| `bracket_live` | `status.in_progress` | "Live" | "[TH] Live" |
| `bracket_live` | `status.completed` | "Final" | "[TH] Final" |
| `bracket_live` | `status.retired` | "RET" | "RET" |
| `bracket_live` | `status.walkover` | "W/O" | "W/O" |
| `bracket_live` | `status.bye` | "BYE" | "BYE" |
| `bracket_live` | `viewer_count` (ICU plural) | `{count, plural, one {# viewer} other {# viewers}}` | `{count, plural, other {[TH] # ผู้ชม}}` |
| `bracket_live` | `tournament_cancelled` | "This tournament has been cancelled" | "[TH] This tournament has been cancelled" |

12 new keys total (added `tournament_cancelled` per D19 / A-A03). Native-Thai review obligation carries to v0.9 per existing checklist `Plans/v02-th-i18n-review.md`.

---

## 7 · Anti-criteria (locked)

- v0.8.0 must NOT rely on client-side filtering for tournament-status enforcement — **A-A01 reversal of DRAFT v1.** The original anti-criterion proposed "subscribers must client-side-filter on `tournament.status NOT IN ('draft', 'cancelled')`" — this is a security leak, not a defense. Trusting the client to filter is equivalent to trusting an HTTP client to honor a `Cache-Control: private` header. **Correct posture:** RLS policies on `match`/`tournament`/`draw` MUST gate anonymous Postgres-Changes events server-side (Supabase evaluates RLS on each broadcast against the new row state for the subscriber's role); B78 test (d) + (e) verifies the broadcast-layer block for both draft and cancelled-mid-stream cases. Client-side defense-in-depth filter in W80 reducer is a SECONDARY guard, not a primary one.
- v0.8.0 must NOT emit `match` events to anonymous subscribers for `draft` or `cancelled` tournaments — verified by B78 (d) draft-leak regression test + (e) cancelled-flip regression test. If either test fails, RLS policy is broken at a v0.5/v0.6 layer and v0.8 BLOCKS on a backport fix.
- v0.8.0 must NOT expose user_id in the presence payload — anonymous spectators track ephemeral UUID per D9; authenticated spectators may track `user_id` but the viewer-count UI MUST NOT render any identity (W86 renders count only).
- v0.8.0 must NOT trigger a full-page rerender on score update — per D4. `router.refresh()` is forbidden in the realtime handlers; in-place state mutation only. Smoke test in DoD2(b).
- v0.8.0 must NOT render TO admin buttons in spectator mode — per D7. Server-side conditional, not client-side display:none (which would still hydrate the buttons in DOM).
- v0.8.0 must NOT introduce new mutable schema beyond the 1 enum value + 2 publication tables in B75/B76. No new RPCs, no new tables, no new columns.
- v0.8.0 must NOT bypass RLS for any realtime payload — Postgres-Changes events are RLS-aware by Supabase design; v0.8 trusts this contract. RLS regression tests in B78 verify anonymous reader can subscribe and receive events for a published tournament's matches but NOT for a draft tournament's.
- v0.8.0 must NOT use `realtime.broadcast_changes` triggers — per D2, publication membership is sufficient.
- v0.8.0 must NOT modify v0.5/v0.6/v0.7 frozen surfaces (Draw tab, Scores tab, Schedule tab, RPCs, EFs) — only adds the realtime hook + spectator shell + status badge + viewer-count badge.
- v0.8.0 must NOT depend on v0.7 unfinished Phase C — this plan executes against v0.7's `main`-state surface (publication migration B74 already shipped pre-v0.7 ship per the migration filename).
- v0.8.0 must NOT push padelthailand.com/matchday/ without explicit Pap approval.
- v0.8.0 must NOT emit `spectator.session_started` audit on every viewer connect — only on first concurrent viewer, deduped 1-per-hour-per-tournament per D12.
- v0.8.0 must NOT require auth for spectator mode — `?spectator=true` works for anon visitors (RLS allows public bracket reads on published/live tournaments per v0.5 B37 policy).
- v0.8.0 must NOT use `jsr:` imports in Edge Functions without routing through `supabase/functions/deno.json` imports map (per matchday-backend CLAUDE.md gotcha + v0.1 CI debugging history).
- v0.8.0 must NOT ship without Lighthouse mobile ≥ 90 verified on `?spectator=true` URL.
- v0.8.0 must NOT ship without axe-core 0-violation verification on the spectator URL.
- v0.8.0 must NOT ship without Sentry capture verified on a deliberate disconnect path.
- v0.8.0 must NOT use colon-delimited channel names — per D1 + A-A06: channel names use hyphens only (`tournament-{uuid}-bracket`). Colon form historically conflicts with Phoenix topic-prefix parsing.
- v0.8.0 must NOT block the spectator UI on `realtime-presence-audit` EF failure — per D18: silent failure with Sentry capture only. No error toast, no retry loop visible to user.
- v0.8.0 must NOT use a SELECT-then-INSERT pattern for the audit dedup — per A-A05: race-safe `INSERT ... ON CONFLICT DO NOTHING` against the new partial unique index. SELECT-first is TOCTOU at concurrent first-viewer arrival.
- v0.8.0 must NOT amend the shipped `20260503010000_v08_realtime_publication.sql` migration to fix its now-stale `router.refresh()` docstring — per D20: migration is forward-only + the SQL is correct; the override lives in the plan + W80 description. v0.8.x or v0.9 may add a docstring-correction migration if Pap requests.
- v0.8.0 must NOT trust anon Realtime connections without an anon JWT — per D17: supabase-js auto-mints the anon JWT from the publishable key; if a deployment ever runs without the publishable key set, presence track + Postgres-Changes both fail closed (which is the correct behavior; verify via integration smoke).

---

## 8 · Risk register (DRAFT v2; stress-tested 2026-05-07)

| # | Risk | Mitigation |
|---|------|------------|
| **R1** | Supabase Realtime fan-out at 100 concurrent viewers exceeds project tier limits | v0.1 spike validated 2-client p95=1ms; per-tournament channel scoping (D1) bounds load. v0.8 DoD2(g) k6-load-tests 100 viewers explicitly. If exceeded, upgrade Supabase tier (Pap-approved). |
| **R2** | Postgres-Changes RLS evaluation per-event at 100 viewers × 7-32 matches × N updates = nontrivial CPU on the Realtime server | Supabase-managed; if hot, fallback to manual `realtime.broadcast_changes` triggers (D2 reversal in v0.8.x). |
| **R3** | In-place state mutation (D4) breaks `@g-loot/react-tournament-brackets` if it expects new array reference | W80 mitigates: Zustand slice produces new array reference on mutation (immutable update via `set((state) => ({ matches: state.matches.map(...) }))`); the bracket library re-renders only changed match nodes via React.memo + key. |
| **R4** | Reconnect storm on transient network blips — 100 clients disconnect simultaneously, all reconnect at the same moment | D5 exponential backoff + jitter mitigates (random 0-500ms initial delay). v0.8.x may add server-side rate-limit if observed. |
| **R5** | Presence count goes stale when tabs close ungracefully (browser kill, OS sleep) | Supabase Realtime presence has a server-side timeout (~30s); stale entries auto-evict. D10's 2s display debounce smooths the transition. |
| **R6** | Background-tab visibility API behaves inconsistently across browsers | D11 implementation uses standard `document.visibilityState`; tested in major browsers. iOS Safari has known quirks with frozen tabs — accepted as platform limitation. |
| **R7** | First-viewer audit emit has TOCTOU — two clients arrive within milliseconds, both see 0→1 transition, both emit | B77's dedup query (1-per-hour) absorbs the race; second emit gets `deduped: true`. Idempotent at the audit_log level. |
| **R8** | Spectator mode CSS `clamp()` produces unreadable text on very small mobile screens | D15 floor at `1.25rem` for match cards (~20px) — readable. Manual test on iPhone SE (375px width) in DoD2(k). |
| **R9** | Esc key handler conflicts with browser/OS shortcuts (e.g., fullscreen Esc) | D8 attaches handler at document level; if browser is in fullscreen, Esc exits fullscreen first (browser default takes precedence). Acceptable; user can press Esc again to exit spectator. |
| **R10** | Sentry quota exhaustion if every realtime disconnect logs an error event | W80 uses Sentry breadcrumb (free) for routine reconnects; only `Sentry.captureException` on exhausted-retry (max 30s backoff hit). |
| **R11** | Audit log table grows fast if every spectator session emits a row | D12 1-per-hour dedup bounds to ~24 rows/tournament/day. Tournament typically 1-3 days. ~70 rows/tournament max. Negligible. |
| **R12** | Cross-tournament viewer-count interference if user opens 2 tournaments in 2 tabs | Per-channel presence (D9) isolates counts; each tab tracks its own anon_id on its own channel. |
| **R13** | i18n key namespace collision with v0.9 work running in parallel | D13 explicit `spectator.*` + `bracket_live.*` namespaces — no overlap with `tournaments.*` (v0.5+) or `placements.*` (v0.9). Coordinate with v0.9 Plan-agent at handoff. |
| **R14** | Pap pushback on D2 (Postgres-Changes vs broadcast triggers) | If Pap wants RLS-bypass-able custom payloads (e.g., to send a partial update without exposing the full row), v0.8.x adds `realtime.broadcast_changes` triggers. v0.8 default = Postgres-Changes is sufficient. |
| **R15** | Pap pushback on D6 (query-param vs vanity URL) | If Pap wants `/spectator/[org-slug]/[t-slug]` for shareability, v0.9 adds the route as a thin redirect to `?spectator=true`. v0.8 default = query-param. |
| **R16** | k6 load test (DoD2(g)) requires staging Supabase project | Use local stack via `supabase start`; spawn k6 against local Realtime server. Alternative: rate-limit the prod test to 10 viewers + extrapolate. |
| **R17** | `match.tournament_id=eq.{N}` filter syntax mismatch with current Supabase-js v2 API | W80 verifies syntax against `@supabase/supabase-js` ^2.x docs at implementation time. Fallback: client-side filter post-receive (CPU cost negligible at 100 viewers). |
| **R18** | ~~The shipped B74 migration's docstring suggests `router.refresh()`~~ — **REFRAMED as documentation-debt finding, not risk.** Resolved via D20 + new anti-criterion. The docstring is stale guidance; the migration is correct; D4 governs. No further action needed in v0.8. | Resolved (closed). |
| **R19** | Realtime publication membership for `tournament` (B75) emits events on `tournament.updated_at` touches even when no spectator-relevant field changed (e.g., TO updates `name`) | Acceptable v0.8 noise. Subscribers receive but ignore (W80's reducer matches on relevant fields). v0.9+ may add column-level filter `commit_timestamp` or trigger-based broadcast. |
| **R20** | Phase A length is short (~5 commits) — minimal backend surface | By design — v0.8 is mostly frontend. Estimated 0.5 day backend, 1.5 days frontend, 0.5 day DoD. **Architectural alternative considered + rejected:** B77 EF could be replaced by a Postgres trigger emitting audit_log directly on the first concurrent Realtime presence join — but Realtime presence state is not visible to Postgres (lives on the Realtime server, not in a Postgres table), so a trigger has no event to fire on. EF stays. |
| **R21** | Postgres-Changes RLS evaluation may NOT block events on subsequent same-row UPDATE if the row was already cached for a subscriber (server-side caching behavior in Supabase Realtime is not formally documented) | B78 test (e) cancelled-flip regression is the empirical answer. If test fails, escalate as BLOCKER + open a Supabase support ticket; v0.8 cannot ship without confirmed broadcast-layer block on cancelled tournaments. |
| **R22** | Partial unique index for B77 dedup cannot reference `now()` in WHERE clause (Postgres immutable-only constraint) | B77 description explicitly notes the workaround: non-time-bounded unique partial index on `(target_id, action) WHERE action = 'spectator.session_started'` PLUS recency check + DELETE-stale + INSERT-ON-CONFLICT pattern in the EF body. Single-tx for atomicity. Verified at B77 implementation. |
| **R23** | next-intl ICU plural shape for `bracket_live.viewer_count` may not match next-intl's expected JSON parser | Verified pre-W87: next-intl supports the `{count, plural, one {...} other {...}}` ICU shape natively via `t('viewer_count', {count: viewerCount})`. If the deployed next-intl version (verify at sync-time) doesn't, fall back to `{viewerCount === 1 ? t('viewer_count_one') : t('viewer_count_other', {count})}` — split keys. Documented for W87 implementer. |
| **R24** | Supabase channel name `tournament-{uuid}-bracket` length: UUIDs are 36 chars, total ~57 chars — well within Phoenix topic limit (~255) but worth a note | No action; bounds confirmed. |

---

## 9 · Approval gates

This plan requires explicit Pap approval before any scaffolding:

1. ⬜ Plan drafted (DRAFT v1) — *this document*
2. ⬜ Plan stress-tested by Architect review lens (DRAFT v2)
3. ⬜ Pap reviews; D1-D16 answered
4. ⬜ Phase A (B75-B79) executed
5. ⬜ Phase B (W79-W88) executed
6. ⬜ Phase C DoD walkthrough by Pap

---

*End of v0.8.0 build plan DRAFT v1.*

---

## Change log — DRAFT v1 → DRAFT v2 (2026-05-07)

Stress-test by Architect review lens (autonomous agent run, ~10 min) surfaced 22 actionable findings against `Plans/v08-build-plan.md` DRAFT v1 + cross-reference against shipped `20260503010000_v08_realtime_publication.sql` + `matchday-backend/CLAUDE.md` `jsr:` imports map gotcha. **9 critical applied as in-place patches; 8 important addressed (5 plan-amended, 3 documented-with-rationale); 5 nits accepted-with-rationale.** Density mirrors v0.6 (21) + v0.7 (22) change-log volume.

**Critical (9) — applied as in-place patches:**
- **A-A01: Anti-criterion #1 inverted** — DRAFT v1 said "subscribers must client-side-filter" on tournament status. This is a **security leak** (trusting the client equals no defense). REVERSED in §7: RLS server-side enforcement is the primary; client filter in W80 reducer is defense-in-depth only. Two new B78 regression tests (d) draft-leak + (e) cancelled-flip verify broadcast-layer block.
- **A-A02: D20 — B74 docstring stale guidance.** R18 was framed as "risk" — wrong category; it's documentation debt. Promoted to new D-decision **D20** with explicit override + new anti-criterion. R18 closed (resolved). Migration file NOT amended (forward-only + correct SQL); plan + W80 description carry the override.
- **A-A03: D19 — cancelled-flip mid-stream behavior unspecified.** New D-decision **D19** specifies clean teardown: subscribers receive cancellation event, W80 reducer detects flip, unsubscribes, renders localized "Tournament cancelled". New i18n key `bracket_live.tournament_cancelled`. New B78 test (e) + new DoD2 step (m). Without this fix, spectators would see frozen bracket post-cancel with no signal.
- **A-A04: D5 jitter promotion.** Reconnect storm mitigation (R4) was risk-only; promoted ±500ms jitter requirement INTO D5 + W80 description. New DoD2 step (o) verifies reconnect distribution >250ms (no thundering herd at 100 viewers).
- **A-A05: B77 dedup race + missing partial unique index.** SELECT-then-INSERT pattern in DRAFT v1 had TOCTOU at concurrent first-viewer arrival. Replaced with race-safe `INSERT ... ON CONFLICT DO NOTHING` against new partial unique index `idx_audit_spectator_session_started_unique`. New migration `20260507020000` (single sub-step of B77). New anti-criterion. New DoD2 step (q) with 10-concurrent-first-viewer race test. Note: Postgres immutable-only constraint on partial-index predicates documented as R22.
- **A-A06: D1 channel name format.** Colon-delimited `tournament:{id}:bracket` historically conflicts with Phoenix topic-prefix parsing in Supabase Realtime. Switched to hyphen form `tournament-{tournament_id}-bracket`. Cascaded through B78, W80, W81 descriptions. New anti-criterion. R24 confirms length OK.
- **A-A07: B78 RLS test must verify BROADCAST blocking, not just SELECT blocking.** Anti-criterion #6 said "verify in B78" but test description didn't explicitly subscribe-as-anon-and-confirm-no-event-received for a draft tournament. Test (d) added: subscribe as anon, UPDATE a draft-tournament `match` row, assert no event reaches subscriber.
- **A-A08: D17 — anon presence + Supabase Realtime auth model gap.** D9 described anon presence but didn't specify HOW anon connections authenticate. New D-decision **D17** documents: supabase-js auto-mints anon JWT from publishable key; presence track works via `auth.role()='anon'` (not `auth.uid()`); RLS already permits via v0.5 B37. New anti-criterion: deployment without publishable key fails closed.
- **A-A09: D18 — error-path UX on EF 500 unspecified.** No D-decision covered what happens when `realtime-presence-audit` EF returns 500. Could have caused spectator UI to block/error/retry-loop. New D-decision **D18**: silent failure + Sentry capture only. New anti-criterion. New DoD2 step (n).

**Important (8) — 5 plan-amended, 3 documented-with-rationale:**
- **A-A10: R19 broadcast amplification on `tournament.updated_at` touches.** Promoted from "acceptable noise" to W80 reducer-level guard: ignore `tournament` UPDATE events when changed columns NOT in `{status, started_at, completed_at}`. Documented in W80 description.
- **A-A11: R3 in-place mutation library compatibility** — promoted from risk to W80 implementation requirement. Zustand `set((s) => ({ matches: s.matches.map(...) }))` produces NEW array reference (not in-place mutation of the array itself); React reconciles only changed nodes. Documented inline in W80.
- **A-A12: I3 missing 100-viewer perf scaffolding.** DoD2(g) handwaved k6. Documented-with-rationale: leaving as Pap-execution at DoD time (P5 already commits Pap to install k6); v0.8.x may add CI scaffolding if cadence requires repeat runs.
- **A-A13: I4 axe regression CI gate** — manual sweep at W88 only; no CI gate. Documented-with-rationale: v0.8 surface is small (one new shell + 2 hooks + 2 components); manual sweep adequate. v0.9 polish work to add CI axe gate (carries to next plan).
- **A-A14: R23 next-intl ICU plural shape verification.** Promoted from implicit to W87-implementer-must-verify with documented split-key fallback if next-intl version lacks ICU plural support.
- **A-A15: R7 first-viewer TOCTOU.** A-A05's race-safe INSERT subsumes this risk completely (the ON CONFLICT path absorbs the race at the storage layer, not at the EF layer). R7 still listed but resolution path is now A-A05.
- **A-A16: R5 stale presence after browser kill.** Promoted from accept-as-platform to W81-test obligation + new DoD2 step (p).
- **A-A17: R17 Supabase-js v2 channel filter syntax** — promoted to W80-implementer-must-verify-against-current-docs. Fallback (post-receive client filter) documented.

**Nits (5) — accepted-with-rationale:**
- A-N01: Migration filename forward-dating `2026-05-07` for work done same day — accepted convention (mirrors v0.6 A-N03, v0.7 A-N04).
- A-N02: B79 listed as "commit" but is auto-step (types regen). Convention deviation; accepted (mirrors v0.5/v0.6/v0.7 phase tables).
- A-N03: P5 commits Pap to install k6 manually. Accepted; alternative (scripted install in CI) is v0.8.x scope.
- A-N04: EF naming `realtime-presence-audit` differs from sister-EF naming patterns (verb-first like `advance-winner`, `send-registration-email`). Accepted; the noun-first form `realtime-presence-audit` reads more clearly given the trigger is presence-event-driven, not user-initiated. Documented.
- A-N05: §6 i18n key `bracket_live.viewer_count` ICU shape may render as fallback text on next-intl version drift. R23 covers; nit accepts the split-key fallback as acceptable degradation.

**Net additions in DRAFT v2:**
- **5 new D-decisions** (D17 anon JWT, D18 EF-error UX, D19 cancelled-flip teardown, D20 B74 docstring override, D1 reformatted to hyphen-channel as A-A06 fix-in-place).
- **6 new anti-criteria** in §7 (channel naming, EF silent fail, ON CONFLICT dedup, B74 amendment forbidden, anon JWT fail-closed, plus the §7 anti-criterion #1 reversal).
- **5 new risks** (R21 RLS broadcast caching empirical-only, R22 partial-index `now()` workaround, R23 next-intl ICU, R24 channel name length, plus R18 closed/reframed).
- **5 new DoD2 steps** (m through q).
- **1 new migration** (`20260507020000_v08_audit_spectator_session_dedup_index.sql`) — sub-step of B77, not a new B-commit.
- **1 new i18n key** (`bracket_live.tournament_cancelled` — total goes from 11 to 12).
- **3 new ship-matrix rows** (cancelled-flip teardown, EF silent fail, race-safe dedup) — total goes from 12/12 to 15/15.
- **B77 + B78 + W80 + W81 + W82 descriptions amended** in §4 to reference fix labels (A-A##); §0 schema enumeration expanded to include partial unique index + EF-count clarification.

**BLOCKER findings: 0.** No architectural pivots required. R20's "could B77 collapse to a Postgres trigger?" alternative was considered + rejected (Realtime presence state lives outside Postgres; trigger has no event source). All critical findings absorbed via in-place description edits + new D-decisions + new anti-criteria + new tests.

**Line-count delta:** DRAFT v1 = 248 lines → DRAFT v2 ≈ 320+ lines (29% growth, comparable to v0.6's 21-finding pass and v0.7's 22-finding pass).

*End of change log.*
