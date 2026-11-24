# PF-17 failed-jobs part review: `failedJobs` per firm on our console's firms API (R1.93)

Reviewer: Opus, fresh context; I did not build this. Commit reviewed: **f65789c37c719de768166471c2158520f773b7df**, branch `claude/runtime-pf17-failed-jobs`. Diff: `origin/main...HEAD`, base a79e246c6, 4 files, +68/-9.
* Scope: Lead 15's answer on #3225 as the brief gives it ("health per firm (last sign-in, failed jobs, plan state)"): `failedJobs` per firm on `GET /api/system/firms` and `GET /api/system/firms/:id`, read from PF-14's dead-letter list. Health is unchanged on purpose. The screens are PF-17 part 4's work, so they are not a finding here (P-26).
* API only, so D1-D20 and BIC-01..20 are N/A (the PF-15, PF-17-1 and PF-17-2 precedent). No journey score beyond j_93's line, as the Lead asked.
* I had no breaker, as the Lead asked. Permissions, schema, keys and bypass uses do not change; see "Walls and audit" below.

## Checks run (postgres 127.0.0.1:54329, scratch databases; isolated copy on :4494; port 4400 not used)
* `check_pf17_console.ts`: **43 passed, 0 failed**. DW1-DW9 still pass, and DW10's 5 lines pass.
* `j_93.ts` on isolated copy `j93r` :4494: **22/24**. "J-93 W2: each firm's failed jobs are its own dead letters" **PASS** (db [1,0], read [1,0]). The 2 failures are the Firms page and the support page, both PF-17 part 4's screens.
* Exit 0: `check_features_registry` 27/0, `check_bypass_uses` 52/0, `check_pf17_support` 29/0, `check_pf12b_bypass_audit` 70/0. `tsc --noEmit -p studio/api/tsconfig.json` reports nothing in the changed files.
* `graph.mjs`: G1 0, G2 0. The working tree is clean afterwards.
* Mutations of `firms.ts`, run on a scratch copy outside the repository:

  | Mutation | Result |
  |---|---|
  | Platform (no-firm) entries counted for every firm | caught (3 DW10 lines) |
  | Dead-letter read per firm instead of once per call | caught (reads 3) |
  | `catch` answers an empty map, so 0 instead of null | caught |
  | try/catch removed, so the call returns 500 | caught |
  | **`deadLetters()` with no limit (PF-14's default 100)** | **not caught** (m2) |
  | **Dead letters set health to ATTENTION and add a reason** | **not caught** (m3) |
  | `toLowerCase()` removed | not caught. Harmless: PF-14 stores the envelope's firm through `firmScope` (lower case, `pgboss-jobs.ts:247`) |

## What I checked and found correct
* **The count.** Each entry's firm comes from `toDeadLetter`'s parsed envelope (`pgboss-jobs.ts:349`). An entry that does not parse, a recurring job or a platform job has no firm, so it counts for no firm (`firms.ts:175`). Both sides compare in lower case (`firms.ts:175, 217`). A firm with no entry shows 0; an unreadable list shows null.
* **Where the read happens.** `failedByFirm()` runs once per call, after the key check and query validation and before `asBypass` (`firms.ts:128, 162`). It is outside every Prisma transaction, so no firm transaction stays open while pg-boss is read. On `?health=`, the bounded scans reuse the one map through the `figures` closure (`firms.ts:137`), so it is one read however many firms' figures are worked out.
* **The 30 s wait (`#whenStarted`).** It cannot be reached in the app.
  * Nest runs `onApplicationBootstrap` (`runner.start()`) inside `app.listen` before the port opens (`main.ts:259`).
  * A failed start throws out of bootstrap, so the API never serves.
  * A runner that is stopping or stopped throws at once (`pgboss-jobs.ts:302`), which gives null.
  * When the database is unreachable, pg-boss's pool gives up after 10 s (`connectionTimeoutMillis`, pg-boss `dist/db.js:30`), and then the answer is null.
  * Only a harness that injects a `PlatformJobs` that never starts would wait 30 s before null.
* **Wiring.** `PlatformJobs` is the app's provider, and 8 other features already inject it. j_93 on a full isolated app proves the binding end to end. DW10's first line checks only `inject`, not what the factory calls; j_93 covers that.
* **Walls and audit.** pg-boss's schema `platform_jobs` is not a firm table: no migration puts RLS on it, and pg-boss reads it through its own pool, outside the Prisma walls.
  * There is no new bypass use and no new key.
  * The list still writes its one firm-less line (DW9 m1-r2 passes), and opening one firm still writes that firm's line (j_93 W3 passes).
  * Our console already shows every firm to `system/firm:read`, so a per-firm count crosses no wall in a new way.
  * Only `firmId` is used from each entry. Payloads and errors are never returned.

## Findings (none Blocker, none Major)
* **m1 (Minor). A figure can be wrong at the 10 000 cap, and nothing says so.** `firms.ts:68, 175`; `pgboss-jobs.ts:226`.
  * pg-boss's `findJobs` orders by `created_on, id` (`plans.js` findJobs), so PF-14's reader keeps the **oldest** 10 000 entries.
  * The list keeps entries for a year (Sample). Once it holds more than 10 000, every newer failure is left out. A firm whose jobs fail today can show 0 and look healthy, with no sign of it in the answer.
  * The same file already flags its own bound with `complete: false` / `note` (break M1).
  * Fix: when the read returns `DEAD_LETTER_READ` entries, say so: set a note, or answer `failedJobs: null` ("not known"). Alternatively, record the limit in the MODULE row and the PR as a known limit for part 4's concept.
  * Unlikely at today's volume, so Minor.
* **m2 (Minor). DW10 does not fail when the cap is dropped.** `check_pf17_console.ts:298-303`.
  * The fake list holds 4-5 entries, so code that calls `deadLetters()` with PF-14's default of 100 still passes. In the real app that would silently count only the newest 100 entries across all firms.
  * Fix: assert that the fake receives `DEAD_LETTER_READ` as its limit, or push more than 100 entries for one firm and check that its count is all of them.
* **m3 (Minor). "Health unchanged on purpose" has no test.** The stated rule is at `firms.ts:25-26`, and the PR names it.
  * A mutation that turns firms with dead letters to ATTENTION passes all 43 lines.
  * Fix: in DW10, assert that firm A's `health` and `reasons` are the same with and without its dead letters.
* **n1 (Nit). An unreadable list leaves no log line.** `firms.ts:177-178` catches with no `logPort` line, so a null on our console leaves no trace in the logs. `/api/health/ready` already reports the queue as down, so this is not a gap against any [M] line I found.
* **n2 (Nit). Cost of each call.** Every list call and every one-firm call reads up to 10 000 full pg-boss rows (data and output), zod-parses them and sorts them, even to count one firm. DW9's "400 firms under 2 s" was not measured with a large dead-letter list.

## What I could not check
* Timing with a dead-letter list near 10 000 entries, against the 2 s budget (n2).
* `check_pf14_jobs` (95/0) and `check_aud3c_platform_line` (16/0): I did not re-run them. The PR leaves PF-14's reader and the audit code unchanged.

Verdict: Approve on f65789c37c719de768166471c2158520f773b7df
