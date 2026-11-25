# R1.60 part a1 — break report (database and service level)

PR #3681, branch `claude/runtime-r160-a1`, head **`bd28f653a0f508470097d38ef67fa4efc2d468c0`**. Scope: rules.md R1-R6, R8, R16, B1-B6 (API only, no screen). Fixes: none (report only).

**Verdict: PASS. No Blocker, no Major; 5 Minor.**

## How
- I ran one scratch script outside the repo against its own database: every migration, the Sample seeds, the fake signing vendor, Signed offline. It used the PR's own `DepositOnSigning` listener with the **real** `PrismaNotificationPort` (the PR's test uses a fake).
- I re-ran it on a clean `git archive` of the head, because the shared working tree changed while I ran (someone else's uncommitted edits to `signed-hooks.ts`, the migration and the test). Every result below is from that head copy.
- Two clients: the owner role, and the API's walled pool (`walledPool` → `xr_app`, `withFirm`). The PR's `check_r160_deposit_prepare.ts` also passed at head: 36 pass, 0 fail.
- Scratch databases are dropped: `pg_database` has no `xr_break_*` or `xr_studio_r160a1_*` left.

## Attempts
| # | What I did | Expected | Actual | Verdict |
|---|---|---|---|---|
| W1 | E-sign completion through the webhook as `xr_app` under the firm walls, real NotificationPort | One PREPARED request, passes RLS and `money_trust_on`, one Needs you row | One request, CAD 1,000.00 + 130.00, no number, no held line; one `msg_notification` row (NEEDS_YOU, `trust-request`) to the representative. The trigger is still SECURITY DEFINER, owned by `xr_wall_reader`, search_path pinned | pass |
| W2 | Signed offline as `xr_app` under `withFirm` (a staff request's firm) | Same | Same | pass |
| W3 | Signed offline with no firm scope, real port (not an app path) | Signature stands | Signature stands. The listener is held (the port refuses with no firm), so no request; the held line's fault says only `Error` | pass (see m2) |
| C1 | 3 deliveries of one completion at once (2 owner, 1 walled) | One request | 1 applied, 2 duplicates; one request, one audit line, one item | pass |
| C2 | 10 listener calls at once for one version: 5 owner, 5 walled; then 10 for a new version | One row each | No new row and no held line; then exactly 1 row and 1 `trust.request_prepared` line | pass |
| C3 | Signed offline racing the completion on one CLIENT_SIGNED version (run twice) | At most one request | Whichever wins signs; the other gets 409 CHANGED; one request | pass |
| F1 | Deposit rows of 100,000,000.00 (the fee-row maximum, above MINOR_MAX), 21,474,836.47, 0.01, 0 | Signature always stands | 100M: nothing prepared, one `trust.request_not_prepared` line. MINOR_MAX: prepared (see m4). 0.01: tax 0. 0: nothing | pass |
| F2 | 120-character label mixing French, Chinese, Hindi and a symbol; a label with BEL/ESC (direct call: the e-sign payload allows any character up to 200) | Purpose kept, or plain | Purpose keeps the full label; the control-character label falls back to "Deposit on signing" | pass |
| F3 | Direct listener calls: EUR, USD, `-100`, a 14-digit amount | Refused or held | EUR: not prepared, line by name. USD: prepared in USD. `-100` and 14 digits: ZodError thrown before any savepoint. The real callers cannot produce these: fee rows are CHECKed to CAD and 0..10^10, and the payload is parsed earlier | pass (see m3) |
| T1 | Trust NO, then sign; YES, sign, then NO; a deposit while NO; paper signing racing the Owner's NO | Nothing while NO; nothing cancelled by itself | Nothing prepared while NO. A PREPARED request stays PREPARED after NO and is hidden (404) until YES again. Deposit refused. The race: whichever commits first decides, no held line, no deadlock | pass |
| P1 | Deposit through #3033 against a PREPARED request; a raw `money_payment` row against it | Refused | 409 MONEY_RULE "only a sent, not cancelled, trust request takes a payment"; the raw row is refused by the database; a plain deposit for the same client still works | pass |
| P2 | #3033 cancel of a PREPARED request, then the signing replayed | Cancelled, no number, still holds its version | Cancelled, `number` null; the replay writes nothing | pass |
| O1 | #3033 as `xr_app`: create unsent, create sent, deposit, cancel unsent, cancel sent; edit the amount once paid | All as before the new trigger | Unsent "Waiting"; sent DR-0002; deposit ok, reads "Paid" with no Prepared fields; cancel keeps DR-0003; amount refused once paid | pass |
| K1 | COMPANY retainer signed offline | Held by the company | `person_id` null, `company_id` the company, tax 13000; the read says "Prepared" | pass |
| X1 | Firm B reads firm A's request; under A's walls, a prepare for firm B; one version id at both firms; A's listener naming B's person (direct calls) | 404; blocked | 404; walls block B's insert. Same uuid at two firms gives one row each (firm-scoped index). B's person is written: `money_trust_request` has no FK on `person_id`; this is #3033's schema, and front-office ids are same-firm by their own composite FKs | pass |
| N1 | Who gets the item; read it back through `MyNotifications.list` and Home's `needsYou` | The representative, one item they can open | Right person, one row. But label and link are null, and Home's Needs you returns nothing | pass (see m1) |
| L1 | Listeners that poison the transaction (`1/0`), throw an object whose name cannot be printed, or run 6.5 s | Signature never undone | `1/0`: held, SIGNED. Unprintable name: the `catch` throws and the paper signature rolls back to DRAFT. 6.5 s: Prisma's 5 s transaction timeout rolls the signature back | pass (see m3; the real listener does neither) |
| B6 | Turn #3033's unsent into PREPARED and back, with raw updates | Refused both ways | Both refused: "the number and the times are the database's" | pass |
| R1 | Count `money_invoice` after every attack | Unchanged | Unchanged (0 new) | pass |

## Findings (all Minor)
- **m1 — the Needs you item cannot be read or opened (R6).**
  - What happens: the row is written, but no labeller is registered for item kind `trust-request`, so the person's list shows `label: null, link: null`. That is the same as "the item is gone" (`platform/notifications/labels.ts`; only `front-office/sales/lead-notification-labels.ts:26` registers a labeller).
  - Home's "Needs you" reads only group `MY_DEADLINES` (`platform/notifications/store.ts:92`), so a NEEDS_YOU item never shows there.
  - A representative who is inactive or has in-app off gets nothing, and nobody else is told (`client-money/trust/on-signed.ts:87`).
  - Suggest: a labeller for `trust-request` with part a2's list.
- **m2 — a held listener is never retried, and the line says it will.**
  - The held line's text promises "tried again by its own catch-up, or by a person", but part a1 has no catch-up. R13's on-YES pass (part b) runs only when the Owner answers.
  - The fault is recorded only as the error's class name (`Error`).
  - At `front-office/retainers/signed-hooks.ts:36,39` (W3).
- **m3 — "never undoes the signature" holds only for well-formed faults.**
  - `RetainerSigned.parse` runs before the savepoint (`signed-hooks.ts:30`).
  - The `catch` can itself throw, at the `name` print (`:36`) or the audit write.
  - A listener slower than the 5 s transaction timeout rolls the signing back.
  - None of these is reachable with today's one listener and its bounded inputs. Uncommitted edits in the shared tree already move the parse inside the savepoint; that is not at this head.
- **m4 — the size check counts the deposit row alone, without its tax (R4).**
  - A row of 21,474,836.47 is prepared with 2,791,728.74 estimated tax. The total, 24,266,565.21, is more than one request, payment or trust balance holds (MINOR_MAX) (`on-signed.ts:61`).
  - Suggest: check amount + tax against MINOR_MAX.
- **m5 — the database does not keep B4's key to PREPARED or sent requests (B4, B6, defence in depth).**
  - As `xr_app`, a PREPARED or cancelled-unsent request can be DELETEd: the trigger refuses delete only once sent (migration lines 19-24). That frees its version, so a replay would prepare a second request.
  - A PREPARED request's `retainer_version_id` can still be changed while unsent (it is fixed only once sent, lines 49-55).
  - A row that is not prepared can still carry a `retainer_version_id` (the CHECK at line 14 goes one way only). It would silently hold the version, which rules case 7 says must never count for B4.
  - No app path does any of this today: #3033's `RequestIn` has no version, and nothing deletes. Suggest: refuse DELETE when `retainer_version_id` is set, and `CHECK (retainer_version_id IS NULL OR prepared_at IS NOT NULL OR sent_at IS NOT NULL)`.

## Notes (not findings)
- A PERSON retainer with no signer prepares nothing and writes no line ("no single client", `on-signed.ts:48`). I could reach that only with a raw update.
- A firm registered for tax with no province stores tax 0. The audit line's `taxSource` shows why.
- A raw `sent_at` update numbers a PREPARED request DR-0001 through #3033's numbering (B5 holds). Send itself is part a2 (R7, R17).
