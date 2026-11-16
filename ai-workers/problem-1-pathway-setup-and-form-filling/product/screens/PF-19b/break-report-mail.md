# PF-19b booking mail: break report (MessagesMail, demo inbox attachments)

Breaker, 15 Nov. Commit `4275ff548` on `claude/great-thompson-b4rfib` (PR #1860). Scope: the brief's six attacks on `api/src/platform/messages/send/mail.ts`, the booking service's mail calls and `GET /api/demo/platform-inbox` attachments.
How: the PR's own suite, copied to the session scratchpad with only the Postgres path changed, passes 16/16. A scratch attack script was built on the same setup: every migration, the real `BookingService` with `runtimeBookingPorts(MessagesMail)`, `fakeJobs` + `FakeClock`, `LocalFiles`, the real `ConsentStore`. It ran on its own database `xr_studio_pf19bm_<pid>` on 127.0.0.1:54329, which was dropped afterwards. HTTP and the real pg-boss ran on an isolated copy `brkmail` on :4497 (demo workspace), which was stopped with its database and files removed. Never :4400. US$0, nothing sent out. No code changed.
Note: at 19:37, after these runs, another session left uncommitted edits in this checkout (`mail.ts`, `service.ts`, `ports/mail.ts`, `demo-inbox.ts`: an `idempotencyKey`, a check before any file is stored, and a 64 KB text cap). Everything below is about `4275ff548`. The edits were read but not tested.

**Result: 0 Blocker, 2 Major, 5 Minor.**

## Breaks

**M1 (Major): one booking email becomes two when its job runs twice.** `mail.ts:26,31` (`idempotencyKey: \`mail:${mailId}\``, with `mailId = randomUUID()` on every call)
* Steps: book (`dup@client.example`) and run the jobs; there is 1 row and 1 mail. Then run the same `booking.mail` job again for the person and for the host (`attempt: 2`, the same key). PF-14 runs a job at least once: after a crash, or after a stop with the handler still running, it is retried (`pgboss-jobs.ts:142-144`: "a handler must be idempotent").
* Actual: the booker has 2 outbox rows and 2 mails in the inbox, with **2 different manage links**, and 3 live tokens. The host has 2 rows. Two runs at the same time (`Promise.all`) give one email each: 3 rows from 1 normal run and 2 parallel runs.
* Should: the same job sends one email. The header claim "one email is never two rows" (`mail.ts:8`) holds only when dispatch fails. STANDARDS §3: "[M] Idempotent creates and job launches".
* Fail-test: run `runMail` twice with one `JobRun`, and expect 1 `msg_outbox` row for the address and 1 live mail token.
* Note: in the uncommitted edit, `runMail` still issues a new token (`mailToken`) before the repeated send answers the first row. A redelivery would leave one more live link that nobody received.

**M2 (Major): an address the booking form accepts puts the booker's email address into the job store.** `ports/consent.ts:45,55`, reached from `mail.ts:29`; stored by `pgboss-jobs.ts:318`
* Steps (HTTP, :4497): `POST /api/public/firms/brk-a/book/free/bookings` with `email: "ana.sample@client-.example"`. The booking schema's `z.email()` accepts it (`service.ts:106`), but `EMAIL_KEPT` refuses a domain label that ends in `-`.
* Actual: 201 booked. `booking.mail` (person) fails 4 times and ends `failed`. `normaliseAddress` throws a `ZodError` built with `input: raw`, so its message is `[{"code":"custom","path":["address"],"message":"not an email address","input":"ana.sample@client-.example"}]`. PF-14 keeps that message on the job (`platform_jobs.job.output`, the address in plain text) and the dead-letter list reads it from there (`toDeadLetter`, kept a year). The app's log line does redact it to `[email]`. The booker never gets a confirmation, and nothing tells staff why.
* Before this PR, `fakeMail` never ran `normaliseAddress`, so this is new. STANDARDS §4: "[M] Personal data minimised and never logged".
* Should: MessagesMail refuses with an error that carries no address (and does so before the booking, or when it is made). The job store holds ids only, as `pgboss-jobs.ts:39` says.
* Fail-test: send to `x@client-.example`, and expect the thrown message not to contain the address.

**m1 (Minor): a suppressed booker is retried 3 more times, with a new row, a new token and a new file each time.** `mail.ts:33` throws, `service.ts:517-520` rethrows
* Steps: suppress `supp@client.example` (COMPLAINT), book with it, and run its mail job 4 times. This was also run on the real pg-boss on :4497.
* Actual: 4 `SUPPRESSED` rows, 5 tokens (4 issued and each correctly voided), 4 orphan `invite.ics` files, then a `failed` job on the dead-letter list. A suppression is a final answer, not a failure to retry, and the header's "throws only when nothing will be sent, so the caller's job retries only then" makes that loop. Fail-test: 1 row after the retries.

**m2 (Minor): a mail suppressed by the worker leaves its link live.** `service.ts:511-520`
* Steps: run the person's mail job (the row is `QUEUED`), add a HARD_BOUNCE suppression, then run the worker.
* Actual: the row is `SUPPRESSED` at delivery and the email was never sent, but the token issued for it stays live until the meeting ends. It is low risk because nobody holds the link.

**m3 (Minor): cleaning attachment names loses or collides names, and some names fail the email with an untyped error.** `mail.ts:17`
* Actual (each one a `mail.send` with one or two attachments):
  * `notes.meta` and `NOTES.TMP` give `Error: file key may not end in .meta or .tmp`: a plain `Error`, not `MessageRefused`. So do `"a"×115 + ".metaxxxxxxxxxx"` and `"b"×116 + ".tmpcc…"`: the 120-character cut lands on `.meta`/`.tmp`.
  * `日本語.pdf` becomes `pdf`, and `résumé.pdf` becomes `r-sum-.pdf`.
  * `日本.pdf` + `中国.pdf`, and `Invite.ics` + `invite.ics`, give `FileKeyTaken`, and the whole email fails.
  * `"a"×130 + ".ics"` loses `.ics`.
  * The same file twice is listed twice.
* No caller hits this today: booking sends only `invite.ics`. Should: keep the extension, keep names apart (index them), and refuse with `MessageRefused`.

**m4 (Minor): MailMessage accepts what MessagePort refuses; the files are already stored and the error is untyped.** `mail.ts:28` (put) before `:29` (send); `ports/mail.ts:24-26`
* Actual: a subject with a tab, or text over 100 000 characters, gives a `ZodError` (not `MessageRefused`) after the attachment was written, leaving an orphan file. An unknown firm id gives `MessageRefused`, but its file stays under `<root>/<that uuid>/mail/…`, a folder of a firm that does not exist. There is no byte limit on `MailAttachment.bytes` or `html`. The uncommitted edit adds a check of `MessageSend` first. That check does not run `normaliseAddress`, so M2 stays.

**m5 (Minor): the demo inbox answers without a size bound.** `demo-inbox.ts:26,36`; `ports/mail.ts:17`
* Steps: 3 mails to `huge@client.example`, each with 10 × 8 MB `text/plain` files, then `list()`.
* Actual: 251 MB of JSON in 237 ms, and the process at 711 MB RSS. `take: 50` allows about 4 GB per request on an open (`@OpenRead`) route. Only internal callers can make such files today. The uncommitted edit caps the text at 64 KB, but not the count or the size of the files read.

## What held
* **Dispatch fails after commit:** `send` does not throw, there is 1 row, and the sweep sends it once. The log line carries the outbox id and the error name, never the address (BM4, repeated).
* **Link voided when send throws:** every refused send (m1, M2) voided its own token. The booking's own manage token was untouched.
* **Class and person:**
  * SERVICE and MARKETING with no person are refused before anything is written (0 rows).
  * MARKETING with a person who has no consent gives `SUPPRESSED NO_CONSENT: MARKETING`.
  * SERVICE and TRANSACTIONAL to a suppressed address give `SUPPRESSED: COMPLAINT`; nothing is in the inbox.
* **Path tricks:**
  * `../../etc/passwd` and `..\..\x` are refused by the schema (`ZodError`).
  * `..`, `...` and `-` become `file`.
  * A NUL and a right-to-left override are cleaned to `-`.
  * Empty bytes are refused.
* **Firm isolation:**
  * Files live under `<root>/<firm>/mail/<id>/`.
  * Firm B attaching firm A's key is refused (`MessageRefused … is not a file of this firm`).
  * An address mailed by both firms shows each message with its own firm's attachment text and sender.
* **Demo inbox access:**
  * The non-demo workspace gets 404.
  * `x-actor: client`, `client-b` and `user-P` get 403 (the earlier m1 is fixed). `CLIENT`, `user-p` and ` user-P` get 200, but `actorOf` matches exactly, so these are unknown names and not a bypass.
* **Logs:** the app's job error line redacts the address (`"input":"[email]"`). Only the job store keeps it (M2).
* **Non-English text:** `Rendez-vous confirmé — 予約` and `Bonjour Zoë, 予約が確定しました。` come back unchanged.
* **The real app (:4497):** the dependency wiring starts. A booking made over HTTP is SENT to the booker (TRANSACTIONAL, FO_PERSON) and to the host (SERVICE, STAFF), each with `invite.ics` (`text/calendar; method=REQUEST`) in the inbox over HTTP.
