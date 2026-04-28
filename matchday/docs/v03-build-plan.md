# Matchday v0.3.0 — "Organizer + Venues + Admin" Build Plan

> **Status:** DRAFT v3 — D-decisions answered 2026-04-28. Ready for execution gate.
> **Predecessor:** v0.2.0 Player Identity (code-complete 2026-04-28, commit `e1507dc`)
> **DoD:** A player applies → admin approves → approved TO creates a venue + draft tournament invisible to the public.
> **External-prereq risk:** Low. v0.3 has no Apple-Developer-style long-pole. Main prereq is the admin role bootstrap (one-shot SQL on remote prod) and Pap deciding the logo-cropper library.
> **Amendments from stress-test:** 15 findings applied (4 critical, 8 important, 3 nits). Critical fixes: user-table column additions in B8; self-elevation guard broadened to slug + reserved payment cols; tournament/venue INSERT RLS WITH CHECK on ownership; storage RLS via `storage.foldername()`. See change-log at end of doc.

---

## 1 · Scope

In-scope (per `Plans/version-roadmap.md` v0.3.0 + `matchday-build-prompt.md` §7.6 + `matchday-v1-detailed-specs.md` §10/§12):

1. **TO application flow** — `/[locale]/organizer/apply` (form with logo cropper, LINE+WhatsApp required, ToS checkbox, optional fields per spec) and `/[locale]/organizer/apply/status` (read-only status page)
2. **Admin dashboard** — `/[locale]/admin` (stats bar + action items + recent activity feed + platform health)
3. **Admin organizer-applications list + detail** — `/[locale]/admin/organizer-applications` (paginated, newest first) and `/[locale]/admin/organizer-applications/[id]` (Approve / Reject with reason)
4. **Venue create/select** — Matchday-native venue creation (name, city, country, court count + court names, optional address). Inline within tournament create + standalone `/[locale]/venues/new`.
5. **Tournament create as `draft`** — `/[locale]/organizer/tournaments/new` (name, dates, venue, draw size 4-64, last-set rule, match format best-of-1/3, optional 3rd-place match, level band, entry info)
6. **Organizer dashboard + tournament management hub stub** — `/[locale]/organizer` (cards by status: live/drafts/upcoming/past; empty state "Create your first tournament" CTA) and `/[locale]/organizer/tournaments/[id]` (read-only management hub stub for v0.3 — register/scoring panels in v0.4+)
7. **Organizer public profile** — `/[locale]/organizer/[slug]` (display name from User.display_name, logo, contact channels, tournaments-hosted list — empty in v0.3 since tournaments are draft-only)
8. **Cross-cutting DoD** — a11y, Sentry observability, audit-log emission, i18n (TH+EN), privacy/ToS surface as needed

Out-of-scope (defer to later versions per roadmap):
- Tournament publish + lifecycle transitions (`registration_open`, `registration_closed`, `published`, `live`, `completed`, `cancelled`) — v0.4+
- Registration flow (solo, doubles, partner invite, waitlist) — v0.4
- Draw generation, seeding UI, bracket rendering — v0.5
- Live scoring, match state machine, retirement/walkover — v0.6
- Match scheduling (court × time grid, auto-schedule, conflict detection) — v0.7
- Spectator mode, realtime bracket, presence — v0.8
- Placements auto-derive, cancellation flow, OG previews — v0.9
- Stripe Connect / Omise payment-processor onboarding — v2+
- Per-tournament "require manual approval of registrations" toggle — v2
- Reapplication cooldown rules, admin search/filter/bulk actions on review page — v2
- Club / venue owner portal — v2
- **`/admin/audit-log` page** (search + filter + CSV export) — v0.4 (per spec §12; activity feed on `/admin` covers v0.3 needs)
- **`/admin/users` + `/admin/users/[id]` pages** (user search, view, revoke organizer role) — v0.4
- Cleanup of rejected-applicant logos in `organizer-logos` bucket — v2 (cron Edge Function)
- Auto-cleanup of stale `draft` applications (>30 days) — v2 (cron Edge Function)
- Native-Thai i18n review (carried from v0.1.0 / v0.2.0; remains placeholder)

---

## 2 · External Prerequisites — gate questions for Pap

### Real-world account/process work

| # | Prereq | Risk | Required for | Action |
|---|--------|------|--------------|--------|
| P1 | **Admin role bootstrap** | Minutes (one-shot SQL on remote prod) | Admin can approve the first organizer | After Phase A lands: `update public."user" set roles = array_append(roles, 'admin') where id = '<pap-user-id>';` Recorded in `matchday/DECISIONS.md`. Captured as a Pap-actions runbook step. |
| P2 | **Logo-cropper library decision** | Minutes | Phase B `/organizer/apply` form | D-decision below — Pap picks library |
| P3 | **Storage bucket privacy review** | Minutes | Phase A bucket creation | `organizer-logos` is publicly readable per spec — confirm Pap is OK with this for v1 (alternative: signed URLs add complexity for marginal benefit since logos are intentionally public on tournament pages) |

### Decisions needed from Pap (asked one at a time at the gate; surfaced as inline questions during Phase B+)

| # | Decision | Options |
|---|----------|---------|
| D1 | **Logo cropper library** | `react-easy-crop` (lightweight, hooks-friendly, ~30KB) · `react-image-crop` (more features, ~50KB) · `cropperjs` + `react-cropperjs` wrapper (most powerful, ~80KB; matches WeCourts feature set) |
| D2 | **Organizer slug source** | Auto-slug from `display_name` (kebab-case, unique-suffixed if collision) · User-chosen slug at apply-time (extra form field; allows vanity URLs) · System UUID short-form (e.g., first 8 chars of user.id; ugly but unambiguous) |
| D3 | **Admin role bootstrap method** | Hand-applied SQL on remote prod via Supabase Studio (quickest; documented runbook) · One-shot migration with hard-coded Pap user_id (forever in git history) · `bootstrap-admin` Edge Function gated by a one-time secret (most ceremonious; over-engineered for v1) |
| D4 | **Application "draft" auto-save semantics** | Save on every field blur (most generous; chatty network) · Save every 30s if dirty (debounced; fewer requests) · Save only on explicit Save Draft button (simplest; loses progress on tab close) |
| D5 | **Admin tournament edit access** | Per spec §12 admin has full tournament edit + cancel access — confirm this surface lands in v0.3 (alongside the read-only management hub stub) or defers to v0.4+ when there's actual tournament UI to mirror |
| D6 | **Organizer-logos bucket public-read** | Public-read (per spec; logos appear on public tournament pages, simplest) · Signed-URL only (extra Edge Function + cache control; defensible if Pap wants stricter control) |
| D7 | **Admin email when application submitted** | Pap-only inbox (admin@matchday.app or Pap's personal email — needs another i18n template) · No email; Pap checks dashboard daily · LINE bot ping (out of scope for v0.3) |
| D8 | **Application form auto-save scope** | Form data only · Form data + the cropped logo blob (binary; Storage cost; localStorage limit risk) · No logo until submit (logo upload happens at submit; if submit fails, user re-crops) |
| D9 | **Contact-channel visibility on organizer public profile** | Show all contact channels (LINE/WhatsApp/email) by default · Per-channel visibility toggle in apply form (org chooses what's public) · Show LINE+WhatsApp only if non-empty (no UI control) |
| D10 | **TO ToS document scope** | Real legal doc (lawyer-reviewed; blocks v0.3 ship) · Stub markdown like v0.2 `/privacy` (acceptable; flag for v1.0 legal review) · Reuse v0.2 `/terms` page with TO addendum section appended |
| D11 | **`audit_log` schema migration in v0.3** | Land canonical typed-FK shape now in B8 (`application_id`, `tournament_id`, etc. + `audit_action` enum) — clean for v0.4+ but bigger Phase A · Stay polymorphic (`target_type` + `target_id`); accept v0.4 will need a migration when `tournament_id` FK matters · Land canonical shape minus tournament/match FKs (those land with v0.4 schema) |
| D12 | **`under_review` application state** | Drop from enum (spec calls it "optional"); 4-state lifecycle · Keep + auto-transition `submitted → under_review` on first admin GET (W21) · Keep, but only manual via "Mark under review" button (spec ambiguous) |

**Decisions locked 2026-04-28** (Pap-answered):
- **D1: `cropperjs` + `react-cropperjs` wrapper** (~80KB gzipped). Override of recommended default — Pap chose feature headroom over bundle size. W12 bundle guardrail bumps to ~120KB.
- **D2: User-chosen slug at apply-time.** Override — vanity URLs valued. Apply form gains a slug text input with real-time availability check (new Edge Function `check-slug-availability` — see B14a) + reserved-slug blocklist (`admin`, `api`, `organizer`, `tournaments`, `auth`, `me`, `onboard`, `sign-in`, `privacy`, `terms`, `about`, `static`, `_next`).
- **D3: Hand-applied SQL via Supabase Studio.** Default. Recorded in DECISIONS.md runbook post-B18.
- **D4: Save every 30s if dirty.** Default.
- **D5: Full edit + cancel access (per spec §12).** Override — Pap pulling §12 admin-edit-and-cancel forward into v0.3. **Score access stays in v0.6 scope.** Implications: W28 stops being a read-only stub; W28 gets edit affordances; W28a (edit form) + W28b (cancel action) added to Phase D. Anti-criterion against W28 edit removed.
- **D6: Public-read per spec.** Default.
- **D7: No email; admin checks dashboard.** Default.
- **D8: Form data + cropped blob auto-saved.** Override — Pap chose zero-re-crop UX over implementation simplicity. Implementation: blob exceeds localStorage 5MB ceiling for typical PNGs, so W15a (IndexedDB persistence layer) added to Phase B. Auto-save schedule from D4 (30s debounced) governs both form fields + blob.
- **D9: Show non-empty channels only.** Default.
- **D10: Stub markdown like v0.2 `/privacy`.** Default. Lawyer review deferred to v1.0 legal pass.
- **D11: Stay polymorphic.** Default. v0.4 migration when tournament/registration FKs matter is accepted debt; recorded in DECISIONS.md.
- **D12: Drop `under_review` from enum.** Default. 4-state lifecycle: draft → submitted → approved/rejected.

---

## 3 · Phased commit plan

Continuing v0.2.0's commit-numbered convention. Sequencing: backend schema + storage land FIRST (gates web). Web phases parallelize where possible (apply flow ⊥ admin panel ⊥ organizer dashboard).

### Phase A — Backend schema + storage + email infra (matchday-backend) — gates Phase B+

> **Phase A exit gate:** B18 (RLS regression tests) lands BEFORE B17 (types publish) so that any RLS bug surfaced by tests doesn't ship into matchday-web's pulled types. Order: B8 → B8a → B9 → B10 → B11 → B11a → B12 → B12a → B13 → B14 → B15 → B16 → **B18 (gate)** → B17 (publish).

| Commit | Description |
|---|---|
| **B8** ✅ shipped `6c8458d` | 4 enums (`organizer_application_status` — 4 states per D12 dropping `under_review`; `tournament_status`, `tournament_format`, `match_format`, `last_set_rule` — actually 5 enums; `under_review` removed from app-status) + 3 tables (`organizer_application`, `venue`, `tournament`) per `matchday-database-schema.sql` §177-243 + §445-460 (canonical reference). Indexes per spec. RLS for venue: `INSERT WITH CHECK (created_by = auth.uid() AND user_has_role('organizer'))`; UPDATE same. RLS for tournament: `INSERT WITH CHECK (organizer_id = auth.uid() AND user_has_role('organizer'))`; UPDATE: `organizer_id = auth.uid() OR user_has_role('admin')`; SELECT: `status != 'draft' OR organizer_id = auth.uid() OR user_has_role('admin')`. RLS for organizer_application: own SELECT, own INSERT, own UPDATE-while-draft, admin SELECT-all. All in one migration to keep referential integrity atomic. |
| **B8a** ✅ shipped `c784fd4` | **`ALTER TABLE public."user"`** — adds `slug text UNIQUE` (with `lower()` index for case-insensitive lookup; nullable; backfilled for existing users via separate UPDATE statement using `display_name`-slugified + random4 collision suffix), `organizer_logo_url text`, `stripe_connect_account_id text` (RESERVED for v2; never populated in v1), `omise_recipient_id text` (RESERVED for v2; never populated in v1). All 4 columns nullable. **`SECURITY DEFINER` function `set_user_slug(text)`** wraps slug update with collision-loop logic. (Addresses stress-test F1.) |
| **B9** ✅ shipped `da7e923` | `is_tournament_organizer(t_id uuid)` helper function (SECURITY DEFINER, returns bool). Used in tournament/venue/registration RLS policies (consumed by v0.4+ as well). |
| **B10** ✅ shipped `d1fed5c` | **Self-elevation guard (BEFORE UPDATE trigger).** Replaces v0.1.0's permissive policy. Trigger fires on `public."user"` UPDATE, raises if any of these columns changed AND `current_setting('role') <> 'service_role'`: `roles`, `slug`, `organizer_logo_url`, `stripe_connect_account_id`, `omise_recipient_id`. Closes the TODO at `init.sql:135`. (Slug updates route through B8a's SECURITY DEFINER function; logo updates via Edge Function with service role.) (Addresses stress-test F3 + A2.) |
| **B11** ✅ shipped `1e3f153` | `organizer-logos` Supabase Storage bucket via migration (`insert into storage.buckets ...`). Public-read (per D6). Per-user-prefix write policy uses `(storage.foldername(name))[1] = auth.uid()::text` (Supabase canonical pattern; not raw LIKE). Path convention: `${user_id}/logo.png` (overwrite on re-apply). MIME constraint: `content_type IN ('image/png','image/jpeg')`. Size constraint: bucket `file_size_limit = 2097152` (2MB per spec §7.6). (Addresses stress-test A3 + F7 + F9.) |
| **B11a** ✅ shipped `42e7cd7` | **Logo file validation Edge Function** — `validate-organizer-logo` invoked from W13 server action after upload. Reads the uploaded blob via service-role, checks magic bytes (PNG/JPG signatures), confirms 500×500 dimensions, deletes the file + returns 400 if any check fails. Belt-and-suspenders over storage policy. |
| **B12** ✅ shipped `7eb9d77` | Audit emitter helpers extended (`functions/_shared/audit.ts`): `organizer.application_submitted`, `organizer.approved`, `organizer.rejected`, `organizer.role_revoked` (the last is exposed for v0.4+ use; no v0.3 caller), plus `tournament.created`, `venue.created`. Per D11 (stay polymorphic), each emitter writes `target_type='organizer_application' \| 'tournament' \| 'venue'` + `target_id`. The `before_snapshot`/`after_snapshot` JSONB intentionally projects only non-PII fields for non-admin readability — full snapshots remain in the row but column-masked through the activity-feed view (B12a). |
| **B12a** ✅ shipped `f25441e` | **`admin_activity_feed` SECURITY DEFINER view** — projects only `(action, actor_id, actor_display_name, subject_label, target_type, created_at)` from `audit_log`. GRANT SELECT to authenticated users; the view body re-checks `user_has_role('admin')` so non-admin queries return 0 rows. The raw `audit_log` SELECT for admins remains for the deferred /admin/audit-log page (v0.4). (Addresses stress-test A9.) |
| **B13** ✅ shipped `9bf296e` | Welcome-email-style template trio (`_shared/templates/`): `organizer_application_received.ts`, `organizer_application_approved.ts`, `organizer_application_rejected.ts` — TH+EN bilingual, HTML-escaped form fields. Subject lines + body copy i18n-keyed. Language picked from applicant's `user.language_preference` (set during /onboard in v0.2). |
| **B14** ✅ shipped `153cc0e` | `send-organizer-application-email` Edge Function — single function with `kind: 'received'\|'approved'\|'rejected'` discriminator. JWT-auth, idempotency enforced via **DB unique constraint** on `audit_log` partial index `(target_id, action) WHERE action IN ('email.sent.organizer_application_*')`, not in-memory. Per-user rate-limit (3/h same as welcome). |
| **B14a** ✅ shipped `c4e3902` | **`check-slug-availability` Edge Function** (D2 override). GET endpoint takes `?slug=<candidate>`, returns `{available: bool, reason?: 'taken'\|'reserved'\|'invalid_format'}`. Reserved-slug blocklist: `admin api organizer tournaments auth me onboard sign-in privacy terms about static _next`. Format validation: `^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$`. Rate-limited (60/min per IP) to prevent enumeration scraping. Used by W13 apply form for real-time availability check (debounced 500ms after typing stops). |
| **B15** ✅ shipped `9639ecc` (+ simplify `1ec181a`) | `approve-organizer-application` Edge Function — admin-only (`user_has_role('admin')` on calling JWT). DB writes are atomic in a single PG transaction: (a) update application status → `approved`, (b) append `organizer` to `user.roles` via service role (bypasses B10 trigger), (c) insert `organizer.approved` audit row. **Email invoke is best-effort post-commit** (NOT atomic with the transaction — at-least-once semantics; idempotency key `${application_id}:approved:v1` enforced via B14's DB unique constraint). If the invoke fails after commit, applicant is approved but un-emailed — admin detail page exposes a "Resend approval email" button (W21) for recovery. SELECT FOR UPDATE on application row prevents double-approve race. (Addresses stress-test F4 + A4.) |
| **B16** ✅ shipped `1fa8c38` | `reject-organizer-application` Edge Function — admin-only. Requires non-empty `reason` (max 500 chars). Same atomicity contract as B15 (DB writes atomic; email best-effort post-commit; "Resend rejection email" button on W21). |
| **B18** ✅ shipped `b329976` | RLS regression tests for the new tables: own application visible to applicant only; admin can read all applications via `user_has_role('admin')`; venue insertable only by `organizer` role AND `created_by = auth.uid()` (non-owning insert rejected); tournament insertable only by `organizer` role AND `organizer_id = auth.uid()` (non-owning insert rejected); tournament `draft` invisible to anonymous; tournament `draft` invisible to other authenticated users (other than owner+admin). **Self-elevation regression**: anon JWT update of `user.roles` rejected; anon JWT update of `user.slug` rejected; anon JWT update of `user.stripe_connect_account_id` rejected; service-role update succeeds. **Storage regression**: user A cannot upload to `${userB.id}/logo.png` (foldername policy denies). |
| **B17** ⏸️ blocked on `SUPABASE_ACCESS_TOKEN` repo secret | `types/database.ts` regenerated; published for matchday-web pull. **Gate for W11.** Runs LAST in Phase A (after B18 verifies schema is stable). Blocked: `supabase gen types typescript --project-id hqcwmjninvunoexccrbz` requires Pap-managed access token. |

### Phase B — Web apply flow (matchday-web) — depends on B17

| Commit | Description |
|---|---|
| **W11** ✅ shipped `e26f41d` | `bun run sync-types` pull from B17. Verify `OrganizerApplication`, `Venue`, `Tournament` types present. |
| **W12** ✅ shipped `f2cfc8c` | Add `cropperjs` + `react-cropperjs` wrapper (D1) + shadcn dialog primitive (if not already present). Bundle-size guardrail: lint rule or CI check that blocks merge if total client bundle grows by >120KB on this commit (override of original 100KB headroom to accommodate cropperjs ~80KB). |
| **W13** ✅ shipped `13092d4` | `/[locale]/organizer/apply` page + form. Required: LINE ID, WhatsApp, ToS checkbox, **logo (square 500×500 client-cropped via cropperjs before upload)**, **slug (with debounced 500ms real-time availability check via B14a Edge Function)**. Optional: phone, Instagram, Website, Facebook, Other social, Reference. ZodSchema client+server validation. Server action: (a) upload cropped logo blob to `organizer-logos/${user_id}/logo-${random6}.png` via Supabase Storage client, (b) **invoke `validate-organizer-logo` Edge Function** (B11a) — fails the submission if magic-bytes/dimensions wrong, (c) upsert `organizer_application` with status `submitted` (or `draft` if Save-Draft button), (d) set `User.organizer_logo_url` AND `User.slug` via SECURITY DEFINER functions `set_user_slug()` (B8a) + `set_user_organizer_logo_url()` (bypass B10 trigger), (e) emit `organizer.application_submitted` audit row, (f) invoke `send-organizer-application-email kind=received`. a11y: form-label associations, aria-live error region, slug-availability message announced to screen readers. **Cropper keyboard fallback** (per A13/F13): tab to crop area, arrow-key pan, +/- zoom, enter to confirm — manually verified, axe alone is insufficient for drag-handle interactions. |
| **W14** ✅ shipped `fb3c04e` | `/[locale]/organizer/apply/status` — read-only page. Reads applicant's most recent application via RLS (own only). Shows status badge + submitted date + (if rejected) review_reason + reapply CTA. |
| **W15** ✅ shipped `5092f45` | Auto-save behavior per D4 (30s debounced). Saved as `status='draft'` if not yet submitted. Submit transitions `draft → submitted`. |
| **W15a** ✅ shipped `3965ae1` | **IndexedDB persistence layer for cropped logo blob** (D8 override). Auto-save persists blob to IndexedDB (key: `${user_id}/organizer_application/logo`) on the same 30s debounce as form fields. localStorage's 5MB ceiling is hit by typical PNGs at 500×500 — IndexedDB is the right primitive. On page reload, blob is read back into component state; cropper re-mounts with the existing crop selection. **Cleared on submit success** (then re-uploaded to Supabase Storage by W13's server action). |
| **W16** ✅ shipped `389fc7e` | i18n keys for ALL new strings → `messages/en.json` + `messages/th.json` (placeholder Thai pending native review per `Plans/v02-th-i18n-review.md`). |
| **W17** ✅ shipped `e64a3ee` | Sentry capture on apply form server-action error paths (mirror v0.2 `function: organizer.apply` tag). |

### Phase C — Web admin panel (matchday-web) — parallel with Phase B after B17

| Commit | Description |
|---|---|
| **W18** ✅ shipped `7b58845` | Middleware extension: `/[locale]/admin/*` paths require `user_has_role('admin')`. Non-admins → 404 (don't reveal existence of admin pages). Sentry tag `kind: not_authorized`. |
| **W19** ✅ shipped `2058730` | `/[locale]/admin` dashboard page — **Server Component** (must NOT be `'use client'`; admin queries through service-role-aware path stay server-side). Stats bar (counts via Supabase queries via admin RLS): total users, total organizers, **pending TO applications (badge)**, total tournaments, live tournaments (0). Action items: pending applications list (newest 10, click-through to detail). Recent activity: last 20 rows from `admin_activity_feed` view (B12a — column-masked, no JSONB snapshot exposure). Platform health: link to Sentry dashboard + Supabase dashboard (env-var-gated URLs). (Addresses stress-test A9 + A11.) |
| **W20** ✅ shipped `9179355` | `/[locale]/admin/organizer-applications` list page — **Server Component**. Server-side paginated 20/page. Newest first. Each row: applicant name, submitted date, LINE ID, current status, click-through. (Addresses stress-test A11.) |
| **W21** ✅ shipped `114fc38` | `/[locale]/admin/organizer-applications/[id]` detail page — **Server Component for the read**, with a small `'use client'` form for Approve/Reject actions. Reads application via admin-RLS. Renders all form fields + logo preview + applicant's player profile fields for context (display_name, country, nationality, etc.). Two action buttons: **Approve** (no reason; confirm dialog) and **Reject** (textarea required, max 500 chars, confirm dialog). Server actions invoke B15/B16 via `supabase.functions.invoke`. **"Resend approval/rejection email" button** appears after Approve/Reject if the email idempotency-key audit row didn't appear within 30s (recovery affordance for B15/B16's at-least-once email semantics). Sentry capture on action errors. (Addresses stress-test A11 + F4.) |
| **W22** ✅ shipped `3823b86` | i18n keys for admin surface. |
| **W23** ✅ shipped `1a417df` | a11y pass on admin surface (axe verify clean). |

### Phase D — Web organizer dashboard + tournament + venue + profile (matchday-web) — depends on B17; after W11

| Commit | Description |
|---|---|
| **W24** ✅ shipped `9dc23a4` | Middleware extension: `/[locale]/organizer/*` (excluding `/organizer/apply` and `/organizer/apply/status`) require `user_has_role('organizer')`. Non-organizers → redirect to `/organizer/apply` (with toast "You need to be an approved organizer to access this page"). |
| **W25** ✅ shipped `ec30082` | `/[locale]/organizer` dashboard — cards grouped by tournament status (Live now / Drafts / Upcoming / Past). v0.3 will show only Drafts since publish/live/past require v0.4+. Empty state: "Create your first tournament" CTA. |
| **W26** ✅ shipped `ababbec` | `/[locale]/venues/new` standalone venue create form (name, city, country, court count, court_names dynamic array input, optional address). Server action: insert with `created_by = auth.uid()`. RLS gates org-role. Sentry capture. |
| **W27** ✅ shipped `5e719cf` | `/[locale]/organizer/tournaments/new` tournament create form. Fields: name, dates (start/end), **venue selector** (existing dropdown OR inline "+ New venue" button → modal that wraps W26's form), draw size (4/8/16/32/64 buttons + Custom <=64), match format (best-of-1 / best-of-3), last-set rule (full set / tiebreak / super tiebreak), 3rd-place match (toggle), level band (free text), entry info (free text). Inserts `tournament` with `status='draft'`. Sentry capture. |
| **W28** ✅ shipped `20e524c` | `/[locale]/organizer/tournaments/[id]` — management hub. **D5 override: full edit + cancel access for organizer (own) + admin (any).** Top section: tournament summary (name, status badge, dates, venue, configuration). **Edit Tournament action**: links to W28a edit form. **Cancel Tournament action**: opens W28b confirm dialog. Empty section placeholders for "Registrations" (v0.4), "Seeding" (v0.5), "Live scores" (v0.6) with "Coming soon" labels. Admin viewing another organizer's tournament: same UI + `/admin` breadcrumb instead of `/organizer` + audit row emitted on any admin mutation (`tournament.admin_edited`, `tournament.admin_cancelled`). |
| **W28a** ✅ shipped `54a529c` | **Tournament edit form** (D5 override). `/[locale]/organizer/tournaments/[id]/edit`. Mirrors W27 create-form fields. RLS gates: organizer owns the tournament OR admin. Server action UPDATEs tournament row, emits `tournament.updated` audit row (or `tournament.admin_edited` if admin acting on non-owned). Sentry capture. |
| **W28b** ✅ shipped `07ec014` | **Tournament cancel action** (D5 override). Server action transitions `status` from `draft` → `cancelled`, sets `cancelled_at`. v0.3 has no registrations to notify (registrations land in v0.4). Confirm dialog: "Cancel this tournament? This cannot be undone in v0.3." (v0.4 may add un-cancel.) Emits `tournament.cancelled` audit row (or `tournament.admin_cancelled` if admin acting on non-owned). RLS gates same as W28a. |
| **W29** ✅ shipped `08ac4f6` | `/[locale]/organizer/[slug]` — public organizer profile. Server-renders from `user` table where `'organizer' = ANY(roles) AND slug = X`. Shows display_name, logo, **non-empty contact channels (D9 default — LINE/WhatsApp/email rows hide if empty)**, and **tournaments-hosted list** (filter on `tournament.organizer_id = user.id AND tournament.status NOT IN ('draft', 'cancelled')`). v0.3 shows zero tournaments since drafts are private and registration_open requires v0.4. |
| **W30** ✅ shipped `cb7fa8c` | i18n keys for organizer surface. |
| **W31** ✅ shipped `bb269cb` | a11y pass on organizer surface (axe verify clean). |

### Phase E — DoD verification + ship

| Commit | Description |
|---|---|
| **DoD1** | Per-feature ship matrix recorded in `Plans/v03-dod-evidence.md`. Each row: code-complete? · backend-deployed? · web-deployed? · E2E manually verified? |
| **DoD2** | E2E walkthrough by Pap (Pap-action): (a) sign in as test player → apply for organizer (logo upload works, ToS checkbox present, LINE+WhatsApp required) → see "received" email → status page shows submitted; (b) sign in as Pap-admin → see badge on /admin → open application → click Approve → applicant gets approved email; (c) applicant signs in → /organizer dashboard accessible → create venue → create tournament as draft → tournament invisible at `/[locale]/organizer/[slug]` (because draft) → tournament visible only at `/organizer/tournaments/[id]` to applicant + admin; **(d) admin can read applicant's draft tournament hub via /admin/* path with read-only banner (per D5)**; **(e) reject path: submit second test application from a different test account → admin rejects with reason → applicant receives rejection email with reason → status page shows rejected + reason + reapply CTA → applicant reapplies (same account, new application row) → reapplication is independent and visible in admin queue.** (Addresses stress-test F10 + F15.) |
| **DoD3** | Both CIs green on `main`. |
| **DoD4** | Vercel deploy live; admin role applied to Pap user. |
| **DoD5** | DECISIONS.md updated with v0.3.0 outcomes (D1-D8 final answers, P1-P3 status). |
| **DoD6** | `Plans/version-roadmap.md` v0.3.0 header gets `Shipped` + ship date. |
| **DoD7** | `Plans/decisions.md` gets v0.3.0 ship entry. |
| **DoD8** | `padelthailand.com/matchday/` rebuilt + Pap-approved push. |

---

## 4 · Per-feature ship matrix (replaces Path1/Path2 binary)

At code-complete, each row independently green-or-red:

| Feature | Code-complete | Backend ready | E2E verified | Ship status |
|---------|---------------|---------------|--------------|-------------|
| Organizer apply (form + status) | ⬜ | ⬜ B8/B11/B14 | ⬜ | Required for v0.3.0 |
| Admin dashboard | ⬜ | ⬜ B8/B12 | ⬜ | Required for v0.3.0 |
| Admin applications list + detail | ⬜ | ⬜ B15/B16 | ⬜ | Required for v0.3.0 |
| Venue create | ⬜ | ⬜ B8 | ⬜ | Required for v0.3.0 |
| Tournament create as draft | ⬜ | ⬜ B8 | ⬜ | Required for v0.3.0 |
| Organizer dashboard | ⬜ | ⬜ B8 | ⬜ | Required for v0.3.0 |
| Tournament management hub stub | ⬜ | ⬜ B8 | ⬜ | Required for v0.3.0 |
| Organizer public profile | ⬜ | ⬜ B8 | ⬜ | Required for v0.3.0 |

v0.3.0 ships when 8/8 are green. There's no Apple-style long-pole; everything is internal.

---

## 5 · Cross-cutting DoD (every version, per `version-roadmap.md`)

- **a11y** — keyboard nav + screen-reader labels + WCAG AA contrast on every new page (apply form, status, /admin, /admin/organizer-applications, /admin/organizer-applications/[id], /organizer, /organizer/tournaments/new, /organizer/tournaments/[id], /organizer/[slug], /venues/new). axe-core verified clean. **Logo cropper has keyboard fallback** (numeric crop coordinates) — non-trivial; flagged as risk.
- **Observability** — Sentry capture on every server-action error path with `function: organizer.apply / admin.approve / admin.reject / organizer.create_tournament / organizer.create_venue` tags. Edge Functions B14/B15/B16 capture failures via existing `_shared/sentry.ts` wrapper.
- **Audit log** — every mutating action emits a row: `organizer.application_submitted`, `organizer.approved`, `organizer.rejected`, `organizer.role_revoked` (v2 only — exposed in v0.3 for completeness), plus `tournament.created`, `venue.created`.
- **i18n** — every new user-visible string is an i18n key from day one. TH bundles get placeholder strings pending native review (carried obligation).
- **Privacy / consent** — apply form collects LINE + WhatsApp + optional contact fields; **ToS checkbox** is the consent boundary. Reuse v0.2's privacy policy stub at `/privacy`; add a TO-specific addendum if scope > player profile fields (D-decision: ask Pap).

---

## 6 · Anti-criteria (locked)

- v0.3.0 must NOT ship registration features (those are v0.4.0)
- v0.3.0 must NOT ship draw / seeding / bracket features (v0.5+)
- v0.3.0 must NOT ship live scoring (v0.6)
- v0.3.0 must NOT ship match scheduling UI (v0.7)
- v0.3.0 must NOT ship spectator mode (v0.8)
- v0.3.0 must NOT collect any payment-processor KYC field (per build-prompt §7.6 design rule)
- v0.3.0 must NOT allow self-elevation to `organizer` or `admin` via the profile form (B10 self-elevation guard)
- v0.3.0 must NOT make tournament `draft` visible to anyone but the owner + admin
- v0.3.0 must NOT ship without RLS regression tests for the 3 new tables
- v0.3.0 must NOT modify the v0.2.0 frozen surface (sign-in, /onboard, /me/*) except for the non-disruptive self-elevation policy hardening at B10
- v0.3.0 must NOT push padelthailand.com/matchday/ without explicit Pap approval
- ~~v0.3.0 must NOT ship an Edit Tournament action on the W28 management hub stub.~~ **REMOVED** — D5 overridden 2026-04-28; W28a + W28b deliver edit + cancel per spec §12.
- v0.3.0 must NOT ship live scoring affordances on W28 (per spec §12 score access is v0.6). The "Live scores" placeholder stays "Coming soon".
- v0.3.0 must NOT ship registration UI on W28 (registration is v0.4). The "Registrations" placeholder stays "Coming soon".
- **v0.3.0 must NOT expose `audit_log.before_snapshot`/`after_snapshot` JSONB to the activity feed on /admin.** Feed reads from `admin_activity_feed` SECURITY DEFINER view (B12a) which projects only non-PII columns. Raw audit_log SELECT is reserved for the deferred /admin/audit-log page (v0.4). (Addresses stress-test A9.)
- **v0.3.0 must NOT mark email-send claims as "atomic with the DB transaction."** Email sends are at-least-once post-commit with idempotency keys; documented in B14/B15/B16. (Addresses stress-test F4 + A4.)

---

## 7 · Risk register (post-premortem + stress-test amendments)

| # | Risk | Mitigation |
|---|------|------------|
| R1 | Logo cropper UX is more complex than expected (touch + keyboard + a11y) | D1 picks a battle-tested library (`react-easy-crop` recommended); reserve buffer time on W12/W13 |
| R2 | Self-elevation RLS guard accidentally locks out legitimate profile updates | B10 includes regression test that exercises the v0.2 `/onboard` server action against the new policy. Trigger-based approach lets non-roles fields update normally. |
| R3 | Admin role bootstrap forgotten → Pap can't approve first organizer | DoD4 explicitly gates "admin role applied to Pap user". P1 in §2 documents the SQL. |
| R4 | Approve/Reject Edge Functions race-condition (double-click sends two approves) | Idempotency key on application_id + kind; Edge Function uses `SELECT ... FOR UPDATE` on the application row before status change. |
| R5 | Tournament management hub stub (W28) creeps into v0.4 territory | Strict spec: read-only summary + "Coming soon" placeholders. No edit affordances in v0.3. |
| R6 | Organizer public profile shows zero tournaments forever (v0.3 has no publish flow) | Acceptable. v0.4 adds publish; v0.3 profile is structural. Empty-state copy: "No tournaments yet — first one coming soon." |
| R7 | Admin dashboard "Recent activity feed" reads `audit_log` directly → leaks PII | Activity feed shows only action + actor display_name + subject + relative timestamp. before/after snapshots NOT exposed in feed (only on click-through to row detail; v0.3 keeps detail behind `/admin/audit-log` which is **deferred to v0.4** to avoid scope creep — feed is read-only summary). |
| R8 | Storage bucket policy lets one user overwrite another user's logo | B11 RLS policy: insert/update path must start with `${user_id}/`. Validated via storage.objects RLS. |
| R9 | Email templates ship English-only into Thai-first market | Templates are bilingual from B13 (TH+EN). Language picked from applicant's `user.language_preference` (set during /onboard in v0.2). |
| R10 | Organizer slug collision (D2) | Slug generation uses `display_name` slugified + `-${random4}` suffix on collision. Index on lower(slug). |
| R11 | Pap doesn't see new applications → silent backlog | D7 default is "no email"; if volume becomes a problem, add admin notification email in a v0.3.x patch. v0.3 manual-check-dashboard model is defensible at expected 1-5 apps. |
| R12 | "Draft" application state allows applicants to write garbage forever | Auto-cleanup not in v0.3. v2 task: cron Edge Function purges drafts older than 30 days. Noted in §1 out-of-scope. |
| R13 | **PDPA notice gap** — admin reviewing application sees player profile fields (DOB, nationality, phone). v0.2's privacy notice doesn't disclose admin-review use. | Add to §3 DoD: update v0.2 privacy stub to disclose "Matchday admins (Pap and designees) review your profile data when you apply to be an organizer." Either DoD-blocking or apply alongside W21. (Addresses stress-test F14.) |
| R14 | **Logo bucket leaks** — organizer-logos is public-read; rejected-applicant logos stay readable forever (user_id-guessable). | v2 task (cron purge of rejected-applicant logos) noted in §1 out-of-scope. v0.3 mitigation: storage path uses random suffix per upload (`${user_id}/logo-${random6}.png`) instead of fixed `logo.png` — defeats trivial enumeration. (Addresses stress-test F9.) |
| R15 | **Email-send post-commit failure leaves applicant approved without notification** | B15/B16 documented as at-least-once. Recovery affordance: "Resend email" button on W21 admin detail page. (Addresses stress-test F4 + A4.) |
| R16 | **Phase A length is large** (B8, B8a, B9, B10, B11, B11a, B12, B12a, B13, B14, B15, B16, B18, B17 — 14 commits) | Each commit is one algorithm run. ~2 weeks of Phase A. Phase B+C+D parallelize after B17 to compress total wall-clock. |

---

## 8 · Approval gates

This plan requires explicit Pap approval before any scaffolding:

1. ✅ Plan drafted (DRAFT v1)
2. ✅ Plan stress-tested by Plan agent + Architect agent — amendments captured as DRAFT v2
3. ✅ Pap reviewed; D1-D12 answered; P1-P3 acknowledged (DRAFT v3)
4. ⬜ Phase A (B8 → B8a → B9 → B10 → B11 → B11a → B12 → B12a → B13 → B14 → B14a → B15 → B16 → B18 → B17) authorized to execute as a sequence of algorithm runs (one commit per algorithm, mirror v0.2 cadence)
5. ⬜ Phase B + C + D execute in parallel (where ordering allows) after B17 lands

Subsequent algorithms execute the phased commits.

---

## Change log — DRAFT v1 → DRAFT v2 (2026-04-28)

Stress-test by Plan agent + Architect agent surfaced 15 actionable findings. Applied:

**Critical (4):**
- F1: B8a added — ALTER TABLE user adds `organizer_logo_url`, `slug` (unique + lower-index), `stripe_connect_account_id`, `omise_recipient_id`; `set_user_slug()` SECURITY DEFINER for collision-loop slug updates
- F3 + A2: B10 broadened to BEFORE UPDATE trigger covering `roles`, `slug`, `organizer_logo_url`, `stripe_connect_account_id`, `omise_recipient_id` (not just `roles`)
- F8: B8 RLS policies for `tournament` and `venue` INSERT now include `WITH CHECK (organizer_id/created_by = auth.uid())`
- A3: B11 storage policy uses `(storage.foldername(name))[1] = auth.uid()::text` (canonical Supabase pattern), not raw LIKE

**Important (8):**
- F2: Phase A order swapped — B18 (RLS regression tests) is now the gate, B17 (types publish) lands LAST
- F4 + A4: B15/B16 explicitly reframed as "atomic DB writes + at-least-once email post-commit"; B14 idempotency via DB unique constraint not in-memory; "Resend email" admin button added at W21
- F5: §1 out-of-scope explicitly lists `/admin/audit-log` + `/admin/users` as v0.4 deferrals
- F7 + A11: B11 adds MIME + size limits at bucket level; B11a (validate-organizer-logo Edge Function) added for magic-byte + dimensions
- F10: D5 default changed — admin gets read-only access to draft tournaments in v0.3 (with banner) instead of full deferral; DoD2 step (d) added
- F12: D9 (contact-channel visibility), D10 (ToS scope), D11 (audit_log shape), D12 (under_review state) added to decision table
- F14: R13 added (PDPA privacy notice update for admin review of profile data)
- F15: DoD2 step (e) added — full reject-path E2E walkthrough
- A1: D11 explicit decision on audit_log shape; default = stay polymorphic, accept v0.4 migration debt
- A9: B12a added — `admin_activity_feed` SECURITY DEFINER view; W19 reads from view not raw audit_log
- A11: W19/W20/W21 explicitly Server-Component-annotated

**Nits (3):**
- F6 + D12: `under_review` dropped from organizer_application_status enum (4-state lifecycle)
- F11: Anti-criterion against W28 edit affordances added
- F13: Cropper keyboard-fallback acceptance criterion explicit on W13 + §5

**Accepted as-is (not amended):**
- A5: Discriminator-based send function pattern (kept)
- A6: gh-CLI type-sync race is a feature (TS fail-compile is the fail-safe)
- A8: W28 stub idempotent under future status transitions (no change needed)
- A10: TH placeholder convention `[TH] <english>` — added as nit in §5
- A12: pg_notify event-driven seam — deferred to v0.4 along with audit_log shape migration

---

*End of v0.3.0 build plan v2.*

---

## Change log — DRAFT v2 → DRAFT v3 (2026-04-28)

D-decisions answered by Pap. Defaults locked except for 4 overrides with scope deltas:

**Overrides:**
- **D1: cropperjs + react-cropperjs** (vs default react-easy-crop) — W12 bundle guardrail bumped 100KB → 120KB
- **D2: User-chosen slug at apply-time** (vs default auto-slug) — added B14a (`check-slug-availability` Edge Function); W13 form gains slug input with debounced 500ms availability check; reserved-slug blocklist documented
- **D5: Full admin edit + cancel access** (vs default read-only) — W28 expanded; added W28a (edit form) + W28b (cancel action); anti-criterion against W28 edit removed; new anti-criteria added against live scoring + registration UI on W28
- **D8: Form data + cropped blob auto-saved** (vs default no-logo-until-submit) — added W15a (IndexedDB persistence layer); 30s debounce shared with W15

**Defaults locked (D3, D4, D6, D7, D9, D10, D11, D12):** see §2 Decisions table above.

**Scope deltas summary:**
- Phase A: +1 commit (B14a) → 15 commits
- Phase B: +1 commit (W15a) → 8 commits
- Phase C: unchanged → 6 commits
- Phase D: +2 commits (W28a, W28b) → 10 commits
- **Total Phase commits:** 35 → 39

*End of v0.3.0 build plan v3.*
