# REVIEW.md: how a code review runs here

Read by every reviewer, human or agent, before it reviews a pull request. Its aim: a review ends in **at most two rounds**
with a clear verdict, and every finding says how much it matters. Tool-specific steps (screens, journeys) live in the
reviewer's own skill; this page wins where they differ on severity, rounds or stopping.

## 1. What a review checks
* **The diff, against what it claims.** The PR's "Done when" lines: is each proved by a named test that would fail
  without the change? Logic errors, wrong data, missing authorisation, unsafe migrations, races, secrets, a weakened check.
* **The house rules** the diff touches (the repository's `AGENTS.md`, `CLAUDE.md` and the standards they point to).
* **Evidence, not taste.** Every finding names `file:line` (or a command and its output) and the fix.

## 2. What it skips
Lockfiles, generated files, snapshots, records and history files, and anything a CI check already enforces (format,
lint, types, guards, size limits). New scope is never a finding; "I would have written it differently" is not either.

## 3. Severity: every finding carries one tag
| Tag | Means | Blocks Approve? |
|---|---|---|
| **Important** | A bug the change adds or makes worse, a broken rule, a claim the tests do not prove. (Blocker and Major in older words; Must in the screen skill.) | Yes, until fixed or resolved (§5) |
| **Nit** | Small and safe to leave: naming, wording, a cleaner form. **At most 3** per review; drop the rest. (Minor; Should.) | No |
| **Pre-existing** | A real bug the diff did not cause. Logged for a later row, never fixed in this PR. | No |

Each finding also names its **bug class** in two or three words (for example "missing auth check", "off-by-one",
"unescaped input", "test proves nothing"), so the same class can be found elsewhere. On a **fix PR**, say whether the
change fixes the root cause or only the symptom.

## 4. The summary and the verdict
* The summary's first line is the count: `N Important, N Nit, N Pre-existing`.
* **Never repeat a finding**: one entry per cause, however many lines show it; a finding already raised in an earlier
  round is referred to by its number, not written again.
* Verdict, last line: `Reviewer: <Approve|Changes|Block> <full head SHA>`. Approve = no open Important. Changes = open
  Important findings with clear fixes. Block = the approach is wrong, or the PR cannot be judged (does not build, no tests).

## 5. Risky pull requests
A PR that touches money, permissions or sign-in, the database schema or a migration, CI workflows or merge rules is
risky. On a risky PR every Important finding is **fixed, or resolved with a one-line reason** the reviewer accepts,
before Approve. (No repository-wide "require conversation resolution": too tight for the rest.)

## 6. Rounds and when to stop
1. **Round 1:** the full review on the exact head commit.
2. **Round 2: diff only.** Read only the commits since the SHA round 1 reviewed (`git diff <reviewed-sha>..HEAD`), and
   check that each round-1 Important is fixed. A new finding in round 2 must sit in that diff; nothing from the
   untouched code is raised again or newly.
3. **Stop.** After round 2 the verdict is Approve or Block (an Important still open after round 2 is a Block, and the
   tech lead decides). A third round only with the tech lead's written `Lead allows round 3:` line; otherwise the tech
   lead chooses a fresh reviewer. Never an Approve without a review of the current head.
* A push after Approve gets a diff-only review of that push; if two rounds are used, it is round 3 and needs the tech
  lead's line. A pure merge of the main branch that touches none of the PR's files keeps the approval.

## 7. The builder's side
A brief carries `Done when` (the test that proves it) and a stop rule (`stop after N tries`; a check refuses a brief
without one), and the PR repeats them; the builder fixes
every Important with a failing test first, answers each finding once (fixed in `<sha>`, or the one-line reason), and
asks for round 2 only when all are answered.

## 8. The reviewer is tested too
When this page, the reviewer agent or skill, its tools or its model change, the change's PR runs the reviewer test set
(our own shipped bugs, `ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/reviewer-eval.py`: pilot 2 cases, then the rest) and adds its line to
`reviewer-test-runs.md` beside it. One 16-case run is noisy (at 3 of 16, an unchanged reviewer scores 2 or fewer about
40% of the time), so the rate is reported, not judged: a finding on that PR is a case caught in the last run that is
now missed and stays missed on a rerun of that case. The scorer reads free text, so each run's score is checked by hand against the
answers before it is recorded, as the first run was.
