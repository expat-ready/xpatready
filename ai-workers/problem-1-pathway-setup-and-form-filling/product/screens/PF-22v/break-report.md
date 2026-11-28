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

## Round 2 (diff only, 8eccabb30)
**What was run:** `break.mts`, with a `requestId` on every POST, the If-Match interceptor and about 60 new calls; and `inlist.mts`. Both ran against a clean `git archive` of 8eccabb30 (`/tmp/claude-0/pf22v-r2src`), because during the run the worktree moved to e14ff9f0b and gained uncommitted edits. Neither is judged here. Same setup as round 1, plus a third prospect for the Agent (source "Referral") and one for the Owner (source "Web form"). Both databases were dropped.

**Closed**
* **M2:** a stale PATCH or DELETE → 409 STALE_VERSION with `current`; a stale If-Match → 409. In 60 runs of two concurrent PATCHes on one version, both never succeeded. Every save changes the version.
* **M3:** `view`, `from`, `to`, `source` and `type` are refused at save with 400, each part named.
* **m2:** `constructor`, `toString`, `hasOwnProperty`, `valueOf` and `isPrototypeOf` → 422 on the list and 400 on a view.
* **m3:** `1.5..3`, `..1.8` and `.5..2` filter correctly.
* **m6:** `sort:null` clears the sort.
* **m4:** the 500 is gone. The new 30,000 limit is judged under R2-m3.
* **m1:** mostly closed. NUL or a lone surrogate in a name, a filter or a cf value → 422/400. A 25 k filter → 422. What remains is R2-m1.

**R2-M1 (Major, M1 not closed): the source part is dropped for each viewer. That is the outcome challenge M3 calls wrong.**
Repro: the Owner shares "R2 Web form" `{source:"Web form"}`. The Agent has no web-form lead. For the Agent, `dropped` is the source, `applies` is `{}`, and the list answers 200 with **all 3** of the Agent's prospects (Phone call and Referral) under a view called "Web form". With `{source:["Phone call","Web form"]}` the whole part is dropped, so the Agent sees 3 rows instead of the 2 Phone-call ones. Challenge M3 says "the source is dropped and the Agent sees **all** their leads … Both are wrong", and that a source counts as "no longer applies" only when no lead in the firm has it.
The save side is viewer-relative too. With `everyone_sees_all=false` the Owner sees only their own leads, so the Owner cannot share "Web form", which exists in the firm: 400 "No lead you can see has the source". It saves only once the Owner owns a web-form lead.
Where: `saved-view-lists.ts:56-60`. Fix as M3 says: keep the part, so the list shows the viewer's matching rows or none, and check "gone" against the whole firm.

**R2-M2 (Major, m7 not closed): an honest retry of a create gets 409 REQUEST_REUSED when the filter has two or more keys.**
`repeat()` compares `JSON.stringify(v.filter)` with `JSON.stringify(f)` (`service.ts:131`). jsonb reorders keys (shorter first), while zod outputs them in shape order, so the two strings differ even when the filters are the same.
Repro: POST `{requestId:R, list:"fo.pipeline.individual", name:"R2 idem", filter:{stage:"QUALIFIED", owner:<me>}}` → 201. Sending exactly the same body again → **409** "This request id already made another view." Two at once → 201 and 409. A retry with the keys in jsonb's order also gets 409; a one-key filter retries fine (201, 201).
Result: a double click shows a false error and invites a duplicate save, so STANDARDS §4 [M] is still unmet. Fix: compare a canonical form (keys sorted), or compare deep-equal against the stored row.

**Minor**
* **R2-m1: a filter of up to 16,000 characters of JSON can still get a 500.** The database checks `length(filter::text)`, and jsonb text adds a space after every `:` and `,`. Repro: eight MULTI_SELECT parts with 100 or 60 repeated choices is 15,803 characters of JSON → **500**. Separately, the plain text `\u0000` (a backslash and five characters, no NUL) is refused as if it were a NUL. Both are in `service.ts:33`. Fix: measure the size as jsonb text would, or keep a margin, and test each string with `storable` instead.
* **R2-m2: the version is optional.** `service.ts:37,39`: a PATCH or DELETE with no version → 200, and the last write wins. Offices require the version. The protection only works if the screen sends it; the Lead decides whether that is enough.
* **R2-m3: judging the 30,000 limit (`filter.ts:98`).** It counts matches across the whole firm, before visibility, which has three effects:
  * (a) A `view.own` Agent with 3 prospects gets 422 for `cf.vip=true` when the firm has 40 k VIPs. Adding `owner=<me>` still gives 422, although the message says "Add another filter to narrow it"; only another cf part narrows the count.
  * (b) It is a one-bit oracle: "more than 30,000 records in the firm match". This is coarser than round 1's timing leak; acceptable as Minor.
  * (c) The saved-view check runs each cf part on its own (`saved-view-lists.ts:71`). A two-part filter that the list answers (2 × 31 k matches, 12 in common → 200) is refused at save with the wrong words ("The value no longer fits the custom field"). A view saved before the counts grew would open with both parts dropped, showing more rows than the view asks for.
  * Verdict on the limit: an acceptable stop-gap at sample scale (§9), but the words are wrong and the check should run all cf parts together. The real fix is a SQL subquery inside the visibility.
* **R2-m4: a replayed create returns a view that is now someone else's personal one.** The Owner creates a shared view with request R; the Admin takes it back and sets `columns:["secretColumn"]`. The Owner replays R → **201** with the Admin's personal view (owner Admin, those columns), while a PATCH on it gives the Owner 404 (`service.ts:117,130`). It leaks only columns, sort and version.
* **R2-m5:** `from:2026-01-01, to:2025-01-01` names both parts as "This date is not a real day". It should say the range is reversed.
* **m5** (queries for each view) is unchanged, as the builder listed.

**Held again:** every round-1 hold re-ran with the same results: injection and wildcards, visibility on both lists, permissions, firm walls, leavers, odd keys and text. The 10× race of delete, take-back and the Agent's rename, now with versions, has one winner each time and no 500. `inlist.mts`: 32,000 ids pass and 33,000 fail, so the 30,000 limit keeps the list under the database's parameter limit.

Verdict: Changes 8eccabb30738e88a1df5289078babeb128c58d50

## Round 3 (diff only, 21fce934c)
**What was run:** `break-r3.mts` and `inlist-r3.mts`, against a clean `git archive` of 21fce934c (`/tmp/claude-0/pf22v-r3src`). `break-r3.mts` is round 2's script with DELETE switched to `?version=`, plus about 45 new calls. A second Owner with no leads was added, and another Agent's lead with the free-text source "Referral: Acme Holdings". The database was dropped. Rounds 1 and 2 re-ran, and every difference from round 2 is one of the intended fixes.

**Closed**
* **R2-M1 (read side):** "R2 Phone+Web" now opens for the Agent with `applies {source:"Phone call"}` and 2 rows; only the unseen source is left out and named. "R2 Web form" now gives `empty: true` with the line "…so the view shows nothing for you." An Owner with no leads can share "Web form" (201). A viewer who has the source keeps it (`dropped: []`).
* **R2-M2:** three identical creates at once → 201 ×3 with one id and one row. Retries that are exact, reordered, or use an upper-case request id → 201.
* **R2-m1:** sizes up to n=190 (15,994 by the bound, and the same 15,994 in the database) save; n=200 → 422; the round-2 crafted filter → 422. No 500. Literal `\u0000` text saves, a real NUL → 422, and control characters save.
* **R2-m3 (c):** the two-part filter (31 k each, 12 in common) saves, opens with `dropped: []`, and lists the 1 prospect.
* **R2-m4:** a replay after another person's take-back → 409. After one's own take-back → 201.
* **R2-m5:** "2026-03-01..2026-02-01" → `to`: "The end date is before the start date." A bad `to` drops only `to`.
* **DELETE:** a stale `?version=` → 409 STALE_VERSION. If-Match, a repeated `version` or an extra key → 422. An Agent deleting a shared view → 403.

**R3-M1 (Major, new): saving a view now confirms another person's free-text source to a `view.own` Agent. This undoes QA-533's guarantee.**
At save, a source is judged against every lead in the firm, for any caller, whether or not they share or hold the key (`saved-view-lists.ts:65`).
Repro: the Agent's own choices are Phone call and Referral. `GET /prospects?source=Referral: Acme Holdings` → 422, which is the list's deliberate non-answer. But a personal view POSTed with `{list:"fo.leads", filter:{source:"Referral: Acme Holdings"}}` (the other Agent's lead) → **201** (`empty: true`), while `"Referral: Nobody Ltd"` → **400**. So any staff member can test whether a guessed source text exists on leads they may not see, which `source-filter.ts:1-4` (QA-533) promises never to reveal. The 400's words "No lead you can see has … so the view shows nothing for you" are also wrong at save, because there the judgment is firm-wide.
Fix: judge firm-wide only for a caller who sees all leads, or who is sharing (`shared:true` and the share key). For everyone else, judge by what the viewer sees, as on read.

**Minor**
* **R3-m1: `applies` alone is not safe to open.** For "R2 Web form" the API returns `applies: {}` with `empty: true`. A client that opens `applies` without reading `empty` gets all 3 of the Agent's prospects (shown). The screen (PF-22s) has to honour `empty`, and its tests should cover it. A sturdier contract would leave in `applies` a part that makes the list return nothing.
* **R3-m2: an over-limit cf part still widens a view (the stated stop-gap).** "R3 vip three" was saved when it matched 1 prospect. After its field grows past 30 k firm-wide, it opens with `dropped: [cf.vip_three "matches too many records to apply"]`, `empty: false` and `applies: {}`, so the list shows 3 rows instead of 1. This is the same "show everything" outcome that M3 rejected for sources (`saved-view-lists.ts:90`). The count still runs before visibility, as the builder states.
* **R3-m3: DELETE ignores a body.** `DELETE {version:<stale>}` in the body (round 2's contract) → **200, deleted**: the version is silently not checked. Any other unknown input is a 422 (PF-28), so a body should be refused too.
* **Trivial:** a retry whose `owner` is in upper case → 409 REQUEST_REUSED, because the filter is compared as sent.
* **Unchanged and stated:** R2-m2 (optional version) is left for the Lead, and m5 (queries per view) is unchanged.

**Held again:** injection and wildcards, visibility on both lists, permissions (403/404), firm walls, leavers, odd keys and text, and the Prisma limit (32,000 ids pass, 33,000 fail). The 10× race of delete (`?version=`), take-back and the Agent's rename has one winner each time, no 500, and audit lines matching the outcomes.

Verdict: Changes 21fce934c89868b4855446f450c56ec5ac89170b

## Round 4 (diff only, 277dbeda6)
**What was run:** `break-r4.mts` and `inlist-r4.mts`, against a clean `git archive` of 277dbeda6 (`/tmp/claude-0/pf22v-r4src`). `break-r4.mts` is round 3's script plus about 20 new calls. Twice, the first request after the 62 k-row bulk insert failed with "fetch failed": `psql` blocks the event loop, so the keep-alive socket is lost. I added one retry to the harness; on the third run no retry was needed and nothing failed. The database was dropped. Rounds 1 to 3 re-ran, and every difference from round 3 is one of the intended fixes.

**Closed**
* **R3-M1:** the save oracle is gone. A `view.own` Agent's personal POST with "Referral: Acme Holdings" (another Agent's lead), "Referral: Nobody Ltd" or "Web form" → the same 400 for all three, with the same words, apart from the quoted source. A PATCH of a personal view's filter → the same 400 for Acme and Nobody, including when `shared:true` is sent without the key (no 403 that would show which is which). POST `shared:true` without the key → 403 before any check.
* **Share mode only with the key:** the Admin (key, sees only their own leads, has none) can share `{source:Acme}` (201); `{source:Nobody}` → 400 "No lead in the firm has…". The same Admin's *personal* `{source:Acme}` → 400 "No lead you can see has…". A PATCH of a shared view's filter is judged in share mode; `shared:false` together with a filter is judged by what the saver sees. Someone holding the configure-pipeline key can confirm sources across the firm; I accept that for Owner and Admin.
* **R3-m2:** "R3 vip three" (its cf part now past 30 k) opens with `empty: true` and the words "…so the view shows nothing; narrow it." It no longer opens wider.
* **Agent's view of a shared Acme view:** the source is dropped and named (the firm's shared words, as challenge M3 judged), with `empty: true`.

**Minor**
* **R4-m1: a view can still open to the list's 422.** This happens when one cf part is archived and another is past 30,000. Repro: save `{cf.temp:"keep", cf.vip_four:"true"}` while it matches 1 prospect; then `vip_four` grows to 30.5 k and `temp` is archived. GET views → `dropped: [cf.temp archived]`, `empty: false`, `applies: {cf.vip_four:"true"}`. Opening it → **422** "This filter matches too many records". Cause: `customFieldIdsWhere` refuses the archived key before it runs any query, so the count is never checked (`saved-view-lists.ts:82-95`). Fix: check the remaining cf parts again after dropping the archived ones. Rare, and it says what is wrong, never shows more.
* **Wording:** at share, a refusal ends with "…so the view shows nothing for you", although nothing was saved.
* **Stated in the PR, not re-opened:** R3-m1 (the screen must honour `empty`; PF-22s should test it), R3-m3 (a DELETE body is ignored; the builder says the real app does not parse DELETE bodies, which I did not check in the full app), R2-m2 (optional version, for the Lead), m5 (queries per view), and the upper-case owner retry.

**Held again:** injection and wildcards, visibility on both lists, permissions, firm walls, leavers, odd keys and text, the size bound (n=190 saves, n=200 → 422), versions and idempotent retries, and the races (one winner each time, no 500, audit lines matching). The Prisma limit: 32,000 ids pass, 33,000 fail. No open Blocker or Major.

Verdict: Approve 277dbeda616cd36136a30df7eff5fc44640fd233
