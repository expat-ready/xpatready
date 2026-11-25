# FO-6 part 4a review: the "Please sign" email, the email-code setting, the shared code logic (API only)

Commit reviewed: `8a2c69cc5e88a1dae96f1db7df2e825d552266af` (branch `claude/runtime-fo6-door`, draft PR #3433; diff `origin/main...8a2c69cc5 -- ai-workers/`, 10 files, +650/-6). Independent reviewer; I did not build this. Spec: rules note `screens/FO-6-4/note.md` (rules 1, 5, 6; split 4a), BACKLOG row FO-6, the tech lead's answers on #3433 (summarised in the brief), FO-3c's code (`booking/consultation-agreement/service.ts:392-476`).

Skill verdict: **Ship**. `Reviewer: Approve 8a2c69cc5e88a1dae96f1db7df2e825d552266af`

## What I ran
* `run-suites.sh --only "check_fo6_door_code.ts check_fo6_door.ts check_fo6_signing_api.ts"`: door_code **19 passed, 0 failed**; door **4/4 passed, 27 pending** (on its own copy, run-suites' renamed port and database, third argument `4a` reached the suite); signing_api **51/51**. `check_pf19r_every_sender.ts` **21/21**.
* CI parsing: `run-suites.sh:368` matches line 27's usage line; `BASH_REMATCH[6]` = ` 4434 xr_studio_fo6door 4a`; the prefix rewrite renames the port and `xr_studio_fo6door` and keeps `4a`; the unquoted `$args` gives three arguments. The log shows the PENDING lines, so the argument arrived. door_code runs plain (NORETRY, own scratch database).
* My own journey on an isolated copy on :4436 (runtime range, 40 min TTL, then stopped; never :4400): report `journey-test-reviewer-2026-11-24.md` in this folder, **8/10**.
* Not run: `graph.mjs` (it rewrites `qa/GRAPH.md`; I may write only this file and the journey report).

## The checks the brief asked for
* **Send that rolls back after `record()`**: no email. `Retainers.send` (`retainers/service.ts:619-629`) calls `afterCommit` only after `this.tx` resolves; the `.catch` re-throws first. `recorded` (`signing/service.ts:67,94`) is a second guard. My J4 (stale version) and the suite's forced failure emailed nothing. But the test fails *inside* `record()`; see m1.
* **Retried or doubled `afterCommit`**: `recorded = false` before the send (line 73), so a second call is a no-op. The MailPort key `signing:<request>:please-sign:<person>` holds no token and is unique per firm in `msg_outbox`. Double-click Send (J3): one 200, one 409 CHANGED, one request, one email.
* **Token never logged or audited**: only `e.name` is logged; the `signing.request_sent` audit line carries ids only. J1: the token is in 0 `audit_event` rows, 0 `msg_outbox` columns, and not in the copy's api.log. The rendered email (with its link) sits in the messages file store like every email and FO-3c's link (the link-mail.ts header says so). That is not a finding.
* **Code logic vs FO-3c**: the same rule line for line. Lock reset (`lockedUntil ? 0 : failures` in both ask and check), spent code (`unspent`, then EXPIRED and counted), resend gap 60 s (TOO_SOON), live code not re-sent without `resend`, right code while locked → LOCKED and not counted, sixth wrong code → 423 for 15 min. The only change is that FO-3c's 30-minute `codeVerifiedAt` shortcut is left out on purpose: it is 4b's session (answer 3). `timingSafeEqual` is used on equal-length sha256 buffers.
* **PENDING mechanism** (`check_fo6_door.ts:44-51`): a label with no `(part …)` counts (setup, part 3, and "the walk finished without an error", which is how a thrown exception in a pending section still fails the run). A label naming no 4a/4b/4c (a typo such as `4d`) counts, so it fails loudly. With no argument every line counts. The one way it could hide a real failure is a stale argument (m3).
* **Setting**: key, boolean, default true, `agent/legal-settings:manage` (exists, OWNER, `20261114015002_pf3_platform_tables:817`). Registered by the feature's import. `readSetting` has no cache, so it is read on each call. The description says the code-off link is a bearer link (answer 2).
* **Firm signer**: no email (S unit line: one mail in total; J1: the representative's inbox has no "Please sign").

## The challenger's 7 Majors in the rules note: all fixed, 4b and 4c can build on it
1. Firm signer consent: rule 12 takes `{consent:true, consentTextVersion}`, 422 without, test E. **Fixed.**
2. Code-off bearer exposure: rule 8, question 2, and the setting's own words. **Fixed.**
3. 4a without 4b's columns: door-code.ts writes only part 1's code columns plus `code_verified_at`. **Fixed** (holds in the code).
4. Stand-in page local only: rule 11 plus a start-up assertion. **Fixed in the note.** No test line yet proves the route is absent in test or production (m5, for 4c).
5. Cookie: the path regex is anchored (`(;|$)`), `SameSite=Strict` is asserted, and the jar honours Path (`check_fo6_door.ts:66,179`). **Fixed.**
6. Non-representative: a fixed CASE_OFFICER (`order by actor_id`), `403 NOT_THE_REPRESENTATIVE` asserted, and a missing officer fails the line. **Fixed.**
7. Rate limit per (address, token) with a per-address ceiling, line F, question 9. **Fixed.**

## D1–D20 (API only; no screen in 4a)
D1 Met: rules 1 and 5 as written; the code logic matches FO-3c · D2 Met: one request and one email under a double Send; only the sha is stored · D3 Met: one shared door-code.ts; FO-3c moves onto it after 4b · D4 N/A · D5 Met: rollback, stale and double Send email nothing; a mail failure leaves the Send · D6 Met: audit line per code change; the setting is changed by the Owner key · D7 N/A (no AI) · D8–D9 N/A (no screen) · D10 Met: the email's words are plain, with the firm named and Reply-To the firm · D11 Partly: the client's link opens the staff "Page not found" until FO-5s (m4) · D12–D14 N/A · D15 Met: Send 97–199 ms; email in the inbox after 270 ms · D16 Met, with m1 · D17, D20 simulated only · D18 Met: firm named, Reply-To the firm · D19 Partly by plan: the link opens nothing until 4b and FO-5s.

## BIC-01–BIC-20 (EXPERIENCE.md §6)
N/A, all 20: 4a has no case-side screen and no page. The scorecard applies to FO-5s's door page.

## Findings
**Blocker:** none. **Major:** none.

**Minor**
* **m1** `tests/check_fo6_door_code.ts:97-100`: the "does not commit" case fails on `signing.request_sent`, which is inside `record()` before `recorded = true`. If the email moved into the transaction, or the `recorded` guard were deleted, the suite would still pass. Fix: also fail the transaction *after* `record()` returns (stub `Retainers.prototype["event"]` to throw, or put a scratch-database trigger on `module_event`), and assert no mail.
* **m2** `signing/door-code.ts:38,54`: the single-use code and the counter are race-safe only if the caller holds the request's `FOR UPDATE`, as the header says. Nothing enforces it, and 4b and FO-3c will be callers. Fix: take the lock inside `askCode` and `checkCode` (`select … from fo_signature_request where id = (signer's request_id) for update`; re-locking in the same transaction is free), so the shared module is safe by construction.
* **m3** `tests/check_fo6_door.ts:27,44`: if 4b merges without changing the usage line's `4a` to `4a,4b`, 4b's lines stay PENDING and a real 4b failure is hidden. Fix: print `STALE` and count a failure when a pending line passes. Or state in the note that 4b's and 4c's PRs must change the argument, and that the reviewer checks it.
* **m4** `signing/link-mail.ts:12` and `MODULE.rows/FO-6-4a.md`: after merge, the demo emails clients a link that opens the Studio's staff "Page not found" (as Configuration author) until 4b and FO-5s ship (J1 screenshot). This follows the approved split. Fix: add the gap to the MODULE row's "Known gap", and to STATE if the demo walk touches j_55 W3, so the founder is not surprised.
* **m5** note rule 11 / `check_fo6_door.ts`: no line asserts that the stand-in page is 404 when `PLATFORM_ENVIRONMENT` is test or production. Fix (4c): a unit line that builds the routes for `test` and finds no `sign-fake` route.
* **m6** note rule 10: `Referrer-Policy: no-referrer` on the API answers does not govern what the vendor frame receives as Referer; the page `/sign/<token>` does. Browsers' default `strict-origin-when-cross-origin` already strips the path. Fix: say in the note that FO-5s's page sets `referrerpolicy="no-referrer"` on the frame (or the page header). FO-3c keeps its token in the URL fragment; this link puts it in the path, as the row's `/api/public/sign/:token` implies.

## Could not check
A real mail provider; a screen reader; an intended user's walk (D17, D20 stay with the founder); `graph.mjs`. The web `/inbox` page does not list MailPort emails at any width, because it reads `/demo/inbox`, not `/api/demo/platform-inbox`. This predates 4a and is not a finding.

Verdict: Approve

## Round 2 (diff only, P-277): `8a2c69cc5..dfef2c1fe0cc3a8a8f49818a7d0b3b3b56fc9fff`
Read `git diff 8a2c69cc5 dfef2c1fe -- ai-workers/`: 5 code and record files. The round-1 review and journey files the builder committed are identical to mine. I re-ran at dfef2c1fe with `run-suites.sh --only`: door_code **21/21**, door **4/4, 27 pending, none passing while pending**, signing_api **51/51**.
* **m1 fixed** (`check_fo6_door_code.ts:101-107`): a `module_event` trigger on `retainer.sent` fails Send after `record()` returns. The line asserts no mail and no request. It proves itself: had the trigger not fired, the line would read "sent" and fail. The trigger is dropped right after.
* **m2 fixed** (`door-code.ts:35-40`): `lockedSigner` reads the immutable `request_id`, takes the request's `FOR UPDATE`, then re-reads the signer. Both `askCode` and `checkCode` use it, and the test helpers no longer lock for it. **Mutation check:** I deleted the lock line and ran door_code 3 times. The new concurrent line failed every time (`["OK","OK"]`, 20/21). I restored the file with `git checkout` and the tree is clean.
* **m3 fixed** (`check_fo6_door.ts:47-56`): a pending line that passes is now recorded as a FAIL ("add its part to the third argument"). No 4b or 4c line passes at 4a today (the run is green), so 4b's PR has to change the argument.
* **m4 fixed** (`MODULE.rows/FO-6-4a.md:1`): the known gap now says the link opens the not-found page until 4b and FO-5s ship.
* **m6 fixed** (note rule 10): the Referer is governed by FO-5s's `/sign/:token` page, which sends `no-referrer`. The API header is described as harmless, not the protection.
* **m5 open by agreement**, for 4c (a line showing the stand-in route is absent in test and production).
* New findings: none.

`Reviewer: Approve dfef2c1fe0cc3a8a8f49818a7d0b3b3b56fc9fff`

Verdict: Approve
