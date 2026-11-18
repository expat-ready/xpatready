# Wave 1 start sheet: the Sales lane (FO-2 parts 3-5, FO-4 parts 2a, 2b and 3, FO-4b, J-27) (row owner Lead B / Build Lead A)

Written 18 Nov 19:xx IST by Lead B (6) at Lead 80's request: Wave 1 of `design/release1-end-to-end-review-2026-11-18.md` (on `lead/2026-11-07-lead31`, 184d37e2d), P-697 and P-698. It targets R1.26, R1.27, R1.28 and R1.30. **This sheet amends `FO-2.md` and `FO-4.md`; read those briefs too.** Where they disagree, this sheet wins: it is newer, and it reflects what is actually on `main` today (15c75cd52).

## What `main` already has (read 18 Nov, so nobody builds it twice)
* **FO-2 parts 1-2 (#1813, #1843):**
  * the public form read and its submission;
  * the leads list: `view=unassigned|mine|all|closed`, plus FO-4sf's `&source=`;
  * `leads/sources`, `leads/assignees`, one lead;
  * Add a lead, Take it, Assign, Close and Reopen (`api/src/front-office/sales/routes.ts`, 43 lines).
* **FO-2b (#2019):**
  * Engage as **Corporate**, Change type, company contacts;
  * **`GET pipelines/:type/board`**. **It is a duplicate risk:** the Individual board must reuse this route, not add a second board route.
* **FO-4 part 1 (#1822) and FO-4sf (#1962):**
  * the hosted form page;
  * Leads, one lead and Take it;
  * the Source filter.

  Assign, Close, Reopen and the open-hours wait are already in `leads-page.tsx` and `lead-page.tsx`.
* **The prospect write paths outside sales:** FO-6's retainer signing writes `prospect.won` (`retainers/service.ts`). Won by signature already exists; FO-2 part 3 must not add a second Won path (BR-8).
* **Not on `main`:**
  * Engage (Individual), the prospects routes (404 today) and stage moves with a cause;
  * Mark lost, Convert and Undo convert;
  * Log a call, Add a note and the timeline;
  * the leads filters by owner and date;
  * the web-form settings and the reasons lists;
  * the demo reset's front-office seeds (only `firm-seed.ts` exists; nothing calls `seedSampleFirmsFrontOffice` from the reset);
  * the `frame-ancestors` header on `/front-office/web-form/:token` (#1822's recommendation);
  * FO-4b.

## Order (one PR each; a screen part ships after its API part is on `main`, rev 16.11 (c))
| # | Part | Type | Starts when | Rows |
|---|---|---|---|---|
| 1 | **FO-2 part 3**: prospects | runtime | now (P-663 permitting) | R1.30, R1.31 |
| 2 | **FO-4 part 2a**: Engage, the prospects board and list, Move to…, Lost, Convert and Undo | screens | FO-2 part 3 on `main` | R1.30 |
| 3 | **FO-2 part 4**: calls, notes and the timeline | runtime | FO-2 part 3 on `main` (same files) | R1.27 (first response) |
| 4 | **FO-4 part 2b**: Log a call, Add a note and the timeline | screens | FO-2 part 4 on `main` | |
| 5 | **FO-2 part 5**: web-form settings, reasons lists, demo seeds, `frame-ancestors` | runtime | FO-2 part 4 on `main` | R1.26, R1.28 |
| 6 | **FO-4 part 3**: the settings panel and the reasons lists | screens | FO-2 part 5 on `main` | R1.26, R1.28 |
| 7 | **FO-4b**: the embed script with campaign capture | screens + one served file | FO-4 part 3 on `main` | R1.26, R1.27 |
| 8 | **J-27**: join and walk | journey | FO-4b and FO-4 part 2a on `main` | R1.27, R1.28 |

API parts in a row touch the same `sales/*` files, so they run in series. The screens part N+1 can be coded beside API part N+1, and gets labelled only when that API part is on `main`.

## FO-2 part 3: prospects (runtime, Opus 5.5 high, reviewer + breaker)
**Build (no schema change; FO-1a's `fo_prospect`, `fo_stage`, `fo_stage_move` and `fo_reason` exist):**
* `POST leads/:id/engage` (Individual; BR-7). Every request makes a prospect: a second Engage is allowed and says so. The prospect goes to the lead's owner, else the person who clicked.
* `GET prospects?type=INDIVIDUAL&stage=&owner=&from=&to=`, with the same visibility as leads (`@OwnOrAll`).
* `GET prospects/:id`.
* `POST prospects/:id/move { stageId, cause, version }`:
  * a stale version → 409 with a reload;
  * **no move into a WON stage by a person** (BR-8): Won comes only from FO-6's signature or from Convert.
* `POST prospects/:id/lost { reasonId }`, with a reason from the firm's prospect list (BR-9), and a Lost filter.
* `POST prospects/:id/convert` and `POST prospects/:id/undo-convert` (BR-11). Undo is allowed only while the client has no case, invoice or signed retainer, answering 409 with that reason.
* The Individual board **through the existing `GET pipelines/:type/board`** with `type=INDIVIDUAL`, plus totals **per currency**, never summed across currencies (R1.31).
* The leads list gains `&owner=` and `&from=&to=` (the arrival date, in the firm's zone), narrowed inside the visibility like FO-4sf's `&source=`.

Each write has one audit line (`AuditPort.record(tx, …)`, with a **typed actor** `staff:<id>`, since #2003 refuses untyped ones), and any `module_event` goes **last** in the transaction.

**Done when** (`tests/check_fo2p3_prospects.ts`, a pass and a fail each):
* `FO-2p3 DW1`: Engage makes a prospect, and a second Engage makes a second one that says so.
* `FO-2p3 DW2`: a move with a cause is saved and audited; a stale version → 409; a move into WON → 422.
* `FO-2p3 DW3`: Lost without a reason → 422 with `fields.reasonId`. A reason from the lead list (not the prospect list) → 422 (the PF-28 status rule).
* `FO-2p3 DW4`: Convert, then Undo, works while the client is empty. After a signed retainer, Undo → 409.
* `FO-2p3 DW5`: board totals in CAD and USD are shown apart.
* `FO-2p3 DW6`: the leads filters for owner and date narrow inside the visibility. Firm A never sees firm B's rows.
* FO-2b's, FO-6's, FO-4sf's and FO-2v's suites pass unchanged.

**Touch list:** `api/src/front-office/sales/*.ts` (new `prospects.ts`; `routes.ts` gains its lines), `api/src/features/front-office-sales.ts`, `api/src/front-office/MODULE.md` (the entry-point line), `tests/check_fo2p3_prospects.ts`. **Do not touch** `sales/corporate/*`. If the board route needs a change there, stop and ask Lead B on the PR.

**Size (P-610):** about 600 lines. If it passes 800, split Convert and Undo into part 3b.

## FO-2 part 4: calls, notes and the timeline (runtime, Opus 5.5 medium, reviewer)
* `POST leads/:id/calls` and `POST prospects/:id/calls`:
  * seven outcomes;
  * `when` defaults to now and can be edited;
  * **the first logged call is the first response, set once** (BR-6);
  * a call never moves a stage.
* `POST …/notes`, with `INTERNAL` visibility. The web form's message is already the first note (#1742 m12).
* `GET leads/:id/timeline` and `GET prospects/:id/timeline`: a read view over `audit_event`, `module_event`, `fo_call` and `fo_note`, **in one line format from `ports/events.ts`** (review D10: five "what happened" readers must not invent five formats). If `ports/events.ts` has no line type yet, add the smallest one and list it under "Shared-file lines" for the Lead's read (P-423, a shared contract).

**Done when** (`FO-2p4 DW1..DW4`):
* the first call sets the first response, and a second call does not;
* a call leaves the stage unchanged;
* the timeline lists a lead's arrival, take, call and note in time order in the shared format;
* another firm's lead → 404.

**Touch list:** `sales/*.ts` (new `calls.ts`, `timeline.ts`), `routes.ts`, `MODULE.md`, `ports/events.ts` (one type, if needed, flagged), `tests/check_fo2p4_calls_timeline.ts`.

## FO-2 part 5: web-form settings, reasons, seeds and the frame header (runtime, Opus 5.5 high, reviewer + breaker: the public door)
* `GET/PUT web-forms/:id`, with keys `agent/settings:*`: on and off, allowed sites, the consent wording version (PF-19a's `msg_consent_wording`, by id), and the thank-you text.
  * An off form's public read answers "This form is not available" (BR-3).
  * A site not allowed is refused at submission.
* `GET/POST/PATCH reasons?list=lead|prospect`:
  * add, rename, turn off;
  * a **system** reason cannot be removed or turned off;
  * the key and list never change (the FO-1a trigger).
* **The demo reset's seeds** (FO-2 brief "The seeds", Lead 45's three conditions, unchanged). List them under "Shared-file lines".
* **`frame-ancestors`:** the hosted page `/front-office/web-form/:token` is served with `Content-Security-Policy: frame-ancestors <the form's allowed sites>` (#1822's recommendation).

**Done when** (`FO-2p5 DW1..DW6`):
* turning a form off makes the public read say "not available";
* a submission from a site not allowed → refused;
* changing the consent wording version shows the new version at the next draw, and a lead's consent names the version shown (R1.28);
* a system reason cannot be turned off;
* after a demo reset both Sample firms have both pipelines and their reasons, and a second reset adds nothing;
* the hosted page carries the `frame-ancestors` header.

`check_s7_reset` and `check_d1_reset_to_six` stay green.

**Touch list:** `sales/*.ts` (new `settings.ts`, `reasons.ts`), `routes.ts`, `public.ts` (the header and the off state), the reset's one-line hooks (shared, flagged), `MODULE.md`, `tests/check_fo2p5_settings.ts`.

## FO-4 parts 2a, 2b and 3 (screens, Opus 5.5 medium, reviewer + breaker)
These are the concept r2 parts from `FO-4.md`. Its "Part 2" is now split by the API parts above:
* **2a** (after FO-2 part 3): Engage (Individual), the prospects board and list with "Move to…" (no drag library; BR-8), Mark lost and the Lost filter, Convert and Undo, and the leads owner and date filters. Tests DW9-DW11 and DW13 from the concept's journeys.
* **2b** (after FO-2 part 4): Log a call, the first response, Add a note and the timeline (DW8, DW12).
* **3** (after FO-2 part 5): the web-form settings panel and the two reasons lists (Owner, Admin).

**Every part:** keyboard only, axe-core, and 375, 1024 and 1440 px. **No fake API in the shipped code.** The concept is on branch `lead-b-front-office` (`screens/fo-4-sales/concept.md`).

**Touch list:** `web/src/modules/front-office/sales/*` (new pages), `web/src/modules/front-office/routes.tsx` (its lines), `tests/check_fo4_sales_browser.ts` or a new `check_fo4p2a_…_browser.ts`.

**Clash (review, Wave 1):** the Booking lane also adds lines to `routes.tsx` and the front-office `MODULE.md`, so merge them one after the other. Keep `MODULE.md` under the module-cards check's 40 lines (#2114). Add an entry-point line by moving detail into `api/src/front-office/sales/README.md`, never by deleting another row's facts.

## FO-4b: the embed script (BACKLOG FO-4b, unchanged; breaker: yes)
The row text stands: the script is served by our API; it takes a fresh `submissionId` per draw and sends the campaign fields, click id, landing page and referrer; no cookies, no storage.

**Touch list:**
* new `web/src/modules/front-office/embed/*`;
* `api/src/front-office/sales/embed.ts` (one served-file route);
* the settings panel's snippet box (FO-4 part 3's file, one block);
* `tests/check_fo4b_embed_browser.ts`.

**Done when:** the row's four checks are the tests, `FO-4b DW1..DW4`.

## J-27: join and walk (`J-rows.md` §J-27, unchanged)
* **Swap:** booking's `arrival` from `fakeArrival` to FO-2's port (`runtime-ports.ts`).
* **Walk:** W1 web form → W2 the lead's source and consent per purpose (J-28) → W3 Unassigned → W4 Take it → W5 Engage → W6 row 37's first step.
* **Touch list:** the swap line and `tests/journeys/j_27.ts`.

## Duplicate check (P-526; done 18 Nov 19:xx IST on `main` 15c75cd52 and the open-PR list)
**Searched:**
* BACKLOG rows FO-2, FO-2b, FO-4, FO-4b, FO-4sf and J-27;
* open PRs: no open PR names FO-2, FO-4, FO-4b or J-27;
* branches: none for sales;
* `git grep` on `main` for `engage`, `fo_prospect` and `board` under `api/src`.

**Found:**
* FO-2b's corporate Engage and `pipelines/:type/board`: reuse them, don't rebuild them;
* FO-6's `prospect.won`: the only Won path besides Convert.

Each PR writes its own `Duplicate check:` line again at start.

## Rules (standard, every PF/FO brief)
* **Work rules:**
  * P-559; one part, one session, one PR (P-683: Approve on the branch first, then open the PR non-draft; never toggle draft);
  * Opus reviewer (P-303); re-review reads only the diff (P-277);
  * label after `Reviewer: Approve <sha>` and green CI (P-385); merge `main` only on a conflict, never rebase (P-270);
  * migrations: none in this lane. If one appears, its stamp must be later than `main`'s and different from every open PR's (P-600).
* **Safety:** live AI off, US$0, never a priced button (P-175); no real keys.
* **Process:**
  * push after every step (P-557);
  * questions as a PR comment headed "Question for the tech lead", with row owner Lead B;
  * **P-663** holds new capability rows while queue waits are high: the Lead says when each part may start.
