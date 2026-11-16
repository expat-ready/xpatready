# PF-5t part 1: break report (PR #1957, head 3fa6b36fd)

Breaker, 16 Nov. API and guard only; part 2's screens are not built, so no screen, keyboard or zoom attempts, and
upload, rule, scale and long-text attempts do not apply (`versionIds` are uuids). Run on an isolated app (:4591, stopped)
and scratch tsx harnesses on 127.0.0.1:54329 (databases dropped). Nothing edited or committed.

## Findings

### M1 (Major): on a database kept from before 15 Nov, every seeded person is locked out (428), and the seed does not fix it
* **Did:** migrated a scratch DB up to just before `20261115180000_pf5_signup_terms`, ran the Sample seed, dated the firms
  and staff 14 Nov 02:00 UTC (when PF-3/PF-4's seed first ran), then applied the remaining migrations and ran the seed
  again, the way `start.sh` does on a kept database ("data kept, no reset", `demo-update.yml`).
* **Expected (brief's touch list; PR body):** "the demo seed's acceptance lines (so the seeded firms have none pending)".
* **Actual:** the second seed run added 0 staff and **0 acceptances**. `PlatformTerms.pending`: user-R and user-S
  (Owners) have DATA_PROCESSING, PRIVACY_NOTICE and TERMS_OF_SERVICE pending; user-T and user-O have PRIVACY_NOTICE
  pending. Every guarded platform and front-office route answers 428 for all of them, and part 2's accept screen does
  not exist yet, so the web can't clear it.
* **Why:** the seed writes acceptance lines only for the people it adds now (`seed-sample-firms.ts:79-81`, after
  `staffAdded++`). The Sample versions are dated `2026-11-15T00:00Z` (PF-5 migration), so the rule "published after the
  person/firm joined" (`terms/service.ts:58-59`) catches everyone created before that, including invited staff on a kept
  database. DW5 tests only a fresh database, where staff are always newer than the Sample versions.
* **Condition:** this applies wherever platform staff exist from before 15 Nov 00:00 UTC (the Mac's :4400 if its Sample
  seed is on, and any copy kept since PF-3/PF-4). `start.sh` itself does not set `PLATFORM_SAMPLE_SEED`, so whether the
  live demo holds such staff could not be checked from here.

### M2 (Major): a version published between sign-up and the email verification is never asked, by anyone
* **Did:** scratch harness, using `FirmSignUp` as `check_pf5t_terms.ts` DW4 does: `plans()` → `signUp` accepting the
  current three → insert a new TERMS_OF_SERVICE version (`published_at now()`) → `verify` (the link lives 24 h).
* **Expected:** row 100 / A46: "Sign-up cannot finish without accepting the current versions … a new version asks again
  at the next sign-in". So the new Owner is asked for the new terms of service.
* **Actual:** the Owner's acceptances are ToS/PN/DPA `sample-2026-11-15`. Current ToS is `brk-between`, and
  `pending = []`. The firm and the Owner are created at verify (`signup.ts:178-183`), after the version's `published_at`,
  so `c.published_at > f.created_at` (`service.ts:59`) is false. The firm has never accepted the current terms of
  service, and nothing will ever ask until another version is published.
* PR Question 1 covers invited staff ("never accepts the version already current when they join"). It does not cover
  this sign-up case, where the Owner accepted an older version and the gate counts that as done.

### m1 (Minor): the acceptances list has no pagination
`GET /api/platform/terms/acceptances` (`service.ts:97-99`) returns every row the firm has ever written: one row per staff
member per privacy-notice version, plus the firm terms, and the table is insert-only. STANDARDS §6 [M] asks for cursor
pagination. Small today with Sample data; it only ever grows.

### m2 (Minor, forward risk, not on main yet): the terms read under PF-12's row-level security
The guard's read joins `platform_staff` and `platform_terms_acceptance`. If PF-12 (#1910) makes those tables firm-scoped by
RLS and this read runs without the firm set, the join returns no rows, `mustAccept` is false, and the gate **fails
open** with no error. PR Question 2 names the merge order but not this failure mode. Whichever PR merges second should add
a test where a pending person still gets 428 under RLS.

## What held (with the attempt)
* **Every route while pending** (privacy notice published, Owner user-R): a swept list of 68 declared routes from the
  source. All 61 guarded `/api/platform/*`, `/api/front-office/*` and `/api/runtime/cases/:id/*` routes, including
  complaints, bookings, leads, retainers, staff admin, `PUT /me/account` and `terms/acceptances`, gave 428
  `TERMS_PENDING` with the words. Open, as specified: `GET /me` (200), `GET /me/terms` (200), `POST /me/terms/accept`,
  `POST /session/sign-out` (200, then the session is 401). The sign-in doors (`session/local`, `session/callback`), the
  `/api/public/*` doors (plans, sign-up, verify, invitations, public forms) and the `/api/link/*` client doors gave
  identical statuses with and without pending terms. With any bearer token the public doors give 403 `link-only`, but
  that also happens with a non-pending token, so it is not this PR. No webhook routes exist in the code yet (only
  settings).
* **Path and method tricks while pending:** upper or mixed case (API/platform/FRONT-OFFICE: SPA HTML or 403, no
  data), trailing slash, `//`, `%61ccount`, `me%2Faccount`, `terms/../account`, `%2e%2e`, `;x`, `?/api/platform/me`,
  `#x`, `X-HTTP-Method-Override`, PROPFIND and TRACE. None reached a closed route: each was 428, 404 or refused.
  HEAD on a closed GET route gives 428, and on `/me` it gives 200 (same handler). OPTIONS gives 404. The guard matches
  the handler's **declared** method and path (`guard.ts:116`), so the request path cannot widen the open list.
* **Who accepts:** a Case Officer accepting `[privacy, ToS]` together gets 403 OWNER_ONLY with 0 rows written (not even
  the privacy notice). An Owner demoted mid-session is on the next request a non-Owner: not blocked by firm terms, and
  403 on accepting them. The remaining Owner stays blocked until any Owner accepts, and one Owner's acceptance clears
  the other. A deactivated Owner gets 401 on `/me/terms` and on accept. Signing user-R into another firm gets 401.
* **Other firms:** versions are a catalogue (no firm), and acceptance rows always take the caller's firm. Firm A's
  acceptance never cleared firm B (`sample-firm` 1 row, `sample-solo` 1 row). Firm B's list shows none of firm A's staff.
* **Two Owners at once / replays:** 30 parallel accepts of `[ToS, PN]` from two Owners, over four sessions, gave
  14 × 200 and 16 × 401 (sessions superseded by sign-in). That left 1 ToS row, 1 privacy row per person, 1 audit line,
  and one identical `accepted` body for all. The firm row lock (`service.ts:77`) plus the unique index holds.
* **Malformed bodies:** invalid JSON, `null`, text/plain, an array body, `versionIds: null`, numbers, 11 ids, an extra
  key, a 2 MB string and a uuid with `'--` all gave 400 (Problem Details), nothing written. `__proto__` gave 400
  TERMS_NOT_CURRENT. An old version gives 400 TERMS_NOT_CURRENT.
* **Future `published_at`** (+1 day): blocks nobody; accepting it gives 400. **Cost:** the guard's read takes 0.27 ms
  (EXPLAIN ANALYZE); `GET /me/account` 7.5–8.3 ms against 6.7 ms for the open `GET /me` (200 requests each).

Not findings: the invited-staff gap (PR Question 1, raised already). Not tested: the accept path trusts the roles the
guard read rather than re-reading them inside its transaction (`ROLES_CHANGED` elsewhere), so a demotion landing in the
same milliseconds is not caught; the race was not run.

## Re-check at 67b384e (code identical at 72f8ce0; same harnesses, isolated :4591 started and stopped)
* **M1 fixed.** Kept-database repro: the second seed run now writes 8 acceptances, and none of user-R, T, O, S is pending.
* **M2 fixed.** Sign-up straddle repro: the Owner who accepted ToS `sample-2026-11-15` now has ToS `brk-between` pending.
* **m1 fixed.** Cursor paging tested at limits 1, 2, 3 and 4 through the API, then 1, 5 and 7 on 41 rows with tied
  `accepted_at`, with a row added between pages. Every pass returned each row once, in the one-page order.
  - Refused with 400 CHECK_FIELDS: another firm's acceptance id as cursor (both ways), an unknown uuid, a non-uuid, an
    SQL-ish cursor, two cursors, `limit` 0, -1, 201, 1.5, abc, empty, space or twice (`1e2`, `0x10` pass via `Number()`).
* **Re-sweep:** all 61 guarded routes still answer 428 while pending. `/me`, `/me/terms` and accept stay open, and the
  unguarded doors are unchanged. Under the new rule a new ToS blocks the Owner only, never the Case Officer or Case
  Manager, and a Case Officer accepting it still gets 403.
* **m3 (Minor, new):** two versions of one kind with the same `published_at` (allowed: the only unique key is kind +
  version). Sign-up's `currentTerms` (`signup.ts:82`, ordered by `published_at` only) picked `brk-a`, while the gate
  (`service.ts`, `published_at desc, version desc`) treats `brk-z` as current. Under the new "older version accepted"
  rule, a firm that has just signed up is asked again at once for the privacy notice (`pending: ["PRIVACY_NOTICE
  brk-z"]`). The fix would be to use one ordering for "current" in both places, or a unique key on kind + `published_at`.
* Still open: m2 (PF-12 row-level security could make the gate fail open) and the untested role race. **No Blocker or
  Major at 67b384e.**
