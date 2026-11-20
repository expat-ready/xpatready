# Brief: CS-K1s, the staff Clients list and client page with "Open a case?" (R1.72, QA-593; cloud builder lane; row owner Build Lead C)

Written by Build Lead C (4) at 15:3x IST on 20 Nov, at Lead 2 (series 3)'s ask (P-745 Wave 1). **Item:** R1.72 ("Case with applicants, representative, pinned release"). qa 13 has it at Partial on 20 Nov (#2467, `qa/reports/2026-11-20-capability-r174-r172.md`), with this reason: **QA-593 (Gap · Major).** A won prospect's "Open a case?" offer has no screen, so staff can open the case only through the API. P-560 says "the case opens on a person's click". This row closes QA-593. **This page is the screen's concept, approved by the row owner (P-223 (4), no board).** The founder may review it afterwards; any change becomes a follow-up row.

**PR title:** `screens: CS-K1s — Clients list and client page with "Open a case?" (QA-593); J-72 walks it on screen`
**Model:** Opus 5.5, effort high. **Reviewer:** a fresh Opus screen-reviewer at high effort, with journey-test. **Breaker:** yes (it opens cases: double clicks, another firm, a withdrawn offer).

**Ready when:** now. #2406 (CS-K1 part 2) and FO-8 (#2255) are on `main`. Checked on `main` 20 Nov:
* `GET /api/runtime/clients` (list, 50 a page, by name or CL code) and `GET /api/runtime/clients/:id` are at `api/src/features/clients.ts:14-21` and `clients.ts:93,116`.
* `POST /api/runtime/clients/:id/open-case` is at `runtime.ts:1100`, with the handler at `case-clients/prospect-won.ts:185` and the body `OpenCaseFromOffer` at `contracts/runtime.ts:86`.
* No web file calls `/runtime/clients`.

**Job:** a staff member with `agent/case:show` finds a client, sees whether a won prospect's case is waiting to be opened, checks the pre-filled details, and opens it with one click (`agent/case:create`).

**Build:**
1. **One read for the offer:** `GET /api/runtime/clients/:id/offer` (key `agent/case:show`, firm-scoped). It answers one of:
   * `{ offer: { combination: { id, label }, principalName, representative: { staffId, name } | null, wonVia, prospectNumber } }`;
   * `{ offer: null, reason: "NO_OFFER" | "USED" | "WITHDRAWN" }`.

   It reuses `offerOf` (prospect-won.ts:143) and adds no second rule. Its zod schema goes in `contracts/runtime.ts`, add-only (the Lead reads it, P-423). It returns ids and names only, no prospect answers.
2. **Clients list:** `/clients` in the runtime frame, with a "Clients" menu entry beside "Cases", hidden without `agent/case:show`.
   * Search by name or CL code, matching the API's `q`.
   * Columns: CL code, name, Person or Company, number of cases.
   * "Show more" for the next page, with no page numbers.
   * States: loading; empty ("No clients yet. A client appears when a prospect is won."); no results for a search (it names the search); error.
   * Today `/cases/clients` redirects to `/cases` (`cases.tsx:66`). Leave that line and the simulated client's page (`cases.tsx:67`, `ClientCasesPage`) unchanged: the J-77 and C-pack tests use them.
3. **Client page:** `/clients/:id`.
   * **Header:** name, CL code, kind, file owner.
   * **"Open a case?" card,** shown when the offer read returns one: the program (combination label), the principal applicant and the representative of record, each read-only, with one button, **"Open the case"**.
   * **On click:** `POST …/open-case` with `{}`, so the server pre-fills. The button is disabled while the request runs, and a second click sends nothing. Success goes to `/cases/<new id>`.
   * **409s** keep the existing texts (`prospect-won.ts:163-168`) in a `role="alert"` beside the button: `OFFER_USED`, `OFFER_WITHDRAWN`, `OFFER_CHANGED` and `NO_CASE_USER`. `OFFER_CHANGED` re-reads the offer.
   * **Without `agent/case:create`:** the card shows, and in place of the button it says "Ask someone who can open cases."
   * **Cases list:** the client's cases, each a link to the case.
   * **No offer:** when there is no offer and no case, the page says so in one sentence.
4. Brand, layout and components as the existing case list and case page. Keyboard only, axe-core clean, 1024 and 1440 px, no sideways scroll.

**Done when:**
* `tests/check_csk1s_clients_browser.ts` (Playwright on an isolated copy) passes these cases, each with a pass and a fail:
  * **DW1:** without the key, no menu entry, and the address shows the no-access page, never a blank one.
  * **DW2:** the list searches by name and by CL code, and "Show more" shows each client once.
  * **DW3:** a won client with no case shows the card with the offer's three values; one click opens exactly one case and lands on it. **Fail:** a double click makes no second case.
  * **DW4:** a used, withdrawn or changed offer shows its words, and no case is made.
  * **DW5:** firm B's staff get 404 on firm A's client, both through the page and through `GET …/offer`.
  * **DW6:** without `agent/case:create`, the card shows with no button.
  * **DW7:** the offer read returns no prospect answers (e-mail, phone).
* **J-72** (`tests/journeys/j_72.ts`): W3 and W7 become **screen steps**, clicking "Open the case" on the client page and replacing the API calls. The "API step" labels go. The walk exits 0 twice on fresh copies.
* These pass unchanged: `check_fo8_prospect_won.ts`, `check_csk1_client.ts`, the J-77 walk and the case-list suites.
* Full `ci` green.
* PR body: "Fixes: QA-593", "Item: R1.72". After it merges, qa re-scores R1.72.

**Touch list:**
* `api/src/case-clients/prospect-won.ts`: export the offer read only
* `api/src/features/clients.ts`: one GET
* `contracts/runtime.ts`: add-only
* new `web/src/runtime/clients.tsx`
* `web/src/runtime/` route and menu files: two route lines and one menu entry
* new `tests/check_csk1s_clients_browser.ts`
* `tests/journeys/j_72.ts`
* screenshots under `screens/CS-K1s/`
* the card fragment through the card tool

No schema, no migration.

**Size:** about 500–700 lines with tests. Over 800 → ask first.

**Parallel safety:** it runs beside CS-DL3 part 1 (no shared files). **CS-DL3 part 2 waits for this PR,** because both touch the case page's route files. No open PR touches `web/src/runtime/` or `api/src/case-clients/` (checked 15:2x IST on 20 Nov, 8 case-side PRs).

**Duplicate check:** at 15:2x IST on 20 Nov, `git grep -n "/runtime/clients" origin/main -- prototype/studio/web` returned 0 lines. No open PR names CS-K1s or QA-593.

**Follow-up (not this row):** a "Client CL-… · Open a case?" link from the won prospect's page (front office, Lead B).

**Standard rules (P-644):**
* Branch from `origin/main`. One part, one PR.
* P-683: get "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft. The Lead labels after the P-423 read of `contracts/runtime.ts`.
* Run suites only on an isolated copy. Push after every step (P-557).
* Live AI off, US$0, never a priced button (P-175).
* Questions go on the PR as "Question for the tech lead: …"; Build Lead C answers within 30 minutes.
* Report to the current Lead (`tools/current-lead.sh`) and to Build Lead C (`claude/build-lead-c-647b40`).
