# Review: PR #3650, PF-11 part 1b, export hygiene (R1.22)

Head reviewed: c9f84e06801163e4142683abfc8504565eaba441. Diff only: `git diff 0237c4e c9f84e0` (8e505ac plus a pure merge of 0237c4e).
Run from a `git archive c9f84e0` copy in the scratchpad, with node_modules linked and the shared Postgres cluster. Nothing ran in the shared checkout.

**Verdict: Changes (Ship after fixes).** One Major is open, so I cannot approve yet. The fix is small: the four-line pattern every sibling sweep already uses.

## What I ran
| Check | Result |
|---|---|
| `check_pf11_firm_export.ts` | 57 passed, 0 failed |
| `check_bypass_uses.ts` | 52 / 0 |
| `check_pf12_walls.ts` | 110 / 0. The first run had 5 FAILs: my archive lacked the root `AGENTS.md` that `p2/policy.ts` looks for. Not the PR. |
| `check_pf12b_bypass_audit.ts` | 70 / 0. It does not exercise the new use. |
| `graph.mjs --check` | exit 0 (G1 0, G2 0, G4 0, G5 0) |

## Mutations (each applied alone, run, then reverted)
| # | Mutation | Caught by |
|---|---|---|
| M1 | download compare-and-set → `where: { id }` | DW8 m1 download line ([200,"DOWNLOADED"]) |
| M2 | expire compare-and-set → `where: { id }` | DW8 m1 expiry line |
| M3 | the sweep's `isHeld` check removed | DW4 "while a legal hold … kept" only. It is caught because the recurring sweep happens to run during DW4's held advance; no DW8 line names it. |
| M4 | the sweep's READY/DOWNLOADED branch removed | 3 DW8 lines |
| M5 | the sweep's `files.exists` check removed | DW7, plus 2 DW8 lines |
| M6 | `jobs.recurring` removed | 3 DW8 lines |
| M7 | `toLowerCase` removed | DW8 m4 |
| M8 | the claim's `attempt` condition removed | DW8 m5 claim |
| M9 | zip-header bytes not counted | DW8 m5 headers |
| M10 | CHECK `sha256 IS NOT NULL` removed | DW8 m5 CHECK |
| M11 | CHECK `downloaded_at` clause removed | DW8 m5 CHECK |
| **M12** | CHECK `size_bytes IS NOT NULL` removed | **survives (57/0)** |
| **M13** | the sweep's `asBypass` wrapper removed | **survives (57/0)** |

## Issues, ranked

**Major 1 (Must): the sweep's cross-firm read writes no `platform.bypass` line. The use is declared `audit: "per-firm"`, and that promise is not kept.** (`service.ts` sweep, the `asBypass(EXPORT_SWEEP_BYPASS, …findMany…)` call; `export.bypass.ts`)
- Evidence: a probe after DW8's sweeps counted 0 audit_event rows with `action='platform.bypass'` and `detail->>'use'='job:platform.firm_export.sweep'`.
- What it breaks: PF-12b / R1.4 / P-607 say "every use writes an audit line". `firm-scope.ts` says a "per-firm" use calls touchFirm for each firm whose rows it reads. The sibling daily jobs do exactly this inside their `asBypass` (`storage.ts` daily, `plan-booking.ts` daily, `firm-closure/closure.ts`): `touchEachFirm`, drop the firms whose line failed, and count them as failed. This sweep omits it.
- Fix: the same pattern. I tried it in the scratch copy: 57/0 still pass, and 25 bypass lines are written.
- Test: add a line that runs `sweep()` through the walled pool (xr_app, as `check_pf12b_bypass_audit` does for storage_daily). It should assert that both firms' rows are listed and that each listed firm gets one line. Today the suite runs as the table owner, so M13 survives. If `asBypass` were dropped, production would list nothing behind the walls, and the sweep, the item's main fix, would silently do nothing.

**Minor 1 (Should): the sweep reads every EXPIRED row and HEADs each one in S3, every day, forever.** (sweep `findMany`, then `files.exists`; real adapter `s3-files.ts:164`)
- EXPIRED is terminal and the CHECK keeps `file_key`, so no row ever drops out of the read.
- At Release 1 volume (Owner-only, rare exports) the cost is negligible, and the read is acceptable for now.
- But once Major 1 is fixed, every firm that ever made an export gets a `platform.bypass` line every day forever, which is noise on the trail.
- Fix, either: (a) a nullable `file_deleted_at` that `expire` and the sweep set, with the sweep reading only rows where it is null; or (b) record the trade-off in the PR and on the row as accepted, with a reconsider point.

**Minor 2 (Should): a failed `files.delete` leaves a false `file_deleted` line, and the next day adds a second one.**
- Probe: the store's delete throws. Result: `{failed:2}`, 1 `file_deleted` line, file still stored. Next sweep: `{deleted:2}`, 2 lines for one deletion.
- The order (line in the transaction, delete after) is FilesPort's rule ("never delete and then roll back"), so the order is right.
- What needs fixing is the wording, and avoiding the repeat. Either word the line as the decision ("no hold covers the firm; its file is deleted next"), or skip a row that already has its line.
- The same applies to a `delete` answering `deleted:false`: for example, the sweep listing a row between the expire job's commit and its own post-commit delete. That window is narrow, but it writes an extra line.

**Minor 3 (Should): per-firm failures are swallowed with no log.**
- `catch { out.failed++; }`, and the handler discards the counts (`async () => { await this.sweep(); }`).
- The siblings log `logPort.error("<job>_failed", e, { firmId })`.
- For the job whose purpose is not to leave an unmasked copy stored, a firm failing every day should be visible.

**Minor 4 (Should): m5 is three of four, and one CHECK case is uncovered.**
- The firm-row `FOR SHARE` test is left out. This is declared in the PR and needs the tech lead's ruling or the breaker's list.
- The CHECK line covers `sha256` and `downloaded_at` but not `size_bytes IS NOT NULL`. `size_bytes >= 0` on NULL is NULL, so the CHECK passes: M12 survives. One more insert in the same line covers it.

**Nits (no action needed):**
- `download`'s second transaction uses the `now` taken before the file read. A fresh `this.d.now()` closes a window of a few milliseconds.
- `out.expired++` counts even when `expire` wrote nothing because the expire job won.
- M3 is only caught through DW4's timing.

## Questions asked of me
- **Races:**
  - sweep vs expire on a READY row: both call `expire`, one compare-and-set wins, and the loser returns no key. Held.
  - download vs expiry: the bytes are read first, the compare-and-set comes after, and an EXPIRED row gives 410. Held (M1).
  - expire vs a download that committed first: the expire compare-and-set still moves DOWNLOADED to EXPIRED. Held (M2).
  - sweep vs the expire job's post-commit delete: an extra line (Minor 2).
  - audit line then a failed delete: Minor 2.
- **Daily read of every EXPIRED row:** acceptable at Release 1 volume, but unbounded (Minor 1).
- **Bypass declaration:**
  - Name, place (`firm-export/export.bypass.ts` under api/src), `routes: []`, `outside: true` and a reason all pass `check_bypass_uses`.
  - In production `PlatformJobs.handle` wraps the queue in `asJob`, so the inner `asBypass` of the same use runs in place.
  - The audit promise is not kept (Major 1).
- **Hold semantics (SA-11-18, BR-7 "hold beats deletion"):** correct.
  - The ask is `ALL_FIRM_DATA`, which every active hold matches. That is right for a zip holding all of the firm's data.
  - A held row still expires: access closes and only deletion waits. After release the sweep deletes.
  - There is a short gap between commit and delete in which a new hold is not seen. This is PF-Fd's accepted order and is the same in `expire`; nothing new here.

## Screen-review and journey items
- Not applicable: no screen changed. That covers concept fit, the BIC-01 to BIC-20 scorecard, words per PRODUCT.md §3-§4, and the keyboard, 1024 px and 200 % zoom checks. D1 to D20 are scored only where a backend job bears on them, in the journey report.
- Journey score (reviewer): 6.5 of the 8 criteria that apply, which is 8.1/10 scaled, with no 0. Report: `journey-test-reviewer-2026-11-25.md` beside this file.

## Could not check
- The real S3 adapter.
- pg-boss's real recurring run.
- A deterministic `FOR SHARE` interleave.
- A browser walk: nothing visible changed.

Reviewer: Changes c9f84e06801163e4142683abfc8504565eaba441
