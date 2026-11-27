# Lab lane "automation-measures": every audit row replaced or kept, with the reason (27 Nov 2026)

**Lane:** lab lane automation-measures, cloud, Opus 5.5 medium (P-788). Product paused (P-847). Founder approved the audit changes on 27 Nov (A420).

**Sources:**
- `design/software-factory-2026-11-27.html`, sections Deep audit, Still by hand, Measures, Inconsistencies found, Target.
- `design/os-manual-enforcement-2026-11-26.md`.
- Claude Code docs, read 27 Nov 2026: sub-agents, skills, settings, hooks, web-scheduled-tasks, github-actions, claude-code-on-the-web. Quotes are as read through the fetch tool; the Lead re-checks the wording on the live page before quoting it further.

**dora.dev** did not resolve from the cloud container (ENOTFOUND, 27 Nov). The DORA names below are the audit's own five; the Lead checks the definitions on dora.dev from the Mac.

**PRs:**
- #3896: one model rule.
- The measures PR: qa after merge, measures, OS P1. It holds this file.

Verdicts: **replaced** means the built-in Claude Code, GitHub or Mergify feature now does it. **kept** means our own part stays, with the reason. **owed** means it needs someone outside this lane, who is named.

## 1. Deep audit rows

| Audit row | Verdict | Why (docs quote where one decides it) |
|---|---|---|
| Requirement names: about 14 ID schemes | kept (clean-up lane) | A naming and records change, not a built-in feature. It belongs to the lab's clean-up lane (repo clean-up phases 4-5), not this lane. |
| What the builder reads: one task spec | kept (clean-up lane) | Same: one generated task spec per row is clean-up phase 4 ("one rules page generated from the decisions"). No Claude Code feature generates it. |
| Design step → plan mode | kept (no code change) | Plan mode is a session mode the builder chooses at DESIGN. The screen-concept skill can say "design in plan mode", but product design is paused (P-847) and no screen is in design. It is re-opened when design resumes; nothing to enforce now. |
| Build cycle → saved workflows, `/goal` | kept, trial owed | The audit asks for "Trial one saved build workflow on 3 tasks; measure against today". A trial needs 3 builder rows, and product is paused (P-847). The measures below are the "today" side of that comparison. |
| Running and checking the app → bundled `/run`, `/verify` | kept (our journey tests) | Docs (skills): "`/verify` ... Build and run your app to confirm a code change does what it should, without falling back to tests or type checks"; "When a session starts with a skill named `verify` ... Claude Code's commit instructions tell Claude to run it right before each commit". This is OS-72's phase-1 trial, owned there. Our journey tests stay as the product's proof (the audit's own words). |
| Reviewer and breaker on Opus | kept | Audit: "keep ours". Their model and effort now follow the one rule (#3896): `model: opus`, `effort: medium`. Docs (sub-agents): "`effort` ... Overrides the session effort level". |
| Label, label guard, queue gate → GitHub approval and Claude Approvals | kept until step 5 | Blocked on the machine user and on Approvals' Connect (audit Target, steps 4-5). Replacing them before an approver exists "every merge stops" (audit). |
| Red PRs, conflicts, quiet lanes → auto-fix now | **replaced** | `/next` step 5 now subscribes the builder to its PR's activity after the label. In a cloud lane that is `subscribe_pr_activity`; on the Mac, `/autofix-pr`. A red check or a review comment wakes the lane, instead of the Lead's 30-minute look. Docs (claude-code-on-the-web, Auto-fix): "Claude subscribes to GitHub activity on the PR, and when a check fails or a reviewer leaves a comment, Claude investigates and pushes a fix if one is clear." PR Steward stays later, as the audit says (after the shared environment is proven). |
| Merge queue: Mergify | kept | Audit: "Mergify (GitHub's queue is less capable for us)". No change. |
| CI test parts and nightly | kept | Audit: "keep ours". No change. |
| qa after each merge → scheduled task | **replaced** | Scheduled task "qa after merge" (`ops/qa-after-merge-task.md`), whose first step is `tools/qa-due.sh`. Hourly now; the GitHub trigger is owed from the Lead (web only). Docs (web-scheduled-tasks): "GitHub: run automatically in response to repository events such as pull requests"; "A GitHub trigger starts a new session automatically when a matching event occurs". Why not a GitHub Actions workflow calling `/fire`: the token is made only on the web, a repository secret cannot be set from a lane, and "The `/fire` endpoint ships under the `experimental-cc-routine-2026-04-01` beta header". Why not `claude-code-action`: it would need the founder's subscription token as a repository secret (docs: "`CLAUDE_CODE_OAUTH_TOKEN` ... Generate one by running `claude setup-token` locally"), which is a new secret on a public repository, and a qa round runs far longer than a CI job. |
| Rules and decisions | kept (clean-up lane) | Clean-up phase 4. |
| Hooks and guards; a Stop hook running the task's Done-when | kept, Stop hook not added | A "Done when" is free text in a PR body. Running it from a Stop hook means executing text anyone with comment access can edit, and most Done-whens name CI runs that a local Stop cannot wait for. `stop-check.sh` stays. Docs (hooks): Stop "`decision` | `\"block\"` prevents Claude from stopping"; an 8-in-a-row block cap applies. |
| Lead's 30-minute check | kept, shrinking | It shrinks by the rows replaced here (auto-fix wakes lanes, qa starts itself, model drift is a CI failure, stale tools are an ACT line). Not replaced: no feature reads risky diffs for the Lead. |
| Lead hand-over and standbys | kept | Audit: "No product feature covers it". |
| Model and effort rules | **replaced** (#3896) | `.claude/settings.json` `"model": "opus"`, `"effortLevel": "medium"`. Docs (settings): `model` "Set the model every new session uses"; `effortLevel` "Set a default effort level". Cloud: "Commit a setting there to apply it in those sessions". Agent files, skills, WAY-OF-WORKING and both hooks now agree. `model-rule-check.py` in pr-rules fails on any disagreement. |
| Security checks | kept (Ship + security lane) | Owned by the lab's Claude Ship + security lane. |
| Deep review at gates: `/code-review ultra` | kept, not run | Paid (US$5-25 a run per the audit); no paid AI runs in this lane. It is for milestone gates only, by the founder's money rule. |

## 2. "Still by hand" rows

| Step | Verdict | Why |
|---|---|---|
| Reading money, permission, schema and pipeline changes (Lead) | kept | A second approver needs the machine user (audit step 4). `lead-read.yml` and the queue gate's read-after (P-823) already enforce *which* PRs wait for the read. |
| Labels, "ready for review", reopen (Lead, browser) | kept until step 5 | Same as the label row above. The queue gate already labels a PR that needs no read (B194). |
| Restarting quiet or stuck lanes (Lead, every 30 min) | **partly replaced** | Auto-fix subscriptions (above) wake a lane on its own red check or review comment. A lane quiet for other reasons is still the Lead's. |
| Lead hand-over and standbys | kept | Deliberate (audit). |
| Account switches | kept | Deliberate (audit). |
| Product decisions, money, new technology | kept | Deliberate (audit). |

## 3. Inconsistencies found

| Item | Done |
|---|---|
| Models: P-788 says Opus medium, but agent files, `agent-model-guard.sh` and pr-rules said Opus high | Fixed in #3896, and checked on every PR. |
| Strategy desk: high in the skill, medium in WAY-OF-WORKING (and Fable) | Both now say Opus 5.5 medium (#3896). A "Question for the tech lead" there asks whether the founder wants a named exception. |
| STATE on main last updated 22 Nov | The Lead's records (#3895). Not this lane's to edit (OS-31). |
| About 60 rules enforced only by hand | The five P1 rows are below. The rest stay with os-backlog. |
| A dozen old PRs dequeued with no owner | Clean-up lane. |

## 4. OS P1 manual items (os-manual-enforcement, section (a))

| OS row | Verdict | Enforced by |
|---|---|---|
| OS-01: pr-suites green on the head before the label or queue | already enforced on main | P-822 (25 Nov): `queue-gate.sh` refuses the label unless `pr-suites` is "success" on that exact head, and `label-guard.sh` takes a label off a head whose pr-suites is not green. Tests: `check-queue-gate.sh`, `check-label-guard.sh`. The row's status "Doing (OS-3)" is stale. |
| OS-11: the Lead runs main's tools, not a branch copy | **enforced here** | `tools/tools-on-main.sh` runs in `lead-watch.sh` step 1d after its fetch. One ACT line names the differing files and how far HEAD is behind. Test: `check-tools-on-main.sh`. |
| OS-02: auto-label migration, money and route PRs after Approve and green ci | already enforced on main | P-823: a read-after PR (money, an additive migration, a public route) is labelled by the queue gate like any other; the Lead reads after (`after-read-owed.sh` lists it). Paths that keep the Lead's read *first* (.github/, .mergify.yml, guards, schema drops) stay by design (P-423), until step 5's approver exists. |
| OS-05: a bot writes "Batch failures covered" and requeues | not enforced: ruling owed | The queue gate already starts the full run by itself after a failed batch (B206). The line itself is a judgement P-731 (4) gives to a person ("a comment line by someone with write access"). Letting a bot write it changes P-731, which is the founder's ruling to make (os-manual: "Blocked (P-731 ruling owed)"). Asked as a "Question for the tech lead" on the measures PR. |
| OS-78 (a): comment-triggered workflows skip comments without their words | already true on main, now **checked** | All four `issue_comment` workflows (comment-run, lead-read, queue-gate, review-rounds) filter at the job on the comment's text. `tools/comment-filter-check.py`, run in pr-rules, fails a new one that does not. Test: `check-comment-filter.sh`. |

## 5. Measures (the 7-day baseline)

`tools/measures.py` reads git, qa/CAPABILITIES.md, cockpit/usage-log.tsv and the runs API only. `.github/workflows/measures.yml` writes the daily line at 07:07 IST to the run summary and a 90-day artifact. Definitions are in the script's header.

First reading, 27 Nov 11:35 IST, 7 days, main fc05179d6:

```
1 deployment frequency   604 merges to main = 86.3/day; app code 251 = 35.9/day
2 lead time for changes  median 2.8 h, p90 23.5 h (first commit → merge, 604 PRs)
3 change fail rate       0% (1 failures / 251 app-code deployments)
    - R1.53 Works → Partial: 24 Nov 16:14 IST → 25 Nov 08:07 IST
4 recovery time          median 15.9 h (1 recovered, 0 open)
5 deployment rework rate 19% (116 of 604 merges were fixes or reverts)
works                    48 newly Works (6.9/day; target 10/day), net +48, now 67 of 110
tokens per capability    unreadable (cockpit/usage-log.tsv has no reading in the window; last 15 Nov 22:04 IST)
deploy job               demo-update.yml on main: cancelled 145, failure 86, success 373
```

How to read these numbers:
- **Change fail rate:** a failure is a revert or a capability qa saw regress on main. qa's after-merge regressions recorded only in prose ("regressions R1.24, R1.42, R1.50", 26 Nov) count only where the row's status in CAPABILITIES.md changed.
- **Tokens per proven capability:** unreadable until the Lead logs weekly-plan readings again (`tools/usage-log.sh <pct> <account>` after each `get_usage`). The script will not guess.
- **Deploy job failures (86):** demo-update runs on the Mac's runner. They are listed apart from the change fail rate, because a failed runner is not a failed change.
