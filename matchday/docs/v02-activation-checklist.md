# Matchday v0.2.0 — Pre-flight Activation Checklist

> **Status:** READY (2026-04-27).
> **Purpose:** Single paste-friendly list of every secret + env var Pap
> needs to configure to flip v0.2.0 from code-complete to shipped.
> Detailed walkthroughs live in `matchday/DECISIONS.md` — this is the
> index.

All v0.2.0 code is shipped + CI green across both repos. The remaining
work is operational: create accounts, copy secrets into the right
storage location, trigger one Deploy run. Each row below states the
**name**, **value source**, **where to set it**, and **status**.

---

## 1 · matchday-backend — GitHub repo secrets

Set at: `https://github.com/preedee/matchday-backend/settings/secrets/actions`.
Consumed by `.github/workflows/{ci,deploy}.yml`. Some are auto-synced
to Supabase function secrets via the deploy.yml "Sync Edge Function
secrets" step (commits f9a96da + 1d23299).

| Key | What it does | Value source | Status |
|---|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | `supabase link` + `supabase functions deploy` auth | `https://supabase.com/dashboard/account/tokens` → New token | ⬜ |
| `SUPABASE_DB_PASSWORD` | `supabase db push` to remote prod | DB password set during project creation (project ref `hqcwmjninvunoexccrbz`) | ⬜ |
| `SENTRY_DSN_EDGE` | Activates `@sentry/deno` capture in Edge Functions | Sentry → new project → DSN | ⬜ — runbook in `matchday/DECISIONS.md` "Edge Function Sentry — activation steps" |
| `RESEND_API_KEY` | Activates real email send (else dev fallback) | Resend dashboard → API Keys → `email:send` scope | ⬜ — runbook in `matchday/DECISIONS.md` "Resend live verification runbook" |
| `RESEND_FROM_PROD` | Sender address (`From` header) | `noreply@<your-domain>` once domain verified | ⬜ — coupled with RESEND_API_KEY |
| `RESEND_WEBHOOK_SECRET` | Activates `resend-webhook` Svix signature verification | Resend dashboard → Webhooks → endpoint signing secret (starts `whsec_`) | ⬜ |

**All-three-or-none coupling on the Resend trio:** setting
`RESEND_API_KEY` without `RESEND_FROM_PROD` makes the Edge Function
throw at first send (`email.ts:resolveSender` hard-fail). Set all
three together.

---

## 2 · matchday-web — GitHub repo secrets

Set at: `https://github.com/preedee/matchday-web/settings/secrets/actions`.
Consumed by `.github/workflows/ci.yml` Build step (commit 2003cc3).

| Key | What it does | Value source | Status |
|---|---|---|---|
| `SENTRY_AUTH_TOKEN` | `withSentryConfig` build-time source-map upload | Sentry → Settings → Auth Tokens → New (scope `project:releases`) | ⬜ |
| `SENTRY_ORG` | Sentry org slug for upload | Sentry URL bar (e.g. `acme` from `acme.sentry.io`) | ⬜ |
| `SENTRY_PROJECT` | Sentry project slug for upload | Sentry → Projects → matchday-web project slug | ⬜ |
| `VERCEL_TOKEN` | Vercel CLI auth for `deploy.yml` push-to-main auto-deploy | Vercel → Account Settings → Tokens → Create Token | ⬜ |
| `VERCEL_ORG_ID` | Vercel team / personal org id | After `vercel link` locally, read from `.vercel/project.json` `orgId` | ⬜ |
| `VERCEL_PROJECT_ID` | Vercel project id | Same `.vercel/project.json` `projectId` | ⬜ |

When the Sentry trio is set, every CI build uploads sourcemaps. When
unset (current state), the wrapper degrades to no-op silently — CI
still passes. Runbook in `matchday/DECISIONS.md` "Source-map upload —
activation steps".

When the Vercel trio is set, every push to main auto-deploys.
deploy.yml uses a guard step to gracefully skip when `VERCEL_TOKEN`
is empty (verified 2026-04-27, commit 241f764, run 24991745702
exited 0 with skip path).

---

## 3 · Supabase function secrets

**No manual action required.** These are auto-synced from matchday-
backend GH secrets during deploy via the "Sync Edge Function secrets"
step. Consumed at runtime by Edge Functions via `Deno.env.get(...)`.

| Supabase secret name | Synced from GH secret | Consumer |
|---|---|---|
| `SENTRY_DSN` | `SENTRY_DSN_EDGE` | both Edge Functions (`@sentry/deno` init) |
| `RESEND_API_KEY` | `RESEND_API_KEY` | `_shared/email.ts:getApiKey` |
| `RESEND_FROM_PROD` | `RESEND_FROM_PROD` | `_shared/email.ts:resolveSender` |
| `RESEND_WEBHOOK_SECRET` | `RESEND_WEBHOOK_SECRET` | `resend-webhook/index.ts` Svix verify |

The deploy.yml step uses `[ -n "$VAR" ]` shell guards — missing GH
secrets stay missing on the Supabase side; functions then throw at
first request needing them. Loud, fast, recoverable.

---

## 4 · Vercel runtime env vars

**Pending.** Vercel project not yet created (gate D5/P7). When created
(via dashboard or `vercel link`), set these in
`Project → Settings → Environment Variables` (apply to Production +
Preview + Development as appropriate).

| Key | What it does | Value source | Where used |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (browser + server) | `https://hqcwmjninvunoexccrbz.supabase.co` | `lib/supabase/{client,server}.ts` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Supabase Studio → Settings → API → anon key | `lib/supabase/{client,server}.ts` |
| `NEXT_PUBLIC_SENTRY_DSN` | Browser Sentry runtime | Sentry → matchday-web project DSN | `sentry.client.config.ts` |
| `SENTRY_DSN` | Server + edge runtime Sentry | Sentry → matchday-web project DSN (can be same as browser) | `sentry.{server,edge}.config.ts` |
| `NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED` | Renders Google sign-in button | `"true"` to enable | `sign-in/page.tsx` |
| `NEXT_PUBLIC_OAUTH_FACEBOOK_ENABLED` | Renders Facebook sign-in button | `"true"` to enable | `sign-in/page.tsx` |
| `NEXT_PUBLIC_OAUTH_APPLE_ENABLED` | Renders Apple sign-in button | `"true"` to enable; gate D2 says deferred indefinitely | `sign-in/page.tsx` |

The `NEXT_PUBLIC_OAUTH_*_ENABLED` flags only render the button;
real OAuth still requires §5 below.

---

## 5 · Supabase Auth dashboard — OAuth providers

Set at: Supabase Studio → Authentication → Providers. Each provider
needs an OAuth app on its respective platform first (gate prereqs P2 +
P3 + P1).

| Provider | Prereq | What goes here | Status |
|---|---|---|---|
| Google | Google Cloud OAuth Client (P3) | Client ID + Client Secret | ⬜ |
| Facebook | Facebook Developer App (P2) | App ID + App Secret | ⬜ |
| Apple | Apple Developer Program enrollment (P1, $99/yr long pole) | Service ID + Team ID + Key ID + Private Key | ⬜ — gate D2 = deferred to v0.2.1+ |

Also configure Auth → URL Configuration → Redirect URLs to include:
- `https://<your-prod-domain>/auth/callback`
- `http://localhost:3000/auth/callback` (dev)

Plus `https://<vercel-preview-pattern>/auth/callback` if you want
preview deploys to support OAuth.

---

## 6 · Auto-injected (no action required)

These exist at runtime without configuration. Listed for completeness.

| Where | Key | Source |
|---|---|---|
| Supabase Edge Functions | `SUPABASE_URL` | Supabase Edge runtime |
| Supabase Edge Functions | `SUPABASE_ANON_KEY` | Supabase Edge runtime |
| Supabase Edge Functions | `SUPABASE_SERVICE_ROLE_KEY` | Supabase Edge runtime |
| Supabase Edge Functions | `DENO_DEPLOYMENT_ID` | Set on deployed runs only — used as the prod-vs-dev signal in `_shared/audit.ts` + `_shared/email.ts` |
| GH Actions | `CI` | GH Actions runtime — used by `withSentryConfig` `silent: !process.env.CI` |
| GH Actions | `secrets.GITHUB_TOKEN` | Auto-provisioned per workflow run |

---

## 7 · Activation order (recommended)

When ready to ship v0.2.0 (Path 1 or Path 2 per build-plan v2 §5):

1. **Domain (D1)** — register; pick `matchday.app` / `.io` / a subdomain.
2. **Vercel project (P7)** — create, link to `matchday-web` repo, attach domain.
   - Locally run `vercel link` once → writes `.vercel/project.json` with
     `orgId` + `projectId` (those become §2 GH secrets — the file itself
     is gitignored)
   - Create a Vercel token at Account Settings → Tokens → become `VERCEL_TOKEN` GH secret
3. **Vercel env vars** — paste §4 entries (anon key + Supabase URL + OAuth flags).
4. **Resend account + domain DKIM/SPF (P4-P6)** — wait for verification (≤72h).
5. **OAuth providers (P2-P3)** — Google + Facebook apps; configure in Supabase Studio.
6. **GH secrets** — paste §1 (matchday-backend) + §2 (matchday-web). All in one batch each.
7. **Trigger matchday-backend `Deploy to Supabase prod`** workflow → secrets sync + functions deploy.
8. **Trigger matchday-web** push to main → CI build with sourcemap upload.
9. **DoD verification** per `Plans/v02-dod-evidence.md` ship-status section. Update v0.2.0 row in `Plans/version-roadmap.md` to `Shipped`.

Apple stays deferred per gate D2 (Path 2 default).

---

## 8 · Source-of-truth note

This file is the **single index** of activation surface area. When new
secrets are added (v0.3+ probably introduces payments / federation /
ratings), update THIS file first; downstream runbooks
(`matchday/DECISIONS.md`) reference back here. Drift makes Pap's
configuration step painful; one canonical list is the cure.

Cross-references:
- `matchday/DECISIONS.md` — detailed activation walkthroughs (Sentry web, Sentry edge, Resend)
- `matchday/Plans/v02-build-plan.md` — full v0.2.0 plan + DoD definition
- `matchday/Plans/v02-dod-evidence.md` — code-side status of each DoD item
- `matchday-backend/.env.example` — local-dev env-var documentation
- `matchday-web/.env.example` — same
