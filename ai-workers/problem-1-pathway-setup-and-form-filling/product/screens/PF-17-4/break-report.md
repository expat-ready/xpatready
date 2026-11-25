# PF-17 part 4, PR A (#3470): break report (24 Nov)

Breaker: a fresh context that did not build it. Commit 34f58ea0b on `claude/festive-hawking-3i8mgi`; diff `git diff origin/main...HEAD -- App/`. Read: concept r2, challenge, the diff, `settings.ts`, `system-identity/service.ts`, `sample-seed.ts`, `demo.ts`, `start.sh`, `tools/isolated.sh`, `tools/restart-api.sh`, `.github/workflows/demo-update.yml`, `deploy/` (compose, container entry, cdk test), PF-15's `platform_entitlement_limit` (migration `20261121130000_pf15b_plan_booking`).
Shorthand: App = `prototype/studio`. Ran: an isolated copy `brk` on :4495 (`PLATFORM_IDENTITY=local PLATFORM_SYSTEM_IDENTITY=local`), a scratch database `xr_studio_brk2` (now dropped), and the suites below. Scope (P-26): PR A only (API and start-up). Screens, UI states, keyboard, 1024 px and zoom are PR B and C: **N/A here**.

## Verdict: **Approve** (no Blocker, no Major; 3 Minors and 3 nits, which can be fixed later)

## Suites run
| Suite | Result |
|---|---|
| `check_pf17_console.ts` | 49 passed, 0 failed |
| `check_pf17_support.ts` | 33 passed, 0 failed (DW6/DW7 line counts unchanged) |
| `check_pf17_demo_signin.ts` | 14 passed, 0 failed |
| `check_pf4s_system_signin.ts` (neighbour) | 104/104 |

## What broke

**m1 (Minor). Two start-ups at once on the same database: one stops with a unique-key error.**
* Repro: on a new migrated database, run `seedSampleSystemStaff(a, cfg)` and `seedSampleSystemStaff(b, cfg)` together with `Promise.allSettled`, using two Prisma clients and `{environment:"local", systemIdentity:{via:"local"}}`.
* Result, 3 runs out of 3: one call adds both people; the other rejects with `PrismaClientKnownRequestError … platSystemStaff.create()` (the unique email).
* Why: `sample-staff.ts:33-34` checks first and creates afterwards, with no conflict handling. `sample-seed.ts:49` runs inside `main.ts:243`, which does not catch the error, so the losing process does not start.
* Likelihood is low: `restart-api.sh` stops the old server first, and each isolated copy has its own database.
* Fix: insert with `ON CONFLICT (email) DO NOTHING RETURNING id`, then add the grant in the same transaction. Or catch P2002 and carry on.

**m2 (Minor). The SQ-plan and DW13 tests never compare the queue with the Firms page's own answer.**
* SQ-plan compares each queue row with a direct `livePlanOf` call (`check_pf17_support.ts:270`). The "one helper" check is a regex on the source (`:287`, `/livePlanOf\(/`).
* DW13 checks `/:id` only (`check_pf17_console.ts:346`).
* Gaps:
  * Nothing calls `GET /api/system/firms` (the list) for the active, payment-hold or ended firm.
  * Nothing checks `firm.plan` on the `POST /:id/replies` answer.
* So if the list path stopped using the helper while the call text stayed in the file, every test would still pass. The concept §6 says "each queue `plan` equals the Firms page's `plan`".
* Fix:
  * For the three firms, read `plan` from `/api/system/firms?q=` and from `/:id`, and compare each with the row and with the ticket.
  * Check `firm.plan` on one reply answer.

**m3 (Minor, latent). The plan on the queue depends on `system/support:list` alone.**
* The firm's plan is a firm fact, and the Firms page guards it with `system/firm:read`. The queue shows it to anyone holding `support:list` (`support.ts:74, 91`).
* Today every role holding `support:list` also holds `firm:read`. I checked live in `plat_system_role_permission`:
  * Owner, Admin, Support and Auditor have `support:list`.
  * Those four, plus Billing ops, have `firm:read`.
* So nothing leaks now. But the support mapping is Sample and pending (SA10-X3; `20261124030000_pf17_support_keys/migration.sql:6`).
* Fix: add one assertion that fails when a role holds `support:list` without `firm:read`. Or send `plan: null` when the caller lacks `firm:read`.

**Nits (no action needed for this PR)**
* (n1) `SAMPLE_SYSTEM_STAFF` is frozen only at the top level (`sample-staff.ts:11`): code in the same process can set an entry's `role` to `platform-owner`. I proved this in the scratch run. No configuration or environment path can do it. Fix: freeze each entry, or use `as const`.
* (n2) The staff seed's own refusal message (`refused: PLATFORM_ENVIRONMENT=…`) is never logged at start-up (`sample-seed.ts:49` logs only when it runs). The loader's refusal is what users actually see, so this is cosmetic.
* (n3) The seed writes no `plat_system_audit` line when it adds a Platform Owner (staff `invite` does). It is local-only Sample data, and journeys j_86 and j_90 insert staff the same way. Noted for SA-7-3; Unconfirmed whether a seed counts as an access change.

## What held (attempt → result)
* **Seed or stand-in outside local, through every path:**
  * Loader: `PLATFORM_SYSTEM_IDENTITY=local` with `PLATFORM_ENVIRONMENT` test or production is refused, naming the setting (DS3; PF-4s DW2).
  * Direct call: `seedSampleSystemStaff` called for test or production (even claiming `via: local`), or with Cognito, throws `SampleStaffRefused` and writes nothing (DS2).
  * `isolated.sh` sets no default for our stand-in (only with the argument); its `PLATFORM_ENVIRONMENT` respects an exported value.
  * The demo reset (`demo.ts:42`) seeds firms only, never staff.
  * `demo-update.yml` runs `start.sh` (the default is there).
  * The cloud image does not set the variable: `container-entry.mjs` and the Dockerfile have no `PLATFORM_*` line. `compose.test.yml` leaves it unset, and the cdk test refuses an environment of `local`.
  * An exported `cognito` wins in `start.sh`, and without its pool settings the loader then stops.
  * The API listens on 127.0.0.1 only (`main.ts:263`).
  * The environment label is the only guard: `local` with a `DATABASE_URL` pointing at another database would seed there. The PF-3 firm seed has the same gate, so this is not new.
* **Seed: higher role or change to an existing person:**
  * Both people are added once, one role each. A second start adds nobody.
  * A Sample Owner who was deactivated stays deactivated, with roles unchanged (scratch run).
  * The email is lower case by the database rule `plat_system_staff_email_shape`, and staff are never deleted. So there is no case or spacing duplicate: `" OPS.Sample@ExpatReady…"` signs in as the same person.
  * Cognito maps people by `identity_subject`, never by email, so a Cognito account cannot take over a seeded row.
* **No secret in git:** I scanned the diff for password, secret, token and long strings: none. `start.sh` sets no `PLATFORM_SYSTEM_LOCAL_SECRET`. Tokens are issued for each sign-in.
* **Firm session or wrong role on the queue:**
  * A firm token gets 403 `FIRM_SESSION_REFUSED` on the list (also with `?firm=<another firm>`), on `/:id` and on `/firms`, also with an `x-firm-key` header.
  * No token gets 401.
  * Content publisher gets 403 everywhere.
  * Billing ops gets 403 on the queue and the ticket and 403 on reply, and 200 on Firms (it holds `firm:read`).
  * Bad queries (`?firm=x`, `?status=BOGUS`, `?page=0`, `?plan=team`) get 422.
* **PF-12 walls, one bypass use, line counts:** measured live for one call each.
  * Queue list: 1 guard line, plus `cross_tenant.access` and the platform-level bypass line.
  * One ticket: 1 guard line, plus `cross_tenant.access` and firm A's own bypass line.
  * Reply: 1 guard line plus 2 lines.
  * Firms list and one firm: same pattern.
  * The plan read writes nothing. It runs in the existing transaction, with no second `asBypass`. The definer's wall clause still limits a firm session to its own firm.
* **Same plan on the two pages:** one firm (`/:id`), the Firms list, the queue row and the ticket agree in every case below. I checked live:
  * ACTIVE, TRIAL, OVERDUE and PAYMENT_HOLD: the firm's plan.
  * ENDED: null.
  * No subscription at all: null on all four, and on the reply answer.
  * A booked lower plan: both show the current plan, with limits lowered (the definer function's `plan_code` does not depend on the metric or on `now`).
* **`failedJobsComplete` with the real PF-14 reader:** 10 001 dead-letter rows inserted into `platform_jobs.job`.
  * Cap − 1: true, and the count is right.
  * Cap: false, on the page and on `/:id`.
  * Cap + 1: false (the newest entry is left out, as BR-4 says).
  * Failed read: false, counts null (DW10/DW11, fake reader). Renaming the table did not make the live read fail, because the prepared statement keeps it.
* **Budgets:** 63 firms with tickets: the queue (50 rows, 50 plan reads) takes 58-65 ms, and the Firms list of 50 takes about 240 ms. On the Sample data: Firms 30-60 ms, queue with one firm 18-29 ms.
