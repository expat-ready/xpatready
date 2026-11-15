# Brief: PF-Lc, the Cognito admin library in one PR (cloud builder lane; row owner Lead B)

Written 15 Nov 14:3x IST by Lead B (6). Row: rev 16.20 (`design/lead-b-rows-2026-11-14.md` on `lead-b-front-office`; to be copied into BACKLOG by the current Lead). It comes from PF-4b's question 4 (#1816, comment 6892000038). **Ready now; waits on nothing.** It unblocks PF-4bc (the `cognito` side of PF-4b's `IdentityAdminPort`). Effort: Opus 5.5 medium.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime PF-Lc` and take **one row, PF-Lc**, end to end on a fresh branch from `origin/main`, one PR.

**Read only these:** `product/design/tech-gate-platform-front-office-2026-11-14.md` on `main` (PF-2's gate: its entries for `nodemailer` and `@aws-sdk/client-sesv2` are the shape to copy), `product/STANDARDS.md` §1, `main`'s `package.json`.

**What to do:**
* Add one entry to the gate file in its existing shape: **`@aws-sdk/client-cognito-identity-provider`**. Give the problem (Cognito admin calls for staff sign-in: AdminCreateUser with `MessageAction=SUPPRESS`, AdminSetUserMFAPreference / reset MFA, AdminUserGlobalSignOut, the code exchange), the options weighed (this SDK, or plain HTTPS with a hand-written SigV4 signer, which is rejected because it is custom crypto code; P-502, P-587), its licence at source (Apache-2.0 expected; read it), maintenance, and the security policy.
* **Version:** the newest release whose publish date is **at least 14 days before the PR**, preferring the one that matches `@aws-sdk/client-sesv2`'s pinned `3.1161.0` if that is old enough, so the two share `@aws-sdk/*` core packages. Pin it exactly, with no `^` or `~`.
* Add it with `npm install --save-exact`, and never edit the lockfile by hand.

**Named test cases (P-606), list them in the PR body first:**
* **DW1** the exact version is pinned, and its publish date (≥ 14 days old) and licence URL are in the PR;
* **DW2** `npm ci` passes from a clean clone;
* **DW3** every suite passes unchanged (the CI parts on the PR head);
* **DW4** `npm audit` shows no high or critical advisory for the added package or its new dependencies (paste the summary);
* **DW5** no code imports it yet (`git grep` result pasted);
* **DW6** the lockfile adds no second copy of an `@aws-sdk/*` core package already present (`npm ls @smithy/types` and `npm ls @aws-sdk/core` pasted; one version each, or the reason why not).

**Touch list (nothing else):** `package.json`, the lockfile, the gate file.

**Duplicate check (P-526):** BACKLOG, open PRs (any other PR touching `package.json` or the lockfile; if one is open, say so and wait rather than race, P-576 (4)), and `main`'s `package.json`; one `Duplicate check:` line.

**Reviewer only (no breaker).** The release holder reads the diff (P-423: dependencies).

**P-610:** a dependency PR. The lockfile diff is generated, so state its size; the hand-written part stays small. There is no split.

**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5; no model switch mid-session. Finish whole: if an item turns out to need more than its touch list, stop and ask in a PR comment. Never widen the row silently, and never leave a part for later. Read only the requirement text the trace tool prints.

**Rules (standard, every PF/FO brief):** P-559: firm tables, real sign-in and billing are ours in the PF/FO modules (amends P-335/P-357). One row, one session, one PR; new files only outside the touch list. Opus reviewer (P-303); re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270). **Before asking for the label (rows rev 16, Lead 47: 4 of 4 labelled PRs went red after the label on 14 Nov):** run, on `main` merged into your branch, the suites of every CI part that was red on any earlier head of this PR, plus every suite in the shard that shares the demo database with yours, and paste the result lines in the PR. Live AI off, US$0, never a priced button (P-175). No real keys anywhere. Push after every step (P-557). Questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the merge queue and to **Lead B** (row owner, branch `lead-b-front-office`, hand-over `product/design/lead-b-state.md`) for the row. Cross-module port interfaces, their fakes and shared event payload types go in `prototype/studio/ports/` (`zod` only; case-side contract v0.1 §1 rule 3); adapters stay in the module's folder; never import `engine/` or case-side files (rows rev 14.1). Event names come from `prototype/studio/ports/events.ts` (`EVENT.*`, FO-1a); add a new name there, never a string literal (rev 15.1). A database function in your migration carries your area's prefix (`fo_sales_`, `fo_booking_`, `fo_compliance_`, `fo_signing_`, `fo_retainer_`, `money_`, `msg_`, `plat_`, `platform_`), never a bare `fo_` name another area may also use, and your migration's stamp is later than the newest on `main` when it merges (rows rev 15.2, the FO-1a/FO-1b clash). Every token earns its outcome (P-556): read only the files named here and the code you change.
---
