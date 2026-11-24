# Break report, round 1: FO-7t part 2, Pay from trust and refund to the client (API only)

Commit `50f169e36d92f1483517325312a001a15c16c82d` (PR #3442, `claude/brave-gauss-nmhcd5`), 24 Nov 2026. The breaker (Opus 5.5) did not build this and edited no code. Scope: the diff against `origin/main`, brief `design/briefs/FO-7t.md` part 2, and its "Reviewer and breaker" paragraph. Harness: the setup of `tests/check_fo7t_money_out.ts`, copied into a scratch folder. Each run used its own scratch database on 127.0.0.1:54329 with the Nest app in-process and local sign-in. Nothing ran on :4400, no network, US$0. Amounts are Sample. The builder's check gives 35/0 at this commit. My scripts are `break.ts` (B0-B8) and `break2.ts` (C1-C4) in the scratch folder `…/scratchpad/breaker/`. Their logs are `run3.log` and `run4.log`.

## Findings

**Major 1: a double-clicked refund is a real double spend, and it can never be undone.** This builds on the reviewer's Major 1 and adds the fact that the extra record is permanent.
* Repro (B5): 600.00 held before a case. Send `POST /trust/refunds {personId, amountMinor: 20000, reference: "ET-555", method: E_TRANSFER, reason}` twice with `Promise.all`.
* Expected: one refund, or the second refused or replayed (STANDARDS §4 [M] "Idempotent creates"). At least the duplicate-reference warning that deposits have.
* Actual: **201, 201**. Two `REFUND_TO_CLIENT` rows, and the balance is 200.00 when it should be 400.00. A third call with the same reference a moment later also gives 201. There is no duplicate warning at all.
* Why it matters more than the reviewer wrote: the ledger cannot fix it. A `CORRECTION` naming the refund is refused by the database: "a correction names a withdrawal … or a deposit …, never a REFUND_TO_CLIENT (P-603 …)" (`migrations/20261122170000_fo7ts_part3/migration.sql:278`, probe in B5).
* Result: 200.00 of the client's money shows as paid out, for good. The ledger no longer matches the bank, and no route or rule can put it back.
* Applications double the same way (C1): two 201s and two withdrawals, with the amount due going from 500.00 to 100.00. Those at least have a correction path in the database.
* Where: `trust/service.ts:233-250`, `trust/money-out.ts:116`. No key, and no duplicate check on party + case + currency + reference + amount.

**Minor 1: a payee reason is thrown away without telling the caller.** `trust/service.ts:241-243`.
* B5: `payee: {personId: <the party itself>, reason: "…"}` gives 201, but the row stores `payee_reason` null.
* B5: `payee: {reason: "…"}` with no person, company or name gives 201 and is recorded as a refund to the payer. The reason is lost here too.
* Expected: a 422 ("Name the other payee" / "The payer needs no reason"). Today a half-filled "another payee" becomes a refund to the payer, and nobody is told.

**Minor 2: the "before the money came in" date check is per party, not per case.**
* B5: client j's money arrived on case J1 200 days ago and on case J2 today. A refund from J2 dated 100 days ago gives **201**.
* The route adds no check of its own (`money-out.ts:112` checks only the future). The database's guard reads the party's first entry in any case (`migration.sql:181`).
* AG-6-60 holds trust per case, so a J2 refund dated before J2's money came in should be refused.

**Minor 3: the issue tick answers with trust words while trust is off.**
* B0: firm B, trust UNANSWERED, nothing held. `POST /invoices/:id/issue?payFromTrustMinor=100` gives 409 `NOT_AVAILABLE` "Only CAD 0.00 is available.", and the invoice is not issued.
* `invoices/money.ts:72` never checks `trustShows`. DW1 says that with trust off and nothing held, no trust route answers.
* Expected: the tick refused as a field (422 "Trust is not on for this firm") or 404, as the trust routes do. The reviewer's m5 wording point ("Nothing was issued") also applies here.

**Minor 4: the uncleared-cheque warning can be bypassed through a move to a case.** This confirms the reviewer's m3 with a reproducer, and it is latent.
* B6: an uncleared 400.00 cheque deposited before a case, moved to the case with a `MOVE_TO_CASE` pair written by SQL (no route writes moves yet). Pay from trust of 400.00 without `unclearedAcknowledged` gives **201**.
* `money-out.ts:61-63` counts only `DEPOSIT` rows on the case.
* This becomes real the day FO-7ts's move route ships.

**Minor 5: payee and pick text are checked on the caller's own terms, outside their C5 view.**
* (a) `payee.name` "Ac​me" (zero-width space inside) and "Аcme Ltd" (Cyrillic А) give 201. So does `payee.personId` of a firm person the caller cannot see. Unseen ids give 404, so this is an existence oracle.
* (b) user-O sees CASE only. A pick `{personId: PC}` where PC is unseen gives 409 "Only CAD 0.00 is available.", and a non-existent id gives 404.
* Both oracles need a UUID, so the effect is low. Wording and spoofing only, no money moves wrongly.

## What held
* **The 100-race (B2):** 100 rounds, each of two applications of 200.00 and a refund of 200.00 at once on one party and case, with 300.00 added per round.
  * Result: 150 × 201 and 150 × 409 `NOT_AVAILABLE`. No 5xx and no 40P01.
  * In 0 rounds did the amount taken exceed what was available. The minimum `balance_after` was 0, the case's running sum never went below 0, and no invoice was over-applied.
* **The burst (B2b):** 100 applications of 1 cent at once on 50 cents due gave exactly 50 × 201 and 50 × 409 `OVER_DUE`. 100 refunds of 1 cent at once on 50 cents held gave 50 × 201, and the balance ended at 0. No Prisma transaction timeouts.
* **The issue tick racing a route application on the same draft (B3), 30 rounds:** 30 × 200, 20 × 409 `NOT_AVAILABLE` and 10 × 409 `DRAFT`. No deadlock, no 5xx, nothing over-applied. The lock order is the same in both paths (party, then invoice row).
* **Another case without the pick:** "Only CAD 1,000.00 is available." Picks:
  * A pick of the invoice's own case, or an empty pick, gives 409 `MONEY_RULE` ("nothing to pick").
  * Two payers in one pick gives 422.
  * Firm B's person or case gives 404.
  * Another payer from another case gives the database's refusal.
  * Another payer on the same case gives 201.
* **The pick's C5 check (the reviewer's untested line) holds by probe:** user-O sees CASE only. `{caseId: CASE2}` gives 404, `{personId: PC, caseId: null}` gives 404, and `{personId: PC, caseId: CASE_C}` gives 404.
* **Amount edges** (apply, refund and tick): 0, −1, 1.5, "100", null, true, 1e21, `[100]`, `{}` and MINOR_MAX+1 give 422. 1e400 gives 422. MINOR_MAX gives 409.
* **Tick edges:** "0", "-1", "1.5", "00100", "1e3", " 100", empty, a doubled parameter, 10 digits, `unclearedAcknowledged=yes` and `=TRUE` all give 422, and the invoice stays a draft. A tick with only `unclearedAcknowledged` issues with nothing applied.
* **Refund text:** control characters, bidi characters (U+202E, U+2067), newlines, only zero-width, only spaces or NBSP, more than 200 or 100 characters, two payees, a card or card-terminal method, EUR or "cad", and unknown keys all give 422. French, CJK, Arabic and emoji text gives 201.
* **Refund dates:** tomorrow gives 422. 2026-02-30 gives 422. 2020-01-01 gives 409 `MONEY_RULE`. Today gives 201.
* **Other refusals:** another client's case gives 422. Firm B's case or payee gives 404. USD with only CAD held gives "Only USD 0.00 is available.".
* **Credited and written-off invoices:**
  * Fully credited, then apply: 409 `OVER_DUE` (0.00 due).
  * Part-credited with 60.00 due: 60.01 is refused and 60.00 is paid.
  * Written off (row by SQL), then apply: 409 `OVER_DUE`.
  * A USD invoice with only CAD money: "Only USD 0.00 is available.".
* **Party balance below the case's** (a returned cheque on CASE2): Pay from trust and a refund on CASE both say "Only CAD 20.00 is available." (P-634).
* **Yes → No → Yes with money held:** under No, the route application, the issue tick and a refund each give 201 or 200. After Yes again, the reads are right.
* **Firm B against firm A:** the invoice (also as an upper-case id), the payee, the case and the issue tick all give 404. A Case Manager without the keys gets 403 on both routes.
* **No trace of a refusal:** the audit, event and entry counts did not move across the whole edge battery (B1). The only new rows were the drafts' own creation lines.

Verdict: Changes
