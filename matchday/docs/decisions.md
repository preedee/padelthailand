# Matchday Roadmap — Decisions Log

Living log of decisions made during roadmap planning. Most recent first.

---

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
