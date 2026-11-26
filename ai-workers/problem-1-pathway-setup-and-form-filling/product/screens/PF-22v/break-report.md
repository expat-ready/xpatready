# PF-22v break report, round 1: saved views and the custom-field filter (API only)
Breaker: a fresh context that did not build this. Target: `git diff claude/runtime-pf22a-routes..HEAD` at 0cfb49afd. Method: a scratch Nest app (SalesController, the custom-field and saved-view features behind PF-4's guard) on a scratch database at 127.0.0.1:54329, with LocalIdentity tokens. Script: `/tmp/claude-0/pf22v-break/break.mts`, plus `inlist.mts` for the Prisma limit. Firm A has `platform.everyone_sees_all=false`. Staff: OWNER, ADMIN, two CASE_OFFICER Agents, READ_ONLY, BILLING_FINANCE, a leaver; plus firm B's OWNER. Both databases were dropped afterwards. Paths below are relative to `prototype/studio/`. Scope: the BACKLOG PF-22v row and the PF-22s challenge fixes it carries (M2, M3, M5, m5). No Blocker found.

## Major
**M1. A shared view with a Source part fails for a `view.own` Agent with a 422. Challenge M3 is not built.**
Repro: an Admin shares `{list:"fo.pipeline.individual", name:"Web form", filter:{source:"Web form"}, shared:true}` (201). The only "Web form" prospect belongs to the other Agent. For the Agent, `GET /saved-views` lists the view with `dropped: []`. Opening its `applies` (`GET /front-office/prospects?source=Web+form`) gives **422 UNKNOWN_SOURCE** "Unknown source: Web form. Choose from: Phone call."
Expected (challenge M3, "Needed for the proof"): the source part is kept, the list comes back empty with "None of the leads you may see match this view", and the part is "no longer applies" only when no lead in the firm has that source.
Where: `api/src/front-office/sales/saved-view-lists.ts:130-149` (the check ignores `source`), `prospects.ts:211` → `source-filter.ts:41-45`.

**M2. Saved-view PATCH and DELETE have no version, so a second session's save silently overwrites the first (STANDARDS §4 [M]; challenge M5).**
Repro: the Owner and the Admin each PATCH the same shared view at the same moment, `{name:"S1"}` and `{filter:{view:"mine"}}`. Both get 200, with no 409 and nothing saying what changed. A client cannot send a version either: `{name:…, updatedAt:<as read>}` → 422 "updatedAt: This field is not allowed here."
Expected (challenge M5): "saved-view PATCH/DELETE use their own updatedAt as the version", and a stale save gets 409 STALE.
Where: `api/src/platform/saved-views/service.ts:33` (ChangeView has no `version`), `:124-143`, `:147-155`. The row lock serialises the two saves but cannot tell that the second is stale.

**M3. Invalid filter parts are saved, and the view then fails when anyone opens it (row: "an invalid filter is refused by the server").**
Repro: the Agent POSTs `{list:"fo.leads", name:"bogus chip", filter:{view:"nonsense", from:"not-a-date", to:"2026-13-45", source:"No such source"}}` → **201**, `dropped: []` on read. Opening its `applies` (`GET /front-office/leads?…`) → 422 "view: Unknown view." A share-key holder can save the same thing as a shared view, which then errors for the whole firm.
Expected: 400 INVALID_FILTER naming `view`, `from`, `to` and `source` at save. On read, a part that no longer applies is dropped and named.
Where: `saved-view-lists.ts:130-149` checks only `stage`, `owner` and `cf.*`. `view`, `from`, `to` and `source` are checked only by the schema's `max(500)`.

## Minor
**m1. Hostile input returns 500 instead of a field error (RFC 9457, §6).**
(a) `GET /front-office/prospects?cf.notes=a%00b` (a TEXT field) → 500: PostgreSQL refuses the NUL in the `ilike` parameter (`filter.ts:62-64`).
(b) POST a view with `name:"a\u0000b"` → 500. POST a view with `filter:{from:"a\u0000b"}` → 500 (jsonb refuses `\u0000`).
(c) POST a view with `filter:{source:[50 strings of 500 characters]}` (about 25 k characters) → 500. It reaches the database's `length(filter::text) <= 16384` CHECK because zod does not bound the total size (`service.ts:31`, `routes.ts:43` lets through 50×500).
Expected: 400 or 422 naming the part. PF-22a round 1 already refused NUL for values.

**m2. The strict query and the saved filter accept `constructor`, `toString`, `hasOwnProperty` and `valueOf` as keys.**
`GET /front-office/prospects?constructor=1` → 200, although every other unknown key is a 422 (PF-28). POST a view with `filter:{constructor:"x", toString:["a"]}` → 201 and is stored as written.
Cause: `filter.ts:26` uses `!(k in shape)`, and `in` walks `Object.prototype`. Use `Object.hasOwn(shape, k)`.
No prototype pollution was found: `__proto__` is refused at body level, and inside `filter` it is dropped (stored `{}`).

**m3. A decimal range cannot be asked for.**
`cf.budget=1.5..3` → 422 "Type a number, for example 2500 or 2500.50." Only whole-number ranges work, because `range()` uses `[^.]*` on each side (`filter.ts:35`). Separately, `cf.budget=0x2` is accepted as 2.

**m4. The cf filter turns firm-wide matches into a Prisma id list. It fails above 32,767 matches, and it leaks a firm-wide count.**
With 40,002 `vip=true` values in firm A, `GET /prospects?cf.vip=true` → 500 for both the Agent and the Owner ("The query parameter limit supported by your database is exceeded"). `inlist.mts` shows that 32,000 ids pass and 33,000 fail.
The id list counts matches across the whole firm, not just what the caller may see. So a `view.own` Agent gets a 500, and a response time that grows with the number of matching records they cannot see (139 ms at 40 k). Both tell them roughly how many such records the firm holds, which is the count challenge m8 kept from Agents.
Where: `filter.ts:85-91`, `prospects.ts:216`, `leads.ts:61`. Fix direction: a SQL subquery (`id in (select entity_id …)`) instead of an id list. Scale itself is the team's (§9), so this is Minor.

**m5. `GET /saved-views` runs queries for each view (§5 "no N+1").**
For every view, the check runs a stage count, an owner lookup and, for each cf part, a field lookup plus a full select of every matching id, only to validate it. With 50 views, 40 of them `cf.vip=true` over 40 k values, the read takes **1,656 ms**. The §9 budget for filter, search and expand is under 200 ms. Where: `service.ts:85`, `saved-view-lists.ts:142-146`.

**m6. `PATCH {sort:null}` returns 200 but keeps the old sort.** `data.sort = b.sort ?? undefined` means "no change" to Prisma (`service.ts:135`). Use `Prisma.DbNull`.

**m7. Creating a view is not idempotent (§4 [M] "idempotent creates").** Two identical POSTs at once → 201 and 201: two views from one double click. There is no `requestId` in `CreateView` (`service.ts:32`).

## What held
* **Injection and wildcards:** `%`, `_` and `\` are matched literally. `' or 1=1 --` and `%' or '1'='1` → 200 with no rows. Every value is bound through `Prisma.sql`.
* **Visibility:** a `view.own` Agent's cf filter matches only their own prospect. `cf.notes=secret` (another Agent's value) → []. `owner=<other Agent>&cf…` → []. Leads `view=all|mine|unassigned|closed&cf.nickname=<other Agent's person>` → []. The shared "Unassigned" leads view opens for the Agent (they hold `view.all`).
* **Permissions:** another person's personal view is a 404, the Owner included (PATCH, share, DELETE). Without the share key, an Agent gets 403 for PATCH `shared:true` on their own view, and for take-back, rename and DELETE of a shared view (also with an upper-case id). The body is checked before the lock. READ_ONLY and BILLING_FINANCE hold `agent/prospect:show`, so they may list and keep views.
* **Firm walls:** firm B gets 404 for PATCH, DELETE and take-back of firm A's shared and personal views. Firm B's `cf.referral_partner` → 422 (no such field). A firm-B owner id in a view → 400, and in the list → 422. Names and dropped parts are read in the viewer's firm.
* **Races:** ten runs of DELETE, take-back and an Agent's rename at the same moment. Each time exactly one of DELETE and take-back wins, the losers get 404 or 403, and there is no 500. The audit lines match the outcomes (7 unshared and 3 deleted).
* **Leavers:** a leaver's token → 401 for list, create and delete. A shared view naming the leaver as owner opens with "The owner is no longer on the staff." dropped.
* **Odd keys:** `cf.`, `cf.A`, `cf.a-b`, `cf.x.y`, `cf.__proto__`, `cf.notes[x]` and `cf.notes[]` are refused with 422 naming the key; a 40-character key is allowed and a 41-character key is refused. `list` sent as an array → 422; `list=__proto__` or `toString` → 400 UNKNOWN_LIST.
* **Text:** an 80-character name in Arabic plus emoji saves; invisible-only and 81-character names → 422. CHECKBOX (true/TRUE/false, `1` refused), NUMBER (`..2`, `2..`, `1e0..2`, `3..1` → []) and Infinity (refused) behave as documented. A 15.9 k filter under the limit saves.

Verdict: Changes 0cfb49afd19945dd638146427fec577ef8bc47c9
