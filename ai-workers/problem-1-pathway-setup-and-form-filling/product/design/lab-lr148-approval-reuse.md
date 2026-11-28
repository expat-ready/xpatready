# LR-148: keep the Claude Approvals result across a pure merge from main

Lab lane note (started by the Lab lane starter routine, A451), 28 Nov 2026 19:49 IST, from origin/main b8b565f512015b66a48e13e84f21f15f256eafdf.

* Register row: LR-148 (ship-security, class A, bundle A6).
* Done when (register, quoted): "a main-merge-only push keeps the approval (observe log)".
* Plan: on the routine (catch-all) rule of `.claude/approvals.yml` only, `reuse: "claude/diff <= trivial"`; no `reuse` on risky rules (gap research row 8); `same_intent` only after the observe week. A check in `check-approvals-policy.sh` holds both points.

## Outcome after round 1 (28 Nov, 20:1x IST)

The docs (approvals-policy `reuse` and "Earlier approvals after a new push", approvals-classifiers `claude/diff`, read 28 Nov) show the planned line keeps nothing on our policy:
* `reuse` keeps people's approvals (seats) and the answers of classifiers the rule reads. The catch-all has `seats: 0` and reads none.
* Claude's own approval is dismissed and given again when the check passes again, whatever `reuse` says.
* A push that leaves the diff's text identical (most merges of main) keeps approvals with no `reuse` at all.
* `claude/diff` is billed for each answer that calls a model.

So the PR adds no `reuse` line. A7 refuses `reuse` anywhere (rules, overrides, locals) and `same_intent`, until the tech lead writes otherwise.

The churn row 8 names is the `review: approved` label that the label guard drops on a push (P-318). That is Mergify and label-guard work, not Approvals: it goes back to the tech lead.
