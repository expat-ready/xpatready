# Parallel tracks to 29 Nov: 48 unproven Release 1 rows and RQ-01 to RQ-08 (24 Nov 2026)

Shaping lane, records only, no product code. Written for Lead 20 (`product/tools/current-lead.sh`, read 09:32 IST). Live AI off, US$0, no test run.
**Founder (A350, typed to Lead 19, 09:22 IST 24 Nov):** "we have to build inside 101, but we have to plan in such a way that it doesn't become blocker ... divide entire project in the kind of files when they don't share or bump into each other ... At least start making 10, 15 per days." He committed to 29 Nov.

**Measured on** `origin/main` cc349dcfe (24 Nov 09:2x IST). Sources: `qa/CAPABILITIES.md` (status of all 101), `MVP-CHECKLIST.md` §A (the parts of each row), `git log --first-parent -m` on main since 1 Nov (each merge's PR title and its files; merges over 120 files left out), the file lists of all 40 open PRs (`git diff merge-base..refs/pull/N/head`), `BACKLOG.md` Touch lines for parts not built yet.
**Duplicate check (P-526):** searched open PRs (titles and file lists: none touches a tracks or parallel plan), remote branch names (`track`, `parallel`: only the 22 Nov Track B and Mergify branches), and `design/`. Reused, not redone: `design/rq-rows-shape-2026-11-24.md` (RQ touch lists, waits, migration order, RQ-01's six PRs), `design/collision-map-two-tracks-2026-11-22.md` (areas, hot files of 22 Nov), the recovery plan `history/STATE-2026-11-24-0835-lead18-recovery-plan.md` on `lead/2026-11-07-lead31` (classes A to E: what stops each row).

## 1. What the measurement says (facts)
1. **53 Works, 23 Partial, 25 Not built** (CAPABILITIES, 101 rows). 48 left. From 09:30 IST 24 Nov to the end of 29 Nov is about 5.6 days: **8.6 proven per day needed.**
2. **Proven per day so far** (date of the Works verdict's main commit): 20 Nov 12, 21 Nov 15, 22 Nov 5, 23 Nov 4, 24 Nov 3 by 09:30. Lead 18's night gave one. The founder was shown "about 5".
3. **PRs are not the limit.** Main took 50, 53 and 34 app PRs on 21, 22 and 23 Nov, and 8 migrations on each day. 60 migration merges in 7 days: the one migration slot is not the bottleneck when PRs are green. What limits proof is (a) rows with 3 or more parts in a chain, (b) outside accounts, (c) qa's walks and fresh readers.
4. **Today's open PRs are already nearly file-disjoint.** Across the 40 open PRs the only shared app files are: the two stacks (#3234 → #3235, 9 files; #3277 → #3303, 9 files), and three single files (`tests/check_pf19r_every_sender.ts` #3033/#3184; `web/src/modules/front-office/sales/lead-page.tsx` #3184/#3193; `web/src/modules/platform/routes.tsx` #3193/#3202). Merged history shows where the next parts will collide (table 2).
5. **RQ-01 to RQ-08 have no R1 row of their own.** `grep RQ-0` in CAPABILITIES and MVP-CHECKLIST: 0 hits. Building them moves the proven count by nothing unless the Lead names the row they belong to (Question 1).

## 2. Shared hot files (merges touching each, 17 to 24 Nov, `git log --first-parent -m` on main)
Two kinds. **Same-function files** make the second PR wait: they are the real serial points. **Registry lines** (one appended line per part) only need a rebase: they never stop a lane, they cost a re-run.

| File | Merges in 7 days | Kind | Rows that edit it next |
|---|---|---|---|
| `prisma/migrations/` (one Mergify slot) | 60 | serial (one at a time) | every row with a migration (section 4) |
| `prisma/schema/*` | 44 | per area file; serial only inside one file | R1.3 CS-W2 (all 7 case-side files), RQ-05/07/08, RQ-01 (1) |
| `api/src/platform/firm-scope.ts` | 19 | registry line | every new walled table (R1.85, R1.35, R1.95, R1.34, R1.75) |
| `api/src/platform/identity/service.ts` | 12 | same function | R1.20, R1.5, R1.90, R1.62 |
| `api/src/front-office/booking/service.ts` | 12 | same function | R1.104, R1.43, R1.112 |
| `ports/events.ts` | 12 | registry line | most new events (split started: `ports/events/signing.ts`) |
| `web/src/modules/platform/routes.tsx`, `account-sections.ts` | 13, 12 | registry line | R1.45, R1.93, R1.85/86 screens, R1.95, R1.35 |
| `api/src/front-office/retainers/service.ts` | 10 | same function | R1.55, FO-5p (R1.45), R1.61 |
| `web/src/modules/front-office/routes.tsx` | 10 | registry line | R1.29, R1.36, R1.98, R1.106 |
| `tests/check_pf12_walls.ts`, `tests/check_csw3_firm_scope.ts` | 9, 7 | count and list in the test | any new table or case-side file (RQ-03/06/07/08) |
| `api/src/runtime.ts` (1,132 lines), `contracts/runtime.ts` | 7, 7 | same function (`createCase`) | RQ-03, RQ-04, RQ-06, RQ-08, RQ-01 (3), R1.76, R1.3 CS-W2 step 3 |
| `api/src/case-prepare.ts` (1,024 lines) | 3 | same function | RQ-01 (3) only |
| `web/src/runtime/cases.tsx` | 3 | same function (header) | RQ-06, RQ-07 (2), RQ-08, RQ-01 (4) |
| `api/src/client-money/trust/service.ts` | not on main (new in #3033) | same function | R1.58 FO-7t p1, R1.60, FO-7t p2-3 (Lead B: "never at once with FO-7t part 2") |
| `package.json`, `package-lock.json` | (in #3277) | serial when two PRs add a library | R1.64 tus; any new library goes through STANDARDS §1 |

## 3. Tracks (file areas that do not overlap), first and second row each
Rule: at most 8 builder tracks build at once (WIP cap); qa and the AWS run (Lead 19) are not builder tracks. A track takes its next row only when its current PR is approved. Areas are measured from the files each row's merged parts touched (section 5 table, column "Area").

| Track | Owns (files) | 1st | 2nd | Then |
|---|---|---|---|---|
| **T1 Identity and plan** | `platform/identity`, `entitlements`, `firms`, `billing`, `web/.../platform/staff`, `saas` | R1.20 (#3370, then PF-15 rest, PF-4c p2) | R1.90 (#3202 requeue, then walk) | R1.5 (#3217, #3214; real pool needs AWS) · R1.62 · R1.22, R1.91 (Stripe) |
| **T2 Platform screens** | `platform/settings`, `notifications`, `messages`, `system-console`, `support`, `web/.../platform/settings`, `messages` | R1.45 (#3219, then PF-19s) | R1.93 (PF-18s, PF-4s p2, PF-17 rest) | PF-21rs screen (R1.85, R1.86) · R1.95 · R1.35 (#3276, PF-10b/t/s) |
| **T3 Data rights and audit (API)** | `platform/register`, `erasure`, `switches`, `audit`, `keep-period`, `firm-closure` | R1.85 (#3234 → #3235) | R1.87 (#3209, AUD-3b) | R1.86 (with PF-21rs) · R1.97 (#2129, AUD-2, AUD-2c) · R1.105 · R1.34 |
| **T4 Front office sales and booking** | `front-office/sales`, `booking`, `duplicates`, `assignment`, `front-office-sales.prisma`, `web/.../front-office/sales`, `duplicates` | R1.104 (#3184) | R1.29 (#3174, FO-9s p2-3) | R1.36 · R1.98 FO half (FO-4c has no row) · R1.106 FO-15 · R1.43, R1.112 (OAuth) |
| **T5 Signing and retainers** | `front-office/signing`, `retainers` | R1.54 (#3367 queued, FO-6d) | R1.55 (QA-770, decline, FO-5s later part) | FO-5p (for R1.45) · R1.61 signing half (row G2 missing) |
| **T6a Trust** | `client-money/trust` | R1.58 (#3033 FO-7t p1) | R1.60 (#3371 rules, then build) | FO-7t p2-3, FO-7s3a/b, FO-7m (R1.58) · R1.96 |
| **T6b Invoices and card** | `client-money/invoices`, `tax`, `reads`, `card` | R1.56 (#3305 FO-7s1, then FO-7w1) | PF-28 money part (R1.10) | R1.57 (FO-7c, Stripe) · R1.111 · R1.61 pay half |
| **T7 Documents and files** | `platform/files`, `api/src/case-document*`, `case-documents*`, `web/src/runtime/checklist.tsx` | R1.64 (#3277 → #3303 → CS-D1) | R1.69 (CS-D6 keep list, reminder) | R1.68 (CS-D5 p2) · R1.66 (PF-F3) · R1.65 (AWS run) |
| **T8 Case side** | `api/src/runtime.ts`, `case-clients/`, `case-*.ts` (not documents), `contracts/runtime.ts`, `prisma/schema/case*.prisma`, `cases.tsx`, `clients.tsx` | RQ-02 ‖ RQ-04 | RQ-03 ‖ RQ-05 (RQ-05 after #3280) | RQ-06 → RQ-07 p1 → RQ-08 → RQ-07 p2 · R1.76 · R1.3 · R1.75 · R1.79 · RQ-01 seam PRs (section 4) |
| T9 Assessment engine (waits for a free slot) | `engine/eligibility*`, `api/src/assessments.ts`, `configurator/eligibility.door.ts` | R1.106 AS-1 parts | R1.107 AS-2 | (CS-106c is T8's) |
| T10 Input sweep (waits) | PF-28 platform part, `tests/pf28-allow-list.json` | R1.10 platform part (after #3377) | | touches every module's routes: run last, one PR per module |

**Ten natural tracks, eight slots.** Recommended: T9 and T10 wait for the first track that runs dry (T5 or T4 by 26 Nov), because they hold 3 rows that are far from proof. T8 holds two lanes only while RQ-02 ‖ RQ-04 and RQ-03 ‖ RQ-05 run (their files do not overlap, RQ shape note §5); that second lane is T9's slot until then.

## 4. One migration slot, in this order; RQ-01 behind a seam
**Slot order** (the stamps already given first, recovery plan): #3184 · #3033 · #3277 · #3276 · #3219 · then #3174 · #3234 → #3235 · RQ-04 · RQ-05 · #2129 · RQ-07 p1 · RQ-08 · RQ-01 (1). CS-D6 Dispose, PF-10b, PF-22a, PF-26, PF-29 and FO-7 parts join in the order they reach Approve. RQ-04 goes before RQ-01 (1): both change triggers on `runtime_case`. SPD-2 (#3035), if it merges, keeps one slot per schema area and frees platform and front-office migrations from waiting on case-side ones.

**RQ-01 (six PRs, shape note §3) placed so nobody waits on it:**
| RQ-01 PR | Can it go now? | Why |
|---|---|---|
| (6a) `check_case_rq01_single_unchanged.ts`: every one-combination checkpoint case byte-identical | **yes, first** | a new test file only; it guards (2) and (3) |
| (2) `stage-scope.ts` and the pin re-checks read the stage of the row being written | **yes, after (6a)** | 19-line file, 0 merges in 7 days; same behaviour while each case has one current stage |
| (3) the 21 readers of `combinationId` (grep, list in the shape note) take a stage | **yes, in 3 PRs of about 7 files** | add `combinationOf(case, stage?)` in a new file; switch readers file by file; `runtime.ts` and `case-prepare.ts` go last, after RQ-03/04/06/08 have merged their `createCase` edits |
| (1) schema: stage kind PARALLEL, one CURRENT per case and route, trigger change | after the founder's conflicts 1-5 (the unique index on case + combination decides two children's study permits) | holds the slot; harmless until (4) uses it |
| (5) shared facts asked once across two releases | design now, build after (1) | new engine work; files in `engine/`, disjoint from T8's |
| (4) "Add an application" on the case page, through RQ-02's rule | last | edits `cases.tsx` like RQ-06, RQ-07 p2 and RQ-08 |

**What truly cannot run in parallel, and why:** (i) two migrations on the one slot; (ii) RQ-01 (3)'s `runtime.ts` part beside RQ-03/04/06/08 (same function, `createCase`); (iii) RQ-01 (4) beside RQ-06, RQ-07 p2, RQ-08 (`cases.tsx` header); (iv) the trust chain FO-7t p1 → R1.60 → FO-7t p2 (`trust/service.ts`, Lead B's rule); (v) the two stacks; (vi) T1's rows on `identity/service.ts`; (vii) R1.3's CS-W2 beside any case-side migration (it adds `firm_id` to the 38 case-side child tables, one PR per area file).

## 5. Every unproven row (48) and RQ-01 to RQ-08
"PRs" = merges on main since 1 Nov whose title names the row or its parts. "Class" = recovery plan (A walk only; B one PR; C 1-2 PRs; D 3+ PRs; E AWS or on-call). "Out" = needs the founder or an outside account.

| Row | Status | Parts left (CAPABILITIES, newest note) | Area (measured) | Hot files | Waits on | Class | Out |
|---|---|---|---|---|---|---|---|
| R1.1 Hosting in Canada | Partial | smoke against the cloud address; PF-8c deploy from CI; region survey | `deploy/cdk`, `platform/web-address` (11 PRs) | | AWS run today; PF-8c code | E | founder AWS |
| R1.3 Walls between firms | Partial | CS-W2 (7 area files), CS-W3 p2-3, CS-W4 | `features/case-firm-door.ts`, `firm-scope.ts` | all case schema files, `runtime.ts` | slot; after RQ migrations | D | |
| R1.5 Staff sign-in | Partial | PF-4s p2 (DW6, DW7); real-pool lines; QA-643 passkey setting | `platform/system-identity`, `identity`, `deploy/cdk` (11) | `identity/service.ts` | #3217, #3214; AWS Cognito pool | D | founder AWS |
| R1.10 Checking every input | Partial | PF-28 money and platform parts; QA-507 | every module's routes (15) | `pf28-allow-list.json` | #3377 | C | |
| R1.13 Logs and alerts | Partial | an alarm a person confirms; CI run id for pf23 pack | `deploy/cdk`, `platform/jobs` (11) | | on-call address (given, A350); AWS run | E | founder |
| R1.15 Secrets | Partial | firms' own keys stored sealed; image and log secret scan | `deploy/cdk`, `platform/config` (10) | | code first (#3380 list), then AWS | E | founder AWS |
| R1.20 Entitlements, invite many | Partial | PF-15 rest, PF-4c p2, PF-6 batch | `platform/entitlements`, `identity`, `web/.../staff` (13) | `identity/service.ts`, `firm-scope.ts` | #3370 | C | |
| R1.22 Suspend, cancel, hold | Not built | PF-5 p2, PF-11 p1-3, PF-11s, PF-27, PF-11c | `platform/firm-closure`, `audit` (2) | | Stripe test account | D | Stripe |
| R1.29 Duplicates | Partial | FO-9b p2, FO-9s p2-3 | `front-office/duplicates`, `sales` (8) | `front-office-sales.prisma`, `ports/events.ts` | #3174; concept #2896 | D | |
| R1.34 Data export | Not built | PF-26 p1, 1b, 2, PF-26s, CS-X1 p1-3 | none yet | `firm-scope.ts` | T3 queue | D | |
| R1.35 Contacts import | Not built | PF-10a, b, t, s | none yet (#3276) | `firm-scope.ts` | #3276 slot; .xlsx library ruling | D | |
| R1.36 Automation | Not built | PF-20, PF-20s, FO-10, FO-12b/c/s | `front-office/assignment`, `sales` (2) | `features/front-office-sales.ts` | T4 queue | D | |
| R1.43 Calendar sync | Not built | FO-3s1, s2, s4, s5 | none yet | `booking/service.ts` | Google and Microsoft OAuth apps | D | outside |
| R1.45 Templates, preview | Not built | PF-19c, PF-19s, FO-5p | `platform/messages`, `web/.../messages` (1) | platform `routes.tsx` | #3219 slot | C | |
| R1.50 Notifications | Not built (#3379: Works claimed) | Lead 20's requirement question; bell flake Major (#3381) | `platform/notifications`, `settings` (8) | | #3379 ruling, #3381 | A | |
| R1.52 Mailbox, WhatsApp | Not built | FO-11, PF-19m, mc, mi, mx, ms | none yet | | mailbox OAuth; WhatsApp business account | D | outside |
| R1.54 E-signature | Partial | FO-6ds (#3367), FO-6d, FO-6v (held, P-561) | `front-office/signing` (4) | | BoldSign Canada account (P-561) for FO-6v | D | outside |
| R1.55 Withdraw, decline | Partial | QA-770; FO-6 door (decline with reason); FO-5s later part | (2, no app files) | `retainers/service.ts` | R1.54 | D | |
| R1.56 Client invoices | Partial | FO-7w1 (invoice from retainer); FO-7s1 (#3305); FO-7c | `client-money/invoices`, `tax`, `reads` (11) | | #3305 | D | |
| R1.57 Card payment | Not built | FO-7c p1-3, FO-7s2 | `client-money/card` (1) | `api/src/main.ts` | Stripe test account | D | Stripe |
| R1.58 Trust ledger | Partial | FO-7t p1-3, move-to-case, FO-7v, shortfall screen (no row), FO-7s3a/b, FO-7m | `client-money` (2) | `trust/service.ts` | #3033 slot | D | |
| R1.60 Deposit on signature | Not built | FO-7b deposit part (#3371 step 1) | none yet | `trust/service.ts` | #3033 | C | |
| R1.61 Sign and pay link | Partial | FO-6 door, sign-to-pay row (G2, none), FO-7c pay step | `client-money/card` (3) | | R1.54, R1.57 | D | Stripe |
| R1.62 Client portal | Not built | PF-4p, PF-4pw, PF-4ps, FO-14 | none yet | `identity/service.ts` | T1 queue | D | |
| R1.64 Resumable upload | Not built | PF-F2 p1-2 (#3277, #3303), CS-D1 | `platform/files` | `package.json` | slot (#3277) | D | |
| R1.65 Private storage | Partial | PF-F1c (real bucket versions) | `deploy/cdk`, `platform/files` (5) | | AWS run today | E | founder AWS |
| R1.66 Virus scan | Not built | PF-F3 | none yet | | scanner choice (outside per recovery plan) | C | outside |
| R1.68 Staff preview | Not built (#3308: Partial) | CS-D5 p2 screen (pdfjs gate) | `case-documents-preview.ts` (1) | | STANDARDS §1 gate for pdfjs | C | |
| R1.69 Read log, keep period | Not built (#3380: Partial) | CS-D6 keep list and weekly reminder | `case-document-reads.ts`, `checklist.tsx` (2) | | none (PF-14 only for the reminder) | C | |
| R1.75 Tasks | Not built | PF-29a-f, CS-T1 | none yet | `firm-scope.ts` | T8 queue | D | |
| R1.76 Notes, timeline | Partial | CS-NT1 p3, p4, FO-4 p2b, person timeline (no row) | `case-notes`, `case-feed.ts`, `runtime.ts` (4) | `runtime.ts` | a Lead decision on the person timeline | D | |
| R1.79 Dashboards | Not built | PF-R1, PF-R2fo, PF-R2cm, PF-R3, CS-R1 | `platform/reports` (1) | | T8 queue | D | |
| R1.85 Data requests, holds | Partial | PF-21b later, PF-21d (#3234, #3235), PF-21rs | `platform/register`, `erasure` (6) | `platform-register.prisma` | slot | D | |
| R1.86 Breach register | Partial | PF-21rs; AUD-3 p1 (#3209) | `platform/register` (2) | `platform-register.prisma` | #3209 | C | |
| R1.87 Our access logged | Not built | AUD-3 (#3209), AUD-3b | none yet | | #3209 | D | |
| R1.90 Sign-up, trial | Partial | PF-5s S8 (#3202) | `platform/firms`, `billing`, `web/.../saas` (7) | platform `routes.tsx` | #3202 requeue | B | |
| R1.91 Plans, billing | Not built | PF-5 p2, PF-5s, PF-16 | none yet | | Stripe test account | D | Stripe |
| R1.93 Our console | Partial | PF-4s, PF-17 rest, PF-18s | `platform/system-console`, `support`, `settings` (7) | platform `routes.tsx`, `account-sections.ts` | T2 after R1.45 | D | |
| R1.95 Custom fields | Not built | PF-22a, v, s | none yet | `firm-scope.ts` | T2 queue | D | |
| R1.96 Reversals, refunds | Not built | FO-7p, r, v, s4 | none yet | `trust/service.ts` | R1.58 | D | |
| R1.97 Audit chain | Not built | AUD-1c (#2129), AUD-2, AUD-2c | `platform/audit` (1) | | slot | D | |
| R1.98 Corporate clients | Partial | CS-98r, a-e, s1, s2; FO-4c (no row) | `front-office/sales` (1) | `runtime.ts` (CS-98a) | RQ-07 p1 (`case_link`, Q4 of shape note) | D | |
| R1.104 Consultation agreement | Partial | poller and screen (#3184) | `front-office/booking` (5) | `booking/service.ts` | #3184 slot | B | |
| R1.105 Keep periods, closing | Partial | AUD-5 p2, AUD-2, PF-5 close at 90 days, PF-11c | `platform/keep-period`, `firm-closure` (6) | | R1.97's AUD-2 | D | |
| R1.106 Assessment AS-1 | Partial | AS-1g, s, c; FO-15a, b, s; CS-106c | `engine/eligibility`, `assessments.ts` (2) | | T9 slot | D | |
| R1.107 Assessment AS-2 | Not built | AS-2e, d1, d2, c, cs | none yet | | R1.106 | D | immigration values cited (P-170) |
| R1.111 Statements, exports | Not built | FO-7r, FO-7s5 | none yet | | R1.96 | D | |
| R1.112 Video links | Not built | FO-3v | none yet | `booking/service.ts` | Google OAuth | C | outside |
| RQ-02 Case rule as data | draft row | all (S) | new `engine/runtime/case-rule.ts`, `samples/case-rule.json` | none | nothing | | |
| RQ-04 Client kind matches pathway | draft | all (S) | `runtime.ts` `createCase`, one trigger migration | `runtime.ts`, slot | nothing | | |
| RQ-05 One client per person | draft | all (M) | `case-clients/prospect-won.ts`, new `case-client-prospects.prisma` | slot | RQ-04 slot; #3280 | | |
| RQ-03 New case, existing client | draft | all (M) | `runtime.ts`, new `open-for-client.ts`, `gate.ts`, `clients.tsx`, `contracts/runtime.ts`, census | `runtime.ts`, census | RQ-04; shape Q2 | | |
| RQ-06 Duplicate-case warning | draft | all (M) | new `case-duplicates.ts`, `runtime.ts`, `contracts`, `cases.tsx`, `clients.tsx`, census | `runtime.ts`, `cases.tsx` | RQ-02, RQ-03 | | |
| RQ-07 Linked cases | draft | 2 PRs (M) | new `case-links.prisma`, `case-links.ts`; p2 `cases.tsx` | slot, `cases.tsx` | p1 after RQ-06; p2 after RQ-08 | | |
| RQ-08 Retainer on the case | draft | 2 PRs (M) | new `case-retainers.prisma`, `ports/retainer-read.ts`, `runtime.ts`, `cases.tsx` | slot, `runtime.ts`, `cases.tsx` | RQ-05, RQ-06, RQ-07 p1 | | |
| RQ-01 Two applications in a case | shape only | 6 PRs (L, 45-60 h) | 21 readers + 13 `CURRENT` readers (grep on main) | `runtime.ts`, `case-prepare.ts`, `cases.tsx`, slot | founder conflicts 1-5; RQ-02; RQ-07 p1 | | founder |

RQ waits and touches are the shape note's, re-checked today: `case-rule`, `keep_period_days` and `open-for-client` appear in no open PR and nowhere on main.

## 6. Day by day to 29 Nov (forecast; judgment, medium confidence)
Counts are cumulative proven (qa Works merged). Each row named needs its PRs merged, a qa walk and a fresh reader.

| Day | Reach qa | Proven (range) | Rows and evidence |
|---|---|---|---|
| 24 Nov | R1.50, R1.90, R1.13, R1.65 | 53 → 54-56 | R1.50: #3379 approved, held by Lead 20's requirement question and the bell flake (#3381); R1.13, R1.65: AWS run today (founder, A350, US$2 cap) **[founder]**; R1.90: #3202 requeued |
| 25 Nov | R1.104, R1.20, R1.69, R1.86 | 57-60 | #3184 (slot 1), #3370, CS-D6 keep list (1 PR), PF-21rs plus #3209 |
| 26 Nov | R1.54, R1.60, R1.45, R1.10 | 60-64 | #3367 queued (but FO-6v held, P-561: R1.54 proves only if the Done when accepts the fake vendor) **[outside]**; R1.60 after #3033; #3219 then PF-19s; PF-28 two parts |
| 27 Nov | R1.85, R1.64, R1.56, R1.29, R1.55 | 63-68 | #3234 → #3235 and PF-21rs; #3277 → #3303 and CS-D1; #3305 and FO-7w1; #3174 and FO-9s |
| 28 Nov | R1.76, R1.93, R1.58, R1.68, R1.87 | 66-72 | CS-NT1 p3-4; PF-18s, PF-4s p2; FO-7t p2-3; CS-D5 p2 (pdfjs gate); AUD-3b |
| 29 Nov | R1.3, R1.97, R1.105, R1.36, R1.106 | 70-77 | CS-W2 to W4 (slot-bound); AUD-2; AS-1 parts |

**Honest answer: 10 a day is not reachable on this plan.** Forecast **about 4.5 a day, 70-77 on 29 Nov**, short of 101 by **24-31 rows**. RQ-01 to RQ-08 add **0** to the count (fact 5) and take one to two of the eight lanes all week: about 15-20 lane-days (shape note: 9-12 for RQ-02 to RQ-08, RQ-01 45-60 h), roughly 8-11 rows' worth of lane time at today's rate. **RQ-01 cannot finish by 29 Nov**: six PRs in a chain plus founder conflicts 1-5; only its seam PRs (6a), (2) and (3) fit.

**Rows no lane count can prove by 29 Nov without the founder or an outside account (14):** Stripe: R1.22, R1.91, R1.57, R1.61 · BoldSign Canada (P-561): R1.54 (FO-6v), R1.55 door · OAuth apps: R1.43, R1.112, R1.52 (plus a WhatsApp business account) · AWS: R1.1 (PF-8c), R1.5 (Cognito pool), R1.15 (after code), R1.66 (scanner) · R1.13 (a person confirms an alarm). Even with every lane perfect, the ceiling without them is about **87**.

**What would make 10 a day reachable, and its cost:**
1. **Outside accounts today** (Stripe test mode, a BoldSign sandbox, Google and Microsoft OAuth test apps, a second AWS run): lifts the ceiling by up to 14 rows. Cost: several founder hours today; accounts and standing cost need his Go (A350's US$2 covers one run only); WhatsApp business approval may take longer than 5 days.
2. **qa at 10 walks a day:** today's proofs come about 5 a day. Needs a third qa lane and a fresh reader per row. Cost: one more Opus session and Lead attention.
3. **Ten builder tracks, not eight (T9, T10):** about 3 more rows by 29 Nov. Cost: Lead load (Lead 18's clog), more merge-queue re-runs; P-622's WIP limit is the founder's.
4. **RQ moved behind 29 Nov except RQ-02, RQ-04 and RQ-01's seam PRs:** frees one lane for about 4 rows. Cost: the founder's "critical features" land after the date (his call, Question 1).
With 1 to 4 together: about **85-92** by 29 Nov. 101 needs all of them plus no slipped chain. **No gate is lowered in any of these.** Re-wording a Done when to avoid an account (as P-796 did for R1.21) is the founder's scope decision, not this plan's.

## 7. Ready to start in the next 2 hours (after the Lead writes each row Ready)
Each is in a track whose files no open PR touches (fact 4).

1. **RQ-02 · T8 · the case rule as data.** Touch: new `engine/runtime/case-rule.ts`, new `samples/case-rule.json` (Sample; cites P-492, P-493 (3), P-814), new `tests/check_case_rq02_case_rule.ts`. **Done when:** `check_case_rq02_case_rule.ts` exits 0 with a pass and a fail per level (Pathway, Program, Category, Sub-category) and per client kind; the sponsored spouse's open work permit in a PR case → `JOIN`; a non-dependent Temporary residence application in a PR case → `WARN`; a second PR application with another principal → `NEW_CASE`; changing the data file changes the answer with no code change. Immigration point (spouse's work permit as a step of the sponsorship): official sources in the shape note §4.2; **Unconfirmed: no counsel.** **Duplicate check:** searched open PRs (files and titles), main (`case-rule`, `caseRule`), BACKLOG RQ rows, the shape note; none.
2. **RQ-04 · T8 (second lane) · client kind matches pathway.** Touch: `api/src/runtime.ts` `createCase` (about lines 356-358), one migration folder (trigger `case_client_kind_match`), new `tests/check_case_rq04_client_kind.ts`. Merges after #3174 and #3234/#3235 in the slot. **Done when:** `check_case_rq04_client_kind.ts` exits 0: person client on a Corporate combination → 409 and no case row; the reverse → 409; a direct insert → refused by the trigger; a matching opening passes; demo reset and the C10.1 checkpoint load unchanged. **Duplicate check:** searched open PRs (no file under `case-clients/` or `runtime.ts`), main (`case_client_kind_match`: none; `case_client_kind_of` exists and is reused), BACKLOG; none.
3. **R1.69 CS-D6 part 2 · T7 · keep list and weekly reminder.** Touch per BACKLOG CS-D6: `api/src/documents/keep-period.ts` (new), `api/src/case-documents.ts`, `web/src/runtime/checklist.tsx`, `tests/check_csd6_reads_keep.ts`; settings key `documents.keep_period_days` through PF-3's settings (no default for real firms; Sample firm 7 years Sample); keep period from AUD-5's `KeepPeriodPort` (6 years, Unconfirmed: no counsel). No migration for the list; Dispose (the 3 columns) is a later PR. **Done when:** `check_csd6_reads_keep.ts` exits 0 with the keep-list clauses: only closed cases past the period; none for a firm with no period set; another firm's documents never appear; then j_69 21/21 on walks. **Duplicate check:** searched open PRs (none touches `case-document*`, `checklist.tsx` or `keep_period_days`), main (`keep_period_days` only in a test), #3380's report (what is left); none.
4. **RQ-01 (6a) · T8 or T9's free slot · one-combination cases unchanged.** Touch: new `tests/check_case_rq01_single_unchanged.ts` only. **Done when:** it exits 0 on main, comparing every checkpoint case's prepared output (filings, checklist lines, pins) before and after a no-op, and fails on a seeded change of one case's combination. **Duplicate check:** searched open PRs and `tests/` for `rq01`, `single_unchanged`, byte-identical checkpoint checks; none (C10.1's checkpoint load is reused, not copied).
5. **PF-21rs concept · T2 · our console's Privacy pages (R1.85, R1.86).** Concept first (screen-concept), no code. **Done when:** the concept and its fresh challenge are on a records PR with journeys W1-W6 from BACKLOG PF-21rs and the test name `tests/check_pf21rs_browser.ts`. **Duplicate check:** searched open PRs (no `pf21rs` file; #3234/#3235 are API only), main, BACKLOG PF-21rs; none.

## Questions for the tech lead (also on the PR)
1. RQ-01 to RQ-08 have no R1 row (0 hits). Which row do they count under, and does the founder accept one to two lanes all week (about 8-11 rows of lane time) for them? Recommended: build RQ-02 to RQ-08 and RQ-01's seam PRs (6a, 2, 3) now; RQ-01 (1), (4), (5) after his conflicts 1-5.
2. Ten tracks, cap eight: keep T9 and T10 waiting (recommended), or raise the cap with a third qa lane?
3. Ask the founder today for Stripe test mode, a BoldSign sandbox and OAuth test apps (14 rows' ceiling)? Recommended: yes, Stripe first (free test mode, 4 rows).
