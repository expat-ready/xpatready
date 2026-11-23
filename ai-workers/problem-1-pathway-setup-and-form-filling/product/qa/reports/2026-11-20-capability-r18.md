# qa capability R1.8 Audit trail nobody can edit — 20 Nov 2026 (qa lane; Lead 2 (series 3)'s Wave 1 ask; Opus 5.5, medium; US$0, live AI off)

Main tested: **568e240fd** (20 Nov 09:01 UTC). Every part merged: AUD-1a #2003, AUD-1b #2124, AUD-1m parts 1, 2a, 2b, 2c (#2214, #2289, #2338, #2423, which carried J-8 with "Completes: R1.8"), so scored (P-606).

## Verdict: **Partial** (was Partial, parts missing; now scored)

**Journey runs (P-339):**
* **Run cited by the Lead, 44701378950 (`walk j_8` job 136170595156): green, but not on main's head.** It ran on PR branch `claude/jolly-euler-jtwv60` at 7d79ed88f (#2456's head, since merged), not main. It is an ancestor of main, but 41 studio files changed between it and main 568e240fd. P-339 needs the walk on main's head on GitHub's runners: **Question for the tech lead** on the PR (a walks dispatch on main, P-439).
* **Independent re-run by qa (P-290), this container, isolated copies, main 568e240fd, j_8 twice:** 28/28 PASS, exit 0, twice (each on a fresh isolated copy, `tsx … tests/journeys/j_8.ts` run directly per its header line 25, no video recorder; a first walk.mjs attempt reached 17 PASS 0 FAIL then crashed on this container's missing ffmpeg for video: environment, not the app).
* **Fresh Opus reader (P-303), read only:** "Verdict: Partial", confidence medium-high. qa checked its main claims in the code (below).

| Done-when clause | Status on main 568e240fd | Evidence |
|---|---|---|
| UPDATE or DELETE on the audit table refused by the database even for the app's role (fail case) | **Works** | `prisma/migrations/20261117124500_aud1a_audit_insert_only/migration.sql`: UPDATE and TRUNCATE revoked from xr_app and xr_data; trigger `aud_event_no_change` refuses every UPDATE and every DELETE except the demo reset's on Sample lines (a departure recorded as "Unconfirmed: no counsel"). `check_aud1a_insert_only.ts:128-140` (as xr_app); J-8 DW3. |
| A line with another firm's id refused | **Works for PF/FO lines, at the adapter; not on the case side** | `api/src/platform/audit/audit-event.ts:47` refuses a line naming another firm when the request or job has a firm; `check_aud1b_adapter.ts:146-168`; J-8 DW4 (in-process). Case lines take the request's firm, and the case routes name none yet, so case lines are written with firm null (`audit-event.ts:64-80`, `ports/audit.ts:57`: "null outside both, until CS-W1"): the wall cannot apply to them. The database itself does not refuse it (J-8's stand-in writes one). **QA-595** (Gap · Major). |
| One writer | Works | Only the adapter writes `audit_event` (`audit-event.ts:55, :78`); J-8 DW1 (CW1's grep, `PLATFORM_LEFT=[]`). The demo reset's `deleteMany` (`api/src/demo.ts:573`) is the recorded departure. |
| Every create, change and delete on PF/FO tables writes who, when, **before and after** | **Partial** | Who and when on every sampled PF/FO write (leads, prospects, retainers, staff and roles, offices, settings, availability, plan limits). **Before and after is the caller's choice and often absent:** `AuditEntry.detail` is ids and facts only, "never personal data (no names, emails, phone numbers, licence numbers, addresses)" (`ports/audit.ts:17-22`), so e.g. the phone edit stores neither number (`front-office/people/edit.ts:63-64`, detail `{ foPersonId, staffId }`), the prospect value no amounts (`prospect-edit.ts:50`), the licence record field names only (`identity/service.ts:316`). P-687 (founder, 17 Nov) rules the firm's Activity log shows "before and after values in full, personal data included" (AG-13-43), and AUD-4s's concept C1 shows "field: old → new". A value never stored cannot be shown. **QA-594** (Conflict · Major, for the founder through the Lead). |
| (scope) Writes with no line | Ruled or open | Notification preferences: no line on purpose, "a personal choice" (AG-16; `platform/settings/notifications/service.ts:7`): not a gap. Open: message outbox and delivery state (`messages/send/messages.ts`, `channels/email/bounces.ts`), booking tokens (`booking/tokens.ts:19`), and a plan-limit change for a plan no firm is on (`entitlements/limit-changes.ts:44`; `AuditEntry` requires a firm, so no platform-wide line exists). **QA-596** (Ambiguity · Minor). |

**What J-8 walks:** the case side through the running copy (case, document and library actions; W1-W4, DW1-DW3, DW5); DW4 in-process. It walks **no PF or front-office write** (no lead, retainer, staff, office or setting) and checks before/after only on W3 (a form role). Its stand-ins are honest negative cases; the gap is what it never walks.
**Reading the trail** (AUD-4 API merged #2339; AUD-4s page not built) is R1.88's, not R1.8's: R1.8's Done-when names no reader.

**Missing for Works:** (1) before and after values on changes (QA-594: the port's ids-only rule against P-687, a founder call); (2) the firm on case-side lines so the other-firm wall applies there (QA-595); (3) a J-8 walk of PF/FO writes through the running app (suggestion below); (4) QA-596 ruled.

## Bugs
0 Blocker · 0 Critical · 2 Major new (QA-594 Conflict, QA-595 Gap) · 1 Minor new (QA-596 Ambiguity).

## Questions for the Lead
1. **Walks on main's head:** run 44701378950 was on `claude/jolly-euler-jtwv60` (7d79ed88f), not main. Please dispatch `gh workflow run walks.yml --ref main -f journeys="j_8"` (P-439); the row cites it once green. The verdict is Partial either way.
2. **QA-594 is the founder's:** keep the audit port ids-only (then P-687's "full values" page shows nothing for personal fields), or store before/after values (personal data in an insert-only table that cannot be erased; "Unconfirmed: no counsel" on erasure duties). Recommendation: ask the founder with both consequences; until then R1.8 stays Partial.
3. QA-595: does CS-W1's next step (case routes run as their firm) have a row? R1.8's wall applies on the case side only after it.

## Suggestions
* J-8 walks one front-office write (a lead's owner change) and one platform write (an office edit) through the running app, with who, when and the before/after it stores (*Needed for the proof*, *Capability*).
* A database-level check that a line's firm matches its request's firm (today only the adapter refuses) (*Later*, *Capability*).
