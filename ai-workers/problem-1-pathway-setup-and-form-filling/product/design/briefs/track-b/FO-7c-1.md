# Brief: Row FO-7c part 1 — the payment account: Stripe docs check, rail port with its fake, onboarding, status, account webhook (Track B lane 3; cloud builder)

Written 22 Nov 11:2x IST by Lead B (Track B, P-785). Row owner: Lead B (Track B). Run `/next runtime FO-7c` and take **part 1 only**.
Model: Opus 5.5, effort: high (money and secrets; P-608 (2)).
Item: R1.57
**PR title:** `runtime: FO-7c part 1 — the firm's payment account on a fake rail`

**Start when:** now. FO-7c part 1's "Ready when" was "FO-7b merged (creates `api/src/client-money/`)": the folder exists since FO-7b part 1a, and part 1 does not touch invoices. No migration (it uses FO-7a's `money_payment_account`). **All on fakes**: no Stripe key is needed to build or to pass CI. The Works proof (R1.57) needs a Stripe **test-mode** key later: an outside dependency the Lead registers (one-time paid-run list, Lead B (11)'s #2866 ruling).

**The specification:** `design/briefs/FO-7c.md` on `main`, **part 1** exactly ("step 0 and the payment account: the Stripe docs check, the rail interface with its fake, onboarding, status, the account webhook and the break alert"), with its rulings (keys `agent/payment-rail:connect` Owner-only with step-up, AG-16-14; finding the firm of a webhook under the walls; no secret in a log, a column or an answer, AG-16-18). **Step 0 first commit:** read Stripe's own documentation (docs.stripe.com) and record in the PR body, per point, the URL, a short quote and the date read.

**Decisions (word for word):**
* **P-567 (3):** ""Ledger now, trust card later": per-client trust ledger, receipts, offline trust deposits, invoice before withdrawal, 30-day withdrawal reminder; card only for invoiced fees into the operating account; card into trust waits on a verified processor set-up that puts the full amount in trust and charges fees and chargebacks to operating (FO-7 step 0); AG-6-70's optional trust card account is not in month one; Code s. 32(a)-(g), s. 33(3); Unconfirmed: no counsel."
* **P-578:** "Payment plans and saved-card autopay for earned fees stay in" … "autopay only with the client's recorded consent, on the firm's own Stripe account; never on deposits or trust" (FO-7p, later; nothing of it in this part).

**Touches:**
- `api/src/client-money/card/`
- `api/src/features/client-money-card.ts`
- `api/src/client-money/MODULE.rows/FO-7c-1.md`
- `tests/check_fo7c_card_payments.ts`
- `tests/fixtures/fo7c-stripe/`
- `ports/notifications.ts`
- `api/src/platform/config/settings.ts`

`card/` holds the rail interface and its fake; `ports/notifications.ts` gets one `NOTIFICATION_KIND` line (the break alert); `settings.ts` one setting line, as `FO-7c.md` rules (Track A's PF-5 also edits it: merge `main` on a conflict, never a second spelling).

**Not touched:** `api/src/platform/billing/*` (Track A's Stripe Billing; reuse the `stripe` 23.1.0 package already in `package.json`, no new package). **If the account webhook needs a named bypass use registered in `api/src/platform/firm-scope.ts`** (as `platform.billing.stripe-webhook` is), stop and ask on the PR first: that file is a shared list that a structure lane is splitting today (collision map §C (1)); the Lead decides the order. `ports/events.ts`: the account events only, and only if the spec names them; say so in the PR.

**Done when:** `tsx studio/tests/check_fo7c_card_payments.ts` exits 0 with part 1's cases from `FO-7c.md` each passing and failing as named (on the fake rail: Owner-only connect with step-up, status, the account webhook stored once and its signature checked first, the firm found under the walls, the break alert, no secret in any answer, log or column, another firm's account → 404); `check_fo7a_money_schema.ts`, `check_pf12_walls.ts` and the platform billing suites pass unchanged (exit 0); full `ci` green.

Duplicate check: 22 Nov 10:5x IST, main `01841047d`: no `client-money/card/` folder and no payment-rail interface; Stripe on `main` is Track A's subscription billing only (`api/src/platform/billing/stripe.ts`, `webhook.ts`), which bills the firm, not the firm's clients; no open PR builds a payment rail.

**Review:** an Opus reviewer at high **and the breaker** (money and secrets, P-278). The Lead reads the rail interface and the webhook path before the label (P-423).

**Standard rules (copied from `build-lead-c-briefs/FO-7b.md`, adapted to Track B):** branch from `origin/main`. One part, one PR, under 800 changed lines with tests (P-610; records under `product/screens/<row>/` may pass it under P-775, stated in the body); if it must split, ask first in a PR comment. **PR rule (P-683):** get "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft. Never push to an open PR unless it is a fix; never push to a PR that carries the `queued` label. Merge `main` only on a conflict (P-270). Live AI off, US$0, never a priced button (P-175). Push after every step (P-557). Questions go on the PR as "Question for the tech lead: …"; Lead B (Track B) answers within 30 minutes. Report to the current Lead (`tools/current-lead.sh`). If a site is blocked on the cloud network, write "Not verified: <site> blocked on the cloud network" and go on. Repository: `expat-ready/xpatready`. Opus 5.5, no model switch mid-session (P-605). Finish whole: if an item needs more than its touch list, stop and ask; never widen the row silently. No personal names in any file (AGENTS rule 5). Immigration and tax values only from official sources with page, quote and date, else "Sample"; legal points "Unconfirmed: no counsel" (AGENTS rule 4). Never run test or guard suites in the Mac's main copy. A row fragment goes in `MODULE.rows/<part>.md`, never in the shared `MODULE.md` card (collision map §B). A new route registers in its own `api/src/features/<feature>.ts` (P-214), never in `main.ts` or `runtime.ts`.

**Audit actors (Lead 80, 18 Nov):** a test or seed that writes an audit line uses `staff:<id>`, `person:<id>`, `system:<door>`, `seed:<row>` or one of the listed simulated people, never a bare word like `test`.
