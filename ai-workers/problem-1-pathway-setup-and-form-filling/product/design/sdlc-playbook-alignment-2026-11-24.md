# Are we aligned with Anthropic's AI-native SDLC playbook? (24 Nov 2026)

Founder ask, typed about 09:5x-10:0x IST 24 Nov in the ended Lead 17's chat (time not read from a log): "see whether we are completely aligned with it or not ... I don't want to force any changes just because ... there is a theoretical, but if you think ... this is really missing, this will help us in quality or speed or the solution quality of the capability features, then please go ahead and let's implement that. And you can send the report to um, currently" (the sentence stops there; read as the current Lead).
Author: Lead 17 (ended). Owner: the current Lead. Read with `delivery-five-2026-11-24.md` (A351) and `p702-evaluation-2026-11-24.md`.

## Answer
**Mostly aligned, not completely, and full alignment is not the goal.** Of the 12 plays: 6 aligned, 5 partly, 1 missing. The playbook is written for large, often regulated companies with a person reviewing each change; two of its parts (company-managed settings, deployment servers for the agent) do not fit us now.
**Only one new change is worth making (N1).** Three others are already ordered or approved and need finishing (N2 to N4). Everything else: no change.

## How it was checked
Readers read all 14 lessons (12 plays, opening, closing). I compared them with main at ba9327c44 by reading skills, agents, hook list, workflows, decisions and design files. Seven Claude Code docs pages were also read, some tails only as summaries.
Not checked: GitHub branch protection and the full permission list (my command that read them was refused; not retried). Where a row depends on them it says so. Nothing was run; alignment is by records and file contents, not by watching a lane work.

## The 12 plays

| # | Play | Ours | Result | Change? |
|---|---|---|---|---|
| 1 | Intent captured | Founder asks and DECISIONS rows, word for word; BACKLOG row | Aligned (other names) | No |
| 2 | Requirements and design | Requirements traced per row (P-604); screen-concept with fresh challenge | Aligned for screens | No |
| 3 | Plan first, reviewed before code | Builder writes the plan in the PR body, then builds. Nobody reads a backend plan first; plan mode not used | Partly | **N1** |
| 4 | Short CLAUDE.md | CLAUDE.md and AGENTS.md 14 lines each (about 4.6 KB); 15 path-scoped module cards. Commands sit in the `next` skill | Aligned | No; but see N4 |
| 5 | Skills, with checks behind must-hold rules | 12 skills, each under 75 lines (guide: 500); hooks and CI enforce. 94 of about 151 register rows still say "prose" | Aligned; enforcement partly | No: P-772 owns it |
| 6 | Parallel sessions | Own worktree and branch per builder, touch lists, separate reviewer and breaker. Playbook: start with 2-3 sessions per person, add only while review keeps up | Aligned in method, above its scale | No new one: A1 and the cap of 8 |
| 7 | Feedback loop | One command with an exit code, walk by screens, qa, independent re-run. Missing: failing test first on fixes, protection of tests | Partly | **N2** |
| 8 | Evals of our own agent rules | None found. 36 commits touched skills, agents, CLAUDE or AGENTS in 14 days. Plan items #77 and #219, waiting | Missing | Not now (below) |
| 9 | AI review of every PR | Reviewer agent plus breaker, exact-head Approve, Lead's read on risky paths. But the builder's own session starts the reviewer, and agents share one GitHub identity | Partly | Not now (below) |
| 10 | Hooks as approval gates | Merge, session-start, agent-model, check and stop hooks; deny list; reason in the block message | Aligned for a repository. Company-managed settings: not used, not verified | No |
| 11 | CI/CD and deployment | Image, CDK, synth tests, restore drill. No deploy workflow; rollback coded, not rehearsed | Partly | **N3** |
| 12 | Closing the loop on metrics | Scripted alarms without a model (heartbeat, SLE, flow). Production metrics wait for production | Partly (pipeline yes, product no) | No, after PF-8c |

Where we do more than the playbook: a batch-tested merge queue, a breaker, qa that re-proves after merge, database-level rules, values only from cited official sources.

## What to change

### N1. A short plan check before code, for risky backend rows (new; trial)
* **Why:** rework is our measured loss: 47% of app-code PRs went over two review rounds on 19-21 Nov, 62% were labelled more than once (P-702 evaluation; not re-measured). Screens have a challenge before build; backend rows do not. Late design findings cost a round and often a CI run.
* **What:** rows touching money, permissions, firm walls, schema or personal data, and not already covered by an approved concept: before the first code commit, the plan in the PR body names (1) files, (2) order, (3) the riskiest step and what could break, (4) the option rejected, (5) the test that would fail without the change. A fresh reader answers once, "Plan: go" or up to three points. No second round; no answer in 30 minutes means go. A changed plan is updated in the same push.
* **Limits:** new rows only, five of them; nothing in flight stops. Existing reviewers read it; no new session type, hook or CI check in the trial.
* **Done when:** five rows done; review rounds and open-to-merged time beside the last ten like rows. Keep if rounds fall by about a third with no slower total; else drop. Five rows show a direction, not proof.
* **Cost:** one reading per row, about 10-20 minutes (estimate).

### N2. Tests that cannot be gamed (already ordered: C1, C2)
* C2 is #3398; C1 is with Lead O 2. These are **CR-03 in `library/agent-failure-modes.md`**; close them against it, do not open a second list.
* The playbook adds one thing: for a bug fix, commit the failing test first, then fix without editing it. Put one line in the `next` skill at its next edit; C1 gives the evidence. Skill edits need the founder's typed turn if the sandbox refuses them.

### N3. Deploy and rollback (already ordered: D1, PF-8c)
The playbook adds: one identity and token per environment, staging automatic from main, production denied unless a person approved that version, rollback in one command, rehearsed. Check PF-8c's "Done when" has all five. Its example (roll back over 1% errors in five minutes) is a worked example; ours would be Sample. No MCP deployment servers: one workflow is enough for us.

### N4. Finish what is approved, before anything new
* **The linter (#76, P-668 T14, approved 17 Nov):** no eslint config on main. The playbook puts quick checks at edit time and heavy ones at the PR. Land it report-only, then make **B2's four patterns eslint rules where they fit** instead of a separate script. That removes work.
* **The Lead's copy runs old tools:** Lead 20's note says the lead branch is 6,060 commits behind main, so its checks and skills lag. The playbook's rule is that instructions are versioned and current. Lead O 2 is on it; it matters more than any new rule.
* **GitHub Action evaluation (P-729 (3), due 21 Nov):** no result found by text search. Finish it on paper, or mark it dropped.

## Not now, with the trigger that would change it
* **Evals (play 8).** 20-50 replayed tasks, on each rule change, need Claude run in CI with a key and a budget. We have no measure of their cost, and the playbook's own example lets a run edit the check scripts. Trigger: the first rule or skill change proved to have made results worse, or Release 1 done. Then begin with ten old rows, scheduled, outside PR checks.
* **An independent reviewer started by GitHub, and a separate agent identity (play 9).** It answers "the builder starts its own reviewer". It costs a key, per-review spend and public-repository safety work; a second account is the founder's decision (P-423). Trigger: P-729 (3)'s result, or a review found skipped or softened.
* **Plan mode as a tool setting; intent.md, spec.md, plan.md; REVIEW.md; managed settings; `@claude` on comments.** We already have the content under other names, or they need a company admin. Renaming gains nothing.

## Order and safety
One change a day where possible (P-702 evaluation, recommendation 5). N4's stale tools, then C2, C1 and the linter, then N1's trial on the next five risky rows, with PF-8c in its own place. No builder stops; no migration slot; nothing blocks a PR until the founder says so.
The Lead may reject any item with evidence; say which and why.
Review with A351 on 27 Nov, about 09:30 IST.

## Confidence
High: plays 3, 7, 8, 11 gaps (files read or absent). Medium: plays 5, 6, 10 (enforcement counted from the register's own text; branch protection unread). N1's gain is a hypothesis.
