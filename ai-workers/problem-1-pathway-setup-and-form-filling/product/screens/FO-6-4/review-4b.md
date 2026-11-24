# FO-6 part 4b (#3460): review of the public signing door

Commit `2ba80d7c4d5f771fc22bf234cb9a832c6d33da69` on `claude/runtime-fo6-door-4b`, diff `origin/main...2ba80d7c4 -- ai-workers/` (17 files, +439 −15). The reviewer did not build it. Read against note.md (rules 2-10 and 13, the Challenge section, the Part 4b additions), plan-4b.md, the BACKLOG FO-6 row, P-564 and Lead 24's answers (code on by default; code off is a bearer link until signed; the setting is read on each call; the limit is per address and token; AUD-3 binds only /api/system). The breaker attacks in parallel, so this is a review, not a second attack.

## Runs
* `run-suites.sh --only "check_fo6_door.ts check_fo6_door_code.ts check_fo6_signing_api.ts check_pf28_inputs.ts check_pf12_walls.ts"`: **all PASS**. fo6_door 25/25 (6 lines for 4c pending), door_code 23/0, signing_api 51/0, pf12_walls 110/0, pf28 51/51. Exit 0.
* Hand probes on an isolated copy `rv4b` on :4437 (runtime ports, 40-minute TTL, now stopped; never :4400). After `check_fo6_door.ts … 4a,4b`, curl and SQL on request A's live link:
  * verify gives `Set-Cookie: xr_sign=<43>; Path=/api/public/sign/<token>; Max-Age=1800; HttpOnly; SameSite=Strict` (local, so no `Secure`). Every answer has `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.
  * cookie 1 opens `/session` (200). A second verify gives cookie 2, and then cookie 1 → 401 and cookie 2 → 200: the session is replaced, so no fixation.
  * replaying a spent code → 422. With `session_expires_at` moved into the past, the cookie → 401.
  * `GET :token` leaves the signer row byte-identical (md5 of the row before and after).
  * request and retainer both read VIEWED after `/session`, with one `signing.viewed` line per request.
  * the audit lines hold no token and no code (0 rows).

## What holds (checked)
* **Bound to one browser:** the cookie attributes are as written (`door.controller.ts:53-54`). The token is validated by `TOKEN_SHAPE` before it reaches the cookie's Path, so no header can be injected. Only the sha256 is stored (`door.ts:99`). The session is replaced on every verify and on every code-off consent (`door.ts:97-101`, `:138`, `:158`). Expiry is checked on the server (`door.ts:83-86`).
* **Consent with the code on:** without a session it answers 401 (`door.ts:151`; test C). **Code off:** consent starts and replaces the session, and consent is not written twice (test D). The setting is read on each call (`emailCodeOn` at `door.ts:111, 119, 132, 150, 168`).
* **One 404** for unknown, malformed, other-firm and firm-signer tokens: `role: "CLIENT"` is in the lookup (`door.ts:60`), and the malformed case is refused in `begin` with the same problem (test B, compared as identical text).
* **Ended states** are worded with the firm's name and no personal data (the B loop covers UPDATED, WITHDRAWN, DECLINED, EXPIRED and PAST_EXPIRY). Every write refuses with 409 `LINK_<state>`.
* **Locking:** every write takes the request's row lock (`door.ts:92-95`; door-code's `lockedSigner`). The wrong-code count is committed before the problem is thrown (`door.ts:136-140`). viewed_at is written once and checked again under the lock (`door.ts:176-183`). Actor `system:signing-door`.
* **withFirm** comes from the token's firm, with no bypass use (`door.ts:59`).
* **Order in the controller:** headers, then the limiter, then the token shape, then `parseInput` on the body (`door.controller.ts:45-50`, `:68/74/80`).
* **Migration:** additive (two nullable columns and one CHECK with both-or-neither, `fo_signing_sha_ok` and `isfinite`), and the Prisma schema matches. `rollback.sql` drops the check, then the columns. Part 1's `fo_signing_signer_write` is `BEFORE INSERT OR UPDATE` with no column list (`20261122020000…/migration.sql:318`) and no later migration replaces it. So every UPDATE of the new columns hits "the request is % and final" and "a signer who signed or declined does not change" (`:302-307`), and an ended signer's session is frozen.
* **link-mail:** no localhost link outside local without STUDIO_PUBLIC_URL, and the email's words name every end (door_code S lines). The PF-28 exception (`POST …/code missing`, ceiling 19→20) is honest: `{}` is a valid body. It still awaits the tech lead.

## Findings

### Major
1. **"Signed" wording misses j_61's words (rule 4).** `door.ts:71` answers "This agreement has already been signed.". That matches neither j_61's `REFUSED` (`tests/journeys/j_61.ts:65`: it has "has been signed" and "already signed", not "has already been signed") nor check_fo6_door's own `/already signed|has been signed/i` (`check_fo6_door.ts:232`). Checked with node: `false` for both the text and the JSON body. It is hidden today only because that line is PENDING until 4c, but j_61 W6 and W7 API (`j_61.ts:239, 251`) will fail on it.
   * **Fix:** "This agreement has been signed." (or "…is already signed.").
   * **Test:** add a seeded `SIGNED` (and `CANCELLED SIGNED_OFFLINE`) case to the B ended-state loop, so 4b proves its own wording.
2. **Rules with no failing test line.** Each of these holds today (probed by hand above), but the suite stays green if any one is removed:
   * rule 7: viewed_at once, and SENT→VIEWED on both the request and the retainer (`door.ts:176-183`);
   * rule 7: GET of the state writes nothing;
   * rule 7: `/session` before consent → 409 CONSENT_NEEDED (`door.ts:169`);
   * rule 6: with the code on, a second verify ends the first browser's session (no fixation; only the code-off replacement is tested, in D);
   * rule 6: server-side session expiry;
   * rule 10: `Cache-Control: no-store` and `Referrer-Policy: no-referrer` (the F line tests only the limiter).

   **Fix:** add these lines to `check_fo6_door.ts` C and F. Each can reuse the existing jars; expiry can use SQL on `session_expires_at`, as the B stand-ins do.

### Minor
1. **The code can be recovered from the outbox.** `link-mail.ts` `sendSigningCode` puts `sha256(code).slice(0,16)` in the idempotency key. `msg_outbox.idempotency_key` is a plain column, while the body is sealed (PF-19e), and an unsalted hash of a 6-digit code is the code: brute force recovered `656363` in under a second. **Fix:** key on `signing:<requestId>:code:<signerId>:<codeExpiresAt ms>`, or a random nonce.
2. **The retainer's VIEWED move has no version guard** (`door.ts:181`). The webhook guards it with `currentVersion: q.document_version` (`signing/service.ts:203`). **Fix:** add `currentVersion: f.request.documentVersion` to the where.
3. **Ended state and session are read before the lock** (`door.ts:118, 131, 148-151, 167`). A request ended between `open` and the write makes part 1's trigger raise, which answers 500, not the 409 in words. **Fix:** check `ended`/`liveSession` again on the locked rows, or map `restrict_violation` to the 409.
4. **Behind a proxy, the per-address ceiling becomes one global ceiling** (`door.controller.ts:29`). Rule 10 says only the per-token limit protects a link there, but in fact 300 a minute is then shared by every client of every firm, so one caller can block all doors. **Fix:** say so in the note and the MODULE row, and name it on the trust-proxy platform row (Lead 24, answer 9).
5. **The code-off 401 title says "Enter the code first"** while its detail says "Agree to sign electronically first." (`door.ts:168`). **Fix:** use a title that matches each case.
6. **Door audit lines carry `before: null`, and `signing.viewed` does not record the status move** (`door.ts:88, 182`). The webhook records before and after (`service.ts:213`). **Fix:** pass `{status}` before and after.
7. **`rollback.sql` does not delete its `_prisma_migrations` row.** Its neighbours do (e.g. `20261124050000_pf10a_import_tables/rollback.sql`). **Fix:** add the DELETE.

### Notes (not findings)
* A verify that succeeds, and a code-off first consent, each write two lines (the code or consent, then the session). Each is a separate change, so this is read as consistent with rule 13.
* Part 1's INSERT branch does not refuse a signer created with a session already set. Send never sets one.
* The door also opens CONSULTATION signers' tokens (`WHAT` at `door.ts:36`), next to FO-3c's own door. This is intended for the QA-777 follow-up (plan-4b), and it is stricter than FO-3c's door.
* The locked-firm refusal (`firmAllows`) is part 5, per the note, and is not on main.

## Journey (reviewer role; API only, because the page is FO-5s)
Walked as the client on :4437 by API:
* open the link → 200, firm named, `codeRequired: true`, no name or email;
* ask for the code → the code email arrives in about 2 s;
* verify → cookie; consent → 200; `/session` → the adapter's link;
* forward the link to a fresh browser → 401; a second browser verifies → the first is cut off;
* six wrong codes → 423, "Try again in 15 minutes."

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | Reaches the adapter's link; signing itself is 4c and the page is FO-5s (by plan) |
| Next step obvious | ½ | `codeRequired` and the problem details say what to do; no page yet |
| Plain words | ½ | Clear refusals; the "signed" wording misses j_61 (Major 1); the code-off title (Minor 5) |
| Feedback and state | 1 | Ended states in words; 423 and 429 explained |
| Correct data | 1 | Consent once, viewed once, VIEWED on request and retainer, sha only |
| Error recovery | 1 | Wrong code, lock, expired session and forwarded link each recover by asking for a code again |
| Accessibility and screen sizes | ½ | No screen of its own (FO-5s) |
| Speed | 1 | Door answers well under 1 s; the code email arrives in about 2 s (outbox) |
| Visual quality | ½ | Nothing visual in 4b |
| Trust and sources | 1 | Firm named, Reply-To the firm, Sample and "Unconfirmed: no counsel" marked |

**Journey score: 7.5/10, no 0.** The half points are mostly the planned page and 4c. Fixing Major 1 and Minor 5 raises plain words. The journey is recorded here, not in its own report file, as the caller asked for one file only.

## Could not check
The vendor's frame and the real cookie behaviour in a browser behind the FO-5s page (no page yet). Trust-proxy behaviour behind a real load balancer. CI on the ready PR.

`Reviewer: Changes 2ba80d7c4d5f771fc22bf234cb9a832c6d33da69`

Verdict: Changes. Fix Major 1 and Major 2. The Minors can be fixed in this PR or recorded on it. The label `review: approved` does not apply to this commit.

## Round 2 (diff only, P-277): `2ba80d7c4..c234bda62cb2a7ba2fdf4f4441eb813a14cae784`
Scope: `door.ts`, `door.controller.ts`, `door-code.ts`, `link-mail.ts`, `rollback.sql`, `check_fo6_door.ts` (+11 lines), `check_fo6_door_code.ts`, and the note's "Part 4b round 1 fixes".

### The fail-without-fix check
I ran round 2's `check_fo6_door.ts` against round 1's code, a 2ba80d7c4 worktree on :4438: **31/36, 5 FAIL**. The five are:
* SIGNED_OFFLINE wording;
* no-code verifies locking the link (`[422×5, 423, 423]`);
* the non-JSON POST (200);
* code switched back on (200);
* misses blocking a live link.

The same file against c234bda62 on :4438: **36/36** (6 pending).

The six M2 coverage lines (headers, CONSENT_NEEDED, GET writes nothing, viewed and VIEWED, replacement with the code on, server expiry) pass on both commits. That is expected: they pin behaviour that was already correct, and I verified each by hand in round 1. The new SIGNED_OFFLINE line's regex fails on the old words, so the loop now guards rule 4's wording itself. Both copies are stopped and the worktree is removed.

### Each finding
* **M1:** fixed. `door.ts:71` "This agreement has been signed." matches j_61's `REFUSED` ("has been signed").
* **M2:** fixed; the lines are listed above.
* **m1:** fixed. The key is `signing:<request>:code:<signer>:<expiry ms>`, with nothing of the code (`link-mail.ts:52`).
* **m2:** fixed. `currentVersion` is in the retainer's where (`door.ts:194`).
* **m3:** fixed. `locked()` re-reads the request and the signer under the lock and refuses in words. It is called in code, verify, consent and view.
* **m4:** fixed differently, and better. The address ceiling now counts only misses, so a live link is never refused because of other callers.
* **m5, m6, m7:** fixed.
* **Breaker m1/m2/m4:** read and correct.
  * A session counts with the code on only if a right code started it.
  * A check with no live code is EXPIRED, writes nothing and is not counted. This changes 4a's `door-code.ts` semantics, and the 4a C line was changed to match. FO-3c does not use `door-code.ts` yet. The note records it for the tech lead.
  * 415 comes after the token shape. The journeys `j_54` and `j_61` send `application/json`.

### New, Minor (does not block)
1. **The code-on session test depends on two clock reads.** `liveSession` (`door.ts:86-90`) treats a session as code-started when `codeVerifiedAt` is within 1 s of `sessionExpiresAt − 30 min`. Those come from two separate `this.now()` calls: in `checkCode` (`door.ts:146`) and in `startSession` (`door.ts:106`), with a read, an update and an audit insert between them. A database stall over 1 s inside that transaction would answer a right code with a cookie whose session then reads 401.
   * **Fix:** take `now` once in `verify` and pass it to both `checkCode` and `startSession`, so the two times are equal by construction.
   * **Better fix:** say in a comment that the pairing is an invariant `door-code.ts` must keep when FO-3c moves onto it (QA-777).

`Reviewer: Approve c234bda62cb2a7ba2fdf4f4441eb813a14cae784`

Verdict: Approve. No open Blocker or Major. The new Minor can go in this PR or the QA-777 follow-up.
