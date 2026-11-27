# Claude Ship best practice vs factory v3 — 27 Nov 2026 (Lead 2)

Founder ask (typed, 09:4x IST 27 Nov): research the current docs and best-in-class agentic pipelines, no stale information, and recommend. Sources were read on 27 Nov 2026; "cc/" = https://code.claude.com/docs/en/. The Lead re-checked three claims directly (cc/code-review-costs, cc/pr-steward-setup).

## Settings applied 09:4x IST (founder "Yes, apply them")
Code Review: on; xpatready Review runs = Manual (`@claude review`), Standard. Steward: Off on xpatready. Spend limits: Code Review US$100 a month, PR Steward US$50 a month. Org cap US$200, balance US$10. Approvals: not connected ("expat-ready is shared with another Claude organization"). No default cloud environment.

## Facts that matter (current docs)
- **Code Review**: generally available, Team and Enterprise. Billed by tokens (Quick, Standard, Deep), no flat price per review. Runs: once, after every push, or Manual. Pilot on Once or Manual, then read the "average cost per review" (cc/code-review-costs). **Skips reviews when the Code Review limit, the org limit or the credit balance runs out, or when what is left is below one review's expected cost** (verified). Advisory only: its check never fails (cc/code-review). No path filter.
- **PR Steward**: public beta. Off, Manual (`@claude steward` or a label), On, or On including drafts. Skips drafts, forks, PRs opened by bots, and authors without write access. Never approves; merging is left to GitHub's rules (cc/pr-steward-security). **The docs say to add rules on GitHub before it goes on: a PR with at least 1 approval, plus dismiss stale approvals or require approval of the last push** (verified). Spend cap per repository, which stops it on the PR where the cap is reached, plus a monthly limit (verified). With no default environment it runs in a basic hosted one with no setup script. That environment has PostgreSQL 16 installed but not running: an org-shared environment with a setup script can start it (cc/cloud-environments).
- **Claude Approvals**: public beta. `.claude/approvals.yml` on the default branch turns it on. Observe mode is billed. A policy file stops automatic Code Reviews unless a rule names `claude/code_review`. Rules cannot read CI results. Claude's approval counts toward GitHub's "1 approval" rule. The docs cover GitHub's own merge queue only and say nothing about Mergify. To fix the "shared with another org" message, an Owner clicks Connect on the Claude Ship page, then pushes a commit (cc/approvals-troubleshooting).
- **DORA** now has five metrics: deployment rework rate was added, and recovery time became failed deployment recovery time (https://dora.dev/guides/dora-metrics/).
- **Anthropic best practice** keeps a person approving merges in unattended runs (cc/best-practices). It also backs a separate, sceptical evaluator, and removing harness parts that no longer carry weight (anthropic.com/engineering/harness-design-long-running-apps, 24 Mar 2026). If we choose full autonomy, the founder records it as a decision.

## Gaps in factory v3 and in our settings
1. The real cap today is the **US$10 balance**: reviews skip silently once it runs out. Top up first.
2. "Code Review on risky paths" had no mechanism. Use Manual, and the Lead or a builder posts `@claude review` on money, schema, migration, permission or pipeline PRs. Later, an Approvals rule scoped to those paths.
3. A "Steward pilot on 3 lanes" cannot be split by author, because one GitHub account writes every PR. Use Manual + `@claude steward` on the chosen PRs.
4. No default environment, so Steward cannot run our Postgres suites. Create an org-shared environment that installs packages and starts Postgres (about 1 hour of Lead time).
5. **The label survives a Steward push**, so an unreviewed commit could merge. Before Steward goes on (even Manual), Mergify must require something that a push resets. **Lead correction:** the "1 approval" ruleset cannot go on today, because no PR has a GitHub approval (the founder's account is the author of every PR). Switching it on now would stop every merge. It goes on together with the step that provides an approver (Approvals or the machine user).
6. The plan's days 1–3 put three agents on together. The docs say one at a time: Code Review, then Steward (Manual first), then Approvals.
7. "Watch-only" Approvals is "observe mode", and observe mode is billed.
8. Steward can edit workflow files if the app has workflow write permission. Add a rule that a non-author approves changes to `.github/**`.
9. Change the cto-review skill and the plan's baseline to the five DORA metrics.

## Recommended rollout (Mergify stays the only merger)
1. **Now:** founder tops up the balance to cover the caps (US$100 → covers Code Review; total caps US$150). The Owner clicks Connect for expat-ready on the Claude Ship page.
2. **Code Review Manual, Standard:** about 20 reviews on risky PRs, then read the average cost and resize the cap.
3. **Environment:** an org-shared Postgres environment set as the default under "Where it runs". Steward stays Off until step 5.
4. **Approvals in observe mode (billed):** routine paths approved by Claude after Code Review passes; risky paths need a non-author human approval (the machine user); `.github/**` needs a non-author approval.
5. **Switch (one revertible PR):** GitHub ruleset (1 approval, dismiss stale approvals, `ci` required, no force-push, Claude app not on bypass). Mergify's queue condition goes from the label to an approval + Claude Approvals + `ci`. Steward goes to Manual on chosen PRs, then On.
6. **Measure** the five DORA metrics for two weeks, then retire the label-guard family and resize the caps.
