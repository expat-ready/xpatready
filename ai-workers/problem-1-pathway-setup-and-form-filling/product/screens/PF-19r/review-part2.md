# PF-19r part 2 review: the case side's link and code emails through MessagePort

**Commit reviewed:** `ed070da45a76249fe12407ec9469a47cbbec0510` (branch `claude/runtime-pf19r-case-links`), against `origin/main` `34c5e1e99` (merge base; includes #2125 CS-W1).
**Reviewer:** independent Opus reviewer, fresh context, 18 Nov. Runtime row with no screen change. D1-D20 and the BIC table do not apply (no screen; P-26 scope), so they are not scored. Journey score: 8/10, in `journey-test-reviewer-2026-11-18-part2.md`.
**Run:** isolated copy `rev_pf19r2` on :4438 (never :4400), `setup_visitor_visa.ts`, then `check_pf19r_case_links.ts`: **15 passed, 0 failed**. After that, a break pass over HTTP on the same copy (scratch scripts, not committed). Copy stopped.

## Findings

### Major M1: the client's same-link Resend stops sending from the third press, still answers 201 and writes "sent the same link again" (and skips the consent gate)
`api/src/person-link.ts:201,206`: the key is `case.link:<linkId>:again:${sent.length}`, but `sent` is read with `take: 2`, so `sent.length` can only be 1 or 2. The first Resend uses `again:1` and the second uses `again:2`. Every later Resend uses `again:2` again, so `MessagePort.send` answers `repeated: true` with the old row. `mail()` then returns false: no outbox row, no email and no demo copy. The audit line at :208 is still written and the answer is 201.
*Scenario (break B1, reproduced):* staff send the accepted partner's link to a new address D, and Client A presses Resend four times, each more than a minute apart (`demo_message.created_at` moved back 2 min between presses).
* Presses 1 and 2: outbox `…:again:1` and `…:again:2`, 2 and then 3 demo copies.
* Presses 3 and 4: 201 each, the outbox still has 3 rows, still 3 demo copies, and the audit's "resent" lines go up from 3 to 5.
*Scenario (break B4, same cause):* the address D is then put on `msg_suppression` and Client A presses Resend again. The answer is **201** with a new audit line, not the 409 "Not sent". The repeated row's state (QUEUED or SENT) is what the gate check reads, so the refusal never fires. Nothing is actually sent, but the person and the history are told it was. This breaks R1.49's "the gate on every path" and the brief's "never a silent success".
This is a regression against `main`, where every Resend after the minute wrote a new demo copy.
*Fix:* make the key unique for each accepted Resend, for example `case.link:<openId>:again:<id of the newest demo copy>` (`sent[0].id`) or a count without `take`. Add a DW9 case for a third Resend after the gap (`tests/check_pf19r_case_links.ts:94-98` stops at two).

### Major M2: two "Send me a code" presses in the same millisecond share one key, and the code in force is never emailed
`api/src/person-link.ts:322,331`: the code's key is `case.link:<linkId>:code:${expires.getTime()}`, and `expires` comes from `now`, which is read when the request starts. Two requests that start in the same millisecond build the same key. The second transaction runs like this:
* it waits on the link row, then writes its own `codeHash` (:327);
* it deletes the first request's demo copy (:329);
* the outbox answers `repeated`, so it writes no email and no demo copy.
The person then holds an email whose code is not the one stored. Typing it counts as a wrong try (the fifth try locks the link), and the answer was 200 `sent: true`.
*Scenario (break B6, reproduced):* three parallel `POST /api/link/code/send` calls on one token, six runs. Two runs shared a millisecond (`…36.875Z` twice) and wrote only 2 outbox rows for 3 answers of 200. In one of those runs the demo inbox held **0** code copies: no working code reached the person.
*Fix:* a key that is unique for each code change and never derived from the code, for example a `randomUUID()` made with the code (sendCode has no retry meaning to protect).

### Major M3: the new suite's usage line does not match run-suites.sh, so the merge-queue batch runs it with no copy and it fails
`tests/check_pf19r_case_links.ts:6` puts `&& tsx studio/tests/runtime/setup_visitor_visa.ts …` between `start` and the suite. The pattern in `product/tools/run-suites.sh:351` needs `start && tsx studio/tests/<file>` with nothing in between. I checked the pattern against this exact line with bash: it falls through to the plain branch (`run-suites.sh:361-366`), which runs the suite with no arguments and no isolated copy. The suite then fetches from `127.0.0.1:4430`, which nothing serves, and stops with exit 2. That would turn the P-651 (2) batch red, and the suite would never test anything there.
*Fix:* use the usual header, `isolated.sh runtime_pf19r 4430 start && tsx studio/tests/check_pf19r_case_links.ts 4430 xr_studio_runtime_pf19r`, and have the suite run `setup_visitor_visa.ts` itself when the copy has no Visitor visa, as `tests/check_c1112_prepare_api.ts:24` does.

### Minor m1: DW11's fail case cannot fail
`tests/check_pf19r_case_links.ts:120` checks `` `audit: ${x}`.includes(x) ``, which is always true, so it does not prove the scan finds anything. *Fix:* plant a secret in a real scanned source (one audit row or a temporary log line) and assert that `leaks` finds it.

## What held (with evidence)
* **enterFirm** (`platform/firm-scope.ts:81-87`):
  * It refuses nothing on either door. The x-actor runtime route and `/api/link` both have a request scope from PF-4's guard (`identity/guard.ts:100`), not a bypass.
  * On another firm's web address it gives a 404 before anything is written (:85). That is the wall, and correct.
  * It changes nothing that later reads in the same request see. Only `platform_*`, `fo_*`, `money_*` and `msg_*` are walled (`prisma/migrations/20261116013000_pf12_firm_walls`), and `lineOf` (`people()`), `audit_event` and `runtime.ts` read none of them.
* **Firm A as firm B:**
  * The firm comes only from the case (`person-link.ts:81`). A sample-solo case sent from `sample-solo` with its own name (break B2).
  * When `firm_id` is null and the key has a platform firm, `firmIdByKey` is used and the email goes out as the key's firm (B3). A key with no platform firm gets 409 FIRM_CANNOT_SEND and nothing is written (DW10).
* **Refused or rolled back:**
  * The outbox row is written in the change's own transaction, and `dispatch` runs only after the commit (:226, :335).
  * A gate refusal rolls back the link, the code hash, the audit and the demo copy (DW7 fail, DW8 fail). The only exceptions are M1 and M2.
* **Tokens and codes:**
  * None in an outbox key: no 43-character token in any key (B9), and the code key holds a time, not the code (but see M2).
  * None in the 872-line API log of the copy (grepped for `#t=`, "code is" and "Your code"), in audit summaries or in answers (DW11 pass).
  * The dispatch warning names only the error class (:102).
* **Same key twice:** one link, one outbox row and one demo copy (DW9 pass). A double press on Send with no key gives 2 links and 2 outbox rows, and the dead link's demo copy is deleted. That is the delete-when-the-link-dies rule as ruled, and the same as on `main`.
* **Delivery:** the worker delivered every QUEUED row (36 SENT). The 3 SUPPRESSED rows are the ones the worker held back after I suppressed D, so the worker's second gate check holds.
* **P-710:** the production-mode test passes (a production configuration seeds no firm, a non-production one seeds both). The module card has the sentence and the test.

## What I could not check
* The full `ci` run and the module-card or port-contract checks: not run here.
* The case suites (C6.16 pack, browser privacy, qa359, forms_qa53): the builder is running them.
* A visible-browser walk of the link page (no screen change), and an intended user's walk (D17/D20 stay with the founder).

**Verdict: Block.** Fix before Approve: M1 (the Resend key and a third-Resend case in DW9), M2 (a unique code key), M3 (the suite's usage line or its own setup). m1 should be fixed in the same push.
