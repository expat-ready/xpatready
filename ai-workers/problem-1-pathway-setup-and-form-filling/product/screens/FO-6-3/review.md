# FO-6 part 3 review: retainer signing on the fake vendor (API only)

Commit reviewed: `c1c7d32bd6ba82b618fe080aefbfef729f3dc7ba` (branch claude/jolly-curie-wjyd6o; diff `origin/main...c1c7d32`, merge base `73c4e4dcd`). Independent reviewer (Opus, high, P-303). I did not build this. Spec: brief `098153d17:…/briefs/track-b/FO-6-3.md`, BACKLOG row FO-6, part 1's review (m10, "plain uuids").
The head moved to `e8dc29499` (the breaker's fixes) while I was reviewing. I did not review that commit. A quick read shows it does not touch R-M1 to R-M3 below.

**Reviewer: Changes c1c7d32bd6ba82b618fe080aefbfef729f3dc7ba**. Skill verdict: Ship after fixes. **Verdict: Block** on the Majors below.

## What I ran
* `tsx --tsconfig api/tsconfig.json tests/check_fo6_signing_api.ts`: **37 passed, 0 failed** (local PostgreSQL :54329, about 5 s).
* The Done-when suites, unchanged, all exit 0: check_fo6_signing 47/47, check_fo6_signing_port 16/16, check_fo5_retainers 248/248, check_fo5b_retainer_checklist 28/28, check_pf12_walls 110/110.
* The three edited sweeps: pf12b_bypass_audit 70/70, pf6b_permission_rules 34/34, fo2w_won_event 19/19.
* 36 other sweeps over api/src that select-suites names. They pass except as listed in R-M2 and R-M3. aud1a, csv1, csw1, csw3 and fo8 failed only because they need a running copy (ECONNREFUSED).
* A probe script in my scratchpad, outside the repo: the real controllers and services on a scratch database (dropped afterwards). The results are P1-P3 below.
* An isolated copy on :4431 (TTL, then stopped). PF-28's copy ran on :4432. I never used :4400.
* I did not run `graph.mjs`: it rewrites qa/GRAPH.md, and I may write only this file.
* Note: while I worked, another process in this checkout (`run-suites.sh --changed origin/main..HEAD`) changed tracked screenshots and evidence files (A24-*, PF-1, p2/runs). That was not me, and I left those files as they were.

## Probes
* **P1, two different events for one request at the same moment** (the client's `viewed` and the firm's `viewed`, 6 runs, twice): 1 to 3 runs per batch answered **409 CHANGED**. The cause is `40P01 deadlock detected` at the `FOR UPDATE` (I logged it). See R-M1.
* **P2, three identical `completed` calls at once**: 1 applied and 2 duplicates. Exactly 1 evidence row, 1 `signing.completed`, 1 `prospect.won` and 1 email. This holds.
* **P3, PF-12 walls as the real server has them**: an `xr_app` walled pool, `wallUnscopedQueries()`, and `inRequest` scopes for `POST /api/front-office/retainers/:id/send` (firm A) and `POST /api/hooks/signing/fake` (no firm).
  * Send wrote the request and 2 signers. viewed, signed, signed and completed were each applied. The request and the retainer reached SIGNED, with 1 evidence row and 1 win. The bypass lines carry method POST. The walled state read says "2 of 2 signed".
  * The same webhook run from another route is refused (`BypassRefused`). The named use is wired correctly.
* **HTTP on the copy**:
  * An unsigned call or a bad signature gives 400. Provider `boldsign` gives 404. The state read with no session gives 401. The 121st call within a minute gives 429.
  * An array, text/plain, an empty body or a key over 64 characters gives **422, not 400** (m1).

## Done-when, line by line
| Line | Held? | Evidence |
|---|---|---|
| Send: one request, the client then exactly one firm signer; a second Send → 409 with one request | Yes* | S1. *The 409 comes from FO-5's NOT_DRAFT, before the adapter is called. Part 1's unique key is never reached (m6) |
| Failure after the adapter's send: no request, one cancel at the fake | Yes | S2 (a failure forced in `record`). The same `.catch` covers FO-5's own in-transaction refusals |
| State "1 of 2 signed", no token, code or provider id; firm B → 404 | Yes | S4, W3, P3 |
| Plain uuids: firm B's retainer, version or person refused | Yes | S3. All four codes are checked before `port.send` (the test does not count the sends: m6) |
| Unverified webhook → 400, nothing stored | Mostly | W1. Other body shapes give 422 (m1) |
| Same event twice → once; firm signature before every client → refused, state unchanged | Yes, but | W1, W2, P2. The refusal is stored as handled, so the request can get stuck (break report M1, which I confirm: R-M4) |
| `completed`: both files with matching sha256, each client emailed once, one `signing.completed` (schema-checked) | Yes | W3, P2. The email is sent after the commit (m7) |
| WON E_SIGNED once; a second completion makes none | Yes | W4, plus a prospect already won by Convert. Not shown: a consultation completion makes no WON (m6) |
| CONSULTATION with no handler, or `declined` → 200, unchanged | Yes | W5 |
| No `retainer.executed` or `envelope.completed` (grep) | Yes | G |
| Every change: one audit line in its transaction | Yes | Read in the code: every line goes through `tx`, and S1 checks the xmin. The retainer's own status moves are not in before/after (m5) |
| `check_fo6_signing`, `_port`, `fo5`, `fo5b`, `pf12_walls` unchanged and green; full CI green | **No** | Those five are green. Two other CI suites are red (R-M2, R-M3) |

## Majors (Must)
* **R-M1. The webhook deadlocks on two events for one request. Part 1's review m10 is not honoured** (service.ts:167-169).
  * The cause: the receipt insert comes first, and its foreign key takes FOR KEY SHARE on the request row. Then comes `SELECT … FOR UPDATE`. Two transactions each hold KEY SHARE, then each waits for the other's FOR UPDATE (P1: 40P01).
  * It recovers only when the provider retries a 409. The fake never retries, and nothing tests this.
  * Fix: lock the request `FOR UPDATE` first, then write the receipt (in the CONSULTATION "no handler" path too). Add a two-connection test, as part 1's suite has.
* **R-M2. `check_pf19r_every_sender` is red**: "front-office/signing/service.ts: {mailSend:1, anySend:2} … handlers.ts: {anySend:0} send call(s) not in the table".
  * The binding itself is right: `MESSAGES_MAIL`, MailPort over MessagePort, idempotency key `signing:<request>:signed-copy:<person>`.
  * Fix: classify both files in the table in tests/check_pf19r_every_sender.ts:41-57. That is one more file outside the touch list, so say so in the PR.
* **R-M3. `check_pf28_inputs` (b) is red** on a copy: "POST /api/hooks/signing/:provider unknown → 404, missing → 404, 1mb → 404".
  * The sweep fills `:provider` with a random uuid, so every body probe stops at "No such signing provider" (service.ts:119). With `fake`, an unknown field would answer 400 SIGNATURE, not 422, and 1 MB would answer 400, not 413.
  * PF-28 exempts only Stripe's door (tests/check_pf28_inputs.ts:65-68: "any other webhook route is judged like every door (review r15-1)").
  * Fix: put "Question for the tech lead" on the PR (a second named webhook exception with DW6-style signature and schema checks, or an allow-list entry naming FO-6v), then make the suite green.
* **R-M4. I confirm two of the breaker's Majors on this commit; they stand** (break-report.md M1, M2).
  * Deviation (6), refusing and storing an order-dependent event, is not acceptable. Vendors do not promise delivery order, so a firm `signed` that arrives before the client's is stored as handled, and the request never completes.
  * The win inside the completion's transaction (on-signing-completed.ts → `clearForWin`) can roll back a fully signed agreement's evidence (P-561: "stored with us"). The brief puts the win in that transaction, but the evidence must not depend on it.

## Minors (Should)
* m1. An unverified body that is not a JSON object gives 422 from `parseInput` (hooks.ts:43). The brief says 400. Nothing is stored. Answer 400 SIGNATURE, or settle it in the R-M3 ruling.
* m2. Files are fetched and stored before readiness is known (service.ts:158-165). Each NOT_READY or CHANGED retry leaves two orphan files, and a withdrawn, edited or paper-signed retainer gets 409 on every retry for good (break m3).
  * Fix: check readiness first. For the permanent case, store the receipt and answer 200 unapplied.
* m3. `prospect.won` still carries `sealed_retainer_sha256: null` on an E_SIGNED win (sales/prospects.ts:127), although we now hold the sealed sha (contracts §2.6 lists the field). Pass it through, or record it as FO-8's follow-up.
* m4. Rows rev 16.13 DWn+1 says to read the signer and the representative from the filed version, never the retainer row. Send reads `r.signerPersonId` and `r.representativeStaffId` (service.ts:50-51), and the payload reads `ret.representativeStaffId` (:208, :214).
  * They agree today, because Edit writes both in one transaction.
  * Fix: use the version's `SIGNER_ID` and `REPRESENTATIVE_ID` at Send, and the request's FIRM signer at completion.
* m5. The audit lines for viewed and signed record only the request's status (service.ts:187, :197), although the retainer moves too. The completion's line includes `retainerStatus`. Add it to these lines the same way.
* m6. Tests that prove less than their names say:
  * S1's 409 comes from FO-5 (see the table). S3 does not count `signing.calls`.
  * No test covers: the stale-request end at Send (deviation 4: one audit line, one cancel after the commit), a CONSULTATION completion making no WON, the rate limit, the walled path (P3 covered it here), or a signer id from another request.
  * W5 inserts its CONSULTATION request with `session_replication_role = replica`, which bypasses part 1's rules. Note that in the test.
* m7. "Your signed agreement" goes out after the commit (service.ts:225). If the process stops between the commit and the send, the email is never sent, because the receipt makes every redelivery a duplicate. Name this gap in the module row, or queue the email through JobPort.
* m8. Process:
  * The work started before the brief's start condition: #2919 and #2933 are both still open (REST, 22 Nov). `ports/events/signing.ts` already passes #2919's rules B and C (one `SIGNING_EVENT` object, imports only zod, a unique name).
  * The touch list grew without a recorded question: firm-scope.ts, three tests, two more MODULE.rows files, and now pf19r and pf28. State this in the PR body (P-610).

## The builder's deviations
1. **firm-scope.ts and the sweeps**: needed. PF-12 allows a cross-firm read only on a named use, as Stripe's door has. P3 shows it holds under `xr_app`. The process point is m8.
2. **JSON.stringify instead of the raw body**: acceptable for the fake. It fails closed: re-serialising can only turn a valid signature into a 400. FO-6v's touch list does not name `main.ts`. Add the `express.raw` mount there, or ask.
3. **Only the link tokens' sha256 is kept**: acceptable. Part 1's trigger freezes `link_token_sha256`, so a request sent before part 4 can never get a usable link (only "Send updated version", part 5). Record that in the module row.
4. **Send ends a stale live request**: a fair stopgap. FO-5d (DWn+1) must cancel at the Edit. Until then the old version can still be signed between the Edit and the next Send. Its test is missing (m6).
5. **A process-wide fake port**: acceptable for the prototype, as the swap point FO-6v needs.
6. **A refused event: receipt stored, 200 unapplied**: not acceptable for refusals that depend on order or timing (R-M4).
7. **A completion before every signature is recorded → 409, nothing stored**: right. The orphan files are m2.

## Screen-review frame and journey test (reviewer role; the one journey score for this check)
* There is no screen: D1-D20 and BIC-01-20 are N/A. D5 (code correctness, races, server authorisation) is covered above. D17 and D20 are simulated only. Retrofit mapping: N/A.
* I wrote no separate journey-test report: the caller allowed this file only.
* Journeys run against the API:
  1. Send, then the client signs, then the firm signs, then completed: holds, under the walls too.
  2. A prospect already won: no second win.
  3. Unverified, then a bad shape: 400, then 422.
  4. A failure after the adapter's send: one cancel.
  5. Firm B and plain uuids: refused.
  6. A duplicate, then three identical calls at once: once.
  7. Two different events at once: deadlock, 409.
  8. Out-of-order delivery: stuck.
  9. CONSULTATION and declined: stored, 200.

| Criterion | Score | Evidence |
|---|---|---|
| task completed | ½ | Journey 1 holds. Journeys 7 and 8 fail (R-M1, R-M4) |
| next step obvious | N/A | no UI |
| plain words | 1 | plain problem answers with codes |
| feedback and state | 1 | `applied`, `duplicate` and `reason` are given on every answer |
| correct data | ½ | P2 is exact. A signed agreement's evidence can be lost (R-M4) |
| error recovery | ½ | the deadlock and the permanent 409 loops (R-M1, m2) |
| accessibility and screen sizes | N/A | no UI |
| speed | 1 | suite about 5 s; webhooks about 30 ms |
| visual quality | N/A | no UI |
| trust and sources | 1 | Sample values and "Unconfirmed: no counsel" in the headers |

**Score: 5.5 of the 7 criteria that apply = 7.9/10 scaled. No 0. Below the pass mark.** The fixes that would raise it most: R-M4, then R-M1, then m2.

## What I could not check
* CI at this commit: no PR and no check runs.
* The HTTP Send and state read with a signed-in session: two-step sign-in. P3 covered that path in code.
* The commit `e8dc29499`.
* A real vendor (FO-6v).

## Round 2 (diff only, P-277): `c1c7d32bd..e0d7697658c973a1338cb0f862a84a31b1a76c70`
**Reviewer: Changes e0d7697658c973a1338cb0f862a84a31b1a76c70.** **Verdict: Block** on one new Major, R2-1, which the m2 fix introduced.

**What I ran, at e0d7697:**
* Suites: check_fo6_signing_api 47/47, check_pf19r_every_sender 21/21, check_fo5_retainers 248/248, check_pf12b_bypass_audit 70/70.
* My probe on a scratch database (dropped afterwards):
  * Two different events at once: 0 errors in 8 runs. In round 1, 1 to 3 of 6 runs deadlocked.
  * `completed` delivered before the signatures: R2-1 below.

**Closed:**
* **R-M1**: `receipt()` locks the request `FOR UPDATE` before it inserts (service.ts:142), on every path, CONSULTATION's included. A test covers it.
* **R-M2**: both files are now in the pf19r table.
* **R-M4**:
  * The firm signing before the clients, and a signature with no consent yet, now answer 409 NOT_YET and keep nothing. Redelivery applies them.
  * The win runs under a savepoint, so a refused win keeps the evidence, both SIGNED states and the event. It writes `signing.win_held`.
* **Minors closed**:
  * m1 (a body that is not an object gets 400) and the breaker's m1 (a too-deep body gets 400).
  * The breaker's m2: a late `viewed` gets 200.
  * The breaker's m4: a signature after the expiry is refused.
  * m6: the Edit-then-Send case now has a test.
  * The event id is gone from the audit detail.
  * m3, m4 and m7 and deviations 2 and 3 are recorded in the module row as known gaps. I accept that.

**Major (Must), new**
* **R2-1. A `completed` delivered before the signatures is swallowed for good** (service.ts:165-169).
  * The new pre-check treats every retainer status other than CLIENT_SIGNED or SIGNED as final. That includes **SENT and VIEWED**, which still lead to signing.
  * Probe:
    1. Send, then consent.
    2. Deliver `completed` first: it answers `200 {applied:false, reason:"the agreement is viewed"}` (or "sent") and stores the receipt.
    3. Deliver the client's `signed`, then the firm's `signed`: both are applied, and the request reaches CLIENT_SIGNED.
    4. Deliver `completed` again: `200 duplicate`.
  * End state: CLIENT_SIGNED for good, no evidence, no SIGNED, no `signing.completed`. This is the out-of-order case R-M4 was about, now for `completed`. Before this round the same call gave a retryable 409 NOT_READY.
  * Fix: treat as final only a retainer that can no longer reach CLIENT_SIGNED at this version (WITHDRAWN, SIGNED_OFFLINE, EXPIRED, or `current_version` ≠ the request's version). SENT or VIEWED at the request's version gives 409 NOT_READY, with nothing stored. Add the test.

**Minor (Should), new**
* R2-2. The commit also carries `evidence/ai-orchestration/check_ai_orchestration.json` (new timestamps, port and database). That is another suite's evidence, written by the concurrent `run-suites.sh`, not this row's. Take it out of the PR.

**R-M3 (PF-28 part (b) on the hook route):** I accept sending it to the tech lead as a question. It does not block my label, as long as the ruling is applied and `check_pf28_inputs` is green before merge, either through a HOOK entry judged over HTTP like Stripe's, or through an allow-list entry naming FO-6v. CI holds the merge until then.

**Journey re-score:**
* Journeys 7 (concurrent events) and 8 (out-of-order signatures) now hold.
* Out-of-order `completed` is stuck (R2-1), so task completed and correct data stay at ½. Error recovery rises to 1.
* **6/7 applicable = 8.6/10 scaled, no 0. Blocked on R2-1.**

## Round 3 (diff only, P-277): `e0d769765..29e8389042589c8950f39423bf389e4f3e40a6f0`
**Reviewer: Approve 29e8389042589c8950f39423bf389e4f3e40a6f0.** **Verdict: Approve.** No Blocker or Major is open.

**What I ran, at 29e8389:**
* check_fo6_signing_api: **49/49, twice**. check_pf19r_every_sender: 21/21.
* I restarted the local :54329 cluster first: it had stopped between rounds.
* My round 2 probe, run again on a scratch database (dropped afterwards):
  * `completed` delivered first, both with and without a `viewed` before it: **409 NOT_READY**, nothing kept. The two `signed` events then apply, and the redelivered `completed` applies: SIGNED/SIGNED, 1 evidence row, prospect won.
  * Two different events at once: 0 errors in 8 runs.

**Closed:**
* **R2-1 (Major).** f2021fe (service.ts:165-173) treats only these as final: an ended request, a retainer that is WITHDRAWN, SIGNED_OFFLINE, DECLINED or EXPIRED, or a retainer at another version. SENT and VIEWED now answer 409.
  * The new test fails on round 2's code: at e0d7697 my probe got 200 on the first `completed`, and the test expects 409.
  * The withdraw case (test B, break m3) is still final and stored once.
* **R2-2 (Minor).** `evidence/ai-orchestration/check_ai_orchestration.json` is now the same as on main (`git diff origin/main 29e838904` is empty for it).

**Also in this range:**
* 156832e adds a feature-file check (controllers and the Signing provider). Fine.
* 29e8389 adds records only: `pr-body.md` and the break report's round 2 section.

**Left to the Lead read, per Lead 5:** size, the touch list, and PF-28's webhook exception (R-M3). `check_pf28_inputs` (b) must still be green before merge.

**Journey re-score:** the out-of-order `completed` now holds, so task completed and correct data rise to 1. **7/7 applicable = 10/10 scaled, no 0.**
