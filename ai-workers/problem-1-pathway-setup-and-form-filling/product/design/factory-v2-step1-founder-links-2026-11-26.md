# Factory v2 · step 1 (the founder's clicks) · 26 Nov 2026, Lead 4 (15:2x IST)

Source: Claude's own pages, read 26 Nov 2026 (claude.com/pricing; code.claude.com/docs/en/claude-ship, code-review-setup, code-review-costs, pr-steward-setup, approvals-setup, approvals-github-rules, costs). The plan is A409/A410 and the page https://claude.ai/artifact/LujXFsTovVTSx7mcJpYm6b.

**First, confirm the cost answer (A410):** a small Team organisation used only to switch on the agents. **2 standard seats: US$25 a seat a month billed monthly (US$20 billed yearly), so about US$50 a month.** Builders stay on Ultra. Code Review, PR Steward and Approvals are billed by use from organisation credits, each under a cap you set. (A premium seat costs US$125 a month billed monthly and gives 5× a standard seat. We don't need premium seats for the agents.)

Do them in this order, about 20 minutes. **Set every cap before you switch an agent on.**

| # | What | Link | What to press |
|---|---|---|---|
| 1 | Create the Team organisation (2 seats) | https://claude.ai/upgrade?initialPlanType=team | "Get Team plan", 2 seats, standard, monthly |
| 2 | Turn on usage credits and set the organisation's monthly cap | https://claude.ai/admin-settings/usage | Turn on usage credits, then set the organisation limit (your number; my suggestion for week 1: **US$150**) |
| 3 | Install the Claude GitHub App on `expat-ready/xpatready` only | https://github.com/apps/claude | Install, choose the org `expat-ready`, "Only select repositories" → `xpatready`. Accept the **Merge queues** permission too |
| 4 | Turn on the GitHub connector | https://claude.ai/admin-settings/connectors | GitHub → connect (PR Steward needs it) |
| 5 | Turn on Code Review | https://claude.ai/admin-settings/claude-ship | Switch on **Review** → "Turn on" → Connect GitHub → add `xpatready` → in "Choose what Claude does", keep **Code review**, **clear Steward** → "Turn on". Then **Edit** on the repo row → Review runs: **"Once after PR creation"** (the default, "After every push", costs the most) |
| 6 | Cap Code Review | https://claude.ai/admin-settings/usage | Services → **Claude Code Review** row → menu → "Edit spend limit" (suggestion: **US$60** a month in week 1) |

**Stop there.** I'll then watch a week-1 sample of reviews (they show as a check named "Claude Code Review" on each PR) and bring you the real daily spend. PR Steward and Approvals come next, once that sample is in. That is Claude's own suggested order (Code Review → Steward in Manual mode → Approvals in observe mode). Those steps need one GitHub rule change that I'll put to you at that moment: **a ruleset on `main` that requires 1 approval and dismisses stale approvals on a new push**, with the Claude app not on the bypass list.

**What I check after you say done:** the "Claude Code Review" check appears on the next pull request; the usage page shows the caps; the app is on `xpatready` only.

Unconfirmed: Claude's pages say PR Steward works with "github.com or a connected GitHub Enterprise Server instance". Our GitHub Enterprise **Cloud** org is on github.com, so it should count, but the pages don't say so in words. Code Review on a single repository doesn't depend on this.
