# PF-28 part A5 (R1.10, j_10 W5, the case side): independent review (PR #3656, round 1)

Reviewer: Opus 5.5, 25 Nov. Heads reviewed: a638bdaa477b9d89a54e5ffec32056e452874191, then **4fe9a745fe4d22e608ec49d00c91a91e620f8985**. The second head was pushed during the review; its only change is `features/case-keep-period.ts`, where the whole query now goes through one strict schema. The verdict is on 4fe9a745f.

Scope: `git diff origin/main...4fe9a745f`, 11 files, +103/−10. I changed no code. Cost US$0, no model call.

This is an API-only change with no screen, so D1–D20 and BIC-01–BIC-20 are N/A, as in parts 2a–5. The journey score is in `journey-test-reviewer-2026-11-25-part-a5.md`.

## Checks run
Ports used: :4436–:4439 only, never :4400. Every copy was stopped afterwards. Main and the head each ran in their own `git worktree` under the session scratchpad, removed afterwards.

| Check | Result |
|---|---|
| j_10 on a fresh copy of a638bdaa4 (`rva5`, :4436) | **W5 PASS** (104 routes, 103 probes, `[]`); 15/19 overall |
| j_10 on a fresh copy of 4fe9a745f (`rva5`, :4436) | **W5 PASS** (104 routes, 103 probes, `[]`); 15/19 overall |
| The 4 red lines in both j_10 runs | All expected: W2 platform (access-report 422, sign/switch doors), W2 booking, W3, W3 schema. These belong to A2 (#3544) or are doors other lanes merged. |
| `check_pf28_a5_case_ids.ts` on the head (:4437; a clean worktree of each head on :4439/:4437) | 9/9, exit 0 |
| The same test against origin/main a2cce14e2 (worktree, :4438) | **4/9, exit 1**. All five "fail" lines go red on main: 12 doors answer 400; HEAD answers 405/405; clients 200; keep list 200; flags 400 (not 403). The test bites. |
| Touched suites on the head | `check_csnt1_notes` 56/56 (it includes upper-case note keys at `:297`) · `check_csdl3_milestones` 43/43 · `check_c614_providers` 27/27 · `check_csk1s_clients_browser` 33/33 (the web clients page) · `check_csd6_reads_keep` 49/49 (both heads) · `check_csv1_inputs` 100/100 (4fe9a745f) |
| typecheck.mjs | 0 new (15 known), on both heads |
| module-cards `pr` with the PR body | PASS ("Card unchanged" given for api-features and api-forms) |
| graph `--check` | exit 0 |
| `any` added | none · engine-code keys: none |

**Probe script** (50 calls, main and head side by side; a reviewer script in the scratchpad, not committed):
1. **Order.**
   * Token doors (milestones, notes, clients, keep list): no token → 401, a garbage token → 401 TOKEN_REFUSED, user-O on the keep list → 403 MISSING_PERMISSION. All unchanged. The guard still runs first.
   * Flags door: improved. user-A or user-P with a malformed id → 403 "Staff only" (main gave 400 for the body). No actor → 401.
   * A bearer on an actor door → 403, unchanged.
   * Checklist providers and form additions: main already answered 404 before the duty check, so the answers are the same.
   * **Review runs: changed, see M1.**
2. **Words.** Every 404 uses the service's own words:
   * "No such case/note/government step in your firm." with `code: NOT_FOUND`, the same as the notes' and milestones' `notFound`;
   * "No such case.", "No such checklist line.", "No such filing." and "No such document." as before.
   * Upper-case well-formed ids answer exactly as lower-case ones. The note key, step and case columns are all `@db.Uuid`, and the notes service already lower-cased its key.
   * The review plan with a malformed id used to answer the global "Not found (it may have been removed by a reset)." It now answers "No such case.", which is better.
3. **Keep list.**
   * A bad `after`, a repeated `after=a&after=b` and an unknown cursor uuid each give `badCursor()` 400 `fields.after`, as on main.
   * `?after=` gives 200, and `?pf28Unknown=x` and `?after[x]=1` give 400 with the key named.
4. **Clients list.**
   * The web sends only `query` and `page` (`web/src/runtime/clients.tsx:110`; `staffApi` adds no keys, `session.ts:91`).
   * The tests send only those two keys: `j_72.ts:94`, `check_csk1s_clients_browser.ts:84,133`, `check_csk1_client.ts:329-342`, and the new test. Grep `runtime/clients?`.
   * A repeated `query` → 400 in its own words; `?Page=1` → 400 naming `Page`.

## Findings
### Blocker
None.
### Major
- **M1. Review runs: the id's shape now comes before who may act, so a 403 becomes a 404** (`review-runs.ts:183`, `:214` `caseShape` runs before `this.r.reach`, whose duty checks are at `runtime.ts:167-168`). This goes against B2 (Lead 19 on #3377, "authorise before validate stays") and against the PR's own stated order, "who may act (where checked), then the id's shape". The flags door was fixed for exactly this; review runs was not.
  * Failing input: `POST /api/runtime/cases/not-a-uuid/review-runs/plan`, `x-actor: user-A`, body `{"forms":["IMM 5257"],"subject":"<any uuid>"}`.
    * Head: **404** "No such case."
    * Expected (as on main): **403** "Configuration author (simulated) works on configuration, not on cases."
  * Same with `x-actor: user-P`. Head: 404. Expected: **403** "Only the case officer can do this."
  * Same for `POST …/review-runs` (`run`, `:214`).
  * A well-formed id still gives 403, so the same caller gets 403 or 404 depending only on the id's spelling. Nothing is disclosed (the id is malformed), but the rule is broken.
  * Fix: check reach's two duties before `caseShape` (a small `mayOfficer(actor)` shared with `reach`, or reach's two lines copied), then the shape, then the body. Add the two lines above to `check_pf28_a5_case_ids.ts` "D" so the order is tested. Today the test passes with the bug.

### Minor (Should)
- **m1. Notes visibility: the same reorder for the share key.** `routes.ts:35` `idParam(k,"note")` now runs before `service.ts:234` `needShare`.
  * Failing input: a staff role with `agent/case:edit` but not `agent/note:share-with-client`, a malformed note key and a valid body. Main: 403 MISSING_PERMISSION. Head: 404.
  * Not reachable with the Sample seeds, since PF-3 gives the share key to every role with `case:edit`. Seen in the code only; it shows once a custom role exists.
  * Fix: call `needShare` before the id on that door, or accept it in writing.
- **m2. `?__proto__=1` is accepted (200) on both lists.**
  * The clients list (`clients.ts:98`) and, since 4fe9a745f, the keep list (`case-keep-period.ts:33`). a638bdaa4 named it 400; the zod strict object does not see that key.
  * This matches main, so it is not a regression. But the Done when says "unknown fields each answer a field error", and `input.ts parseInput` refuses `__proto__` before the schema for PF/FO (break m2).
  * Fix: the same `Object.hasOwn(query,"__proto__")` refusal before the parse, in both lists.
- **m3. The keep list now has two problem shapes on one door.**
  * An unknown key answers `type …/validation`, "Some details need fixing", `errors[]` (`case-keep-period.ts:35`).
  * A bad cursor answers "Check the details", `code: INVALID`, `fields.after` (`keep-period.ts:53`).
  * The clients list uses `fields` for both.
  * Fix: answer the unknown key in `badCursor`'s shape (`problem(400, "Check the details", …, { code: "INVALID", fields })`).
- **m4. The test's "B" accepts 404, so it cannot show that the body is still read** on doors that look up before the body. Nothing checks the x-actor order outside flags, which is why M1 passes. Fix: the M1 lines.

### Notes
- `case-document-flags.ts:149-150` repeats `reach`'s first two lines (`:128-129`) word for word. Fine for now; a shared helper would keep the words in one place.
- The PR's "Card unchanged" covers the new keep-list refusal. It is a behaviour change, but only an input check, so I accept it.

## What I could not check
- The notes share-key case (m1) live: no Sample role lacks the key.
- A real screen reader and an intended user's walk: no screen changed (D17/D20 stay with the founder).

**Verdict: Changes**. Fix M1: `POST /api/runtime/cases/not-a-uuid/review-runs/plan` (and `/review-runs`) with `x-actor: user-A` and a valid body must answer **403** "Configuration author (simulated) works on configuration, not on cases.", and with `x-actor: user-P` **403** "Only the case officer can do this.". Today both answer 404 "No such case.". m1–m4 are Should.

Reviewer: Changes 4fe9a745fe4d22e608ec49d00c91a91e620f8985
