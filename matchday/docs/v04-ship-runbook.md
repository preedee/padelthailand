# Matchday v0.4.0 — Pap-Action Ship Runbook

> **Status:** Phase A backend 100% complete + deployed to remote prod. Phase B (matchday-web W32-W44) in flight via parallel-blitz; runbook will be ready when Phase B lands.
> **Audience:** Pap, executing one-time setup + verification.
> **Estimated time:** 30-45 minutes if everything works first try.
> **Updated:** 2026-04-28.
> **Predecessor:** `v03-ship-runbook.md` (which is still pending Pap E2E for v0.3 ship). v0.4 inherits v0.3's prereqs — **no new Pap accounts/secrets needed**.

---

## Pre-flight checklist

Same as v0.3 runbook. v0.4 reuses everything:

- [ ] Admin role bootstrap on Pap user already done (or run Step 1 from v03 runbook if still pending — same SQL)
- [ ] OrbStack running locally (or Docker Desktop)
- [ ] `gh` CLI with write access to `preedee/matchday-backend` and `preedee/matchday-web`
- [ ] `~/Cowork/openrally/matchday/web/` with `.env.local` pointing at remote ref `hqcwmjninvunoexccrbz`
- [ ] `SUPABASE_ACCESS_TOKEN` + `SUPABASE_DB_PASSWORD` GitHub secrets set on `preedee/matchday-backend` (already set during v0.3)

**No new external accounts needed for v0.4.** Phase A's Edge Functions are deployed; Resend integration is the same as v0.3 (still optional — dev-fallback console-logs when `RESEND_API_KEY` unset).

---

## Step 1 · pg_cron (optional but recommended)

v0.4's auto-close cron (B33) runs `auto-close-tournaments` Edge Function every 5 minutes to flip tournaments from `registration_open → registration_closed` once `registration_close_at` passes. Without pg_cron set up, TOs must manually close registration via the management hub.

**Enable + schedule:**

1. Open https://supabase.com/dashboard/project/hqcwmjninvunoexccrbz/database/extensions
2. Search "pg_cron" → enable.
3. Run this SQL once in Studio (replace `<service-role-key>` with the value from Project Settings → API → service_role):
   ```sql
   select cron.schedule(
     'auto-close-tournaments',
     '*/5 * * * *',
     $$ select net.http_post(
       url := 'https://hqcwmjninvunoexccrbz.supabase.co/functions/v1/auto-close-tournaments',
       headers := '{"Authorization":"Bearer <service-role-key>","Content-Type":"application/json"}'::jsonb,
       body := '{}'::jsonb
     ); $$
   );
   ```
4. Verify: `select * from cron.job where jobname = 'auto-close-tournaments';` should return 1 row.

**Skip if you don't want auto-close** — TO manual close still works.

---

## Step 2 · Local Supabase + new RLS test

Run the v0.4 RLS regression tests locally before E2E:

```bash
cd ~/Cowork/openrally/matchday/backend
supabase start  # ~10sec if previously started
SUPABASE_URL=http://127.0.0.1:54321 \
  SUPABASE_ANON_KEY="<paste from supabase status>" \
  SUPABASE_SERVICE_ROLE_KEY="<paste from supabase status>" \
  bun test supabase/tests/rls/v04_registration_partner_invite.test.ts
```

Expected: all 8 scenarios pass (two-row mirror + accept/decline + capacity+waitlist + F06 self-invite + F06 repeat-invite + F03 withdraw-after-close + RLS read scoping).

---

## Step 3 · matchday-web local dev pointed at remote prod

```bash
cd ~/Cowork/openrally/matchday/web
bun dev
```

Open three browsers (or three Chrome profiles) — one for each test player. Sign in fresh players via magic-link to remote prod.

---

## Step 4 · v0.4 E2E walkthrough — the DoD

This walkthrough mirrors `v04-build-plan.md` §3 DoD2 verbatim. ~12 scenarios.

### 4a · Tournament setup (Pap as TO)

1. Sign in as Pap (admin + organizer roles per Step 1 of v03 runbook).
2. Create a test tournament: `/organizer/tournaments/new`. Name "v0.4 E2E Test", venue (existing or new), draw_size **2** (so we can hit capacity quickly), dates today+30 to today+31, slug `v04-e2e-test` (D12 vanity slug).
3. Open the tournament management hub: `/organizer/tournaments/<id>`.
4. Click **"Open Registration"** → confirm dialog → tournament status flips to `registration_open`.

### 4b · Solo registration (Browser B — Player Alice)

1. Sign in as Alice. Navigate to `/tournaments/pap/v04-e2e-test` (slug-based URL).
2. Click "Register solo".
3. Expected: Toast "Registered (confirmed)" → tournament page shows "You're confirmed" + Withdraw button. Email "registration_confirmed" in Supabase logs (or Resend dashboard if real key configured).

### 4c · Doubles via partner-invite (Browser C — Player Bob)

1. Sign in as Bob. Same tournament URL.
2. Click "Register with a partner" → search modal.
3. Type "Alice" — search matches but Alice has `already_registered_hint` (disable Invite button).
4. Type a third user's display_name (Carol — needs to exist in remote prod). Click "Invite Carol".
5. Expected: Toast "Invite sent. Waiting for Carol to confirm." Bob sees status "Waiting for Carol".

### 4d · Carol accepts (Browser A — Player Carol)

1. Sign in as Carol. Open the magic-link from her email at `/invite/<token>`.
2. Page shows tournament context + Accept/Decline.
3. Click Accept.
4. **Expected:** Page redirects to tournament. Both Bob and Carol now show as confirmed. **OR** if capacity (draw_size=2) was filled by Alice + (Bob/Carol pair): both move to waitlist together.

### 4e · Capacity + waitlist auto-promotion

1. Setup: tournament has Alice (confirmed solo) + Bob/Carol pair (waitlisted, since draw_size=2 and Alice took 1 of 2 team-slots).
2. Alice withdraws (her tournament page → Withdraw → confirm).
3. **Expected:** Bob and Carol auto-promoted from waitlist to confirmed atomically. Both receive `waitlist_promoted` email.

### 4f · Decline path

1. Bob (Browser C) → "Add partner" (he's now confirmed solo since pair was promoted). Invite Dave (a 4th test user).
2. Dave clicks the magic link → `/invite/<token>` → Decline.
3. **Expected:** Bob receives `partner_declined` email. Bob's registration stays confirmed solo.

### 4g · TO manual waitlist promotion

1. Re-add Carol/Dave as a waitlisted pair (or any solo waitlist entry).
2. Pap (Browser A — TO) opens management hub → Registrations tab.
3. Click Promote on a waitlisted entry → confirm.
4. **Expected:** Entry status flips to confirmed. `waitlist_promoted` email fires.

### 4h · Pending-invite expiry (cron sweep)

If you set up Step 1 (pg_cron):
1. Send an invite from Bob to a new player.
2. In Supabase Studio SQL editor: `update tournament set registration_close_at = now() - interval '1 minute' where id = '<test-tournament-id>';` to force close.
3. Wait up to 5 minutes for cron to fire.
4. **Expected:** Tournament status='registration_closed'. Pending invite expired. Bob receives `cancelled_by_system` email. Audit log shows the sweep.

If you didn't set up pg_cron, manually close registration via management hub button — same sweep should fire (B32 calls B33b).

### 4i · Cancel-with-registrations (admin path)

1. Pap (admin) opens any tournament with active registrations.
2. Click W28b Cancel button.
3. **Expected:** Confirmation dialog: "This tournament has N active registrations. Cancel anyway? All players will be notified." → confirm.
4. **Expected:** All registrations flip to status='cancelled'. Tournament status='cancelled'. All players receive `registration_withdrawn` email (with `tournamentCancelled: true` flag).

### 4j · F06 anti-spam guards

1. As Bob, try to invite himself: search his own display_name → expect Invite disabled or 422.
2. As Bob, invite Carol → wait 5 sec → invite Carol again → expect 409 "duplicate pending invite".

### 4k · F03 withdraw-after-close

1. Tournament status='registration_closed'.
2. Try to withdraw as Alice → expect error "cannot withdraw outside registration_open".

### 4l · Cross-account admin tournament view

1. Pap (admin) navigates to a different organizer's tournament URL.
2. **Expected:** Management hub renders with "Admin viewing" banner. Edit + Cancel buttons still work and emit `tournament.admin_edited` / `tournament.admin_cancelled` audit actions.

---

## Step 5 · Tell me you're done with E2E

When Step 4 passes (or you hit a bug), come back and tell me:

- **All green?** I'll proceed to Step 6 (roadmap flip + product-hub rebuild + decisions log entry).
- **Any failures?** Share the URL/screenshot/error and I'll fix forward.

---

## Step 6 · Ship-day actions (I'll do these once you confirm E2E green)

1. Update `Plans/version-roadmap.md` — flip v0.4.0 from `Planned` to `Shipped` with today's date.
2. Append `Plans/decisions.md` — v0.4.0 ship entry.
3. Update `matchday/DECISIONS.md` — final D-decision answers (D1-D15) + any deviations discovered during E2E.
4. Rebuild + push the product-hub: `bash matchday/product-hub/deploy.sh` → padelthailand.com/matchday/ shows v0.4.0 as Shipped.
5. (Optional) Pre-stage v0.5 build plan for next session.

---

## Step 7 · Optional polish (post-ship, not blockers)

- **Native-Thai i18n review** — same backlog as v0.1/v0.2/v0.3.
- **axe a11y on authenticated routes** — deferred until OrbStack runtime testing.
- **Resend prod activation** — set `RESEND_API_KEY` GitHub secret to fire real emails (currently console-logs in dev-fallback).
- **OAuth providers + Vercel custom domain** — same v0.2 ship-blockers.
- **Email cancelled-by-system templates** — Wave 3 agent (B33/B33c) reused `registration_withdrawn` template for the cancel-by-system path; copy quality could be improved in a v0.4.x patch.

---

## Rollback notes

- **Schema rollback:** all 9 v0.4 migrations are forward-only. Roll back via a new `99_rollback_v04.sql` migration that DROPs registration/partner_invite/team/team_member tables in reverse FK order. Avoid `supabase db reset` on prod (data loss).
- **Edge Function rollback:** `supabase functions deploy <name> --version <prior>` if any of the 12 new functions regress. Supabase keeps prior versions.
- **Web rollback:** revert the offending matchday-web commit on main, push, Vercel auto-deploys revert. Middleware fail-closed (404 / redirect) so partial rollback can't accidentally expose new pages.

---

## Key references

- Build plan: `matchday/Plans/v04-build-plan.md` (DRAFT v3 — all D1-D15 locked, every B-commit ✅ shipped)
- Stress-test findings: same file's change-log section
- Decisions log: `matchday/Plans/decisions.md` (v0.4 Phase A ship entry from 2026-04-28)
- v0.3 runbook (parent): `matchday/Plans/v03-ship-runbook.md`
- Supabase project: `hqcwmjninvunoexccrbz` (Singapore, free tier)

---

*End of v0.4.0 ship runbook.*
