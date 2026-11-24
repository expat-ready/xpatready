# PF-17 part 4: fresh challenge of concept r1 (24 Nov)

Challenger: a fresh context that did not draft the concept (skill screen-concept §B). Read: `concept.md`, `design/console-r1.html`, `handover.md`, PRODUCT, STANDARDS, EXPERIENCE, QUALITY, the PF-17 row, the trace brief, SA-10 §3.1-§3.6, the PF-17-3 review, and the app code listed in the brief. `ai-workers/tools/freshness.sh` fails in this copy because `code/README-copies.md` is missing (no `code/` capture here). So **the team's code is Unverified**, including the concept's line "names kept: Firms, Support, Waiting on firm". The requirement snapshot used is `domain/requirements-2026-11-02`.
Shorthand: App = `prototype/studio`, P = `product`.

## Verdict
**Build after these changes.** No Blocker. Fix two Majors before building: the demo cannot sign anyone in to the console, and "the two pages never disagree" is promised but not built into the code. The Minors can be fixed during the build.

## Objections

### Major
**M1. On the demo, nobody can sign in to the console, and the concept does not say so.** *Needed for the proof.*
* Facts (high confidence):
  * `App/start.sh:17-18` sets `PLATFORM_IDENTITY=local` and `PLATFORM_ENVIRONMENT=local`. It never sets `PLATFORM_SYSTEM_IDENTITY`. With that variable unset, every token is refused (`SIGN_IN_NOT_SET_UP`, `system-identity/service.ts:44`), and the stand-in sign-in answers `STAND_IN_OFF` (`service.ts:95`).
  * No Sample staff of ours exists. The only way to create one is `invite`, which needs an existing Platform Owner (`staff.ts:94-99`). The tests and j_93 insert one in SQL instead (`j_93.ts:23`, "Stand-ins").
* What breaks: the demo "updates itself" on merge. The founder's next-morning look (P-223 (4)) then lands on "Sign-in for ExpatReady staff is not set up on this page yet", so R1.93 cannot be shown on the capability's own path (§6b).
* The concept's §4a is also wrong on one point. `STAND_IN_OFF` is not only for "Cognito servers": it is also what an unset server answers, and that includes today's demo.
* Fix (needs the Lead's ruling, no migration):
  * Add `export PLATFORM_SYSTEM_IDENTITY="${PLATFORM_SYSTEM_IDENTITY:-local}"` to `start.sh`, as line 17 already does for firm staff (P-711, Lead 84). The loader still refuses it outside local (`config/settings.ts:158`).
  * Seed one Sample Platform Owner and one Sample Support member under `PLATFORM_SAMPLE_SEED`, local only, labelled Sample.
  * Correct the §4a sentence.

**M2. BR-5 ("the two pages never disagree") is only a promise: nothing in the code makes the two pages read the same thing, and the board already disagrees.** *Needed for the proof.*
* Facts (high confidence):
  * Today the Firms page works out the plan by calling `limitOf` once for each of four metrics and keeping the last non-null plan (`firms.ts:203`).
  * Part 4 would add a second reader in `support.ts`, with its own code.
  * The board shows Maple as "Team · Payment hold" on Firms (`console-r1.html:48`) and "No live plan" on Support (`:63`).
  * The code says Maple has a plan. A `PAYMENT_HOLD` subscription is live, because `platform_entitlement_limit` reads `s.status <> 'ENDED'` (`prisma/migrations/20261121130000_pf15b_plan_booking/migration.sql:146-158`). So Maple's queue row must say "Team".
* Feasible without a migration (high confidence):
  * The definer function exists already.
  * Inside the queue's bypass, the session has no firm, so the function's wall clause allows every firm (`:152`).
  * The cost is at most 50 calls a page (`QUEUE_PAGE_SIZE`), all in the queue's one transaction (`support.ts:73-80`).
* Fix:
  * Export one helper (e.g. `livePlanOf(tx, firmId, now)` in `entitlements/limits.ts`, built on `limitOf`). `firms.ts:figures` and `support.ts` (list, one ticket, reply) both call it.
  * Add `plan` to `FirmRef` (`support.ts:45`) so the queue row, the ticket and the reply answer all carry it.
  * Extend SQ-plan to three firms: one active (equal code and name on both pages), one on `PAYMENT_HOLD` (plan shown on both, never null), one with only an `ENDED` subscription (null on both, "No live plan").
  * Correct the board.

### Minor
**m1. The dead-letter fix (BR-4) is honest at the cap, but it depends on a number copied in two places. The concept's facts are right.** *Needed for the proof.*
* Facts (high confidence):
  * In pg-boss 12.38.0 (`App/node_modules/pg-boss`), `findJobs` runs `ORDER BY created_on, id LIMIT n` (`dist/plans.js:4625`). Its maximum is 100 000, not 10 000 (`dist/attorney.js:576`), and it can page with `after` (`dist/manager.js:2704-2710`).
  * PF-14 hard-codes `limit: 10_000` and only then sorts newest first and cuts to the caller's limit (`pgboss-jobs.ts:226-227`). An entry's `failedAt` is the dead-letter job's `createdOn` (`:351`).
  * So "the oldest 10 000" is correct. The doc line "newest first" (`:223`) is true only inside those 10 000.
  * A read that returns exactly 10 000 entries means "possibly more" (10 000 → false, 9 999 → true is right).
* What breaks:
  * `DEAD_LETTER_READ` (`firms.ts:68`) copies PF-14's literal. If PF-14 changes its number, the flag silently stops meaning anything, and DW11's fake reader cannot notice.
  * The flag belongs to the read as a whole, yet it would be repeated on every firm.
  * Past the cap, the failures left out are the newest ones, which matter most, and the flag can stay false for up to a year (retention 365 days, `:123`).
* Fix:
  * PF-14 exports the cap and `firms.ts` imports it (DW10 then asserts `limit === ` that constant).
  * Put `failedJobsComplete` on `FirmsPage` and on `FirmHealth` for `/:id` only.
  * Show "0+" rather than "0" when capped.
  * Record "past the cap, the newest failures are left out" as a known limit in the MODULE row.
  * Paging with `after` or a per-firm `data` filter would remove the limit, but that is PF-14's work and outside this part. *Not built.*

**m2. The session wall is tested in one direction only.** *Needed for the proof.*
* B7 proves that a firm token in `xr-staff-session` does not sign anyone in to the console.
* Nothing proves the reverse: our token alone in `xr-system-session` must leave the firm pages on their sign-in card (`platform/session.ts:10, 19-23` reads only its own key).
* Fix: add that check to B7.

**m3. The concept does not say how it uses the app's `Frame`.** *Needed for the proof.*
* `Frame` takes `area: "studio"|"cases"|"client"|"outside"` (`components/where.ts:5`) and an optional `workspace`.
* PF-31's workspace tabs belong to the firm session's `staffScope()` (`platform/session.ts:48`).
* Fix: state `area="outside"`, `workspace` off, and none of the firm frame's parts (HelpButton, TrialBanner, NotificationBell, `signOutHere`).
* Sign-out drops only `["sys", …]`, never the firm's `["fo"]` or `["pf"]` answers (`session.ts:27, 36`).

**m4. SA-7 session rules for our staff are left out without being named.** *Not built.*
* SA-7 sets auto-logout (60 min idle / 12 h maximum, with warnings) and one session at a time for ExpatReady staff (SA7-D33, D34, D66).
* Fix: list them in §6b as Not built, with a follow-up row, so the 1-hour stand-in timer is not mistaken for them.

**m5. Parts of SA-10 §3.2 and §3.4 are missing without being listed.** *Not built.*
* Missing and not named: the ticket's firm country, primary contact and recent tickets (§3.4 left zone), "Open support session" (§3.8), and the assignee and priority columns.
* Fix: add one line to §6b. Do not build them.

**m6. The Support page's firm filter (`?firm=`) can only be typed into the address bar.** *Not built.*
* Nothing on the page links to it, and the page would show a filtered list without saying so.
* Fix: drop it from part 4, or show a "Firm: X · Show all" chip whenever it is set.

**m7. "Waiting since" is the wrong label for some rows.** *Needed for the proof.*
* The value is `updated_at` (BR-6). On a Waiting-on-firm row or a Closed row it is not how long the firm has waited for us.
* Fix: label it "Last activity" (SA-10 §3.1's word). Write "Messages", not "Msgs" (board `:60`).

**m8. The concept's PR split has tests in the wrong PRs.**
* B4, B5 and B6 need the Support page, so they belong to PR C.
* PR B (session, frame, sign-in card, Firms page, contract, B1-B3, B7, B8 and the browser test's setup) is the one at risk of passing 800 lines (judgment, medium confidence).
* Fix: if PR B's measured size is over 700, split it into B1 (session, frame, sign-in card; B1, B7, B8) and B2 (Firms page; B2, B3).

**m9. j_93's W2 check matches the plan state loosely.**
* `j_93.ts:139` tests the row against the regular expression `/<stored status>/i`. "Payment hold" does not match `PAYMENT_HOLD`.
* It passes today only because both Sample firms are `ACTIVE`.
* Fix: in PR B's notes, record which stored status maps to which word, for qa.

## What is sound
* **The session key and shape (high confidence).** `{token, expiresAt}` under `xr-system-session` matches exactly what j_93 writes (`j_93.ts:131`).
* **The two planes are kept apart (high confidence).**
  * The server already refuses crossed tokens. A firm token on `/api/system/*` gets 403 `FIRM_SESSION_REFUSED` (`service.ts:66-73`).
  * Our tokens are signed with their own key and carry `plane:"system"`, and a token that names any firm is refused (`local.ts:48-52, 87-89`).
  * Two storage keys, two fetch helpers and two query prefixes keep the wall in the browser as well.
  * `expiresAt` is worked out from the sign-in answer's `expiresIn` (`service.ts:112`), as the firm side does.
* **Routes.** `/system/*` clashes with no route in `APP_ROUTES` and fits the module seam (`modules/README.md`).
* **Health is left alone.** It stays part 1's, and failed jobs are shown but not judged (BR-3, tested by DW12).
* **The fixes for the earlier review's m2 and m3 are correct as drafted** (DW10 and DW12).
* **No migration is needed** for any element, including the plan on each queue row (see M2).
* **Scope.** The concept builds no firm panel (an AUD-3 line with no R1.93 need), no Cognito pages, no notes, no assignment. Nothing is gold-plated: search, health chips and paging use parameters the API already has.
* **The W2 and W4 screen lines are reachable.** The row text, subject and firm name the concept places satisfy `j_93.ts:136-139, 186-187`.

## Back-end plan (element → record → API → rule → test)
| Element | Record | API | Rule | Test |
|---|---|---|---|---|
| Sign-in card | `plat_system_staff` (Sample seed, M1) | `POST /api/system/session/local`, `GET /api/system/me` | BR-2, the wall | B1, B7 (both ways, m2), B8 |
| Firms table | `platform_firm`, subscription, staff, storage-over; PF-14's dead-letter list | `GET /api/system/firms` (+ `failedJobsComplete` on the page, m1) | BR-3, BR-4 | DW10-DW12, B2, B3, j_93 W2 |
| Plan on a queue row and on a ticket | `platform_subscription`, `platform_plan` through `platform_entitlement_limit` | `GET /api/system/support/tickets`, `/:id`, `POST /:id/replies` (`firm.plan`) | BR-5 through one helper (M2) | SQ-plan (active, held, ended), B4, j_93 W4 |
| Reply | `platform_support_message` (PF-18b) | `POST /:id/replies` | BR-7 | B5 pass and fail |
| No key | Appendix A keys | 403 from each route | BR-1 | B6 (in PR C) |

## Questions for the founder (≤3, recommendation first)
1. **Can you see our console on your own demo?** Recommend yes: turn on our staff's local sign-in stand-in in `start.sh` (local machine only) and seed a Sample Platform Owner and a Sample Support member. Otherwise you can only see the console on a test copy the Lead starts for you.
2. **When the failed-jobs list was cut off, what should a firm's figure show?** Recommend "N+" (a lower bound) with one note on the page. Otherwise show "Not known" for every firm until PF-14 can read the whole list.

## Lead response

## Agreement

## Build discoveries
