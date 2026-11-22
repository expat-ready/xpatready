# Brief: Row FO-7b part 1c — refunds of operating payments, and "Refund · Keep as credit" on an extra (Track B; cloud builder)

Written 22 Nov 15:5x IST by Lead B (Track B), on Lead 4's ruling on #2953 (comment 7077659900: "a part 1c for refunds and the 'Refund · Keep as credit' actions on the extra; Lead B writes its row and brief"). Row: `product/BACKLOG.md` row **FO-7b part 1c** (on branch `lead-b/2026-11-22-track-b` until the Lead's records PR lands). Run `/next runtime FO-7b` and take **part 1c only**.
Model: Opus 5.5, effort: high (money; P-608 (2)).
Item: R1.96, R1.56
**PR title:** `runtime: FO-7b part 1c — refunds and the choice on an extra`

**Start when:** started: this brief is the spec for **PR #3036** (the FO-7b lane continues #3036, cut from #2953's branch at 15:47 IST, tests first). It rebases onto `origin/main` once #2953 merges; it queues only after #2953 is on `main`. No migration: FO-7a's `money_refund` and FO-7ts part 2's `money_credit_entry` (kind `KEPT`) exist. It may run beside FO-7g part 1w: it changes nothing in `invoices/drafts.ts`, `invoices/money.ts` or `tests/check_fo7b_invoices.ts` (1w's). Open PRs #3001 (FO-7q) and #2953 also change `ports/client-money.ts`: additive lines only, merge `main` on a conflict (P-270).

**The specification:** Lead B's `design/lead-b-briefs/FO-7b.md` on branch `lead-b-front-office`, amendment 1 ("Extra received into operating, in every trust state: the recording offers 'Refund · Keep as credit' and a person chooses. 'Keep as credit' writes FO-7ts's credit ledger (`KEPT`). Until a person chooses, the extra stays waiting, never silently moved") and its line "refund with a reason and its own key (AG-6-23)". Build:
* **Refund of an operating payment** (`POST /api/front-office/money/payments/:paymentId/refunds`, key **`agent/refund:create`**, the catalogue key; not `agent/payment:refund`, per the FO-7t brief's correction): amount, a reason (`money_text_ok`, required), an idempotency key; route `OFFLINE` only (card refunds are FO-7c part 3); never more than the payment less its earlier refunds (the database's `refund_ordinal` serialises them); one audit line; event `payment.refunded` (outbox row last); the invoice's derived status follows (`Refunded` when the rules of `invoiceStatus` say so). **A payment received into trust is refused here** with the words "Money received into trust is refunded from the trust ledger" (that is FO-7t part 2's `REFUND_TO_CLIENT`, P-603).
* **The choice on an extra** (`POST …/payments/:paymentId/extra` with `{ choice: "REFUND" | "KEEP_AS_CREDIT", reason? }`, key `agent/payment:record` for Keep, `agent/refund:create` for Refund): only on an operating payment with waiting extra; **Keep as credit** writes one `money_credit_entry` `KEPT` for exactly the waiting extra (party, case, currency of the payment) and the extra is no longer waiting; **Refund** writes the refund above for exactly the waiting extra. Chosen once: a second choice → 409. Under the party's trust lock then the invoice row (FO-7lk's order, as part 1b's `lock()`).
* Reads stay FO-7q's (#3001); this part only stores what that read needs.

**Decisions (word for word):**
* **P-603:** "Money leaves trust only by a withdrawal to an issued invoice or a refund to the client"
* **P-567 (3):** "card only for invoiced fees into the operating account"
* **P-634 (1):** "every other outflow stays at or under the ledger balance"

**Touches:**
- `api/src/client-money/invoices/refunds.ts`
- `api/src/client-money/invoices/refund-routes.ts`
- `api/src/features/client-money-refunds.ts`
- `ports/client-money.ts`
- `api/src/client-money/MODULE.rows/FO-7b-1c.md`
- `tests/check_fo7b_refunds.ts`

`ports/client-money.ts` changes are additive (the refund and choice shapes, the `payment.refunded` payload). `invoices/facts.ts` is read, not edited (it already subtracts refunds); if it must change, ask first. No schema, no screen.

**Done when:** `tsx studio/tests/check_fo7b_refunds.ts` exits 0 with, each passing and failing as named: a part refund of an operating payment (pass) and one over what is left (409, nothing written); a refund with no reason (422); the same idempotency key twice (one refund) and with other data (409); two refunds at once on one payment (one wins, the other sees it); a payment received into trust refused here; Keep as credit writes one `KEPT` entry equal to the waiting extra and the extra stops waiting; Refund on an extra refunds exactly the extra; a second choice 409; an extra into operating with the trust answer YES still offers both and makes no trust entry (amendment 1's "neither"); firm B reading or refunding firm A's payment 404; one audit line per change. `check_fo7b_invoices.ts`, `check_fo7a_money_schema.ts`, `check_fo7ts_money_settings.ts`, `check_fo7lk_lock_order.ts` and `check_pf12_walls.ts` pass unchanged (exit 0); full `ci` green.

Duplicate check: 22 Nov 15:5x IST: `git grep -n "money_refund\|moneyRefund\|KEEP_AS_CREDIT\|payment.refunded" origin/main -- prototype/studio/api` finds no route or writer (FO-7a schema only); #2953's body lists "Refunds and the two actions behind 'Refund · Keep as credit'" under "Not in this part"; no open PR builds them (#3001 FO-7q is reads; #3033 FO-7t part 1 is trust in).

**Review:** an Opus reviewer at high **and the breaker** (money, P-278); the Lead reads every money path before the label (P-423). Readings: trust Unconfirmed: no counsel; credit and refunds Unconfirmed: no accountant.

**Standard rules (copied from `build-lead-c-briefs/FO-7b.md`, adapted to Track B):** branch from `origin/main`. One part, one PR, under 800 changed lines with tests (P-610; records under `product/screens/<row>/` may pass it under P-775, stated in the body); if it must split, ask first in a PR comment. **PR rule (P-683):** get "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft. Never push to an open PR unless it is a fix; never push to a PR that carries the `queued` label. Merge `main` only on a conflict (P-270). Live AI off, US$0, never a priced button (P-175). Push after every step (P-557). Questions go on the PR as "Question for the tech lead: …"; Lead B (Track B) answers within 30 minutes. Report to the current Lead (`tools/current-lead.sh`). If a site is blocked on the cloud network, write "Not verified: <site> blocked on the cloud network" and go on. Repository: `expat-ready/xpatready`. Opus 5.5, no model switch mid-session (P-605). Finish whole: if an item needs more than its touch list, stop and ask; never widen the row silently. No personal names in any file (AGENTS rule 5). Immigration and tax values only from official sources with page, quote and date, else "Sample"; legal points "Unconfirmed: no counsel" (AGENTS rule 4). Never run test or guard suites in the Mac's main copy. A row fragment goes in `MODULE.rows/<part>.md`, never in the shared `MODULE.md` card (collision map §B). A new route registers in its own `api/src/features/<feature>.ts` (P-214), never in `main.ts` or `runtime.ts`.

**Audit actors (Lead 80, 18 Nov):** a test or seed that writes an audit line uses `staff:<id>`, `person:<id>`, `system:<door>`, `seed:<row>` or one of the listed simulated people, never a bare word like `test`.
