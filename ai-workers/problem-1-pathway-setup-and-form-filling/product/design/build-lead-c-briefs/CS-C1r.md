# Brief: CS-C1r, a reopen checks the plan's case limit under the opening lock (bug row; cloud builder lane; row owner Build Lead C)

Written 19 Nov 21:0x IST by Build Lead C (3). Found by PF-15c's breaker (#2307, comment 7013468221) and passed on by Lead B (7). There is no BACKLOG row yet; the current Lead adds **CS-C1r** (P-314), and this page is its text. It serves Release 1 rows **R1.20** (plan limits: PF-15, Lead B's), whose case limit a reopen can break today, and **R1.77** (reopen, CS-C1).

**PR title:** `runtime: CS-C1r — a reopen is refused at the plan's case limit, under the same opening lock as a new case`
**Model:** Opus 5.5, effort high (a lock order, a plan limit). Breaker on (a race).

**The bug (on `main` 6f2caced0):** `CaseClose.reopen` (`api/src/case-close.ts` ~line 197) sets a CLOSED case back to OPEN after only the case-row lock. `Runtime.createCase` (`api/src/runtime.ts` ~lines 305-311) takes `pg_advisory_xact_lock(hashtext('case-open:<firm key>'))`, counts the active cases of the group (`PgCaseCount.activeCounts`), and asks `EntitlementPort.check`. A refusal is 409 `PLAN_LIMIT_REACHED` and writes nothing (MODULE.cases.md: "An opening checks the plan limit in its own transaction"). A reopened case counts as active again (OPEN, and no filing decided since the last reopen), so a reopen is an opening, and today it can take a firm over its limit.

**Ready when:** **#2307 (PF-15c) and #2289 (AUD-1m part 2a, which changes `case-close.ts`'s audit line) are on `main`.** #2307 binds PgEntitlements for `createCase` and touches `runtime.ts`. #2255 (FO-8) and CS-K1 part 2 also touch `createCase`: whichever merges second merges `main` (P-270).

**What to build:**
* **One opening check, used by both.** Move the lock, count and check out of `createCase` into one function, e.g. `checkOpening(tx, firmKey, group, entitlements)` in `api/src/case-count.ts`. Its words, its 409 body (including PF-15c's upgrade path) and its group rule (the Pathway's client type: CORPORATE, else individual) stay exactly as they are. `createCase` calls it unchanged in behaviour, and `reopen` calls it.
* **Lock order in reopen:** take the advisory lock (the firm key from the session's context) **before** `locked()` takes the case row. Then re-read the status, count and check, all in the one transaction. Two reopens, or a reopen and an opening, at the limit end with exactly one success.
* **The same EntitlementPort binding:** `CaseClose` gets the port the way `Runtime` does since PF-15c (`useEntitlements`, or the feature binding PF-15c uses). There must be no second, allow-all fake on the reopen path.
* The reopen's other rules (reason, closing fields cleared, audit line, `case.reopened` event) are unchanged.

**Named test cases** (P-606), file `tests/check_csc1r_reopen_limit.ts`, a pass and a fail each:
* **DW1:** on a plan with 10 open individual cases and a limit of 10, reopening a closed individual case gives 409 `PLAN_LIMIT_REACHED` with the metric, limit, used and upgrade path. The case stays CLOSED, and no audit line or event is written (rows counted before and after). Pass: at 9 open, the reopen succeeds.
* **DW2, group:** at the individual limit, reopening a CORPORATE case under its own group's limit succeeds.
* **DW3, race:** at 9 of 10, a reopen and a new opening run at once (two connections, each held at its first statement). Exactly one succeeds and the count ends at 10.
* **DW4, one rule:** a spy on `checkOpening` sees both `createCase` and `reopen` call it. Fail: a stand-in reopen that skips it is caught by DW1.

**Done when:** `tsx studio/tests/check_csc1r_reopen_limit.ts` exits 0 with DW1-DW4 passing and failing as named. These pass unchanged: `check_csc1_close.ts`, `check_csc1_count.ts`, `check_pf15c_case_limits.ts`, `check_pf15_cases.ts`, `check_csk1_client.ts`, `tests/journeys/j_77.ts` and `tests/qa/check_r177_case_decision.ts`. Full `ci` is green. No schema, no migration.

**Review:** fresh Opus reviewer and breaker (the race, the lock order, another firm's limit).

**Duplicate check:** `git grep -n "case-open:" origin/main -- prototype/studio/api` finds only `runtime.ts`; `case-close.ts` has no limit check; the only open PR changing `case-close.ts` is #2289 (its audit line; the wait above). Checked 19 Nov 21:0x IST.

**Rules (standard, every Build Lead C brief, P-644):** Opus 5.5 at the effort above, no model switch mid-session (P-605, P-608). **Whole part first** (P-644 (1)): this PR finishes the part named here; if it must split (over 800 changed lines, P-610), stop and ask in a PR comment before coding, so Build Lead C lists the sub-parts first. Finish whole: an item that needs more than the touch list → stop and ask in a PR comment headed **"Question for the tech lead"** (Build Lead C answers within 30 min); never widen the row silently, never leave a piece for later (P-606). One part, one session, one PR from a fresh branch off `origin/main`; new files only as listed. Duplicate check (P-526): one `Duplicate check:` line in the PR body. A **fresh Opus reviewer** (P-303); re-review reads only the new commits (P-277). The label `review: approved` only after `Reviewer: Approve <sha>` on the exact head, as a line of its own, **and** green CI on that sha (P-277, P-385); the Lead applies it (P-384); never push to a PR carrying `queued`. Merge `main` only on a conflict (P-270). Before asking for the label after a failed merge batch, name the failing suites and show them covered (P-731 (2)). **Live AI off, US$0, never a priced button, no real keys** (P-175). Times only from the clock port (P-607). Push after every step (P-557). Event names from `ports/events.ts`. Report to the current Lead (`tools/current-lead.sh`) for the queue and to **Build Lead C** (row owner, branch `claude/build-lead-c-647b40`, state file `product/design/build-lead-c-state.md`) for the row. Read only the files this page and the draft name and the code you change (P-556).

**PR rule (P-683):** get "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft. Never push to an open PR unless it is a fix.
