# PF-19b part 2 review: SES behind MessagePort, SNS notices, one-click unsubscribe (runtime, R1 row 28)

Reviewer: Opus 5.5, fresh context (P-303). I did not build this.
* PR #1956, branch `claude/trusting-bardeen-k9pch0`, reviewed commit **4ffd69132**. The PR head `3dfc91b96` adds only `qa/built/PF-19b2.md`.
* Diff: `git diff origin/main...4ffd69132` on `studio/`. 12 files, +630 −14, so under P-610's 800-line cap. No migration; `ports/` unchanged.
* Brief: `lead-b-briefs/PF-19b.md`, "Part 2". 16 Nov 2026. US$0, no AWS call, no real key.
* While I reviewed, the builder's session left uncommitted fixes in this same checkout (`messages.ts`, `ses.ts`, `bounces.ts`, `unsubscribe.ts`, `public-routes.ts`, the test). **I did not review them.** My runs used `4ffd69132`: the suite before those edits, the mutations in a separate worktree, and the copy started before them.

## What I ran
* `check_pf19b2_ses.ts`: **31 passed, 0 failed**. The `--app` walk on my copy `rvpf19b2` on :4437 (never :4400; stopped and dropped afterwards): **6/6**.
* Neighbour suites, all passing:
  * `check_pf19b_sending` 40/0, `check_pf19b_mail` 28/0, `check_pf19a_messages_schema` 94/0
  * `check_pf4b_session_reads` 53/0, `check_pf24_secrets` 84/0, `check_fo3_booking` 133/0, `check_pf5_signup_billing` 53/0
* `graph.mjs --check`: G1 0, G2 0, G4 0, G5 0.
* Live, as a person, on :4437:
  * I invited a staff member: it was TRANSACTIONAL and SENT, with no List-Unsubscribe and the firm's Reply-To.
  * I reset a staff member's two-step: SENT.
  * 10 concurrent one-click POSTs on one token: one 200, nine 404, **1 withdrawal**.
  * Unsubscribing from a SERVICE email withdrew email MARKETING only.
  * The journey test is in `journey-test-reviewer-2026-11-16.md`.
* Mutations (worktree at `4ffd69132`, each reverted):
  * Caught by the suite:
    * no `verify()` → DW10 fails
    * no one-use check → DW12 fails
    * also withdrawing WhatsApp marketing → R28 and DW11 fail
    * no rate limit → DW12 fails
    * no providerId match → DW9 fails
    * MAIL_PORT not bound → DW13 fails
    * headers on transactional mail → SES1 fails
    * soft bounce suppresses → DW9 fails
  * **Not caught:** `named` removed (m5), the class filter removed (m5), either advisory lock removed. My live race shows the unsubscribe lock does hold.

## Done-when lines: a pass and a fail for each
| Line | Pass | Fail | Note |
|---|---|---|---|
| SES adapter by setting, recorded answers | SES1 | SES1 (transactional has no header; MessageRejected) | No timeout on the SES call (M3) |
| SNS signature first; hard bounce or complaint → one suppression | DW9, DW10 | DW9, DW10 | Only on hand-made notices; the real AWS path is M2 |
| One-click: headers, page POST via ConsentPort UNSUBSCRIBE, rate limit, opaque token | DW11, DW12, R28 | DW11, DW12 | Rate limit in production: M4 |
| MailPort → MessagePort TRANSACTIONAL (one line) | DW13 | DW13 | PF-4b side effects: M1, m3 |
| No SES credential in logs or answers | DW14 | DW14 (scanner not blind) | Held |

## Builder's design choices
1. **AES-256-GCM token, HKDF from the PF-24 ring, random key on a local server: agree.**
   * Version byte as AAD; 64 bytes; any change fails the tag.
   * In test and production the ring is required (`settings.ts:92`), so the random key is local only.
2. **One use, detected by a withdrawal row `system:unsubscribe:<outbox>`: agree.** `withdraw` always writes its row (`consent-store.ts:89`). The lock serialises two clicks (live: 1 of 10).
3. **Service mail's link withdraws email MARKETING only: agree.**
   * The page says so, and service email needs no consent (PF-19a).
   * A mail client's one click shows no page. Lead B may want to confirm the brief's "and service mail" (note, not a finding).
4. **SES on test or production with a region; task role, optional Secrets: agree.** PF-24's `PLATFORM_SES_REGION` says "no key".
5. **Match notices by SES tags plus `ses:<id>`; suppress only the row's own address; optional topic allowlist: challenge.** See M2 and m2.
6. **Staff and system mail through MessagesMail (firm Reply-To): agree on the Reply-To. Challenge on the side effects.** See M1 and m3.

## Findings
**M1 (Major, PF-4b rule broken): staff invitation tokens are now kept at rest.**
* PF-4b's rule (`identity/service.ts:317-318`): "the plain token is only in the email's link, never stored or logged".
* MessagesMail stores every rendered body through FilesPort at `msg/<firm>/outbox/<id>.json`. That is S3 in production, with no removal.
* Live, I found `invitation#t=<token>` in that file after one invite.
* The same will hold for Cognito's sign-in and reset codes once `email-sender.ts` is wired.
* **Fix:** ask Lead B for a ruling, which the touch list requires. Either drop or seal a TRANSACTIONAL rendered body once SENT or FAILED (keep `rendered_hash`), or keep identity mail off the stored body.

**M2 (Major): the SNS path cannot work in a real AWS account as wired.** The tests use hand-made notices, not SES's recorded shapes.
* (a) `bounces.ts:64` drops a verified `SubscriptionConfirmation` and never keeps its `SubscribeURL` or Token. AWS confirms an HTTPS subscription only with that token, so no Notification ever arrives (the breaker found this too).
* (b) `bounces.ts:67` acts only when `mail.tags.firm` and `mail.tags.outbox` are present.
  * Per AWS's notification contents, `tags` appear only in configuration-set event publishing (`eventType`), not in identity notices (`notificationType`).
  * `ConfigurationSetName` is never set: `ses.ts:44` is optional, and `channels.ts`/`platform-messages.ts` pass none.
  * So the `notificationType` branch can never act, and real notices answer 200 "ignored". (Unconfirmed against a live account.)
* (c) `public-routes.ts:17` decodes each chunk separately, so a multi-byte character split across chunks breaks the signature (breaker M4).
* **Fix:**
  * Keep or follow the SubscribeURL for an allowed topic.
  * Pass a configuration set, or fall back to matching on `mail.messageId` alone, and record that in MODULE.md.
  * Decode the body after `Buffer.concat`.
  * Add fixtures in SES's real shapes.

**M3 (Major, DW4 under load): a slow SES answer sends twice.**
* `adapter.deliver` runs inside the worker's interactive transaction (`messages.ts:96-125`), which uses Prisma's default 5 s timeout.
* `ses.ts:25` sets no request timeout.
* An SES accept after more than 5 s rolls back, and the retry sends again (breaker M1; confirmed by reading).

**M4 (Major): the unsubscribe rate limit is one bucket for everyone in production.**
* `public-routes.ts:26,33` keys on `req.ip`, and `trust proxy` is not set anywhere in `api/src`. Behind the load balancer, every caller is the proxy.
* So 20 link scans or one-click POSTs a minute block everyone's unsubscribe, which loses CASL unsubscribes (breaker M2).
* **Fix:** limit by the client address the load balancer reports (a trusted hop), or limit by token.

**Minors**
* **m1, raw JSON to a person:** reloading after Unsubscribe, or opening a used link, shows `{"type":…,"title":"Not found"…}` (`public-routes.ts:28,35` → `sendPublicNotFound` answers JSON under `/api/`). The 429 is JSON too. Screenshot (not committed): `scratchpad/shots/second-visit-1440.png`. **Fix:** send an HTML 404 that says the link no longer works and whether that means it is done. EXPERIENCE plain words [M].
* **m2, topic allowlist never wired:** `platform-messages.ts:33` sets no `topics`, so any AWS account's signed topic passes `verify`. The outbox and firm ids still guard it. Require it outside local.
* **m3, two-step reset fails with a 500:** for a staff member with a suppressed address, `identity/session/service.ts:154` gets MessageRefused inside its transaction and answers a generic 500 "Server error". Live, the reset did not happen. Before this PR the answer was 200. Map it to a 409 with plain words, or reset and answer `notified:false`. Ask Lead B: the file is outside the touch list.
* **m4, staff mail under the daily cap:** staff and system mail now counts toward the trial cap (50 a day). A held invitation answers `emailed:true`. A ruling for Lead B: should TRANSACTIONAL identity mail be outside the cap?
* **m5, tests that do not fail when their rule goes:**
  * DW9 "address the message was not sent to" counts `someone.else` (`check_pf19b2_ses.ts:199-200`). The code would suppress the row's address. Count `x9n` instead.
  * DW12 "a transactional message's" token is refused by the no-person check, not by the class filter (`unsubscribe.ts:83`). Use a transactional row that has a person.
  * Neither lock is raced in the suite.
* **m6, smaller hardening (agree with the breaker's m2–m5 and m8):**
  * Bodies over 64 KB are refused, while SNS allows 256 KB.
  * `rawText` has no abort or error handler.
  * Some malformed signed notices give a 500.
  * `hits.clear()` at 50,000 entries resets every IP's limit.
  * A permanent SES refusal is retried forever.
* **m7, process:**
  * The PR body still says "Plan and tests: filled in at the next push". The named tests DW9–DW14 are not listed first (P-606), and there are no suite results or "On the demo".
  * The touch list grew without a "Question for the tech lead": `demo-inbox.ts`, `send/channels.ts`, `features/platform-messages.ts`, and `platform-staff-read.ts` in place of the `session/mail.ts` adapter. The changes are justified and small.
  * The walk's comment (`check_pf19b2_ses.ts:53`) says "the running app's own MessagePort sends it", but the walk builds its own `Messages`.

**Held:**
* Firm walls: `firmScope` on every outbox, withdrawal and event read; the GCM tag stops a token from naming another firm.
* No SES credential in errors (name and status only), logs or answers (DW14).
* A GET never withdraws.
* Withdrawing one purpose keeps the others (R28; live).
* Concurrent clicks give one withdrawal.
* Transactional mail carries no header.
* Booking mail (FO-3) and PF-5 are unchanged.

## Scorecard
* D1–D20 and BIC-01–BIC-20: **N/A**. This is a platform row with no Studio screen. Its only page is the public unsubscribe page, which is scored in the journey test.
* D17 and D20 are simulated only: no intended user walked it.
* Journey score: **7.5/10, below the pass bar** (`journey-test-reviewer-2026-11-16.md`).

## Not checked
* A live SES or SNS account: the AWS shapes in M2 come from AWS documentation.
* A real screen reader.
* CI on this head: the PR is still a draft.
* The builder's uncommitted fixes.

**Verdict: Block, changes needed**
* Blockers: none.
* Majors: M1, M2, M3, M4.
* Minors: m1–m7.
