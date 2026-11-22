# PF-11c — not ready: question for the tech lead (runtime lane, 22 Nov)

Row: BACKLOG PF-11c (R1.105 day 90: a leaving firm is closed, archived first, never deleted early; a daily `JobPort` job).
Asked by: Lead 4's start (founder A286, 14:4x IST 22 Nov). Done when (as given): `studio/tests/check_pf11c_close.ts`
exits 0 twice: a firm read-only after leaving, **exported**, closed at day 90 **after the archive**, nothing deleted
before; the R1.105 journey step "a leaving firm is read-only, exported, closed" passes on an isolated copy.

## What blocks it (read on origin/main 73c4e4dcd, 22 Nov; open PRs read the same hour)

The row's own line says **waits on: PF-11, AUD-2 (archive), AUD-5, PF-21b, PF-5, PF-14**. Measured:

| Waits on | Needed for | On main | Open PR |
|---|---|---|---|
| PF-11 (`FirmExportPort`, the firm's full export) | step (2): "requires the firm's full export" | **no** (no `FirmExportPort`, no export code) | none |
| AUD-2 (`AuditArchivePort`, write-once archive) | step (2): export written to `firms/<firmId>/export-<date>.zip` | **no** (no `AuditArchivePort`) | none |
| PF-5's day-0/30/60/85 notices and its 90-day clock | step (2): "their send records checked here" | clock start only (event `firm.payment_hold` in `billing/webhook.ts:159`); **no notices** | none |
| PF-27 (close of a locked account starts the clock) | the second clock source | **no** | none |
| AUD-5 part 2 (`KeepPeriodPort.check()`) | step (4): floors asked by each purger | **no** (part 1 only; part 2 in flight on a parallel lane) | lane running |
| PF-21b (`LegalHoldPort`) | step (1) | port + fake only (part 1) | — |
| PF-14 (`JobPort` real adapter) | the daily job | yes | — |

So "exported" and "closed after the archive" cannot be proven against the real pieces: the export and the archive do
not exist. Building them here would take PF-11's and AUD-2's files (touch only what the row names, P-526) and run a
second, unshaped copy of two rows.

## Recommendation (pick one)

1. **(Recommended) Start PF-11 and AUD-2 first** (each is shaped, 1-2 PRs), then PF-11c part a on top; R1.105 stays
   Partial meanwhile. Keeps P-606 (finish whole) honest: PF-11c's Done when names "exported", which only PF-11 proves.
2. **Build PF-11c part a now on contract fakes**, as the row's own test line allows ("fake clock, fake archive"):
   `ports/firm-purge.ts` (`FirmPurgePort.register`), the daily closure job and `plat_firm_deletion`, reading two
   narrow, consumer-side questions — "is this firm's export in the archive, with its key?" and "were the day-0/30/60/85
   notices sent?" — through fakes that PF-11, AUD-2 and PF-5 implement later. Floors through AUD-5's port once part 2
   merges (until then the purger refuses every floored class). Cost: R1.105 still cannot be Proven until PF-11, AUD-2
   and PF-5's notices land, and the journey step "exported" cannot pass on an isolated copy before then.
3. Narrow the Done when to what main can prove today (read-only on hold, closed at day 90 with a hold and floors
   respected, nothing deleted before) and move "exported, after the archive" to PF-11/AUD-2's rows.

No code written; nothing else touched.
