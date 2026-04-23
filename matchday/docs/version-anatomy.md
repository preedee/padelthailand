# Matchday — Per-Version Anatomy

**Structure:** Single linear stream, newest at top.

## Fields (in display order)

| # | Field | Format | Applies to |
|---|---|---|---|
| 1 | **Version** | `v0.2.0` + optional name `"Bracket Engine"` | All |
| 2 | **Status badge** | `Shipped` · `In Progress` · `Planned` | All |
| 3 | **Date** | `24 Feb` (Shipped) · target date (In Progress) · `Q3 '26` (Planned) | All |
| 4 | **Role tag** | `Organizer` / `Player` / `Venue` / `Spectator` (multi-select) | All |
| 5 | **Theme** | One-line title | All |
| 6 | **Description** | One-liner: capability + tech | All |
| 7 | **Features** | 5–12 dashed bullets, full list always shown | All |
| 8 | **Demo link** | "Watch sample" / "Try it" | Shipped (optional) |
| 9 | **Spec link** | Deep-link to spec doc section | All |
| 10 | **Test count** | `X E2E tests` | Shipped only |

## Worked example

> **v0.2.0 — "Bracket Engine"**  `Shipped`  ·  24 Feb  ·  `Organizer` `Spectator`
>
> Single + double elimination brackets with realtime score updates (Postgres + Supabase channels).
>
> - Bracket generator: 4–128 player single/double elim
> - Drag-to-seed UI with import from CSV
> - Realtime score push to spectator view (<1s latency)
> - Match-by-match progression with auto-advance
> - Printable bracket PDF export
>
> [Watch sample bracket →]   [Spec →]   ·   12 E2E tests

## Decisions captured

- **Single product**, no sub-grouping (vs. Setpoint's 4-product grouping).
- **Lifecycle = 3 stages** (`Shipped` / `In Progress` / `Planned`) — momentum model, shows what's actively being built.
- **Numeric + named** version labels, like Setpoint.
- **Full feature list always shown** (including Planned) — public commitment, fits the "alive" momentum vibe.
- **Role tag kept** — Matchday features clearly target specific user types; helps scanning.
- **Demo + Spec links kept** — sports is visual; spec docs are rich and worth linking.
- **Skipped:** functional-area sub-grouping, sport scope, breaking-change flag (revisit if/when relevant).
