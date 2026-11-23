# Break report: FO-7t part 1, trust on and money in (R1.58, PR #3033)

Breaker (money, schema), 23 Nov. Head `60ae8f158`, branch `claude/runtime-fo7t-part1`, worktree `/home/user/fo7t`. Scope: part 1 of `design/briefs/FO-7t.md` and the brief's breaker list, adapted to part 1. Nothing was fixed or committed.

**How:** a harness copied from `tests/check_fo7t_trust.ts` (the same Nest app, PF-4 guard, PF-12 walls, fake mail). It runs on scratch databases `xr_studio_fo7t_{break,brk2,mig}_<pid>` on 127.0.0.1:54329, each dropped at the end (none are left). It never uses :4400. Runs:
`tsx --tsconfig studio/api/tsconfig.json break_fo7t.ts`, then `break2.ts`, then `bash mig.sh`. These three are scratch files and are not committed.
The same runs used `tests/check_pf8b_f6_pg18_nobypass.ts 15561` and `tests/check_pf8b_f7_data_walls.ts 15571` (throwaway PG18 clusters, removed afterwards) and the PR's own `tests/check_fo7t_trust.ts`.

## Findings

**Major 1: the ledger's newest row can show an old balance, and running balances appear out of order.** `reads.ts:62` sorts by `e.created_at desc, e.seq desc`. `created_at` is the transaction's start time, but `seq` and `balance_after_minor` follow the order in which writers took the party lock. A writer that began first and took the lock second therefore sorts below a newer balance.
* Through the route: 25 deposits at once on one party gave 2 rows where `created_at` and `seq` disagree. `GET /ledger` then listed the running balances out of order (`runningBalanceMonotone: false` on all-positive deposits).
* Made certain: one writer runs as xr_app with the route's own statements (begin, lock, payment, DEPOSIT, receipt). It begins first. A route deposit of 100.00 begins later and commits first; the first writer then adds 200.00 and commits. `GET /ledger?pageSize=1` shows the newest row's balance as **10000**, while the database holds **30000**. The rows are `…50.589Z 10000 bal 10000`, then `…50.526Z 20000 bal 30000`.
* Expected: newest first in each party's lock order, so the newest row carries the current balance (AG-6-60 rule 6, Code s. 32(d) as FO-7a reads it).
* The `after` cursor (`reads.ts:56`) uses the same key, so paging is consistent but in the same wrong order. A fix needs both changed together.

**Major 2: `caseId` is never checked, on a deposit or on a request.** In `service.ts:165` (deposit) and `service.ts:103` (request), any UUID is stored as the entry's or request's case.
* (a) Money nobody can see. A deposit of 50.00 with `caseId` = a random UUID gets 201. The Owner's `GET /balances` then answers `{balances: [], totals: []}`, `GET /ledger` gives 0 rows, and the database holds 5000. A request on such a case is created (201), and its own Owner reads it as 404. Yes → No still counts the money in "held for N cases".
* (b) C5 crossed. A Case Officer is file owner of person P2's case only. Before the attack, their `GET /ledger?personId=P1` gives 0 rows. A deposit for person P1 tagged with P2's case (`caseId` = P2's case) then gives the officer `Brk1 Sample P1-ON-P2-CASE 4242 bal 4242`, and their balances read shows CAD 42.42. That is P1's name, reference, amount and running balance, shown to someone who cannot see P1.
* Expected: the case belongs to the firm and to the named person or company (or the deposit is refused 404/422). A request's case should be checked as well, and a deposit on a request should keep the request's case.

**Minor 1: replaying a recorded deposit after Yes → No.** The deposit key was recorded with 201, then the Owner answered No (money held). The same body sent again returns 409 `TRUST_OFF` with "…Nothing was saved." That is false: the payment exists. `trustOn` (`service.ts:155`) runs before the replay lookup at line 158. A client retrying after a lost answer is told to record the money again. Expected: 200 with the recorded payment.

**Minor 2: a replay with a different body is accepted silently.** The same key with the same money but a different `reference`, `evidenceFileKey` and `caseId` returns 200 with the first payment. The stored values stay `W-ORIG|-`, and the caller is not told its new values were dropped. `service.ts:161` compares method, amount, currency, request and party only. Expected: 409 `KEY_USED` when any stored field differs.

**Minor 3: the duplicate-reference check misses look-alike references.** After `ET 0001` is recorded, `et 0001` and `  ET 0001  ` give 409 (correct). These all give 201 as new references: `ET  0001` (two spaces), `ET0001`, `ET 0001` (non-breaking space), `ＥＴ 0001` (full-width letters) and `ET 0001​` (a trailing zero-width space, which `money_text_ok` lets through when visible text is present). On screen and on the receipt several of these look the same.
The same new reference sent at once in CAD and in USD on one party also records both (201, 201). The check at `service.ts:174-176` spans currencies, but the lock is per currency. In one currency at once it works: 201, then 409.

**Minor 4: two inputs reach a 500 instead of a 409 or 422.**
* `amountMinor: 2147483647` on a party that already holds 1.00 returns 500. So does 0.01 more on a party already at 2147483647. The cause: `balance_after_minor` is int4, the "integer out of range" error does not match the `money_…:` pattern in `write()` (`service.ts:205`), and so it is rethrown.
* A cursor with `seq: 2147483648` returns 500, because `Cursor` (`reads.ts:25`) has no bound on `seq` before `::int`.

**Minor 5: the rollback cannot run once any evidence key is stored.** `rollback.sql` re-adds a check that errors on every non-null key.
* Run as the checks run it (`psql -1 -f`) with one key stored: exit 3, "invalid regular expression: invalid repetition count(s)", nothing changed. Safe, but there is no rollback while data exists, and `rollback.sql` does not say so.
* Run by hand (no `-1`, no ON_ERROR_STOP): the check is dropped and not re-added, the `_prisma_migrations` row is deleted, `/etc/passwd` is then accepted as a key, and re-applying fails (`constraint … does not exist`; `migration.sql` has no `IF EXISTS`).

**Minor 6: text the staff type goes into the request email as written.** A purpose of `Pay by card at https://pay.example.com/x` gives 201, and the DR- email then contains a link and the word "card". The template itself is clean. The brief's "no pay link and no card word" is about the email, so a URL in `purpose` (or `reference`, in the receipt) breaks it.

**Minor 7: the evidence key is not checked against FilesPort or the firm.** `a/../../etc` and `firm/<other-firm>/…` pass both the zod pattern (`service.ts:47`) and the database check, and are stored. Part 1 never reads the key, so nothing leaks today. The first reader of the key inherits the risk.

Note (not breaker scope): the FO-7t-1 brief says "No migration". The PR adds `20261123030000_fo7t1_evidence_key`, and the reason is shown to be real (finding M0 below). The Lead should confirm the deviation.

## Attempts that held
* **Two deposits on one party at once:** 25 at once all 201. `seq` runs 1-25 with no gaps, the last balance equals the sum (2800), and there are 25 receipts.
* **The same idempotency key at once:**
  * Same body ×10: one 201, nine 200, 1 payment.
  * Different amounts ×6: one 201, five 409 `KEY_USED`.
  * Two parties at once: 201 and 409. CAD and USD at once: 201 and 409.
  * The same key in firm A and then firm B: both 201 (keys are per firm, by design).
* **Wrong requests:**
  * Firm A's deposit on firm B's request, and firm B's on firm A's: 404.
  * A cancelled request: 409 `MONEY_RULE`. Another party's request: 422. A USD request paid in CAD: 409.
  * An upper-case request id: handled (201).
  * None of these refusals left an audit line or used a receipt or DR- number (the series moved only for the one success).
* **Written around the route, as xr_app in firm A:** the database refused each of these.
  * An OPERATING payment naming a trust request.
  * An OPERATING payment with a DEPOSIT entry.
  * CARD_TERMINAL into TRUST, with or without a request (`money_payment_card_not_trust`).
  * CARD into TRUST.
  * A TRUST payment without its DEPOSIT entry.
  * A firm B row written from a firm A session (RLS).
* **Yes → No → Yes with money held:**
  * No answers 200 with "CAD 154.04 is held for 4 cases. USD 31.09 …".
  * The reads and a cancel still answer 200, and a new deposit or request is refused.
  * No again (no change) writes no audit line; there are 3 `trust.answered` lines in total.
  * After Yes again, a deposit gets 201.
* **Card and cheque:**
  * `CARD`, `CARD_TERMINAL`, `card` and `Cheque` are all 422.
  * A cheque is stored with `cleared:false`, and "Not yet cleared" is in both the email text and the PDF. An e-Transfer's receipt does not say it.
* **The ledger:**
  * `pageSize=2` over 7 entries: 4 pages, 7 rows, no row repeated.
  * Firm B's cursor used on firm A's ledger only positions the page: firm A's own 7 rows, never a firm B row.
  * Bad cursors (garbage, bad date, `seq` 1.5, an extra key) give 422, and a 100 kB cursor gives 431.
  * `pageSize` 0, -1, 201, 1.5, abc, empty and 1e2 give 422; 1, 200 and `000050` give 200.
  * A repeated `pageSize` or `personId`, both `personId` and `companyId`, neither, EUR, or a bad `caseId` give 422.
* **Balances:** CAD and USD are listed and totalled apart and never summed.
* **C5, keys and walls:**
  * A Case Officer with no case gets an empty ledger, empty balances and 404 on a request.
  * Firm B gets 404 on firm A's ledger, balances, request and cancel.
  * A Case Manager and a Case Officer get 403 on request, cancel, deposit and the answer.
  * No session or a bad token gets 401.
* **Email:**
  * Requests and receipts go to the party only: no Cc or Bcc, no link, no "card".
  * A party with no address gets `NO_ADDRESS`, and the deposit is still recorded.
  * A replay does not send a second email (the mail is idempotent on its key).
* **Text and amounts:**
  * A 501-character purpose, an all-space purpose, a zero-width-only purpose, a 201-character reference and an RTL override are all 422. French and Chinese text gets 201.
  * Amounts 0, -1, 1.5, 2147483648, "100" and null are 422.
  * Malformed JSON is 400.
* **The receipt-number race:** 30 deposits on 30 parties sent together with 30 refused ones. Result: 85 receipts, the highest number is 85, all 85 different, with no gap and no repeat.
* **Audit and events:**
  * One `trust.deposited` audit line for each route deposit (85 of 85), and one event each (86 of 86).
  * Event payload keys are only `amountMinor, caseId, companyId, currency, entryId, paymentId, personId, trustRequestId`. No payload contains a name, email or reference.
* **Migration:**
  * M0: the old check errors on any key, so the reason for the migration is real.
  * Over 500 existing rows: applies with exit 0, validated, all 500 rows kept.
  * Key length: 300 characters accepted, 301 refused. `/abs`, `é`, a space, a newline and an empty key are refused.
  * `psql -1` rollback with no key stored restores the exact old text and removes the migration row. Applying again works, and applying twice works.
  * RDS-shaped runner: `check_pf8b_f6_pg18_nobypass.ts` passed 26/26 ("pf18bk and every later migration apply" as a non-BYPASSRLS, non-superuser owner). `check_pf8b_f7_data_walls.ts` passed 17/17 (the migration has no data statement).
* **The PR's own check:** `check_fo7t_trust.ts` passed 44/44.

Verdict: fail

## Round 2 (head 78277d7ae; verdict for 510a9d2a7)

Head `78277d7ae` holds the fix commit, on top of `795e961ed`. `510a9d2a7` changes `tests/check_fo7t_trust.ts` only (checked with `git diff --stat 78277d7ae 510a9d2a7`), so these results stand for it.
How I ran it: a new scratch harness, `break3.ts`, with the same setup as round 1, on database `xr_studio_fo7t_brk3_<pid>` on :54329, dropped at the end. `check_fo7t_trust.ts` on `510a9d2a7`: 52 passed, 0 failed. The migration is unchanged, so round 1's migration results still stand.

**Round 1 findings, run again**
* **Major 1 (ledger order): fixed.**
  * 25 deposits at once: every running balance equals the database's, they fall strictly from the newest row down, and the newest row shows 2800 (the database says 2800).
  * The slow writer that commits second: the newest row now shows **30000**, the true balance.
* **Major 2 (`caseId`): fixed.**
  * A random case → 404. Another firm's case → 404. P2's case on a P1 deposit → 422.
  * On a request: a random case → 404 and P2's case → 422. P1's own case given in upper case → 201.
  * The Case Officer who can see only P2's case now gets an empty ledger and empty balances for P1. No entry was written on a foreign or unknown case.
* **Minor 1: fixed.** After Yes → No with money held, a replay → 200, a new key → 409 `TRUST_OFF`, and a changed replay → 409 `KEY_USED`.
* **Minor 2: fixed.** Replays with a different reference, evidence key or case, or with the reference left out → 409 `KEY_USED`. The same body, the case left out, or the case id in upper case → 200. The reference typed in lower case → 409 (it is compared exactly; acceptable).
* **Minor 3: partly fixed (see r2-m1 below).** Now refused with 409 as duplicates of `ET-0001` and `CHQ 104`: lower case, outer spaces, NBSP, full-width, ZWSP, ZWJ, BOM, word joiner, U+2011, two spaces, thin space, narrow NBSP, ideographic space and em space.
* **Minor 4: fixed.** `amountMinor` 2147483647 on a party that holds money → 409 `TOO_LARGE`, with the limit stated in words; no row is written and no receipt number is used. A cursor `seq` of 2^31, 0 or -1 → 422.
* **Minors 5-7** (rollback once a key exists, staff text in the email, the evidence key not checked): not part of this round and unchanged.

**New code: what held**
* **Case checks:**
  * A company's case works for the company → 201, and for a request on it → 201. The company's contact person depositing on the company's case → 422.
  * A case whose client has no front-office link yet → 422 (fails closed).
  * A writer who holds `agent/payment:record` but does not see the case gets 404, for a deposit and for a request. On a case they can see → 201.
* **Deposits on a request:**
  * Request on case C: `caseId` left out → the entry is on C. `caseId: null` → 422. Another case of the same client → 422. C itself → 201.
  * Request with no case: a case of the client → the entry is on that case. Left out → no case.
* **Case moved P1 → P2:** a new P1 deposit on that case → 422, and a P2 deposit → 201.
  * Observation, not a part 1 finding: the P1 entry made before the move stays on the case. P2's file owner can then read it in P1's ledger (`BEFORE-MOVE 1111`), which is what "visible when its case is" says. Moving a case is a case-side operation, outside part 1.
* **Running sum:**
  * With a case filter it is that case's balance (CAD 34000 and USD 8000 on c5a, matching `/balances`).
  * A Case Officer on c5a's team only sees c5a's 3 rows with c5a's sums. Asking for c5b gives 0 rows, and balances show c5a only. No hidden amount leaks into a sum.
  * Page 2 carries on the sums from page 1; they do not restart.
* **Cursor `{seq, currency}`:**
  * Walking with `pageSize=1`: Owner 6/6 rows, Owner with the c5a filter 3/3, officer 3/3, none repeated.
  * Tampered cursors → 422: EUR, no currency, `seq` as a string, `cad`, an extra key, `AAA`, an array, null.
  * A `seq` past every row only positions the page; the officer still sees only rows they can see.

**Round 2 findings**
* **r2-m1 (Minor; what is left of Minor 3): references that look the same still slip past the duplicate check.** `refKey` (`service.ts:246`) removes only U+200B-200D, U+2060 and U+FEFF. These pass `money_text_ok` and are recorded as new references, each looking exactly like `ET-0001`:
  * U+00AD (soft hyphen), U+034F, U+2062, U+180E, U+FE0F, U+E0041 (a tag character), U+3164, U+200E (LRM), and U+1680 (PostgreSQL's `\s` does not match it).
  * Near look-alikes also pass: U+2010, the en dash, U+2212, Cyrillic `ЕТ`, Arabic-Indic digits.
  * The same new reference sent at once in CAD and in USD on one party is still recorded twice (201, 201): the lock is per currency, the check is not. In one currency at once: 409, then 201.
* **r2-m2 (Minor): without a currency filter the ledger is not newest first across currencies.** `reads.ts` sorts by `seq desc, currency`, but `seq` counts each currency separately.
  * Deposits made in this order: CAD 1000, CAD 2000, CAD 4000, USD 8000, USD 16000, CAD 32000.
  * The ledger lists: 32000, 4000, 2000, **16000 USD**, 1000, 8000 USD. The USD deposit made fifth is shown below the second and third, and the `at` dates go back and forth.
  * Each currency's running balance is right. Only the order between currencies is wrong.
* **r2-m3 (Minor): a replay answers while trust is off and nothing is held.** All of firm A's money was refunded to zero (written as xr_app) and the answer set to No. Then `GET /ledger` → 404 and a new deposit → 404, but replaying a recorded key → **200 with its receipt (R-0068)**. DW1 says every trust route except the answer is 404 in that state. The replay now runs before `trustOn`, and `trustShows` is not asked on that path.

No Blocker or Major remains. r2-m1 to r2-m3 and round 1's Minors 5-7 are left for the Lead to take or defer.

Verdict: pass

## Diff-only round on c83d2017 (23 Nov 2026)

Scope: only `git diff 0f1acb674..c83d20173`, i.e. the DocumentRenderPort contract run for `TrustDocuments` added at the end of `studio/tests/check_fo7t_trust.ts` (lines 369-373). Tried against the real adapter (temporary edits to `api/src/client-money/trust/documents.ts`, each reverted with `git checkout`) and against look-alike adapters in a scratch script using the exact harness from the diff.

**What held**
* Full check on the local Postgres: 58 passed, 0 failed, including the four `PF-0c DW2 DocumentRenderPort TrustDocuments` lines (3 of 3 cases). `tools/check-port-contracts.mjs`: 0 problems; `--list` names `TrustDocuments` with `tests/check_fo7t_trust.ts`.
* The PDF text reader really reads the amount: it finds all 11 `Tj T*` lines `textPdf` writes, including `Received into trust: CAD 600.00 by e-Transfer on 2026-11-23`. 600.00 and 600.01 give different text. A reader that returns "" turns the contract red.
* Edit E1, rendering fixed text and ignoring the data: **red** (case 2, and case 3 because nothing is parsed).
* Edit E2, accepting unknown templates by falling back to the receipt: **red** (case 3).
* Scratch versions: the order of the data's keys changing the text, an empty content type, the amount dropped, the amount rounded to `600`: all **red**.
* The contract run is outside the database `try` and before the exit line. It counts through the file's own `ok`, so a red case fails the file.

**Findings**
* **d-m1 (Minor): the "Date in the data" case says nothing for this adapter.** Edit E3 removed `RenderData.parse` from `trustText` (`documents.ts:31`). The contract stays **green, 3 of 3**. Yet the edited adapter then accepts `{...receipt, extra: new Date()}`; the real one refuses it with a ZodError. Cause: the contract's probe `{ when: new Date() }` (`ports/contracts/document-render-port.contract.ts`, case 3) has none of the receipt's fields, so `fill` throws "no value for firmName" first. `expectRefused` accepts any error. The JSON check therefore has no test through this run. The real adapter is right today. Fix: a probe built on the harness's data (`{ ...h.data, when: new Date() }`), or a probe in the file itself. The contract file is outside this diff, so this does not block.
* **d-m2 (Minor, note): only `client_money.trust_receipt` goes through the contract.** `client_money.trust_request` (the other entry of `TRUST_TEMPLATES`) is rendered by the same `render`, but no contract case covers it. The harness takes one template, so this is how the contract is built, not a fault in the diff.

The tree was left clean except this file. `screens/FO-7t-1/review.md` already had changes from someone else when this round began; this round did not touch it.

Verdict: pass (Approve)
