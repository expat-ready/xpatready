Reviewer: Approve 15be06bf0396bf7fefe98c22045cf8d2ba195410 (diff-only rounds over 0738e381814805ccdadd08220485e367ccb4608c..15be06bf; M1 fixed). Earlier: Block c83d2017 (M1); Approve 0738e381 (round 7, PR comment).

# Diff-only round on 15be06bf (23 Nov 2026; c83d20173 → 15be06bf0, review.md excluded)

* **Test (M1):** the fix adds `unseenReq`, a deposit with `trustRequestId: rCase.body.id` and no `caseId`. It runs inside the same window as `unseen` (`agent/case:view.all` removed from OWNER and CASE_MANAGER, put back right after). It is asserted `=== 404` in the existing DW6 fail case, under the same `before() === mid` nothing-written condition, and its status is added to the failure detail. This is what M1 asked for. PA stays visible, so this exercises l. 174 and not `partySeen`.
* **service.ts:** only n5. `partySeen` and its comment now sit above `caseOf`'s comment, and the text is unchanged. There is no logic change.
* **Also in the commit:** records only (`break-report.md`, plus my Block section in `review.md`).
* **My runs on this head** (scratch copy refreshed from the worktree; `diff -r` empty before and after):
  * `check_fo7t_trust.ts`: 58 passed, 0 failed.
  * Planted break, l. 174 removed: **56 passed, 2 failed**. The DW6 M1 case FAILS with `unseenReq` at `[201,null]`. The second FAIL (the DW6 per-case balance sum) is a knock-on from the extra 1.00 booked onto CASE.
  * `check-port-contracts.mjs`: 0 problems.
* **Left as notes for the tech lead (non-blocking):** n4 (try/finally around the key swaps) and n6 (the replay runs before the visibility check; this predates this PR, and Lead B placed the replay before trust-off on purpose).

**Verdict: Approve** 15be06bf0396bf7fefe98c22045cf8d2ba195410. No Blocker or Major is open.

# Diff-only round on c83d2017 (23 Nov 2026; 0738e381 → 0f1acb674 → c83d20173)

Scope: only `git diff 0738e381..c83d20173`, in two parts. The last reviewer Approve on the PR is 0738e381 (round 7, a PR comment; this file had no record of it). Part A is 0f1acb674, Lead B 2's C5-on-writes fix. Lead B read it; I had not. Part B is c83d20173, the DocumentRenderPort contract run for TrustDocuments. Planted breaks were made in a scratch copy only (`scratchpad/studio-breaks`, node_modules linked). After each break the copy was restored, and `diff -r` against the worktree came back empty. Nothing in the worktree changed except this file.

## Part A: 0f1acb674 (service.ts +9/-1, check_fo7t_trust.ts +12/-1)

The change:
* `createRequest` with no `caseId` now calls `partySeen`.
* `recordDeposit` with no case, on its own or through the request, calls `partySeen`.
* A deposit on a request whose case the writer cannot see is refused with `notFound("case")`.
* `partySeen` refuses with 404 when the party is not in `scopeOf(ctx).parties` (MoneyVisibilityPort).
* The check seeds a prospect for PC. It adds a pass case: a writer who sees the party, with no case, gets 201 for both a request and a deposit. It adds a fail case: the same writer, with the Owner and Case Manager `agent/prospect:view.all` and `view.own` keys removed, gets 404 for both and nothing is written.

* **Fail closed:** yes. The check is a membership test on the visibility port's party list. An empty or missing scope refuses. It runs inside the writing transaction, before any `create`.
* **No information leak in the 404:** yes. `notFound("person")` answers "No such person in your firm." with code NOT_FOUND. That is exactly the answer `partyOf` gives for a person that does not exist, so an unseen party and a made-up one cannot be told apart. The same holds for the unseen case ("No such case in your firm.", as `caseOf` gives). In `createRequest`, the purpose check and the details read come after the refusal.
* **Nothing written on refusal:** yes. The refusal throws an HttpException inside `this.write`'s `$transaction`, so the transaction rolls back. The receipt and request emails are sent only after the transaction returns. The fail case checks the payment, request and audit counts (`before() === was2`).
* **Each new case fails without the fix (planted, then reverted):**
  * B1, the request check removed (`: null`): the new fail case FAILS. The request returns 201 with DR-0005. 57/1.
  * B2, the deposit's `if (!caseId) partySeen` removed: the new fail case FAILS. The deposit returns 201. 57/1.
  * B4, `partySeen` always refusing: 8 FAIL, from the first DW3 pass onward, and the run aborts. Over-refusal is caught, though by the earlier pass cases before the new pass case is reached. The new pass case adds little on its own. That is acceptable.
  * B5, the request's-case line (`if (!caseId && q.caseId && !…cases.includes(q.caseId)) notFound("case")`) removed: **58 passed, 0 failed.** This is M1.
* **Role keys put back even on failure:** not in a `finally`. The delete, the two calls and the insert are straight-line code. In practice this does no harm. `call` returns 4xx and 5xx answers without throwing. Any throw (a network error, or psql) jumps to the outer `catch`, which records "the check ran to the end" as FAIL, and the per-run scratch database is dropped in the `finally`. So no later assertion runs with the keys missing, and nothing persists. The put-back set is exact: PF-3 seeds both `view.all` and `view.own` for OWNER and CASE_MANAGER (migration 20261114015002, lines 982-990). Build round 1's case-key swap uses the same pattern. See n4.

### Major
* **M1: the third rule in the fix ships untested.** The rule: a deposit with no `caseId` on a request whose case the writer cannot see is refused with 404 (service.ts l. 174). Planted break B5 removes the line and the check stays fully green. I confirmed the rule is real in the scratch copy with a 6-line probe, run once with the fix and once without it:
  * With the fix, the probe passes: 404, nothing written. 59/0.
  * Without the line, it FAILS. The writer, who sees PA but not CASE, gets **201**, receipt R-0010, and the money is booked onto the unseen case (the deposit takes `q.caseId`, and `partySeen` is skipped because a case is now set).

  This is the C5-on-writes boundary this commit exists for, on a PR that merges by itself on green CI. Fix (test only), after the new party cases:
  ```ts
  const w3 = before();
  sql(`delete from platform_role_permission where role in ('OWNER', 'CASE_MANAGER') and permission_key = 'agent/case:view.all'`);
  const reqCaseUnseen = await dep({ method: "WIRE", amountMinor: 100, trustRequestId: rCase.body.id, idempotencyKey: "fo7t-request-case-unseen" });
  sql(`insert into platform_role_permission (role, permission_key) values ('OWNER', 'agent/case:view.all'), ('CASE_MANAGER', 'agent/case:view.all')`);
  ok("FO-7t DW4/DW6 fail (Lead B's money read): a deposit with no case on a request whose case the writer cannot see → 404, nothing written", reqCaseUnseen.status === 404 && before() === w3, reqCaseUnseen.body);
  ```
  `rCase` is the existing request on CASE.

### Nits (non-blocking)
* **n4:** if the builder prefers, wrap each role-key swap in `try { … } finally { insert … }` so that a future edit that continues after a throw cannot run with keys missing. This is not needed today (see above).
* **n5, service.ts l. 199-206:** `partySeen`'s doc comment was inserted after `caseOf`'s, so `caseOf`'s comment ("A case given on a request or deposit …") now sits above `partySeen`. Move `partySeen`, with its comment, above `caseOf`'s comment.
* **n6 (pre-existing, not this diff):** in `recordDeposit` the idempotent replay (l. 158-164) runs before any visibility check. A writer who has lost sight of the party, but holds the exact earlier key and details, gets 200 with that payment's receipt number. This needs the original key, so the exposure is small. Lead B may want the visibility check before the replay. It is not a blocker here.

## Part B: c83d20173 (check_fo7t_trust.ts +8)

The change: CI's `fast` job (`tools/check-port-contracts.mjs`) failed with "real adapter TrustDocuments runs no contract". The commit adds three imports and one `runContract(documentRenderPortContract, "TrustDocuments", …)` call after the `finally`. It needs no database. No product code changed.

* **Same contract as the other adapters:** yes. It is `ports/contracts/document-render-port.contract.ts`, the one run by fakeRender (check_pf0p_ports l. 243), DocxRender (check_fo5_retainers l. 344) and MoneyDocuments (check_fo7b_invoices l. 476). The harness shape matches MoneyDocuments' (`reordered` = the keys reversed, `other` = the amount changed by a cent). Results go through the file's own `ok`, so a failure exits 1.
* **The data matches the `trust_receipt` template:** yes. Its 11 placeholders (firmName, number, issuedOn, party, currency, amount, method, receivedOn, reference, request, cleared) are exactly the harness keys, all strings and all Sample values. `fill` throws on a missing key. I checked: dropping `amount` throws "trust_receipt: no value for amount".
* **The reader is real, not vacuous:** yes. `textPdf` writes one `(…) Tj T*` line per text line. The reader's regex is byte-identical to FO-7b's `pdfReader`. Run by hand, it reads back the full 259-character receipt, and 600.00 and 600.01 read back differently. A reader that returned "" would fail the contract's "other data, another document" half.
* **Evidence on this head:** `node tools/check-port-contracts.mjs` gives 0 problems, with DocumentRenderPort ×4. `tsx --tsconfig api/tsconfig.json tests/check_fo7t_trust.ts` gives 58 passed, 0 failed, including "TrustDocuments: passes its contract (3 of 3 cases)".
* **Nits:** n1, `pdfText` is a third copy of the text-page reader; a shared `readTextPdf` beside `textPdf` would keep them in step. n3, in the contract and not this diff: its refusal cases accept any error, so "Not A Key" is refused as an unknown template, not by a key-form check. MoneyDocuments has the same gap.

Journey score: not applicable to this round. Both commits are a server-side guard and test code, with no user-facing screen change. The journey score from build round 1 stands.

**Verdict: Block** c83d20173c71076ad48a42f5274b96feb68e0585. To fix: M1, a test-only change of about 5 lines (above). Part A's code is correct, and Part B is approved as is. After the fix, a diff-only re-review of the test change.

# Build round 2 (diff only, 795e961ed → 510a9d2a7)

Reviewed 23 Nov by the same reviewer, diff only, over two commits:
* `78277d7ae`, the fix: reads.ts, service.ts, features/client-money-trust.ts and the check (+104/−25).
* `510a9d2a7`, Lead 10's rulings, test only (+14/−8).

Line numbers in the round 1 findings and the planted breaks are those at `78277d7ae`. No code changed in `510a9d2a7`.

**Runs (in a scratch copy of the studio, on scratch databases on :54329 named by pid and dropped):**
* The check passed 48/0 at `78277d7ae` and 52/0 at `510a9d2a7`, once each as is.
* I planted 10 breaks one at a time and reran it after each (table below).
* I added a probe run with seven probes.

I left alone the breaker's database `xr_studio_fo7t_brk3_*` and `break-report.md`. I did not re-run the builder's other suites.

**Verdict: Approve.** M1 and M2 are fixed, and each new check case fails when its fix is removed. No Blocker or Major is open. The new Minors below do not block.

## Round 1 findings
* **M1 fixed** (`service.ts:197-208, 102, 168-174`). `caseOf` checks three things:
  * The case is in the caller's `scopeOf(ctx).cases`. If not, the answer is 404, so the case must exist, belong to this firm and be visible to the caller (fail closed).
  * Its `case_client` names the same person or company. If not, 422.
  * A deposit against a request may not name a different case (422). With no case given, it takes the request's case.

  The check (l. 235-250) refuses six cases, each with nothing written: a case that does not exist, firm B's case, another client's case, a case other than the request's, a request on a case that does not exist, and a case the caller cannot see. Planted breaks B1-B3 each turn it red.
* **M2 fixed** (`reads.ts:59-68`). `balanceAfterMinor` is now a window sum per currency in `seq` order. It is taken over the rows that are both visible and filtered, before paging (the cursor is applied outside the window).
  * Probe: with `caseId=CASE`, the row reads `30000:30000`.
  * The new DW10 case (l. 305-313) puts user-O on the case's team and gets that case's own balance, the same figure `/balances` gives. This also proves the "of any role" half of DW10.
  * Planted break B4 (the party-wide column back) turns it red.
* **m1 fixed.** Rows are ordered by `seq desc, currency`, with the cursor `{seq, currency}`; a cursor `seq` above the integer range gives 422.
  * The slow-writer case (l. 329-342) turns red under break B5 (back to `created_at`).
  * Probe: paging 2 at a time returns 11 of 11 rows once each.
* **m2 fixed:** a replay is now checked before trust-off. Probe: a replay after the Owner says No → 200, the same payment.
* **m3 fixed:** the Waiting answer now tells the truth ("cancel it and make it again once the details are in").
* **m4 and m5:** open, as the builder chose. To move is not counted in the held answer, and a CAD/USD race on one reference is not warned. Both are Minor.
* **m6:**
  * The "of any role" half is closed (see M2).
  * n1 and n4 from round 3 are still open: `companyId` is never used in the check.
  * Probe: a company with PA's case → 422, which is correct.
* **Also new and correct:**
  * A changed replay gives 409 KEY_USED (probe: a different reference).
  * Look-alike references count as duplicates: full-width, zero-width and no-break space. The check case l. 208-210 fails under break B6. `textOk` already refuses zero-width characters, so that part is belt and braces.

## Planted breaks (scratch copy only; each restored and diffed against the worktree)
| Break | Result |
|---|---|
| B1 scope check removed | red (M1 case, DW6) |
| B2 client match removed | red (M1 case, DW6) |
| B3 request-case check removed | red (M1 case, DW6) |
| B4 party-wide running balance | red (DW10 M2) |
| B5 order by `created_at` | red (slow writer) |
| B6 `lower()` only | red (look-alike) |
| B7 trust-off before replay | **green** |
| B8 changed-replay comparison removed | **green** |
| B9 TOO_LARGE mapping removed | **green** |
| B10 cursor range removed | **green** |

## The test-only commit 510a9d2a7 (Lead 10's rulings): stricter, nothing weakened
* **Field errors are exactly 422.** `fieldError` no longer takes 400. CARD and CARD_TERMINAL must now be 422; 409 is no longer accepted. This closes round 1's M7 question. Every edited assertion is stricter than before.
* **C5 is pinned on balances and on the request read** (l. 304-310):
  * user-O, who sees neither PA nor PA's case, gets no balances and no totals. Both lists default to `[1]`, so a missing key fails the case rather than passing it.
  * Reading r1, the same officer gets 404.
  * The Owner gets PA's CAD figure and reads r1.
  * The team-member case now also requires every balance row to be on CASE.
* **Planted break:** I removed `seen()` from the balances query and the request read in a scratch copy. 49/3: both new fail cases and the team-member case turn red. Restored afterwards.
* **Lead 10's rulings close two of my open points:** the evidence-key migration is accepted, and the direct read of `runtime_case`/`case_client` is accepted for part 1 with a follow-up row for a port method. **n6 is therefore closed.** The rulings also confirm that C5 covers the balances and the request read.

## New findings
**Minor**
* **n5, `reads.ts:65`: with no currency filter, `seq desc` interleaves the currencies by sequence number, not by time.**
  * Probe: the USD deposit made mid-run lists last, below the oldest CAD entry. So "newest first" holds only within a currency.
  * The DW6 test reads a CAD page only.
  * **Fix:** order `currency, seq desc` (one block per currency, matching the per-currency balance), or require `currency`.
* **n6, `service.ts:202-203`: client money reads `runtime_case` and `case_client` with plain SQL.**
  * This is the builder's question. Today only the port adapter (`visibility-adapter.ts`) reads case tables from client money, plus FO-9b's merge columns.
  * The read is firm-scoped through `rc.firm_id` and imports no case-side code. Contract §1 rule 4 is about imports, so the rule's letter holds. But FO-7t.md says the case check "reaches it through a port (Contract gap)".
  * **Recommendation:** accept it for now, and record it as a Contract gap in `MODULE.rows/FO-7t-1.md`, which lists neither table. (Ruled by Lead 10: accepted for part 1, follow-up row for a port method.)
  * The lasting form is a port method, such as `MoneyVisibilityPort.partyOfCase`. That is Lead B's call, because `ports/` is outside this row's touch list.
* **n7 (check):** four of the round 1 fixes have no test that fails without them (B7-B10 above):
  * the replay checked before trust-off;
  * the changed replay → KEY_USED;
  * TOO_LARGE;
  * the cursor range.

  My probes show the behaviour is right today. **Fix:** one case each for m2 and KEY_USED, at least.
* **Process (not a defect):** about 832 code and test lines, over P-610's 800. The builder raised it on the PR; the tech lead rules, by splitting or by accepting.

Journey score: it moves from 7.5 to 8.5/10 (pass, no 0). Correct data, error recovery and next step all go up to 1; the two screen criteria stay at ½. Not re-walked beyond the probes.

**Verdict: Approve** 510a9d2a7ebd934b3145aaf8cde5a61f75a1b387. Lead 10 has ruled on the migration and on n6. Still open, at the builder's choice: n5 and n7, plus m4, m5 and round 3's n1 and n4. The tech lead rules on the 800-line point.

---

# Build round 1 (60ae8f158, the whole build)

Build round 1 verdict line: `Reviewer: Block 60ae8f158b6fa3109767112a70a8e67c9e7b7637`

Reviewed 23 Nov by the Opus 5.5 reviewer that approved the check in rounds 1-3. Worktree `/home/user/fo7t`, PR #3033 (draft). I read the PR diff against `origin/main` (`f850b6ff5`), the brief `track-b/FO-7t-1.md` and part 1 of `FO-7t.md`, `ports/money-visibility.ts` and its adapter, FO-7b's `invoices/money.ts`, and the trust trigger in `20261122170000_fo7ts_part3`. Line numbers are those at `60ae8f158`.

**Runs (mine, scratch databases on :54329 named by pid, all dropped; :4400 not touched):**
* `check_fo7t_trust` 44/0, twice: once as is, once inside my probe copy (built in the scratchpad, see below).
* `check_fo7a_money_schema` 122/0.
* `check_ports_events` 31/0.
* `pf8b_f4` 9/9.
* `typecheck.mjs`: no new errors (15 known).
* `pf8b_f7`: only its text half ran (4 PASS). This machine has no PostgreSQL 18 `initdb`, so the throwaway-cluster half failed to start. **Not verified here:** F7's database half.
* I did not re-run fo7b, fo7mv, pf12 or module-cards.

**Verdict: Block (in the skill's terms, Ship after fixes).** The money core is right. Two Majors are open, both small to fix:
* M1: a case id is never checked.
* M2: the running balance leaks past C5.

## Changes to the approved check (cf0f8cd6e → 60ae8f158): honest, no assertion weakened
* **(a) Event import:** honest. `TRUST_EVENT` lives in `ports/events/client-money-trust.ts`. `ports/events.ts` is frozen, and `check_ports_events` 31/0 confirms the folder rule. The two DW18 assertions are unchanged.
* **(b) C5 under MoneyVisibilityPort: a faithful model, not a rigged one.**
  * Under CS-MV1 on main, a party with no prospect and no case is seen by nobody. So without the prospect, even the Owner would read an empty ledger, and DW6 and DW10's positive half could not pass on a correct build.
  * PF-3 (`20261114015002`, l. 605, 985) gives CASE_OFFICER both `view.all` keys. While it keeps them, "a Case Officer who cannot see a case" cannot exist.
  * The test takes away only the two `view.all` keys. CASE_OFFICER keeps `agent/case:view.own` and `agent/prospect:view.own` (l. 611, 991), so user-O's empty page comes from the real own-scope path: no team, no prospect.
  * The same narrowing is already used by `check_fo7q_reads.ts` l. 227-230, `check_css1_search.ts` l. 176 and journeys j_6 and j_30.
  * The `session_replication_role = replica` inserts for case, client and prospect follow precedent (`check_csc1_*`, `check_aud1*`).
  * The assertions are unchanged, and they now exercise the real adapter instead of a stand-in, so the check is stronger.
  * **C5 gating balances and the request read is right.** A balance is the same money as the ledger, and a request names the party, the case and the amount. Lead B's ruling (#1878, comment 6901029156) is that a ledger is visible exactly when its case, or its party with no case, is visible. Leaving either read ungated would leak what the ledger hides.
  * Residual (m6): only the Owner is shown seeing the entries. DW10's "of any role" half is unproven.
* **(c) `fo7t-d1` → `fo7t-dep1`:** honest. Both the zod rule (`service.ts:48`, 8-200) and `money_payment_key_check` refuse a 7-character key. This was a harness error that rounds 1-3 missed, and the assertion is the same.

## Migration 20261123030000_fo7t1_evidence_key: verified, correct
* **The claim holds.** On PostgreSQL 18.3, `select 'a' ~ '^…{0,299}$'` fails with "invalid regular expression: invalid repetition count(s)". A table with that check takes a null and errors on any value. So FO-7a's check (`20261115042334`, l. 600) refuses every non-null key with an error, never a check violation.
* **Equivalent.** `char_length <= 300 AND ~ '^[A-Za-z0-9][A-Za-z0-9/._-]*$'` accepts exactly the strings of 1-300 characters, first a letter or digit, then the same class. I probed 300 characters → t; 301, '', '/x', 'a b', a newline and 'aé' → f. The class is ASCII, so characters equal bytes.
* **F4/F7 compliance.** Only `ALTER TABLE … DROP/ADD CONSTRAINT`: no data statement and no owner change. Validation scans the rows unfiltered by RLS, and no row can hold a key.
* **Stamp and rollback.** The stamp `20261123030000` follows main's newest, `20261123020000_fo7g3_bill_to_province`. Round trip on a scratch database: migrate gives the new definition; `rollback.sql` restores FO-7a's text exactly and removes the `_prisma_migrations` row (12 of 15 rollbacks do the same); re-applying works.
* **Process (not a defect).** The brief said "No migration". The builder asked openly as PR Question 1 instead of widening silently. The label waits on Lead B's acceptance.

## Findings
**Major**
* **M1, `service.ts:35, 103, 165-170, 181`: `caseId` is never checked, so trust money can be recorded where nobody, the Owner included, can see it.**
  * Probe: the Owner's deposit of CAD 777.00 on a case id that does not exist → 201, an R- receipt, the receipt email and the event. The Owner's balances stay CAD 1,345.00 while the party's entries sum to CAD 2,122.00, and the entry is absent from the ledger (`seen()` matches no visible case).
  * A request on such a case (→ 201 Sent) is likewise unreadable through `GET /requests/:id`.
  * The same path takes another firm's case id, or a case of another client. A deposit's `caseId` may also differ from its request's (`:170`, `??=` keeps the given one).
  * This breaks DW6 ("per-case balances plus before-a-case equal the party's"). It is also the only money writer that takes a case id from the body: FO-7b never does.
  * **Fix:** refuse a `caseId` that is not in `scopeOf(ctx).cases`. That proves the firm and that the case exists, and it fails closed. Name the case-to-party match as a Contract gap for Lead B. On a request deposit, refuse a `caseId` that differs from the request's. Add one fail case to the check.
* **M2, `reads.ts:57-64`: the ledger's `balanceAfterMinor` is the party-wide running balance, so it discloses money the caller may not see.**
  * Probe: user-O put on the case's team (`case_team_member`) sees one entry of 300.00 with a running balance of 1,225.00, while `GET /balances` tells them 300.00.
  * The pre-case 925.00 is outside their C5 scope but readable from the column.
  * With `caseId=` the column is still the party's balance, not the case's (AG-6-60 rules 1-2: a balance per case).
  * **Fix:** compute the running balance over the rows the caller sees and the filters in force (a window sum per currency in `seq` order over the visible, filtered set, before paging). Or withhold the column when the scope does not cover every entry of the party, or when a case filter is set. Pin it in the check with the team-member officer (this also closes m6).

**Minor**
* **m1, `reads.ts:56, 62`: newest-first ordering uses `created_at`, which is the transaction's start time (`NEW.created_at := now()`, fo7ts_part3 l. 372).**
  * A deposit that waited on the party lock can carry an earlier time but a higher `seq`, so two rows of one party and currency can show out of balance order.
  * Paging stays lossless: my probe walked pages of 3 and got every visible row once.
  * **Fix:** order by `seq` within a party and currency.
* **m2, `service.ts:155` vs `:158`: `trustOn` runs before the replay check.** After Yes → No, a retry of a deposit already recorded answers 409 TRUST_OFF (probe), not 200 with the payment. FO-7b checks the replay first. **Fix:** look the key up before `trustOn`.
* **m3, `service.ts:110`: "this request is saved and is sent once they are filled" promises a send that nothing performs.** No route or job sends a Waiting request (grep). **Fix:** say what the person does, or drop the promise until part 4.
* **m4, `service.ts:89, 228-233`: the Yes → No answer counts balances only.** With only To move lines open, trust stays visible (`trustShows`), but no amount or message is answered. FO-7t.md part 1 says "while any balance or open To move line exists". The builder disclosed this. **Fix:** add `money_to_move`'s open totals per currency, or record the ruling.
* **m5, `service.ts:157, 174-176`: the duplicate-reference check runs under the party-and-currency lock.** One reference raced in CAD and USD on one party gives two 201s with no warning (probe). The same currency is warned correctly. This is a Nit.
* **m6 (check):**
  * DW10's "a person who can see the case, of any role, gets it" is shown only for the Owner.
  * Round 3's n1 (the trust-off request read probes an id that does not exist) and n4 (`companyId` unused) are still open, though the PR said they would be tightened.
  * My probes show the build behaves correctly: an officer on the team gets the case's entry; a real request read is 404 with No and nothing held; a company deposit gets 201 and `NO_ADDRESS` with no primary contact.
  * **Fix:** add these three probes to the check.

**Held, as asked:**
* **Deposit:** the DEPOSIT entry, the TRUST receipt (via `trust_entry_id`), the audit line and the event are written in one transaction under `money_trust_lock` (`:154-189`).
* **Replays:** a replay of one key is one payment, concurrently too: the lock serialises it, and a P2002 on another party is retried into KEY_USED (`:136-140, 203`).
* **Card and duplicates:** `CARD` and `CARD_TERMINAL` are refused by zod (`:39, 45`). A duplicate reference answers 409, and records on confirm.
* **Answers and keys:** the Owner-only 403 (`:80`). The keys are `agent/payment:record` on writes and `agent/invoice:show` on reads (`routes.ts`). Everything is firm-scoped, and firm B gets 404 on firm A's records.
* **Mail and numbering:** the mail goes to the party with no Cc, and every message has no link and no "card" (probe: 0 of each). DR- and R- come from the database.
* **Reads:** the status is derived. Paging is 50 by default, 200 at most, and walks by cursor. Currencies are never summed. The payload holds ids, amount and currency only. Ledger payer = party name, as noted.
* **Not findings:** the replay ignores `reference`, as FO-7b's does (`money.ts:86`). The trust-off-with-money-held case is 409 for new writes and 200 for reads.

## Scores and scope
* **D1:** 4 (M1).
* **D2:** 3 (M1, m5).
* **D5:** 4 (m2).
* **D10:** 4 (m3).
* **D11:** 5.
* **D15:** 5 (one query per read, no per-row requests).
* **D16:** 4 (a pass and a fail per DW, but m6).
* **D18:** 5 (Sample wording, "Unconfirmed: no counsel", the database's words).
* **N/A:** D3, D4, D6, D7, D19 (no content or rule change) and D8-D14 (no screen).
* **D17/D20:** simulated only.
* **BIC-01-20:** N/A (API only, no case-side screen).
* `graph.mjs` was not run: it rewrites `qa/GRAPH.md`.

## Journey score (reviewer role, API only, simulated): 7.5/10, below the pass bar, no criterion at 0
Report: `journey-test-reviewer-2026-11-23.md`.
* **Correct data ½:** M1 and M2.
* **Error recovery ½:** m2.
* **Next step ½:** m3.
* **Accessibility ½ and visual quality ½:** no screen.
* **Every other criterion 1.**
* Fixing M1 and M2 raises correct data to 1, giving 8/10.

**Verdict: Block.** To fix: M1 and M2 (the Minors at the builder's choice, m2 and m6 recommended). After the fix, a diff-only re-review.

---

# Round 3 (diff only, 0243e27a7 → cf0f8cd6e)

Round 3 verdict line: `Reviewer: Approve cf0f8cd6ec0eb04c921b758b0075c1d4eb4e2214`

Read diff-only on 22 Nov by the same reviewer (only `tests/check_fo7t_trust.ts` changed under `tests/`). I did not run the check.

**Verdict: Approve.** The check is the right specification to build part 1 to. No Blocker or Major is open.

* **N1 fixed (l. 175):** the concurrent replay now sends `WIRE 1500` twice with the key `fo7t-replay`, with no reference and no trust request. So the duplicate-reference rule cannot fire. "200,201" with one payment is what a correct build answers: FO-7b checks the replay first, and a build has to turn the unique `(firm_id, idempotency_key)` race into a replay. Knock-on effects checked:
  * r1 stays at its 600.00, so Paid.
  * The duplicate case (l. 179-183) still finds d1's `ET-0001`.
  * The receipt series check (l. 199-200) and the DW6 sums, held amounts and DW18 counts all read the database, so the extra 15.00 deposit keeps them true.
* **n2 fixed (l. 160-161):** a request on another firm's person must now be 404, as DW10 and the firm-B wall (l. 250) say.
* **n3 fixed (header l. 22):** the contract now states that a cheque's TRUST receipt says "Not yet cleared" on the PDF and in the email text, and that the check reads the text. The rule is pinned openly, not left implicit.
* **Still open, as the builder chose: n1** (the trust-off 404 on `GET /requests/:id` is probed with an id that does not exist) and **n4** (`companyId` is never used; nothing confirms that no receipt number or event was taken after the cancelled-request refusal). Both are Minor, and the build's review may pick them up.
* **Still open from earlier rounds:** the 400-vs-422 question to the tech lead (M7) and Lead B's confirmation of `trust.request_sent` (M8). Both are rulings, recorded in the header.

Journey score: still not applicable, because no route or screen is built at this head.

---

# Round 2

Round 2 verdict line: `Reviewer: Block 0243e27a7bd7d7192f9ca74bca2d04e127348044`

Read diff-only on 22 Nov by the same reviewer, against the round 1 findings below and against the FO-7b payment code on #2953 (`invoices/money.ts`: the replay is checked before the duplicate reference). I did not run the check. Line numbers are those of the file at `0243e27a7`.

**Verdict: Block.** All of round 1's Blockers and Majors are fixed. But the rewrite added one assertion that a correct build cannot pass (N1). The fix is one line. The open Minors (n1-n4) do not block.

## Round 1 findings against the new text
* **B1 fixed:** `receiptsOf` (l. 108) and the DW5 sweep (l. 191) join `money_receipt.trust_entry_id` to the DEPOSIT entry, with `kind = 'TRUST'`.
* **B2 fixed:** l. 130 reads `detail->>'answer_before'` / `'answer_after'` and the actor, filtered by firm A. The header (l. 29) names the audit actions and the shape.
* **M1 fixed:** firm B answers YES (l. 120) before the walls (l. 249-256). The request read, the cancel, the deposit and the request on firm A's client must each be 404. Only the ledger and balances may be empty, and never with totals.
* **M2 fixed, with a residual (n1):** the stand-in is gone. NO with nothing held is tested (l. 118-119). The YES read (l. 121) proves the ledger's 404 meant trust off.
* **M3 fixed:** `GET /requests/:id` is read for Part paid, Paid with "CAD 20.00 more than requested", r1 Paid and r2 Cancelled (l. 224-229).
* **M4 fixed:** a receipt email is found by its attachment filename `${number}.pdf`, an exact match, so `DR-0001.pdf` can no longer match. The match must exist (`!!etMail`, l. 195).
* **M5 fixed:** the refusal case is now a deposit on cancelled r2: 409, no row, no audit line (l. 230-232). A build that pre-checks the cancel in TypeScript never reaches the database, but a test cannot force that, so this is accepted.
* **M6 fixed:** a Case Manager and a Case Officer get 403 on a request and on a deposit (l. 139-140, 164-165).
* **M7 fixed:** `fieldError` accepts 400 or 422. CARD and CARD_TERMINAL accept a field error or 409. The header (l. 26-27) records the newer PF-28 ruling and the question to the tech lead.
* **M8 fixed:** `trust.request_sent` is no longer asserted. The header (l. 8-9) says why.
* **m1:** fixed (migrations and imports are inside `try`; the scratch database is dropped in `finally`).
* **m2:** fixed (one line per request and per cancel; every `trust.%` line has a `staff:` actor; the dead code is gone).
* **m3:** fixed (both emails are checked to go to `fo7t.a@example.org`).
* **m4:** fixed (the receipts are raced on PA and PC, and the series is checked for gaps and repeats). The added concurrent replay is broken: see N1.
* **m5:** fixed by the header (l. 20, 25). No company case was added (n4).
* **m6:** fixed (CARD_TERMINAL is tested).
* **m7:** fixed (pageSize 200 is accepted; `held[].cases` is checked to be an integer; the header gives the reason for the non-Owner read).
* **m8:** fixed (l. 205).
* **m9:** fixed by the header (l. 21).
* **m10:** fixed (a request on another firm's person, l. 158-160; the invoice-read deferral is stated, l. 7-8).
* **m11:** fixed (the comment at l. 43; `EVENT` is read loosely).
* **DW ordering:** firm B's two `trust.answered` lines (NO, then YES) are kept out of firm A's counts (l. 126, 130, 245). The firm-wide `staff:` sweep (l. 263) still holds, because firm B's lines are written by its staff.

## New in the rewrite
* **N1, Blocker, l. 174-175: the concurrent replay reuses d1's reference.** `raced` spreads `d1body`, so it sends `reference: "ET-0001"` on PA with a **new** key. The header (l. 20) defines a duplicate reference as any trust deposit of the same party with that reference. FO-7b, the pattern, checks the replay first and the duplicate second. So a correct build answers **409 DUPLICATE_REFERENCE to both calls**, while the check expects "200,201". It also sends `trustRequestId: r1`, which would put a second 600.00 on r1 if a build let it through. Fix: `dep({ method: "WIRE", amountMinor: 1500, idempotencyKey: "fo7t-replay" })` twice at once, with no reference and no request. The later sums (l. 211-213, 219, 238) read the database, so they still hold.
* **n1, Minor (the residual of M2), l. 112:** the trust-off probe of `GET /requests/:id` still uses an id that does not exist, so its 404 would be the same with trust on. The route now exists (M3), but nothing shows it refuses while trust is off. One way: firm B creates a request while YES, answers NO (nothing is held, since a request is not money), then reads it and cancels it → both 404, then answers YES again. Its audit lines stay out of firm A's counts.
* **n2, Minor, l. 158-160 vs l. 250:** a request on another firm's person accepts "404 or a field error", but the same write from firm B's side must be 404. DW10 says 404. Make both 404, or allow the same codes in both places.
* **n3, Minor, l. 194-195:** "Not yet cleared" is required in the email's subject or text. The brief puts it on the receipt, and FO-7b checks it in the receipt PDF's text. Either read the PDF text the way FO-7b does, or state in the header that the email text carries it too.
* **n4, Nit:** `companyId` is in the contract but never used. No receipt number or event is asserted after the cancelled-request refusal (l. 232).

Journey score: still not applicable, because no route or screen is built at this head.

---

# Round 1

Round 1 verdict line: `Reviewer: Block 6b67dcf31f3af6bf64594dfcd3d6baaf9c88a9a6`

# FO-7t part 1, check-first review: `tests/check_fo7t_trust.ts` read as the specification

Reviewed 22 Nov by an Opus 5.5 reviewer that did not write the check. Head `6b67dcf31` (branch `claude/runtime-fo7t-part1`, PR #3033, draft). I read it against `briefs/track-b/FO-7t-1.md` (on `lead-b/2026-11-22-track-b`), `design/briefs/FO-7t.md` part 1 and DW1-DW6, DW10 and DW18 (on `main`), FO-7b's harness `tests/check_fo7b_invoices.ts` on #2953 (`bb83bcec7`), `prisma/schema/client-money.prisma`, and the FO-7a, FO-7ts and PF-3 migrations, `ports/audit.ts`, `ports/mail.ts` and `api/src/platform/http/input.ts`. I did not run the check (as asked). Port 4400 and other checkouts were not touched. Line numbers are those of the check file.

**Verdict: Block (Rework of the check, not of the design).** The route contract mostly matches the brief, and most DW cases have a real pass. But no correct build can pass this check. Two of its SQL reads name a shape that the schema forbids: B1 makes a correct build fail, and B2 throws and aborts the run. Several of its "fail" halves are also vacuous, so a wrong build passes them. Every fix below is in the one test file, and a re-review needs only the diff.

## Blocker

* **B1, lines 151 and 168: the TRUST receipt is looked up by `payment_id`, which FO-7a forbids on a TRUST receipt.** `money_receipt_kind_check` (migration `20261115042334`, l. 613-615) is `kind = 'TRUST' AND trust_entry_id IS NOT NULL AND payment_id IS NULL`, and `money_receipt_write` requires `trust_entry_id` to name a DEPOSIT entry. So `count(*) from money_receipt where payment_id = <deposit's payment>` is always 0 on a correct build: DW4's pass (l. 151 expects 1) and DW5's "exactly one TRUST receipt per deposit" (l. 168 expects every TRUST payment to have 1) can never pass. Fix: join through the entry, `money_receipt r join money_trust_entry e on e.firm_id = r.firm_id and e.id = r.trust_entry_id where e.payment_id = …` (and `r.kind = 'TRUST'`).
* **B2, line 115: `audit_event` has no `before`/`after` columns.** AuditPort's adapter (`api/src/platform/audit/audit-event.ts` l. 61, `ports/audit.ts` `flattenValues`) writes them into `detail` as `<field>_before` / `<field>_after`. psql errors on `min(before->>'answer')`, the `try` catches it, and the run ends at DW2. Fix: `detail->>'answer_before'` / `detail->>'answer_after'` (or the field name the header pins, e.g. `trustAnswer_*`), and state that field name in the header.

## Major

* **M1, lines 211-215 (DW10 walls are vacuous).** Firm B (`sample-solo`) is still UNANSWERED, so every one of its trust routes answers 404 because trust is off, not because of the wall. Also, `(r.body.items ?? r.body.balances ?? []).length === 0` accepts a **200 from `GET /requests/:id` or `/cancel` carrying firm A's request** (that body has neither key, so the length is 0). A leaking build passes. Fix: have firm B's Owner (`tS`) answer YES first. Then require 404 for the request read, the cancel and the deposit, and allow "200 with an empty page" only for the ledger and balances.
* **M2, lines 97 and 103-104 (DW1).** `GET /requests/${PA}` asks for a request id that does not exist, so it is 404 with trust on or off. The DW1 "fail (stand-in)" is a constant (`planted404` always returns 404) plus a repeat of the pass. DW1's "UNANSWERED **or NO**, nothing held → 404" is never tested for NO. A build that 404s only on UNANSWERED passes. Fix: probe a real request id (create it in firm B after YES, or reuse r1 after a NO on a firm with nothing held). Probe `/cancel` too. Add the NO-with-nothing-held case (firm B: NO → all 404 → YES for M1). Delete the stand-in.
* **M3, `GET /trust/requests/:id` has no pass anywhere.** It is only asked where 404 is expected (l. 97, 211), so a build that never registers the route passes every assertion. The brief's derived status (`Sent | Part paid | Paid | Cancelled`, "CAD 200 more than requested", AG-6-61 rule 8) is likewise untested. Fix: after d1 (60,000 on r1's 60,000), `GET /requests/r1` → 200, `Paid`. Read r2 → `Cancelled` with its number. A second deposit on a request → the extra noted.
* **M4, lines 172 (DW5 "an e-Transfer's receipt does not say Not yet cleared" is vacuous).** `mail.sent.find(m => JSON.stringify(m).includes(d1.body.receiptNumber))` looks for `R-0001`, and r1's request email (sent earlier) contains `DR-0001`, which includes `R-0001`. It also passes when nothing is found (`?? ""`). Fix: find by attachment filename `${n}.pdf` or subject (as FO-7b does, `subject.startsWith("Receipt …")`) and require that it was found.
* **M5, line 222 (DW10 "a rollback leaves none" is not a rollback).** A CARD deposit is refused at the input check, before any transaction opens. A build that writes its audit line outside the transaction still passes. Fix: use a write that the **database** refuses inside the transaction after the route's checks pass, e.g. a deposit on cancelled r2 (`money_payment_write`: "only a sent, not cancelled, trust request takes a payment") or USD on a CAD request. Then assert no audit line, no payment, no entry, no receipt number taken, and no event.
* **M6, keys are never tested (task (b); brief rulings: requests and deposits `agent/payment:record`, ledger `agent/invoice:show`).** Per PF-3's grants, Case Manager (user-T) and Case Officer (user-O) lack `agent/payment:record`, but no case posts a request or deposit as them. A build that puts deposits under `@AnyStaff` passes. Fix: user-T or user-O `POST /requests` and `POST /deposits` → 403, nothing written. Name the keys in the header contract.
* **M7, status codes pinned against PF-28's standing rule (lines 111, 133, 139, 144, 196, 222).** On `main`, a field error is `FIELD_ERROR_STATUS` = **422** (Lead B rev 17.21, `api/src/platform/http/input.ts`; 400 only for an unparseable body). FO-7b answers 422 for CARD and for a missing key (#2953, its P case). The check demands 400 for a bad answer, no party, cancel without a reason and page size 500, and `[400, 409]` for CARD, which excludes FO-7b's own 422. FO-7t.md's "→ 400" (16 Nov) predates rev 17.21. The check must not settle that conflict silently (AGENTS rule 2). Fix: follow the newer ruling, 422 (or accept `[400, 422]` where the brief says 400) and say so in the header, or put a "Question for the tech lead" on the PR.
* **M8, lines 226 and 233 (`trust.request_sent` contradicts FO-7t-1).** FO-7t-1's touch list allows `ports/events.ts`: "the `trust.deposited` line and its payload type **only**". FO-7t.md marks `trust.request_sent` as "proposed here, Lead B confirms", and Lead B's part-1 brief leaves it out. DW18 names only `trust.deposited` (and later parts' events). Fix: drop the two `TRUST_REQUEST_SENT` assertions, or keep them only behind a written Lead B confirmation cited in the header.

## Minor

* **m1, line 61:** the feature is imported before `try`. While it does not exist (red by design), each run leaves `xr_studio_fo7t_scratch_<pid>` behind. Fix: import inside the `try`.
* **m2, lines 219-221:** `failMail >= 0` is always true, and the `update … trust_details = null` is dead. `request_created + request_sent >= 3` allows a request to write two lines. Fix: one line per request (`=== 3`, or per id), and the actor `staff:%` on every `trust.%` line (FO-7b l. 236 does this).
* **m3, DW3/DW5 recipient:** neither email is checked to go **to the party** (`fo7t.a@example.org`). Fix: `mail.inbox(...)`, as FO-7b does.
* **m4, line 173:** both "at the same moment" deposits are on PA/CAD, so FO-7a's party lock serialises them before the receipt is numbered. Fix: use PA and PC (PC is created and unused) so the series itself is raced. Also add a concurrent idempotency replay (FO-7b's double click, l. 294).
* **m5, lines 17-19 vs the brief:** the brief writes `?party=&case=&currency=` and the check uses `personId=&caseId=`. Either follow the brief, or state why (person vs company) and add one company case. The duplicate-reference scope (same party, any request, case-insensitive like FO-7b's `lower()`) is pinned at l. 155 but not stated in the header: state it.
* **m6:** CARD_TERMINAL into trust (refused by the database since `20261118200100`) is not tested. Fix: expect a 4xx, never a 500.
* **m7:** DW6 tests 500 → 400/422 but not the 200/201 boundary. Line 116 pins a non-Owner `GET /answer` → 200, while the brief puts both answer routes under the Owner-only marker. The reading is reasonable (AG-6-59 rule 3's "Ask <Owner>…" needs it), but say so in the header. `held[].cases` and "for 1 case" are in the contract but not asserted.
* **m8, lines 180-181:** the case and USD deposits' statuses are not asserted, so a refusal surfaces later as a confusing DW6 failure. Assert 201.
* **m9, DW4 evidence:** the route stores any caller-given key. How the key comes from `FilesPort` (e.g. the firm's prefix, or that it exists in the files fake) is not pinned. Ask or pin it.
* **m10:** a request or deposit naming another firm's person (PB is created and unused) is not refused anywhere ("never a prospect" is only "no party → 4xx", l. 138). DW1's "an invoice read names no trust field" is left out without saying so: state that it is FO-7b's (part 1 may not touch `invoices/`).
* **m11, line 33:** `EVENT` comes from `ports/events.ts`, which FO-7b calls frozen until #2919 (FO-7b uses `MONEY_EVENT` in `ports/client-money.ts`). Make the import follow wherever #2919 puts client money's names, as FO-7t-1 says.

## Contract match (task (b)), in short
Met: Owner-only PUT (403 for a non-Owner), Yes→No → 200 with held per currency and never 409, DR- from the database at send, no link and no "card" in the request email, empty trust details → stored unsent with "Add your trust payment details", CARD refused, idempotent replay, duplicate reference → 409 then recorded on confirm, "Not yet cleared" on a cheque's receipt, ledger default 50 / maximum 200, newest first with running balance, currencies never summed, C5 fail-closed (Case Officer gets an empty page), `trust.deposited` once per deposit with ids, amount and currency. Broken or vacuous: TRUST receipt per deposit (B1), audit old and new (B2), 404 when off (M2, M3), walls (M1), rollback (M5), keys (M6).

## Journey score
Not applicable: there is no screen or built route at this head (one test file, red by design, and I was asked not to run it). So there is no journey-test report and no score for this round; the journey belongs to the build's review.

## Could not check
I did not execute the check (as asked). Lead B's confirmation of `trust.request_sent` and the 400-vs-422 question are rulings, not facts I can verify here.
