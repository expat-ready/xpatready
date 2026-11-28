# FO-5d (1) break report: PR #3670 at d2c603bd38cfec50738400003470d3720aef7ec3 (decline door + `fo_signer.decline_reason`)

**Verdict: Approve (d2c603bd38cfec50738400003470d3720aef7ec3).** No Blocker and no Major. 9 Minors below. Breaker's own run, 25 Nov 2026.

**Head moved.** I ran the attacks on 255be82c9. The new head d2c603bd3 is a rename-only commit, checked with `git diff 255be82c9 d2c603bd3 -M`: the migration folder is now `20261125150000_front-office-signing__fo5d_decline_reason` and five lines name the new folder (MODULE row, a `decline.ts` comment, `rollback.sql`, the check). `migration.sql` is unchanged, and the `decline.ts` line numbers cited below still match. So every finding still applies. My copy's database recorded the old migration name. I made no source edits in `/home/user/xr-decline`: I did not make the temporary `signing/decline.ts` edit, all probes were in the scratchpad, and `git status` shows only this report.

**Setup.** Worktree `/home/user/xr-decline` only. The copy `isolated.sh brk5d 4436 start --ttl 60 PLATFORM_IDENTITY=local` ran until about 05:52Z. Then another agent's copy (`fo5drev`, DB `xr_studio_fo5drev`) started on :4436 and stopped my server (isolated.sh stops whatever listens on its port). Before I noticed, one of my calls landed on their copy: a Sample lead and prospect named "Tok…" are in `xr_studio_fo5drev`. I moved to **:4446** (`isolated.sh brk5d 4446 start`, later `stop`; the database and files are dropped) and never stopped :4436. Setup: owner sign-in as `user-R` (j_55's local session), then lead → engage → conflict check (SQL row) → draft → Send over HTTP. The link token came from `GET /api/demo/platform-inbox`. Signing used code → verify → consent → session → the stand-in page's POST. The provider webhook can only be signed in process (the fake's HMAC key is random), so webhook cases ran in process against the same DB with the PR's own wiring (as `check_fo5d_decline_withdraw.ts` does). The PR's `check_fo5d_decline_withdraw.ts` passes again here: 26 passed, 0 failed. Scripts: `/tmp/claude-0/-home-user-xpatready/c63d321f-c73b-52ca-b1af-5b093d8c56de/scratchpad/brk/t1.ts`-`t9.ts`.

## Minor

**m1. A decline on a withdrawn or edited (old) link says "the firm has been told", but nobody is told, and the request ends as DECLINED.**
- Steps: Send. Then `POST retainers/:id/withdraw {expectedVersion:1, expectedStatus:"SENT", reason}` → 200. Then `GET /api/public/sign/<token>` → `WAITING`. Then `POST …/decline {"reason":"after withdraw"}`.
- Observed: 200 "You declined this agreement. Sample immigration firm has been told.", `agreement:null`. The retainer is WITHDRAWN, the request DECLINED, and there are 0 notifications. Edit-then-decline-old-link is the same: 200, retainer DRAFT v2, old request DECLINED, 0 items. The provider's `declined` event after a Withdraw or Edit is the same too.
- Expected: once FO-5d (2)/(3) land, 409 "withdrawn" or "updated". Until then, the answer should not claim the firm was told when `agreement` is null (`signing/door.ts:129`).
- This depends on #3648 and on merge order. Watch for #3648: decline locks the request, then `fo_retainer` (`decline.ts:162`). Withdraw and Edit must take the request lock first too, or a deadlock pair appears.

**m2. The 500 limit counts UTF-16 units; the database counts characters.**
- Steps: `{"reason":"😀"×300}` → 422 "This is too long: at most 500 characters". `"q"×499+"😀"` (500 characters) → 422.
- Observed: the schema is `z.string().trim().max(500)` (`platform/http/input.ts:25`, used at `door.controller.ts:54`), which measures UTF-16 length. The DB check uses `char_length`, which accepts `repeat(😀,500)`. The fallback `.slice(0, 500)` at `decline.ts:152` can also split a surrogate pair.
- Expected: one measure, in characters (code points), in the schema, the slice and the DB.

**m3. A NUL in the reason gets the wrong answer.**
- Steps: `{"reason":"a\u0000b"}`.
- Observed: 404 "Not found (it may have been removed by a reset)." Postgres "invalid byte sequence" is mapped at `main.ts:224`. Nothing is written and the vendor is not called.
- Expected: 422 on `reason`. This mapping is platform-wide, but the public door is where a client meets it.

**m4. The database check's "trimmed" only means spaces.**
- Steps: as `xr_app` with `app.firm_id` set, `UPDATE fo_signer SET declined_at=now(), decline_reason=E'\n'` on a live signer. `E'\tabc'` and NBSP-wrapped text behave the same.
- Observed: ALLOWED. `btrim()` strips only U+0020 (`migration.sql:12-13`), but the app trims all whitespace with JS `trim()`. So the DB accepts a blank reason the app never writes.
- Expected: the DB rule equals the app rule, e.g. a `regexp` on `[[:space:]]`, or the check documented as weaker.

**m5. A reason with only zero-width characters is kept as a reason.**
- Steps: `{"reason":"​​"}`.
- Observed: 200, `decline_reason` is 2 invisible characters, `withReason:true`. A bidi override (`‮gnp.exe`) and control or ANSI escapes (`\u0007\u001b[31m`) are also kept as they are.
- Expected: invisible-only text counts as empty, and control characters are refused or stripped. The staff state shows the raw string.

**m6. A decline by the firm's representative is reported as the client's.**
- Steps (in process): Send, then the provider's `declined` event for the **FIRM** signer while the client has not signed.
- Observed: the retainer is DECLINED and the audit line correctly says "Retainer declined by the representative". But the owner gets kind `retainer-declined`, which reads "A client declined a retainer" (`web/…/notifications/contract.ts:35`). The client's link then reads "This agreement was declined. Reply to … if that was a mistake."
- Expected: either no client-decline item for a firm-side decline, or words that say who declined.

**m7. The notification words differ from the row, and the deviation is not stated.**
- The row gives "Client B declined the retainer. Edit and resend, or withdraw it." The API answers kind "A client declined a retainer" plus label "Retainer for <name>".
- "Withdraw it" is impossible anyway: a DECLINED retainer cannot be withdrawn (`retainers/service.ts:42`).
- This is not in the PR's "Deviations" list.

**m8. The provider's `declined` event is applied past expiry, where the door refuses.**
- Steps: set `expires_at` in the past (test-only SQL with triggers off). Door decline → 409 `LINK_EXPIRED`. The provider's `declined` event → `applied:true`, retainer DECLINED, one item.
- A signature in the same state is refused ("the request has expired", `service.ts`).
- Expected: one rule for both paths, or the difference stated.

**m9. If the vendor cancel fails after a decline, the envelope stays live with only a log line.**
- Steps (in process): make the fake's `cancel` throw, then decline.
- Observed: 200, DECLINED, `console.error("cancel after a decline did not finish")`. Nothing retries it (`door.ts:126-128`).
- Signatures made later at the vendor are refused here, so our state is safe. But the vendor and we disagree until someone acts.

**Noted, not counted:** decline needs only the link, even with the email code on (PR question 3). Anyone holding a forwarded link can decline and fire the owner's item. A resend repairs it. This is the Lead's call.

## What held
- **Races:**
  - 6 declines at once on one token: 200 ×1 and 409 ×5. One reason (the first), 2 audit lines, 1 item.
  - Decline vs the stand-in page's Sign, at offsets 0/5/10/20/40/80 ms and ×3 at once: always exactly one wins. Either signed=1, declined=0, no item, decline 409 `LINK_SIGNED`; or declined=1, signed=0, Sign 409 or 404.
  - Decline vs Withdraw ×3: decline 200 and Withdraw 409 CHANGED.
  - Decline vs Edit ×3: decline 200 and Edit 409 CHANGED.
  - Provider `declined` vs door decline ×4: one applied, one item, one `retainer.declined` line.
- **After a decline:** the stand-in Sign with a link taken earlier → 404. `session`, `consent` and `code` → 409 `LINK_DECLINED`. GET state → DECLINED (firm name only). A second decline → 409. The same provider event twice → `duplicate`. A stale provider event after the door decline → refused.
- **Signed first:** a decline after the client signed → 409 `LINK_SIGNED`, state unchanged, no item.
- **Reasons:**
  - 501 characters, 501 after trimming, number, null, array, object, extra field, `__proto__`, array body, bad JSON → 422 or 400, nothing written.
  - Exactly 500 characters, CJK/RTL/accents, HTML or script text, a lone surrogate (stored as U+FFFD) → kept word for word.
  - Whitespace-only, `""` and `{}` → reason null.
  - A 5 MB body → 413. A 90 KB body → 422.
- **Content types:** text/plain, form, multipart, `application/jsonx` and none → 415. `APPLICATION/JSON` is accepted.
- **Tokens:** upper-case hex, short or flipped secret, no dot, a trailing `/`, unknown firm, another firm's prefix, SQL-ish, 5000 characters, and the **firm signer's own token** → the one 404 "This link does not work.", state unchanged.
- **Rate limit:** 30 calls per address and token per minute, then 429, invalid bodies included. `X-Forwarded-For` does not reset it.
- **Recipient:** prospect owner `user-T` or `user-O` → exactly that person gets one `retainer-declined` item labelled "Retainer for <name>" with the link, and they can open it (200). R gets none. With no owner, the representative (R) gets it.
- **No leaks:** the reason appears in no `audit_event`, `module_event`, `msg_notification` or api.log line. The decline audit lines hold no email or name, only ids and `withReason`.
- **Database, as `xr_app` under RLS:**
  - Refused: a reason without `declined_at`, a leading space, 501 characters, `""`, and changing, clearing or undoing a kept reason or `declined_at`.
  - Also refused: request DECLINED→SENT, retainer DECLINED→SENT, and deleting a signer.
  - Another firm's rows: 0 updated.
- **Edit and resend after a decline:** Edit (`expectedStatus: "DECLINED"`) → DRAFT v2, then Send → a new token. The old link gives 409 DECLINED. The new link gives WAITING. Declining v2 → DECLINED, both requests DECLINED, one item. `GET retainers/:id/signing` shows `declineReason` to staff.
- **Out of scope:** the screen checks (keyboard, 1024 px, 200 %, back and reload) do not apply; this PR is API only and the page is FO-5s S7.
