# Matchday v0.7.0 — "Scheduling" Build Plan

> **Status:** DRAFT v2 — stress-tested by Architect review lens 2026-04-29. **22 findings reconciled** (5 critical, 12 important, 5 nits). 3 net-new D-decisions surfaced (D16-D18). Critical patches A-A02/04/09/10/13 + important A-A07/A-A08 applied to in-flight code; remaining findings are plan-only or v0.7.x deferred. DRAFT v1 → DRAFT v2 change-log appended.
> **Predecessor:** v0.6.0 "Live Scoring" — Phase A code-complete; Phase B code-complete; awaiting CI verification + Pap DoD2. v0.7.0 is executable independently of v0.6 ship-status because v0.7 only WRITES `match.scheduled_court` + `match.scheduled_at` (v0.5 B37 forward-loaded those columns nullable) and reads scoring outcomes only for the "My next match" surface (deferred to v0.7.x; not v0.7 default scope).
> **DoD:** Auto-schedule produces a conflict-free schedule for a representative 16-team multi-day tournament that respects bracket order, court availability, and player back-to-back avoidance.
> **External-prereq risk:** Low. v0.7 has no new Pap-prereqs. No new third-party SaaS, no new OAuth, no new infra. Uses existing dnd-kit (v0.5) for grid drag-drop.

---

## 0 · What v0.7 inherits from v0.5/v0.6 (so what's NOT in this plan)

| Surface | v0.5/v0.6 status | v0.7 obligation |
|---|---|---|
| `match.scheduled_court` (text) + `match.scheduled_at` (timestamptz) | ✅ shipped (v0.5 B37 — both nullable) | **No ALTER.** v0.7 starts WRITING these. |
| `tournament.day_start_time` + `day_end_time` (default 09:00 / 18:00) | ✅ shipped (v0.3 B7) | v0.7 reads these; multi-day support uses the same per-tournament window across all days (per-day overrides deferred to v0.7.x). |
| `venue.court_count` + `venue.court_names text[]` | ✅ shipped (v0.3 B6) | v0.7 reads court_names as the row labels in the grid. |
| `audit_action` enum — `match.scheduled` (NOT YET PRESENT) | ❌ — needs ALTER TYPE ADD VALUE | v0.7 B63 adds `match.scheduled`, `match.unscheduled`, `match.rescheduled` (or rolls all into one `match.scheduled` with metadata.action). |
| `dnd-kit` packages | ✅ shipped (v0.5 W47 P4) | Re-used for grid drag-drop. No new package. |

**Net new schema in v0.7 (DRAFT v2):**
1. `tournament.round_durations jsonb` — TO-configured per-round match duration (15/30/45/60/75/90/105/120 min). Stored as `{ "1": 45, "2": 60, "final": 90, "third_place": 60 }` — round-number-string keys with `"final"` + `"third_place"` sentinels. The B67/B66 `_resolve_round_duration` helper looks up by precedence: third_place > final > round-number-string > default 60. **A-A06 partially deferred** — plan commits to mixed shape (matches spec §7.2 example labels in spirit); two-keying ambiguity (`"4"` vs `"final"` for the same row) resolved by the helper preferring the sentinel.
2. `court_blocked_range` table — `(id, tournament_id, court_name, blocked_at_start, blocked_at_end, reason text, created_by FK ON DELETE SET NULL, created_at, updated_at)` + CHECK `blocked_at_end > blocked_at_start`. **A-A02 fix:** RLS split — TO/admin SELECT base table (sees `reason`); anonymous SELECT goes through the new view `court_blocked_range_public` (no `reason` column). Service-role-only writes via B68/B69 Edge Functions.
3. **A-A02 view:** `court_blocked_range_public` — projection over `(id, tournament_id, court_name, blocked_at_start, blocked_at_end)`. Used by spectator surface + v0.7 public bracket page.
4. **A-A10 partial index:** `idx_match_tournament_scheduled` on `match (tournament_id, scheduled_at) WHERE scheduled_at IS NOT NULL`. Hot-set covering index for B67's pairwise conflict scan.
5. `audit_action` enum additions — `match.scheduled`, `match.unscheduled`, `match.rescheduled`, `court.blocked`, `court.unblocked` (see B63 below).

---

## 1 · D-decisions (DRAFT v1 defaults; Pap review pending)

| # | Decision | Default | Rationale |
|---|----------|---------|-----------|
| **D1** | Round-duration storage shape | **`tournament.round_durations jsonb` keyed by round number string** | Mirror of v0.5's `draw_seed` jsonb pattern. Sparse — TO only sets rounds that exist for this draw_size. Migration adds the column nullable; UI requires it set before "Auto-schedule" button enables. |
| **D2** | Auto-schedule algorithm location | **Postgres PL/pgSQL RPC `auto_schedule_rpc`** | Mirror of v0.5 D3/D4 + v0.6 D1. Single source of truth; deterministic; testable in SQL. The constraint solve is ~50 LOC of PL/pgSQL using greedy round-by-round placement (see §B66 pseudocode). |
| **D3** | Schedule-write transactionality | **Single PG txn — DELETE all `(match.scheduled_court, scheduled_at)` for this draw, then UPDATE all matches with new placements** | Atomic. Mirrors v0.5 B41 generate_draw_rpc DELETE-then-UPDATE pattern. No partial-state visible to spectators. |
| **D4** | Manual drag-drop persistence | **Each drop is its own RPC call (`update_match_schedule_rpc`)** | Mirror of v0.5 W47 drag-drop pattern (`upsert_draw_seed_rpc` per drag). UPSERT semantics; out-of-order writes absorbed last-wins. |
| **D5** | Auto-schedule strategy | **Greedy round-by-round + court round-robin** | Per spec §7.7. NOT a constraint solver — greedy with a "respect bracket order" check is enough for typical tournaments (16-32 teams). Fallback if greedy fails: surface "couldn't place N matches" + leave them unscheduled for TO manual handling. |
| **D6** | Player back-to-back avoidance | **Soft constraint — minimum 1 slot (15 min) gap between a player's matches; if hard to satisfy, allow back-to-back with yellow warning (non-blocking)** | Per spec §7.6 "Insufficient gap → yellow warning (non-blocking)". Hard-blocking would prevent valid schedules in dense tournaments. |
| **D7** | Court availability blocking shape | **Per-court time-range rows in `court_blocked_range` table** | Per spec §7.4. Click + drag in grid creates a row; UPDATE existing row when extending; DELETE on unblock. RLS public-read so v0.8 spectator surface sees gray bars. |
| **D8** | Multi-day support | **Day tabs derived from `tournament.start_date..end_date`. Single `day_start_time`/`day_end_time` window applied to every day** | Per-day overrides deferred to v0.7.x. Most tournaments use the same hours every day; the override path is a future enhancement. |
| **D9** | Conflict-detection location | **Server-side via `detect_schedule_conflicts_rpc` returning conflict array; client renders warnings** | Mirror of v0.6 B51 `_compute_match_winner` pattern. Conflicts are pure-functional given current schedule; surfacing them client-side requires the same data. Server-render once + client-receive structured array. |
| **D10** | Bracket cascade integration | **Scheduled matches survive bracket cascades from v0.6 B57** | When v0.6 cascade resets a downstream match, it already preserves `scheduled_court` + `scheduled_at` (B57 NULLs `scored_*` + `set*` + `winner_team_id` + status, but leaves scheduling fields intact). v0.7 adds an opt-in flag to `_cascade_undo_walk` (or a v0.6.x patch) to also clear scheduling on cascade — deferred. v0.7 default: scheduling is independent of scoring cascade. |
| **D11** | Auto-schedule audit emit shape | **Single `match.scheduled` audit row with metadata.matches_scheduled count, NOT one row per match** | Mirror of v0.5 A-A18 anti-criterion (per-match-row audit forbidden). The cascade is bulk; one audit per auto-schedule action. Manual drag emits per-match `match.scheduled` audit. |
| **D12** | Scheduling UI surface | **New "Schedule" tab on the organizer management hub** | Separates concerns: Draw tab (v0.5) for pre-publish seeding; Scores tab (v0.6) for post-publish entry; Schedule tab (v0.7) for grid-based placement. Tab visible only when `tournament.status IN ('published', 'live')`. |
| **D13** | Drag-drop grid library | **`@dnd-kit/core` + custom drop-zone targets per (court × time-slot) cell** | Re-uses v0.5's dnd-kit. The grid cell is the drop target; each cell carries `(court_name, slot_start_time)`. Match cards pick up from the unscheduled panel OR another grid cell. Avoids `@dnd-kit/sortable` (we don't need within-list order). |
| **D14** | Auto-schedule re-run after manual edits | **Two buttons: "Auto-schedule remaining" (preserves manual placements) + "Re-auto-schedule all" (with confirm dialog clearing manual)** | Per spec §7.7 "Manual Adjustments". The per-match scheduled flag is a boolean on the RPC's match-list filter input, not a column. |
| **D15** | Rescheduling-after-completion behavior | **Reject — completed/retired/walkover matches are LOCKED. UI greys them; RPC returns `match_not_reschedulable` error** | Spec §7.9 doesn't mandate this, but rescheduling a played match has no real semantics (the players already played). v0.8 spectator can still see when it was played. |
| **D16** | 3rd-place scheduling treatment (post-stress-test A-A01) | **Default = schedule the 3rd-place match only AFTER it's auto-created (after 2nd SF completes). At earlier auto-schedule runs, the row doesn't exist yet and is naturally skipped by B66's loop.** | The agent flagged a potential placeholder-scheduling concern: at scheduling time the 3rd-place row's teams may be NULL. **In practice this never happens** because v0.6 B52/B53/B54 INSERTs the 3rd-place row only when both losers are known. Auto-schedule re-runs after the 2nd SF completes (manual or via the W74 conflict-warning surface) place the 3rd-place row with full player overlap data. v0.7.x may add a "potential player superset" check if Pap reports back-to-back complaints in real tournaments. |
| **D17** | Post-cascade stale-schedule heuristic (post-stress-test A-A05) | **Defer to v0.7.x** — when v0.6 cascade resets a match's teams but the schedule survives, the matchup has effectively changed. Heuristic warning ("matchup may have changed since scheduled") deferred until Pap reports user confusion. | A precise tracking solution requires a `match.scheduled_team_a_id`/`scheduled_team_b_id` snapshot pair (new schema), which violates the §0 schema enumeration. v0.7 documents the limitation in DECISIONS.md; v0.7.x decides whether to expose. |
| **D18** | Auto-schedule with `preserve_manual=true` validates manual placements (post-stress-test A-A09) | **Validate each manual placement against bracket-order; invalid manuals (placed before their feeders end) drop to unscheduled with a per-match toast.** | Pre-fix B66 silently kept invalid manuals — TO drags SF1 to 13:00 with QFs at 14:30 and clicks "Auto-schedule remaining" → invalid 13:00 placement persists; B67 surfaces only an orange warning. Now: B66 detects the violation, NULLs the placement, and re-greedy-places it. Surfaces in `dropped_invalid_manual_count` + `dropped_invalid_manual_ids`. |

---

## 2 · Scope

In-scope (per `Plans/version-roadmap.md` v0.7.0 + spec §7):

1. **Round-duration configuration** — TO sets per-round match durations on the management hub (NEW: requires schema column).
2. **Court × time grid (15-min increments)** — TO sees a grid of (courts × time slots) for each tournament day. Matches render as multi-cell spans based on their round duration.
3. **Court availability blocking** — TO can mark per-court time ranges as unavailable (e.g., maintenance, double-booking with another tournament). Auto-schedule respects blocked ranges.
4. **Multi-day support** — Day selector tabs at the top of the Schedule tab. Days derived from `tournament.start_date..end_date`. Same `day_start_time`/`day_end_time` per day.
5. **Auto-schedule algorithm** — TO clicks "Auto-schedule" or "Auto-schedule remaining" → server-side RPC places all unscheduled matches respecting bracket order, court availability, and player back-to-back avoidance.
6. **Manual drag-drop adjustments** — TO can drag any match to a different court/time. Each drop is a server-side RPC call. Optimistic UI with reconciliation.
7. **Conflict detection** — Player double-booked, insufficient gap, bracket dependency violation, court blocked. Surfaced as inline warnings (red/yellow/orange per spec §7.6).
8. **"Unscheduled matches" panel** — Sidebar/bottom of the grid showing matches not yet placed; drag-source for manual placement.
9. **Schedule audit log** — `match.scheduled` audit per manual drag; bulk audit on auto-schedule with `metadata.matches_scheduled`.
10. **Cross-cutting DoD** — a11y on Schedule tab; Sentry; audit; i18n.

Out-of-scope (defer per roadmap):

- Realtime schedule updates → v0.8 (Realtime channel `tournament:{id}:schedule`)
- Spectator schedule view → v0.8 (`?spectator=true` reserved in v0.5 D12)
- "My next match" card on player surface → v0.7.x patch IF Pap requests; not v0.7 default scope (the data is in `match.scheduled_at` already; the surface is a Player-side concern, not Organizer).
- Per-day `day_start_time`/`day_end_time` overrides → v0.7.x
- Match-duration override per-individual-match (e.g., "this final gets 120 min" overriding the round default) → v0.7.x; v0.7 default uses the round-level config only.
- Auto-schedule with player-back-to-back as a HARD constraint → v0.7 default soft (D6)
- Schedule export (CSV / PDF) → v0.9 (polish)
- Constraint-solver-based optimization (e.g., minimize total tournament duration) → v2+ (greedy is enough for v1)
- Schedule cascade on v0.6 score-edit → v0.6.x or v0.7.x patch (D10)
- Court re-numbering / reordering → out of scope; venues are immutable structures from v0.3

---

## 3 · External Prerequisites — gate questions for Pap

### Real-world account/process work

| # | Prereq | Risk | Required for | Action |
|---|--------|------|--------------|--------|
| P1 | **No new external services** | None | n/a | None. |
| P2 | **`SUPABASE_ACCESS_TOKEN` repo secret** | Already set | Auto-types regen + prod migration push | None. |
| P3 | **`@dnd-kit/*` already installed** | Already shipped (v0.5 W47) | Phase B grid drag-drop | None. |

### Decisions needed from Pap (gate)

The 15 D-decisions in §1 are surfaced as PR-style defaults. Recommended order: D5 (auto-schedule strategy), D6 (back-to-back), D8 (multi-day), D15 (lock-after-completion) — these have visible business semantics. Then D1-D4 + D7 + D9-D14 (mostly engineering-internal).

---

## 4 · Phased commit plan

Continuing the commit-numbered convention. v0.6 backend ended at B62; v0.7 starts at **B63**. v0.6 web ended at W66; v0.7 web starts at **W67**.

Sequencing: Phase A backend (B63-B73) → Phase B web (W67-W78) → Phase C DoD ship.

### Phase A — Backend schema + RPCs + Edge Functions (matchday-backend) — gates Phase B

| Commit | Description |
|---|---|
| **B63** | **Schema migration: tournament.round_durations + court_blocked_range table + audit_action enum.** Single migration. ALTER TABLE tournament ADD COLUMN round_durations jsonb (nullable). CREATE TABLE court_blocked_range with (id, tournament_id FK CASCADE, court_name text, blocked_at_start timestamptz, blocked_at_end timestamptz, reason text, created_by FK, created_at, updated_at) + indexes on (tournament_id, court_name) + (tournament_id, blocked_at_start). RLS: public SELECT (spectator), TO/admin INSERT/UPDATE/DELETE via service-role-only Edge Functions. ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'match.scheduled', 'match.unscheduled', 'match.rescheduled', 'court.blocked', 'court.unblocked'. |
| **B64** | **audit_action v0.7 completeness assert.** Idempotent guard mirror of v0.5 B38 + v0.6 B49. ADD VALUE IF NOT EXISTS for 5 v0.7 values; DO block validates all present. |
| **B65** | **`update_match_schedule_rpc(p_match_id, p_user_id, p_court_name, p_scheduled_at)`.** Pipeline: AUTHZ (TO/admin); SELECT FOR UPDATE on match + tournament; status guards (tournament IN published/live; match.status IN upcoming/in_progress per D15); validate court_name ∈ tournament's venue.court_names; validate scheduled_at falls within tournament.day_start_time..day_end_time on at least one day; UPDATE match SET scheduled_court, scheduled_at; emit `match.scheduled` audit (or `match.rescheduled` if scheduled_at was non-null before). p_court_name + p_scheduled_at can be null to clear (`match.unscheduled` audit). |
| **B66** | **`auto_schedule_rpc(p_tournament_id, p_user_id, p_preserve_manual boolean default true)`.** Pipeline (single PG txn): AUTHZ; SELECT FOR UPDATE on tournament + all matches for tournament's draw + all blocked ranges; build inputs (matches grouped by round, courts available, durations from round_durations, blocked ranges); **greedy placement algorithm** in PL/pgSQL (~80 LOC) per spec §7.7: for each round in order (R1, R2, ..., final), for each match in that round: place at the earliest (court, time-slot) tuple where (a) that match's feeder matches (next_match_id chain reverse) end before this match starts, (b) court is not blocked, (c) preferably no player has a match ending at the previous slot (soft); if no slot available, leave unplaced and continue. UPDATE all placed matches in a single statement. Emit single `match.scheduled` audit with metadata.{matches_placed, matches_unplaced}. Return shape: (placed_count, unplaced_count, conflict_count). |
| **B67** | **`detect_schedule_conflicts_rpc(p_tournament_id)`.** Pure read-only RPC. Returns array of conflict objects: `[{type: 'player_double_book' | 'insufficient_gap' | 'bracket_dep' | 'court_blocked', match_id, severity: 'red'|'yellow'|'orange', detail jsonb}]`. Used by both server-rendered initial conflicts and client refresh after every drag. Cycle/depth-safe (no recursion needed — direct relational query). |
| **B68** | **`block_court_range_rpc(p_tournament_id, p_user_id, p_court_name, p_start, p_end, p_reason)`.** AUTHZ; validate court_name; INSERT court_blocked_range; emit `court.blocked` audit. Idempotent: if a range with same (court_name, start, end) exists, UPDATE the reason. Returns the row id. |
| **B69** | **`unblock_court_range_rpc(p_tournament_id, p_user_id, p_blocked_range_id)`.** AUTHZ; DELETE court_blocked_range; emit `court.unblocked` audit. |
| **B70** | **`set_round_durations_rpc(p_tournament_id, p_user_id, p_durations jsonb)`.** AUTHZ; validate each value is an integer in {15,30,45,60,75,90,105,120}; UPDATE tournament.round_durations; emit `tournament.updated` audit (existing v0.4 enum value). |
| **B71** | **Edge Functions (5 thin wrappers):** `update-match-schedule`, `auto-schedule`, `block-court-range`, `unblock-court-range`, `set-round-durations`. Each: JWT auth, body parse, supabase service-role client, invoke RPC, map errors → status (403/404/422/500), Sentry capture on 500s. Pattern matches v0.5 B43/B44 + v0.6 B60. |
| **B72** | **RLS regression tests + scheduling integration tests.** Coverage matrix: TO can write schedule on own tournament; non-TO admin can; non-TO non-admin cannot; spectator/anon can read scheduled_court/scheduled_at + court_blocked_range rows. Auto-schedule: 8-team bracket with 4 courts → all matches placed; 8-team with 1 court → schedule spans more time but all placed; 16-team with 2 courts spanning 2 days → multi-day overflow correct. Conflict detection: deliberately schedule 2 matches with same player at overlapping times → red conflict surfaced; deliberately schedule a SF before its QF → orange conflict. |
| **B73** | `types/database.ts` regenerated by deploy workflow. No manual gate. |

### Phase B — Web (matchday-web) — depends on Phase A types regen

| Commit | Description |
|---|---|
| **W67** | `bun run sync-types` post-Phase-A. Verify `CourtBlockedRange` type, new RPC names, `Tournament.round_durations` field present. **No new packages** (P3). |
| **W68** | **Schedule tab on organizer management hub** — `<ScheduleSection>` server component + `<ScheduleTab>` client component. Visible when tournament.status IN ('published', 'live'). Shows: round-duration config card (W69), grid (W70), unscheduled panel (W71). |
| **W69** | **Round-duration config card** — form with one row per round (R1, R2, ..., final, 3rd-place if applicable). Each row: dropdown (15/30/45/60/75/90/105/120 min). Submit invokes `set-round-durations` Edge Function. Disabled when tournament.status='completed'. |
| **W70** | **Court × time grid component** — Day-tabs at top (one per day). Per-day grid: rows=courts (from venue.court_names), columns=15-min slots between day_start_time and day_end_time. Each cell is a dnd-kit drop target. Match cards span their duration (matchFormat round_durations key). Drop fires `update-match-schedule` Edge Function with optimistic UI + reconciliation (mirror v0.5 W47 P-F03/P-F10 pattern). |
| **W71** | **Unscheduled matches panel** — sidebar (or bottom on narrow screens) showing match cards for matches with scheduled_court IS NULL. dnd-kit drag-source. Matches grouped by round. |
| **W72** | **Auto-schedule + Auto-schedule-remaining buttons** — two distinct buttons. Auto-schedule: confirm dialog; calls `auto-schedule` with `preserve_manual=false`. Auto-schedule-remaining: no confirm; calls `auto-schedule` with `preserve_manual=true`. Toast with "Placed N matches; M unplaced" outcome. |
| **W73** | **Court availability blocking UI** — click+drag on empty grid cells creates a blocked range; click on a blocked range opens a popover with reason input + "Unblock" button. Invokes `block-court-range` / `unblock-court-range` Edge Functions. |
| **W74** | **Conflict warnings** — server-fetch `detect_schedule_conflicts_rpc` on initial render; refresh after every drag completes. Render conflicts as colored borders on affected match cards (red/yellow/orange) + a summary banner at top of grid ("3 conflicts: 2 red, 1 yellow"). |
| **W75** | **Public bracket page schedule display** — extend v0.5 W46 / v0.6 W62 to surface scheduled_at + scheduled_court next to each match (when populated). For now read-only, no realtime — page-refresh per v0.5 D10 (v0.8 will add realtime). |
| **W76** | **Tournament detail page enhancement** — show "Day 1: 8 matches at 4 courts, 9:00-12:00" summary line per day on the public detail page (`/tournaments/[org-slug]/[t-slug]`). Computed server-side from match.scheduled_at array. |
| **W77** | **i18n keys for v0.7 surface** — `messages/en.json` + `messages/th.json` ([TH] placeholders). Namespaces: `organizer.tournaments.schedule.*`, `organizer.tournaments.schedule.errors.*`, `organizer.tournaments.schedule.conflicts.*`, `tournaments.detail.schedule_summary`. |
| **W78** | a11y + Sentry sweep. Manual a11y on Schedule tab (form labels, dnd-kit KeyboardSensor for drag-drop per v0.5 D13 carryover, error association). Sentry capture on every server action error path with `function: schedule.<X>` tags. Manual review documented. |

### Phase C — DoD verification + ship

| Commit | Description |
|---|---|
| **DoD1** | Per-feature ship matrix in `Plans/v07-dod-evidence.md`. |
| **DoD2** | E2E walkthrough by Pap: (a) sign in as TO with v0.6 published tournament with confirmed registrations; (b) open Schedule tab → see Round-Duration config card empty; (c) set R1=45min, QF=60min, SF=60min, Final=90min → save; (d) Auto-schedule clicked → confirm all 7 matches placed across N courts within day window; (e) drag a R1 match to a different court → confirm scheduled_court updated, no conflicts; (f) drag a R1 match to overlap with another player's R1 match → confirm RED conflict warning; (g) block Court 2 from 11:00-12:00 → confirm gray bar appears + auto-schedule respects it; (h) unblock → re-auto-schedule remaining → match placed; (i) deliberately drag a SF before its QF → confirm ORANGE bracket-dependency warning; (j) multi-day: 32-team with 4 courts spanning 2 days → confirm overflow to Day 2 correct; (k) try to drag a completed match → confirm rejected with `match_not_reschedulable`; (l) public bracket page (incognito) → confirm scheduled_court + scheduled_at surfaces correctly. |
| **DoD3** | Both CIs green on `main`. Auto-types-regen committed. |
| **DoD4** | Migrations applied to remote prod (B63 + B64). All v0.7 Edge Functions deployed. |
| **DoD5** | DECISIONS.md updated with v0.7 D1-D15 final answers. |
| **DoD6** | `Plans/version-roadmap.md` v0.7.0 header gets `Shipped` + ship date. |
| **DoD7** | `Plans/decisions.md` gets v0.7 ship entry. |
| **DoD8** | `padelthailand.com/matchday/` rebuilt + Pap-approved push. |

---

## 5 · Per-feature ship matrix

| Feature | Code-complete | Backend ready | E2E verified | Ship status |
|---------|---------------|---------------|--------------|-------------|
| Round-duration configuration | ⬜ | ⬜ B63 + B70 | ⬜ | Required |
| Court × time grid (15-min increments) | ⬜ | ⬜ W70 | ⬜ | Required (DoD anchor) |
| Court availability blocking | ⬜ | ⬜ B63 + B68 + B69 + W73 | ⬜ | Required |
| Multi-day support | ⬜ | ⬜ W70 | ⬜ | Required (DoD anchor) |
| Auto-schedule algorithm | ⬜ | ⬜ B66 | ⬜ | Required (DoD anchor) |
| Auto-schedule-remaining (preserve manual) | ⬜ | ⬜ B66 | ⬜ | Required |
| Manual drag-drop adjustments | ⬜ | ⬜ B65 + W70 | ⬜ | Required |
| Conflict detection (4 conflict types) | ⬜ | ⬜ B67 + W74 | ⬜ | Required |
| Bracket-dependency conflict warning | ⬜ | ⬜ B67 | ⬜ | Required (spec §7.6) |
| Player back-to-back avoidance (soft) | ⬜ | ⬜ B66 + B67 | ⬜ | Required (D6) |
| Public bracket schedule display | ⬜ | ⬜ W75 | ⬜ | Required |
| Reschedule-after-completion lock | ⬜ | ⬜ B65 (D15) | ⬜ | Required |

v0.7 ships when 12/12 are green AND DoD2's auto-schedule + multi-day + manual-drag + conflict paths verify end-to-end.

---

## 6 · Cross-cutting DoD (every version, per `version-roadmap.md`)

- **a11y** — Schedule tab grid is keyboard-accessible via dnd-kit KeyboardSensor (carry-over from v0.5 D13). Conflict warnings have role="alert" on first-render. axe-core verified clean. Manual review documented.
- **Observability** — Sentry capture on every server-action error path with `function: schedule.<name>` tags.
- **Audit log** — `match.scheduled` per manual drag; bulk on auto-schedule (per D11). `court.blocked` / `court.unblocked` on availability changes. `match.unscheduled` / `match.rescheduled` for clears + moves.
- **i18n** — every new user-visible string is an i18n key. TH bundles get [TH] placeholder strings (carried obligation from v0.1-v0.6 native-speaker review).
- **Privacy** — schedule data is public per spec; no PII in match.scheduled_court / scheduled_at. Court blocked-range `reason` text could leak operational info — bound to 200 chars + sanitized.

---

## 7 · Anti-criteria (locked)

- v0.7.0 must NOT ship realtime schedule updates (v0.8.0)
- v0.7.0 must NOT ship spectator-mode schedule view CSS (v0.8.0)
- v0.7.0 must NOT ship "My next match" card (v0.7.x or v0.9)
- v0.7.0 must NOT ship per-day `day_start_time`/`day_end_time` overrides (v0.7.x)
- v0.7.0 must NOT ship per-individual-match duration override (v0.7.x)
- v0.7.0 must NOT ship schedule export (CSV / PDF) — v0.9 polish
- v0.7.0 must NOT use a constraint solver — greedy only (D5)
- v0.7.0 must NOT modify v0.5/v0.6 frozen surfaces (Draw tab, Scores tab, public bracket route, draw RPCs, score RPCs) — only adds Schedule tab + reads/writes new schedule columns + court_blocked_range table
- v0.7.0 must NOT use a hand-rolled drag-drop — dnd-kit per matchday-web/CLAUDE.md (carry-over from v0.5)
- v0.7.0 must NOT ship without RLS + scheduling integration tests (B72)
- v0.7.0 must NOT depend on v0.6 unfinished Phase C — this plan executes against v0.6's `main`-state surface
- v0.7.0 must NOT push padelthailand.com/matchday/ without explicit Pap approval
- v0.7.0 must NOT silently accept invalid schedules in prod — every conflict raises a structured error
- v0.7.0 must NOT allow scheduling on tournament.status NOT IN ('published', 'live')
- v0.7.0 must NOT allow rescheduling a completed/retired/walkover match (D15 — `match_not_reschedulable` error)
- v0.7.0 must NOT permit auto-schedule to overwrite manual placements when called with `preserve_manual=true` (D14)
- v0.7.0 must NOT emit per-match-row audit on auto-schedule — single `match.scheduled` audit with `metadata.matches_placed` count (mirror of v0.5 A-A18 + v0.6 plan §7)
- v0.7.0 must NOT introduce new schema beyond the 1 column + 1 table + 1 view + 1 index + 5 enum values listed in B63
- **DRAFT v2 additions (post-stress-test):**
- v0.7.0 must NOT expose `court_blocked_range.reason` to anonymous spectators (A-A02) — anonymous SELECT goes through `court_blocked_range_public` view
- v0.7.0 `block_court_range_rpc` must NOT merge overlapping ranges (A-A07) — overlap = INSERT new row; UI handles "extend" via UNBLOCK + BLOCK
- v0.7.0 must NOT silently accept manual placements that violate bracket-order in `preserve_manual=true` mode (A-A09 / D18) — invalid manuals drop to unscheduled with surfaced count
- v0.7.0 must NOT permit a single match to overflow `day_end_time` on its scheduled day (A-A04 / A-A11) — B65 + B66 both validate `start + duration <= day_end_time`
- v0.7.0 must NOT schedule a 3rd-place match whose `team_a_id` or `team_b_id` is NULL (A-A01 / D16) — B66's loop skips matches present in DB, and 3rd-place is never INSERTed with NULL teams

---

## 8 · Risk register (DRAFT v1; pre-stress-test)

| # | Risk | Mitigation |
|---|------|------------|
| R1 | Auto-schedule greedy fails on dense schedules where a constraint solver would succeed | Surface "couldn't place N matches" outcome to TO; manual drag fills gaps. v2+ may add solver. |
| R2 | Player back-to-back as soft constraint produces "tournament from hell" UX where every player has back-to-back matches | D6 default = minimum 1 slot gap as soft preference; B66 prefers slots without back-to-back. Yellow warning surfaces when unavoidable. Verified in B72 test fixture with 4-team-2-court tight schedule. |
| R3 | Auto-schedule writes partial state if PG txn aborts mid-update | D3 single-txn UPDATE is atomic; observers see all-or-nothing. |
| R4 | Concurrent drag-drop — TO drags from two browser tabs simultaneously | B65 SELECT FOR UPDATE on match; second invocation blocks until first commits, sees latest, overwrites correctly. Same pattern as v0.5 B39. |
| R5 | court_blocked_range rows accumulate after tournament ends — no GC | Out of scope for v0.7. Rows are per-tournament with FK CASCADE on tournament delete; DB-side cleanup happens automatically. v1.0 polish may add a "clear blocked ranges" button if Pap requests. |
| R6 | Conflict detection RPC scans match table for player double-book → O(N²) on large brackets | B67 uses indexed query: matches grouped by tournament_id + scheduled_at range; player extraction via match→team→team_member join. Add covering index `(tournament_id, scheduled_at)` if needed (v0.7.x; not v0.7 default). |
| R7 | Bracket-dependency conflict false positive — match cascades may not be linear (3rd-place match) | B67 walks `next_match_id` chain reverse; 3rd-place match is a leaf (no `next_match_id`) and has no feeders by spec; verified in B72 test. |
| R8 | dnd-kit grid-cell drop targets re-render on every state change | W70 uses memoized cell components (React.memo). Grid is at most ~50 cols × ~10 rows = 500 cells; re-render budget tolerable. v0.7.x may add virtualization if Pap reports lag. |
| R9 | Multi-day grid crosses midnight — scheduled_at tz handling | All timestamps stored UTC; display in tournament's venue timezone (derived from venue.city — out of scope for v0.7; default to local browser tz). v0.7 default: assume tournament dates don't cross midnight. |
| R10 | Round-duration jsonb shape inconsistency — different tournaments use different keys | D1 sparse storage tolerates this; W69 generates the keys from the actual rounds in the draw at config time. No schema enforcement; client validates. |
| R11 | Auto-schedule Phase A length is moderate (~11 commits including helpers) | Each RPC is ~50-150 LOC. B66 (greedy algorithm) is the longest. Estimated 1-2 days of phase-A work. |
| R12 | Pap pushback on D5 (greedy vs constraint solver) | If Pap insists on optimal scheduling, v2+ revises. v0.7 default gets typical tournaments scheduled correctly. |
| R13 | Pap pushback on D8 (single window for multi-day) | If Pap wants per-day overrides, plan revises with a `tournament_day_window` table. Estimated +2 commits each phase. |
| R14 | Pap pushback on D15 (lock-after-completion) | If Pap wants to reschedule completed matches (e.g., for next-tournament reuse), plan revises B65 to allow with admin-only flag. v0.7.x patch. |
| R15 | RPC SECURITY DEFINER + auth.uid() masking — same v0.5/v0.6 pattern | Mirror of v0.5 B42 / v0.6 B52. Caller passes p_user_id from JWT-validated Edge Function; RPC re-validates AUTHZ. |
| R16 | Schedule cascade on v0.6 score-edit not implemented (D10) | Default scheduling is independent of scoring cascade. If Pap reports user-confusion, v0.7.x adds opt-in flag in v0.6 B57 to also clear scheduling on cascade. |
| R17 | round_durations key shape ambiguity — same row can be addressed by `"4"` (numeric) and `"final"` (sentinel) | `_resolve_round_duration(p_durations, p_round, p_max_round, p_match_type)` resolves with explicit precedence: third_place > final > round-number > default. UI generates correct keys from W69 form; clients never see raw jsonb. Tests in B72 cover the resolver. |
| R18 | Post-cascade stale-schedule (D17) — schedule survives v0.6 cascade reset of teams; matchup may have effectively changed | Best-effort heuristic deferred to v0.7.x. v0.7 default = schedule independent of teams; TO sees the new team identities on the grid card automatically. Document in DECISIONS.md as a known surface gap. |
| R26 | greedy auto-schedule complexity at 128-team brackets — O(R*M*C*S) ≈ 7*32*8*144 = 258k operations | Acceptable for typical Asia-Pac tournament sizes. v2+ may add constraint-solver mode for genuinely-hard schedules. Profiling deferred to first 64-team production run. |
| R27 | Auto-schedule + 3rd-place row only created post-SF — TO must auto-schedule again after the 2nd SF completes for the 3rd-place to land on the grid | Document explicitly in W74 toast: "3rd-place match will be auto-scheduled when both SFs are scored." This is a spec-implied surface gap, not a code defect. |
| R28 | greedy LOC estimate (D2 said ~80) was actually ~440 at code-write time | Plan amendment: update D2 to "~80-450 LOC". R11 estimated 1-2 days remains accurate for the SQL surface as written. |
| R29 | `update_match_schedule_rpc` and `auto_schedule_rpc` both validate against day_end_time but use different code paths | Same logic enforced in both, but duplication is a future-bug-risk. v0.7.x may extract `_validate_match_in_day_window` helper. Documented as obligation. |

---

## 9 · Approval gates

This plan requires explicit Pap approval before any scaffolding:

1. ⬜ Plan drafted (DRAFT v1) — *this document*
2. ⬜ Plan stress-tested by Plan + Architect review lenses (DRAFT v2)
3. ⬜ Pap reviews; D1-D15 answered
4. ⬜ Phase A (B63-B73) executed
5. ⬜ Phase B (W67-W78) executed
6. ⬜ Phase C DoD walkthrough by Pap

---

*End of v0.7.0 build plan DRAFT v2.*

---

## Change log — DRAFT v1 → DRAFT v2 (2026-04-29)

Stress-test by Architect review lens (autonomous agent run, ~10 min) surfaced 22 actionable findings against `Plans/v07-build-plan.md` DRAFT v1 + the in-flight v0.7 migrations. **5 critical applied as code patches; 12 important addressed (7 code, 5 plan-only); 5 nits accepted-with-rationale.** Density mirrors v0.6 DRAFT v2 (21 findings).

**Critical (5) — applied as code patches:**
- **A-A01: 3rd-place placeholder concern.** Investigation showed v0.6 B52/B53/B54 only INSERTs the 3rd-place row when both losers are known — the NULL-teams case the agent flagged is structurally impossible. New D16 documents the actual semantics; B66's loop naturally skips not-yet-existing 3rd-place rows.
- **A-A02: court_blocked_range.reason public-leak.** RLS split applied to B63: base-table SELECT requires TO/admin; new `court_blocked_range_public` view projects everything except `reason` for anonymous spectators. Plan §0 schema enumeration updated. New anti-criterion.
- **A-A03: D3 vs D14 contradiction.** Implemented option 2 (preserve_manual=true skips already-placed matches without DELETE-all-first); plan now explicitly commits.
- **A-A04: B65 multi-day window without duration check.** Pre-fix B65 only validated `start_time` within `[day_start, day_end]`. Now: derives duration via `_resolve_round_duration`, requires `start + duration <= day_end_time` on the chosen day. Same logic mirrored in B66 greedy. New error code `scheduled_at_out_of_window` added to `_shared/schedule-rpc-errors.ts`.
- **A-A05: D10 stale-post-cascade.** Heuristic warning deferred to v0.7.x per agent's lighter-fix recommendation. New D17 documents.

**Important (12) — 7 code, 5 plan-only:**
- **A-A06: round_durations key shape.** Plan commits to mixed shape (numeric + sentinels). `_resolve_round_duration` helper resolves precedence: third_place > final > numeric > default 60. R17 added.
- **A-A07: block_court_range overlap merge.** B68 already idempotent on EXACT bounds (no merge). Plan documents the anti-merge invariant + new anti-criterion. UI handles "extend" via UNBLOCK + BLOCK.
- **A-A08: error i18n keys missing.** New `_shared/schedule-rpc-errors.ts` (sister of v0.6's `match-rpc-errors.ts`); all 5 v0.7 EFs use it. W77 description updated to enumerate v0.7 codes.
- **A-A09: preserve_manual + invalid manual.** B66 validates each preserved placement against bracket-order; invalid manuals drop to unscheduled with surfaced `dropped_invalid_manual_count`. New D18.
- **A-A10: B67 covering index.** `idx_match_tournament_scheduled` partial index added to B63 — promoted from "v0.7.x deferred" to v0.7 default per agent recommendation. R6 updated.
- **A-A11: multi-day overflow.** B66 greedy already enforces `slot_minutes + dur_min <= day_window_minutes` (same A-A04 pattern). Documented.
- **A-A12: rain-delay matrix.** Documentation only — D15 rejects all completed/retired/walkover; live + in_progress remain reschedulable for the rain-delay use case.
- **A-A13: B66 audit idempotency.** Skip audit emit when `placed=0 AND unplaced=0 AND dropped_invalid=0`. Test added in B72.
- **A-A14: button label clarification.** UI concern only — W72 label is "Auto-schedule remaining" (default, no confirm) vs "Re-auto-schedule all" (with confirm). Documentation.
- **A-A15: 5 missing test scenarios.** B72 covers D15 lock, multi-day overflow, block overlap, conflict types, AUTHZ. Tests written.
- **A-A16: created_by FK ON DELETE.** B63 already has `ON DELETE SET NULL` for `created_by`. Documented for completeness.
- **P-F01: "My next match" v0.7 vs v0.7.x.** Roadmap drift — v0.6 plan §82 said "→ v0.7"; v0.7 plan §67 deferred. Plan amendment: keep v0.7.x deferral; update `Plans/version-roadmap.md` to match (out of v0.7 scope).

**Nits (5) — accepted-with-rationale:**
- A-N01: B66 LOC estimate. Updated R28 to "~80-450 LOC".
- A-N02: greedy iteration ordering. B66 orders by `round ASC, position ASC, match_type ASC` — deterministic.
- A-N03: client debounce on conflict-detection refresh. Phase B (W74) concern.
- A-N04: migration filename forward-dating. Convention; accepted.
- A-N05: dnd-kit reconciliation pattern. Phase B (W70) concern.

**3 net-new D-decisions (D16-D18)** added to §1; **5 new anti-criteria** added to §7; **4 new risks (R17, R18, R26, R27)** added to §8; **plan §0 schema enumeration expanded** to include the view + partial index. **Net commit additions:** 0 new migrations / 0 new EFs / 1 new shared TypeScript helper (`_shared/schedule-rpc-errors.ts`) / 9 new test cases in B72.

*End of change log.*
