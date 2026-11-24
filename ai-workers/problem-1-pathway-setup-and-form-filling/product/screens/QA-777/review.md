# QA-777 review: FO-3c's consultation-agreement door bound to one browser

PR #3498, head 75747bc2f85c51bb642b45960ee7b72b4ece79ca, stacked on #3460 (fcb8e3ad8). Reviewed: `git diff fcb8e3ad8...75747bc2f`
(controller.ts, service.ts, check_fo3c, MODULE.rows/QA-777.md). Reviewer agent, 24 Nov. Paths below: `studio/api/src/front-office/booking/consultation-agreement/` unless named.
Scope (P-26, Lead 28): the code before consent, the browser-bound session on 4b's columns, no migration, `signing/door.ts` and
`door.controller.ts` untouched (confirmed: not in the diff). The firm's code switch (P-564) is out. No client page exists for this door
on main (the API is the door), so 1024 px, 200 % zoom, keyboard and the BIC scorecard do not apply.

## Verdict: Rework (one Major: a test, not the code) — Reviewer: Block

## What I ran (all on this head unless said)
* check_fo3c 46/0 · check_fo3c2 55/0 · check_fo6_door_code 24/0 · check_fo6_door 36/36 (copy :4438) · j_104 20/20 (copy :4439) ·
  check_forms_qa53 48/0 (copy :4435; the builder saw 46/2, both older) · qa replay check_qa777 5/5 (copy :4436; copied from origin/main, deleted).
* Red: the new check_fo3c on fcb8e3ad8's service and controller: 42/4 (QA-777 (2), control, (1) and the rewritten M3). The PR says 43/3:
  that is the red commit 5ee753f4e's suite; M3 was rewritten in the fix commit. Honest, but say so in the PR.
* Mutations of `liveSession` (service.ts:403-405), suite re-run each time, restored after: any cookie accepted → QA-777 (1) fails (good);
  **session expiry removed → 46/0**; pairing with code_verified_at removed → 46/0.
* Reviewer journeys over HTTP, Playwright browser contexts with their own cookies, copy :4437: 7/7, see `journey-test-reviewer-2026-11-24.md`.
* Environment note: a first j_104 run gave 16/20. Cause: another session's worktree for #3477 (`scratchpad/wt3477`, 11:44) symlinks this
  checkout's node_modules and regenerated the Prisma client from main's schema (no `session_sha256`). After `prisma generate` here: 20/20.

## Focus points
* **Cookie hash and comparison:** a 32-byte random token (base64url, 43 chars), only its sha256 stored (DB check `fo_signing_sha_ok`, so
  both buffers are always 32 bytes and `timingSafeEqual` cannot throw); `sessionCookies` drops anything but 43-char values. Held.
* **Expiry paired with code_verified_at:** written in one update from one `now` (service.ts:484-485), checked by equality (:405), as 4b.
  A code-off 4b session (consent only) fails the pairing. Held (by reading; untested, see m6).
* **Lock, resend, new code:** a lock does not end a live session (J4: B's six wrong codes → 423 for B, A still gets the link); a resend
  leaves the session; a new right code in another browser replaces it (J6: the laptop is then asked for a code). Same rules as 4b. Held.
* **Consent ordering:** the first transaction records only the view; consent is a second transaction after a right code or a live
  session, re-read under the request lock, one audit line (J1; breaker X4: B's consent racing A's code records nothing). Held.
* **Any path to the link without the session:** the link is answered only after `liveSession` or a right code in the same request,
  which mints the session and its cookie (:432-443). `session` is stripped from the body (controller.ts:101). Held. A copied cookie
  value works (bearer; HttpOnly, path-scoped, SameSite=Strict), as 4b.
* **The 429 change:** an implicit visit within a minute answers "SENT" without sending (:473); an explicit resend still 429s. No email
  is sent inside the minute either way, so R2-2 is not weakened (suite R2-2 and J5 hold). But the answer then says a code was sent
  when none was (m1).
* **Cookie:** `Path=/api/public/consultation-agreements/open; Max-Age=1800; HttpOnly; SameSite=Strict`, `Secure` outside local;
  `Cache-Control: no-store` on every answer including 422/423/429 (J1-J5). Held.
* **4b's door, same name:** paths never overlap, so a browser never sends one door's cookie to the other (J1: 0 cookies for
  `/api/public/sign/<token>`); both write the same columns, so a code checked at one door replaces the other door's session. Acceptable.
* **Audit lines:** opened · code emailed · code right · consent recorded, in that order (J1); no token, code or URL in them. No line says
  a browser session started (4b writes `signing.session_started`): m5.
* **Provider "signed":** still needs consent and code_verified_at (service.ts `apply`). M3's rewrite is honest: the door path now gives
  NO_CONSENT, and NO_CODE is proved by a consent written straight to the table; removing either check fails it.
* **M2 rewrite:** the reload now sends the same browser's cookie; that is the scenario named. Honest.
* **Overlap with #3477** (head bf63a2b2a, same service.ts): `git merge-tree` with this head is clean; its new check_fo3c2 cases (W5
  consent+code, W6 404) stay valid under this change. Who merges second re-runs check_fo3c2 and j_104.

## Issues, ranked
1. **Major (Must) — R2-1's failing case no longer guards the 30-minute session.** check_fo3c:268 sends no cookie 31 minutes later, so it
   passes whatever the expiry does: removing `s.sessionExpiresAt <= now` from service.ts:404 leaves the suite 46/0. Before this PR the same
   case guarded the window (via `codeVerifiedAt`). STANDARDS §7 [M] "a rule's test fails when the rule is removed". The code itself is right
   (J7 and breaker X5: a 31-minute-old cookie is asked for a code). Fix: in R2-1 fail, send `cookieOf(good)` at +31 minutes and expect
   `codeNeeded: true, link: null` (keep the cookieless call as well).
2. Minor (Should) m1 — `codeNeeded: true, codeSentTo: "the email address…"` when nothing was sent: a first plain look before consent
   (J1 "look": no code emailed, `asks` false, :433-435) and an implicit visit within a minute of a spent code (:473; J5). Answer
   `codeSent: false` (or omit `codeSentTo`) in those two cases.
3. Minor (Should) m2 — a link holder can lock the client out with made-up codes, no code email ever sent (breaker B1; by reading :433,
   :481-492, and J4's EXPIRED-counted lock). Older: before this PR `{consent:true, code}` did the same (and wrote the QA-777 (2) consent).
   I do not rate it Major for QA-777; 4b's `door-code.ts checkCode` already refuses a check with no live code (4b breaker m2), so it goes
   with the move onto door-code.ts the bug row names. Record it as a follow-up row if not done here.
4. Minor (Should) m3 — the code-typing request spends the code and stores the session before `providerLink`; if that throws (provider
   down, 409), no cookie is set and the retry is stuck up to a minute (breaker B2). Set the cookie on the 409/5xx path too, or mint the
   session after the link.
5. Minor (Should) m4 — the new consent transaction (:440-447) does not re-check signed/declined/request status under the lock; a decline
   landing between the code check and the consent write gives the trigger's 500 (breaker B3 (b)). Refuse in words as 4b's `locked()`.
6. Minor m5 — no audit line says a session started for a browser (the "code was right" line is the only trace); 4b has one.
7. Minor m6 — the pairing rule (:405) has no failing test (mutation survives). Add a case: a session hash with an unpaired
   code_verified_at is asked for a code.
8. Minor m7 — one cookie name and path for every consultation agreement: a second agreement's code in the same browser replaces the
   first's cookie (breaker B4). Acceptable for now; say so in the card.
9. Minor m8 — a double submit of the right code: one 200 with the cookie, the other 422 CODE_EXPIRED and a counted failure (J9; the
   old early "OK" is gone). No page exists yet; note it for the page.

## D1–D20 (API-only item)
D1 4 the ruling's parts all met · D2 4 consent once, under lock · D3 3 4b's `liveSession` re-written here (door.ts may not change) ·
D4 N/A · D5 3 m3, m8 · D6 4 audit lines in order, m5 · D7 N/A · D8-D10 N/A (no page) · D11 3 m1 · D12-D14 N/A · D15 5 11-64 ms ·
D16 3 issue 1, m6 · D17 simulated only · D18 4 · D19 N/A · D20 simulated only.

## BIC-01–BIC-20
N/A: no case-side screen; the door is an API with no page on main (EXPERIENCE §6 scope).

## Graph (P-86)
`graph.mjs` lists `POST /public/consultation-agreements/open` with no HTTP test on this branch (check_fo3c calls the service in process);
the qa replay on main reaches it over HTTP, so the gap closes when this lands on main.

## Journey score: 8/10 (pass), see `journey-test-reviewer-2026-11-24.md`

## Could not check
A real client page (none on main), a screen reader, an intended user's walk (D17, D20 stay with the founder), the live provider.

**Verdict: Block** — fix issue 1 (R2-1 fail with the same browser's cookie at +31 minutes). m1-m9 are Should/notes, not blocking.

Reviewer: Block 75747bc2f85c51bb642b45960ee7b72b4ece79ca
