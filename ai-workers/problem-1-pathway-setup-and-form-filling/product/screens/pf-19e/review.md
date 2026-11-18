# PF-19e review: sealed transactional bodies; staff and system mail on the one send path

Reviewer (P-303, Opus, did not build it), 18 Nov 2026. Head `86e3063995c76e0ed0be6b3e40e3748ab61c41e4`, diff `2aa433a4e..86e306399` only (PF-19p base). This is a runtime row, so I checked the code against the brief (Lead B, `c5bf956f9:…/lead-b-briefs/PF-19e.md`), `RULES.md`, `STANDARDS.md` and `api/src/platform/MODULE.md`. D1-D20 and the BIC table do not apply: there is no new screen and no web change. Journey test: `journey-test-reviewer-2026-11-18.md` (score **8/10**).

## What I ran
* `tests/check_pf19e_sealed_bodies.ts`: **28 passed, 0 failed**, the same as the builder.
* Mutations, each undone with `git checkout` afterwards (the tree is clean). Each one turns its rule's test red:
  * sealing removed in `storedBody`: 5 FAIL (DW1 and DW2);
  * cap exemption removed in `deliver`: 5 FAIL (DW3, DW1 and DW5);
  * the `system:` refusal removed in `Messages.send`: 1 FAIL (DW3 claim);
  * per-address limit removed: 2 FAIL (DW3).
* Other suites at this head, all green: PF-19b sending 42/0, PF-19b2 SES 44/0, PF-19b mail 29/0, PF-19p 68/0, PF-19a 94/0, PF-6m 12/0, PF-4b 55/0, plus PF-4c and PF-12 (results in the journey report).
* An isolated copy on :4431 (runtime ports), with local identity and the Sample seed:
  * invite: the demo inbox shows the link, the stored file is sealed, no `#t=` in `api.log`;
  * 6 resets: 200×5 then 429 with the sentence;
  * suppressed reset: 409, audit line without the address;
  * suppressed invite and resend: 409; batch row: emailed flag.
* A browser walk at 1024 and 1440 px.
* A reset storm script (scratch only, not committed).
* Caveat: someone else (the builder, in this same working copy) began uncommitted edits to `messages.ts`, `system-mail.ts`, `session/service.ts` and the PF-19e test at 18:07 UTC. Everything above other than those suites ran at the reviewed head (18:00-18:06). The suites that ran after 18:07 (PF-4b, PF-4c, PF-12) may have included those edits. This review covers commit `86e306399` only.

## Checks asked for
* **Seal format: holds.** `body-seal.ts:234`: each part's owner is (firm or the platform space, `msg:<outbox>:<n>:<total>`, `message-body`). The AAD and the per-firm HKDF key bind all of it, so a part moved, reordered or dropped is refused. The hash is the sealed bytes' hash (`messages.ts:137,159` store `put.sha256` of `storedBody`; DW1 checks it).
* **Nothing opened is logged: holds.** `opened()` and the demo inbox swallow the error (V8's JSON SyntaxError quotes input, so this matters). `MailSuppressed` and `SystemMailLimited` messages hold no address. The two audit lines carry ids only (seen in the database).
* **The exemption cannot be claimed: holds.** `Messages.send` refuses `system:` after parse (`messages.ts:402`). No other writer of `msg_outbox` exists (grep). `MessagesMail` keys are always `mail:…`.
* **PF-12 walls: hold.** `sendSystem` runs in the request's firm scope through `firmScope`. No new `asBypass`. The demo inbox keeps its existing bypass.
* **409 never 500: holds on the single path.** It does not hold under concurrency (M1).
* **Key rotation: see m2.**

## Deviations judged
1. **New `body-seal.ts` and `system-mail.ts`: justified.** New files are allowed. The local-only key in git-ignored `studio/var` is used only when `environment === "local"`; outside local the key ring is required, so this is no real key.
2. **`SYSTEM_MAIL` provider plus `useExisting`: justified.** It is a second instance with `system: true`, one small line outside the touch list, and it was disclosed. It works in the running copy (rows carry `system:`).
3. **Reset in `session/service.ts`: justified.** That is where the reset lives. **The `ensureMessagesFirm` pre-step is not**: it treats one symptom of the design fault in M1.
4. **The two older tests changed: justified.** DW13 was explicitly "held until a ruling", and DW6 now has to open a sealed body.
5. **`system:` key prefix with no schema change: acceptable.** The limit counting per firm rather than per platform: m3.
6. **409/429 after the invitation is committed: m1.** Reporting the batch as `emailed:false`: acceptable.
7. **Plain files from before PF-19e still read: acceptable.** The row hash still binds them.

## Findings

### Major
**M1: the reset notice opens a second database connection while holding the firm's row lock. Concurrent resets in one firm answer 500 and stall the app's shared pool.**
* Where: `identity/session/service.ts:198-208`. `resetTwoStepOnce` holds `FOR UPDATE` on `platform_firm` (`inFirm`, `:43-45`). Inside it, `this.mail.send(…)` calls `MessagesMail.send`, which opens **its own** `db.$transaction` (`messages/send/mail.ts:70`) on the same pool (`core.ts:36`, pg default 10 connections).
* Measured: the test's app wiring, with MAIL_PORT on the same `Db` as the app (the production wiring, `features/platform-messages.ts:34`):

  | Concurrent resets in one firm | PF-4b LocalMail (before) | PF-19e |
  |---|---|---|
  | 12 | 12×200 | 3×500 (P2028 "Unable to start a transaction in the given time") |
  | 30 | 30×200 in 323 ms | 25×500 in about 5-6 s |

  While it lasts, every other request of every firm waits for a connection.
* Second effect of the same design: the email's row commits independently of the reset. If the reset's transaction then fails, the person gets "Your two-step sign-in was reset" while nothing was reset. Two ways this happens: the transaction expires (seen in the storm as "commit cannot be executed on an expired transaction"), or `CognitoIdentityAdmin.resetTwoStep` refuses with a 503 (`provider.ts:80`). The failed attempt also uses up one of the 5 hourly sends. The test misses all of this: its Messages and MessagesMail use a separate `PrismaClient` (`check_pf19e_sealed_bodies.ts:78,84`), so it never shares the app's pool. That is also why the msg_firm wait was the only symptom it found.
* Fix (builder's choice): no second connection inside the lock. Either:
  * write the notice in the reset's own transaction (`Messages.sendSystem(tx, …)`, then dispatch after commit, so the email exists only if the reset commits); or
  * send it after the commit, with the suppression checked before the reset.

  Then add a DW that runs at least 12 concurrent resets on the app's own `Db` and expects no 500.

### Minor
* **m1: a 409 that still makes an invitation.**
  * Where: `identity/service.ts:94-97,106,124`; the web form at `web/src/modules/platform/staff/invite-panel.tsx:34-35`.
  * The single invite answers 409 "We couldn't send email…" *after* committing a pending invitation that takes a seat.
  * Seen at 1024 px: the Team line went from 7 to 8 seats, the person is listed under Invited, and the panel still shows the row with the error and "Send invitation". Pressing it again gives "Already invited: resend it instead", and Resend gives 409 again.
  * On a 5-seat Sample plan, the phantom invitation blocked a batch ("7 of 5 seats").
  * Fix: refuse before committing (nothing made, like the reset), or make the sentence say the invitation was kept under Invited. Lead B to rule if the first changes the brief's meaning.
* **m2: key rotation does not see outbox bodies.**
  * Where: `body-seal.ts`; `secret-box/reencrypt.ts:7`; `deploy/RUNBOOK-secrets.md:59`.
  * Sealed bodies are not a `SealedValueStore`, so `versionCounts` reports nothing left on the old version. Retiring the key then ends every still-QUEUED TRANSACTIONAL row as FAILED "body could not be opened": cap-held firm mail waits up to a day, and platform rows retry with back-off.
  * Failing closed is right, and the files are short-lived, so not registering them is acceptable. But MODULE.md's invariant or the runbook's step 5 should say to wait until no QUEUED TRANSACTIONAL row predates step 3.
* **m3: the hourly limit counts per firm, but the brief says "a platform per-address limit".**
  * Where: `messages.ts:417-418`.
  * Self-serve trial firms (PF-5, no card) can each send 5 an hour to one victim address.
  * The builder disclosed it, with PF-12's walls as the reason. Lead B to rule: keep per firm, or count across firms behind a named bypass.
* **m4: test gaps.**
  * DW5's scan runs Nest with `logger: false` (`check_pf19e…:89`), so Nest's own error lines are never written to be scanned. The isolated copy's `api.log` held no token, so the claim stands, but the test does not prove it.
  * The bodies are single-part, so the part binding for reordered or dropped parts is not exercised.
  * The DW3 429 case says "nothing reset" but only counts emails, not `platform_session_revocation`.

## Could not check
* A real SES send.
* The re-encrypt job end to end with a retired version.
* axe and keyboard-only on the invite panel (no web change in this row).
* `graph.mjs` (it writes `qa/GRAPH.md`, which is outside what I may write).

Verdict: Block
* M1: no second connection inside the reset's firm lock; the reset's email exists only if the reset commits; add a concurrent-reset test on the app's own `Db`.
* Minors m1-m4 do not block on their own. m1 and m3 need Lead B's word; m2 needs a line in MODULE.md or the runbook.

---

## Re-review (P-277): diff `86e306399..c0e2ffcf2` only, head `c0e2ffcf215328b43c80b277c851ae930ea44bd2`

### What I ran at this head
* PF-19e: **34 passed, 0 failed**.
* My reset storm script (MAIL_PORT on the app's own `Db` pool), all 200 or 429 with **no 500**:
  * 12 at once: 200 and 429 only;
  * 30 at once: 10×200 and 20×429 in 373 ms (5 per person).
* **Mutation:** I forced the reset back onto the separate-transaction `mail.send` (`if (canSendInTransaction(…)) queued.push` changed to `if (false)`). The suite went red, 4 FAIL, including the new storm check (14×500) and the first-email check. I then restored the file with `git checkout` and the tree is clean. The new test proves the fix.
* Other suites, 0 failed:
  * PF-4b 55;
  * PF-4c 24;
  * PF-19b-mail 29;
  * PF-12 100;
  * PF-4 part A 110/111. Its one FAIL is part B, which needs a copy on :4541, outside my ports, so I did not start one.

### Findings, one by one
* **M1: closed.**
  * The reset now writes its notice in its own locked transaction (`identity/session/service.ts`, `resetTwoStep`, through `MessagesMail.sendInTransaction` and then `Messages.sendSystem(tx)`).
  * There is no second connection, and the dispatch happens after the commit.
  * A provider refusal (`admin.resetTwoStep` after the write) rolls back the outbox row, so nobody is told of a reset that did not happen.
  * The checks happen under the lock, suppression first: the 409 commits its audit line with nothing reset, and the 429 changes nothing.
  * A race between the check and the write is handled in the `.catch`, which gives the same answers and rethrows anything else.
  * The `ensureMessagesFirm` pre-step is gone. The firm's first `msg_firm` insert now runs in the transaction that holds the firm lock itself, so it does not wait.
* **m1: closed.**
  * Invite and resend call `systemMailBlocked` under the firm lock, before any insert or revoke. A suppressed address gives 409 with an audit line (entity "none" when no invitation exists) and no invitation or seat. The limit gives 429, and the last link stays valid (tested, including that it still accepts).
  * The batch is unchanged: per-row `emailed:false`, which I accepted in the first review.
* **m2: closed.** MODULE.md now says outbox bodies are not a SealedValueStore and the outbox must be drained before a key is retired.
* **m3: open, does not block.** The per-firm limit stays, as a question for the tech lead.
* **m4: closed.**
  * Nest's logger is on (`["error","warn"]`), so its lines are scanned.
  * Multi-part bodies are tested: 3 or more parts open whole, and reordered, dropped or repeated parts are refused.
  * The 429 case now asserts that no extra reset audit line was written.
* **Also checked:** with suppression checked first, a suppressed address that is also over the limit gets the 409, never the 429 (`sendSystem` acts only on LIMITED). PF-12: `systemMailBlocked` names `firm_id` through `firmScope` and runs in the request's firm. Nothing in this diff logs, audits or answers with a body, and no address enters an audit line.

### New, Minor (does not block)
* **n1: a once-per-firm lock cycle on the firm's very first `msg_firm` row.**
  * Where: `messages/send/messages.ts:114`, through `consent/messages-firm.ts`.
  * How it happens, with the firm's first-ever messages written at the same moment:
    1. A reset holds the firm's `FOR UPDATE`.
    2. Another transaction that does not take the firm lock (an invitation email after its commit, a booking email, a consent write) inserts the `msg_firm` row. Its foreign-key check waits for the reset's lock.
    3. The reset's own `INSERT … ON CONFLICT DO NOTHING` on the same key waits for that uncommitted row.
  * Result: PostgreSQL detects a deadlock (40P01) after about 1 s and aborts one of the two transactions. The user sees either one 500 on the reset, or `emailed:false` on the invite (which can be resent).
  * I reasoned this from the code; I did not reproduce it. The window is tens of milliseconds and comes once in a firm's life, so it does not block.
  * Fix: make the `msg_firm` row when the firm is made, or before the reset takes its lock.

Verdict: Approve c0e2ffcf215328b43c80b277c851ae930ea44bd2

---

## Re-review 2 (P-277): the merge of main (#2157, PF-19r part 1) and the amendment (rev 17.31), head `bf91eacc976851c805812aaa68277d4af402ffbc`

### What I read and ran
* Read: the amendment (brief lines 38-50 on `lead-b-front-office`), `git show 7d7099973 --cc` (the conflict files), `git diff 7d7099973 bf91eacc9`, and the two test files against `756a79992`.
* The branch is now at `f51508aa6`. Its only change after `bf91eacc9` is `pr-draft.md` (notes), so the code is the same.
* At this code, all 0 failed:

  | Suite | Result |
  |---|---|
  | PF-19e | 41/0 |
  | PF-19r | 28/0 |
  | PF-19p | 68/0 (alone) |
  | PF-18b | 41/0 |

* My reset storm script (MAIL_PORT on the app's own pool), no 500:
  * 12 at once: 200 and 429 only;
  * 30 at once: 10×200 and 20×429 in 370 ms.

### The builder's decisions
1. **PF-19r's `sendIn`/`ready`/`held`/`mailIn`/`mailReady` API kept, `sendInTransaction` dropped: agreed.** One API on `main` is right.
   * PF-19p's platform branch (`sendPlatform`, `asBypass("platform.account.mail")`) is intact.
   * The `system` sender is folded into `write`, and `held` is false for system mail.
   * `capHolds` leaves `system:` rows out of "ahead" (`messages.ts`, the `NOT LIKE` clause). This matches the worker, which neither holds nor counts them.
   * `sendIn` still writes in the caller's transaction with no second connection, so the closed M1 stays closed.
2. **Reset: agreed, with one point for Lead B.**
   * `mailReady` runs before the lock. It makes the firm's `msg_firm` row first, so it also **closes my n1** (the first-message lock cycle). PF-19r's DW3 check, the firm's first message with a concurrent email, covers it.
   * `systemMailBlocked` runs under the lock: suppressed gives 409 plus the audit line, the limit gives 429, nothing is reset.
   * The notice goes through `mailIn` in the reset's transaction and is dispatched after the commit.
   * The race catch maps `SystemMailLimited` to 429 and `MailSuppressed` to 409 plus the audit line. Any other `MessageRefused` gives 409 `NOTICE_NOT_SENT`, which is PF-19r's behaviour.
   * **Wording:** the reset now answers in Lead B's PF-19r question 4 words, not PF-19e item 4's "We couldn't send email to <address>…". Both are Lead B's, and the PF-19r ruling is the newer one, so taking it is reasonable. The amendment does not mention the sentence, so state the choice in the PR for Lead B to confirm. This is a note, not a finding. MODULE.md records the split (invitation sentence, reset `NOTICE_NOT_SENT`).
3. **PF-18b support tickets on `MESSAGES_MAIL`: agreed.** A ticket to our support inbox is not account or security mail. Under `SYSTEM_MAIL` it would meet the 5-an-hour limit to one address and skip the cap. `MESSAGES_MAIL` is exactly what `MAIL_PORT` was on `main`, so nothing changes for support.
4. **check_pf19r_senders: agreed.** Each item matches the amendment or PF-19e's own rules.
   * The binding is `SYSTEM_MAIL`.
   * DW2 is now 409 with no invitation, no seat and no row (PF-19e item 4 and the closed m1).
   * The code emails go through `MAIL_PORT`. `handleCustomEmail` has no deployed caller on `main` yet, so this is the test's wiring only; the deployed function must bind the system sender when it is built.
   * There is a sealed-at-rest check per sender: invitation, reset notice, code email, and the reminder's TRANSACTIONAL fallback.
   * DW5 is now the exemption: invitations, the reset and a code all send at the cap, the counter stays at 50, and a SERVICE email is held and then sent by the sweep. The held invitation and `NOTICE_HELD_DAILY_LIMIT` are gone from the system path, as the amendment says.
5. **`messageBodyBox(keys?)`: agreed.** A given ring returns a fresh box and the app's cached box is untouched; only tests pass one. SecretBoxPort's shared contract now runs through it (PF-0c).

### The PF-19p sweep flake
PF-19p passed alone here. Nothing in this PR touches the platform sweep, and I found no code cause in this diff. One timing-dependent spot worth a look in PF-19p's own row: the test drives `sweep()` with a FakeClock, but `msg_outbox.created_at` and `updated_at` default to the database's real clock on create. With 20 suites in parallel, real time between steps grows, so the due and order comparisons can see different values. Logging the failing row's `updated_at` and `state_reason` on the next red run would tell. Not a finding for PF-19e.

### Findings
* None new. The earlier M1, m1, m2, m4 and n1 are closed.
* m3 (the hourly limit counted per firm) is still open as the question for the tech lead, and does not block.

Verdict: Approve bf91eacc976851c805812aaa68277d4af402ffbc
