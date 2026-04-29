# Matchday v0.6.0 — "Live Scoring" Build Plan

> **Status:** DRAFT v2 — stress-tested by Architect review lens 2026-04-29. **21 findings applied** (5 critical, 11 important, 5 nits). 5 net-new D-decisions surfaced (D16-D20). DRAFT v1 → DRAFT v2 change-log appended.
> **Predecessor:** v0.5.0 "Draw Engine + Public Bracket" — `Shipped 2026-04-28` (Phase A B36-B47 + Phase B W45-W54). v0.6.0 is executable independently of v0.5 ship-status because v0.5 is on `main`.
> **DoD:** A mock 8-team tournament is scored end-to-end with bracket cascade, retirement, and score-edit cascading-undo all passing E2E tests.
> **External-prereq risk:** Low. v0.6 has no new Pap-prereqs beyond what v0.4 already requires (Resend activation; otherwise dev-fallback console-logs the send for the new `placements_published` template — but per D10 v0.6 emits NO routine score-update emails). No new third-party SaaS, no new OAuth providers, no new infra.

---

## 0 · What v0.6 inherits from v0.5 (so what's NOT in this plan)

v0.5 shipped a **forward-loaded match table** and **forward-loaded audit enum** specifically so v0.6 has zero schema migrations. This plan therefore opens with what's already on `main`:

| Surface | v0.5 status | v0.6 obligation |
|---|---|---|
| `public.match` table — full canonical column shape | ✅ shipped (B37 — `set1_a`, `set1_b`, `set2_a`, `set2_b`, `set3_a`, `set3_b`, `winner_team_id`, `retired_team_id`, `scored_at`, `scored_by`, `rating_delta_json`, `scheduled_court`, `scheduled_at` all nullable) | **No ALTER.** v0.6 just starts WRITING the v0.6 columns. |
| `public.match_status` enum — `bye`, `upcoming`, `in_progress`, `completed`, `retired`, `walkover` | ✅ shipped (B37) | **No ALTER TYPE.** v0.6 starts writing values beyond `bye`/`upcoming`. |
| `public.tournament_status` — `draft`, `registration_open`, `registration_closed`, `published`, `live`, `completed`, `cancelled` | ✅ shipped (v0.3 B7) | v0.6 writes `live` (first-match-scored) + `completed` (last-match-scored). |
| `public.audit_action` enum — `match.started`, `match.scored`, `match.score_edited`, `match.walkover`, `match.walkover_undone`, `match.retired`, `tournament.started`, `tournament.completed` | ✅ shipped (v0.4 B22 typed-FK migration mirrored canonical enum verbatim) | **No ALTER TYPE.** v0.6 emitters write these existing values. |
| `next_match_id` + `next_match_slot` columns + `_seed_order_for_size()` helper + bye-path bye-receiver pre-fill | ✅ shipped (B41) | v0.6's cascade just walks `next_match_id` — the half of cascade for bye matches is already done. |
| `tournament.match_format` (`best_of_1`/`best_of_3`) + `tournament.last_set_rule` (`full_set`/`tiebreak`/`super_tiebreak`) | ✅ shipped (v0.3 B7) | v0.6 score-validation RPC reads these to pick the right validator. |
| `tournament.has_third_place_match boolean` | ✅ shipped (v0.3 B7) | v0.6 cascade auto-creates the 3rd-place match row when 2nd SF completes (if true). |

**Net schema migrations in v0.6 Phase A: ONE** — an idempotent assert-only migration (B49 mirror of v0.5 B38) that re-adds-if-missing the v0.6 audit_action values and raises if any are absent. Self-healing for partial-state DBs; no-op on fresh DB.

---

## 1 · D-decisions (DRAFT v1 defaults; Pap review pending)

| # | Decision | Default | Rationale |
|---|----------|---------|-----------|
| **D1** | Score-validation location | **Postgres PL/pgSQL inside the RPC** | Mirror of v0.5 D4. Single source of truth; server-side enforcement; deterministic; testable in SQL. Padel set rules are simple enough that PL/pgSQL is the right grain (vs Edge Function TS validation which would need to be re-validated server-side anyway). |
| **D2** | Cascade implementation shape | **Iterative `LOOP` in PL/pgSQL with explicit `next_match_id` walk** | Recursive CTE works but is harder to read for a flow that mutates as it walks. Iterative loop with explicit cycle guard (visit set) is the canonical bracket-walk pattern; matches spec §2 "Score Editing with Cascading Undo" exactly. |
| **D3** | Score-edit cascade trigger | **Only when `winner_team_id` changes** | Per spec §2: "When a TO edits a score and the winner does NOT change: simple update, audit-logged. When the winner CHANGES: cascading reset of downstream matches." Save same-winner edits with a `match.score_edited` audit row + no cascade. |
| **D4** | Score-edit RPC separation | **Separate `edit_match_score_rpc` from `enter_match_score_rpc`** | Keeps the happy-path enter RPC simple (no cycle guard, no cascade). Edit RPC adds the cascade walk. Both share a `_validate_match_score()` helper. |
| **D5** | Walkover entry mechanism | **TO selects which team walked over via `walkover_team_id` arg** | Mirrors retirement's `retired_team_id` pattern. Opponent auto-advances. Walkover sets `match.status='walkover'` + `winner_team_id` = the non-walking team. Score columns left null. |
| **D6** | Walkover undo | **Separate `undo_walkover_rpc`, mirrors `undo_match_score_rpc` cascade** | Spec §2 has a dedicated "Walkover Undo" subsection — symmetric with score undo. Both RPCs share the same cycle-walk helper. |
| **D7** | 3rd-place match auto-creation | **Auto-create when 2nd SF completes IF `tournament.has_third_place_match=true`** | Per spec §2 "3rd-Place Match" + canonical schema reserves `match_type='third_place'`. 2nd SF completion is the trigger event — at that moment both losers are known and the 3rd-place match row INSERTs with both teams seeded. Cascade RPC carries this branch. |
| **D8** | Tournament completion auto-detect | **Auto-detect on the cascade-write of the final** | When the cascade writes the FINAL match's `winner_team_id` (i.e. the cascade is invoked but the current match has no `next_match_id`), check if there's a pending 3rd-place match; if not (or also done), set `tournament.status='completed'` + `tournament.completed_at=now()` + emit `tournament.completed` audit. |
| **D9** | Tournament `live` transition | **First match transitions to `in_progress` OR `completed`** (whichever fires first) | Idempotent: every score-entry RPC checks if `tournament.status='published'` and if so flips to `'live'`. Single audit row `tournament.started` per tournament (idempotent guard via `tournament.started_at IS NULL`). |
| **D10** | Email on match scored | **NO routine score-update emails in v0.6** | Per `Plans/version-roadmap.md` v0.9 owns "placements + email template inventory complete". Score updates are read via the public bracket page (v0.5) + Realtime channel (v0.8). v0.6 reserves no new email templates. |
| **D11** | Set order requirement | **No ordering constraint — all sets submitted together; validator enforces logical consistency** | Spec §5.5 "Match-Level Validation" lists rules that can only be enforced if all sets are visible at once. Score-entry RPC validates the full set tuple; partial entries are TO-side UI state (no DB persistence until submit). |
| **D12** | Score-entry surface | **New "Scores" tab on the organizer management hub** | Separates concerns: Draw tab (v0.5) is for pre-publish seeding; Scores tab is for post-publish entry. Tab visible only when `tournament.status IN ('published', 'live')`. Per spec §5.7 "Score Entry UI". |
| **D13** | Score-entry UI shape | **Match list (one row per match) with inline expand-to-edit** + bracket-click as secondary entry path | Match list is the fast-entry surface for TOs running the day-of operation. Bracket-click on the @g-loot bracket as a discovery path for "score this specific match next" is a stretch goal — defer to v0.6.x patch if not landed in W#. |
| **D14** | Public bracket score display | **Live as scores write — page-refresh-driven** | Mirrors v0.5 D10 (no ISR; pure server-render). v0.8 adds Realtime; v0.6 ships page-refresh. |
| **D15** | `match.status='in_progress'` transition | **Auto-set when first score field saved (i.e. on first call to enter-match-score RPC)** | TOs shouldn't have to click "Start match". Idempotent: subsequent score writes don't re-flip. Mirrors v0.5's draft-draw auto-create pattern. |
| **D16** | Final-edit / 3rd-place-edit revert semantics (post-stress-test A-A06) | **Do NOT revert tournament.completed → live when winner-change edit affects no downstream (cascade_count=0)** | Reverting on a final-only edit produces a confusing "completed → live → completed" flap for what is semantically a single-row metadata update. The bracket is still terminal in every match. B56 gates the revert on `v_cascade_count > 0`. |
| **D17** | Edit-RPC source-status restriction (post-stress-test A-A05) | **`edit_match_score_rpc` accepts ONLY `'completed'` and `'retired'` source statuses** | Walkover-source matches must be undone via `undo_walkover_rpc` first (which emits the canonical `match.walkover_undone` audit). Allowing direct edit would silently launder a walkover as a played match with no walkover-undone audit trail. |
| **D18** | 3rd-place row DELETE-vs-RESET on SF undo (post-stress-test A-A07) | **DELETE the 3rd-place row when teams populated and status='upcoming'; RESET when scored** | Auto-create re-fires on SF re-score, so the deleted row is recreated with the correct losers. Edge Function surfaces `deleted_third_place_id` so web client can drop stale cache. |
| **D19** | Score-entry on partial-team match (post-stress-test A-A01) | **Reject with `match_team_not_resolved` (P0001 / 422) when team_a_id OR team_b_id is NULL** | Pre-fix B52/B53/B54 only validated the WINNER side. A match where the cascade had populated team_a but not team_b would happily accept a score with team_a winning, marking the match completed against a phantom opponent. All three RPCs now guard early on either side missing. |
| **D20** | Score-order independence guard (post-stress-test A-A03) | **No upstream-dependency check; team_a/team_b NULL is the only signal** | The cascade structurally populates upstream winners in next_match slots. Relying on team_a/team_b non-null (D19) is the canonical guard for "this match is ready to score". Out-of-order is allowed by design (e.g. score the final after both SFs even if the 3rd-place hasn't fired). |

---

## 2 · Scope

In-scope (per `Plans/version-roadmap.md` v0.6.0 + `matchday-v1-detailed-specs.md` §2 Match Lifecycle + §5 Scoring + §2 Score Editing):

1. **Per-set score entry** — best-of-1 / best-of-3 governed by `tournament.match_format`. Validates per `tournament.last_set_rule` for the deciding set.
2. **Standard set + tiebreak + super-tiebreak validation** — PL/pgSQL functions matching spec §5.2 / §5.3 / §5.4 exactly.
3. **Match winner derivation** — auto-computed from set scores per spec §5.5.
4. **Match status transitions** — `upcoming` → `in_progress` (D15 first-score) → `completed` (final score) | `retired` | `walkover`.
5. **Retirement** — partial scores allowed + opponent wins + advances. Score validation **relaxed** for retired matches (spec §5.6).
6. **Walkover** — TO marks which team walked over; opponent advances; score columns left null.
7. **Bracket cascade on match completion** — populate `match.team_<slot>_id` of `next_match_id` from `winner_team_id` per spec §2 "Bracket Cascade".
8. **3rd-place match auto-creation** — when 2nd SF completes and `tournament.has_third_place_match=true`, INSERT the 3rd-place match row with both losers (D7).
9. **Tournament `live` transition** — first match-status mutation → `tournament.status='live'` (idempotent, D9).
10. **Tournament `completed` transition** — final match (and 3rd-place if any) completed → `tournament.status='completed'` + audit (D8).
11. **Score-edit with cascading undo** — per spec §2 "Score Editing with Cascading Undo". Same-winner edit = simple update. Winner-change edit = cascade reset downstream + replace winner in next slot.
12. **Walkover undo** — mirror of score undo (D6).
13. **Cross-cutting DoD** — a11y on Scores tab; Sentry on every server action; audit log emitters; i18n for all new strings.

Out-of-scope (defer per roadmap):

- Match scheduling — `scheduled_court`, `scheduled_at` writes + court×time grid UI → v0.7
- Auto-schedule algorithm → v0.7
- Realtime bracket updates (Supabase channel `tournament:{id}:bracket`) → v0.8
- Spectator mode active CSS (`?spectator=true` reserved in v0.5 D12) → v0.8
- Placements auto-derive (1st/2nd/optional 3rd) → v0.9 (v0.6 only auto-CREATES the 3rd-place match row; placement derivation lives in v0.9)
- Manual placement override → v0.9
- "My next match" card → v0.7 (ISC-58, 59)
- Routine score-update emails → never (D10 — v0.9 owns the next email template surface)
- Tournament `published → registration_open` reverse-transition (carried obligation from v0.5 A-A14) → defer to v0.6.x patch IF Pap requests; not in v0.6 default scope
- Draw unpublish (carried obligation from v0.5 D6) → defer to v0.6.x patch IF Pap requests; not in v0.6 default scope. **NOTE:** v0.6's score-edit cascade RPCs DO clear scores from downstream completed matches, but they do not unpublish the parent draw. The "scores wiped on regenerate" forward-looking risk from v0.5 R23 surfaces IF Pap later requests draw-unpublish — at which point we add the explicit "all match scores will be cleared" warning.
- Double-elim format → v2+
- Rating-delta computation (`match.rating_delta_json`) → v3 (external rating provider integration)

---

## 3 · External Prerequisites — gate questions for Pap

### Real-world account/process work

| # | Prereq | Risk | Required for | Action |
|---|--------|------|--------------|--------|
| P1 | **Resend account activation** | Carried from v0.2/v0.3/v0.4/v0.5 — same blocker | Not blocking v0.6 because D10 emits no routine score emails | No new action — covered. |
| P2 | **`SUPABASE_ACCESS_TOKEN` repo secret** | Already set during v0.3 | Auto-types regen + prod migration push | No new action. |
| P3 | **No new packages** | None | Phase B Scores tab UI re-uses v0.5's `@g-loot/react-tournament-brackets` (bracket-click entry path D13) + standard shadcn/ui Form components. dnd-kit NOT needed (no drag-drop in v0.6). | None. |

### Decisions needed from Pap (asked one at a time at the gate; all 15 D-decisions above are **defaults** awaiting Pap sign-off)

The 15 D-decisions in §1 are surfaced as PR-style defaults. Gate question per decision: "accept default, or override?" Recommended order — D7, D8 (3rd-place + tournament completion auto-detect — these have visible business semantics), then D11, D12, D13 (UX shape), then D1-D6 + D9-D10 + D14-D15 (mostly engineering-internal).

---

## 4 · Phased commit plan

Continuing the commit-numbered convention. v0.5 backend ended at B47; v0.6 starts at **B48**. v0.5 web ended at W54; v0.6 web starts at **W55**.

Sequencing: Phase A backend (B48-B62) → Phase B web (W55-W66) → Phase C DoD ship.

### Phase A — Backend RPCs + Edge Functions + tests (matchday-backend) — gates Phase B

| Commit | Description |
|---|---|
| **B48** | **No-op marker.** v0.6 has no schema migrations for the match shape — v0.5 B37 forward-loaded all columns nullable. Document this in the migration directory README (or skip the commit and let B49 carry the version-anchor responsibility). **DRAFT v1 default: skip — B49 is the version-anchor.** |
| **B49** | **audit_action v0.6 completeness assert.** Idempotent guard migration mirror of v0.5 B38. ALTER TYPE … ADD VALUE IF NOT EXISTS for: `match.started`, `match.scored`, `match.score_edited`, `match.walkover`, `match.walkover_undone`, `match.retired`, `tournament.started`, `tournament.completed`. Then DO block validates all 8 are present in `enum_range(null::audit_action)`; raises if any missing. Self-healing for partial-state DBs; no-op on fresh DB (v0.4 B22 already loaded these). |
| **B50** | **`_validate_set_score()` helper function.** PL/pgSQL `IMMUTABLE` helper. Args: `(p_winner_score int, p_loser_score int, p_set_kind text)` where `p_set_kind ∈ ('standard', 'tiebreak', 'super_tiebreak')`. Returns boolean. Implements spec §5.2 / §5.3 / §5.4 exactly. Used by B51 + B53. Test: parametric tests in B61 covering every valid + invalid pair. |
| **B51** | **`_compute_match_winner()` helper function.** PL/pgSQL `IMMUTABLE`. Args: `(p_set1_a, p_set1_b, p_set2_a, p_set2_b, p_set3_a, p_set3_b, p_match_format, p_last_set_rule)` (each int / nullable; format + rule as enum text). Returns `(winner int /* 1=team_a, 2=team_b, null=invalid */, error_code text)`. Implements spec §5.5 match-level validation: Best-of-3 → 2 or 3 sets; same team won both OR sets split with valid set 3; Best-of-1 → 1 set per last_set_rule. Calls B50 on each set. |
| **B52** | **`enter_match_score_rpc(p_match_id, p_user_id, p_set1_a, p_set1_b, p_set2_a, p_set2_b, p_set3_a default null, p_set3_b default null)`.** Pipeline (single PG txn): (1) AUTHZ — caller is tournament organizer OR admin (mirror of B42 inline pattern); (2) SELECT FOR UPDATE on match + on parent tournament; (3) status guard: match.status IN ('upcoming', 'in_progress'); reject if 'completed', 'retired', 'walkover' (use `edit_match_score_rpc` for those); (3a) **D19 / A-A01 fix:** match.team_a_id AND team_b_id MUST be non-null — else raise `match_team_not_resolved`; (4) read tournament.match_format + last_set_rule; (5) call B51 `_compute_match_winner()` — raise `invalid_score` (P0001) with the helper's error_code if validation fails; (6) UPDATE match SET set1_a/b, set2_a/b, set3_a/b, winner_team_id (resolved from winner team-side), status='completed', scored_at=now(), scored_by=p_user_id; (7) D9 — IF tournament.status='published' AND tournament.started_at IS NULL, UPDATE tournament SET status='live', started_at=now(), emit `tournament.started` audit; (8) D2 — call internal `_cascade_winner(p_match_id)` to populate next_match.team_<slot>_id; (9) D7 — IF this match was a SF (round = final_round - 1) AND there's another **completed/retired/walkover** SF for this draw (**A-A04 fix** — was previously `status='completed'` only) AND tournament.has_third_place_match, INSERT the 3rd-place match row with both losers; (10) D8 / **A-A03 fix** — IF cascade landed on the FINAL (no `next_match_id`), gate completion on whether the just-scored leaf is the final (require 3rd-place row to exist AND be terminal) vs the 3rd-place leaf (require the final to be terminal). The previous `bool_and(...) FROM match WHERE (third_place OR final)` returned TRUE on the final alone if the 3rd-place row hadn't been INSERTed yet (out-of-order play); (11) emit `match.scored` audit. Returns affected match-row count + tournament status. |
| **B53** | **`retire_match_rpc(p_match_id, p_user_id, p_retired_team_id, p_set1_a, p_set1_b, p_set2_a default null, p_set2_b default null, p_set3_a default null, p_set3_b default null)`.** Pipeline mirrors B52 except: (a) retired_team_id arg required + must equal team_a_id or team_b_id of the match; (b) score validation **relaxed** per spec §5.6 — any non-negative int values accepted; (c) winner_team_id auto-set to the non-retiring team; (d) match.status='retired'; (e) cascade fires same as B52; (f) emit `match.retired` audit. **D19 / A-A01 + D8 / A-A03 fixes apply identically** to B53. |
| **B54** | **`walkover_match_rpc(p_match_id, p_user_id, p_walkover_team_id)`.** Pipeline: AUTHZ + SELECT FOR UPDATE on match + tournament; status guard match.status IN ('upcoming', 'in_progress'); **D19 / A-A01 fix:** match.team_a_id AND team_b_id MUST be non-null; validate p_walkover_team_id ∈ {team_a_id, team_b_id}; UPDATE match SET status='walkover', winner_team_id=non-walking team, scored_at=now(), scored_by=p_user_id; tournament.live transition (D9); cascade to next_match (D2); 3rd-place auto-create (D7); tournament.completed transition (D8 / **A-A03 fix**); emit `match.walkover` audit. Score columns left null. |
| **B55** | **`_cascade_winner(p_match_id)` internal PL/pgSQL function** (NOT exposed as RPC; used by B52/B53/B54/B57/B58). Pipeline: SELECT match's `next_match_id` + `next_match_slot` + `winner_team_id`; if `next_match_id IS NULL` → return (this is the final). Else UPDATE next_match SET team_a_id (or team_b_id per slot) = winner_team_id. **No recursion** — single one-step hop. The downstream match remains 'upcoming' until TO scores it. Spec §2 "Bracket Cascade" step 4: "If next_match now has both teams → status remains upcoming". |
| **B56** | **`edit_match_score_rpc(p_match_id, p_user_id, p_set1_a, p_set1_b, p_set2_a, p_set2_b, p_set3_a default null, p_set3_b default null)`.** Pipeline (single PG txn): (1) AUTHZ; (2) SELECT FOR UPDATE on match; (3) **D17 / A-A05 fix** — status guard: match.status IN ('completed', 'retired') ONLY. Walkover-source matches must be undone via undo_walkover_rpc first (which emits the canonical match.walkover_undone audit); (4) read prior winner_team_id; (5) re-run B51 `_compute_match_winner()` — raise `invalid_score` if invalid; (6) UPDATE match scoring columns + status='completed' + scored_at=now() + scored_by=p_user_id; (7) IF prior_winner_team_id == new_winner_team_id → emit `match.score_edited` audit (no cascade) + RETURN; (8) IF winner CHANGED → call `_cascade_undo_then_replace(p_match_id, prior_winner_team_id, new_winner_team_id)`; (8a) **D16 / A-A06 fix** — revert tournament 'completed' → 'live' ONLY when `cascade_count > 0`; final-only edits don't propagate, so the bracket is still terminal everywhere; (9) emit `match.score_edited` audit with metadata.cascade_count + metadata.tournament_reverted. **D3 — same-winner edits are simple updates; winner-change edits trigger cascade.** |
| **B57** | **`_cascade_undo_then_replace(p_match_id, p_prior_winner_team_id, p_new_winner_team_id)` internal PL/pgSQL function.** Pipeline (per spec §2 "Score Editing with Cascading Undo"): (1) FIND next_match_id of p_match_id; (2) IF NULL → no downstream — replace this match's parent slot only doesn't apply (this IS the final). Just check tournament.completed re-evaluation (D8 reverse). RETURN. (3) Look at next_match (call it Y). IF Y.status='upcoming' AND Y.winner_team_id IS NULL → swap Y.team_<slot>_id from prior_winner to new_winner; RETURN (cascade ends). (4) ELSE Y was scored — RESET Y: status='upcoming', set scores null, winner_team_id null, retired_team_id null, scored_at null, scored_by null. (5) Recurse: walk Y's downstream — find Y's next_match Z, remove Y's old winner from Z's slot if present (Y's old winner is no longer guaranteed to advance). Repeat until hitting an upcoming match OR the final. (6) AFTER cascade-reset complete: write new_winner_team_id into Y's slot. (7) IF tournament.status='completed' AND any cascade-reset matches in the chain → flip tournament.status='live' + completed_at=null. **Cycle guard:** maintain a visited-set of match_ids; raise `cascade_cycle_detected` (P0001) if a match repeats. Bracket trees are acyclic by construction; the guard exists only as a safety net. |
| **B58** | **`undo_match_score_rpc(p_match_id, p_user_id)`.** Pipeline: AUTHZ; SELECT FOR UPDATE on match; status guard match.status IN ('completed', 'retired') (B59 handles walkover); use `_cascade_undo_then_replace(p_match_id, prior_winner, NULL)` semantically — i.e. clear the match completely AND propagate. Reset match.status='upcoming', clear scores, clear winner. Cascade downstream same as B57. **D18 / A-A07 fix** — when this match was an SF whose loser was in a 3rd-place row, DELETE the 3rd-place row (if status='upcoming') OR reset its scores (if terminal). Surface `deleted_third_place_id` in return shape so caller can drop stale client cache. Emit `match.score_edited` (with metadata.undo=true + metadata.deleted_third_place_id) audit. |
| **B59** | **`undo_walkover_rpc(p_match_id, p_user_id)`.** Pipeline mirrors B58 except: precondition match.status='walkover'; emit `match.walkover_undone` audit. **D18 / A-A07** applies identically. |
| **B60** | **Edge Functions (4 thin wrappers)** — `enter-match-score`, `retire-match`, `walkover-match`, `edit-match-score` (with `mode='undo'` body flag for B58/B59 paths). Each: JWT auth, body parse, supabase service-role client, invoke RPC, map errors → status codes (403 forbidden, 404 not_found, 422 invalid_score / cannot_score_completed_match / etc.), Sentry capture on 500s, return RPC result. Pattern matches v0.5 B43/B44 verbatim. |
| **B61** | **RLS regression tests + score-validation parametric tests.** `supabase/tests/rls/` — TO can write match scores on own tournament; non-TO admin can; non-TO non-admin cannot; spectator can read but not write. Score-validation: parametric matrix from spec §5.2 / §5.3 / §5.4 (every valid + invalid pair). Cascade integration: 4-team bracket, score QF1 → SF1 has team_a populated; score QF2 → SF1 has team_b populated; score SF1 → final has team_a populated; score SF1+SF2 with `has_third_place_match=true` → 3rd-place row INSERTed with both losers; score final → tournament.status='completed' (after 3rd-place if any). Cascade-undo: 8-team bracket scored to completion → edit QF1 winner → SF1 cleared, F cleared, tournament back to live. |
| **B62** | `types/database.ts` regenerated by deploy workflow's auto-step. No manual gate. |

### Phase B — Web (matchday-web) — depends on Phase A types regen

| Commit | Description |
|---|---|
| **W55** | `bun run sync-types` post-Phase-A. Verify new RPCs (`enter_match_score_rpc`, etc.) present + match scoring column types. **No new packages** (P3). |
| **W56** | **Scores tab on organizer management hub** — new tab on `/organizer/tournaments/[org-slug]/[t-slug]`. Tab visible only when `tournament.status IN ('published', 'live')`. Shows match list grouped by round (or by status: upcoming/in_progress/completed) with one row per match. Each row: round + position + team A vs team B + status pill + (if completed) score summary "6-4, 3-6, 10-8" + Edit / Retire / Walkover buttons. |
| **W57** | **Score-entry form** — inline expand on match-list row. Per spec §5.7 UI: 3 set-score input pairs (set 3 conditionally rendered when sets 1-2 split); running summary text ("Team A leads 1-0"); auto-computed winner display; Submit / Retired ▼ / Walkover ▼ buttons. Submit invokes `enter-match-score` Edge Function. Validation runs server-side; errors surfaced inline. |
| **W58** | **Retire dialog** — opens from "Retired ▼" dropdown. Asks: which team retired? + partial-score input (same form as W57 but score validation relaxed). Invokes `retire-match` Edge Function. |
| **W59** | **Walkover dialog** — opens from "Walkover ▼" dropdown. Asks: which team walked over? Confirms. Invokes `walkover-match` Edge Function. |
| **W60** | **Edit-score path** — Edit button on completed match row → opens W57 form pre-populated with current scores. Submit invokes `edit-match-score` Edge Function. **Cascade-impact preview:** if changing the winner, show inline warning "This will reset N downstream matches" (computed client-side via bracket walk based on whether downstream match.status IN completed/retired/walkover). |
| **W61** | **Undo-score / undo-walkover path** — exposed as a small "Undo" link on completed/retired/walkover match rows (TO-only). Confirm dialog with cascade-impact preview. Invokes `edit-match-score` Edge Function with `mode='undo'`. |
| **W62** | **Public bracket page score display update** — extend v0.5 W46 bracket route to show set scores per match per spec §5.7 UI. The `@g-loot/react-tournament-brackets` library accepts a `score` field on each participant; map from match.set*_team_*. Bye / retired / walkover badges per match status. **No realtime** — page-refresh per D14 (v0.8 scope). |
| **W63** | **Tournament status pill update on management hub** — extend v0.5 W50 to include `live` (orange) and `completed` (purple) variants. |
| **W64** | **Match-list filtering** — Scores tab adds simple filter chips: "All" / "Upcoming" / "Completed". Helps TOs running multi-round events. |
| **W65** | **i18n keys for v0.6 surface** — `messages/en.json` (TH bundle gets placeholder TH per carried v0.9 review obligation). Namespaces: `organizer.tournaments.scores.*`, `organizer.tournaments.scores.errors.*`, `tournaments.bracket.match.*` (set scores, retired, walkover badges). |
| **W66** | a11y + Sentry sweep. Manual a11y on Scores tab (form labels, error association, screen-reader running summary). Sentry capture on every server action error path with `function: match.<X>` tags. Manual review documented in DECISIONS.md. |

### Phase C — DoD verification + ship

| Commit | Description |
|---|---|
| **DoD1** | Per-feature ship matrix recorded in `Plans/v06-dod-evidence.md`. |
| **DoD2** | E2E walkthrough by Pap (Pap-action): (a) seed an 8-team bracket from a published v0.5 tournament; (b) score QF1 (6-4, 6-3) → confirm SF1 team_a populated, match.status='completed', tournament.status flipped 'published' → 'live', tournament.started_at written, audit `match.scored` + `tournament.started` rows present; (c) score QF2 (6-2, 7-5) → SF1 team_b populated; (d) score QF3 + QF4 → SF2 populated; (e) score SF1 + SF2; if `has_third_place_match=true` confirm 3rd-place row INSERTed with both losers; (f) score final + 3rd-place → tournament.status='completed', tournament.completed_at written, `tournament.completed` audit; (g) edit QF1 with same winner (e.g. 6-4, 6-3 → 6-4, 6-2) → confirm SF1 unchanged, only `match.score_edited` audit; (h) edit QF1 with winner change (Team A → Team B) → confirm SF1 reset to upcoming with new team_a, F reset to upcoming, 3rd-place reset (or DELETEd per D18), tournament.status flipped 'completed' → 'live', cascade audit metadata; (i) re-score all reset matches → tournament.status returns to 'completed'; (j) retirement: score QF as retired (Team B retired in set 2, partial 6-4 / 3-2) → confirm match.status='retired', winner=Team A, cascade fires; (k) walkover: walkover QF (Team A no-show) → match.status='walkover', winner=Team B, no scores written, cascade fires; (l) undo-score: undo a completed QF → confirm cascade reset same as winner-change edit; (m) undo-walkover: undo a walkover → match returns to upcoming; (n) public bracket page (incognito) → confirm scores display correctly per spec §5.7; (o) invalid score: try 7-4 → confirm `invalid_score` error with helpful message; (p) try 6-5 → confirm error; (q) Best-of-1 tournament with `last_set_rule='super_tiebreak'`: try 6-4 single set → error (must be super_tiebreak); try 10-7 → succeeds. **DRAFT v2 additions:** (r) **final-edit no-revert (D16):** in a fully-completed bracket, edit the final's score with a winner change → confirm `tournament.status='completed'` (no revert), `cascade_count=0`, `metadata.tournament_reverted=false`. (s) **out-of-order SF/final (A-A03):** with `has_third_place_match=true`, score SF1, then final, then SF2, then 3rd-place. Confirm tournament is `'live'` after final's score (NOT `'completed'`); flips to `'completed'` only after 3rd-place is scored. (t) **walkover-source edit rejected (D17 / A-A05):** walkover a match; attempt `edit_match_score_rpc` on it; confirm `match_not_editable` error; then `undo_walkover_rpc` + `enter_match_score_rpc` succeed. (u) **partial-team score rejected (D19 / A-A01):** attempt to score the FINAL match (team_a + team_b both NULL pre-cascade); confirm `match_team_not_resolved` error. (v) **3rd-place auto-create after retire/walkover SF (A-A04):** walkover SF1, score SF2 → confirm 3rd-place row created with both losers. |
| **DoD3** | Both CIs green on `main`. Auto-types-regen committed by deploy.yml. |
| **DoD4** | Migrations applied to remote prod (just B49). All v0.6 Edge Functions deployed. |
| **DoD5** | DECISIONS.md updated with v0.6 D1-D15 final answers. |
| **DoD6** | `Plans/version-roadmap.md` v0.6.0 header gets `Shipped` + ship date. |
| **DoD7** | `Plans/decisions.md` gets v0.6 ship entry. |
| **DoD8** | `padelthailand.com/matchday/` rebuilt + Pap-approved push showing v0.6 as Shipped. |

---

## 5 · Per-feature ship matrix

| Feature | Code-complete | Backend ready | E2E verified | Ship status |
|---------|---------------|---------------|--------------|-------------|
| Standard set + tiebreak + super-tiebreak validation (spec §5.2-5.4) | ⬜ | ⬜ B50 + B51 | ⬜ | Required (DoD anchor) |
| Per-set score entry best-of-1 / best-of-3 (TO-V1-09) | ⬜ | ⬜ B52 | ⬜ | Required (DoD anchor) |
| Match winner derivation (spec §5.5) | ⬜ | ⬜ B51 | ⬜ | Required |
| Match status `in_progress` / `completed` transitions | ⬜ | ⬜ B52 | ⬜ | Required |
| Retirement + partial scores + opponent advances (TO-V1-10) | ⬜ | ⬜ B53 | ⬜ | Required |
| Walkover (TO marks no-show team) | ⬜ | ⬜ B54 | ⬜ | Required |
| Bracket cascade on match completion (spec §2) | ⬜ | ⬜ B52 + B55 | ⬜ | Required (DoD anchor) |
| 3rd-place match auto-create on 2nd-SF completion (D7) | ⬜ | ⬜ B52 | ⬜ | Required |
| Tournament `live` first-match transition (D9) | ⬜ | ⬜ B52 | ⬜ | Required |
| Tournament `completed` auto-detect on final (D8) | ⬜ | ⬜ B52 + B55 | ⬜ | Required |
| Score edit (same winner) — simple update | ⬜ | ⬜ B56 | ⬜ | Required |
| Score edit (winner change) — cascading reset (spec §2) | ⬜ | ⬜ B56 + B57 | ⬜ | Required (DoD anchor) |
| Score undo + walkover undo | ⬜ | ⬜ B58 + B59 | ⬜ | Required |
| Public bracket score display (W62) | ⬜ | ⬜ W62 | ⬜ | Required |

v0.6 ships when 14/14 are green AND DoD2's score-cascade + cascading-undo + 3rd-place auto-create paths verify end-to-end.

---

## 6 · Cross-cutting DoD (every version, per `version-roadmap.md`)

- **a11y** — Scores tab forms have labeled inputs, error associations, screen-reader running-summary updates. axe-core verified clean. Manual review documented.
- **Observability** — Sentry capture on every server-action error path with `function: match.<name>` tags. Edge Functions B60 capture failures via existing `_shared/sentry.ts` wrapper.
- **Audit log** — every mutating action emits a row: `match.scored`, `match.score_edited` (with metadata.undo + metadata.cascade_count), `match.retired`, `match.walkover`, `match.walkover_undone`, `tournament.started`, `tournament.completed`. Cascade reset writes ONE audit row per cascade invocation (not per affected match — count goes in metadata).
- **i18n** — every new user-visible string is an i18n key. TH bundles get placeholder strings (carry-over from v0.1-v0.5 native-speaker review obligation).
- **Privacy** — Scores tab + public bracket page render only `display_name` + (optional) `avatar_url` for each team's players; NO email, phone, LINE ID, WhatsApp, DOB, gender, country leaked.

---

## 7 · Anti-criteria (locked)

- v0.6.0 must NOT ship match scheduling UI / court×time grid (v0.7.0)
- v0.6.0 must NOT ship realtime — page-refresh per v0.5 D10 + v0.6 D14 (v0.8.0)
- v0.6.0 must NOT ship spectator mode active CSS (v0.8.0)
- v0.6.0 must NOT ship placements auto-derive (v0.9.0). v0.6 only auto-CREATES the 3rd-place match row; placements come in v0.9.
- v0.6.0 must NOT ship manual placement override (v0.9.0)
- v0.6.0 must NOT ship double-elim format (v2+)
- v0.6.0 must NOT ship rating-delta computation (v3 — external provider)
- v0.6.0 must NOT ship routine score-update emails (D10 — v0.9 owns the next email surface)
- v0.6.0 must NOT modify v0.5 frozen surfaces (Draw tab, public bracket route, draw RPCs, draw Edge Functions) — only adds the new Scores tab + reads/writes new match columns
- v0.6.0 must NOT use a hand-rolled bracket renderer or drag-drop (re-uses v0.5's @g-loot + no dnd-kit needed for score entry)
- v0.6.0 must NOT ship without RLS + cascade integration tests (B61)
- v0.6.0 must NOT depend on v0.5 unfinished Phase C — this plan executes against v0.5's `main`-state surface (Phase A + B shipped per `Plans/version-roadmap.md`)
- v0.6.0 must NOT push padelthailand.com/matchday/ without explicit Pap approval
- v0.6.0 must NOT silently accept invalid set scores in prod — every invalid path raises a structured `invalid_score` error with the helper's specific error_code (P0001)
- v0.6.0 must NOT allow score entry on a tournament with `status NOT IN ('published', 'live')`
- v0.6.0 must NOT allow score editing on a `status='upcoming'` match (must be entered first via `enter_match_score_rpc`; edit RPC is for already-scored)
- v0.6.0 must NOT permit the cascade RPCs to recurse without a cycle guard (`_cascade_undo_then_replace` MUST track visited match_ids and raise `cascade_cycle_detected` if a match repeats)
- v0.6.0 must NOT emit per-match-row audit on cascade resets — single `match.score_edited` audit with `metadata.cascade_count` (mirror of v0.5 A-A18 anti-criterion for `draw.generated`)
- v0.6.0 must NOT introduce schema changes to the `match` table — v0.5 B37 forward-loaded all v0.6 columns nullable; v0.6 just starts WRITING them. Any ALTER TABLE proposal in this version is a bug in the plan.
- **DRAFT v2 additions (post-stress-test):**
- v0.6.0 must NOT permit score entry / retirement / walkover on a match with team_a_id IS NULL OR team_b_id IS NULL (D19 / A-A01)
- v0.6.0 must NOT permit `edit_match_score_rpc` on a `'walkover'` source match (D17 / A-A05) — must be undone via `undo_walkover_rpc` first
- v0.6.0 must NOT revert tournament.completed → live on a winner-change edit when cascade_count=0 (D16 / A-A06) — final-only edits leave the bracket terminal
- v0.6.0 must NOT prematurely flip tournament.status='completed' when the final is scored before its 3rd-place row exists (D8 / A-A03) — completion requires both leaves terminal

---

## 8 · Risk register (DRAFT v1; pre-stress-test)

| # | Risk | Mitigation |
|---|------|------------|
| R1 | Score-validation off-by-one (e.g. 7-5 valid, 7-4 invalid, 6-6 invalid) | B50 helper unit-tested with parametric matrix in B61 covering every valid + invalid pair from spec §5.2-5.4. |
| R2 | Match-level validation regressions on Best-of-1 / set-3-without-split | B51 unit-tested in B61 with full matrix. |
| R3 | Cascade walks downstream incorrectly (wrong slot) | B55 reads `next_match_slot` from match row written by v0.5 B41 (verified at v0.5 ship). Integration test in B61 covers 4-team bracket (no byes), 8-team (with bye-pre-fill from v0.5), 12-in-16 (with byes). |
| R4 | Cascade-undo writes wrong slot when restoring new winner | B57 reads the SAME `next_match_slot` from match — slot is structural, set at draw-generation time, never changes. Integration test in B61 covers winner-change edit. |
| R5 | Cascade-undo infinite loop (cycle bug) | B57 maintains a visited-set; raises `cascade_cycle_detected`. The bracket is acyclic by construction so this is a safety net. |
| R6 | Tournament `completed` set prematurely (before 3rd-place if any) | B52 step (10) explicitly checks `has_third_place_match` AND that the 3rd-place match (if exists) is also completed. Integration test in B61. |
| R7 | Tournament `live` flipped repeatedly on every score | D9 — idempotent guard on `tournament.started_at IS NULL`. Test in B61. |
| R8 | 3rd-place row INSERTed twice if both SFs complete simultaneously (concurrent calls) | B52 takes SELECT FOR UPDATE on the parent tournament; concurrent SF-completion calls serialize. The 2nd one sees the 3rd-place row already inserted (or guard against duplicate via UNIQUE on `(draw_id, match_type='third_place')` — confirm canonical schema or add at B52 if missing). |
| R9 | Concurrent score-edit + score-enter on same match | SELECT FOR UPDATE on match in both B52/B56 — second call blocks until first commits, then sees updated status and rejects (B56 requires status IN completed/retired/walkover; B52 rejects those). |
| R10 | Edit cascade clears scores of completed downstream matches → TO data loss | This is the spec'd behavior per §2 "Score Editing with Cascading Undo". W60's cascade-impact preview warns explicitly with affected-match count. DoD2(h) verifies. |
| R11 | Edit-with-same-scores-but-different-set-order (e.g. 6-4, 3-6, 10-8 → 3-6, 6-4, 10-8) | The set order represents play order; B51 doesn't reorder. Same winner = no cascade, just `match.score_edited` audit. Acceptable. |
| R12 | Score validation reads wrong tournament config (e.g. last_set_rule changed mid-tournament) | tournament.match_format + last_set_rule have no v0.6 mutation surface — they're set at tournament create + frozen. RLS + UI never expose mutation post-publish. Document in DECISIONS.md as a v0.6 invariant. |
| R13 | Public bracket page hammered by spectators while live scoring | v0.5 R24 noted this; v0.5 default is no ISR but recommended Cache-Control headers `s-maxage=10`. v0.6 needs to balance: stale scores feel broken to spectators. **D-decision sub-default: drop Cache-Control to `s-maxage=2, stale-while-revalidate=10`** for v0.6 (max 2s staleness during live scoring); v0.8 realtime removes entirely. |
| R14 | dnd-kit + @g-loot bundle stays under the v0.5 budget | v0.6 adds NO new packages (P3). Bundle should DROP if anything (no v0.6 surface adds bracket UI beyond v0.5). |
| R15 | RPC SECURITY DEFINER + auth.uid() masking — same v0.5 pattern | Mirror of v0.5 B42 — caller passes `p_user_id` from JWT-validated Edge Function; RPC re-validates organizer/admin authz against that uuid. Pattern verified in v0.5; no new risk. |
| R16 | Score-entry RPC raises during the v0.5 publish-cascade re-publish-cycle (v0.6 doesn't ship draw-unpublish per anti-criteria) | Out of scope. v0.5 publish is one-way. If/when v0.6.x adds unpublish, the cascade RPCs must clear scores from all matches in the draw — explicit warning added at that point. |
| R17 | Cascade-reset on edit doesn't reverse `tournament.status='completed'` → 'live' | B57 step (7) explicitly checks tournament.status='completed' AND any cascade-reset matches; reverses to 'live' + clears completed_at. Test in B61. |
| R18 | `_cascade_winner` writes to a slot already populated (idempotent re-run) | B55 is idempotent: writes to next_match's slot regardless of prior value. Test: invoke B55 twice in a row → second call no-ops effectively (overwrites with same value). |
| R19 | Undo-score on a match whose downstream is fully advanced and tournament completed | B58 routes through B57 cascade walk. All downstream matches reset; tournament back to 'live'. Audit metadata.cascade_count = N. |
| R20 | Phase A length is moderate (~14 commits including helpers) but most are small RPCs | Each RPC is ~50-150 lines of PL/pgSQL. B57 is the longest (cascade walk). Estimated 1 day of phase-A work in parallel-blitz mode. |
| R21 | Pap pushback on D7 (3rd-place auto-create) | If Pap prefers explicit "Create 3rd-place match" button, plan revises to add a `create_third_place_match_rpc` + UI button. Estimated +1 commit each phase. |
| R22 | Pap pushback on D8 (auto-detect tournament completion) | If Pap prefers explicit "Mark tournament complete" button, plan revises to add `complete_tournament_rpc` + UI button (with validation that all matches scored). Estimated +1 commit each phase. |
| R23 | Pap pushback on D10 (no routine score emails) — TO might want notification per scored match | NOT v0.6 scope; reserve `match.scored` email template for v0.9 inventory if Pap requests. v0.6 default = no email. |
| R26 | D7/D8 logic duplicated across B52/B53/B54 (~50-line blocks each) — future bug-fix to D7 must be applied 3 times or one drifts | v0.6.x extraction to a `_post_match_completion(match_id, user_id, via)` helper. v0.6 ships with intentional duplication for clarity-during-build (each RPC is self-contained, no indirection); **the A-A04 fix to B52 surfaced this risk in practice** — B53/B54 already had the right filter but B52 didn't. Documented in DECISIONS.md as v0.6.x obligation. |
| R27 | @g-loot library locked at v0.5 W45 may not expose per-match click handler needed for D13 stretch-goal bracket-click entry path | Verify at W56; defer secondary-entry-path to v0.6.x patch if blocked. P3 "no new packages" stands. |
| R28 | Score-edit cascade extends row-level locking to all downstream matches in the chain — long chains hold a tournament-level lock plus several match-level locks | W56 Scores tab UI shows "saving..." indicator + disables concurrent submit during edit. No code-side fix; documentation. |
| R29 | undo-match Edge Function status-discovery has a TOCTOU race against concurrent edit (A-A11) — read match.status before invoking RPC, between read and invoke another TO could change the status | Accepted; surfaces as `match_not_undoable` to the user via existing i18n. Documented in DECISIONS.md. |

---

## 9 · Approval gates

This plan requires explicit Pap approval before any scaffolding:

1. ⬜ Plan drafted (DRAFT v1) — *this document*
2. ⬜ Plan stress-tested by Plan + Architect review lenses (DRAFT v2)
3. ⬜ Pap reviews; D1-D15 answered
4. ⬜ Phase A (B48-B62) executed
5. ⬜ Phase B (W55-W66) executed
6. ⬜ Phase C DoD walkthrough by Pap

Subsequent algorithms execute the phased commits.

---

*End of v0.6.0 build plan DRAFT v2.*

---

## Change log — DRAFT v1 → DRAFT v2 (2026-04-29)

Stress-test by Architect review lens (autonomous agent run, ~10 min) surfaced 21 actionable findings against v06-build-plan.md DRAFT v1, the 9 v0.6 SQL migrations, the 5 Edge Functions, and the RLS regression test file. **All 21 applied** — 5 critical (A-A01 through A-A05), 11 important (A-A06 through A-A15 + 1 P-F finding), 5 nits.

**Critical (5):**
- **A-A01: Partial-team scoring loophole.** B52/B53/B54 only checked the *winner* side for non-null; the opposite side could be NULL and the RPC happily marked the match completed against a phantom team. Fix: 4-line guard in each RPC requiring both team_a_id AND team_b_id non-null. New D-decision **D19**. New anti-criterion. New test case.
- **A-A02: AUTHZ test passed for the wrong reason.** RLS test invoked the RPC from a user-context client which fails at PostgREST discovery (no execute privilege) — never exercised the RPC's actual `forbidden` AUTHZ branch. Fix: rewrote test to invoke from service-role with non-organizer p_user_id; added admin-positive case.
- **A-A03: Premature tournament.completed.** Score order SF→final→SF2 with `has_third_place_match=true` flipped tournament to 'completed' on the final because the 3rd-place row hadn't been INSERTed yet (B52 step 10 fires only when the SECOND SF completes). The previous `bool_and(...) FROM match WHERE (third_place OR final)` returned TRUE on the final alone if the 3rd-place was absent. Fix: distinguish final-leaf vs 3rd-place-leaf paths; require the OTHER row to exist AND be terminal. Applied to B52, B53, B54 (~25 LOC each). New D-decision **D20**. New anti-criterion. New test case (DoD2 step (s)).
- **A-A04: 3rd-place auto-create skipped after retire/walkover SFs.** B52's "find OTHER SF" query filtered `status='completed'` only, while B53/B54 had the right filter `status in ('completed', 'retired', 'walkover')`. B52 was the inconsistent one. 1-line fix. New test case (DoD2 step (v)).
- **A-A05: Edit-RPC silently launders walkovers.** `edit_match_score_rpc` accepted `'walkover'` source status; rewrote it as `'completed'` with no `match.walkover_undone` audit. Fix: restrict edit-RPC to `('completed', 'retired')` only. New D-decision **D17**. New anti-criterion. New test case (DoD2 step (t)).

**Important (11):**
- **A-A06: Final-edit unconditionally reverts tournament.completed → live.** A winner-change edit of the FINAL doesn't propagate anywhere; the bracket is still terminal. Reverting produces a confusing flap. Fix: gate `v_tournament_reverted` on `v_cascade_count > 0`. New D-decision **D16**. New anti-criterion. New DoD2 step (r).
- **A-A07: 3rd-place DELETE leaves stale client refs.** Edge Function now surfaces `deleted_third_place_id` in undo response (and audit metadata). RPC return shape extended; client cache layer can drop stale rows. New D-decision **D18**.
- **A-A08: D7/D8 logic triplicated across B52/B53/B54.** Recommended `_post_match_completion` helper extraction. Tracked as v0.6.x obligation per **R26**. **The A-A04 fix surfaced this risk in practice** — B53/B54 had the correct filter but B52 didn't.
- **A-A09: B56 already locks tournament correctly.** Closed (false alarm in initial finding; replacement noted that long cascade chains extend row-level locking — tracked as **R28**).
- **A-A10: Substring matching in error mappers is fragile.** Extracted shared `_shared/match-rpc-errors.ts` with arms ordered LONGEST-PREFIX-FIRST. All 5 EFs now import the shared mapper; per-function `mapRpcError` blocks deleted.
- **A-A11: undo-match TOCTOU race.** Status-discovery between read and RPC invoke. Accepted; surfaces as `match_not_undoable` via existing i18n. Tracked as **R29**.
- **A-A12: tournament revert on undo of final.** Compounds with A-A03; resolves naturally after A-A03 fix.
- **A-A13: Cycle guard depth cap.** Confirmed safe (32-cap > log2(128)=7 max). Closed as nit.
- **A-A14: No audit_log assertions in tests.** Added new test case asserting `match.scored`, `tournament.started`, `tournament.completed`, `match.score_edited` (with `cascade_count > 0` + `winner_changed: true` + `tournament_reverted: true`) audit rows.
- **A-A15: Dead `set3_wrong_kind` error code in B51 docstring.** Removed; replaced with the actual returned codes enumerated.
- **P-F01: @g-loot per-match click handler API.** Tracked as **R27** — verify at W56; defer to v0.6.x if blocked.

**Nits (5) — accepted-with-rationale:**
- A-N01: B52 redundant re-read of just-UPDATEd row in B55. Centralized cascade semantics; keep.
- A-N02: `for update` without `nowait` on cascade walk. Acceptable for v0.6; revisit at v0.8 realtime.
- A-N03: Migration filename date `2026-05-01` for work done 2026-04-29. Forward-dated by 2 days; acceptable convention.
- A-N04: v0.5's `_seed_order_for_size` not listed as v0.6 dep. Implicit through `next_match_id` chain; documented for completeness.
- A-N05: i18n missing `arguments_required` / `invalid_body` etc. as keys. Fall through to `invoke_failed`; deliberate.

**5 net-new D-decisions (D16-D20)** added to §1; **5 new anti-criteria** added to §7; **4 new risks (R26-R29)** added to §8; **5 new DoD2 steps (r-v)** added to §4 Phase C; **B52/B53/B54/B56/B58/B59 descriptions updated** in §4 Phase A to reference fix labels (A-A##).

**Net commit additions in DRAFT v2:** 0 new migrations / 0 new Edge Functions / 1 new shared TypeScript helper (`_shared/match-rpc-errors.ts`) / 5 new test cases. All fixes are surgical edits to existing files — the migration count, Edge Function count, and test file count are unchanged from DRAFT v1.

*End of change log.*
