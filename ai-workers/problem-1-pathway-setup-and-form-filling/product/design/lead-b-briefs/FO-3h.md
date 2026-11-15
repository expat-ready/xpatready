# Brief: FO-3h, the host's booking emails in the host's office time (QA-470, map row 38) (cloud builder lane; row owner Lead B)

**Start once FO-3f #1785 is on `main`** (same file, `api/src/front-office/booking/service.ts`). It is approved and queued as of 15 Nov 10:08 IST. No schema change. Builder at medium effort, reviewer at high (P-605). Pull order: PF-23w first, then this row (rev 16.11). The two touch different lines of `service.ts` and `PF-23w` swaps `runtime-ports.ts`: if both are open at once, the later one merges `main` in on a conflict (P-270), never by hand. Paste into a new cloud session on the repository (default branch `main`):

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime FO-3h` and take **one row, FO-3h**, end to end on a fresh branch from `origin/main`, one PR.

**The row:** `ai-workers/problem-1-pathway-setup-and-form-filling/product/BACKLOG.md`, row **FO-3h** (rows rev 16.10), as made exact by the Lead B rulings below. Read only these with it:
* the requirement text `python3 product/tools/trace-requirements.py --brief FO-3h` prints (AG-04 Part B rule 9, AG01-24; P-604: read only that text);
* QA-470 in `product/qa/BUGS.md` (on `main`, or on qa's PR #1792 branch `claude/compassionate-edison-ymh9zh` if #1792 has not merged), and qa's test `prototype/studio/tests/qa/check_qa470_host_mail_zone.ts` from the same place;
* `product/design/lead-b-rows-2026-11-14.md`, section "Rev 16.11" (a), the DWn naming rule;
* on `main`: `api/src/front-office/booking/service.ts` (`wallLabel`, `sendBookingMail`, `runAttendanceAsk`), `api/src/platform/settings.ts` (`TIME_ZONE`), `tests/check_fo3_booking.ts`.

**Lead B rulings (row owner, 15 Nov; checked against `main`):**
1. **The host's office zone today is the firm's time zone** (PF-3's `platform.time_zone` setting). Offices with their own zones arrive with PF-18a, which is not built. Add one function, `hostZone(db, firmId, staffId)`, in `service.ts` that returns the firm's zone now. PF-18a will extend it to the host's office zone. Every host-facing time in booking mail goes through it. The row's third Done when line ("a host in an office with a different zone gets their office's zone") **moves to PF-18a's Done when**, because there is nothing to test until offices exist. Lead B tells the current Lead to amend both rows.
2. **All four host mails, not three.** The confirmation, reschedule and cancel mails to the host (`booking.host_*`) **and the attendance question** (`booking.attendance_ask`, which today prints `b.bookerTimeZone` too) state the time as `wallLabel(startsAt, hostZone)`, so the zone is always named. It is the same defect as QA-470, so the capability is finished whole (P-606).
3. **Unchanged:** the booker's mails and reminders stay in the booker's zone, and the `.ics` stays in UTC. The staff screens are not in this row.

**Named test cases (P-606: list them in the PR body before writing code; the reviewer ticks one per line).** In `tests/check_fo3_booking.ts`, as new cases:
* `FO-3h DW1 pass/fail`: a booking from Asia/Dubai for Tue 17 Nov 10:00 Toronto (firm zone America/Toronto) mails the host "10:00 a.m. (America/Toronto)" in subject and text. The fail case: no host mail states the time only in Asia/Dubai.
* `FO-3h DW2`: the booker's confirmation reads "7:00 p.m. (Asia/Dubai)" (kept).
* `FO-3h DW3 pass/fail`: the reschedule and cancel host mails read the host's zone after the booker changes zone on reschedule.
* `FO-3h DW4`: the attendance question to the host reads the host's zone.
* `FO-3h DW5`: the `.ics` start and end are still UTC (`…Z`), byte-identical to before for the same booking.
* qa's `tests/qa/check_qa470_host_mail_zone.ts` passes 3/3. Paste its output in the PR. Do not commit qa's file: qa owns `tests/qa/`.

**Duplicate check (P-526):** BACKLOG, open PRs (including records PRs), `main`'s code and BUGS for "host zone", "office time" and "QA-470"; one `Duplicate check:` line.

**Breaker: no** (no money, schema, permissions or new screen). The reviewer runs at high effort.

**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5; no model switch mid-session. Finish whole: if an item turns out to need more than its touch list, stop and ask in a PR comment. Never widen the row silently, and never leave a part for later. Read only the requirement text the trace tool prints.

**Rules (standard, every PF/FO brief):** P-559: firm tables, real sign-in and billing are ours in the PF/FO modules (amends P-335/P-357). One row, one session, one PR; new files only outside the touch list. Opus reviewer (P-303); re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270). **Before asking for the label (rows rev 16, Lead 47: 4 of 4 labelled PRs went red after the label on 14 Nov):** run, on `main` merged into your branch, the suites of every CI part that was red on any earlier head of this PR, plus every suite in the shard that shares the demo database with yours, and paste the result lines in the PR. Live AI off, US$0, never a priced button (P-175). No real keys anywhere. Push after every step (P-557). Questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the merge queue and to **Lead B** (row owner, branch `lead-b-front-office`, hand-over `product/design/lead-b-state.md`) for the row. Cross-module port interfaces, their fakes and shared event payload types go in `prototype/studio/ports/` (`zod` only; case-side contract v0.1 §1 rule 3); adapters stay in the module's folder; never import `engine/` or case-side files (rows rev 14.1). Event names come from `prototype/studio/ports/events.ts` (`EVENT.*`, FO-1a); add a new name there, never a string literal (rev 15.1). A database function in your migration carries your area's prefix (`fo_sales_`, `fo_booking_`, `fo_compliance_`, `fo_signing_`, `fo_retainer_`, `money_`, `msg_`, `plat_`, `platform_`), never a bare `fo_` name another area may also use, and your migration's stamp is later than the newest on `main` when it merges (rows rev 15.2, the FO-1a/FO-1b clash). Every token earns its outcome (P-556): read only the files named here and the code you change.
---
