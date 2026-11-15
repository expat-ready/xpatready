# Brief: PF-21w, the complaint routes (PF-21's part 2; cloud builder lane; row owner Lead B)

Written 15 Nov by Lead B (6). Replaces the PF-21w line of the shared `ROW-w.md` brief (rev 16.4). **Ready now:** PF-4 #1744 and PF-21 #1753 are on `main`; no PF-21w PR exists (checked 15 Nov 14:10 IST). Map row 109 needs this and PF-21s (J-109). Effort: Opus 5.5 **high** (permissions row, P-608).

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime PF-21w` and take **one row, PF-21w**, end to end on a fresh branch from `origin/main`, one PR.

**The row:** PF-21 built the complaints register as a service whose header says "routes wait for PF-4's @PermissionKeys". PF-21w wires them. No rule moves into the controller; the service keeps every rule. Requirement text: only what `python3 product/tools/trace-requirements.py --brief PF-21` prints.

**Read only these:** `api/src/platform/complaints/complaints.ts` (its header "Who" lines, `ComplaintsService`, `registerComplaintJobs`), `api/src/front-office/retainers/routes.ts` (the pattern), `api/src/features/front-office-booking.ts` (how a feature registers providers and jobs), `api/src/platform/identity/keys.ts` and `guard.ts`.

**The routes** (prefix `api/platform/complaints`; new `api/src/platform/complaints/routes.ts`; new `api/src/features/platform-complaints.ts` registering the controller, `ComplaintsService` and the reminder job through `registerComplaintJobs`):

| Route | Declares | Service |
|---|---|---|
| `POST /` | `@PermissionKeys("agent/complaint:record")` | `record` |
| `GET /?view&cursor&limit` | `@AnyStaff("the handler sees their own; agent/complaint:read sees all, checked by the service")` | `list` |
| `GET /:id` | `@AnyStaff(same)` | `get` |
| `POST /:id/acknowledge`, `/:id/steps`, `/:id/response-sent`, `/:id/close` | `@AnyStaff("the handler handles their own; record + read act on any, checked by the service")` | `acknowledge`, `addStep`, `responseSent`, `close` |
| `POST /:id/handler` | `@PermissionKeys("agent/complaint:record", "agent/complaint:read")` | `changeHandler` |
| `DELETE /:id` | `@AnyStaff("refused for everyone: a complaint is never deleted")` | `remove` |

**Named test cases (P-606):** list `PF-21w DW1` to `DW9` in the PR body before writing code; the reviewer ticks one per line. File `tests/check_pf21w_routes.ts`, a pass and a fail each, on the six seeded roles:
* **DW1** record: OWNER, ADMIN, CASE_MANAGER → 201; CASE_OFFICER, BILLING_FINANCE, READ_ONLY → 403 (P-601).
* **DW2** list and get: OWNER and ADMIN see every complaint; a CASE_OFFICER handler sees only their own; another person's complaint → 404, never 403.
* **DW3** handling steps: the handler without either key acknowledges, adds a step, marks the response sent and closes their own → 200; a non-handler without the keys → 404.
* **DW4** change handler: needs both keys (only OWNER and ADMIN hold both) → 200; a CASE_MANAGER (record only) → 403; an inactive staff member as the new handler → the service's field error.
* **DW5** DELETE → refused for every role, and the row and its events are unchanged.
* **DW6** a closed complaint changes only by a new event; a second close → the service's refusal.
* **DW7** no token → 401 on every route.
* **DW8** firm A's token on firm B's complaint id → 404 on every `/:id` route.
* **DW9** PF-4's start-up check passes; `assertEveryRouteDeclared` refuses the route list with one route stripped of its declaration. The reminder job is registered once (a second start registers nothing new).
Then **PF-21w W1**: record → it appears in "open" → acknowledge → step → response sent → close (outcome RESOLVED) → it appears in "closed" with `complaint.closed` in the outbox.

**Touch list (nothing else):** `api/src/platform/complaints/routes.ts` (new), `api/src/features/platform-complaints.ts` (new), `tests/check_pf21w_routes.ts` (new). A needed change to `complaints.ts` → stop and ask in a PR comment. **R3-m1** (PF-21 review round 3, optional, passed to PF-21w): take it only if it fits the touch list, else say so in the PR.

**Must still be true:** PF-21's suite, PF-4's suite, every other suite, the demo reset and C10.1 pass unchanged. qa counts row 109 only after J-109 (P-606 (3)).

**Duplicate check (P-526):** BACKLOG, open PRs (`PF-21w`, `api/platform/complaints`), BUGS; one `Duplicate check:` line.

**Reviewer and breaker** (P-278: permissions, personal data). The breaker tries DW2, DW3 and DW8. The release holder reads the permissions diff before the label (P-423).

**P-610:** under 800 changed lines, tests included (expected ~400). Split point if it would pass 800: part 1 record, list, get, DELETE (DW1, DW2, DW5, DW7-DW9); part 2 the handling routes and change handler (DW3, DW4, DW6, W1). Re-review reads only the new commits (P-277).

**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5; no model switch mid-session. Finish whole: if an item turns out to need more than its touch list, stop and ask in a PR comment. Never widen the row silently, and never leave a part for later. Read only the requirement text the trace tool prints.

**Rules (standard, every PF/FO brief):** P-559: firm tables, real sign-in and billing are ours in the PF/FO modules (amends P-335/P-357). One row, one session, one PR; new files only outside the touch list. Opus reviewer (P-303); re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270). **Before asking for the label (rows rev 16, Lead 47: 4 of 4 labelled PRs went red after the label on 14 Nov):** run, on `main` merged into your branch, the suites of every CI part that was red on any earlier head of this PR, plus every suite in the shard that shares the demo database with yours, and paste the result lines in the PR. Live AI off, US$0, never a priced button (P-175). No real keys anywhere. Push after every step (P-557). Questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the merge queue and to **Lead B** (row owner, branch `lead-b-front-office`, hand-over `product/design/lead-b-state.md`) for the row. Cross-module port interfaces, their fakes and shared event payload types go in `prototype/studio/ports/` (`zod` only; case-side contract v0.1 §1 rule 3); adapters stay in the module's folder; never import `engine/` or case-side files (rows rev 14.1). Event names come from `prototype/studio/ports/events.ts` (`EVENT.*`, FO-1a); add a new name there, never a string literal (rev 15.1). A database function in your migration carries your area's prefix (`fo_sales_`, `fo_booking_`, `fo_compliance_`, `fo_signing_`, `fo_retainer_`, `money_`, `msg_`, `plat_`, `platform_`), never a bare `fo_` name another area may also use, and your migration's stamp is later than the newest on `main` when it merges (rows rev 15.2, the FO-1a/FO-1b clash). Every token earns its outcome (P-556): read only the files named here and the code you change.
---
