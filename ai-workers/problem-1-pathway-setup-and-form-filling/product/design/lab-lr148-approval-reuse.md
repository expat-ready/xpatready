# LR-148: keep the Claude Approvals result across a pure merge from main

Lab lane note (started by the Lab lane starter routine, A451), 28 Nov 2026 19:49 IST, from origin/main b8b565f512015b66a48e13e84f21f15f256eafdf.

* Register row: LR-148 (ship-security, class A, bundle A6).
* Done when (register, quoted): "a main-merge-only push keeps the approval (observe log)".
* Plan: on the routine (catch-all) rule of `.claude/approvals.yml` only, `reuse: "claude/diff <= trivial"`; no `reuse` on risky rules (gap research row 8); `same_intent` only after the observe week. A check in `check-approvals-policy.sh` holds both points.
