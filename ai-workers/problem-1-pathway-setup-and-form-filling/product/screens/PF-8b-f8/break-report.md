# PF-8b F8 break report (permissions): the Sample seeds as a no-bypass owner

Branch `claude/runtime-pf8bf8`, head `ebb81df9`, PR #3097. Breaker pass, 22 Nov. Throwaway PostgreSQL 18.3 clusters on :15770 (the PR's own check) and :15771 (my attacks). Never :54329 or :4400. Setup as in the check: migrate as BYPASSRLS `xr_admin` (`log_error_verbosity=terse`), then `ALTER ROLE xr_admin NOBYPASSRLS`. Main's three files were taken from the merge base `5dd56f9e` (`git archive`) for comparison. The scripts were scratch files (`attack.mts`, `demo.mts`, `bt.mts`, `snap.sql`). No repository file was edited apart from this report.

Scope: the two Sample seeds, the two new helpers, and the `seedCreatedFirms` change named in the PR. Nothing else.

## Findings

### Major

**M1. `firmInTransaction` overrides the firm of any request or job that calls it. Nothing guards this, and four request paths call it through the seeds.**
- Where: `api/src/platform/firm-scope.ts:87-89`. `seedFirmFrontOffice` calls it at `api/src/front-office/firm-seed.ts:99` and `ensureBookingWording` at `:142`. The callers are app request paths running as `xr_app`: `assignment/rules.ts:62`, `sales/arrival-port.ts:138` and `:100`, `people/fo-person-port.ts:64`, `booking-seed.ts:92`.
- What I did (`attack.mts`, DB `s4`): through the app's own `WalledPool` as `xr_app`, I ran `withFirm(A, () => db.$transaction(tx => seedFirmFrontOffice(tx, B)))`, with A = sample-firm and B = sample-solo.
- Expected: the walls refuse B. On main, B's `platform_firm` row is hidden under A, so the call throws `firm-seed: B is no platform firm`. That is the defence in depth PF-12 promises ("each query runs as its caller's firm", api-platform card).
- Actual:
  - The call returns `{"seeded":true,"stages":16,...}` for B, and a superuser read confirms B's `fo_sales_setup` is `seeded_by seed:FO-1a`.
  - For the rest of A's transaction the session is B: `select count(*) from platform_staff` went from 3 (A's) to 1 (B's).
  - `ensureBookingWording(tx, B)` from A's scope also returned `true`.
  - The next checkout is A again, so the change does not leak past the transaction.
- Every caller today passes its own context's firm, and I found no route where the firmId comes from outside. So there is no exploit and this is not a Blocker. But the database wall no longer catches a wrong firmId in those paths, and nothing restores the caller's firm afterwards.
- The PR fixes a seed that runs outside any scope. A guard would keep that fix without opening the hole: act only when no request, job or bypass scope holds a firm (`currentFirm()`/`currentBypass()` unset), or refuse when that firm differs from the one given.

**M2. CI is red: `module-cards` fails at this head.**
- CI log (job 137234632950):
  - `module api-front-office: … firm-seed.ts …, card … not`
  - `module api-platform: … firm-scope.ts …`
  - `FAIL update the card(s) in this PR, or put 'Card unchanged: <reason>' in the PR body (P-615 (3))`
- `firm-scope.ts` gains two exported entry points (`firmInTransaction`, `firmOfKey`) and a new way to set `app.firm_id`. The card's "Do not" names exactly that ("set `app.firm_id` … outside `firm-scope.ts`"). Neither card nor any `MODULE.rows/` file records the helpers or their limits.
- The PR cannot merge on green as it stands.

### Minor

**m1. A Sample actor id held by another firm aborts the whole owner run, where a superuser run skips that person.** The PR body lists this as a known limit; I confirmed it.
- Where: `seed-sample-firms.ts:93-95`.
- What I did: before seeding, as superuser, I added firm `other-firm` with staff `actor_id='user-T'` (DB `s1` vs `s1su`).
- Owner (no bypass):
  - `platformStaff.create` fails with P2002 at `:95` (`platform_staff_actor_id_key` is global).
  - The process dies with an unhandled Prisma stack trace and no JSON line.
  - Neither Sample firm is written, and `firm-seed.ts` then reports both missing.
- Superuser: completes with `staffAdded 3`, skipping `user-T`, which is what the explicit `there.firmId !== firm.id → continue` branch was written for. Under the walls that branch can never run.
- Possible fix: check actor ids through a yes/no definer lookup (like `platform_staff_email_taken`), or at least name the clash in words.

## What held
- **The PR's own check:** 12/12 on :15770.
- **No leak on a pooled connection** (pool max 1, same backend pid):
  - `app.firm_id` is A inside the transaction and `''` after commit and after a thrown rollback.
  - `ROLLBACK TO SAVEPOINT` restores the earlier value.
  - `firmInTransaction` on the bare client (no transaction) has no lasting effect.
  - Through `WalledPool`, the next checkout is back on its own firm, so the `c[SET]` cache stays true.
- **Superuser end state equals main:** main's seeds and the branch's seeds, both run as `postgres`, give identical snapshots (firms, staff, roles, acceptances, settings, front-office counts and wording, audit lines by action):
  - on a fresh DB (`m1`/`b1`);
  - with `other-firm` + `user-T` + its `firm.created` event (`m2`/`b2`).
- **Main as the no-bypass owner** fails with `42501 … platform_firm`, which reproduces the AWS error.
- **Sample firm DELETED and a staff member's actor id cleared/email moved** (`s2`): the owner and superuser runs are identical. The DELETED firm is not seeded, and a new `user-O` is created on both.
- **`seedCreatedFirms` per-firm path** (`s3`; TRIAL, DELETED, ABANDONED, PAYMENT_HOLD, PROVISIONING with an upper-case id, plus a duplicate event):
  - owner and superuser give the same list (3 seeded) and the same snapshot;
  - a second run seeds nothing.
- **Two seeds at once:**
  - With a 3.5 s `ACCESS EXCLUSIVE` lock on `platform_firm`, both seeds read "no firm" and each tried its own pre-generated id. The loser hit the key's unique index (P2002) and rolled back completely; the winner wrote 2 firms, 4 staff and 2 subscriptions, with no duplicate. Main's findUnique-then-create fails the same way.
  - Two concurrent `firm-seed.ts` runs: one seeds, the other reports `seeded:false` (the row lock holds).
- **Partial state:** a failed first run of `seed-sample-firms.ts` (m1) leaves nothing behind, because it is one transaction.
- **Demo reset** (`demo.mts`; `asBypass("platform.demo.reset", seedSampleFirms(…, addSampleConsultationTypeSafely))` through `WalledPool` as `xr_app`):
  - run 1 writes 1 `platform.bypass` line per Sample firm, run 2 one more each (2/2);
  - one Sample type and one wording are written;
  - the `then`'s `ensureBookingWording` setting the firm does not disturb the bypass role.
- **Outbox and jobs:** `onFirmCreated` in `firm-seed.ts` is called only by `seedCreatedFirms` and the CLI. No job or outbox handler runs it as `xr_app` (the `onFirmCreated` in `web-address/firm-created.ts` is a different function). So a firm B event cannot be processed inside firm A's job scope through this path.
- **Lookups:** `platform_firm_of_key` has no status filter, so DELETED Sample firms are still found by key. `firmScope` refuses a malformed id before `set_config` runs. The walls still refuse the owner a firm row with no firm.

## Notes (not findings: outside the PR's claim, or the same on main)
- The start-up seed's third step (`seedSampleConsultationType`, `booking-seed.ts:80-83`), run as the no-bypass owner, adds nothing. It logs "the Owner user-R is not staff of sample-firm", which is misleading (`bt.mts`, DB `s9`).
- Two `seedSampleSettings` runs at once write two `platform.setting.change` lines for one stored value (`keep-period/service.ts:44-45`, check-then-write). Same code on main.

Verdict: Changes

## Round 2 (diff `ebb81df9..0528e402`; fresh PostgreSQL 18.3 cluster on :15772, PR check on :15773)

- **The PR's check:** 15/15 at `0528e402`. CI `module-cards`: success.
- **M1 fixed.** Rerun of my app-scope attack through the real `WalledPool` as `xr_app` (`r2.mts`, DB `r1`), inside `withFirm(A)`, aimed at a fresh firm C:
  - `seedFirmFrontOffice(tx, C)` gives "C is no platform firm".
  - `ensureBookingWording(tx, C)` gives 42501 (row-level security).
  - `firmInTransaction(tx, C)`, and `(tx, null)`, give `FirmScopeError`. So does a call from a `setTimeout` inside the scope.
  - `seedSampleFirmsFrontOffice(app)` inside the scope fails each firm by name: `FirmScopeError` for the seed and for the wording.
  - Firm C afterwards: 0 setup rows, 0 wording rows.
  - `inRequest` with no firm (a public door): `FirmScopeError`.
  - The app's own-firm path still works (`own.mts`): `withFirm(D)` seeds D's front office and wording.
- **M2 fixed:** `MODULE.rows/PF-8b-f8.md` for both cards.
- **Demo reset** (bypass use, `demo.mts`, empty DB `r2`, two runs): firms, the Sample type and the wording are written; 1 `platform.bypass` line per Sample firm per run (1/1, then 2/2).
- **Start-up seed** (`seedSampleOnStart`, no scope, `PLATFORM_SAMPLE_SEED=on`, no-bypass owner, DB `r3`): completes (`firmsAdded 2`), and its snapshot equals the CLI seed's (`r4`). The consultation type step still skips, as noted in round 1.
### Minor (new)

**m2. The guard misses firm-less jobs.**
- Where: `firm-scope.ts:90-91` checks only the firm scope's AsyncLocalStorage. A firm-less (recurring or platform) job with no `job:<queue>` bypass use runs as `asJob(name, …)` → `fn()` with no firm scope at all (`platform-jobs.ts:69`).
- Repro (`r2.mts` step 5): `wallUnscopedQueries()`, then `asJob("r2.no-bypass-queue", () => $transaction(tx => { firmInTransaction(tx, C); seedFirmFrontOffice(tx, C) }))` as `xr_app`. It succeeds with `current_user xr_app, role none, app.firm_id = C` and writes C's `fo_sales_setup`.
- The new card row says "refused inside a request's, job's or firm's scope", which is wrong for these jobs.
- No job calls a seed function today, so nothing exploits it.
- Possible fix: also refuse when `currentJobFirm() !== undefined` (any job, firm-less included).
**m1** is unchanged and stays a known limit (disclosed in the PR body).

Verdict: Approve
