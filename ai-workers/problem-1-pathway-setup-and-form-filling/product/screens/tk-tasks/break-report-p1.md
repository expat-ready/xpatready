# Break report: R1.75 part p1 (PF-29a/b, tasks: schema, permissions, API)

PR #3635 at 54394f8 (branch claude/gallant-babbage-2losq6). Only the API and database were attacked: there is no screen in this part. Harness: a scratch copy of `tests/check_tk1_tasks.ts` (its own scratch DB on 127.0.0.1:54329, built from every migration, with the Sample firms, the real guard and walls, and local tokens), deleted afterwards. The :4400 demo was not used. The shipped check passes 30/30 as is. Scope: concept BR-3, BR-5, BR-8, BR-10, BR-19 and the shape's p1 row. Note: the harness has no `main.ts` filter, but `api/src/main.ts:232` turns any error that is not an HttpException into 500, so each 500 below is a 500 in the app too.

Verdict: Changes

## Major

**M1. Details of 4,001 to 5,000 characters give a 500 and save nothing.**
Steps: as the Owner, `POST /api/platform/tasks` with `onLead({ description: "x".repeat(4001) })`, and again with 5,000. Then `PATCH /:id {version:1, description:"y".repeat(4001)}`.
Expected: 201 or 200. BR-9 and the service's own rule allow details up to 5,000 (`service.ts:39`; DB check `migration.sql:55`).
Actual: 4,000 gives 201. 4,001 and 5,000 give **500** on create, and the edit gives **500** too. No row is written and the version does not move. The Nest log shows `ZodError too_big maximum 4000 path ["after","description"]`. The cause: the audit port allows at most 4,000 characters per value (`ports/audit.ts:38`), and `valuesOf` (`service.ts:86`) puts the whole description into the audit line's before and after (`service.ts:269-270`). The screen will send exactly these lengths.

**M2. Reopen gives an open task back to a deactivated person (BR-19, AG-13-2).**
Steps: the Owner adds a task assigned to an active Case Officer P. P marks it Done (v2). P is set to DEACTIVATED. The Owner sends `POST /:id/reopen {version:2}`.
Expected: refused, or the task comes back Unassigned. The service header says "an assignee is active staff … never a suspended or deactivated person" (`service.ts:10`).
Actual: **200**, status OPEN, assignee `{name:"Sample Leaver", status:"DEACTIVATED"}`. Take it by another officer is then 409 "Sample Leaver already has this task", and an edit keeps the deactivated assignee (200). The task now sits on someone who cannot sign in: it is not Unassigned, and nobody can take it. `reopen` (`service.ts:233-239`) never checks the assignee. p3's hand-over moves open tasks only, so done tasks reopened later escape it.

## Minor

**m1. A time zone that Intl accepts but PostgreSQL does not gives a 500.** `onLead({ due: { date:"2026-12-01", time:"09:00", zone:"US/Pacific-New" } })` → **500** (`DriverAdapterError: time zone "US/Pacific-New" not recognized`). `zoneOk` (`service.ts:41`) asks Intl; the DB check (`migration.sql:59`) asks PostgreSQL. The zone is also stored exactly as typed: `"america/toronto"` and `"AMERICA/TORONTO"` are kept as given (201), not in their canonical form, so later zone comparisons ("names a task's own zone only when it differs", BR-2) see three spellings of one zone.

**m2. A host's zone is used without a check.** `hosts.ts:55` sanitises a host's label and url but passes `zone` through as any string. `create` uses it (`service.ts:166`). I registered a test `case_client` host answering `zone:""` and another answering `"Mars/Olympus"`, then added a task with `due:{date}` and no zone named. Both gave **500**: `""` broke `plat_task_due_check`, and Mars gave `dueAt: Invalid Date` to Prisma. `"Europe/Kyiv"` gave 201. There is no real host yet, but p2's hosts inherit this.

**m3. "One line, no hidden characters" refuses real scripts and lets real hidden characters through.** `CONTROL` (`service.ts:32`) contains U+200B-U+200F, so these are refused with 422: a Persian title with ZWNJ (`"تماس با می‌خواهد"`), Hindi with ZWJ (`"क्‍ष"`), and ZWJ emoji (👨‍👩‍👧, 🏳️‍🌈). These are accepted with 201 and stored, both by the service and by the DB check (`migration.sql:53`): U+2028 and U+2029 (line and paragraph separators in a "one line" title), U+0085 and U+009B (C1 controls), tag characters U+E0041, U+180E, U+034F, U+FFF9, and titles that look empty (`"ㅤ"`, `"⠀"`, one character each). A lone surrogate `"a\ud800b"` is silently saved as `"a�b"`. Hebrew, Arabic and Chinese titles work.

**m4. A firm task takes any context, unchecked.** `{host:{type:"firm", contextType:"CASE", contextId:<random uuid>}}` gives 201, and every reader sees `context:{type:"CASE", id:…}`. The built-in firm host answers for any ref (`hosts.ts:28`), and nothing stops a context on `host_type='firm'` (`service.ts:159-160`; `plat_task_context_check`). The id can be another firm's, or nothing at all.

**m5. Take it's audit line records a stale "before".** Take it and an edit run at once, both naming v1. In 4 of 10 runs both won: the edit went v1→v2, then the take went v2→v3. The take's audit line says `version_before=1`, with the old title as "before" and the new title as "after". So the trail shows Take it renaming the task. The cause: `take` audits the row it read before its transaction (`service.ts:203, 217`), and its update does not name a version (`:207`).

**m6. 409 before 403.** Read-only sends `PATCH {version:<stale>}` and Billing sends `cancel {version:1}` on a v3 task: both get **409** "This task changed. Reload to see it.", not 403. They reload, then hit 403. The version is checked before the permission (`service.ts:258` runs before `decide`).

**m7. Changes that change nothing still count as changes.** `PATCH {version:N}` with no field gives 200, moves the version on and writes an audit line "Task changed". Reassigning to the person who already holds the task does the same ("plat.task.assign", v2). Either one gives everyone else with the task open a needless 409.

**m8. Assigning to someone who cannot open tasks.** An ACTIVE staff member with no role can be made the assignee (200). Their own `GET` of the task is then 403 (no `view.own`). `activeStaff` (`service.ts:144-147`) checks status only. BR-13 limits the hand-over to holders of `view.own`. Assign and create do not.

**m9. Database rules on insert are weaker than on update.** As the owner, an insert is accepted with `version=50`, with `status COMPLETED, completed_by "x"`, with `created_at` in the future and `updated_at` at the epoch, with a context on a firm task, and with a U+2028 title. `plat_task_write` is a BEFORE UPDATE trigger only (`migration.sql:80-92`), and there is no rule on the actor word's shape. A direct UPDATE to a DEACTIVATED assignee is also accepted (only the service guards status, as documented).

**m10. A due time that does not exist moves without a word.** `due {date:"2026-03-08", time:"02:30", zone:"America/Toronto"}` is in the spring-forward gap. It is saved as 07:30Z, which is 03:30 EDT, with no 422 and no note (`dueInstant`, `service.ts:73-76`).

## What held
* **Cross-firm:** firm B's Owner gets 404 on GET, PATCH, assign, take, complete, cancel and reopen of a firm A task. Firm A people as firm B assignees are refused with 422, and the other way round too. A firm host naming firm B's id is 422. An id that is upper case, `%00`, 5,000 characters long or not a uuid gives 404, never 500.
* **Take it races (BR-5):** 5 Take its at once: 1 wins, 4 get 409 "Case officer (Sample) already has this task", v2, one audit line. Take vs cancel and take vs assign, 10 runs each: never both, never neither, always v2.
* **Version races:** 10 edits at once on v1 give 1×200 and 9×409, with one audit line. Done vs cancel gives exactly one result.
* **Restricted (BR-3, BR-10):** the assignee (a Case Manager, with edit and assign) reads it as `RESTRICTED`. Edit, assign, cancel and take give 403. Done gives 200 with no host id in the answer, and the later reopen gives 403. The maker who is not the assignee reads it, and their Done gives 403. Anyone else gets 404.
* **Assignees:** suspended, deactivated, other-firm, unknown uuid, junk and a number are all 422 with the field named. A suspended or deactivated caller gets 401. A staff member with no role gets 403.
* **Roles (BR-8):** Read-only and Billing read; edit, assign, Done on someone else's task, cancel and create all give 403. As assignees, both can mark Done, and Billing's reopen gives 403. A Case Officer can mark Done, reopen and cancel a colleague's task; their assign gives 403. A Case Officer adding a task for someone else gets 403 (shipped check).
* **Bodies:** unknown keys at the top level, in `host` and in `due` (including `status`, `version`, `createdBy`, `firmId`) are 422 by name. `__proto__` sets nothing. Wrong types are 422. A non-object JSON body or broken JSON is 400. A 300 KB body is 413. Dates refused: 30 Feb, 29 Feb 2027, 13th month, 1999, 2101, 24:00, 7:30, seconds, ISO strings and Arabic digits. 29 Feb 2028 and 31 Dec 2100 in Kiritimati are accepted. Version as string, float, 0, -1, 2^53 or missing is 422. Titles of 200 emoji or 200 decomposed é pass; 201 is refused. A category of 41 characters and a reason of 501 are 422. Zones like `../etc/passwd`, `Factory`, `localtime`, `posixrules` and `""` are 422.
* **Database:** the trigger refuses moving the firm, host, host type or context; changing the maker, `created_at`, id or `source_key`; and a version skipped, repeated or moved back. It forces `updated_at` forward. xr_data and xr_app have no DELETE (42501). TRUNCATE is not granted. Moving a task's firm as xr_data is refused by RLS. An archived task gives 404. The same-firm assignee trigger gives 23503.
* **Load:** 60 parallel creates by 5 people all give 201 in 346 ms, and 60 parallel reads all give 200 in 181 ms. No 500s, and the pool was not exhausted.
