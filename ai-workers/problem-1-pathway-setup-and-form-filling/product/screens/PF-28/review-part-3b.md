# PF-28 part 3b: independent review (PR #2931, head eb471eee22837d55191194a2edddeef45cf9e429)

Reviewer: Opus 5.5, 22 Nov. Scope: `git diff a9fc53bfa..eb471eee` only (part 3a was approved at a9fc53bfa), not counting 3a's own `review-part-3a.md` note. The diff covers assignment, conflict (routes and `bad`), identity (routes and `bad`), duplicates, corporate, prospect-edit, people/edit, the public web-form door, the sweep's ceilings and DW2, the allow-list, one case in `check_fo4_sales_browser` and the walk. I changed no code. Live AI was off; cost US$0. This is an API change with no new screen, so D1–D20 and the BIC table are N/A. The screens that call these doors were walked; see `journey-test-reviewer-2026-11-22-part-3b.md`.

## Checks run (isolated copy `rev_pf28b` on :4490, runtime ports; never :4400; stopped afterwards)
- **Sweep** on a fresh copy: **43/43**, exit 0. 507 probes; 108 do not yet answer as the rule says, which is exactly the 97 listed probes plus the 11 exceptions. The allow-list holds 9 code, 97 probe and 11 exception lines, so each ceiling is met with no slack. DW2's fail case picked `PATCH booking-types/:id unknown` (part 4).
- **API suites through the controllers:**
  - Green: fo10_assignment 42, fo10p2_sharing 37, fo2b_corporate 61, fo2p3_prospects 44, fo2pv_prospect_value 27, fo9a_duplicates 53, fo9a_phone_edit 37, fo9b_phone_doors 26, fo9a_won_duplicates 25, qa510 9.
  - **Red: fo13i_identity, fo13c_conflict and fo2_leads_prospects** (M1).
- **Browser suites, each on a fresh copy of eb471eee:**
  - fo4_sales_browser 47/47, including the new PF-28 pass and fail cases.
  - fo13s_identity_browser 36/36 (the multipart identity panel).
  - fo13s_conflict_browser 41/41 (the drawer and the confirm page).
  - fo9s_duplicates_browser 32/32 (the add-lead panel).
  - fo4b_embed_browser 45/45 (the embed with campaign attribution).
- **Web callers checked against each schema:**
  - `lead-page.tsx:49` sends `{phone}`. This fits PHONE.
  - `prospect-page.tsx:55` sends `{value: string|null, currency}`. This fits VALUE.
  - `conflict-panel.tsx:99,102` sends `{prospectId}` and `{requestId, prospectId, result?, disclosureText?}`. These fit PREVIEW and RECORD.
  - `confirm-page.tsx:33` sends `{result?, disclosureText?}`. This fits CONFIRM.
  - `identity-panel.tsx:101-107` sends multipart with `details` comma-joined. Live: 201, and a repeated `details` also gives 201.
  - `use-duplicate-check.ts` sends the DuplicateCheckIn keys.
  - The board sends a repeated `?source` (`pipeline-page.tsx:30`).
  - `web-form-page.tsx:48-53` and `form-embed.js:163-168` send the PUBLIC_BODY keys. The attribution keys are a subset, with values cut to 200/2,000 characters.
  - No screen calls assignment-rules or lead-sharing yet (FO-10's next part). A GET answer sent back to `PUT lead-sharing` gives 200.
  - No screen sends company match, change-type or contact calls.
- **The public door's invariants (front-office/MODULE.md), checked live:**
  - An unknown token gives the same 404 FORM_NOT_AVAILABLE with or without an unknown field.
  - An off-site post gives 403 before the schema runs.
  - A forged stamp gives 400 RELOAD "This page is out of date…".
  - A known person and a new person get a byte-identical thank-you.
  - A honeypot `website: {a:1}` gives 201 and stores nothing.
  - No refusal stored a lead.
- **No 500** in about 60 probes, which included `__proto__`, `[]`, a phone sent as an object, `source[a]`, and the bad ids on every changed path.

## Findings
### Blocker
None.
### Major
- **M1. Three existing suites fail on eb471eee (11 cases), and the PR changes none of them.**
  - The 400→422 move is what the row asks for. The assertions must move with it, as 3a moved `check_r130` DW2. The brief's done line, "the area's own suites … pass", is not met at this head.
  - `check_fo13i_identity.ts`: 20 pass, **7 fail**. DW1 ×3, DW2, DW3 ×3 expect 400 and get 422 with the same `fields` (lines 133-214).
  - `check_fo13c_conflict.ts`: 44 pass, **2 fail**. DW4 at :222 and DW6 at :279 expect 400 and get 422.
  - `check_fo2_leads_prospects.ts`: 111 pass, **2 fail**.
    - :125 expects "We could not read this form…". The answer is now 422 `fields.isAdmin`.
    - :191 expects attribution `{fbp}` to give 400. It gives 422 `attribution.fbp`.
  - Fix: move each assertion to 422, and keep the field each one names. Run the three suites, and list the moved lines in the PR body.
  - The shared worktree already has uncommitted edits to exactly these three files. I did not review them.
### Minor (Should)
- **m1. "Invalid input" again (3a's m1 pattern).**
  - `prospect-edit.ts:23`: `{value:true}` gives `fields.value: "Invalid input"`.
  - `identity/routes.ts:133`: `details[a]=NAME` gives `fields.details: "Invalid input"`.
  - Both come from a zod union with no message. Fix: give each union an `error`, for example "Enter the amount as digits." and "Choose the details corroborated."
- **m2. `PATCH people/:personId` reads the body before the id.**
  - `people/edit.ts:82` has no `idParam`, so `PATCH people/not-a-uuid {"x":1}` gives 422 naming `x`, where every other changed route gives the one not-found first.
  - Fix: `idParam(personId, "person")` before `parseInput`.
  - Nit: `phoneOf`'s unknown-field branch ("Only the phone number can be changed here.") can no longer be reached.
- **m3. The public form's 4 probe lines still name "PF-28 part 3 (front-office sales)", the part this PR closes.**
  - So once this PR merges, no part is left to remove them.
  - The proof in `check_fo4_sales_browser` is real: on a live form it covers an unknown field, a wrong type and a missing submission id, and checks that nothing is stored. Without the schema, its pass case would fail, because the old door answered 400 with no `fields`.
  - **My judgment:** this is acceptable evidence for this part, but the lines' fix part is now false. Preferred fix: the sweep switches on one Sample form with a wording in its own setup (as `check_fo4_sales_browser.ts:33-34` does; DEMO-LINK did the same for the booking doors). Then DW5 reaches the door and the 4 lines leave.
  - If that is out of this part's scope, ask the tech lead in the PR and relabel the 4 lines to say where the door is proven. Do not leave them on a finished part.
- **m4. `front-office/MODULE.md:23` still names only part 3a's file.** Add 3b's files and the door's order: the schema runs after the limits, the size check, the form lookup and the site check (brief touch list, "that area's `MODULE.md` invariant line").
### Nits
- n1. `submissionId: "abc"` gives 400 BAD_REQUEST "reload", while a missing one gives 422 "This is required.": two answers for one field. The form always sends a valid one, so no visitor sees this.
- n2. An attribution value of 32,001 to about 32,600 characters (still under the 32 KB door) is refused with 422. The comment says such values are "never refused for length". The embed cuts at 2,000, so no screen can reach this.
- n3. Part 1's `words()` says "This must be a object." (`attribution: "x"`, body `[]`), and the public door can now return it. That code is outside this diff; I note it for part 1.
- n4. The new DW2 fail case passes with "no route" once every loose route is fixed. That is fine, because the list is then empty, but the case's name could say so.

## What held
- **Board order, accepted.** `:type` is not a record id, so reading the query first leaks nothing:
  - `FOO?x=1` gives 422.
  - `FOO` gives 404 "No such pipeline.".
  - `individual` and `CORPORATE` give 200.
  - A repeated `?name` on companies/match gives 422 "This must be text.".
- **The confirm `missing` exception, accepted.** It is the same case as convert: `{}` is valid once a result is set, and with the sweep's random id the answer is 404. An unknown field or a wrong type is still 422.
- **The guards still run first.** Every changed route keeps its `@PermissionKeys`. `documentNumber` still gets the service's own sentence. The phone keeps its one sentence for 5, for an object and for `{}` (breaker F7).
- **The services' own words come through after the parse:**
  - the disclosure ("A potential conflict needs …");
  - the amount ("Enter an amount of 0 or more …");
  - requestId ("a uuid the screen makes once per check").
- **Removing the fix would be caught.** The 15 code and 26 probe lines that left would come back as unlisted failures, and the new fo4_sales case would fail.

## Not checked
- The builder's walk (`part-3b-walk/walk.cjs`). I read it; I did not re-run it.
- J-27 and J-26. I read their public posts; they fit the schema.
- `graph.mjs`, because it rewrites a tracked file.
- A real screen reader, and an intended user's walk.
- Housekeeping: my suite runs share this worktree with the builder and may have rewritten tracked screenshots under `screens/FO-9s/` and `fo-4b-embed/`. The `FO-5s/` and `fo-4w…/` screenshot changes are not from my runs. I left every one of them as found, so the builder's uncommitted work is untouched. Check them before committing.

## Journey score (reviewer, the one score for this check)
**9.5/10, pass.** Speed is ½: only the hosted form was timed. Details are in `journey-test-reviewer-2026-11-22-part-3b.md`.

**Verdict: Block** (Changes requested) for eb471eee22837d55191194a2edddeef45cf9e429.

To fix:
1. **M1:** commit the 400→422 updates to the three suites and run them green.
2. **m1-m4:** fix these in this PR if cheap. For m3, either reach the door in the sweep or relabel the 4 lines, and put the question to the tech lead.

Reviewer: Changes eb471eee22837d55191194a2edddeef45cf9e429

## Round 2 (head b23813d1f3b52d855e41c30728cc5ea3a1751ada, diff `eb471eee..b23813d1` only)
Scope: this round's code and test changes, and the breaker's findings in `break-report-part-3b.md`. I ran a fresh copy, `rev_pf28b` on :4490, and stopped it. I changed no code. Live AI was off; cost US$0.

**Checks**
- **Suites (my runs):** fo13i_identity 27/27, fo13c_conflict 46/46 and fo2_leads_prospects 116/116, all exit 0. The moved assertions are 422 and still name the field.
- **Live probes on a live form:**
  - **Nesting depth:** 3,000 and 4,000 levels give 422 on a real token and 404 on an unknown one. 5,000 and 15,000 levels give 400 BAD_REQUEST for both tokens; the trap field nested 5,000 deep does the same. The API log has no 500 or RangeError.
  - `attribution.__proto__` gives 422 naming it.
  - `PATCH people/not-a-uuid {"x":1}` gives 404.
  - `{value:true}` gives 422 "The value is an amount, like 1500 or 1500.50, or empty."
- **Allow-list:** it holds 9 code, 93 probe and 15 exception lines, which equals the new ceilings.
- **Builder's results (not re-run here):** the sweep at 43/43 on b23813d1, and the browser suites.

**Fixes**
- **M1 closed.** The suite runs above are green.
- **Breaker M1 closed.** A body too deep to measure is now 400 "We could not read this form…", never 500. It is pinned by the fo2 fail case, and the walls removed nothing else.
  - An unknown token sent with such a body also gets 400, not the one not-found. I accept this: the 413 too-large answer already comes before the form lookup, and both answers are the same for every token, so they reveal nothing about it.
- **Breaker m1 and m2 closed.** Attribution values are now capped at 40,000 characters, above what the 32 KB parser can let through. A 32,001-character landing page is cut to 2,000 and kept, and `attribution.__proto__` is refused, both with tests.
- **m1 (mine) and breaker m4 closed.** Both unions now give plain words.
- **m2 (mine) and breaker m5 closed.** The phone route checks the id with `idParam` first. Keeping the now-unreachable sentence as a guard is fine.
- **m3 (mine): I accept the move to the by-design exceptions.**
  - The reason is true: the sweep cannot reach a live form.
  - It names the two suites that prove the door on one.
  - The list does not grow overall: 4 probe lines leave and the exceptions grow by 4.
  - The tech-lead question goes in the PR. Whether the sweep should switch on a Sample form stays the tech lead's call.
- **m4 (mine) closed.** `MODULE.md:23` now names 3b's files and the door's order.
- **Not changed:** a missing `submissionId` or `loadStamp` still gives 422 (breaker m3, and my n1). I accept this: it is the rule's field error, and only a hand-made post gets it.

**Round-2 findings:** no Blocker, no Major, and no new Minor.

**Verdict: Approve** for b23813d1f3b52d855e41c30728cc5ea3a1751ada (no open Blocker or Major).

Reviewer: Approve b23813d1f3b52d855e41c30728cc5ea3a1751ada
