# Brief: AUD-5 part 2, one check every deleter asks (cloud builder lane; row owner Build Lead C)

Written 18 Nov 12:4x IST by Build Lead C. **Approved for building.** The specification is "Part 2 (AUD-5b)" of the draft `product/design/briefs/AUD-5.md` on `main`; where this page differs, this page wins. Release 1 row **R1.105** (map 105), part 2 of 2.
**PR title:** `runtime: AUD-5 part 2 — one check every deleter asks (hold, floor, reminder)`
**Model:** Opus 5.5, effort high (deletion rules).

**Ready when:** **now** (after the B1 freeze lifts, 18 Nov 13:0x IST).
* Part 1 is on `main` (#2008): `ports/keep-period.ts`, `ports/contracts/keep-period-port.contract.ts`, `api/src/platform/keep-period/service.ts` and `routes.ts`, and `tests/check_aud5_keep_periods.ts`.
* PF-21b part 1 is on `main` (#2025): `ports/legal-hold.ts` with `LegalHoldPort.isHeld(tx, firmId, subjects)`, its fake and its contract.

**What to build:** the draft's Part 2, exactly. Named here so nothing is missed:
* **`check(tx, { firmId, class, startedAt, subject })`** returns one of four answers:
  * `HELD`: with every matching hold's reason;
  * `FLOOR`: refuse, with the date the floor ends;
  * `WARN`: inside the firm's reminder; the delete needs a reason, and the reason goes on the delete's audit line;
  * `OK`.
* **BR-7 order:** `LegalHoldPort.isHeld` first (a hold wins for every class), then the floor, then the reminder.
* **The firm is always the caller's session firm,** never one taken from the request.
* **`isHeld` reports every match.** `HELD` carries all the matching reasons, not only the first.
* **`isHeld` runs inside the caller's open transaction**, and so does `check`. It takes the shared hold lock, and that lock is held until the deleter's own transaction commits. Do not open a second transaction.
* **Subjects:** map `class` and `subject` to the port's `HoldSubject` kinds. A class whose subject has no `HoldSubject` kind must be refused in words ("this record type has no hold check yet"), never passed as `OK`.
* **No callers outside the test.** The PR body names each caller row that wires it later: PF-11c purge, PF-21d erasure, the FO deletes, CS-X3 case delete, and CS-D6 Dispose through CS-X3. Note there that PF-21d's own 7-year financial floor constant moves to this table in PF-21d's PR or a follow-up.

**Done when (P-606):**
* `tsx studio/tests/check_aud5_check.ts` exits 0. The draft's cases DW6, DW7, DW8 and DW9 each pass and fail as named. Two more cases:
  * **DW10:** two active holds on one subject → `HELD` lists both reasons.
  * **DW11:** a hold of another firm on the same subject id → not `HELD` for this firm.
* `check_aud5_keep_periods.ts`, the PF-21b suite, `check_pf3_platform_schema.ts`, `check_pf4_identity.ts`, `check_pf6b_permission_rules.ts`, `check_pf0p_ports.ts` and `check_case_feed.ts` pass unchanged.
* `node studio/tools/check-port-contracts.mjs` exits 0; the module-card check passes; full `ci` is green.

**Touch list:**
* `ports/keep-period.ts` (the `check` body in the fake)
* `ports/contracts/keep-period-port.contract.ts` (the check cases)
* `api/src/platform/keep-period/service.ts`
* new `tests/check_aud5_check.ts`
* one sentence in `api/src/platform/MODULE.md`

No schema, no migration, no screen.

**Review:** an Opus reviewer **and the breaker** (deletion, P-278). The breaker tries:
* the setting changed mid-request;
* a class name that is not in the table;
* a firm id taken from the request instead of the session;
* a held item of another firm;
* a `WARN` delete with an empty or whitespace reason.

**Standard rules:** branch from `origin/main`. One part, one PR, under 800 changed lines with tests (P-610); if it must split, ask first in a PR comment. **PR rule (P-683):** get "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft. Never push to an open PR unless it is a fix. Merge `main` only on a conflict (P-270). Live AI off, US$0, never a priced button (P-175). Push after every step (P-557). Questions go on the PR as "Question for the tech lead: …"; Build Lead C answers within 30 minutes. Report to the current Lead (`tools/current-lead.sh`). If a site is blocked on the cloud network, write "Not verified: <site> blocked on the cloud network" and go on. Repository: `expat-ready/xpatready`.

**Audit actors (Lead 80, 18 Nov, after #2003 AUD-1a):** the audit trail refuses an actor word with no type. A test or seed that writes an audit line uses `staff:<id>`, `person:<id>`, `system:<door>`, `seed:<row>` or one of the listed simulated people (`user-A/B/C/O/R/T/S` staff, `user-P/Q` clients), never a bare word like `test`. Once #2003 is on `main`, merge `main` before the first push.
