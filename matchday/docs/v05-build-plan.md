# Matchday v0.5.0 — "Draw Engine + Public Bracket" Build Plan

> **Status:** DRAFT v3 — D-decisions answered 2026-04-28. **All 15 = recommended defaults. Zero overrides.** Ready for execution gate.
> **DRAFT v2:** stress-tested by Plan + Architect review lenses; 18 findings applied (6 critical, 12 important); 4 nits documented in change-log.

## D-decision answers (locked 2026-04-28)

| # | Choice |
|---|---|
| D1 | Lift to 128 power-of-2 only |
| D2 | v0.5 introduces match table (structural cols only; v0.6 adds scoring) |
| D3 | Postgres RPC `generate_draw_rpc` for atomic seed→slot+bye+match-INSERT |
| D4 | PL/pgSQL recursive-halving algorithm |
| D5 | Top-seed-first bye placement (spec §4.3) |
| D6 | One-way publish in v0.5 (no Unpublish; spec §1 transition deferred to v0.6) |
| D7 | No revision history — regenerate DELETEs old + INSERTs new |
| D8 | Plain pseudo-random auto-fill (no seed) |
| D9 | Two-panel seeding UI + bracket preview below |
| D10 | Server-render initial HTML; no ISR |
| D11 | `/[locale]/tournaments/[org-slug]/[t-slug]/bracket` sub-path |
| D12 | Reserve `?spectator=true` query param (read but ignore in v0.5; v0.8 wires the CSS) |
| D13 | dnd-kit KeyboardSensor + 'Set seed for [team]' dropdown fallback (both) |
| D14 | 404 on draft / unpublished tournaments (don't leak existence) |
| D15 | `tournament.draw_published` email to confirmed + waitlisted (one template, conditional line) |


> **Predecessor:** v0.4.0 Registration (in build per `Plans/v04-build-plan.md` DRAFT v3; Phase A code-complete with B19-B35; Phase B in flight). v0.5.0 is executable independently of v0.4 ship status — migrations are forward-only and don't change v0.4 surfaces.
> **Cross-version dep (post-stress-test P-F05):** B42 publish_draw_rpc invokes v0.4's `sweep_pending_partner_invites_rpc` (B33b). Phase A v0.5 cannot start until v0.4 B33b is on main. Verified during gate.
> **DoD:** A published bracket renders correctly to an unauthenticated viewer for both power-of-2 and non-power-of-2 draw sizes.
> **External-prereq risk:** Low. v0.5 has no new Pap-prereqs beyond what v0.4 already requires (Resend activation; otherwise dev-fallback console-logs the send for the new `draw_published` template). No new third-party SaaS, no new OAuth providers, no new infra.

---

## 1 · Scope

In-scope (per `Plans/version-roadmap.md` v0.5.0 + `matchday-v1-detailed-specs.md` §4 Draw Generation Algorithm + `matchday-build-prompt.md` §7.2 TO-V1-04, TO-V1-05, TO-V1-07, TO-V1-08 + ISC-43, 44, 46, 49, 50, 50b, 52):

1. **Bracket sizing 4-128** — TO chose `draw_size` at tournament create time (v0.3 W27, currently capped at 64 per v0.3 D8 — **D1 here** asks whether to lift the cap to 128). Spec §4.1 examples illustrate sizes 4/8/16/32/64 (powers of 2) plus arbitrary non-power-of-2 confirmed counts producing byes (e.g., N=12, draw_size=16 → 4 byes).
2. **Bye placement algorithm** — top seeds receive first-round byes per spec §4.3 (e.g., 12 in 16-slot bracket → seeds 1-4 get byes; seeds 5-12 play Round 1). Bye = `match.team_b_id IS NULL` AND `match.status='bye'`. Seeded team auto-advances populated into next match's slot at draw-generation time.
3. **Manual drag-drop seeding UI** — TO-V1-04. Two-panel "Unseeded players/teams" (left, draggable) + "Seed slots 1..N" (right, drop targets). Every drag auto-saves immediately (no Save button). Per spec §4.5: TO can leave and return — assignments persist exactly as left. Built on `dnd-kit` per matchday-web/CLAUDE.md anti-patterns rule. **D-decision** on UX shape (full-bracket vs seed-slot picker) below.
4. **"Auto-fill remaining" button** — randomly assigns unseeded teams to empty slots; can regenerate; does NOT touch manually-seeded slots. Per spec §4.5 step 4.
5. **Draw as persistent document** — `draw` table separate from `tournament` (canonical schema lines 348-356). `draw.status` = `'draft'` (TO working) → `'published'` (visible to players). `draw_seed` rows are auto-saved per drag (canonical schema lines 363-372). Decoupled from tournament state — `tournament.status` flips independently when draw publishes.
6. **Draw-generate action** — generate-draw Edge Function (per spec §8.2). Validates all seed slots filled (or warns about unseeded; offers auto-fill); seed-to-slot mapping per spec §4.2 (recursive halving — seeds 1 vs N, 2 vs N-1, etc., maximally separated); bye placement per §4.3; INSERT all `match` rows for the bracket with `next_match_id` + `next_match_slot` populated for bracket progression. Idempotent: regenerating DELETES old matches + INSERTs new ones in a single txn (per TO-V1-07 + spec §1 "Regenerate bracket" row).
7. **Draw-regenerate while seed assignments persist** — TO-V1-07. New registrations between generate and publish appear in "Unseeded players" panel; existing seed assignments preserved (per spec §1 "Reopen registration" + §4.5 step 3).
8. **Draw-publish action** — TO-V1-08 + ISC-50. publish-draw Edge Function: in single txn, set `draw.status='published'` + `draw.published_at=now()` + flip `tournament.status` from `registration_open`/`registration_closed` → `published` + `tournament.published_at=now()`. Publish auto-closes registration if open (spec §1 valid-transitions row). Send `draw_published` email to all registered players (ISC-50b).
9. **Public read-only bracket view** at `/[locale]/tournaments/[organizer-slug]/[tournament-slug]/bracket` (mirrors v0.4 D12 vanity URL pattern). Renders via `@g-loot/react-tournament-brackets` per matchday-web/CLAUDE.md (NOT hand-rolled — ISC-46). Server-render initial HTML; subscribes to nothing in v0.5 (page-refresh per roadmap; realtime arrives v0.8). Unauthenticated viewers see the bracket. Bye nodes visualized clearly.
10. **Match table introduction (structure only, no scoring)** — v0.5 introduces the `match` table per canonical schema lines 377-415. v0.5 writes: `id`, `draw_id`, `tournament_id`, `round`, `position`, `match_type`, `team_a_id`, `team_b_id`, `team_a_seed`, `team_b_seed`, `next_match_id`, `next_match_slot`, `status` (only `'bye'` and `'upcoming'` in v0.5; the other values are v0.6 scope). v0.5 leaves null: `scheduled_court`, `scheduled_at`, `set*_team_*`, `winner_team_id`, `retired_team_id`, `scored_at`, `scored_by`. **D-decision**: confirm match table introduced now (v0.5) vs deferred to v0.6.
11. **TO draw tab on management hub** — new "Draw" tab on `/organizer/tournaments/[org-slug]/[t-slug]` (the slug-URL canonicalized in v0.4 W33). Shows seeding UI, draw preview, regenerate button, publish button. Disabled when tournament status not in (`registration_open`, `registration_closed`).
12. **Cross-cutting DoD** — a11y (keyboard fallback for drag-drop seeding per W23/W31 carried obligation), Sentry, audit, i18n (TH+EN, TH placeholders carry the v0.1/0.2/0.3/0.4 native-speaker review TODO).

Out-of-scope (defer per roadmap):

- Live scoring / per-set entry / match state machine (`upcoming` → `in_progress` → `completed`, etc.) → v0.6
- Bracket cascade on score (winner_team_id auto-advance to next_match) → v0.6 (the FK structure ships in v0.5 but populating winners is v0.6)
- Match scheduling — `scheduled_court`, `scheduled_at` writes + court×time grid UI → v0.7
- Realtime bracket updates / Supabase Realtime channel `tournament:{id}:bracket` → v0.8
- Spectator mode (`?spectator=true` shorthand UI — hidden nav, enlarged bracket, TV-ready) → v0.8
- Placements auto-derive (1st/2nd/3rd) → v0.9
- Manual placement override → v0.9
- 3rd-place match auto-creation on semi-finals completion → v0.6 (the `match_type='third_place'` enum exists; v0.5 does NOT auto-create the 3rd-place match — TO sets `tournament.has_third_place_match=true` at create time but the match row is created in v0.6 when the second semi-final completes)
- Double-elimination format → v2+ (canonical schema reserves the enum value)
- Tournament `live` state transition → v0.6 (TO-V1-09)
- Draw unpublish UI/path → v0.6 (the canonical Edge Function `unpublish-draw` exists in §8.2 but the v0.5 publish action is one-way; D-decision below)
- Post-publish bracket edits (player swaps, schedule changes) → v0.6+ (ISC-51, 52)
- "My next match" card → v0.7 (ISC-58, 59)
- Email `draw_unpublished` → not in v0.5 (publish is one-way per D-decision)
- Match status transitions other than `bye` ↔ `upcoming` → v0.6

---

## 2 · External Prerequisites — gate questions for Pap

### Real-world account/process work

| # | Prereq | Risk | Required for | Action |
|---|--------|------|--------------|--------|
| P1 | **Resend account activation** | Carried from v0.2/v0.3/v0.4 — same blocker | Real `draw_published` emails. Without it, send-function logs to console (dev-fallback). | No new action — covered by v0.4. |
| P2 | **`SUPABASE_ACCESS_TOKEN` repo secret** | Already set during v0.3 | Auto-types regen + prod migration push | No new action. |
| P3 | **`@g-loot/react-tournament-brackets` package addition** | None — npm install only | Phase B bracket render | `bun add @g-loot/react-tournament-brackets` in matchday-web at W45. |
| P4 | **`dnd-kit` package addition** | None — npm install only | Phase B drag-drop seeding | `bun add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities` in matchday-web at W47. |
| P5 | **Bundle size budget** | Soft — `@g-loot/react-tournament-brackets` ~80 KB gzipped per public docs; dnd-kit ~30 KB | Confirm Lighthouse budget headroom on the bracket page | Measure post-W45/W47; document in DECISIONS.md if any budget breach. |

### Decisions needed from Pap (asked one at a time at the gate)

| # | Decision | Options |
|---|----------|---------|
| D1 | **Draw size cap — 64 vs 128** | Keep v0.3 D8 cap of 64 (current `tournament.draw_size` validator) — sufficient for v1 padel scale per spec §4.1 examples · Lift to 128 per roadmap text ("4-128, top seeds get byes") — matches spec §4.1 "or custom" line · Explicit allowed-set: 4, 8, 16, 32, 64, 128 (power-of-2 only — simpler validator) · Allow any integer ≥ 4 (true custom; spec hints at this) — most flexible but messier UI |
| D2 | **Match table introduction in v0.5 vs v0.6** | **v0.5 (recommended)** — bracket IS a tree of matches; the rows MUST exist for `@g-loot/react-tournament-brackets` to render anything. v0.5 writes just the structural columns; v0.6 adds scoring. Defers nothing material. · Defer entirely to v0.6 — v0.5 stores bracket as JSON in `draw.bracket_json`; v0.6 migrates JSON → match rows. Adds a JSON shape that v0.6 immediately deletes. Strongly disrecommended. |
| D3 | **Generate-draw transactionality** | **Postgres RPC function (recommended; mirrors v0.4 D14)** — `public.generate_draw_rpc(p_tournament_id)` does seed-to-slot mapping + bye placement + match INSERTs in a single PG txn; Edge Function becomes thin auth + audit + email wrapper. · Edge Function with multi-statement supabase-js — risk of partial state if the function crashes mid-INSERT for a 64-match bracket. |
| D4 | **Seed-to-slot mapping algorithm location** | **Postgres function (recommended)** — recursive-halving algorithm in PL/pgSQL inside the RPC; deterministic, testable in SQL, no client-side variance. · Edge Function (Deno/TS) — easier to write and unit-test; downside is duplicated logic if RPC also references it. · Client-side (TS) — strongly disrecommended; can't be re-validated server-side; spec violations slip through. |
| D5 | **Bye placement determinism** | **Top-seed-first (canonical per spec §4.3)** — seeds 1..byes_count receive byes; seeds (byes_count+1)..N play Round 1. **Recommended** — matches spec exactly. · Distribute byes through the bracket (top-half/bottom-half balance) — slightly more "fair-feeling" but spec is explicit; deviates from canonical tournament practice. |
| D6 | **Draw publish atomicity / un-publish path** | **Publish is one-way in v0.5** — once published, the only way to revert is regenerate-then-publish replaces. Tournament status flip `registration_open` / `registration_closed` → `published` is the same txn. **Recommended** — simplest; no half-states. **Spec §1 "published → registration_open" transition deferred to v0.6.** · Reversible publish — provide an "Unpublish" button that flips status back. Adds the unpublish-draw Edge Function from spec §8.2 to v0.5 scope. Adds risk: published_at semantics (clear or preserve?), email storm on re-publish. |
| D7 | **Draw revision history** | None — regenerate DELETES old `match` rows + INSERTs new (single txn). Audit log row records `draw.regenerated`. Recommended for v0.5 simplicity. · Soft-delete old matches — adds `match.replaced_by_draw_revision` column; growth concern; un-needed in v1. · Snapshot on publish — write a JSON snapshot of the published bracket to `draw.published_snapshot` for forensic recovery. Light-weight insurance. **Mid-recommended.** |
| D8 | **Auto-fill randomness** | Pseudo-random with no seed — different result each click; matches spec §4.5 "can regenerate for new random". · Seedable via `random_seed` query param — testability win; UX no-op for TO. · `crypto.randomUUID()`-derived ordering — unguessable but irrelevant for fairness. **D8 recommendation:** plain pseudo-random; no seed. |
| D9 | **Seeding UI shape** | **Two-panel (canonical per spec §4.5)** — left "Unseeded" + right "Seed slots 1..N". Recommended. · Bracket view with drag-drop directly on the bracket — visually richer but harder to a11y + dnd-kit complexity higher. Defer to v0.7+. · Hybrid: two-panel + bracket preview below — recommended **enhancement** (panel for seeding action; bracket preview for visualization). |
| D10 | **Bracket render performance** | **Server-render initial HTML (recommended)** — Next.js Server Component fetches matches + draws via RLS-respecting Supabase client; renders @g-loot bracket on the server; ships static HTML to viewer. Fast first paint; SEO-friendly. · Client-only React render — simpler to wire but slower first paint; bracket flickers on mount. · Vercel ISR cache (60s) — premature optimization in v0.5; adds cache-invalidation complexity for v0.8 realtime. **Recommend NO ISR in v0.5.** |
| D11 | **Public bracket route URL** | **`/[locale]/tournaments/[organizer-slug]/[tournament-slug]/bracket` (recommended)** — mirrors v0.4 D12 vanity-URL pattern; `/bracket` sub-path keeps the tournament detail page (`...[t-slug]`) for registration UI. · `/[locale]/tournaments/[organizer-slug]/[tournament-slug]` (root, no `/bracket`) — bracket replaces detail page once published; spec §1 hints at this ("Players see bracket + schedule" once `published`). Awkward when tournament is `live` and has a separate scoring tab. · Both routes (root + `/bracket`) — same content, alias. Adds canonicalization complexity. |
| D12 | **Spectator URL shorthand for v0.8** | **Reserve `?spectator=true` query param now (recommended)** — v0.5's bracket page reads but ignores the param (no nav-hide UI in v0.5); v0.8 adds the spectator-mode CSS. Future-proofs the URL shape. Documented in DECISIONS.md. · Defer entirely to v0.8 — no reservation. v0.8 may then break any pre-shared spectator-mode bookmarks if the param shape changes. |
| D13 | **Drag-drop a11y / keyboard fallback** | **Provide both: dnd-kit's `KeyboardSensor` (canonical) + a "Set seed for [team]" select dropdown as explicit fallback (recommended)** — matches WCAG AA + dnd-kit best practice. axe-verify. · dnd-kit KeyboardSensor only — accessible per WCAG but discoverability poor; user has to know the keyboard shortcut. · Mouse-only — fails WCAG AA; carries obligation from v0.3 W23/W31. **Reject.** |
| D14 | **Public bracket on draft tournaments** | **404 (recommended)** — bracket route requires `tournament.status='published'` AND `draw.status='published'`. Anything else returns 404 (don't leak existence). Mirror of v0.4 F13(k) "draft-tournament 404" pattern. · 403 Forbidden — leaks existence. Reject. · Show "Bracket not yet published" placeholder — leaks existence + creates expectations. Reject. |
| D15 | **Draw_published email cascade** | **Send to every confirmed + waitlisted registration (recommended)** — waitlisted players want to know they didn't get in (or did, if TO promoted them); spec §9 line 8 says "All registered players" (broadest interpretation). · Send only to confirmed — narrowest; spec ambiguous. · Send to confirmed + a separate `tournament_draw_published_waitlist` template to waitlisted players — overkill for v0.5; one template suffices with a conditional line. |

**Recommended defaults** (Pap can override):
- D1: Lift to 128 per roadmap text. Validator: `draw_size IN (4, 8, 16, 32, 64, 128)` (D1 sub-default = power-of-2 only — simplest; matches spec §4.1 "Bracket size options: 4, 8, 16, 32, 64, or custom" where "custom" is deferred to a later patch if a TO actually requests it).
- D2: **Introduce `match` table now in v0.5.** Bracket IS a tree of matches; @g-loot library expects match data in this shape; defers nothing.
- D3: Postgres RPC `generate_draw_rpc` mirrors v0.4 D14 pattern.
- D4: Seed-to-slot mapping in PL/pgSQL inside the RPC; deterministic + server-authoritative.
- D5: Top-seed-first per spec §4.3.
- D6: Publish is one-way in v0.5; revert path deferred to v0.6.
- D7: Plain regenerate (DELETE + INSERT). No revision history. Simple.
- D8: Plain pseudo-random; no seed param.
- D9: Two-panel (left unseeded / right seed slots) + bracket preview below.
- D10: Server-render initial HTML; no ISR.
- D11: `/[locale]/tournaments/[org-slug]/[t-slug]/bracket` sub-path.
- D12: Reserve `?spectator=true` query param now (silent in v0.5; activated in v0.8).
- D13: dnd-kit KeyboardSensor + explicit "Set seed for [team]" select dropdown fallback.
- D14: 404 on unpublished tournaments / draws.
- D15: Email all confirmed + waitlisted registrations on draw publish.

---

## 3 · Phased commit plan

Continuing v0.4's commit-numbered convention. Sequencing: Phase A backend → Phase B web (parallel-blitz where possible) → Phase C DoD ship.

### Phase A — Backend schema + draw RPCs + bracket-generation function + email + Edge Functions (matchday-backend) — gates Phase B

| Commit | Description |
|---|---|
| **B36** ✅ shipped `48d53f2` | 2 tables (`draw`, `draw_seed`) per canonical schema lines 348-372. RLS: `draw` published-or-organizer-only SELECT (per canonical "Published draws are public" + "TO can manage draws"); `draw_seed` public SELECT once draw exists (per canonical "Anyone can read published draw seeds" — spec §4.5 step 5: bracket preview is visible to TO during seeding; once published, also to public). INSERT/UPDATE/DELETE only via service role (Edge Functions in B39/B40/B41). FK `draw.tournament_id` ON DELETE CASCADE; `draw_seed.draw_id` ON DELETE CASCADE; `draw_seed.team_id` ON DELETE RESTRICT (teams cannot be deleted while seeded; would break referential integrity). Indexes per canonical. **Deviation from canonical:** `draw_seed` UPDATE/DELETE is service-role-only (canonical's "TO can manage draw seeds" replaced with Edge-Function-mediated to enforce auto-save through the Edge Function for audit + rate-limit). Documented in commit message. |
| **B37** ✅ shipped `b3d5c17` | **Match table introduction (D2 default).** Per canonical schema lines 377-423. v0.5 columns: `id`, `draw_id`, `tournament_id`, `round`, `position`, `match_type`, `team_a_id`, `team_b_id`, `team_a_seed`, `team_b_seed`, `next_match_id`, `next_match_slot`, `status`. v0.6 columns nullable: `scheduled_court`, `scheduled_at`, `set*`, `winner_team_id`, `retired_team_id`, `scored_at`, `scored_by`, `rating_delta_json`. RLS: public SELECT (brackets are public per canonical "Anyone can read matches"); service-role-only INSERT/UPDATE/DELETE (canonical's "TO can manage matches" replaced — v0.5 mediates all writes through the generate/publish RPCs; v0.6 will relax for in-game score entry). FK `next_match_id` self-referential ON DELETE SET NULL (cascading SET NULL ensures regenerate-draw doesn't cascade-delete unrelated rows). Indexes per canonical. |
| **B38** ✅ shipped `d54bf4e` | Confirm v0.5 audit_action enum values are all present (canonical lines 75-120 already include `draw.generated`, `draw.regenerated`, `draw.seed_updated`, `draw.published`). No ALTER TYPE needed if v0.4 B22's typed-FK migration already loaded canonical enums; this commit is a no-op test asserting `audit_action IN ('draw.generated','draw.regenerated','draw.seed_updated','draw.published','tournament.published','tournament.draw_published')`. **One ALTER TYPE if needed:** `tournament.published` and `tournament.draw_published` are both in canonical; verify both present. Add `match.created` if NOT in canonical (spec text doesn't enumerate it; expected behavior: structural creation rolls up into `draw.generated` audit, no per-match audit row). |
| **B39** ✅ shipped `5cfbcff+b244aa3` | **D3 amendment + A-A20 amendment + R15 amendment** — Postgres RPC `public.upsert_draw_seed_rpc(p_tournament_id uuid, p_team_id uuid, p_seed_position int)`. Pipeline (single txn): validate caller is `is_tournament_organizer(p_tournament_id)` OR admin; validate tournament status IN (`registration_open`, `registration_closed`); SELECT-or-INSERT draw row for tournament (status='draft', `created_by = auth.uid()` per A-A20 on first INSERT); **R15 amendment — same-team-on-different-slot path:** if `(draw_id, team_id)` row already exists at a different `seed_position`, DELETE that row first (canonical schema has `unique(draw_id, team_id)` constraint); then UPSERT `draw_seed (draw_id, team_id, seed_position)` ON CONFLICT (draw_id, seed_position) DO UPDATE SET team_id = EXCLUDED.team_id; emit `draw.seed_updated` audit. Returns `{draw_id, seed_position, team_id}`. Used by W47's drag-drop auto-save. Idempotent — same drag fires same upsert. |
| **B40** ✅ shipped `1eb9983+b244aa3` | Postgres RPC `public.remove_draw_seed_rpc(p_tournament_id, p_seed_position)`. Validates caller + status; DELETEs `draw_seed` row; emit `draw.seed_updated` audit (action subtype "removed" via `metadata` JSONB). Used by W47 when TO drags a team off a slot. |
| **B41** ✅ shipped `80d1df8+2885eee` | **D3 + D4 amendment — the load-bearing function.** Postgres RPC `public.generate_draw_rpc(p_tournament_id, p_auto_fill boolean default false)`. Pipeline (single txn): validate caller; SELECT FOR UPDATE on `tournament` row + draw + draw_seeds; check tournament status IN (`registration_open`, `registration_closed`); fetch `draw_size` from tournament; **A-A07 amendment:** fetch DISTINCT confirmed teams via `SELECT DISTINCT team_id FROM registration WHERE tournament_id=X AND status='confirmed'` (v0.4 D13 two-row mirror means doubles registrations have two rows per team_id — DISTINCT is mandatory). **A-A06 amendment:** also filter out orphan teams with no active registration (re-add-different-partner edge case from v0.4 §3.5 leaves old teams without active registration). Compute `N = distinct_teams.length`, `byes = draw_size - N`; **PL/pgSQL recursive seed-to-slot mapping** per spec §4.2 — for `bracket_size = draw_size`, generate the canonical bracket-position pairing (recursive halving: top half seeds 1..bs/2, bottom half bs/2+1..bs; within each half, seeds 1 + bs/2+1 are first-round opponents; etc.). **D5 bye placement** — top `byes` seeds (seeds 1..byes) receive `team_b_id=null, status='bye'`; their winner (=themselves) populated into next_match's slot at INSERT-time. **A-A09 amendment:** B41 populates `match.tournament_id` (denormalized per canonical schema line 380) on every INSERT. DELETE existing `match` rows for this draw (regenerate path; A-A03 confirms PG handles self-FK ordering within a single DELETE statement); INSERT new bracket rows with `next_match_id` + `next_match_slot` populated (back-fill on second pass). Set `draw.status='draft'`. Emit `draw.generated` audit (or `draw.regenerated` if matches existed before). Returns `{draw_id, match_count, bye_count}`. **Auto-fill remaining (D8):** if N < draw_size AND `p_auto_fill=true`, random-assign teams without a `draw_seed` row to remaining seed slots before the seed-to-slot mapping. Pseudo-random via `random()`. **Validation:** if N > draw_size → raise `draw_size_exceeded` (TO must increase draw_size first); if N=0 → raise `no_confirmed_registrations`. |
| **B42** ✅ shipped `c076806` | **D6 + A-A08 + A-A11 amendment — publish is one-way in v0.5.** Postgres RPC `public.publish_draw_rpc(p_tournament_id)`. Pipeline (single txn): validate caller + tournament status IN (`registration_open`, `registration_closed`); validate `draw` exists with `status='draft'` AND has matches generated (count(match) > 0); SET `draw.status='published'`, `draw.published_at=now()`; SET `tournament.status='published'`, `tournament.published_at=now()` (auto-closes registration if was open; matches spec §1 transition table); IF tournament had `status='registration_open'` invoke v0.4's `sweep_pending_partner_invites_rpc(p_tournament_id)` to expire pending invites + cancel pending_partner registrations (per spec §1 "**Auto-closes registration**; pending partner invites expire"); **A-A08 amendment:** emit `draw.published` audit only (NOT `tournament.draw_published` — redundant; canonical enum has both but draw.published is the canonical one). **A-A11 amendment:** Returns `{draw_id, published_at, tournament_id, organizer_slug, tournament_slug, registrations_to_email: [{user_id, locale}]}` — slugs included so B43/B45 can construct the bracket URL; locale per recipient included so per-user TH/EN template selection works. Caller (B43 Edge Function) iterates and emails. |
| **B43** ✅ shipped `e334dc4` | **A-A19 amendment** — Thin Edge Function wrapping B42 RPC. JWT-auth (caller is organizer + tournament's owner OR admin). After RPC commits, invoke B45 `send-draw-email kind='draw_published'` for every `(user_id, locale)` tuple in `registrations_to_email`. **Per-recipient idempotency** key `${tournament_id}:draw_published:${user_id}:v1` (NOT per-tournament — A-A19 fix: per-tournament key would block partial-failure retries; per-recipient lets a retry resume at the failed recipient). Tournament-level lock `${tournament_id}:publish-draw:v1` short-lived (advisory) prevents two concurrent publish-draw invocations. Sentry capture on failure. |
| **B44** ✅ shipped `55f0f9d` | Thin Edge Function wrapping B41 RPC. JWT-auth. body: `{tournament_id, auto_fill?: boolean}`. Returns RPC's structured response. Sentry capture on failure. |
| **B44a** ✅ shipped `0c6d0ca+6eb9ad2` | Thin Edge Function wrapping B39 RPC. JWT-auth. body: `{tournament_id, team_id, seed_position}`. Rate-limit 60/min/IP (TO drag-drop can be intensive). Returns `{ok: true}`. |
| **B44b** ✅ shipped `0c6d0ca+6eb9ad2` | Thin Edge Function wrapping B40 RPC. JWT-auth. body: `{tournament_id, seed_position}`. Same rate-limit as B44a. |
| **B45** ✅ shipped `a0ed2bf` | **P-F04 amendment** — New bilingual email template `draw_published.ts` (TH+EN) + `send-draw-email` Edge Function. Body includes tournament name + dates + venue + bracket URL (canonical slug-URL: `${SITE_BASE_URL}/${locale}/tournaments/${org_slug}/${t_slug}/bracket`). Single-kind discriminator `kind: 'draw_published'` (room reserved for v0.6's `draw_unpublished` etc.). JWT-auth + DB-unique-constraint idempotency keyed per recipient (A-A19). **P-F04 rate-limit semantics:** v0.4 B24's 3/h-per-actor rate-limit is BYPASSED when `actor_id == system OR caller has organizer role + tournament cascade context`; rate-limit applies on the `(actor_id, kind)` tuple but draw-cascade fires `(system_actor, draw_published)` once per tournament — a 64-recipient cascade is 64 idempotent send attempts under one logical "actor action". Document in `_shared/email.ts`. **Cascade observability:** if any single send fails, the whole cascade does NOT abort — Sentry capture per failure with `tournament_id` + `user_id` tags; a manual "Resend draw_published email to [user]" button on the TO Draw tab enables recovery (mirror of v0.4 W21 Resend pattern; deferred to v0.5.x patch if Pap requests). |
| **B46** ✅ shipped `d0ee4cf` | RLS regression tests for the 3 new tables: published-draw public SELECT, draft-draw organizer-only SELECT, match public SELECT, match service-role-only INSERT/UPDATE/DELETE, draw_seed RLS confirms only Edge Functions can write. **Also:** Edge Function happy-path smoke tests (drag-drop fires upsert; generate-draw 4-team power-of-2 produces 3 matches; generate-draw 12-team in 16-slot produces 11 standard matches + 4 byes = 15 first-round + 7 standard subsequent rounds — verify count, status distribution, next_match links). |
| **B47** ✅ shipped `b3307df` | `types/database.ts` regenerated by deploy workflow's auto-step. No manual gate. |

### Phase B — Web (matchday-web) — depends on Phase A types regen

| Commit | Description |
|---|---|
| **W45** ✅ shipped `1bcc184` | `bun run sync-types` post-Phase-A. Verify `Draw`, `DrawSeed`, `Match` types + new enums (`draw_status`, `match_status`, `match_type`) present. **Also `bun add @g-loot/react-tournament-brackets` (P3).** Verify package versions, lockfile delta, no warnings. |
| **W46** ✅ shipped `ddb3743` (W46a UUID-fallback rolled into the same commit) | **Public bracket route — `/[locale]/tournaments/[organizer-slug]/[tournament-slug]/bracket` (D11).** Server Component reads tournament + draw + matches via RLS (status='published' AND draw.status='published'); 404 otherwise (D14). Joins `tournament` + `user` (organizer.slug) + `draw` + `match` + `team` + `team_member` + `user` (player names). Renders via `@g-loot/react-tournament-brackets` (NOT hand-rolled — ISC-46). Initial paint server-rendered HTML (D10). Bye nodes visualized clearly (library handles via team_b=null + custom node renderer). **`?spectator=true` reserved** (D12) — read but not yet acted on; v0.8 will add nav-hide CSS. |
| **W46a** ✅ shipped `ddb3743` (rolled into W46 commit) | **UUID-fallback handler for bracket route.** `/[locale]/tournaments/[id]/bracket` where `[id]` is a UUID → server-redirects to canonical slug-URL if tournament + organizer have slugs. Mirror of v0.4 W33 fallback. |
| **W47** ✅ shipped `ac845f9` | `bun add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities` (P4). **Manual seeding UI on TO management hub.** New "Draw" tab on `/organizer/tournaments/[org-slug]/[t-slug]`. Two-panel layout (D9): left "Unseeded teams" (draggable cards) + right "Seed slots 1..N" (drop zones). **A-A06 amendment — team filtering:** "Unseeded teams" panel queries `team JOIN registration ON team.id = registration.team_id WHERE registration.tournament_id = X AND registration.status='confirmed'` with DISTINCT on team_id. Excludes orphan teams from re-add-different-partner edge case. Built on `dnd-kit`. **P-F03 + P-F10 amendment — optimistic UI with reconciliation:** every drop fires B44a `upsert-draw-seed` Edge Function with optimistic local state update; on RPC return reconcile (success: confirm; error: revert + toast). Out-of-order writes are absorbed by B39's last-wins UPSERT semantics (R4); UI's last-render-wins matches. **Drag-off-slot** invokes B44b `remove-draw-seed`. **D13 keyboard fallback:** dnd-kit KeyboardSensor + explicit "Set seed for [team]" select dropdown (1-N) per team card; both routes invoke B44a/B44b. axe-verify. |
| **W48** ✅ shipped `3ef7216` | **Auto-fill remaining + Generate bracket buttons + bracket preview.** "Auto-fill remaining" invokes B44 `generate-draw` Edge Function with `auto_fill=true`. "Generate bracket" invokes B44 with `auto_fill=false`. After successful generate, bracket preview renders below the seeding panel via `@g-loot/react-tournament-brackets` (same library as W46 public route — shared component). TO can inspect, adjust seeds, regenerate as many times as needed. Spec §4.5 step 5. |
| **W49** ✅ shipped `04ac5cc` | **Publish draw button** — on the Draw tab. Disabled until draw has matches generated AND tournament status IN (`registration_open`, `registration_closed`). Confirm dialog: "Publish bracket? This will make the bracket visible to all players. Registration will auto-close if open. This action cannot be undone in v0.5." Invokes B43 `publish-draw` Edge Function. On success: redirect to public bracket URL with toast "Bracket published. Players notified." |
| **W50** ✅ shipped `3908627` | **Tournament status pill update on management hub** — new badge for `published` status. Match the v0.4 status-pill component. Visual hierarchy: draft (gray) / registration_open (green) / registration_closed (yellow) / published (blue) / live/completed/cancelled (v0.6+). |
| **W51** ✅ shipped `5f9f57d` | **Player tournament detail page (W33 v0.4) update — bracket link.** When `tournament.status='published'`, the detail page shows a "View bracket" CTA linking to W46's bracket route. Also: registration controls hide/disable when status='published' (post-publish registration is v0.6 D-decision). |
| **W52** ✅ shipped `32bb395` | **A-A12 amendment** — i18n keys for all v0.5 new strings → `messages/en.json` + `messages/th.json` (placeholder Thai pending native review per carry-over obligation). Namespaces: `tournaments.bracket.*` (including `tournaments.bracket.rounds.*` for "Round 1"/"Quarter-finals"/"Semi-finals"/"Final"/"3rd place" labels rendered by @g-loot library; `tournaments.bracket.bye` for BYE pill text), `organizer.tournaments.draw.*`, `email.draw_published.*`. |
| **W53** ✅ shipped `0897510` | Sentry capture on every server action error path with `function: draw.<X>` tags. Edge Function errors flow through existing `_shared/sentry.ts` wrapper (B43, B44, B44a, B44b, B45). |
| **W54** ✅ shipped `c4071b8` | a11y pass on the v0.5 surface — public bracket page (read-only, low-risk; verify keyboard scroll + screen-reader landmarks on the bracket SVG/canvas) + organizer Draw tab (D13 dnd-kit a11y is the load-bearing test; manual + axe-core verify). Manual review documented in DECISIONS.md (auto-axe full sweep deferred until OrbStack — same as v0.3/v0.4). **Lighthouse budget check** (P5): bracket page ≤ 250 KB JS gzip; if breached, document in DECISIONS.md as a v1.0 polish-pass concern. |

### Phase C — DoD verification + ship

| Commit | Description |
|---|---|
| **DoD1** | Per-feature ship matrix recorded in `Plans/v05-dod-evidence.md`. |
| **DoD2** | E2E walkthrough by Pap (Pap-action): (a) sign in as a TO with v0.4 tournament that has registrations confirmed → open Draw tab → drag 4 teams into seed slots → click Generate bracket → bracket preview renders correctly (4 teams in 4-slot bracket = 2 first-round matches, no byes); (b) repeat for 12 teams in 16-slot → confirm 4 byes go to seeds 1-4 (verify by inspecting team_b_id IS NULL on those rows; verify bracket preview shows BYE pills on those seeds); (c) regenerate path: change seed assignments + click Generate again → confirm match rows replaced (compare match.id before/after); (d) auto-fill: click Auto-fill remaining → confirm random assignment of unseeded teams; (e) publish: click Publish draw → confirm tournament.status='published', draw.status='published', `draw_published` email received by all confirmed + waitlisted registrations; (f) public bracket: open `/tournaments/[org-slug]/[t-slug]/bracket` in incognito (unauthenticated) → confirm bracket renders correctly; (g) try opening `/tournaments/[unpublished-id]/bracket` → confirm 404; (h) keyboard-only seeding: Tab through team cards + use Space to pick up + arrow keys to navigate slots + Enter to drop → confirm same auto-save fires as drag-drop; (i) odd draw size: try a 5-team registration in a 4-slot tournament → confirm `draw_size_exceeded` error with helpful message; (j) regen-after-publish: confirm Generate button is disabled when `tournament.status='published'` (publish is one-way per D6). **Post-stress-test additions:** (k) **degenerate cases (A-A17 + R10)**: 7-team in 8-slot (single bye on seed 1), 1-team in 2-slot (degenerate), 31-team in 32-slot (single bye); (l) **0-confirmed (A-A17)**: try Generate with N=0 → confirm `no_confirmed_registrations` error; (m) **UUID-fallback bracket URL (A-A16)**: open `/tournaments/[uuid]/bracket` → confirm server-redirects to canonical slug-URL; (n) **re-add-different-partner orphan team filter (A-A06)**: solo→doubles (Player B accept) → remove → re-add Player C → confirm only the active team appears in "Unseeded teams" panel (orphan team filtered); (o) **doubles two-row mirror DISTINCT (A-A07)**: confirm a doubles team only appears ONCE in the "Unseeded teams" panel (not twice for the two registration rows pointing at it). |
| **DoD3** | Both CIs green on `main`. Auto-types-regen committed by deploy.yml. |
| **DoD4** | Migrations applied to remote prod. All v0.5 Edge Functions deployed. |
| **DoD5** | DECISIONS.md updated with v0.5 D1-D15 final answers. |
| **DoD6** | `Plans/version-roadmap.md` v0.5.0 header gets `Shipped` + ship date. |
| **DoD7** | `Plans/decisions.md` gets v0.5 ship entry. |
| **DoD8** | `padelthailand.com/matchday/` rebuilt + Pap-approved push showing v0.5 as Shipped. |

---

## 4 · Per-feature ship matrix

| Feature | Code-complete | Backend ready | E2E verified | Ship status |
|---------|---------------|---------------|--------------|-------------|
| Manual drag-drop seeding (TO-V1-04) | ⬜ | ⬜ B39 + B40 | ⬜ | Required |
| Bracket sizing 4-128 with byes (TO-V1-05) | ⬜ | ⬜ B41 | ⬜ | Required (DoD anchor) |
| Bye placement algorithm (top seeds) | ⬜ | ⬜ B41 | ⬜ | Required (DoD anchor) |
| Draw as persistent document (D2 — match table) | ⬜ | ⬜ B36 + B37 | ⬜ | Required |
| Auto-fill remaining + regenerate (TO-V1-07) | ⬜ | ⬜ B41 | ⬜ | Required |
| Publish draw + tournament `published` (TO-V1-08) | ⬜ | ⬜ B42 + B43 | ⬜ | Required |
| `draw_published` email cascade (ISC-50b) | ⬜ | ⬜ B45 | ⬜ | Required |
| Public read-only bracket view | ⬜ | ⬜ W46 | ⬜ | Required (DoD anchor) |
| Bracket renders for power-of-2 + non-power-of-2 sizes | ⬜ | ⬜ B41 + W46 | ⬜ | Required (DoD anchor) |

v0.5 ships when 9/9 are green AND DoD2's bracket-rendering-for-unauthenticated-viewer + non-power-of-2 paths verify end-to-end.

---

## 5 · Cross-cutting DoD (every version, per `version-roadmap.md`)

- **a11y** — keyboard nav + screen-reader labels + WCAG AA contrast on every new page (public bracket page, organizer Draw tab). axe-core verified clean. **dnd-kit drag-drop a11y is the load-bearing test** — D13 dictates KeyboardSensor + explicit dropdown fallback. Manual review documented.
- **Observability** — Sentry capture on every server-action error path with `function: draw.<name>` tags. Edge Functions B43-B45 + B44a/b capture failures via existing `_shared/sentry.ts` wrapper.
- **Audit log** — every mutating action emits a row: `draw.generated`, `draw.regenerated`, `draw.seed_updated`, `draw.published`, `tournament.draw_published`. Per-match-row audit (`match.created`) NOT emitted in v0.5 — structural creation rolls up into `draw.generated`. Documented.
- **i18n** — every new user-visible string is an i18n key. TH bundles get placeholder strings (carried obligation from v0.1/v0.2/v0.3/v0.4 native-speaker review).
- **Privacy** — bracket page renders display_name + (optional) avatar_url for each team's players; NO email, phone, LINE ID, WhatsApp, DOB, gender, country leaked. Email `draw_published` template contains tournament name + dates + venue + bracket URL only.

---

## 6 · Anti-criteria (locked)

- v0.5.0 must NOT ship live scoring / per-set entry / match state transitions other than `bye` ↔ `upcoming` (v0.6.0)
- v0.5.0 must NOT ship match scheduling UI / court×time grid (v0.7.0)
- v0.5.0 must NOT ship realtime / Supabase channel subscription on bracket page (v0.8.0 — page-refresh per roadmap)
- v0.5.0 must NOT ship spectator mode UI (`?spectator=true` activated CSS) — only the URL param reservation (v0.8.0)
- v0.5.0 must NOT ship placements (v0.9.0)
- v0.5.0 must NOT ship double-elim (v2+ — canonical schema reserves the enum value)
- v0.5.0 must NOT auto-create the 3rd-place match — that fires when the second semi-final completes (v0.6.0)
- v0.5.0 must NOT ship draw-unpublish UI / endpoint (v0.6+ — publish is one-way per D6)
- v0.5.0 must NOT modify v0.4 frozen surfaces (registration UI, /invite/[token], /admin) — only adds the new Draw tab to the management hub
- v0.5.0 must NOT use a hand-rolled bracket renderer — `@g-loot/react-tournament-brackets` per matchday-web/CLAUDE.md (ISC-46)
- v0.5.0 must NOT use a hand-rolled drag-drop implementation — `dnd-kit` per matchday-web/CLAUDE.md
- v0.5.0 must NOT ship without RLS regression tests for the 3 new tables (B46)
- v0.5.0 must NOT depend on v0.4 unfinished E2E (this plan executable independently)
- v0.5.0 must NOT push padelthailand.com/matchday/ without explicit Pap approval
- v0.5.0 must NOT silently drop `draw_published` emails in prod (hard-fail if `RESEND_API_KEY` unset; dev-fallback console-logs in non-prod)
- v0.5.0 must NOT allow draw_size > 128 (D1 default; validator on tournament create + on generate-draw RPC)
- v0.5.0 must NOT allow draw_size < N (confirmed registrations) — generate-draw RPC raises `draw_size_exceeded`
- v0.5.0 must NOT leak unpublished draws / draft tournaments via 403 — return 404 (D14)
- v0.5.0 must NOT permit a viewer to register / withdraw from the bracket page (read-only)
- v0.5.0 must NOT write `winner_team_id`, `scored_at`, `scored_by`, `set*_team_*` to any match row (those are v0.6 columns; left null at INSERT)
- **v0.5.0 must NOT implement the spec §1 `published → registration_open` reverse-transition** (post-stress-test A-A14) — that path also un-publishes the draw + accepts new registrations into unseeded pool; deferred to v0.6 with the explicit "Reopen registration from published" UI. v0.5 is one-way per D6.
- **v0.5.0 must NOT emit per-match-row audit log entries** (post-stress-test A-A18) — `match.created` is NOT in canonical enum; structural creation rolls up into `draw.generated` audit (single row per generate, with `metadata` JSONB containing the match count). Documented in B41.

---

## 7 · Risk register (post-premortem)

| # | Risk | Mitigation |
|---|------|------------|
| R1 | Bracket generation correctness for non-power-of-2 sizes — bye placement off-by-one or wrong seeds receive byes | B41 PL/pgSQL implements top-seed-first per spec §4.3 (D5); B46 RLS test includes 12-team-in-16-slot fixture verifying seeds 1-4 receive byes; DoD2(b) E2E verifies this. |
| R2 | Seed-to-slot mapping incorrect — seeds 1 and 2 meet before final | B41 implements canonical recursive halving per spec §4.2; B46 test fixtures cover 4/8/16/32-team sizes verifying seed-1 vs seed-N pairing in round 1 and seed-1's path to final never crosses seed-2's path. |
| R3 | Concurrent regenerate while seeding — TO clicks Generate from two browser tabs simultaneously | B41 `SELECT FOR UPDATE on tournament` + the DELETE-then-INSERT match pattern is atomic; second invocation blocks until first commits, then re-reads + replaces correctly. |
| R4 | Concurrent drag-drop — TO drags two teams into the same slot quickly | B39 `UPSERT ON CONFLICT (draw_id, seed_position)` replaces last-wins; auto-save semantics match spec §4.5 (every drag overwrites). The other team's previous slot now has no row → re-renders as unseeded. |
| R5 | Publish race — TO publishes while a registration is being inserted (v0.4 path) | B42 `SELECT FOR UPDATE on tournament` + the v0.4 RPC's also-FOR-UPDATE pattern serializes; publish sees a consistent registration list. New registrations after publish are blocked by tournament.status='published' RLS in v0.4 paths. |
| R6 | Publish without confirmed registrations | B41 raises `no_confirmed_registrations` (N=0). B42 won't proceed if matches=0. UX: Generate button disabled until ≥ 1 confirmed registration. |
| R7 | Publish with N > draw_size (TO over-promoted waitlist via B29 manual override per v0.4 R13) | B41 raises `draw_size_exceeded`; UX guides TO to either remove a waitlist promotion OR increase tournament.draw_size (the latter is a v0.4 W41 path — D-decision: is increasing draw_size while in `registration_closed` allowed? Confirm in DECISIONS.md). |
| R8 | `@g-loot/react-tournament-brackets` bundle size breaks bundle budget | P5 measures post-W45; if breach, document; consider lazy-loading via `dynamic()` import only on bracket route. NOT a v0.5 ship-blocker — Lighthouse budget is v1.0 polish concern. |
| R9 | dnd-kit accessibility (drag-drop without mouse) | D13 default = KeyboardSensor + explicit "Set seed for [team]" dropdown fallback. axe-verify in W54. Manual keyboard-only walkthrough in DoD2(h). |
| R10 | `@g-loot/react-tournament-brackets` doesn't support all bye-rendering edge cases (e.g., 7-team in 8-slot — single bye on seed 1) | W46 + W48 use the library's `Match` data shape with `state='SCORE_DONE', participants=[{name:'BYE', isWinner:false}]` for bye matches; library-supported per public docs. **Test path:** B46 + DoD2(b) cover 12-in-16; **also test 7-in-8 (single bye on seed 1) + 1-in-2 (degenerate) + 31-in-32 (single bye scattered)** as part of B46 fixture matrix. |
| R11 | Public bracket caching strategy intersects with v0.8 realtime | D10 default = no ISR; pure server-render on every request. v0.8 will add Realtime subscription on top — no cache invalidation contract to break. Documented in DECISIONS.md. |
| R12 | Match table introduction in v0.5 vs v0.6 — v0.6 may need to ALTER TABLE the match shape | D2 default + canonical schema reserves all v0.6 columns nullable from the start (B37 lays down the FULL canonical match shape per `matchday-database-schema.sql` lines 377-415). v0.6 just starts WRITING those nullable columns. No ALTER required. |
| R13 | Regenerate after publish — UX confusion if TO expects to be able to "edit" published draw | D6 default = publish is one-way; UX disables Generate button when `tournament.status='published'`. DoD2(j) E2E verifies. v0.6+ revisits unpublish path. |
| R14 | Auto-fill randomness yields a "weak" draw (seed 1 + seed 2 in same half by coincidence of unseeded ordering) | False alarm — auto-fill only fills UNSEEDED slots after manual seeding; the seed-to-slot mapping (B41 PL/pgSQL) ensures top seeds are always maximally separated by canonical bracket position regardless of how unseeded teams fill empty spots. |
| R15 | TO drag-drops a team that's already on another slot | B39 UPSERT semantics: same `team_id` on a new `seed_position` requires DELETE-then-INSERT or a 2-step UI flow. **Add to B39 pipeline:** if `team_id` already has a `(draw_id, team_id)` row, DELETE that row first (canonical schema has `unique(draw_id, team_id)` constraint); then INSERT new row. Single txn. |
| R16 | Unauthenticated bracket view crashes on user data RLS leak | W46 reads only `display_name` + `avatar_url` from `user` table (per canonical "Users can read other users basic info" public RLS); no email/phone/DOB/etc. queryable. |
| R17 | Email rate-limit interferes with `draw_published` cascade for tournaments with many registrations (e.g., 64-team tournament = 64 emails) | B45 follows v0.4 B24's per-actor rate-limit (3/h); the actor on these emails is the system (organizer-on-behalf), so the rate-limit doesn't block the cascade — each recipient is targeted once per `${tournament_id}:draw_published:v1` idempotency. **D-decision:** confirm rate-limit semantics for system-actor emails. |
| R18 | Draw_published email sent after a v0.6 unpublish-republish cycle (re-fires for same recipients) | Idempotency key `${tournament_id}:draw_published:v1` blocks the second send. **D-decision:** when v0.6 introduces unpublish, key versioning strategy (`:v2`) — reserved for v0.6 plan. |
| R19 | Phase A length is moderate (~12 commits) | Each commit is ~1 algorithm run. Phase B parallelizes after types regen. Roughly 1 day in parallel-blitz mode. |
| R20 | Pap pushback on D2 (match table in v0.5 vs v0.6) | DRAFT v2 stress-test will validate; if Pap defers, plan is revised to JSON bracket in v0.5 + match-table migration in v0.6 (estimated +3 commits in v0.6). |
| R21 | dnd-kit with React 19 / Next.js 16 SSR compatibility | dnd-kit 6.x supports React 19 per package docs. Verify at W47. **Risk fallback:** if incompatible, downgrade to a maintained alternative (e.g., react-beautiful-dnd-next — but that has known SSR issues). |
| R22 | Bracket page SEO not configured (OG previews etc. are v0.9 scope) | Out of scope per anti-criteria; v0.9 adds OG-preview tags. v0.5 emits the `<title>`-tag and minimal `<meta>` but no rich previews. |
| R23 | **Regenerate after v0.6 score-entry would lose match history** (post-stress-test P-F02) | D6 default ensures publish is one-way in v0.5; once tournament status='published', the v0.5 Generate button is disabled. v0.6 will introduce an unpublish path with explicit "all match scores will be cleared, are you sure" warning + cascade reset. **Documented in DECISIONS.md as a v0.6 obligation.** v0.5 itself is safe — no scores exist yet at draw-publish time. |
| R24 | **Public bracket page hammered by spectators on a popular tournament** (post-stress-test P-F06) | D10 default = no ISR; pure server-render every request. **Mitigation:** add Cache-Control: `s-maxage=10, stale-while-revalidate=30` headers on the bracket route — Vercel CDN absorbs the load with up to 10s staleness; v0.8 realtime arrival will require these headers to be removed (or set to no-cache) so the realtime channel is the source of truth. **Documented as v0.8 forward-looking dep in DECISIONS.md.** |
| R25 | **Cross-version dep: v0.4 B33b sweep_pending_partner_invites_rpc must be on main before v0.5 Phase A starts** (post-stress-test P-F05) | Verified at gate. v0.4 Phase A is code-complete (per v0.4 plan DRAFT v3); B33b shipped `e66367c`. ✓ |

---

## 8 · Approval gates

This plan requires explicit Pap approval before any scaffolding:

1. ✅ Plan drafted (DRAFT v1)
2. ✅ Plan stress-tested by Plan + Architect review lenses — 18 findings applied + 4 nits documented (DRAFT v2)
3. ✅ Pap reviews; D1-D15 answered (all defaults — zero overrides); P1-P5 acknowledged (DRAFT v3)
4. ✅ Phase A (B36-B47) shipped — 14 backend commits, all CI green
5. ✅ Phase B (W45-W54) shipped — 10 web commits, all CI green (2026-04-28)

Subsequent algorithms execute the phased commits.

---

*End of v0.5.0 build plan v2.*

---

## Change log — DRAFT v1 → DRAFT v2 (2026-04-28)

Stress-test by Plan + Architect review lenses surfaced 22 actionable findings (14 Plan-lens P-F01 through P-F14 + 20 Architect-lens A-A01 through A-A20, with overlaps reconciled). 18 applied; 4 nits documented as accepted-with-rationale.

**Critical (6):**
- **A-A07: B41 DISTINCT team_id query** — v0.4 D13 two-row mirror means each doubles registration has TWO rows pointing at the same team_id; without DISTINCT, B41 would over-count N and corrupt the bracket. Applied.
- **A-A06: B41 + W47 orphan team filter** — re-add-different-partner edge case (v0.4 §3.5) leaves teams with no active registration. Both B41 (generate) and W47 (Unseeded panel) must filter via `JOIN registration ... WHERE status='confirmed'`. Applied.
- **R15: B39 same-team-on-different-slot path** — drag a team from slot 3 → slot 7. Without explicit handling, canonical `unique(draw_id, team_id)` would block. B39 now DELETEs the old (draw_id, team_id) row first, then UPSERTs the new row in same txn. Applied.
- **A-A19: B43 per-recipient idempotency** — per-tournament idempotency key blocks partial-failure retries; switched to `${tournament_id}:draw_published:${user_id}:v1` per recipient + tournament-level advisory lock for concurrent-publish protection. Applied.
- **P-F04: B45 rate-limit semantics for system-actor email cascade** — v0.4 B24's 3/h-per-actor would block a 64-recipient cascade after 3 sends. Documented bypass for system-actor cascades; manual Resend recovery affordance reserved for v0.5.x patch. Applied.
- **P-F05: Cross-version dep — v0.4 B33b sweep_pending_partner_invites_rpc must be on main** — added to header risk callout + R25. Verified ✓ (already shipped). Applied.

**Important (12):**
- **A-A09: B41 populates `match.tournament_id` denormalized column** per canonical schema line 380 — applied.
- **A-A08: B42 emits only `draw.published` audit (drops redundant `tournament.draw_published`)** — applied.
- **A-A11: B42 returns `organizer_slug, tournament_slug, locale-per-recipient`** — needed for B43 to construct bracket URL + per-user TH/EN template. Applied.
- **A-A12: W52 i18n keys include bracket internal labels** (`tournaments.bracket.rounds.*`, `tournaments.bracket.bye`) — @g-loot bracket library's labels otherwise leak English. Applied.
- **A-A14: §6 anti-criterion explicitly forbids spec §1 `published → registration_open` reverse-transition in v0.5** — deferred to v0.6 with explicit unpublish UI. Applied.
- **A-A16: DoD2(m) tests UUID-fallback bracket URL** — applied.
- **A-A17: DoD2(k) + (l) test degenerate cases (7-in-8, 1-in-2, 31-in-32) + 0-confirmed `no_confirmed_registrations`** — applied.
- **A-A18: §6 anti-criterion explicitly forbids per-match-row audit (`match.created` not in canonical)** — structural creation rolls up into `draw.generated`. Applied.
- **A-A20: B39 sets `created_by = auth.uid()` on first SELECT-or-INSERT draw row** — canonical column required; applied.
- **P-F02: R23 added — regenerate-after-v0.6-score-entry forward-looking risk** — v0.6 must address; v0.5 itself is safe via D6 one-way publish. Applied.
- **P-F03 + P-F10: W47 optimistic UI with reconciliation** — drag-drop UX would feel sluggish on round-trip; explicit optimistic-then-reconcile pattern documented. Applied.
- **P-F06: R24 added — public bracket caching strategy** — Cache-Control `s-maxage=10, stale-while-revalidate=30` v0.5 default; v0.8 realtime requires these headers removed. Applied.

**Nits (4) — accepted with rationale, no full amendment:**
- **A-A01: B41 PL/pgSQL recursive CTE performance at draw_size=128** — false alarm; PG handles thousands easily.
- **A-A03: B37 self-FK ON DELETE SET NULL ordering during regenerate DELETE** — false alarm; PG handles single-statement DELETE constraint resolution within statement.
- **A-A05: team rows persist on registration cancellation (cascade behavior)** — confirmed: v0.4 B33c does NOT delete teams; A-A06's filter handles the orphan case. No B36/B37 change required.
- **A-A15: D1 sub-default = power-of-2 only (4/8/16/32/64/128)** — roadmap text "4-128" + spec §4.1 "or custom" deferred; v0.5 ships power-of-2 only. Custom non-power-of-2 draw_size is a v0.5.x patch if Pap requests. Documented.

**Net commit additions in DRAFT v2:** none — all amendments folded into existing B36-B47 + W45-W54. Phase A commit count: **12** unchanged. Phase B commit count: **10** unchanged (W45-W54).

**New D-decisions surfaced:** 0 — all 15 D-decisions from DRAFT v1 stand; review surfaced sub-defaults and clarifications, not net-new decisions.

*End of change log.*
