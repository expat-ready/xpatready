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

PF-19r fix verdict: Approve d9bf34ad5bcebec54b6cf15b2fd0832f4e7de6fb

## Merge-batch fix: diff 698793985..4b7d5b404f4257f4011f7b225a1280285c153cd1 (run 45019671197)

Scope: only the diff, which changes `controller.ts` and `tests/check_forms_qa53.ts`. The merge 698793985 brought in main and does not touch `consultation-agreement/`. `service.ts`, `items.ts` and the feature file are byte-identical to d9bf34ad5.

**The schemas keep the service's behaviour.** I parsed each case through `parseInput`.

`HostLinkBody`:

| Body | Answer |
|---|---|
| `{}`, `consent: false` or `"true"` | 422 |
| An extra field | 422 |
| `consent: true` | Accepted |

`consent: true` is still the only way in, as the service's own check (`service.ts`, CONSENT_NEEDED) required.

`OpenBody`:

| Body | Answer |
|---|---|
| `{}`, a numeric token, a token over 200 characters | 422 |
| `consent: "yes"`, a numeric `code`, an extra field | 422 |
| `{ token: "abc" }` | Accepted; the service still answers the one 404 (bad format, or a well-formed unknown token) |
| `code: "abc"` | Accepted; the service still refuses it with 422 CODE_FORMAT |

`text()` trims surrounding spaces, which a real token (76 characters, no spaces) never has.

**Small changes in order and wording (Minor, accepted)**
* PF-28 parses the body before any lookup. So a host-link body error now answers 422 before the service's 404, 403 or 409, and its detail no longer quotes the consent wording. Nothing leaks: the shape is public.
* A malformed agreement id now gets `idParam`'s 404 ("No such agreement in your firm.") rather than the service's "This agreement or link is not available." Both are 404 NOT_FOUND on a staff route.
* Bodies refused at the schema do not count toward the door's per-IP limit. They do no lookup and write nothing.

**The QA-65 listing is right.** `/api/public/consultation-agreements/open` is a public door keyed by its token. It has no signed-in person to name, and an unknown token answers the one 404. That matches `PUBLIC_WRITES`' rule, like the forms submission and unsubscribe doors already there.

**What I ran**
* The checkout at 4b7d5b404 (`api/`, `tests/` and `ports/` match): the row suite **42/42** and a scratch schema probe, the cases above.
* `check_pf28_inputs` and `check_forms_qa53` need their own isolated copies, so I did not re-run them: the coordinator reports 47/47 and 43/43. The `parseInput` probe covers the same answers PF-28 asks for.

Reviewer: Approve 4b7d5b404f4257f4011f7b225a1280285c153cd1

Verdict: Approve 4b7d5b404f4257f4011f7b225a1280285c153cd1

## Part 2, round 1 (f40ebc7e3)

Scope: `git diff origin/main...f40ebc7e3` (PR #3184), FO-3c part 2 (R1.104; Lead 10's rulings of 23 Nov). Fresh context, did not build. The branch moved to d560df8e0 at 05:25Z (a test only) and another session edited `gate.ts`, `live.ts`, `service.ts`, `types.ts` and `break-report.md` in this checkout at 05:28-05:29Z, uncommitted. **I reviewed only f40ebc7e3**; the suites below were re-run on a `git archive` copy of it. Earlier rounds above are kept as written (rule 8).

**Verdict: Rework (Block).** No Blocker; three Majors. All three are also in the breaker's uncommitted part 2 notes (P2-1, P2-2, P2-3), found independently here.

### What I ran
* Clean copy of f40ebc7e3: `check_fo3c2` 17/17, `check_fo3c` 42/42, `check_fo3a2_consult_record` 39/39, `check_fo3a_booking_types` 48/48, `fo3vr` 24/24, `fo3m` 14/14. In the checkout, before the other session's edits: `bypass_uses` 52/52, `pf12b_bypass_audit` 70/70, `pf19r` 21/21. Web `tsc`: clean. Api `tsc`: no error in a touched file.
* Migration: all migrations applied to a scratch database. `require_agreement` is boolean and nullable with no default, so no row is rewritten. `rollback.sql` ran in one transaction, and the migration applied again cleanly. The stamp is after main's newest (20261123020000).
* `j_104` on my isolated copy `rv104` on :4437 (runtime ports), screenshots to scratch: **20/20 PASS**.
* My own Playwright walk on the same copy:
  - widths 1440, 1024, 720 (the 200 % zoom stand-in) and 400;
  - keyboard only;
  - axe WCAG 2.2 A/AA;
  - the data read back from the copy's database.
* Probes on a scratch database: the representative of record signing with "everyone sees all" off, and 45 idle poller runs after a signature. The isolated copy's own audit trail was also read for the bypass lines.
* Mutations on the clean copy:

  | Mutation | Result |
  |---|---|
  | `sees()` always true | P5 goes red (good) |
  | `copyVisible` without its `mine()` re-check | Still 17/17 |
  | The gate without its type-switch clause (`gate.ts:35`) | Still 17/17 |

### What held
* **Firm and visibility walls on reads.** Another firm gets 404 by person, by id and by booking (W8 live). A list-key colleague outside the record rule gets 404 (P5). Owner F, not the host, reads through the wired `Booking.staffBooking` (200 live), so the host-only fallback is not what the app runs.
* **Download links.** A link is bound to its firm and its person (FO-5's `FileLinks` HMAC), and the person's visibility is checked again at download. No route takes a raw file key, so I found no way to read another person's agreement or file.
* **Concurrency.** The gate runs inside the attendance transaction after the booking row lock (`booking/service.ts:436`). A signature committing at the same moment can only make it refuse, which is the safe side, and no status moves from signed back to unsigned. No-show stays open. A double click on Attended shows one alert. The send's advisory lock plus re-read keeps one agreement per booking across two pollers.
* **The poller fails safe.**
  - It is single-flight, waits on shutdown, and its timer is `unref`.
  - Each event is in its own try; the run is in another.
  - Every firm read writes its `platform.bypass` line before any of that firm's rows is handled (P4, and live in `rv104`'s trail).
  - Sends run as their own firm (`withFirm`).
* **Switch and words on screen.** The W4b switch saves (DB `t`, audit "Booking type "Follow-up" edited."), and the read-only view shows "Agreement signed before it starts: Yes".
* **Accessibility.** At 400, 720, 1024 and 1440 px there is no sideways scroll and no axe violation on the booking panel, the agreements section or the type dialog. By keyboard alone, Attended shows the refusal, and "Download the signed copy" downloads the file.
* **Speed.** The panel loads in about 1 s.
* **Resend deviation.** It is honestly stated, with a true technical cause: `fo_signer.link_token_sha256` is written once and stored as a hash only, so a resend needs FO-6's new request. Not building resend here is acceptable. What is not acceptable is the block left with no way out (M2).

### Majors
* **M1. The representative of record cannot sign when "Everyone sees all" is off, so the booking is held for good.** `consultation-agreement/service.ts:294-296` (`mine` now needs booking visibility) and `:457` (`hostLink` goes through `mine`).
  - Probe: host user-O (no licence record), Kim's lead owned by user-O, signatory user-R. `needsYou(R)` lists the agreement, then signing as R → **404 NOT_FOUND**; `read(R)` → 404. Attended → 409 for ever.
  - FO-5's BR-3 ("the representative always may read it") is broken by this PR; part 1 did not have the problem.
  - Fix: in `mine()`, let `r.representativeStaffId === ctx.staffId` through, as `staffBooking` does for the host. Add a pass test and a fail test.
* **M2. The block has no way out, and its words promise one that does not exist.** `gate.ts:26` (HOLD_WORDS), `gate.ts:38`, `agreement.tsx:38`.
  - The words say "or record it as signed offline". No screen offers it: my walk found 0 such controls, and FO-5's retainer page lists Signed offline as "a later part".
  - FO-5's API refuses it for DECLINED. With visibility off it also refuses a booking that has no prospect (`visible(change)`; the agreement is `createdBy` system).
  - The hold counts any status that is not signed. So DECLINED, WITHDRAWN (the firm's signer declined), a lost email or a booking moved to No-show (its link then 404s) all hold Attended and the consult record **for ever**. `send` answers ALREADY_SENT, and resend is not built.
  - Lead 10 asked for "says why and links to resend". The declared gap covers only the missing link, not these dead ends.
  - Fix (pick one, for the tech lead):
    - hold only while the agreement is live (SENT, VIEWED or CLIENT_SIGNED) and say on the panel when it has ended; or
    - keep the hold and put the dead ends on the PR as a gap the tech lead accepts.

    Either way, drop "or record it as signed offline" from both texts until a screen does it. Add a test for a declined agreement.
* **M3. The poller writes a `platform.bypass` line to a firm's trail every 30 s while it has nothing to do.** `service.ts:137` and `:142`, through `each` → `touchFirms` (`live.ts:48`, `:71`).
  - The catch-up runs again for every request SIGNED in the last 7 days, and each run writes that firm's line. The copy job's key makes the re-queue itself a no-op.
  - Live on `rv104`: one line every 30 s (05:22:41, :57, 05:23:27 … 05:24:57Z) with no events. Probe: 3 lines in 45 idle runs. That is about 2,880 lines a day for 7 days after **every** signature.
  - A send that keeps failing also retries, with a line, every 30 s with no backoff. CS-K1's poller was fixed for exactly this (break M1 of 20 Nov: `touchedEach` backoff).
  - This is round 2's n2, now that the poller is wired.
  - Fix: re-queue the copy only when none has been sent, and back off failing rows the way `touchedEach` does. Add a test that an idle firm gets no line.

### Minors (not blocking)
* m1. Mutation-proof test gaps:
  - `copyVisible`'s re-check (`service.ts:312`) has no same-firm denial test; P6 fail only tries another firm.
  - The gate's type clause (`gate.ts:35`) is untested.
  - P2 "record" passes either way (`test:164`).
  - The two new routes (`…/signed-copy/download-link`, `files/:token`: 410, another person's link) have no API test.
  - The graph lists them under G3.
* m2. Fail-open beyond the declared gap 3: a send that fails until the meeting starts leaves no agreement, so no hold. The panel then gives a wrong reason ("no template, or no email", `agreement.tsx:39`). The 2 s before the poller sends a staff-made booking is also open. This is the tech lead's call (PR question).
* m3. The cursor moves past a failed event (`live.ts:69`), and a late-committing lower `seq` is skipped. The catch-up fixes sends, but a lost `booking.rescheduled` means no 24-hour reminder.
* m4. Switching a type off after its agreement was sent lifts the hold. Switching it back on blocks the consult record of an Attended booking. The reminder ignores the switch. A stored choice cannot go back to the default (`types.ts:93`, `z.boolean()`).
* m5. Lead page:
  - The rows say only "Sent <date>" (`agreement.tsx:57`), so 4 rows can't be told apart (screenshot w7).
  - Each signed row POSTs a download link on render (`:69`), one request per row.
  - `forPerson` makes about 8 queries per agreement (`:330`, m7 from part 1, now larger).
* m6. The types dialog's hint "What a booker may do from the link in their email." now sits under the agreement checkbox (`types-page.tsx:202`).
* m7. A SIGNED_OFFLINE agreement counts as signed but has no copy to download (`signedCopyKey` reads only the e-signature evidence).

### Scores
* D1–D20:

  | Score | Dimensions |
  |---|---|
  | Met | D3 (FO-5 FileLinks, FO-3vr reused) · D6 · D10 (except M2's clause) · D12 · D13 · D14 · D15 · D18 (Sample, Unconfirmed: no counsel) |
  | Partly | D1 (M1, M2) · D2 (m2, m4) · D5 (M2, m3) · D9 (M2) · D11 (m2 wording) · D16 (m1) · D19 (dead ends) |
  | N/A | D4 · D7 (no AI) · D8 |
  | Simulated only | D17, D20 |

* BIC-01–BIC-20: N/A. These are front-office staff screens, not case-side (§6 scope).
* **Journey score (reviewer; the one score for this check): 7.5/10. Fail** (below 8, and one criterion at 0).
  - Journeys walked: J1, the host opens a held booking and presses Attended (at 1440, 1024, 720 and 400 px, and by keyboard). J2, the lead page and its signed copy. J3, the Owner switches Follow-up on. J4, wrong role (Client D, the copy's Billing and finance host, on someone else's booking: nothing shown). J5, the representative signs with visibility off (probe: M1). J6, a declined agreement (by reading, plus the breaker's P2-2).

  | Criterion | Score | Evidence |
  |---|---|---|
  | Task completed | ½ | j_104 20/20 for host = signatory; M1 |
  | Next step obvious | ½ | Says why; no resend; the offline step does not exist |
  | Plain words | ½ | Clear, but one false clause (M2) and rows without their booking (m5) |
  | Feedback and state | 1 | Pill, "why" line, inline alert, one alert on a double click |
  | Correct data | 1 | Switch stored and audited; one agreement per booking |
  | Error recovery | 0 | Declined, lost email or rep 404: no way out in the product (M1, M2) |
  | Accessibility and sizes | 1 | axe clean; no sideways scroll at 400–1440; keyboard path works |
  | Speed | 1 | About 1 s panel |
  | Visual quality | 1 | Team pills and sections (screenshots w3, w4, w7, w9) |
  | Trust and sources | 1 | Signatory named; the signed copy's date and sha256 |

  Raise it with M2, then M1, then m5.
* The journey-test report is folded into this section: I was told to change no other file.

### Could not check
* A real e-signature vendor (fake only).
* A visible headed browser or screen reader (headless Playwright).
* An intended user's own walk (D17 and D20 stay with the founder).
* `check_pf28_inputs` and `check_forms_qa53` (the PR lists them as still to run).

Reviewer: Block f40ebc7e38e0e3d774538626afa28203e29649a1

Verdict: Block f40ebc7e38e0e3d774538626afa28203e29649a1 — fix M1, M2, M3.

## Part 2, round 2 (f89c066a6; head e8511e156)

Scope: only `git diff f40ebc7e3..f89c066a6`. e8511e156 adds only the four J-104 screenshots; I checked that no code changed.

**Verdict: Ship (Approve).** All three Majors are closed. What remains is Minor or a gap already put to the tech lead.

### What I ran
* Suites on a `git archive` copy of f89c066a6:

  | Suite | Result |
  |---|---|
  | `check_fo3c2` | 25/25 |
  | `check_fo3c` | 42/42 |
  | `check_fo3a_booking_types` | 48/48 |
  | `check_fo3a2_consult_record` | 39/39 |

* j_104 on my isolated copy `rv104b` on :4438, checkout at f89c066a6, screenshots to scratch: **20/20 PASS**. The w4 and w7 screenshots show the new words and the meeting dates.
* Five mutations on the copy:

  | Mutation | Result |
  |---|---|
  | (A) The representative's exception removed from `mine()` | B1 red |
  | (B) Hold on any status that is not signed | B2 red |
  | (C) No `requeued` skip | B3 pass and B3 fail red |
  | (D) Backoff removed (`live.ts`) | **Still 25/25** |
  | (E) The reminder's switch check removed | **Still 25/25** |

* The round-1 mutations (`copyVisible`'s re-check, the gate's type clause) are now caught by R1, as the builder says.

### Round-1 Majors
* **M1: closed.** `mine()` lets `representativeStaffId === ctx.staffId` through (`service.ts:308-309`), so reading, signing and the copy key all work for the signer. B1 pass is the signer with "everyone sees all" off, signing to SIGNED while `forBooking` stays 404. B1 fail is a third colleague still getting 404. This matches FO-5's BR-3.
* **M2: closed (option (a) of round 1). It needs the tech lead's ruling, which the PR asks for.**
  - Only SENT, VIEWED and CLIENT_SIGNED hold (`gate.ts:41-42`).
  - An ended agreement reads "Agreement ended unsigned" with a neutral pill and a line saying it no longer holds.
  - The signed-offline clause is gone. The words now name rescheduling as the way out.
  - I checked that rescheduling works: `move` accepts SCHEDULED and RESCHEDULED with a future time (`booking/service.ts:48`), and the client's link opens again for a RESCHEDULED booking (`bookingActive`). Reschedule sits under the panel's "More".
  - Tests: B2 (declined → Attended saved) and the existing P2 pass.
* **M3: closed.**
  - A signed copy already re-queued by this process is skipped before its firm is touched (`service.ts:149`). B3 shows no line in a quiet catch-up, and its fail side shows one line for a real event.
  - Failing catch-up rows back off from 30 s, doubling to at most an hour, before `touchFirms` (`live.ts:52-60`), as CS-K1's `touchedEach` does.
  - What remains: one line per firm per process start, which is fine.

### Round-1 Minors
* m1 closed (R1, B4, and the record case is now deterministic).
* m4 closed:
  - The reminder skips a type that is switched off.
  - `null` resets a type to its purpose's default (B4).
  - A switch flipped after sending still applies when the gate checks. R1 now shows this, and the tech lead's question covers it.
* m5: the rows now name the meeting date. The query count per agreement is a declared gap.
* m6 closed: the hint is back under "Allow cancellation".
* m2, m3 and m7: declared gaps for the tech lead. m5's queries are too.

### New Minors (not blocking)
* r2-1. Two rules have no failing test. Removing the backoff (`live.ts:52`) or the reminder's switch check (`service.ts:263`) leaves 25/25 (mutations D and E). Add a failing send that is skipped on the next catch-up and lined again after its wait, and a switched-off type whose reminder sends nothing.
* r2-2. A booking answered No-show while its agreement is still SENT: changing it to Attended stays held. The client's link answers 404 (the booking is not active), and Reschedule refuses a NO_SHOW booking (`ACTIVE`). The panel still advises rescheduling. This is a narrow dead end. Fix: say so on the panel for NO_SHOW, or let the tech lead accept it with resend (FO-6).
* r2-3. Holding only while live means anyone who can end the agreement lifts the hold. FO-5's withdraw API (key-gated and audited, with no screen yet) can do it. This belongs with the tech lead's question on M2.
* r2-4. Rescheduling does not resend the agreement's link. For a lost email the client still has nothing to sign with. This is the declared resend gap (FO-6), and the words say "from the link in their email".
* r2-5. A catch-up send that returns `NO_TEMPLATE` without throwing (the template's file is missing) is not backed off: one line per catch-up. It is rare. Throw instead, or key the backoff on `sent: false`.

### Journey score, round 2 (reviewer): 9.5/10. Pass, no criterion at 0
* Task completed 1 (B1, j_104 20/20).
* Next step obvious 1 (reschedule named, under "More").
* Plain words 1 (meeting dates on the rows; "Agreement ended unsigned").
* Feedback and state 1.
* Correct data 1.
* **Error recovery ½** (r2-2, r2-4).
* Accessibility and sizes 1 (unchanged layout; j_104 W10 axe clean).
* Speed 1.
* Visual 1.
* Trust 1.

The journey-test report stays folded into this file, as I was told to change no other file.

Reviewer: Approve e8511e15673206e0c9b46a2a6028f78b50f375e4

Verdict: Approve e8511e15673206e0c9b46a2a6028f78b50f375e4

## Part 2, round 3 (9f2754207)

Scope: `git diff d47aca316..9f2754207` only, under Lead 1's ruling of 23 Nov on #3184. Another session moved this checkout to c2f6d13af while I worked. **Everything below was run on a `git archive` copy of 9f2754207; c2f6d13af is not reviewed here**, though its message says it answers M1 below.

**Verdict: Rework (Block).** Two Majors.

### What I ran
* Row suite on the copy: **36/36**.
* J-104 on isolated copy `rv104c` on runtime port :4436 (never :4400), screenshots to scratch: **20/20 PASS**. W4's panel shows the new words; W10 axe is clean.
* Eleven mutations, each reverting one fix on the copy:

  | Mutation | Result |
  |---|---|
  | Gate back to holding only live agreements | B6 red |
  | `send()` back to "any agreement = ALREADY_SENT" | B2 red |
  | Reschedule's ended → send removed | B6 fail red |
  | Backoff cap removed | B5 red |
  | `sendOrThrow` removed | B8 red |
  | Gate or `ofBooking` reads the oldest | B2 red |
  | Reminder's switch check removed | B9 red |
  | **(C) In-lock re-check off** (`service.ts:237`) | **36/36** |
  | **(E) Catch-up filter back to "no agreement at all"** (`service.ts:142`) | **36/36** |
  | **(J) DRAFT taken out of ENDED_STATUSES** | **36/36** |

* Probe (scratch suite, not committed):

  | Case | Result |
  |---|---|
  | P1: catch-up after a decline, meeting 12 days ahead | Sends 1, latest SENT. Correct. |
  | P2: 3 × `send()`, a reschedule event and a catch-up at once, after a decline | Exactly 1 fresh agreement. **With (C) applied: 5 fresh agreements, 6 in all.** So the re-check is what keeps "once", and no suite tests it (part 1's `check_fo3c` is also 42/42 with it weakened). |
  | P3: FO-5 `edit` puts A1 back to DRAFT → catch-up sends A2 → FO-5 `signedOffline` on A1 (200, SIGNED_OFFLINE) | See M1 |

### Majors
* **M1. A signed agreement that is not the newest never lifts the hold. The three reads disagree.**
  - In P3 the statuses are A1 SIGNED_OFFLINE and A2 SENT. Attended answers **409**, and by-booking says "Agreement not signed yet".
  - The firm then withdraws the duplicate A2. Attended still answers **409** (the hold is now on A2 WITHDRAWN), and `catchUp` sends 0, because its filter sees A1 as not ended.
  - So the booking is held, a signature is on record, and the panel promises "a new agreement is emailed", which is not true. The only way out is a reschedule followed by a third, e-signed agreement.
  - Cause:
    - `gate.ts:44-48` and `ofBooking` (`service.ts:172`) decide on the newest agreement.
    - The catch-up (`service.ts:142`) decides on "any agreement that is not ended".
  - Fix: one question for all three. A signed agreement lifts the hold. `send()`, the reschedule and the catch-up send a fresh one only when nothing is signed or waiting. Add a failing test for P3.
  - The break report's P2R3-1 found the same independently, including the e-signed variant.
* **M2. The ruling's own mechanism has no failing test (`STANDARDS.md:48` [M]).**
  - After a decline, withdraw or expiry, no event calls `send()`. The catch-up is the only path to a fresh agreement while the meeting is ahead.
  - Mutation (E) turns that off and the suite stays 36/36. B2 sends through `svc.send` directly; its comment ("the event's own send") names an event that does not exist. B6 tests only the past-meeting "none" side.
  - Fix: in B2, decline, then run `catchUp` and expect `sent: 1` and a SENT latest agreement.
  - Also add failing tests for (C), the concurrent fresh send (P2's shape), and (J), DRAFT counted as ended (Minor on their own, but the same standard).

### Minors (not blocking alone)
* **m3-1 (r2-2 only half closed).** On a No-show booking, pressing Attended still shows the server's red refusal `HOLD_WORDS` (`gate.ts:34`): "If the meeting time has passed, reschedule it". Reschedule refuses NO_SHOW. The same advice shows on a CANCELLED booking in the agreement paragraph (`agreementNextStep` knows only NO_SHOW); this is the break report's P2R3-4. Fix: the panel shows its own next step, not the raw detail, for statuses that cannot be rescheduled.
* **m3-2. The backoff cap is applied only when a row fails** (`live.ts:61`), never when a held row is checked (`live.ts:55`).
  - Example: a booking's first send keeps failing with its meeting days away, so the wait reaches an hour. It is then rescheduled to 40 minutes ahead.
  - The reschedule event sends nothing, because there is no agreement yet (`NO_AGREEMENT`). The held row's old `until` runs past the new meeting, so no agreement is ever sent and nothing holds.
  - Fix: also skip only while `held.until <= now + max(one catch-up, (before − now)/2)`.
* m3-3. `NotSent` is also thrown for race reasons (NOT_SCHEDULED, NOT_REQUIRED after a cancel or a switch-off between the read and the send). The effect is one warn line and a back-off for a row that will not return. Harmless; the comment says "not a race".
* Noted for the Lead, as the ruling says (not findings):
  - DRAFT counted as ended means a FO-5 edit gets a duplicate agreement within about 30 s.
  - A decline is followed by a fresh email at once, with no limit (P2R3-2).
  - The first email's link stays open after a FO-5 withdraw or edit (P2R3-3; the root is outside the diff).

### What held
* **The backoff math is right.**
  - The wait is `min(doubled wait, max(30 s, half the time left))`, and the doubled wait is stored uncapped.
  - With T left, each try lands by T/2 plus one catch-up, so a row is retried while T ≥ about 60 s.
  - B5 proves that the row is held back, then tried at 30 s, then at 90 s, and that the provider coming back at 70 minutes is tried before the 100-minute meeting.
* **NO_TEMPLATE now backs off** (B8 red without `sendOrThrow`).
* **The reminder reads the type's switch** (B9).
* **The reschedule sends a fresh agreement when the latest has ended** (B6 fail).
* **The fresh agreement becomes SENT inside the locked transaction**, so a sender waiting on the lock sees it.
* **The panel words are true on SCHEDULED, RESCHEDULED and NO_SHOW bookings** in the agreement paragraph. The `held`/`ended` split matches the gate.

### Journey score, round 3 (reviewer): 8.5/10. Pass, no criterion at 0
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J-104 20/20 |
| Next step obvious | ½ | m3-1: reschedule advice where it cannot work |
| Plain words | 1 | |
| Feedback and state | 1 | |
| Correct data | ½ | M1: "Agreement not signed yet" beside a signed agreement |
| Error recovery | ½ | M1, m3-1 |
| Accessibility and sizes | 1 | W10 axe clean; only words changed. 1024 px and 200 % zoom not re-walked |
| Speed | 1 | |
| Visual | 1 | |
| Trust | 1 | |

Raise it by fixing M1 (correct data, recovery), then m3-1 (next step).

The journey-test report stays in this file, as I was told to change no other file.

Could not check: c2f6d13af (it arrived during the review); a real screen reader; an intended user's own walk (D17 and D20 stay with the founder).

Reviewer: Block 9f2754207cdd532db0094c26e69e1a6e478821b1

Verdict: Block 9f2754207cdd532db0094c26e69e1a6e478821b1 — fix M1, M2 (and m3-1, m3-2 in the same round if small).

## Part 2, round 3 re-check (8927036b4)

Scope: `git diff 9f2754207..8927036b4` only. Everything was run on a `git archive` copy of 8927036b4.

**Verdict: Ship (Approve).** M1, M2, m3-1, m3-2 and m3-3 are closed, and so is the break report's P2R3-4. What remains is Minor.

### What I ran
* Row suite: **45/45**.
* J-104 on isolated copy `rv104d` on :4436 (never :4400): **20/20**.
* My round-3 probe again. **P3 now goes through FO-5's real `edit` and `signedOffline`**, where B10 writes the status straight to the table:
  - FO-5 edit → DRAFT, and the catch-up sends A2.
  - FO-5 records A1 as signed on paper (A1 SIGNED_OFFLINE, A2 SENT).
  - By-booking shows A1, "Agreement signed", and **Attended answers 200**.
  - After that the catch-up sends 0.
  - P1 (the catch-up resends after a decline) and P2 (five at once → one fresh agreement) still hold.
* Mutations on the copy:

  | Mutation | Result |
  |---|---|
  | (C) In-lock re-check off | B11 red |
  | (E) Catch-up filter back to "no agreement at all" | B2 red |
  | (J) DRAFT taken out of ENDED_STATUSES | B11 draft red |
  | `DECIDING_ORDER` back to newest-only | B10 red |
  | Only the gate newest | B10 red |
  | Only `ofBooking` newest | B10 red |
  | Cap at the check off (`live.ts:56`) | B12 red |
  | `holdWords` back to `HOLD_WORDS` | B7 server words red |
  | `sendsFresh` always true | B7 other statuses red |
  | Both caps off | B5 and B12 red |
  | The cap at failure time alone off (`live.ts:63`) | 45/45 |
  | `RETRIED` back to "any reason" | 45/45 |

  The cap at failure time is now redundant: the check applies the same formula from `held.at`, so this is not a gap. `RETRIED` is m3-3's harmless-noise rule; see m3r-3.

### Round-3 items
* **M1: closed.** `DECIDING_ORDER` (signed, then waiting, then newest ended) is the one order for the hold, `ofBooking`, `send()`, the reschedule and the panel. `send()` sends only when the deciding agreement has ended, which is exactly when every agreement has, so it matches the catch-up's filter. Tested by B10 and confirmed through real FO-5 above.
* **M2: closed.** B2 now gets its fresh agreement from the catch-up. B11 covers the race and the draft case.
* **m3-1: closed.** The refusal's words follow the booking's status (`holdWords`). On No-show and Attended bookings they say to make a new booking (B7 server words).
* **m3-2: closed.** The cap is read again at each check with the meeting's current time (B12 pass and fail).
* **m3-3: closed.** Only NO_TEMPLATE, NO_LICENSED and NO_CLIENT_EMAIL back off.
* **P2R3-4: closed.** Attended and Cancelled bookings get their own next step, and no promise of a fresh agreement.

### New Minors (not blocking)
* **m3r-1.** After M1's fix, the duplicate left by FO-5's edit (A2, still SENT once A1 is signed) still gets its own 24-hour reminder ("Agreement not signed yet", `service.ts:275`) and its "Needs you" item (`service.ts:366`). Both read only their own agreement's status. This happens only on that path, which the Lead accepted. Fix: skip both when the booking's deciding agreement is signed.
* **m3r-2.** On a No-show, Attended or Cancelled booking whose agreement is still waiting, the panel still says "The client signs from the link in their email" (`agreement.tsx:46`). The client's link answers 404 for a booking that is no longer active, and the server's `HOLD_WORDS_INACTIVE` says so correctly. Fix: drop that sentence when `sendsFresh` is false.
* **m3r-3.** `RETRIED` has no failing test (mutation above). It is low value: the cost of a regression is one warning line per catch-up.

### Journey score, re-check (reviewer): 9.5/10. Pass, no criterion at 0
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J-104 20/20; P3 recovers through FO-5 |
| Next step obvious | ½ | m3r-2 |
| Plain words | 1 | |
| Feedback and state | 1 | |
| Correct data | 1 | Signed agreement shown and honoured |
| Error recovery | 1 | |
| Accessibility and sizes | 1 | W10 axe clean; only words changed |
| Speed | 1 | |
| Visual | 1 | |
| Trust | 1 | |

Could not check: a real screen reader; an intended user's own walk (D17 and D20 stay with the founder).

Reviewer: Approve 8927036b47dc0ed68e25d61b89c8297ac4abf514

Verdict: Approve 8927036b47dc0ed68e25d61b89c8297ac4abf514

## Part 2, CI fix (85860f3e9)

Scope: `git diff 0b6dc934b..85860f3e9` only. **Verdict: Ship (Approve).** No logic change.

* **What the diff contains:**
  - `agreement-words.ts` is renamed to `studio/contracts/consultation-agreement-words.ts`, 100 % similar: the content is byte for byte the same.
  - Two import paths changed: `agreement.tsx:17` and the row suite's line 58.
  - One comment changed.
  - `MODULE.rows/FO-3c.md`'s types-page path is corrected.
  - Three J-104 screenshots are refreshed.
  - Nothing else changed.
* **The move is complete:**
  - `../../../../../../contracts/` from `web/src/modules/front-office/booking/calendar/` resolves to `studio/contracts`. That is the same folder the precedent `case-check-words` reaches with `../../../contracts` from `web/src/components`.
  - A search of the folder (outside node_modules, var and dist) finds no reference to the old path; `qa/graph.json` already names the new file.
* **What I ran:**

  | Check | Where | Result |
  |---|---|---|
  | `vite build` (web) | `git archive` copy of 85860f3e9 | Passes |
  | `tsc -p web/tsconfig.json --noEmit` | Same copy | 0 errors |
  | Row suite | Same copy | 45/45 |
  | `check-select-suites.sh` | Repository, read-only | 83/83 |
  | `module-cards.py tree` | Repository, read-only | PASS (15 cards) |

  The working tree stayed clean.
* No new findings. The re-check Minors (m3r-1 to m3r-3) are unchanged and remain non-blocking.

Reviewer: Approve 85860f3e92ce79ff11b3b1ff116dbdbbb78dbea5

Verdict: Approve 85860f3e92ce79ff11b3b1ff116dbdbbb78dbea5
