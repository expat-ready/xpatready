# Review: FO-7b part 1a (draft invoice lines, tax rounded per line, QA-482; J-59)

Independent reviewer (money row, P-608/P-303), fresh Opus, 20 Nov. Commit reviewed: `8a243502ffebdb617436004a8b6507e55a218ac0` on `claude/gifted-feynman-i60t6w` (`git diff origin/main...8a243502f`, 9 files, +518). Spec: `build-lead-c-briefs/FO-7b-1a.md`, with `FO-7b.md` (QA-482, the rulings of 18 Nov) and Lead B's amendments. There is no screen, so screen-review checks (2), (3), (7) and the BIC table are N/A. The journey score is in `journey-test-reviewer-2026-11-20.md`: **7.5/10**, below the bar while Major 1 is open.
While I worked, the builder committed `36f7b3b58` (a fix for Major 1 and Minor 4) and `e687f99f5` (the break report). Every result below is for 8a243502f, run on a `git archive` copy of exactly that commit unless the line says otherwise. I have not reviewed 36f7b3b58 in full.

## Blocker
None.

## Major
1. **Some line descriptions pass the zod parse, then the database refuses them, and the route answers 500.** At `ports/client-money.ts:33` the description rule refuses only C0 controls, U+007F, U+2028 and U+2029; `drafts.ts:66` then writes. The database's `money_text_ok` (FO-7a migration lines 446-529) also refuses C1 controls and bidi characters, and it refuses text with no visible character. I ran each of these on an exact-commit copy (:4468): `"​"`, `"Fee \u0085 x"`, `"Fee ‮ gnp.exe"` and `"́́"`. Each gave **500** "Server error". Nothing was stored (the line count stayed at 1). The brief says "A 500 is a fail", and STANDARDS says a bad field is a 400 at that field. This confirms the breaker's Major 1. **Fix:** check `money_text_ok` before the write and answer 400 at `description`, with test cases. 36f7b3b58 does this: on the working tree with that commit, `​` and `⁠́` gave 400 at the field. Re-review that commit.
2. **The `module-cards` check goes red, and it would stay red for every later PR.** At `api/src/client-money/MODULE.rows/FO-7b-1a.md:1`, the fragment names `` `ports/client-money.ts` `` in backticks. `module-cards.py` `check_fragment` (lines 116-118) checks that every backticked path exists. The workflow's first step, `check-module-cards.sh`, builds its fixture tree (line 37) from `api/src`, `web/src` and `tests` only, so `ports/` is missing there. Run locally, it gave **exit 1**: "FAIL tree: as on this branch: wanted PASS, got FAIL … names ports/client-money.ts, which exists neither from the card's folder, the studio nor the repository root". No fragment on `main` names a `ports/` path, so this row is the first. Once merged, the "as on this branch" fixture fails on every PR. The problem is still there at e687f99f5. **Fix:** in the fragment, name the file without backticks (for example "the shapes in the shared ports file client-money.ts"), or move it to the card's Purpose line. A separate tooling PR could also add `$S/ports` to the fixture copy.

## Minor
1. **Adding a line uses `agent/invoice:create`** (`routes.ts:18`). AG-06 C5 and SA-06 §10b define `agent/invoice:edit` as "Edit a DRAFT invoice" (Owner, Admin, Billing/Finance). For a Case Officer the rule is "drafts only … sees the drafts they create" (SA-06 v3.15 (1); DEV-TASKS K6, record visibility follows the parent record).
   * Observed: user-O (CASE_OFFICER) added a 9,999.99 line to the Owner's draft and got 201.
   * `GET :id` (`routes.ts:21`) lets a Case Officer read every draft in the firm.
   * Fix: let `:create` add lines only to a draft the caller made (`created_by = staff:<id>`) and require `:edit` otherwise; limit a Case Officer's read to their own drafts. Or ask it as "Question for the tech lead" and settle it in 1b. The brief is silent on this, and no person-visibility helper exists yet, so it is Minor, not Major.
2. **A read can be inconsistent** (`drafts.ts:82-84`, `96-100`). `GET` reads the lines and then `money_invoice_total` in two statements, outside a transaction. A line committed between the two gives one answer where `totalMinor` ≠ `subtotalMinor + taxMinor`. Fix: run `view` inside one `$transaction` (repeatable read) for `read` as well.
3. **The planted fails are stand-ins at the predicate level, not runs through the route.**
   * In the check (`check_fo7b_invoices.ts:109, 118, 124`), each planted fail feeds `halfUp(...)` or `taxForLine(100, …)` into the pass predicate. That proves the case can tell the figures apart. It does not prove that a half-up writer would be caught through the route.
   * The J-59 W3 fail (`j_59.ts:79`) only re-checks JavaScript constants plus the pass condition. The W1 fail (`j_59.ts:66`) says "nothing saved" but counts no rows.
   * Fix: give `InvoiceDrafts` an injectable rounding function (default `taxForLine`), run R2 and R7 through a second instance planted with `halfUp`, and assert that the stored figure is wrong. Count `money_invoice` rows in the W1 fail.
4. **A 300-emoji description gets 400 "At most 500 characters."** (`ports/client-money.ts:33`). zod counts UTF-16 units, while the database counts characters. Confirmed on the exact commit. 36f7b3b58 fixes it: on the working tree, the same text gave 201.
5. **The module card is out of date.** `client-money/MODULE.md:9-10` still says "No code here yet". The Invariants list does not state QA-482: every line write stores `tax_minor = taxForLine(amount, ppm)`, and the total is `money_invoice_total`. Neither line is frozen. Fix: update both in this PR.
6. **Graph G3 (P-86):** `graph.mjs` lists `GET` and `POST :id/lines` on `/front-office/money/invoices/:id` as reached by no test. The test helpers hide the literal paths from the tool. Both routes are reached (39 checks plus J-59), so this is a tool limit, not a coverage gap.

## The builder's judgment calls, judged on the merits
1. **Routes under `/api/front-office/money/invoices`: right.** PF-4's guard covers only `/api/platform/*` and `/api/front-office/*` (`platform/identity/guard.ts:1`), so `/api/client-money/` would fall outside the staff guard. Amendment 4 gives the safety reason, and the 1a text is a slip. The PR body must name the deviation.
2. **`ports/client-money.ts` holds zod shapes only: allowed.** 1a Build item 3 says "only what these routes need; the rest … with part 1b". It imports only `zod`. `check-port-contracts.mjs` exits 0, and no port interface means no contract is due. The Lead's P-423 read still applies.
3. **409 when the firm has no settings row: right, and needed.** `money_invoice.firm_id` is a foreign key to `money_payment_settings(firm_id)` (migration line 382). Without the check the insert fails on the foreign key and the answer is a 500.
4. **Reading `fo_person` / `fo_company` directly: acceptable.** `FoPersonPort` has no read method (`ports/fo-person.ts:67-74`). The reads are read-only, walled and `firmScope`d, and §8 forbids writing `money_*` from outside the module, not reading `fo_*`.
5. **One key for both writes:** see Minor 1.
6. **A firm that is not tax-registered can still charge tax: consistent with the brief.** `FO-7b.md` "Where this page wins" says `ratePpm` is whatever the request sends until FO-7g part 1. Not a 1a finding.

## Hand-over to part 1b (not findings, P-26)
* R8's own line makes a draft of 24,696,061.94. `money_invoice_write` refuses to issue anything above 21,474,836.47 (migration lines 812-814), and that refusal is a check_violation, which ProblemErrors turns into a 500. Issuing must refuse in words.
* Never a prospect (AG-6-1 r1).
* The unsigned-retainer acknowledgement (amendment 3).
* No GST/HST for a firm that is not registered (FO-7g).

## What held (checked independently)
* **The rounding:** `taxForLine` matches Python `Decimal` ROUND_HALF_EVEN in all **360,072** cases tried (amounts 0-30,000 and int32 corners, at 0, 1, 5 %, 9.975 %, 13 %, 14 %, 14.975 %, 15 %, 49.9999 %, 50 %, 99.9999 % and 100 %): 0 mismatches. It is BigInt only, with no float, `Math.round` or `toFixed`, and it throws on non-integers and out-of-range input.
* **int32 and amounts:** quantity × unit above 2,147,483,647 → 400 at `unitMinor`. The total is bigint, and `Number` is exact.
* **Brief cases:** R1-R8 and R10 each go through the route and are read back from `money_invoice_line`. R11: 400 with the brief's exact words, no row. R12: 1300 is stored as 1300; −1, 1,000,001, 1.5 and "130000" → 400. R13: a sent tax is ignored. R14: refused in words.
* **Concurrency:** 10 lines sent at once (`FOR UPDATE` on the invoice row) → positions 1-10 and total = sum (3,107 both ways). With the lock removed, the unique `(firm_id, invoice_id, position)` gives P2002 → 409, so the race case would fail.
* **Firm walls:** firm B gets 404 on firm A's draft, and `firmId` in a body → 400. RLS holds as `xr_app`.
* **Auth and inputs:** READ_ONLY → 403 `MISSING_PERMISSION`; no token → 401; a malformed id → 404; a `null` or array body → 400.
* **Audit and scope:** one audit line per write, actor `staff:<id>`, type FIRM_STAFF. No schema, no screen, and nothing beyond 1a.

## Test results (exit codes)
* **On an exact 8a243502f copy:** `check_fo7b_invoices.ts` exit **0** (39 passed, 0 failed). `j_59.ts j59x 4469` exit **0** (15/15).
* **In the clone, at 8a243502f (09:30-09:36):** `check_fo7b_invoices.ts` exit **0** (39/39). `j_59.ts j59r 4469` exit **0** twice, each on a fresh isolated copy (15/15 both times).
* **On the working tree after 36f7b3b58** (that commit changes only `drafts.ts`, `ports/client-money.ts` and the check): `check_pf12_walls` exit 0 (100/0), `check_fo7a_money_schema` exit 0 (122/0), `check_fo7ts_money_settings` exit 0 (107/0), `typecheck.mjs` exit 0 (no new errors).
* **Guards:** `check-port-contracts.mjs` 0; `module-cards.py tree` 0; `module-cards.py pr` 0; **`check-module-cards.sh` 1** (Major 2).
* **Not run:** `check_fo7a2_ledger_rules`, `check_case_feed`, `check_csv1_inputs` (it covers `/api/runtime` and `/api/link` only), the demo reset and checkpoint load, and the full `ci`.

**To fix before approval:** Major 1 (fixed in 36f7b3b58, to be re-reviewed) and Major 2. Minors 1-3 and 5 are recommended in the same PR or as questions for the tech lead.

Verdict: Changes requested

## Re-review of 8f298699c
I read only the diff `8a243502f..8f298699c` (P-277): 11 files. The code changes are in `drafts.ts`, `routes.ts` (comment only), `ports/client-money.ts`, the card and its fragment, and the two tests. The rest are records: `qa/built/R1.59.md`, the break report, and my review files.

**Major 1, fixed.**
* `drafts.ts` now runs `select money_text_ok(description, 500)` inside the line's transaction, before the write. A refused description gets 400 at `description`.
* The new check case sends 7 strings (zero-width only, two C1 controls, a bidi override, a bidi isolate, combining marks only, the Hangul filler). Each gets 400 at the field, and no row is written.

**Major 2, fixed.** The fragment no longer backticks `ports/client-money.ts`. `check-module-cards.sh` now exits **0** (44 fixtures, "tree: as on this branch" passes), and `module-cards.py tree` exits 0.

**Minor 1, fixed for writes.**
* In `addLine`, the invoice row is locked first, then a caller who is not the draft's `created_by` needs `agent/invoice:edit`, read through `holdsKey` from the person's live role grants.
* Tested both ways: a Case Officer on the Owner's draft gets 403 `MISSING_PERMISSION` and no row; a Case Officer on their own draft gets 201; the Owner (who holds `:edit`) on the officer's draft gets 201.
* Another firm's draft still answers 404 before the key check, so nothing leaks.
* A Case Officer reading every draft with `:show` is raised in the PR as a question for the tech lead. That is acceptable, because no person-visibility helper exists yet.

**Minor 2, fixed.** `read` runs `view` in one REPEATABLE READ transaction, so the lines and the total come from the same snapshot.

**Minor 3, fixed.**
* `InvoiceDrafts` takes an injectable tax rule (default `taxForLine`). The app's factory in `features/client-money-invoices.ts` passes two arguments, so it gets the default.
* R2's planted half-up instance now runs through the service as firm A, on the app's walled database, stores 0.07, and the case rejects that stored row. That is a real mutation run.
* The R7 fail and the J-59 W3 fail are now stand-ins taken from the route: one 1.00 line comes back at 0.13, which is not 0.12. That is enough for "tax on the subtotal".
* The J-59 W1 fail now counts drafts.

**Minor 4, fixed.** The length is counted in code points: 300 emoji are stored, and so is mixed-script text.

**Minor 5, fixed.** The card's Purpose now names `invoices/`, and the Invariants list has the QA-482 line.

**Minor 6, not changed.** This is a graph-tool limit, and I accept that.

**New issues:** none. The 403 comes before the issued and currency checks, and no write happens before any refusal. `holdsKey` is the existing catalogue helper.

**Test results at 8f298699c:**
* `check_fo7b_invoices.ts` exit **0**, 43 passed, 0 failed (the new cases are the R2 planted service, R7, the text fail and pass, and the keys fail and pass).
* `j_59.ts j59v 4469` on a fresh isolated copy: exit **0**, 15/15. The copy was stopped afterwards.
* `typecheck.mjs` exit 0 (no new errors). `check-port-contracts.mjs` exit 0. `check-module-cards.sh` exit 0. `module-cards.py tree` exit 0.
* Not run: the full `ci`, `check_fo7a2_ledger_rules` and `check_case_feed`.

No Blocker or Major is open. The Lead's P-423 read of `ports/client-money.ts` still comes before the label.

Verdict: Approve 8f298699cb7f80954e9b72c4a7c0732b9437e101

## Re-review of merge d2254dd6b

Diff-only re-review (P-277) of the merge of origin/main into this PR (P-270: the stale j_37 walk check, fixed on main by #2486). Head d2254dd6b0aae00b0f3bb08ac8b1afddbf0ac66c has two parents: 5a620de44 (the last approved head) and 3912aa7e6 (origin/main).

**1. Pure merge: yes.**
* `git show --remerge-diff d2254dd6b` is empty. Git's own merge result is the commit, so nothing was resolved and nothing was edited by hand.
* `git diff origin/main d2254dd6b --name-only` lists 14 files, all this row's:
  * under `api/src/client-money/` (MODULE.md, MODULE.rows/FO-7b-1a.md, and drafts.ts, routes.ts and tax-round.ts in `invoices/`)
  * `features/client-money-invoices.ts` and `features/MODULE.rows/FO-7b-1a.md`
  * `ports/client-money.ts`, `tests/check_fo7b_invoices.ts` and `tests/journeys/j_59.ts`
  * `product/qa/built/R1.59.md` and `product/screens/FO-7b-1a/*`
* `git diff 5a620de44 d2254dd6b` over all of the row's paths is empty. The row's files are byte-identical to the approved head.

**2. Main's incoming changes do not reach this row's code.**
* `platform/firm-scope.ts` (PF-12b part 1) adds four things, all on the bypass path:
  * an `audit` field (and an optional `inside` field) on each `BYPASS_USES` entry
  * the one-use-at-a-time nesting rule in `asBypass`, with `mayRunInside`
  * `touchFirm` / `touchEachFirm` / `touchFirms` / `touchingAudit`
  * `BypassNotRecorded`
* `firmScope(firmId, where?)` and `inFirm` are not in the diff hunks, so they are unchanged. The request-firm, enter-firm and walled-Db code is not touched either.
* This row never calls `asBypass` or `touchFirm`. What it uses still works the same way:
  * drafts.ts uses `firmScope(ctx.firmId, …)` and `this.audit.record(tx, …)`
  * the feature passes `Db` and the plain `auditEvent` adapter
  * routes.ts sits behind PF-4's staff guard
* The guard's `platform.identity.authenticate` use keeps its routes and gains only `audit: "none: …"`. One bypass use at a time does not affect the guard's single call.
* `seed-sample-firms.ts` adds `touchFirm(tx, firm.id)` in the seed's transaction. Outside a bypass use, touchFirm does nothing.
* `identity/demo-reset.ts` now runs each firm's settings reset in one transaction, with `touchFirm` first. Neither file touches money_invoice or its lines.

**3. Runs (from `prototype/`, exit codes taken with `; echo $?`):**
* `tsx … studio/tests/check_fo7b_invoices.ts`: exit **0**, 43 passed, 0 failed.
* J-59 on its own fresh copy:
  * `zsh studio/tools/isolated.sh j59rv 4468 start --ttl 30 PLATFORM_IDENTITY=local`: exit 0
  * `tsx … studio/tests/journeys/j_59.ts j59rv 4468`: exit **0**, 15/15 passed
  * `isolated.sh j59rv 4468 stop`: exit 0 (database and files removed)
* `node product/tools/typecheck.mjs`: exit **0**, "no new type errors (15 known, 0 fixed)". It needed `NODE_OPTIONS=--max-old-space-size=6144` because the api project ran out of the default heap in this sandbox; the first try exited 2 on the out-of-memory error, not on a type error. The 15 known errors are in older suites, none in this row or in api/src.
* Not run: the full `ci`. Port 4400 was not used.

No Blocker or Major is open. The journey score of the earlier review stands, because the row's code is unchanged.

Verdict: Approve d2254dd6b0aae00b0f3bb08ac8b1afddbf0ac66c
