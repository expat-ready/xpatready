# AUD-5 part 2: resume note (runtime lane, parked, P-716, P-719)

Written 19 Nov 2026, 06:4x UTC (12:1x IST), by the runtime builder lane for AUD-5 part 2.

* **State:** done and merged. expat-ready/xpatready#2197 merged as `75cdec751` (head `be65d001d`) on 19 Nov at 06:37 UTC.
* **Branch:** `claude/happy-lovelace-p1mlh5`, restarted from main `8cefcc6c6` for this note only. No code is in flight.
* **What is on main:** `KeepPeriodPort.check()` answers HELD / FLOOR / WARN / OK in BR-7's order: the legal hold first, then the floor, then the firm's reminder. It runs inside the caller's transaction.
  * The check: `ports/keep-period.ts`, its contract `ports/contracts/keep-period-port.contract.ts`, and the real adapter `api/src/platform/keep-period/service.ts`.
  * The test: `tests/check_aud5_check.ts`, 54/0.
  * No hold port is wired yet (PF-21b part 2), so in production `check()` refuses every delete (`KeepCheckNotBuilt`), never a silent OK.
* **R1.105 waits on:** Lead B's PF-11 and PF-11c, plus AUD-2 and PF-5's close at 90 days. The callers of `check()` are wired in their own rows:
  * PF-11c purge;
  * PF-21d erasure, which also moves its 7-year financial floor constant to this table;
  * the FO deletes;
  * CS-X3's case delete door, and CS-D6 Dispose through CS-X3.
* **Next:** J-105 once PF-11c lands. PF-21b part 2 must run `keepPeriodCheckContract` against its real hold adapter, with the real advisory lock.
* **Open questions for the tech lead** (in #2197's body):
  1. PF-11c's purge of a cancelled firm needs `ALL_FIRM_DATA`, which is not a per-class delete. Recommendation: PF-11c calls `LegalHoldPort.isHeld(..., [{ kind: "ALL_FIRM_DATA" }])` directly, then this table per class.
  2. LegalHoldPort's DATE subject is a single point, so a whole-file delete must send the date of every dated record it removes. Recommendation: keep that, documented on `recordDates`, rather than add a DATE_SPAN subject to PF-21b.
  3. The queue gate (B194) and the label sweep (B134) removing each other's `review: approved` label: passed by Lead 86 to the enforcement-checks builder (P-717).
* **Not done:** Build Lead C's request for an R1.80 evidence PR. It needs a second branch, and the user has not given permission for one in this session.
* **Records:** `review.md`, `journey-test-reviewer-2026-11-19.md` and `break-report.md` sit beside this file.
