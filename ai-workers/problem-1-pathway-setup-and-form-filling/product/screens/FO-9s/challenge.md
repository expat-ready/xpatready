# FO-9s fresh challenge: duplicate warning, People to merge, guided merge (R1.29)

Written 22 Nov 2026 by a fresh challenger that did not draft the concept (skill screen-concept §B). Read: `concept.md`, `design/fo9s-boards.html`, `PRODUCT.md`, `STANDARDS.md`, `EXPERIENCE.md`, `QUALITY.md`, BACKLOG rows FO-9a, FO-9b (both rows with that id), FO-9s, J-29, the FO-9b brief `design/lead-b-briefs/FO-9b.md`, AG-2-68, AG-2-16 and AG-2-78 (requirements 2026-11-02), P-574, and the app code: `add-lead-panel.tsx`, `lead-page.tsx`, `sales-frame.tsx`, `duplicates/service.ts` and `routes.ts`, `ports/matching.ts`, `ports/person-merge.ts`, `sales/leads.ts`, `sales/arrival.ts`, the FO-9a migration `20261117030000_fo9a_duplicate_match` and the PF-3 key seed.

**Freshness:** `ai-workers/tools/freshness.sh` failed (it looks for `code/README-copies.md`, which is missing in this copy). So the team's sources are **Unverified** for freshness: the requirement cards quoted here are from the 2026-11-02 snapshot, and the team's code was not opened.

Every finding below separates **Fact** (file:line or quote) from **Judgment**, with a confidence level.

## Verdict
**Build after these changes.** The shape is right: one check reused, warn and don't block, a nameless hidden line, the screen patterns, a preview, and Undo. But two things break. First, part 1's warning and the existing 409 on Save are not yet one flow. Second, parts 2-3 assume API behaviour that FO-9b part 2's planned routes do not have.
* **Part 1** can start once M1 and M2 are written into the concept.
* **Parts 2-3** wait for B1, M3 to M8, and the founder's answers. Most of those land as lines in the FO-9b brief (part 1 or part 2), not as new screens.

## Objections

### Blocker

**B1. "Add as new", then the automatic merge joins the two people anyway.** *Needed for the proof* (parts 2-3; also FO-9b part 2).
* **What breaks.** Staff say two records are different people. Then P-574's automatic merge joins them silently, because the pair is "safe" (leads only, exact email, no case, document or money).
* **Example.** A couple share `family@example.org`. Partner A is a lead. The adder types Partner B, sees the warning (S1, or the 409), and picks "Add as new". The lead is saved. FO-9b part 2 then sees an exact email between two leads with no case, document or money, and merges Partner B into Partner A with `automatic: true`. The adder's decision is overridden, and a real person's record becomes a tombstone.
* **Evidence (fact).** The FO-9b brief, part 2: "the match is exact email or exact normalised phone (FO-9a). Only then … the merge runs by itself". It has no exception for `confirmedNew`. AG-2-68 rule 16: "'Add as new' counts as Keep separate … writes the flag for each candidate shown in state KEPT_SEPARATE". Concept BR-5 says only that "Add as new" sends `confirmedNew`, and says nothing of what follows. `leads.ts:155` skips the match on `confirmedNew` but stores no decision.
* **Judgment.** This is data at risk (QUALITY D2, scale 1). Confidence high that the brief as written does this. Whether staff's "Add as new" outranks P-574 is a conflict between a requirement and a decision, so it goes to the founder (AGENTS rule 2; question 1 below).
* **Fix.** Add a rule BR-5b: "a person saved with 'Add as new' is recorded Kept separate against every candidate shown, and is never merged automatically with them". FO-9b part 2 writes a `fo_dup_review` row with status KEPT_SEPARATE for each shown candidate. Its safe-pair test refuses such a pair. Add a test: "Add as new with a shared email → two people, no `fo_dup_merge` row, the pair on Kept separate".

### Major

**M1. Part 1's warning and the 409 on Save show the same person twice, and the warning's own words become false.** *Needed for the proof* (part 1).
* **What breaks.**
  * The hint names an exact email or phone match. The adder carries on and clicks Save. The server answers 409 `KNOWN_PERSON`, and a second box, "This person may already be on file", appears below the form. The hint stays above it, because no key changed. The same person is now on screen twice, with two different buttons ("Use this person", "Use existing person").
  * The hint said "Carry on and save: a new person is made", which is untrue for an exact key.
  * The two boxes can also disagree. The 409 names only the newest exact match, whether or not the adder may see it. The check lists the people the adder can see first.
* **Example.** Lena Park (visible) and an older hidden record share `lp@example.org`, and the hidden one was created later. The hint shows "Lena Park · Same email" plus the hidden line. Save then answers "A person you cannot see" and does not name Lena Park.
* **Evidence (fact).**
  * `add-lead-panel.tsx:64`: on 409 it sets `matches`, and `:102-113` renders a second box. `:86` disables Save while that box shows.
  * `leads.ts:155-160` returns one match from `possibleMatch`. `arrival.ts:46` runs `findFirst` ordered by `createdAt desc` with no visibility filter.
  * The check orders visible people first: FO-9a migration line 97 (`ORDER BY 7 DESC`, where column 7 is `seen`).
  * The concept's copy (§4, S1): "Not the same person? Carry on and save: a new person is made."
* **Judgment.** Confidence high. There is no leak: both paths name only people the adder may open, and both are nameless otherwise. The defect is contradiction and double asking.
* **Fix.** Keep one place to choose.
  * (a) The hint's last line becomes a button: "Not the same person? **Add as new**". It records `confirmedNew`, so Save does not ask again, and any key edit clears it.
  * (b) For name-only matches, the line keeps its current wording: Save makes a new person with no 409.
  * (c) When a 409 does arrive (no hint choice was made, or the check failed), its box replaces the hint rather than sitting beside it.
  * Tests: an exact hint followed by Add as new and Save gives one request and no 409. An exact hint ignored, then Save, shows one box on screen.

**M2. "Use this person" silently drops the email and phone the adder typed.** *Needed for the proof* (part 1).
* **What breaks.** With `personId`, the lead is made on the existing person and the typed name, email and phone are thrown away. Today that only happens after an exact-key 409, so at least one key was identical. Part 1 offers the button on **similar-name** matches, where both keys can differ.
* **Example.** The adder types "Lena Parkes, lena.new@example.org, 647 555 0199". The hint shows "Lena Parkes · Similar name (78%)" for a record holding another email and phone. The adder clicks "Use this person", and the lead saves on the old record. The new email and phone are on no record, and nothing tells the adder.
* **Evidence (fact).** `arrival.ts:90-91`: the `existingPersonId` branch reads only the id, and `a.person` is unused. `add-lead-panel.tsx:72` skips the panel's own checks when `personId` is set. The board's S1 shows "Use this person" on the name-only row.
* **Judgment.** Confidence high. This is the most likely wrong action an RCIC would take on this screen (skill §B side 4).
* **Fix.** After a pick, the line under "Adding to Lena Park's record. Change" names each typed email or phone that differs and will not be saved: "Not saved: lena.new@example.org (Lena Park's record has another email)." Editing a key after a pick clears the pick, as `set` clears `matches` today (`:78`). Test: a name-only pick with a different email shows the line, and the person count stays the same. Saving those details onto the person is not part of this row.

**M3. After a merge, the tombstone keeps matching: a phantom hidden line, a phantom 409, and new leads matched to a dead record.** *Needed for the proof* (part 1 once FO-9b part 1 has merged; J-29).
* **What breaks.** The loser keeps its email, phone and name key ("nothing is deleted"). Its leads move to the survivor, so it has no lead. FO-9a's `seen` test needs a lead the viewer sees (migration lines 87-90), so the tombstone is "hidden" from **everyone**, an Owner included.
* **Example.** Lena Parks is merged into Lena Park. Then:
  * Typing Lena's old email shows "Lena Park" plus "Possible match with a record you cannot open — ask a manager", forever.
  * A web-form arrival with that email sets `possible_match_person_id` to the tombstone (`arrival.ts:96`, `findFirst` by newest), and the lead page says "Possible match with a person you cannot see".
  * A hint pick made before the merge saves a lead onto a tombstone, because `leads.ts:150-152` checks only that the person has a visible lead. After the merge, the tombstone has no lead, so this answers 404 "person", which leaves the adder stuck with no explanation.
* **Evidence (fact).** FO-9b brief part 1: "mark the tombstone", with `merged_into_id` on `fo_person`/`fo_company` or in `fo_dup_merge`. Neither the brief nor the concept excludes tombstones from `fo_sales_person_matches` or `possibleMatch`. AG-2-68 rule 12: "Matched record merged away. Follow mergedIntoPartyId to the survivor."
* **Judgment.** Confidence high on the mechanism. FO-9b part 1 is not on `main` yet (`api/src/front-office/duplicates/merge/` does not exist), so this is a spec gap, not a live bug.
* **Fix.** One rule, built in FO-9b part 1, which owns the tombstone mark: the check's definer function and `possibleMatch` skip tombstones, and a `personId` naming a tombstone resolves to its survivor (rule 12). FO-9s test: after a merge, the loser's email shows the survivor only, with no hidden line.

**M4. The lead page's "Possible match" notice and the list's chip survive Merge and Keep separate. After a merge, the lead names its own person.** *Needed for the proof* (parts 2-3; J-29 ends at "one person").
* **Evidence (fact).** `fo_lead.possible_match_person_id` has a foreign key to `fo_person` (`front-office-sales.prisma:260, 269`). FO-9b's column test (DW2) forces every such column into MOVE, COPY or STAYS. As MOVE, it is re-pointed to the survivor, which is the lead's own person after the move. `leads.ts:94-97` then shows "Possible match: Lena Park (L-00012)" on Lena Park's own lead, and `leads.ts:69` keeps the list chip. AG-2-68 rule 7, on Keep separate: "The banner clears on this lead". AG-2-16 rule 10: flags "move to MERGED". On `main`, the flag is this column, which has no state.
* **Judgment.** Confidence high. Neither the concept nor the brief says what happens to this column.
* **Fix.** In FO-9b, classify `possible_match_person_id` as **CLEARED** (set to null) for the pair's leads on Merge, and clear it on Keep separate too. Undo restores it from the snapshot. FO-9s and J-29 test: after Merge and after Keep separate, neither the lead page nor the list shows "Possible match" for the pair.

**M5. People to merge's keys: the planned list route needs the merge key, so Case Officers cannot use the concept's "Keep separate with `agent/prospect:edit`". Question 1 is not a founder question.** *Needed for the proof* (part 2).
* **Evidence (fact).**
  * The FO-9b brief, part 2: "`GET /api/front-office/duplicates/review` (`agent/prospect:merge`, …)". It names no key for keep-separate.
  * Concept BR-6: list and Keep separate on `agent/prospect:edit`. Its test expects that "a Case Officer sees no Merge", which presumes a Case Officer sees the list.
  * Seed (PF-3 migration lines 948-951, 963-965): `edit` is held by Owner, Admin, Case Manager and Case Officer; `merge` by Owner, Admin and Case Manager.
  * AG-2-68 §8: "Link and Keep separate: `agent/prospect:edit`, so Case Officers can decide them". AG-2-16 §8: merge on `agent/prospect:merge`. `ports/person-merge.ts:13` already fixes `MERGE_KEY = "agent/prospect:merge"` on `main`.
* **Judgment.** The requirement and the code on `main` settle the keys. The BACKLOG row's `agent/duplicates:*` keys are row text, not a source of truth (AGENTS rule 2). So this is the tech lead's call, recorded in the FO-9b brief, not one of the founder's three questions. Confidence high.
* **Fix.**
  * Change the FO-9b brief, part 2: `GET review` and `POST review/:id/keep-separate` on `agent/prospect:edit`; preview, merge and Undo on `agent/prospect:merge`.
  * The concept states that Undo needs `agent/prospect:merge`; BR-10 names no key today.
  * Drop concept question 1.

**M6. Merged tab and "Undo from the list" have no data on the planned routes.** *Needed for the proof* (R1.29: "a merge can be undone from the review list", `qa/CAPABILITIES.md:169`).
* **Evidence (fact).**
  * In the FO-9b brief, an automatic merge happens "at FO-9a's match point" and "everything else goes to the review list". So an automatic merge writes **no** `fo_dup_review` row, yet the board's Merged tab lists "Merged automatically … Undo merge".
  * `fo_dup_review` has no merge reference (brief: id, `firm_id`, the pair, `score`, `reasons`, `first_seen_at`, `status`), and Undo is keyed by merge id (`POST merges/:id/undo`).
  * Nothing returns whether Undo is still allowed. The port only refuses on the attempt (`ports/person-merge.ts:75-80`, which also refuses while a later merge naming either record stands).
* **Judgment.** Concept question 3 sees half of this. It asks for `?status=MERGED` with `mergeRef`, but MERGED review rows would still miss every automatic merge. Confidence high.
* **Fix.**
  * The Merged tab reads `fo_dup_merge`, not `fo_dup_review`: one read route in FO-9b part 2, `GET duplicates/merges`. It is firm-scoped, and lists a merge only if the viewer sees the survivor. Each row returns `mergeRef`, both names, `by`, `at`, `automatic` and `undoneAt`.
  * Show **Undo merge** on every merge that is not undone, and show the server's refusal in place of the button after the click (the concept's BR-10 already words it so). This avoids a per-row "can undo" computation that FO-9b does not have.
  * Kept separate reads `GET review?status=KEPT_SEPARATE`.
  * This replaces concept question 3: it is an API-shape decision for the tech lead.

**M7. "Keep this one instead" (S3) cannot be sent: the planned preview and merge routes take no survivor.** *Needed for the proof* (part 3).
* **Evidence (fact).** The FO-9b brief: "`POST …/review/:id/preview` (both values of every field, the default pick, …)" and "`POST …/review/:id/merge` with `choices`". Neither names the survivor. The port needs `survivor_fo_id` and `loser_fo_id` (`ports/person-merge.ts:31-39`). The board's step 1 lets the person choose which record stays, and the toast's Undo needs the `merge_ref` that the merge route returns. The brief does not name that return either.
* **Judgment.** Confidence high. Without a survivor, the route would have to pick one, and "Keep this one instead" would do nothing.
* **Fix.** Preview and merge take `survivorId` (one of the pair; anything else gives 422). Merge returns `{ mergeRef }`. Preview returns each side's `updatedAt`, so the screen can say "newer" or "only value" from the port's `defaultPick` rule rather than recomputing it (STANDARDS §7, no duplicated logic). Put all of this in `duplicates/contract.ts`.

**M8. Nothing says what puts a pair on the list, so J-29's step from S1 to the lead to S2 has no defined mechanism.** *Needed for the proof* (parts 2-3, J-29).
* **Evidence (fact).**
  * The brief's part 2 hook is "one call at FO-9a's match point in `api/src/front-office/duplicates/`". That folder holds only the read-only `check` (`service.ts:3`: "It only reads: nothing is created") and `wonDuplicates` (`prospect.won`).
  * The arrival path that saves people is `sales/arrival.ts`. Its `possibleMatch` is exact-key only (`arrival.ts:43-47`), so a similar-name pair saved past the hint would never reach the list, whereas P-574 has "anyone else goes to a duplicate review list with a match score".
* **Judgment.** If the hook is put on the check route, typing in Add a lead would write rows. If it is put only on `prospect.won`, S2 stays empty for leads. Confidence medium-high that a builder could read the brief either way.
* **Fix.**
  * The concept states that the check route stays read-only (part 1 depends on it).
  * Pairs are written when a person is saved (`arrive()`, every door), using FO-9a's full match (email, phone, and a similar name at or above `NAME_THRESHOLD`), in the arrival's transaction. Named in the FO-9b brief, part 2.
  * Whether name-only pairs go on the list is founder question 2.

### Minor
1. **The adder's key is misnamed.** *Needed for the proof.*
   * Fact: Add a lead is on `agent/prospect:create` (`sales/routes.ts:45`), not `:edit`, and there is no seeded "assistant" role. The roles are Owner, Admin, Case Manager, Case Officer, Billing/Finance and Read-only (PF-3 seed).
   * On the question asked: `agent/prospect:show` on the check route **is right**. Every seeded role that holds `create` also holds `show` (seed lines 941-944 and 970-975), and the Leads page that opens the panel already needs `show` (`routes.ts:42`). A 403 or 422 from the check must stay silent; the concept's "check failed" state covers that.
   * Fix: §1 should read "Case Officer and above adding a lead (`agent/prospect:create`)".
2. **BR-2's name key is unclear when only a first name is typed** (Last name is optional, `add-lead-panel.tsx:93`). *Needed for the proof.* Fix: say that First name and Last name together are one key, checked when either loses focus with a first name present. The server already returns nothing for a first name alone (concept test BR-3).
3. **S3's "same program" line does not match AG-2-16 rule 3, and can never show here.** *Not built.*
   * Fact: rule 3 is "When both records have an open **case** with the same pathway, program and sub-category". The board says "Both records have an open prospect for Express Entry", and BR-7 keeps every pair with a case out of this dialog.
   * Fix: drop the line from S3 and from BR-9. It belongs to the case side's merge.
4. **Error copy.** *Needed for the proof.* AG-2-16 §11 gives the failure sentence "Could not merge. Nothing changed." Use it word for word for a failed merge, instead of a generic "plain reason, Try again".
5. **Board fixes.** *Needed for the proof.*
   * S1's menu shows "People to merge 3", which part 1 does not ship.
   * S2's pill reads "100 · strong", but the concept defines no "strong" band (scores only, `ports/matching.ts:41`). Show the number and its tooltip.
   * S1's "Lena Park · Same phone · Similar name" leaves out the "(NN%)" that BR-3 puts on a name reason.
6. **People who have no lead are hidden from everyone, an Owner included.** *Not built* (FO-9a/FO-4c).
   * Fact: corporate contacts are created with no lead (`corporate/service.ts:239`), and `seen` needs a visible lead (migration lines 87-90). An Owner adding a lead with a contact's email therefore reads "ask a manager", and such a pair would never appear on S2.
   * Fix: none in this row. Name it under the concept's known limits so qa does not log it as an FO-9s bug.
7. **The "waits on" line is ambiguous.** *Needed for the proof.* BACKLOG has two rows with the id FO-9b (lines 356 and 381; 381 is the R1.33 phone-doors item). FO-9b part 1, merge, is not on `main`. Fix: write "after the FO-9b merge brief's part 2 (it follows its part 1 and FO-7b)".

## What is sound
* **One check, reused** (FO-9a `POST duplicates/check`), warn but never block (EXPERIENCE §2.9), and no check on the public form (FO-2's rule). This matches P-574 (2) and the code on `main`.
* **No leak in the hint or in "Use this person".** The check's `seen` rule (migration lines 87-90: own active lead, all leads with view-all, unassigned with that right) is the same rule `leads.ts:150-152` uses to accept a `personId`. A named match can therefore always be used, except after a merge (M3). The hidden line is yes or no, never a count (`service.ts:69-70`, FO-9a B3).
  * The only new disclosure compared with today's 409 is that a **similar name** the viewer cannot open exists. AG-2-68 rule 11 accepts a nameless line.
  * Timing differences are within one firm's staff and bounded by `LIMIT 50` in one query.
  * Confidence: medium-high. No objection.
* **Request discipline** in BR-2: the latest answer wins, and a key edit clears the hint and checks again. This mirrors the existing `set` behaviour (`add-lead-panel.tsx:78`).
* **Patterns from EXPERIENCE §3:** a side panel, a library list, and a dialog of at most 3 steps. The preview before confirming and Undo meet §2.8 ("in-page confirmation for destructive actions, undo where possible"). The timed toast has an untimed twin on the Merged tab.
* **S3's fields are exactly the port's `MERGE_FIELDS.PERSON`** (`ports/person-merge.ts:22`: given names, family name, email, phone, language, time zone), and the defaults follow `defaultPick` (most complete, then the record changed most recently). BR-7, refusing a pair with a case, matches the brief and P-575 (4).
* **The conflict between AG-2-68 §13 and P-574 is stated openly** rather than settled silently, and P-574's own words name pg_trgm.
* **The capability split:** part 1 now, parts 2-3 after FO-9b, and the Engage and add-contact mounts and the lead-banner Link marked *Not built*. Nothing is scaffolding standing in for a capability (P-33).
* **Concept question 2** (Sales › People to merge, since the Contacts screen does not exist) is a sensible answer to AG-2-68 rule 17.

## Back-end plan (element → record → API → rule → test)
| Element | Record | API | Rule | Test (`check_fo9s_duplicates_browser.ts` unless named) |
|---|---|---|---|---|
| S1 hint | `fo_person` (read) | `POST duplicates/check` (on main, `prospect:show`) | BR-1 to BR-4; the check stays read-only (M8) | Save stays on; one request for three quick blurs; "Same phone" across two spellings of one number; the hidden line only, for another rep's record |
| S1 "Use this person" | new `fo_lead` on the existing person | `POST leads {personId}` (on main) | BR-5; the not-saved line (M2) | No new person (count through the API); a differing typed email is named as not saved |
| S1 "Add as new" | new `fo_person` and `fo_lead`; KEPT_SEPARATE review rows (FO-9b part 2) | `POST leads {confirmedNew}` (on main) | BR-5, BR-5b (B1), M1 (a) | One request, no 409; part 2: no automatic merge, and the pair is on Kept separate |
| 409 box | none | `POST leads` 409 `KNOWN_PERSON` (on main) | M1 (c): it replaces the hint | Never two choice boxes on screen |
| Tombstone exclusion | `fo_person` tombstone mark (FO-9b part 1) | check, `possibleMatch`, `POST leads {personId}` | AG-2-68 rule 12 (M3) | After a merge, the loser's email shows the survivor only, with no hidden line |
| Menu item and count | `fo_dup_review` OPEN | `GET duplicates/review` (`prospect:edit`, M5) | BR-6 | Case Officer sees the item; Billing/Finance does not |
| S2 To review | `fo_dup_review` | `GET duplicates/review?status=OPEN` | BR-6, BR-7; pairs written at arrival with the full match (M8) | A viewer of one side sees no pair; Merge is off for a pair with a case |
| S2 Keep separate | `fo_dup_review.status`; `fo_lead.possible_match_person_id` cleared | `POST review/:id/keep-separate` (`prospect:edit`) | AG-2-68 rule 7 (M4) | The pair leaves To review; the lead's notice and chip are gone |
| S2 Merged tab and Undo | `fo_dup_merge` (guided and automatic) | `GET duplicates/merges` (new read, M6); `POST merges/:id/undo` (`prospect:merge`) | BR-10; the port's refusals | An automatic merge is listed; Undo restores it; a refused Undo shows the reason |
| S2 Kept separate tab | `fo_dup_review` KEPT_SEPARATE | `GET duplicates/review?status=KEPT_SEPARATE` | B1, AG-2-68 rule 7 | "Add as new" and Keep separate pairs are listed |
| S3 step 1 | both `fo_person` rows with `updatedAt` | `POST review/:id/preview {survivorId}` (M7) | BR-8 (`defaultPick`) | A swapped survivor changes the preview; the chosen value is kept |
| S3 step 2 | counts of rows by table | the same preview | BR-9 (without the case line, Minor 3) | Counts match what moves (compared through the API after the merge) |
| S3 confirm and toast | `PersonMergePort` → `fo_dup_merge` | `POST review/:id/merge {survivorId, choices}` → `{mergeRef}` | AG-2-16 rules 1, 4, 5; `possible_match_person_id` cleared (M4) | 409 on a changed record shows "One of these records changed. Reload to see it."; a failure shows "Could not merge. Nothing changed."; toast Undo works |
| J-29 | all of the above | all of the above | all of the above | `tests/journeys/j_29.ts`: S1 → Add as new or carry on → lead → S2 → S3 → Undo, ending with one person and no stale notice |

## Questions for the founder (at most 3, recommendation first)
1. **When staff choose "Add as new", may the system still merge the two people by itself?** **Recommend no.** Record the pair as Kept separate, so it is never merged automatically and is listed on the Kept separate tab. This follows AG-2-68 rule 16 and "the person decides". The scenario: a couple share one email. Staff add the second partner as new, and without this rule P-574's automatic merge would join them minutes later (B1).
2. **Do pairs that match only on a similar name go on People to merge?** **Recommend yes,** shown with their score and never merged automatically (P-574's "anyone else goes to a duplicate review list with a match score"), with Keep separate clearing them. The cost: common names add rows to review. AG-2-68 rule 17 lists only email and phone pairs, and §13 says "No fuzzy name matching", so this is a conflict between the requirement and P-574 for the founder to settle.
3. **Where does the list live?** **Recommend Sales › People to merge** (a menu item with a count of open pairs), because the Contacts screen in AG-2-68 rule 17 does not exist. (The concept's question 2, kept.)

The concept's questions 1 (keys) and 3 (Merged-tab API) move to the tech lead as M5 and M6: the requirement and the code on `main` decide them.

## Lead response
Lead 19, 22 Nov (PR #2896 comment 7072122159; P-223 (4)), written in by the runtime lane as the Lead asked:
* **Part 1 (S1, the warning on Add a lead): approved to build**, once M1 and M2 and Minors 1, 2, 4 and 5 are in concept.md (done in r3).
  * M1: one place to choose. The hint's last line becomes the "Add as new" button, which sends `confirmedNew`; Save does not ask again; a key edit clears it; one ordering, visible people first (BR-5).
  * M2: "Use this person" keeps the typed email and phone as offered additions, never silently dropped (BR-5b).
  * Minor 4: "Could not merge. Nothing changed." word for word.
  * Build on a fresh branch from origin/main on FO-9a's `POST duplicates/check`, with an Opus reviewer and a breaker (new screen).
* **M5 and M6 are the Lead's, not founder questions.**
  * Keys follow main: `agent/prospect:merge` for the list and merge, and `agent/prospect:edit` for Keep separate only if the list route is split so Case Officers can read it.
  * The Merged-tab data and Undo go into FO-9b part 2's brief.
  * M3, M4, M7 and M8 also go into FO-9b's brief lines, which the Lead shapes.
* **Parts 2-3 wait** on FO-9b part 2 and the founder's answers to the three questions: Add as new vs automatic merge (B1), similar-name pairs on the list, and the list at Sales › People to merge. The Lead asks the founder at his next typed turn, with the challenge's recommendations.
* **Builder's reading of M2, for the Lead to confirm:** fo_person has one email column and main has no route to edit an email (FO-9a-ph edits the phone only). So "offered additions" is built as a pre-ticked offer to keep the unmatched typed email and phone in the lead's first note ("Also gave: …"); unticked, the box says "Not saved: …". Writing them onto the person record would need a new edit route, which is not in this row.

## Agreement

## Build discoveries
