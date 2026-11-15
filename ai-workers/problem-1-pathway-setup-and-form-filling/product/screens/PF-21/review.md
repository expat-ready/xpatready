# PF-21 review: complaints register (schema, migration, service and test; no screen, no route)

Reviewer (did not build it), 14 Nov 2026. Commit **5eca10767e7737a4cac403a17def7ec2429d886c**, branch `claude/eager-cray-o6w2py`, PR #1753. Read against: brief `lead-b-briefs/PF-21.md` and PF-0p's brief `lead-b-briefs/PF-0p.md` (both on `lead-b-front-office`); `lead-b-rows-2026-11-14.md` "Rev 12" FO-13k Done when, plus rev 14 PF-21 ("migration on empty and demo-data copies, `migrate diff` empty"); contracts 2026-11-14 §0, §7, §9; the PR's questions and the tech lead's answers (Lead 47, 13:20Z).
**Journey test:** there is no screen in this row (PF-21s is the screens row), so the journey score is n/a. D1–D20 and BIC-01–BIC-20 are N/A for the same reason.

## What I ran (127.0.0.1:54329 scratch databases only, all dropped; never :4400, never `xr_studio_demo`)
* `npx tsx tests/check_pf21_complaints.ts`: **56 passed, 0 failed**. The commit message says 59; the run counts 56.
* `npx tsx tests/check_prisma_schema.ts`: **7 passed, 1 failed** (`F pass`: "platform-register.prisma: no one-line rule"). The M lines pass, so the migrations still give the schema apart from main's 5 known differences, and PF-21 adds none. **`migrate diff` is empty for PF-21.**
* `node product/tools/typecheck.mjs`: PASS, no new type errors (15 known). This used the local uncommitted `ports/` stand-ins.
* My own probe on scratch database `xr_studio_rev_pf21_*` (script in the session scratchpad):
  * Four concurrent `runAckReminder` calls on two Prisma clients gave `sent,skipped,skipped,skipped`, with 1 mail and 1 `REMINDER_SENT` event.
  * On two `pg` connections, a raw STEP insert racing a close (the closer holds `FOR UPDATE`) waited, then was refused "a closed complaint takes only a NOTE".
  * A service race of close, addStep and close gave `ok,409,409`, with one CLOSED event.
  * `acknowledgeBy` across daylight saving is correct for:
    * Toronto, autumn: Fri 30 Oct EDT → Tue 3 Nov 17:00 EST, 22:00Z.
    * Toronto, spring: Fri 6 Mar → Tue 10 Mar 17:00 EDT, 21:00Z.
    * St John's, Regina, and Lord Howe (a 30-minute DST change).
    * Received during the repeated 01:30 on 1 Nov.

## Checks asked for
* **Firm wall:** pass. Every change goes through `lock()` (complaints.ts:124-129, scoped `FOR UPDATE`). `get` and `list` are firm-scoped. Firm B's Owner gets 404 on get and close and an empty list (test :204-208). The database refuses another firm's handler with 23503 (test :209).
* **Who may read and act:** matches FO-13k.
  * Reading needs the read key, or being the handler.
  * Acting needs the read and record keys, or being the handler.
  * A non-reader gets 404. Read-only access gets 403. Changing the handler needs both keys.
  * Tests :186-201 cover this. The key catalogue is not done yet (M1).
* **Reminder:** fires once and is idempotent.
  * It is scheduled with a key (complaints.ts:153).
  * The handler re-checks closed, acknowledged and an existing `REMINDER_SENT` under `FOR UPDATE` (:277-280). The race probe above confirms it.
  * It is cancelled on acknowledge and close.
* **Audit rollback:** pass. `AuditPort.record(tx, …)` runs inside each transaction. A forced failure on record and on close leaves no row, no event and no job (test :246-252).
* **Triggers:** correct.
  * No delete or truncate on either table.
  * Events are insert-only, RECEIVED comes first, and only a NOTE may follow a close.
  * A closed complaint never changes, its facts are fixed, and the acknowledgement and response are recorded once.
  * The service writes the CLOSED event before the status flip (:259-260), which the event trigger needs.
  * Under concurrency, the event trigger's `FOR SHARE` (migration :180) waits on the service's `FOR UPDATE`, then sees the committed CLOSED.
* **Personal data:**
  * Audit `detail` holds ids and enums only. Summaries are fixed phrases plus category, kind, outcome and dates.
  * The reminder mail names neither the complainant nor the summary, only the complaint id and the due date.
  * The code is correct; the test is weak (m5a).
* **P-600:**
  * (1) Own file `platform-register.prisma` and its own folder.
  * (2) Additive. Two back-relation fields, no column; the second was approved by the tech lead (Q3).
  * (3) Every function and trigger is `plat_`: `plat_has_text`, `plat_complaint_kept`, `plat_complaint_write`, `plat_complaint_event_write`.
  * (4) Stamp `20261114200000` is later than main's newest, `20261114120000_fo1b_booking_tables` (main `549b9cfbb`, fetched at review).
  * (5) `migrate diff` is empty (above).
  * All five are met.
* **Pass and fail twins:** every FO-13k line (1 to 6) and both migration lines (empty and demo copy; diff) have a real pass and a real fail case. The weak spots are in m5.

## Findings
**Blocker**
* **B1. The existing suite `check_prisma_schema.ts` goes red.**
  * Where: `prisma/schema/platform-register.prisma:1` reads `// platform-register.prisma: complaints (…). Owner: Lead B (platform, contracts §9)`.
  * The suite requires `^// <file> — .+ Owner: .+\.\n` (`tests/check_prisma_schema.ts:61`): an em dash after the file name and a final full stop.
  * The brief's wording used a colon, but "every existing suite passes unchanged" binds.
  * Fix: `// platform-register.prisma — complaints (later data requests, legal holds, breaches). Owner: Lead B (platform, contracts §9).`

**Major**
* **M1. The tech lead's answer to Q1 (PR comment, 13:20Z) is not in the commit.** It is binding for this row.
  * The migration adds no `platform_role_permission` rows: `agent/complaint:record` for OWNER, ADMIN and CASE_MANAGER, and `agent/complaint:read` for OWNER and ADMIN.
  * The suite has no per-role pass and fail test. Tests :101-106 hand the keys straight to `fakeStaff`, so no real role reaches "visible to Owner and Admin".
  * Failing case: any CASE_OFFICER, CASE_MANAGER or ADMIN role mapping currently resolves to neither key.
  * Fix:
    * Add the four or five catalogue rows. These are the lead's written P-600 (b) exception, and the release holder reads them.
    * Add a test per role: Owner, Admin and Case Manager may record and the others are refused; Owner and Admin may read and the others get 404.

**Minor**
* **m1. Mismatches with PF-0p's brief signatures:**
  * `registerComplaintJobs` calls `jobs.handle(...)` (complaints.ts:292-294). PF-0p's `JobPort` has only `enqueue`, `schedule`, `cancel` and `recurring`; `handle` exists only in the local stand-in.
  * The reminder `mail.send` (:285) omits `replyTo`, which PF-0p lists as a field and does not mark optional.
  * Fix: ask PF-0p how a job's worker is registered, and align both calls when PF-0p lands.
* **m2. A malformed id answers 500 instead of 404.**
  * `lock()` (:126) and `get()` (:160) accept `^[0-9a-f-]{36}$`, then cast to uuid.
  * Failing case: `get(owner, "------------------------------------")` and `get(owner, "abcdabcdabcdabcdabcdabcdabcdabcd----")` both throw a Prisma "invalid input syntax for type uuid" error, which is 500 once routed.
  * Fix: use the strict `uuid` pattern from :50.
* **m3. An impossible date is shifted, not refused.**
  * `instant` (:49) relies on `Date.parse`.
  * Failing case: `receivedAt: "2026-02-30T10:00:00Z"` is stored as `2026-03-02T10:00:00Z`.
  * Fix: round-trip the date part and answer 422 at the field.
* **m4. Side effects run inside the database transaction.**
  * The reminder sends its mail before commit (:285): a send failure rolls back, and a commit failure after sending resends on retry.
  * `jobs.cancel` runs in `after` before commit (:187, :207, :261): if the commit then fails, an unacknowledged complaint loses its reminder.
  * The job already re-checks state, so cancel (and send) can run after commit.
* **m5. Tests that would stay green if their rule were removed:**
  * (a) Lines :243-244 (no names in audit) and :154 (mail) have nothing to catch. No complaint recorded through the service has a `complainantName`: the only one, at :125, is refused. Putting `complainantName` into audit `detail` or the mail would stay green. Record one OTHER_PERSON complaint by the service and assert its name appears in neither.
  * (b) No business-day case crosses daylight saving. Every date in :140-144 falls after 1 Nov. The code is right (probe above).
  * (c) Nothing tests a race. Removing `FOR UPDATE` (:127, :277) or `FOR SHARE` (migration :180) leaves 56/56.
  * (d) Two database rules have no test: RECEIVED-first (migration :182) and the second `responseSent` (409 at :230, trigger :166).
* **m6. `list()` silently caps at 500 rows** (:174). It has no cursor and no "more" signal, and the closed view only grows. Nothing tells the caller older complaints are missing.

## Merge preconditions (known; not counted as findings)
* `prototype/studio/ports/` is local and uncommitted (`.git/info/exclude`). At this commit, CI's `types` job and `check_pf21_complaints.ts` would hit TS2307 on `../../../../ports/*.ts`. Merge main once PF-0p is on it, then re-run.
* Still to come, as the tech lead agreed:
  * the `complaint.received` and `complaint.closed` outbox events, which wait on FO-1a #1742;
  * the controllers and `api/src/features/platform-complaints.ts`, which wait on PF-4 #1744;
  * the College by-laws, so the fields stay Sample.

## Could not check
* `graph.mjs`: it rewrites `qa/GRAPH.md` and `graph.json`, and this review may write only this file.
* Demo reset (`check_s7_reset`, `check_d1_reset_to_six`) and C10.1: not run. The new rows carry no `workspace_id`, and the demo seed writes no complaint.
* CI on this head: every job was skipped (draft); only `guard` ran green.

For commit 5eca10767e7737a4cac403a17def7ec2429d886c: fix B1 and M1. The m1-m6 fixes are recommended; they do not hold the label.

Verdict: Block

## Round 2 (diff-only, 540ebf88c)

Reviewer (did not build it), 14 Nov 2026. Commit **540ebf88c63589b647965d50d77cc70748570dcd**. Read: the builder's six commits since 5eca1076 (`c276ebbe5`, `e599e2a31`, `a3f708b8f`, `353fba67e`, `38afab3da`, `540ebf88c`), diffed on PF-21's files only. `origin/main` is an ancestor of HEAD. Against `origin/main`, `platform.prisma` adds exactly two lines (under the kept `register (PF-21)` slot comments), `ports/events.ts` adds two `EVENT` lines and two shapes, and `check_pf3` adds only the `ADDED_BY_LATER_ROWS` filter. Journey score: **n/a** (no screen). D1–D20 and BIC are N/A.

### What I ran (studio/, 127.0.0.1:54329 scratch databases only, all dropped; never :4400, never `xr_studio_demo`)
* `npx tsx tests/check_pf21_complaints.ts`: **90 passed, 0 failed**.
* `npx tsx tests/check_pf0p_ports.ts`: **71 passed, 0 failed** (each slot comment still appears once).
* `npx tsx tests/check_pf3_platform_schema.ts`: **75 passed, 0 failed**.
* `npx tsx tests/check_prisma_schema.ts`: **8 passed, 0 failed** (B1's rule line passes; the M lines pass).
* `npx tsc -p api/tsconfig.json 2>&1 | grep -E "complaints|pf21|ports/"`: **0 lines**.
* My probe on `xr_studio_rev2_pf21_*` (script in the session scratchpad; it drives the service through PF-0p's fakes):
  * P1, the mail fails once: the job fails, 1 `REMINDER_SENT` event, the retry answers `skipped`, **0 mails ever sent**.
  * P2, the handler and every Owner and Admin are deactivated: the job is `done` with 0 mails, and `REMINDER_SENT` carries `recipients: 0`.
  * P3, two psql sessions insert ACKNOWLEDGED for the same complaint at once: one commits and one is refused "recorded once". The event lock holds.

### Round 1, item by item
**Review:**
* B1: closed (`platform-register.prisma:1`; check_prisma_schema 8/8).
* M1: closed. Five catalogue rows (migration:256-258). Per-role pass and fail tests for record and read take the keys from the real catalogue (test:269-283).
* m1: closed. PF-0p's `JobPort.handle` exists (ports/jobs.ts), and `replyTo` is given.
* m2 and m3: closed (test:285-294).
* m4: closed: cancel, schedule and send now run after commit. That fix opens R2-M1 below; my round-1 advice to send after commit missed this case.
* m5: (a), (b) and (d) closed. (c) is closed for close‖close and close‖step on two connections (test:342-352). The reminder race is not tested, but the database's "once" trigger backs it.
* m6: closed (cursor pages, test:385-401).

**Breaker:**
* M1 (events): closed (test:404-424).
* m1(a) and m1(b): closed.
* m2, m3, m4, m7, m8, m9 and m10: closed, each with a test.
* m5: closed: a row change needs its event, one-time events are written once, RECEIVED is checked at commit, events are locked per complaint, and dates must fall from 2000 on and in order. P3 confirms the lock.
* m6: deferred to PF-12's role posture, named at migration:145-146.
* m11: recorded in comments (complaints.ts:1-10; the handler acts per Lead 47).
* m12: closed. Two slot lines per Lead 47 (3); `plat_complaint_has_text` and `plat_complaint_one_line` are the row's own names.

### Checks asked for
* **After-commit work:** cancel and schedule are correct (test:355-363). The mail is not (R2-M1).
* **Event-before-row triggers (migration:159-207):** correct. The deferred RECEIVED trigger (:210-217) has its fail test (test:331-332).
* **Event lock (:228):** works (P3), but has no fail test (R2-m3).
* **Date order:** checked in both the service and the database.
* **Cursor list:** correct. The order and the keyset agree for both sorts; times are kept to the millisecond.
* **Inactive-handler fallback:** correct apart from R2-m1.
* **Daylight saving:** the gap and the repeated hour are handled, and skipped days are dropped (business-days.ts:35-58).
* **Outbox payloads:**
  * They are ids and enums only. Both outbox rows are written last, in the same transaction.
  * A rolled-back change writes none (test:419-424).
  * No name, contact or summary reaches the audit lines, the events, the job payloads or the mail (test:367-372; my reading).
* **P-600:**
  * The stamp `20261114200000` is later than `20261114153000_fo1a_front_office_sales`.
  * Every function and constraint is `plat_`.
  * `migrate diff` is empty for plat_.
  * The only additions outside the row's own tables are the two slot lines and the five catalogue rows Lead 47 allowed.
* **Calls against main's real `ports/*`:**
  * `AuditPort.record(tx, …)` passes the entity `plat_complaint`, which matches `AREA_ENTITY`.
  * `JobPort.schedule`, `cancel` and `handle` are called with `JobOptions {key, firmId}`, and the key carries a uuid.
  * `MailPort.send` passes only fields of its strict shape.
  * The calls match.

### Findings
**Major**
* **R2-M1. A failed reminder mail is recorded as sent, and the reminder is never sent.** (FO-13k line 2, "the reminder fires once".)
  * Where: `complaints.ts:360` commits `REMINDER_SENT` and the `complaint.reminder` audit line ("Acknowledgement reminder sent to the handler"). The mail goes only after the commit (:368). When it fails, every retry stops at :351 ("skipped").
  * MailPort says it "Throws when refused or not sent". Probe P1 shows the outcome: the immutable register and the audit trail state a reminder that never went, and none ever goes. The comment at :340-343 ("the job runs again") does not hold.
  * Fix: send inside the transaction after the event insert. A send failure then rolls back and the queue retries; a commit failure after a send gives at worst one repeated reminder. Alternatively, write `REMINDER_SENT` only after the send succeeds.
  * Test needed: `fakeMail({ failOn })` fails once, then succeeds. Expect 1 mail and 1 `REMINDER_SENT`. Today this gives 0 and 1.

**Minor**
* **R2-m1. A reminder can go to nobody.**
  * Where: `complaints.ts:353-366`. With the handler inactive and no active Owner or Admin, `to` is empty. The run still records `REMINDER_SENT` (recipients 0), audits "sent to the firm's Owners and Admins" and returns `sent` (P2).
  * Fix: when `to` is empty, skip without recording (or record it as not delivered).
* **R2-m2. The reminder's mail class is wrong.** :368 sends it as `TRANSACTIONAL`. `ports/mail.ts:8-9` defines TRANSACTIONAL as "a person's own action" and lists reminders under SERVICE. Fix: `class: "SERVICE"`.
* **R2-m3. The event trigger's lock (migration:228) has no fail test.** Every concurrent test goes through the service, which locks first. Removing the `FOR UPDATE` leaves 90/90 green. Fix: add P3 as a check (two raw sessions, one one-time event).

**Note, not a finding:** `jobs.schedule` after commit (:201) has no recovery if the process stops between the commit and the call. JobPort takes no `tx`, so this belongs to PF-14's outbox and queue.

### Could not check
* `graph.mjs`: it rewrites `qa/GRAPH.md`, and this review may write only this file.
* CI on this head.
* Demo reset suites (no complaint rows are seeded; unchanged from round 1).

For commit 540ebf88c63589b647965d50d77cc70748570dcd: fix R2-M1, with its pass and fail test. R2-m1 to R2-m3 are recommended and do not hold the label.

Verdict: Block

## Round 3 (diff-only, 4688525)

Reviewer (did not build it), 14 Nov 2026. Commit **4688525582d219e8194714b4917c63f81be41855**. Read only `git diff 540ebf88c..4688525` on `complaints.ts`, the migration and `check_pf21_complaints.ts` (Lead 49). Journey score: **n/a** (no screen).

### What I ran (studio/, 127.0.0.1:54329 scratch databases only, all dropped; never :4400)
* `check_pf21_complaints`: **107 passed, 0 failed**.
* `check_pf0p_ports`: **71/71**.
* `check_pf3_platform_schema`: **75/75**.
* `check_prisma_schema`: **8/8**.
* The tsc grep for `complaints|pf21|ports/`: **0 lines**.
* Text rules, service against database: a scratch database holding only the migration's two functions, `plat_complaint_has_text` and `plat_complaint_one_line`. I ran them on every code point U+0001–U+10FFFF (surrogates skipped) and compared each with the service's `BLANK`, `SEEN`, `CONTROL` and `LINE_BREAK` (copied verbatim; Node uses Unicode 17.0, the cluster 16.0):
  * One-line rule: identical on every code point. Direction overrides and isolates are refused by both.
  * Text rule: differs on 6,116 code points (R3-m1).
* CI's Postgres is 18 (`cloud-setup.sh`), so `pg_c_utf8` (needs 17 or later) is available. The audit adapter takes no lock, so sending mail inside the run holds only that complaint's row lock.

### Round 2, item by item
* **R2-M1: closed.**
  * The mail is sent inside the run's transaction, after the `REMINDER_SENT` event and the audit line (complaints.ts:384).
  * A failed send rolls back both and rethrows, so the queue runs it again.
  * The fail-then-pass test: a failed run leaves 0 events and 0 mails; the next run sends 1 mail with 1 event; a third run is skipped.
  * Repeating a mail when the commit fails after the send is documented, and is the right trade.
* **R2-m1: closed.** With no active handler, Owner or Admin, the reminder goes to the firm's contact address. `sentTo` is recorded on the event and the audit line (test: `firm_contact`).
* **R2-m2: closed.** The class is `SERVICE`, with a test.
* **R2-m3: closed.** A raw STEP racing a raw close is seen waiting on the lock in `pg_stat_activity`, then refused.

### Breaker's round 2 fixes in this diff
* **`reminderScheduled`:** a queue failure after commit answers `false`, never a 500 that would invite a second record (:214). A failed cancel is caught; the run skips an acknowledged or closed complaint. Tested both ways.
* **Uuids:** they use zod's own uuid rule, so an id the service accepts never fails the event shape. A non-RFC id gives 422 on record and 404 on get (tested).
* **Year floor:** the floor is checked in UTC: `2000-01-01T00:30+05:00` → 422. This matches the database check.
* **Text rule:** blanks are stripped, then a letter, digit, punctuation mark or symbol is required, via `pg_c_utf8` in SQL. The strip lists are the same in both, and every class is ASCII-escaped (migration:114-121). The breaker's ten exotic summaries are refused by both, and Arabic, Chinese, "Zoë", "42", "€" and an emoji pass both. Exact equality does not hold (R3-m1).
* **Direction marks in names:** refused by both (tested).
* **`plat_complaint_event_once` (:259):** a partial unique index, firm-first. A second ACKNOWLEDGED under REPEATABLE READ is refused, and one stays (tested). `migrate diff` is still empty for plat_.
* **`plat_complaint_event_applied` (:278):** deferred. It refuses a stray CLOSED, ACKNOWLEDGED or HANDLER_CHANGED with no row change; the HANDLER_CHANGED check applies to the newest such event. The service path passes (tested).
* **Forced seq (:231):** a given `-1` is replaced by the database's own number (tested).

### Findings
**Blocker: none. Major: none.**

**Minor**
* **R3-m1. The service and database text rules are close but not equal** (complaints.ts:57 against migration:114-117).
  * 1,365 code points pass the database but not the service. They are combining marks (Mn/Mc) with the Unicode Alphabetic property, for example U+0363 and Hebrew points from U+05B0. The service is stricter here, so it answers 422 first; nothing breaks.
  * 4,751 code points pass the service but not the database. They are Unicode 17 additions (mostly CJK Extension J, U+32400 on; plus U+20C1) that PG 18's Unicode 16 does not know. A summary made *only* of such characters would pass the service and then fail the database check, which is a 500, not a 422.
  * Realistic text mixes in common characters and passes both.
  * Fix (optional): use `\p{Alphabetic}` in place of `\p{L}\p{Nl}` to match `[:alpha:]`, and correct the comment "the same" to "the same up to Unicode version drift". A database check violation could also be mapped to a 422.

**Note, not a finding:** in `plat_complaint_event_write`, `nextval` runs before the trigger's `FOR UPDATE` (:231 then :232). Two raw inserts racing on one complaint could in theory commit out of seq order. Service writes lock first, and row-lock waiters are served in order, so I found no reachable case. Taking the number after the lock would make the order certain.

### Could not check
* `graph.mjs` (it rewrites `qa/GRAPH.md`).
* CI on this head.

For commit 4688525582d219e8194714b4917c63f81be41855: no Blocker or Major is open. R3-m1 is optional and does not hold the label.

Verdict: Approve

**Merge db7f992: conflict resolution checked.** I checked merge `db7f9927170b60f8ffe9648358b17667f39ca3b2` (parents `fab1031a8` and main `b91ab10ad`) in two ways:
* **`ports/events.ts`:** `git show --cc` shows a pure union. No line was removed or edited from either side, and no new line came from the resolution. The added lines are PF-4's `STAFF_ROLES_CHANGED`, `STAFF_DEACTIVATED` and `StaffEventPayload`/`StaffRolesChanged`/`StaffDeactivated` (main's, first) and PF-21's `COMPLAINT_RECEIVED`/`COMPLAINT_CLOSED`, `ComplaintReceived` and `ComplaintClosed`, unchanged.
* **PF-21's own files:** `git diff 4688525..db7f992` on the complaints folder, the migration, `platform-register.prisma` and `check_pf21_complaints.ts` is empty. The approved code is unchanged.

Re-run on db7f992: `check_pf21_complaints` 107/107, `check_pf0p_ports` 71/71, and the tsc grep for `complaints|pf21|ports/` printed 0 lines.

Verdict: Approve (for db7f9927170b60f8ffe9648358b17667f39ca3b2)

### Re-stamp 8961aa7
* **The change since c6d04bf (`git diff -M` on PF-21's files):** only the migration folder's rename `20261114200000_pf21_complaints` → `20261114214500_pf21_complaints` (similarity 100%), plus the folder name in `platform-register.prisma`'s comment and `NEW` in `check_pf21_complaints.ts`, one line each. `platform.prisma` changed too, from the clean merge of main. Against `origin/main` it still differs only by PF-21's two back-relation lines, and against main the migrations and `ports/` add only PF-21's folder and its event lines.
* **The new stamp:** `20261114214500` is later than every migration on main; the newest is `20261114210000_fo5_retainer_tables`, and main is merged into the head. That no open PR uses `20261114214500` is the coordinator's list (#1754/#1755 at 190000, #1758 at 131305, #1763 at 230000); I did not check it myself.
* **Re-run:** `check_pf21_complaints` gives **107/107**. The P-600 (4) check names `20261114210000_fo5_retainer_tables` as the newest before PF-21, and `migrate diff` names no plat_ table or type on both the empty and the demo-data copies.

Verdict: Approve (for 8961aa76f8564787219387a4cf92738de4fabe26)

### CI fix, re-stamp and PF-25 line (5f9772c)
* **Diff since ac89de4, read against `origin/main`:**
  * The migration moved `20261114214500` → `20261114234500` with identical contents.
  * `NEW` and the schema comment follow it, one line each.
  * The other change in `check_pf21` is lines 98-105.
  * `check_pf25_web_address.ts` differs from main only at :89-90.
  * Nothing else in PF-21's files changed. The stamp is later than main's newest, `20261114230000_pf25_web_address`.
* **The new measurement is sound:**
  * `fnBefore` and `before` are read before PF-21's migration. `added` and `rowsAfterOwn` are read right after it, before any later migration.
  * A non-plat_ function in PF-21's own migration still fails the line, and the rows check compares only before and after its own migration.
  * `migrate diff` and the index checks still run after every migration.
* **PF-25 line (Minor, not holding the label):** the rule is kept as rows rev 16.7 states it.
  * `(all.filter(d => d < NEW).at(-1) ?? "") < NEW` is true by construction, so the line can now fail only on a missing or repeated stamp. PF-21's own line adds a floor (`>= …fo1a…`).
  * Fix (optional): add `>= "20261114210000_fo5_retainer_tables"`, the newest when PF-25 was stamped, so the line keeps a real check.
* **Re-run:** `check_pf21_complaints` gives **107/107**. `check_pf25_web_address` gives **68/68**, run with `--tsconfig api/tsconfig.json` as `run-suites.sh` does.

Verdict: Approve (for 5f9772c423dc6c380c62198d5de2fd8fb4ce65f3)

### Merge 1e5a41b (FO-3, PF-4t)
* **`ports/events.ts`:** `git show --cc` shows a union. FO-3's five `BOOKING_*` names and `BookingEvent` come first, then PF-21's two `COMPLAINT_*` names and shapes. Nothing is removed or edited on either side; the resolution adds only one blank line. `git diff origin/main 1e5a41b` on the file shows only PF-21's own lines.
* **PF-21's files:** `git diff 9efaccc..1e5a41b` on the complaints folder, `20261114234500_pf21_complaints`, `platform-register.prisma` and `check_pf21_complaints.ts` is empty.
* **Stamp:** `20261114234500` is still later than main's newest, `20261114230000_pf25_web_address`, and main is in the merge.
* **Re-run:** `api/tsconfig.json` now includes `src/platform/**`, and the tsc grep for `complaints|pf21|ports/events` printed 0 lines. `check_pf21_complaints` gives 107/107.

Verdict: Approve (for 1e5a41b0a98b44d6238014065a22f0ae66febd86)
