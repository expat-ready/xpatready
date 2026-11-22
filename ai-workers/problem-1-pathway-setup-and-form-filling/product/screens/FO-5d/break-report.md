# Break report: FO-5d part 1 (decline reason column and check, `declineSigning`)

Breaker: Opus 5.5, fresh context, did not build it. 22 Nov 2026. Target: `745c6b101b93a8c2c1a5ce563115c2776fad8363` (diff `origin/main...745c6b1`).
Scope (P-26): the migration `20261123000000_fo5d_decline_reason`, `signing/decline.ts`, `tests/check_fo5d_decline.ts`. There is no screen and no route, so I attacked SQL and the function only.
Setup: three scratch databases on 127.0.0.1:54329 with every migration applied and `seedSampleFirms`: `xr_studio_fo5dbrk_c` (C, the local cluster), `_libc` (en_US.utf8) and `_bi` (builtin C.UTF-8). I called the function for real through Prisma (`auditEvent`, two clients for the races). All three databases are dropped. Live AI off, US$0. No code edited.
Note: the branch moved to `b8462e6cf` (review round 1) while I worked. Sections A to C ran on 745c6b1. The race runs (D) used b8462e6's `decline.ts`, whose lock and write code is byte-identical to 745c6b1's; only `declineReasonOf` changed.

## Baseline
`npx tsx --tsconfig api/tsconfig.json tests/check_fo5d_decline.ts` at 745c6b1: 31 passed, 0 failed.

## Findings

### Major
**B1. A NUL or a lone surrogate passes `declineReasonOf`, then the database refuses it. The caller gets a raw error (500), and with a surrogate also a false audit-trail alarm.** (decline.ts:24 `CONTROL` starts at U+0001; nothing checks that the text is well-formed)
* `declineSigning(tx, auditEvent, {firmId: A, signerId: c1, reason: "Too\u0000expensive", at, via: "door"})` throws `DriverAdapterError: invalid byte sequence for encoding "UTF8": 0x00`, not `DeclineReasonInvalid`. The rollback is clean: the request stays SENT, 0 lines.
* `reason: "Too\ud800expensive"` (also `"x\udc00"`): the signer update goes through (the driver writes U+FFFD). Then `auditEvent.record` fails with P2007 because the jsonb detail refuses the `\ud800` escape. Logged: `audit_write_failed`, `AuditWriteFailures: 1`, `alert audit_write_failed rule BR-5`, then a throw (rolled back). Once the public door calls this, anyone holding a link can set off the audit alarm.
* Observed at b8462e6: both now raise `DeclineReasonInvalid` ("Remove control characters…", "The reason has a character we cannot read."). The reviewer's M1 found the same.

### Minor
**m1. The "characters" counts differ** (decline.ts:33 at 745c6b1). `"\u{1F600}".repeat(300)` gets "The reason is at most 500 characters." although that is 300 characters, which `char_length` keeps. 250 emoji are kept. This is stricter than the database, so there is no 500, but the words are wrong. Fixed at b8462e6 (`[...t].length`).

**m2. A reason with no visible character, or with a C1 control or bidi-override character, is accepted by both JS and the database.** That contradicts the header's "at least one visible character… no other control character".
* `declineSigning` declined with these stored reasons: `"\u009b"` (C1 CSI, alone), `"No\u0085"` (NEL), `"ㅤ"` (Hangul filler), `"­"` (soft hyphen). Also accepted alone: U+034F, U+115F, U+180E, U+2061, U+2800, U+FFA0, U+E0020.
* `"‮ecivres dab"` (RIGHT-TO-LEFT OVERRIDE) was stored and goes verbatim into the audit `after`, so the firm's Activity log shows reversed text.
* No crash and no data damage, but the firm can receive a "reason" that is blank on screen, or text that looks other than it is.

**m3. The CHECK depends on the locale.** On a builtin C.UTF-8 database, `[[:space:]]` matches U+0085, so `declineSigning(..., reason: "No\u0085")` and `"\u0085No"` throw `violates check constraint "fo_signer_decline_reason_check"` (500). JS trim keeps U+0085. On C and en_US.utf8 (the local cluster, new-machine.sh, RDS default) the same reason is stored. A full sweep found 628,880 JS-accepted values: C refused 0, libc refused 0, builtin refused 3 (U+0085 lead, trail, alone).
* The other direction: `E'abc '` and `E' abc'` pass the CHECK on C but fail on libc and builtin. A direct-SQL row written on a C cluster would fail a restore into an en_US cluster, which validates CHECKs. Fix idea: spell the space class out instead of `[[:space:]]`.

**m4. `at` before `sent_at`, or an invalid date, gives a raw error instead of a typed answer.**
* `at = sent_at - 1 ms` gives `DriverAdapterError … violates check constraint "fo_signature_request_times_check"`. It is raised on the request update, after the signer update, then rolled back (state SENT, 0 lines).
* `at = new Date("nope")` gives `PrismaClientValidationError` at decline.ts:73.
* `sent_at` defaults to the database clock while `at` is the API's injected clock, so clock skew alone can turn a valid decline into a 500.

**m5. A request whose expiry has passed is still declined.** `at = now + 30 days` (expires_at = now + 14 days, status SENT) returned `declined`, and the request became DECLINED with `ended_at` after `expires_at`. The function documents no `expired` refusal. If the door does not check the expiry first, a dead link can still decline.

**m6. A signer id or firm id that is not a uuid throws P2007** (decline.ts:63, `findFirst`), where `{refused: "unknown"}` is expected. `declineSigning(..., signerId: "not-a-uuid")` gives `PrismaClientKnownRequestError P2007`. `firmId: "nope"` gives the same. This matters for the hook path ("by the provider's signer id") if any id arrives unmapped.

**m7. The "unreachable" branch (decline.ts:72) is reachable, and the database does not tie a reason to a DECLINED request.**
* `update fo_signer set declined_at=now(), decline_reason='raw' where id=c1` commits; the request stays SENT. `declineSigning(c1)` then answers `{refused:"ended", status:"DECLINED"}` for a SENT request. Next, `declineSigning(c2, "second")` declines, which leaves 2 declined signers with reasons.
* `update fo_signer set declined_at=now(), decline_reason='We both decline' where request_id=R` (all 3 signers, one statement) is accepted. After it, `update fo_signature_request set status='CANCELLED', cancel_reason='WITHDRAWN'` is also accepted, so three reasons sit on a CANCELLED request.
* The claimed rule (a reason only with `declined_at`, never changed after) still holds. "One decline ends all" is enforced only by the function, not by the data.

**m8. Races surface raw database errors (expected, recorded).** This is FO-6's trigger order: the signer row is locked before the trigger locks the request.
* When `UPDATE fo_signer` (sign c1) runs inside decline's lock-to-update window, 40P01 `deadlock detected` hits the sign, and the decline wins.
* With the signer row locked first (`select … for update`, then the sign), the decline is the victim (`DriverAdapterError deadlock detected`).
* Both cases end with exactly one winner and consistent data. Under Serializable, the losers get P2010 (serialisation).

## What held
* **CHECK plus trigger:**
  * A reason without `declined_at` is refused (`fo_signer_decline_reason_check`).
  * Reason then `declined_at` in one transaction: refused.
  * `declined_at` then reason (two statements, one transaction): refused ("signed or declined does not change").
  * Change, clear or add a reason later: refused.
  * INSERT with `declined_at` and a reason: refused.
  * A signed signer given `declined_at` and a reason: refused.
  * Request moved to DECLINED with no declined signer: refused.
  * `INSERT … ON CONFLICT DO UPDATE` setting both at once: the same as the allowed single update.
  * Turning triggers off with `session_replication_role=replica` needs a superuser, so it is out of scope.
* **Concurrency:**
  * 30 pairs of concurrent declines on one request from two connections, half on the same signer, half on two signers (READ COMMITTED): 30 `declined`, 30 `refused ended`, exactly 1 audit line each, no errors.
  * Serializable: 30 winners, 30 P2010, 1 line each.
* **Decline against cancel:**
  * Decline holds the lock, then a cancel arrives: the cancel waited 815 ms, then got "a DECLINED request is final".
  * Cancel first: the decline got `{refused:"ended", status:"CANCELLED"}`, 0 lines.
  * Decline holding the lock against a sign of c2: the sign got "DECLINED request is final".
* **The firm wall:** firm B's signer id under firm A gives `{refused:"unknown"}` and the request is unchanged. Under xr_app, the wall is covered by the reviewer and by b8462e6's new test.
* **The audit line:**
  * The actor, entity and action match AuditPort.
  * `detail` holds ids and one boolean only.
  * The reason goes only to `after` (personal data allowed there by P-687). A reason containing an email is stored in `after`; that is allowed, and `detail` stays clear.
  * No SECRET_FIELD key. Fail-closed.
* **JS against the database (C and en_US):** 0 mismatches over 628,880 JS-accepted values (the BMP to U+3100, U+FE00 to U+FFFF, tags) apart from B1.

Verdict: Changes 745c6b101b93a8c2c1a5ce563115c2776fad8363

## Round 2 (diff-only: `git diff 745c6b1 a88804987ec30e38e49424da78d66aec4617589d`)
Fresh C, en_US.utf8 and builtin C.UTF-8 scratch databases at a888049 with `seedSampleFirms`, dropped after. Shipped test: 39 passed, 0 failed.

**R2-M1 (Major). Past expiry, a request where one of two clients signed is refused as EXPIRED, and it can never expire** (decline.ts, `r.status !== "CLIENT_SIGNED"`; the comment says "no client signature", and FO-6 BR-16 never expires a request a client signed).
* Repro: `envelope()`, `sign(c2)`, then `declineSigning(c1, "No", at = now + 30 days)` → `{refused:"ended", status:"EXPIRED"}`, still SENT, 0 lines.
* On that request, `status='EXPIRED'` is refused ("a client signed never expires"), but `sign(c1)` goes through.
* So the client may still sign but not decline, and is told "expired" about a live request. Fix: test whether any CLIENT signed. (A builder was patching this in the working tree as "review R2-M1" while I ran.)

**R2-m1 (Minor).** Still kept as a reason, by JS and the database alike:
* invisible-only text: `\u{E0020}`, `\u{E0001}` (tags), `\u{E0100}`, `\u{1D173}`, `￹`, `؜`, `⁪`, `` (private use), `⁥`;
* `"a"` followed by tag characters, which carry hidden text into the Activity log.

**R2-m2 (Minor, note).** The `at` clamp corrects early moments silently: `new Date(0)` gives `ended_at = sent_at + 0.000902 s`, so a broken clock goes unseen. There is no upper bound: on a CLIENT_SIGNED request, `new Date(8.64e15)` stores the year 275760.

**Held in round 2:**
* **Full JS-against-database sweep** (U+0001 to U+10FFFF except surrogates, 4 positions, 4.45 M values JS keeps): JS keeps but the database refuses 0 on C, en_US and builtin; JS refuses but the database keeps 0. The database refuses the same 347 values in every locale (m3 fixed).
* **Characters:** NUL, lone surrogates, C1, RLO and LRI are refused. Invisible-only (U+3164, U+00AD, U+2800, LRM) counts as no reason. 500 emoji are kept, 501 refused.
* **The `at` clamp and expiry:** `at` = sent_at in ms (`.054708`) ends at `.055000`. `at` = `expires_at`, and VIEWED past expiry, give EXPIRED with nothing written. CLIENT_SIGNED past expiry: the firm may decline.
* **Ids:** non-uuid, number or space-padded ids give `unknown`; upper-case uuids decline. A string `at` throws a plain Error. **The migration** was edited in place under the same stamp; acceptable only because 745c6b1 never reached main.
* **Races, unchanged:** 30 pairs gave 1 win and 1 `ended` each, with 1 line each. Serializable losers get P2010. Decline against cancel and decline against sign behave as before; m7 and m8 stay notes.

Verdict: Changes a88804987ec30e38e49424da78d66aec4617589d
