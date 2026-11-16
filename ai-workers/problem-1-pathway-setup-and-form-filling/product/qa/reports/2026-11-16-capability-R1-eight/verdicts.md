# Fresh reader's verdicts: eight Release 1 rows · main 90ea6cfe6 · 16 Nov 2026

qa's fresh reader (P-303, P-339): I ran nothing. I read `tester-notes.md`, every `*.txt` in this folder, RULES.md (P-305, P-339, P-606, P-616), the qa skill §2 and §4, the eight CAPABILITIES and MVP-CHECKLIST rows, Lead B's A6 (`P-626-order.md` on `lead-b-front-office`), the BACKLOG rows (PF-6, PF-6b, PF-19b, FO-3w, FO-4, FO-4b, J-6, J-38), BUGS rows QA-165 and QA-315, `screens/J-6/break-report.md` and `review.md`, and the code named below (read only).

## Facts I checked myself
* **The GitHub batch is not main's tree.** Batch ci 43801075002 is base 9c671032f plus #1912 and #1915. #1831 (FO-3m, `ddc6e919c`) merged after that base and is not in it. It changed 7 files: `booking/service.ts`, `booking/staff.controller.ts`, `front-office/MODULE.md`, `check_fo3_booking.ts`, `check_fo3m_answers.ts`, `check_pf19b_mail.ts` and `check_pf23w_jobs_wired.ts`. `git diff 4c80ad22d 90ea6cfe6 -- prototype/` is empty, so main's code is the batch's tree plus #1831. That does not matter for rows 6, 80 and 99, which do not touch those files. It does matter for 38 and 40, whose booking code differs from the batch. #1831's own queue run id is not in the notes.
* **CI does not run journeys or qa's checks.** `run-suites.sh` picks `tests/check_*.ts|cjs` only. `tests/journeys/j_6.ts` and `tests/qa/*` have no GitHub run. PF-4, PF-6b, FO-2 and FO-4 do run (they are `tests/check_*`).
* **F3 is real.** The role-change door, `identity/service.ts:239-244` `changeRoles`, writes `platform.staff.money_keys_granted`. `invite()` (`:329`, `platform.invitation.created`) does not, and neither does `session/service.ts` `accept()` (`:98`, `platform.invitation.accepted`, naming the roles). Both doors write to `audit_event`, so qa's Q3 counts the right table.
* **F2 is real.** `sales/common.ts:57-62`: `seesAll = admin || (everyone && view.all)`. `retainers/service.ts:166-168`: `seesAll = setting on && holds view.all`, with no exception for admins. With the setting off, the Owner sees every lead but only their own retainers. The leads routes carry no `@OwnOrAll`, so PF-6b's DW7 sweep never compares the two areas.
* **Layout and gate.** `ports/messages.ts:84-90` `layout()` is applied only in `render()`, i.e. only to mail through MessagePort. These paths bypass both the layout and the consent gate: `identity/session/mail.ts` (LocalMail), `firms/signup.ts:131` (MAIL_PORT), and `person-link.ts:168,177` plus **`:285`** (the one-time code email; the tester missed this one). They write `demo_message` directly. "unsubscribe" appears 0 times in `api/src` and `web/src`.
* **qa's new checks.**
  * `check_r16_money_keys_by_invitation.ts` is sound and not vacuous. It goes through the real routes, sets the token the way PF-4b's suite does, and counts the same table and action that J-6's A3 counts.
  * `check_r16_deny_sweep.ts` S1 to S3 are sound: the route list comes from the app's own feature list, and S3 is the positive control.
  * Its header overclaims twice. S2 says "the key named", but the code only checks that the detail contains a lowercase letter. S4 says a licence route "answers NOT_LICENSED", but the code only counts such routes (0).
  * S4's second line cannot fail once the first passes.
  * The sweep covers `/api/platform` and `/api/front-office` (60 routes) only. Case side routes are not swept.
  * Fix the header words. The verdicts below do not rest on the overclaimed parts.

## R1.6 Permissions: deny by default, own versus all, money and licence apart · **Partial**
* **Part 1 alone can meet the text.** The text has four clauses, and none of them needs the role editor:
  * Deny by default: PF-4 119/119, and qa's sweep 10/10 twice (58 routes 401 with no token; 23 routes 403 with words for the Case Officer; the Owner passes the same 23).
  * Own versus all: J-6 W1/V2 on the leads screen, and PF-6b DW6 on retainers, bookings and complaints.
  * Money and licence never come with another key: PF-6b DW3 and DW5 are API rules.
  * Wrong role by URL: J-6.
  * So under A6 I score part 1 and do not wait for J-6 part 2.
* **What holds it.** Two open Majors (P-305):
  * **#1929's QA-478 (money line) · Bug · Major** (PF-6b ruling 2 (b); R1.6). An invitation that grants a money role writes no money-keys line. `r16-money-keys-*.txt` show 4/5 twice: role BILLING_FINANCE, 12 money-class keys, 0 lines.
    * It is Major, not Minor. The invitation is the normal way a new money holder arrives. The ruling's control (a separate line that a reviewer can filter on) is missing at that door, and J-6 A3 calls the money audit proven while testing only `PATCH /roles`.
    * One thing softens it: `invitation.accepted` still names the role, so nothing is lost for good.
  * **#1929's QA-477 (own versus all) · Conflict · Major** (AG-2-13c / FO-2 against SA-6-24 / PF-6b DW6; R1.6). With the setting off, one viewer in one area (agent/prospect) gets "all" for leads and "own" for retainers. Both packs pass, and they contradict each other.
    * The capability's "'all' returns the firm's" cannot be judged until the tech lead rules which rule is right.
    * It is Major because it decides who reads other staff's retainers, which carry money terms.
* **Also not proven on GitHub.**
  * J-6 is a journey, so CI never runs it (50/50 twice is qa's local run only).
  * No running route declares a licence-class key, so "licence apart" is proven only on PF-6b's test route.
  * Gate A is headless only in this copy.
* **To reach Works:**
  1. Fix #1929's QA-478 (money line) so both invitation doors write the line. Add a test that fails without the fix.
  2. Get the tech lead's ruling on #1929's QA-477 (own versus all). Make the losing side match, and either mark the leads routes `@OwnOrAll` or add them to DW6's sweep.
  3. Get a GitHub run id of main's head with PF-6b and the fixes green.
  4. Get J-6, or its API halves, into a `tests/check_*` suite, or have the Lead accept qa's local walk as gate A by P-616.
  5. Have a new fresh reader score it.

## R1.27 Every lead carries a source · **Partial** (parts missing: FO-4b; two Gaps)
* **What works.**
  * The form and manual doors make leads with a source (FO-2 113/113; manual source required at `sales/leads.ts:120`).
  * The database refuses a lead with no source (fo1a 124/124; qa's check 5/5 twice).
  * The Leads list shows a Source column (FO-4 45/45).
* **What is missing.**
  * The embed-with-campaign door is FO-4b. It is shaped but not built.
  * **Gap: "lists filter by source".** No BACKLOG row shapes it. FO-4's row, its Done when and the API have no source parameter. The requirement nearest to it is the dashboard's "leads by source and campaign" (Doc 3 l.773).
  * **Gap: "import".** AG-2-7 (bulk lead import) appears in no BACKLOG row or checklist row.
* Proposed: **QA-493 · Gap · Major** for the source filter (R1.27 text; owner: the Lead, to shape or to narrow the text by decision, P-70). **QA-494 · Gap · Major** for lead import (AG-2-7; the same choice). Until a row exists, P-606 cannot be met, so the row stays Partial and is not "Built".

## R1.38 Time zones · **Partial** (parts missing: FO-3w part 1, FO-3st1, J-38)
* Re-runs after #1830 and #1831 equal the last score: the TZ walk 19/19, the inbox walk 16/16 and the staff move 11/11, each twice. There is no regression.
* Missing parts: the booking page (FO-3w), the staff calendar view in the staff zone (FO-3st1; the staff read gives UTC and the booker's zone only), and J-38.
* The checklist says "Merged". That is out of date.
* The GitHub batch does not hold #1831's booking change. Record #1831's queue run id at the next score.

## R1.40 Calendar invite files · **Partial** (parts missing: FO-3w part 1, J-38)
* The invite is read from the running app's demo inbox: one UID, SEQUENCE rising, REQUEST, REQUEST, CANCEL, and DTSTART in UTC across the change (16/16 twice, 11/11 twice).
* Missing: the booking page (FO-3w), so gate A cannot start, and J-38. A4 says J-38 waits only on FO-3w part 1.
* The same note on #1831's run applies.

## R1.47 One email layout · **Partial** (parts missing: PF-19b's MailPort-through-MessagePort, PF-19b part 2; one Gap)
* **The board's "Built" is wrong.** Only PF-19b part 1 (booking mail, #1860) is on main.
  * The row's "`MailPort` becomes a thin caller of `MessagePort`" is not on main, so invitations and sign-up mail skip `layout()`.
  * No pack checks the layout on every send path, which is what the text asks for.
* This is "parts missing", not a Gap, for those mails, because PF-19b shapes them.
* **Gap: the case side's link emails** (`person-link.ts:168,177,285`). No row sends them through MessagePort. PF-19b only keeps the demo inbox working.
  * Proposed: **QA-495 · Gap · Major** (R1.47, R1.49; "every email on both sides"). The Lead either shapes a row or rules the case side's link mail out of Release 1.
* "The firm's branding" today is the name only. The logo and colour are PF-13's, and PF-13 is not listed among row 47's parts (a question below).
* The CAPABILITIES row's "Not built" is also wrong now. Partial is right.

## R1.49 Consent gate before every send; unsubscribe · **Partial** (parts missing: PF-19b part 2, PF-19b's MailPort routing; QA-495)
* The gate works on MessagePort (pf19b 40/40: marketing without consent is SUPPRESSED and nothing is sent; a suppressed address gets nothing, per firm), and pf19a 94/94.
* "On every path" fails on the same bypass paths as R1.47.
* "One-click unsubscribe" is not built: no code at all; it is PF-19b part 2.
* The board's "Built" is wrong, for the same reason as R1.47.

## R1.80 IRCC forms per applicant · **Partial** (scored; all parts merged)
* C7.1 and C7.8 are Works (nightly 43752890693).
* C7.2 is Partial on QA-315 and QA-165, both open Majors (P-305).
* No commit since 15 Nov names them. QA-165 needs the Mac's Adobe Validate run, which this copy cannot do.
* Missing: C7.2 to Works.
* MVP-CHECKLIST row 80 still says "C7.1, C7.8 Partial, ready for Works". That is out of date.

## R1.99 AI on top of the guardrails · **Works**
* **Why it is Works now.**
  * On 15 Nov the only thing holding it was the model choice. P-616 makes that launch condition C26, and checklist row 99 already says so.
  * GitHub: batch 43801075002 succeeded, with regression job 133082469241 running C6.5 and C7.5, and all 8 shards green (BK-14 and C3.1 suites inside).
  * The batch tree differs from main only by #1831, which touches no AI, form or case file.
  * qa's independent re-runs on main 90ea6cfe6 on the configured checkpoint: C6.5-counts 13/13, C6.5-screen 33/33, C6.5 57/57 and C7.5 16/16 (`works-set-C6.5-C7.5.txt`). Also BK-14 15/15 and 10/10, and C3.1 17/17, all at US$0.
  * Only Minors are open (QA-353, QA-380, QA-381).
* **Weaknesses to record in the row.**
  * Per-suite lines were not copied from the GitHub logs, because the log host was refused.
  * The notes do not state which data the regression job used (it should be the checkpoint, P-322).
  * Only shard 1's "retries: 0" was read.
* **Condition.** Copy the C6.5, C7.5, C3.1 and BK-14 lines, with their data and retry counts, from 43801075002 when the logs can be reached (on the Mac). If any passed only on retry, or ran on a different data set, re-score.
* A different model later re-opens C6.5 and C7.5 (C26).

## What the tester missed or overclaimed
1. The batch-tree gap (#1831) is noted but not weighed. Its run id was not read.
2. The tester did not say that J-6 and `tests/qa/*` have no GitHub run. P-339 for R1.6 needs a pack in CI.
3. The tester missed `person-link.ts:285` (the code email) as a fourth bypass path.
4. The sweep's header overclaims S2 and S4 (see above). Reword it before it is cited as proof of "licence apart".
5. Two counts of money keys disagree for Billing/Finance: qa's role-table count is 12 and the breaker's `/me` count is 15. The finding stands either way. Find out why before writing #1929's QA-478 (money line)'s steps.
6. Staleness in the records: MVP-CHECKLIST rows 6 and 27 still say "In PR #1744" and "In PR #1742", and rows 38 and 40 say "Merged". The board's "Built" for 47 and 49 rests on a PR title.

## Questions for the tech lead
1. #1929's QA-477 (own versus all): with "everyone sees all" off, does the Owner or Admin see the firm's prospects and retainers (FO-2's `admin ||`), or only their own (SA-6-24, PF-6b DW6)? One rule for both areas.
2. R1.27: shape "lists filter by source" and lead import (AG-2-7), or narrow the row's text by decision?
3. R1.47 and R1.49: are the case side's link and code emails in "every email on both sides"? If they are, which row sends them through MessagePort? Is PF-13 (logo, colour) a part of row 47?
4. R1.6: can a GitHub-run `tests/check_*` carry J-6's API halves, or is qa's local walk enough for gate A (P-616)?
