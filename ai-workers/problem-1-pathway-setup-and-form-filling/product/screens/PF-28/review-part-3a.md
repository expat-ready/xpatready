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

## Round 2 (head cda522f1f34a80f2bba0767e7a8f5eddc10b37ec, diff `cc4cf4e8..cda522f1` only)
Scope: `sales/routes.ts` (2 lines), `source-filter.ts:4`, `MODULE.rows/R1-30.md`, `front-office/MODULE.md` (1 bullet), `check_pf28_inputs.ts` (EXCEPTIONS_CEILING), and the allow-list (1 exception). The commit also carries my round-1 reports unchanged. I ran it on a fresh copy, `rev_pf28a2` on :4489. Live AI was off; cost US$0.

**Checks**
- **J-108** (`tests/journeys/j_108.ts`) gives **15/15**; it was 13/15 in round 1. It overwrote J-108's screenshots, which I restored with `git checkout`.
- **Live probes**
  - Convert:
    - `{}` on a random id gives 404, which is what the new exception says.
    - `{}` on a real, cleared prospect gives 200, the same as main.
    - A second no-body call gives ALREADY_WON.
    - `{"version":"0"}` gives 409 STALE.
    - `{"x":1}` gives 422 naming `x`.
  - Version words: Convert `{"version":true}` and move `{"version":[1]}` both give 422 `fields.version: "Send the prospect's version as read."`.
- **Builder's results (not re-run here):** sweep 41/41; csk1s 33/33, fo13s 36/36 and fo4as 27/27 after the fix; fo4_sales, fo4al, fo4w, fo9s, fo13s_conflict, fo3st1 and pf6a green from the earlier run.
- **check_pf4_identity:** it fails while setting up its own database (`xr_studio_pf4` does not exist). It touches no sales code, so I do not count it against this PR.

**Fixes**
- **M1 closed.**
  - `CONVERT = strict({ version })` again takes the version as optional, as main does. j_108, j_110, j_72, csk1s and fo13s send `{}` and are served as on main.
  - **I accept the exception and EXCEPTIONS_CEILING 9 → 10.** It is the same case as the accepted `resend missing` line. `{}` is a valid body, so the sweep's "missing" probe can only get the random id's 404. Not listing it would mean changing a contract that five callers rely on.
  - The exception is still pinned. An unknown field or a wrong type on Convert is still checked by the sweep (both are 422).
  - Whether Convert should require the version (fo-2p3's break-report Minor) stays a product question, recorded in the line's "awaiting the tech lead".
- **m1 closed.** The version union carries "Send the prospect's version as read." (probes above). A missing version on move still gives the service's own "version: the prospect's version as read." That is unchanged from main and close enough.
- **m2 closed.**
  - `source-filter.ts:4` and `R1-30.md:1` now say 422.
  - `front-office/MODULE.md` has the PF-28 invariant bullet. It states the rule, names the sweep and the allow-list as what holds it, and names part 3a's file.
- **n1** is left as it is, which I accept.

**One nit, not blocking.** The exception names only csk1s and fo13s as `{}` callers. j_108, j_110 and j_72 send `{}` too, so they could be named on the next touch.

**Round-2 findings:** no Blocker, no Major, and no new Minor.

**Journey score:** 9.5/10 stands. This round changes no screen, and the screens walked in round 1 send `{version}`, which is unaffected.

**Verdict: Approve** for cda522f1f34a80f2bba0767e7a8f5eddc10b37ec (no open Blocker or Major).

Reviewer: Approve cda522f1f34a80f2bba0767e7a8f5eddc10b37ec

## Round 3 (head a9fc53bfa291b9aef258d8bbb051401db7bb780c, diff `cda522f1f..a9fc53bfa` only; Lead's standing permission A277)
Two commits since the Approve: b9ba036f5 adds my round-2 notes, and a9fc53bfa merges origin/main (part 6, #2883, money). I ran nothing new beyond counting the allow-list.

- **The ceilings line (the one conflict) is resolved correctly.**
  - `git show a9fc53bfa --cc` takes main's comment history and part 3a's reductions: `PROBES_CEILING = 124, UNPARSED_CEILING = 24, EXCEPTIONS_CEILING = 10`.
  - The merged `pf28-allow-list.json` holds exactly **24 code, 124 probe and 10 exception** lines, so each ceiling is met with no slack. Main holds 44/154; this PR's 20 code lines and 30 probes leave on top of part 6's 7.
  - No `sales/routes.ts` line and no money line is left. What remains is part 4 (70), part 3 for 3b's files (46), part 5 (31) and part 2 (1).
- **The rest of the merge is main's.**
  - Against main (5d866c746), the branch differs only in part 3a's reviewed files: routes, prospects, source-filter, the MODULE lines, the three suites, the ceilings line and the allow-list.
  - Part 6's money files (`drafts.ts`, `tax-round.ts`, `ports/client-money.ts`, fo7b, j_59) touch no sales route.
- **Sweep:** the builder reports 43/43 on a fresh copy of a9fc53bf; I did not re-run it.

**Round-3 findings:** none.

**Verdict: Approve** for a9fc53bfa291b9aef258d8bbb051401db7bb780c.

Reviewer: Approve a9fc53bfa291b9aef258d8bbb051401db7bb780c
