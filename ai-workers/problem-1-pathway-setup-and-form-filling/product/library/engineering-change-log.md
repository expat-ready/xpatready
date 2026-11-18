# Engineering Change Log
Version: 1.1
Updated 17 Nov 2026 · owner: the tech lead · status: living master

One row per change to the engineering set-up: when, what, where, who, the approval, how to check it and how to undo it. Newest last. Board Library row: "Engineering change log".

## Change log
| Version | Date (IST) | Change |
|---|---|---|
| 1.0 | 17 Nov 2026 | First master (public-safety review applied), assembled from the engineering set-up change log of 17 Nov 2026 (rows C1-C16) |
| 1.1 | 17 Nov 2026 | C17 added (private home for backups, P-678). |
| 1.2 | 18 Nov 2026 | C20-C24 added (the org move, P-692). |

**Rules for this log.** Times are IST from the clock. Approvals name the decision row, or "founder card" when no row number was given. Money is shown only as public list prices of plans. Known gaps are tracked privately by the tech lead.

| # | When (IST) | Change | Where | Done by (role) | Approval | Check | Undo |
|---|---|---|---|---|---|---|---|
| C1 | 17 Nov 10:3x | 22 finished sessions archived (21 cloud, 1 Mac) | claude.ai/code, Claude app | setup agent | founder card | Archived list | Unarchive each (list in the step 1 notes) |
| C2 | 17 Nov 10:4x | Plan changed: GitHub Enterprise account created for the project (list price) | GitHub account settings | setup agent with the founder | founder cards (P-656..P-661) | Enterprise page | Delete the enterprise while it holds nothing |
| C3 | 17 Nov 10:5x | Plan changed: paid GitHub Enterprise (list price) | Billing | the founder | P-656..P-660 | Billing overview | Cancel at the end of the cycle |
| C4 | 17 Nov 11:0x | A pending GitHub Pro downgrade to Free was cancelled; Pro (list price US$4 a month) continues | github.com/settings/billing/licensing | setup agent | founder card | Licensing page shows no pending downgrade | "Downgrade to Free" on the same page |
| C5 | 17 Nov 11:05 | Project organization created inside the enterprise | the new organization | setup agent | founder card (organization name) | the organization page (plan: enterprise) | Organization settings > Delete (while empty) |
| C6 | 17 Nov 11:0x | Founder's organization membership set to Public | organization > People | setup agent | checklist item P3g in the approved plan | the organization's public members page | People > visibility Private |
| C7 | 17 Nov 11:09 | Repository Actions variable REVIEWERS set to the founder's account | the project repository > Settings > Variables | founder | founder card | GET actions/variables/REVIEWERS | Delete the variable |
| C8 | 17 Nov 11:1x-11:48 | Founder's Mac user settings (`~/.claude/settings.json`, lines 94 and 101): the repository path now names both the old and the new address (once per line) | founder's Mac, user settings | founder (Terminal) | founder card (then a fix script) | grep "moving on 18 Nov 2026" = 2; valid JSON | Restore `~/.claude/settings.json.bak-2026-11-17` |
| C9 | 17 Nov 11:18 | GitHub Apps installed on the organization (details tracked privately) | organization settings | setup agent | founder card | the organization's app list | Uninstall from the organization settings |
| C10 | 17 Nov 11:48 | Mac copy `.claude/settings.json`: 36 deny lines added (operating model section 5a), 39 -> 75 | Mac copy (tracked file, unstaged on the tech lead's branch) | founder (Terminal, fix script) | founder card (batch yes as recommended; T7) | deny count 75; all 36 present | Restore `.claude/settings.json.bak-2026-11-17` or remove the lines; revert the settings PR |
| C11 | 17 Nov ~11:4x (open) | `.mergify.yml`: new first queue `verdicts` (records + title `^qa:` + `qa/CAPABILITIES.md` changed); `product` and `records` unchanged; `check-queue-rules.py` cases | PR #2073 (head 1b2f181), merges on green ci | the tech lead (agent in a scratch clone), independent reviewer Approve | P-664 | `python3 -I product/screens/B119/check-queue-rules.py .mergify.yml` exit 0 (58 passed); Mergify shows a `verdicts` queue | Revert the PR (git revert of its merge commit) |
| C12 | 17 Nov ~11:5x (open) | `.claude/settings.json` on main: C10's 36 deny lines, byte for byte, for every copy | PR #2075 (head ddd635e1), unlabelled until the founder has seen the diff | the tech lead | P-670 (T7) | deny count 75 in main's file | Revert the PR |
| C13 | 17 Nov 11:5x | A repository settings change under card T8; details tracked privately by the tech lead | the project repository > Settings | setup agent | T8 (founder card) | tracked privately | tracked privately |
| C14 | 17 Nov 11:5x | Dependabot malware alerts on (alerts only, no CI) | the project repository > Settings > Advanced Security | setup agent | T8 (founder card) | Toggle shows On | Toggle off |
| C15 | 17 Nov 11:5x | Cloud environment network allow-list updated (details tracked privately) | claude.ai cloud environment settings | setup agent | W2 (founder card) | environment settings | Revert the allow-list change |
| C16 | 17 Nov ~11:5x (merged 13:27, P-684) | Test `check_css1_index.ts`: CS-S1's own-PR diff assertion dropped (it failed every later PR changing api/src) | PR #2077 (head 91719a6) | the tech lead | P-214 check fix (standing) | The suite passes on PRs that change api/src | Revert the PR |
| C17 | 17 Nov 12:2x | Private repository for notes and backups created in the organization; side notes synced there by `product/tools/private-sync.sh` | the organization (private repository) | Lead 76 | P-678 "Private repo + Mac backup (Recommended)" | the repository is private; the sync prints the pushed commit | archive or delete the private repository (organization settings) |
| C18 | 17 Nov 13:4x | `product/tools/pr-ready.sh <PR>`: marks one draft PR ready, only when a "Reviewer: Approve <head sha>" line matches its head; it sends the single GraphQL mutation that the T7 deny line `Bash(gh api graphql*mutation*)` (C10/C12) blocks for agents in general | tech lead branch, then main | the tech lead | P-685 (founder card, "Yes, allow that script") | `bash pr-ready.sh <n>` on a ready PR prints "already ready" and changes nothing | delete the file |
| C19 | 17 Nov 13:4x (open) | pr-size passes records-only PRs (records-only.sh); decision-impact exempts tooling rows P-642 to P-686 less P-650/P-653; check-docs counts rule IDs in IDX-row parentheses as present; pr-ready.sh and private-sync.sh to main | PR #2086 | the tech lead (builder subagent) | P-686 (P-384) | records PRs #2058, #2071, #2085 pass pr-rules and ci | revert #2086 |
| C20 | 17 Nov 20:54 off · 18 Nov 13:0x on | queue-gate workflow disabled for the freeze (B2), then re-enabled after the move (E7) | repository Actions > queue-gate | the founder (off: the Lead's API disable was refused by a permission rule); the tech lead in the browser (on, founder "Yes, you click") | P-692; checklist B2/E7 | Actions shows queue-gate active; it posts `queue-fresh` on the next ci run | Actions > queue-gate > ⋯ > Disable / Enable workflow |
| C21 | 18 Nov 12:30 off · 13:0x on | label-guard workflow disabled just before the transfer (C1.4), then re-enabled (E7) | repository Actions > label-guard | the founder (off); the tech lead in the browser (on) | P-692; checklist C1.4/E7 | Actions shows label-guard active; the next Mergify merge passes it | as C20, for label-guard |
| C22 | 18 Nov 12:30 | Repository variable `CI_SHARD_RUNNER` deleted (C1.3; read back 404), so shard jobs run on `ubuntu-latest` until Namespace covers the org's repository | repository Settings > Variables > Actions | the founder | P-692; checklist C1.3, G6 | variables list shows REVIEWERS and SHARDS only (D2, 12:4x) | R5: recreate it with the value in the P8 record, after Namespace runs a test job (E12) |
| C23 | 18 Nov 12:31 | Repository transferred from the founder's personal account to the org (C2); local copies and the backup mirror re-pointed (C4) | GitHub, repository Settings > Danger Zone; the Mac's git config | the founder (transfer); the tech lead (re-point) | P-692; the Lead's go after two empty queue reads (09:07, 09:13) and the go/no-go (REST 3,284, githubstatus green) | E1: owner Organization, public, admin; the old URL answers 301 (E2); push accepted (E3); D1 apps list the repository; D2 variables, both rulesets, runners xr-mac and xr-mac-light Idle | Checklist F3: transfer back to the personal account (a 3-5 h freeze) |
| C24 | 18 Nov 13:0x | Mergify Merge Queue found already on for the repository in the org's Mergify account (Setup: nothing needs attention) | Mergify dashboard, org | the tech lead (read) | P-662(b); checklist R1 | Mergify Setup page; the next labelled PR batches | Mergify > repository > Merge Queue off |

**Decisions that change how the pipeline runs** (recorded by the tech lead, P-656..P-669):
* Enterprise instead of Team.
* Drain today; move on 18 Nov from 09:30 IST.
* T1: a ramp target with admission by queue wait.
* T5: qa verdict records first.
* T6: one full check after Approve.
* T10: builders on high effort.
* T13: rules v2.
* One batch yes: T9, T11, T12, T14, T16, T17, W1, W3-W6.
* T15: support contact, with the free reset as backup.
