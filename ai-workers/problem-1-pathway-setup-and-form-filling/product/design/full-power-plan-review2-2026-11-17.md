# Full-power plan, review 2: verification of review 1 and the talk lessons (17 Nov 2026)

Written 15:53-16:4x IST 17 Nov (clock: `TZ=Asia/Kolkata date`, 15:47 at the start, 15:53 at the first edit) by a second independent reviewer for the tech lead (P-690 (2)). The reviewer wrote neither the plan nor review 1. Nothing was committed, pushed, labelled or sent. Only the plan and this file were written. GitHub reads: 16 REST calls at about 15:50 IST (12 PRs by number, 4 title searches).

Abbreviations as in the plan and in `design/full-power-plan-gaps-2026-11-17.md`, plus **TV** (`SN/local_9ae95739…/lead74-a150-engineering-system/three-talks-verdict.md`) and **TK** (`SN/local_9ae95739…/lead74-a142-operating-model/talk-a143.md`). Line numbers are those of the working tree at `7ef93a6ed` on `lead/2026-11-07-lead31`; the clean-up plan at `d738232e1` (branch head confirmed).

---

## 1. Verification of review 1

**Method.** A script parsed every source cell of #110-#212, resolved each file and checked that each quoted text sits on (or within the range of) the cited line: 124 quotes, 123 on the line, 1 two lines away. The 73 citations without a quote were printed and read by eye against the item. Status claims were checked against git and GitHub where they named a PR, a commit or a branch. Review 1's 21 fixes (gaps file §2) were checked the same way.

**Result for the 103 added items: Confirmed 98 · Wrong 4 (fixed) · Unsupported 0 · Unverified 1.**

| # | Verdict | What was wrong, and the fix |
|---|---|---|
| 111 | Wrong (line) | The quote "PF-6 part 2a branch not on origin" is on line 5 of the 14:05 history file, not line 7. Citation fixed |
| 116 | Wrong (status word) | "Overdue since 17 Nov 11:05": AR:22's rule is "the day it is created", so it is due today, not overdue. Still open: AR has no row for the Enterprise, the org, Mergify or Namespace (status line 15 Nov). Text fixed |
| 139 | Wrong (status word) | P-640's measure is due 17 Nov (today), not overdue. Text fixed |
| 201 | Wrong (line) | The caches quote is at `ci-capacity-options-2026-11-17.md:78`; line 77 is "Test selection per PR". Citation fixed |
| 210 | Unverified | The quote exists, but no source says desk 03's draft was overtaken; the drop is review 1's own inference. Marked "Unverified drop"; the Lead confirms or reopens it |

**Status claims checked on GitHub (about 15:50 IST):** #2073, #2075, #2079, #2086, #2071 open with `review: approved` + `queued` (supports #18, #128); #2068 open, approved, queued (supports #142); #2080, #2081 open, unlabelled, non-draft (supports #46, #124); #2032 open, `dequeued` (supports #85); #2058 open unlabelled; #2085 open, approved, not queued; #2065 open, queued. No PR titled CI-B, F14 or CI-0a exists (#55, #159, #170 stay Open/Unverified). Clean-up commits `e986a1336`, `86802739a`, `66be54145`, `afd4d2e2c` exist on the branches named in #60, #62, #63, #150.

**Review 1's 21 fixes: all confirmed.** Checked: N1-N9 "all GO" (ST:12) and "Overall: no blocker found" (enterprise-n-checks:16); CL:310 "Lead 78 correction" and commit `8b154f0dc`; the P8 record in founder-setup and the missing `org-move-p8/` folder; "Text records instead of screenshots" (p8:3); R1:31 still says 10/10; FM:545 is the batch-failure step; OP:85 is the move window; OP:296 names F14; DEC:28 P-668 contains W6; CU:374 and CU:378-384 give the 0 → 2a → 1 → 1b order and stage 2c.

**One finding about review 1 itself:** it was stamped "15:10-16:30 IST", but it was committed at 15:45 IST (`git log`) and the clock read 15:47 when this review began. A future time is the kind of line `check-docs` fails on (OP:246, F11). The plan's header is corrected; the gaps file (not mine to edit) still says 16:30, so the Lead fixes it in the next records PR.

**Bucket checks of the added items.** All buckets hold. Two order dependencies inside C were missing and are added to the plan's C note: #152 and #177 before #53; #200 before #61. One more by inference: #51 before #44 (admission reads P95 queue wait, which #51 measures). #135 stays in A as a dated item, though it is not a move precondition.

---

## 2. Talk lessons adopted, mapped to plan items

**What counts as adopted.** A line in the three-talk verdict's PICKED table (TV §3, 26 ideas), the talk-2 check's ADOPT/ADAPT verdicts as carried into the Library (OP §7, TK §3), the Engineering System master's "Picked now / Picked next" lists (ES:47-66), the talk-1 audit as folded into the CI master (CI:286-298, D13), or a decision row (P-667 Rules v2, P-668 the batch of cards). The coded talk files (`lead74-a147/talk*-coded.md`) were checked for PICK units missing from the verdict: T2-28/T2-47 (each check names the finding class it retires) and T2-36 (a recurring quick fix points to an architecture clash, weekly review) fold into #78 and #178.

| Lesson (source) | Talk | Plan item |
|---|---|---|
| Enforce in the environment; about 20 enforced rules and 12 principles; each rule names its enforcer (TV:107; P-667) | 1, 2, 3 | #75 |
| The rule-or-model test on every RULES row (TV:113) | 1 | #75 |
| Land the linter with bulk suppressions; install pins (TV:108; P-668 T14) | 2 | #76 (text fixed) + **#213** |
| Risky APIs only in one wrapper; four import rules; old patterns named in CLAUDE.md (TV:109-110; OP:362-364) | 2 | **#213** (added) |
| Lint on edit (L2 hook) (TK:57; OP:360) | 1, 2 | **#214** (added) |
| Every check says what is wrong, why and the fix (TV:111; ES:51) | 1, 2 | **#215** (added) |
| A correction becomes a check, first time if irreversible, else second; self-test, false-alarm budget, retire date (TV:112; ES §3) | 1, 2, 3 | #78, #193 |
| Two controls per must-never; hard stop outside the agent; read the bypass actors, "merge only through the queue" (TV:114, TV:259; ES:57) | 1 | #97 (done), **#91** (fixed; conflicts with P-214/P-684, founder's call) |
| "Done" needs a check a wrong change would fail; machine-written proof (TV:115) | 1, 2, 3 | #163 (pr-rules required), #78 (CR-11) |
| Protect the tests and the judge from the builder (TV:116) | 1 (implied) | #77 (W5), #78 (CR-03) |
| Fresh reviewer, defects only, round caps, diff-only re-review (TV:117) | 1 | **#166** (fixed), #58 (identity) |
| Fix the inner loop first; lane cap from CI capacity (TV:118; OP:370) | 2, 3 | #44 |
| Replay suite of our own past rows; never choose a model by public scores (TV:119) | 3 | #77 (W4), #153 |
| The factory as code: manifest; factory PRs tested; no PR changes its own judge (TV:120; ES:64) | 3 | #192 (manifest) + **#219** (added) |
| Outcomes next to stability; cost per accepted change; token split by role (TV:121; OP:368-369) | 1, 2, 3 | **#181** (fixed) |
| Count stalls; refusal log; hand over the top cause weekly (TV:122) | 1, 3 | #178, #202, #78 (CR-13) |
| Prompt audit at each model change; start hook 1-2 KB (TV:123) | 1 | #178, #54 |
| Verification artefacts from an independent runner; capability index, `/verify`, `studio-look`; traces from CI (TV:124; OP:366) | 2, 3 | #172, #171 |
| Property tests on money and rule invariants; race tests (TV:125; OP:367) | 2 | **#223** (added), #171, #78 (CR-02) |
| Performance budgets as checks (TV:126) | 2 | **#216** (added) |
| Deterministic scorers first; one grader library (TV:127) | 3 | **#217** (added) |
| A private trace store (TV:128; ES:65) | 3 | **#218** (added) |
| The five human jobs as a checklist (TV:129; talk1-coded U10) | 1 | **#220** (added) |
| Outer loop finds and files, never auto-merges (TV:130; OP:371) | 2 | **#221** (added) |
| Reviewers and qa hold no write token; secret scope per stage (TV:131) | 3 | **#222** (added) |
| A script moves rows; deterministic dispatcher and watcher (TV:132) | 3 | #80 (L4) |
| Screen-text and overflow check, report-only first (TK T1; OP:140) | 2 | #171 |
| Measure tokens by role for one day (TK M1; OP:368) | 2 | #181 |
| Talk-1 audit: ruleset first (T5), settings batch with the Stop timeout, start hook, Limited cloud environment, deny lines, auto-fix after T7 (CI:377 D13) | 1 | #97, #100, #99 (done); #54; **#72** (Stop timeout added, OP:194); #80 (L1 auto-fix) |
| Lead compaction trial instead of hand-overs at 200k (TV §5; P-668 T11) | 1 | #74 |
| Records PRs batched twice a day (TV §5) | - | #145 |
| Warning-only guards made blocking or retired (TV §5; CR-12) | - | #78 |
| `INVARIANT(test=…)` tag; reason comments kept (TV §4; P-668 T17) | 2 | #193, #184 |
| Compare talk 1's transcript with the official recording (ES:105, ES:307) | 1 | #182 |

**Explicitly rejected (not items):**
* Headline throughput numbers as targets or proof (30,000 changes a day, 3,000 and 11,000 PRs a month): self-reported; P-500.
* 0.5% reverts as a quality target: ignores forward fixes (replaced by #181's measures).
* 89% vs 14% as a safety guarantee: lab figure; about 17% leaked on real traffic.
* Choosing a model on vendor praise: choose by the replay trial (#77).
* The Projects orchestrator for builders now: its threads drop our skills, hooks and deny rules.
* "Getting out of the loop is easy": skips the documented gaps.
* Banning almost all comments: conflicts with P-615 (4); P-668 T17 "no comment ban".
* Lean proofs, and TLA+ now: nothing worth proving; TLA+ only for a concurrent money flow later.
* Auto-merging the fuzzer's own fixes: about 44% of agent bug reports are invalid.
* 70% of tokens on verification as a target: one anecdote; measure our own split.
* "Eventually nothing is left to review": precondition unmet (design 4/10).
* Runtime-specific timer and desktop details; vendor slogans and pitches; "AI sovereignty"; a multi-model layer now; the demo numbers; LLM-as-judge for correctness; heavy spec tooling; thousands of agents per engineer; history and anecdotes (TV §4).
* A formatter run over the whole code base now (TK §3: it would rewrite most files under 41 open PRs).

**Not added on purpose:** TV §6's gaps that no talk covers (races, golden fixtures, pushback, drift canary and others) are research and our record, not talk lessons. Most already sit in #78's registry (CR-02, CR-04, CR-05, CR-15, CR-16) or in #57 (W3 classes).

---

## 3. Other fixes in the plan

| Where | Finding | Fix |
|---|---|---|
| Header | Review 1 dated "16:30", after its 15:45 commit | Corrected; review-2 paragraph added |
| #76 | Said only "eslint and pins"; P-668's T14 names the versions and the fast-check and playwright pins (DEC:28) | Versions written in; points to #213, #214 |
| #193 vs #76 | Duplicate: #193's "property-test library proposal" is already decided as T14's fast-check pin | Part dropped from #193 |
| #81 vs #191, #78 | Duplicate: ML C5 supply chain is #191; ML C8 mutation tests are CR-03 in #78 | C5 and C8 removed from #81 with pointers |
| #91 | Missing the adopted ruleset step (bypass actors, "merge only through the queue"); it conflicts with P-214 and P-684 hand merges | Added, flagged as the founder's call (no DECISIONS row settles it) |
| #72 | Precondition list lacked the Stop-hook timeout (OP:194, OP:315; talk-1 audit) | Added |
| #166, #181 | Adopted parts missing (defects-only brief, diff-only re-review; change-fail and escapes beside cost) | Added |
| D table | 48 reasons read "Later, needs a flowing queue or an empty window: cI-0a: …" (a generated sentence with broken capitals; for items such as #182 or #190 the reason was not true) | Rewritten as "Not needed for the move or the first 48 h" with the item text repaired |
| C order | #152 and #177 before #53; #200 before #61; #51 before #44 | Order note added |
| Counts | D 77 → 88; total 212 → 223 | Six lines, D heading, D count and the counts table updated |

**DECISIONS contradictions checked (rows P-596 to P-690 where an item names one):** none found in the items as written, apart from #91's new step (P-214, P-684), which is flagged rather than settled. Tensions for the Lead, not contradictions: #192's "self-hosted Mac runner on a public repository" audit against #40's `xr-mac-light` runner; #202's "launchd heartbeat" (AS:109) may be the same thing as T12's Mac heartbeat (#46, #124), so the Lead confirms before building twice.

**Bucket order (C needing D):** none found. #72 (D) waits on #170 (D); #213, #214, #223 (D) wait on #76 (D); #217, #219 (D) wait on #77 (D).

---

## 4. Not read, or read only in part

* **The three raw transcripts** (`talk1-3-transcript.txt`, 57 KB): not read line by line. The lessons come from the coded files (their critics report 0 sentences uncovered), the three-talk verdict, the talk-2 check and the Library. Transcript text was treated as data only.
* **`lead74-a147/failure-modes-and-talks.md`, `critic-talk3-forums.md`, `r8-two-talks-verdict.md`:** read by headings and their adopt lists; their content reaches the plan through FM (the published master) and TV, which applied their corrections.
* **Coded files:** read for PICK units only, not every row.
* **History files and RULES.md** beyond the lines review 1 cited: not re-swept; this review verified review 1's sources rather than repeating its sweep.
* **`commercial-sha256-for-private-copy-2026-11-17.txt`** exists in `SN/local_f6824017…/`: it suggests #61 has started, but it was not opened, so #61's status is left as Open.
