# FO-3c review: consultation agreement before the first consultation (API only)

Reviewer (P-303), fresh context, did not build. PR #2922, branch `claude/wonderful-lovelace-1ybe9m`, head **be10e6d24ee1efbc06a0fa8e4a8d59dfa86a3000**. Read: BACKLOG FO-3c (line 331) and rev 16.40, P-627 (7), P-564, the six new files, FO-6 and FO-5 migrations and triggers, `firm-scope.ts`, `MessagesMail`. Legal readings (s. 23 "signed", e-signature identity): Unconfirmed: no counsel.

**Verdict: Ship after fixes (Changes).** No Blocker. Three Majors.

## What I ran
* Suite on the exact commit (a `git archive` copy of be10e6d24): **18 passed, 0 failed**, about 6 s.
* Probe (scratch only, not committed). It ran the service as **xr_app** through `WalledPool`, plus the paths the suite does not cover. Results are under each finding.
* Isolated copy on **:4431** (runtime ports, `PLATFORM_IDENTITY=local`):
  - The app starts with the feature.
  - Staff routes: 401 without a token. With one: 200 or 404 in 12–32 ms.
  - Door: `{}`, `nonsense` and a well-formed unknown token each get the same 404. Non-JSON gets 400.
  - Live walk: I uploaded a CONSULTATION template, then booked publicly → `booking.scheduled` 1, **consultation agreements 0** (see Q2).
* Mutations on the exported copy: removing the firm filter in `mine()` → DW7 fails (good). Removing the reminder's status check (`service.ts:195`) or the code consent check (`service.ts:348`) → 18/18 still pass.
* Not run: `tsc -p api/tsconfig.json` (killed for lack of memory). CI decides.
* Another session edited this checkout while I reviewed: uncommitted `service.ts` and test edits, and `break-report.md`. **I reviewed only be10e6d24.** Those edits seem to touch M1 and part of M2 but are not reviewed here.

## Blockers
None. These held:
* Firm isolation: every query names the firm. Another firm's agreement, booking or person gives 404.
* The PF-12 walls hold as xr_app: send under `withFirm`, the door, the webhook event with a firm, and the host link all work.
* Every change writes its audit line in the same transaction. The outbox row is the last write in both transactions (`service.ts:170`, `:382`).
* Nothing cancels a meeting: there is no write to `fo_booking`.
* No personal data in events (ids and hashes only). No explicit `any`.
* Token: 256 bits after the firm prefix. Only the sha256 of the whole token is stored. The token sits in the URL fragment and the POST body, never in a path.

## Majors
* **M1. A firm signer's decline after the client signed throws, every time.** `service.ts:339-345`.
  - Cause: FO-6's request trigger allows `CLIENT_SIGNED → DECLINED`, but FO-5's `fo_retainer_write` does not (CLIENT_SIGNED moves only to SIGNED, WITHDRAWN or SIGNED_OFFLINE).
  - Probe: `signingEvent(decline)` threw "fo_retainer: status cannot move from CLIENT_SIGNED to DECLINED", and the replay threw again. The receipt is rolled back, so the provider retries forever. The state stays CLIENT_SIGNED/CLIENT_SIGNED. The host keeps the "needs you" item and gets "it now needs your signature" for an envelope that is dead.
  - Fix: map this case to a move FO-5 allows: WITHDRAWN with `withdrawn_at`, by and reason, and the version's `end_reason` WITHDRAWN. Never throw. Add a pass test and a fail test for client decline and for firm decline (the decline path has no test today).
* **M2. A seal that fails after the commit throws to the caller and is never retried.** `service.ts:357` (not inside `safe`), `:321` (REPEAT returns before any seal).
  - Probe: the vendor's "document not ready" twice → both events threw. Every provider retry → `REPEAT`. The end state is CLIENT_SIGNED with both signatures and **no evidence**. The booking reads "Agreement not signed yet" for good, and the s. 23(3) copy is never sent.
  - The signed-copy enqueue (`:385`) has the same problem: if it fails it is swallowed and never retried.
  - Fix: run the seal (and the copy) as a keyed job with retries, queued when the firm signs. Or retry `seal` on any verified event, or a catch-up, for a fully signed request that has no evidence. Wrap the after-commit call in `safe`. Add a test where the seal fails, then recovers.
* **M3. The new public door gives the signing link without P-564's email code.** `controller.ts:56-62`, `service.ts:258-285`.
  - P-564 (founder): a one-time email code before signing, **on by default**. The row says "P-564's code when on". The door records consent and hands out the provider's link with no code, unconditionally.
  - It also has no rate limit. FO-6's door spec says "rate limited", and the booking door has per-IP limits.
  - Today no token can exist in the running app (Q2), so nobody is exposed now. That changes once J-104 wires the send.
  - Fix, either one:
    - (a) Do not register `ConsultationAgreementPublicController` until FO-6's door (with the code) exists. Keep `open` as a service call, as `signingEvent` already is.
    - (b) Build the code step on FO-6's existing `fo_signer` code columns, behind the firm setting with default on, plus the per-IP limit.

## Minors
* **m1. Nothing sends an agreement in the running app** (Q2; confirmed live on :4431). Without a firm scope, `catchUp` and `send` read nothing as xr_app. Fix: put "poller + one `BYPASS_USES` entry (like `cases.prospect-won.catch-up`, with `touchFirm` per firm)" on J-104's swap list in the PR.
* **m2. The reads skip FO-3vr's record visibility** (`service.ts:224-239`). The module card's invariant is that a booking follows its record's or host's visibility. Someone holding `agent/booking:list` with everyone-sees-all off still reads the agreement for a booking or person they cannot see. Fix: call `seesBooking` / `seenWhere` before the read; 404 otherwise.
* **m3. The door and the host link can answer 500.** `service.ts:283` and `:302` call `embeddedLink` after the provider has ended the signer (the client signed, then reloads before the webhook arrives). By reading, two `hostLink` calls at once both write consent, and the second trips "written once" (`:297-298`). Fix: map `SigningEnded`/`SigningNotFound` to 409/404, and lock and re-read before the consent write.
* **m4. If the first email is refused or fails, the link is lost for good** (`service.ts:175`). Only the hash is stored, and there is no resend. Example: a suppressed address. The host is told "the client has not signed". Fix: write an audit line or a visible state when the email is not sent. Better: `MessagesMail.sendIn` inside the send transaction (PF-19r).
* **m5. A cancelled booking leaves the agreement open.** The "needs you" item stays and the link still signs (`:242`, `:266`). Expiry is not built. Fix: filter both by the booking being SCHEDULED or RESCHEDULED.
* **m6. Test gaps.**
  - DW5 fail's "a signed agreement gives no reminder" passes only through the sequence check (mutation above).
  - "A second run adds none" is claimed, but `runDue` runs once (`test:174-175`).
  - No-consent → no-signature is never played as a "signed" event (`test:135-136`).
  - DW9 shows that the event comes after the audit line, not that it is last.
  - The suite runs as the owner role, so the walls are not exercised.
* **m7. Per-row queries:** `forPerson` → `view()` makes 3 queries per agreement, up to 50 (`:238`, `:203-208`). Fix: one query with includes.
* **m8. s. 23(2)(a) address/phone/email and (d)/(e) are shown as NOT_CHECKED** (`items.ts:83-88`). A template that lacks them shows nothing, but the row says "shows it". Acceptable here (Q4), with a follow-up FO-5 placeholder row.

## The five questions for the tech lead
1. Webhook route and expiry: an acceptable gap (FO-6's API part; `signingEvent` is the seam). Email code: **not acceptable while this PR opens its own door** → M3.
2. The poller: acceptable for an API-only row if it is listed on J-104 → m1.
3. "Needs you" and event names kept in the module: acceptable; J-104 adds them to `ports/notifications.ts` and `ports/events.ts`.
4. No placeholders for (d)/(e): acceptable → m8.
5. Fee: right not to invent one (AGENTS rule 4). The pro bono wording is labelled Sample.

Note for the tech lead (not a finding): this PR builds the CONSULTATION signing state machine itself. FO-6's API part must delegate to it or replace it, so there stays one path (P-627 (7)).

## Scores
* **D1–D20 (API only):**

  | Score | Dimensions |
  |---|---|
  | Met | D3 (FO-5/FO-6 tables reused) · D6 (Code cited, current to 2026-10-19) · D10 · D15 · D18 (source and "Unconfirmed") |
  | Partly | D1 (M3, m8) · D2 (m3) · D5 (M1, M2, m4) · D11 (stuck "not signed yet") · D16 (m6) · D19 (m1) |
  | N/A | D7 (no AI) · D8 · D9 · D12–D14 (no screen) · D4 |
  | Simulated only | D17, D20 |

* **BIC-01–BIC-20:** N/A (no case-side screen).
* **Journey score (reviewer, API level, persona walks by request and service call):** 7.5/10. That is 6 of the 8 criteria that apply; visual quality and accessibility are N/A. **Below the pass mark.**

  | Criterion | Score | Evidence |
  |---|---|---|
  | Task completed | ½ | Works at service level, not in the running app (m1) |
  | Next step obvious | 1 | `yourTurn`, CLIENT_SIGNS_FIRST |
  | Plain words | 1 | |
  | Feedback and state | ½ | M2 leaves "not signed yet" for good |
  | Correct data | ½ | M1 |
  | Error recovery | ½ | Send rollback and envelope cancel hold; M1, M2, m4 do not |
  | Speed | 1 | 12–32 ms |
  | Trust and sources | 1 | |

  Raise it by fixing M2, M1, then m1 (via J-104).

## Could not check
A real vendor (fake only); a typecheck (killed for lack of memory); a browser or screen reader (no screen); an intended user's walk (D17 and D20 stay with the founder).

Round 1 verdict: Changes be10e6d24ee1efbc06a0fa8e4a8d59dfa86a3000

## Round 2: diff be10e6d24..e6365237a (head e6365237a4a3f647ad14eae2c90b77940539a4f9)

Scope: only the diff. adec95da8 and its revert e6365237a cancel out on the evidence file. This file and `break-report.md` came into the branch as records. Round 1 above is kept as written (rule 8), so this file runs past 100 lines.

**What I ran**
* Suite on a `git archive` copy of e6365237a: **34 passed, 0 failed**. The checkout's working tree matched the head for `api/` and the suite.
* Seven mutations on that copy, each caught by the suite:

  | Mutation | Result |
  |---|---|
  | Drop the NO_CODE refusal | M3 fail goes red |
  | Hand out the link without a code | 3 cases red |
  | Lock after 60 tries, not 6 | The suite stops |
  | REPEAT no longer reseals | m3 pass and M2 pass red |
  | Decline goes back to DECLINED | The suite stops on FO-5's trigger |
  | No per-IP limit | The limit case red |
  | Catch-up no longer reseals | M2 pass red |

**Majors from round 1: all closed**
* **M1, closed.** `service.ts:448-457`. A firm signer's decline after CLIENT_SIGNED now ends the agreement WITHDRAWN, with its time, by and reason, and the version's end reason WITHDRAWN. The request becomes DECLINED. Both FO-5's and FO-6's rules allow these moves, and the round-1 failure no longer throws. Tests: M1 pass and M1 fail (a client decline stays DECLINED).
* **M2, closed.**
  - A repeated event now retries the seal (`:430`). The provider's retry after a failed seal seals it (m3 pass/fail).
  - `catchUp` reseals fully signed requests that have no evidence, and queues the signed copy again under one key. The email's idempotency key makes it one email (M2 pass: the catch-up ran twice, one copy).
  - The seal after the firm's signature still throws to the caller (`:457`). This is now deliberate: the provider retries, and the retry seals. Accepted.
* **M3, closed.** `service.ts:336-390`, `controller.ts:59-64`.
  - P-564's code is built on FO-6's `fo_signer` columns:
    - 6 digits from `randomInt`, stored only as sha256, compared with `timingSafeEqual`.
    - 10 minutes (Sample). The sixth wrong code locks the link for 15 minutes, and even the right code is refused while locked.
    - Resend is only on request, and each step writes one audit line under the request lock.
  - A client "signed" event without a checked code is refused with NO_CODE: a second wall behind the door.
  - Per-IP limit of 30 per 10 minutes, then 429.
  - The firm's switch to turn the code off is FO-6's setting (not on main). It is always on here, which matches "on by default".

**Minors from round 1**
* m3 closed: `providerLink` maps an ended signer to 409 SIGNING_ENDED and an unknown one to 404. Host consent is taken under the lock and re-read.
* m5 closed: a cancelled booking's agreement gives no "needs you" item, and its link answers the one 404.
* m6 closed: a "signed" event with no consent and with no code is played; the reminder runs twice.
* Still open by design and listed for the tech lead, so not blocking: m1 (no outbox poller; J-104), m2 (FO-3vr visibility on the reads), m4 (no resend of a lost first email), m7, m8.

**New in round 2 (Minors, not blocking)**
* n1. The per-IP limit is held in memory per process (`:63-69`). Behind a proxy that hides client addresses, everyone shares one count. This is the same pattern as the booking door; keep it in mind for PF-8.
* n2. Once wired, `catchUp` re-queues the copy for every request SIGNED in the last 7 days on every run (`:107-117`). One email results, but it is wasted work. Fix: only when no copy has been sent yet.

**Journey score, round 2 (reviewer, API level): 8.5/10.** That is 7 of the 8 criteria that apply; visual quality and accessibility are N/A.

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | Still not in the running app (m1, J-104) |
| Next step obvious | 1 | |
| Plain words | 1 | |
| Feedback and state | 1 | M2 closed |
| Correct data | 1 | M1 closed |
| Error recovery | ½ | m4 still open |
| Speed | 1 | |
| Trust and sources | 1 | |

Pass, with no criterion at 0.

Round 2 verdict: Approve e6365237a4a3f647ad14eae2c90b77940539a4f9

## Round 3: diff e6365237a..0ccbd59c98ac08a96b09ff245c14a090697822c7

Scope: only the diff, which changes `service.ts`, the test, and the records (my round-2 section and the breaker's round 2). The committed `review.md` matched my round-2 file.

**What I ran**
* Suite on a `git archive` copy of 0ccbd59c9: **37 passed, 0 failed**.
* Four mutations on that copy:

  | Mutation | Result |
  |---|---|
  | No 30-minute session in `open` | R2-1 fail and R2-2 go red |
  | No one-a-minute limit | R2-2 goes red |
  | A used code not spent | Still 37/37 (see r3-2) |
  | `codeVerifiedAt` not cleared when a new code is sent | Still 37/37 (see r3-1) |

**The breaker's round-2 fixes**
* **R2-1, closed.** `service.ts:350-351`, `:367`, `:377`, `:381`. A checked code opens the link for 30 minutes (Sample). After that, opening the link sends a new code and clears `codeVerifiedAt`. The old code no longer works, from any address.
* **R2-2, closed.** `:374`. A new code at most once a minute per signer, otherwise 429 CODE_TOO_SOON. This holds even with `resend`.
* **R2-3, closed.** `:72-79`. The limiter re-inserts each address on use, so the oldest go first. It sweeps at most once a minute and keeps at most 50,000 addresses.
* **R2-4, closed.** `:109-110`, `:123`. The catch-up skips firms with no active licensed person, and stuck seals come first.

All of these still hold:
* every change writes its audit line under the request lock;
* only the code's sha256 is stored;
* nothing reads across firms beyond m1, which is unchanged;
* no personal data in events or logs.

**Minors (not blocking)**
* r3-1. No test shows that a new code works after the 30-minute session ends (mutation V). With the clearing at `:377` removed, the new code would never be "live" (`:381`), and the client would be shut out for good. The code is correct today. Fix: one more case in which the new code, once checked, gives the link.
* r3-2. "A used code is spent" (`:381`) cannot be seen through the door. A code is checked within its 10 minutes, and inside the 30-minute session `open` answers before any code is read, so the old code has always expired by the time it is asked for again. It is harmless defence in depth.
* r3-3. For FO-6v: `apply` refuses a client's "signed" event once `codeVerifiedAt` is cleared (`:466`). If a vendor's embedded link lives longer than the 30-minute session, a client who signs in an old tab after a new code was sent gets NO_CODE. The fake's link lives 10 minutes, so this cannot happen today. Keep the vendor's link life at or under the session.

**Journey score, round 3:** unchanged, **8.5/10**. A pass with no criterion at 0.

Round 3 verdict: Approve 0ccbd59c98ac08a96b09ff245c14a090697822c7

## Round 4: diff 0ccbd59c9..8a09b9609ae6fcc25883a338a1668fcaa0035c30

Scope: only the diff, which changes `service.ts` and the test. The record files in the range are the round-3 sections, mine and the breaker's. The committed `review.md` matched mine.

**Environment note:** the local PostgreSQL on 127.0.0.1:54329 had stopped: its log ended with no shutdown line and a stale `postmaster.pid`. I started it again with `start.sh`'s own `pg_ctl … start` line. Nothing else was changed.

**What I ran**
* Suite on a `git archive` copy of 8a09b9609: **40 passed, 0 failed**.
* Four mutations on that copy:

  | Mutation | Result |
  |---|---|
  | Clear `code_verified_at` again when a new code is sent | The two R3-1 cases go red, as the PR says |
  | `unspent()` false after any check | The suite stops (the new code is refused): my r3-1 is now covered |
  | `unspent()` always true | Still 40/40 (see r4-1) |
  | R3-2's filter back to "any licensed person" | Still 40/40 (see r4-2) |

**The fixes**
* **R3-1, closed.** `service.ts:47-50`, `:380`, `:385`, `:389`. `code_verified_at` is never cleared; it records the last time a code was checked. That is what the provider's "signed" event depends on (`apply`'s NO_CODE check), so a late "signed" after a fresh code is applied.
  - `unspent()` treats a code as live only when it was sent after the last check. Its send time is its expiry less its 10-minute life.
  - The forwarded-link protection holds: a fresh check within 30 minutes is still needed before the provider link is handed out (`open`).
  - This also settles my round-3 r3-3, the late "signed" from an old tab.
* **R3-2, closed.** `:113-118`. The catch-up's filter now follows `signatory()`'s rule: the booking's host is active and licensed, or an active licensed person holds every `DUTY_KEYS.represent` key.
* **r3-1 (mine), closed.** The test "r3-1 pass/fail" checks that the new code is accepted after a stale session (mutation 2 above).

**Minors (not blocking)**
* r4-1. That test's "the code used before it is refused" only compares two codes from different agreements (`newCode !== code31`). The "spent" rule remains defence in depth that cannot be seen through the door, as in round 3's r3-2.
* r4-2. No case exercises R3-2's filter (mutation 4). It only matters once the catch-up is wired (m1, J-104). Add one case there: an unlicensed host with no representative of record is skipped, and the next booking in the batch is still sent.

**Journey score, round 4:** unchanged, **8.5/10**. A pass with no criterion at 0.

Round 4 verdict: Approve 8a09b9609ae6fcc25883a338a1668fcaa0035c30

## PF-19r fix: diff ba53ced16..d9bf34ad5bcebec54b6cf15b2fd0832f4e7de6fb (tests only)

The Lead asked for this after the fast job's `check_pf19r_every_sender.ts` S1 failure. `api/` is unchanged since 8a09b9609.

**Is the classification true? Yes.**
* All four `this.ports.mail.send(` calls in `service.ts` (lines 224, 247, 405 and 539: the client's link, the 24 h reminder, the one-time code, the signed copy) use the injected `ports.mail`.
* The only source of that mail is `CONSULTATION_AGREEMENT_PORTS`, whose factory (`features/front-office-consultation-agreement.ts:14`) injects `[MESSAGES_MAIL, LocalFiles]` and passes the mail through unchanged. The path is `runtimeAgreementPorts(mail, …)`, `controller.ts:20-21`, then `ConsultationAgreements` (`{ ...ports, jobs }`).
* No other mail is built in those files: no `fakeMail` default, no raw transport, no in-memory list.
* The controller sends nothing itself, so its entry with no sends is right.

**Counts:** mailSend 4 and anySend 7 are exact against the sweep's patterns.
* m-pf1 (Minor, wording only): the entry's note says "its other 3 `.send(` are SigningPort's". In fact **one** is `this.ports.signing.send` (`:200`). The other **two** are the service calling its own `send` method (`:99`, `:138`, the agreement's send). Neither is mail, so the classification stands. Fix the note's wording when next touched.

**What I ran**
* `check_pf19r_every_sender.ts` in the checkout, whose head and files matched d9bf34ad5: **21 passed, 0 failed**. A `git archive` copy cannot reach `prototype/contracts/`.
* The row suite on a `git archive` copy of d9bf34ad5: **42 passed, 0 failed**.
* The new PF-19r pass asserts the real thing: `inject[0] === MESSAGES_MAIL` and the same object carried through. The PF-19r fail case only shows the check can tell two mails apart. That is weak, but harmless.
* The database was up (the coordinator had restarted it).

Reviewer: Approve d9bf34ad5bcebec54b6cf15b2fd0832f4e7de6fb

Verdict: Approve d9bf34ad5bcebec54b6cf15b2fd0832f4e7de6fb
