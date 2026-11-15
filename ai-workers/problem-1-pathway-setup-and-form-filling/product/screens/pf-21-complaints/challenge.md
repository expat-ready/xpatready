# PF-21s — Complaints list and record page: fresh challenge (stage 1)

Independent challenger, 15 Nov 2026 (a context that did not draft the concept). Read: `concept.md`, `design/layout.html`, `EXPERIENCE.md`, `STANDARDS.md`, `QUALITY.md`, `PRODUCT.md` words, the service (`api/src/platform/complaints/complaints.ts`, `business-days.ts`), its migration (`prisma/migrations/20261114234500_pf21_complaints/migration.sql`), the identity routes and guard, `web/src/modules/README.md`, `web/src/lib/api.ts`, `web/src/components/frame.tsx` and `where.ts`, the BACKLOG rows PF-21s, PF-21, PF-6, PF-4b, J-109, the two Lead B briefs (PF-21s, PF-21w), and only the requirement text `trace-requirements.py --brief PF-21s` and `--brief PF-21` print (P-579, P-584 (8); Code SOR/2022-128 s. 24(3)(r)(v), 29, 37, Unconfirmed: no counsel).

**Freshness:** `ai-workers/tools/freshness.sh` could not run in this copy (`code/README-copies.md` is absent: `code/` is not in a cloud clone). Team sources are therefore **Unverified**. The concept cites no team screen ("none found"), so nothing in it rests on them.

Paths below are under `prototype/studio/` unless they start with `product/`.

## Verdict
**Build after these changes.** The shape is right (list, record page, drawers, same not-found words, no delete, Sample marked) and the concept reads the service's permissions correctly. One thing stops stage 2 as written (the browser has no way to be a signed-in staff member on `main`), and four more would make the screen record untrue facts, show blanks or refuse its own buttons. All are fixable in the concept text and one brief amendment; none needs a rethink.

Counts: **1 Blocker · 5 Major · 8 Minor.**

## Objections

### Blocker

**B1. The browser cannot call PF-21w's routes on `main`: there is no staff session in the web app, and the concept does not say where one comes from.** *Needed for the proof.*
* **What breaks:** every route of the screen needs `Authorization: Bearer <token>`; the web sends only the simulated person. The list, the record page and DW1–DW6 cannot run in a browser as designed.
* **Evidence (fact):** the guard: "The simulated-person header gives nothing here: no bearer token is a 401" (`api/src/platform/identity/guard.ts:6`, `:63-65`). The web's only caller sends `x-actor` (`web/src/lib/api.ts:1-2`). No file under `web/src` names `api/platform` or `session/local` (searched; `web/src/modules/` holds only `_example`). The token comes from `POST /api/platform/session/local` (`identity/service.ts:129-141`), which nothing in the web calls.
* **Example:** DW1 "Owner sees all four views": the test can seed through the API with a token, but the page it then opens has no token and shows a 401.
* **Why the PF-6 conclusion does not fully hold:** the concept says "PF-21s needs nothing PF-6 builds" because `Frame` exists and a staff list route is not PF-6's. Both true, but the piece it does need is the signed-in staff member in the browser (token kept, sent on each call, 401 "signed in elsewhere" handled). On `main` nobody has built it; PF-6's concept puts its screens in "its own frame component inside `web/src/modules/platform/`" with "Signed in elsewhere" and "Confirm it's you" (PF-6 row, `product/BACKLOG.md:303`), on PF-4b's web session (`product/BACKLOG.md:265`, not built).
* **Fix (choose one, write it in the concept and the row):** (a) keep a wait, but name it exactly: the platform web session piece (PF-6's frame and session holder), not all of PF-6; or (b) drop the wait and state that part 1 carries a small session holder for the local stand-in in `web/src/modules/platform/` (token in memory or session storage, one fetch helper, a plain "Sign in to see complaints" state on 401), labelled **scaffolding** (P-33) that PF-6 replaces, with its lines counted in part 1's 800. Judgment: (b) is the faster road and matches "drop the PF-6 wait", but only if it is written down and sized; silently it becomes an unplanned second identity client.
* **Confidence:** high on the facts; medium on which fix (depends on how close PF-6 is).

### Major

**M1. Gaps G1–G4: three are real and need the server, one does not; as recommended they contradict both "no new API" and PF-21w's touch list, and PF-21w is ready to start now.** *Needed for the proof.*
* **Facts checked in the service:** the list returns `{ items, next }` only (`complaints.ts:123`, `:249`); a view carries `acknowledgeBy` and `overdue` and no day count (`:122-128`); people appear only as ids (`handlerStaffId`, `recordedBy` and `actor` as `staff:<id>`, `:156`, `:209-211`; handler changes as `from`/`to` ids, `:324`); the only staff read on `main` is `GET staff/invitations` (`identity/routes.ts:25`). So G1–G4 are real, not invented.
* **The conflict:** the PF-21s brief says "the screen calls only PF-21w's routes (no new API)". The PF-21w brief's touch list is `routes.ts`, the feature file and its test, and "a needed change to `complaints.ts` → stop and ask" (brief `PF-21w.md` on branch `lead-b-front-office`). The concept's definition of ready rewrites the row to "waits on PF-21w (incl. G1–G4)" without that brief changing. If PF-21w is built as briefed, part 1 cannot be built.
* **Resolution, gap by gap:**
  * **G1 counts: compute in the browser, no API change.** Every item already carries `status` and the server's own `overdue` flag. One `GET /?view=all` page gives all four counts exactly whenever `next` is null (up to 100 complaints in the reader's scope, `PAGE = 100`, `:35`); beyond that the chips show "100+". This copies no rule (the flags are the server's) and is scoped like the list by construction (`mine`, `:237`). Rows still come from the server's own view (the overdue order, `:245`, stays the server's). A server `counts` field becomes a follow-up when a firm passes 100. Judgment; confidence medium-high.
  * **G2 business days left / late: server, or dropped; never in the browser.** The count needs the firm's hours and closed days (`:158-164`), which no route serves, and a copy of `business-days.ts` in the web would break STANDARDS §7 (no duplicated logic). Since the brief and DW6 ask for the number: one field on the view (`businessDaysLeft`, negative when late) from one pure function beside `acknowledgeBy`, the calendar read once per request (not per row), with a pass and a fail in PF-21's suite. If Lead B allows no service change, the honest fallback is the date plus the words "Late" / "Due today" from `overdue`, and DW6 loses "N business days".
  * **G3 names: server.** Nothing in the browser can turn a staff id into a name for a Case Manager or a keyless handler. A `people` map (id → display name, including people since deactivated) on the list and on `GET /:id`. Without it the Handler column the brief asks for is empty.
  * **G4 handler picker: a new route, so it must be added to PF-21w's own route table by Lead B, or dropped.** `GET /handlers` (active staff: id and display name only; the record key) is the smallest form. The alternative without any new route: the drawer's handler is always the recorder, and Change handler (Owner, Admin; both hold `agent/staff:manage`, PF-3 migration lines 1122-1123) reads PF-4b's `GET /api/platform/staff` once that is on `main`. That alternative makes a Case Manager the handler of everything they record, including a complaint about themselves, and makes part 2 wait on PF-4b. Judgment: take `GET /handlers`.
* **Fix:** before PF-21w starts, Lead B amends the PF-21w brief once (touch list gains `complaints.ts` and `business-days.ts` for G2, G3, G4 and the route table gains `GET /handlers`), or opens a small row for them; the PF-21s brief's "no new API" then stays true word for word, because the screen still calls only PF-21w's routes. G1 leaves the gap list.
* **Confidence:** high on facts; medium on the split.

**M2. The next-step ladder is stricter than the service and misstates it; on a register that keeps everything, that pushes people to record things that did not happen.** *Needed for the proof.*
* **Facts:** the concept's BR-5 says "close once, after all three". The service closes an open complaint at any point: the close date must only be no earlier than whichever of received, acknowledged and response dates exist (`complaints.ts:336-338`; the database check uses `greatest`, which skips empty dates, migration line 139). A response may be recorded before any acknowledgement (`:309`) and with no handling step at all (steps are never required anywhere in the service).
* **What breaks:** the record page offers "Close with an outcome" only after a response is recorded, and "Record the response sent" only after a step (Board 2's note; concept §4). Secondary actions are only Add a step / Add a note.
* **Example:** the complainant withdraws by phone the same afternoon. The outcome list has "Withdrawn", but Close is not on the page. The handler must first record an acknowledgement, a step and a "response sent" that was never sent, and none of the three can ever be removed (BR-6, BR-7). Second example: the firm's first reply both acknowledges and answers; "Record the response sent" is not offered until a made-up step exists.
* **Fix:** keep the one filled button by status exactly as drawn, and list every act the service still allows as a quiet secondary action while the complaint is open (Record the response sent, Close with an outcome), each still one drawer. Correct BR-5 to the service's rule. No new scope: the routes exist.
* **Confidence:** high.

**M3. "From" has no name for two of the three kinds, and those two kinds are a dead end in the drawer.** *Needed for the proof (name); Not built (picker).*
* **Facts:** a name is required only for "Someone else" (`complaints.ts:99-102`; migration line 126). For a front-office person or a case party the service stores an id it never checks and no name ("the id is not checked here, the other module owns it", `:2-3`). The layout's list shows "Client A · Person on a case" and "Prospect C · Front-office contact" (Board 1), a name the data does not hold. The concept offers all three kinds in part 1 and says ids "arrive prefilled from those modules' pages"; no such page exists in the web (`web/src/modules/` is `_example` only).
* **What breaks:** (1) a linked complaint lists with an empty From, and the record header reads "Fees complaint from …" with nothing; (2) choosing "Someone in the front office" or "A person on a case" without a prefilled id can only end in the field error "choose the person" with nothing to choose from.
* **Fix:** (1) the drawer always asks for and sends `complainantName` (the service accepts it for every kind, `:91`), prefilled from the link's address when one arrives; the list and header show that name. (2) The two linked kinds are offered only when their id arrives in the address; otherwise the drawer offers "Someone else" alone, with one line saying linked complaints are recorded from the person's own page. State that until those pages exist the proof records "Someone else" only (the journeys seed the other kinds through the API).
* **Confidence:** high.

**M4. What each person sees is described by persona, not as rules, and three people fall between: buttons that can only refuse.** *Needed for the proof.*
* **Facts and examples:**
  * **A handler with no key** (a Case Officer named handler; PF-21w DW3) gets "Record a complaint" as the page's filled button and in the empty state (Board 4), but `POST /` needs the record key and answers 403 (`complaints.ts:198`; PF-21w DW1). The concept never says the button is hidden without the key.
  * **Read key without the record key** (no seeded role, but the service allows for it: read sees, cannot act, `:153-155`, `:259`): the page would show the next-step button and the service refuses with 403. The rule to write: action buttons show only for the handler or a holder of both keys; otherwise the record is read-only with one line saying why (EXPERIENCE §4 read-only state, not drawn).
  * **Access lost while working:** an Owner changes the handler while the old handler has an action drawer open; the save answers 404 (`:258`), not 409 or 403. The concept's refused state covers 409 and 403 only. It must show the same not-found words (BR-4), keep nothing of the record on screen, and return to the list.
  * **Two identities in one header:** the concept uses the app's `Frame area="cases"`, whose where-line and other-area link speak of simulated people ("Cases (as …)", `web/src/components/frame.tsx:57-58`) while the page acts as the token's staff member. The header must name the signed-in staff member from `GET /api/platform/me` (`displayName`, `identity/service.ts:147`) and not show the simulated-person controls on these pages. This goes with B1's choice.
* **What is not a leak (checked):** the list scopes non-readers to their own (`:237`); another firm's, someone else's and a malformed id all answer the same 404 (`:173`, `:222-224`, `:258`); a Case Manager posting to `/handler` gets the guard's 403 for every id alike, so it tells nothing about an id; the toast after recording for someone else shows only what the recorder typed. No leak found in the concept's design beyond the items above.
* **Fix:** add a short "who sees what" rule table to §3 (page, Record button, action buttons, Change handler, by: record key, read key, both, handler, none) and the 404-on-action state to §4 and §5.
* **Confidence:** high.

**M5. The "30-business-day clock" is in two records and in neither the code nor any cited source; the concept is right not to show it, but leaves it open.** *Needed for the proof (the walk J-109 names it).*
* **Facts:** `business-days.ts` holds one period: `ACK_BUSINESS_DAYS = 2`, "Sample … to set from the by-laws once read" (lines 1-8), an acknowledge-by date only. The service has no response-by or close-by date; once acknowledged nothing is ever overdue (`complaints.ts:124`). J-109's walk says "its 30-business-day clock" (`product/BACKLOG.md:832`) and the PF-21s brief says "the 30-business-day clock in `business-days.ts`" (brief `PF-21s.md`). The requirement text printed for PF-21s and PF-21 names no period at all. So the 30 is a slip in the records, not a rule; the concept's reading (G5, BR-8) is correct.
* **What breaks if left:** J-109's walk cannot pass as worded, and a builder reading the brief may add a 30-day figure, an immigration value with no official source (AGENTS rule 4).
* **Fix:** correct both texts to "its acknowledge-by date (2 business days, Sample)" now. A response-by period is a new rule and a new value: only after the College's by-laws are read with page, quote and date, as its own row. See question 1.
* **Confidence:** high on the facts.

### Minor

* **m1. The firm's time zone is not available to the screen.** Board 2 shows "(America/Toronto)" and "12 Nov 2026, 17:00"; no route gives the zone (`settings.ts` is read only server-side, `complaints.ts:160`). A staff member in another zone would see the acknowledge-by day shift. Fix: show times in the viewer's own zone and say so once, or carry the zone with G2's field. *Needed for the proof.* Confidence high.
* **m2. "Acknowledged · 1 business day after its date"** in the timeline (Board 2) needs a second business-day count that G2 does not cover. Fix: drop the phrase; show the two dates. *Not built.* Confidence high.
* **m3. "Date defaults to now" can be refused as "in the future"** when the browser's clock runs ahead of the server's (`notFuture`, `:179-183`). Fix: a step or note left at its default sends no date (the service fills it, `:107`, `:295`); the other three send the default cut to the minute, and the field error keeps the drawer open as already designed. *Needed for the proof.* Confidence medium.
* **m4. "Overdue" means only "not acknowledged by its date".** An acknowledged complaint left untouched for months shows plain Open. That is the service; no objection to it, but the Overdue chip's tooltip and the "How it works" panel must say so, so nobody reads Open as "on time". *Needed for the proof (copy only).* Confidence high.
* **m5. "Cases › Complaints".** The register is firm-level (P-584 (8)), not part of a case; and `whereFromAddress("cases", "/platform/complaints")` would read the address as a case (`where.ts`, the `cases` branch), so both pages must set their own line with `useWhere`, as the concept says. Fix: the line reads "Complaints" (and "Complaints › …"), with Cases only as the way back. *Needed for the proof.* Confidence medium.
* **m6. Two states of EXPERIENCE §4 are not drawn:** long content (a 4,000-character summary and note, a 200-character name: where they wrap or cut in the table and the header) and read-only with its reason (M4). *Needed for the proof.* Confidence high.
* **m7. Best in class (§4b) is "from product knowledge, not re-read today".** Mark those lines Unverified; nothing in the design depends on them. *Not built.* Confidence high.
* **m8. Part 1's size.** Part 1 carries routes, list, drawer, the read-only record page, six states, four journeys and, under B1 (b), the session holder; it is the part at risk of passing 800 lines. Fix: say now that if it would pass 800 the read-only record page moves to part 2 with DW5's page half (the list half of DW2 and DW5 stays). DW6 must be reworded if G2 falls back to words. *Needed for the proof.* Confidence medium.

## What is sound
* **Permissions read correctly from the service:** read key sees all, otherwise own (`:153`, `:237`); act = handler or both keys (`:155`); change handler = both keys, open, active, not the same person (`:317-323`); one 404 for another firm's, someone else's and a bad id. BR-1 to BR-4 and BR-6 to BR-9 match the code.
* **Not found uses one set of words** for all three cases, and the Case Manager who records for someone else stays on the list with a toast instead of being sent to a page that would 404. Good, and not obvious.
* **No delete control anywhere**, matching the 405 for everyone (`:348-350`).
* **`reminderScheduled: false`** has its own honest toast (`:195-196`, `:214`).
* **Overdue in the one "needs you" colour with shape and words**; status never by colour alone (EXPERIENCE §1, §2.11).
* **Patterns chosen from EXPERIENCE §3**, not invented; drawers keep the page (§2.3); field errors on the field with a summary and typed text kept (BIC-13).
* **Sample marked once per field and "Unconfirmed: no counsel" in the How it works panel**; no period or list is presented as the College's rule. Immigration fit: nothing here names a program, form or fee; the three Code sections are cited as PF-21 cites them.
* **The gaps were declared, not papered over** (G1–G5), and G5's reading of the code is right.
* **Insert-only timeline** shown as events with time, who and words, with the reminder as a system event: matches the record (`:377`).
* **The staff list is not PF-6's to bring** (it is PF-4b's `GET /api/platform/staff`, behind `agent/staff:manage`, which a Case Manager does not hold): that half of the PF-6 conclusion holds.
* **Quality:** D1, D2, D8–D11, D13, D16 are at 4 or better on paper once B1 and M1–M4 are fixed; D19 (end to end) depends on B1.

## Back-end plan (element → record → API → rule → test)
| Element | Record | API | Rule | Test |
|---|---|---|---|---|
| Signed-in staff member, what to show | `platform_staff`, grants, keys | `POST /api/platform/session/local` (stand-in), `GET /api/platform/me` (`staffId`, `displayName`, `keys`) | 401 without a token; B1's choice | DW1 opens as Owner; DW2 as a handler |
| List rows, four views, Show more | `plat_complaint` | `GET /?view&cursor&limit` | read key all, else own; overdue order by date | DW1, DW2 |
| Counts on the chips | same | `GET /?view=all` (one page; counted in the browser from `status` and `overdue`) | "100+" when `next` is not null | DW1: each count equals its view's rows; fail: a closed one absent from Open |
| Business days left / late | `plat_complaint.acknowledge_by` + firm hours and closed days | view field `businessDaysLeft` (M1 G2, PF-21w amended) or words only | never computed in the browser | DW6; a pass and a fail in PF-21's suite for the function |
| Names (handler, who did it) | `platform_staff.display_name` | `people` map on list and `GET /:id` (M1 G3) | includes deactivated people; names only | DW1 shows a handler name; DW2 shows no name outside the reader's rows |
| Record a complaint | `plat_complaint` + RECEIVED event + audit + outbox | `POST /` | record key; name always sent (M3); linked kinds only with an id from the address; handler active | field-error fail (no name); pass recorded; toast when the handler is someone else |
| Handler choices | `platform_staff` (active) | `GET /handlers` (M1 G4, added to PF-21w's table) | record key; id and name only | DW4's picker lists active staff only |
| Record page facts + timeline | `plat_complaint`, `plat_complaint_event` | `GET /:id` | same 404 for all three cases | DW2, DW5 |
| Acknowledge / step / note / response / close | event first, then the row | `POST /:id/acknowledge`, `/steps`, `/response-sent`, `/close` | handler or both keys; order of dates; closed takes a note only; every allowed act reachable (M2) | DW3 + one close straight after receipt (Withdrawn) + response before acknowledgement refused on the field |
| Change handler | HANDLER_CHANGED event, then the row | `POST /:id/handler` | both keys; open; active; not the same person | DW4 (hidden for a Case Manager; forced call refused) |
| Refusals | none | 409 closed / once; 403; 404 on an action (M4) | words per case; typed text kept; 404 leaves no record on screen | one journey step each |
| Delete | none | none called (`DELETE` answers 405) | no control | code check: no delete control in the module |

## Questions for the founder
1. **A response-by period for complaints?** Recommendation: **no, not now.** Correct the two texts that say "30-business-day clock" to the acknowledge-by date the service has (2 business days, Sample), and add a response-by period only after the College's by-laws are read with page, quote and date, as its own row. Consequence of yes now: a number with no source on a regulatory screen (AGENTS rule 4). If the "30" was the Lead's wording and not a founder decision, Lead B corrects it and this is not a founder question.

No other founder question: B1 and M1–M4 are Lead B's to settle.

## Lead response
Lead B (6), row owner, rev 16.28 (on PR #1821). Challenge accepted in full: 1 Blocker, 5 Major, 8 Minor.
* **B1:** fix (a), a named wait. PF-21s waits on **PF-6 part 1 only**: the platform frame and staff session holder in `web/src/modules/platform/` (keeps the token, fetch helper, 401 "Signed in elsewhere", the staff member's name from `GET /api/platform/me` in the header). Lead B writes PF-6's brief with it as part 1, first after PF-4b (#1816). Not (b): a holder inside complaints would be a second identity client that PF-6 then replaces. Row text: "waits on: PF-21w, PF-21v, PF-6 part 1".
* **M1:** PF-21w (#1823) is not changed; it is approved with its agreed touch list. G2 (`businessDaysLeft`, negative when late, one pure function beside `acknowledgeBy`, calendar read once per request, a pass and a fail in PF-21's suite), G3 (`people` map incl. deactivated, list and `GET /:id`), G4 (`GET /api/platform/complaints/handlers`, active staff id and name, record key, `@PermissionKeys`, owned by complaints) and m1 (`firmTimeZone` on list and `GET /:id`) go to a new row **PF-21v** (runtime, API only, under 800 lines). G1 is counted in the browser from one `GET /?view=all` page, "100+" when `next` is set; a server `counts` field becomes a row only once a firm passes 100. The PF-21s brief now reads "only PF-21's routes (PF-21w and PF-21v)".
* **M2:** accepted. BR-5 corrected to the service; every act still allowed while open is a quiet secondary action; the Withdrawn-straight-after-receipt close is a DW3 case.
* **M3:** accepted. The drawer always asks for and sends `complainantName`; the two linked kinds appear only when their id arrives in the address; the proof records "Someone else"; journeys seed the other two kinds through the API.
* **M4:** accepted. Rule table in §3; read-only state with its reason; 404-on-action state (not-found words, nothing of the record kept, back to the list); header names the staff member from `/me` with no simulated-person controls (PF-6 part 1's frame); "Record a complaint" hidden without the record key.
* **M5:** not a founder question: the 30 was Lead B's slip in the PF-21s brief and J-109's walk text; the requirement snapshot names no complaint period. Both now read "its acknowledge-by date (2 business days, Sample)". A response-by period becomes its own row only once the College's by-laws are read and cited (AGENTS rule 4). G5 closed; question 1 withdrawn.
* **Minors:** m2–m7 accepted as written. m1 handled under M1 (the firm's zone, not the viewer's). m8 accepted; the session holder is now PF-6's, so part 1 is smaller; if it would still pass 800 lines, the read-only record page moves to part 2. DW6 keeps "N business days late" (G2 is on the server).
* Records: rev 16.28 on `lead-b-front-office` (the PF-21v row, the corrected PF-21s and J-109 text, the PF-6 part 1 split).

## Agreement
Agreed. All objections applied in `concept.md` and `design/layout.html`; the concept is approved for stage 2 with no second challenge round. Stage 2 waits on PF-21w, PF-21v and PF-6 part 1.

## Build discoveries
_(empty)_
