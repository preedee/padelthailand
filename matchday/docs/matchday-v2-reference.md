# Matchday — v2 Reference Material

> **Status:** Draft · Companion to `matchday-build-prompt.md`
> **Purpose:** Design references for features explicitly deferred from v1. None of this is built in v1. The main prompt references this file when it needs v1 to leave architectural space for a v2 feature.

---

## 1 · Referee / Official Features (v2)

Referees become relevant in v2 when multi-mode live scoring (TO + referee + player) and single-elim in-event scoring ship together. v1 has only TO-mode Americano scoring and has no referee role.

- **RF-01**: Join a tournament as a scoring official
- **RF-02**: See list of matches assigned to me
- **RF-03**: Enter live scores point-by-point or game-by-game
- **RF-04**: Flag disputes for TO review
- **RF-05**: Confirm final score + signature

**v1 architectural obligation**: The `User` role model supports adding `referee` via data changes (a new value in `User.roles` text array), not a schema migration.

---

## 2 · Federation / Sanctioning Features (v2)

v1 has no federation sanctioning UI. Federations become a v2 addition after v1 is validated with a single cohort tournament.

- **FD-01**: Mark a tournament as "Federation Sanctioned"
- **FD-02**: Enforce a federation rule profile (e.g., TPA rules for Thailand)
- **FD-03**: Feed sanctioned results to federation-controlled rating system
- **FD-04**: Generate federation-compliant tournament report

**v1 architectural obligation**: The `Tournament` table has a nullable `sanctioning_profile_id` FK column from day one, always null in v1. Prevents a destructive migration when FD features arrive.

---

## 3 · Payments — v2 Reference Material

> **v1 does NOT process payments.** v1 TOs collect entry fees offline (cash, bank transfer, LINE Pay, etc.) and describe payment instructions in the tournament's free-text entry-info field. Everything below is v2 design reference so v1 can leave architectural space for it without building it.

### 3.1 · v2 launch providers (Thailand, two rails)

Two payment providers for the first v2 launch market (Thailand). Both use hosted checkout — Matchday never sees a card number.

| Provider | Role | Countries | Methods | Notes |
|---|---|---|---|---|
| **Stripe** | Global cards baseline | TH + silently every other country | Visa, Mastercard, JCB, Amex, Apple Pay, Google Pay | Stripe Checkout hosted session. Fallback for cards-only policies. |
| **Omise** | Thailand local rails | TH | PromptPay QR, TrueMoney, Rabbit LINE Pay, Thai internet banking | Omise Checkout hosted session. PromptPay QR is expected dominant rail. |

### 3.2 · P2-P4 market backlog

Each new market adds at most one new provider. Integrate when the market opens, not before.

| Priority | Market | Likely provider | Local methods |
|---|---|---|---|
| P2 | Indonesia | Xendit or Midtrans | GoPay, OVO, Dana, ShopeePay, QRIS |
| P3 | SG/MY/PH | Stripe + optional GrabPay direct | Cards, PayNow, FPX, GCash |
| P3 | Vietnam | VNPay or MoMo | VNPay QR, MoMo wallet |
| P4 | Japan | PayPay or Stripe Japan | Cards, PayPay, Konbini |
| P4 | Korea | Toss Payments | Cards, KakaoPay, Toss |
| P4 | India | Razorpay | UPI, cards, netbanking |
| P4 | Australia | Stripe | Cards, Apple/Google Pay |
| P4 | HK / TW | Stripe | Cards, Apple/Google Pay |
| P4 | China | Ping++ or Airwallex | Alipay, WeChat Pay, UnionPay |

### 3.3 · Payment Architecture Strategy (7 principles — read before writing ANY payment code in v2)

Matchday will eventually touch ~10 payment providers across ~10 countries. These principles keep it maintainable.

**Principle 1 — Country dispatch via a policy table, not conditionals**

One data structure decides "which methods does a player in country X see, in what order" — a `CountryPaymentPolicy` table:

```
CountryPaymentPolicy
---
country_code    char(2)         # ISO-3166-1 alpha-2
provider_slug   text            # FK to PaymentProvider registry
display_order   int             # 1 = shown first
display_label   text            # localized
enabled         boolean
min_amount      bigint nullable # minor units
max_amount      bigint nullable
metadata        jsonb
```

Adding Indonesia = insert rows for `country_code='ID'` pointing at a new Xendit adapter. Zero code changes in the checkout flow.

**Anti-pattern (forbidden)**: `if (player.country == 'TH') { ... }` anywhere in Matchday code.

**Principle 2 — Hosted checkout only**

Every provider integration uses the provider's hosted checkout session. Matchday redirects out; never renders a card form. Keeps Matchday out of PCI scope entirely (no SAQ-D, no card data on our infrastructure). Providers handle 3D Secure, SCA, fraud, and local flows.

Matchday's only payment UI: method selection → redirect to provider → return handler → status display.

**Principle 3 — Money is a struct, never a float**

Every monetary value: `{amount_minor: bigint, currency_code: char(3)}`. Minor units = integer satang/cent/sen. Currency code is ISO-4217.

```
Money
---
amount_minor  bigint    # never null, never float, never a decimal string
currency_code char(3)   # ISO-4217
```

Floats lose precision on sums; strings break arithmetic; THB-only assumptions break the moment Indonesia ships. Shared `Money` value object in TypeScript and Dart with `add`, `format(locale)`, `toProviderAmount()`.

**FX conversion is out of v2 launch scope.** Singapore player registering for a Thai tournament pays in THB. Multi-currency display and FX is a later v2 concern.

**Principle 4 — Idempotency keys on every checkout creation**

Every `createCheckout` call uses a UUIDv7 key derived from `(registration_id, attempt_number)`. All providers support this. Client retries return the same session instead of double-charging. Key stored on the `Payment` row; never reused across different intents.

**Principle 5 — One generic webhook receiver, not one per provider**

One Edge Function route: `POST /webhooks/payment`. Inspects a header to identify the provider, calls `provider.verifyWebhook(body, signature)`, dispatches a normalized `PaymentEvent` to the domain layer. One place to audit, rate-limit, replay-protect, log. Per-provider endpoints are an anti-pattern.

**Principle 6 — Every Payment row is reconcilable**

Every `Payment` row carries: provider slug, provider transaction ID, last observed status, last webhook event ID, `reconciled_at` timestamp. Nightly job pulls recent transactions from each provider's API and cross-checks. Drift → alert.

**Principle 7 — Refunds are a first-class interface method**

```
interface PaymentProvider {
  // ...
  refund(txnId: string, amount?: Money, reason?: string): Promise<RefundReceipt>
}
```

Partial refunds (Stripe, Xendit) vs. full-only (older rails). Interface exposes both; adapters throw `UnsupportedOperation` for unsupported partial refunds. TO UI disables partial refund controls when the provider reports `supportsPartialRefund: false`.

### 3.4 · PaymentProvider interface (v2)

```
interface PaymentProvider {
  slug: string
  countries: string[]
  currencies: string[]
  createCheckout(amount: Money, metadata: object): Promise<CheckoutSession>
  verifyWebhook(payload: unknown, signature: string): Promise<PaymentEvent>
  refund(txnId: string, amount?: Money, reason?: string): Promise<RefundReceipt>
}
```

**v1 architectural obligation**: this interface is NOT shipped in v1 as TypeScript code. v1 leaves nullable `stripe_connect_account_id` and `omise_recipient_id` columns on the `User` table and a stub `Payment` table in the schema, but no runtime payment code.

---

## 4 · RatingProvider Interface (v2)

Deep rating integration is the entire §8.4 pillar — co-equal with tournament operations. v2 will integrate with ONE chosen external rating provider (WPR, APR, or TBD) so rating feels native to Matchday: visible on every profile, match, bracket, with per-match impact breakdowns and a rating leaderboard as a primary discovery surface.

v1 ships NO rating UX — no display, no seeding by rating, no leaderboard, no history, no push. This is the largest single chunk of v2 work.

```
interface RatingProvider {
  slug: string
  lookupPlayerRating(providerPlayerId: string): Promise<RatingSnapshot | null>
  lookupPlayerHistory(providerPlayerId: string, range: DateRange): Promise<RatingHistory>
  linkOrCreatePlayer(matchdayProfile: PlayerProfile): Promise<ProviderLinkResult>
  pushMatchResult(match: FinalizedMatch): Promise<RatingPushReceipt>
  computeExpectedDelta(match: ProposedMatch): Promise<RatingDeltaPreview>
  getLeaderboard(scope: LeaderboardScope): Promise<LeaderboardPage>
  healthCheck(): Promise<boolean>
}
```

**Architectural note**: clean and swappable interface, but only ONE concrete provider is wired up in v2 launch. UX is built assuming that provider is authoritative. NO "choose your rating provider" dropdown.

**v1 architectural obligation**: v1 leaves nullable rating-related columns on `User` and `Match` (e.g., `Match.rating_delta_json`) but ships NO runtime rating code and NO TypeScript interface file.

---

---

## 5 · v2 UX Architecture Notes

### 5.1 · TV Display / Spectator Mode (architectural guardrail)

When v2 builds a TV-display / spectator-mode surface for venues to project live tournament state on a TV or tablet, **build it as plain HTML/CSS + Server-Sent Events (SSE) or WebSocket**, NOT as a framework canvas (Flutter Web / React Three / WebGL).

Rationale: Americano Padel App's TV display is a Flutter Web app that renders to WebGL canvas. On older smart TVs, Chromecast targets, and low-power venue tablets, it can get stuck in a loading splash and never render. This is a documented failure mode from the 2026-04 competitive audit. Matchday can win this feature by prioritizing maximum browser compatibility — a static HTML page with progressive enhancement is reliable on every venue display device going back ~10 years.

Design targets when v2 builds this:
- Zero client-side JS frameworks (or React SSR with no client hydration)
- Plain `<table>` for the leaderboard (screen-reader accessible as a bonus)
- SSE or WebSocket stream pushing leaderboard updates from the same `tournament:{id}:leaderboard` Supabase Realtime channel v1 already ships
- Auto-fit typography (CSS `clamp()` / `vw` units) so one HTML page fits a 1080p TV and a 768p tablet
- Graceful degradation: if the stream dies, the page still shows the last-known leaderboard with a visible "reconnecting..." indicator
- No login required — the public URL is shareable and bookmarkable

---

*End of Matchday v2 Reference Material*
