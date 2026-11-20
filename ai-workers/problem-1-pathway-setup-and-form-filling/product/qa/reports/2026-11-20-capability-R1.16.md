# qa capability R1.16: re-score on main 90535a94e (first read on b201e9c1a), 20 Nov (cloud qa lane; Opus 5.5 medium; fresh Opus reader, ran nothing; US$0)

**Item:** R1.16 "Automated testing". Its builder PR #2517 (QA-449 part 1) merged at 12:55Z. All parts have merged (MVP-CHECKLIST row 16: PF-7 Merged), so the row is scored.

**Verdict: Partial (unchanged), held by QA-449 part 2.** The fresh Opus reader also gives Partial.
The container proof now runs on merge batches and is green. It is still **report-only**, though: a red `skeleton` does not block a batch, so clause 1 ("a red suite blocks it") is not met for it.

## Clause by clause (main 90535a94e; app code = 3a8fdee6f's, the #2029 merge)
| Clause | Met? | Evidence |
|---|---|---|
| Every suite runs on every merge batch on GitHub's runners, and a red suite blocks it | **ci: met · skeleton: not met** | ci run **44734827610** on #2517's batch: success (18 shards, types, 5 regression jobs, fast). `ci` is the check the merge rules require (`.mergify.yml:166,196,216,229`). `skeleton` is in no queue or merge rule: `skeleton.yml:12-16` and `.mergify.yml:25-27` both say "report-only (P-717 (b))". "Every suite" means every non-quarantined suite (`ci.yml:12`, `--skip-quarantined`). |
| An API error never reads green | not shown this round | It still rests on PF-7's 3a523edcd. Inside the smoke it holds: a 000 answer fails, and health must say ok (`skeleton-smoke.sh:29-38, 89-90`). |
| The container smoke and its seeded fails run on main's code | **met** | The job runs on `mergify/merge-queue/*` (`skeleton.yml:53`), pinned by `check-skeleton-scope.sh`. skeleton run **44734827437** (#2517's batch) and run **44739838072** (the batch for #2527 stacked on #2521 and #2525, on main b201e9c) are both success. In each: health 200, the first page and its bundle 200, `/api/platform/me` 200, non-root, no secret. Seeded fails caught: health 503 with the database stopped, and a root image with a key in its environment. Before #2517, 97 of 97 batch runs skipped. |
| Release 1 packs join the protected set once Works | met by construction | The protected set is every Works row that has a pack (`ci.yml` regression-plan). |

**Tree:** #2517's batch tree (6815abaf) is not main's tree (6b2d0881), because main also took #2533 outside that batch. #2533 changed qa records only, so this does not matter. Run 44739838072 also ran on top of main b201e9c.
**Gap in the runs:** #2517 changed only the pipeline, so its batch ran skeleton only because `skeleton.yml` is on skeleton's own path list. Run 44739838072 is the first batch where skeleton checked a product code change. A batch that touches no image path skips skeleton by design.

## Runs on main's code
**On main's exact head 90535a94e (the Lead's dispatch, 21:1x IST):**
| Run | Result |
|---|---|
| skeleton **44764131465** (workflow_dispatch) | success: health 200 status ok; first page and bundle 200; `/api/platform/me` 200 with firmId; non-root (node, uid 1000); no secret (7 env names, 17 layers). Seeded fails caught: health 503 with the database stopped; a root image with a key. |
| skeleton **44764145893** (workflow_dispatch) | success, the same. |

Clause 3 is now proved on main's own tree, not only on batch trees.

Green skeleton batch runs since #2517 (each a merge-queue batch; none red, none skipped where image paths changed):
| Run | Batch | Note |
|---|---|---|
| 44734827437 | #2517's batch | pipeline-only change |
| 44739838072 | #2527 on b201e9c (with #2521, #2525) | first batch with product code |
| 44740294652 | #2537 on b201e9c | |
| 44743378490 | #2540 on fc3d2aa | |
| 44752862748 | **#2029's batch: the app code that is main's now** (no `prototype/` or `.github/` change from 3a8fdee6f to 90535a94e) | |
| 44755851713 | #2546 + #2309 on f0b4fb0 | |
| 44758707203 | #2309 on 7df8b32 | main's app code plus #2309 |

That is 7 clean batches toward P-717 (b)'s 10 (or 24 h from 12:55Z). ci was green on the batch that merged #2029 (44752862844). The two dispatches above answer the request on #2517.

### First read (b201e9c1a)
- skeleton 44734827437: success (#2517's batch)
- skeleton 44739838072: success (next batch, on main b201e9c)
- ci 44734827610: success (#2517's batch)

R1.16 has no journey (`tests/journeys/j_16.ts`), so no walk was asked for. #2517's question 3 makes the same point.

## Bugs: 0 new. QA-449 stays open (part 2: required)
QA-449's Expected says the proof "runs on the merge batch … and is required". The first half is now met. The second half is the tech lead's `.mergify.yml` follow-up after 10 clean batches or 24 h (P-717 (b)). Note from #2517: a plain `check-success = skeleton` can never be true on a batch that matches no path, so it needs an `or:` with `-files~=`, as `xfa-engine` has.

## Questions for the Lead
1. After 10 clean batch runs or 24 h (P-717 (b)), please add `skeleton` to `.mergify.yml` with the guarded `or:`, then ask qa to re-score R1.16. That is the last open clause.
2. Done: skeleton was dispatched twice on main 90535a94e (44764131465, 44764145893), both green.

## Could not test
- "An API error never reads green" for the API suites. No new evidence; it rests on PF-7.
- A red batch actually being blocked. No red batch was seen this round.
