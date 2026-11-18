# Brief: AUD-1m, the case side's audit writes join the one trail (cloud builder lane; row owner Build Lead C)

Written 18 Nov 23:0x IST by Build Lead C. **Approved for building.** This is Release 1 row **R1.8** (map row 8), the third row of the series after AUD-1a (#2003, merged) and AUD-1b (#2124). The row text is BACKLOG `AUD-1m` (line 1123 on `main`); where this page differs, this page wins. The release holder's OK on the touch list is given here: Build Lead C holds the release rows (P-607).

**Model:** Opus 5.5, effort high (audit trail, many files).

**Ready when:** now, as an overlapped chain (Lead 81, 18 Nov 22:5x IST).
* Branch from the head of AUD-1b (#2124, `claude/runtime-aud1b`), not from `main`.
* Build and test it, and get "Reviewer: Approve <head>" on the branch.
* Open the PR only after #2124 merges. Then merge `main` into it (P-270) and get a diff-only Approve on the new head.

**Two parts, one PR each (P-610, under 800 changed lines with tests):**

**Part 1: `Audit.log` goes through the port.**
* `api/src/core.ts`: `Audit.log` keeps its signature and becomes a caller of `AuditPort.record`.
  * `firm_id` comes from the request context when the case side's walls set it (CS-W1), and is null otherwise.
  * `case_id` is derived where `entity` or `entityKey` names a case, parsed the same way `case-feed.ts` parses it today.
  * It writes inside the caller's transaction only when the caller passes `tx`.
* `ports/audit.ts`: `AREA_ENTITY` stays for the PF and FO callers. A second schema, `CaseEntry`, accepts the case side's entity words. A case line is never read as a platform line, and the reverse: extend the sweep in `check_case_feed.ts`.
* Actor words are AUD-1a's typed words: `staff:<id>`, `person:<id>`, `system:<door>`, `seed:<row>`, or a listed simulated person (`user-A/B/C/O/R/T/S` for staff, `user-P/Q` for clients). Never a bare word such as `test`. A case-side caller that passes an untyped word today is listed in the PR body and mapped, not silenced.

**Part 2: the 20 files.**
* The 25 direct `auditEvent.create` writes in 20 files (case-side contract v0.1 §2.5 has the list) move to `AuditPort.record`, one line each.
* Part 2 branches from part 1's head, with the same overlap rule.

**Done when (P-606), in `tests/check_aud1m_case_writes.ts` (isolated database, no live calls). Each check has a pass and a fail:**
* `git grep "auditEvent.create"` under `api/src` finds only the adapter. Keep the grep as a check. It fails in part 1 for the 20 files and passes after part 2; part 1 asserts the count it leaves, so nothing new is added.
* A case action's line carries its `case_id`.
* A line written with `tx` disappears when that transaction rolls back.
* Every case suite passes unchanged.
* The firm's case feed shows the same lines as before on the demo.
* AUD-1a's and AUD-1b's suites pass unchanged.
* `node studio/tools/check-port-contracts.mjs` exits 0, and full `ci` is green.

**Touch list:**
* Part 1: `api/src/core.ts` (`Audit.log`), `ports/audit.ts` (`CaseEntry`), `tests/check_aud1m_case_writes.ts`, `tests/check_case_feed.ts` (the sweep), and one line in `api/src/core` MODULE card.
* Part 2: the 20 files, one line each.
* No schema and no migration. If one is needed, ask first (P-600 slot).

**Review:** an Opus reviewer (the row says reviewer only).

**Standard rules:**
* One part, one PR.
* PR rule (P-683): get "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft.
* Never push to an open PR unless it is a fix.
* Live AI off, US$0, never a priced button (P-175).
* Push after every step (P-557).
* Questions go on the branch or the PR as "Question for the tech lead: …"; Build Lead C answers within 30 minutes.
* If a site is blocked on the cloud network, write "Not verified: <site> blocked on the cloud network" and go on.
* Repository: `expat-ready/xpatready`.
