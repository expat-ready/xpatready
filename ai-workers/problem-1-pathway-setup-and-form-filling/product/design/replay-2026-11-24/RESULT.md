# Replay arm 1 result: Opus reviewer with the checklist, 28 PRs (24 Nov 2026)

Plan usage only; nothing sent to CodeAnt. Bar and sample fixed first (`PLAN.md`); claims verbatim in `claims/`, verdicts in `verdicts.md`. Read from code only; nothing was run.

| Measure | Result | Bar | Met? |
|---|---|---|---|
| Known misses found at Major+ | **7 of 14** | 4 | Yes |
| Major+ claims judged true at Major+ | **45 of 124 (36%)** | half | **No** |
| Tokens per PR | **mean 211,509** fresh input + output (median 205,596; 127,923 to 342,014), plus 1.35 million cached reads | - | - |

**Arm 1 fails its own bar.** It finds misses but overrates severity. The judges called **0 of 124 claims wrong**: 79 were real but below Major (disclosed interim wiring, another row's clause, rare). The cost is triage, not invention.

| QA row | Result |
|---|---|
| QA-397, 453, 520, 601, 701, 751, 770 | **Found** at Major+ |
| QA-499, 510, 517, 526, 595 | Named only as a Minor (QA-526 and 595 only in part) |
| QA-608 | Half: one of the seven doors at Major |
| QA-750 | Not found (the PR's row never asked for the gate) |

All 14 defects were present in their PR's code, by reading. 13 miss PRs: 24 of 68 claims true (35%). 15 controls: 21 of 56 true (38%), in 9 of the 15. So "clean" controls were not clean; whether these 21 are still on main was not checked.

## Read it with these limits
* **In-sample, likely high:** the checklist's author had read the misses. QA-751's PR carried a journey file stating the expected behaviour (W4b), which the claim cites. QA-770's requirement row states the clause.
* **The judges and qa disagree on severity.** Four of the seven found misses (QA-453, 601, 701, 751) were judged Minor though qa rated them Major. Counting those four as true gives 49 of 124 (40%): still under half.
* **0 false from judges is itself unusual:** judge and reviewer are the same model, so shared blind spots are possible.
* One reviewer run per PR; no repeat, so no spread. High effort (hook), not the medium asked for. S04, S05 and S12 had no requirement rows.
* 13 PRs carry the 14 misses, so the sample is 13 + 15.
* Blindness: tool calls were scanned for outside paths. One case (S13) wrote a temporary file under `/tmp/claude`; none read another path or git.

## What follows
* Use the checklist as finder, with a severity gate: only a claim tied to a clause of this PR's own row, reachable in the running app, blocks; the rest go to one list.
* The five Minor-only misses show the same thing from the other side: the reviewer saw them and underrated them. Severity rules matter more than finding more.
* Arm 2's bar stays as fixed: at least 4 of 14, half true, and at least 2 found that arm 1 did not. Arm 1 leaves 7 not found at Major.
* Judging cost: about 1.89 million context tokens (8 claim judges and 1 matcher, as the app reported).
