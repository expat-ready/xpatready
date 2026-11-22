# Brief: CS-98c, the recruitment record, entered by staff (map row 98; case delivery, corporate; cloud builder lane; row owner the release Lead)

Drafted 16 Nov 04:0x IST by the case-side shaping lane from BACKLOG row CS-98c (line 899; P-607 (5): in Release 1, scheduled last in the case-side lane), checked against `main` 81505985f. **Draft until the release Lead approves it.** **Model: Opus 5.5, effort: high** (government deadlines, the advertising clock, personal data of applicants; P-608). **Ready when:** CS-98b part 1 is on `main` (`api/src/case-delivery/corporate/checks.ts`, the file's warnings and passes), with CS-98a and CS-98r under it; part 2 also waits for CS-DL1 part 1 (`countBack` in `api/src/platform/calendar/working-days.ts`) and PF-18np (`ports/notifications.ts`). **Two parts, two PRs** (P-610): part 1 channels, clock and candidates; part 2 dated items with reminders, the consistency check and the report.

**Amendment (Lead 4, 22 Nov 15:44 IST; the CS-98 concept's approval on #3002, comment 7077590191, Q2, Q3, Q5; concept `screens/CS-98-lmia/concept.md`):** every recruitment write (channel add, edit, end; candidate add) calls CS-98b's `recomputeStep(tx, caseId)` in its transaction (one line), so the board's stored step moves to Advertising & recruitment when the first channel starts. Its items for the file summary (channels, the clock's dates, candidates missing a reason, ads and offer) are added to `summary.ts`'s item table by this row.

**Where the requirement corrects or narrows the row (the release Lead confirms each in the approval):**
* **The clock is the file's, read from its least-advanced required channel.** The row puts a clock on each channel. **AG-17-23@616923e8**: each required channel runs for at least the stream's minimum number of **consecutive** days inside the window, and the clock shows "day X of Y" for **the least-advanced required channel**. So each channel has its own state, and the file shows one clock. AG-17 §6.C names the states: not started → running → minimum met → window closing → expired (CRITICAL), or satisfied on submission within the window.
* **More recruitment warnings than the row lists.** AG-17 §3.4's table, which **AG-17-29@d2cad3df** points to, has these:
  * advertising shorter than the minimum or not consecutive (CRITICAL);
  * the required channel mix not met (CRITICAL);
  * advertising that will fall outside the window before the planned submission (CRITICAL);
  * missing rejection reasons (one combined CRITICAL);
  * after submission, no channel still active where the stream requires one (MAJOR; CS-98d raises it, AG-17-38);
  * proof missing for one or more channels (one combined MAJOR).
  All of them are built here except the after-submission one.
* **A rejection reason is needed only for some candidates.** **AG-17-27@e41b355f** and AG-17 BR-7 require it only where the candidate's residence status is flagged "needs rejection reason" (CS-98r's reference list flag) **and** the outcome is not hired. The row's test "three rejections with one reason → one combined warning" is reworded: three flagged candidates missing a reason → **one** combined CRITICAL.
* **One entry per applicant** (**AG-17-26@e0210523**). Single and bulk entry compare the name on the same file (case, punctuation and accents ignored) and offer "<Name> is already logged (received <date> via <channel>). Same person?" with [Same person, open that entry] [Different person]. A second channel goes in the one entry's note. It is not person matching and creates no person record.
* **The CSV import stays in X-20.** **AG-17-80@e8e91963** (candidate import from a spreadsheet on AG-18's engine) is listed in X-20 (BACKLOG line 1077, rev 16.12). **Ruled (Lead 61, comment 6901269297 on #1882):** it stays in X-20. Pulling it into Release 1 would be a scope change for the founder. This row has no import part, and the PR names X-20.
* **Dated items and reminders go through the platform, never this module's own date watching.** **AG-17-24@e402b00f**: the file computes the earliest recruitment-complete date and the latest submission date, and **creates dated items** for both. **AG-17-73@beff10dd**:
  * reminders are standard deadlines that remind the file owner;
  * they are calendar dates that business hours never move;
  * a reminder counted in working days lands on the last open day on or before the computed day;
  * AG-17 "SHALL NOT implement its own date watching".
  The Minder (AG-11) has no row. So part 2 uses what CS-DL1 builds (`countBack`, `JobPort` jobs with a key, `NotificationPort.notify`), keyed `corp-recruit:<case>:<item>:<offset>`. Lead times come from CS-98r's table, or are Sample. A changed date re-registers its reminders. **No reminder on a date worked out from a Sample rule** (P-412 F13 (b): "shown only, a worked-out Sample date, no reminder until each rule is cited"). While the stream's advertising row is Sample, both dates are shown marked "Sample" and nothing is registered.
* **The report's template.** **AG-17-28@9778fee0**: the report comes "from a template (AG-12 / SA-05)", and P-584 (1) moved templates to the platform (PF-19c, not built). `DocumentRenderPort` is on `main` (`ports/render.ts`: `render(templateKey, data)`). Part 2 renders with the key `case.corporate.recruitment_report` (a committed starter text until PF-19c registers the kind) and stores the result as a document on the file. The report has:
  * channels with dates and proof;
  * applicant counts by status (people, not entries);
  * outcomes;
  * every rejection reason.
* **The employer sees nothing about candidates** (**AG-17-30@ab4f1961**): no list, counts or notes in any portal. Candidates are kept with the file and disposed of only with it. The retention period is "awaiting legal advice" (Unconfirmed: no counsel), so nothing here deletes them.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime CS-98c` and take **one part of row CS-98c** end to end on a fresh branch from `origin/main`, one PR per part.

**The row:** `product/BACKLOG.md` row **CS-98c** (line 899), read with the points above. Requirement text (cite these, read only this text): **AG-17-22@2d297de3** (channel fields; staff entry only in Release 1), **AG-17-23@616923e8**, **AG-17-24@e402b00f**, **AG-17-26@e0210523**, **AG-17-27@e41b355f**, **AG-17-28@9778fee0**, **AG-17-29@d2cad3df** (with §3.4's severity table), **AG-17-30@ab4f1961**, **AG-17-32@7c77d1f8** (ads and the job offer pre-filled from the job details; wage, hours and location differences CRITICAL naming field and document; duties as one `dutiesMatch` tick), **AG-17-73@beff10dd**; AG-17 **BR-2**, **BR-7**, **BR-8** (advertising for one stream never counts for another) (§5), **§6.C**; decisions P-568 (2), AGENTS rule 4, Lead 61's ruling (calendar dates; no deferral to an X row).

**Read only these:** `prisma/schema/case-corporate.prisma` (channels, candidates, consistency capture), `engine/corporate-rules.ts` (`corp_rule_advertising`, the reference lists), `api/src/case-delivery/corporate/checks.ts` and `…/routes.ts` (CS-98b: warnings, passes, the guard pattern), `ports/render.ts`, `ports/files.ts`, `ports/jobs.ts`, `ports/clock.ts`; for part 2 CS-DL1's `api/src/platform/calendar/working-days.ts` and `api/src/case-deadlines/` scheduler, and `ports/notifications.ts`; `api/src/MODULE.cases.md`.

**What to build (API only; staff routes under `/api/runtime/cases/:id/corporate/recruitment/…`, behind PF-4's guard, `agent/case:edit` to write, `agent/case:show` to read, the firm from the session):**
* **Part 1:**
  * New `api/src/case-delivery/corporate/recruitment.ts` (routes and service) and `…/advertising-clock.ts` (pure, on `ClockPort`'s date).
  * **Channels:** add, edit and end, with proof document ids (each must be a document of this file).
  * **The clock:** each required channel's state and "day X of Y" for the least-advanced one. Consecutive days are counted in calendar days. A gap restarts that channel's run. Minimum and window come from the pinned snapshot's `corp_rule_advertising` row for the file's stream (Sample when uncited, and the reply says "Sample"). Only channels logged on **this** file count, so after a Change stream the new file starts at "not started" (BR-8).
  * **Candidates:** single and bulk entry with the same-name offer; residence status, outcome and rejection reason from CS-98r's lists; the combined CRITICAL for missing reasons.
  * **Warnings:** the §3.4 items above, added to the file's warnings list through CS-98b's `checks.ts` (one export each).
  * **No candidate data** on any client or portal read: a request as the case's client actor → 404.
* **Part 2:**
  * **Dated items:** the earliest recruitment-complete date and the latest submission date, each registered as reminders (CS-DL1's pattern; lead times from the table or Sample), and re-registered when a channel date changes. A government date is never moved by open days. Reminders go to the file owner.
  * **The consistency check** (new `…/consistency.ts`): each ad and the job offer pre-filled from the job details, with staff changing what differs; a wage, hours or location difference raises a CRITICAL naming the field and the ad or offer; `dutiesMatch` false raises a CRITICAL.
  * **The report** (new `…/report.ts`): `DocumentRenderPort.render("case.corporate.recruitment_report", data)`, stored as a document on the file through `FilesPort`, one audit line.
* **Named test cases** (P-606), file `tests/check_cs98c_recruitment.ts`, on a fixed `ClockPort` date, values as test fixtures labelled Sample, a pass and a fail each:
  * **CS-98c DW1:** a required channel started 10 days ago against a fixture minimum of 28 → "day 10 of 28"; at day 28 → "minimum met"; a one-day gap at day 15 → that channel restarts at day 1.
  * **CS-98c DW2:** two required channels at day 20 and day 5 → the file's clock reads "day 5 of 28" (the least-advanced).
  * **CS-98c DW3:** a channel whose window passed before submission → CRITICAL "expired"; inside the window → no warning.
  * **CS-98c DW4:** three candidates with a flagged residence status, not hired and no reason → **one** combined CRITICAL; the same three with an unflagged status → none.
  * **CS-98c DW5:** a second entry with the same name, case and accents ignored → the offer; "Different person" saves it; "Same person" adds nothing.
  * **CS-98c DW6:** after Change stream the new file's clock is "not started" and the old file's channels show for reference only; a channel logged on the old file does not count towards the new file's minimum (BR-8), and a fixture that counts it makes the test fail.
  * **CS-98c DW7:** a client-actor read of candidates → 404; staff read → 200.
  * **CS-98c DW8 (part 2):** an ad whose wage differs from the job's → CRITICAL naming "wage" and the ad; the same wage → none; `dutiesMatch` false → CRITICAL.
  * **CS-98c DW9 (part 2):** with a cited fixture advertising row, the latest submission date's reminder is registered once with its key; with a Sample row, the date shows "Sample" and no job is registered (P-412 F13 (b)); moving a channel's start date re-registers it (the old job cancelled); a reminder counted in working days onto a closed day lands on the last open day before it.
  * **CS-98c DW10 (part 2):** the report lists every channel with dates and proof, counts people by status (a person logged with two channels counts once), and every rejection reason; a render failure stores nothing and answers 502.
* **Touch (nothing else):** part 1: new `api/src/case-delivery/corporate/recruitment.ts`, new `…/advertising-clock.ts`, `…/checks.ts` (the new warning exports), `…/routes.ts` (route lines), `contracts/case-corporate.ts` (shapes), `api/src/MODULE.cases.md` (one line), new `tests/check_cs98c_recruitment.ts`. Part 2: `…/recruitment.ts`, new `…/consistency.ts`, new `…/report.ts`, new `…/reminders.ts`, the starter text file for the report, the test file.

**Done when:** `tsx studio/tests/check_cs98c_recruitment.ts` exits 0 with DW1-DW7 (part 1), and DW8-DW10 (part 2) each passing and failing as named; `check_cs98b_lmia_setup.ts`, `check_cs98a_corporate_schema.ts`, CS-DL1's suite (part 2), `check_b164_no_engine_keys.ts`, the demo reset and the checkpoint load (C10.1) pass unchanged; the module-card check passes; full `ci` green on the head.

**Duplicate check:** BACKLOG (CS-98*, CS-DL1, PF-10b, PF-19c, PF-18np), open PRs (`recruitment`, `advertising`, `candidate`), `git grep -n "countBack\|ImportTargetPort\|recruitment"` on `main`, BUGS; one `Duplicate check:` line in the PR.

**Parallel safety:** files under `api/src/case-delivery/corporate/` are shared with CS-98b, CS-98d and CS-98e. `checks.ts` and `routes.ts` take one export or route line per row, so the parts that edit them run in series with CS-98b part 2 and CS-98d (P-526b: overlapping touch lists never run at once). New files run beside them. `MODULE.cases.md`: one line. No `cases.prisma`, `runtime.ts`, `core.ts`, `case-feed.ts` or `ports/events.ts` change. Part 2 reads CS-DL1's scheduler and never edits it; if it needs a change there, stop and ask.

**Contract gap (for the PR body):** no Minder (AG-11 standard deadlines) row exists, so reminders use CS-DL1's jobs (as CS-DL1 does) and the PR names that as the stand-in. `NotificationPort` is PF-18np's (`notify(tx, { staffId }, NOTIFICATION_KIND.X, { kind, id })`): this row adds its kinds `CORPORATE_RECRUITMENT_DUE` and `CORPORATE_SUBMISSION_LATEST` to that list, the consumer's own line (Lead B's ruling, rev 16.31). PF-19c's template registry does not exist, so the report's starter text is committed until it does.

**Reviewer and breaker** (government dates, applicants' personal data; the row says "breaker: no", and this brief adds one for part 2's dates, P-278). The breaker tries the clock across a daylight-saving change and a month end, a channel with no end date, the same applicant entered by two staff at once, and the report with 500 candidates.

**Rules (standard):** Opus 5.5, no model switch mid-session (P-605). Finish whole: if an item needs more than its touch list, stop and ask in a PR comment headed "Question for the tech lead"; never widen the row silently. One part, one PR, under 800 changed lines tests included (P-610); Opus reviewer (P-303); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270). Never push to a PR that carries the `queued` label. Before asking for the label, run on `main` merged into your branch the suites of every CI part that was red on any earlier head plus every suite in your shard's demo database, and paste the result lines. No immigration value in code or tests: fixtures are labelled Sample (AGENTS rule 4, AG-17-6). Legal points (retention): Unconfirmed: no counsel. Live AI off, US$0 (P-175). Push after every step (P-557). Re-review reads only the diff since the last Approve (P-277, P-610). Report to the current Lead (`tools/current-lead.sh`). Read only the files named here and the code you change (P-556).
---
