# Brief: PF-6 part 2, the staff screens: Team, Invite people, the Person panel, Compare roles, Licences, My account and Accept invitation (map rows 5 and 6; R1.6) (cloud builder lane; row owner Lead B)

Written 16 Nov 10:1x IST by Lead B (6), rev 16.54, after Lead 64's ruling that R1.6 stays Partial until this part and J-6 part 2 are on `main`. The concept is `screens/pf-6-staff/concept.md` r2, approved 14 Nov, on branch `lead-b-front-office`; its board is `design/board.html`; r2's changes in `challenge.md` win over the board. **Model: Opus 5.5, effort: high**: new screens, permissions, a public page; reviewer and breaker at high, P-605.

**Two PRs (P-610):**
* **Part 2a** is the R1.6 half: Team, Invite people with Compare roles, and the Person panel (Roles, Access, Invitation). It starts when **PF-6 part 1** (#1912, queued) and **PF-6r** are on `main`, plus **PF-6m**, for its money line.
* **Part 2b** is the rest: Licences, My account's licence edit, the Security line, and the Accept invitation page. It starts when 2a is on `main`.

**Correction to PF-6's Done when (rows rev 16.10), Lead B, row owner:**
* The line "the role editor shows money keys and licence actions in their own groups, each ticked one by one … a custom role copied from a starter role …" assumes **custom roles**. Custom roles are **not in Release 1**: the concept §2 says "Not month one: … custom roles", and PF-6b's row says "custom roles, copying and direct grants are X-1" (Lead 53, 15 Nov).
* So the line is met by the screens that do exist, the role picker and Compare roles, in **DW3** below.
* Nothing is dropped: the custom-role line moves to X-1 with that row.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next screens PF-6 part 2a` (or `part 2b`) and take **one part** end to end on a fresh branch from `origin/main`, one PR.

**Read only these:**
* the concept `screens/pf-6-staff/concept.md` (all of it: 47 lines) and `challenge.md`'s Lead response, plus `design/board.html`;
* the requirement text the trace tool prints: `python3 product/tools/trace-requirements.py --brief PF-6` (AG-1-10, -12, -13, -15, -22, -30, -31, -40, -41, -42, -55, -66, -69, -70; SA-6-29, -44, Appendix C);
* on `main`:
  - PF-6 part 1's `web/src/modules/platform/` (`session.ts`, `frame.tsx`, `account-sections.ts`, `routes.tsx`), whose frame and holder you build in;
  - the routes in `api/src/platform/identity/routes.ts`, `identity/session/routes.ts` and `staff-read/routes.ts`, and PF-6r's `GET /api/platform/roles`, all through their tests;
  - FO-4's `sales/leads-page.tsx` (the house list and side-panel patterns).

**What to build** (new files under `web/src/modules/platform/staff/` and `…/account/`; route lines in PF-6 part 1's `routes.tsx`; menu entries through its lists; no API file):
* **Part 2a:**
  - **Team**, for `agent/staff:manage`: search; chips Active · Invited · Inactive; the table as concept §4; the seat line.
  - **Invite people**, a right panel: BR-1 to BR-3. The picker offers only the roles the inviter may give, and **never Owner**.
  - **Compare roles**: the six roles, can and cannot, in SA-06 Appendix C's plain words.
  - **The Person panel:**
    - **Roles:** BR-5's rules, with "Confirm it's you" for Owner by the step-up.
    - **Access:** Sign out everywhere; Deactivate with a reason (BR-7, with SA-6-44's only-Owner words, BR-6); Reactivate with the seat check (BR-2).
    - **Invitation:** resend and revoke (BR-4).
* **Part 2b:**
  - **Licences**: everyone's, for `agent/firm-credential:manage` (BR-8, the body list from `samples/representative-bodies-ca.json`).
  - **My account**: the own licence edit, and the two-step state with the provider's link. The account section is one entry in `ACCOUNT_SECTIONS`.
  - **Security**: only the read-only line "Two-step sign-in is required for everyone." (BR-9 option (a): `REQUIRE_TWO_STEP` is fixed on).
  - **Accept invitation**: the public page, with BR-4's three states.
* Every button follows concept §6's "who may do what". **The browser works out no rule:** it shows what the API answers, and the server's refusal words verbatim.

**Done when** (P-606: list the cases in the PR body first; the reviewer ticks one per line). In `tests/check_pf6_staff_browser.ts` (Playwright, the local stand-in, the seeded roles), a pass and a fail each:
* **Part 2a:**
  - `PF-6 DW1`: concept §6's journey up to the person panel. Invite, then accept in a second browser, then change roles, then Sign out everywhere, then deactivate: the person's next request is refused. Then reactivate.
  - `PF-6 DW2`: BR-1, BR-2, BR-3, BR-5, BR-6 and BR-7, each a pass and a fail.
  - **`PF-6 DW3` (R1.6, "money and licence apart", the corrected line).**
    - Compare roles and the role picker show **money permissions and licence actions in their own groups**, read from PF-6r's `class`, never by a group tick.
    - Giving a role that carries money keys (Billing and finance) shows **its own confirmation line naming the count**, "This gives <name> 12 money permissions." (concept §5's words if it has them), before Save.
    - Saving it writes the `money_keys_granted` line (PF-6m), read through the audit.
    - A role with none shows no such line.
  - `PF-6 DW4`: a Case Officer opening `/platform/team` by URL is refused on screen with the server's words, and its API call answers 403 (R1.6 "wrong role by URL refused on screen and API").
* **Part 2b:**
  - `PF-6 DW5`: BR-4's three Accept states.
  - `PF-6 DW6`: BR-8. The licence is never shown in a toast, a log line or an email (checked on the network log and the demo inbox).
  - `PF-6 DW7`: the Security line, and the My account licence edit.
* **Each part:**
  - `PF-6 DW8`: keyboard only; axe-core, with no serious or critical finding; 375, 1024 and 1440 widths.
  - `PF-6 DW9`: PF-6 part 1's, PF-4's, PF-4b's, PF-6b's, FO-4's and J-6's suites pass unchanged.

**Touch list:** new files under `web/src/modules/platform/staff/` and `web/src/modules/platform/account/`; PF-6 part 1's `modules/platform/routes.tsx` (route lines only) and `account-sections.ts` (one entry, 2b); the frame's menu list (Team · Licences · Security), by its list file if part 1 has one, else stop and ask; `tests/check_pf6_staff_browser.ts`; `web/src/MODULE.md` only if an invariant changes.

**Duplicate check (P-526):** BACKLOG (PF-6; PF-6r is its read; FO-3st2 and PF-13 part 2 also add entries to part 1's lists), open PRs (`modules/platform/staff`), BUGS; one `Duplicate check:` line per part.

**Parallel safety:** `routes.tsx` and `account-sections.ts` are shared by FO-3st2, PF-13 part 2 and PF-21s. Each adds its own lines only, and the second PR merges `main` in.

**Reviewer and breaker** (P-278: new screens, permissions, a public page). The breaker tries:
* an Admin giving Owner by a crafted request;
* the only Owner deactivating themself;
* an expired invitation link replayed;
* the Person panel for another firm's staff id;
* the seat line under two parallel invites.
The release holder reads the permissions diff (P-423).

**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5; no model switch mid-session. Finish whole: if an item turns out to need more than its touch list, stop and ask in a PR comment. Never widen the row silently, and never leave a part for later. Read only the requirement text named here.
**Rules (standard, every PF/FO brief):** P-559; one row, one session, one PR; new files only outside the touch list; Opus reviewer (P-303); re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270); before asking for the label, run the suites of every CI part red on an earlier head plus the shard that shares your demo database, and paste the result lines; live AI off, US$0, never a priced button (P-175); no real keys; push after every step (P-557); questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the queue and to **Lead B** (row owner, branch `lead-b-front-office`) for the row; every token earns its outcome (P-556).
