# Brief: `<row>w`, staff routes for a row that merged its schema and service first (cloud builder lane; row owner Lead B)

Rows rev 16.4. **Start the day PF-4 (#1744) is on `main`** and the row's part 1 has merged. If the lane that built part 1 is still open, it does this too; otherwise start a fresh one. Paste into a new cloud session on the repository (default branch `main`), with `<row>` replaced:

| `<row>w` | Part 1 | Routes and keys | Waits on |
|---|---|---|---|
| **PF-21w** | PF-21 #1753 | the complaint routes. `agent/complaint:record` goes to OWNER, ADMIN and CASE_MANAGER, and `agent/complaint:read` to OWNER and ADMIN (P-601); the handler reads their own complaints without the key | PF-4, #1753 merged |
| **FO-3sr** (FO-3's staff routes; rev 16.4 called it "FO-3w-staff", renamed so it isn't confused with FO-3w, the public booking screens) | FO-3 #1760 | staff create, reschedule and cancel bookings, using FO-3's `agent/booking:*` keys as its row names them (AG-4-67 visibility: a host always sees their own) | PF-4, #1760 merged |
| **PF-25w** | PF-25 #1763 | the staff-only address change (`system/firm:address`, with a reason, audited) | **PF-4s** (our own staff's sign-in), not PF-4, plus #1763 merged |

**FO-5** has no `w` row: its part 2 is FO-5's own API PR (the FO-5 brief's schema → API split), which starts once PF-4 and part 1 #1761 have merged.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime <row>w` and take **one row, `<row>w`**, end to end on a fresh branch from `origin/main`, one PR.

**The row:** `product/BACKLOG.md`, rows rev 16.4 (the `<row>w` rule) with the part-1 row it finishes. Read only these with it:
* the part-1 PR's body: its list of services waiting for routes, and its "part 1 of 2" line;
* on `main`: PF-4's `api/src/platform/identity/keys.ts` (`@PermissionKeys`, `@AnyStaff`, `staffOf`) and `guard.ts`;
* the part-1 service files;
* `api/src/features/README.md`.

**What to build:**
* `api/src/features/<area>.ts` registers a controller.
* Every route declares its keys with `@PermissionKeys(...)`; PF-4's guard refuses any undeclared route at start-up.
* Each handler calls the part-1 service with `staffOf(req)` as its `StaffContext`.
* No rule moves into the controller; the service keeps every rule.

**Test `tests/check_<row>w_routes.ts`**, a pass and a fail each:
* every route with its key → 2xx;
* each role without the key → 403;
* no token → 401;
* firm A's token on firm B's record → 404;
* PF-4's start-up check passes with the new routes.
Then a short scripted journey through the routes, as the part-1 Done when describes it.

**Touch list (nothing else):** `api/src/features/<area>.ts`, the controller file in the part-1 folder, `tests/check_<row>w_routes.ts`.

**Must still be true:** part 1's suite, PF-4's suite, every other suite, the demo reset and C10.1 pass unchanged. qa counts the capability only after this PR (P-592): say so in the PR body.

**Duplicate check (P-526):** BACKLOG, open PRs (`<row>w`, the controller name), BUGS; one `Duplicate check:` line.

**Reviewer only, plus the breaker for permissions** (P-278: permissions). The release holder reads the permissions diff before the label (P-423).

**Rules (standard, every PF/FO brief):** P-559: firm tables, real sign-in and billing are ours in the PF/FO modules (amends P-335/P-357). One row, one session, one PR; new files only outside the one migration folder. Opus reviewer (P-303); re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270). **Before asking for the label (rows rev 16, Lead 47: 4 of 4 labelled PRs went red after the label on 14 Nov):** run, on `main` merged into your branch, the suites of every CI part that was red on any earlier head of this PR, plus every suite in the shard that shares the demo database with yours, and paste the result lines in the PR. Live AI off, US$0, never a priced button (P-175). No real keys anywhere. Push after every step (P-557). Questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the merge queue and to **Lead B** (row owner, branch `lead-b-front-office`, hand-over `product/design/lead-b-state.md`) for the row. Cross-module port interfaces, their fakes and shared event payload types go in `prototype/studio/ports/` (`zod` only; case-side contract v0.1 §1 rule 3); adapters stay in the module's folder; never import `engine/` or case-side files (rows rev 14.1). Event names come from `prototype/studio/ports/events.ts` (`EVENT.*`, FO-1a); add a new name there, never a string literal (rev 15.1). A database function in your migration carries your area's prefix (`fo_sales_`, `fo_booking_`, `fo_compliance_`, `fo_signing_`, `fo_retainer_`, `money_`, `msg_`, `plat_`, `platform_`), never a bare `fo_` name another area may also use, and your migration's stamp is later than the newest on `main` when it merges (rows rev 15.2, the FO-1a/FO-1b clash). Every token earns its outcome (P-556): read only the files named here and the code you change.
---
