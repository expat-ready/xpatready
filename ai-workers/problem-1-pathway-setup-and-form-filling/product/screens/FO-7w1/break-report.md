# FO-7w1 break report: draft invoice from a signed retainer (PR #3654, head ac93518c4)

Breaker, 25 Nov. No screen, so I attacked the API and the database only. Method: I built the builder's harness (`studio/tests/check_fo7w1_retainer_invoice.ts`, 25/25 green here) into scratch scripts outside the repo. Each run used a scratch database with every migration, a Nest app with PF-4's guard and PF-12's walls (it connects as `xr_app`) and the local sign-in, on a random port (never :4400). Fixtures are Sample retainers written with the replica role, as the harness writes them. 14 runs in all, every database dropped. I changed no product code.

## What broke

**m1 (Minor): a repeated or raced start quietly makes empty drafts that can't be deleted.**
- Steps: POST `{personId, retainerId}` three times (a double-click or a reload) → 201 with 1 line, then 201 with 0 lines, then 201 with 0 lines.
- 30 parallel starts on a 10-row retainer gave 1 full draft, 15 × 409 `ROW_ON_INVOICE` and 14 empty drafts.
- A retainer with only an "On signing" row and an open-amount row, started without `feeRowIds` → 201, 0 lines, `deposit` false. The audit says "with 0 fee lines".
- Expected: one draft, or a refusal that says nothing is left to bill. STANDARDS §4 asks for "Idempotent creates".
- Actual: the response has nothing that says rows were skipped (it has the same keys as a full draft). There is no route to delete a draft yet, so each empty one stays in Drafts.
- Spec reading: "a row already on an invoice is skipped" is followed to the letter. The plain FO-7b create is not idempotent either; this row makes the outcome a silent empty record. Code: drafts.ts:225 (empty `chosen` still goes on to create).

**m2 (Minor): one row whose label money can't print blocks the whole unnamed bill, and the message gives the wrong reason.**
- Steps: a signed retainer row labelled `Fee ‮gnp.exe (Sample)` (or `⁦⁩`). It passes `fo_retainer_text_ok`, the fee row's CHECK. Then POST without `feeRowIds`.
- Actual: 422 at `feeRowIds`, a field the caller never sent, saying "no visible letter or number". The bidi label has visible letters: it is refused for a direction-changing character, as the typed-line message says. The message doesn't say which row it means.
- Nothing is written (held). The only way out is to name every other row by hand. Code: drafts.ts:238.

**m3 (Minor): a row that one line can hold makes a draft that can never be issued, and the row then stays held.**
- Steps: one row at 2,147,483,647 (the fee row allows up to 10,000,000,000) → 201. The draft total with 13 % tax is 2,426,656,634.
- 50 rows at MINOR_MAX → 201, total 121,332,826,050. Issue → 409 "The total is more than one invoice can hold" (money.ts:63).
- The check covers only each line's amount (drafts.ts:219), never the total that issue enforces. The unique index keeps the row billed, and no route can delete the draft or its line, so the row is stuck. At 13 % this hits any row above about 19,004,280.06.

**m4 (Minor): with the firm's default currency at USD, the 422 lands on `currency` even though no currency was sent.**
- Steps: `default_currency = 'USD'`, POST `{personId, retainerId}` → 422 at `currency`: "This draft is in USD; the retainer's fee … is in CAD".
- Fee rows can only be CAD (`fo_retainer_fee_row_currency_check`). Code: drafts.ts:76 picks the firm default before the rows are read (drafts.ts:218).

**m5 (Minor, a question for the tech lead): a deposit invoice can also hold earned fees.**
- Steps: `feeRowIds: [ON_SIGNING row, WHEN_DONE row]` → one draft with `deposit` true and both lines. Adding a typed line to it via `/lines` → 201, still a deposit.
- So under P-567 (3), earned fees on that invoice also lose the card pay link. Code s. 32 points the deposit to trust and the fees to operating. The row neither forbids nor rules on mixing (drafts.ts:83). Unconfirmed: no counsel.

**Observation, not counted:** in 1 run of 12 (A12b), a draft started right after `tax_registered` was set to false still got 13 % (`FEE:3000:130000:390`). I could not reproduce it in 11 reruns or in a focused rerun (C0–C5, all correct), and no `xr_app` session was ever left idle in a transaction. It fits a pooled client holding an old snapshot (firm-scope.ts P1), but I haven't tied it to this row.

## What held (attempt → result)
- **Duplicate and mixed-case ids:** `feeRowIds` [id, ID upper-case] plus `retainerId` in upper case → 201, one line, audit ids in lower case. A leading space → 422 at `feeRowIds.2`. 51 copies of one id → 422 "at most 50". `[]` → 422.
- **Races:** 12 and then 30 parallel starts, named and unnamed mixed → every row on exactly one line, no 500.
  - An outside writer holding an uncommitted line of the row (no advisory lock): the API waits, then 409 `ROW_ON_INVOICE`, nothing written (P2002 is mapped correctly).
  - The same writer rolling back instead → the API's draft gets the row.
- **Wrong party or firm, all 404 with nothing written:**
  - firm B's token with firm A's retainer, using firm B's person, firm A's person or firm A's company;
  - another client of the same firm;
  - a person retainer billed to a company, and a company retainer billed to its signing person;
  - a CONSULTATION.
  - A company retainer billed to its company → 201.
- **Status:** VIEWED, DECLINED and EXPIRED (on top of the harness's four) → 409 `RETAINER_NOT_SIGNED`. A SIGNED retainer can't get a new version or change at all (the `fo_retainer_write` trigger), so "current version changed after billing" can't happen.
- **Role:** the Case Officer with grants ended → 403 `MISSING_PERMISSION`, nothing written. No session → 401 (harness).
- **Body:** `deposit: true`, `retainerId: null`, `feeRowIds` as a string, and `__proto__` → all 422 (strict body).
- **"Prices include tax" on** → 409 `PRICES_INCLUDE_TAX`, 0 drafts.
- **Tax:** not registered → 0 %. Copied and typed lines on one draft get the same rate and tax in every state I tried. Changing the Bill-to to QC re-rates the copied lines.
- **Text:** these labels are copied exactly, and the typed route takes them too: emoji, €, French, Chinese, Arabic, 120 characters, a zero-width space. NBSP is trimmed.
- **Amounts:** 0 copies as 0.00 / 0 tax. 2,147,483,648 and 10,000,000,000 → 422 with nothing written.
- **Audit:** one `invoice.draft_created` line with ids, amounts, tax, the deposit flag and province. No label, name or email. 50 rows make a detail of 5.6 KB, within the AuditDetail limits.
- **Trigger:** these legitimate changes all still pass it: issue (also of a deposit invoice), Bill-to change, credit note on a deposit invoice, a payment, and line delete and renumber on a draft (SQL).
  - It refuses changing the deposit mark on a live draft and giving a hand-typed line a source.
  - A deleted line or draft frees the row, and the row can be billed again by name.
- **Migration:** applies on an empty copy. rollback.sql runs in one transaction, then the migration re-applies.
- **Speed:** 1, 10 and 50 rows take about 35, 55 and 150 ms per create, against about 25 ms for a plain draft.
- **Not applicable to this row** (no screen, no upload): hostile uploads and planted PDF instructions, keyboard, 1024 px and 200 % zoom, the 100-programme / 400-combination budgets. Pay link, Ready to bill, deleting a draft and editing a line are on the row's "Not here" list or not built yet. Not checked: the full typecheck ran out of memory locally, so it is left to CI.

Evidence: scratch scripts and outputs are in the session scratchpad (`atk/attack*.mts`, `atk/out*.txt`, `atk/mon*.txt`). None of them are committed.

Verdict: Approve
