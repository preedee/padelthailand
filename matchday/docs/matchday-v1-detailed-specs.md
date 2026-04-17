# Matchday v1 — Detailed Specifications

> **Status:** Draft v0.2 · **Updated:** 2026-04-17 · **Owner:** Pap
> **Companion to:** `matchday-build-prompt.md` (v1 scope + acceptance criteria) and `matchday-v2-reference.md` (v2-v9 roadmap)
> **Purpose:** Implementation-level detail for every v1 feature — state machines, algorithms, validation rules, API contracts, data flows, and edge cases.

---

## 1 · Tournament Lifecycle State Machine

### States

| State | Who sees it | Description |
|---|---|---|
| `draft` | TO + admins only | Tournament created but not visible to public. TO is configuring details. |
| `registration_open` | Everyone | Listed publicly. Players can register. |
| `registration_closed` | Everyone | Registration window closed. No new registrations. TO prepares draw. |
| `published` | Everyone | Draw is generated and visible. Players see bracket + schedule. Tournament not yet started. |
| `live` | Everyone | Tournament is in progress. TO enters scores. Bracket updates in realtime. |
| `completed` | Everyone | Final match scored. Placements auto-derived. Tournament is over. |
| `cancelled` | Everyone | Tournament cancelled. All registrations voided. |

### Valid Transitions

| From | To | Triggered by | Preconditions | Side effects |
|---|---|---|---|---|
| draft | registration_open | TO clicks "Publish tournament" | Name, dates, venue, draw size, scoring rule configured | Tournament appears in public list |
| registration_open | registration_closed | TO clicks "Close registration" OR close date passes | — | No more registrations; pending partner invites expire |
| registration_open | published | TO publishes draw while registration is open | Draw generated with current registrations | **Auto-closes registration**; pending partner invites expire; bracket visible; draw published email sent |
| registration_closed | registration_open | TO clicks "Reopen registration" | — | Registration accepts new entries again |
| registration_closed | published | TO clicks "Publish draw" | Draw generated | Bracket visible; draw published email sent |
| published | registration_open | TO clicks "Reopen registration" | — | **Draw state → draft** (hidden from players); seed assignments preserved; registration reopens; TO warned "new registrations will appear in unseeded pool" |
| published | live | TO clicks "Start tournament" | At least one match is scheduled | Matches become scorable; spectator mode activates; status badge updates |
| live | completed | Automatic (final match + 3rd-place match if enabled are scored) | All required matches have winners | Placements auto-derived; tournament page shows final results |
| completed | live | TO clicks "Reopen tournament" | — | Tournament reopens for score editing; placements cleared until final is re-scored |
| any | cancelled | TO clicks "Cancel" (type tournament name to confirm) | — | All registrations voided; cancellation email sent; tournament marked cancelled |

**Terminal states**: `cancelled` only. `completed` can be reopened.

**NOT allowed**: Any backward transition not listed above (e.g., `live` → `published`, `cancelled` → anything).

### Draw Generation (Decoupled from State)

Draw generation is an **action available in multiple states**, not a state transition:

| State | Can generate draw? | Can publish draw? | Notes |
|---|---|---|---|
| registration_open | Yes (preview) | Yes (auto-closes registration) | New registrations after generation appear in "Unseeded players" panel. Existing seeds preserved. |
| registration_closed | Yes | Yes | Standard flow |
| published | Yes (regenerate) | Already published — regenerate replaces | TO warned "this will replace the current published draw" |

### Draw as Persistent Document

The draw is a **persistent working document** that auto-saves, not a one-shot generation:

| Concept | Description |
|---|---|
| Draw state | `draft` (TO working on it) → `published` (visible to players) |
| Auto-save | Every seed placement saves immediately (no "Save" button) |
| New registrations | Appear in "Unseeded players" panel. Existing seed assignments preserved. |
| Reopen registration | Draw preserved. New registrations go to unseeded pool. TO adjusts seeds and regenerates when ready. |
| Regenerate bracket | Old bracket replaced. Seed assignments preserved. New bracket created from current seeds. |

#### DrawSeed Data Model

```
DrawSeed (persistent, auto-saved)
---
draw_id        uuid fk → Draw
team_id        uuid fk → Team
seed_position  int (1..N)
created_at     timestamptz
updated_at     timestamptz
```

One row per seeded team. Unseeded teams have no row. TO drags a player → upsert row. TO removes from slot → delete row.

---

## 2 · Match Lifecycle State Machine

### States

| State | Visual indicator | Description |
|---|---|---|
| `upcoming` | Gray / default | Match not yet started. Opponents may or may not be known (depends on bracket progression). |
| `in_progress` | Green pulse / highlight | Match is being played. Optional state — TO can skip directly to scoring. |
| `completed` | Checkmark + scores displayed | Match finished normally. Winner determined. Winner has advanced to next round. |
| `retired` | "RET" badge + partial scores | Player retired mid-match. Partial scores recorded. Opponent advances. |
| `walkover` | "W/O" badge | One team withdrew or didn't show. No scores recorded. Opponent auto-advances. |
| `bye` | "BYE" badge | No opponent (draw has fewer players than bracket slots). Player auto-advances. Set at draw generation. |

### Valid Transitions

| From | To | Triggered by | Side effects |
|---|---|---|---|
| upcoming | in_progress | TO clicks "Mark in progress" | Bracket highlights match; Realtime broadcast |
| upcoming | completed | TO enters valid scores and submits | Score persisted; winner advances; Realtime broadcast; if final → check tournament completion |
| in_progress | completed | TO enters valid scores and submits | Same as above |
| upcoming / in_progress | retired | TO enters partial scores + marks "retired" | Partial scores persisted; opponent advances; Realtime broadcast |
| upcoming / in_progress | walkover | TO clicks "Walkover" and selects which team withdrew | No scores; opponent advances; Realtime broadcast |

### Bracket Cascade on Match Completion

When a match completes (score, retirement, or walkover):

1. Determine `winner_team_id` (from scores, non-retiring team, or non-withdrawing team)
2. Find `next_match` in the bracket (the match the winner advances to)
3. Populate the winner into the correct slot of `next_match` (`team_a` or `team_b`)
4. If `next_match` now has both teams → status remains `upcoming` (TO scores when played)
5. Check tournament completion (see below)
6. Broadcast all affected matches on the Realtime channel

### 3rd-Place Match

- **Optional per tournament** — TO enables/disables at tournament creation (`has_third_place_match: boolean`, default false)
- **Created automatically** when both semi-finals complete — populated with the two semi-final losers
- **Scoring** — same as any other match
- **Bracket rendering** — shown as a separate match below/beside the final

### Tournament Completion Rule

```
Tournament auto-completes when:
  - Final match is scored
  - AND (has_third_place_match == false OR 3rd-place match is scored)
```

### Placements Auto-Derivation

| Placement | 3rd-place match OFF | 3rd-place match ON |
|---|---|---|
| 1st | Winner of final | Winner of final |
| 2nd | Loser of final | Loser of final |
| 3rd | Semi-final loser (unranked) | Winner of 3rd-place match |
| 4th | Semi-final loser (unranked) | Loser of 3rd-place match |
| 5th-8th | QF losers (unranked) | QF losers (unranked) |
| 9th-16th | R16 losers (unranked) | R16 losers (unranked) |

TO can manually override any placement via the Placements tab (audit-logged).

### Score Editing with Cascading Undo

**When a TO edits a score and the winner does NOT change**: simple update, audit-logged, Realtime broadcast.

**When a TO edits a score and the winner CHANGES**:

```
1. TO edits Match X → new winner is Team B (was Team A)

2. Find next match (Match Y) where Team A was advanced:
   ├─ Match Y not yet played (upcoming)
   │   → Swap: remove Team A, insert Team B. Done.
   │
   └─ Match Y already played (completed/retired)
       → Reset Match Y: status → upcoming, clear scores, clear winner
       → Remove Match Y's old winner from THEIR next match (Match Z)
       │
       ├─ Match Z not yet played → clear the slot. Done.
       └─ Match Z already played → reset Match Z too → continue...

3. Cascade continues until hitting an unplayed match or bracket end.
4. Insert new winner (Team B) into Match Y's slot.
5. All reset matches return to 'upcoming'.
6. If tournament was 'completed' → transitions back to 'live'.
7. Audit log records the entire cascade.
8. Realtime broadcast includes all affected matches.
```

**Example:**
```
QF-1: Team A beat Team B (6-4, 6-3)  ← TO edits this
SF-1: Team A beat Team C (7-5, 6-4)  ← already played
F:    Team A beat Team D (6-2, 6-4)  ← already played

TO changes QF-1 winner to Team B:
  → SF-1 reset (Team B placed in Team A's slot)
  → F reset (Team A removed)
  → Tournament status → 'live' (was 'completed')
  → Placements cleared
  → TO must re-score SF-1 and F
```

### Walkover Undo

Same cascade logic as score editing:

| Scenario | Behavior |
|---|---|
| Next match NOT yet played | Match returns to `upcoming`, winner removed from next match slot |
| Next match already played | Cascade reset — downstream matches reset to `upcoming` |

---

## 3 · Registration Flows

### 3.1 · Player Profile (Signup)

On first login, player completes a profile form:

| Field | Required? | Type | Notes |
|---|---|---|---|
| Display name | Required | Text | How the player appears on brackets |
| Date of birth | Required | Date picker | Age calculated internally (never displayed on profiles). Used for future age-category filtering. |
| Gender | Optional | Select: Male / Female / Other / Prefer not to say | For future mixed-format pairing |
| City | Required | Text | Current city of residence |
| Country | Required | Country picker (ISO-3166) | Current country of residence |
| Nationality | Required | Country picker (ISO-3166) | May differ from country (expats) |
| Phone number | Optional | Phone input with country code | Primary contact |
| LINE ID | Optional | Text | Thai-standard messaging |
| WhatsApp number | Optional | Phone input with country code | APAC-standard messaging |
| Playing hand | Optional | Select: Right / Left / Ambidextrous | Padel-relevant |
| Preferred side | Optional | Select: Drive (right) / Reverse (left) / Both | Padel-relevant |

Phone, LINE ID, and WhatsApp number are **three independent fields** — each can have a different value.

### 3.2 · Solo Registration

```
Player on tournament detail page
  │
  ├─ Not authenticated → "Sign in to register" → auth flow → return
  ├─ Already registered → show "Withdraw" button (only if registration_open)
  ├─ Registration closed → "Registration closed" (no action)
  │
  └─ Registration open + not registered:
       ├─ Capacity available → "Register solo"
       │   → Registration created (status: confirmed)
       │   → Confirmation email sent
       │   → Counter updates ("15/16 registered")
       │
       └─ Capacity full → "Join waitlist"
           → Registration created (status: waitlisted)
           → "You're #3 on the waitlist"
```

### 3.3 · Doubles Registration

```
Player clicks "Register with a partner"
  │
  └─ Partner search modal:
       ├─ Type name/email (300ms debounce, 30 req/min limit)
       │   → Results: avatar + name + "Invite" (max 10)
       │
       ├─ Click "Invite" → "Invite [name] to play [tournament]?"
       │   → Registration created (status: pending_partner)
       │   → Partner invite email sent (magic-link)
       │   → Tournament page shows "Waiting for [partner] to confirm"
       │
       └─ No results → "No matching users — ask your partner to create a Matchday account first"
```

### 3.4 · Partner Invite Response

```
Partner clicks magic link
  │
  ├─ Not authenticated → sign-in flow → return to invite page
  │
  └─ Authenticated → /invite/[token]:
       ├─ Valid + pending:
       │   → Shows: tournament, dates, venue, inviter name
       │   ├─ Accept → both confirmed (or waitlisted if full), emails sent, redirect to tournament
       │   └─ Decline → registration deleted, inviter notified
       │
       ├─ Already responded → "You've already responded"
       └─ Expired → "This invitation has expired"
```

### 3.5 · Add / Remove Partner (While Registration Open)

| Action | Flow |
|---|---|
| Solo player adds a partner | Same as doubles registration — search, invite, partner accepts. Solo registration converts to doubles. |
| Doubles player removes partner | Partner's registration voided, partner notified. Player's registration converts to solo. |
| Doubles → solo → re-add different partner | Allowed. Remove old partner (becomes solo), then add new partner (becomes doubles again). |

### 3.6 · Withdrawal

- Only allowed during `registration_open`
- Solo: registration voided
- Doubles: BOTH players' registrations voided, partner notified
- Waitlist promotion: next in line auto-promoted (FCFS), promotion email sent
- TO can manually promote any waitlisted player out of FCFS order

### 3.7 · Waitlist

| Rule | Detail |
|---|---|
| Default order | First-come-first-served (by registration timestamp) |
| TO override | TO can manually promote any waitlisted player/pair out of order |
| Auto-promotion | When someone withdraws, next FCFS player/pair auto-promoted + email sent |
| Doubles pairs | Promoted together (both or neither) |

### 3.8 · Edge Cases

| Scenario | Behavior |
|---|---|
| Player registers twice for same tournament | Blocked — "You're already registered" |
| Partner is already registered | Blocked — "This player is already registered for this tournament" |
| Partner has no Matchday account | "No matching users" in search |
| Registration closes while invite pending | Invite expires, registration rolled back, inviter notified |
| Player withdraws after draw published | Registration voided; TO notified draw needs regeneration |
| Player withdraws during live tournament | Not allowed — TO handles via walkover at match level |
| Waitlist promotion for doubles pair | Both promoted together, both emailed |

---

## 4 · Draw Generation Algorithm

### 4.1 · Bracket Sizing

```
Input:  N = number of confirmed registrations (teams for doubles)
        bracket_size = TO's chosen draw size (must be ≥ N, power of 2 or custom)
Output: byes = bracket_size - N

TO can choose a bracket size larger than needed (expecting late registrations).
Bracket size options: 4, 8, 16, 32, 64, or custom.

Examples:
  N=12, TO picks 16 → byes=4
  N=12, TO picks 32 → byes=20 (lots of byes, but allowed)
  N=16, TO picks 16 → byes=0
```

### 4.2 · Seed-to-Slot Mapping

Standard tournament seeding ensures top seeds are maximally separated. For a 16-slot bracket:

```
Match 1:  Seed 1  vs Seed 16
Match 2:  Seed 9  vs Seed 8
Match 3:  Seed 5  vs Seed 12
Match 4:  Seed 13 vs Seed 4
Match 5:  Seed 3  vs Seed 14
Match 6:  Seed 11 vs Seed 6
Match 7:  Seed 7  vs Seed 10
Match 8:  Seed 15 vs Seed 2
```

**Principle**: Seeds 1 and 2 can only meet in the final. Seeds 1-4 can only meet in the semi-finals. Seeds 1-8 can only meet in the quarter-finals.

Algorithm generalizes to any power-of-2 size using recursive halving.

### 4.3 · Bye Placement

Byes go to **top seeds**. For 12 players in a 16-slot bracket (4 byes):
- Seeds 1-4 receive first-round byes (enter in Round 2)
- Seeds 5-12 play in Round 1

A bye = Match with `team_b = null` and `status = 'bye'`. Seeded team auto-advances.

### 4.4 · Seeding Unit

- **Doubles**: the pair (team) is the seeding unit — one seed slot per pair
- **Solo**: one seed slot per player

### 4.5 · Manual Seeding UI Flow

```
1. TO sees two panels:
   Left:  "Unseeded players/teams" — all confirmed registrations, draggable
   Right: "Seed slots" — numbered 1..N, drop targets

2. TO drags from left to right to assign seed numbers
   - Seed 1 = strongest, Seed N = weakest
   - Every drag auto-saves immediately

3. TO can leave and return — seed assignments persist exactly as left
   - New registrations appear in "Unseeded" panel
   - Existing seeds unaffected

4. "Auto-fill remaining" button — randomly assigns unseeded teams to empty slots
   - Can regenerate for a new random assignment
   - Does not touch manually-seeded slots

5. "Generate bracket" button (enabled when all slots filled):
   → Seed-to-slot mapping + bye placement
   → Bracket preview renders below
   → TO can inspect, adjust seeds, regenerate as many times as needed

6. Unseeded players at publish time:
   → Warning: "3 players are unseeded. Auto-assign randomly?"
   → Options: "Auto-fill" or "Go back to seeding"
```

### 4.6 · Draw Data Model

```
Draw
---
id                uuid pk
tournament_id     uuid fk → Tournament
status            enum ('draft', 'published')
created_at        timestamptz
published_at      timestamptz nullable
created_by        uuid fk → User (TO)

DrawSeed (auto-saved, persistent)
---
id                uuid pk
draw_id           uuid fk → Draw
team_id           uuid fk → Team
seed_position     int (1..N)
created_at        timestamptz
updated_at        timestamptz

Match (within a draw)
---
id                uuid pk
draw_id           uuid fk → Draw
round             int (1 = first round, increasing toward final)
position          int (match position within round, 1-indexed)
match_type        enum ('standard', 'third_place') default 'standard'
team_a_id         uuid nullable fk → Team
team_b_id         uuid nullable fk → Team (null = bye)
team_a_seed       int nullable
team_b_seed       int nullable
winner_team_id    uuid nullable fk → Team
next_match_id     uuid nullable fk → Match
next_match_slot   text nullable ('team_a' or 'team_b')
status            enum ('bye','upcoming','in_progress','completed','retired','walkover')
scheduled_court   text nullable
scheduled_at      timestamptz nullable
set1_team_a       int nullable
set1_team_b       int nullable
set2_team_a       int nullable
set2_team_b       int nullable
set3_team_a       int nullable
set3_team_b       int nullable
winner_team_id    uuid nullable fk → Team
scored_at         timestamptz nullable
scored_by         uuid nullable fk → User
created_at        timestamptz
updated_at        timestamptz
```

---

## 5 · Scoring Validation Rules

### 5.1 · Tournament Scoring Configuration

Two settings configured by TO at tournament creation:

| Setting | Options | Default |
|---|---|---|
| Match format | Best-of-1 / Best-of-3 | Best-of-3 |
| Last-set rule | Full set / Tiebreak / Super tiebreak | Super tiebreak |

- **Best-of-1**: single set. The last-set rule applies to this set.
- **Best-of-3**: first to win 2 sets. Sets 1-2 are standard. Set 3 follows the last-set rule.

### 5.2 · Standard Set Validation

| Winner score | Valid loser scores | Notes |
|---|---|---|
| 6 | 0, 1, 2, 3, 4 | Straight win |
| 7 | 5, 6 | 7-5 = broke serve after 5-5; 7-6 = tiebreak |

Invalid: winner < 6, loser > winner, both at 6, winner at 7 with loser < 5 or > 6, winner > 7.

### 5.3 · Tiebreak Validation (last set, `last_set_rule = 'tiebreak'`)

```
Valid if:
  winner_score >= 7
  AND loser_score >= 0
  AND winner_score - loser_score >= 2
  AND (winner_score == 7 OR loser_score >= 6)

Valid:   7-0, 7-3, 7-5, 8-6, 9-7, 15-13
Invalid: 7-6 (not win by 2), 6-4 (winner < 7)
```

### 5.4 · Super Tiebreak Validation (last set, `last_set_rule = 'super_tiebreak'`)

```
Valid if:
  winner_score >= 10
  AND loser_score >= 0
  AND winner_score - loser_score >= 2
  AND (winner_score == 10 OR loser_score >= 9)

Valid:   10-0, 10-5, 10-8, 11-9, 15-13
Invalid: 10-9 (not win by 2), 9-7 (winner < 10)
```

### 5.5 · Match-Level Validation

```
Best-of-3:
  1. Match has exactly 2 or 3 sets
  2. Match winner = first team to win 2 sets
  3. If 2 sets: same team won both
  4. If 3 sets: each team won exactly one of the first two sets (split)
  5. Sets 1-2: standard set validation
  6. Set 3: validated per tournament's last_set_rule
  7. Set 3 is only valid if sets 1-2 were split

Best-of-1:
  1. Match has exactly 1 set
  2. Set validated per tournament's last_set_rule
  3. Winner of the set = match winner

Errors:
  - Split sets but no set 3 → "Set 3 is required when sets are split"
  - Same team won sets 1-2 but set 3 entered → "Set 3 should not be played — [team] already won"
  - Set 3 doesn't match last_set_rule → "Set 3 must be a [full set / tiebreak / super tiebreak]"
```

### 5.6 · Retirement

- TO enters scores as they stand (may be partial — e.g., one set completed, second set in progress)
- TO marks "Retired" and selects which team retired
- Partial scores are stored and displayed (e.g., "6-4, 3-2 RET")
- Opponent wins the match and advances
- Score validation is **relaxed** for retired matches — any score values are accepted since the match didn't complete normally

### 5.7 · Score Entry UI

```
┌────────────────────────────────────────────────────────┐
│ Quarter-Final · Court 1 · 10:30                        │
│                                                        │
│ Team A: Player 1 + Player 2                            │
│ Team B: Player 3 + Player 4                            │
│                                                        │
│ Set 1:  [_6_] - [_4_]                                  │
│ Set 2:  [_3_] - [_6_]                                  │
│ Set 3:  [_10_] - [_8_]  (Super tiebreak)               │
│                                                        │
│ ┌─────────────────────────────────────────────┐        │
│ │ Sets tied 1-1 — deciding super tiebreak     │        │
│ │ Team B leads the match                      │        │
│ └─────────────────────────────────────────────┘        │
│                                                        │
│ Winner: Team B (auto-calculated)                       │
│                                                        │
│ [Submit score]    [Retired ▼]    [Walkover ▼]          │
└────────────────────────────────────────────────────────┘

- Set 3 fields appear only when sets 1-2 are split
- Set 3 label shows the tournament's last-set rule
- Running summary updates as TO types ("Team A leads 1-0", "Sets tied 1-1")
- Winner auto-calculated client-side
- Validation runs on submit; errors inline
- "Retired" dropdown: "Team A retired" / "Team B retired"
- "Walkover" dropdown: "Team A withdrew" / "Team B withdrew"
```

---

## 6 · Realtime Architecture

### 6.1 · Channel Design

One channel per tournament for everything (bracket updates + tournament status + presence):

```
Channel: tournament:{tournament_id}:bracket
```

### 6.2 · Message Payload

```typescript
type BracketUpdate = {
  type: 'match_update' | 'tournament_status'
  tournament_id: string
  tournament_status: 'live' | 'completed'
  viewers_count: number
  updated_matches: Array<{
    match_id: string
    round: number
    position: number
    match_type: 'standard' | 'third_place'
    status: 'upcoming' | 'in_progress' | 'completed' | 'retired' | 'walkover'
    team_a: { team_id: string, player_names: string[], seed: number | null } | null
    team_b: { team_id: string, player_names: string[], seed: number | null } | null
    set1_team_a: number | null
    set1_team_b: number | null
    set2_team_a: number | null
    set2_team_b: number | null
    set3_team_a: number | null
    set3_team_b: number | null
    winner_team_id: string | null
    scheduled_court: string | null
    scheduled_at: string | null
  }>
  placements: Array<{
    rank: number
    team_id: string
    player_names: string[]
  }> | null
  timestamp: string
}
```

Payload is **self-contained** — includes player/team names, not just IDs.

### 6.3 · Broadcast Triggers

| Event | Matches in payload |
|---|---|
| TO enters a score | Scored match + next match (new team populated) |
| TO marks walkover | Walkover match + next match |
| TO marks retirement | Retired match + next match |
| TO marks in_progress | Just that match |
| TO edits score (winner changes) | All cascade-affected matches |
| TO undoes walkover | All cascade-affected matches |
| Tournament completes | Final match + placements array |
| Tournament reopened | Tournament status update |

### 6.4 · Presence / Viewer Count

- Supabase Realtime Presence tracks connected clients on the channel
- Spectator mode displays "47 watching" (updated live)
- TO scoring tab also shows viewer count
- No authentication required to be counted — public spectators included

### 6.5 · Edge Function Flow (Score Submission)

```
1. TO submits: POST /api/matches/{match_id}/score
   Body: { set1_team_a, set1_team_b, set2_team_a, set2_team_b,
           set3_team_a?, set3_team_b?, retired_team_id? }

2. Edge Function:
   a. Verify TO is the tournament organizer or admin (RLS + role check)
   b. Verify match status is 'upcoming' or 'in_progress'
   c. Validate scores per §5 rules (relaxed if retirement)
   d. Determine winner from scores (or non-retiring team)
   e. BEGIN TRANSACTION:
      - Update Match: scores, winner, status, scored_at, scored_by
      - Find next_match via next_match_id
      - Populate winner into next_match_slot
      - If 3rd-place match enabled + both semis done → create 3rd-place match
      - Write audit log row
      - If tournament completion criteria met → update Tournament.status, derive placements
   f. COMMIT
   g. Broadcast BracketUpdate on Realtime channel
   h. Return 200 { match, next_match, tournament_status }
```

### 6.6 · Client Behavior

```
On mount:
  1. Fetch full bracket state via GET /api/tournaments/{id}/bracket
  2. Render bracket
  3. Subscribe to Realtime channel
  4. Join Presence (increment viewer count)

On Realtime message:
  1. Merge updated_matches into local state
  2. Re-render affected match nodes
  3. Update viewer count from presence

On disconnect:
  1. Show "Reconnecting..." indicator
  2. On reconnect: fetch full bracket state (catch missed updates)
  3. Remove indicator

On unmount:
  1. Unsubscribe from channel
  2. Leave Presence
```

### 6.7 · Spectator Mode

When `?spectator=true` is in the URL:
- **Hide**: global nav, header, footer, registration CTAs, settings
- **Show**: tournament name (large), bracket (maximized to viewport), viewer count
- Typography: `clamp()` based sizing for TV readability (1080p target)
- No interaction needed — display only
- No login required — public URL, shareable and bookmarkable
- Scores visible on completed matches within bracket nodes

---

## 7 · Match Scheduling

### 7.1 · Time Slot Configuration

| Setting | Detail |
|---|---|
| Grid increment | 15-minute slots (9:00, 9:15, 9:30...) |
| Duration per round | TO configures estimated match duration per round |
| Duration dropdown | 15 / 30 / 45 / 60 / 75 / 90 / 105 / 120 minutes |
| No break between matches | Matches can be scheduled back-to-back |

### 7.2 · Round Duration Configuration

TO sets this before scheduling:

```
Example for a 16-player tournament:

| Round             | Duration  | Matches |
|-------------------|-----------|---------|
| Round 1           | [45 min]  | 8       |
| Quarter-finals    | [60 min]  | 4       |
| Semi-finals       | [60 min]  | 2       |
| 3rd-place match   | [60 min]  | 1       |
| Final             | [90 min]  | 1       |
```

### 7.3 · Grid Structure

```
┌──────────┬────────┬────────┬────────┬────────┬────────┬────────┬────────┐
│          │  9:00  │  9:15  │  9:30  │  9:45  │ 10:00  │ 10:15  │ 10:30  │
├──────────┼────────┴────────┴────────┼────────┴────────┴────────┼────────┤
│ Court 1  │ R1-M1 (45 min)          │ R1-M3 (45 min)          │        │
├──────────┼────────┴────────┴────────┼────────┴────────┴────────┼────────┤
│ Court 2  │ R1-M2 (45 min)          │ R1-M4 (45 min)          │        │
├──────────┼────────┬────────┬────────┼─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┼────────┤
│ Court 3  │        │        │        │ ██ UNAVAILABLE ████████ │        │
└──────────┴────────┴────────┴────────┴─────────────────────────┴────────┘

Unscheduled: [QF-1] [QF-2] [QF-3] [QF-4] [SF-1] [SF-2] [3rd] [Final]
```

- **Rows**: courts from venue (by court name)
- **Columns**: 15-minute time slots
- **Matches**: span their configured round duration across multiple cells
- **Unscheduled panel**: sidebar/bottom with draggable match cards

### 7.4 · Court Availability

- TO can block out time ranges per court (click + drag on empty cells, or right-click → "Block time")
- Blocked cells grayed out, cannot accept match drops
- Auto-scheduler respects blocked ranges
- TO can unblock at any time

### 7.5 · Multi-Day Support

- Day selector tabs at top (Day 1, Day 2, ...)
- Days derived from tournament start_date to end_date
- Configurable start/end time per day (default 09:00-18:00)

### 7.6 · Conflict Detection

| Conflict | Detection | Visual |
|---|---|---|
| Player double-booked | Same player in two matches with overlapping times | Both matches highlighted red + warning |
| Insufficient gap | Player's matches in adjacent slots (no break) | Yellow warning (non-blocking) |
| Bracket dependency | Match scheduled before its feeder match | Orange warning "Depends on [QF-1] which hasn't been scheduled yet" |
| Court blocked | Match dragged onto blocked cells | Drop rejected |

### 7.7 · Auto-Schedule Algorithm

TO clicks "Auto-schedule" → algorithm places all unscheduled matches:

```
Inputs:
  - Matches grouped by round (with bracket dependencies)
  - Available courts (from venue, minus blocked ranges)
  - Round durations (configured by TO)
  - Tournament start/end times per day

Rules:
  1. Respect bracket order — match cannot start before feeder matches complete
  2. Distribute matches across courts evenly
  3. Avoid player back-to-back — minimum one slot gap between a player's matches
  4. Fill courts left-to-right, rounds top-to-bottom
  5. If matches don't fit in one day, overflow to next day

Output:
  - Each match assigned court + start time
  - Grid renders with matches spanning their duration
```

### Manual Adjustments

- TO can drag any match after auto-scheduling
- "Auto-schedule remaining" — only places unscheduled matches, preserves manual placements
- "Re-auto-schedule all" — starts over (confirm dialog)
- Conflict detection always active

### 7.8 · Scheduling Data

Written to the `Match` row:
- `scheduled_court` (text — court name from venue)
- `scheduled_at` (timestamptz — start time)

No separate schedule table.

### 7.9 · Bracket Changes After Scheduling

When a match completes and winner advances:
- Next match may already be scheduled or not
- If not scheduled → appears in "Unscheduled" panel
- If already scheduled → stays in its slot
- "My next match" card updates for affected players

---

## 8 · Edge Functions Inventory

### 8.1 · PostgREST (Direct Supabase Client, RLS-Gated)

Read operations: list tournaments, get tournament detail, get bracket, get registrations, list venues, search users.

Simple writes: create/update tournament (draft), create venue, update profile.

### 8.2 · Edge Functions

| Function | Route | Purpose |
|---|---|---|
| tournament-publish | POST /api/tournaments/{id}/publish | State transition + appears in public list |
| tournament-close-registration | POST /api/tournaments/{id}/close-registration | Expires pending invites + state transition |
| tournament-reopen-registration | POST /api/tournaments/{id}/reopen-registration | Reopens registration + unpublishes draw if published |
| tournament-start | POST /api/tournaments/{id}/start | State transition + activates scoring |
| tournament-reopen | POST /api/tournaments/{id}/reopen | Completed → live for score corrections |
| tournament-cancel | POST /api/tournaments/{id}/cancel | Voids registrations + batch cancellation emails |
| register-solo | POST /api/tournaments/{id}/register | Capacity check + auto-waitlist |
| register-doubles | POST /api/tournaments/{id}/register-doubles | Capacity check + partner invite email |
| add-partner | POST /api/registrations/{id}/add-partner | Convert solo → doubles + invite email |
| remove-partner | POST /api/registrations/{id}/remove-partner | Convert doubles → solo + notify partner |
| invite-respond | POST /api/invites/{token}/respond | Token validation + registration state + emails |
| withdraw | POST /api/registrations/{id}/withdraw | Void registration + waitlist promotion + emails |
| waitlist-promote | POST /api/registrations/{id}/promote | TO manually promotes out of FCFS order |
| generate-draw | POST /api/tournaments/{id}/draw/generate | Bracket generation algorithm |
| publish-draw | POST /api/tournaments/{id}/draw/publish | State transition + draw published email |
| unpublish-draw | POST /api/tournaments/{id}/draw/unpublish | Draw hidden, state → registration_closed |
| submit-score | POST /api/matches/{id}/score | Validation + cascade + Realtime broadcast |
| submit-walkover | POST /api/matches/{id}/walkover | Cascade + Realtime broadcast |
| undo-walkover | POST /api/matches/{id}/undo-walkover | Cascade reset + Realtime broadcast |
| submit-retirement | POST /api/matches/{id}/retire | Partial scores + cascade + Realtime |
| override-placements | POST /api/tournaments/{id}/placements | Audit-logged override |

### 8.3 · Common Patterns

All Edge Functions:
1. **Auth check**: verify JWT via Supabase
2. **Role check**: organizer for TO actions, admin for admin actions (admin can do everything TO can)
3. **State check**: tournament/match in correct state
4. **Transactional writes**: multi-row updates in a transaction
5. **Audit log**: row for every state-changing operation
6. **Email dispatch**: via Resend API (non-blocking)
7. **Realtime broadcast**: where applicable

---

## 9 · Email Notification Triggers

| # | Template | Trigger | Recipient | Data in email |
|---|---|---|---|---|
| 1 | Application received | TO submits organizer application | Applicant | Name, submission date |
| 2 | Application approved | Admin approves | Applicant | Name, link to create first tournament |
| 3 | Application rejected | Admin rejects | Applicant | Name, rejection reason |
| 4 | Registration confirmed | Solo register or doubles accept | Player (+ partner) | Tournament name, dates, venue |
| 5 | Partner invite | Player invites doubles partner | Partner | Tournament name, inviter name, magic link |
| 6 | Partner removed | Doubles player removes partner | Removed partner | Tournament name, notification |
| 7 | Waitlist promotion | Player promoted from waitlist | Player | Tournament name, "you're in!" |
| 8 | Draw published | TO publishes draw | All registered players | Tournament name, link to bracket |
| 9 | Tournament cancelled | TO cancels tournament | All registered players | Tournament name, cancellation notice |
| 10 | Partner declined | Partner declines invite | Inviter | Tournament name, partner name |
| 11 | Invite expired | Registration closed while invite pending | Inviter | Tournament name, notification |

All emails: Resend templates, i18n-keyed (TH + EN).

---

## 10 · Organizer Dashboard

### Layout

**Stats bar** (top):
- Total tournaments created
- Total players across all tournaments
- Active tournaments right now (live count)
- Next upcoming tournament (name + date countdown)

**Tournament cards grouped by status:**

| Section | Sort | Notes |
|---|---|---|
| Live now | By start date | Prominent, top of page |
| Drafts | By last edited | Subtle "draft" badge |
| Upcoming | By start date ascending | Registration open, closed, or published |
| Past | By end date descending | Completed + cancelled |

**Each card**: tournament name, status badge, dates, venue, registration count vs draw size, quick action button per status.

**Empty state**: welcome message, "Create your first tournament" CTA, quick-start bullets.

---

## 11 · Landing Page

### Structure

1. **Hero**: "Matchday" + tagline "Tournament operations for Asia-Pacific padel" + "Sign up" (primary) + "Browse tournaments" (secondary)
2. **Live activity**: dynamic count of upcoming tournaments, or "Coming soon" if early days
3. **How it works — three perspectives**: Players / Organizers / Venues with feature bullets
4. **Feature highlights**: live bracket, spectator mode, social sign-in, Thai + English
5. **TO recruitment**: "Running a tournament? Apply to be an organizer — it's free" → `/organizer/apply`
6. **Footer**: logo, privacy, terms, contact, language switcher (TH/EN), "Part of The Padel Society ecosystem"

---

## 12 · Admin Panel

### Pages

| Page | Route | Purpose |
|---|---|---|
| Dashboard | `/admin` | Stats + action items + recent activity |
| TO applications | `/admin/organizer-applications` | Paginated list |
| Application detail | `/admin/organizer-applications/[id]` | Full form + approve/reject |
| Audit log | `/admin/audit-log` | Searchable, filterable log |
| Users | `/admin/users` | User list, search, view profile, revoke organizer role |
| User detail | `/admin/users/[id]` | Profile view + role management |

### Dashboard Content

**Stats bar**: total users, total organizers, pending TO applications (badge), total tournaments, live tournaments.

**Action items**: pending TO applications (newest first, click-through).

**Recent activity feed**: last 20 audit log entries (timestamp, actor, action, subject).

**Platform health**: Sentry error count link, active Realtime connections.

### Tournament Access

Admin has **full edit + score access** to any tournament — same UI as the TO management hub. Admin can also cancel any tournament.

### User Management

- Searchable user list
- View any user's profile
- Revoke organizer role (removes `organizer` from `User.roles`, audit-logged)

### Audit Log Page

- **Filter by**: event type, actor, tournament, date range
- **Search by**: player name, tournament name, admin name
- **Each row**: timestamp, actor (name + role), action, subject, before/after snapshot
- **Export**: CSV download

---

## 13 · Navigation Map

### Public (Unauthenticated)

```
Landing page (/)
  ├─ Sign in (/login) → Auth flow → Player home
  ├─ Browse tournaments (/tournaments)
  │   └─ Tournament detail (/tournaments/[id]) — public view
  │       └─ "Sign in to register" → auth → return
  └─ Spectator mode (/tournaments/[id]?spectator=true)
```

### Player (Authenticated)

```
Player home (/)
  ├─ Tournament list (/tournaments)
  │   └─ Tournament detail (/tournaments/[id])
  │       ├─ Register solo / with partner
  │       ├─ Withdraw (registration_open only)
  │       ├─ Add / remove partner (registration_open only)
  │       ├─ View live bracket (Realtime)
  │       └─ View "my next match" card
  ├─ My registrations (/me/registrations)
  ├─ Settings (/me/settings)
  └─ Apply to be organizer (/organizer/apply)
```

### Tournament Organizer

```
Organizer dashboard (/organizer)
  ├─ Create tournament (/organizer/tournaments/new)
  └─ Tournament management hub (/organizer/tournaments/[id])
      ├─ Details tab — edit tournament info
      ├─ Registrations tab — manage entry list + waitlist
      ├─ Draw tab — seed players, generate bracket, publish
      ├─ Schedule tab — round durations, auto-schedule, court grid
      ├─ Scoring tab (live only) — enter scores, view live bracket
      └─ Placements tab (completed only) — view/override placements
```

### Admin

```
Admin dashboard (/admin)
  ├─ TO applications (/admin/organizer-applications)
  │   └─ Application detail → approve/reject
  ├─ Users (/admin/users)
  │   └─ User detail → view profile, revoke role
  ├─ Audit log (/admin/audit-log)
  └─ Any tournament hub (full edit/score access)
```

---

*End of Matchday v1 Detailed Specifications*
