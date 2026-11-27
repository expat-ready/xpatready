# Lab replan from first principles (A444, A445; 27 Nov 2026)

Lead 7, 18:2x IST 27 Nov. Evidence: `lab-replan-2026-11-27-flow.md` (every lab PR's timeline today, read-only Opus measurement, 18:10 IST) and `lab-replan-2026-11-27-triage.md` (every Intended row classed against its Done-when, read-only Opus analysis of origin/main 20918e64c). The founder's words: `history/STATE-2026-11-27-1805-lead7-A444-A445-rows.md`.

## The first principle we lost
A change is done when it is on `main` and proven, so speed is **flow**: how long work waits, not how fast it is written (Lean, Theory of Constraints, DORA lead time). Today the lab PRs were open **99 PR-hours**, and their CI ran only **9.6 h** of that. **About 90% of the time was waiting, not working.** Merged lab PRs took a median 2.6 h from open to merge, and a median 141 min from Approve to merge.

The second loss was scope. P-847's restart condition is **"the lab must-haves merged and proven"**. But the progress line and the 23:00 plan counted all 137 rows as one target. 110 rows are still Intended, and only 27 of them are must-haves.

## Where the 99 hours went (measured, lab PRs today)
| Wait | Hours | Root cause (five whys in the flow page) | Fix, no gate lowered |
|---|---|---|---|
| Waiting on the Lead | 29.5 | Lead reads queued behind other work. The 14:11 notes were not in the gate's exact form, so every read was done twice. Five Lead hand-overs in one day. | Owed reads first at every 10-min check, always the exact line `Lead read the diff: <full sha>`; HOLD notes go below it. Fewer hand-overs: a Lead's start read stays small. |
| Merge queue | 17.4 | One `pipeline` batch at a time (~32 min each, 91% busy). Main-fix PRs had no priority (#3925 waited 60 min, #3944 62 min). 5 of 30 batches failed. | A Mergify priority rule for P-214 main-fix PRs, with the same conditions. Culprits go back to their lane with the failed parts. |
| Red main or red `fast` | 13.3 | Three red causes stacked, all from the tooling route (#3908, 12:47): an inherited `S` (fixed by #3925), guard row 6 (#3944), zsh missing (#3953). The log showed only the last 20 lines, so each cause was found one at a time. Root of guard row 6: #3924 merged with its own `guards part 3/4` red, because the `pipeline` queue rule requires only `ci`. | #3953: the log names every FAIL line and the runner gets zsh. Then `guards` becomes required in the pipeline queue rule (this raises a gate), after #3918 splits guards into 6 parts. |
| guards part 1/4 time-outs | 11.9 | The part outgrew 45 min (14 time-outs today). | #3918, guards in 6 parts (labelled; lands after #3953). |
| Idle after Approve | 10.4 | Nobody owned the next step (e.g. #3904's full run was never started after its failed batch). | Each check: every approved PR has an owner and a next step, or a label. |
| Rework after merging main | 1.0 | Hot file `check-guards.sh` (conflicts on #3902, #3910, #3926). | #3833 (OS-85, rows per file in guards.d), class A. |

## The replan
1. **Count honestly.** Rows that merged meet their Done-when and are marked Built: LR-001, 079, 103, 101 and 129 (68879e04c on the records branch). LR-151 stays Intended until its own condition is met.
2. **Clear the reds first, in order.** #3953, then the five PRs it frees (`fast` re-run only, no new commits): #3910 #3918 #3920 #3923 #3926. Then `guards` becomes required in the pipeline rule.
3. **Must-haves only before product restarts: 27 class A rows.** The bundles and their order are in the triage page §3:
   * Founder steps: LR-063 second owner, LR-057 runner setting, LR-144, and the yes for LR-072.
   * The open PRs land in order: #3833, then #3814 and #3825, then #3843 (1,787 lines: split it, or a size exception).
   * Then in parallel, on separate files: A1 hooks fail closed · A3 PR rules · A4 review · A5 safety checks · A6 baseline and observe mode · A7 private split PS-1c · A8 dependencies.
   * A2 guards after #3843; A9 workflow sweep after the bundles that touch workflows; A10 the switch (LR-072) last.
4. **52 class B rows run after the restart,** alongside product. **31 class C rows are deferred or dropped,** each with a reason: superseded by the private split, a duplicate, over-engineering, or a folder move the founder deferred.
5. **The working rules that stop the waiting:** reads first; one priority lane for main fixes; every approved PR has an owner; no PR merges with any red part; a Lead hands over at most twice a day.

## Forecast (estimate, from today's measured rates; reset each morning, P-614)
* If #3953 lands tonight and reads are taken first, the open must-have PRs can land by about midday 28 Nov, and the parallel bundles about 28 Nov night.
* **Class A Built: about 29 Nov morning; Proven (packs and walks): about 29 Nov evening.**
* LR-110 needs **7 green nightlies**. Done strictly, that pushes the restart to about 4-5 Dec.
* Release 1 stays 12 Dec, with the re-decision on 1 Dec (P-609).

## One decision for the founder
**Product restarts when the 27 class A rows are Built and Proven, with LR-110's 7-night streak continuing after the restart instead of blocking it.** That is the recommendation. It matches P-847 ("must-haves merged and proven"). The nightly still has to stay green, and a red night stops product merges until it is fixed.

The alternative is to hold product until all 7 nights are green (about 4-5 Dec). That takes about 5 working days out of the 12 Dec release.
