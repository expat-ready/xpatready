# Tester's notes: qa capability, eight Release 1 rows · main 90ea6cfe6 · 16 Nov 2026, 11:xx IST

The tester's facts for the fresh reader (P-303). Lane: qa, cloud copy (bound 16 Nov). Rows asked by the current Lead: map rows 6, 27, 38, 40, 47, 49, 80 and 99 (board "Built", qa file Partial or Not built). Live AI off; every run used the fake launcher or saved runs (US$0); no priced button; nothing on :4400 (not reachable from the cloud copy).

**Main's head:** 90ea6cfe6 (#1908, records). The last app-code merge is #1912 (PF-6 part 1, 4c80ad22d). Everything after it is records only (`git diff 4c80ad22d 90ea6cfe6 -- prototype/` is empty).

**GitHub's runners:** merge batch ci **43801075002** (draft #1926 = #1912 + #1915; base 9c671032f, RANGE 9c671032f..faceaf21f, batch commit 9ab7125ad): success. All 8 shards green (every non-quarantined suite; shard 1 job 133082253283 says "retries: 0"), types green, the 5 regression (protected-set) jobs green. The regression job **133082469241** ran C6.5 and C7.5 among its packs. None of the suites below is on the quarantine list printed in the job's env. The full logs zip could not be fetched (proxy refused the log host), so per-suite lines are not copied; the batch is green only if every suite in it passed. #1831 (FO-3m) merged at 03:58 UTC, after this batch's base; it went through the queue, which requires a green `ci` (its run was not read by qa). qa's local re-runs are on main 90ea6cfe6, which has it.

## Map row 6 · R1.6 Permissions: deny by default, own versus all, money and licence apart
Parts: PF-4 (merged), PF-6b (merged #1808), PF-6 part 1 (merged #1912), J-6 part 1 (merged #1914). PF-6 part 2 (role editor) and J-6 part 2 are not on main. Lead B's A6 (`design/lead-b-briefs/P-626-order.md` on `lead-b-front-office`): "qa scores R1.6 on part 1 only if its capability text is met without the role editor … qa decides."
qa's re-runs on main 90ea6cfe6, each on an isolated copy:
* `tests/journeys/j_6.ts` **50/50 twice** on one kept copy (`j6-mine.txt`). First attempt 45/50: the 5 lines were the walk's inner `spawnSync("tsx", …)` of PF-6b's check, which found no `tsx` on qa's PATH; with the studio's `node_modules/.bin` on PATH, 50/50. A harness matter of the copy, not the app. Its screenshots were put back (not committed).
* `check_pf4_identity.ts` 119/119 (route with no declared key stops the start-up, naming it; a key the person lacks → 403).
* `check_pf6b_permission_rules.ts` 24/24 (DW1 to DW8: money key never in a duty or bundle, its own audit line on a role change, LICENCE key needs the licence record (403 NOT_LICENSED, on a test route), the @OwnOrAll sweep).
* `check_fo2_leads_prospects.ts` 113/113; `check_fo4_sales_browser.ts` 45/45.
* **New, qa's own:** `tests/qa/check_r16_deny_sweep.ts` **10/10 twice** (`r16-deny-sweep-*.txt`). It reads every route the app serves under `/api/platform` and `/api/front-office` (60) from the app's own feature list: every one declares access; no token on all 58 guarded routes → 401; a Case Officer on all 23 routes whose keys they lack → 403 with words; the Owner passes the key check on the same 23 (not vacuous); no duty hands out a money key; the Case Officer has no licence-class key. Note: **no running route declares a licence-class key yet** (PF-6b DW5 proves NOT_LICENSED on a test route only).
  * A first draft of S4 expected the Case Officer to hold no money key. It holds `agent/invoice:create`, `invoice:list`, `invoice:show`, `expense:create` from the PF-3 role table (SA-06 Appendix C, `20261114015002_pf3_platform_tables`). Ruling 2 is "never by a duty or bundle", which holds; qa's draft was wrong, and S4 was rewritten to the rule.
* **J-6 breaker F3, reproduced by qa:** `tests/qa/check_qa477_money_keys_by_invitation.ts` **4/5 twice** (`qa477-mine-*.txt`). The Owner invites a new person as Billing/Finance through `POST /api/platform/staff/invitations` (201); qa sets a known token on that real row (the mail goes to MAIL_PORT's in-memory fake; PF-4b's own suite seeds tokens the same way); `POST /api/public/invitations/:token/accept` → 200, role BILLING_FINANCE, 12 money-class keys; **`platform.staff.money_keys_granted` lines for the person: 0**. The role-change door writes it (J-6 P1-A3, `identity/service.ts:244`); the invitation door does not. PF-6b ruling 2 (b): "a role grant that brings MONEY keys writes its own audit line".
* **J-6 breaker F2, read by qa in the code and in two green packs:** with "everyone sees all" off, leads give Owners and Admins all (`api/src/front-office/sales/common.ts` `visibilityOf`: `seesAll = admin || (everyone && view.all)`), while retainers need the setting and `view.all`, Owner included (`retainers/service.ts` `seesAll`); PF-6b DW6's own line says "the setting off makes everyone own-only". J-6 W1 (Owner sees every lead, setting off) and PF-6b DW6 both pass, and they contradict each other for one viewer and one area (agent/prospect). The leads routes carry no `@OwnOrAll("agent/prospect")` (`sales/routes.ts`), so DW7's "every marked route swept" never sees them. Raised as a question to the tech lead on #1914 (no ruling found on main).
* Gate A: J-6 ends at row 5's first step (Invite staff). No headed browser in this cloud copy: headless only (as the J-6 reviewer notes, the builder ran it headed under xvfb).

## Map row 27 · R1.27 Every lead carries a source
Capability text: "Every lead has a source (form, embed with campaign, manual, import); a lead without one refused by the database (fail case); lists filter by source." Since the last score (15 Nov), FO-2 parts 1-2 and FO-4 part 1 (#1822) merged.
* Re-runs: `check_fo1a_sales_schema.ts` 124/124; `check_fo2_leads_prospects.ts` 113/113; `check_fo4_sales_browser.ts` 45/45; qa's `check_r127_lead_source.ts` 5/5 twice.
* The form door and the manual door now make leads with a source (FO-2; manual "Add a lead" requires a source, `sales/leads.ts:120`). Leads list shows a Source column (`leads-page.tsx:67,79`).
* **Missing:** the embed with campaign door (FO-4b, not built); import (no row found); **no list filters by source**: the Leads page has view chips only, the API reads no source parameter, and FO-4's BACKLOG row does not mention a source filter (no row shapes it).

## Map rows 38 and 40 · R1.38 Time zones, R1.40 Calendar invite files
Since the last score (fecf52a2b), #1830 FO-3pa and #1831 FO-3m (booking `service.ts`) merged. FO-3w (booking page) and J-38 are not on main (no app-code commit names them).
* Re-runs on one copy, twice: `check_r1_fo3_tz_walk.ts` 19/19; `check_r140_inbox_walk.ts` 16/16; `check_r140_staff_move_invite.ts` 11/11. No regression from FO-3pa or FO-3m.
* Missing parts unchanged: FO-3w, J-38 (and FO-3st for the staff calendar view in R1.38's text).

## Map row 47 · R1.47 One email layout
* `ports/messages.ts:85` `layout()` ("the one fixed layout (row 47)"): firm name on top, body, "Sent by <firm>". It is applied in `render()`, i.e. only to mail sent through MessagePort (today: booking mail, PF-19b booking mail #1860).
* Other send paths do not use it: staff invitations (`identity/service.ts:323` → MAIL_PORT, `identity/session/mail.ts` LocalMail "In memory … until PF-19b routes it through MessagePort"); sign-up mails (`firms/signup.ts:131`, MAIL_PORT); the case side's client-link emails (`person-link.ts:168,177` write `demo_message` directly).
* "The firm's branding": the firm's name only; logo and colour are PF-13's (A1).
* PF-19b's row: "`MailPort` … becomes a thin caller of `MessagePort`" and part 2 (SES, bounces, unsubscribe, firm status, SENDING) are not on main. The board's "Built" reads PF-19b as merged because a PR titled "PF-19b part 1" merged.
* `check_pf19b_sending.ts` 40/40, `check_pf19b_mail.ts` 28/28 (re-runs). No pack checks the layout on every send path.

## Map row 49 · R1.49 Consent gate before every send; unsubscribe
* `check_pf19a_messages_schema.ts` 94/94; `check_pf19b_sending.ts` 40/40 (DW1 marketing without consent SUPPRESSED, nothing sent; DW2 suppressed address gets nothing, transactional included; per firm).
* The gate covers MessagePort only; the three paths above bypass it.
* **No unsubscribe anywhere** in `api/src` or `web/src` (grep "unsubscribe": none). One-click unsubscribe is PF-19b part 2.

## Map row 80 · R1.80 IRCC forms per applicant from one set of answers
* C7.1 and C7.8 Works (nightly 43752890693, 15 Nov). C7.2 Partial on QA-315 and QA-165 (Majors, open). No commit on main since 15 Nov names C7.2, QA-315 or QA-165 (`git log --grep`). QA-165 needs the Mac's Adobe Validate run, which a cloud copy cannot do.
* Nothing to re-check: the missing part is unchanged.

## Map row 99 · R1.99 AI on top of the guardrails
Held on 15 Nov only by "model choice open (founder)". **P-616 (15 Nov, RULES.md):** "map row 99's model choice is launch condition C26". The checklist row 99 reads "the model choice is launch condition C26, not a part, P-616".
* GitHub: batch 43801075002, regression job 133082469241 (packs incl. C6.5 and C7.5) success; shards green (BK-14 and C3.1 suites inside).
* qa's re-runs on main 90ea6cfe6, live AI off: `works-set.mjs --pool "C6.5 C7.5"` on the configured checkpoint: C6.5-counts 13/13, C6.5-screen 33/33, C6.5 57/57, C7.5 16/16 (`works-set-C6.5-C7.5.txt`). `check_bk14_review_any_form.ts` 15/15; `check_bk14_sp_review_api.ts` 10/10 (saved made-up runs); `check_forms_c31_acceptance.ts` 17/17 (fake launcher). C3.1 has no acceptance pack (Works since 4 Nov).
* Open bugs on its parts: QA-353, QA-380, QA-381 (all Minor).
