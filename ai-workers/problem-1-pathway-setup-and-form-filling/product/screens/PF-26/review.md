# PF-26 part 1 review: the person export port (R1.34)

PR #3637, head daa8f8c76d80306230875c7e74ab226e7b7aec6f, `git diff origin/main...daa8f8c76` (8 files, +426). Independent reviewer, fresh
context, 25 Nov IST. Judged against AG-2-93 (AG-02 L4364), SA-11-36, SA-11-40 (SA-11 L508-512), BACKLOG PF-26 (L303), PF-26s (L997),
CS-X1 (L1124); pattern `ports/erasure.ts` and its contract. Paths: `prototype/studio/` unless named.
Nothing visible ships here: no route, no schema, no screen. So the running app, 1024 px, 200 % zoom, keyboard use, the BIC scorecard and
the graph do not apply. No app copy was started, so no port was used (never :4400).

## Verdict: Ship after fixes (one Major: a contract hole, not the code path), so Reviewer: Changes

## What I ran
* `tests/check_pf26_person_export_port.ts`: 20 passed, 0 failed. `tools/check-port-contracts.mjs`: 34 ports, PersonExportPort ×2, 0 problems.
* Two throwaway break scripts (under `tests/`, run with tsx, deleted; tree clean); results below. Not run: `tsc -p api/tsconfig.json` (killed for lack of memory in this sandbox). CI's `types` job was skipped at this head (draft PR).

## What held (tried and failed to break)
* Registration is fixed: a flipping `declares` getter is read once; renaming, re-declaring or swapping `sections` after `register` has
  no effect. Exporters get their own subject copy (person-export.ts:136): pushing onto `records` or rewriting `firmId` changes nothing.
* Answers are copied by zod (late mutation ignored; getters read once). NaN, undefined, functions, Date, Map and `deleted: false` are
  refused. No prototype pollution from `__proto__` (but see m2). A throwing exporter fails the whole build, named, cause kept out.
* One registry per process (one provider in the one app module, `features.ts`). exporterCases catch an exporter that ignores the firm,
  one that reads only `personId` (merged records skipped) and one that masks values.

## Issues
**Blocker:** none. **M1 (Major, Must): exporterCases pass an exporter that marks live items deleted** (contracts/person-export-port.contract.ts:103-106).
* The deleted check finds the deleted marker's item and checks that it carries `deleted: true`. Nothing checks that the person's live
  item (the `marker` row) is not marked.
* Failing case (run): an exporter whose items all carry `deleted: true` passes both cases. The realistic bug is
  `...(row.deletedAt !== undefined ? { deleted: true } : {})` on a Prisma row, where `deletedAt` is `null`. Every live note then ships
  in the person's package marked "deleted", which breaks AG-2-93 rule 11 and its test "the package holds it, marked deleted".
* Also passing: the deleted item answered twice, marked then unmarked (`find` stops at the first). Parts 3a, 3b, 4 rely on this proof.
* Fix: assert the `marker` item has no `deleted` and every item holding `deletedMarker` is marked; add an "all-deleted" broken
  exporter to the self-test (tests/check_pf26_person_export_port.ts:182-184).

**Minor (Should):**
* **m1: the firm and merge checks are unproven** (tests/check_pf26_person_export_port.ts:150-184). Only three broken exporters are fed
  (family, drops-deleted, omits-empty); deleting the contract's `otherFirmMarker` or `mergedMarker` check leaves the suite 20/0 (by reading: the remaining broken exporters fail on other checks). Fix:
  add "any-firm" and "own-only" exporters.
* **m2: a `__proto__` key is dropped without a word** (person-export.ts:39-43).
  * Run: the item `JSON.parse('{"text":"x","__proto__":{"answer":"…"}}')` comes out as `{"text":"x"}`, with no error. A json column
    holding that key would lose data from a "complete" package (AG-2-93 rule 5).
  * Fix: refuse such keys, so the exporter fails by name.
* **m3: a module's failure message can carry personal data** (person-export.ts:115).
  * The message includes the zod path, and item keys come from the data.
  * Run: `{ "client.b@example.com": NaN }` gives "exporter m failed: … (items.0.client.b@example.com: Invalid input)". That breaks the
    file's own promise at :71-72 ("Named by module only"), and part 2 will store or log that message.
  * Fix: report the section name, the item index and the issue code, never record keys.
* **m4: deep or huge answers escape as an unnamed error** (person-export.ts:137, :146).
  * An item nested 20,000 levels deep throws `RangeError: Maximum call stack size exceeded` from `checkAnswer`, which sits outside the
    try. Three strings of 200 MB each throw `RangeError: Invalid string length` in `packageBytes`. The build still fails as a whole,
    but the module is not named.
  * Fix: wrap `checkAnswer` in the try (as ExporterFailed), and give part 2 a stated package size limit.
* **m5: ids in mixed case come out inconsistent** (person-export.ts:29-34).
  * `{ personId: "ABCDEFAB-…", records: ["abcdefab-…"] }` passes. The package then carries an upper-case `personId` and lower-case
    `records`, and an exporter filtering in JS by `s.personId` misses rows.
  * Fix: lower-case the ids in the schema.
* **m6: the PDF part is numbered differently.** person-export.ts:1-3 says "the PDF is part 3"; the shape (shape.md:24) puts it in part 5.
* **m7: no switch on the API** (shape.md:20, :27). Part 2's route is live on merge; only the screen is off. Between parts 3a and 4 a key
  holder gets a package without case-side or money sections, offered as complete (AG-2-93 rule 4, SA-11-36). Fix: keep the request
  behind a switch until part 4, or say how a partial package is refused.
* **m8: a required "why" is invented scope, built by default** (shape.md:31-35, :41-45). AG-2-93 rule 7 audits request, requester,
  person and time; "why" comes only from qa/CAPABILITIES.md. "Part 2 builds this unless the tech lead says otherwise" and j_34's error
  text decide it before the answer, and free text in the audit line can hold personal data (PF-26: "never the content"). Fix: build no
  reason until the tech lead or the founder records a decision.
* **m9: requirement points with no part.** AG-2-93 rule 6 (the person's language) is in no part and not listed as not built. Rule 4's
  "family links" and front-office "tasks" are missing from 3a/3b. AG16-60 "Duplicate beats a miss" (PF-26: "duplicate names show both
  records") is not in part 6 or j_34. j_34 has no failure step ("Export failed", "Try again", PF-26s (4)). Part 2 does not prove the
  job's transaction refuses a write (port rule 3, "read-only").

## Shape (parts, touch lists, j_34)
* The split is sound: six PRs, each under 800 lines, and part 1 depends on no unmerged PR (#3411 rightly not a dependency).
* Each touch list matches its backlog row. Client money moves from PF-26's list to part 4 beside CS-X1, and is still covered.
* j_34 covers the main path and every PF-26s refusal (403, 404, 404, expired), at 375/1024/1440.
* Gaps are m7 to m9. Nothing else is invented beyond the requirement: the 7-day expiry comes from the PF-26 row, and the limits
  (200 records, 100,000 items, 60 sections) are internal.

## D1-D20 (a seam; most dimensions are not applicable)
| D | Score | Evidence |
|---|---|---|
| D1 Requirement fit | 4 | rules 3, 4, 5, 10 (JSON), 11 and SA-11-40 are coded; rules 6 and 7, AG16-60 unplaced (m9) |
| D2 Data integrity | 3 | duplicate module and section refused; over-marking passes (M1); `__proto__` dropped (m2); id case (m5) |
| D3 Reuse | 5 | copies the erasure port's registerInto and fake pattern; one registry |
| D5 Stability and recovery | 4 | all-or-nothing build; unnamed RangeError (m4) |
| D16 Testability | 3 | every case is pass and fail, but two contract checks can be removed with the suite still green (m1), and M1 |
| D18 Provenance | 4 | cites AG-2-93 rules on each rule; "Unconfirmed: no counsel" present |
| D4, D6-D15, D19 | N/A | no screen, no content, no route in this part |
| D17, D20 | not done | simulated only; no screen to walk |

## Journey test (reviewer, the one score for this check)
* **Persona:** a module builder (part 3a or 4) who registers an exporter, proves it with exporterCases, and builds a package. There is
  no user journey yet.
* **Journeys, scripted:** register and build (held); double registration and bad declaration (refused); a throwing module (build
  fails, module named); a broken module, family/firm/merge/mask (caught); over-marking (**not caught, M1**); hostile items (m2 to m4).
* **Score:** task completed 1 · next step obvious ½ (m6) · plain words 1 · feedback and state ½ (m3, m4) · correct data ½ (M1, m2,
  m5) · error recovery ½ (m4) · accessibility and screen sizes N/A · speed 1 (898 ms) · visual quality N/A · trust and sources 1.
  6 of 8 applicable, so **7.5/10: below pass**. Raise "correct data" with M1, m1, m2; "feedback" and "recovery" with m3, m4.
* **Not tested:** a real screen reader, an intended user's walk, a database, and a typecheck (memory).

Verdict: Changes daa8f8c76d80306230875c7e74ab226e7b7aec6f
