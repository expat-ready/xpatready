# Brief: CS-V1, check every input on the case-side routes (map row 10; case side, API only; cloud builder lane; row owner the release Lead)

Drafted 16 Nov 02:1x IST by the case-side shaping lane from BACKLOG row CS-V1 (line 828), checked against `main` 81505985f. **Draft until the release Lead approves it.** Model: Opus 5.5, effort: medium (input checks on existing routes; no schema, money or new screen; P-608). **Ready when:** PR 1 now. PR 2 after PR 1. PR 3a after PR 1, the Bake's tag (P-499) and CS-D1b (`sign-steps.ts`). PR 3b (`runtime.ts`) after the Bake's tag (P-499) and after CS-K1, CS-NT1 part 1 and CS-W1 have merged. **Four PRs** (the row's three, with PR 3 split in two for `runtime.ts`), each under 400 lines.

**Points the release Lead confirms in the approval (the code on `main` differs from the row's text):**
* **No finder for write routes exists.** `tests/check_forms_qa53.ts:24-42` has `routes()`, but it finds **`@Get` routes only** (its pattern is `@Get\("…"\)`), because QA-53 guards reads. Bodies come with `@Post`, `@Put` and `@Patch`, so PR 1 writes its own finder in a new `tests/lib/routes.ts`. It covers every verb (`@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`), the controller prefix, `@Body`/`@Query`/`@Param`, and the handler's service method, using `tests/lib/ts-files.ts`. `check_forms_qa53.ts` is not touched; FO-2's owed qa53 scan row may later move onto the new finder (tell that row's builder).
* **PR 3's wait on the Bake's tag is kept for both halves.** The row puts PR 3 after the Bake's tag (P-499). This brief's split keeps that wait on PR 3a and on PR 3b, and adds CS-K1, CS-NT1 part 1 and CS-W1 for PR 3b. An earlier draft had dropped the tag from 3b.
* **The count** matches the row's within the controllers' own decorators: on `main`, 126 routes under `@Controller("api/runtime")` and `@Controller("api/link")` in 24 files, 82 of them taking `@Body()` or `@Query()` (`person-link.ts`'s count includes its `api/demo` controller). A handler passes the body to a service method, which parses it with `parse(Schema, body)` (`api/src/programs.ts:40`), so the check follows each handler into its service method. That is how the row measured 20 unparsed methods. The 20 are taken as the starting allow-list only after PR 1's check confirms each one; the row's per-file split is the expected result.
* **"An unknown field answers 400" applies to the new schemas only.** On `main`, 56 schemas are strict (`strictObject` / `.strict()`) against 192 plain `z.object(` ones. Making the 47 existing parsed methods strict could refuse fields today's screens send. That would be a behaviour change outside this row: name it as a follow-up, and do not do it here.
* **A non-UUID id already answers 404 in most places.** `ProblemErrors` in `main.ts` maps a malformed id to "not found", and `case-changes.ts:34` checks the pattern. PR 1's check **asks every route with a `:id`-style parameter with a non-UUID and expects 404**, listing the routes that answer 500 (into the allow-list, fixed in PR 2-3b). It does not add a second mapping.
* **The rows that add routes** (CS-K1 clients, CS-NT1 notes, CS-T1 queue and Take it; CS-C1a's close routes in `features/case-close.ts`; CS-C1b adds none) are **not on the allow-list**. Once PR 1 is merged, a new route with an unparsed body fails it, which is the point. Their briefs already parse with zod. Tell them in STATE when PR 1 merges.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime CS-V1 <PR>` (PRs: `1-check`, `2-review-readiness-additions`, `3a-link-prepare-sign`, `3b-runtime`) and take **one PR of row CS-V1**, end to end on a fresh branch from `origin/main`.

**The row:** `product/BACKLOG.md` row **CS-V1**, read with the points above. Sources (cite these; the row has no team id of its own): `product/STANDARDS.md` **§6** (contract first: zod schemas shared by the API and the web app; errors as RFC 9457 Problem Details with field-level messages), map row 10 ("gap"); **AG-1-45@a4057ff0** (every list or read is paginated and scoped to the firm; no endpoint returns an unbounded set or another firm's data). The 404 for a malformed id is the app's own rule, in `main.ts`'s `ProblemErrors` (`:211`, "A malformed id (not a UUID, or with a NUL byte) is simply not found (review #4, break m5)"), not AG-1-45's.

**Read only these:** `tests/check_forms_qa53.ts:24-42` (`routes()`, as a model only: it finds GETs) and `tests/lib/ts-files.ts`; `api/src/programs.ts:40` (`parse`); `api/src/main.ts`'s `ProblemErrors`; for your PR, the files it names and their schemas in `contracts/` (`contracts/runtime.ts`, `contracts/person-link.ts`, and the file each other one already imports from).

**What to build:**
* **PR 1, the check** (~350 lines):
  * new `tests/lib/routes.ts`, the finder for every verb (point above);
  * new `tests/check_csv1_inputs.ts`, which:
    1. lists every route under `api/runtime` and `api/link`, in any file or folder, `features/` included;
    2. follows each handler that takes a body or query into its service method;
    3. fails on any method that does not `parse` it with a zod schema and is not on the allow-list;
    4. fails on a route that answers 500 to a non-UUID id and is not on the allow-list;
    5. fails when an allow-listed method has been fixed but is still on the list (the list only shrinks).
  * The allow-list starts as today's measured gaps, each confirmed or struck in the PR body.
* **PR 2:** schemas for `review-rounds.ts` (5), `readiness.ts` (3) and `form-additions.ts` (2), beside their existing ones in `contracts/`.
* **PR 3a:** `person-link.ts` (5), `case-prepare.ts` (1, the P-438b baton file: take it from the holder named in STATE) and `sign-steps.ts` (1).
* **PR 3b:** `runtime.ts` (3; expected `list`'s query and `putAnswer`'s body among them, confirmed by PR 1).
* **Every new schema** is strict, gives field-level messages in plain words, has a length limit on every string (the database's or `contracts/`'s limit where one exists; otherwise the PR names one), and is refused through the standard problem answer: 400, the field named, and "Nothing was stored." where a write is refused.
* **Named test cases** (P-606), file `tests/check_csv1_inputs.ts` (each PR adds its own), a pass and a fail each:
  * **CS-V1 DW1** (PR 1): the check fails on a throwaway route with an unparsed body (planted with `planted()` from `ts-files.ts`) and passes when that route gets a schema.
  * **CS-V1 DW2** (PR 1): a method removed from the allow-list without a fix fails; one fixed but still listed fails.
  * **CS-V1 DW3** (PR 1): every route with an id parameter answers 404 to `not-a-uuid`, and the 500s are listed.
  * **CS-V1 DW4** (each of PR 2, 3a, 3b): for each fixed method, an oversized string, a wrong type and an unknown field each answer 400 with the field named, and **store nothing** (row counts read before and after). A correct body still answers as before.
  * **CS-V1 DW5** (PR 3b): the allow-list is empty and the check passes.
* **Touch (nothing else):**
  * PR 1: new `tests/lib/routes.ts`, new `tests/check_csv1_inputs.ts`;
  * PR 2, 3a, 3b: the named files (their service methods' first lines only) and their `contracts/` schema files, plus the test's allow-list.
  * No engine, schema or screen change. A web screen that sent an extra field to a now-strict route is a stop-and-ask.

**Done when:** `tsx studio/tests/check_csv1_inputs.ts` exits 0 with the PR's DW cases each passing and failing as named, and after PR 3b the allow-list is empty (DW5). `check_forms_qa53.ts`, the case suites of the touched files (found with `tools/check-select-suites.sh`) and the web screens' browser suites for those routes (named in the PR) pass unchanged. Full `ci` is green on the head.

**Duplicate check:** searched BACKLOG (no row covers input checks on the case side; map row 10 "gap"; FO-2's qa53 scan row is the route finder's other user), open PRs (`check_csv1`, `tests/lib/routes.ts`), `git grep -n "routes()" tests` on `main` (only `check_forms_qa53.ts`, GETs only) and BUGS. zod 4.4.3 is in `package.json`; no list or check says which routes parse.

**Parallel safety (against the rows that add or change routes):**
* **CS-C1b** (`runtime.ts` `createCase`, no route): no overlap with PR 3b's methods; PR 3b waits for it anyway (below).
* **CS-K1** (`NewCase`, `createCase`, the case read in `runtime.ts`; new `clients.ts`, `features/clients.ts`), **CS-NT1** (the client read in `runtime.ts`; new `case-notes/*`) and **CS-W1** (`reach`, `list`, `nextCaseNumber` in `runtime.ts`): **PR 3b starts after all three merge**, because `list` is in CS-W1's touch list too.
* **CS-T1** (new `case-queue.ts`, `features/case-tasks.ts`, `team.ts`): no file in common. Its new routes must parse once PR 1 is merged.
* **CS-W3's** `2-review` and `2-evidence-links` parts touch PR 2's and PR 3a's files: CS-V1's PRs go first (smaller), or CS-W3 waits.
* **AUD-1m** touches `review-rounds.ts`, `readiness.ts`, `person-link.ts` and `case-prepare.ts` (audit lines): different lines; never both open on one file at once.
* **CS-D1b** holds `sign-steps.ts`: PR 3a after it.
* No `core.ts`, `ports/`, `events.ts` or module-card change.

**Contract gap (for the PR body):** none in `ports/`. STANDARDS §6's "zod schemas in the shared package used by API and web" is met only where a screen imports the `contracts/` schema; whether screens adopt the new ones is not this row's.

**Reviewer** only (input checks; no money, schema, permissions or new screen: breaker no, as the row says). The reviewer tries a planted unparsed route, an id with a NUL byte, and a 5 MB string.

**Rules (standard):** Opus 5.5, no model switch mid-session (P-605). Finish whole: if an item needs more than its touch list, stop and ask in a PR comment headed "Question for the tech lead"; never widen the row silently. One PR at a time, each under 800 changed lines tests included (P-610); Opus reviewer (P-303); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270). Never push to a PR that carries the `queued` label. Before asking for the label, run on `main` merged into your branch the suites of every CI part that was red on any earlier head plus every suite in your shard's demo database, and paste the result lines. Live AI off, US$0 (P-175). Push after every step (P-557). Report to the current Lead (`tools/current-lead.sh`). Read only the files named here and the code you change (P-556).
---
