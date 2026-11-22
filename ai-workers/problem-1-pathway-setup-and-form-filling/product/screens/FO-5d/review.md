# Review: FO-5d part 1 (the signer's decline reason and the signing-side decline function)

Reviewer: Opus 5.5, high effort, a fresh context that did not build it. 22 Nov 2026. Branch `claude/great-volta-qsngem` at `745c6b101b93a8c2c1a5ce563115c2776fad8363`, diff `origin/main...745c6b1` (5 files, +335).
Scope: Lead 4's split (22 Nov 15:35 IST). This part holds the column, the CHECK, `declineSigning` / `declineReasonOf` and their database tests. No route, hook, withdraw or edit change, so their absence is not a finding (P-26).
Requirement: AG-5-68 r1-r2 and §7 (`declineReason?`, `declinedAt`); brief `design/briefs/track-b/FO-5d.md` @098153d17; P-600 (1)(a)-(e).

## What I ran
* `npx tsx --tsconfig api/tsconfig.json tests/check_fo5d_decline.ts` gave **31 passed, 0 failed, exit 0**. `graph.mjs --check` exit 0.
* JS against the database, run on my own scratch copies: `declineReasonOf` against `fo_signing_reason_ok`. I tried every code point U+0001 to U+10FFFF (step 1 in the BMP, 97 above it), each in 4 positions, on a C-locale database and on an `en_US.utf8` database (the docker `postgres:18.3-bookworm` default). JS accepted 305,243 values and the database refused **0** of them in both locales. The only gaps are U+0000 and unpaired surrogates (M1).
* On a fully migrated scratch database, I called `declineSigning` for real:
  * under the wall (`SET LOCAL ROLE xr_app` plus `app.firm_id`);
  * across firms;
  * with three declines at once on one request;
  * with an upper-case firm id;
  * with NUL, an unpaired surrogate and U+0085 in the reason.

  My probe scripts and scratch databases are deleted. No code or other file was edited.

## The departure: the CHECK plus FO-6 part 1's trigger instead of a replaced trigger
**The departure holds.** I found no write path that sets or changes a reason which the brief's rule ("set only together with `declined_at`, never changes after") would refuse:
* **INSERT with a reason:** the trigger forces `declined_at` to be null on insert, so the CHECK refuses the row (test :112).
* **UPDATE of the reason alone on a live signer:** the CHECK refuses it (:111).
* **UPDATE of the reason together with `declined_at`:** allowed. This is the intended path.
* **Any later change** (change the reason, remove it, add it after a decline with no reason, or clear `declined_at` and the reason together): `fo_signing_signer_write` refuses every update once `OLD.declined_at` is set (:116-123; these run on live requests, so they prove the signer rule rather than the "final request" rule).
* **A signer who signed, or a final request:** the trigger refuses it.
* **`xr_staff_bypass`:** BYPASSRLS skips row policies, not triggers.
* **Paths that turn the triggers off** (`session_replication_role=replica`, DISABLE TRIGGER by the table owner): a replaced trigger would be off just the same. The CHECK even keeps "a reason needs `declined_at`" there.

Not re-owning a SECURITY DEFINER function is the better choice. The cost is that the "never changes" half now lives in FO-6's function. The migration header (:7-10) names this dependency, and test :116-123 fails if a later rewrite drops that clause. The departure is recorded in the migration header (not silent).

## Checked and sound
* **Locks and races (decline.ts:63-75):**
  * The order is request `FOR UPDATE`, then the signer, which matches FO-6's documented writer order. The signer's own trigger re-touches the request this transaction already holds.
  * Under READ COMMITTED the signer is read again after the lock (:70). REPEATABLE READ would raise a serialisation error instead.
  * Three concurrent declines on one request gave 1 `declined`, 2 `ended`, one audit line and one declined signer. The guarded `updateMany` plus the count check (:73-75) cannot half-apply.
* **The wall (PF-12):** the function uses the caller's `tx`, opens nothing and bypasses nothing.
  * As xr_app with firm A: declined, and the audit line carries firm A.
  * As firm B, on firm A's signer, with either firm id: `unknown`, state unchanged.
* **The audit line:**
  * The actor `system:signing-door` / `system:signing-hook` matches `AuditActor`; `fo_signature_request` matches `AREA_ENTITY`.
  * `detail` holds ids and one boolean: no personal data, no `_before`/`_after` keys.
  * The before/after keys (`status`, `declinedAt`, `declineReason`) do not match `SECRET_FIELD`.
  * The reason (500 or fewer characters, under the 4000 limit) goes in `after`, which R1.8 / P-687 allows.
  * The audit write is fail-closed (test :207-212).
* **The migration:**
  * It is additive: one nullable column with no default (no table rewrite), one CHECK every existing row meets, one function.
  * The prefix is `fo_signing_` (P-600 (c)). The stamp `20261123000000` is later than main's newest, `20261122033000` (P-600 (d)).
  * The rollback order is right: the constraint comes off before the function.
  * `migrate diff` names nothing.
  * The demo-data copy is measured right after this migration and before any later one (test :96-99, then :100).
  * The Prisma line (`String?` mapped to `decline_reason`, so `text`) matches.
* **The test's honesty:** each database rule is proved on its own, and removing the CHECK fails :111 and :112. The reason cases each break one clause. The function cases check database state and audit-line counts, not only return values.

## Findings

### Blocker
None.

### Major
**M1. `declineReasonOf` accepts a NUL and unpaired surrogates, which the database refuses. The result is a 500, and with a surrogate also a false audit-failure alarm.** (decline.ts:24, :31-35)
* `CONTROL` starts at U+0001, and nothing checks that the text is well-formed UTF-16. The module row promises "else DeclineReasonInvalid → 422".
* **Scenario 1:** `declineSigning(tx, auditEvent, { reason: "No\u0000thanks", … })`. JS returns the text. The signer `updateMany` throws `DriverAdapterError: invalid byte sequence for encoding "UTF8": 0x00`, so the door would answer 500. The rollback is clean: the request stays SENT.
* **Scenario 2:** `reason: "No \ud800 thanks"`. The driver writes U+FFFD into `fo_signer`. Then `audit_event.detail` (jsonb) refuses the `\ud800` escape. That logs `audit_write_failed`, raises the `audit_write_failed` alert and bumps the `AuditWriteFailures` metric, then answers 500 (rolled back). Once FO-6 part 4's public door calls this, anyone holding a link can set off the audit-failure alarm whenever they like.
* **Fix:**
  * Widen `CONTROL` to `\u0000-\u0008` (the database cannot store NUL, so `fo_signing_reason_ok` needs no change).
  * Refuse ill-formed text with `DeclineReasonInvalid`, for example `if (!t.isWellFormed())` or a lone-surrogate regex.
  * Add `"a\u0000b"` and `"a\ud800b"` to the fail case at check_fo5d_decline.ts:140-142, and one end-to-end case that proves state unchanged and no alert.

### Minor
* **m1. The wall is never exercised by the test** (check_fo5d_decline.ts:144-147, :188-193). The suite connects as the superuser `xr_studio`, so RLS and `platform_firm_first` are bypassed. "another firm's signer → unknown" is proved only by the `firmId` filter. My manual run under xr_app passed (see above), so the code is fine.
  * Failing scenario: a later change that drops `firmId` from the `findFirst` at decline.ts:63 would leave the wall as the only guard, and this suite would not notice.
  * Fix: run one decline and the cross-firm case in a transaction as `xr_app` with `app.firm_id` set, as other walled suites do.
* **m2. A test label claims more than the test proves** (check_fo5d_decline.ts:165-167). The label says "the other client cannot sign or decline", but that client (`e.c2`) had already signed at :153. Only the firm signer's sign and decline, and the reason change, are tried.
  * Fix: try a fresh unsigned client on that request, or correct the label.
* **m3. The "characters" counts differ** (decline.ts:33). JS counts UTF-16 units, while `char_length` counts code points. A reason of 260 emoji (260 characters) is refused as "at most 500 characters", although the database would keep it. It is stricter, so there is no 500, but the words are wrong.
  * Fix: compare `[...t].length`, or say "500 characters (emoji count as two)".

## Notes for FO-5d part 2 and FO-6 parts 3-4 (not findings here)
* A future sign writer must take the request lock first. A sign that runs `UPDATE fo_signer` first holds the signer row while its trigger waits for the request, which deadlocks (40P01) with a decline that holds the request lock.
* `at` earlier than `sent_at` breaks `fo_signature_request_times_check` and gives a 500. The hook caller should choose its clock with this in mind.
* `declineSigning` lets the FIRM signer decline (test :201-205). That is consistent with the vendor envelope, which includes the firm signer, but FO-6's m8 says "a firm that stops a request withdraws it". Part 2's "needs you" words ("Client B declined…") should settle the FIRM case.

## Journey score
**N/A: not scored.** This part has no screen and no route, so the journey-test skill's browser walk, accessibility, screen-size and words criteria cannot apply. In their place I did the data checks underneath and a break-it pass by calling the function (above): correct data, the wall, races and hostile text. FO-6 part 4's door and FO-5d part 2 carry the person's journey (Decline on the signing page). Not checked: a real screen reader, an intended user's walk (D17/D20).

Verdict: Changes 745c6b101b93a8c2c1a5ce563115c2776fad8363
