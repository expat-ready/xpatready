# Running while the founder is away (A129; Lead 69, 21:5x IST 16 Nov 2026)

The founder (21:5x IST 16 Nov): "whenever I go away ... the entire progress gets stalled"; "read Claude documents that how to ... create the agentic Claude AI agents so that they can run for autonomous job longer"; "browser ... computer skills like a human ... take those approvals ... pre-approvals".

## 1. Why work stalls (tonight's evidence)
| Stall | Evidence 16 Nov | Cause |
|---|---|---|
| New lanes wait for a founder-typed turn | 14 builder lanes and 2 Lead seats waited for "Yes, start both" / "Yes, start them"; each cloud card waited for his click | The desktop app starts sessions only in a turn the human typed; a cron or session-message turn only leaves a card (observed behaviour; the docs do not state it) |
| Self-approval refused | #1990: the Lead's own Approve on a check change was refused by the safety classifier and waited for his word | By design: auto mode blocks "approving Claude's own pull request, or disabling CI checks"; "Claude's own judgment that a condition was met does not lift it" (code.claude.com/docs/en/permission-modes.md) |
| Questions the records already answered | GitHub Pro asked again (P-282 bought it 2 Nov) | The fact was not on RULES.md (the start read); fixed 21:4x (Account facts line) |
| Test machines | approved PRs waited ~90 min; 14-28 runs queued | Pro's 40 concurrent jobs; ~8 jobs per PR (B199 part 2 cuts it) |
| Idle cloud lanes | cloud lanes ignore messages when idle | "Cloud sessions stop after a period of inactivity and the session's VM is reclaimed" (claude-code-on-the-web.md) |

**Not used:** the browser or computer control to click the app's own approval prompts or start cards. Those prompts are the oversight; clicking them for ourselves would get around them, whatever the pre-approval. The fixes below remove the need for the click instead.

## 2. The fix, in order (what the founder does once)
1. **A scheduled cloud task, "lane starter" (removes stall 1).** Cloud scheduled tasks "keep working when your laptop is closed"; each run is "a full Claude Code cloud session" that clones the repo fresh; minimum cadence 1 hour; up to 100 runs an hour per account (code.claude.com/docs/en/routines.md, scheduled-tasks.md). **Founder once:** at claude.ai/code → Routines, create one task on this repository (Default environment), hourly, with the prompt the Lead gives (it reads `design/lane-start-queue-*.md` and the Build Leads' and Prove Lead's start lines, takes the next queued row, runs `/next <area> <row>` or `/qa capability <row>`, and marks the row started in its own records branch). The Lead tests one run and reads its log; whether `/next` expands in a scheduled prompt is to be tested. Several tasks (for example 6 builder slots and 2 qa slots) give parallel lanes; each run is one row.
2. **A separate reviewer identity (removes stall 2).** The docs' fix for self-approval is "an approval from a distinct identity": a second GitHub account or GitHub App for the Opus reviewer, whose approval is the required review in Mergify's rule, so the Lead never labels its own records or check changes. **Founder once:** create the account or App and add it to the repository variable REVIEWERS (the queue gate already reads it, B194).
3. **Facts before asks (stall 3):** the Account facts line atop RULES.md; the Lead searches DECISIONS by keyword before any ask that involves money or accounts (memory: github-account-facts).
4. **Fewer jobs per PR (stall 4):** B199 part 2 (about 26 test parts per batch); own runners at the private switch (P-589); or a GitHub Support request to raise the limit.
5. **Hourly wake of stalled cloud lanes:** the lane starter's run also lists idle lanes with work left, and re-runs their next step as a fresh session from their branch (state lives in the repo, AGENTS rule 10).

## 3. What stays with the founder
Purchases, accounts and keys (P-551), immigration facts that official sources do not settle, money above the caps, and the account reset near 98% (P-643). Everything else runs on the requirements and the decision markers (best in class, quality, competitor analysis, frameworks; P-486, P-628).

## Sources
Research by a claude-code-guide agent for Lead 69, 16 Nov 2026, docs checked that day: code.claude.com/docs/en/routines.md, scheduled-tasks.md, claude-code-on-the-web.md, agent-view.md, headless.md, github-actions.md, cross-session-messaging.md, permissions.md, permission-modes.md, context-window.md, best-practices.md. Cloud scheduled tasks and cross-session messaging are research preview, so limits may change.
