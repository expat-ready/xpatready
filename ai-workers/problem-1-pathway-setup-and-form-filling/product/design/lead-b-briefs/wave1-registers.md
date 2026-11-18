# Wave 1 start sheet: the Registers lane (PF-21s part 4, then J-109) (row owner Lead B / Build Lead A)

Written 18 Nov 19:xx IST by Lead B (6) at Lead 80's request (Wave 1, P-697, P-698). It targets R1.109. **This sheet amends `PF-21s.md` and `J-rows.md` §J-109; read them too.**

## No new concept is needed for part 4
Lead 80 asked for a "PF-21s part 4 concept". The concept already covers part 4:
* `screens/pf-21-complaints/concept.md`, merged in #1821, with its `challenge.md` and `design/layout.html` on `main`;
* its record page section names the next-step button (acknowledge → steps → response sent → close with an outcome) and the change-handler rule;
* `PF-21s.md` rev 16.75 made those actions part 4 (DW3, DW4).

So part 4 is a build PR straight from that concept. If the builder finds a gap in the concept, they ask on the PR.

## What `main` has (15c75cd52)
* **Every route part 4 calls exists:** `api/src/platform/complaints/routes.ts`:
  * `POST :id/acknowledge`, `:id/steps`, `:id/response-sent`, `:id/close` (`@AnyStaff(HANDLES)`);
  * `POST :id/handler` (record + read keys);
  * `GET handlers`.
* **Part 3 (#1998):** the list, the drawer and a **read-only** `record-page.tsx` in `web/src/modules/platform/complaints/`.
* **In flight:** PF-21i (#2012, `Idempotency-Key` on record). Part 4 does not record complaints, so it does not depend on it. J-109 does, because J-109 W1 records one: **J-109 starts after #2012 is on `main`.**

## PF-21s part 4: the record page's actions (screens, Opus 5.5 medium, reviewer + breaker)
**What it does:**
* On the record page, the next step is the **one filled button**, following the complaint's state: Acknowledge → Add a step (a short text) → Response sent → Close with an outcome (`OUTCOMES`, "Sample").
* Each action:
  * posts once (no double submit; #1998's M1 pattern);
  * refreshes the timeline;
  * keeps a draft across an ended session (#1998's M3).
* A closed complaint shows no action buttons.
* **Change handler:** shown only to a person who holds **both** keys; the picker comes from `GET handlers`.
* A refused action (403/409) shows the server's words in the page, never a toast alone.

**Done when** (`PF-21s DW3`, `DW4` in `tests/check_pf21s_complaints_browser.ts`, a pass and a fail each, plus):
* **DW3** the button walks acknowledge → step → response sent → close. A second click while posting sends one request.
* **DW4** change handler is hidden for a Case Manager, and the server's 403 is shown if it is forced.
* **DW7** a closed complaint has no action buttons.
* **DW8** the handler of someone else's complaint sees "Not found", with the same words as part 3's DW5.
* Keyboard only, axe-core, and 375, 1024 and 1440 px. Part 3's tests pass unchanged.

**Touch list:**
* `web/src/modules/platform/complaints/record-page.tsx`, `contract.ts` and new action files in that folder;
* `tests/check_pf21s_complaints_browser.ts`;
* screenshots under `screens/pf-21-complaints/screenshots/`.

Nothing in `api/`. A needed API change → "Question for the tech lead" on the PR, to Lead B.

**Size (P-610):** about 400 to 500 lines.

## J-109: join and walk (after PF-21s part 4 and PF-21i #2012 are on `main`; Opus 5.5 medium, reviewer + breaker)
**Correction to `J-rows.md` §J-109, W2 (rev 16.28 applies):** W2 is **the acknowledge-by date, 2 business days (Sample), counting the firm's closed days on the fake clock**. There is **no 30-business-day due date**: the requirements name no complaint period. A response-by period becomes a row only once the College's by-laws are cited. *Unconfirmed: no counsel.*

**Swaps:**
* complaints' `jobs` become `PlatformJobs` (PF-23w is on `main`), and its clock becomes the system clock;
* each swap is shown real by a test that fails on the fake (`J-109 DW1..`);
* `mail` may stay `fakeMail`; say so in the PR.

**Walk** (`tests/journeys/j_109.ts`, visible browser and scripted, `J-109 W1..W5`):
* **W1** a Case Manager logs a complaint (with an `Idempotency-Key`, PF-21i);
* **W2** its acknowledge-by date shows;
* **W3** a Read-only person cannot see it;
* **W4** the Owner (or the handler) acknowledges it, then closes it with an outcome;
* **W5** it ends at the closed complaint in the list.

**Touch list:** the swap lines in `runtime-ports.ts` (or wherever complaints' ports are built; named in the PR) and `tests/journeys/j_109.ts`.

## Duplicate check (P-526; 18 Nov 19:xx IST)
* **Open PRs:** no open PR names PF-21s or J-109. #2012 (PF-21i) touches `complaints.ts` and the route, not the screens.
* **Branches:** no complaints branch.
* **`main`:** the routes above exist, and `record-page.tsx` has no action handlers.
* Each PR writes its own `Duplicate check:` line.

## Rules
The standard PF/FO rules at the end of `wave1-sales.md` apply: P-683, P-303, P-277, P-385, P-270, P-175, P-557, P-663 and a typed audit actor in tests (#2003).
