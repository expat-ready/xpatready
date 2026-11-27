# Factory v2 · the GitHub and Claude settings at switch time · 26 Nov 2026

Decisions A409 and A410 (use what Claude Code and GitHub ship; build no framework of our own around them; keep what works). Changed by the Factory v3 review the same day: **Mergify stays** (its parallel mode, scopes and capacities, P-715, have no match in GitHub's merge queue), **no move to GitHub's merge queue**, **Code Review on risky paths only**, and **"1 required approval on main" is an open question**, not a step.

Sources: code.claude.com/docs/en/approvals-setup, approvals-policy, approvals-github-rules, code-review-setup, code-review-customize, pr-steward-setup (read 26 Nov 2026); `.mergify.yml` and `.github/workflows/*.yml` on origin/main (065fe8c28); the ruleset as recorded in `design/org-move-checklist-enterprise-2026-11-17.md`. **The rulesets could not be read today** (the sandbox refused the API call): read them in the browser at switch time (https://github.com/expat-ready/xpatready/settings/rules) before step 3 and note what you see here.

## 0. Security basics, first (Factory v3 review)

The repository is **public**, and the Mac's self-hosted runners take jobs from it: `queue-gate.yml` runs on `xr-mac` (`runs-on: ${{ fromJSON(vars.GATE_RUNNER || '["self-hosted", "macOS", "xr-mac"]') }}`, line 51) and `demo-update.yml` on `xr-mac-light` (`runs-on: [self-hosted, macOS, xr-mac-light]`, line 16; the brief named xr-mac for both, the file says xr-mac-light, so step 2 covers both runners). `nightly.yml` mentions xr-mac only in a comment and runs on `ubuntu-latest`. GitHub's advice is that self-hosted runners should not take jobs from a public repository's untrusted code. Do these before anything else:

1. **Fork pull request workflows:** Settings → Actions → General → "Approval for running fork pull request workflows from contributors" → **Require approval for all outside collaborators**.
2. **Runner group:** Org → Settings → Actions → Runner groups → new group (for example "mac-runners") holding `xr-mac` and `xr-mac-light`. Repository access: `xpatready` only. Workflow access: **selected workflows only**, `expat-ready/xpatready/.github/workflows/queue-gate.yml@refs/heads/main` and `expat-ready/xpatready/.github/workflows/demo-update.yml@refs/heads/main`. Any other workflow, or any branch's copy of these, then cannot reach the Mac. Before you move the runners, check that both runners are registered at org level: a runner registered on the repository alone has to be registered again under the org first (read in the browser at switch time).
3. **Fallback** (if the group cannot be set up, or the Mac is down): repository variable **`GATE_RUNNER` = `["ubuntu-latest"]`** (Settings → Secrets and variables → Actions → Variables). `queue-gate.yml` then runs on GitHub's hosted machines with no PR. `demo-update.yml` has no such switch: if its runner must go, disable that workflow (Actions → demo-update → Disable workflow) until a PR moves it.

Four swaps from the Factory v3 review: set them, or confirm they are on (several may already be on: see section 2 and read in the browser):

| Swap | Where | Value |
|---|---|---|
| Lock main: no direct pushes | ruleset on `main` ("main: PR + ci required") | "Require a pull request before merging" **on**; the bypass list holds only what must merge (Mergify), never the Claude app (1236702) |
| Block force pushes | ruleset on `main` ("main: no force push or delete (A)") | "Block force pushes" and "Restrict deletions" **on** |
| `ci` as a required status check | ruleset on `main` | "Require status checks to pass" with **`ci`**, source GitHub Actions |
| Dependabot alerts | Settings → Code security | **Dependabot alerts on** (the push on 26 Nov reported 30 open vulnerabilities on main: 9 high, 18 moderate, 3 low) |

## 1. Open question (Factory v3 review): approvals on main

Builders and the tech lead all push as the same GitHub account, and GitHub never counts an author's approval of their own pull request. So "require 1 approval" would block every pull request until a second account approves. **Nothing in this switch depends on the answer:** no approver set-up, no ruleset step that assumes one. Three things wait for it:

* "Require approvals: 1" on the main ruleset, and with it "Require review from Code Owners".
* Enforcing Claude Approvals (deleting `mode: observe`) and adding "Claude Approvals" as a required check.
* PR Steward: its documented prerequisite is a ruleset on main that requires a pull request with at least one approval and dismisses stale approvals.

## 2. What the main ruleset has, and what changes now

As recorded 17 Nov (re-read at switch time):

| Ruleset | Rule | Today | At switch |
|---|---|---|---|
| "main: PR + ci required" | Pull request required | on, **0 approvals**, no code-owner review, no last-push approval | unchanged (approvals: open question) |
| | Dismiss stale approvals on new push | off | **on** (no effect while 0 are required; ready for the answer) |
| | Required status check | `ci`, source GitHub Actions (integration 15368), not strict | **unchanged: `ci` only** |
| | Bypass list | read in the browser | **the Claude GitHub App (app ID 1236702) is never on it**; nothing else added |
| "main: no force push or delete (A)" | deletion, non-fast-forward | on | unchanged |

Checks Mergify's queues wait on (`.mergify.yml` `queue_rules`, origin/main), all unchanged: `ci` (every queue), `pr-rules` (product), `xfa-engine` (engine files), `queue-fresh` (app code; a status from `queue-gate.yml`), no `completes-ready` failure (product), `skeleton` (merge condition for container files). None needs `merge_group:`: there is no move to GitHub's merge queue.

## 3. The Mergify queue condition (proposal only, NOT live)

The only Mergify change planned. It is written here, not in `.mergify.yml`, because it depends on the open approver question. In each of the four queues (`verdicts`, `pipeline`, `product`, `records`) the line `- "label = review: approved"` would become:

```yaml
# PROPOSAL, not applied (Factory v3 review): an approving review OR a passing Claude Approvals check.
#      - or:
#          - "#approved-reviews-by >= 1"
#          - "check-success = Claude Approvals"
```

Before it can go live: Claude Approvals is enforced (in observe mode its check decides nothing, so it must not count yet), and the approver question is answered.

**Retires after the condition swap** (kept until then, because the label is still the queue's entry ticket): the label-guard family, `.github/workflows/label-guard.yml`, `product/tools/label-guard.sh`, `label-sweep.sh`, `check-label-guard.sh`, `check-label-sweep.sh`, and the auto-label part of `queue-gate.yml` / `queue-gate.sh`. Places that still name them on origin/main and change in that PR: `guards.yml` (paths), `check-guards.sh` (test list and mutation rows 2, 9, 15 sweep, 15 full sweep3), `check-queue-gate.sh` (CI-PRE wiring reads label-guard.yml's sweep job), `queue-gate.sh` (proof and eligible modes exist for them), `cockpit-data.py` and its fixture (reads label-guard runs), `check-startup-failures.sh`, `check-touch-overlap.sh`, `check-queue-blocked.sh` (path strings in fixtures), `check-g4-rules.sh`, `sle-watch.py`, `write-token.py`, `records-label.yml` (comments); records: `CONTRIBUTING.md`, `RULES.md`, `WAY-OF-WORKING.md`, `BACKLOG.md`, `rules/builders-and-qa.md`, `cockpit/`, `library/` and design notes; the `next` skill ("labels the pull request so Mergify merges it") and the `lead-watch` skill.

## 4. Claude settings (claude.ai, the founder's clicks)

| Setting | Where | Value |
|---|---|---|
| Code Review, Review runs | https://claude.ai/admin-settings/claude-ship → Edit on the `xpatready` row | **Manual** until this PR is on main; then **"Once after PR creation"** |
| Which pull requests get a review | `.claude/approvals.yml` (from main) | automatic review only on a pull request touching a risky path (`claude/code_review` is under `advisory` only in the risky-path rules); others on request. Unconfirmed until seen: the docs say automatic reviews "can stop" where the policy does not keep them; check on the first non-risky pull request |
| Code Review spend limit | https://claude.ai/admin-settings/usage → Claude Code Review | the founder's number (week-1 suggestion US$60) |
| Claude Approvals | turned on in observe mode | `mode: observe` in `.claude/approvals.yml`; enforcing waits for section 1 |
| PR Steward | off | waits for section 1 |
| Claude GitHub App | https://github.com/apps/claude | installed on `xpatready` only |

## 5. GitHub settings (repository admin)

| Setting | Where | Value |
|---|---|---|
| Fork pull request workflows | Settings → Actions → General → "Approval for running fork pull request workflows from contributors" | **Require approval for all outside collaborators** |
| CodeQL | Settings → Code security → Code scanning → CodeQL analysis → Set up → **Default** | languages it finds (JavaScript/TypeScript, Python, GitHub Actions); weekly and on pull requests; **not** a required check |
| Dependabot alerts and security updates | Settings → Code security | **on**; version updates come from `.github/dependabot.yml` once merged |
| Code owners | Org → Teams → new team `tech-lead` (secret visibility), with write access to `xpatready` and the tech lead's account | `.github/CODEOWNERS` names this team; until it exists GitHub flags the lines as unknown owners. "Require review from Code Owners" stays **off** (section 1) |
| Actions pinned to commit hashes | not changed | every action used is GitHub's own (`actions/checkout@v4`, `setup-node@v4`, `setup-python@v5`, `upload-artifact@v4`, `download-artifact@v4`); there is no third-party action. Pinning them is not mechanical here: `check-red-on-old.sh` and `check-npm-audit-report.sh` assert `actions/checkout@v4` word for word, so they change in the same PR if it is wanted |

## 6. Order of the switch

1. The founder says yes. Read both rulesets and the bypass list in the browser; write what you see in section 2.
   Then section 0 (security basics), before any other step.
2. The founder's clicks from `factory-v2-step1-founder-links-2026-11-26.md` steps 1–6, with Review runs set to **Manual**.
3. This pull request merges through Mergify as today (it touches `.github/` and `.claude/`, so it keeps the tech lead's read). From then on `.claude/approvals.yml` (observe) and `REVIEW.md` are read from main.
4. Code Review → Review runs: **"Once after PR creation"**.
5. GitHub: dismiss stale approvals **on**; fork pull request approval for all outside collaborators; CodeQL default set-up; Dependabot alerts and security updates; create the `tech-lead` team. The Claude app stays off every bypass list.
6. Check: the next pull request touching a risky path shows the "Claude Code Review" check and a "Claude Approvals" check titled "(observe mode)"; the next pull request touching none shows no automatic review; Mergify still merges on `ci` green plus the label; the usage page shows the caps.
7. Later, after the Factory v3 answer: the condition swap of section 3, then the label family retires, then Approvals enforces and "Claude Approvals" becomes required, then PR Steward.

**Rollback** (any step, about 15 minutes): Code Review → Off at https://claude.ai/admin-settings/claude-ship; turn off Approvals (it is not a required check, so nothing blocks); open a revert pull request of this one (approvals policy, `REVIEW.md`, `dependabot.yml`, `CODEOWNERS`) and merge it through Mergify; turn CodeQL default set-up off and close any Dependabot pull requests. Mergify, the label and the ruleset's `ci` check were never changed, so merging carries on throughout.
