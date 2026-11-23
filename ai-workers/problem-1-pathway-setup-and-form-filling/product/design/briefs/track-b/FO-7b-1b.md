# Brief: Row FO-7b part 1b — issue, PDF, receipts, offline payments and credit notes (Track B lane 1; cloud builder)

Written 22 Nov 11:0x IST by Lead B (Track B, P-785). Row owner: Lead B (Track B). Run `/next runtime FO-7b` and take **part 1b only**.
Model: Opus 5.5, effort: high (money; P-608 (2): "builders of rows touching money, schema, permissions or security").
Item: R1.56, R1.60
**PR title:** `runtime: FO-7b part 1b — issue, receipts, offline payments, credit notes`

**Start when:** now. #2883 (PF-28 part 6, Track A), which changed `invoices/drafts.ts`, `invoices/tax-round.ts`, `ports/client-money.ts` and `tests/check_fo7b_invoices.ts`, merged at 11:01 IST 22 Nov; branch from `origin/main` after it. No migration: FO-7b writes no schema.

**The specification (read in this order, do not rewrite):**
1. Lead B's brief `design/lead-b-briefs/FO-7b.md` on branch `lead-b-front-office` (rev 16.95, amendments 1-10): `git show origin/lead-b-front-office:ai-workers/problem-1-pathway-setup-and-form-filling/product/design/lead-b-briefs/FO-7b.md`. Part 1 = "invoices and the payment route" (amendments 1, 3, 6, 8).
2. Build Lead C's page `design/build-lead-c-briefs/FO-7b.md` on branch `claude/build-lead-c-647b40` (QA-482 tax per line, its rulings of 18 Nov, and where it wins).
3. Build Lead C's `FO-7b-1a.md` on the same branch: part 1a (merged, `client-money/MODULE.rows/FO-7b-1a.md`) took **only the arithmetic**. **Part 1b is "`FO-7b.md` part 1 minus what part 1a built"**: issuing, the PDF, receipts, the invoice email (held while the operating-details block is empty, AG-6-71 r3), offline payments through the payment route (a missing `receivedInto` reads as `OPERATING` until part 2), credit notes part or full with a reason (AG-6-48), the derived status words, the events, and R9 (the PDF, the receipt and the `invoice.issued` payload show the stored tax, never recomputed).
4. Lead 91's P-423 read of #2204: no ledger figure reads the − half of a paired move as a shortfall (a pass and a planted fail).

**Decisions (word for word):**
* **P-634 (1):** "A reversal (Returned, Recorded by mistake, Wrong client) is always accepted, even below zero; the view `money_trust_shortfall` lists every party below zero, shown red; every other outflow stays at or under the ledger balance; the uncleared warning sits in the routes; Returned is refused on e-Transfer, card or cash."
* **P-603:** "Money leaves trust only by a withdrawal to an issued invoice or a refund to the client; a correction names exactly one withdrawal or one deposit, and a negative correction is capped at that deposit; a correction never re-opens an invoice's trust cap"
* **P-701:** "Release 1 invoices charge GST/HST only"
* Keys (FO-7t brief's correction): a refund uses the catalogue key `agent/refund:create`, not `agent/payment:refund`.

**Lead B (Track B) rulings for this part (on Build Lead C's three questions):** (1) a draft is refused in plain words ("Prices that include tax come later") while the firm has `prices_include_tax` on; never a silent tax on top. (2) The exact SQL rounding check waits for the next `client-money.prisma` migration (not this PR). (3) A part credit note carries the gross amount; any tax split is Sample. Unconfirmed: no accountant.

**Touches:**
- `api/src/client-money/invoices/`
- `api/src/client-money/port.ts`
- `ports/client-money.ts`
- `api/src/features/client-money-invoices.ts`
- `api/src/client-money/MODULE.rows/FO-7b-1b.md`
- `tests/check_fo7b_invoices.ts`
- `samples/client-money-wording/`

In `invoices/`, the existing `drafts.ts` and `routes.ts` change only where issue and payment join them; the invoice and receipt wording goes in a new `samples/client-money-wording/` folder. No schema, no migration, no screen, no events edit beyond the four `invoice.*` and `payment.succeeded` lines the spec names (say in the PR if they already exist). **Events:** open PR #2919 (structure lane, P-785 (2)) moves events to `ports/events/<module>.ts`; if it has merged when you add them, put them in the client-money file it creates; if not, ask on the PR before touching `ports/events.ts`.

**Holds:** `api/src/client-money/invoices/` for the life of the PR. Order on that folder after it: FO-7g part 1w → FO-7t part 2 → FO-7r part 1.

**Done when:** `tsx studio/tests/check_fo7b_invoices.ts` exits 0 with Lead B's part-1 cases and R9 each passing and failing as named, and these pass unchanged (exit 0, pass counts unchanged): `check_fo7a_money_schema.ts`, `check_fo7a2_ledger_rules.ts`, `check_fo7mv_move_list.ts`, `check_fo7ts_money_settings.ts`, `check_fo5_retainers.ts`, `check_pf12_walls.ts`, `tests/journeys/j_59.ts`; the demo reset and checkpoint load pass; full `ci` green.

Duplicate check: 22 Nov 10:5x IST, main `01841047d`: `api/src/client-money/invoices/` holds only `drafts.ts`, `routes.ts`, `tax-round.ts` (part 1a); no issue, receipt, payment or credit-note route (`git grep -n "issue\|receipt\|creditNote" origin/main -- prototype/studio/api/src/client-money` finds none); no open PR builds them (open PRs read 10:5x IST: only #2883 touches the folder).

**Review:** an Opus reviewer at high **and the breaker** (money, P-278), with Build Lead C's breaker list. The Lead reads `ports/client-money.ts` and every money path before the label (P-423).

**Standard rules (copied from `build-lead-c-briefs/FO-7b.md`, adapted to Track B):** branch from `origin/main`. One part, one PR, under 800 changed lines with tests (P-610; records under `product/screens/<row>/` may pass it under P-775, stated in the body); if it must split, ask first in a PR comment. **PR rule (P-683):** get "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft. Never push to an open PR unless it is a fix; never push to a PR that carries the `queued` label. Merge `main` only on a conflict (P-270). Live AI off, US$0, never a priced button (P-175). Push after every step (P-557). Questions go on the PR as "Question for the tech lead: …"; Lead B (Track B) answers within 30 minutes. Report to the current Lead (`tools/current-lead.sh`). If a site is blocked on the cloud network, write "Not verified: <site> blocked on the cloud network" and go on. Repository: `expat-ready/xpatready`. Opus 5.5, no model switch mid-session (P-605). Finish whole: if an item needs more than its touch list, stop and ask; never widen the row silently. No personal names in any file (AGENTS rule 5). Immigration and tax values only from official sources with page, quote and date, else "Sample"; legal points "Unconfirmed: no counsel" (AGENTS rule 4). Never run test or guard suites in the Mac's main copy. A row fragment goes in `MODULE.rows/<part>.md`, never in the shared `MODULE.md` card (collision map §B). A new route registers in its own `api/src/features/<feature>.ts` (P-214), never in `main.ts` or `runtime.ts`.

**Audit actors (Lead 80, 18 Nov):** a test or seed that writes an audit line uses `staff:<id>`, `person:<id>`, `system:<door>`, `seed:<row>` or one of the listed simulated people, never a bare word like `test`.
