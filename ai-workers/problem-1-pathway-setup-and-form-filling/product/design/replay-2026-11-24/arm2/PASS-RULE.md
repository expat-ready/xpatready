# Replay arm 2: proposed pass rule without severity (for the Lead to fix before any run)

Prepared for Lead 27, 24 Nov 2026. Nothing has been run against CodeAnt and nothing sent.

**On severity.** CodeAnt's command-line page does list severities, but they follow the kind of comment (`security` Critical; `bug` and `performance` Major; the rest Minor), not the harm. They are not a rating, so no rule below uses them. Arm 1 shows why that is right: its reviewer named 5 of the 14 misses only as Minors, and its judges disagreed with qa on 4 of the 7 it found.

## What is counted
* **Finding:** one distinct fault in one PR, whatever its label; repeats across slices count once. Style and wording remarks count as findings too.
* **Found:** a finding names the same wrong behaviour on the same code path as a known miss. Part matches count 0.
* **Real:** a judge shows an input or state that gives a wrong result in that code. Yes or no.
* **Blocks:** real, and (a) breaks a named clause of that PR's own requirement row, or lets a person see or do what they must not, or loses or corrupts stored data, or shows a person a false statement; and (b) reachable by a screen or route the running app has. Yes or no. This replaces Major.
* **New:** arm 1 names it nowhere for that PR, at any severity.

## Arm 1, read again without severity (from the matcher's fixed verdicts)

| | Rows | Count |
|---|---|---|
| Named in full | QA-397, 453, 520, 601, 701, 751, 770 (Major+); QA-499, 510, 517 (Minor) | 10 |
| Named in part | QA-526, 595, 608 | 3 |
| Not named | QA-750 | 1 |

So the old test, "at least 2 that arm 1 missed", now has **only four rows to win on** (526, 595, 608, 750). Kept alone it would nearly decide the result before the run. Hence rule 2's second path.

## The proposed bar: all four

| # | Rule | Why |
|---|---|---|
| 1 | **At least 5 of 14 found**, any label | One above the old bar of 4: without severity, matching is easier |
| 2 | **Worth adding:** at least 2 of QA-526, 595, 608, 750 found; **or** at least 6 new findings that block, in at least 4 different PRs | A second reviewer earns its place only by what the first does not see |
| 3 | **At least half of all findings real** | Same as before, over every finding, so many weak remarks cost it |
| 4 | **Reading load:** median at most 8 findings a PR, and at least 1 finding in 5 blocks | Replaces severity as the noise limit |

Pass: propose a small live trial (a new decision for the founder). Fail any: adopt the arm 1 checklist with the "blocks" test as its gate and stop. A run that did not finish all 41 slices is neither: report it as not done.

The numbers 5, 2, 6, 4, 8 and 1 in 5 are judgement, not derived from data; the Lead changes or fixes them before the run.

## Judging, the same for both arms
1. A fresh judge per 3 to 4 PRs, the tool's name and labels removed, findings reworded to one neutral line each by a separate step and shuffled with arm 1's for that PR.
2. Judges answer Real and Blocks separately, with file and line. A second fresh judge repeats one fifth, chosen by seed; under 80% agreement on Blocks means the result is reported as unsettled.
3. A matcher, who sees the known misses, decides Found; judges never see them.
4. Arm 1 is judged again by this rule (its 124 Major claims and its Minors), or its numbers cannot be compared. Cost, estimated from arm 1's judging (1.89 million tokens for 124 claims, high effort): about 3 to 4 million for both arms. **Cheaper:** judge only arm 2 and the PRs' overlaps, about 1.5 million; then rules 1, 3 and 4 hold but the two arms' precision is not comparable.

## Not equal between the arms
* Arm 1 had `requirement.md` and the checklist; CodeAnt has code only (C1 covers code, not records). Misses that need the clause (750, 751, 770) favour arm 1.
* Arm 1 read all slices of a PR in one context; CodeAnt sees one slice at a time, though it may open any file of the sample.
* CodeAnt's own filters may skip a file; a miss lost only to that is reported apart.
* One run each: no spread.
* The pass rule is written after arm 1's result was known, before arm 2's.
