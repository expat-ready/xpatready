# AUD-5: resume note (parked)

**Parked** by the tech lead (Lead 82, 00:3x IST 19 Nov), under founder decision P-707: finish the Wave 1 rows to Proven first. AUD-5 is Wave 2. Do not open the part 2 PR until the tech lead restarts this lane with a message pointing here.

## Where things are
* **Repository:** it moved to `expat-ready/xpatready` (the org move, P-688). This copy's `origin` still points at the repository's old address under the personal account, and GitHub redirects it, so fetch and push still worked on 18 Nov. Access to `expat-ready/xpatready` itself was not enabled for this session (HTTP 403). Attach it on restart (`add_repo`, push access).
* **Branch:** `claude/upbeat-bardeen-k2tdqn`.
* **Head before this note:** `c0e371f25d801106734db26be48250e574a3b67c`. That is `main` as of 18 Nov, with #2008 merged, plus one commit, "runtime: AUD-5 part 2 — check(): one question every deleter asks (hold › floor › reminder)". The commit holding this note sits on top.
* **No PR is open for part 2.**

## Done
* **AUD-5 part 1 (R1.105): merged.** PR expat-ready/xpatready#2008 (opened at the old address) merged into `main` on 17 Nov, 16:16 UTC. It holds the keep-period table, the firm's setting `legal.closed_client_files_years`, `GET /api/platform/keep-periods`, `PUT …/closed-client-files`, KeepPeriodPort with its fake and contract, the 6-year Sample seed and the demo-reset fix. Records are in `product/screens/AUD-5-1/` (break report, review, journey test).
* **AUD-5 part 2: built and pushed, not reviewed.** It follows Lead 72's ruling on #2008 (comment 6935438980): the draft `product/design/briefs/AUD-5.md` "Part 2 (AUD-5b)" plus part 1's decisions; `check()` takes `LegalHoldPort`; DW6 to DW9 run on its fake.
  * `ports/keep-period.ts`: `keepCheck` is the one rule both adapters call. It goes in BR-7's order:
    1. `LegalHoldPort.isHeld` inside the caller's transaction. HELD carries every hold's reason, for every class.
    2. The floor in code: billing 6 years from the fiscal year's end, financial and breach records 7 years, the activity log never deleted (`neverDeleted`).
    3. The firm's own reminder: WARN, and the deleter must give a reason for its audit line (BR-8).
    4. Otherwise OK.

    It refuses (`KeepCheckRefused`) a REFERENCE class (the College row), an unknown class, an empty ask, and the case where no hold store is wired (NO_HOLD_STORE). It also holds `addYears` and `decideKeep`. Times come from the clock port only.
  * `api/src/platform/keep-period/service.ts`: `KeepPeriods.check` takes the hold store and the clock through `KEEP_PERIOD_HOLDS` and `KEEP_PERIOD_CLOCK`, both optional. The API wires no hold store yet, because PF-21b part 2's real adapter is not on `main`, so in the API `check()` refuses.
  * `ports/contracts/keep-period-port.contract.ts`: 6 check cases, run on the fake and on the real adapter.
  * `tests/check_aud5_check.ts`: DW6 to DW9 (20 cases). It includes a test-only deleter (DW7), a mid-request setting change, and the refusals.
  * `tests/check_aud5_keep_periods.ts`: updated for part 2.
  * `api/src/platform/MODULE.md`: the check entry point, one invariant line and the new test. The card is 38 lines.

## Checks at c0e371f25 (18 Nov, this container)
* `check_aud5_check` 20/20.
* `check_aud5_keep_periods` 67/67.
* `check_pf21b_port` 32/32.
* `check_b164_no_engine_keys` 65/65.
* `check_pf0p_ports` 117/117.
* `check-port-contracts` clean (19 ports).
* Mutation checks: asking the hold after the floor fails DW9; ignoring the firm's number fails DW7.
* Earlier, in the worktree on the 17 Nov base: types gave no new errors and the `any` count stayed at 417.
* `module-cards.py tree` fails only on `main`'s own `api/src/front-office/MODULE.md`: 42 lines, over 40. That card is not this branch's.

## Exact next steps on restart
1. Attach `expat-ready/xpatready` with push access. Optionally point `origin` at it (`git remote set-url origin https://github.com/expat-ready/xpatready`). Then `git fetch origin main claude/upbeat-bardeen-k2tdqn`.
2. Merge `origin/main` into the branch only if it conflicts (P-270). The platform `MODULE.md` has conflicted at every merge, because its Purpose, Entry points and Tests are each one long line. Keep `main`'s lines and re-add this branch's items.
3. Start Postgres if it is down (`bash …/product/tools/lane.sh setup`). Re-run `check_aud5_check`, `check_aud5_keep_periods`, `check_pf21b_port`, `check_b164_no_engine_keys`, `check_pf0p_ports`, `check-port-contracts`, the types check (`NODE_OPTIONS=--max-old-space-size=6144 node product/tools/typecheck.mjs`) and `count-any.mjs`.
4. Open a **draft** PR titled "runtime: AUD-5 part 2 — check(): one question every deleter asks (R1.105)". The body follows WAY-OF-WORKING "Every PR" and needs:
   * a "Done when" section;
   * one `Duplicate check:` line;
   * the card note (platform card updated; api-features unchanged);
   * the callers to wire in their own rows: PF-11c's purge, PF-21d's erasure, FO deletes, CS-X3's case delete door, and CS-D6's Dispose through CS-X3;
   * the notes that PF-21d's own 7-year floor gets replaced by this table, and that PF-21b part 2's real adapter is provided under `KEEP_PERIOD_HOLDS`.
5. Subscribe to the PR. Launch the Opus reviewer and the breaker (deletion rules; P-278). The brief's break list is: a setting changed mid-request, a class not in the table, a firm id from the request, a held item of another firm, and the read route's words in every state. Fix Blockers and Majors with a failing test first. Re-reviews read the diff only.
6. Once the reviewer has posted `Reviewer: Approve <head sha>`, mark the PR ready once, then wait for the full ci. Do not label: the Lead labels (P-384, P-423: audit and deletion rules).

## Open questions (for the tech lead)
* **Hold subjects.** `LEGAL_HOLD_CATEGORY` holds only the five case-side names. The recommendation in #2008 comment 6935320260 was: a closed client file maps to its CASE subject, and firm-wide records map to FIRM or DATE. A new category would be an addition to PF-21b's list. Not yet ruled on.
* **DW7 needs a deleter.** It is proved with a test-only deleter; no production caller is wired in this row. Confirm that this is enough.
* **No way back to "not set".** Once a firm sets a number it cannot return to "not set" (part 1 review note). That is for the screen row.
* **SA11-D7.** SA-11 v2.16 says regulator names are no longer the reason for what a firm keeps, yet the warning names the College's s. 7.2, following P-607 S3 Q10 and Build Lead C's ruling. Record that departure if needed.
* **Front-office card.** `main`'s `api/src/front-office/MODULE.md` is over the 40-line limit, which turns the module-cards check red for every PR that touches a module.
