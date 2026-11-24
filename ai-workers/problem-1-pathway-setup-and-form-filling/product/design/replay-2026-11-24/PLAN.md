# Replay arm 1: pass bar, sample and method, fixed before any review (24 Nov 2026)

Asked by Lead 25 (13:18 IST). Arm 1 only: a fresh Opus reviewer with a checklist. Arm 2 (CodeAnt) waits; nothing is sent to it. Plan usage only.

## Pass bar (fixed now)
* **Known misses:** 14, in **13 PRs** (QA-750 and QA-751 share #2922). So the sample is 13 + **15 controls**, not 14 + 14.
* **Found:** the claim names the same wrong behaviour on the same code path; half matches are reported apart and count 0.
* **Arm 1 is good enough alone** at 4 or more of 14 found and at least half its Major+ claims true. Arm 2, if it runs, passes only with 4 or more of 14, half true, and at least 2 that arm 1 missed.
* **True claim:** a fresh Opus judge, reading the same code, shows input or state to wrong result in the code of that commit, and it would be a qa Major or above. Unproved counts as not true. Where a later qa row or fix shows it, that is recorded.

## Method
* Each PR at its merge commit (diff against its first parent). Files in scope: app source, schema, migrations and tests (`.ts .tsx .js .cjs .mjs .sql .prisma`), no journeys, acceptance packs, evidence or records. Slices of at most 10 files, source first (41 slices); the same slices for arm 2.
* The reviewer gets a folder: the app's code at that commit, `slice-N.diff`, and `requirement.md` (the backlog and capability rows as they stood before the PR; qa numbers blanked). No records folder, no qa list, no git, no PR number.
* One reviewer context a PR, all its slices; Opus, medium effort; batches of 4. It may not read outside its folder; this is an instruction, checked after from its transcript for outside paths.
* Controls: nearest PR by file count within 4 days, not cited in any Major+ qa row, no qa number in its title; two for #2922 and #3065. "Control" means no Major+ is known, not that none exists.

## Limits, said before the result
* The introducing PR of each miss was found by file history and the qa row; three are judgement calls (QA-397 to #356, QA-526 to #2268, QA-595 to #2214). A miss that shows a gap (QA-453, 595, 608) may be a fair deferral in its PR.
* At least 2 of the 14 were noted by our breaker before merge (QA-701, QA-770), so "missed" means it reached main.
* The checklist is written from `STANDARDS.md` and general practice, not from the 14 rows, but its author had read them. The result is **in-sample, likely high**.
* The controls' true defects are unknown, so this gives a share of claims true, not a recall on controls.
* Code at that commit can hold its own comments about known gaps; that is fair to both arms.

## The checklist given to every reviewer
1. Requirement, clause by clause: for each clause in `requirement.md`, name the code that makes it true, or say it is missing.
2. Every door: when the change sets or tightens a rule, find the other routes, jobs and callers that should obey it.
3. Permissions: each route has its own server-side check; read rights never allow a change.
4. Firm wall: no read or write crosses firms; any use of elevated access is recorded as required.
5. State: every exit (cancel, withdraw, expire, retry, fail) ends what it started, here and in linked records.
6. Input: refuse out-of-range, expired, damaged or oddly written values before anything is stored.
7. Failure: a thrown provider error, a retry and a crash midway each reach a correct final state.
8. Frozen means frozen: a case or released item reads its pinned version, not live configuration.
9. Real wiring: the running app uses the real adapter, not a fake or test double.
10. Money, dates, time zones, rounding and concurrency (stale saves, double submits).
11. Data: migrations keep existing rows; constraints match the rules in code.
12. Tests: would the rule's test fail if the rule were removed?

## The 28

| Id | PR | Merged | Files | Slices | Known miss | Control for |
|---|---|---|---|---|---|---|
| S01 | #2909 | 2026-11-22 | 7 | 1 | - | #2922 |
| S02 | #1813 | 2026-11-15 | 10 | 1 | - | #1824 |
| S03 | #1823 | 2026-11-15 | 3 | 1 | QA-517 | - |
| S04 | #1633 | 2026-11-12 | 18 | 2 | - | #1910 |
| S05 | #2029 | 2026-11-20 | 14 | 2 | QA-608 | - |
| S06 | #2307 | 2026-11-20 | 8 | 1 | - | #2253 |
| S07 | #2011 | 2026-11-18 | 9 | 1 | QA-510 | - |
| S08 | #2268 | 2026-11-19 | 5 | 1 | QA-526 | - |
| S09 | #1824 | 2026-11-15 | 10 | 1 | QA-601 | - |
| S10 | #2931 | 2026-11-22 | 15 | 2 | - | #3065 |
| S11 | #2922 | 2026-11-22 | 7 | 1 | QA-750, QA-751 | - |
| S12 | #1752 | 2026-11-14 | 11 | 2 | - | #1760 |
| S13 | #1910 | 2026-11-16 | 17 | 2 | QA-499 | - |
| S14 | #2331 | 2026-11-19 | 5 | 1 | - | #2268 |
| S15 | #2140 | 2026-11-18 | 9 | 1 | - | #2011 |
| S16 | #2214 | 2026-11-19 | 11 | 2 | QA-595 | - |
| S17 | #2802 | 2026-11-21 | 8 | 1 | - | #2814 |
| S18 | #3065 | 2026-11-23 | 15 | 2 | QA-770 | - |
| S19 | #2253 | 2026-11-19 | 8 | 1 | QA-520 | - |
| S20 | #2251 | 2026-11-19 | 11 | 2 | - | #2214 |
| S21 | #2406 | 2026-11-20 | 14 | 2 | - | #2029 |
| S22 | #1760 | 2026-11-14 | 11 | 2 | QA-453 | - |
| S23 | #3041 | 2026-11-22 | 14 | 2 | - | #3065 |
| S24 | #356 | 2026-11-02 | 17 | 2 | QA-397 | - |
| S25 | #336 | 2026-11-01 | 18 | 2 | - | #356 |
| S26 | #2814 | 2026-11-21 | 8 | 1 | QA-701 | - |
| S27 | #1811 | 2026-11-15 | 3 | 1 | - | #1823 |
| S28 | #3046 | 2026-11-22 | 7 | 1 | - | #2922 |

Built by `build.py` (seeded order); file lists in `sample.json`.

## Fixed after the first claim came back, before any other was read
* **Headline "found" = named at Major or above** (a Minor would not have stopped the merge). Named only as a Minor is reported apart.
* Reviewers run at Opus **high** effort, not medium: the repository's hook (P-608 (2)) refused medium.
* S04, S05 and S12 carry no requirement rows (none under the ids in their titles).
