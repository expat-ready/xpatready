# Break report: PF-18a part 2, personal notification settings (schema + API, no screen)

Commit `4130eb109` on `claude/runtime-pf18a-notif-prefs` (PR #2304). Breaker run, 19 Nov 2026. US$0, no model calls.
S = `ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio`.

**Setup.** The builder's suite `tests/check_pf18a_notifications.ts` passes as given (59 of 59). I ran an isolated copy, `isolated.sh brk_pf18a 4486`
(`PLATFORM_IDENTITY=local`, database `xr_studio_brk_pf18a`, real `main.ts` with its 5 MB body parser and ProblemErrors filter). Five extra staff were
added by SQL (Read only, Billing / Finance, Admin, Case Manager, and one person with no role). Tokens came from `POST /api/platform/session/local`.
The migration test used a separate copy, `xr_studio_brk_mig`. Probe scripts are in the session scratchpad, `breaker/p1.mjs` to `p4.mjs`, `p3.mts` and `proto.mts`.
Both databases were dropped and the copy stopped afterwards. Port 4400 and the demo database were never touched.

**Scope.** This is an API-only row, so the screen checks do not apply: keyboard only, 1024 px, 200 % zoom, reload or back mid-action.
There are no uploads, no AI and no text fields, so hostile PDFs and long or non-English text do not apply either. The only free text is the group code, which I tested.
DW6 (`hostZone()` in booking) is not in this commit (the test says "below when built"), so I did not assess it.

## What broke

### M1 (Major): any signed-in staff member can stall the whole API, for every firm, with a few oversized invalid PUTs
- **What I did.** I sent `PUT /api/platform/me/notifications` with a body just under 5 MB. It held 4.9 MB of
  `{"group":"NOPE","inApp":"x","email":"y","z":1}` items. I sent 4 at once, as a Case Officer (`p4.mjs`). Every role can call this route.
- **Expected.** A quick 400 with a short list of problems: the schema allows at most 8 groups.
- **What happened.** Each reply was **40.2 MB, with 426,085 `issues`** (8× the request). The 4 requests took 9.4 s in total.
  - Another person's `GET` took **6,087 ms** during them, against 21 ms before. The event loop was blocked, so every route of every firm waited.
  - A single request took 2.5 s and gave the same 40 MB reply.
  - Oversized but valid items were fine: 114 ms and a 293-byte reply. So the cost comes from parsing and listing every invalid item, not from the size alone.
- **Where.** `S/api/src/platform/settings/notifications/service.ts:31-32`. `SavePrefs` (line 18) parses every element before `.max(8)` counts,
  and `refused(…)` returns every zod issue with no cap. `main.ts:239` (`limit: "5mb"`) makes the body large.
  - The same uncapped `issues.map` is in `settings/offices/service.ts:34`, but that route needs office keys. This one is open to all six roles, Read only included.

### m1 (Minor): a stale second tab overwrites a newer save with no warning
- **What I did.** As Owner, I read the view (tab A). Tab B then saved Mentions with email off. Tab A then PUT its whole earlier view back (`p2.mjs` §3).
- **Expected (STANDARDS §4 [M]).** "Optimistic concurrency (version column; stale save → 409 with what changed)". Part 1 of this row does it for offices
  (`settings/offices/service.ts:30,128`, break B2).
- **What happened.** 200, and Mentions email is back **on**. The person then gets emails they had just turned off.
  The GET reply carries no version (keys: `group, number, label, whatIsInIt, inApp, email, defaults, saved`), and the table has no version column.
  The `pg_advisory_xact_lock` stops two saves from mixing into one half-and-half state, but it does not stop a lost update.
- **Where.** `service.ts:14,18,38-45` and the migration's `CREATE TABLE`.
- **Why only Minor.** The harm is limited to the person's own switches. The [M] rule is flagged for the reviewer to weigh.

### m2 (Minor): an `__proto__` field is accepted silently, although "an unknown field refuses the whole save"
- **What I did.** `{"groups":[{"group":"MENTIONS","inApp":true,"email":false,"__proto__":{"x":1}}],"__proto__":{"isAdmin":true}}`.
- **Expected.** 400 (the service comment, `service.ts:4`; `constructor` and `firmCeiling` are refused).
- **What happened.** 200, and the row is saved. Nothing was polluted: `({}).isAdmin` and `({}).x` stay undefined, and the parsed output has only `groups` (`proto.mts`).
  So the only problem is that the "unknown field → 400" rule does not hold for this one key.
- **Where.** `service.ts:18` (zod `strictObject` skips `__proto__`).

### m3 (Minor): `allows(firm, person, "SECURITY", "IN_APP")` returns true
- **What happened.** A Read only person gets `true` for `SECURITY` over `IN_APP`.
- **Why it matters.** AG-16 §3.3 and the port's own comment (`S/ports/notification-prefs.ts:17`) define security *emails* only.
  A sender that asks about IN_APP for a security event gets a yes for a channel the spec does not define for it.
- **Where.** `ports/notification-prefs.ts:48` (`decide` ignores the channel for SECURITY). The real adapter and the fake behave the same.

## What held
- **Group that cannot reach the person.** Officer PUT of Team watch → 400 `NOT_YOURS`, and nothing was written, not even the valid group in the same body.
  Firm and connections behaves the same for a Read only person.
  A row planted by SQL (Read only + Team watch, Admin-turned-Read-only + Firm and connections) is ignored by `allows` (false) and by GET.
- **Who sees what.** GET for each role matches §3.3: Owner and Admin see 8 groups, Case Manager 1-7, Case Officer and Billing see 1-5 + 7, Read only sees 1-5.
  A person with no role gets 403. The API refuses zero roles (`identity/service.ts:62`).
- **Parallel PUTs.** 2, 10, 40 and 100 at once on one person, first save (no row yet): all 200, and each ends as one whole save, never a mix.
  Another person's GET during a burst of 100 PUTs: 616 ms, no 500, no pool exhaustion.
- **Role change after saving.** A Case Manager who saved Team watch and became Case Officer: the group disappears, `allows(TEAM_WATCH, EMAIL)` is false,
  and a PUT of it gets 400. Keys are re-read on every request (`identity/service.ts:116`) and by the adapter (`prefs.ts:13-19`).
  When the role is given back, the person's earlier switches return, which is reasonable. An Admin demoted to Read only loses groups 6, 7 and 8 at once.
- **Deactivated or suspended person.** The old token gets 401. `allows` returns false on every group, the security email included (as the port documents).
  A PUT in flight during deactivation got 401 and wrote nothing.
- **Cross-firm and other people.** The route takes no id. `?staffId=` and body `staffId`/`firmId` are ignored or refused (400).
  POST, DELETE, PATCH and `/me/notifications/<id>` all give 404.
  The adapter refuses firm A under firm B's scope. With firm B's person under firm A, or a non-uuid / SQL-ish staff id, it returns false.
  Upper-case ids work. A bad group or channel (`__proto__`, `toString`, `constructor`) throws.
- **Payload abuse.** All refused with a 400 Problem Details and nothing written:
  - lower-case or space-padded groups, `SECURITY`, a NUL inside the group, RTL text, a 200 kB group name, string or number booleans, a missing field;
  - a 9-item array, an object pretending to be an array, a bare array, `null`, a number or a string as the body, empty, `{}`;
  - text/plain, form-urlencoded and utf-16 bodies.
  Duplicate JSON keys follow last-wins (standard JSON).
- **Walls as xr_app.**
  - With no firm set it reads 0 rows and an insert is refused. Firm A cannot read, update or delete firm B's rows, and an insert naming firm B is refused by RLS.
  - Moving `staff_id`, `firm_id` or `group` is refused by the column grant (`permission denied`) and, for the owner, by the trigger.
  - ON CONFLICT on firm B's person is refused by the FK. NULL switches are refused.
  - TRUNCATE, ALTER and calling the trigger function directly are all refused.
  - Residual, by design (not a break): own-only and who-sees-it are app-level, so xr_app may write another same-firm person's row. `allows` ignores rows for groups that cannot reach the person.
- **Migration.**
  - On a copy migrated to `20261119051500` with the Sample firms and a deactivated person, `-1 -f migration.sql` applied, and the row counts did not change (2:4:6:0).
  - The rollback as written (DROP TABLE, then DROP FUNCTION) works with rows present, and a re-apply works.
  - After apply: RLS on and forced, policy `pf12_firm`, both triggers present, function owner `xr_wall_reader`, `search_path` pinned.
  - The builder's suite also covers applying twice and `migrate diff`.
- **Data.** The groups, who sees each and the defaults match AG-16 v1.24 §3.3 and AG-16-10 tests 6-8, word for word.

## Not a product break, for the lead's attention
CI on `4130eb109` is red:
- `module-cards`: "MODULE.rows/PF-18a.md names ports/notification-prefs.ts, which exists neither from the card's folder, the studio nor the repository root".
  Locally, `module-cards.py tree` passes, so this looks like a difference in the CI checkout.
- `pr-rules`: "MISSING: no Done when" in the PR body.
- The main `ci` job was skipped.
