# Matchday ↔ Challonge Replacement Analysis

> **Status:** Pending team discussion · **Prepared:** 2026-04-13 · **Purpose:** Give Pap's team the facts needed to decide how Matchday should absorb TPS's current Challonge usage.

---

## 1 · What TPS actually uses Challonge for

Source: direct inspection of `padel-backend/supabase/functions/src/services/TournamentChallongeService.ts`. The service wraps Challonge API v2.1 with API-key auth (endpoint: `https://api.challonge.com/v2.1`). Called from the `event-tournament-v3` Edge Function.

**Tournament types TPS outsources to Challonge**:
1. **`knockout`** — single-elimination brackets with seeding + byes
2. **`roundRobin`** — pure round robin (implied from the RR+KO code path)
3. **`roundRobinKnockout`** — hybrid: group stage (round robin) followed by a knockout bracket, with configurable advancement rules

**Types Challonge offers that TPS does NOT use**: double elimination, swiss, grand prix, free-for-all, league. None of those strings appear in the TPS codebase.

## 2 · Challonge API operations TPS depends on

The operations in `TournamentChallongeService` that make real API calls:

| Operation | What it does |
|---|---|
| `setupTournament` | Create the Challonge tournament record, create teams, add participants, configure format |
| `createChallongeTournament` | Provision Challonge-side tournament |
| `addParticipantsToChallonge` | Register doubles pairs as participants |
| `startChallongeTournament` | Transition setup → underway; Challonge generates the bracket |
| `startGroupStage` | Begin the round-robin phase for hybrid format |
| `reportScore` / `reportScoreToChallonge` | Push a match result (team1_sets_won, team2_sets_won, score_detail) |
| `finalizeGroupStage` | Lock group standings; seed the knockout bracket |
| `checkAndTransitionToKnockout` | Auto-transition once all RR matches are scored |
| `startKnockoutStage` | Generate knockout from RR standings |
| `restartKnockoutWithCustomSeeds` | Manually re-seed the knockout and regenerate |
| `fetchBracketStructure` | Pull current bracket shape (60s cache) |
| `syncMatchesFromChallonge` | Mirror match state back into TPS DB |
| `syncKnockoutMatches` / `syncRestartedKnockoutMatches` | Keep knockout match state in sync |
| `syncRankingsFromChallonge` | Pull standings into TPS |
| `completeTournament` | Mark tournament complete on both sides |

**Non-functional capabilities TPS relies on from Challonge**:
- Bracket preview URL (`live_image_url`, `full_challonge_url`) — public-facing bracket view TPS links players to
- Participant check-in flow (`check_in_duration`, `CheckingIn` / `CheckedIn` states)
- Match-reporting permission flag (`allow_participant_match_reporting`)

## 3 · Match-format complexity

From `SetupTournamentParams` in the service. All passed through to Challonge.

```
match_format:    'timed' | 'one_set' | 'best_of_sets' | 'manual'
scoring_mode:    'games' | 'sets' | 'manual'
match_duration:  { type: 'games' | 'sets' | 'minutes', value: number }

sets_config: {
  win_by:     'first_to_1' | 'best_of_3' | 'best_of_5'
  set_format: 'first_to_6' | 'first_to_4'
}

deciding_point: 'golden_point' | 'no_advantage'

schedule_type: 'single_round_robin' | 'double_round_robin'

standings_points: { win: number, tie: number, loss: number }

knockout_config: {
  enabled:          boolean
  advancement_rule: 'top_2' | 'top_4' | 'top_8' | 'top_16'
  bracket_size:     2 | 4 | 8 | 16 | 32
  byes:             number
  seedings:         'RR standings' | 'Reverse RR' | 'Random' | 'Manual'
}
```

**None of this match-format complexity exists in Matchday v1.** Matchday v1 has Americano (points-per-round only) and single-elim with TO-entered final placements (no in-event scoring).

## 4 · Critical insight: Matchday must expose a REST API

**TPS doesn't use Challonge's web UI.** TPS's backend calls Challonge's REST API directly and renders its own UI in the Flutter mobile app. For Matchday to replace Challonge in TPS's workflow, **Matchday must expose a REST API that TPS's existing `TournamentChallongeService` can migrate to** — ideally similar enough in shape that the migration is a near-1:1 translation.

This is a fundamentally different product shape than Matchday v1 currently has:

- **Matchday v1 as currently designed**: a web app. TOs create and run tournaments through Matchday's own UI. Players self-register through Matchday's own UI. The July 2026 cohort tournament is the single beta event.
- **Matchday as Challonge replacement**: an API-first tournament engine. TPS (and other clients) call it from their own backends. Matchday's web UI becomes one of several consumers of the API.

Both are valid products with different scopes and different v1 plans.

## 5 · Gap analysis — what Matchday v1 can replace today

| Challonge capability | Matchday v1 status | Gap |
|---|---|---|
| Single-elim bracket generation | ✅ Partial (web UI, manual seeding, byes) | No programmatic scoring (sets/games/golden point); TO enters final placements only |
| Round robin | ❌ Not in v1 | v2 scope |
| RR + knockout hybrid | ❌ Not in v1 | v2 scope |
| Match-format rules (timed / one_set / best_of_sets) | ❌ Not in v1 | v2 |
| Live match state sync / realtime bracket | ⚠️ Realtime is Americano leaderboard only | v2 single-elim realtime |
| Standings / ranking computation | ⚠️ Americano leaderboard only | v2 RR standings |
| Public bracket URL | ✅ v1 has public tournament pages | Exists |
| Participant check-in flow | ❌ Not in v1 | v1.1 / v2 |
| **Programmatic REST API for tournament CRUD, participant add, score report, bracket fetch** | ❌ **Not in any current plan** | **The critical gap** |

## 6 · What Matchday would need to ship to fully replace Challonge

To be a drop-in replacement for the TPS `TournamentChallongeService`:

1. **Round robin engine** with configurable schedule type (single/double RR)
2. **RR + knockout hybrid** flow with group standings → seeded knockout transition
3. **Single-elim bracket engine** (already v1) **with programmatic scoring** (sets/games/golden point, not just final placements)
4. **Match-format rules**: timed / one_set / best_of_sets variants, set config, deciding point
5. **Standings computation** for round robin with tiebreak rules (points, head-to-head, etc.)
6. **REST API** with endpoints for: create tournament · add participants · start · report score · fetch bracket · fetch standings · finalize group stage · restart knockout · complete tournament
7. **API auth**: Matchday-issued service tokens for TPS (and other clients)
8. **Public bracket URL** already in v1
9. **Check-in flow** (v1.1 or v2)
10. **Webhook or polling** for TPS to receive async state updates

## 7 · Strategic options

### Option A — Keep v1 cohort-focused; Challonge replacement is v2+
- v1 ships as currently scoped (cohort tournament July 2026, single-elim + Americano, web UI only)
- After the cohort validates the product, v2 adds round robin + RR+KO + match-format rules + programmatic REST API
- TPS migrates off Challonge in v2 (H2 2026 or later)
- **Pros**: Lowest risk. Respects the July deadline. Cohort validates the product before scope grows.
- **Cons**: Delays the Challonge replacement by several months. TPS keeps paying for Challonge in the meantime.

### Option B — Expand v1 to include Challonge replacement
- v1 must ship round robin + RR+KO + match-format rules + REST API before July 2026
- Adds at least 4-6 developer-weeks of scope
- **Pros**: Replaces Challonge sooner.
- **Cons**: Almost certainly delays the cohort tournament. Makes v1 huge. High schedule risk.

### Option C — Parallel tracks
- Track 1: v1 cohort as planned, ships on time for July
- Track 2: "Matchday API for TPS" workstream builds RR + RR+KO + REST API, targeting H2 2026 for TPS migration
- **Pros**: Both goals achieved. Cohort on time. TPS migration targeted.
- **Cons**: Requires a second developer or a dedicated second Claude Code session. Resource question.

### Option D — Hybrid for the July 2026 cohort
- v1 cohort runs Americano natively on Matchday
- Any single-elim brackets for that cohort day still go through TPS's existing Challonge integration (no Matchday disruption)
- Matchday proves Americano; Challonge stays for single-elim until v2
- **Pros**: Reduces v1 risk to zero for anything beyond Americano. Minimizes what needs to work on July cohort day.
- **Cons**: Doesn't begin the Challonge migration at all.

## 8 · Open decisions for Pap's team

1. **Strategic option** — A / B / C / D above?
2. **Should the Matchday prompt record a Challonge-replacement commitment?** If yes, where: main prompt, v2 reference, or a separate doc?
3. **API design** — is TPS willing to refactor `TournamentChallongeService` to hit a Matchday URL instead of Challonge, or does Matchday need to mimic Challonge's exact API surface for a drop-in replacement?
4. **Authentication** — Matchday issues service tokens to TPS the same way TPS issues `TPS_SERVICE_TOKEN` to Matchday?
5. **Cost of Challonge** — is TPS paying a monetary fee for Challonge that the replacement has to justify? If the fee is low, the replacement is a nice-to-have; if it's high or Challonge has reliability issues, it's urgent.
6. **Features TPS uses that aren't documented here** — did anything get missed in my code inspection? Worth a code review with whoever owns `TournamentChallongeService.ts` before locking any plan.

---

*End of analysis. Matchday prompt has NOT been edited. Resume this conversation after Pap's team meeting.*
