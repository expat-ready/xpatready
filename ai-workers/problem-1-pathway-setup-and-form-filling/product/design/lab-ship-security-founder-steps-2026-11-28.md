# Ship-security founder steps (28 Nov 2026)

The steps only the founder can take for the ship-security lane's rows of `lab-register-2026-11-27.md`. Written by the
ship-security cloud lane (Opus 5.5 medium) for the tech lead. Lanes no longer edit the register (LR-178): the prover lane
links this page from the rows. Each step names what it costs.

**Labels:** they come from GitHub's settings screens as the lane knows them. docs.github.com did not resolve from the
cloud on 28 Nov, so check each label on screen. If a label differs, follow the screen.

## LR-057: outside contributors need approval; the Mac runners are fenced

Cost: US$0. A cloud session cannot do this: reads of repository and organization settings were refused on 28 Nov. The code
part is done and passes: #4000, `check-workflow-security.sh`, 24 passed.

1. github.com/expat-ready/xpatready › Settings › Actions › General ›
   "Approval for running fork pull request workflows from contributors" › choose
   "Require approval for all external contributors" (older label: "all outside collaborators") › Save.
2. Organization › Settings › Actions › Runner groups.
   * Create the group first: New runner group › name `mac-fenced` › Repository access: Selected repositories ›
     expat-ready/xpatready.
   * Workflow access: Selected workflows › add
     `expat-ready/xpatready/.github/workflows/queue-gate.yml@refs/heads/main` and
     `expat-ready/xpatready/.github/workflows/demo-update.yml@refs/heads/main` › Create group.
   * Then put both runners in it. Only organization runners can be grouped; a repository runner cannot join a group.
     If xr-mac and xr-mac-light are repository runners, remove them and register them again at the organization,
     straight into `mac-fenced` (so they never sit in the Default group, which no workflow limit covers). Keep their
     labels exactly: `self-hosted`, `macOS` and `xr-mac` or `xr-mac-light`. queue-gate.yml and demo-update.yml pick
     their runner by these labels.
   * If the screen offers no "Selected workflows" limit (it depends on the plan), use the alternative below.
   * The alternative in the row's Done when: repository › Settings › Secrets and variables › Actions › Variables ›
     New repository variable `GATE_RUNNER` with the value `"ubuntu-latest"`, WITH the double quotes. queue-gate.yml
     reads it as JSON (`runs-on: ${{ fromJSON(vars.GATE_RUNNER || ...) }}`, its comment says "(JSON, with the quotes)"),
     and a bare `ubuntu-latest` would stop the merge gate from starting. The Mac then serves demo-update only.
3. Proof for the register: either a screenshot of the pages, or the Lead's API reads of
   `repos/expat-ready/xpatready/actions/permissions/fork-pr-contributor-approval`, then
   `orgs/expat-ready/actions/runner-groups` (the group and its workflow list) and
   `orgs/expat-ready/actions/runner-groups/<id>/runners` (both runners in it), or, for the alternative,
   `repos/expat-ready/xpatready/actions/variables/GATE_RUNNER`.

## LR-063: a second organization owner and recovery codes (deferred by P-859)

Cost: US$0. Deferred by P-859 ("Only me for now") until before the first customer or production (P-858). Nothing is built.

1. github.com › the expat-ready organization › People › Invite member › the second person's GitHub account ›
   role Owner › Send invitation. They accept from their e-mail, with two-factor sign-in on.
2. Each owner: profile picture › Settings › Password and authentication › Two-factor authentication › Recovery options ›
   Recovery codes › View › Download. Store the file where the founder's private note says, never in this repository.
3. Check: People › filter Role: Owner lists two people.

## LR-144: connect Claude Approvals, and what it costs

The policy is built: #4058 (`.claude/approvals.yml`, observe mode; `check-approvals-policy.sh` in ci).

1. claude.ai › the Claude Ship / Approvals page › connect the expat-ready organization, so Approvals no longer shows
   "shared with another Claude organization". This is LR-066's step.
2. **Expected cost once connected.** Both items are billed to the organization's usage credits.
   * Observe mode is billed (approvals-setup: "observe mode is billed"; these are the model runs the policy starts).
   * Each push to a PR that touches a risky path starts a billed Claude Code Review. The policy names
     `claude/code_review` in the `if` of the risky rules' override.
   * Volume: 155 of the last 300 merges to main touched a risky path (the reviewer's replay on #4058; 91 of them through
     the pipeline rule). So about half of PRs, at every push.
   * Price per review: not known until LR-067's 20 reviews. The caps set on 27 Nov bound the spend: Code Review
     US$100, organization US$200 (LR-066; the period is the one set with the caps, read it on the same page). When a
     cap or the credit balance runs out, Code Review skips reviews without a warning (LR-066, [C7]): with about half of
     PRs starting one at every push, read the balance weekly in the observe week.
   * US$0 until connected.
3. Read the first day's Code Review bills. No review should run on a PR that touches only routine paths.
4. Before the policy enforces:
   * add the no-sign-in routes the round-2 review named (`signing/door*`, `booking/tokens.ts`, `web-address/**`,
     `firms/signup*`, `features/platform-*.ts`);
   * move Mergify to the "Claude Approvals" check (LR-072).
