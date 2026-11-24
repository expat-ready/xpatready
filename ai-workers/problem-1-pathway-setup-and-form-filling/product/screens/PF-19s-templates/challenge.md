# PF-19s challenge (fresh challenger, 23 Nov; skill screen-concept §B)

Read: concept.md; AG-12 v2.11 §3.1, §3.5, §3.8, §4.1-4.10, §10; SA-05 v3.9 §3.6.1, A.1; PF-19a and PF-12 migrations; send path; leads
read path. `ai-workers/tools/freshness.sh` cannot run in this cloud copy (no `code/`): the team's code is **Unverified**; the
requirement copy is `domain/requirements-2026-11-02`.

## Verdict
**Build after these changes.** The slice is the right size and the tables fit, but as written "Publish" would change nothing a
lead receives and "ExpatReady's wording" would not be sendable at all.

## Objections
**B1 Blocker: the starters live only in code, so the send path cannot use them, and nothing sends these keys (Needed for the proof).**
Send looks up `msg_template_version` rows only (firm row first, else a PLATFORM row: `api/src/platform/messages/send/messages.ts:104-108`)
and refuses when none exists. Starters in `registry.ts` are not rows, so an unchanged template is unsendable (breaks AG-12-44), and
no caller sends `lead.follow_up` / `lead.going_cold` / `lead.acknowledgement` (grep of `templateKey` in `api/src`: none). The footer
"Publishing makes this the wording your firm sends from the next message" is untrue: scaffolding standing in for a capability (P-33).
Fix: (a) store the three starters as PLATFORM rows (`owner PLATFORM`, `firm_id NULL`, `channel EMAIL`, `language 'en'`, `kind`
set, version 1, `published_by 'seed:sa05-a1'`) in a data-only migration (PF-12's `pf12_platform_read` lets firms read them; the
app role cannot write firm-less rows, `pf12_firm_walls/migration.sql:217-224`); (b) the firm row uses the same key, `EMAIL`, `en`,
so the send path's `owner desc, version desc` picks it; (c) add a test that `MessagePort.send({templateKey:'lead.follow_up'})`
uses the PLATFORM version before publish and the firm version after (outbox `template_version_id`). Keep the footer copy only if
(c) passes; it is still honest that no automation sends it yet, so say "the wording used when this message is sent".
No conflict with PF-19a keys: firm rows hit `msg_template_firm_id_key_channel_language_key`, platform rows the partial
`msg_template_platform_key`; `msg_template_version_in_firm` and `msg_outbox_template_in_firm` hold if firm_id is copied.

**M1 Major: first publish for a firm without `msg_firm` fails (Needed for the proof).** `msg_template.firm_id` keys on `msg_firm`
(`pf19a migration.sql:268`); a firm that never sent a message has no row. Fix: call `ensureMessagesFirm(tx, firmId)`
(`consent/messages-firm.ts`) first in the publish transaction; test with a fresh firm.

**M2 Major: BR-4 has a race that ends in a 500 (Needed for the proof, AG-12-69).** Read-then-compare `baseVersion` leaves a window;
two first saves collide on the template unique key, two later saves on `(firm_id, template_id, version)`, both Prisma P2002. Fix:
`pg_advisory_xact_lock(hashtext('msg_template:'||firm||':'||key))` in the transaction, then compare; map any P2002 to the 409; first
save sends `baseVersion: 0`. Test: two parallel PUTs from the same base, one 200, one 409, one new version.

**M3 Major: a raw placeholder can reach a lead (Needed for the proof, SA-05 §3.6.1 "a raw placeholder … is never sent").**
`fillFields` replaces only `{{ [a-z][a-z0-9_]* }}` (`ports/messages.ts:103`); `{{ Lead.Name }}`, `{{lead-name}}` or a stray `{{`
pass through as text. BR-1 must refuse any `{{` or `}}` not part of a known field token, not only regex matches. Fail tests for each.

**M4 Major: the preview's lead rule must reuse the leads read, not a copy (Needed for the proof, AG-12-89, §10).** The real rule
treats a lead whose owner is not ACTIVE as unassigned (`front-office/sales/leads.ts:116-117`); calling `visibilityOf`/`sees` with the
raw `ownerStaffId` diverges. Platform code also imports nothing from front-office today, and STANDARDS §2 forbids reading another
module's tables. Fix: a small port (e.g. `TemplateRecordsPort.find/search`) implemented in front-office sales over `LeadsService`'s
visible-lead check; preview and `records?q=` need `agent/template:preview` **and** `agent/prospect:show`; unseen = 404. Tests: own,
other's (404), inactive owner's, unassigned without `view.all`/`assign` (404).

**m1 Minor:** detail GET and the editor need `agent/template:show` (§10), not `:list`; publish needs `:edit` + `:publish` (as BR-3).
**m2 Minor:** Lead acknowledgement is an Automatic message (A.1 row 1, "Auto"), not Library (AG-12 §3.1): label the table
"Lead messages" or show "Automatic"/"Library" per row. Not built beyond that label.
**m3 Minor (retrofit):** field keys diverge from SA-05's dictionary (`lead.firstName` style); `fillFields` forbids dots, so keep
`lead_first_name` but put the dictionary key beside each in the registry (one mapping line each).
**m4 Minor:** BR-7's subject rule should match the send path exactly (control and line-separator characters,
`messages.ts:110`), and `msg_template.kind` needs a value ("library"/"automatic").

## What is sound
No schema change; write-once versions match `msg_template_version_write_once`; text-only preview (BR-6); Sample record without a
lead; role split matches §10 (Read-only: list and show, no preview); audit without wording; drafts, French, test send, history and
reset honestly deferred to PF-19c part 2; plain text box per R1.46 and P-630.

## Back-end plan (element → record → API → rule → test)
* List → PLATFORM starters + firm rows (EMAIL, en) → `GET /templates` (`:list`) → firm row wins → whose-wording per row.
* Editor → newest version (firm, else platform) → `GET /templates/:key` (`:show`) → canEdit = `:edit`+`:publish` → read-only roles.
* Publish → `ensureMessagesFirm`, lock, upsert firm `msg_template`, insert version n+1, audit → `PUT /templates/:key` → BR-1/4/7/8
  → unknown field, stray braces, conflict race, fresh firm, audit line, send uses the new version.
* Preview → port over leads read → `POST /templates/:key/preview`, `GET /templates/records?q=` (`:preview`+`agent/prospect:show`)
  → visible-lead rule, missing marked → own/other/inactive-owner/unassigned, `<script>` literal.

## Questions for the founder (≤3)
1. Seed ExpatReady's three lead starters as platform rows by a data-only migration (recommended: it is what makes "ExpatReady's
   wording" sendable) or keep them in code and leave the send path unable to use them until PF-19c part 2?

## Lead response
*Builder's response, 23 Nov, for the tech lead's approval (P-223 (4)):*
* **B1: answered partly in this PR, the rest is a question for the tech lead.** Seeding platform rows needs a migration. Migrations go through the Lead's read, one at a time (WAY-OF-WORKING "Shared files"), and R1.46's proof is the editor itself. So this PR keeps the starters in code and does three things: (a) the footer says "Publishing makes this the wording used when this message is sent", never that something sends it today; (b) a test runs the send path's own lookup query (copied from `send/messages.ts:104-106`, not a real send; review m1) and shows it picks the firm's new version after a publish; (c) the data-only migration seeding the three starters as PLATFORM rows goes to PF-19c part 2, raised as a question on the PR.
* M1 done: `ensureMessagesFirm` runs first in publish. M2 done: an advisory lock per firm and key wraps the compare and the insert, so the second save waits and gets the 409. The test fires two parallel PUTs.
* M3 done: a `{{ … }}` that is not a known field, and any lone `{{` or `}}`, refuse the publish by name. M4 done: the port `TemplateRecords` (platform) has its adapter in `front-office/sales/template-records.ts`. It treats a lead whose owner is inactive as unassigned, the leads read's rule, and uses `leadsSeenWhere` for the search. A real lead needs `agent/prospect:show` (404 otherwise).
* m1 done (show / edit+publish). m2 done: the table is "Lead messages" with a Kind column (Automatic / Library). m3 done: each field names its SA-05 dictionary key. m4 done: the send path's subject rule, and `kind` set to "automatic" or "library".

## Agreement
Built on the builder's recommendation: the tech lead did not object within 30 minutes of the PR question (05:06 UTC, #3179). B1's migration stays a question for the tech lead.

## Build discoveries
* PF-28's input sweep needs the body parsed at the route, with the template key checked first (404, then 422), and the sweep's `REAL` map now names `:key`.
* Breaker m1, m3: control and broken characters are now refused as 422s. m2: a long subject wraps. m6: the limit counts after line breaks are normalised. Review m2 (tokens) and m5 (trimmed one-line check) are fixed, and the preview is no longer a live region. Left as follow-ups for PF-19c part 2: breaker m4 (warn when a filled subject breaks the send rule) and m5 (a value holding `{{ }}`; a send-path change), review m3 (graph naming) and m4 (in-page confirm, shared with 14 files).
