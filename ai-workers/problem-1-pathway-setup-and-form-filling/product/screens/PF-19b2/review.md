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

**First review, at `4ffd69132`: Block, changes needed** (superseded by the re-review below)
* Blockers: none.
* Majors: M1, M2, M3, M4.
* Minors: m1–m7.

## Re-review at `d460651e1` (diff only, P-277)

**Scope:** `git diff 4ffd69132..d460651e1` on `studio/`: 7 files, plus the test.
* The whole row is now +733 −13 against main, still under P-610's cap.
* The checkout was clean at `d460651e1`.

**What I ran:**
* Suite **42/42**.
* Neighbour suites, all passing: `check_pf19b_sending` 40/0, `check_pf19b_mail` 28/0, `check_pf4b_session_reads` 53/0, `check_fo3_booking` 133/0, `check_pf23w_jobs_wired` 31/0.
* The `--app` walk passed **6/6** on my copy `rvpf19b2b` on :4437 (with the reference header in place), which I stopped and dropped afterwards.
* Mutations in a worktree at `d460651e1`, each reverted. **Every one fails a named test:**
  * no 60 s transaction → DW4 slow
  * decoding chunk by chunk → M4
  * no unsubscribe lock → DW12 race (5×200)
  * no notice lock → DW9 race
  * `named` removed → DW9 "neither address"
  * class filter removed → DW12 forged
  * SubscribeURL taken from any host → M3

**Findings, one by one:**
| Finding | Status | Evidence |
|---|---|---|
| M1 tokens at rest | **Closed by ruling** | `platform-staff-read.ts` matches main exactly. Live: an invite writes 0 outbox rows and 0 files containing `invitation#t=`. Lead B's ruling (PR comment, rev 16.64) moves the switch and sealed TRANSACTIONAL bodies to PF-19e. The PR body has the "Known gaps" line. DW13 tests MessagesMail and holds the binding. |
| M2(a) confirmation | Fixed | `bounces.ts`: a verified confirmation from our topic visits `SubscribeURL` (SNS's https host only); with no topic list the URL is logged; any other host gives 400. Tested both ways; live, an unsigned confirmation gives 400. |
| M2(b) tags only | Fixed | `ses.ts` adds `X-Expatready-Ref: <firm>/<outbox>`. `bounces.ts` falls back to `mail.headers` (SES "include original headers"). It still needs `ses:<messageId>` on the row. Tested with and without the header. |
| M2(c) chunk decoding | Fixed | `public-routes.ts` `rawText` joins the buffers and decodes once (300 KB cap; `error`/`aborted`/`close` settle it). Split inside "é" → 200. |
| M3 slow SES double send | Fixed | `DELIVER_TX_MS` is 60 s, above the SDK's 20 s request and 5 s connect timeouts. A 6 s answer gives one call and SENT; a rerun is skipped. At-least-once after a crash stays as a Lead B note. |
| M4 shared IP bucket | Fixed | The limit is per link (outbox id). A token that does not open answers 404 with no query and is not counted; brute force is infeasible against the 128-bit GCM tag. Map pruning keeps live entries. |
| m1 raw JSON | Fixed | 404 and 429 are HTML. Live: reload after pressing, and a revisit, show "This page is not available. Check the address, or contact the firm that sent it to you." |
| m3, m4 (PF-4b side effects) | Gone with M1 | Live: a two-step reset of a suppressed staff address → 200. Lead B set PF-19e's rules (exempt from the cap; 409, never 500). |
| m5 tests | Fixed | Mutations above. |
| m6, m7 | Fixed, or open as notes | 300 KB cap, abort handling, uuid check, certificate fetch error → 400, pruning, walk comment fixed. The PR body now lists DW9–DW14 first, with "On the demo" and Questions. |

**Still open, Minor (not blocking):**
* **n1, ids in a header plus no topic list (raises m2).** Every SES email now carries the firm and outbox ids in clear (`ses.ts`, `REF_HEADER`), and its `Message-ID` carries the SES id. With no topic setting (`platform-messages.ts` builds `SesNotices` without `topics`), anyone holding one of the firm's emails (a forward, for example) can use their own AWS topic to get a genuinely signed complaint. That suppresses the address the email went to, at that firm. Close this before SES is switched on in test or production: add the topic setting and refuse notices outside `local` when no topic list is set. Lead B already has m2 as a note; this raises its priority.
* **n2, a used link does not say "done".** It shows the generic not-found words, so a person cannot tell they are already unsubscribed. The status (404) is the brief's rule. A sentence such as "If you pressed Unsubscribe, it is done" would close it.
* **n3, notes for Lead B, as the builder lists them:** permanent SES refusals are retried hourly (part 1's policy), and delivery is at least once after a crash.

**Journey re-score: 9/10, pass.**
* Each criterion scores 1 except **feedback ½** (n2) and **visual ½** (a bare page with a browser-default button).
* Changes from 7.5: plain words, error recovery and accessibility each go from ½ to 1. The reasons are the HTML 404 and 429, no 500 on a reset, and `overflow-wrap`.
* axe found 0 violations at 400 and 1440 px and on the done page, with no sideways scroll at 200 %. Keyboard only works. The page loads in 36–41 ms. Ten concurrent clicks give one withdrawal.

**Not checked:** a live SES or SNS account (the header fallback assumes "include original headers" is on, which the team sets up once), a real screen reader, and CI on this head.

Re-review 1 verdict: Approve (head `d460651e1`), superseded below
* Blockers: none.
* Majors: none open. M1 is closed by Lead B's ruling (moved to PF-19e); M2, M3 and M4 are fixed with fail tests.
* Minors: n1 (close before SES goes live), n2, n3.

## Re-review 2 at `5d4169833` (diff only, P-277)

**Scope:** `git diff 2c502177f..5d4169833`: 4 files, +15 −4.
* The whole row is +744 −13 on `studio/`, under P-610's cap.
* Suite **44/44** at this head; both new checks pass.

**What changed:**
* **`ses.ts`: a `sender` option.** Without one, `deliver` throws "no verified sender is set" before any SES call (the test checks that no request went out). With one, From is `<firm name> <sender>`. This replaces the Sample `PLATFORM_FROM`, which SES would refuse. The app passes no sender, so SES fails closed. **Agree.** At `d460651e1`, the outcome in test or production was the same: SES would refuse the address and the row would stay `QUEUED`. Now it is explicit and costs no SES call.
* **`bounces.ts` and `platform-messages.ts`: `requireTopics` when `PLATFORM_ENVIRONMENT` is not local.** With no topic list, even a signed notice is refused (400). The check comes before the certificate fetch, so there is no outbound call. **This closes n1:** a notice from another AWS account's topic is never trusted outside local, so the ids in `X-Expatready-Ref` cannot be used to forge a complaint. On a local server the topic list stays optional, as before.

**Notes (Minor, not blocking):**
* **n4, PR body out of date.** Known gaps does not yet say that on test and production nothing is emailed and every notice is refused until the sender and topic settings exist. Mail there stays `QUEUED` and is retried (part 1's policy). Those settings need a PF-24 follow-up row. The "What and why" text still says "optional topic allowlist" and "with no topic list its URL is logged", which is now true only on a local server.
* **n2 and n3 stand as written above.**

Re-review 2 verdict: Approve (head `5d4169833`), superseded below
* Blockers: none.
* Majors: none.
* Minors: n2, n3, n4 (PR body lines; no code change needed).

## Re-review 3 at `5b06fedf1` (diff only, P-277)

**The merge (`390ba87f9`, origin/main `c0896290d`; P-270, made because of a conflict).** Against main, `api/src/platform/MODULE.md` changes only by this row's additions: the Entry points text, one invariant, and `check_pf19b2_ses.ts` on the Tests line. Main's `check_pf12_walls.ts` is kept, and nothing of main's is lost (word diff). The row is still +744 −13 on `studio/`.

**`5b06fedf1` (+6 −2): PF-12's walls.**
* `unsubscribe.ts` `find()` calls `enterFirm` with the firm from the sealed token (the GCM tag means it cannot be forged) before its first query. `confirm()` calls it before `$transaction`, so the transaction opens as that firm.
* `bounces.ts` calls `enterFirm` with the firm from the verified notice, after `verify()` (signature, plus a topic list required outside local) and before the transaction. The outbox row must still match firm, id and `ses:<id>`, and suppression is still that row's own address.
* No bypass and no new `BYPASS_USES` entry. **Agree:** each door runs as the firm its proof names, which is the least it can have.

**What I ran:**
* `check_pf19b2_ses` **44/44**; `check_pf12_walls` **100/100**.
* Walk on my copy `rvpf19b2c` on :4437, with the walls on: **6/6**.
* Live probe on that copy, under the walls:
  * 10 concurrent one-click POSTs on one link: 200 ×1, 404 ×9, 1 withdrawal.
  * A service email's link: page 200, POST 200, 1 withdrawal.
  * A junk notice: 400.
* The copy was stopped and dropped afterwards.
* I trust the builder's "walk fails without `enterFirm`" as stated; I did not re-run that mutation.

**Notes (Minor, not blocking):**
* **n5, the notice door's `enterFirm` is untested in a request.** It runs only outside a request scope in the suite, and a live signed notice needs a real SNS certificate fetch. By reading, the order is right: verify, then `enterFirm`, then the transaction.
* **n6, an edge case on a firm's own web address.** If a request already scoped to firm A (that firm's web address) carries firm B's link, `enterFirm` throws `notInFirm()` from inside `find()`. That likely answers the JSON not-found rather than the HTML page. This is unlikely in practice: the links use ExpatReady's own `STUDIO_PUBLIC_URL` host, never a firm address.
* **n2, n3, n4** stand as above.

Re-review 3 verdict: Approve (head `5b06fedf1`), superseded below
* Blockers: none.
* Majors: none.
* Minors: n2–n6.

## Re-review 4 at `40f6f14de` (a merge only, P-277)

**The merge** (`ca328fbe7` + origin/main `5932cf516`; P-270, made because of a conflict) is a clean resolution.
* `git diff 5932cf516 40f6f14de -- '*api/src/platform/MODULE.md'` (word diff) shows only this row's own additions: the PF-19b part 2 Entry-points text, one invariant line, and `check_pf19b2_ses.ts` on the Tests line.
* Main's lines are all kept. `PF-6r: GET roles (the six starter roles, …)` and `check_pf5v_signup_mail.ts` are both in the file.
* This row's code is identical to `5b06fedf1`: no difference in `messages/`, `features/platform-messages.ts` or the suite.
* Main brought in PF-6r, PF-5v and FO-4sf code. None of it touches the sending path (`signup.ts` changes field checks only).
* The row is +748 −13 against main on `studio/`, under P-610's cap.

**What I ran on the merged head:** `check_pf19b2_ses` 44/44, `check_pf5v_signup_mail` 7/7, `check_pf19b_mail` 28/28.

The Minors n2–n6 stand as above.

Re-review 4 verdict: Approve (head `40f6f14de`), superseded below
* Blockers: none.
* Majors: none.
* Minors: n2–n6.

## Re-review 5 at `bef00cb6e` (diff only, P-277)

**Scope:** `git diff 132f3e11c bef00cb6e`: 2 files, +5 −6. The row is now +748 −14 on `studio/`, under P-610's cap.

**The change:**
* **Two lists in `tests/check_forms_qa53.ts`.**
  * The unsubscribe page joins REVIEWED as "open": its sealed token is the key, and it changes nothing.
  * The unsubscribe POST and the SNS notice door join PUBLIC_WRITES. Those writes answer 404 to an unknown token and 400 to an unverified notice, both asked in `check_pf19b2_ses.ts`.
  * **Agree.** These are exactly this row's two public doors. The list stays in sorted order, which the check compares exactly. No other route was added, and no check was loosened.
* **`public-routes.ts`, written where the scan can read it.**
  * The page route's decorators now sit on one line, with no parentheses in the reason.
  * The notice path is the literal `"messages/ses-notices"`, which equals `NOTICE_PATH` minus `/api/public/`. The unused import is gone.
  * **No change in behaviour** (read line by line).

**What I ran:**
* `check_forms_qa53` **42/42** on my copy `rvqa53` on :4437, run as its usage line says; stopped and dropped afterwards.
* `check_pf19b2_ses` **44/44**.

**Note (cosmetic, no action):** the PUBLIC_WRITES line now carries two `//` comments, so PF-4b's note trails ours.

The Minors n2–n6 stand as above.

Verdict: Approve (head `bef00cb6e`)
* Blockers: none.
* Majors: none.
* Minors: n2–n6.
