# Ship security: Claude Approvals, the approval rule, PR Steward, security basics (lab lane ship-security, 27 Nov 2026)

Lab lane "ship-security" (product work paused, P-847). It builds on `design/claude-ship-best-practice-2026-11-27.md`.
Docs were read on 27 Nov 2026; "cc/" = https://code.claude.com/docs/en/. GitHub's own docs (docs.github.com) could not be
reached from the cloud session (the network refused the host), so the GitHub steps in §5 come from the GitHub UI as known and are marked **unverified**. The Lead
checks each one against the page in the browser.

## 1. `.claude/approvals.yml` (in this PR, observe mode)

**What the docs say (quotes, 27 Nov 2026):**
- cc/approvals-policy: "Save the policy file as `.claude/approvals.yml` in your repository's root, and merge it into the default branch." Top-level keys: `version` (1), `rules`, optional `mode` (`enforce` default, or `observe`), `nested`, `run`, `locals`. "Approvals refuses a file that has an unknown key."
- cc/approvals: "Reviews and classifier runs are billed in observe mode." cc/approvals-setup: in `observe` "the **Claude Approvals** check shows what the policy would decide, Claude doesn't approve, and the check normally counts as passing."
- cc/approvals-classifiers: `claude/code_review` answers `pass` or `fail`, "Billed as Code Review."
- cc/code-review: "Where every file that a pull request changes lies under a policy file, automatic reviews normally stop, unless a rule for those files names `claude/code_review`."
- cc/approvals: "A condition can't read CI results, so keep CI as its own required check in GitHub."
- cc/approvals-pull-requests: `@claude approve` "Can count as your approval of the latest commit, for the **Claude Approvals** check. To name a commit, add its full SHA ... Make it the comment's only text." "You need write access to the repository." cc/approvals-github-rules: "GitHub doesn't count an author who fills a seat, or an `@claude approve` comment."
- cc/approvals-policy: "Approvals normally asks GitHub to dismiss Claude's own approval when it evaluates the push, and Claude approves the new commit only if the **Claude Approvals** check passes again."

**The policy: seven rules in three tiers (P-823 and P-849; the Lead's answers on #3899, 27 Nov).** Claude is the approver that GitHub records. There is no machine user (P-849, founder 27 Nov). `product/tools/check-approvals-paths.sh` runs in ci and proves three things:
- **A1:** the routine rule's `!` list equals the other rules' paths, and no tracked file is in both.
- **A2:** every tracked file that `lead-read-paths.txt` names falls outside the routine rule, and every file its read-first lines name falls in a rule with the Lead's seat. Before the first review fix, 29 files fell in the routine rule.
- **A3:** every non-routine rule approves only on `claude/code_review = pass`, and no seat draws on an unnamed set (`humans`, `everyone`, a bare count) that the author would fill.

| Tier | Paths | Seat | Claude | Billed? |
|---|---|---|---|---|
| Routine | everything else (product code, tests, records) | none | **approves**. The reviewer agent's `Reviewer: Approve <sha>` still gates the merge through the label during the overlap. | No: no classifier, no review |
| Read first: pipeline | `.github/**`, `.mergify.yml`, `.githooks/**`, `CLAUDE.md`, `AGENTS.md`, `product/tools/**`, `product/screens/B119/**`, `studio/tools/**`, `**/prisma.config.*` | `@lead`: team `expat-ready/tech-lead`, filled by the Lead's `@claude approve <head sha>` | comments; **approves** only when `claude/code_review = pass` and the seat is filled | Yes, one Code Review (Standard) per head |
| Read first: review rules | `**/.claude/**` (`nested: inherit`, as in the docs' own starter) | `@lead` | same | Yes |
| Read first: permissions | identity, `core.ts`, firm wall, terms gate, notification groups, `*permission*` | `@lead` | same | Yes |
| Read after: public routes | `api/src/**/*public*`, `web/src/**/*-public/**` | none | comments; **approves** when `claude/code_review = pass` | Yes |
| Read after: schema and migrations | `**/prisma/schema/**`, `**/prisma/migrations/**` | none | same. A **destructive** migration stays read-first through `queue-gate.sh destructive()`, which reads the added lines; no path rule can see them. | Yes |
| Read after: money | `*money*`, fee/fees, `*pric*`, billing, payment, stripe, invoice, ledger, the paid-run files (`ai.ts`, `rounds.ts`, ...) | none | same | Yes |

**The Lead's seat and the one account.** The Lead works from the account that authors every PR, so the `@lead` seat does not exclude authors. Per the docs, an author's explicit `@claude approve` comment can count ("Comment `@claude approve` on your own pull request when the check's summary says that you don't count as an approval", cc/approvals-pull-requests). Whether authorship alone fills a named team's seat, before any comment, is shown by the observe-mode check summary on the first read-first PR. The Lead checks that before enforce. Either way, read-first paths keep a second gate that does not depend on Approvals: `queue-gate.sh` never puts the label on them before the Lead's read (P-423, P-823), and Mergify needs the label during the overlap.

The paths are `product/tools/lead-read-paths.txt` turned into globs. That file is regex and case-insensitive, so the globs spell every letter as a class, for example `[Bb][Ii]...`, and cover both a file and a folder (`*word*` and `*word*/**`). The money word `fee` is bounded by `-`, `_`, `.` or a digit, as the regex's `[^a-z]` is. Globs that match too much (for example `*fee.*` also matches `coffee.ts`) send a file to the Lead's read: the safe side.

**Observe mode: we use it, and it is billed.** Routine PRs cost nothing in either mode (no classifier). Lead-read PRs start one Code Review each (Standard), in observe mode as well. Spend stays inside the Code Review cap (US$100 a month) and the credit balance. When either runs out, reviews skip (cc/code-review-costs), `claude/code_review` has no result, the override does not apply, and the rule's own verdict (`claude: comments`) holds. So a Lead-read PR then waits for the Lead. It fails closed. The observe window is the first ~20 Lead-read PRs (the best-practice pilot). Then read the "average cost per review" and decide on enforcement.

**Validation.** No CLI or schema URL is documented. cc/approvals-setup: "While a change to a policy file is in an open pull request, Approvals can check the changed file for errors, and applies none of its rules." A valid file gets a comment that Claude "found the policy file in this change valid". An invalid one gets the failed check **This change breaks a policy file**. The PR waits for that comment before the label. On main, the failures are titled **Default branch policy file cannot be used** and similar. They are fixed in a new PR, followed by `@claude approvals rerun`.

## 2. The GitHub rule "1 approval + dismiss stale approvals" and Mergify (the switch: written now, done later)

**Why together, not now.** Every PR is authored by one account. GitHub never lets an author approve their own PR, so today no PR has a GitHub approval. If the rule went on alone, every merge would stop. The approver is Claude: its approving review counts ("Claude's approving review can meet a GitHub branch rule that requires one approval", cc/approvals-github-rules). That review exists only in **enforce** mode. So the rule, enforce mode and Mergify's new conditions go on in the same hour.

**What resets on a push (the point of the switch).** (a) GitHub dismisses every approval on a new commit (the rule). (b) Approvals dismisses Claude's own approval and re-decides. (c) label-guard.yml already takes `review: approved` off a pushed head (best effort, event-driven, with a 10-minute sweep). After the switch, (a) is native and needs no event, so a PR Steward push or any other push leaves a PR that cannot merge until it is approved again. **What that approval means, by tier (P-849):** on read-first and read-after paths, Claude approves again only after a new `claude/code_review = pass` on the new head (and, read-first, the Lead's new `@claude approve <sha>`). On routine paths, Claude approves again with no review, so there the reset that matters is the label: the reviewer's `Reviewer: Approve <sha>` names the exact head, and label-guard and queue-gate drop the label otherwise. That is why Mergify keeps the label during the overlap. Retiring it needs either `claude/code_review` on routine paths (billed per PR) or an accepted lower bar, and that is a decision for the Lead and the founder after the observe window.

**Mergify change (the switch PR; each of the four queues: verdicts, pipeline, product, records):**
```yaml
    queue_conditions:
      - base = main
      - -draft
      - "label = review: approved"          # kept for the overlap; removed after 2 weeks of clean runs
      - "#approved-reviews-by >= 1"         # GitHub counts only undismissed approvals: a push takes the PR out
      - "#changes-requested-reviews-by = 0"
      - "check-success = Claude Approvals"
      - check-success = ci
      # ... the queue's other lines unchanged
    merge_conditions:
      - check-success = ci
      - "#approved-reviews-by >= 1"         # a push during the batch run drops the PR from the batch
```
Mergify cannot tell which app posted a check called "Claude Approvals". The GitHub ruleset enforces the check's source (step 8). Mergify merges each original PR (`merge_method: merge`), so the ruleset's approval rule applies to each PR, not to the `mergify/merge-queue/*` batch branches. The ruleset targets `main` only. `product/screens/B119/check-queue-rules.py` and `engineering-approved-setup.json` follow in the same PR.

**The Lead's step (skills, in the switch PR):** on a read-first PR, after reading it, the Lead posts a comment whose only text is `@claude approve <head sha>`, next to the existing "Lead read" record. The reviewer agent's step does not change.

**Before enforce:** (a) the observe window: about 20 read-first and read-after PRs, with their review cost read; (b) the seat check above; (c) the overlap plan in this section. No machine user is needed (P-849).

## 3. PR Steward: Manual first

cc/pr-steward-setup: Manual = "When a person with write access comments `@claude steward` or adds the `claude-pr-steward-watching` label". Stop with `@claude stop`. The docs ask for rules before it goes on: "Add a ruleset rule on the default branch that requires a pull request with at least one approval" and "dismiss stale approvals when new commits are pushed, or require approval of the most recent push"; "Keep the Claude GitHub App off the ruleset's bypass list." cc/pr-steward-security: "the installation can also grant write on workflows, which lets PR Steward push changes to workflow files."

- **When:** Manual goes on only after §2's switch is live (dismiss-stale in force). Until then Steward stays **Off**.
- **Trigger:** `@claude steward` as a top-level comment on the PR (or the label `claude-pr-steward-watching`).
- **Who:** the Lead only, on a **red** PR it chooses to repair (failing ci on product code). It is not used on pipeline or other Lead-read paths during the first two weeks. Builders do not trigger it. One account writes every PR, so this is a rule in the lead skill, not something GitHub enforces.
- **Its environment:** with no default cloud environment it runs in the basic one, where PostgreSQL is installed but not running. It cannot run our Postgres suites, so CI is what verifies its pushes. An org-shared environment that starts Postgres is the best-practice file's gap 4 (another lane).
- **Caps:** PR Steward US$50 a month (set 27 Nov) plus the per-repository "Steward spend cap" in the Edit dialog. "Spend can pass the cap before it stops."
- **Workflows:** keep the Claude app's "Workflows" permission at read (step 10). The pipeline rule's Lead seat also covers `.github/**`.

## 4. Security basics (in this PR and its sibling)

- **Actions pinned:** every `uses:` in `.github/workflows/*.yml` (94 lines, five actions) now names a full commit SHA with its version as a comment. The SHAs came from `git ls-remote` of each action's tag on 27 Nov 2026:

| Action | Was | Now |
|---|---|---|
| actions/checkout | `@v4` | `@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0` |
| actions/setup-node | `@v4` | `@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0` |
| actions/upload-artifact | `@v4` | `@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2` |
| actions/download-artifact | `@v4` | `@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4.3.0` |
| actions/setup-python | `@v5` | `@a26af69be951a213d495a4c3e4e4022e16d87065 # v5.6.0` |

  `product/tools/check-workflow-security.sh` (in ci's tools step) fails an unpinned `uses:` (S1) and proves on fixtures that it would. To stop the pins going stale, Dependabot version updates for `github-actions` are a later step: there is no `.github/dependabot.yml` today, and adding one is new automation for the Lead to decide.
- **Mac runner:** S2 of the same check fails any workflow other than `queue-gate.yml` that names `xr-mac`, any workflow other than `demo-update.yml` that names `xr-mac-light`, and any other `self-hosted`. A workflow check cannot stop a PR's own new workflow file from asking for the runner (`pull_request` runs the PR's copy). The settings in §5 steps 4-6 are what enforce it.
- **Dependabot (high):** the PR "deps: high advisories" (sibling) upgrades zod 4.4.3 → 4.6.7 (studio, env/node, xfa-engine), NestJS 11.1.29 → 11.2.12 (multer, body-parser), Prisma 7.8.0 → 7.10.1 (deepmerge-ts, mysql2) and vite 8.1.0 → 8.4.0. It adds an `overrides` for effect 3.22.5, because `@prisma/config` 7.10.1 pins effect 3.20.0, which has GHSA-7589-6fvf-x4pw. `npm audit --audit-level=high` reads the same GitHub Advisory Database Dependabot uses, and it reports 0 high in all four lockfiles after the change. The cloud session cannot read the Dependabot alerts list itself. The Lead confirms the count on Security › Dependabot after the merge (step 11).

## 5. The Lead's settings steps (browser; settings and rulesets are not changed with gh)

**Now (no change to how PRs merge):**
1. Do step 2 first, because the policy names the team. Then merge this PR once Approvals has commented that the policy file is valid. Then open any open PR and check that a **Claude Approvals** check appears with a title starting "(observe mode)". If the Claude Ship page still says "expat-ready is shared with another Claude organization", an Owner clicks **Connect** there and pushes a commit (cc/approvals-troubleshooting).
2. Create the team: github.com/orgs/expat-ready/teams → **New team** → name `tech-lead` (secret visibility; the same team draft #3851's CODEOWNERS names) → add the account(s) that do the Lead's read → then xpatready → Settings → **Collaborators and teams** → **Add teams** → `tech-lead` → role **Write**.
3. Code Review stays **Manual, Standard**. Confirm the Code Review spend limit (US$100) and the credit balance cover the observe window (claude.ai/admin-settings/usage).
4. Mac runner `xr-mac` to `queue-gate.yml` only (**unverified**, check against the page): repository-level runners cannot be limited to workflows, so move it into an organisation runner group. github.com/organizations/expat-ready/settings/actions/runner-groups → **New runner group** → name `mac-gate` → Repository access: **Selected repositories** → `xpatready`; tick **Allow public repositories** (xpatready is public); Workflow access: **Selected workflows** → `expat-ready/xpatready/.github/workflows/queue-gate.yml@refs/heads/main` → Create. Every queue-gate trigger runs main's copy, so `@refs/heads/main` matches it.
5. Re-register `xr-mac` into that group (on the Mac, founder or Lead): set the repository variable `GATE_RUNNER` to `"ubuntu-latest"` (JSON, with the quotes) so the gate keeps running meanwhile → `cd ~/actions-runner-xpatready && ./svc.sh stop && ./config.sh remove --token <removal token from xpatready › Settings › Actions › Runners › xr-mac>` → `./config.sh --url https://github.com/expat-ready --token <token from the org's New runner page> --runnergroup mac-gate --name xr-mac --labels xr-mac --unattended && ./svc.sh start` → delete `GATE_RUNNER` → the next queue-gate run shows runner `xr-mac`.
6. Do the same for `xr-mac-light` with a group `mac-demo` limited to `expat-ready/xpatready/.github/workflows/demo-update.yml@refs/heads/main` (folder `~/actions-runner-xpatready-3`). Recommended; not part of the ask.
7. Keep Settings → Actions → General → "Require approval for all external contributors" (fork PRs) as saved.

**The switch (one hour, after the observe window and the Question answers):**
8. Settings → Rules → Rulesets → **main: PR + ci required** → "Require a pull request before merging": **Required approvals = 1**; tick **Dismiss stale pull request approvals when new commits are pushed**; leave "Require approval of the most recent reviewable push" off (the docs accept either). Under "Require status checks to pass", **Add checks** → `Claude Approvals` → source the **Claude** app (app ID 1236702), not "any source"; keep `ci`. **Bypass list:** the Claude app and Mergify are never on it. P-691 (RULES.md) keeps an emergency hand merge through the ruleset bypass. Keep whatever entry P-691 relies on, and confirm it with the founder; do not empty the list. Save.
9. Merge the switch PR in the same hour: delete `mode: observe` from `.claude/approvals.yml`, add §2's Mergify lines, and add the reviewer agent's `@claude approve` step. After 5 minutes, comment `@claude approvals rerun` on each open PR.
10. Claude Ship page → xpatready → Edit → Steward: **Manual (@claude steward)**. Set the per-repository Steward spend cap if it is not set. Org settings → GitHub Apps → Claude → Configure → check that the **Workflows** permission is not granted write (leave it as it is if it is not offered).
11. Security › Dependabot: confirm 0 open high alerts after the deps PR merges, or note each remaining one here with its reason.

**Rollback (reverse order):** Steward Off → ruleset back to 0 approvals and remove the `Claude Approvals` required check → revert the switch PR (Mergify back to the label only) → `mode: observe`.

## 6. Overlap with draft #3851 (Factory v2 switch, 26 Nov, "do not merge before the founder's yes")

#3851 adds its own `.claude/approvals.yml`, plus `CODEOWNERS`, `dependabot.yml` and `REVIEW.md`. Whichever of the two merges second conflicts on the policy file. What this lane changes, and why:
- **Routine paths:** #3851 has `claude: comments, seats: 0`, so Claude never approves anywhere and GitHub's "1 approval" rule can never be met. Here, Claude approves (P-849: Claude is the approver GitHub records). That is what lets "1 approval + dismiss stale" go on at all (the lane's goal: approvals replace labels).
- **Lead-read paths:** the paths are the same in substance. Here, the seat is named (`@lead` = `expat-ready/tech-lead`) instead of any person. Claude approves only after `claude/code_review = pass`, which fails closed when the budget runs out.
- **Mergify:** #3851 proposes `or: [#approved-reviews-by >= 1, check-success = Claude Approvals]`. Here it is **and**, plus the label during the overlap. With "or", a passing check alone would merge a PR. A neutral observe-mode check, or a check from another source (Mergify cannot see the check's source), would then be enough.
- **Pins:** #3851 left them out because two tools asserted `actions/checkout@v4` word for word. This PR changes those two tools and pins.
- Kept from #3851 and not repeated here: `dependabot.yml` (it will keep the SHA pins current), `CODEOWNERS`, `REVIEW.md`, CodeQL.

**Recommendation:** this PR carries the policy file. #3851 drops its `.claude/approvals.yml` and keeps the rest.

## 7. Answers from the tech lead (27 Nov, on #3899)
- **P-823 stands** (a founder decision, not a new question). Additive migrations, money and public routes are read-after: Claude approves when its review passes, and the Lead reads after the merge. Workflows, permissions and destructive migrations stay read-first. The policy now follows this.
- **No machine user (P-849, founder 27 Nov):** Claude Approvals is the approver that GitHub records. The machine-user step and the enforce precondition that depended on it are removed.
- **#3851** drops its own `.claude/approvals.yml`; one policy file.
- **The reviewer's three small follow-ups** (fee bounds, `self-hosted` text in run lines, the version comment not checked against the SHA) go in one small PR after #3899 merges.
