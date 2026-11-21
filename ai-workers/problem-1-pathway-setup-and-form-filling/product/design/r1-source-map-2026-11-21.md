# Release 1 source map, 21 Nov 2026 (REQ-QUALITY)

**What this is.** Evidence for the tech lead's records pass. It has three parts:
* Part 1 traces each of the 101 Release 1 rows to the team's requirement ids, or says NO SOURCE.
* Part 2 covers the five scope changes the 21 Nov requirements-and-demo audit named. For each it gives the source text, what we built, and a recommended DECISIONS wording.
* Part 3 says, for each row, whether it has a journey test.

The tech lead folds this into the BACKLOG Source column and the DECISIONS rows (P-314). Row owner: Build Lead C. Asked by the founder (21 Nov, 08:2x IST): "Who is working on the quality of the requirements?"

**Read from.**
* Release 1 rows: `product/qa/CAPABILITIES.md` (101 `R1.` rows) on `main` ed24d2649. Each row's chain runs through `product/MVP-CHECKLIST.md` §A to the BACKLOG rows that build it, then to each row's `Source:`. (`product/BACKLOG-requirements.md` holds the older B-rows, not the R1 list.)
* Team requirement ids: only the newest name-free snapshot, `ai-workers/problem-1-pathway-setup-and-form-filling/domain/requirements-2026-11-02/` (2 Nov). Paths below are relative to that folder.

**Method.**
1. A script listed every requirement id named in each row's BACKLOG sources.
2. Four readers, each fresh, checked every id against its defining line in the snapshot. An id was kept only if the definition exists and its text supports the row. Where a row's sources gave nothing that fits, the reader searched the snapshot and added an id only when the text clearly matched.
3. Every kept quote was then checked by script against its cited line, with markdown `*`, `_` and backticks ignored. Ids are written exactly as in the snapshot.
4. Where an id is defined twice, the newer functional-requirement file (`02-functional-requirements/…`) is cited, not the older Doc text (see finding 2).
5. Struck-through text in a source line is left out of a quote and marked "[struck-through text in the source omitted]".
6. A row heading such as "AG-6-1 – AG-6-8 — The invoice …" is quoted as the definition for the ids inside its range.

Nothing was guessed. Fit lines are the readers' judgement from the quoted text.

## Findings in brief
1. **Coverage.** 97 of 101 rows trace to at least one team requirement (666 quotes in all).
   * **4 rows have NO SOURCE:** R1.64, R1.108, R1.109, R1.110. Each rests on a decision or an official source instead (named in the row).
   * **18 more rows reach a team id only by search**, because their BACKLOG chain cites decisions, map rows or "R1.N" alone: R1.11, R1.12, R1.16, R1.46, R1.47, R1.63, R1.68, R1.72, R1.73, R1.74, R1.80, R1.82, R1.83, R1.84, R1.99, R1.100, R1.101, R1.104.
   * Another 24 rows needed ids added beside the chain.
   * The readers dropped 838 cited ids. Most are BACKLOG sources that name a real id about something else: other cards in the same epic, or billing ids reused across rows. A few are withdrawn or superseded:
     * AG-2-13a, AG-2-13b and AG-2-13d are withdrawn in AG-02 v2.6 and still cited by FO-10;
     * AG-12-4, 15, 16 and 19 are replaced in AG-12 v2.11;
     * AG-15-33 is withdrawn.
2. **The same id means two things in the snapshot.**
   * 589 AG-/SA- ids are defined both in the techno-functional Docs (`01-techno-functional/`, mainly Doc 2 and Doc 3) and in the functional files. In about 380 of them the two definitions share under a fifth of their words, which is a rough measure. Example: AG-1-11 in Doc 3 is AG-1-12 in AG-01.
   * Example: **AG-3-19** in Doc 3 (`01-techno-functional/05-Doc-3-Agent-Console.md:1412`) flags an assessment STALE. In AG-03 v1.5 (`02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:383`) it is the list of CRS, FSW-67 and the PNP streams.
   * A Source column must therefore name the file or epic version, not the id alone. The trace script should check ids against the functional files.
3. **Team text that a Done when contradicts or goes beyond.** The readers flagged these. Each sits in its row's Fit line with the quote:
   * SA-4-4 has "no open public sign-up", against R1.89 and R1.90 (P-566 departs from it).
   * AG-1-40 and AG-16-24 make two-step sign-in optional for firm staff (R1.5).
   * The team keeps an unreadable phone number, flagged, where R1.33 refuses it.
   * AG-5-65 lets a sent retainer be edited until signed (R1.53).
   * AG-6 has "no deposit invoice" (R1.60), and payment plans are withdrawn in AG-06 v2.0 (only P-578 keeps them).
   * AG-13-24 allows audited edits where R1.76 says add-only.
   * AG-9-1 asks for a single upload with no resume (R1.64).
   * AG-4-15 never blocks a booking made by staff (R1.104).
   * The government step's deadline is in calendar days; only reminders count working days (R1.74).

   These want the same treatment as Part 2: a DECISIONS row, or a Done when fix.
4. **Journey tests:** 24 of 101 rows have `tests/journeys/j_N.ts` on `main` ed24d2649. They are R1.6, 8, 9, 26, 27, 28, 30, 31, 32, 33, 37, 38, 41, 42, 48, 59, 67, 72, 74, 77, 100, 108, 109 and 110.
5. **The audit's five scope changes, re-checked (Part 2):**
   * one is a real narrowing, already decided but not cited on its row (R1.100);
   * one is a widening the founder confirmed (R1.53, P-567 (2));
   * one is our own over-wide Done when brought back to the source (R1.8, QA-596, not yet a DECISIONS row);
   * one is a wording error (R1.74, "holidays" against the firm's closed days);
   * one is not a narrowing of its row (R1.106, since PNP is R1.107 under P-577). It does uncover one on R1.107: five provinces against SA-1B-200's eleven plus RCIP, with **one founder question**.

## Part 1 and Part 3: every row at a glance
"How found": *chain* means from the BACKLOG sources; *search* means only by searching the snapshot; *chain + search* means both.

| R1 | Capability | Status | Team ids | Journey test | How found |
|---|---|---|---|---|---|
| R1.1 | 1 Hosting, data, backups and logs in Canada | Not built | C1-3, SA-11-32 | no | chain + search |
| R1.2 | 2 Database | Works | SA-2-1, SA-2-4, SA-2-9, SA-2-24, SA-2-25, SA-3-46, SA-4-11, SA-6-27, SA-6-31, AG-1-17, AG-1-30, AG-16-3, AG-16-24, AG-16-59 | no | chain |
| R1.3 | 3 Walls between firms | Partial | AG-1-1, AG-1-3, AG-1-45 | no | chain |
| R1.4 | 4 Each query runs inside its firm | Partial | AG-1-1, AG-1-3, AG-1-45 | no | chain |
| R1.5 | 5 Staff sign-in with two-step, passkeys, lock-out on leaving | Partial | AG-1-40, AG-16-24, AG-1-15, AG-1-41, AG-1-55, SA-7-1, SA-7-2 | no | chain |
| R1.6 | 6 Permissions: deny by default, own versus all, money and licence apart | Works | AG-1-19, SA-6-14 | yes (j_6.ts) | chain |
| R1.8 | 8 Audit trail nobody can edit | Works | SA-11-1, SA-11-2, SA-11-3, SA-11-7, AG-13-40, AG-13-41, NFR5-08 | yes (j_8.ts) | chain |
| R1.9 | 9 Background jobs, schedules, reminders | Works | AG-11-17 | yes (j_9.ts) | chain |
| R1.10 | 10 Checking every input | Partial | AG-16-28, AG-18-57, AG-10-32, C1-2 | no | chain + search |
| R1.11 | 11 Server framework | Works | AC-1.1, AC-1.12, AU-A9 | no | search |
| R1.12 | 12 Screen framework, one UI kit | Works | AC-1.12.4, A11Y-3 | no | search |
| R1.13 | 13 Logs, metrics, error reports, alerts | Partial | NFR5-14, SA-11-37, SA-8-27 | no | chain |
| R1.14 | 14 Backups with a tested restore | Partial | NFR5-04, C1-3 | no | chain + search |
| R1.15 | 15 Secrets in a managed store | Partial | SA-8-1, SA8-D1, SA-8-4 | no | chain |
| R1.16 | 16 Automated testing | Works | AC-2.8.1 | no | search |
| R1.19 | 19 A firm is created once, with plan, trial and owner | Partial | SA-2-1, SA-2-22, SA-2-24, SA-3-46, SA-4-4, SA-4-5, SA-4-8, SA-4-11, SA-4-30 | no | chain |
| R1.20 | 20 One entitlement check; seat and plan limits; downgrade check; invite many | Partial | AG-1-10, AG-1-13, AG-1-69, SA-3-19, SA-3-39, SA-3-40, SA-3-58, SA-3-62, SA-4-56 | no | chain |
| R1.21 | 21 Our own invoices with sales tax | Not built | SA-4-52, SA-4-54, SA-4-67 | no | chain |
| R1.22 | 22 Suspend, cancel, failed-payment hold, data download on exit | Not built | SA-2-4, SA-2-6, SA-2-7, SA-2-8, SA-2-21, SA-2-33, SA-2-34, SA-2-35, SA-2-37, SA-2-38, SA-3-19, SA-4-20, SA-4-21, SA-4-22, SA-4-25, SA-4-26, SA-4-79, AG-16-20, AG-16-22, AG-16-34, AG-16-39, AG-1-65, SA-11-18, BR-7, BR-8 | no | chain |
| R1.23 | 23 Firm logo, colour, sender name, favicon, banner | Not built | AG-1-6, AG-1-9, AG-16-2 | no | chain |
| R1.24 | 24 Each firm's own web address | Partial | SA-2-27, SA2-D8, SA-2-2, AG-4-16, AG-4-17 | no | chain |
| R1.26 | 26 Public enquiry form, hardened against abuse | Works | AG-2-5, AG-2-49, AG-2-84 | yes (j_26.ts) | chain |
| R1.27 | 27 Every lead carries a source | Partial | AG-2-5, AG-2-8a, AG-2-23, AG-2-84 | yes (j_27.ts) | chain |
| R1.28 | 28 Consent recorded per purpose | Works | SA-11-29, AG-2-83, AG-10-22 | yes (j_28.ts) | chain |
| R1.29 | 29 One person record; duplicate warning; safe merge | Partial | AG-2-16, AG-2-96, AG-2-78, AG-2-84 | no | chain |
| R1.30 | 30 Lead lists, filters and board | Works | AG-2-18, AG-2-53 | yes (j_30.ts) | chain |
| R1.31 | 31 Stage kinds; won by signature; totals per currency | Works | AG-2-26, AG-2-47, AG-2-18, AG-2-44 | yes (j_31.ts) | chain |
| R1.32 | 32 Assign, take, reassign; Unassigned; assignment rules | Partial | AG-2-13c, AG-2-85 | yes (j_32.ts) | chain + search |
| R1.33 | 33 Phone numbers | Works | AG-2-84, AG-2-14, AG-2-4, AG-2-96 | yes (j_33.ts) | chain + search |
| R1.34 | 34 One person's data as an export, logged | Not built | AG-2-93, SA-11-40, SA-11-36 | no | chain |
| R1.35 | 35 Contacts import from a spreadsheet | Not built | AG-18-1, AG-18-2, AG-18-3, AG-18-4, AG-18-5, AG-18-6, AG-18-7, AG-18-8, AG-18-9, AG-18-11, AG-18-12, AG-18-13, AG-18-14, AG-18-15, AG-18-16, AG-18-17, AG-18-19, AG-18-20, AG-18-21, AG-18-22, AG-18-38, AG-18-39, AG-18-40, AG-18-41, AG-18-42, AG-18-43, AG-18-44, AG-18-45, AG-18-49, AG-18-51, AG-18-52, AG-18-53, AG-18-54, AG-18-56, AG-18-57, AG-18-58, AG-18-59, AG-18-60, AG-18-61 | no | chain |
| R1.36 | 36 Simple automation, message many with consent | Not built | AG-2-31, AG-2-33, AG-2-56, AG-2-90, AG-2-91, AG-16-50, AG-16-51 | no | chain |
| R1.37 | 37 Public booking page; no double booking | Works | AG-4-16, AG-4-1, AG-4-26, AG-4-9, AG-4-10, AG-4-12, AG-4-4, AG-4-5, AG-4-66, AG-4-7, AG-4-62, AG-4-17, AG-4-18, AG-4-19, AG-4-20, AG-4-32, AG-4-34 | yes (j_37.ts) | chain |
| R1.38 | 38 Time zones from booking page to invite | Works | AG-4-1, AG-4-62, AG-4-32, AG-4-18 | yes (j_38.ts) | chain + search |
| R1.39 | 39 Staff calendar screen | Not built | AG-4-67, AG-4-62 | no | chain |
| R1.40 | 40 Calendar invite files | Works | AG-4-32, AG-4-57 | no | chain + search |
| R1.41 | 41 Staff hours and time off | Works | AG-4-62, AG-4-1 | yes (j_41.ts) | chain |
| R1.42 | 42 Reschedule or cancel by link; outcomes; consult record | Partial | AG-4-36, AG-4-37, AG-4-38, AG-4-4, AG-4-5, AG-4-66, AG-4-39, AG-4-49 | yes (j_42.ts) | chain |
| R1.43 | 43 Two-way Google or Outlook calendar sync | Not built | AG-4-40, AG-4-56, AG-4-41, AG-4-42, AG-4-43, AG-4-59, AG-16-16, AG-16-71 | no | chain |
| R1.45 | 45 Firm templates, field picker, preview with a real record | Not built | AG-12-70, AG-12-89, AG-12-66, AG-12-44, AG-12-45, AG-12-65, AG-12-95, AG-12-99 | no | chain |
| R1.46 | 46 Template text editor (a plain text box) | Not built | AG-12-64, AG-12-70 | no | search |
| R1.47 | 47 One email layout | Partial | AG-16-70 | no | search |
| R1.48 | 48 Sending, delivery state, bounces, the firm's sender name | Works | AG-10-7, AG-10-25, AG-16-17, AG-10-1, AG-10-3, AG-10-5 | yes (j_48.ts) | chain + search |
| R1.49 | 49 Consent gate before every send; unsubscribe | Partial | AG-10-22, SA-11-29, AG-10-24, AG-2-83 | no | chain + search |
| R1.50 | 50 In-app notifications; personal notification settings | Not built | AG-10-29a, AG-10-29b, AG-10-36, AG-16-10, AG-7-39, AG-16-11 | no | chain |
| R1.52 | 52 Connected mailbox; WhatsApp (no SMS) | Not built | AG-10-4, AG-10-68, AG-10-62, AG-10-9, AG-10-10, AG-10-11, AG-10-12, AG-10-13, AG-10-14, AG-10-28, AG-10-69, AG-10-3, AG-10-33, AG-10-35, AG-10-39, AG-16-18, SA-11-37, SA-11-39, AG-10-16, AG-10-17 | no | chain + search |
| R1.53 | 53 Retainer with the regulator's 26 items; versioned until sent | Partial | AG-5-3, AG-5-65, AG-5-4, AG-5-7, AG-5-16, AG-5-8, AG-5-9, AG-5-49, AG-5-55, AG-5-57, AG-5-64 | no | chain |
| R1.54 | 54 E-signature with evidence; send any document for signature | Partial | AG-5-61, AG-5-20, AG-5-28, AG-5-31, AG-5-41, AG-5-37, AG-5-62, AG-5-25, AG-5-26 | no | chain |
| R1.55 | 55 Withdraw, re-issue, decline, signed offline | Partial | AG-5-34, AG-5-21, AG-5-68, AG-5-39, AG-5-65, AG-5-37 | no | chain |
| R1.56 | 56 Client invoices, tax by province, government-fee line | Partial | AG-6-1, AG-6-2, AG-6-3, AG-6-4, AG-6-5, AG-6-6, AG-6-7, AG-6-8, AG-6-45, AG-6-42, AG-6-44, AG-6-46 | no | chain + search |
| R1.57 | 57 Card payment of invoiced fees into the firm's operating account | Not built | AG-6-14, AG-6-15, AG-6-16, AG-6-17, AG-6-49, AG-6-69, AG-16-14, AG-16-15, AG-16-16, AG-16-18 | no | chain + search |
| R1.58 | 58 Trust or operating on every payment; per-client ledger; "to move" list | Partial | AG-6-69, AG-6-59, AG-6-60, AG-6-61, AG-6-63, AG-6-68, AG-6-73, AG-6-19, AG-6-20, AG-6-43, AG-6-23, AG-6-74 | no | chain |
| R1.59 | 59 Money arithmetic | Works | AG-6-1, AG-6-4, AG-6-46 | yes (j_59.ts) | chain |
| R1.60 | 60 Deposit invoice prepared on signature | Not built | AG-6-61, AG-6-32 | no | chain + search |
| R1.61 | 61 Sign and pay by single-use link | Partial | AG-5-21, AG-6-14 | no | chain |
| R1.62 | 62 Client login portal; progress stream with "last update" | Not built | AG-15-1, AG-15-3, AG-15-50, AG-15-54, AG-10-73, BR-2 | no | chain + search |
| R1.63 | 63 Per-person checklist with status words; reject with reason | Works | AG-7-15, AG-7-17, AG-9-26, AG-9-27 | no | search |
| R1.64 | 64 Upload that resumes after a dropped connection | Not built | **NO SOURCE** | no | — |
| R1.65 | 65 Private storage in Canada: firm-prefixed keys, versions, encryption | Not built | AG-9-16, AG-9-17, AG-9-18, AG-9-19, SA-8-6, AG-9-5 | no | chain + search |
| R1.66 | 66 Virus scan; nothing served while scanning | Not built | AG-9-20, AG-9-21, AG-9-55, SA-8-36, SA8-D2 | no | chain |
| R1.67 | 67 File-type check | Works | AG-9-2, AG-9-2a, SA-8-37, SA8-D27, SA8-D2 | yes (j_67.ts) | chain |
| R1.68 | 68 Preview for staff review | Not built | AG-9-24 | no | search |
| R1.69 | 69 Read log, fingerprint, keep-period reminder | Not built | BR-7, AG-9-31, AG-9-32, AG-9-33 | no | chain + search |
| R1.70 | 70 Expiry, translation and notarisation flags | Not built | AG-9-12, AG-9-29, AG-9-64, AG07-D26(8) | no | chain + search |
| R1.72 | 72 Case with applicants, representative, pinned release | Works | AG-7-1, AG-7-4, AG-7-104, AG-7-56, AG-2-47 | yes (j_72.ts) | search |
| R1.73 | 73 Stages moved by events | Works | AG-7-11, AG-7-12 | no | search |
| R1.74 | 74 Government deadlines that remind; working days with holidays | Partial | AG-7-96, AG-7-94 | yes (j_74.ts) | search |
| R1.75 | 75 Tasks: My Tasks, Unassigned, handover | Not built | AG-13-5, AG-13-62, AG-13-63, AG-13-2, BR-19, AG-7-36, AG-7-106, AG-7-43, AG17-D10 | no | chain + search |
| R1.76 | 76 Notes; one timeline per record | Not built | AG-13-20, AG-13-24, AG-13-30, AG-2-94 | no | chain |
| R1.77 | 77 Submission number and UCI; decision, close, reopen | Works | AG-7-33, AG-7-50, AG-7-34, AG-7-13, BR-10, BR-15, AG-7-31, AG-7-95 | yes (j_77.ts) | chain + search |
| R1.79 | 79 Firm dashboards and reports | Not built | AG-14-1, AG-14-4, AG-14-5, AG-14-7, AG-14-9, AG-14-10, AG-14-12, AG-14-13, AG-14-14, AG-14-15, AG-14-18, AG-14-19, AG-14-20, AG-14-22, AG-14-27, AG-14-28, AG-14-31, AG-14-33, AG-14-36, AG-14-37, AG-13-68, AG-2-87 | no | chain + search |
| R1.80 | 80 IRCC forms per applicant from one set of answers | Works | AG-7-21, AG-7-22, AG-7-109 | no | search |
| R1.82 | 82 Readiness check; staff approval per form | Works | AG-7-24, AG-7-27, AG-7-29, AG-7-66, SA-1B-221 | no | search |
| R1.83 | 83 Conditional questions and fields | Works | AG-8-5, AG-8-6, AG-8-8, SA-1B-14, SA-1B-111 | no | search |
| R1.84 | 84 Pathway set-up: hierarchy, versioned releases, cited rules | Works | SA-1B-50, SA-1B-297, SA-1B-38, SA-1B-39 | no | search |
| R1.85 | 85 Data-request register with legal hold | Partial | SA-11-27, SA11-D4, SA-11-18, SA-11-28, SA-11-16, SA-11-34, SA-11-40 | no | chain |
| R1.86 | 86 Breach register with firm notices | Not built | SA-11-24, SA-11-25, SA11-D8 | no | chain |
| R1.87 | 87 Our access to a firm's data, logged and shown to the firm | Not built | SA-11-12, SA-11-11, BR-14, SA-2-16, SA-2-29, SA-2-19, SA-11-31, SA-11-8, SA-11-3 | no | chain + search |
| R1.88 | 88 The firm reads its own audit log | Not built | AG-16-26, SA-6-33, AG-13-44, AG-13-43, AG-16-22, SA6-D11 | no | chain |
| R1.89 | 89 Public pricing page | Not built | SA-3-2, SA-3-27, SA-3-46, SA-3-50 | no | chain + search |
| R1.90 | 90 Self-serve sign-up, email check, trial with no card, private links, trial banners | Partial | SA-4-5, SA-4-30, SA-3-46, SA-4-79, SA-4-82, SA-2-22, SA-4-4, SA-4-8, SA-2-24, SA-4-52 | no | chain |
| R1.91 | 91 Plans, change, cancel, invoices, card update, yearly plans, refunds, billing emails | Not built | SA-4-28, SA-4-56, SA-3-58, SA-4-54, SA-4-67, AG-1-65, SA-4-11, SA-4-35, SA-4-53, SA-4-89, SA-4-55, SA-4-49, SA-4-62, SA-4-91 | no | chain |
| R1.92 | 92 Firm profile, offices and time zones, licence-number check | Partial | AG-1-34, AG1-D19, AG-1-74, AG-16-68, AG-16-59 | no | chain |
| R1.93 | 93 Our team's console; health per firm; support button | Partial | SA-7-1, SA-7-2, SA-7-11, SA-7-14, SA-2-14, SA-4-24, SA-7-10, SA-7-3, SA-7-20, AG-16-63 | no | chain |
| R1.95 | 95 Custom fields and saved views | Not built | AG-2-23 | no | chain |
| R1.96 | 96 Reversals, refunds, credit notes, payment plans, write-offs | Not built | AG-6-23, AG-6-48, AG-6-75, AG-6-76, AG-6-21 | no | chain |
| R1.97 | 97 Tamper-evident audit chain | Not built | SA-11-4, BR-2, SA-11-6, SA-11-5, AG-13-42, NFR5-08 | no | chain |
| R1.98 | 98 Corporate clients, employers, LMIA | Partial | AG-2-52, AG-2-75, AG-2-77, AG-2-76, AG-2-79, AG17-D6, AG-17-2, AG-17-3, AG-17-6, AG-17-7, AG-17-8, AG-17-10, AG-17-11, AG-17-12, AG-17-14, AG-17-15, AG-17-16, AG-17-17, AG-17-18, AG-17-19, AG-17-22, AG-17-23, AG-17-26, AG-17-36, AG-17-37, AG-17-39, AG-17-89, AG-17-40, AG-17-41, AG-17-42, AG-17-43, AG-17-44, AG-17-45, AG-17-46, AG-17-47, AG-17-50, AG-17-51, AG-17-54, AG-17-55, AG-17-57, BR-1, BR-4, BR-5, BR-9, BR-10, BR-11, BR-14 | no | chain |
| R1.99 | 99 AI on top of the guardrails: proposed values, document reading | Works | AG-9-43, AG-9-45, AG-9-46, AG-8-41 | no | search |
| R1.100 | 100 Recorded acceptance of our terms, privacy notice and data agreement | Works | SA-4-65 | yes (j_100.ts) | search |
| R1.101 | 101 Client answers and uploads through a secure link | Works | AG-8-13, AG-8-17, AG-9-7 | no | search |
| R1.102 | 102 Find a person or case by name, email or file number | Partial | AG-7-75, AG-7-88, AG-2-1, AG17-D6 | no | chain |
| R1.104 | 104 Consultation agreement signed before the first consult | Not built | AG-4-15, MS-D3 | no | search |
| R1.105 | 105 Keep periods; a leaving firm is closed, not deleted | Partial | SA-11-33, SA11-D3, SA-11-14, BR-6, BR-15, BR-7, BR-8, SA-11-18, SA-11-16, SA4-D18, SA-2-7, SA-2-21, SA-2-37, SA-2-38, SA-2-34, SA-2-6, SA-4-25, SA-3-19 | no | chain |
| R1.106 | 106 Pathway assessment AS-1: Express Entry and FSW scores | Partial | AG-3-1, AG-3-2, AG-3-3, AG-3-4, AG-3-5, AG-3-6, AG-3-7, AG-3-10, AG-3-11, AG-3-12, AG-3-14, AG-3-15, AG-3-17, AG-3-18, AG-3-19, AG-3-20, AG-3-21, AG-3-25, AG-3-26, AG-3-27, AG-3-28, AG-3-32, AG-3-33, AG-3-34, AG-3-35, AG-3-36, AG-3-37, AG-3-39, AG-3-40, BR-1, BR-2, BR-3, BR-4, BR-6, BR-7, BR-8, BR-10, BR-12, BR-14, AG02-D9(3) | no | chain + search |
| R1.107 | 107 Pathway assessment AS-2: five provincial streams, client copy | Not built | AG-3-19, AG-3-11, AG-3-13, BR-6, AG-3-38, AG-3-27, AG-3-32, AG-3-34, AG-3-41, BR-11, BR-16, BR-17, AG02-D9(3) | no | chain + search |
| R1.108 | 108 Conflict-of-interest check | Partial | **NO SOURCE** | yes (j_108.ts) | — |
| R1.109 | 109 Complaints record | Works | **NO SOURCE** | yes (j_109.ts) | — |
| R1.110 | 110 Client identity check | Works | **NO SOURCE** | yes (j_110.ts) | — |
| R1.111 | 111 Client statement and period exports for the accountant | Not built | AG-6-28, AG-6-31, AG-14-39 | no | chain |
| R1.112 | 112 Video meeting links on bookings | Not built | AG-4-29, AG-4-58, AG-4-59, AG-16-73 | no | chain |

## Part 2: the five scope changes

Read-only check, 21 Nov 2026. Code read at `origin/main` (head ecc47858e at session start, later merges included where cited by PR). Paths: `domain/requirements-2026-11-02/` = `domain/requirements-2026-11-02/`; `P/` = `ai-workers/problem-1-pathway-setup-and-form-filling/` (on main); `S/` = `P/prototype/studio/`. DECISIONS.md in the product folder on main matches main (688 lines both).

**Audit claims found wrong or incomplete**
* **R1.106:** the audit is right about the source text, but wrong to call it a silent narrowing. PNP is its own Release 1 row, R1.107, and the split was decided by the founder (P-577). (The brief's warning that "AG-3-19 is about STALE" is only half right. The id has two meanings in the snapshot: Doc 3 `domain/requirements-2026-11-02/01-techno-functional/05-Doc-3-Agent-Console.md:1412` is the stale-assessment rule, and AG-03 v1.5 `domain/requirements-2026-11-02/02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:383` names the PNP streams. The functional file is the newer source.)
* **R1.53:** "added by a Lead decision (P-566 (3))" leaves out that **the founder confirmed it as P-567 (2)**, including the departure from AG-05. Also, "26" is only the letter count (a)-(z). The FO-5b brief deliberately does not hard-code it: its DW1 test counts the paragraphs on the page that was read.
* **R1.74:** "holidays goes beyond the source" overstates it. The code uses the firm's closed days and never moves the government date (it follows AG-7-94). Only the row's wording says "holidays".
* **R1.100:** the audit says no decision is cited. P-568 (1) and P-572 (row 18) already keep French out, but R1.100 does not cite them.
* **R1.8:** right that the ruling came mid-proof and is not in DECISIONS. But QA-596 brought our own over-wide Done when back toward the source. It did not narrow the source.

---

### 1. R1.8 Audit trail nobody can edit (QA-596)

**Source says**
* **SA-11-1**, `domain/requirements-2026-11-02/02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:458`: "An append-only audit log SHALL record every security- and data-significant event … create/update/delete on case/client/prospect/financial records with before/after where applicable, … and system actions."
* The same file, §3.1 (line 289), repeats "create/update/delete on case/client/prospect/financial records with **before/after** where applicable".
* **AG-13-41**, `domain/requirements-2026-11-02/02-functional-requirements/agent/AG-13-tasks-reminders-notes-and-activity-audit_v1.19_2026-10-27.md:480`: "Append-only at the database (no UPDATE/DELETE grant; RLS forced) — corrections are new reversing rows."

**We built / require**
* R1 Done when (`P/product/qa/CAPABILITIES.md:145`): "Every create, change and delete on PF/FO tables writes who, when, before and after; UPDATE or DELETE on the audit table refused by the database even for the app's role (fail case); a line with another firm's id refused".
* The ruling, `P/product/qa/BUGS-CLOSED.md:7` (QA-596, closed on main d67a5c77c), was made by the tech lead in #2593 comment 7049414063:
  * (a) a row created inside an audited change is covered by its parent line;
  * (b) message delivery state is system state, and booking tokens are secrets never written to an audit line;
  * (c) `platform_limit_change` is an insert-only record of its own (`S/api/src/entitlements/limit-changes.ts:58-63`).
* The verdict moved from Partial to Works on the same runs (`P/product/qa/reports/2026-11-21-capability-R1.8.md:5-7`; walks 44804815642 and 44804820326, j_8 33/33).

**Already recorded?** No. There is no DECISIONS row. The ruling lives only in BUGS-CLOSED, the qa report and a PR comment. (Related and recorded: P-607 (3) "fail-closed audit … departure from SA-11-7, BR-5, NFR5-08 recorded (AUD-1b)"; P-687 personal values in full.)

**Verdict: not a narrowing of the source; it narrows our own Done when.** The R1 wording "every create, change and delete on PF/FO tables" was wider than SA-11-1, which says "where applicable" and lists records by kind. One point is weak: SA-11-1 also lists "system actions", and ruling (b) leaves message delivery state with no audit line. Delivery state has its own event rows, so this is a defensible reading, but it is a reading.

**Recommended DECISIONS wording**
> P-NNN | 21 Nov | **R1.8's "every create, change and delete" read as the source reads it (tech lead ruling QA-596, #2593 comment 7049414063, recorded here after the fact).** The team's SA-11-1 asks for an append-only log of "create/update/delete on case/client/prospect/financial records with before/after where applicable" and of "system actions". Release 1's Done when said every create, change and delete on PF/FO tables, which is wider. Release 1 builds this:
> * one audit line per person's change to a business record, with before and after values;
> * a row created inside that change (a lead's close or reopen note, an invitation revoked on resend) is covered by the parent line in the same transaction;
> * message delivery state is system state, kept on its own event rows, not as audit lines;
> * booking tokens are secrets and are never written to an audit line;
> * a plan-limit change is its own insert-only record, with a line for each live firm.
>
> Why: this matches the source's "where applicable" and keeps secrets out of the log. R1.8's Done when gains the words "for a person's change to a business record (QA-596)". Owed and still open: check_aud_values must refuse null before and after on `*.updated` / `*.changed` (register lane). No founder question, because the source settles it. Unconfirmed: no counsel on whether delivery state counts as a "system action" an auditor expects in the log.

---

### 2. R1.106 Pathway assessment AS-1: Express Entry and FSW scores (provincial streams)

**Source says**
* **AG-3-19**, `domain/requirements-2026-11-02/02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:383`: "The Canada pack SHALL provide, as rule-sets, at minimum: **CRS** (Express Entry, draw-ranking), **FSW-67** (fixed pass), and the PNP streams **OINP / AAIP / SINP / BCPNP / MPNP** (ranking/EOI with province-connection gates)."
* **SA-1B-200** (newer), `domain/requirements-2026-11-02/02-functional-requirements/super-admin/SA-01B-content-pack-configurator_v2.1_2026-10-27.md:3045`: "provincial calculators for ON, BC, AB, SK, MB, NS, NB, PEI, NL, YT, NWT, plus the rural pilot (RCIP)". It names "the practice engine as the logic source" (SA1B-D61).
* The knock-on list `SA-01B-v2.0-KNOCK-ONS_2026-10-26.md:94` asks AG-3-19 to "Add NS, NB, PEI, NL, YT, NWT, RCIP and CLB", but line 4 says "Nothing here is applied yet".
* Id collision: in Doc 3 (`01-techno-functional/05-Doc-3-Agent-Console.md:1412`), AG-3-19 is the STALE-assessment rule.

**We built / require**
* R1.106 Done when (`CAPABILITIES.md:213`): "Answers give the scores from cited official rules (page, quote, date, P-170), each score with its parts; a missing answer says what is needed". It is Partial: only AS-1m (#2105, a code move behind `EligibilityPort`) is merged. AS-1g, AS-1s, AS-1c, FO-15a/b/s and CS-106c are not built, and no score has a test.
* R1.107 (`r1rows.txt:76`; `CAPABILITIES.md:214`, Not built): "Pathway assessment AS-2: five provincial streams, client copy … Each stream says eligible or not with its cited rule".
* BACKLOG AS-2e, AS-2d1 (Ontario, BC) and AS-2d2 (Alberta, Saskatchewan, Manitoba), each with Source "P-577; … AG-3-19" (`BACKLOG.md:1192-1194`).

**Already recorded?** Yes, for the AG-3-19 split.
* P-577 (`DECISIONS.md:205`): "**AS-1, first build:** … Express Entry ranking score and Federal Skilled Worker grid breakdowns … **AS-2, right after:** the five provincial streams (each cited at the province's official page) and the client-shareable copy".
* P-607 (9): "per province the stream whose official page publishes its own grid or points, cited, one confirming card (AS-2d1/d2)".
* **Not recorded:** SA-1B-200's further six provinces and RCIP, and SA1B-D61's "practice engine as answer key" set beside P-170's official-source rule. No DECISIONS row mentions RCIP, NS/NB/PEI/NL/YT/NWT or the practice engine.

**Verdict: not a narrowing of R1.106 after all.** PNP was split into R1.107 by founder decision P-577. There is a separate, unrecorded narrowing on **R1.107**: five provinces against SA-1B-200's eleven plus RCIP. The team's two documents also disagree with each other (AG-3-19 names five; SA-1B-200 names eleven plus RCIP). Under AGENTS rule 2 that disagreement goes to the founder.

**Recommended DECISIONS wording**
> P-NNN | 21 Nov | **Pathway assessment scope: Release 1 keeps AG-3-19's five provinces; SA-1B-200's other six and the rural pilot wait (tech lead, from P-577 and P-607 (9); one founder question).** The team's AG-3-19 (AG-03 v1.5) asks for CRS, FSW-67 and the PNP streams OINP, AAIP, SINP, BCPNP and MPNP. The newer SA-1B-200 (SA-01B v2.1) adds NS, NB, PEI, NL, YT and NWT calculators and the rural pilot (RCIP), and names the product owner's practice engine as the answer key. Release 1 builds:
> * Express Entry (CRS) and FSW-67 on R1.106 (AS-1);
> * one cited stream for each of the five AG-3-19 provinces on R1.107 (AS-2), each from the province's official page.
>
> Why: P-577 phased it this way, and AG-3-19 is the assessment epic's own list. Every value comes from official pages (P-170, P-541). The practice engine may serve as a test answer key but never as the source of a value. Deferred: the six further provinces and RCIP, to a new BACKLOG row after R1.107. **Founder question:** do the six further provinces and RCIP belong to Release 1, as SA-1B-200 says, or after launch? The two team documents disagree, and only the founder can settle it.

---

### 3. R1.100 Recorded acceptance of our terms, privacy notice and data agreement (French first)

**Source says**
* **SA-4-65**, `domain/requirements-2026-11-02/02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:591`: "The subscription terms, invoices, receipts and credit notes are bilingual for every firm, with the French text first. A firm accepts the terms before its card is taken (sign-up link) or at the owner's first sign-in … the acceptance is recorded (terms version, date, person)."
* **SA4-D19** (same file, line 75) gives the reason: "Quebec Charter of the French Language: invoices available in French — s. 57; standard-form contracts presented in French first since 1 June 2023".

**We built / require**
* R1.100 Done when (`CAPABILITIES.md:165`, Works on main 3abfe81cc after PF-5s part 1 #2608): "Sign-up cannot finish without accepting the current versions; who, when and which version stored and shown; a new version asks again at the next sign-in. Unconfirmed: no counsel".
* The schema `S/prisma/schema/platform.prisma:429-460`: `PlatformTermsVersion` (kind, version, url, publishedAt) and `PlatformTermsAcceptance` have no language field, so there is one text per version and no French version.
* The BACKLOG source for PF-5t is circular: "Source: checklist row 100 (R1.100)" (`BACKLOG.md:329`, `:645`).

**Already recorded?** Partly, but not linked to R1.100.
* P-568 (1) (`DECISIONS.md:214`): "Row 18: no Quebec firm in the first firms; Quebec sales tax (QST) and French stay out until he says otherwise."
* P-572 (`DECISIONS.md:210`): "Rows … 18 French and Quebec sales tax (already P-568) … remain Optional" (MVP-CHECKLIST.md:175, BACKLOG X-1 to X-8).
* Neither row names SA-4-65 or the terms documents. SA-4-65 says "for every firm", not only Quebec firms.

**Verdict: a narrowing, already decided by the founder (P-568 (1), P-572), but not cited on the row.** It needs a short linking row and a Source fix. Whether French-first terms are legally needed for a firm outside Quebec is a legal point (Unconfirmed: no counsel).

**Recommended DECISIONS wording**
> P-NNN | 21 Nov | **R1.100 records acceptance of English terms only; SA-4-65's bilingual, French-first terms wait with Quebec (tech lead, applying the founder's P-568 (1) and P-572 row 18).** The team's SA-4-65 says the subscription terms, invoices, receipts and credit notes are "bilingual for every firm, with the French text first" (SA4-D19, citing Quebec's Charter of the French Language). Release 1 builds:
> * acceptance of the current version of each document (terms of service, privacy notice, data-processing terms), with who, when and which version;
> * the same documents asked again when a version changes;
> * each version as one English text with no language field.
>
> Why: the founder kept French and Quebec out of the first build (P-568 (1): "no Quebec firm in the first firms … French stay[s] out until he says otherwise"), and no first firm is in Quebec. Deferred to BACKLOG X-row 18 (French and Quebec tax): a French version per document, shown first, and a language on each acceptance. Before any Quebec firm, or any firm with Quebec clients, signs up, this must be reopened. R1.100's Source becomes "SA-4-65 (acceptance part); P-568 (1); P-572". No founder question, because P-568 already settles it. Unconfirmed: no counsel on whether French-first terms are required for firms outside Quebec, as SA-4-65's "every firm" implies.

---

### 4. R1.53 Retainer with the regulator's 26 items; versioned until sent

**Source says**
* **The team's requirement says the opposite.** AG-05 rule 3 (AG-5-16), `domain/requirements-2026-11-02/02-functional-requirements/agent/AG-05-retainer-and-agreements_v2.1_2026-10-27.md:539`: "Staff may edit, merge or delete any clause that is not locked. Nothing is required; send is never refused for a missing clause."
* Line 547: "ExpatReady never says a clause is required or correct (Rule 7)."
* Line 41: "Locked 'required clauses' and a refusal to send. They are gone."
* **AG-5-9** (line 565): "A field the template marks must-fill (AG-12; the starter marks client name and fee) blocks Send while empty".
* No team requirement names the College Code s. 24(3) or "26 items". A search of `domain/requirements-2026-11-02/` for "24(3)" or "SOR/2022-128" in AG-05 finds nothing.

**We built / require**
* R1.53 Done when (`CAPABILITIES.md:197`, Partial): "A draft shows the Code's items, each present or missing (non-blocking, P-566); edits make versions until sent; a sent retainer cannot change. Unconfirmed: no counsel".
* Versioning is proven (fo5 159/159). The Code items are not built: FO-5b is not merged, and "the draft's 'missing' list is the template's empty placeholders, not the Code's items".
* FO-5b (`BACKLOG.md:340`): "a fixed list of the Code's s. 24(3)(a)-(z) items, each with its section, official URL and 'current to' date … never refusing send". Source column: "AG-5-9; P-566" (`BACKLOG.md:650`). The row text also cites "Code SOR/2022-128 s. 24(2)-(5) (trace t8)".
* Main `P/product/design/lead-b-briefs/FO-5b.md:11,17,23` requires `samples/cicc-code-s24-items.json` with each paragraph copied word for word, plus url, currentTo and readOn. Its DW1 test counts the letters on the page that was read, so 26 is not hard-coded.

**Already recorded?** Yes.
* P-567 (2) (`DECISIONS.md:215`): "'Build checklist': FO-5b, a non-blocking checklist of the Code's s. 24(3) items (SOR/2022-128, current to 2026-10-19); only the client name and fee block stop a send; departs from AG-05 l.539-550; Unconfirmed: no counsel."
* This is the founder's confirmation of Lead B's P-566 (3) ruling.

**Official citation in the repo:**
* **None for s. 24(3) itself.** `P/official-sources/` on main holds no College Code file. `samples/cicc-code-s24-items.json` does not exist yet (FO-5b is not built). No verbatim s. 24(3) text sits anywhere on main.
* What does exist:
  * FO-13 and FO-13c rows (`BACKLOG.md:366-367`, `:622`, `:669`) carry "laws-lois.justice.gc.ca/eng/regulations/SOR-2022-128/, current to 2026-10-19, read 13 Nov 2026; Unconfirmed: no counsel" for s. 5, 15, 16, 24(2)(a), 24(3)(o)(r)(v), 29, 35(1)(c), 37;
  * `S/api/src/front-office/compliance/conflict/service.ts:10` cites s. 24(3)(o) from "trace t8 §1b (current to 2026-10-19, read 16 Nov)";
  * P-735 (`DECISIONS.md:47`) read FullText.html on 19 Nov showing "Regulations are current to 2026-10-29", so FO-5b's "current to 2026-10-19" is out of date.
* The R1.53 row itself carries no url, quote or date. "26" has not been checked against the official text in the repo.

**Verdict: a widening.** It adds a regulator checklist the team's AG-05 explicitly removed. It is already recorded and founder-confirmed (P-567 (2)). What is missing is a link on R1.53 and FO-5b's Source column to P-567 (2) and the Code citation, plus a refreshed "current to" date. "26" should not appear in the row title until it is checked against the official text.

**Recommended DECISIONS wording**
> P-NNN | 21 Nov | **R1.53's Code checklist traced to P-567 (2); "26" replaced by "the Code's s. 24(3) items" until counted at source (tech lead).** The team's AG-05 says "Nothing is required; send is never refused for a missing clause" and "ExpatReady never says a clause is required or correct" (rule 3, AG-5-16; Safety, Rule 7). Only AG-5-9's must-fill client name and fee block Send. The founder confirmed a departure on 14 Nov (P-567 (2)): FO-5b shows a non-blocking checklist of the College's Code of Professional Conduct, SOR/2022-128, s. 24(3). Release 1 builds:
> * each s. 24(3) paragraph, copied word for word from laws-lois.justice.gc.ca/eng/regulations/SOR-2022-128/, with its "current to" date and the date read;
> * each paragraph marked present or missing on the template and the draft;
> * no refusal of Send because of the checklist;
> * none of our own words saying "required", "must" or "correct", which keeps AG-05 Rule 7.
>
> Why: a retainer missing a Code item is a compliance risk for the firm, and the checklist warns without overriding the firm's own drafting. Changes:
> * R1.53's title and the checklist row 53 say "the Code's s. 24(3) items" instead of "26"; the count is taken from the page when FO-5b's data file is made (DW1);
> * FO-5b's Source becomes "AG-5-9; P-566 (3); P-567 (2); Code SOR/2022-128 s. 24(3) (url, current to as read, read on)";
> * the "current to 2026-10-19" in FO-5b and P-567 is re-read, because P-735 found "current to 2026-10-29" on 19 Nov.
>
> No founder question (P-567 settled it). Unconfirmed: no counsel.

---

### 5. R1.74 Government deadlines that remind; working days with holidays

**Source says**
* **AG-7-94**, `domain/requirements-2026-11-02/02-functional-requirements/agent/AG-07-case-core-and-delivery_v3.12_2026-10-28.md:3649-3681`:
  * rule 2 (line 3658): "Business hours and closed days never move it";
  * rule 4 (line 3660): "The closed-days list is empty at first … ExpatReady seeds no closed days, and offers a suggested list the firm can add from (AG16-46)";
  * non-goals (line 3681): "No moving of government dates. No seeded closed days. No country holiday logic."
* The glossary (line 310): "The closed days are the firm's own list … ExpatReady offers suggested holidays but saves nothing until the firm clicks Add."
* Government steps (Ch 8, line 490): the letter gives a **suggested** due date ("within 30 days" → Fri 1 Jan 2027) that staff confirm; the data model at line 2482 has `dueStatus` SUGGESTED/CONFIRMED.
* X-25 is **our** BACKLOG row ("'Add holidays for [province] [year]' suggestions | AG-16-74 | rev 13, P-581 minimum", `BACKLOG.md:1360`). It is not part of the team's text.

**We built / require**
* R1.74 Done when (`CAPABILITIES.md:209`): "a period in working days skips weekends and the firm's holidays (a pass and a fail each); judged on the checklist row's words (no BACKLOG row)".
* But CS-DL1 exists (`BACKLOG.md:1072`, Source AG-7-10, AG-7-33, AG-7-35; "WORKING skips weekends and the firm's and office's **closed days** … Holiday suggestions stay X-25"). The checklist row 74 itself names CS-DL1 (`MVP-CHECKLIST.md:146`).
* Code follows AG-7-94:
  * `S/api/src/MODULE.cases.md:23`: "A stage deadline is the calendar date its rule gives, never moved by hours or closed days";
  * `S/api/src/case-deadlines/plan.ts:2-7`: reminders 7 and 2 working days before and on the day (Sample), "counted back over open days … the date itself is never moved".
* No "holiday" string exists anywhere in `S/api/src` or `j_74.ts`.
* CS-DL3 parts 1-3 merged (#2485, #2594 9af529c57, #2677 4e587d677):
  * Government steps on the case page; the due date is "typed from the letter" (`P/product/qa/built/R1.74.md`);
  * `caseMilestone` has no SUGGESTED/CONFIRMED status (`S/api/src/MODULE.cases.rows/CS-DL3.md`).
* CS-DL3 has **no BACKLOG row** on main (only MODULE.rows, `screens/CS-DL3/`, STATE and plan-2026-11-21-0700). CS-DL1b also exists as a row card.

**Already recorded?**
* The holiday-suggestion deferral is in BACKLOG (X-14, X-25), with "P-581 minimum". P-581 (`DECISIONS.md:201`) puts "the rest of groups 1-8" after launch.
* Not recorded:
  * the Done when's "holidays" and "no BACKLOG row" wording;
  * that the letter's suggested due date (AG-7 Ch 8, AG-10-73 matcher) is replaced by a staff-typed date;
  * that CS-DL3 has no BACKLOG row.

**Verdict: not a narrowing after all.** It is a wording error on the row. The build matches the source: firm closed days, the government date never moved, no country holiday logic. Two rows need text fixes: "holidays" → "closed days", and "no BACKLOG row" → CS-DL1, CS-DL1b, CS-DL3. One real narrowing sits beside it, outside R1.74's words: the letter's suggested due date is not built. The due date is typed by staff, and the letter matcher is P-581's "letter library", which comes after launch.

**Recommended DECISIONS wording**
> P-NNN | 21 Nov | **R1.74 reads "closed days", not "holidays"; government steps take a due date typed from the letter (tech lead, from AG-7-94, P-581).** The team's AG-7-94 says a government date "never move[s]" for business hours or closed days. It says a reminder "n working days before" is counted back over the firm's open days. The closed days are the firm's own list, empty at first, with suggested holidays the firm may add. Its non-goals are "No moving of government dates … No country holiday logic". Release 1 builds this, as merged in CS-DL1, CS-DL1b and CS-DL3 parts 1-3 (#2485, #2594, #2677):
> * the stage or step deadline is shown on its calendar date, with its weekday and "(closed day)" or "(weekend)";
> * reminders fall 7 and 2 working days before and on the last working day by the date (Sample offsets), counted over the firm's closed days;
> * reminders reach the case officer and the lead representative, and Home's Needs you.
>
> Changes to the rows:
> * R1.74's title and Done when say "the firm's closed days" instead of "holidays";
> * "no BACKLOG row" is replaced with "CS-DL1, CS-DL1b, CS-DL3";
> * CS-DL3 gets its BACKLOG row (Source AG-7-33, AG-7-94, AG-7-96 rule 7; QA-591).
>
> Deferred:
> * suggested holidays ("Add holidays for [province] [year]", AG16-46) stay in X-25;
> * the letter's suggested due date with Suggested / Confirmed status (AG-7 Ch 8, AG-10-73 letter matcher) waits for the letter library after launch (P-581). Until then staff type the due date from the letter.
>
> No founder question, because the source and P-581 settle it.


## Part 1 in full: each row's team requirements, quoted

### R1.1 1 Hosting, data, backups and logs in Canada
Not built · journey test: no · BACKLOG chain, plus ids the reader added by search

* **C1-3**, `01-techno-functional/02-Architecture-Decision-Record.md:331`: "ca-central-1 residency by construction (CI region-allowlist), DR within Canada, per-rail sub-processor residency matrix, field-level envelope encryption for Restricted PII, crypto-shred erasure + orchestrator + certificate."
* **SA-11-32**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:504`: "SA-11 SHALL hold a written data-location statement: all client data is stored in Canada (Montréal), encrypted; Stripe and the mailbox, calendar, Zoom"
* Dropped from the BACKLOG sources (8): AG-4-16 (in the snapshot it is about the public booking page under the firm's web address; not this row's capability); NFR5-04 (in the snapshot it is about DR targets (RPO 15 min, RTO 4 h, restore drill); says nothing about location; not this row's capability); NFR5-14 (in the snapshot it is about observability tooling and SLO paging; says nothing about location; not this row's capability); SA-2-21 (in the snapshot it is about deleting a firm's data 90 days after payment hold or closure; not this row's capability); SA-2-27 (in the snapshot it is about the firm's web address; not this row's capability); SA-8-1 (in the snapshot it is about service keys in the cloud secret store; not this row's capability); SA-8-4 (in the snapshot it is about key rotation by runbook; not this row's capability); SA2-D12 (in the snapshot it is about purging backup copies within 35 days of deletion, not where or how they are restored; not this row's capability).
* Fit: Narrower: sources set residency and DR in Canada; image, smoke and 'read from the cloud account' rest on P-558/P-559. SA-8-6 (S3 in Canada) is cited only by PF-24.

### R1.2 2 Database
Works · journey test: no

* **SA-2-1**, `02-functional-requirements/super-admin/SA-02-tenant-firm-management_v2.24_2026-10-12.md:420`: "Super Admin can create a firm with: operating name, legal name, one destination country (Active countries only), business address (country, province/state, city, postal code) with"
* **SA-2-4**, `02-functional-requirements/super-admin/SA-02-tenant-firm-management_v2.24_2026-10-12.md:427`: "Firm status is one of PROVISIONING, TRIAL, ACTIVE, PAYMENT_HOLD, SECURITY_LOCK, ABANDONED, DELETED, with only the transitions in §6."
* **SA-2-9**, `02-functional-requirements/super-admin/SA-02-tenant-firm-management_v2.24_2026-10-12.md:435`: "Each firm has exactly one destination country, set at creation and never changed by any actor; at most one country per firm is enforced in"
* **SA-2-24**, `02-functional-requirements/super-admin/SA-02-tenant-firm-management_v2.24_2026-10-12.md:462`: "A firm's contact email (trimmed, lower-cased) must not be the contact email of any other firm; creation or contact change that would break this is"
* **SA-2-25**, `02-functional-requirements/super-admin/SA-02-tenant-firm-management_v2.24_2026-10-12.md:463`: "Business address (country, province/state, city, postal code) is required at creation by both routes. For a Canadian address, the firm's GST/HST number (9 digits +"
* **SA-3-46**, `02-functional-requirements/super-admin/SA-03-subscription-plans-and-entitlements_v2.29_2026-10-25.md:640`: "Each plan has trial days (whole number, 0 = no trial), edited like any plan setting (approval rules of SA-3-44 apply to live plans). New"
* **SA-4-11**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:521`: "Each firm has one current subscription with: plan, billing period, price, discount, status (TRIAL | ACTIVE | OVERDUE | PAYMENT_HOLD | ENDED), trial end, current"
* **SA-6-27**, `02-functional-requirements/super-admin/SA-06-rbac_v3.15_2026-10-25.md:661`: "Licensed user is a person. A staff member is licensed when their staff profile holds a regulator credential (AG1-D19). Each licensed person enters and maintains"
* **SA-6-31**, `02-functional-requirements/super-admin/SA-06-rbac_v3.15_2026-10-25.md:665`: "Six firm starter roles, the initial seeded set (Super Admin may add more and retire any except Owner): Owner, Admin, Case Manager (cases only —"
* **AG-1-17**, `02-functional-requirements/agent/AG-01-firm-setup-and-onboarding_v1.26_2026-10-25.md:583`: "The system SHALL show every firm the starter roles Expat Ready has published in Super Admin, the same for every firm whatever its plan; the"
* **AG-1-30**, `02-functional-requirements/agent/AG-01-firm-setup-and-onboarding_v1.26_2026-10-25.md:618`: "Each licensed person SHALL record on their own profile, for the firm's one country (FD-68), a RegulatorCredential: representative type (from the pack — in Canada"
* **AG-16-3**, `02-functional-requirements/agent/AG-16-firm-settings-and-integrations_v1.24_2026-10-25.md:854`: "The firm SHALL have a default language, a timezone and a default currency, CAD or USD, default CAD (pre-filled, §3.1; X-6)"
* **AG-16-24**, `02-functional-requirements/agent/AG-16-firm-settings-and-integrations_v1.24_2026-10-25.md:899`: "Security & your data SHALL have one switch, "Require two-step sign-in for all staff", default OFF, which the Owner (and an Admin with agent/security-policy:manage) may"
* **AG-16-59**, `02-functional-requirements/agent/AG-16-firm-settings-and-integrations_v1.24_2026-10-25.md:947`: "The firm SHALL have business hours (default Monday–Friday 9:00–17:00 in the firm's timezone, or in the office's time zone once a second office exists —"
* Dropped from the BACKLOG sources (1): SA-3-41 (in the snapshot it is about how seats are counted (a runtime rule, not a table or database rule); not this row's capability).
* Fit: Matches in scope: the sources name the firm, subscription, role and licence data and database-enforced rules (one country, unique email); migration and CI check are build practice.

### R1.3 3 Walls between firms
Partial · journey test: no

* **AG-1-1**, `02-functional-requirements/agent/AG-01-firm-setup-and-onboarding_v1.26_2026-10-25.md:549`: "The system SHALL model Firm (tenant, key firm_id), FirmUser (belongs to exactly one Firm, holds one or more Roles"
* **AG-1-3**, `02-functional-requirements/agent/AG-01-firm-setup-and-onboarding_v1.26_2026-10-25.md:551`: "Every AG-1 mutation SHALL be tenant-scoped to the caller's firm_id and SHALL be audited (actor, target, before/after)."
* **AG-1-45**, `02-functional-requirements/agent/AG-01-firm-setup-and-onboarding_v1.26_2026-10-25.md:652`: "Every list/read SHALL be paginated and tenant-scoped; no endpoint SHALL return an unbounded set or another firm's data."
* Fit: Narrower: sources require firm scoping in the app; database-level refusal with no firm filter and the CI gate are in Doc-1 C1-1/AC-2.2.x and AG-01 BR-1, not cited.

### R1.4 4 Each query runs inside its firm
Partial · journey test: no

* **AG-1-1**, `01-techno-functional/05-Doc-3-Agent-Console.md:192`: "The system SHALL treat the caller's firm_id (from PrincipalContext, Doc 1 §3.2) as the only tenant scope; no AG-1 endpoint accepts a caller-supplied firm_id (Doc"
* **AG-1-3**, `02-functional-requirements/agent/AG-01-firm-setup-and-onboarding_v1.26_2026-10-25.md:551`: "Every AG-1 mutation SHALL be tenant-scoped to the caller's firm_id and SHALL be audited (actor, target, before/after)."
* **AG-1-45**, `02-functional-requirements/agent/AG-01-firm-setup-and-onboarding_v1.26_2026-10-25.md:652`: "Every list/read SHALL be paginated and tenant-scoped; no endpoint SHALL return an unbounded set or another firm's data."
* Fit: Partly: firm from the signed-in caller only matches AG-1-1 (Doc-3 text); 'no firm set returns nothing' and the audited bypass role are in Doc-1 AC-2.2.2/AC-2.4.1, not cited.

### R1.5 5 Staff sign-in with two-step, passkeys, lock-out on leaving
Partial · journey test: no

* **AG-1-40**, `02-functional-requirements/agent/AG-01-firm-setup-and-onboarding_v1.26_2026-10-25.md:639`: "Two-step sign-in SHALL be optional and off by default for firm staff. Any user SHALL be able to turn it on for themselves at any"
* **AG-16-24**, `02-functional-requirements/agent/AG-16-firm-settings-and-integrations_v1.24_2026-10-25.md:899`: "Security & your data SHALL have one switch, "Require two-step sign-in for all staff", default OFF, which the Owner (and an Admin with agent/security-policy:manage) may"
* **AG-1-15**, `02-functional-requirements/agent/AG-01-firm-setup-and-onboarding_v1.26_2026-10-25.md:567`: "A firm SHALL deactivate a staff member as the first step of leaving; deletion is the separate second step in AG-1-54. Deactivating SHALL revoke all"
* **AG-1-41**, `02-functional-requirements/agent/AG-01-firm-setup-and-onboarding_v1.26_2026-10-25.md:640`: "Sessions SHALL be tracked (device/IP/last-active) and revocable by the user (own) and by an admin (any firm user); deactivation and suspension SHALL cascade-revoke the user's"
* **AG-1-55**, `02-functional-requirements/agent/AG-01-firm-setup-and-onboarding_v1.26_2026-10-25.md:642`: "A firm user SHALL be signed in on only one device at a time. Signing in on a new device SHALL end the older session"
* **SA-7-1**, `02-functional-requirements/super-admin/SA-07-platform-users_v2.17_2026-10-17.md:490`: "Staff accounts are a separate sign-in group from firm users and clients, with no firm_id. A staff token is valid only for the staff console"
* **SA-7-2**, `02-functional-requirements/super-admin/SA-07-platform-users_v2.17_2026-10-17.md:491`: "Staff sign in only through the staff console with email, password and second step. Firm and client sign-ins can never produce a staff session."
* Dropped from the BACKLOG sources (19): AG-1-10 (in the snapshot it is about inviting staff; not this row's capability); AG-1-12 (in the snapshot it is about listing, resending and revoking invitations; not this row's capability); AG-1-13 (in the snapshot it is about the seat limit; not this row's capability); AG-1-19 (in the snapshot it is about default-deny authorization; not this row's capability); AG-1-22 (in the snapshot it is about the only-Owner guard; not this row's capability); AG-1-30 (in the snapshot it is about the licence (RegulatorCredential) on a person's profile; not this row's capability); AG-1-31 (in the snapshot it is about licence data as Confidential; not this row's capability); AG-1-42 (in the snapshot it is about step-up confirmation before Owner-role or payment-account changes; not this row's capability); AG-1-66 (in the snapshot it is about reasons on role changes; not this row's capability); AG-1-70 (in the snapshot it is about staff account emails (invite, reset); not this row's capability); and 9 more.
* Fit: Different: for firm staff AG-1-40/AG-16-24 make two-step optional, off by default; 'sign-in only with the second step' matches only Expat Ready staff (SA-7-2).

### R1.6 6 Permissions: deny by default, own versus all, money and licence apart
Works · journey test: yes, `tests/journeys/j_6.ts`

* **AG-1-19**, `02-functional-requirements/agent/AG-01-firm-setup-and-onboarding_v1.26_2026-10-25.md:594`: "Authorization SHALL be default-deny: an action is allowed only if at least one of the user's roles holds the matching agent/ permission."
* **SA-6-14**, `02-functional-requirements/super-admin/SA-06-rbac_v3.15_2026-10-25.md:644`: "The guard MUST check, for every required key, that the key's plane equals the caller's plane before checking the name, denying with 403 PLANE_MISMATCH and"
* Dropped from the BACKLOG sources (18): AG-1-10 (in the snapshot it is about inviting staff; not this row's capability); AG-1-12 (in the snapshot it is about listing, resending and revoking invitations; not this row's capability); AG-1-13 (in the snapshot it is about the seat limit; not this row's capability); AG-1-15 (in the snapshot it is about deactivating a staff member; not this row's capability); AG-1-22 (in the snapshot it is about the only-Owner guard; not this row's capability); AG-1-30 (in the snapshot it is about the licence (RegulatorCredential) on a person's profile; not this row's capability); AG-1-31 (in the snapshot it is about licence data as Confidential; not this row's capability); AG-1-40 (in the snapshot it is about optional two-step sign-in; not this row's capability); AG-1-41 (in the snapshot it is about session tracking and revocation; not this row's capability); AG-1-42 (in the snapshot it is about step-up confirmation before Owner-role or payment-account changes; not this row's capability); and 8 more.
* Fit: Narrower: deny-by-default matches; own/all is SA-6-24 (not cited); no requirement found that money and licence keys never come with another key.

### R1.8 8 Audit trail nobody can edit
Works · journey test: yes, `tests/journeys/j_8.ts`

* **SA-11-1**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:458`: "An append-only audit log SHALL record every security- and data-significant event across all tenants and planes (the event list in 3.1): authentication (incl. failed login,"
* **SA-11-2**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:459`: "Each entry SHALL contain: auditLogId (UUID), timestamp (UTC, millisecond precision), actor (user id + display name), actorType ∈ {super_admin, firm_staff, client, system}, tenantId (firm id;"
* **SA-11-3**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:460`: "Audit entries SHALL be write-once: the application role writing audit entries holds INSERT only — no UPDATE or DELETE grant on the audit table. No"
* **SA-11-7**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:464`: "A failed audit write SHALL NOT roll back the user's underlying operation, but SHALL be retried on a durable queue and, if still failing, SHALL"
* **AG-13-40**, `02-functional-requirements/agent/AG-13-tasks-reminders-notes-and-activity-audit_v1.19_2026-10-27.md:479`: "Auto-capture via @AuditLog interceptor: actor/IP/UA/method/path, before→after diff on UPDATE, secret-sanitising, failed-attempt logging, parent-entity scope, clientId resolution."
* **AG-13-41**, `02-functional-requirements/agent/AG-13-tasks-reminders-notes-and-activity-audit_v1.19_2026-10-27.md:480`: "Append-only at the database (no UPDATE/DELETE grant; RLS forced) — corrections are new reversing rows."
* **NFR5-08**, `01-techno-functional/02-Architecture-Decision-Record.md:467`: "Audit spine: INSERT-only DB grant + hash-chain + periodic WORM anchor (S3 Object Lock) + continuous chain-verify alarm + durable retry; retention floors enforced in"
* Dropped from the BACKLOG sources (1): NFR5-14 (in the snapshot it is about observability tooling and SLO paging; says nothing about location; not this row's capability).
* Fit: Matches; sources are wider (hash chain, WORM anchor, durable retry in NFR5-08/SA-11-7) than the Done when.

### R1.9 9 Background jobs, schedules, reminders
Works · journey test: yes, `tests/journeys/j_9.ts`

* **AG-11-17**, `02-functional-requirements/agent/AG-11-automation_v1.21_2026-10-25.md:753`: "arm_minder (the firm-designed route) SHALL register a MinderWatch on an entity's deadline (date field) with an optional satisfaction condition and an ordered cascade of T-minus"
* Dropped from the BACKLOG sources (1): AG-10-1 (in the snapshot it is about the in-house Mailer and Messenger doers, not background jobs; not this row's capability).
* Fit: Much narrower: only reminders at a time are sourced; run-once keys, retry with back-off, failed list and no loss on worker stop are in Doc-1 TR-A3/EV-A5, not cited.

### R1.10 10 Checking every input
Partial · journey test: no · BACKLOG chain, plus ids the reader added by search

* **AG-16-28**, `02-functional-requirements/agent/AG-16-firm-settings-and-integrations_v1.24_2026-10-25.md:907`: "All settings reads and writes SHALL be firm-scoped and schema-validated; no endpoint returns or accepts cross-tenant data."
* **AG-18-57**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:493`: "Every input to the engine (upload metadata, mappings, dry-run and run requests, undo requests, attestations) SHALL be validated by schema at the edge."
* **AG-10-32**, `02-functional-requirements/agent/AG-10-communication-hub_v1.26_2026-10-27.md:635`: "All inbound webhooks (rail delivery, gateway status, inbound message) SHALL verify signatures, be idempotent, rate-limited, and schema-validated; nothing SHALL be persisted on a failed verification."
* **C1-2**, `01-techno-functional/02-Architecture-Decision-Record.md:330`: "Eliminate MongoDB. All config-as-data → Postgres JSONB, Zod-validated at the edge, under the same RLS/residency/DR/encryption regime; GIN indexes for searched paths; one global-default ⊕ per-firm-override"
* Dropped from the BACKLOG sources (1): SA-11-2 (in the snapshot it is about the fields of an audit entry; not this row's capability).
* Fit: Matches the principle (schema validation at the edge); 400 Problem Details naming the field rests on STANDARDS §6, not the sources.

### R1.11 11 Server framework
Works · journey test: no · all ids found by search (the BACKLOG chain gave none that fit)

* **AC-1.1**, `01-techno-functional/03-Doc-1-Platform-Foundation.md:268`: "A single deployable NestJS 11 API plus separate worker task definition(s) deploy from one codebase; no business logic lives in routes/controllers (HTTP-only controllers, logic in"
* **AC-1.12**, `01-techno-functional/03-Doc-1-Platform-Foundation.md:287`: "Liveness + readiness endpoints exist; an unhealthy task is automatically replaced; the system survives loss of one AZ (DB fails over to standby; API/workers reschedule)"
* **AU-A9**, `01-techno-functional/03-Doc-1-Platform-Foundation.md:770`: "Signing keys are retrieved at runtime from KMS/Secrets Manager via IAM role; a config-lint fails the build if a signing key is present in any"
* Fit: Found by search (BACKLOG cites only P-558). Partly: one deployable API, health endpoints, no signing key in image; non-root, migrations first and seeded fails rest on P-558.

### R1.12 12 Screen framework, one UI kit
Works · journey test: no · all ids found by search (the BACKLOG chain gave none that fit)

* **AC-1.12.4**, `01-techno-functional/03-Doc-1-Platform-Foundation.md:402`: "Registering one new Capability row plus its owningModule makes the capability dark-launchable, entitle-able, firm-switchable, nav-renderable, and gate-enforced with zero changes to the enforcement gate, the"
* **A11Y-3**, `01-techno-functional/03-Doc-1-Platform-Foundation.md:2474`: "Built on Radix/shadcn accessible primitives so accessibility is a default of the component library, not a per-screen retrofit."
* Fit: Found by search (BACKLOG cites only P-558, P-559). Loose: AC-1.12.4 is capability/nav registration, A11Y-3 one component library; routes.tsx and clash stop rest on P-558/P-559.

### R1.13 13 Logs, metrics, error reports, alerts
Partial · journey test: no

* **NFR5-14**, `01-techno-functional/02-Architecture-Decision-Record.md:472`: "OTel + Pino + Sentry with PII redaction; SLO alerts ALSO page on audit-chain break and DSR/breach clocks."
* **SA-11-37**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:509`: "Email bodies, subjects and attachment file names are personal data and SHALL NEVER be copied into system logs or traces. The same SHALL hold for"
* **SA-8-27**, `02-functional-requirements/super-admin/SA-08-platform-integrations-and-infrastructure-rails_v2.13_2026-10-25.md:454`: "A service turning red alerts the Owner and engineer; no health log or graphs in the console."
* Dropped from the BACKLOG sources (1): SA8-D40 (in the snapshot it is about what the status page tells the reader (stuck-job limit in code), not the log or alarm pipeline; not this row's capability).
* Fit: Mostly matches: one logger with PII redaction, no mail content in logs, alerts reach Owner and engineer; 90-day retention in Canada is not in these sources.

### R1.14 14 Backups with a tested restore
Partial · journey test: no · BACKLOG chain, plus ids the reader added by search

* **NFR5-04**, `01-techno-functional/02-Architecture-Decision-Record.md:463`: "DR: RPO ≤ 15 min, RTO ≤ 4 h; one DR regime (Mongo eliminated); quarterly restore drill contractual."
* **C1-3**, `01-techno-functional/02-Architecture-Decision-Record.md:331`: "ca-central-1 residency by construction (CI region-allowlist), DR within Canada, per-rail sub-processor residency matrix, field-level envelope encryption for Restricted PII, crypto-shred erasure + orchestrator + certificate."
* Dropped from the BACKLOG sources (3): SA-11-32 (in the snapshot it is about the written data-location statement for customers; not this row's capability); SA-2-21 (in the snapshot it is about deleting a firm's data 90 days after payment hold or closure; not this row's capability); SA2-D12 (in the snapshot it is about purging backup copies within 35 days of deletion, not where or how they are restored; not this row's capability).
* Fit: Matches: RPO 15 min, RTO 4 h, restore drill, DR in Canada; the ca-west-1 copy rests on P-586. Doc-1 AC-1.11 (PITR, drill) also fits, not cited.

### R1.15 15 Secrets in a managed store
Partial · journey test: no

* **SA-8-1**, `02-functional-requirements/super-admin/SA-08-platform-integrations-and-infrastructure-rails_v2.13_2026-10-25.md:412`: "Every Expat Ready service key is held in the cloud secret store and supplied at deploy; the database holds no key, only which service is"
* **SA8-D1**, `02-functional-requirements/super-admin/SA-08-platform-integrations-and-infrastructure-rails_v2.13_2026-10-25.md:89`: "Expat Ready's own service keys are set by the engineer in the cloud secret store at deploy — never entered, shown or changed in the"
* **SA-8-4**, `02-functional-requirements/super-admin/SA-08-platform-integrations-and-infrastructure-rails_v2.13_2026-10-25.md:415`: "Rotating a key is an engineer procedure (runbook) without downtime; no console rotation."
* Dropped from the BACKLOG sources (5): AG-4-16 (in the snapshot it is about the public booking page under the firm's web address; not this row's capability); NFR5-04 (in the snapshot it is about DR targets (RPO 15 min, RTO 4 h, restore drill); says nothing about location; not this row's capability); NFR5-05 (in the snapshot it is about the data-encryption key hierarchy (CMK, firm DEK), not storage of secrets; not this row's capability); SA-2-27 (in the snapshot it is about the firm's web address; not this row's capability); SA-8-6 (in the snapshot it is about S3 file storage in Canada, encrypted; not this row's capability).
* Fit: Narrower: secrets in the cloud store at deploy match; 'missing secret stops start-up' and 'firms' own keys stored encrypted' are not in these sources.

### R1.16 16 Automated testing
Works · journey test: no · all ids found by search (the BACKLOG chain gave none that fit)

* **AC-2.8.1**, `01-techno-functional/03-Doc-1-Platform-Foundation.md:650`: "The combined schema-lint + behavioral denial suite runs in CI and blocks release on any failure."
* Fit: Found by search (BACKLOG cites only P-558). Narrower: only the isolation suite is required to block release; every suite per merge batch rests on P-558.

### R1.19 19 A firm is created once, with plan, trial and owner
Partial · journey test: no

* **SA-2-1**, `02-functional-requirements/super-admin/SA-02-tenant-firm-management_v2.24_2026-10-12.md:420`: "Super Admin can create a firm with: operating name, legal name, one destination country (Active countries only), business address (country, province/state, city, postal code) with"
* **SA-2-22**, `02-functional-requirements/super-admin/SA-02-tenant-firm-management_v2.24_2026-10-12.md:460`: "Super Admin can create a private sign-up link for one email and one country, optionally naming an account manager and optionally carrying one approved discount"
* **SA-2-24**, `02-functional-requirements/super-admin/SA-02-tenant-firm-management_v2.24_2026-10-12.md:462`: "A firm's contact email (trimmed, lower-cased) must not be the contact email of any other firm; creation or contact change that would break this is"
* **SA-3-46**, `02-functional-requirements/super-admin/SA-03-subscription-plans-and-entitlements_v2.29_2026-10-25.md:640`: "Each plan has trial days (whole number, 0 = no trial), edited like any plan setting (approval rules of SA-3-44 apply to live plans). New"
* **SA-4-4**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:510`: "Checkout is available only through a private sign-up link (SA-2-22) and offers only Active Public plans. There is no open public sign-up."
* **SA-4-5**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:511`: "The sign-up page collects firm and owner details and the business address. For a plan with trial days there is no card step and the"
* **SA-4-8**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:516`: "Firm creation is exactly-once per sign-up link and per processor subscription: a repeated notification or submission never creates a second firm, owner, email or charge."
* **SA-4-11**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:521`: "Each firm has one current subscription with: plan, billing period, price, discount, status (TRIAL | ACTIVE | OVERDUE | PAYMENT_HOLD | ENDED), trial end, current"
* **SA-4-30**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:548`: "A plan's trial days start the firm in Trial with full access and no card. The card is added on the billing screen before the"
* Dropped from the BACKLOG sources (28): AG-1-17 (in the snapshot it is about the published starter roles; not this row's capability); AG-1-30 (in the snapshot it is about the licence (RegulatorCredential) on a person's profile; not this row's capability); AG-1-65 (in the snapshot it is about the six Owner-only actions; not this row's capability); AG-16-24 (in the snapshot it is about the firm switch for mandatory two-step sign-in; not this row's capability); AG-16-3 (in the snapshot it is about firm language, timezone and currency; not this row's capability); AG-16-59 (in the snapshot it is about business hours and closed days; not this row's capability); SA-2-21 (in the snapshot it is about deleting a firm's data 90 days after payment hold or closure; not this row's capability); SA-2-25 (in the snapshot it is about business address and tax numbers; not this row's capability); SA-2-4 (in the snapshot it is about the firm status list; not this row's capability); SA-2-6 (in the snapshot it is about what works during payment hold and security lock; not this row's capability); and 18 more.
* Fit: Matches: exactly-once creation (SA-4-8), duplicate email refused (SA-2-24), trial from plan; note SA-4-4 allows sign-up only through a private link, not open self-serve.

### R1.20 20 One entitlement check; seat and plan limits; downgrade check; invite many
Partial · journey test: no

* **AG-1-10**, `02-functional-requirements/agent/AG-01-firm-setup-and-onboarding_v1.26_2026-10-25.md:562`: "An admin SHALL invite people (name, email, one or more roles (SA6-D3a), and an office only once the firm has a second office); each person"
* **AG-1-13**, `02-functional-requirements/agent/AG-01-firm-setup-and-onboarding_v1.26_2026-10-25.md:565`: "Active users and pending invitations SHALL count toward the plan's seat limit (maxUsers), enforced server-side at invite and reactivation; a cancelled or expired invitation SHALL"
* **AG-1-69**, `02-functional-requirements/agent/AG-01-firm-setup-and-onboarding_v1.26_2026-10-25.md:579`: "One invite form SHALL hold rows of name, email and one or more roles, with "Case Officer" pre-selected on each row and a "+ Add"
* **SA-3-19**, `02-functional-requirements/super-admin/SA-03-subscription-plans-and-entitlements_v2.29_2026-10-25.md:608`: "Entitlement composes with firm state: payment hold ⇒ only the Billing feature and the data download are available and everything else returns 402; security lock"
* **SA-3-39**, `02-functional-requirements/super-admin/SA-03-subscription-plans-and-entitlements_v2.29_2026-10-25.md:636`: "Limit modes are fixed for the whole platform: staff seats, active individual cases and active corporate cases = hard; document storage = warn. A plan"
* **SA-3-40**, `02-functional-requirements/super-admin/SA-03-subscription-plans-and-entitlements_v2.29_2026-10-25.md:637`: "If a firm is still over its storage limit 14 days after first exceeding it, that limit behaves as hard for that firm until usage"
* **SA-3-58**, `02-functional-requirements/super-admin/SA-03-subscription-plans-and-entitlements_v2.29_2026-10-25.md:661`: "checkDowngrade(firm, targetPlan) returns every limit on which the firm's current usage is over the target plan's limit (usage, target limit, amount to reduce) and every"
* **SA-3-62**, `02-functional-requirements/super-admin/SA-03-subscription-plans-and-entitlements_v2.29_2026-10-25.md:665`: "Removals and lower limits approved by Expat Ready on a live plan (SA-3-43) and retiring a plan are not moves to a lower plan: no"
* **SA-4-56**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:582`: "During a trial the Owner may switch freely to any public plan: the change is immediate, nothing is charged and the trial end date stays;"
* Dropped from the BACKLOG sources (39): AG-1-12 (in the snapshot it is about listing, resending and revoking invitations; not this row's capability); AG-1-15 (in the snapshot it is about deactivating a staff member; not this row's capability); AG-1-22 (in the snapshot it is about the only-Owner guard; not this row's capability); AG-1-30 (in the snapshot it is about the licence (RegulatorCredential) on a person's profile; not this row's capability); AG-1-31 (in the snapshot it is about licence data as Confidential; not this row's capability); AG-1-34 (in the snapshot it is about licence number format check (soft warning); not this row's capability); AG-1-40 (in the snapshot it is about optional two-step sign-in; not this row's capability); AG-1-41 (in the snapshot it is about session tracking and revocation; not this row's capability); AG-1-42 (in the snapshot it is about step-up confirmation before Owner-role or payment-account changes; not this row's capability); AG-1-55 (in the snapshot it is about one session at a time; not this row's capability); and 29 more.
* Fit: Matches seats, downgrade check and multi-row invite; 'every gated action asks one check' is only partly in SA-3-19; the 1-50 row bound is not in these lines.

### R1.21 21 Our own invoices with sales tax
Not built · journey test: no

* **SA-4-52**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:578`: "No invoice is issued to a paying firm until the tax service is configured with the rules of SA-4-51. A firm cannot submit the sign-up"
* **SA-4-54**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:580`: "The firm's Owner and Admin have a billing screen, always on and available in Trial, Active, Overdue and Payment hold, with the contents of §3.13;"
* **SA-4-67**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:593`: "Billing-screen permissions. The server allows the Owner and Admin to update the card and to pay an overdue bill, allows the Owner, Admin and Billing"
* Dropped from the BACKLOG sources (22): AG-1-65 (in the snapshot it is about the six Owner-only actions; not this row's capability); SA-2-21 (in the snapshot it is about deleting a firm's data 90 days after payment hold or closure; not this row's capability); SA-2-22 (in the snapshot it is about the private sign-up link; not this row's capability); SA-2-24 (in the snapshot it is about unique firm contact email; not this row's capability); SA-2-4 (in the snapshot it is about the firm status list; not this row's capability); SA-2-6 (in the snapshot it is about what works during payment hold and security lock; not this row's capability); SA-2-7 (in the snapshot it is about how a firm leaves (hold, then deletion); not this row's capability); SA-3-19 (in the snapshot it is about entitlement under payment hold or lock; not this row's capability); SA-3-46 (in the snapshot it is about plan trial days; not this row's capability); SA-4-11 (in the snapshot it is about the subscription record; not this row's capability); and 12 more.
* Fit: Narrower: billing screen and invoice rights match; province tax rule is SA-4-51 (not cited by PF-5).

### R1.22 22 Suspend, cancel, failed-payment hold, data download on exit
Not built · journey test: no

* **SA-2-4**, `02-functional-requirements/super-admin/SA-02-tenant-firm-management_v2.24_2026-10-12.md:427`: "Firm status is one of PROVISIONING, TRIAL, ACTIVE, PAYMENT_HOLD, SECURITY_LOCK, ABANDONED, DELETED, with only the transitions in §6."
* **SA-2-6**, `02-functional-requirements/super-admin/SA-02-tenant-firm-management_v2.24_2026-10-12.md:429`: "Payment hold: staff can log in but only the payment screens and the data download work; all other staff requests are refused. Security lock: no"
* **SA-2-7**, `02-functional-requirements/super-admin/SA-02-tenant-firm-management_v2.24_2026-10-12.md:430`: "A firm leaves through cancellation or non-payment → payment hold → deletion after 90 days; there are no separate offboarding stages."
* **SA-2-8**, `02-functional-requirements/super-admin/SA-02-tenant-firm-management_v2.24_2026-10-12.md:431`: "Payment hold ends automatically when payment succeeds (→ Active). Security lock is lifted only by the Platform Owner with a reason (→ prior state)"
* **SA-2-21**, `02-functional-requirements/super-admin/SA-02-tenant-firm-management_v2.24_2026-10-12.md:457`: "After 90 days in payment hold — or 90 days after a security-locked account is closed, unless under legal hold — the firm's tenant data"
* **SA-2-33**, `02-functional-requirements/super-admin/SA-02-tenant-firm-management_v2.24_2026-10-12.md:471`: "The firm owner can download the firm's full data (clients, cases, documents, invoices, and — for corporate files — positions, advertising channels, candidates and inspection"
* **SA-2-34**, `02-functional-requirements/super-admin/SA-02-tenant-firm-management_v2.24_2026-10-12.md:472`: "The Platform Owner only (revised same day — W-21) can apply a security lock (reason required), lift it (reason required; firm returns to its prior"
* **SA-2-35**, `02-functional-requirements/super-admin/SA-02-tenant-firm-management_v2.24_2026-10-12.md:473`: "In payment hold and security lock, the firm's clients can log in to the portal, view their case status and download their own documents; uploads,"
* **SA-2-37**, `02-functional-requirements/super-admin/SA-02-tenant-firm-management_v2.24_2026-10-12.md:475`: "When a security-locked account is closed, the owner is told they may request a full data export within the 90 days before deletion. A user"
* **SA-2-38**, `02-functional-requirements/super-admin/SA-02-tenant-firm-management_v2.24_2026-10-12.md:476`: "The cancellation confirmation, the payment-hold notice, each deletion warning and the data-download screen state only ExpatReady's own facts: the deletion date and how to download"
* **SA-3-19**, `02-functional-requirements/super-admin/SA-03-subscription-plans-and-entitlements_v2.29_2026-10-25.md:608`: "Entitlement composes with firm state: payment hold ⇒ only the Billing feature and the data download are available and everything else returns 402; security lock"
* **SA-4-20**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:534`: "A failed charge sets the subscription to Overdue and sends the failure notice at once to the billing email, the owner and the firm's Admins,"
* **SA-4-21**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:535`: "The firm keeps full access for 14 days. Reminders go on days 7 and 12 to the billing email, the owner and the firm's Admins."
* **SA-4-22**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:536`: "A payment within the 14 days clears the failed invoice and returns the subscription to Active with the billing date unchanged; reminders stop."
* **SA-4-25**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:541`: "On Payment hold, firm staff can use only the billing screen and the data download; every other staff request is refused on the server with"
* **SA-4-26**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:542`: "Payment hold ends only when payment succeeds (per SA-4-47); access is restored on the next request with all data intact. Lifting a hold without payment"
* **SA-4-79**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:607`: "When a trial ends and no card is on file, the subscription goes to Payment hold that day (SA-4-25 applies); it does not enter Overdue."
* **AG-16-20**, `02-functional-requirements/agent/AG-16-firm-settings-and-integrations_v1.24_2026-10-25.md:892`: "The firm SHALL keep the built whole-firm export (§3.5): Owner-only (agent/firm-data-export:request, firm-owner only, role-template.ts:197-209, plus the active-owner re-check, firm-data-export.service.ts:211-212), request body operationId only, states QUEUED"
* **AG-16-22**, `02-functional-requirements/agent/AG-16-firm-settings-and-integrations_v1.24_2026-10-25.md:894`: "Every export SHALL write an AuditLog entry (actor, scope, row count, timestamp). Money columns are shown in their own currency and SHALL NOT be converted"
* **AG-16-34**, `02-functional-requirements/agent/AG-16-firm-settings-and-integrations_v1.24_2026-10-25.md:916`: "The firm-data export scope SHALL include positions, advertising channels, candidates and inspection packs, in full, under agent/firm-data-export:request alone. The export is audited (AG-16-22)."
* **AG-16-39**, `02-functional-requirements/agent/AG-16-firm-settings-and-integrations_v1.24_2026-10-25.md:923`: "The firm-data export scope SHALL include the Needs-you approval history and import batch reports, unmasked; an import batch report SHALL be exportable only by a"
* **AG-1-65**, `02-functional-requirements/agent/AG-01-firm-setup-and-onboarding_v1.26_2026-10-25.md:591`: "Exactly six actions SHALL be Owner-only (fix 17 Oct — AG16-83): allow Expat Ready support to make changes (agent/support-access:manage); cancel the subscription (agent/subscription:cancel); edit the"
* **SA-11-18**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:478`: "A legal hold scoped to a firm, case, data category, or date range, with mandatory reason and owner, SHALL block deletion of in-scope data; placement"
* **BR-7**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:626`: "Precedence is: legal hold > a firm's keep-period warning > a deletion request. A deletion never overrides an active hold — this includes the erasure"
* **BR-8**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:627`: "When any deletion of firm or client data takes place, the audit record that it happened (when, who, the reason entered inside a keep-period) survives"
* Dropped from the BACKLOG sources (16): BR-1 (in the snapshot it is about SA-11 BR-1, append-only audit with no UPDATE or DELETE path; not this row's capability); SA-11-16 (in the snapshot it is about the disposal job for an approved delete-my-data request; not this row's capability); SA-2-22 (in the snapshot it is about the private sign-up link; not this row's capability); SA-2-24 (in the snapshot it is about unique firm contact email; not this row's capability); SA-3-46 (in the snapshot it is about plan trial days; not this row's capability); SA-4-11 (in the snapshot it is about the subscription record; not this row's capability); SA-4-27 (in the snapshot it is about cached billing state for access checks; not this row's capability); SA-4-30 (in the snapshot it is about trial start and trial end; not this row's capability); SA-4-35 (in the snapshot it is about billing processor events handled; not this row's capability); SA-4-4 (in the snapshot it is about checkout only through a private sign-up link; not this row's capability); and 6 more.
* Fit: Different: hold is billing plus download only, not read-only (SA-2-6, SA-4-25); cancel goes to payment hold then deletion after 90 days (SA-2-7), not 'closes at period end'.

### R1.23 23 Firm logo, colour, sender name, favicon, banner
Not built · journey test: no

* **AG-1-6**, `02-functional-requirements/agent/AG-01-firm-setup-and-onboarding_v1.26_2026-10-25.md:556`: "The Firm SHALL set branding: logo, favicon, primary colour, optional accent colour, firm tagline, portal banner. The portal address is not part of branding (AG-1-7)."
* **AG-1-9**, `02-functional-requirements/agent/AG-01-firm-setup-and-onboarding_v1.26_2026-10-25.md:559`: "Branding SHALL apply to firm-console chrome, generated PDFs, outbound emails, and the client portal; a live preview SHALL be shown before save."
* **AG-16-2**, `02-functional-requirements/agent/AG-16-firm-settings-and-integrations_v1.24_2026-10-25.md:853`: "The firm SHALL configure how clients see it — logo, colours, sender name, footer (address, phone, licence text), email signature (firm default); Owner and Admin"
* Fit: Matches the five items and where they show; the WCAG AA colour check and file type/size refusals are not in these lines.

### R1.24 24 Each firm's own web address
Partial · journey test: no

* **SA-2-27**, `02-functional-requirements/super-admin/SA-02-tenant-firm-management_v2.24_2026-10-12.md:465`: "The web address is suggested from the firm name, editable at creation, DNS-safe, unique and availability-checked. Afterwards only Super Admin can change it (reason required,"
* **SA2-D8**, `02-functional-requirements/super-admin/SA-02-tenant-firm-management_v2.24_2026-10-12.md:58`: "Web address (maple.expatready.com): suggested from the firm name and editable at creation, with an availability check; afterwards only Super Admin can change it (reason required,"
* **SA-2-2**, `02-functional-requirements/super-admin/SA-02-tenant-firm-management_v2.24_2026-10-12.md:422`: "Creation, in one unit of work: assign the web address; set the firm's one country; store address, contact, billing email and account manager; seed the"
* **AG-4-16**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:1009`: "The booking page under the firm's web address, embeddable"
* **AG-4-17**, `01-techno-functional/05-Doc-3-Agent-Console.md:1837`: "Tenant resolution by opaque slug only; raw tenant UUID rejected; firm-not-found and event-not-found return identical generic messages."
* Dropped from the BACKLOG sources (6): AG-15-27 (in the snapshot it is about a custom domain for the portal, moved to Release 2; not this row's capability); NFR5-04 (in the snapshot it is about DR targets (RPO 15 min, RTO 4 h, restore drill); says nothing about location; not this row's capability); SA-2-1 (in the snapshot it is about the fields of a firm created by Super Admin; not this row's capability); SA-8-1 (in the snapshot it is about service keys in the cloud secret store; not this row's capability); SA-8-4 (in the snapshot it is about key rotation by runbook; not this row's capability); SA2-D21 (in the snapshot it is about a roll-up of decisions kept as built; its web-address part only restates SA-2-27; not this row's capability).
* Fit: Matches: unique, DNS-safe, availability-checked address; slug-only resolution leaking nothing. 'Reserved' addresses are not named in these lines.

### R1.26 26 Public enquiry form, hardened against abuse
Works · journey test: yes, `tests/journeys/j_26.ts`

* **AG-2-5**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:1141`: "Website form, one per language"
* **AG-2-49**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:1596`: "Protect public doors"
* **AG-2-84**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:954`: "One arrival path: normalise, receipt, key, create, flag"
* Dropped from the BACKLOG sources (16): AG-02 (in the snapshot it is about the AG-02 document name (the script matched the AG-01 document header), not a requirement id; not this row's capability); AG-13-30 (in the snapshot it is about the unified per-entity timeline; not this row's capability); AG-2-13c (in the snapshot it is about assigning leads and the Unassigned queue; not this row's capability); AG-2-18 (in the snapshot it is about board and list kept in sync; not this row's capability); AG-2-26 (in the snapshot it is about stage guards on prospects; not this row's capability); AG-2-37a (in the snapshot it is about logging calls; not this row's capability); AG-2-4 (in the snapshot it is about adding a lead by hand; not this row's capability); AG-2-44 (in the snapshot it is about marking a prospect lost; not this row's capability); AG-2-47 (in the snapshot it is about a prospect becoming a client; not this row's capability); AG-2-53 (in the snapshot it is about a pointer: leads show in both views; not this row's capability); and 6 more.
* Fit: Matches: web form, honeypot, minimum fill time and limits (AG-2-49), a repeat makes no second lead (AG-2-84 receipt key); field-level messages not in these lines.

### R1.27 27 Every lead carries a source
Partial · journey test: yes, `tests/journeys/j_27.ts`

* **AG-2-5**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:1141`: "Website form, one per language"
* **AG-2-8a**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:1232`: "Attribution captured once, never edited"
* **AG-2-23**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:2528`: "Filters and saved views"
* **AG-2-84**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:954`: "One arrival path: normalise, receipt, key, create, flag"
* Dropped from the BACKLOG sources (20): AG-02 (in the snapshot it is about the AG-02 document name (the script matched the AG-01 document header), not a requirement id; not this row's capability); AG-13-21 (in the snapshot it is about note visibility (internal vs client-visible); not this row's capability); AG-13-30 (in the snapshot it is about the unified per-entity timeline; not this row's capability); AG-16-76 (in the snapshot it is about the Services list screen; not this row's capability); AG-2-13c (in the snapshot it is about assigning leads and the Unassigned queue; not this row's capability); AG-2-26 (in the snapshot it is about stage guards on prospects; not this row's capability); AG-2-37a (in the snapshot it is about logging calls; not this row's capability); AG-2-4 (in the snapshot it is about adding a lead by hand; not this row's capability); AG-2-44 (in the snapshot it is about marking a prospect lost; not this row's capability); AG-2-47 (in the snapshot it is about a prospect becoming a client; not this row's capability); and 10 more.
* Fit: Matches; the direct card AG-2-2 ('A lead always has a source', AG-02:859) is not cited by the BACKLOG rows.

### R1.28 28 Consent recorded per purpose
Works · journey test: yes, `tests/journeys/j_28.ts`

* **SA-11-29**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:498`: "Consent records SHALL be recorded per purpose — built MARKETING_EMAIL, MARKETING_SMS, ANALYTICS_PROFILING, THIRD_PARTY_SHARING, plus [struck-through text in the source omitted] the new WHATSAPP_OPT_IN (service only) and WHATSAPP_MARKETING (express WhatsApp marketing)"
* **AG-2-83**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:1032`: "Consent captured and evidenced at every door"
* **AG-10-22**, `02-functional-requirements/agent/AG-10-communication-hub_v1.26_2026-10-27.md:611`: "Every outbound send (manual or automated) SHALL pass a consent/contactability gate that classifies the message transactional vs marketing; transactional SHALL be allowed to a reachable"
* Dropped from the BACKLOG sources (23): AG-02 (in the snapshot it is about the AG-02 document name (the script matched the AG-01 document header), not a requirement id; not this row's capability); AG-10-1 (in the snapshot it is about the in-house Mailer and Messenger doers, not background jobs; not this row's capability); AG-10-20 (in the snapshot it is about the communication timeline; not this row's capability); AG-10-25 (in the snapshot it is about the suppression list after hard bounces; not this row's capability); AG-10-3 (in the snapshot it is about the Communication record; not this row's capability); AG-10-5 (in the snapshot it is about sending email from an entity; not this row's capability); AG-13-30 (in the snapshot it is about the unified per-entity timeline; not this row's capability); AG-16-17 (in the snapshot it is about email fallback for WhatsApp; not this row's capability); AG-2-13c (in the snapshot it is about assigning leads and the Unassigned queue; not this row's capability); AG-2-26 (in the snapshot it is about stage guards on prospects; not this row's capability); and 13 more.
* Fit: Matches: per purpose with time and text version, evidenced at each door, withdrawal blocks sending; 'superseded, never edited' is not stated in these lines.

### R1.29 29 One person record; duplicate warning; safe merge
Partial · journey test: no

* **AG-2-16**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:1822`: "Merge two people safely"
* **AG-2-96**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:1957`: "Duplicate enquiry chips: possible duplicate, different interest, returning"
* **AG-2-78**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:1875`: "Asked again: a known person writes in a second time"
* **AG-2-84**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:954`: "One arrival path: normalise, receipt, key, create, flag"
* Dropped from the BACKLOG sources (6): AG-13-21 (in the snapshot it is about note visibility (internal vs client-visible); not this row's capability); AG-16-76 (in the snapshot it is about the Services list screen; not this row's capability); AG-2-52 (in the snapshot it is about the Individual and Corporate pipelines; not this row's capability); AG-2-77 (in the snapshot it is about employer company records and contacts; not this row's capability); AG-2-8a (in the snapshot it is about attribution captured once; not this row's capability); SA-11-29 (in the snapshot it is about consent records per purpose; not this row's capability).
* Fit: Wider than sources: AG-2-16 non-goals say no automatic merge and 'No unmerge screen is specified'; warning before saving is AG-2-4, not cited by these rows.

### R1.30 30 Lead lists, filters and board
Works · journey test: yes, `tests/journeys/j_30.ts`

* **AG-2-18**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:2484`: "Board and list stay in sync, paged"
* **AG-2-53**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:2617`: "The view never hides search, tasks or links; leads show in both views (pointer)"
* Dropped from the BACKLOG sources (9): AG-2-13c (in the snapshot it is about assigning leads and the Unassigned queue; not this row's capability); AG-2-4 (in the snapshot it is about adding a lead by hand; not this row's capability); AG-2-44 (in the snapshot it is about marking a prospect lost; not this row's capability); AG-2-47 (in the snapshot it is about a prospect becoming a client; not this row's capability); AG-2-5 (in the snapshot it is about the website form; not this row's capability); AG-2-75 (in the snapshot it is about engaging a lead; not this row's capability); AG-2-77 (in the snapshot it is about employer company records and contacts; not this row's capability); AG-2-80 (in the snapshot it is about lead states and closing with a reason; not this row's capability); AG-2-94 (in the snapshot it is about the lead and prospect screen; not this row's capability).
* Fit: Narrower: board and list match; filters by stage, owner, source and date are AG-2-23 (not cited by FO-4); keyboard move and screen widths not in these lines.

### R1.31 31 Stage kinds; won by signature; totals per currency
Works · journey test: yes, `tests/journeys/j_31.ts`

* **AG-2-26**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:2679`: "AG-2-26 — Stage guards; WON from any open stage, never by a drag"
* **AG-2-47**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:4094`: "AG-2-47 — A prospect becomes a client, once (signature, Signed offline or Convert; Undo while empty)"
* **AG-2-18**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:2484`: "AG-2-18 — Board and list stay in sync, paged"
* **AG-2-44**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:2811`: "AG-2-44 — Mark a prospect lost (reason required)"
* Dropped from the BACKLOG sources (15): AG-2-4 (In the snapshot it is about adding a lead by hand); AG-2-5 (In the snapshot it is about the website form); AG-2-8a (In the snapshot it is about attribution capture); AG-2-13c (In the snapshot it is about assigning and the Unassigned queue); AG-2-37a (In the snapshot it is about logging a call); AG-2-49 (In the snapshot it is about protecting public doors (limits)); AG-2-53 (In the snapshot it is pointer about the view never hiding search/tasks); AG-2-75 (In the snapshot it is about engaging a lead); AG-2-77 (In the snapshot it is about the employer record); AG-2-80 (In the snapshot it is about lead states and closing a lead); and 5 more.
* Fit: matches: AG-2-26/AG-2-47 give WON by signature, Signed offline or Convert only; AG-2-18 rule 5 gives per-currency column totals, never added.

### R1.32 32 Assign, take, reassign; Unassigned; assignment rules
Partial · journey test: yes, `tests/journeys/j_32.ts` · BACKLOG chain, plus ids the reader added by search

* **AG-2-13c**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:3337`: "AG-2-13c — Assign, reassign, the Unassigned queue"
* **AG-2-85**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:3237`: "AG-2-85 — Who owns a new lead: facts first, then the firm's sharing setting"
* Dropped from the BACKLOG sources (13): AG-2-13a (Withdrawn in AG-02 v2.6 (D5b table, AG16-89(8) withdrew routing rules); the line is the withdrawal record, not a live requirement); AG-2-13b (Withdrawn in AG-02 v2.6 (D5b table, AG16-89(8) withdrew routing rules); the line is the withdrawal record, not a live requirement); AG-2-13d (Withdrawn in AG-02 v2.6 (D5b table, AG16-89(8) withdrew routing rules); the line is the withdrawal record, not a live requirement); AG-2-4 (In the snapshot it is about adding a lead by hand); AG-2-5 (In the snapshot it is about the website form); AG-2-18 (In the snapshot it is about the board and list views); AG-2-44 (In the snapshot it is about marking a prospect lost); AG-2-47 (In the snapshot it is about a prospect becoming a client); AG-2-53 (In the snapshot it is pointer about the view never hiding search/tasks); AG-2-75 (In the snapshot it is about engaging a lead); and 3 more.
* Fit: matches in scope; "assignment rules" means the firm sharing setting with round robin (AG-2-85, AG02-D1), not the withdrawn rule engine AG-2-13a/b/d. AG-2-85 added by search.

### R1.33 33 Phone numbers
Works · journey test: yes, `tests/journeys/j_33.ts` · BACKLOG chain, plus ids the reader added by search

* **AG-2-84**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:954`: "AG-2-84 — One arrival path: normalise, receipt, key, create, flag"
* **AG-2-14**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:1705`: "AG-2-14 — Match rules for people (email, phone, channels)"
* **AG-2-4**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:1097`: "AG-2-4 — Add a lead by hand, with a check before saving"
* **AG-2-96**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:1957`: "AG-2-96 — Duplicate enquiry chips: possible duplicate, different interest, returning"
* Dropped from the BACKLOG sources (16): AG-2-5 (In the snapshot it is about the website form); AG-2-8a (In the snapshot it is about attribution capture); AG-2-13c (In the snapshot it is about assigning and the Unassigned queue); AG-2-16 (In the snapshot it is about merging two people); AG-2-26 (In the snapshot it is about stage guards); AG-2-37a (In the snapshot it is about logging a call); AG-2-44 (In the snapshot it is about marking a prospect lost); AG-2-47 (In the snapshot it is about a prospect becoming a client); AG-2-49 (In the snapshot it is about protecting public doors (limits)); AG-2-75 (In the snapshot it is about engaging a lead); and 6 more.
* Fit: different: team keeps an unreadable phone as typed, flagged, lead still created (AG-2-84 rule 5, BR-18); Done when refuses an impossible number. AG-2-14 added by search.

### R1.34 34 One person's data as an export, logged
Not built · journey test: no

* **AG-2-93**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:4364`: "AG-2-93 — Export one person's data (access request)"
* **SA-11-40**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:512`: "**SA-11-40.** *(NEW 18 Oct — X-2)* **Privacy requests work per person record.** An export, an erasure and a legal hold SHALL each name one person"
* **SA-11-36**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:508`: "**SA-11-36.** *(NEW v2.10 — G-Q6)* The built client **self-service data download** (`portal/dsr-exports` request and portal download — `dsr-export.controller.ts:100-127`, `export-release.controller.ts:166`) SHALL stay built, with **no portal"
* Dropped from the BACKLOG sources (1): AG-2-49a (In the snapshot it is exporting a list of leads/contacts, not one person's data).
* Fit: matches: AG-2-93 one person's data export, SA-11-40 privacy requests per person record; SA-11-36 adds client self-service download, wider than staff export.

### R1.35 35 Contacts import from a spreadsheet
Not built · journey test: no

* **AG-18-1**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:413`: "**AG-18-1.** The platform SHALL have **one import engine**; every import of firm data SHALL run through it. No module SHALL ship a second import pipeline"
* **AG-18-2**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:414`: "**AG-18-2.** A **target** SHALL be an adapter that declares its fields, its row schema, its natural key, its create/merge behaviour, its dry-run check and its"
* **AG-18-3**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:415`: "**AG-18-3.** Release 1 SHALL provide targets for: people and employers (party / client records), leads (AG-2 adapter), cases (open; closed as summary records), case key"
* **AG-18-4**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:418`: "**AG-18-4.** *(changed 5 Oct — AG18-D12)* The engine SHALL accept CSV (UTF-8) and Excel (.xlsx) files, and for documents individual files or a zip with"
* **AG-18-5**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:419`: "**AG-18-5.** The system SHALL offer a downloadable **ExpatReady template** per target, in the firm's locale, with headers, allowed values and an example row; templates SHALL"
* **AG-18-6**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:420`: "**AG-18-6.** Excel files SHALL be read as values only; formulas SHALL NOT be evaluated, macros SHALL NOT run, and macro-enabled workbooks SHALL be refused."
* **AG-18-7**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:421`: "**AG-18-7.** Every uploaded file, including every file inside a zip, SHALL be **virus-scanned before it is parsed, filed or served**; an infected file SHALL be"
* **AG-18-8**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:424`: "**AG-18-8.** The importer SHALL map each source column to one target field or ignore it; a column SHALL map at most once and a field"
* **AG-18-9**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:425`: "**AG-18-9.** Where a field takes a fixed set of values, source values SHALL be mapped to allowed values; an unmapped value SHALL make the row"
* **AG-18-11**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:427`: "**AG-18-11.** Field, value and program mappings SHALL be savable per source and reusable; a saved mapping SHALL be re-checked against the current file's columns before"
* **AG-18-12**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:430`: "**AG-18-12.** Every row SHALL be validated against the target's **versioned row schema**; a failing row SHALL be an error with reasons naming the field and"
* **AG-18-13**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:431`: "**AG-18-13.** The engine SHALL detect duplicates **within the file** and **against existing records** of the firm by the target's natural key, and SHALL resolve each"
* **AG-18-14**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:432`: "**AG-18-14.** Every imported record SHALL be stamped with the firm's one country; a country column whose value disagrees SHALL make the row an error (FD-68,"
* **AG-18-15**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:433`: "**AG-18-15.** A **dry-run preview SHALL be mandatory** before any batch writes: it SHALL show totals (create / merge / skip / error), per-row outcome with"
* **AG-18-16**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:434`: "**AG-18-16.** The real run SHALL be offered only for a dry-run of the same file (by content hash) and the same mapping; any change SHALL"
* **AG-18-17**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:435`: "**AG-18-17.** The real run SHALL re-validate every row; rows whose outcome differs from the dry-run SHALL be marked in the result report."
* **AG-18-19**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:439`: "**AG-18-19.** A confirmed batch SHALL run as an **asynchronous job**, never a blocking request, with visible progress refreshed at a checkpoint interval."
* **AG-18-20**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:440`: "**AG-18-20.** Each row SHALL be written in its own transaction; a failing row SHALL be recorded as an error without stopping the job; a crashed"
* **AG-18-21**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:441`: "**AG-18-21.** At the end of the job the system SHALL produce a **downloadable result report** (CSV / Excel, importer's locale) listing every row's outcome, record"
* **AG-18-22**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:442`: "**AG-18-22.** The importer SHALL be notified when the job completes, partially completes or fails."
* **AG-18-38**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:464`: "**AG-18-38.** *(revised same day — AG18-D10(o))* A merge SHALL fill **only empty fields** and SHALL NOT overwrite a non-empty value; the previous state SHALL be"
* **AG-18-39**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:467`: "**AG-18-39.** *(revised same day — AG18-D10(c), (n))* A user with `agent/import:undo` SHALL be able to undo a COMPLETED or PARTIAL batch within the **undo window**,"
* **AG-18-40**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:468`: "**AG-18-40.** Undo SHALL remove the records the batch created (with their Minder registrations, Minder-created tasks, timeline entries and filed documents) and SHALL restore the before-image"
* **AG-18-41**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:469`: "**AG-18-41.** *(revised same day — AG18-D10(c), (o); changed 5 Oct — AG18-D11(d))* Undo SHALL NOT remove a record a user has **worked on** since the"
* **AG-18-42**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:472`: "**AG-18-42.** Every record and every event produced by an import SHALL carry `origin = IMPORT` and the batch reference (AG18-D7); `origin` is for audit only"
* **AG-18-43**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:473`: "**AG-18-43.** An import SHALL NOT fire any client-facing action: no message, **automated** portal invitation, questionnaire link, document request or acknowledgement to a client or lead"
* **AG-18-44**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:474`: "**AG-18-44.** An import SHALL fire internal actions as normal: Minder registration and reminders, internal tasks and internal notifications (AG18-D7)."
* **AG-18-45**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:475`: "**AG-18-45.** *(changed v1.8 — MAP:368, kept by AG02-D8(2); replaces AG18-D10(i))* An import SHALL write consent only when a consent column is mapped to one purpose"
* **AG-18-49**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:481`: "**AG-18-49.** *(revised same day — AG18-D10(h))* Before **any** batch containing personal data runs, assisted or firm-run, the **Owner** SHALL record an **attestation** that the firm"
* **AG-18-51**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:485`: "**AG-18-51.** AG-2's lead CSV import SHALL run as a target on this engine, in Release 1, with all of AG-18-8 to AG-18-45 applying (AG18-D2)."
* **AG-18-52**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:488`: "**AG-18-52.** Every batch, row, mapping, file and record SHALL be scoped to the importer's `firm_id` and protected by row-level security; a reference in a file"
* **AG-18-53**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:489`: "**AG-18-53.** A file SHALL NOT be able to supply internal record IDs; cross-batch references SHALL use the firm's own reference columns (e.g. client reference, email)"
* **AG-18-54**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:490`: "**AG-18-54.** Creating a batch, every dry-run, confirming, completing, undo and every assisted action SHALL write an immutable audit entry (actor, firm, target, counts, outcome)."
* **AG-18-56**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:492`: "**AG-18-56.** The import home SHALL list the firm's batches (paginated) with state, target, counts, importer, dates, undo deadline and the number of records still quiet,"
* **AG-18-57**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:493`: "**AG-18-57.** Every input to the engine (upload metadata, mappings, dry-run and run requests, undo requests, attestations) SHALL be validated by schema at the edge."
* **AG-18-58**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:494`: "**AG-18-58.** Import volumes SHALL be bounded by configured ceilings (file size, rows per batch, files per zip) and a per-firm heavy-job quota; a refusal SHALL"
* **AG-18-59**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:497`: "**AG-18-59.** *(new same day — AG18-D9)* Every client (person or employer), lead and case **created** by an import SHALL start with `automationState = QUIET`, with"
* **AG-18-60**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:498`: "**AG-18-60.** *(new same day — AG18-D9; revised same day — AG18-D10(a))* While a record is QUIET, no client-facing action SHALL be taken for it or"
* **AG-18-61**, `02-functional-requirements/agent/AG-18-data-import-and-migration_v1.9_2026-10-25.md:499`: "**AG-18-61.** *(new same day — AG18-D9; revised same day — AG18-D10(d))* Internal work SHALL run normally for a QUIET record: Minder deadline registration and reminders"
* Dropped from the BACKLOG sources (1): AG-18 (module name (document title), not a requirement id).
* Fit: wider: sources add undo, virus scan, Owner attestation, async jobs, quiet mode and other targets; core (dry run, mapping, row reasons, dedupe, consent, origin) matches Done when.

### R1.36 36 Simple automation, message many with consent
Not built · journey test: no

* **AG-2-31**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:3769`: "AG-2-31 — Ready-made follow-up recipes: who may be enrolled, and what ends a run"
* **AG-2-33**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:3811`: "AG-2-33 — Marketing steps check consent at send time"
* **AG-2-56**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:3655`: "AG-2-56 — New lead: "Call now" task, thanks email and reply reminder"
* **AG-2-90**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:3938`: "AG-2-90 — Message many: one message to a filtered list"
* **AG-2-91**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:3983`: "AG-2-91 — Who gets it: consent, frequency limit, quiet people"
* **AG-16-50**, `02-functional-requirements/agent/AG-16-firm-settings-and-integrations_v1.24_2026-10-25.md:936`: "**AG-16-50** *(changed v1.16).* Autonomy labels in the interface are **"Send automatically" / "Ask me first" / "Off"** (the enums stay internal); they appear on the"
* **AG-16-51**, `02-functional-requirements/agent/AG-16-firm-settings-and-integrations_v1.24_2026-10-25.md:939`: "**AG-16-51** *(changed v1.16 — AG16-12; single home AG-12; changed 21 Oct — X-5).* The missing-document chase timing, and the timing of every other timed message,"
* Dropped from the BACKLOG sources (5): AG-2-13a (Withdrawn in AG-02 v2.6 (D5b table, AG16-89(8) withdrew routing rules); the line is the withdrawal record, not a live requirement); AG-2-13b (Withdrawn in AG-02 v2.6 (D5b table, AG16-89(8) withdrew routing rules); the line is the withdrawal record, not a live requirement); AG-2-13d (Withdrawn in AG-02 v2.6 (D5b table, AG16-89(8) withdrew routing rules); the line is the withdrawal record, not a live requirement); AG-2-39 (In the snapshot it is the going-cold mark, not automation sends or consent); AG-2-59 (In the snapshot it is imported people staying quiet, not recipes or message-many).
* Fit: matches: recipes (AG-2-31), consent at send (AG-2-33), message many with consent and skips (AG-2-90/91), Off switch (AG-16-50), timings (AG-16-51).

### R1.37 37 Public booking page; no double booking
Works · journey test: yes, `tests/journeys/j_37.ts`

* **AG-4-16**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:1009`: "AG-4-16 — The booking page under the firm's web address, embeddable"
* **AG-4-1**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:398`: "AG-4-1, AG-4-2, AG-4-3 — How slots are computed"
* **AG-4-26**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:782`: "AG-4-25, AG-4-26, AG-4-27 — Re-check at write time; two active bookings for one host never overlap"
* **AG-4-9**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:589`: "AG-4-9 — Create, edit, duplicate and retire appointment types"
* **AG-4-10**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:619`: "AG-4-10 — Purpose decides what a type does; case types never show publicly"
* **AG-4-12**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:670`: "AG-4-12, AG-4-51 — Hosting choice, host list and pick rule"
* **AG-4-4**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:432`: "AG-4-4, AG-4-5, AG-4-66 — Booking timings: firm defaults on the Timings screen, changeable per type"
* **AG-4-5**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:432`: "AG-4-4, AG-4-5, AG-4-66 — Booking timings: firm defaults on the Timings screen, changeable per type"
* **AG-4-66**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:432`: "AG-4-4, AG-4-5, AG-4-66 — Booking timings: firm defaults on the Timings screen, changeable per type"
* **AG-4-7**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:492`: "AG-4-7 — Slots respect the firm's closed days"
* **AG-4-62**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:356`: "AG-4-62 — Each person sets their own hours and time off"
* **AG-4-17**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:1037`: "AG-4-17, AG-4-21 — Public lookups that leak nothing; answers that belong to the type"
* **AG-4-18**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:1065`: "AG-4-18 — Times shown in the visitor's time zone"
* **AG-4-19**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:1089`: "AG-4-19 — English first; the consent sentence is the firm's"
* **AG-4-20**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:1117`: "AG-4-20 — Accessible and protected without blocking real people"
* **AG-4-32**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:1196`: "AG-4-32, AG-4-57 — Calendar invite on every confirmation and update"
* **AG-4-34**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:1249`: "AG-4-34 — Booking still succeeds when the queue is down"
* Dropped from the BACKLOG sources (18): AG-2-10 (In the snapshot it is a booking making a lead (AG-02), not this capability); AG-2-26 (In the snapshot it is prospect stage guards, unrelated to booking); AG-4-11 (In the snapshot it is about ways to meet, not this row's capability); AG-4-14 (In the snapshot it is about intake questions, not this row's capability); AG-4-22 (In the snapshot it is about handing the booker to AG-02 (lead creation), not this row's capability); AG-4-29 (In the snapshot it is about where the meeting link comes from, not this row's capability); AG-4-36 (In the snapshot it is about the booker rescheduling or cancelling, not this row's capability); AG-4-37 (In the snapshot it is about the booker rescheduling or cancelling, not this row's capability); AG-4-38 (In the snapshot it is about the booker rescheduling or cancelling, not this row's capability); AG-4-39 (In the snapshot it is about recording attendance, not this row's capability); and 8 more.
* Fit: wider: sources also cover type setup, timings, accessibility and queue resilience; core (public page, slots, no overlap, invite) matches. Team asks lock-based re-check; Done when names a database rule.

### R1.38 38 Time zones from booking page to invite
Works · journey test: yes, `tests/journeys/j_38.ts` · BACKLOG chain, plus ids the reader added by search

* **AG-4-1**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:398`: "AG-4-1, AG-4-2, AG-4-3 — How slots are computed"
* **AG-4-62**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:356`: "AG-4-62 — Each person sets their own hours and time off"
* **AG-4-32**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:1196`: "AG-4-32, AG-4-57 — Calendar invite on every confirmation and update"
* **AG-4-18**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:1065`: "AG-4-18 — Times shown in the visitor's time zone"
* Dropped from the BACKLOG sources (21): AG-2-10 (In the snapshot it is a booking making a lead (AG-02), not this capability); AG-2-26 (In the snapshot it is prospect stage guards, unrelated to booking); AG-4-11 (In the snapshot it is about ways to meet, not this row's capability); AG-4-12 (In the snapshot it is about hosting choice and host pick, not this row's capability); AG-4-14 (In the snapshot it is about intake questions, not this row's capability); AG-4-16 (In the snapshot it is about the public booking page, not this row's capability); AG-4-19 (In the snapshot it is about language and consent sentence, not this row's capability); AG-4-22 (In the snapshot it is about handing the booker to AG-02 (lead creation), not this row's capability); AG-4-26 (In the snapshot it is about write-time re-check and no overlapping bookings, not this row's capability); AG-4-29 (In the snapshot it is about where the meeting link comes from, not this row's capability); and 11 more.
* Fit: matches: visitor-zone display (AG-4-18, added by search), per-set hour zones in slot computation (AG-4-1, AG-4-62), invite times (AG-4-32).

### R1.39 39 Staff calendar screen
Not built · journey test: no

* **AG-4-67**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:1899`: "AG-4-67 — Who sees a booking"
* **AG-4-62**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:356`: "AG-4-62 — Each person sets their own hours and time off"
* Dropped from the BACKLOG sources (17): AG-4-16 (In the snapshot it is about the public booking page, not this row's capability); AG-4-17 (In the snapshot it is about public lookups, not this row's capability); AG-4-18 (In the snapshot it is about showing times in the visitor's zone, not this row's capability); AG-4-19 (In the snapshot it is about language and consent sentence, not this row's capability); AG-4-20 (In the snapshot it is about accessibility and bot protection, not this row's capability); AG-4-36 (In the snapshot it is about the booker rescheduling or cancelling, not this row's capability); AG-4-37 (In the snapshot it is about the booker rescheduling or cancelling, not this row's capability); AG-4-38 (In the snapshot it is about the booker rescheduling or cancelling, not this row's capability); AG-4-39 (In the snapshot it is about recording attendance, not this row's capability); AG-4-4 (In the snapshot it is about booking timings (notice, window), not this row's capability); and 7 more.
* Fit: narrower sources: no card defines a staff calendar with day/week/list views; only mentioned in passing (AG-04:1635 "ExpatReady's calendar view"). Visibility (AG-4-67) and time off (AG-4-62) match.

### R1.40 40 Calendar invite files
Works · journey test: no · BACKLOG chain, plus ids the reader added by search

* **AG-4-32**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:1196`: "AG-4-32, AG-4-57 — Calendar invite on every confirmation and update"
* **AG-4-57**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:1196`: "AG-4-32, AG-4-57 — Calendar invite on every confirmation and update"
* Dropped from the BACKLOG sources (23): AG-2-10 (In the snapshot it is a booking making a lead (AG-02), not this capability); AG-2-26 (In the snapshot it is prospect stage guards, unrelated to booking); AG-4-1 (In the snapshot it is about how slots are computed, not this row's capability); AG-4-11 (In the snapshot it is about ways to meet, not this row's capability); AG-4-12 (In the snapshot it is about hosting choice and host pick, not this row's capability); AG-4-14 (In the snapshot it is about intake questions, not this row's capability); AG-4-16 (In the snapshot it is about the public booking page, not this row's capability); AG-4-19 (In the snapshot it is about language and consent sentence, not this row's capability); AG-4-22 (In the snapshot it is about handing the booker to AG-02 (lead creation), not this row's capability); AG-4-26 (In the snapshot it is about write-time re-check and no overlapping bookings, not this row's capability); and 13 more.
* Fit: matches: AG-4-32 rules 1-3 give stable UID, SEQUENCE on update, METHOD:CANCEL on cancel. AG-4-57 (same card) added by search.

### R1.41 41 Staff hours and time off
Works · journey test: yes, `tests/journeys/j_41.ts`

* **AG-4-62**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:356`: "AG-4-62 — Each person sets their own hours and time off"
* **AG-4-1**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:398`: "AG-4-1, AG-4-2, AG-4-3 — How slots are computed"
* Dropped from the BACKLOG sources (27): AG-2-10 (In the snapshot it is a booking making a lead (AG-02), not this capability); AG-2-26 (In the snapshot it is prospect stage guards, unrelated to booking); AG-4-10 (In the snapshot it is about what a type's purpose does, not this row's capability); AG-4-11 (In the snapshot it is about ways to meet, not this row's capability); AG-4-12 (In the snapshot it is about hosting choice and host pick, not this row's capability); AG-4-14 (In the snapshot it is about intake questions, not this row's capability); AG-4-16 (In the snapshot it is about the public booking page, not this row's capability); AG-4-19 (In the snapshot it is about language and consent sentence, not this row's capability); AG-4-22 (In the snapshot it is about handing the booker to AG-02 (lead creation), not this row's capability); AG-4-26 (In the snapshot it is about write-time re-check and no overlapping bookings, not this row's capability); and 17 more.
* Fit: matches: AG-4-62 rule 2 forbids overlapping windows within a day and rule 5 removes slots overlapping time off; database enforcement is from QA-524/P-294.

### R1.42 42 Reschedule or cancel by link; outcomes; consult record
Partial · journey test: yes, `tests/journeys/j_42.ts`

* **AG-4-36**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:1320`: "AG-4-36, AG-4-37, AG-4-38 — The booker reschedules or cancels from the email, safely"
* **AG-4-37**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:1320`: "AG-4-36, AG-4-37, AG-4-38 — The booker reschedules or cancels from the email, safely"
* **AG-4-38**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:1320`: "AG-4-36, AG-4-37, AG-4-38 — The booker reschedules or cancels from the email, safely"
* **AG-4-4**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:432`: "AG-4-4, AG-4-5, AG-4-66 — Booking timings: firm defaults on the Timings screen, changeable per type"
* **AG-4-5**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:432`: "AG-4-4, AG-4-5, AG-4-66 — Booking timings: firm defaults on the Timings screen, changeable per type"
* **AG-4-66**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:432`: "AG-4-4, AG-4-5, AG-4-66 — Booking timings: firm defaults on the Timings screen, changeable per type"
* **AG-4-39**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:1354`: "AG-4-39 — Attendance is asked, never guessed"
* **AG-4-49**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:1743`: "AG-4-49 — The consult record"
* Dropped from the BACKLOG sources (25): AG-2-10 (In the snapshot it is a booking making a lead (AG-02), not this capability); AG-2-26 (In the snapshot it is prospect stage guards, unrelated to booking); AG-4-1 (In the snapshot it is about how slots are computed, not this row's capability); AG-4-10 (In the snapshot it is about what a type's purpose does, not this row's capability); AG-4-11 (In the snapshot it is about ways to meet, not this row's capability); AG-4-12 (In the snapshot it is about hosting choice and host pick, not this row's capability); AG-4-14 (In the snapshot it is about intake questions, not this row's capability); AG-4-16 (In the snapshot it is about the public booking page, not this row's capability); AG-4-17 (In the snapshot it is about public lookups, not this row's capability); AG-4-18 (In the snapshot it is about showing times in the visitor's zone, not this row's capability); and 15 more.
* Fit: matches: self-service reschedule/cancel with notice window and rotating token (AG-4-36-38), notice defaults (AG-4-4/5/66), attendance outcome (AG-4-39), consult record note (AG-4-49).

### R1.43 43 Two-way Google or Outlook calendar sync
Not built · journey test: no

* **AG-4-40**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:1625`: "AG-4-40, AG-4-56 — Connect your own calendar, on every plan"
* **AG-4-56**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:1625`: "AG-4-40, AG-4-56 — Connect your own calendar, on every plan"
* **AG-4-41**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:1650`: "AG-4-41 — Busy times on your calendar block slots"
* **AG-4-42**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:1674`: "AG-4-42 — Bookings appear on your calendar, with only what runs the meeting"
* **AG-4-43**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:1701`: "AG-4-43 — Disconnect, or a broken connection, never stops booking"
* **AG-4-59**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:1585`: "AG-4-59 — Connecting your own calendar or Zoom needs no permission"
* **AG-16-16**, `02-functional-requirements/agent/AG-16-firm-settings-and-integrations_v1.24_2026-10-25.md:883`: "**AG-16-16** *(changed v1.18 — AG16-82; v1.16 — A7).* Connections SHALL be **health-monitored**; a degraded or failed rail SHALL record a `ConnectionHealthEvent`. When any firm connection"
* **AG-16-71**, `02-functional-requirements/agent/AG-16-firm-settings-and-integrations_v1.24_2026-10-25.md:957`: "**AG-16-71** *(new v1.17 — AG16-24, AG16-52).* The firm mailboxes, personal mailboxes and personal calendars SHALL be available on **every plan**. Any signed-in staff member SHALL"
* Dropped from the BACKLOG sources (7): AG-4-26 (In the snapshot it is about write-time re-check and no overlapping bookings, not this row's capability); AG-4-27 (In the snapshot it is about write-time re-check and no overlapping bookings, not this row's capability); AG-4-29 (In the snapshot it is about where the meeting link comes from, not this row's capability); AG04-D12 (a product-owner decision record (event holds only what runs the meeting), not a requirement; carried by AG-4-42); AG16-18 (a product-owner decision record (personal calendars only), not a requirement; carried by AG-4-40); BR-14 (BR numbers are per module; the one found (AG-01 BR-14) is about branding, not calendar sync); BR-2 (BR numbers are per module; the one found (AG-01 BR-2) is about plan entitlements, not calendar sync).
* Fit: matches: busy times block slots (AG-4-41), bookings appear on the calendar (AG-4-42), disconnect never stops booking (AG-4-43); "within minutes" is not stated in these titles.

### R1.45 45 Firm templates, field picker, preview with a real record
Not built · journey test: no

* **AG-12-70**, `02-functional-requirements/agent/AG-12-templates_v2.11_2026-10-27.md:504`: "**AG-12-70** *(changed v2.1)* Fields SHALL be inserted only from the picker, which SHALL offer only SA-05 dictionary fields for the template's type (SA-05 §3.6.1)."
* **AG-12-89**, `02-functional-requirements/agent/AG-12-templates_v2.11_2026-10-27.md:536`: "**AG-12-89** *(kept v2.0)* Preview SHALL render with a real lead, client, case or organisation chosen by the user, only from records the user may open;"
* **AG-12-66**, `02-functional-requirements/agent/AG-12-templates_v2.11_2026-10-27.md:497`: "**AG-12-66** *(changed v2.1)* Publishing SHALL apply the checks of SA-5-11 and SA-5-25 that concern firm versions and show the reason when refused; a missing French"
* **AG-12-44**, `02-functional-requirements/agent/AG-12-templates_v2.11_2026-10-27.md:463`: "**AG-12-44** *(kept v2.0)* A template the firm has not edited SHALL be used from ExpatReady's current published version, with no copy stored in the firm."
* **AG-12-45**, `02-functional-requirements/agent/AG-12-templates_v2.11_2026-10-27.md:464`: "**AG-12-45** *(kept v2.0)* Editing an ExpatReady template SHALL create a firm draft; publishing it SHALL make the firm's version the one used for that firm,"
* **AG-12-65**, `02-functional-requirements/agent/AG-12-templates_v2.11_2026-10-27.md:496`: "**AG-12-65** *(kept v2.0)* A draft SHALL never be sent or used to generate a document; publishing SHALL make the version the one in use."
* **AG-12-95**, `02-functional-requirements/agent/AG-12-templates_v2.11_2026-10-27.md:545`: "**AG-12-95** *(changed v2.1)* The system SHALL audit: edit, publish, restore, reset, keep mine, keep my current wording, use the new wording now, go back to"
* **AG-12-99**, `02-functional-requirements/agent/AG-12-templates_v2.11_2026-10-27.md:581`: "**AG-12-99** *(kept v2.0)* Every list, history and where-used read SHALL be firm-scoped and paginated."
* Dropped from the BACKLOG sources (4): AG-12-4 (Withdrawn in AG-12 v2.11 (AG-12:417, replaced by AG-12-39 to 41); its text exists only in the older Doc-3 list); AG-12-15 (Superseded in AG-12 v2.11 (AG-12:428, now AG-12-70); text exists only in the older Doc-3 list); AG-12-16 (Superseded in AG-12 v2.11 (AG-12:429, now AG-12-66); text exists only in the older Doc-3 list); AG-12-19 (Superseded in AG-12 v2.11 (AG-12:432, now AG-12-89 to 91); text exists only in the older Doc-3 list).
* Fit: matches: picker-only fields (AG-12-70), real-record preview (AG-12-89), publish checks refuse with reason (AG-12-66); firm draft/publish rules are wider.

### R1.46 46 Template text editor (a plain text box)
Not built · journey test: no · all ids found by search (the BACKLOG chain gave none that fit)

* **AG-12-64**, `02-functional-requirements/agent/AG-12-templates_v2.11_2026-10-27.md:495`: "**AG-12-64** *(kept v2.0)* The editor SHALL show name, purpose, channels, English and French versions side by side (French optional), subject and body for email, the"
* **AG-12-70**, `02-functional-requirements/agent/AG-12-templates_v2.11_2026-10-27.md:504`: "**AG-12-70** *(changed v2.1)* Fields SHALL be inserted only from the picker, which SHALL offer only SA-05 dictionary fields for the template's type (SA-05 §3.6.1)."
* Dropped from the BACKLOG sources (4): AG-12-4 (Withdrawn in AG-12 v2.11 (AG-12:417, replaced by AG-12-39 to 41); its text exists only in the older Doc-3 list); AG-12-15 (Superseded in AG-12 v2.11 (AG-12:428, now AG-12-70); text exists only in the older Doc-3 list); AG-12-16 (Superseded in AG-12 v2.11 (AG-12:429, now AG-12-66); text exists only in the older Doc-3 list); AG-12-19 (Superseded in AG-12 v2.11 (AG-12:432, now AG-12-89 to 91); text exists only in the older Doc-3 list).
* Fit: different: AG-12-64 describes a fuller editor (EN/FR side by side, WhatsApp version); no length limit found. Both ids added by search after all sources dropped.

### R1.47 47 One email layout
Partial · journey test: no · all ids found by search (the BACKLOG chain gave none that fit)

* **AG-16-70**, `02-functional-requirements/agent/AG-16-firm-settings-and-integrations_v1.24_2026-10-25.md:956`: "**AG-16-70** *(new v1.16 — A13).* Section 2 "How clients see you" SHALL be the one "layout" area (also an optional setup-checklist item, AG-01): logo and"
* Dropped from the BACKLOG sources (8): AG-10-1 (In the snapshot it is about the two delivery Doers (Mailer, Messenger), not the one email layout); AG-10-3 (In the snapshot it is about every message being a Communication record, not the one email layout); AG-10-5 (In the snapshot it is about composing email from an entity, not the one email layout); AG-10-20 (In the snapshot it is about the unified communication timeline, not the one email layout); AG-10-22 (In the snapshot it is about the consent/contactability gate, not the one email layout); AG-10-25 (In the snapshot it is about hard bounce suppression, not the one email layout); AG-16-17 (In the snapshot it is about email fallback to shared sending under the firm's name, not the one email layout); AG-2-59 (In the snapshot it is about imported people staying quiet, not the one email layout).
* Fit: matches: AG-16-70 makes "How clients see you" the one layout area (logo, colours, footer, sender name). Added by search; every backlog source dropped.

### R1.48 48 Sending, delivery state, bounces, the firm's sender name
Works · journey test: yes, `tests/journeys/j_48.ts` · BACKLOG chain, plus ids the reader added by search

* **AG-10-7**, `02-functional-requirements/agent/AG-10-communication-hub_v1.26_2026-10-27.md:586`: "**AG-10-7.** The Mailer SHALL record **delivery state** (`queued → sent → delivered → opened`, `bounced/failed`) from rail webhooks; open/click tracking SHALL be **firm-configurable** and SHALL"
* **AG-10-25**, `02-functional-requirements/agent/AG-10-communication-hub_v1.26_2026-10-27.md:614`: "**AG-10-25.** A **hard bounce** or invalid number SHALL add the address to a **firm-wide suppression list**; suppressed addresses SHALL receive no further sends (transactional included)"
* **AG-16-17**, `02-functional-requirements/agent/AG-16-firm-settings-and-integrations_v1.24_2026-10-25.md:884`: "**AG-16-17** *(changed v1.16 — AG16-17, AG16-19, AG16-18).* Fallback SHALL apply to **email only** (ExpatReady's shared sending under the firm's name). **WhatsApp** messages SHALL go by"
* **AG-10-1**, `02-functional-requirements/agent/AG-10-communication-hub_v1.26_2026-10-27.md:578`: "**AG-10-1.** The system SHALL deliver communication via two in-house Doers — **Mailer** (email) and **Messenger** (SMS / WhatsApp / in-app portal chat) — and SHALL"
* **AG-10-3**, `02-functional-requirements/agent/AG-10-communication-hub_v1.26_2026-10-27.md:580`: "**AG-10-3.** Every message (outbound or inbound, any channel) SHALL be a **`Communication`** attached to a subject entity via the polymorphic **`(entityType, entityId)`** (`CONTACT | PROSPECT"
* **AG-10-5**, `02-functional-requirements/agent/AG-10-communication-hub_v1.26_2026-10-27.md:584`: "**AG-10-5.** Staff with `agent/communication:send-email` SHALL compose and send email **from an entity context**, pre-filled with the recipient and entity variables, optionally template-driven (AG-10-30). *(changed 24"
* Dropped from the BACKLOG sources (3): AG-10-20 (In the snapshot it is about the unified communication timeline, not delivery state or sender name); AG-10-22 (In the snapshot it is about the consent/contactability gate, not delivery state or sender name); AG-2-59 (In the snapshot it is about imported people staying quiet, not delivery state or sender name).
* Fit: matches: delivery state from webhooks (AG-10-7, added by search), hard-bounce suppression (AG-10-25), sending under the firm's name (AG-16-17).

### R1.49 49 Consent gate before every send; unsubscribe
Partial · journey test: no · BACKLOG chain, plus ids the reader added by search

* **AG-10-22**, `02-functional-requirements/agent/AG-10-communication-hub_v1.26_2026-10-27.md:611`: "**AG-10-22.** Every outbound send (manual or automated) SHALL pass a **consent/contactability gate** that classifies the message **transactional vs marketing**; **transactional** SHALL be allowed to a"
* **SA-11-29**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:498`: "**SA-11-29.** *(changed v2.9 — Q20, decisions 1 and 14; changed v2.10 — G-Q2, SA05-Q10)* **Consent records** SHALL be recorded per **purpose** — built `MARKETING_EMAIL`, `MARKETING_SMS`,"
* **AG-10-24**, `02-functional-requirements/agent/AG-10-communication-hub_v1.26_2026-10-27.md:613`: "**AG-10-24.** **Unsubscribe** (link click, STOP keyword, or manual flag) SHALL write a withdrawal and **permanently halt marketing** on that channel until explicit re-consent; the withdrawal"
* **AG-2-83**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:1032`: "AG-2-83 — Consent captured and evidenced at every door"
* Dropped from the BACKLOG sources (7): AG-10-1 (In the snapshot it is about the two delivery Doers (Mailer, Messenger), not the consent gate or unsubscribe); AG-10-3 (In the snapshot it is about every message being a Communication record, not the consent gate or unsubscribe); AG-10-5 (In the snapshot it is about composing email from an entity, not the consent gate or unsubscribe); AG-10-20 (In the snapshot it is about the unified communication timeline, not the consent gate or unsubscribe); AG-10-25 (In the snapshot it is about hard bounce suppression, not the consent gate or unsubscribe); AG-16-17 (In the snapshot it is about email fallback to shared sending under the firm's name, not the consent gate or unsubscribe); AG-2-59 (In the snapshot it is about imported people staying quiet, not the consent gate or unsubscribe).
* Fit: matches: gate on every send, transactional allowed (AG-10-22), consent per purpose (SA-11-29), unsubscribe halts marketing on every path (AG-10-24, added by search).

### R1.50 50 In-app notifications; personal notification settings
Not built · journey test: no

* **AG-10-29a**, `02-functional-requirements/agent/AG-10-communication-hub_v1.26_2026-10-27.md:622`: "**AG-10-29a.** The module SHALL raise **Notifications** (in-app and email per each user's own **`NotificationPreference`** switches — AG16-14) on: lead/client reply and new inbound message *(email:"
* **AG-10-29b**, `02-functional-requirements/agent/AG-10-communication-hub_v1.26_2026-10-27.md:623`: "**AG-10-29b.** *(changed v1.13 — AG16-14)* Notification settings SHALL be **personal to each user** (My account → Notifications, owned by AG-16): a few plain groups, each"
* **AG-10-36**, `02-functional-requirements/agent/AG-10-communication-hub_v1.26_2026-10-27.md:626`: "**AG-10-36.** The notification bell, unread count and notification lists SHALL show every notification the user is entitled to receive regardless of the Individual / Corporate"
* **AG-16-10**, `02-functional-requirements/agent/AG-16-firm-settings-and-integrations_v1.24_2026-10-25.md:865`: "**AG-16-10** *(changed v1.16 — AG16-14; changed 18 Oct — AG16-105(2)).* Each user SHALL set their own **In-app** and **Email** switches for the **eight groups** of"
* **AG-7-39**, `02-functional-requirements/agent/AG-07-case-core-and-delivery_v3.12_2026-10-28.md:4308`: "AG-7-39 — Four staff notifications"
* **AG-16-11**, `02-functional-requirements/agent/AG-16-firm-settings-and-integrations_v1.24_2026-10-25.md:875`: "**AG-16-11.** Notification copy SHALL be **English only in Release 1 and translation-ready** (all text kept in one place so French can be switched on later),"
* Dropped from the BACKLOG sources (4): AG-1-74 (In the snapshot it is the office time zone, not notifications); AG-16-59 (In the snapshot it is firm business hours, not notifications); AG-16-63 (In the snapshot it is raising a support ticket, not notifications); AG-16-68 (In the snapshot it is adding an office, not notifications).
* Fit: matches: events raise notifications per personal switches (AG-10-29a/b, AG-16-10), bell and unread (AG-10-36); AG-16-10 also covers email switches, wider.

### R1.52 52 Connected mailbox; WhatsApp (no SMS)
Not built · journey test: no · BACKLOG chain, plus ids the reader added by search

* **AG-10-4**, `02-functional-requirements/agent/AG-10-communication-hub_v1.26_2026-10-27.md:581`: "**AG-10-4 *(changed 5 Oct — AG11-D16; changed 5 Oct (Release 1 scope review) — AG-10-4, AG11-D18(c); changed v1.13 — AG16-15)*.** A firm MAY **connect one"
* **AG-10-68**, `02-functional-requirements/agent/AG-10-communication-hub_v1.26_2026-10-27.md:685`: "**AG-10-68.** *(AG16-25)* A single **"Connect your email"** button SHALL appear in onboarding, Settings → Connections and My account → Email. The role of the mailbox"
* **AG-10-62**, `02-functional-requirements/agent/AG-10-communication-hub_v1.26_2026-10-27.md:676`: "**AG-10-62.** *(changed v1.14 — AG16-28; changed v1.15 — AG16-71; build card AG-10-62)* Email SHALL work on day one through ExpatReady's **shared sending** with the firm's"
* **AG-10-9**, `02-functional-requirements/agent/AG-10-communication-hub_v1.26_2026-10-27.md:588`: "**AG-10-9.** Replies and forwards SHALL preserve **threading headers** (`In-Reply-To`/`References`) and the **entity link** of the parent message. *(changed 24 Oct, CC-1)* A reply SHALL keep,"
* **AG-10-10**, `02-functional-requirements/agent/AG-10-communication-hub_v1.26_2026-10-27.md:591`: "**AG-10-10.** *(changed v1.14 — AG16-26; build card AG-10-10)* When a mailbox is connected, a background sync SHALL ingest inbound email and SHALL run **entity matching**"
* **AG-10-11**, `02-functional-requirements/agent/AG-10-communication-hub_v1.26_2026-10-27.md:592`: "**AG-10-11.** A confidently matched inbound email SHALL become an **inbound `Communication`** on the entity's timeline (continuing the original thread). It SHALL raise a `lead-replied`/`new-inbound-message` Notification"
* **AG-10-12**, `02-functional-requirements/agent/AG-10-communication-hub_v1.26_2026-10-27.md:593`: "**AG-10-12.** An inbound email that **cannot be matched** SHALL land in the **Unmatched inbox** (never silently dropped, never auto-attached to a guessed file), with ranked"
* **AG-10-13**, `02-functional-requirements/agent/AG-10-communication-hub_v1.26_2026-10-27.md:594`: "**AG-10-13.** Inbound attachments SHALL be **ingested into AG-9** and referenced from the inbound `Communication` (AG-10-28)."
* **AG-10-14**, `02-functional-requirements/agent/AG-10-communication-hub_v1.26_2026-10-27.md:597`: "**AG-10-14.** The agent inbox SHALL present email **grouped into threads** with folders (inbox/sent/drafts/snoozed), read/unread, star, archive, snooze, labels, reply, forward, and draft CRUD; inbox and"
* **AG-10-28**, `02-functional-requirements/agent/AG-10-communication-hub_v1.26_2026-10-27.md:619`: "**AG-10-28.** Attachments SHALL reference **AG-9 media** (not be stored by AG-10); inbound media SHALL be ingested into AG-9; display/download SHALL use **AG-9 presigned URLs** and"
* **AG-10-69**, `02-functional-requirements/agent/AG-10-communication-hub_v1.26_2026-10-27.md:686`: "**AG-10-69.** *(AG16-25, AG16-42)* An email SHALL be filed to one record and never tagged to people; who sees it is whoever can open that record;"
* **AG-10-3**, `02-functional-requirements/agent/AG-10-communication-hub_v1.26_2026-10-27.md:580`: "**AG-10-3.** Every message (outbound or inbound, any channel) SHALL be a **`Communication`** attached to a subject entity via the polymorphic **`(entityType, entityId)`** (`CONTACT | PROSPECT"
* **AG-10-33**, `02-functional-requirements/agent/AG-10-communication-hub_v1.26_2026-10-27.md:636`: "**AG-10-33.** All external-facing surfaces (webhooks, portal chat endpoints, mailbox OAuth callback) SHALL be authenticated/verified and tenant-scoped; portal chat SHALL be scoped to the authenticated client"
* **AG-10-35**, `02-functional-requirements/agent/AG-10-communication-hub_v1.26_2026-10-27.md:638`: "**AG-10-35.** *(changed v1.6 — AG7-D10: "PII reveal" and "unmasked export" event types removed)* Sensitive actions (mailbox connect/disconnect, rail config, consent override, suppression edit, bulk send,"
* **AG-10-39**, `02-functional-requirements/agent/AG-10-communication-hub_v1.26_2026-10-27.md:643`: "**AG-10-39.** When the Sorter's AI is off (the default until AG11-D13 is satisfied and the Owner switches it on), not configured, or its provider is"
* **AG-16-18**, `02-functional-requirements/agent/AG-16-firm-settings-and-integrations_v1.24_2026-10-25.md:887`: "**AG-16-18.** All connection **secrets** SHALL be **encrypted at rest** and **never returned to the client** (status and masked hint only). *(Changed v1.14: the old plain-text"
* **SA-11-37**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:509`: "**SA-11-37.** *(NEW v2.11 — AG16-27(6), AG16-30, SA11-D13)* Email **bodies, subjects and attachment file names** are personal data and SHALL NEVER be copied into system logs"
* **SA-11-39**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:511`: "**SA-11-39.** *(NEW v2.11 — AG16-44, SA11-D15; changed v2.12 — AG16-54 #21)* **Moving or un-filing an email is one audit event type.** When a person moves"
* **AG-10-16**, `02-functional-requirements/agent/AG-10-communication-hub_v1.26_2026-10-27.md:601`: "**AG-10-16.** Messenger SHALL support **SMS**, **WhatsApp** (via the gateway rail), and **in-app portal chat**, all attaching to **one `Conversation` per client/entity** and to the entity"
* **AG-10-17**, `02-functional-requirements/agent/AG-10-communication-hub_v1.26_2026-10-27.md:602`: "**AG-10-17.** *(changed v1.14 — AG16-49; build card AG-10-8)* Outbound SMS/WhatsApp SHALL pass the **consent gate** (AG-10-22) and, when automatic, the **client's sending time** (AG-10-8), except"
* Dropped from the BACKLOG sources (1): AG-16 (module name (document title), not a requirement id).
* Fit: matches: mailbox send and reply filing (AG-10-4, -10 to -12, -69); AG-10-16 puts SMS in Release 2, WhatsApp templates in Release 1. AG-10-16/17 added by search.

### R1.53 53 Retainer with the regulator's 26 items; versioned until sent
Partial · journey test: no

* **AG-5-3**, `02-functional-requirements/agent/AG-05-retainer-and-agreements_v2.1_2026-10-27.md:356`: "AG-5-1, AG-5-2, AG-5-3 — The agreement, its versions and its signing request"
* **AG-5-65**, `02-functional-requirements/agent/AG-05-retainer-and-agreements_v2.1_2026-10-27.md:765`: "AG-5-65 — Edit a sent retainer until it is signed; every version kept"
* **AG-5-4**, `02-functional-requirements/agent/AG-05-retainer-and-agreements_v2.1_2026-10-27.md:530`: "AG-5-4, AG-5-7, AG-5-45, AG-5-16 — Retainer templates and the firm's clause locks"
* **AG-5-7**, `02-functional-requirements/agent/AG-05-retainer-and-agreements_v2.1_2026-10-27.md:530`: "AG-5-4, AG-5-7, AG-5-45, AG-5-16 — Retainer templates and the firm's clause locks"
* **AG-5-16**, `02-functional-requirements/agent/AG-05-retainer-and-agreements_v2.1_2026-10-27.md:530`: "AG-5-4, AG-5-7, AG-5-45, AG-5-16 — Retainer templates and the firm's clause locks"
* **AG-5-8**, `02-functional-requirements/agent/AG-05-retainer-and-agreements_v2.1_2026-10-27.md:557`: "AG-5-8, AG-5-9, AG-5-10, AG-5-11 — Merge fields from the one record"
* **AG-5-9**, `02-functional-requirements/agent/AG-05-retainer-and-agreements_v2.1_2026-10-27.md:557`: "AG-5-8, AG-5-9, AG-5-10, AG-5-11 — Merge fields from the one record"
* **AG-5-49**, `02-functional-requirements/agent/AG-05-retainer-and-agreements_v2.1_2026-10-27.md:493`: "AG-5-55, AG-5-56, AG-5-57, AG-5-58, AG-5-49 — Prepare retainer from a lead, a prospect, a client or a case"
* **AG-5-55**, `02-functional-requirements/agent/AG-05-retainer-and-agreements_v2.1_2026-10-27.md:493`: "AG-5-55, AG-5-56, AG-5-57, AG-5-58, AG-5-49 — Prepare retainer from a lead, a prospect, a client or a case"
* **AG-5-57**, `02-functional-requirements/agent/AG-05-retainer-and-agreements_v2.1_2026-10-27.md:493`: "AG-5-55, AG-5-56, AG-5-57, AG-5-58, AG-5-49 — Prepare retainer from a lead, a prospect, a client or a case"
* **AG-5-64**, `02-functional-requirements/agent/AG-05-retainer-and-agreements_v2.1_2026-10-27.md:639`: "AG-5-64 — The Fees panel"
* Dropped from the BACKLOG sources (11): AG-5-20 (In the snapshot it is signers, consent text and evidence (signing, R1.54)); AG-5-26 (about several client signers (signing)); AG-5-62 (about several client signers (signing)); AG-5-27 (about stored signature and countersign); AG-5-28 (about seal, audit and certificate); AG-5-31 (about seal, audit and certificate); AG-5-34 (about withdraw/re-issue (R1.55)); AG-5-39 (about Signed offline (R1.55)); AG-5-47 (about schema validation and public page hardening); AG-5-50 (about the organisation signatory warning); and 1 more.
* Fit: different: team removed regulator clauses and never names a regulator (AG-05:196, :544); 26-item check rests on FO-5b (Code s.24(3)). AG-5-65 lets a sent retainer be edited until signed.

### R1.54 54 E-signature with evidence; send any document for signature
Partial · journey test: no

* **AG-5-61**, `02-functional-requirements/agent/AG-05-retainer-and-agreements_v2.1_2026-10-27.md:327`: "AG-5-61 — Send any document for signature"
* **AG-5-20**, `02-functional-requirements/agent/AG-05-retainer-and-agreements_v2.1_2026-10-27.md:384`: "AG-5-18, AG-5-20, AG-5-54 — Signers, consent text and evidence"
* **AG-5-28**, `02-functional-requirements/agent/AG-05-retainer-and-agreements_v2.1_2026-10-27.md:439`: "AG-5-28, AG-5-29, AG-5-30, AG-5-31 — Seal, audit, certificate and the signed copy"
* **AG-5-31**, `02-functional-requirements/agent/AG-05-retainer-and-agreements_v2.1_2026-10-27.md:439`: "AG-5-28, AG-5-29, AG-5-30, AG-5-31 — Seal, audit, certificate and the signed copy"
* **AG-5-41**, `02-functional-requirements/agent/AG-05-retainer-and-agreements_v2.1_2026-10-27.md:1130`: "AG-5-41, AG-5-42, AG-5-43, AG-5-44 — Storage as built, short-lived links, keep-period, export"
* **AG-5-37**, `02-functional-requirements/agent/AG-05-retainer-and-agreements_v2.1_2026-10-27.md:1016`: "AG-5-37, AG-5-38 — Signing events"
* **AG-5-62**, `02-functional-requirements/agent/AG-05-retainer-and-agreements_v2.1_2026-10-27.md:411`: "AG-5-62, AG-5-25, AG-5-26 — Several client signers, in any order; the firm last"
* **AG-5-25**, `02-functional-requirements/agent/AG-05-retainer-and-agreements_v2.1_2026-10-27.md:411`: "AG-5-62, AG-5-25, AG-5-26 — Several client signers, in any order; the firm last"
* **AG-5-26**, `02-functional-requirements/agent/AG-05-retainer-and-agreements_v2.1_2026-10-27.md:411`: "AG-5-62, AG-5-25, AG-5-26 — Several client signers, in any order; the firm last"
* Dropped from the BACKLOG sources (5): AG-5-21 (In AG-05 v2.1 (AG-05:471) it is dead links after signing/withdrawal, not evidence; the certificate text is only in older Doc-3); AG-5-34 (about withdraw/re-issue (R1.55)); AG-5-65 (about editing a sent retainer and versions (R1.53)); AG-5-68 (about a client declining (R1.55)); AG05-D4 (a product-owner decision record closing AG-05 open items, not a requirement).
* Fit: matches: any document for signature (AG-5-61), consent and evidence (AG-5-20), seal/certificate/signed copy (AG-5-28-31); the vendor sandbox comes from P-561/P-563, not the team.

### R1.55 55 Withdraw, re-issue, decline, signed offline
Partial · journey test: no

* **AG-5-34**, `02-functional-requirements/agent/AG-05-retainer-and-agreements_v2.1_2026-10-27.md:865`: "AG-5-34, AG-5-35 — Withdraw, re-issue, and delete a draft"
* **AG-5-21**, `02-functional-requirements/agent/AG-05-retainer-and-agreements_v2.1_2026-10-27.md:471`: "AG-5-21 | A link becomes dead once its signer signs or declines, and when its version is replaced, withdrawn or expires. A forwarded link cannot"
* **AG-5-68**, `02-functional-requirements/agent/AG-05-retainer-and-agreements_v2.1_2026-10-27.md:842`: "AG-5-68 — A client declines"
* **AG-5-39**, `02-functional-requirements/agent/AG-05-retainer-and-agreements_v2.1_2026-10-27.md:925`: "AG-5-39 — Signed offline"
* **AG-5-65**, `02-functional-requirements/agent/AG-05-retainer-and-agreements_v2.1_2026-10-27.md:765`: "AG-5-65 — Edit a sent retainer until it is signed; every version kept"
* **AG-5-37**, `02-functional-requirements/agent/AG-05-retainer-and-agreements_v2.1_2026-10-27.md:1016`: "AG-5-37, AG-5-38 — Signing events"
* Dropped from the BACKLOG sources (18): AG-5-4 (about retainer templates and clause locks); AG-5-7 (about retainer templates and clause locks); AG-5-8 (about merge fields); AG-5-9 (about merge fields); AG-5-20 (about signers, consent and evidence); AG-5-25 (about several client signers); AG-5-26 (about several client signers); AG-5-62 (about several client signers); AG-5-27 (about stored signature and countersign); AG-5-28 (about seal and certificate); and 8 more.
* Fit: matches: withdraw/re-issue (AG-5-34), dead link on withdrawal (AG-5-21), decline (AG-5-68), Signed offline (AG-5-39) moving the prospect via signing events (AG-5-37).

### R1.56 56 Client invoices, tax by province, government-fee line
Partial · journey test: no · BACKLOG chain, plus ids the reader added by search

* **AG-6-1**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:325`: "AG-6-1 – AG-6-8 — The invoice: lines, states, draft and issue"
* **AG-6-2**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:325`: "AG-6-1 – AG-6-8 — The invoice: lines, states, draft and issue"
* **AG-6-3**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:325`: "AG-6-1 – AG-6-8 — The invoice: lines, states, draft and issue"
* **AG-6-4**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:382`: "AG-6-4, AG-6-45 — Tax"
* **AG-6-5**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:353`: "AG-6-44 (with AG-6-5) — Numbering"
* **AG-6-6**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:325`: "AG-6-1 – AG-6-8 — The invoice: lines, states, draft and issue"
* **AG-6-7**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:325`: "AG-6-1 – AG-6-8 — The invoice: lines, states, draft and issue"
* **AG-6-8**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:325`: "AG-6-1 – AG-6-8 — The invoice: lines, states, draft and issue"
* **AG-6-45**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:382`: "AG-6-4, AG-6-45 — Tax"
* **AG-6-42**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:505`: "AG-6-42 — Invoicing on an unsigned retainer: a warning, not a block"
* **AG-6-44**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:353`: "AG-6-44 (with AG-6-5) — Numbering"
* **AG-6-46**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:411`: "AG-6-46 — Due date and currency"
* Dropped from the BACKLOG sources (17): AG-16-14 (In the snapshot it is about connecting the firm's payment account, not issuing invoices with tax); AG-6-19 (In the snapshot it is about recording a payment by hand, not issuing invoices with tax); AG-6-23 (In the snapshot it is about refunds, not issuing invoices with tax); AG-6-25 (In the snapshot it is about two currencies with totals per currency, not issuing invoices with tax); AG-6-28 (In the snapshot it is about money summary and client statement, not issuing invoices with tax); AG-6-30 (In the snapshot it is about fast bounded lists, not issuing invoices with tax); AG-6-31 (In the snapshot it is about exports per period, not issuing invoices with tax); AG-6-37 (In the snapshot it is about paging, audit and validation, not issuing invoices with tax); AG-6-48 (In the snapshot it is about cancel and credit notes, not issuing invoices with tax); AG-6-59 (In the snapshot it is about trust being asked once, not issuing invoices with tax); and 7 more.
* Fit: matches: invoice lines incl. GOVERNMENT_FEE kind (AG-6-1 to -8, range expanded), tax (AG-6-4/45), unsigned-retainer warning (AG-6-42); province tax table is CRA-sourced, not team.

### R1.57 57 Card payment of invoiced fees into the firm's operating account
Not built · journey test: no · BACKLOG chain, plus ids the reader added by search

* **AG-6-14**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:1026`: "AG-6-14, AG-6-15, AG-6-16, AG-6-17 — Card payments on the firm's own account"
* **AG-6-15**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:1026`: "AG-6-14, AG-6-15, AG-6-16, AG-6-17 — Card payments on the firm's own account"
* **AG-6-16**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:1026`: "AG-6-14, AG-6-15, AG-6-16, AG-6-17 — Card payments on the firm's own account"
* **AG-6-17**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:1026`: "AG-6-14, AG-6-15, AG-6-16, AG-6-17 — Card payments on the firm's own account"
* **AG-6-49**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:1200`: "AG-6-49 — A payment account is down"
* **AG-6-69**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:1104`: "AG-6-69 — Received into Trust or Operating; where invoice payments go"
* **AG-16-14**, `02-functional-requirements/agent/AG-16-firm-settings-and-integrations_v1.24_2026-10-25.md:881`: "**AG-16-14** *(changed v1.16 — A20, AG01-2, AG01-11).* The firm MAY connect **its payment account** through the provider's **hosted sign-up** (no keys typed), on **every plan**,"
* **AG-16-15**, `02-functional-requirements/agent/AG-16-firm-settings-and-integrations_v1.24_2026-10-25.md:882`: "**AG-16-15.** Each connection SHALL follow the lifecycle NotConnected → Pending → Connected → (Degraded) → Failed/Disconnected, and SHALL be **actively verified** on connect before reaching"
* **AG-16-16**, `02-functional-requirements/agent/AG-16-firm-settings-and-integrations_v1.24_2026-10-25.md:883`: "**AG-16-16** *(changed v1.18 — AG16-82; v1.16 — A7).* Connections SHALL be **health-monitored**; a degraded or failed rail SHALL record a `ConnectionHealthEvent`. When any firm connection"
* **AG-16-18**, `02-functional-requirements/agent/AG-16-firm-settings-and-integrations_v1.24_2026-10-25.md:887`: "**AG-16-18.** All connection **secrets** SHALL be **encrypted at rest** and **never returned to the client** (status and masked hint only). *(Changed v1.14: the old plain-text"
* Fit: matches: card payments on the firm's own account (AG-6-14-17), into operating (AG-6-69, added by search), account down (AG-6-49). AG-6-15, AG-16-15/16/18 from expanded ranges.

### R1.58 58 Trust or operating on every payment; per-client ledger; "to move" list
Partial · journey test: no

* **AG-6-69**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:1104`: "AG-6-69 — Received into Trust or Operating; where invoice payments go"
* **AG-6-59**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:569`: "AG-6-59 — Trust is asked once, just in time; trust off"
* **AG-6-60**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:598`: "AG-6-60 — Trust balance per case; pre-case money on the person or company"
* **AG-6-61**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:645`: "AG-6-61 — Deposit request"
* **AG-6-63**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:711`: "AG-6-63 (with AG-6-22) — Trust receipt and payment receipt, one series; Cleared"
* **AG-6-68**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:980`: "AG-6-68 — Pay from trust"
* **AG-6-73**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:1312`: "AG-6-73 — The To move list"
* **AG-6-19**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:1078`: "AG-6-19, AG-6-20, AG-6-43 — Recording a payment by hand"
* **AG-6-20**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:1078`: "AG-6-19, AG-6-20, AG-6-43 — Recording a payment by hand"
* **AG-6-43**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:1078`: "AG-6-19, AG-6-20, AG-6-43 — Recording a payment by hand"
* **AG-6-23**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:1387`: "AG-6-23 (with AG-6-18) — Refunds"
* **AG-6-74**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:1338`: "AG-6-74 — The monthly check"
* Dropped from the BACKLOG sources (7): AG-16-14 (In the snapshot it is about connecting the firm's payment account, not trust/operating handling or the ledger); AG-6-1 (In the snapshot it is about the invoice, not trust/operating handling or the ledger); AG-6-25 (In the snapshot it is about two currencies with totals per currency, not trust/operating handling or the ledger); AG-6-4 (In the snapshot it is about tax, not trust/operating handling or the ledger); AG-6-44 (In the snapshot it is about numbering, not trust/operating handling or the ledger); AG-6-46 (In the snapshot it is about due date and currency, not trust/operating handling or the ledger); AG-6-62 (In the snapshot it is about requesting payment, not trust/operating handling or the ledger).
* Fit: matches: trust or operating per receipt (AG-6-69), per-case trust balance (AG-6-60), pay from trust (AG-6-68), To move list (AG-6-73), hand payments and reversals (AG-6-19/20/43).

### R1.59 59 Money arithmetic
Works · journey test: yes, `tests/journeys/j_59.ts`

* **AG-6-1**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:325`: "AG-6-1 – AG-6-8 — The invoice: lines, states, draft and issue"
* **AG-6-4**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:382`: "AG-6-4, AG-6-45 — Tax"
* **AG-6-46**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:411`: "AG-6-46 — Due date and currency"
* Dropped from the BACKLOG sources (11): AG-16-14 (about the firm connecting its payment account (hosted sign-up), not money arithmetic); AG-6-19 (recording a payment by hand, not arithmetic); AG-6-44 (invoice and receipt numbering, not arithmetic); AG-6-59 (trust question asked once / trust off, not arithmetic); AG-6-60 (trust balance per case, not arithmetic); AG-6-61 (deposit request on signing, not arithmetic); AG-6-63 (receipts and Cleared, not arithmetic); AG-6-69 (received into Trust or Operating, not arithmetic); AG-6-48 (cancel and credit notes, not arithmetic); AG-6-23 (refunds, not arithmetic); and 1 more.
* Fit: matches: AG-6-1 rule 3 gives integer minor units and tax rounded per line then summed; AG-6-46 rules 3-5 one currency per case (CAD/USD); refusal of mixing is implied by rule 5, not worded as a refusal.

### R1.60 60 Deposit invoice prepared on signature
Not built · journey test: no · BACKLOG chain, plus ids the reader added by search

* **AG-6-61**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:645`: "AG-6-61 — Deposit request"
* **AG-6-32**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:1742`: "AG-6-32 — From a signed retainer to money"
* Dropped from the BACKLOG sources (9): AG-6-1 (the invoice card; AG-6-61 and AG-6-32 say no invoice is made at signing); AG-6-4 (tax, not the signing trigger); AG-6-19 (recording a payment by hand); AG-6-23 (refunds); AG-6-44 (numbering); AG-6-46 (due date and currency); AG-6-48 (credit notes); AG-6-63 (receipts); AG-6-71 (payment-detail blocks).
* Fit: different: team prepares a deposit REQUEST into trust (only when trust is Yes); AG-6-61 non-goal "No deposit invoice", AG-6-32 "No invoice is created". Once-only matches (AG-6-32 rule 2). AG-6-32 added by search.

### R1.61 61 Sign and pay by single-use link
Partial · journey test: no

* **AG-5-21**, `02-functional-requirements/agent/AG-05-retainer-and-agreements_v2.1_2026-10-27.md:471`: "AG-5-21 | A link becomes dead once its signer signs or declines, and when its version is replaced, withdrawn or expires. A forwarded link cannot"
* **AG-6-14**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:1026`: "AG-6-14, AG-6-15, AG-6-16, AG-6-17 — Card payments on the firm's own account"
* Dropped from the BACKLOG sources (16): AG-16-14 (connecting the firm payment account, not the link); AG-5-65 (editing a sent retainer, versions kept); AG-5-34 (withdraw, re-issue, delete a draft); AG-5-20 (signers, consent text and evidence); AG-5-25 (several client signers and order (card AG-5-62)); AG-5-26 (several client signers and order (card AG-5-62)); AG-5-62 (several client signers in any order, firm last); AG-5-28 (seal, audit, certificate); AG-5-31 (signed copy emailed); AG-5-37 (signing events); and 6 more.
* Fit: wider: team has a single-use signing link (AG-5-21) and a separate no-login pay link (AG-6-14 rule 3); no requirement found for one link that signs then pays.

### R1.62 62 Client login portal; progress stream with "last update"
Not built · journey test: no · BACKLOG chain, plus ids the reader added by search

* **AG-15-1**, `02-functional-requirements/agent/AG-15-client-portal-management_v1.15_2026-10-27.md:428`: "AG-15-1 *(NEW, firm endpoint):* Firm user with agent/portal:invite invites a client → sets portalStatus=PENDING_ACTIVATION, generates single-use activation token (~~short TTL~~ valid 7 days, BR-4 *(changed"
* **AG-15-3**, `02-functional-requirements/agent/AG-15-client-portal-management_v1.15_2026-10-27.md:430`: "AG-15-3 *(exists, client app):* Client activates by setting a password → portalStatus=ACTIVE, activation recorded. *(Client-facing; listed for the seam.)*"
* **AG-15-50**, `02-functional-requirements/agent/AG-15-client-portal-management_v1.15_2026-10-27.md:501`: "AG-15-50 *(NEW — CP1-D9):* Principal applicant only (Release 1). In Release 1 only the principal applicant SHALL be offered an invitation and a portal login,"
* **AG-15-54**, `02-functional-requirements/agent/AG-15-client-portal-management_v1.15_2026-10-27.md:509`: "AG-15-54 *(NEW — AG16-42; build card AG-15-54):* "Last update" date. The client SHALL see, on their case, the date the firm last told them something"
* **AG-10-73**, `02-functional-requirements/agent/AG-10-communication-hub_v1.26_2026-10-27.md:690`: "AG-10-73. *(AG16-42; changed v1.15 — AG16-59, AG16-75)* "Tell the client" on a letter task SHALL open a message pre-filled from the letter library with the"
* **BR-2**, `02-functional-requirements/agent/AG-15-client-portal-management_v1.15_2026-10-27.md:648`: "BR-2 (Record-level isolation — the cardinal rule). A client may read/write only rows belonging to their own clientCustomerId or organisationPartyId (for a seat-holder, the CORPORATE_SEAT"
* Dropped from the BACKLOG sources (18): AG-15-2 (resend invite (staff access management)); AG-15-4 (suspend access (staff access management)); AG-15-6 (revoke access (staff access management)); AG-15-7 (force logout (staff access management)); AG-15-8 (re-invite (staff access management)); AG-15-9 (staff view of access state); AG-15-28 (portal branding); AG-15-29 (firm-side record of client portal activity, not the progress shown to the client); AG-15-30 (staff engagement strip); AG-15-31 (firm-wide stalled-clients dashboard); and 8 more.
* Fit: narrower in places: "progress stream" not defined as a client view in the kept text; isolation by URL rests on AG-15 BR-2 (added by search). Otherwise matches.

### R1.63 63 Per-person checklist with status words; reject with reason
Works · journey test: no · all ids found by search (the BACKLOG chain gave none that fit)

* **AG-7-15**, `02-functional-requirements/agent/AG-07-case-core-and-delivery_v3.12_2026-10-28.md:2524`: "AG-7-15 — Document checklist (the Binder)"
* **AG-7-17**, `02-functional-requirements/agent/AG-07-case-core-and-delivery_v3.12_2026-10-28.md:2572`: "AG-7-17 — Request, upload, check, accept and Needs replacing"
* **AG-9-26**, `02-functional-requirements/agent/AG-09-document-management_v1.27_2026-10-27.md:742`: "AG-9-26 (C). (Build card below. Decisions: AG07-D1, AG19-D19, AG19-D71, AG19-D72.) A Document carries one status from {Needed, Received, Accepted, Needs replacing, Not needed} (§3.9). This"
* **AG-9-27**, `02-functional-requirements/agent/AG-09-document-management_v1.27_2026-10-27.md:743`: "AG-9-27 (E). Needs replacing requires a reason (before: Reject); the reason is surfaced to the client on re-request *(changed 18 Oct — AG07-D1)*."
* Fit: cannot judge fully: Done when only says "As C6.4". Search sources match a per-person checklist with AG-09 statuses and Needs replacing with a reason. BACKLOG gave no sources.

### R1.64 64 Upload that resumes after a dropped connection
Not built · journey test: no

* **NO SOURCE.** Rests on: P-502 (tus, an open standard) and P-559 in PF-F2; no team requirement for resumable upload found (searched resum/tus/chunked).
* Dropped from the BACKLOG sources (4): AG-9-1 (specifies a single short-lived pre-signed PUT direct to storage; says nothing of resuming (tus departs from it)); AG-9-3 (bulk upload with per-file progress, no resume); AG-9-4 (mobile camera capture uses the same path, no resume); SA-8-58 (upload size limits, not resume).
* Fit: no source for resume; "stored once" loosely echoes AG-9-31 (SHA-256 per part, dedup), not cited by the row.

### R1.65 65 Private storage in Canada: firm-prefixed keys, versions, encryption
Not built · journey test: no · BACKLOG chain, plus ids the reader added by search

* **AG-9-16**, `02-functional-requirements/agent/AG-09-document-management_v1.27_2026-10-27.md:724`: "AG-9-16 (E). Reads are ownership-gated (an owned row scoped to the tenant) and served via short-lived signed GET; no public bucket access."
* **AG-9-17**, `02-functional-requirements/agent/AG-09-document-management_v1.27_2026-10-27.md:725`: "AG-9-17 (N). Object keys are firm_id-prefixed (tenant path isolation)."
* **AG-9-18**, `02-functional-requirements/agent/AG-09-document-management_v1.27_2026-10-27.md:726`: "AG-9-18 (N). Objects are stored with SSE-KMS at rest; the rail enforces SSE on every PUT."
* **AG-9-19**, `02-functional-requirements/agent/AG-09-document-management_v1.27_2026-10-27.md:727`: "AG-9-19 (N). The storage rail is vendor/region-configurable (data-residency) behind a stable interface."
* **SA-8-6**, `02-functional-requirements/super-admin/SA-08-platform-integrations-and-infrastructure-rails_v2.13_2026-10-25.md:419`: "SA-8-6 *(changed v2.3)* File storage is Amazon S3 in Canada (Montréal), encrypted with automatically rotating keys (as built); set at deploy."
* **AG-9-5**, `02-functional-requirements/agent/AG-09-document-management_v1.27_2026-10-27.md:705`: "AG-9-5 (C). Every upload against an existing Document is kept (non-destructive); never an in-place overwrite. *(changed 22 Oct — AG19-D6)* An added file becomes a"
* Dropped from the BACKLOG sources (1): NFR5-14 (observability (OTel, Pino, Sentry), not storage).
* Fit: matches: Canada region (SA-8-6), firm prefix, SSE-KMS, ownership-gated reads; versions from AG-9-5 (added by search).

### R1.66 66 Virus scan; nothing served while scanning
Not built · journey test: no

* **AG-9-20**, `02-functional-requirements/agent/AG-09-document-management_v1.27_2026-10-27.md:730`: "AG-9-20 (N). Every upload is scanned asynchronously; the file is not servable while SCANNING."
* **AG-9-21**, `02-functional-requirements/agent/AG-09-document-management_v1.27_2026-10-27.md:731`: "AG-9-21 (N). Clean ⇒ Received; infected ⇒ the file is Quarantined (a file state: never served, portal re-request; the document keeps its status); scan error"
* **AG-9-55**, `02-functional-requirements/agent/AG-09-document-management_v1.27_2026-10-27.md:790`: "AG-9-55 (N). (Decisions: SA8-D2, SA8-X4, AG19-D53.) What people see during scanning: the client sees "Uploaded ✓" at once (portal); staff see "Checking for viruses…" until"
* **SA-8-36**, `02-functional-requirements/super-admin/SA-08-platform-integrations-and-infrastructure-rails_v2.13_2026-10-25.md:469`: "SA-8-36 *(SA8-D2)* Firm documents are virus-scanned before staff can open them; infected files are quarantined and the firm is told; if the scanner is unavailable,"
* **SA8-D2**, `02-functional-requirements/super-admin/SA-08-platform-integrations-and-infrastructure-rails_v2.13_2026-10-25.md:90`: "SA8-D2 | Virus scan first, always, plus allowed file types. Staff can open a file only after a clean scan (seconds); the client sees "Uploaded"
* Fit: matches: not servable while scanning; infected quarantined and firm told (SA-8-36). Done when does not mention scanner-down waiting.

### R1.67 67 File-type check
Works · journey test: yes, `tests/journeys/j_67.ts`

* **AG-9-2**, `02-functional-requirements/agent/AG-09-document-management_v1.27_2026-10-27.md:701`: "AG-9-2 (N). Allowed file types and a max size are validated server-side at slot-issue time; disallowed/oversize is rejected with a clear reason and nothing is"
* **AG-9-2a**, `02-functional-requirements/agent/AG-09-document-management_v1.27_2026-10-27.md:702`: "AG-9-2a (E). For fixed-type slots the PUT content-type is locked (e.g. application/pdf), preventing wrong-type/stored-XSS artifacts."
* **SA-8-37**, `02-functional-requirements/super-admin/SA-08-platform-integrations-and-infrastructure-rails_v2.13_2026-10-25.md:470`: "SA-8-37 *(SA8-D2; changed v2.5 — SA8-D27)* Uploads accept PDF, JPG, PNG, HEIC, Word, Excel, TIFF and ZIP files only."
* **SA8-D27**, `02-functional-requirements/super-admin/SA-08-platform-integrations-and-infrastructure-rails_v2.13_2026-10-25.md:125`: "SA8-D27 | Allowed upload types: PDF, JPG, PNG, HEIC, Word, Excel, TIFF and ZIP. A ZIP is unpacked and every file inside is virus-scanned and"
* **SA8-D2**, `02-functional-requirements/super-admin/SA-08-platform-integrations-and-infrastructure-rails_v2.13_2026-10-25.md:90`: "SA8-D2 | Virus scan first, always, plus allowed file types. Staff can open a file only after a clean scan (seconds); the client sees "Uploaded"
* Dropped from the BACKLOG sources (3): AG-9-54 (ZIP unpacking; P-607 refuses plain ZIP in R1, departing from it); SA-8-49 (ZIP unpacking; departed by P-607); SA-8-58 (size limits, not file type).
* Fit: wider: team text checks allowed types and locks content-type; content-vs-type sniffing and damaged-PDF refusal are not in it. ZIP accepted by team, refused by P-607.

### R1.68 68 Preview for staff review
Not built · journey test: no · all ids found by search (the BACKLOG chain gave none that fit)

* **AG-9-24**, `02-functional-requirements/agent/AG-09-document-management_v1.27_2026-10-27.md:738`: "AG-9-24 (E/C). In-app preview (PDF/image) via short-lived signed GET; every preview is access-audited."
* Fit: matches (source found by search; BACKLOG CS-D5 cites only map row 68). AG-9-24 also requires every preview access-audited.

### R1.69 69 Read log, fingerprint, keep-period reminder
Not built · journey test: no · BACKLOG chain, plus ids the reader added by search

* **BR-7**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:626`: "BR-7 (Hold beats deletion). *(changed v2.9; changed v2.10 — G-Q1, G-Q4, G-Q5)* Precedence is: legal hold > a firm's keep-period warning > a deletion request."
* **AG-9-31**, `02-functional-requirements/agent/AG-09-document-management_v1.27_2026-10-27.md:753`: "AG-9-31 (N). A content hash (SHA-256) is computed/stored per part *(changed 22 Oct — AG19-D6; was: per version)* (dedup + tamper-evidence); re-hash mismatch flags the"
* **AG-9-32**, `02-functional-requirements/agent/AG-09-document-management_v1.27_2026-10-27.md:754`: "AG-9-32 (N). Every read writes a DocumentAccessLog; every mutation writes an AuditLog."
* **AG-9-33**, `02-functional-requirements/agent/AG-09-document-management_v1.27_2026-10-27.md:757`: "AG-9-33 (N). A retention policy for the firm's country computes a disposal-eligible date from a clock-start event. *(changed v1.2 — AG17-D42: candidate data follows it,"
* Dropped from the BACKLOG sources (1): SA-11 (module name, not a requirement id (script matched an AG-17 table row)).
* Fit: matches: read log, SHA-256 per part, retention date; SA-11 BR-7 makes keep-period a reminder. AG-9 ids added by search. Weekly reminder cadence not in team text.

### R1.70 70 Expiry, translation and notarisation flags
Not built · journey test: no · BACKLOG chain, plus ids the reader added by search

* **AG-9-12**, `02-functional-requirements/agent/AG-09-document-management_v1.27_2026-10-27.md:716`: "AG-9-12 (N). Type metadata seeds expiry / translation-required / notarisation defaults and the bilingual label."
* **AG-9-29**, `02-functional-requirements/agent/AG-09-document-management_v1.27_2026-10-27.md:745`: "AG-9-29 (N). Translation and notarisation flags (not-required | required | provided, with detail) per document; expiry captured where the type needs it."
* **AG-9-64**, `02-functional-requirements/agent/AG-09-document-management_v1.27_2026-10-27.md:800`: "AG-9-64 (N). *(NEW 18 Oct — AG07-D26(8); build card AG-9-64)* A file's language SHALL be set when it is uploaded: staff pick it, or the"
* **AG07-D26(8)**, `02-functional-requirements/agent/AG-09-document-management_v1.27_2026-10-27.md:88`: "AG07-D26(8) | Document sub-requirements *(the product owner, 18 Oct)* | The document's language is set at upload (staff, or the Reader suggests when AI is"
* Fit: matches: expiry, translation and notarisation flags per document; AG-9-64 adds the translation line to the checklist automatically.

### R1.72 72 Case with applicants, representative, pinned release
Works · journey test: yes, `tests/journeys/j_72.ts` · all ids found by search (the BACKLOG chain gave none that fit)

* **AG-7-1**, `02-functional-requirements/agent/AG-07-case-core-and-delivery_v3.12_2026-10-28.md:1507`: "AG-7-1 — Create a case"
* **AG-7-4**, `02-functional-requirements/agent/AG-07-case-core-and-delivery_v3.12_2026-10-28.md:588`: "AG-7-4 — Applicants: one case, many people"
* **AG-7-104**, `02-functional-requirements/agent/AG-07-case-core-and-delivery_v3.12_2026-10-28.md:1813`: "AG-7-104 — Lead representative at case creation"
* **AG-7-56**, `02-functional-requirements/agent/AG-07-case-core-and-delivery_v3.12_2026-10-28.md:2182`: "AG-7-56 — Rules version per filing"
* **AG-2-47**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:4094`: "AG-2-47 — A prospect becomes a client, once (signature, Signed offline or Convert; Undo while empty)"
* Fit: matches (all found by search; FO-8 cites only P-560, P-558, P-559). Pinned release read as AG-7-56 rules version per filing, moved only by a click.

### R1.73 73 Stages moved by events
Works · journey test: no · all ids found by search (the BACKLOG chain gave none that fit)

* **AG-7-11**, `02-functional-requirements/agent/AG-07-case-core-and-delivery_v3.12_2026-10-28.md:2290`: "AG-7-11 — The stage is computed"
* **AG-7-12**, `02-functional-requirements/agent/AG-07-case-core-and-delivery_v3.12_2026-10-28.md:2326`: "AG-7-12 — Some stages are reached only by an event"
* Fit: cannot judge fully: Done when only says "As C6.17" (multi-stage case per BACKLOG B139). Search sources match stages computed from work and events.

### R1.74 74 Government deadlines that remind; working days with holidays
Partial · journey test: yes, `tests/journeys/j_74.ts` · all ids found by search (the BACKLOG chain gave none that fit)

* **AG-7-96**, `02-functional-requirements/agent/AG-07-case-core-and-delivery_v3.12_2026-10-28.md:3777`: "AG-7-96 — Government deadline: set by rule, confirmed by the case officer, and its government step"
* **AG-7-94**, `02-functional-requirements/agent/AG-07-case-core-and-delivery_v3.12_2026-10-28.md:3649`: "AG-7-94 — Government dates are calendar dates; reminders move earlier"
* Dropped from the BACKLOG sources (4): AG-7-10 (stage labels and government steps are pack data, not deadline calculation or reminders); AG-7-33 (recording a decision, not deadlines); AG-7-35 (the case team roles, not deadlines); QA-471 (a qa id, not a requirement).
* Fit: different: team deadline is a calendar date (anchor + N calendar days, AG-7-96 r2) that never moves; only reminders count back in working days over closed days (AG-7-94). Sources found by search.

### R1.75 75 Tasks: My Tasks, Unassigned, handover
Not built · journey test: no · BACKLOG chain, plus ids the reader added by search

* **AG-13-5**, `02-functional-requirements/agent/AG-13-tasks-reminders-notes-and-activity-audit_v1.19_2026-10-27.md:449`: "AG-13-5 *(exists, changed)* My Tasks queue: tasks assigned-to-me and assigned-by-me; filter by status/priority/due-window/entity; sort by urgency; overdue is a derived flag in firm TZ. Never"
* **AG-13-62**, `02-functional-requirements/agent/AG-13-tasks-reminders-notes-and-activity-audit_v1.19_2026-10-27.md:496`: "AG-13-62 *(NEW)* Unassigned task list / filter. The system SHALL provide an Unassigned filter/list of open tasks with no assignee, visible to holders of agent/task:view.all"
* **AG-13-63**, `02-functional-requirements/agent/AG-13-tasks-reminders-notes-and-activity-audit_v1.19_2026-10-27.md:497`: "AG-13-63 *(NEW)* Task handover. The AG-01 deactivation prompt (AG1-D5) SHALL list the person's open tasks (only owned, dated LMIA work lives in tasks (AG17-D10); in-file"
* **AG-13-2**, `02-functional-requirements/agent/AG-13-tasks-reminders-notes-and-activity-audit_v1.19_2026-10-27.md:446`: "AG-13-2 *(exists, changed)* *(changed 18 Oct — AG01-29(3))* Assign/reassign a Task to a same-firm active user (a deactivated or suspended user is never offered); fire"
* **BR-19**, `02-functional-requirements/agent/AG-13-tasks-reminders-notes-and-activity-audit_v1.19_2026-10-27.md:616`: "BR-19 (Assignee is optional; never a deactivated or suspended user) *(changed 18 Oct — AG01-29(3))*. A task may exist with no assignee and is then"
* **AG-7-36**, `02-functional-requirements/agent/AG-07-case-core-and-delivery_v3.12_2026-10-28.md:1953`: "AG-7-36 — Queues and workload"
* **AG-7-106**, `02-functional-requirements/agent/AG-07-case-core-and-delivery_v3.12_2026-10-28.md:1923`: "AG-7-106 — "Take it" on an unassigned case"
* **AG-7-43**, `02-functional-requirements/agent/AG-07-case-core-and-delivery_v3.12_2026-10-28.md:2021`: "AG-7-43 — Hand all open work to one colleague"
* **AG17-D10**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:201`: "AG17-D10 | Only work with an owner and a due date goes to "My Tasks" (AG-13); small checklist ticks stay in the file; completing in"
* Dropped from the BACKLOG sources (15): AG-13-1 (creating a task (base), not the queues or handover); AG-13-8 (completing a task); AG-13-65 (tasks from dated case items); AG-13-66 (orphaned standard deadlines); AG-13-67 (visibility of tasks, notes); AG-7-35 (case team roles); AG-7-42 (a deactivated member leaves pools); AG-11-115 (the home screen); AG-13 (module name; script matched an AG-01 table row); AG-13 §6 (a section reference, not an id); and 5 more.
* Fit: matches: My Tasks, Unassigned list, task handover on deactivation; case-side Unassigned queue, Take it and hand-all-work.

### R1.76 76 Notes; one timeline per record
Not built · journey test: no

* **AG-13-20**, `02-functional-requirements/agent/AG-13-tasks-reminders-notes-and-activity-audit_v1.19_2026-10-27.md:464`: "AG-13-20 *(exists, changed)* Create a Note on any entity (polymorphic key); rich text (server-sanitised HTML) — today plain string."
* **AG-13-24**, `02-functional-requirements/agent/AG-13-tasks-reminders-notes-and-activity-audit_v1.19_2026-10-27.md:468`: "AG-13-24 *(exists, changed — security fix)* Edit/delete a Note is firm-scoped and author/admin-gated (today updateNote/deleteNote lack tenant scoping — IDOR fix); every edit/delete audited (before/after)."
* **AG-13-30**, `02-functional-requirements/agent/AG-13-tasks-reminders-notes-and-activity-audit_v1.19_2026-10-27.md:472`: "AG-13-30 *(NEW)* Unified per-entity timeline via read-time aggregation across typed sources (notes/tasks/reminders/calls/comms/documents/timer/stage-changes/audit-derived). *(changed v1.9 — SA6-D6(a): the aggregation returns an item only if the viewer"
* **AG-2-94**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:3025`: "AG-2-94 — Lead screen and prospect screen (one command centre)"
* Dropped from the BACKLOG sources (19): AG-13-21 (note visibility flag for the portal); AG-13-22 (@mentions); AG-13-23 (pin notes); AG-13-25 (unify legacy note controllers); AG-2-4 (add a lead by hand); AG-2-5 (website form); AG-2-8a (attribution); AG-2-13c (assign, reassign, Unassigned queue); AG-2-26 (stage guards); AG-2-37a (log a call); and 9 more.
* Fit: different on edits: Done when says add-only, but AG-13-24 allows firm-scoped edit/delete (audited, Recently deleted). Timelines and firm isolation match.

### R1.77 77 Submission number and UCI; decision, close, reopen
Works · journey test: yes, `tests/journeys/j_77.ts` · BACKLOG chain, plus ids the reader added by search

* **AG-7-33**, `02-functional-requirements/agent/AG-07-case-core-and-delivery_v3.12_2026-10-28.md:3892`: "AG-7-33 — Record a decision"
* **AG-7-50**, `02-functional-requirements/agent/AG-07-case-core-and-delivery_v3.12_2026-10-28.md:4005`: "AG-7-50 — Withdraw"
* **AG-7-34**, `02-functional-requirements/agent/AG-07-case-core-and-delivery_v3.12_2026-10-28.md:3968`: "AG-7-34 — Close a case"
* **AG-7-13**, `02-functional-requirements/agent/AG-07-case-core-and-delivery_v3.12_2026-10-28.md:4080`: "AG-7-13 — Reopen a closed case"
* **BR-10**, `02-functional-requirements/agent/AG-07-case-core-and-delivery_v3.12_2026-10-28.md:4936`: "BR-10 Submit and decision are distinct authorities"
* **BR-15**, `02-functional-requirements/agent/AG-07-case-core-and-delivery_v3.12_2026-10-28.md:4981`: "BR-15 Reopen a closed case"
* **AG-7-31**, `02-functional-requirements/agent/AG-07-case-core-and-delivery_v3.12_2026-10-28.md:3553`: "AG-7-31 — Record the submission"
* **AG-7-95**, `02-functional-requirements/agent/AG-07-case-core-and-delivery_v3.12_2026-10-28.md:3686`: "AG-7-95 — Application numbers, UCI and provincial file numbers"
* Dropped from the BACKLOG sources (4): SA-3-4 (plan limits, not case decisions); SA-3-47 (what counts as an active case for plan limits, not the actions); BK-17 (a BACKLOG row with no requirement text); QA-474 (a qa id, not a requirement).
* Fit: matches: submission (AG-7-31) and UCI (AG-7-95) added by search; decision, withdraw, close, reopen with reason and audit.

### R1.79 79 Firm dashboards and reports
Not built · journey test: no · BACKLOG chain, plus ids the reader added by search

* **AG-14-1**, `02-functional-requirements/agent/AG-14-reporting-and-analytics_v1.14_2026-10-25.md:415`: "AG-14-1. The Reporter SHALL read from operational-module aggregates and SHALL NOT write to operational tables; reporting is a strict read/aggregate layer."
* **AG-14-4**, `02-functional-requirements/agent/AG-14-reporting-and-analytics_v1.14_2026-10-25.md:418`: "AG-14-4. Metrics SHALL be declared as MetricDefinition data (source rollup, aggregation, money treatment, drill target); adding a metric/dashboard tile is configuration, not bespoke controller code."
* **AG-14-5**, `02-functional-requirements/agent/AG-14-reporting-and-analytics_v1.14_2026-10-25.md:422`: "AG-14-5. The Reporter SHALL show the lead and funnel numbers of AG-2-87: leads added, leads by source and by ad campaign, unassigned leads waiting, stage"
* **AG-14-7**, `02-functional-requirements/agent/AG-14-reporting-and-analytics_v1.14_2026-10-25.md:424`: "AG-14-7. The Reporter SHALL show the per-person table of AG-2-87 rule 13 (leads and prospects owned, prospects engaged and won, calls logged and connected, pipeline"
* **AG-14-9**, `02-functional-requirements/agent/AG-14-reporting-and-analytics_v1.14_2026-10-25.md:429`: "AG-14-9. The Reporter SHALL provide case load by status/stage/service/program/office/officer, and new-vs-closed trend (country is a firm-wide constant, FD-68). *(changed 25 Oct — MS-D16(6))* "Service" is"
* **AG-14-10**, `02-functional-requirements/agent/AG-14-reporting-and-analytics_v1.14_2026-10-25.md:430`: "AG-14-10. The Reporter SHALL provide stage durations (avg/median per delivery stage) with the slowest stage flagged."
* **AG-14-12**, `02-functional-requirements/agent/AG-14-reporting-and-analytics_v1.14_2026-10-25.md:432`: "AG-14-12. The Reporter SHALL provide deficiency (count, rate, time-to-cure) and SLA-breach metrics by stage/officer, and processing-time (end-to-end and per-segment) with cohort comparison."
* **AG-14-13**, `02-functional-requirements/agent/AG-14-reporting-and-analytics_v1.14_2026-10-25.md:435`: "AG-14-13. *(changed 25 Oct — MS-D20(15), MS-D16(6))* The Reporter SHALL provide fees billed and fees collected by period and by service/program/office, trended. Fees collected SHALL"
* **AG-14-14**, `02-functional-requirements/agent/AG-14-reporting-and-analytics_v1.14_2026-10-25.md:436`: "AG-14-14. *(changed 25 Oct — MS-D21(9))* The Reporter SHALL provide overdue ageing (current / 1–30 / 31–60 / 61–90 / 90+ days past the due"
* **AG-14-15**, `02-functional-requirements/agent/AG-14-reporting-and-analytics_v1.14_2026-10-25.md:437`: "AG-14-15. *(changed 22 Oct — AG04-D20, R18)* All financial figures SHALL be shown as one total per currency, for example "Collected this month: CAD 42,000"
* **AG-14-18**, `02-functional-requirements/agent/AG-14-reporting-and-analytics_v1.14_2026-10-25.md:450`: "AG-14-18. The system SHALL ship seeded role-default dashboards (Owner, Case Manager, Rep, Case Officer, Billing / Finance, Compliance) *(role names changed v1.8 — SA6-D5)* as"
* **AG-14-19**, `02-functional-requirements/agent/AG-14-reporting-and-analytics_v1.14_2026-10-25.md:451`: "AG-14-19. Each dashboard SHALL be scoped by the viewer's record-level permission server-side (view.own → own records only; view.all → firm), rendering the *same* widgets at"
* **AG-14-20**, `02-functional-requirements/agent/AG-14-reporting-and-analytics_v1.14_2026-10-25.md:452`: "AG-14-20. A shared filter bar (date range, rep/officer/team, office, service/program, source/campaign, status/stage, client type (Individual / Corporate) — no country facet, FD-68) SHALL re-query aggregates/cache,"
* **AG-14-22**, `02-functional-requirements/agent/AG-14-reporting-and-analytics_v1.14_2026-10-25.md:454`: "AG-14-22. Every metric/segment/row SHALL be drill-through to the underlying operational list/detail, carrying the exact filter; the target module SHALL re-enforce its own permission + firm_id"
* **AG-14-27**, `02-functional-requirements/agent/AG-14-reporting-and-analytics_v1.14_2026-10-25.md:465`: "AG-14-27. *(changed 22 Oct — AG04-D20, R18)* Every money figure SHALL be shown as one total per currency, never summed across currencies and never converted"
* **AG-14-28**, `02-functional-requirements/agent/AG-14-reporting-and-analytics_v1.14_2026-10-25.md:468`: "AG-14-28. Every read/list/dashboard/export SHALL be paginated/streamed and firm_id-scoped under RLS; no endpoint SHALL return an unbounded set."
* **AG-14-31**, `02-functional-requirements/agent/AG-14-reporting-and-analytics_v1.14_2026-10-25.md:480`: "AG-14-31. For any selected period, per-rep reports, the per-person table and rep filters SHALL include every user who had activity in that period, with deactivated"
* **AG-14-33**, `02-functional-requirements/agent/AG-14-reporting-and-analytics_v1.14_2026-10-25.md:474`: "AG-14-33. Every dashboard and report SHALL offer a client-type segmenter (Individual / Corporate) alongside rep, program, office and source; each rollup carries the file's client"
* **AG-14-36**, `02-functional-requirements/agent/AG-14-reporting-and-analytics_v1.14_2026-10-25.md:438`: "AG-14-36 *(new 25 Oct — MS-D20(15), MS-D11(4))* Trust received apart from fees. The financial dashboard SHALL show Trust received as its own figure, apart from"
* **AG-14-37**, `02-functional-requirements/agent/AG-14-reporting-and-analytics_v1.14_2026-10-25.md:439`: "AG-14-37 *(new 25 Oct — MS-D21(9))* Tax collected report. The Reporter SHALL provide a report Tax collected: for a chosen period, the tax charged on"
* **AG-13-68**, `02-functional-requirements/agent/AG-13-tasks-reminders-notes-and-activity-audit_v1.19_2026-10-27.md:507`: "AG-13-68 *(new v1.13 — AG16-22; changed v1.14 — AG16-29)* "Overdue by person". The team view SHALL list overdue tasks grouped by assignee, for users who"
* **AG-2-87**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:4259`: "AG-2-87 — What AG-02 gives the dashboard: metric definitions"
* Dropped from the BACKLOG sources (6): AG-14-21 (saved named views, beyond this Done when); AG-14-25 (CSV/XLSX export, beyond this Done when); AG-14-26 (export scoping, beyond this Done when); AG-14-29 (audit of exports and schedules); AG-14-30 (input schema validation); AG-6-29 (a pointer card to AG-14, no requirement text).
* Fit: narrower: Done when covers dashboards read from records within rights (AG-14-1, -19); the team adds exports, saved views and schedules not named here.

### R1.80 80 IRCC forms per applicant from one set of answers
Works · journey test: no · all ids found by search (the BACKLOG chain gave none that fit)

* **AG-7-21**, `02-functional-requirements/agent/AG-07-case-core-and-delivery_v3.12_2026-10-28.md:2723`: "AG-7-21 — The form set and its status"
* **AG-7-22**, `02-functional-requirements/agent/AG-07-case-core-and-delivery_v3.12_2026-10-28.md:2771`: "AG-7-22 — Fill a form from the answers"
* **AG-7-109**, `02-functional-requirements/agent/AG-07-case-core-and-delivery_v3.12_2026-10-28.md:2874`: "AG-7-109 — Fill a government form in the viewer"
* Dropped from the BACKLOG sources (5): BK-10 (a BACKLOG row, no requirement text); BK-16 (a BACKLOG row, no requirement text); BK-22 (a BACKLOG row, no requirement text); BK-24 (a BACKLOG row, no requirement text); QA-383 (a qa id, not a requirement).
* Fit: matches (found by search): fill from answers entered once, form set per filing, form viewer whose own Validate runs before approval. Barcode match not in this text.

### R1.82 82 Readiness check; staff approval per form
Works · journey test: no · all ids found by search (the BACKLOG chain gave none that fit)

* **AG-7-24**, `02-functional-requirements/agent/AG-07-case-core-and-delivery_v3.12_2026-10-28.md:3045`: "AG-7-24 — Form readiness"
* **AG-7-27**, `02-functional-requirements/agent/AG-07-case-core-and-delivery_v3.12_2026-10-28.md:3358`: "AG-7-27 — Readiness state and score"
* **AG-7-29**, `02-functional-requirements/agent/AG-07-case-core-and-delivery_v3.12_2026-10-28.md:3506`: "AG-7-29 — Internal review workflow"
* **AG-7-66**, `02-functional-requirements/agent/AG-07-case-core-and-delivery_v3.12_2026-10-28.md:3110`: "AG-7-66 — The form approval record and "self-approved""
* **SA-1B-221**, `02-functional-requirements/super-admin/SA-01B-content-pack-configurator_v2.1_2026-10-27.md:3647`: "SA-1B-221 — Review items per programme"
* Fit: cannot judge fully: Done when only says "As C7.6, C7.10, C8.3". Search sources match readiness per form and filing, review and a form approval record.

### R1.83 83 Conditional questions and fields
Works · journey test: no · all ids found by search (the BACKLOG chain gave none that fit)

* **AG-8-5**, `02-functional-requirements/agent/AG-08-smart-questionnaire_v1.15_2026-10-27.md:411`: "AG-8-5. Each question/section SHALL support condition rules (set in the pack, SA-1B-14, SA-1B-57; *changed 25 Oct — W-17*) controlling visibility and requiredness, evaluable over earlier"
* **AG-8-6**, `02-functional-requirements/agent/AG-08-smart-questionnaire_v1.15_2026-10-27.md:412`: "AG-8-6. Conditional rules SHALL be evaluated client-side (live) and re-evaluated server-side at save/submit; a conditionally-required field SHALL be enforced on the server (client cannot bypass)."
* **AG-8-8**, `02-functional-requirements/agent/AG-08-smart-questionnaire_v1.15_2026-10-27.md:414`: "AG-8-8. A question hidden by a condition SHALL be not required and excluded from mapping; its prior answer SHALL be retained (restored if re-shown), never"
* **SA-1B-14**, `02-functional-requirements/super-admin/SA-01B-content-pack-configurator_v2.1_2026-10-27.md:1209`: "SA-1B-14 — Section rules"
* **SA-1B-111**, `02-functional-requirements/super-admin/SA-01B-content-pack-configurator_v2.1_2026-10-27.md:636`: "SA-1B-111 — Publishing blocks a condition that reads a later question or itself"
* Fit: cannot judge fully: Done when only says "As C4.4". Search sources match condition rules for visibility and requiredness.

### R1.84 84 Pathway set-up: hierarchy, versioned releases, cited rules
Works · journey test: no · all ids found by search (the BACKLOG chain gave none that fit)

* **SA-1B-50**, `02-functional-requirements/super-admin/SA-01B-content-pack-configurator_v2.1_2026-10-27.md:3271`: "SA-1B-50 — Programme tree: four levels"
* **SA-1B-297**, `02-functional-requirements/super-admin/SA-01B-content-pack-configurator_v2.1_2026-10-27.md:471`: "SA-1B-297 — Two kinds of publish: correction or rule change"
* **SA-1B-38**, `02-functional-requirements/super-admin/SA-01B-content-pack-configurator_v2.1_2026-10-27.md:441`: "SA-1B-38 — Second person approves and publishes"
* **SA-1B-39**, `02-functional-requirements/super-admin/SA-01B-content-pack-configurator_v2.1_2026-10-27.md:232`: "SA-1B-39 — Source, date checked and next review on every item"
* Fit: cannot judge: Done when only says "As M2's rows (60/60 Works)". Search sources match tree, publishing versions with approval, and source/date per item.

### R1.85 85 Data-request register with legal hold
Partial · journey test: no

* **SA-11-27**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:496`: "SA-11-27. *(changed v2.9 — Q21, SA5-X37 (a))* Super Admin can view a register of data requests made to ExpatReady itself: requester, type (access / correction"
* **SA11-D4**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:80`: "SA11-D4 *(changed v2.10 — SR-Q2)* | Data requests and incidents (Q21). A client's personal-data request is the firm's: handled in the firm's own tools (personal-data"
* **SA-11-18**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:478`: "SA-11-18. *(changed v2.9 — R13 code check: kept, built; changed v2.10 — G-Q5, R9-30)* A legal hold scoped to a firm, case, data category, or"
* **SA-11-28**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:497`: "SA-11-28. *(changed v2.9 — Q21, decision 11)* A deletion request to ExpatReady SHALL check legal holds before executing; where a hold prevents full deletion, the"
* **SA-11-16**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:476`: "SA-11-16. *(changed v2.10 — G-Q1; un-withdrawn in a narrow form; v2.9 had withdrawn it with the retention engine)* The built disposal job SHALL be ON,"
* **SA-11-34**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:506`: "SA-11-34. *(NEW v2.9 — R13 mock-screen decision; changed v2.10 — R9-28 – R9-30)* The compliance console SHALL be wired to the real backend for audit"
* **SA-11-40**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:512`: "SA-11-40. *(NEW 18 Oct — X-2)* Privacy requests work per person record. An export, an erasure and a legal hold SHALL each name one person"
* Dropped from the BACKLOG sources (3): NFR5-14 (observability, not data requests); SA11-D3 (keeping periods in three groups, not requests or holds); SA-11-24 (breach register).
* Fit: matches for requests made to ExpatReady itself (SA-11-27); clients’ requests are the firm’s (SA11-D4). Legal hold blocks deletion (SA-11-18, -28).

### R1.86 86 Breach register with firm notices
Not built · journey test: no

* **SA-11-24**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:490`: "SA-11-24. *(changed v2.9 — R13 plain record; changed v2.10 — SR-Q3, §13 Q16)* The Platform Owner can maintain a breach register (the Auditor reads it,"
* **SA-11-25**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:491`: "SA-11-25. *(changed v2.9 — Q21, SA5-X37 (b); changed v2.10 — SR-Q2, §13 Q2; replaces "notification to the regulator and affected individuals")* Where ExpatReady decides firms"
* **SA11-D8**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:84`: "SA11-D8 | Breach register is a plain record (R13). Discovery time, affected firms, data categories, cause, containment, notification decision, links to the notices sent. The"
* Dropped from the BACKLOG sources (5): SA-11-14 (log kept 7 years, retention not the register); SA-11-35 (firm-side breach backend kept with no screen); SA-11-18 (legal hold); SA-11-27 (data-request register); SA-11-34 (compliance console audit search and holds).
* Fit: matches: register with notification decision and notices recorded who/when; "assessment" is cause/containment/decision, the risk-of-harm engine is parked (SA11-D8).

### R1.87 87 Our access to a firm's data, logged and shown to the firm
Not built · journey test: no · BACKLOG chain, plus ids the reader added by search

* **SA-11-12**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:469`: "SA-11-12. Cross-tenant operations (any GLOBAL-plane read/action spanning >1 tenant, including the unscoped admin audit query) SHALL emit CROSS_TENANT_ACCESS naming operator and scope."
* **SA-11-11**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:468`: "SA-11-11. Impersonation SHALL emit IMPERSONATION_START/END (reason, firm, operator) and SHALL stamp every action during the session with the impersonator's identity + actorType = super_admin +"
* **BR-14**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:633`: "BR-14 (Cross-tenant access is self-logging). Any GLOBAL-plane operation spanning multiple tenants logs itself — including the audit query that produced the evidence."
* **SA-2-16**, `02-functional-requirements/super-admin/SA-02-tenant-firm-management_v2.24_2026-10-12.md:448`: "SA-2-16 *(changed v2.1 — SA2-D7)* A user with system/firm:impersonate can start a support session on a firm after a step-up check, with a mandatory reason"
* **SA-2-29**, `02-functional-requirements/super-admin/SA-02-tenant-firm-management_v2.24_2026-10-12.md:467`: "SA-2-29 *(SA2-D7a; changed v2.14 — SA7-X2 (d))* Every support session is shown in the firm owner's account history (support person, start and end time, duration,"
* **SA-2-19**, `02-functional-requirements/super-admin/SA-02-tenant-firm-management_v2.24_2026-10-12.md:451`: "SA-2-19 *(changed v2.24 — R9-pass ruling 3)* The Platform Owner and the Auditor (read-only) *(revised same day — SR-Q4(4))* can view all support sessions across"
* **SA-11-31**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:503`: "SA-11-31. *(changed v2.9 — R13)* Super Admin can run a per-firm access report (the audit list filtered to that firm's impersonations and cross-tenant operations; strictly"
* **SA-11-8**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:465`: "SA-11-8. *(changed v2.9 — R13; changed v2.10 — R9-28)* Super Admin can search the audit log. The screen opens on date range + firm +"
* **SA-11-3**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:460`: "SA-11-3. Audit entries SHALL be write-once: the application role writing audit entries holds INSERT only — no UPDATE or DELETE grant on the audit table."
* Dropped from the BACKLOG sources (12): SA-11-9 (CSV export of the audit list); SA-2-17 (what a support session blocks); SA-2-18 (session time limit); SA-2-28 (owner allows support to make changes); SA-2-30 (sessions in payment hold); SA-2-41 (session ends with staff session); AG-16-64 (firm toggle to allow support changes); AG-18-46 (staff run an import for a firm); AG-1-1 (firm/user model, generic); AG-1-3 (tenant-scoped mutations, generic); and 2 more.
* Fit: wider: firm sees support sessions (SA-2-29) but cross-firm reads are shown in a Super Admin report (SA-11-31), not to the firm. Write-once from SA-11-3 (added by search).

### R1.88 88 The firm reads its own audit log
Not built · journey test: no

* **AG-16-26**, `02-functional-requirements/agent/AG-16-firm-settings-and-integrations_v1.24_2026-10-25.md:901`: "The firm SHALL view its own AuditLog read-only, firm-wide for holders of agent/audit:read (Owner and Admin by default; SA6-D11)."
* **SA-6-33**, `02-functional-requirements/super-admin/SA-06-rbac_v3.15_2026-10-25.md:667`: "Firm audit log. Holders of agent/audit:read see the firm's whole audit log; the key is seeded on Owner and Admin."
* **AG-13-44**, `02-functional-requirements/agent/AG-13-tasks-reminders-notes-and-activity-audit_v1.19_2026-10-27.md:483`: "Two read planes: tenant-scoped (agent/audit:read; was agent/audit-log:list) and cross-tenant Super Admin (system/audit-log:list); diff-rendered, paginated."
* **AG-13-43**, `02-functional-requirements/agent/AG-13-tasks-reminders-notes-and-activity-audit_v1.19_2026-10-27.md:482`: "Export logged as an audit event (who/which data/which entity or list/when)."
* **AG-16-22**, `02-functional-requirements/agent/AG-16-firm-settings-and-integrations_v1.24_2026-10-25.md:894`: "Every export SHALL write an AuditLog entry (actor, scope, row count, timestamp)."
* **SA6-D11**, `02-functional-requirements/agent/AG-13-tasks-reminders-notes-and-activity-audit_v1.19_2026-10-27.md:93`: "The audit log is firm-wide for holders of agent/audit:read, seeded on Owner and Admin"
* Dropped from the BACKLOG sources (4): AG-13-31 (In the snapshot this is the activity TIMELINE cross-source pagination cursor, not the audit log viewer.); SA-2-29 (About support sessions shown in the owner's account history (R1.87 territory), not the firm's audit log viewer.); SA-11-30 (About Country Pack content change history on the staff side, not the firm audit log.); SA-11-34 (About the ExpatReady staff compliance console audit search and CSV export, not the firm reading its own log.).
* Fit: Narrower sources: firm-side ids give read-only Owner/Admin access and logged exports; filtering by person, record and date is not stated (SA-11-34 filters are staff-console only).

### R1.89 89 Public pricing page
Not built · journey test: no · BACKLOG chain, plus ids the reader added by search

* **SA-3-2**, `02-functional-requirements/super-admin/SA-03-subscription-plans-and-entitlements_v2.29_2026-10-25.md:581`: "A plan is PUBLIC (offered in self-serve sign-up) or INTERNAL (assignable only by Super Admin)."
* **SA-3-27**, `02-functional-requirements/super-admin/SA-03-subscription-plans-and-entitlements_v2.29_2026-10-25.md:624`: "Each plan has exactly one monthly and one yearly price, held by SA-4, in the single platform currency (CAD for Release 1)."
* **SA-3-46**, `02-functional-requirements/super-admin/SA-03-subscription-plans-and-entitlements_v2.29_2026-10-25.md:640`: "Each plan has trial days (whole number, 0 = no trial), edited like any plan setting"
* **SA-3-50**, `02-functional-requirements/super-admin/SA-03-subscription-plans-and-entitlements_v2.29_2026-10-25.md:649`: "Each feature has a key, the name shown on the pricing page and in upgrade prompts, a description, its owning module"
* Dropped from the BACKLOG sources (11): SA-4-4 (Says checkout is only through a private sign-up link and "There is no open public sign-up" - contradicts a public pricing/sign-up flow; P-566 departs from it.); SA-2-1 (Super Admin creating a firm, not a public pricing page.); SA-2-24 (Sign-up form, unique email, trial lifecycle and banner: R1.90 scope, not the pricing page.); SA-4-5 (Sign-up form, unique email, trial lifecycle and banner: R1.90 scope, not the pricing page.); SA-4-30 (Sign-up form, unique email, trial lifecycle and banner: R1.90 scope, not the pricing page.); SA-4-82 (Sign-up form, unique email, trial lifecycle and banner: R1.90 scope, not the pricing page.); SA-4-52 (Tax setup, firm billing screen and its permissions, trial-end hold, Owner-only actions: not the pricing page.); SA-4-54 (Tax setup, firm billing screen and its permissions, trial-end hold, Owner-only actions: not the pricing page.); SA-4-67 (Tax setup, firm billing screen and its permissions, trial-end hold, Owner-only actions: not the pricing page.); SA-4-79 (Tax setup, firm billing screen and its permissions, trial-end hold, Owner-only actions: not the pricing page.); and 1 more.
* Fit: Partial: team ids hold public plans, prices and trial days as data (SA-3-50 even names a pricing page) but no requirement defines the public page itself; that rests on P-566.

### R1.90 90 Self-serve sign-up, email check, trial with no card, private links, trial banners
Partial · journey test: no

* **SA-4-5**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:511`: "For a plan with trial days there is no card step and the firm is created when the form is submitted"
* **SA-4-30**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:548`: "A plan's trial days start the firm in Trial with full access and no card."
* **SA-3-46**, `02-functional-requirements/super-admin/SA-03-subscription-plans-and-entitlements_v2.29_2026-10-25.md:640`: "Each plan has trial days (whole number, 0 = no trial), edited like any plan setting"
* **SA-4-79**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:607`: "When a trial ends and no card is on file, the subscription goes to Payment hold that day"
* **SA-4-82**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:610`: "During a trial, the Owner and Admin see a trial banner on every page of the firm app showing the days left"
* **SA-2-22**, `02-functional-requirements/super-admin/SA-02-tenant-firm-management_v2.24_2026-10-12.md:460`: "The link is single-use, expires after 14 days, and can be revoked before use."
* **SA-4-4**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:510`: "Checkout is available only through a private sign-up link (SA-2-22) and offers only Active Public plans."
* **SA-4-8**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:516`: "Firm creation is exactly-once per sign-up link and per processor subscription"
* **SA-2-24**, `02-functional-requirements/super-admin/SA-02-tenant-firm-management_v2.24_2026-10-12.md:462`: "A firm's contact email (trimmed, lower-cased) must not be the contact email of any other firm"
* **SA-4-52**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:578`: "A firm cannot submit the sign-up form (plan with trial days) without a complete business address"
* Dropped from the BACKLOG sources (26): SA-2-1 (Super Admin creating a firm, not self-serve sign-up.); SA-2-4 (Firm status, payment hold, failed-charge timeline, deletion and processor events: not sign-up or trial start.); SA-2-6 (Firm status, payment hold, failed-charge timeline, deletion and processor events: not sign-up or trial start.); SA-2-7 (Firm status, payment hold, failed-charge timeline, deletion and processor events: not sign-up or trial start.); SA-2-21 (Firm status, payment hold, failed-charge timeline, deletion and processor events: not sign-up or trial start.); SA-3-19 (Firm status, payment hold, failed-charge timeline, deletion and processor events: not sign-up or trial start.); SA-4-11 (Firm status, payment hold, failed-charge timeline, deletion and processor events: not sign-up or trial start.); SA-4-20 (Firm status, payment hold, failed-charge timeline, deletion and processor events: not sign-up or trial start.); SA-4-21 (Firm status, payment hold, failed-charge timeline, deletion and processor events: not sign-up or trial start.); SA-4-22 (Firm status, payment hold, failed-charge timeline, deletion and processor events: not sign-up or trial start.); and 16 more.
* Fit: Different: SA-4-4 and SA-2-22 make a private single-use link the only way in, while P-566 makes sign-up self-serve; email confirmation by link is not stated in these ids.

### R1.91 91 Plans, change, cancel, invoices, card update, yearly plans, refunds, billing emails
Not built · journey test: no

* **SA-4-28**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:546`: "The Owner (not an Admin) can change plan in the billing screen among Active Public plans"
* **SA-4-56**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:582`: "During a trial the Owner may switch freely to any public plan: the change is immediate, nothing is charged and the trial end date stays"
* **SA-3-58**, `02-functional-requirements/super-admin/SA-03-subscription-plans-and-entitlements_v2.29_2026-10-25.md:661`: "SA-4 MUST NOT book a move to a lower plan, for the Owner or for Super Admin, while any conflict remains"
* **SA-4-54**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:580`: "The firm's Owner and Admin have a billing screen, always on and available in Trial, Active, Overdue and Payment hold"
* **SA-4-67**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:593`: "The server allows the Owner and Admin to update the card and to pay an overdue bill"
* **AG-1-65**, `02-functional-requirements/agent/AG-01-firm-setup-and-onboarding_v1.26_2026-10-25.md:591`: "Exactly six actions SHALL be Owner-only"
* **SA-4-11**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:521`: "Each firm has one current subscription with: plan, billing period, price, discount, status"
* **SA-4-35**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:555`: "At minimum these are handled: card accepted / checkout completed; subscription created, updated and ended; invoice created, paid, failed and voided"
* **SA-4-53**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:579`: "Billing emails go to two recipient sets."
* **SA-4-89**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:623`: "the billing emails (invoice and receipt, refund and credit note, price change notice, payment failed, payment reminder"
* **SA-4-55**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:581`: "A card-expiring notice is sent 30 days before the card on file expires."
* **SA-4-49**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:575`: "No refund is given for cancelling or downgrading."
* **SA-4-62**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:588`: "Every refund goes back to the original card through the processor and issues a credit note"
* **SA-4-91**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:625`: "When Super Admin switches a yearly firm to monthly under SA-4-74, the firm is sent a "Yearly to monthly" notice email"
* Dropped from the BACKLOG sources (22): SA-2-1 (Firm creation, sign-up link, trial start and banner: R1.90 scope, not plan change/cancel/invoices.); SA-2-22 (Firm creation, sign-up link, trial start and banner: R1.90 scope, not plan change/cancel/invoices.); SA-2-24 (Firm creation, sign-up link, trial start and banner: R1.90 scope, not plan change/cancel/invoices.); SA-3-46 (Firm creation, sign-up link, trial start and banner: R1.90 scope, not plan change/cancel/invoices.); SA-4-4 (Firm creation, sign-up link, trial start and banner: R1.90 scope, not plan change/cancel/invoices.); SA-4-5 (Firm creation, sign-up link, trial start and banner: R1.90 scope, not plan change/cancel/invoices.); SA-4-8 (Firm creation, sign-up link, trial start and banner: R1.90 scope, not plan change/cancel/invoices.); SA-4-30 (Firm creation, sign-up link, trial start and banner: R1.90 scope, not plan change/cancel/invoices.); SA-4-52 (Firm creation, sign-up link, trial start and banner: R1.90 scope, not plan change/cancel/invoices.); SA-4-79 (Firm creation, sign-up link, trial start and banner: R1.90 scope, not plan change/cancel/invoices.); and 12 more.
* Fit: Matches in scope; proration (SA-4-29), cancel (SA-4-31) and invoice viewing (SA-4-17) exist in SA-04 but are not cited by the BACKLOG rows. Refunds are staff-side (system/billing:refund).

### R1.92 92 Firm profile, offices and time zones, licence-number check
Partial · journey test: no

* **AG-1-34**, `02-functional-requirements/agent/AG-01-firm-setup-and-onboarding_v1.26_2026-10-25.md:622`: "The licence number SHALL be checked against the format the country pack holds for that licensing body"
* **AG1-D19**, `02-functional-requirements/agent/AG-01-firm-setup-and-onboarding_v1.26_2026-10-25.md:146`: "A licensed user is an active user whose own profile holds a licence record the firm entered"
* **AG-1-74**, `02-functional-requirements/agent/AG-01-firm-setup-and-onboarding_v1.26_2026-10-25.md:634`: "Each office SHALL have a time zone (Office.timezone, IANA)."
* **AG-16-68**, `02-functional-requirements/agent/AG-16-firm-settings-and-integrations_v1.24_2026-10-25.md:955`: "Advanced SHALL offer Offices → "Add an office" (hidden until a second office exists"
* **AG-16-59**, `02-functional-requirements/agent/AG-16-firm-settings-and-integrations_v1.24_2026-10-25.md:947`: "The firm SHALL have business hours (default Monday–Friday 9:00–17:00 in the firm's timezone, or in the office's time zone once a second office exists"
* Dropped from the BACKLOG sources (17): AG-16-10 (About notification switches and notification copy language, not profile or offices.); AG-16-11 (About notification switches and notification copy language, not profile or offices.); AG-16-63 (Support ticket "?" button: R1.93.); AG-1-69 (Multi-row invite form, not profile/offices/licence.); SA-3-39 (Plan limit modes, not firm profile.); SA-2-1 (billing/sign-up/payment-hold rule from PF-5/PF-5s/PF-16, not about this capability); SA-2-24 (billing/sign-up/payment-hold rule from PF-5/PF-5s/PF-16, not about this capability); SA-3-46 (billing/sign-up/payment-hold rule from PF-5/PF-5s/PF-16, not about this capability); SA-4-4 (billing/sign-up/payment-hold rule from PF-5/PF-5s/PF-16, not about this capability); SA-4-5 (billing/sign-up/payment-hold rule from PF-5/PF-5s/PF-16, not about this capability); and 7 more.
* Fit: Different on the licence: AG-1-34 says soft warning on mismatch, never a hard block; Done when refuses. Profile ids AG-1-4/AG-16-1 and AG-16-75 (office hours, zone) exist but are not cited.

### R1.93 93 Our team's console; health per firm; support button
Partial · journey test: no

* **SA-7-1**, `02-functional-requirements/super-admin/SA-07-platform-users_v2.17_2026-10-17.md:490`: "Staff accounts are a separate sign-in group from firm users and clients, with no firm_id."
* **SA-7-2**, `02-functional-requirements/super-admin/SA-07-platform-users_v2.17_2026-10-17.md:491`: "Staff sign in only through the staff console with email, password and second step."
* **SA-7-11**, `02-functional-requirements/super-admin/SA-07-platform-users_v2.17_2026-10-17.md:509`: "A staff member holds one or more roles; their permissions are the sum of their roles' system/ permissions"
* **SA-7-14**, `02-functional-requirements/super-admin/SA-07-platform-users_v2.17_2026-10-17.md:512`: "All system/ checks happen on the server; hiding a control is only a convenience."
* **SA-2-14**, `02-functional-requirements/super-admin/SA-02-tenant-firm-management_v2.24_2026-10-12.md:443`: "Per firm: status, plan, trial end, payment state, usage vs limit for each SA-3 metric, over-limit state, and last staff login."
* **SA-4-24**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:538`: "The Platform Owner and Billing see an overdue list of every firm Overdue or on Payment hold"
* **SA-7-10**, `02-functional-requirements/super-admin/SA-07-platform-users_v2.17_2026-10-17.md:505`: "Step-up is required before: starting a support session (one per start)"
* **SA-7-3**, `02-functional-requirements/super-admin/SA-07-platform-users_v2.17_2026-10-17.md:492`: "Every audit record of a staff action identifies the actor as Expat Ready staff from the sign-in group itself"
* **SA-7-20**, `02-functional-requirements/super-admin/SA-07-platform-users_v2.17_2026-10-17.md:527`: "Every staff action is written to the platform audit trail with the person, action, what it affected"
* **AG-16-63**, `02-functional-requirements/agent/AG-16-firm-settings-and-integrations_v1.24_2026-10-25.md:951`: "Every firm user SHALL be able to raise a support ticket from a "?" button on every screen"
* Dropped from the BACKLOG sources (8): SA-2-22 (Sign-up link and trial start: R1.90, not the console or health.); SA-2-23 (Sign-up link and trial start: R1.90, not the console or health.); SA-4-49 (Staff refund actions: R1.91 billing scope, not console health.); SA-4-50 (Staff refund actions: R1.91 billing scope, not console health.); SA-4-62 (Staff refund actions: R1.91 billing scope, not console health.); SA-4-80 (Trial extension by staff: trial scope (R1.90), not console health.); AG-16-10 (Notification switches per user, unrelated.); AG-16-68 (Offices, unrelated.).
* Fit: Narrower: SA-2-14 health has no failed-jobs measure; the ticket reaching our console is SA-10-1/SA-10-4, not cited; the line the firm sees rests on R1.87 (SA-2-29).

### R1.95 95 Custom fields and saved views
Not built · journey test: no

* **AG-2-23**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:2528`: "AG-2-23 — Filters and saved views"
* Dropped from the BACKLOG sources (2): AG-2-64 ("Who sees which leads and prospects" - a visibility rule, not custom fields or saved views.); AG-2-90 ("Message many: one message to a filtered list" - a bulk send, not custom fields or views.).
* Fit: Partial: AG-2-23 gives saved views (personal or firm) on lead/prospect lists only; custom fields have no team id - rest on Doc-1 line 137 (config-as-data, custom fields), ADR C1-2, P-570, P-584 (2).

### R1.96 96 Reversals, refunds, credit notes, payment plans, write-offs
Not built · journey test: no

* **AG-6-23**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:1387`: "AG-6-23 (with AG-6-18) — Refunds"
* **AG-6-48**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:455`: "AG-6-48 — Cancel and credit notes"
* **AG-6-75**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:1416`: "AG-6-75 — Reverse entry"
* **AG-6-76**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:1443`: "AG-6-76 — Write off a small balance"
* **AG-6-21**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:1153`: "AG-6-21 — Part payments, extra money and credit"
* Dropped from the BACKLOG sources (11): AG-6-1 (Invoice lines, states, draft and issue - not reversals.); AG-6-61 (Deposit request.); AG-6-46 (Due date and currency.); AG-6-19 (Recording a payment by hand.); AG-6-63 (Trust/payment receipt series and Cleared.); AG-6-71 (Two blocks of payment details.); AG-6-4 (Tax.); AG-6-44 (Numbering.); AG-6-28 (Statement and period exports: R1.111.); AG-6-31 (Statement and period exports: R1.111.); and 1 more.
* Fit: Wider: payment plans were withdrawn by the team (AG-06 v2.0 change log) and kept only by P-578; AG-6-75 lets trust go negative, P-607 (1) departs.

### R1.97 97 Tamper-evident audit chain
Not built · journey test: no

* **SA-11-4**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:461`: "Each entry SHALL be hash-chained: entryHash = SHA-256(prevHash ‖ canonicalSerialization(entry)), with a monotonic sequenceNo"
* **BR-2**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:621`: "Every entry links to the previous via prevHash/entryHash with a monotonic sequenceNo."
* **SA-11-6**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:463`: "A scheduled chain-verify job SHALL check the chain (incremental sweep every 30 minutes; weekly deep audit)"
* **SA-11-5**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:462`: "The chain head SHALL be anchored off-site to an immutable (WORM) store when it has advanced past the last anchor."
* **AG-13-42**, `02-functional-requirements/agent/AG-13-tasks-reminders-notes-and-activity-audit_v1.19_2026-10-27.md:481`: "Tamper-evident hash chain (rowHash = H(payload ‖ prevHash)) + periodic integrity verifier flagging broken links."
* **NFR5-08**, `01-techno-functional/02-Architecture-Decision-Record.md:467`: "INSERT-only DB grant + hash-chain + periodic WORM anchor (S3 Object Lock) + continuous chain-verify alarm + durable retry"
* Dropped from the BACKLOG sources (2): SA-11-14 (About the 7-year keep period of the activity log (R1.105), not the chain.); SA-11 (A module name, not a requirement id.).
* Fit: Matches; "daily export" and ca-central-1 are not in the sources (SA-11-5 anchors when the head advances).

### R1.98 98 Corporate clients, employers, LMIA
Partial · journey test: no

* **AG-2-52**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:2193`: "Individual and Corporate pipelines; 8 seeded stages"
* **AG-2-75**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:2335`: "Engage a lead (one click; Individual or Corporate)"
* **AG-2-77**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:2395`: "Employer: company record and contacts (one place for roles)"
* **AG-2-76**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:2438`: "Change the type before signing"
* **AG-2-79**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:1918`: "Company match, at Engage"
* **AG17-D6**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:197`: "Individual / Corporate views, not filters."
* **AG-17-2**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:792`: "The console SHALL offer an Individual / Corporate view toggle to every firm, since corporate is included in every plan"
* **AG-17-3**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:793`: "Employer-level data — legal name, operating name, business number, registered address and work locations — SHALL be stored once on"
* **AG-17-6**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:818`: "Code SHALL contain no immigration-specific terms, form numbers, streams or rule values; all such content SHALL come from the pack"
* **AG-17-7**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:821`: "Creating an LMIA file SHALL capture: employer (corporate client), work location (from the employer's locations), occupation (from the pack's occupation"
* **AG-17-8**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:822`: "On entry of location and wage, the system SHALL read the wage-threshold reference table for the location's province or territory"
* **AG-17-10**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:824`: "Where the pack's prevailing-wage table holds a value for the occupation and region, a wage below it SHALL raise a"
* **AG-17-11**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:825`: "For streams marked in the pack as subject to them, the system SHALL check the refusal-to-process table (location + occupation/sector"
* **AG-17-12**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:826`: "A file SHALL hold its positions (one per requested worker), each with a status (§6.B)."
* **AG-17-14**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:831`: "A corporate file SHALL present the corporate journey steps (AG17-D27): Set-up · Employer onboarding · Employer documents · Advertising &"
* **AG-17-15**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:832`: "A step SHALL appear on a file only if the file has at least one item in it."
* **AG-17-16**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:833`: "Each item SHALL be placed in a step: action lines by the step they carry (SA-01B Extension 2; the one"
* **AG-17-17**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:834`: "Each step SHALL show a status — not started · in progress · done · not applicable — where done"
* **AG-17-18**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:835`: "Before submission, the file's current step SHALL be the furthest step in which any item has started, counting only the"
* **AG-17-19**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:836`: "Each file SHALL show "What's next": open items needing action, the viewing user's own first, then the employer's, then others"
* **AG-17-22**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:842`: "Staff SHALL log each advertising channel: kind (from the pack's channel-kind answer list), where posted, start and end dates, link"
* **AG-17-23**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:843`: "Each required channel SHALL run for at least the stream's minimum number of consecutive days inside the advertising-rules table's window"
* **AG-17-26**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:846`: "The candidate log SHALL record per applicant: name, date received, channel, a residence status from the pack's residence-status slot (§3.1"
* **AG-17-36**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:860`: "Staff SHALL record the submission: date, application number, the submitted application copy downloaded from the government portal (uploaded as a"
* **AG-17-37**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:861`: "Staff SHALL be able to log officer contact (request for information or interview) with a response deadline, creating a dated"
* **AG-17-39**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:863`: "Staff SHALL record the decision: outcome (approved · refused), date, decision letter, and number of positions approved (≤ requested). Where"
* **AG-17-89**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:864`: "Staff SHALL be able to Withdraw a file at any time before the decision, including before submission, via agent/case:record-decision: a"
* **AG-17-40**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:865`: "On approval, a validity clock SHALL start with its length from the validity reference table, with reminders at pack-defined lead"
* **AG-17-41**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:867`: "On refusal, staff MAY record a root-cause category (pack answer list) and notes; it is optional, not required. "Re-apply" (after"
* **AG-17-42**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:868`: "The processing fee SHALL be a government fee (SA-1B-52) on a per-position basis, calculated in the case's Government fees section"
* **AG-17-43**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:871`: "A position SHALL accept a worker — an existing or new person record — named while still Requested (before filing)"
* **AG-17-44**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:872`: "Until the worker has an individual case, the position SHALL track dated milestones — work permit applied · approved ·"
* **AG-17-45**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:873`: ""Create work permit case" SHALL open an individual AG-07 case for the worker, linked to the position (case-to-case link), carrying"
* **AG-17-46**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:874`: "On linking, documents of shareable types (flag in SA-01B master documents) on the LMIA file SHALL be copied into the"
* **AG-17-47**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:875`: "The worker's case Bill to SHALL default to the worker, with the linked employer offered as a quick pick (AG17-D20)."
* **AG-17-50**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:878`: "A position whose worker has not applied for a permit SHALL raise a CRITICAL warning at the pack-defined lead time"
* **AG-17-51**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:879`: "Removing a worker from an Approved position SHALL return it to Approved (worker unassigned), keeping its history; a new worker"
* **AG-17-54**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:924`: "The LMIA board SHALL show one column per corporate journey step and each file as a card in its current"
* **AG-17-55**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:925`: "The board SHALL filter by: Mine, owner, employer, stream, step, has CRITICAL warnings, validity expiring, and show or hide the"
* **AG-17-57**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:927`: "The corporate panel set SHALL show, as panels of AG-07's one client screen for a corporate client (AG-07 §3.1, AG-7-86"
* **BR-1**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:945`: "A file holds one occupation and one location with one or more positions. A different occupation or location is a"
* **BR-4**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:948`: "Every government-set value — thresholds, durations, windows, channel mix, fee, validity, record-keeping period, lead times — is read from a"
* **BR-5**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:949`: "Every new LMIA file starts on the current pack version (including Re-apply and Change stream); a file in progress keeps"
* **BR-9**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:953`: "The decision records how many positions were approved; staff choose which specific positions are "Not approved" and cannot receive workers."
* **BR-10**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:954`: "Worker permit work happens in the worker's own individual case, linked to the position — never inside the corporate file"
* **BR-11**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:955`: "Only document types flagged shareable reach a linked worker case, as copies; later versions are offered with one click, never"
* **BR-14**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:958`: "An LMIA is one corporate case; a worker counts as an individual client, and their permit case as an individual"
* Dropped from the BACKLOG sources (1): AG-2-53 (A pointer card (the view never hides search, tasks or links), not the corporate prospect or employer record.).
* Fit: Done when is narrower: it checks the corporate prospect (AG-2-75/77) and carry-over (AG-17-3, AG-17-45, AG-17-57); the LMIA ids are built by the CS-98 rows, not tested here.

### R1.99 99 AI on top of the guardrails: proposed values, document reading
Works · journey test: no · all ids found by search (the BACKLOG chain gave none that fit)

* **AG-9-43**, `02-functional-requirements/agent/AG-09-document-management_v1.27_2026-10-27.md:771`: "For identity documents (including the passport MRZ), IRCC/government letters, language test results (IELTS, CELPIP, TEF and others) and ECA reports"
* **AG-9-45**, `02-functional-requirements/agent/AG-09-document-management_v1.27_2026-10-27.md:773`: "Extracted values SHALL be stored as PROPOSED and SHALL be offered in a review view showing the value, confidence and"
* **AG-9-46**, `02-functional-requirements/agent/AG-09-document-management_v1.27_2026-10-27.md:774`: "A field the Reader cannot read with enough confidence SHALL be recorded as unreadable / flagged and SHALL NOT be"
* **AG-8-41**, `02-functional-requirements/agent/AG-08-smart-questionnaire_v1.15_2026-10-27.md:467`: "Where the firm has AI enabled (the firm's one AI switch, which stays off until Super Admin has recorded the"
* Fit: Found by search (BACKLOG cites none; BK-14 rests on P-448, P-452). Matches proposed values and document reading; the row is judged on C3.1, C6.5, C7.5 results.

### R1.100 100 Recorded acceptance of our terms, privacy notice and data agreement
Works · journey test: yes, `tests/journeys/j_100.ts` · all ids found by search (the BACKLOG chain gave none that fit)

* **SA-4-65**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:591`: "A firm accepts the terms before its card is taken (sign-up link) or at the owner's first sign-in (Super-Admin-created firms); the acceptance is recorded"
* Dropped from the BACKLOG sources (25): SA-2-4 (PF-5 billing/sign-up/payment-hold rule; none is about recording acceptance of terms.); SA-2-6 (PF-5 billing/sign-up/payment-hold rule; none is about recording acceptance of terms.); SA-2-7 (PF-5 billing/sign-up/payment-hold rule; none is about recording acceptance of terms.); SA-2-21 (PF-5 billing/sign-up/payment-hold rule; none is about recording acceptance of terms.); SA-2-22 (PF-5 billing/sign-up/payment-hold rule; none is about recording acceptance of terms.); SA-2-24 (PF-5 billing/sign-up/payment-hold rule; none is about recording acceptance of terms.); SA-3-19 (PF-5 billing/sign-up/payment-hold rule; none is about recording acceptance of terms.); SA-3-46 (PF-5 billing/sign-up/payment-hold rule; none is about recording acceptance of terms.); SA-4-4 (PF-5 billing/sign-up/payment-hold rule; none is about recording acceptance of terms.); SA-4-8 (PF-5 billing/sign-up/payment-hold rule; none is about recording acceptance of terms.); and 15 more.
* Fit: Found by search. Narrower: SA-4-65 records terms acceptance (terms carry a data-processing clause); a separate privacy notice is not in it; re-asking on a new version is an SA-04 edge case, not an id.

### R1.101 101 Client answers and uploads through a secure link
Works · journey test: no · all ids found by search (the BACKLOG chain gave none that fit)

* **AG-8-13**, `02-functional-requirements/agent/AG-08-smart-questionnaire_v1.15_2026-10-27.md:423`: "Assigning SHALL (via Conductor/Mailer/Messenger) send the client a localised secure invitation (changed 5 Oct — AG11-D18(a): by email or WhatsApp"
* **AG-8-17**, `02-functional-requirements/agent/AG-08-smart-questionnaire_v1.15_2026-10-27.md:427`: "The public fill endpoint SHALL schema-validate every answer server-side against the question's declared type/validation/conditional-requiredness; invalid answers are rejected and not"
* **AG-9-7**, `02-functional-requirements/agent/AG-09-document-management_v1.27_2026-10-27.md:709`: "A public by-entity-code endpoint (the no-login link in the request email and its reminders — AG-10-85) lets the portal fetch"
* Fit: Found by search (BACKLOG cites none). Matches: secure questionnaire invitation, server-validated public fill, no-login upload link; Done when only points to C6.2, C6.16.

### R1.102 102 Find a person or case by name, email or file number
Partial · journey test: no

* **AG-7-75**, `02-functional-requirements/agent/AG-07-case-core-and-delivery_v3.12_2026-10-28.md:954`: "AG-7-75 — Client list"
* **AG-7-88**, `02-functional-requirements/agent/AG-07-case-core-and-delivery_v3.12_2026-10-28.md:858`: "AG-7-88 — Who sees which clients and cases"
* **AG-2-1**, `02-functional-requirements/agent/AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md:671`: "AG-2-1 — One person record; leads and prospects hang off it"
* **AG17-D6**, `02-functional-requirements/agent/AG-17-corporate-cases-and-lmia_v0.14_2026-10-27.md:197`: "The toggle changes the menu, dashboard and default list filter (with a visible, clearable chip); it never filters global search"
* Dropped from the BACKLOG sources (1): AG-02 (A module name, not a requirement id.).
* Fit: Narrower: AG-7-75 searches clients by name, code, email, phone within visibility (AG-7-88); case/file-number search and a firm-wide finder have no team card (map row 102, P-586).

### R1.104 104 Consultation agreement signed before the first consult
Not built · journey test: no · all ids found by search (the BACKLOG chain gave none that fit)

* **AG-4-15**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:733`: "AG-4-15 — Consultation agreement"
* **MS-D3**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:95`: "Consultation agreement on by default for first consults, free and paid."
* Dropped from the BACKLOG sources (23): AG-5-3 (AG-05 retainer signing (templates, merge fields, signers, seal, fees, declines); MS-D3 says the consultation agreement is accepted on AG-04 booking, not signed through AG-05.); AG-5-4 (AG-05 retainer signing (templates, merge fields, signers, seal, fees, declines); MS-D3 says the consultation agreement is accepted on AG-04 booking, not signed through AG-05.); AG-5-7 (AG-05 retainer signing (templates, merge fields, signers, seal, fees, declines); MS-D3 says the consultation agreement is accepted on AG-04 booking, not signed through AG-05.); AG-5-8 (AG-05 retainer signing (templates, merge fields, signers, seal, fees, declines); MS-D3 says the consultation agreement is accepted on AG-04 booking, not signed through AG-05.); AG-5-9 (AG-05 retainer signing (templates, merge fields, signers, seal, fees, declines); MS-D3 says the consultation agreement is accepted on AG-04 booking, not signed through AG-05.); AG-5-16 (AG-05 retainer signing (templates, merge fields, signers, seal, fees, declines); MS-D3 says the consultation agreement is accepted on AG-04 booking, not signed through AG-05.); AG-5-20 (AG-05 retainer signing (templates, merge fields, signers, seal, fees, declines); MS-D3 says the consultation agreement is accepted on AG-04 booking, not signed through AG-05.); AG-5-26 (AG-05 retainer signing (templates, merge fields, signers, seal, fees, declines); MS-D3 says the consultation agreement is accepted on AG-04 booking, not signed through AG-05.); AG-5-27 (AG-05 retainer signing (templates, merge fields, signers, seal, fees, declines); MS-D3 says the consultation agreement is accepted on AG-04 booking, not signed through AG-05.); AG-5-28 (AG-05 retainer signing (templates, merge fields, signers, seal, fees, declines); MS-D3 says the consultation agreement is accepted on AG-04 booking, not signed through AG-05.); and 13 more.
* Fit: Found by search. Different: AG-4-15 is an accept tick or link; for a staff-made booking "Not accepted yet" never blocks. Done when blocks until signed (P-564, P-627).

### R1.105 105 Keep periods; a leaving firm is closed, not deleted
Partial · journey test: no

* **SA-11-33**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:505`: "Keeping rules SHALL fall in three groups with three owners (3.4): firm data follows the firm's own setting "Keep closed client files for ___ years""
* **SA11-D3**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:79`: "Keeping rules in three groups (Q19, decision 11, rule 7)."
* **SA-11-14**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:474`: "The whole activity log SHALL be kept 7 years — one number"
* **BR-6**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:625`: "The activity log is kept 7 years (SA-11-14)."
* **BR-15**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:634`: "A firm's keep-period is set by the firm."
* **BR-7**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:626`: "Precedence is: legal hold > a firm's keep-period warning > a deletion request."
* **BR-8**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:627`: "the audit record that it happened (when, who, the reason entered inside a keep-period) survives the deleted data."
* **SA-11-18**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:478`: "A legal hold scoped to a firm, case, data category, or date range, with mandatory reason and owner, SHALL block deletion of in-scope data"
* **SA-11-16**, `02-functional-requirements/super-admin/SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:476`: "The built disposal job SHALL be ON, and SHALL run only on a firm's approved, window-elapsed "delete my data" request"
* **SA4-D18**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:74`: "Expat Ready's own billing records (invoices, credit notes, payments, billing address, tax numbers) are kept 6 years after the end of the fiscal year"
* **SA-2-7**, `02-functional-requirements/super-admin/SA-02-tenant-firm-management_v2.24_2026-10-12.md:430`: "A firm leaves through cancellation or non-payment → payment hold → deletion after 90 days"
* **SA-2-21**, `02-functional-requirements/super-admin/SA-02-tenant-firm-management_v2.24_2026-10-12.md:457`: "the firm's tenant data is permanently deleted from live systems and a deletion record is kept"
* **SA-2-37**, `02-functional-requirements/super-admin/SA-02-tenant-firm-management_v2.24_2026-10-12.md:475`: "When a security-locked account is closed, the owner is told they may request a full data export within the 90 days before deletion."
* **SA-2-38**, `02-functional-requirements/super-admin/SA-02-tenant-firm-management_v2.24_2026-10-12.md:476`: "each deletion warning and the data-download screen state only ExpatReady's own facts"
* **SA-2-34**, `02-functional-requirements/super-admin/SA-02-tenant-firm-management_v2.24_2026-10-12.md:472`: "can apply a security lock (reason required), lift it (reason required; firm returns to its prior state)"
* **SA-2-6**, `02-functional-requirements/super-admin/SA-02-tenant-firm-management_v2.24_2026-10-12.md:429`: "Payment hold: staff can log in but only the payment screens and the data download work"
* **SA-4-25**, `02-functional-requirements/super-admin/SA-04-saas-billing_v2.22_2026-10-17.md:541`: "On Payment hold, firm staff can use only the billing screen and the data download"
* **SA-3-19**, `02-functional-requirements/super-admin/SA-03-subscription-plans-and-entitlements_v2.29_2026-10-25.md:608`: "payment hold ⇒ only the Billing feature and the data download are available"
* Dropped from the BACKLOG sources (23): BR-1 (SA-11 BR-1 is append-only audit entries (R1.97), not keep periods.); SA-11-32 (A data-location statement, not keep periods or firm exit.); SA-11 (A module name, not a requirement id.); SA-2-4 (billing/sign-up/payment-hold rule from PF-5/PF-5s/PF-16, not about this capability); SA-2-22 (billing/sign-up/payment-hold rule from PF-5/PF-5s/PF-16, not about this capability); SA-2-24 (billing/sign-up/payment-hold rule from PF-5/PF-5s/PF-16, not about this capability); SA-3-46 (billing/sign-up/payment-hold rule from PF-5/PF-5s/PF-16, not about this capability); SA-4-4 (billing/sign-up/payment-hold rule from PF-5/PF-5s/PF-16, not about this capability); SA-4-8 (billing/sign-up/payment-hold rule from PF-5/PF-5s/PF-16, not about this capability); SA-4-11 (billing/sign-up/payment-hold rule from PF-5/PF-5s/PF-16, not about this capability); and 13 more.
* Fit: Different: SA-11-33 makes the firm keep period a reminder, not a lock (Done when refuses deletes); SA-2-21 permanently deletes tenant data after 90 days, against "closed, not deleted".

### R1.106 106 Pathway assessment AS-1: Express Entry and FSW scores
Partial · journey test: no · BACKLOG chain, plus ids the reader added by search

* **AG-3-1**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:359`: "The system SHALL model an Assessment as an immutable, version-stamped snapshot of running the Qualifier over an applicant profile at"
* **AG-3-2**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:360`: "The Qualifier's inputs SHALL be the person's canonical answers (Party) (AG-2/AG-8; X-2), not a separate evaluation-only store; edits made on"
* **AG-3-3**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:361`: "The set of inputs required for a useful answer SHALL be pack-driven (the active Country Pack declares which profile fields"
* **AG-3-4**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:362`: "The engine SHALL derive scoring inputs from facts (age from DOB; CLB from raw test scores via the shared conversion"
* **AG-3-5**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:365`: "The eligibility/scoring brain SHALL be supplied entirely by the active Country Pack version — program definitions, hard gates, score grids/weights"
* **AG-3-6**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:366`: "The engine SHALL load the active published pack version for the firm's one destinationCountry (FD-68); an unpublished/draft version SHALL NOT"
* **AG-3-7**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:367`: "A pack version SHALL be immutable once published; rule changes SHALL create a new version with its own id, effective"
* **AG-3-10**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:372`: "For each program/stream in the active pack, the engine SHALL return exactly one outcome from: LIKELY_ELIGIBLE, ELIGIBLE_BELOW_CUTOFF, POSSIBLY_ELIGIBLE (missing data)"
* **AG-3-11**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:373`: "The engine SHALL evaluate hard eligibility gates separately from competitiveness: gates are binary eligibility; the score is competitiveness among the"
* **AG-3-12**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:374`: "When a gate-deciding input is absent/insufficient to decide, the outcome SHALL be POSSIBLY_ELIGIBLE annotated with the specific missing input(s) —"
* **AG-3-14**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:376`: "For fixed-pass-mark programs, when gates pass: score ≥ passMark → LIKELY_ELIGIBLE; score < passMark → ELIGIBLE_BELOW_CUTOFF with the gap to"
* **AG-3-15**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:377`: "For draw-ranking programs, when gates pass, the outcome SHALL be LIKELY_ELIGIBLE banded by competitiveness against the pack's indicative draw-cutoff signal"
* **AG-3-17**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:381`: "Each program's score SHALL be computed by the evaluator from the pack's grid rule-set (point tables, caps, combination/with-spouse rules) —"
* **AG-3-18**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:382`: "The CLB language conversion mechanism SHALL be shared and reusable across programs; the conversion tables SHALL be pack reference data"
* **AG-3-19**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:383`: "The Canada pack SHALL provide, as rule-sets, at minimum: CRS (Express Entry, draw-ranking), FSW-67 (fixed pass), and the PNP streams"
* **AG-3-20**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:384`: "Every score computation SHALL emit a per-factor breakdown alongside the total as a first-class output."
* **AG-3-21**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:387`: "Each program result SHALL carry a structured, labelled breakdown (factor → points, with maxima and cap annotations) rendered as a"
* **AG-3-25**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:393`: "Every Assessment SHALL be stamped at creation with: Country Pack id + version, per-program rulesAsOf, the disclaimer text + locale"
* **AG-3-26**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:394`: "Given the stored input snapshot and the stamped pack version, the engine SHALL be able to re-derive the identical result"
* **AG-3-27**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:395`: "Provenance and disclaimer SHALL travel with the result wherever it is rendered (screen, export, portal, case carry-forward)."
* **AG-3-28**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:398`: "Re-running an assessment SHALL be explicit, SHALL create a new immutable Assessment, SHALL record the reason (profile changed / newer"
* **AG-3-32**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:404`: "Every result rendering SHALL display the regulator-safe no-guarantee disclaimer (per-locale, from the stamped pack version); the disclaimer SHALL NOT be"
* **AG-3-33**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:405`: "A consultant with the override permission SHALL be able to override a program's outcome with a mandatory documented reason; the"
* **AG-3-34**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:406`: "An Assessment MAY be marked reviewed/approved by a consultant (reviewer + timestamp + note); whether review is mandatory before client-share"
* **AG-3-35**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:407`: "Override and review actions SHALL be audited (actor, target, before/after)."
* **AG-3-36**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:410`: "The eligibility outcome SHALL be published to AG-2 as the verdict badge only, version-stamped and disclaimer-bearing, shown to staff on"
* **AG-3-37**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:411`: "On case.created (reading sourceProspectId), the chosen pathway + profile + assessment provenance SHALL carry forward into the SQR/case (AG-7/AG-8) with"
* **AG-3-39**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:415`: "The Qualifier SHALL be a deterministic pure function over (resolved inputs, pack version): identical inputs + version ⇒ identical outputs."
* **AG-3-40**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:416`: "Every read/list (assessment history, stale-assessments view) SHALL be paginated and tenant-scoped; no endpoint SHALL return an unbounded set."
* **BR-1**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:423`: "All programs, gates, grids, weights, pass marks, selection signals, recommendation levers, and disclaimer copy come from the active Country Pack"
* **BR-2**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:424`: "A real assessment uses the active, published pack version for the lead's destinationCountry; draft versions are never used for a"
* **BR-3**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:425`: "A published pack version is immutable; changes create a new version. Assessments reference the version that produced them and never"
* **BR-4**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:426`: "The Qualifier reads the person's canonical answers (Party) (fixed 18 Oct — X-2); there is no assessment-only data island, and"
* **BR-6**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:428`: "Hard gates determine eligibility (binary); the score determines competitiveness (graded). A score never overrides a failed gate; a passed gate"
* **BR-7**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:429`: "Absent gate-deciding inputs yield POSSIBLY_ELIGIBLE with the named missing field(s); the engine never marks NOT_ELIGIBLE on missing data."
* **BR-8**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:430`: "Every NOT_ELIGIBLE names the failed gate(s); every ELIGIBLE_BELOW_CUTOFF names the gap to pass; every POSSIBLY_ELIGIBLE names the missing input(s)."
* **BR-10**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:432`: "An Assessment is append-only; re-running creates a new Assessment and never overwrites a prior one. Provenance (pack id+version, rulesAsOf, disclaimer+locale"
* **BR-12**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:434`: "A consultant override is stored alongside, never instead of, the engine result, with a mandatory reason, version-stamp, and attribution; both"
* **BR-14**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:436`: "When the case is created (case.created) the chosen pathway + profile + provenance carry forward; only fields that actually exist"
* **AG02-D9(3)**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:24`: "The indicative result is staff only; the inquirer never sees it"
* Dropped from the BACKLOG sources (1): AG02-P77 (A review finding on how the assessment is keyed (prospect/contact vs person), not a requirement.).
* Fit: Done when is narrower than the kept ids (override, review, badge, carry-forward); AG-3-19 leaves exact grids to SME/founder, so values rest on official sources (P-170, P-577).

### R1.107 107 Pathway assessment AS-2: five provincial streams, client copy
Not built · journey test: no · BACKLOG chain, plus ids the reader added by search

* **AG-3-19**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:383`: "The Canada pack SHALL provide, as rule-sets, at minimum: CRS (Express Entry, draw-ranking), FSW-67 (fixed pass), and the PNP streams"
* **AG-3-11**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:373`: "The engine SHALL evaluate hard eligibility gates separately from competitiveness: gates are binary eligibility; the score is competitiveness among the"
* **AG-3-13**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:375`: "When all gate inputs are present and any gate fails, the outcome SHALL be NOT_ELIGIBLE annotated with the specific failed"
* **BR-6**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:428`: "Hard gates determine eligibility (binary); the score determines competitiveness (graded). A score never overrides a failed gate; a passed gate"
* **AG-3-38**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:412`: "A consultant SHALL be able to produce a client-facing assessment artifact (plain-language, per the client's locale, disclaimer- and provenance-stamped, post-override/post-review)"
* **AG-3-27**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:395`: "Provenance and disclaimer SHALL travel with the result wherever it is rendered (screen, export, portal, case carry-forward)."
* **AG-3-32**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:404`: "Every result rendering SHALL display the regulator-safe no-guarantee disclaimer (per-locale, from the stamped pack version); the disclaimer SHALL NOT be"
* **AG-3-34**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:406`: "An Assessment MAY be marked reviewed/approved by a consultant (reviewer + timestamp + note); whether review is mandatory before client-share"
* **AG-3-41**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:417`: "Sensitive actions (override, review, client-share/export, pinned re-run) SHALL be audited with actor, target, and before/after."
* **BR-11**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:433`: "No result is ever rendered — on screen, export, portal, or case — without the regulator-safe disclaimer in the result's"
* **BR-16**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:438`: "A client-facing artifact may require consultant review/sign-off before sharing (configurable; default SME/founder, §13); an unreviewed auto-assessment is not silently published"
* **BR-17**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:439`: "The disclaimer, factor labels, and client-facing artifact render in the correct locale (the client's language for client-facing; the user's for"
* **AG02-D9(3)**, `02-functional-requirements/agent/AG-03-pathway-assessment_v1.5_2026-10-21.md:24`: "The indicative result is staff only; the inquirer never sees it"
* Dropped from the BACKLOG sources (1): AG02-P78 (An open question (is the AG-3-38 client share Release 1 or 2?), not a requirement.).
* Fit: Matches in scope, but the team leaves the client copy (AG-3-38) open for Release 1 (AG02-P78); P-577 puts it in.

### R1.108 108 Conflict-of-interest check
Partial · journey test: yes, `tests/journeys/j_108.ts`

* **NO SOURCE.** Rests on: P-579 (founder: three regulatory capabilities no card lists) and College Code SOR/2022-128 s. 5, 15, 16, 24(3)(o), 35(1)(c) (Unconfirmed: no counsel). Snapshot has only "Conflict check" as a to-do item in the SA-05 file-opening task template (line 1580), not a requirement.
* Fit: No team requirement to compare; Done when rests on P-579 and the Code.

### R1.109 109 Complaints record
Works · journey test: yes, `tests/journeys/j_109.ts`

* **NO SOURCE.** Rests on: P-579, P-584 and College Code SOR/2022-128 s. 24(3)(r)(v), 29, 37 (Unconfirmed: no counsel). No complaints-record requirement in the snapshot.
* Fit: No team requirement to compare; Done when rests on P-579 and the Code.

### R1.110 110 Client identity check
Works · journey test: yes, `tests/journeys/j_110.ts`

* **NO SOURCE.** Rests on: P-579, P-735 (expired document refused as the firm's own rule) and College Code SOR/2022-128 s. 24(2)(a) (Unconfirmed: no counsel). No identity-check requirement in the snapshot (AG-05 non-goals: no identity check beyond the link).
* Fit: No team requirement to compare; Done when rests on P-579, P-735 and the Code.

### R1.111 111 Client statement and period exports for the accountant
Not built · journey test: no

* **AG-6-28**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:1649`: "AG-6-28 — Money summary and client statement"
* **AG-6-31**, `02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md:1691`: "AG-6-31 — Exports per period"
* **AG-14-39**, `02-functional-requirements/agent/AG-14-reporting-and-analytics_v1.14_2026-10-25.md:441`: "Exports of money records. One CSV each per period for invoices, payments, refunds, credit notes, write-offs and the trust ledger is AG-06's"
* Dropped from the BACKLOG sources (3): AG-6-12 (Payment reminders, not statements or exports.); AG-6-21 (Part payments and credit: R1.96.); AG-6-76 (Write-off: R1.96.).
* Fit: matches

### R1.112 112 Video meeting links on bookings
Not built · journey test: no

* **AG-4-29**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:1521`: "AG-4-29, AG-4-30 — The link comes from the host's chosen source; a pasted link always works"
* **AG-4-58**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:1555`: "AG-4-58 — Each person sets up their own video in My account"
* **AG-4-59**, `02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md:1585`: "AG-4-59 — Connecting your own calendar or Zoom needs no permission"
* **AG-16-73**, `02-functional-requirements/agent/AG-16-firm-settings-and-integrations_v1.24_2026-10-25.md:959`: "My account → Video SHALL hold "Connect Zoom" (optional, per person), "My meeting link" (one saved link)"
* Fit: matches
