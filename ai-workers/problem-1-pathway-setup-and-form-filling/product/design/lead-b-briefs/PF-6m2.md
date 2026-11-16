# Brief: PF-6m2, the inviter re-checked at accept, and the money line at firm signup (PF-6m's breaker F1 and F4) (cloud builder lane; row owner Lead B)

Written 16 Nov 11:5x IST by Lead B (6), rev 16.60 (#1945 ruling). **Model: Opus 5.5, effort: high**: permissions. **Starts when:** PF-6m (#1945) is on `main`, because this row uses its helper, and no open PR touches `identity/session/service.ts` or `platform/firms/signup-identity.ts`.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime PF-6m2` and take **one row, PF-6m2**, end to end on a fresh branch from `origin/main`, one PR.

**Read only these:** `screens/pf-6-staff/concept.md` BR-1, BR-4, BR-5; BACKLOG PF-6b (2); on `main`: `api/src/platform/identity/session/service.ts` (the accept transaction), `identity/service.ts` (the rule that an inviter may give only roles whose keys it holds), PF-6m's money-line helper, and `platform/firms/signup-identity.ts`; `screens/PF-6m/break-report.md` F1 and F4.

**What to build:**
1. **The inviter is re-checked at accept** (F1). Inside the accept transaction, under its existing lock order, the accept checks two things:
   * the inviter (`invited_by`) is an **active** staff member of the same firm;
   * the inviter **may still give every role invited**, by the same check as invite time (BR-1: an Admin only roles whose every key it holds; Owner never at invite).

   If either fails, the answer is 410 "This invitation is no longer valid." (BR-4's words). The invitation is marked no longer valid, nothing is granted, and an audit line `platform.invitation.refused_inviter` names the reason (inactive, or the role no longer givable). Key names only.
2. **The money line at firm signup** (F4, PF-6b rule (2)). Signup's Owner grant calls PF-6m's helper with the actor `system:signup`, so the first Owner's money keys are logged like any other grant.

**Done when** (P-606), in `tests/check_pf6m2_invite_recheck.ts`, a pass and a fail each:
* `PF-6m2 DW1`: an Admin's invitation into Billing and finance, with the Admin then **deactivated** → accept answers 410 and grants nothing. The same with the Admin active → accepted, with one money line.
* `PF-6m2 DW2`: the Admin is **demoted** to Case Manager after inviting → 410. An Owner's invitation, the Owner still Owner → accepted.
* `PF-6m2 DW3`: a new firm's signup writes one `platform.staff.money_keys_granted` line for the Owner, with actor `system:signup`. A refused signup writes none.
* `PF-6m2 DW4`: PF-4b's, PF-5's, PF-6b's and PF-6m's suites pass unchanged. A replayed accept still gives one winner and 410s for the rest.

**Touch list:** `api/src/platform/identity/session/service.ts` (the re-check), `platform/firms/signup-identity.ts` (one call), `tests/check_pf6m2_invite_recheck.ts`.

**Duplicate check (P-526):** BACKLOG, open PRs (`identity/session`, `signup`), BUGS (the F1 row Lead 66 logs); one `Duplicate check:` line.

**Reviewer and breaker** (P-278). The breaker tries a deactivation racing the accept, and an inviter reactivated before the accept. The release holder reads the diff (P-423).

**P-610:** about 200 lines.

**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5; no model switch mid-session. Finish whole: if an item turns out to need more than its touch list, stop and ask in a PR comment. Never widen the row silently, and never leave a part for later. Read only the requirement text named here.
**Rules (standard, every PF/FO brief):** P-559; one row, one session, one PR; new files only outside the touch list; Opus reviewer (P-303); re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270); before asking for the label, run the suites of every CI part red on an earlier head plus the shard that shares your demo database, and paste the result lines; live AI off, US$0, never a priced button (P-175); no real keys; push after every step (P-557); questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the queue and to **Lead B** (row owner, branch `lead-b-front-office`) for the row; every token earns its outcome (P-556).
