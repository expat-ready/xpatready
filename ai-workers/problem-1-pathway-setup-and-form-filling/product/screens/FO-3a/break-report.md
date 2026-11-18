# FO-3a part 1a — break report (booking-type settings API, PR #1918)

Head attacked: `claude/happy-maxwell-sbjyig` @ `c11de56` (no screen in this part). Harness: the PR's own set-up (`tests/check_fo3a_booking_types.ts` lines 1-109, scratch database on 127.0.0.1:54329, real PF-4 guard, real audit adapter) plus my attacks, copied into `tests/` only while running and deleted afterwards. A copy of the app's global error filter (`api/src/main.ts:180-221`, the branches that apply) was mounted, so the answers below are what the real app sends. A bare harness with no filter turns every "via the filter" answer into a 500. Port 4400 and the demo database were not used. Baseline: the PR's suite 37/37; FO-1b 80/80, FO-3 133/133, FO-3pa 45/45, FO-3sa 39/39, FO-3sr 29/29 on this head.

## Findings

**M1 — Major. Parallel creates or duplicates of one name are refused, though a repeated name is allowed (AG-4-9 rule 2, §12).**
Request: 10 parallel `POST /api/front-office/booking-types` `{"name":"Race me","minutes":30,"modes":["VIDEO"],"hostStaffIds":[owner]}` as the Owner (also tried 20 parallel; 4 parallel of "Same Name" / "same   name"; 6 parallel `POST /:id/duplicate`).
Answer: 10 → `[201,409,201,201,409,409,409,409,201,409]`; 20 → 8 created, 12 refused; 4 → 1 refused; 6 duplicates → 2 refused. Each refusal is a raw Prisma `P2002` from `types.ts:253`, re-thrown at `types.ts:261` after the third try. The global filter (`main.ts:210`) turns it into 409 "This already exists, or someone else saved the same thing at the same moment." Without that filter it is a 500.
Should be: every create with a made slug succeeds and gets the next free `-N`. Never 409 or 500 when no slug was asked. Three tries cannot outlast N≥4 writers; a per-firm lock (or retrying until a free slug is found) would.

**M2 — Major. A NUL byte in a description answers 404 "Not found" on a create (raw: a database error, 500).**
Request: `POST /api/front-office/booking-types` `{"name":"Desc nul","description":"Hello\u0000world","minutes":30,"modes":["VIDEO"],…}`; also `PATCH /:id` `{"description":"a\u0000b","version":1}`.
Answer: 404 "Not found (it may have been removed by a reset)." Postgres refuses with `invalid byte sequence for encoding "UTF8": 0x00`, and `main.ts:213` maps that to 404. Nothing is saved.
Should be: 400 on field `description`. `Fields.description` (`types.ts:69`) has no character check at all. Other text in this description also goes through: BEL `\u0007`, bidi override `‮…‬` and lone surrogates (stored silently as U+FFFD) all save with 201. The rule used for names and the cancel reason (`service.ts:145-150`) should apply here too.

**M3 — Major (or name a ruling). An `OTHER` type can never be public (AG-4-10 rule 4: "Other (OTHER): public").**
Request: create `{"name":"Other public","purpose":"OTHER","showOnBookingPage":true,…}`, then `GET /api/public/firms/fo3a-a/book` and `GET …/book/other-public/slots`.
Answer: 201 with `onBookingPage:false`. The type is not in the list, and its link gives the one 404 "This booking page or link is not available." `isPublic` (`types.ts:108`) and the door (`service.ts:213, 231`) accept `FREE_CONSULT` only. The PR's own schema comment says the opposite (`front-office-booking.prisma:18`, "FREE_CONSULT and OTHER may be public"). The PR body does not name this hold.
Should be: OTHER with "Show on booking page" on is listed and bookable. Or, if this waits on row 44 (prices) like PAID_CONSULT, the PR and the schema comment say so and the brief owner confirms.

**m1 — Minor. An email-shaped name goes into the audit summary word for word.**
Request: `POST …` `{"name":"lee@client.example",…}`; `PATCH /:id` `{"name":"client.b@mail.example","version":1}`.
Answer: 201/200. `audit_event.summary` = `Booking type "client.b@mail.example" edited.` while `detail.name_after` = "(not kept: shaped like an email address)". The summaries are built at `types.ts:158, 182, 282`, and the port checks only `detail` (`ports/audit.ts:22`).
Should be: the summary follows the same rule as the detail (see the header at `types.ts:15-17`). Either refuse the email shape in names, or leave the name out of the summary when it is email-shaped.

**m2 — Minor. Duplicate cuts an emoji in half.**
Request: create `{"name":"AB"+"😀"×39}` (80 UTF-16 units), then `POST /:id/duplicate`.
Answer: 201. The stored copy name ends `…😀� (copy)`: `t.name.slice(0, 73)` (`types.ts:178`) splits a surrogate pair, and the driver stores U+FFFD.
Should be: cut on whole characters (code points or graphemes).

**m3 — Minor. Name length and wording count UTF-16 units, not characters.**
Request: `{"name":"A"+"😀"×40}` (41 characters); `{"name":"📞"}`.
Answer: 400 "Name must be 1 to 80 characters." for 41 characters. For the lone emoji, 400 "Name cannot hold line breaks or invisible characters.", though it holds neither (the real cause is "no letter or digit", `types.ts:61`). The database check counts characters (`fo1b` migration line 189).
Should be: count characters as the database does, and give words that name the real cause.

**m4 — Minor. Invisible characters pass the name rule.**
Request: names `"Free⁠call"` (word joiner), `"Free­call"` (soft hyphen), `"Free\u{E0041}call"` (tag character), `"Free \ud800 call"` (lone surrogate).
Answer: all 201. They give look-alike names `free-call-2` … `free-call-5`, and the lone surrogate is stored as "Free � call". `CONTROL` (`types.ts:59`) omits U+2060, U+00AD and U+E0000-E007F, and the name has no lone-surrogate check (the cancel reason has one, `service.ts:146`). ZWJ/ZWNJ (U+200C/D) may stay, as Indic scripts use them.
Should be: 400 "Name cannot hold line breaks or invisible characters." as the words promise.

**m5 — Minor. A no-op write moves the version and writes an empty audit line.**
Request: `PATCH /:id` `{"version":1}`; `POST /:id/switch-on` on a type that is already on (twice).
Answer: 200 each. The version goes up by 1 each time, and each writes an audit line with `fields: []` (`types.ts:280-282`). Another editor's open form becomes stale for nothing.
Should be: nothing changed → no version bump and no line (or a 200 that says so).

**m6 — Minor. A suspended staff member can be made a type's only host.**
Request: `PATCH /:id` `{"hostStaffIds":[<SUSPENDED staff of firm A>],"version":2}`.
Answer: 200. The preview then says "This type has no host". `checkHosts` (`types.ts:239-243`) counts staff in the firm whatever their status.
Should be: 400 on `hostStaffIds` "Choose hosts from your firm's staff." for staff who are not active (the slot code already ignores them, `service.ts:645`).

**m7 — Minor. Names with no Latin letter all get the slug `type`.**
Request: create "ਮੁਫ਼ਤ ਸਲਾਹ", "免费咨询", "استشارة مجانية", "免费咨询".
Answer: 201 with slugs `type`, `type-2`, `type-3`, `type-4` (`types.ts:102-105`). A firm working in Punjabi or Arabic gets public links `/book/<firm>/type-3`.
Should be: a slug that tells the types apart. It is editable, but the default says nothing about the type; at least name it in the PR as a known limit.

## What held
* Keys: Case Officer, Read-only and Billing/Finance get 403 `MISSING_PERMISSION` on every write (create, PATCH, switch-on, delete, duplicate). A Case Manager gets 403 on switch-on. Billing/Finance gets 403 on `GET /:id`.
* Cross-firm: firm B's Owner gets 404 on firm A's type for GET, PATCH, DELETE, duplicate and preview. A PATCH or create naming B's staff as hosts gets 400.
* Ids: `abc`, `%00`, an SQL-shaped id, `{uuid}`, a 5,000-character id, the nil uuid and uuid+NUL all give 404 "No such booking type." An upper-case uuid reads the same type.
* Bodies: unknown fields (`id`, `firmId`, `version` on create, `deletedAt`, timings) give 400 "Not a field of a booking type." Arrays, bad JSON and text/plain give 400. A string, decimal or 0 version gives 400, and 2^40 gives 409. Modes `[]`, duplicates and `FAX` give 400. Hosts duplicated in another case, 51 hosts or an unknown uuid give 400. `paid_consult`, `["PAID_CONSULT"]` and `"PAID_CONSULT "` give 400.
* Races: 6 parallel PATCHes with one version → exactly one 200 and five 409 (version 2, one audit line). Two types PATCHed to one slug at once → 200 and 409 `SLUG_USED`. Three creates asking one slug → 201, 409, 409. Three parallel DELETEs → 200, 404, 404.
* Deleted type: delete again, PATCH, switch-on, switch-off, duplicate, GET and preview all give 404. Staff create gives 404. Public slots and public book give the one not-found. Its booking's self-service view and slots still answer 200 (rule 5). Its slug is taken by the next type of that name.
* Switched off: staff create with an upper-case id gives 404. A duplicate of a switched-off type is off too.
* Preview: from≥to, from=to, 62 days + 1 s, `tz=Mars/Base`, an empty tz, dates without an offset, a repeated `from`, junk and a `to` in the past all give 400. Exactly 62 days → 200 with 63 days. The Toronto DST day, Pacific/Kiritimati around the closed day, days beyond the window and past days each give a plain reason. Preview wrote no row (bookings, types, audit, outbox, tokens counted).
* Volume: 451 types list in 17 ms (268 KB). A create among them takes 9 ms.

Not tested: concurrency against the real demo stack (the harness is the PR's one-process app). The leftover scratch databases `xr_studio_fo3a_5628` / `_old_5628` are not from my runs (both of mine dropped theirs); probably the builder's killed run.
