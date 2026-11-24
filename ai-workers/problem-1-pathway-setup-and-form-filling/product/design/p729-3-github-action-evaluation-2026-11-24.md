# P-729 (3): Anthropic's Claude Code GitHub Action, evaluated on paper (Lead O 2, 24 Nov 2026)

Nothing installed, no account, no key, US$0. Official pages read by a reader agent on 24 Nov: code.claude.com/docs/en/github-actions; github.com/anthropics/claude-code-action (README, docs/security.md, setup.md, usage.md). Their text is quoted short; the cost, code-review and cloud-provider pages were not read.

**Recommendation: do not install now; mark P-729 (3) evaluated, not adopted.** Reconsider when a review is found skipped or softened, or when the repository is private and the founder decides on a second GitHub identity (P-423).

| Question | What the official pages say | For us |
|---|---|---|
| What it does | On `@claude` in an issue or PR comment, or on any event with a prompt; commits to a branch, "Claude replies in a comment"; does not open the PR itself | Our cloud lanes already build on branches and our reviewer already runs fresh |
| Sign-in | API key, OAuth token (tied to the plan of whoever made it), or OIDC federation with no stored key | A key or token is the founder's (P-551); federation is the only one with no secret |
| App permissions | Default App: contents, issues, PRs, workflows, checks, repository hooks read and write and more; "does not let you accept a subset". security.md lists fewer as in use today: the pages differ | Far more than a reviewer needs; workflow write touches P-423 paths. A custom App would narrow it: not priced |
| Who can trigger | Write access needed; `allowed_non_write_users` is called "RISKY"; bots listed in `allowed_bots` "are not checked for repository permissions" | Our repository is public: comments come from anyone; the default keeps them out |
| Prompt injection | Warned: hidden comments and invisible text from outside contributors; repo code not run for authors without write access; auto mode is "a review, not a boundary" | The risk grows with a write token in CI |
| Forks | Secrets withheld from fork PRs; `allow_fork_prs` false by default | Fine |
| Cost | Actions minutes plus API tokens, or the plan's usage with OAuth; no figure on any page; extra model calls for comment checks and auto mode | Unknown per review. Our machines already queue (P-542); a job a PR adds to that |
| Cost control | `--max-turns`, model choice, workflow timeouts, concurrency; no defaults stated | Would be needed from day one |
| Approve or merge | Not stated either way | Could not replace the exact-head Approve and the Lead's read |
| Version, licence | `@v1` floating, MIT; release cadence and SHA pinning not stated | We pin by SHA (CI rule); the docs say a floating ref takes changed defaults by itself |

**STANDARDS §1 gate:** problem: "the builder starts its own reviewer" (alignment report, play 9). Evidence of harm: none found here, but not searched beyond the report; this week fresh reviewers refused 8 of this lane's first versions, so they are not soft on it. Options: keep as is (no cost); reviewer started by the Lead or by a cloud lane (no new tool); this Action, review-only with a custom App and federation. Upkeep: an App, a workflow on a P-423 path, a pinned version, a spend cap. Data: PR content goes to Anthropic's API, as it does today from our sessions; retention page not read. Result: the gap is not evidenced, so the gate is not passed.

Not shown: price per review, speed, quality against our own reviewer. A fair trial would be ten merged PRs reviewed again, report-only, with the founder's yes to a key or federation and a US$ cap.
