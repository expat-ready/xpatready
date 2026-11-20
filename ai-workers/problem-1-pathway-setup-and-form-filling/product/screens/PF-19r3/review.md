# PF-19r part 3 review: sign-up's mail through MessagePort, and a suite over every email send call

**Commit reviewed:** `a482612fd9231e9824861c41f104b716f0b8af6e` (PR #2452, branch `claude/peaceful-planck-u3ltxn`), diff `origin/main...a482612fd`.
**Reviewer:** independent Opus reviewer (P-303), fresh context, 20 Nov. Runtime change, no screen: D1-D20 and the BIC table do not apply (P-26), so they are not scored. The journey score is below (backend journeys over HTTP; no separate journey file, per the caller's "write only the review file").
**Run:** `COPY_PREFIX=rev19r3 run-suites.sh --only "check_pf19r_every_sender.ts check_pf19r_senders.ts check_pf5_signup_billing.ts"`: **PASS 17/0, 27/0, 53/0** (the default prefix was taken by the builder's own `--changed` run, pid 14391). Isolated copy `rev19r3` on :4437 (runtime range, never :4400), `PLATFORM_IDENTITY=local`, walled pool; stopped afterwards. Scanner probes in a scratch copy of the suite (not committed).

## What holds
* **Wiring:** `features/platform-firms.ts` injects `MESSAGES_MAIL`; `runtimeSignUpPorts(…, mail)` with no mail sets `notReady` (503 SIGNUP_NOT_SET_UP), and `refusingMail` is unreachable. The only callers of `runtimeSignUpPorts` are the feature and two suites (grep).
* **Walled pool (reproduced, not only the builder's run):** `POST /api/public/signup` with `user-o@sample-firm.example.com` → 202, then `msg_outbox` `TRANSACTIONAL|DELIVERED`, firm set, audience FIRM. The platform inbox shows "You already have an ExpatReady account" in the one layout. `later()` is called inside `asBypass("platform.firms.signup")`'s AsyncLocalStorage scope, so the background step keeps the bypass.
* **Refusal leaks nothing:** with `user-o@…` on `msg_suppression`, the answer is the same 202 body in 6.6 ms (known 20.9 ms cold, unknown 6.7 ms). The row is `SUPPRESSED: COMPLAINT`. `MessagesMail` throws `MessageRefused`, and `later()` logs only `[sign-up] background step failed: MessageRefused` (no address). The answer is built before the work runs (`signup.ts:136-137`), so neither a refusal nor a send can change it.
* **Today's senders are all classified:** my own grep of every `.send(`, `sendIn(`, `mailIn(`, `deliver(`, `demoMessage.*`, `nodemailer|sendMail|createTransport|SES*|twilio|SNS` under `api/src`, `ports/`, `engine/`, `tools/`, `deploy/` gives the same 17 calls as the table. The only raw transports are MessagePort's own channels. There is no SMS or other channel caller outside `platform/messages/`. `NotificationPort` (ids only, no adapter yet) and `AlertPort` (log line) send no email. `pgboss-jobs.ts:247` is `boss.send` (a job, not mail).
* **R1.47 stays Partial, honestly:** the PR has no `Completes:` line and does not touch the R1 status. `signup-identity.ts` is marked OPEN with its owner (QA-481, PF-5v part 2). That matches the brief's table (sender 9, "not here"). Production sign-up is shut anyway while identity ≠ local (`runtime-ports.ts:28`).

## Findings

### Major M1: anonymous sign-ups now spend the firm's daily send cap and write into the firm's outbox (the notice should be a platform account message)
`platform/firms/signup.ts:144` sends with `firmId: known`. Through `MessagesMail` this is now a real firm message: From "Sample immigration firm", Reply-To the firm's contact address (`representative@…`; the caller's `no-reply@expatready.com` is ignored, `send/mail.ts` header), and it is counted in `msg_send_counter`. That counter went to 1 on the copy after one anonymous request. `knownAccount` also matches `platform_firm.contact_email` (`signup.ts:233`), and that address is the Reply-To on every email the firm sends. For a self-serve firm it is the owner's address.
*Scenario:* a trial firm (DAILY_CAP 50, `ports/messages.ts:20`). Anyone repeats `POST /api/public/signup` with its contact address. Per-address limit 3/hour × 24 = 72 a day, more than 50, from one IP (the IP limit is 10 per 10 min). The per-address limit is in memory, so each process or restart adds more. After that, the firm's own clients' link and sign-in code emails, invitations and booking mail are held "daily limit" until the next day. On `main` this could not happen, because `fakeMail()` sent nothing. The firm's suppression list also wrongly applies to an ExpatReady account notice.
*Fix:* send it as the platform account message PF-19p built for this door: `{ platformAccount: true, to, … }` with no `firmId`. It then has no firm cap and no firm row, comes From "ExpatReady" with the platform Reply-To, and its bypass `platform.account.mail` already lists `POST /api/public/signup` (`firm-scope.ts:110`). That matches the brief's note that sender 8 goes "with PF-19p", and the subject already says "ExpatReady account". Then change DW7: one `PLATFORM_ACCOUNT` row with no firm and "Sent by ExpatReady.". Its fail case: the firm's `msg_send_counter` does not move.

### Major M2: the "every send call" scanner is lexical and misses ordinary sender names, so a bypass passes S1
`tests/check_pf19r_every_sender.ts:116-123` recognises a MailPort send only when the receiver ends in `mail` (`mail.send(`). It recognises a MessagePort send only for `messages|msg|this.d.messages|…`. I added 15 probe files to a scratch copy of `audit()`, and **14 passed unreported**: `this.email.send(…)`, `mailer.send(…)`, `m.send(…)` (a `MailPort` parameter), `port.send(tx, …)` (a `MessagePort`), `this.d.outbox.send(…)`, `this.ports.messagePort.send(…)`, `mm.sendIn(…)`, `this.d.mail` with `.send(` on the next line (a common Prettier break), `const { send } = this.d.mail`, `sent.push({ address: …` (an email kept in memory), `fetch("…/mail/send")`, `new SESv2Client(…).send(cmd)`, a send after `/* … */` on the same line, and a job enqueued with mail data. Only `SendEmailCommand` was caught. So the claims "fails on any bypass" (PR) and "fails when one is unlisted" (`qa/built/PF-19r.md`) do not hold for new code. The current code is fully classified (see above), so this is a guard gap, not a live bypass.
*Fix (small):* key the table on files, not only on call shapes. Any file outside `features/` and `platform/messages/{send,channels}/` that imports `MailPort`, `MessagePort`, `MessagesMail`, `mailIn`, `MAIL_PORT`, `MESSAGE_PORT` or `MESSAGES_MAIL` (or `SESv2Client`, `fetch` to a mail host) must have a SENDERS entry, or an entry in a short "holds a port, sends nothing" list. Better still, count the call sites by type with the TypeScript compiler API (already in `node_modules`). Add fail cases for `this.email.send`, `m.send` and the next-line `.send(`.

### Minor
* m1: DW7 (`check_pf19r_senders.ts:270-301`) calls `FirmSignUp` directly on the owner connection, with `notReady`, identity, billing and clock replaced. It does not go through the route, `asBypass`'s route check or the walled pool. The walled-pool proof is manual: the builder's run, and mine above. A known-account sign-up over HTTP on an isolated copy (an existing signup suite can host it) would keep it proven if `later()` ever leaves the bypass scope. Today that would fail silently into the log.
* m2: `qa/built/PF-19r.md` opens with "every email the app sends goes through MessagePort". Two items are open, and the Cognito custom sender's deployed wiring is unverified. Say "every send call in api/src except …" so qa does not read it as Works.
* m3: a suppressed or refused notice is logged as `background step failed` (warn). It is the gate working, not a failure. If M1's fix keeps the throw, consider logging it as `refused` so the log stays useful (no personal data either way).

## Tests against their names
S1 and S2 each have a real pass and a real fail on changed copies. S2 really calls each factory with a sentinel object and checks that the returned `mail` is that object. S3 checks `render` against `layout()`. Within the shapes it knows, the "not blind" check (`hits.length >= 17`) is sound. DW7's pass checks a row, the layout and the firm. Its "says nothing about the account" fail case is trivially true, because the answer is fixed before the work runs. It is still correct. `check_pf5_signup_billing.ts:263` passing `fakeMail()` is fine (a suite building its own stand-in).

## Journey score (reviewer; backend journeys over HTTP on :4437, data read underneath)
Journeys: (1) a stranger signs up with an existing staff email; (2) a new email; (3) a suppressed address; (4) a server with no mail (suite); (5) break-it: repeated sign-ups against one firm.
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1-4: the email arrives in the one layout; suppressed → nothing sent |
| Next step obvious | 1 | The email says "Sign in" with the link |
| Plain words | ½ | An "ExpatReady account" notice signed by "Sample immigration firm", Reply-To the firm (M1) |
| Feedback and state | 1 | The same 202 answer every time; outbox state is right |
| Correct data | ½ | An anonymous request writes the firm's outbox row and raises its daily counter (M1) |
| Error recovery | 1 | A refusal is caught; the answer is unchanged |
| Accessibility and sizes | 1 | No UI change; the HTML is MessagePort's unchanged layout |
| Speed | 1 | 202 in 6-21 ms; the mail runs after the answer |
| Visual quality | 1 | The layout header and "Sent by" are in the HTML |
| Trust and sources | ½ | Wrong sender identity for a platform notice (M1) |
**8.5/10, no criterion at 0.** Journey 5 fails (M1).

## Could not check
The deployed Cognito custom sender's wiring (not in the repo). A real SES send (US$0, local adapter only). The cap exhaustion was not run to 50 (it would need hours on the per-address limit). It follows from the counter moving by 1 per anonymous request, together with `DAILY_CAP` and `MAILS_PER_EMAIL_HOUR`.

**Verdict: Changes requested** (Block). Fix M1 and M2, then re-review at the new head. The Minors are optional.

## Re-review at `371811798084852b890096541adcc0105dd50484` (20 Nov)
**Read:** only `git diff a482612fd..371811798`. **Run:** `COPY_PREFIX=rev19r3b run-suites.sh --only "check_pf19r_every_sender.ts check_pf19r_senders.ts check_pf5_signup_billing.ts check_pf19p_platform_mail.ts check_pf5v_signup_mail.ts"` at that head: **PASS 19/0, 28/0, 53/0, 68/0, 7/0**. Isolated copy `rev19r3` on :4437 again (walled pool, `PLATFORM_IDENTITY=local`), stopped afterwards. My earlier probe set run against the new `audit()` in a scratch copy (not committed).

**M1: resolved.** `signup.ts:146` sends `platformAccount: true` and no `firmId`. My own check on the copy:
* sign-ups with `user-o@…` (staff) and `representative@…` (staff and the firm's contact email) each gave 202 with the same body (5-19 ms);
* each gave one `PLATFORM_ACCOUNT|TRANSACTIONAL|SENT` row with no firm;
* `msg_send_counter` has 0 rows;
* the email is From and Reply-To `ExpatReady <no-reply@expatready.com>`, with "Sent by ExpatReady." and no firm name;
* there was no "background step failed" line.

The nested `asBypass("platform.account.mail")` passes its route check inside `later()`, because the scope keeps the route `POST /api/public/signup`. DW7 now asserts a row with no firm, the ExpatReady layout and an unchanged firm counter. Its new fail case, the same email sent the firm's way, moves the counter by 1, so the check is not blind. The dropped suppressed-address case was right to drop: platform account rows have no consent gate by PF-19p's design (`messages.ts:11-12`).

**M2: resolved for what it claimed.** Any file outside `features/` that holds a port name, a stand-in, a raw SES transport, `demoMessage` or a `.mail` property must now be in the table. Every `.send(`, `.sendIn(` and destructured `send` in such a file is counted exactly, whatever the receiver is called. Of my 15 earlier probes, 9 are now caught: `this.email.send`, `mailer.send`, `m.send`, `port.send(tx)`, `mm.sendIn`, a `.send(` on the next line, a destructured send, and SESv2 with or without its import. A send after `/* … */` is also caught when the file names its port type, because the file must be in the table. The 9 new fail shapes and the exact-count case in a listed file are real fails. The ones still not seen fall under the limit the header now states (text, not types):
* an untyped object with no port name (`sender.send`, `this.d.emails.send`, `this.d.outbox.send`, `this.ports.messagePort.send`);
* an email kept in memory in another shape;
* a `fetch` to a mail API;
* a job enqueued with mail data;
* a `/* … */`-prefixed send in a file that holds no port name.

Each of these needs code written to avoid every port type and name. A new transport would also need STANDARDS §1's gate. Minor, already disclosed: **m4** below.

**m2: resolved.** `qa/built/PF-19r.md` now says "every email send call found in api/src … (two gaps still open; R1.47 stays Partial)" and names the unverified Cognito wiring.
**m1, m3: unchanged.** Both were optional. m1: the walled-pool proof stays manual; it has now been confirmed on three runs (the builder's two, and mine at each head). m3: the log line is moot for this path now, because a platform account row cannot be SUPPRESSED, so no refusal is thrown.
**m4 (new, Minor, no change asked):**
* The scanner's remaining blind spots are listed above. If the guard ever needs to be complete, count call sites by type with the TypeScript compiler.
* "Already have an account" is now outside the consent gate and every suppression list (PF-19p's rule for the sign-up door). The only limit on how often it goes to one address is the in-memory 3 an hour, per process. This is the same exposure the verification code will have under PF-19p's ruling, so it belongs to that ruling, not to this PR.

**Journey score at the new head: 9.5/10, no criterion at 0.**
* Plain words, correct data and trust now score 1: an ExpatReady notice comes from ExpatReady, and the firm has no row and no count.
* Feedback and state stays at 1.
* Error recovery is ½: a bounce or complaint on a platform address has no gate on this path (m4).
* Journey 5 (repeated sign-ups against one firm) now passes: the firm's counter does not move.

No open Blocker or Major.

**Verdict: Approve** (for `371811798084852b890096541adcc0105dd50484`).

## Re-review 2 (a23ea3fd2, diff only)

Read only `git diff 0b85f84ca a23ea3fd2` (P-303): one line in `tests/check_pf19r_every_sender.ts`, `new LocalMail()` → `new LocalMail(() => Date.now())`.
* **Correct.** `LocalMail`'s constructor is `constructor(private readonly now: () => number)` (`api/src/platform/identity/session/mail.ts:14`); the old call with no argument was CI's TS2554. `() => Date.now()` matches the type, and `now` is only read inside `send()`, which this check never calls.
* **The S2 fail case still proves what it claims.** `bindings()` reports `MAIL_PORT` whenever its one provider is not `useExisting: MESSAGES_MAIL`. A `useValue` of a real `LocalMail` instance is exactly the pre-PF-19r part 1 binding, and the clock argument does not change that. The other `new LocalMail()` (line 129, S1) is text inside a string replacement, not a call. It is never type-checked and still matches S1's `/\bnew LocalMail\(/`, so it needs no change.
* **Runs at a23ea3fd2:** `COPY_PREFIX=rr19r run-suites.sh --only check_pf19r_every_sender.ts` PASS, 19 passed, 0 failed. `typecheck.mjs`: "PASS no new type errors (15 known, 0 fixed)". The api project includes `../tests/*.ts`, and web has 0 errors.

No new findings. The earlier score (9.5/10) and the open Minors (m1, m3, m4) stand unchanged.

**Verdict: Approve** (for `a23ea3fd203f296aa2a79e961400e24832848416`).

## Re-review 3 (9c3bfe166, merge resolution, diff only)

Read only `git diff origin/main...9c3bfe166` and `git diff e8fd7ca17 9c3bfe166` for the two suites, the two MODULE rows and `qa/built/PF-19r.md` (P-303). I also read main's `runtime-ports.ts`, `signup.ts:147`, `signup-identity.ts` and `features/platform-firms.ts` on the merged tree.
**Runs at 9c3bfe166:**
* `COPY_PREFIX=rr3 run-suites.sh --only "check_pf19r_every_sender.ts check_pf19r_senders.ts check_pf5_signup_billing.ts check_pf5v_signup_mail.ts"`: **PASS 21/0, 27/0, 54/0, 13/0**. No `rr3_` copy was left running.
* `typecheck.mjs`: "PASS no new type errors (15 known, 0 fixed)" (api 15 known, web 0).
* Eight mutation probes of `check_pf19r_every_sender.ts`, run in a scratch worktree at 9c3bfe166 (removed afterwards, nothing committed).

**Taking main's side: correct and complete.**
* Against `origin/main` (fea4be78f, which contains #2456 as fd97b2ea1), the PR changes no file under `api/src` except the two MODULE rows, and `check_pf5_signup_billing.ts` is byte-identical to main.
* Main already does what M1 asked for. `signup.ts:147` sends `platformAccount: true` with no `firmId`. The stand-in's verification code goes the same way (`signup-identity.ts:42`, `platformAccount: true`). `features/platform-firms.ts` injects `MESSAGES_MAIL` and passes it as the 4th argument.
* The one piece of this PR's intent that is gone is "no mail → 503 SIGNUP_NOT_SET_UP". Main defaults `mail` to `fakeMail()` (PF-5v part 2's design, reviewed there). The app's only caller passes the mail (grep: the feature is the only caller in `api/src`; every other caller is a test), and S2 proves that. The platform MODULE row honestly drops the "keeps the door shut" sentence. Main's own header (`runtime-ports.ts:10-11`, "never a 'check your email' that sends nothing") now reads a little wider than the default does. That is main's file, so it is not this PR's to change.

**STANDIN_DEFAULTS: narrow in text; the default itself is reachable by a new caller (Minor m5).** Probes on `runtime-ports.ts` and around it:
| Probe | Result |
|---|---|
| P1: the feature ignores the injected mail (`runtimeSignUpPorts()`) | 2 S2 FAILs |
| P2: `new LocalSignUp(…)` built without `mail` | S2 identity FAIL |
| P3: the stand-in given `fakeMail()` | S1 + S2 FAIL |
| P4: a 2nd `fakeMail()` default added on the signature line | S2 FAIL (the 4th argument shifts) |
| P6: the allowed signature line copied into another file | S1 FAIL (the allowance is keyed by file) |
| P7: `fakeMail()` in the function body | S1 FAIL |
| P8: the signature reflowed over lines (Prettier) | S1 FAIL (a false alarm, on the safe side) |
| **P5: a new `api/src` file that calls `runtimeSignUpPorts()` with no mail** | **21/0, unreported** |

So the allowance cannot itself let a stand-in into the running app's sign-up binding: S2 calls that factory and checks both `mail` and `identity.mail`. But any new app caller that omits the mail gets `fakeMail()` silently. Before the merge, that caller got a 503. No such caller exists today, so this is a guard gap, not a live bypass. *Fix (optional, small):* add `runtimeSignUpPorts` to a CALLER_GIVES-style rule: any call in `api/src` outside the feature must pass four arguments, or be listed.

**The new and changed checks against their names.**
* **S1 fail (rewritten):** real. It first asserts that the replacement target `clock: systemClock, mail, identity:` exists, so it cannot pass on a no-op replacement. It is then reported as a stand-in. P3 and P7 show the same rule on other shapes.
* **S2 pass (new, the stand-in gets the same mail):** real. It calls the feature's own factory with a fresh sentinel and fails on P1, P2, P3 and P4.
* **S2 fail (new):** weak but harmless (nit). It only checks that a freshly built `LocalSignUp(clock)` has no `mail` equal to the sentinel. It does not run the pass's predicate on a changed factory. P1 and P2 show the pass itself is not blind, so nothing is unproven.
* **signup-identity.ts entry:** `mailSend 1, anySend 1` matches its one line (`this.mail.send` at :42). No `open` entry remains in SENDERS.
* **DW7:** `/account` is main's text (`signup.ts:147`), and the web has `/account` (`account-sections.ts:6`). Pass and fail are unchanged otherwise. The DW7 door swaps in a stand-in with no mail, so DW7 proves only the "already" email. The verification code over MessagePort is proven by S2's new pass and by `check_pf5v_signup_mail.ts` (13/0). Removing "no mail keeps the door shut" was right: under main it would fail. `check_pf5v_signup_mail.ts:62` already covers what the no-mail default does.
* **Nit:** two labels still say "before this PR" for the `fakeMail` era: S2 fail at `check_pf19r_every_sender.ts:213`, and S3 fail ("what sign-up used before this PR"). Both now mean "before PF-5v part 2". The checks themselves are right.

**qa/built text: accurate.** Each claim matches the code:
* parts 1 and 2 as before;
* sign-up's two emails moved with PF-5v part 2 (#2456, merged) as platform account emails from ExpatReady;
* part 3 (#2452) adds the every-sender suite and DW7;
* R1.47 stays Partial for PF-13's logo and colour only (true: the table has no open entry left);
* the deployed custom sender's wiring is "not verified".
The MODULE rows match the suites.

**Journey score:** 9.5/10 stands, with no criterion at 0. This PR now changes no runtime code. The sign-up path that runs is main's, reviewed under #2456. No HTTP journeys were re-run in this diff-only pass.

Open Minors: m1, m3, m4 (unchanged) and m5 (new, optional). Nits: the S2 fail's weak form and the two stale labels. No open Blocker or Major.

Verdict: Approve
