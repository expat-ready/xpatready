# PF-28 part 3a: independent review (PR #2909, head cc4cf4e8053e6b68f33081fc01fed6d171e850a4)

Reviewer: Opus 5.5, 22 Nov. Scope: `git diff origin/main...cc4cf4e8` only: `sales/routes.ts`, `prospects.ts` (`bad`), `source-filter.ts`, the allow-list, the sweep's ceilings, three suites and the walk. Part 3b's files (corporate/, prospect-edit, public, assignment, conflict, identity, people/edit, duplicates) are not asked for here. I changed no code. Live AI was off; cost US$0. This is an API change with no new screen, so D1–D20 and the BIC table are N/A. The screens that call these doors were walked; see `journey-test-reviewer-2026-11-22-part-3a.md`.

## Checks run (isolated copy `rev_pf28a` on :4489, runtime ports; never :4400)
- **Allow-list:** every `sales/routes.ts` entry is gone: 20 code lines and 30 probe lines. Each remaining "part 3" line belongs to a 3b file. Ceilings are 131/24.
- **Journey J-108** (`tests/journeys/j_108.ts rev_pf28a 4489`) gives **13/15**. "Setup … [422,201]" fails, and W2 fails after it (M1). My run overwrote J-108's screenshots, which I restored with `git checkout`.
- **Reviewer's walk by screens** (scratchpad, 400/1024/1440 px, axe): all pass. Convert (by keyboard), Undo convert, Mark lost, web-form sites save and on/off, Leads and Pipeline-list filters. No front-office call was refused.
- **Web callers checked against each schema:**
  - `add-lead-panel.tsx:75-77` sends requestId, the names, email, phone, source, note, `personId` or `confirmedNew: true`, and undefined values are left out. This fits ADD_LEAD.
  - `lead-owner.tsx:32` sends `{staffId, expectedOwnerStaffId}` (null when unowned). This fits ASSIGN.
  - `prospect-actions.tsx:55` sends `{stageId, cause, version}`. This fits MOVE.
  - `prospect-page.tsx:56-57`: Lost sends `{reasonId, note?, version}`, Convert sends `{version}`, Undo sends `{reason, version}`. These fit.
  - `web-form-settings-page.tsx:60,122` sends `{sites, version}` and `{enabled, version}`. These fit.
  - The leads query keys are view, source (repeated), owner, from and to (`leads-page.tsx:27-53`). The prospects query keys are type, stage, owner, from, to and source (`pipeline-page.tsx:28,131`). Every key these screens and the tests send is in the lists.
  - No screen sends calls or notes.
- **Service keys against the schemas:** every `b.*` that `leads.ts`, `prospects.ts`, `calls.ts` and `web-form-settings.ts` read is declared. The types are as wide as the services accept: `seconds` a number, `version` a number or digit text, `enabled` a boolean, `sites` a list. The bounds are outer bounds above each service's own 254/2000/5000.
- **idParam lower-casing:** an upper-case prospect uuid is found (409 STALE for an old version, then 200). Postgres compares uuids without case, and audit keys are now always lower-case.
- **Order:** body 422 now comes before the record's 404. The schema reads no data, so the 422 says nothing about whether a lead exists (`close {}` on a random uuid gives 422 `reasonId`). The services' own rules, words and order are unchanged after the parse: assign `staffId: null` still says "Choose an active person of your firm."; sites `{}` still says "Send the sites as a list."; enabled `{}` still says "Choose on or off."
- **Shared source filter (3b's board):** I accept it. `sourcesChecked` is the one rule for every list (QA-533). Leaving the board at 400 while the lists answer 422 would split one filter in two. The board's own query parse stays on the allow-list for 3b. `check_r130` DW2 was moved to 422. No web code branches on 400 for UNKNOWN_SOURCE (grep of `web/src/modules/front-office`). Live: `pipelines/INDIVIDUAL/board?source=FAX` gives 422 with `allowed` and `fields.source`.
- **No 500** on any changed route under the probes listed in the journey report.

## Findings
### Blocker
None.
### Major
- **M1. CONVERT now requires `version`, which the service treats as optional. Five checked-in callers that send `{}` now get 422.**
  - `routes.ts:85`: `CONVERT = strict({ version: version.unwrap().unwrap() })`. The service checks a version only "if given" (`prospects.ts:241-248`).
  - So `POST prospects/:id/convert` with `{}` or no body was 200 on main and is now 422 `version: Invalid input` (checked live). These callers break:
    - `tests/check_fo13s_identity_browser.ts:191` (expects 200, then waits for the client);
    - `tests/check_csk1s_clients_browser.ts:94` (its convert helper);
    - `tests/journeys/j_108.ts:65` (run here: 13/15);
    - `tests/journeys/j_110.ts:144`;
    - `tests/journeys/j_72.ts:214`.
  - The brief's done line, "the area's own suites and browser suites pass unchanged", is not met. None of these is in the PR's API suite list. walks.yml runs only when `tests/journeys/` changes, so the journeys would first fail on main.
  - Fix, either of:
    - (a) keep it required, which fo-2p3's break report asked for ("or the API should require it"). Update the five callers to send the version they read: a `GET prospects/:id` first, or the version from the engage answer. Say in the PR body that this narrows the contract, and run the two browser suites and the three journeys.
    - (b) make `version` optional and put `POST …/convert missing` back on the allow-list.
  - (a) is better.
### Minor (Should)
- **m1. A missing or wrong-typed `version` says "Invalid input".**
  - This happens on convert, move, lost and undo-convert (convert `{}` or `{"version":true}` → `fields.version: "Invalid input"`).
  - Cause: a zod union's issue is `invalid_union`, which `words()` in `input.ts` passes through as the raw message. Every other field says "This is required." or "This must be …" (EXPERIENCE: plain words).
  - Fix, locally in `routes.ts:74`: `z.union([...], { error: "Send the prospect's version as read." })`.
- **m2. The old 400 is still written down for the source filter.**
  - `source-filter.ts:4` says "one unknown → 400 UNKNOWN_SOURCE".
  - `api/src/front-office/MODULE.rows/R1-30.md:1` says "unknown → 400 UNKNOWN_SOURCE".
  - Change both to 422. The BACKLOG FO-4sf row is history; leave it.
  - The brief's touch list also asks for each area's `MODULE.md` invariant line. `front-office/MODULE.md` has no PF-28 line, and neither has platform's from parts 2a–2c. Add one line here, or carry it to 3b.
- **n1 (nit).** `LEADS_QUERY` and `PROSPECTS_QUERY` repeat `z.string().max(500).optional()` per key instead of using `query(...)`, which they cannot fully use because of the `source` list. They behave the same, so this is not a defect.

## What held
- Every changed route keeps its `@PermissionKeys`/`@OwnOrAll` decorators, so the guard still runs before any parse (read, not run separately).
- `__proto__` is refused 422.
- Each fail line in the three moved suites still names its code (UNKNOWN_SOURCE, UNKNOWN_OWNER) and `allowed`, not only the status.
- Would removing the fix be caught? Yes. The 30 probe lines that left the list would come back as unlisted failures in the sweep's DW (b) line, and the 20 code lines would fail the unparsed ceiling of 24.

## Not checked
- I did not re-run the sweep, the API suites or the builder's `part-3a-walk/walk.cjs`. The builder reports 41/41, the 17 suites and exit 0.
- I did not run the browser suites `check_fo13s_identity_browser` and `check_csk1s_clients_browser`, or journeys j_110 and j_72. M1 rests on reading their lines and on the live 422; J-108 shows the same failure in a run.
- I did not run `graph.mjs`, because it rewrites a tracked file.
- No real screen reader, and no intended user's walk.

## Journey score (reviewer, the one score for this check)
**9.5/10, pass.** Speed is ½: no step was timed. Details are in `journey-test-reviewer-2026-11-22-part-3a.md`.

Verdict: Block (Changes requested) for cc4cf4e8053e6b68f33081fc01fed6d171e850a4. To fix: M1, either by updating the five `{}` convert callers to send the version (preferred) or by making `version` optional and listing `convert missing`, then running the two browser suites and three journeys. m1 and m2 should be fixed in this PR if cheap.
