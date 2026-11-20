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
