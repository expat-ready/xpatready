# Open-contribution gate: measured against the open-source standard (22 Nov 2026)

Asked by the founder (P-785 (2), 22 Nov: "nobody can break my main", "industry standard", "anybody can come into my lab and start"). Written by the runtime lane, 22 Nov ~11:3x IST, main `01841047d`. No code in this PR; the fixes are separate small PRs (steps 1-4 below), each read by the Lead before it merges (P-423).

## How it was measured
- **GitHub's rules on `main`**: `GET /repos/…/rules/branches/main` (public, read-only), 22 Nov 11:1x IST. The ruleset's own detail (bypass list, names) is **not known**: the agents' deny list blocks ruleset and branch-protection reads in sessions on purpose (`engineering-approved-setup.json`), so that read was refused and not retried. The heartbeat workflow is the one reader.
- **The queue**: `.mergify.yml` on main. **The guards**: `queue-gate.sh`, `label-guard.sh`, `lead-read-guard.sh`, `lead-read-paths.txt`, the 22 workflows under `.github/workflows/`.
- **The gap PRs**: #2897 and #2900, their merged diffs and comments.

## What is true today
| Standard practice | Today, measured | Verdict |
|---|---|---|
| Required checks | One required check, `ci` (not "strict": GitHub does not ask for an up-to-date branch). Deleting `main` and force-pushing it are blocked. Classic branch protection is off; the ruleset does the work. | Met |
| Merge queue tests on the latest main | Mergify builds each batch on today's main and merges only when `ci` passes on it; `queue-fresh` re-tests a stale PR first. | Met |
| Signed-off review | The ruleset asks for a pull request with **0** approving reviews, no code-owner review, no approval of the last push. The review is a PR comment line `Reviewer: Approve <sha>` plus the label `review: approved`; **only Mergify reads them**. Anyone with write access can press Merge on a green PR with no label and no review: GitHub itself does not stop it (the merge guard is a hook inside each agent copy). | **Gap 1** |
| An owner per sensitive path (CODEOWNERS) | No CODEOWNERS file. The Lead's read (P-423) is kept two ways: the auto-labeller skips paths in `lead-read-paths.txt`, and a hook inside each copy refuses the label. **Nothing on GitHub's side holds the queue**: a label put on by hand or by the auto-labeller queues the PR. The path list has no permissions line, and a permission route is not a path: #2897 added `@PermissionKeys` routes in `platform/settings/offices/routes.ts`, was labelled by the queue gate at 01:25 UTC and queued at 01:31; the Lead's read came at 01:51, 14 minutes before the merge, by luck. (#2900's merged diff shows no permission line; it queued the same way.) | **Gap 2** |
| Separate identities for author, reviewer and owner | Every session (builders, reviewers, the Lead) comments as one GitHub account. A `Reviewer: Approve` or `Lead read` line proves the line was written, not who wrote it. | **Gap 3** |
| Outside contributor is safe by default | Good: a fork PR's `ci` names no PR, so it gets no `queue-fresh` and never queues by itself; `/run` comments work for members only; the guards that hold write tokens run main's copy (`pull_request_target`) and never check out PR code; an outsider cannot label. Not known: whether a first-time contributor's workflow run needs approval (a repository setting; not readable here). | Met, one unknown |
| Unrelated work never fails together | Fenced API modules have scopes. **Web, tests, the unfenced API files and unscoped schema files are in no scope** (`.mergify.yml` lines 21-23): they batch together across areas. **Migrations are one scope with capacity 1**, so platform and case-side migrations wait on each other, and branches re-stamp migration timestamps after every main move. | **Gaps 4, 5** |
| CONTRIBUTING page, PR template | Neither exists. The rules are in `WAY-OF-WORKING.md` and the `next` skill, written for our agents; `pr-rules` and the label guard demand body fields a newcomer cannot guess. | **Gap 6** |
| Issue-to-PR acceptance tests | Met in our own form: a row has "Done when" naming its test; `pr-rules` checks the body; `item-proof` runs the item's pack and journey at merge. Rows live in `BACKLOG.md`, not GitHub issues. | Met (ours) |

## Gaps, smallest fix, risk to the running queue
| # | Gap | Smallest fix | Risk to today's 14 lanes |
|---|---|---|---|
| 2 | Lead's read not enforced on GitHub; permission routes unseen | **Step 1.** A commit status `lead-read`, set by main's copy of a small script from the PR's file names and patch lines (API only, no PR code run): failure while the PR touches a kept path, or adds or changes a permission key or a guarded-route line, and no comment `Lead read: OK <head sha>` (the current `Lead read the diff: <sha>` counts too) names the head. The queue waits on it with `-check-failure = lead-read`, the form #2738 uses: a missing run stalls nobody. One list (`lead-read-paths.txt`), so #2428's lines fold in. | Low. Report-only first (P-717 (b)); the queue line is its own later PR. More PRs will wait for the Lead: step 1 measures how many of the last 200 merges would have been held. |
| 4 | Web, tests, unfenced API in no scope | **Step 2.** `web/src/modules/<area>/**`, `tests/check_<area>*` and the unfenced API files join their area's scope; `check-mergify-scopes.sh` fails when a new module folder has no scope. | Medium. Changes which PRs batch together the moment it merges; `engineering-approved-setup.json` pins scopes, so it moves in the same PR. Merge in the night window. |
| 5 | One migration lane | **Step 3.** A lane per area, only if a fixture proves two areas' migrations apply in either order and `prisma migrate deploy` is clean both ways. Not proven → stop and say so. | High if wrong (60% failures measured for two migrations, 16 Nov). Never forced. |
| 6 | No CONTRIBUTING, no PR template | **Step 4.** One page at the root pointing to the rule files; a template carrying the fields `pr-rules` and the label guard already ask for. | None (records and a template; `.github/` keeps the Lead's read). |
| 1 | GitHub lets a write-access account merge without review | The founder's setting, not this lane's: the ruleset asks for 1 approval, or lists `lead-read` and `queue-fresh` as required checks once they have run clean. | Not ours to change (repository settings). Question for the founder through the Lead. |
| 3 | One account for every role | The founder's choice: a second account or a GitHub App for the Lead's read and the reviewer, then CODEOWNERS plus "require code-owner review". Until then step 1's line is as strong as the reviewer's line is today. | Not ours to change. Step 1 does not depend on it. |

## Overlapping open PRs (duplicate check, 22 Nov)
| PR | What | Proposal |
|---|---|---|
| #2428 | Lead-read paths gain permissions (`permission`, `platform/identity/`), drop screenshots and records | Sound, and still path-only: it would not have caught #2897. **Keep and merge it**; step 1 reads the same list and adds the content rule. |
| #2445 | `check-mergify-scopes.sh` on every PR and batch | **Merge before step 2**: step 2's new scope rule needs it to bite on the PR that adds a folder. |
| #2595 | `pr-rules` as a queue condition | Independent. Step 4's template makes its fields visible. No change. |
| #2738 | Readiness gate (dequeued) | Independent; step 1 copies its `-check-failure` form. No change. |
| #2754 | `max_parallel_checks` 6 to 12 | Touches the same file as steps 2-3: whichever merges second merges main first. No change. |

## Questions for the tech lead
1. Step 1 starts report-only; who adds the queue line after 10 clean runs, this lane or the Lead? **Recommendation:** this lane opens it as a draft now, the Lead labels it when the runs are clean.
2. Gaps 1 and 3 need the founder (settings, a second identity). **Recommendation:** put both to him as one choice after step 1 runs clean, with the cost stated.
