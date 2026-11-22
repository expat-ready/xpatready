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

Verdict: Changes be10e6d24ee1efbc06a0fa8e4a8d59dfa86a3000
