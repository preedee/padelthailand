# Matchday v0.3.0 — Pap-Action Ship Runbook

> **Status:** Code surface 100% complete + CI-green on main (matchday-backend + matchday-web). Migrations applied to remote prod. All Edge Functions deployed. Types regenerated. **Ship gate is now PURELY Pap-side actions.**
> **Audience:** Pap, executing one-time setup + verification.
> **Estimated time:** 30-45 minutes if everything works first try.
> **Updated:** 2026-04-28.

---

## Pre-flight checklist

Before starting, confirm:

- [ ] You have admin access to the Supabase dashboard at https://supabase.com/dashboard/project/hqcwmjninvunoexccrbz
- [ ] OrbStack is installed (or you can run Docker Desktop — Supabase CLI needs a container runtime for `supabase start`)
- [ ] You can run `gh` CLI with write access to `preedee/matchday-backend` and `preedee/matchday-web`
- [ ] You're at `~/Desktop/Cowork/matchday/web/` for the local E2E walkthrough

---

## Step 1 · Bootstrap your admin role (3 min)

The B10 self-elevation guard prevents users from setting their own `roles`. You must grant yourself `admin` via service-role SQL on remote prod.

1. Open https://supabase.com/dashboard/project/hqcwmjninvunoexccrbz/sql/new
2. Find your `auth.users.id` (the UUID for preedee@gmail.com):
   ```sql
   select id, email from auth.users where email = 'preedee@gmail.com';
   ```
   Copy the UUID returned.
3. Append `admin` to your roles array (idempotent — safe to re-run):
   ```sql
   update public."user"
   set roles = array_append(roles, 'admin')
   where id = '<paste-uuid-here>'
     and not ('admin' = any(roles));
   ```
4. Verify:
   ```sql
   select id, email, roles from public."user" where id = '<paste-uuid-here>';
   ```
   Expect `roles` to include `admin` (alongside `player` and possibly `organizer`).

---

## Step 2 · Get OrbStack + local Supabase running (5 min)

1. Open OrbStack (or Docker Desktop). Confirm `docker info` runs.
2. Start local Supabase stack:
   ```bash
   cd ~/Desktop/Cowork/matchday/backend
   supabase start
   ```
   Takes ~2 min on first run; pulls images. Subsequent starts ~10 sec.
3. Get the local anon key + service role key:
   ```bash
   supabase status
   ```
   Copy `anon key` and `service_role key` for the next step.

---

## Step 3 · Run the v0.3 RLS regression tests locally (2 min)

These are gated by CI but worth one local confirmation before E2E:

```bash
cd ~/Desktop/Cowork/matchday/backend
SUPABASE_URL=http://127.0.0.1:54321 \
  SUPABASE_ANON_KEY="<paste-anon>" \
  SUPABASE_SERVICE_ROLE_KEY="<paste-service-role>" \
  bun test supabase/tests/rls/
```

Expect all four test files to pass:
- `profile_update.test.ts` (v0.2 + B10 self-elevation contract)
- `v03_organizer_venue_tournament.test.ts` (B8 RLS + F8 ownership guards)
- `v03_self_elevation_storage.test.ts` (B10 + B11 storage policies)

---

## Step 4 · E2E walkthrough — the v0.3 DoD (15 min)

Open two browsers (or two profiles in one browser) so you can act as two users without logging out.

### 4a · Set up matchday-web pointing at remote prod

```bash
cd ~/Desktop/Cowork/matchday/web
# .env.local should already point at the remote project. Confirm:
grep NEXT_PUBLIC_SUPABASE .env.local
# Expected:
#   NEXT_PUBLIC_SUPABASE_URL=https://hqcwmjninvunoexccrbz.supabase.co
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=<remote-anon-from-Supabase-dashboard>
bun dev
```

Open http://localhost:3000/en in **Browser A** (your admin account, preedee@gmail.com) and **Browser B** (a fresh test account — sign up with a different email).

### 4b · Apply path (Browser B)

1. **Sign in** as the test player → complete `/onboard` if first time.
2. Navigate to `/en/organizer/apply`.
3. Fill the form:
   - **Slug:** type a candidate; verify the availability check fires (debounced 500ms) and the badge says "available" or "taken/reserved/invalid_format".
   - **LINE ID + WhatsApp** (required).
   - **Logo:** upload a PNG; cropper opens; crop to 500×500; confirm.
   - Optional fields as desired.
   - Tick **ToS checkbox**.
   - Click **Submit**.
4. Expected:
   - Page redirects to `/en/organizer/apply/status` showing "Submitted".
   - In the Supabase dashboard → Authentication → email logs, confirm a `received` email was queued.
   - In Supabase → SQL editor: `select status, submitted_at from public.organizer_application order by created_at desc limit 1;` — expect `status = 'submitted'`.

### 4c · Admin path (Browser A)

1. **Sign in** as preedee@gmail.com (admin role from Step 1).
2. Navigate to `/en/admin`. Expect the dashboard with:
   - Stats bar (total users, total organizers, **pending TO applications: 1**, tournaments).
   - Pending applications list showing the test applicant.
   - Recent activity feed (last 20 audit_log rows via `admin_activity_feed` view).
3. Click into the test application → `/en/admin/organizer-applications/<id>`.
4. Verify all form fields render + logo preview shows + applicant profile context (display_name, country, etc.).
5. Click **Approve** → confirm dialog → confirm.
6. Expected:
   - Application row shows `status='approved'`, `reviewed_by` = your UUID.
   - Test applicant's `roles` array now includes `organizer` (verify via SQL: `select roles from public."user" where email = '<test-email>';`).
   - Approval email sent to test recipient (check Supabase Auth dashboard email logs OR if Resend is configured, the Resend dashboard).
7. **(Optional) Reject path:** create a second test application from a third email. Reject with a reason. Confirm the rejection email surfaces the reason and the status page on the applicant side shows it + a reapply CTA.

### 4d · Organizer path (Browser B, now approved)

1. Sign back in as the test player (now approved organizer).
2. Navigate to `/en/organizer`. Expect the dashboard with empty state ("Create your first tournament" CTA).
3. Create a venue at `/en/venues/new`:
   - Name, city, country (TH default), court count (e.g. 4), court names (auto-fills "Court 1-4"), optional address.
   - Save → redirect to `/organizer`.
4. Create a tournament at `/en/organizer/tournaments/new`:
   - Name, dates, venue (your new one), draw size 16, match format best_of_3, last-set super_tiebreak, level band "Open", entry info "Free entry — DM to register".
   - Submit → redirects to `/en/organizer/tournaments/<id>`.
5. Verify the management hub shows:
   - Tournament summary (status badge: **draft**).
   - Edit Tournament + Cancel Tournament actions visible.
   - "Coming soon" placeholders for Registrations / Seeding / Live scores.
6. Visit `/en/organizer/<your-slug>` (the public profile). Expect:
   - Display name + logo + non-empty contact channels.
   - Tournaments-hosted list: empty (the draft is invisible to public; correct per RLS).
7. **Edit test:** click Edit Tournament, change the name, save. Verify it updates.
8. **Cancel test:** click Cancel Tournament, confirm. Verify status flips to `cancelled` and `cancelled_at` is set.

### 4e · Cross-account admin test (D5 override)

1. Browser A (admin) navigates to the test player's tournament URL (you'll see it in Browser B's URL bar).
2. Expect the management hub to render with an "Admin viewing" banner.
3. Try Edit / Cancel from the admin context. Expect they work but emit `tournament.admin_edited` / `tournament.admin_cancelled` audit actions instead of the regular ones.

---

## Step 5 · Tell me you're done with E2E

Once Step 4 passes (or you hit a bug), come back here and tell me:

- **All green?** I'll proceed to Step 6 (roadmap flip + product-hub rebuild + decisions log).
- **Any failures?** Share the URL/screenshot/error and I'll fix forward.

---

## Step 6 · Ship-day actions (I'll do these once you confirm E2E green)

1. Update `Plans/version-roadmap.md` — flip v0.3.0 from `Planned` to `Shipped` with today's date.
2. Append `Plans/decisions.md` — v0.3.0 ship entry naming the per-feature matrix outcome + any deviations from the build plan.
3. Update `matchday/DECISIONS.md` — final D-decision answers (D1-D12) + any new gates discovered during E2E.
4. Rebuild + push the product-hub: `bash matchday/product-hub/deploy.sh` → padelthailand.com/matchday/ shows v0.3.0 as Shipped.
5. (Optional) Schedule a v0.4 kickoff agent for next week.

---

## Step 7 · Optional polish (post-ship, not blockers)

- **Native-Thai i18n review** — `Plans/v02-th-i18n-review.md` is the carried obligation from v0.1/v0.2. v0.3 added many new TH placeholders prefixed `[TH]`. A native speaker should review the full bundle.
- **axe a11y on authenticated routes** — deferred until you ran OrbStack + axe against `/admin` + `/organizer/*` + `/organizer/apply` (per W23 + W31 deferrals).
- **Vercel custom domain + OAuth providers** — still pending from v0.2 (D1 domain, P2 Facebook OAuth, P3 Google OAuth, P4-P6 Resend, P7 Vercel deploy).
- **Resend prod activation** — set `RESEND_API_KEY`, `RESEND_FROM_PROD`, `RESEND_WEBHOOK_SECRET` GitHub secrets on `preedee/matchday-backend` (instructions in `.github/workflows/deploy.yml` header). Re-run "Deploy to Supabase prod" workflow to sync them to the Edge Functions.
- **Sentry edge DSN** — set `SENTRY_DSN_EDGE` repo secret to activate Edge Function error capture.

---

## Rollback notes

If v0.3 ships and a critical bug surfaces:

- **Schema rollback:** all v0.3 migrations are forward-only. To roll back, write a new `99_rollback_v03.sql` migration that DROPs the new tables/enums/triggers/policies in reverse order. Avoid `supabase db reset` on prod (data loss).
- **Edge Function rollback:** `supabase functions deploy <name> --version <prior>` if a function regression surfaces (Supabase keeps prior versions).
- **Web rollback:** revert the offending matchday-web commit on main, push, Vercel auto-deploys the revert. The middleware gates fail-closed (404 / redirect) so a partial rollback can't accidentally expose new pages.

---

## Key references

- Build plan: `matchday/Plans/v03-build-plan.md` (DRAFT v3 — all D-decisions locked, every B/W commit ✅ shipped)
- Stress-test findings: same file, change-log section + §8 approval gates
- Decisions log: `matchday/Plans/decisions.md` (Phase A summary entry from 2026-04-28)
- Supabase project: `hqcwmjninvunoexccrbz` (Singapore, free tier)
- Admin path: `https://<deployed-url>/en/admin` (live once Vercel domain set)
- Organizer apply: `https://<deployed-url>/en/organizer/apply`

---

*End of v0.3.0 ship runbook.*
