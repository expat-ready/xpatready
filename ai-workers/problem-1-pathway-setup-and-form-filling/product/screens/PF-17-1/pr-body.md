<!-- Draft body for the PF-17 part 1 PR. It opens only after #2927 (PF-4s part 1) is on main (Lead 4, 15:0x IST 22 Nov; brief "Start when"). -->
**Title:** `runtime: PF-17 part 1 — our team's firms list with health and usage per firm` (R1.93)

**Shared file:** `api/src/platform/firm-scope.ts`: one new `BYPASS_USES` line (permissions; the Lead's P-423 read before the label). No migration, no new key (`system/firm:read` is PF-4s's).

## What and why
Our own staff can now list every firm with its health and usage, and read one firm's figures (R1.93; SA-2-14; P-581 "a simple health and usage view per firm"). It is read only and sits behind PF-4s's `/api/system` guard.
* `GET /api/system/firms`:
  * Per firm: id, name, web address, status, plan, subscription status, trial end, billing period, `overdue` (PF-5's indicator) and the newest staff sign-in.
  * Usage against each limit (seats, active individual cases, active corporate cases, storage), each as used, limit (null means Unlimited) and over. These come from PF-15's own reads (`seatsUsed`, `PgEntitlements.limitOf`, `PgCaseCount`, `FilesPort.usedBytes`), never a second count.
  * Failed jobs from PF-14's dead-letter list: count, last time and queue names (never a job's key or error text).
  * `health`, one of `HELD`, `ATTENTION`, `OK` or `CLOSED` (a deleted firm or an abandoned sign-up; Lead 4's ruling 3), with its plain reasons.
  * Sorted HELD, then ATTENTION, then OK, then CLOSED, then by name. Filters: `?health=` and `?q=` (name or web address, literal text). Paged with `?page=`, 50 firms a page (Sample).
  * Unknown query keys get 400.
* `GET /api/system/firms/:id`: the same figures for one firm. An unknown or malformed id gets 404 in plain words.
* The key is `system/firm:read`: Platform Owner, Admin, Support, Billing and Auditor have it; Content publisher does not.
* Crossing the walls: the new use `platform.system.firm-read` covers these two GET routes only. It has no `direct` or `outside` flag, and its audit mode is **per-firm**: one `platform.bypass` line on each firm's own trail for every firm read, written before the answer leaves (fail-closed). The PF-4s guard writes one `plat_system_audit` line per call, naming our staff member.

**Files:**
* `api/src/platform/system-console/firms.ts`, `routes.ts`
* `api/src/features/platform-system-console.ts`
* `firm-scope.ts`: 1 line
* `tests/check_pf17_console.ts`
* `MODULE.rows/PF-17-1.md`, in platform and in features
* `tests/check_pf12b_bypass_audit.ts`: 3 lines, see question 2

## Done when (brief DW1-DW8)
All of them are in `tests/check_pf17_console.ts`: **41/41, exit 0, on two runs** (head 47716a7d).
- [x] DW1:
  - Support, Billing, Admin, Auditor and Platform Owner get 200.
  - Content publisher gets 403 on the list and on one firm.
  - A firm token gets 403; no token gets 401.
- [x] DW2: A's and B's figures equal PF-15's own reads, and they follow when A changes.
- [x] DW3:
  - One seat over the limit shows ATTENTION with "seats over the limit"; at the limit shows OK.
  - A held firm shows HELD.
  - A trial ending within 3 days shows ATTENTION.
  - An overdue firm shows ATTENTION.
- [x] DW4: the newest sign-in is shown, or null when nobody has signed in.
- [x] DW5:
  - Exactly one PF-4s line per call, allowed or refused.
  - None on a firm's own trail.
  - One `platform.bypass` line per firm read.
- [x] DW6:
  - The use covers the two routes only.
  - The service called outside a request, or from a firm's route, is refused with `BypassRefused`.
- [x] DW7: an unknown, malformed or SQL-looking id gets 404, never 500.
- [x] DW8:
  - Order, paging, `?health=` and `?q=` work.
  - `%` and `_` are literal.
  - A bad health value, page 0, a repeated filter or an unknown key gets 400.
- Extra: nothing private in any answer (staff names and emails, owner and firm contacts, a failed job's key or error). An unreadable job list, or one at its 10 000 cap, is said once on the page, never as a made-up 0.

## Checks
| Suite | Result |
|---|---|
| pf17 console | 41/41 ×2 |
| pf4s system sign-in | 78/78 |
| pf12 walls | 110 |
| pf12b doors | 33 |
| pf12b bypass audit | 70/70 |
| pf15 limits | 69 |
| pf15 booking | 42 |
| pf15 cases | 53 |
| features registry | 27 |

`run-suites.sh --changed` selects every suite because #2927's `core.ts` is in the diff, so I ran the touched suites by their usage lines. `graph.mjs --check` exit 0. `count-any` 416, unchanged. `module-cards` PASS. `tsc`: no errors in these files.

No walk at 1440 px: this part is API only. The screens are part 4, concept first.

**Reviews:**
* Round 1 on 27e8b406:
  * Reviewer: Changes (M1: no test for the key on the one-firm route).
  * Breaker: Changes (M1: audit volume; m2: health; m3: input).
* Round 2 on b6965705 (diff-only): **both Approve**, with two new Minors from the breaker.
* Round 3 on 47716a7d (diff-only): Lead 4's ruling 3 (CLOSED), and the breaker's round-2 Minors fixed:
  * m4: the 400 for an unknown key names the allowed keys only, never the caller's;
  * m5: "failed jobs not counted" is a reason that alone never makes a firm ATTENTION.
* Round 3 result: **both Approve 47716a7d3737945cd738ff77f76a472aec14ec40**. Each new rule's mutation turns the check red.
* Round 3 needs the tech lead's `Lead allows round 3:` line (review-rounds).
* Records: `product/screens/PF-17-1/review.md` (rounds 1-3), `break-report.md`, `break-report-round2.md`, `break-report-round3.md`.

**Minors listed, not fixed** (any code push after the Approve needs a new round):
* Review r3 m1: the PROVISIONING reason has no test. A firm still being set up with a live subscription would show OK if a later edit dropped the reason; without a subscription, "no live subscription" still makes it ATTENTION.
* Review r3 m2 (also the breaker's round-3 note): three comments still name only HELD, ATTENTION and OK (`firms.ts:69`, `firms.ts:89`, `routes.ts:11`). For part 4 or the next Minor PR.
* Breaker round-3 note: CLOSED hides a still-live subscription, as ruled; `subscriptionStatus` still shows it, so part 4's screen could surface "deleted but still subscribed".

## Departures from the brief (stated, then ruled by Lead 4, 15:42 IST 22 Nov)
* **Failed jobs** (R1.93 names them): 7 days (Sample). One recent failure adds an ATTENTION reason. Ruling 3: keep, labelled Sample.
* **More ATTENTION reasons** (review m5, break m2):
  * SECURITY_LOCK, PROVISIONING and "no live subscription" are ATTENTION (ruling 3).
  * DELETED and ABANDONED are a fourth health, **CLOSED**, with that one reason, so the list does not fill with permanent alarms (ruling 3).
* **Speed:** several queries per firm (STANDARDS §5 "no N+1"), forced by "PF-15's own reads, never a second count".
  * 100 firms: about 0.6 s.
  * 400 firms: 2.4–3.7 s.
  * One firm or a `?q=` search: under 15 ms.
* **Paging:** by page number, not the cursor STANDARDS §6 asks for. Health is computed and sorted in memory, so a page number is the honest choice; the brief asks for pages.
* `tests/check_pf12b_bypass_audit.ts` and `features/MODULE.rows/PF-17-1.md` are outside the touch list. Ruling 2: keep both.
* **Size:** 880 changed lines in this row's own files (#2927's drop out once it is on main):
  * 527 lines of code and tests: firms.ts 197, the check 289, routes 18, the feature 11, card rows 5, firm-scope 1, pf12b 6.
  * 353 lines of review records under `product/screens/PF-17-1/`, which pass the 800-line limit under P-775.
  * No size exception is needed.

## The tech lead's rulings (Lead 4, 15:42 IST 22 Nov)
1. **Audit mode: per-firm, kept.** Each list call writes one `platform.bypass` line for every firm it reads (breaker: 100 lines per call with 100 firms), because our staff reading across firms must be visible to each firm (R1.87).
2. **Both extra files, kept.** The bypass list in `check_pf12b_bypass_audit.ts` must name the new reader, and the module-card row is required.
3. **The failed-job signal, kept** (7 days, labelled Sample). Locked firms and firms with no live subscription are ATTENTION; deleted or abandoned firms show as CLOSED.

Duplicate check: searched BACKLOG (PF-17, R1.93), open PRs at 15:1x IST 22 Nov (#2927 is the guard; none builds a console route), `main`'s code (`system-console`, `system/firms`, `firm:read`) and `qa/BUGS.md`: none. touch-overlap: `touch-overlap.py` cannot read PRs from a cloud lane (GraphQL 403), so I compared the branches of the 10 open runtime/screens PRs by hand: no overlap. #2927's files are not touched.

On the demo: nothing visible. The API answers on `/api/system/firms` for a signed-in staff member of ours once PF-4s is on. Cost US$0. Live AI off.

Card: the platform and features cards get row files `MODULE.rows/PF-17-1.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01Ln6TiPo5fkBVevMEJEEXCN
