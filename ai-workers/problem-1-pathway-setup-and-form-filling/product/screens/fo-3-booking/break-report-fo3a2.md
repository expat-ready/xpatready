# Break report: FO-3a part 2a (consult record, ConsultRecordPort), PR #2102 at a0bc261c7

Breaker, 17 Nov 2026. There is no screen, so the attacks were on the API and the database only. US$0, no model calls.
**How it was run.** All tests ran on a `git archive` copy of a0bc261c7 with its own `prisma generate`. The shared clone was not usable: during the session another agent edited `service.ts`, the migration, the schema and the test there without committing (a `version` column, case purpose first). It also regenerated the **shared** `node_modules/.prisma` client from that uncommitted schema at 13:36. Because of that, `check_fo3a2_consult_record` gave 12 passed / 9 failed (500s) in the shared tree mid-edit, and 21/21 on the clean copy.
The set-up comes from the builder's test: every migration on a scratch database `xr_studio_fo3a2brk_<pid>`, a Nest app with PF-4's guard, the local sign-in, the six roles, firm B, and the real `auditEvent` adapter so the audit rows can be read in SQL. The script (not committed) is `<scratchpad>/brk/head/…/studio/brk/fo3a2_break.mts`. Run it with `node_modules/.bin/tsx --tsconfig api/tsconfig.json brk/fo3a2_break.mts` from the studio folder of that copy. No copy was started on a port, because a port copy would serve the shared tree's uncommitted code. `check_pf12_walls` (100/0, which boots the real API with this feature) stands in for it.

## Findings

**M1 Major: two sessions saving the same record lose one save without a word.**
- Steps: Owner and Case Officer both GET the record. Owner PUTs `{notes:"Owner's important notes", fee 100 CAD}` and gets 200. The Case Officer then PUTs `{notes:<the notes they read>, quotedFeeMinor:350000, CAD}` and also gets 200.
- Result: the stored notes are "base" and the fee is 350000. The Owner's notes are gone, nothing reports it, and the body has no `version` field.
- Expected (STANDARDS §4 [M]): a stale save gets 409 with what changed.
- Where: `service.ts:110-116`, which replaces the record with no version check.
- Note: concept line 39 says "no staff booking write sends a version yet". This is a new table, though, and the PUT replaces the whole record, so every concurrent save is a full overwrite. Lead B to rule. (An uncommitted fix is in the shared tree; it is not on head.)

**M2 Major: a case call for a person with an open prospect offers "Prepare retainer" and tells FO-5 it is a prospect.**
- Steps: a CASE_REVIEW booking for a person with an open prospect. Staff create links `prospectId` (`f18f55bb…`). Mark it Attended, then PUT.
- Result: 200 with `partyRef {kind:"prospect"}` and `nextSteps ["PREPARE_RETAINER"]`. `ConsultRecordPort.read` also returns `kind:"prospect"`.
- Expected (AG-4-50 rule 3; AG-4-49 rule 8 and its test "a case booking … offers no Prepare retainer button"): `kind:"client"` and no retainer step.
- Where: `service.ts:65-66`, where `partyOf` checks the prospect before the case purpose.

**m1 Minor: a NUL character returns 500.**
- Steps: PUT `notes:"before\u0000after"`, or `recommended:["a\u0000b"]`.
- Result: 500 "Internal server error", not a 400 problem. Nothing is saved, because the transaction rolls back.
- Where: `service.ts:54-55`. Zod lets `\u0000` through and PostgreSQL text rejects it.

**m2 Minor: the database accepts a currency with no fee.**
- Steps: `UPDATE fo_consult_record SET quoted_fee_minor=NULL, quoted_fee_currency='CAD'`.
- Result: accepted. The check evaluates `false OR (NULL AND true)`, which is NULL, and a NULL check passes.
- Expected: the migration header says "a currency only with a fee", so the database should refuse it. The builder's own refusal list never tries this case. The API never writes such a row, and GET and the port show `quotedFee:null`.
- Where: `migration.sql:47-48`. A check such as `(fee IS NULL) = (cur IS NULL) AND (fee IS NULL OR fee >= 0)` would refuse it.

**m3 Minor: the database accepts a 2-D `recommended`, and GET then returns 500.**
- Steps: `UPDATE … SET recommended = ARRAY[['a','b'],['c','d']]` is accepted, because `cardinality` counts 4 items. GET on that record then returns 500.
- Where: `migration.sql:42-45`. The function has no `array_ndims` check.

**m4 Minor: the API counts UTF-16 code units, the database counts characters.**
- Results:
  - Notes of 5,001 emoji are refused (400 "<=10000 characters"), although that is 5,001 characters.
  - A recommended item of 61 emoji is refused at "<=120".
  - The database accepts 10,000 emoji. GET then returns notes of length 20,000, which the API itself refuses if the same record is saved back unchanged.
- Where: `service.ts:54-55` (zod `.max` counts UTF-16 units) against `char_length` in the migration.

**m5 Minor: recommended duplicates that differ by case, spacing or Unicode form are all kept, and invisible items are accepted.**
- Results:
  - `["Work permit","work permit","WORK PERMIT"]` keeps all 3.
  - `"Work  permit"` (two spaces) is kept next to "Work permit".
  - "Québec" in NFC and NFD forms is kept twice.
  - A zero-width-space-only item `["​"]` saves (API and database).
  - Notes of `"   "` and `""` are stored as they are, not as null.
- Where: `service.ts:110`. `new Set` compares exact strings only, after `trim`.

**m6 Minor: a body that is not JSON wipes the record.**
- Steps and results:
  - PUT with `content-type: text/plain` and body `{"notes":"typed"}` gives 200. The record is replaced with defaults (notes null, items `[]`, fee null).
  - `{"__proto__":{"admin":true}}` gives 200 and the same wipe: the strict object does not refuse the key. No prototype pollution was seen.
- Expected: 415 or 400.
- Where: `controller.ts:28` (`body ?? {}`) and `service.ts:98`.

**m7 Minor: the port's contract differs between the adapter and the fake, and the PF-0c gate cannot see the adapter.**
- Results:
  - `adapter.read(db, "x" | "" | null, id)` throws `FirmScopeError`. `fakeConsultRecords().read(null, "x", id)` returns null.
  - The contract case is inline in the test, not in `ports/contracts/consult-record-port.contract.ts` with `runContract` (P-606 (8)).
  - `tools/check-port-contracts.mjs --list` prints "ConsultRecordPort … contract: none … runs it in: nothing" and still exits 0. The factory `consultRecordPort = (svc): ConsultRecordPort<…> =>` is not one of the adapter shapes it looks for.
- Where: `port.ts`, `service.ts:130`, `ports/consult-record.ts:46-49`.

**m8 Minor (a conflict between documents, for the founder or Lead B): Read-only cannot read a record of a booking it can see.**
- Steps: Read-only (holds `agent/booking:list`) runs GET.
- Result: 403 "This needs the permission agent/booking:edit".
- Requirement: AG-4-49 §8 says "Seeing it follows the booking (AG-4-67)".
- What the build follows: the concept's access line ("consult record `agent/booking:edit`") and the builder's DW3, so this is not a break of the concept. Raised here so it is not settled silently (AGENTS rule 2).
- Where: `service.ts:144`.

## What held (no break found)
- **Cancelled and not attended:** PUT on a cancelled booking returns 409 CANCELLED. Cancelling an Attended booking returns 409, so a record never ends up on a cancelled booking. Not answered and No-show return 409.
- **Fee:** these are refused with 400: -1, 1e12, 1e9+1, 1e300, "15000", 150.5, "cad". These save: 0, 1e9, -0 (saved as 0). A currency sent with a null fee is dropped.
- **Another firm:** firm A's Owner gets 404 on GET and PUT of firm B's booking, upper-case id included. B's record is untouched. B's Owner gets 404 on A's.
- **Race of 10 PUTs:** with no record yet, two roles: all 200, **one record**, **10 audit lines** (1 created, 9 changed).
- **PUT racing No-show** (×5, twice): always consistent. Either 200 then No-show (the record stays, `attendanceChanged:"NO_SHOW"`, no steps), or 409 and no record.
- **Ids:** `x`, nil UUID, trailing `x` or `%0A`, a leading space, SQL-like and `../` ids all return 404. An upper-case id reaches the same booking and record, never a second record.
- **Notes:** 10,000 saves and 10,001 returns 400. 10,000 CJK characters save, and RTL and combining marks are kept. A number returns 400. A null `timeSpentMinutes` or `recommended` returns 400.
- **Recommended:** blank, NBSP-only, 121 characters, 21 items (even 21 copies of one item), null and a number all return 400. Exact and trim duplicates collapse. HTML is stored as text.
- **Booking with no person:** 200 with `partyRef:null` and no steps. The port's answer passes `ConsultRecordRead`.
- **Roles:** Owner, Admin, Case Manager, Case Officer: 200 with both lead steps. Billing and finance (not host): 404. Read-only: 403. No role, not host: 404. No role or Read-only as host: 200, `nextSteps:[]`. Firm B's Owner: 404. No or bad token: 401.
- **Port:**
  - Another firm's record id returns null in both directions. Upper-case record and firm ids are read correctly.
  - Inside a transaction it sees that transaction's own uncommitted change; outside, it does not.
  - On the walled pool: under `withFirm(B)` with firm A's id it returns null; under `withFirm(A)` it reads; with no firm it returns null.
- **PF-12 wall** (psql as `xr_app`):
  - With no firm, the count is 0. Firm B sees only its own row, and an UPDATE of firm A's rows changes nothing.
  - An INSERT for another firm or with no firm, and moving `firm_id`, are each refused.
  - Row-level security is forced and `0_pf12_firm_first` is present. `check_pf12_walls` passed 100/0 in the live tree. In the archive copy, 5 cases failed only because the copy cannot boot the API (`ERR_MODULE_NOT_FOUND`).
- **Nothing sent, notes never audited:** 3 saves left `module_event` (43), `msg_outbox` (0), mail (57) and jobs unchanged. 50 audit rows were checked: none holds the notes' text, an email or a phone number from the notes, and every row carries its own firm.
- **Body and routes:** an array, `null`, a string or bad JSON returns 400. 2 MB returns 413. POST, PATCH and DELETE return 404. Minutes 1440 save; 1441, 1.5 and "30" return 400. The database refuses a NULL `recommended`.
- **Schema and suites:** `prisma migrate diff` from the migrated database to `prisma/schema` is empty (no drift). `check_fo3a2_consult_record` passed 21/21 and `check_fo3sr_routes` 29/29 on the clean head.
- **Not tested:** the staff feed (part 2b), as the brief says.
