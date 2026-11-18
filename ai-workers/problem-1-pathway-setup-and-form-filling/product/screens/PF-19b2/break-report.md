# PF-19b part 2: break report (SES adapter, SNS notices, one-click unsubscribe)

Breaker, 16 Nov. PR #1956, branch `claude/trusting-bardeen-k9pch0`. Code at `4ffd69132`; the checkout was `3dfc91b96`, which adds only the qa note and screenshots. Scope: the brief's DW3, DW4, DW10 and DW12, plus the caller's list.
**How I tested:**
* A scratch script in the session scratchpad, built like `tests/check_pf19b2_ses.ts`: every migration, Sample firms, `fakeJobs` and `FakeClock`, a real `ConsentStore`, recorded SES answers through the SDK's `requestHandler`, and a run-made RSA key standing in for the SNS certificate. It ran on its own database `xr_studio_brk19b2_<pid>`, which was dropped afterwards.
* HTTP checks ran on the isolated copy `breaker_pf19b2` on :4592, which was stopped afterwards (database and files removed). Never :4400. No AWS call and no real email. US$0. The PR's suite still passes 31/31. No code changed.

**Result: 0 Blocker, 4 Major, 8 Minor.** DW3, DW10 and DW12 held as written. DW4 held for a job run twice. It fails when SES answers slowly (M1).

## Breaks

**M1 (Major): a slow SES answer sends the same email twice (DW4).** `api/src/platform/messages/send/messages.ts:96`, `:120`
* Steps: queue one transactional email. The recorded SES answer is a 200 that arrives after 6 s. Run `deliver()`, then run it again (the job's retry, or the sweep's job).
* Actual:
  * The first run calls SES once, then throws `Transaction API error: A query cannot be executed on an expired transaction`. The row is still `QUEUED` with no `providerId`.
  * The second run answers `sent`. That makes 2 SES calls, both to the same `To` address.
* Why: `adapter.deliver` runs inside Prisma's interactive transaction, which has the default 5 s timeout and sets no `requestTimeout` on the SES client. The transaction also holds the row lock and the firm's `msg_send_counter` row lock (`FOR UPDATE`). So one firm's sends queue behind each SES round trip, and the time spent waiting counts toward the 5 s. pg-boss then retries 3 times (`DEFAULT_RETRY`), and the sweep runs every hour. A process crash between SES accepting the email and the commit has the same effect.
* Should: SES accepts a message at most once per outbox row. Options: a claimed `SENDING` state committed before the call, and an SDK timeout well under the transaction's timeout.
* Fail-test: the steps above, expecting exactly 1 SES call.

**M2 (Major): the unsubscribe rate limit is one bucket shared by everyone.** `public-routes.ts:26`, `:33`; `api/src/main.ts:246`
* Steps (HTTP, :4592): send 20 GETs of `/api/public/unsubscribe/junkN`, each with a different `X-Forwarded-For`. Then send a real person's one-click POST (`List-Unsubscribe=One-Click`).
* Actual: the junk GETs get 404 ×20. The real POST gets **429**, and 0 withdrawals are recorded.
* Why: the app listens on 127.0.0.1 behind the load balancer (`host.ts:77` says so), and `trust proxy` is not set. So `req.ip` is the proxy's address for every caller.
* Impact: Gmail's and Yahoo's one-click POSTs after a marketing send would alone pass 20 a minute, and those unsubscribes are lost. Spoofing `X-Forwarded-For` does not get past the limit (that part held).
* Should: limit by the client address that the load balancer reports (a trusted hop count), or limit by token.
* Fail-test: the steps above, expecting 200.

**M3 (Major): the SNS subscription can never be confirmed, so no bounce or complaint notice ever arrives.** `channels/email/bounces.ts:63-64`
* Steps: post a correctly signed `SubscriptionConfirmation` to the notice route.
* Actual: 200 `{"result":"confirmation"}`. The `Token` and `SubscribeURL` are not stored, logged or shown anywhere: no printed line, no `msg_event` row.
* Why it matters: AWS confirms an HTTPS subscription only with that token, through its `SubscribeURL` or `ConfirmSubscription`. Without it the subscription stays pending, SNS never sends a `Notification`, and DW9 never happens in production. The code comment says the team subscribes the topic once in the AWS console. Unconfirmed: this is from AWS's documentation; I did not try it live, because no AWS calls were allowed.
* Should: on a verified confirmation from a configured topic, either keep the `SubscribeURL` where our team can reach it, or follow it.

**M4 (Major if SNS sends raw UTF-8): a genuine notice with non-English text is refused when its body arrives in two chunks.** `public-routes.ts:17`
* Steps: sign a real bounce whose `mail.commonHeaders.subject` is "Séminaire de printemps". Feed the route a `text/plain` body split inside the `é`, then the same body in one chunk.
* Actual: the split body gets **400** and nothing is suppressed. The one-chunk body gets 200 and suppresses the address.
* Why: `rawText` calls `toString("utf8")` on each chunk separately, so the split character becomes U+FFFD and the signature no longer verifies. Real bodies of 2 to 6 KB often arrive in more than one chunk. Unconfirmed: whether SNS escapes non-ASCII as `\u` sequences.
* Should: join the Buffers, then decode once.

**m1 (Minor): a notice from any AWS account's topic is accepted.** `api/src/features/platform-messages.ts:33` builds `SesNotices` without `topics`.
* Steps: sign a complaint under `TopicArn arn:aws:sns:ca-central-1:999999999999:someone-elses-topic`.
* Actual: `applied`, and the address is suppressed. Anyone can get real SNS signatures from their own topic. Exploiting this also needs the firm id, the outbox id and the SES message id, and recipients never see the outbox id, so it stays Minor.

**m2 (Minor): a genuine notice over 64 KB is refused.** `public-routes.ts:17`
* Actual: an 89,874-byte signed bounce (SES with its original headers) gets 400, and nothing is suppressed. SNS allows 256 KB.

**m3 (Minor): a notice body that never ends never settles.**
* Actual: `rawText` listens only for `data` and `end`. When the client goes away, no `aborted`, `error` or `close` handler ends it, and the handler was still pending after 1.5 s.

**m4 (Minor): some odd notices give a 500 instead of 400.** `bounces.ts:71`; `public-routes.ts:45`
* Actual: a signed notice whose outbox tag is 36 dashes passes the id check. The query then fails with `PrismaClientKnownRequestError`, which the route re-throws (500). A network error while fetching the certificate (a `TypeError` from `fetch`) also re-throws.

**m5 (Minor): the rate limit is cleared for everyone after 50,000 addresses.** `channels/email/unsubscribe.ts:74`
* Steps: block one IP, then let 50,001 other addresses (an IPv6 /64 has enough) try once each.
* Actual: the blocked IP is allowed again.

**m6 (Minor): a person sees raw JSON after unsubscribing.** `web-address/host.ts:35-36`
* Steps: press Unsubscribe, then reload (the browser POSTs again) or open the used link.
* Actual: the page shows `{"type":…,"title":"Not found",…,"detail":"This page is not available."}`. `sendPublicNotFound` answers JSON for `/api/` paths, so the person cannot tell whether they are unsubscribed. The 429 is JSON too. The 404 itself is the brief's rule. Screenshot: scratchpad `brk/reload-after-post.png` (not committed).

**m7 (Minor): a long firm name breaks the page layout at 200 % zoom.**
* Actual: at 512 CSS px, an unbroken 160-character firm name scrolls the page sideways, because the heading and text have no `overflow-wrap`. Normal names fit. Scratchpad `brk/page-200pct.png`.

**m8 (Minor): every SES refusal is retried, permanent ones too.** `channels/email/ses.ts:98-101`
* Actual: every SES error, permanent ones such as `MessageRejected` included, leaves the row `QUEUED`. pg-boss retries it 3 times, and then the sweep picks it up again every hour, with no end and no `FAILED` state.

## What held
* **DW3:** a send in a transaction that rolls back, even with `dispatch` called inside it, gives 0 SES calls and 0 rows (after the sweep as well).
* **DW4 (job run twice):** three `deliver()` calls on one row at the same time answer `sent`, `skipped`, `skipped`, with 1 SES call.
* **DW10:** on the running copy, the door is open without a session.
  * Refused with 400: junk text, `{}`, `[1,2]`, 1 MB of text, a urlencoded body, and a certificate over http.
  * 6 MB of JSON gets 413, and a GET gets 404. Nothing is stored for any of them.
* **DW12:**
  * 10 POSTs of one token at the same time give one 200, nine 404s and 1 withdrawal.
  * A freshly minted second token for the same message gets 404.
  * Odd tokens get 404: 5,000 characters, an RTL override, 86 `A`s, and `..%2F` path tricks.
* **Wrong firm or address:** a signed bounce tagged with firm B for firm A's message is ignored, and so is a 5,000-character SES id.
* **One purpose only:** after an unsubscribe, WhatsApp service and WhatsApp marketing are still allowed, and only email marketing is withdrawn. Unsubscribing from a SERVICE email returns 200. A marketing email still queued for that person then ends `SUPPRESSED` ("WITHDRAWN: MARKETING") with 0 SES calls.
* **DW14:**
  * An SES transport error whose text quotes the signed request headers becomes only `messages: SES did not take <id> (TimeoutError)`.
  * No key id, secret or key-ring value appears in any printed line.
  * `api.log` records the route template, never the token.
* **The page:**
  * A firm name of `<img src=x onerror=…>` is escaped, and Chinese and French text shows correctly.
  * Keyboard only: Tab lands on Unsubscribe, and Enter gives 200 "You are unsubscribed". The layout holds at 1024 px.
  * Back after unsubscribing records nothing more: 1 withdrawal.

Not applicable to this row: uploads, hierarchy, the 100-program budgets and roles. The two doors are public, and a staff header changes nothing.
