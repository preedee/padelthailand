# Matchday — v2-v9 Product Roadmap Reference

> **Status:** Draft v0.5 · **Updated:** 2026-04-16 · **Owner:** Pap
> **Purpose:** Comprehensive reference for all features deferred from v1. Organized by version. The v1 build prompt (`matchday-build-prompt.md`) is scoped to v1 only — this file covers everything after v1 ships.

---

## Roadmap Summary

| Version | Theme | Key Features |
|---|---|---|
| **v2** | Complete the live experience | Player score entry, dispute flow, push notifications, double elim, match history, TV display mode |
| **v3** | Ratings + platform maturity | Rating integration, historical tournament import, TPS APIs |
| **v4** | Formats + config | Round robin, groups+KO, scoring configs, registration approval, personal records, sponsorship |
| **v5** | Monetize | Payments, refunds, TO payouts |
| **v6** | Messaging | WhatsApp + LINE notifications |
| **v7** | Federations | Sanctioning UI, ranking management, referee mode |
| **v8** | Multi-sport | Tennis, pickleball, badminton, squash |
| **v9** | Indonesia | Bahasa Indonesia, GoPay/OVO/Dana, Telegram |

---

## v2 — Complete the Live Experience

### PL-V2-01: Player Score Entry
Either player in a match can submit per-set scores. Same scoring model as v1 TO scoring (per-set with configurable last-set rule). On submit, scores are accepted immediately and the winner advances.

### PL-V2-02: Score Dispute Flow
- Opposing player (or TO) can tap "Dispute" on a submitted score
- Disputed match is flagged visually on the bracket (yellow badge)
- TO is notified and can review + override the score (audit-logged)
- Bracket progression is **not paused** — original score stands until TO overrides
- If TO overrides, bracket re-cascades (if subsequent matches haven't been played yet)

### PL-V2-03: Push Notifications (OneSignal)
Web Push via OneSignal managed service:
- "Your match is starting soon" — N minutes before scheduled time
- "Your next match is ready" — when opponent from previous round is decided
- "A score has been submitted for your match" — informational, with "Dispute" action link
- "A score in your tournament has been disputed" — TO only
- OneSignal SDK in Next.js, External User ID = Matchday `user_id`
- `pg_cron` job for scheduled notifications + event-driven for bracket-triggered ones
- Notification dedup via `notification_sent_at` column

### PL-V2-04: Tournament + Match History
Organized by tournament, expandable to individual match results:
```
🏆 Bangkok Open — 2nd place
  ├─ R1: beat Team A (6-3, 6-4)
  ├─ QF: beat Team B (7-5, 6-2)
  ├─ SF: beat Team C (6-4, 3-6, 10-7)
  └─ F:  lost to Team D (4-6, 6-7)
```
Player's `/me/history` page with tournament list → expand to match results.

### PL-V2-05: Double Elimination Format
New format alongside single-elimination:
- **Winners bracket** + **losers bracket** running in parallel
- Players who lose once move to losers bracket; lose twice → eliminated
- Grand finals: losers bracket winner may need to beat winners bracket winner twice
- Draw generation algorithm for double-elim
- New bracket rendering UI (winners + losers side-by-side)
- Progression logic: loss → route to losers bracket, not elimination
- TO can select double-elim at tournament creation

### PL-V2-06: TV Display Mode
Dedicated spectator experience beyond v1's `?spectator=true`:
- Auto-rotate between active matches, upcoming schedule, and bracket
- Sponsor logos on display (if sponsorship feature exists, otherwise plain)
- **Build as plain HTML/CSS + SSE or WebSocket**, NOT a framework canvas
- Rationale: Americano Padel App's Flutter Web TV display fails on smart TVs and Chromecast. Plain HTML is reliable on every venue display device.
- Design targets:
  - Zero client-side JS frameworks (or React SSR with no client hydration)
  - Auto-fit typography (CSS `clamp()` / `vw` units) — fits 1080p TV and 768p tablet
  - Graceful degradation: stream dies → shows last-known state with "reconnecting..." indicator
  - No login required — public URL, shareable and bookmarkable

### Social Sign-in Expansion
Facebook + Google + Apple OAuth already in v1. No additional auth providers needed in v2.

### TPS Account Linking API
Matchday exposes an API that TPS can call to link a TPS user to their Matchday account. The connection happens inside the TPS app — Matchday doesn't need to know about TPS internals, it just provides the endpoint.

### Public API for TPS
REST endpoints for TPS's Flutter app to display:
- Tournament list (upcoming, live, completed)
- Live bracket state with scores
- Tournament results and placements
- Player tournament history

### Rating Provider Investigation (Business Task)
Not engineering — Pap decides which external rating provider to integrate in v3 (WPR / APR / TBD). Decision must happen during v2 development so v3 can start building immediately.

---

## v3 — Ratings + Platform Maturity

### Rating Integration
Deep integration with ONE chosen external rating provider so rating feels native to Matchday. This is the strategic wedge against WeCourts.

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

**UX surfaces:**
- Rating visible on every player profile
- Rating visible on bracket (next to player names)
- Per-match rating impact breakdown ("you gained +12 from this win")
- Rating-based auto-seeding (TO can choose "seed by rating" instead of manual)
- Rating leaderboard as a primary discovery surface (top players, trending, by region)

**Architectural note**: Clean and swappable interface, but only ONE concrete provider is wired up. NO "choose your rating provider" dropdown.

### Historical Tournament Import
Upload spreadsheet (CSV/XLSX) with past tournament data:
- Tournament name, date, format, venue
- All matches with players and scores
- Validated, mapped to Matchday schema
- Fed into the rating engine so ratings launch with real historical data, not cold

This is critical — without historical import, ratings start empty and feel useless. With it, players see their full competitive history from day one of v3.

### TPS APIs
- **Public API** for TPS to display tournaments + live results (expanded from v2)
- **Account linking API** — Matchday endpoint for TPS to link accounts

---

## v4 — Formats + Config

### Round Robin Format
Completely different from elimination brackets:
- Everyone plays everyone (or within groups)
- Standings table UI (not bracket tree)
- Points/wins/losses tracking
- Tiebreaker rules (head-to-head, point differential, etc.)
- Draw generation: round-robin schedule (each team plays each other team once)

### Groups + Knockout Format
The most complex format:
- **Group stage**: mini round robins (e.g., 4 groups of 4)
- Group standings determine knockout seeding
- **Transition**: top 2 from each group advance to knockout bracket
- Two different UIs in one tournament (group tables → bracket tree)
- Draw generation: group assignment + knockout bracket from group results

### Additional Scoring Configs
TO can configure at tournament creation:
- **Golden point**: at deuce, next point wins (no advantage)
- **Time-capped**: matches end after N minutes regardless of score
- **Best-of-X**: best of 1 set, best of 3 sets, best of 5 sets

### Registration Approval Toggle
Per-tournament setting where TO requires manual approval of every registration:
- Player registers → status "pending" → TO reviews → approves or rejects
- Useful for invite-only or level-restricted tournaments

### Personal Records / Lifetime Stats
Player engagement feature:
- Tournaments played, win rate, longest win streak
- Best placement, most common opponents
- Stats computed from match history (v2) and historical imports (v3)

### Tournament Sponsorship + Branding
TOs add their tournament sponsors (not Matchday-level sponsors):
- Upload sponsor logos
- Sponsor logos displayed on tournament pages
- Sponsor acknowledgment in results
- Multiple sponsors per tournament

---

## v5 — Monetize

### Entry Fee Payments
Two payment providers for Thailand launch:

| Provider | Role | Methods |
|---|---|---|
| **Stripe** | Global cards baseline | Visa, Mastercard, JCB, Amex, Apple Pay, Google Pay |
| **Omise** | Thailand local rails | PromptPay QR, TrueMoney, Rabbit LINE Pay, Thai internet banking |

**Architecture principles:**
1. **Country dispatch via policy table** — `CountryPaymentPolicy` rows, not `if (country == 'TH')` conditionals
2. **Hosted checkout only** — Matchday never sees a card number, never enters PCI scope
3. **Money is a struct** — `{amount_minor: bigint, currency_code: char(3)}`, never floats
4. **Idempotency keys** on every checkout creation
5. **One generic webhook receiver** — one Edge Function route, provider-identified by header
6. **Every Payment row is reconcilable** — provider slug, txn ID, status, reconciliation timestamp
7. **Refunds are first-class** — partial and full refund support

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

### Refunds
- TO-initiated refund (player withdraws after paying)
- Automatic refund on tournament cancellation
- Partial refunds where provider supports it

### TO Payouts
Prize distribution through hosted checkout:
- TO configures prize structure (1st, 2nd, 3rd amounts)
- After tournament completion, payouts triggered via provider
- Payout tracking + reconciliation

---

## v6 — Messaging

### WhatsApp Notifications
Via WhatsApp Business API:
- Match reminders
- Tournament results
- Registration confirmations
- Score dispute alerts (TO)

### LINE Notifications
Via LINE Messaging API (Thailand's primary channel):
- Same notification types as WhatsApp
- LINE is the primary communication channel for Thai padel community

---

## v7 — Federations

### Sanctioning UI
- Federation admin marks a tournament as "Federation Sanctioned"
- Enforce federation rule profiles (e.g., TPA rules for Thailand)
- Official tournament approval workflows

### Federation Ranking Management
- Federations manage their own ranking systems within Matchday
- Feed sanctioned results to federation-controlled ratings
- Generate federation-compliant tournament reports

### Referee Mode
Officials can enter/validate scores during live tournaments:
- **RF-01**: Join a tournament as a scoring official
- **RF-02**: See list of matches assigned to me
- **RF-03**: Enter live scores
- **RF-04**: Flag disputes for TO review
- **RF-05**: Confirm final score

---

## v8 — Multi-sport

Sport as a first-class dimension. v1 architecture already supports this via:
- `Sport` table with padel as first row (not a constant enum)
- Per-sport scoring rules
- Per-sport format compatibility

v8 adds:
- **Tennis**: standard tennis scoring (sets, games, tiebreaks, advantage)
- **Pickleball**: rally scoring to 11/15/21, side-out rules
- **Badminton**: rally scoring to 21, best of 3
- **Squash**: point-a-rally to 11, best of 5

Each sport needs: scoring validation rules, format compatibility matrix, i18n for sport-specific terms.

---

## v9 — Indonesia

### Bahasa Indonesia
Full i18n: all UI strings, email templates, error messages in Bahasa Indonesia.

### Payment Rails
| Provider | Methods |
|---|---|
| Xendit or Midtrans | GoPay, OVO, Dana, ShopeePay, QRIS |

Added to `CountryPaymentPolicy` table — zero code changes in checkout flow.

### Telegram Notifications
Via Telegram Bot API — Indonesia's #2 messaging platform after WhatsApp (already covered in v6).

---

## Payment Provider Backlog (future markets)

Each new market adds at most one new provider. Integrate when the market opens.

| Market | Likely Provider | Local Methods |
|---|---|---|
| SG/MY/PH | Stripe + optional GrabPay | Cards, PayNow, FPX, GCash |
| Vietnam | VNPay or MoMo | VNPay QR, MoMo wallet |
| Japan | PayPay or Stripe Japan | Cards, PayPay, Konbini |
| Korea | Toss Payments | Cards, KakaoPay, Toss |
| India | Razorpay | UPI, cards, netbanking |
| Australia | Stripe | Cards, Apple/Google Pay |
| HK / TW | Stripe | Cards, Apple/Google Pay |
| China | Ping++ or Airwallex | Alipay, WeChat Pay, UnionPay |

---

*End of Matchday v2-v9 Reference Material*
