# FO-9s concept: duplicate warning, People to merge, guided merge (R1.29)

Written 22 Nov 2026 by the runtime lane, on Lead 19's ask after FO-9a (#2882) merged. Row: BACKLOG **FO-9s** (screens; concept first; waits on FO-9b and FO-4). Approval: the tech lead after the fresh challenge in `challenge.md` (P-223 (4)). No canvas board: the boards are `design/fo9s-boards.html` (S1-S3, Sample data). Nothing is built in this PR. **r2 (22 Nov):** revised after `challenge.md` (B1, M1-M8 answered in §8).

## 1. Job and journey
A staff member adding someone sees, before saving, the people already on file who look like them, and can use the existing record. A manager clears the pairs that are one person: merge them field by field, or keep them separate, and undo a merge while nothing new has arrived. Personas: assistant or RCIC adding a lead (`agent/prospect:create`; the check needs `agent/prospect:show`, which every role with create holds); Case Manager and above merging (`agent/prospect:merge`). Journey (map row 29): enquiry → **warning on Add a lead** → lead → **People to merge** → **guided merge** → one person, and the prospect and client sides use that person.

## 2. Layers
* **API on main:** `POST /api/front-office/duplicates/check` (FO-9a, key `agent/prospect:show`; `DuplicateCheckOut`: named matches with reasons and score, `hidden` 0/1, `hiddenLine`). Add a lead `POST leads` answers 409 `KNOWN_PERSON` on an exact email or phone and takes `personId` or `confirmedNew` (FO-2/FO-4). Lead page `possibleMatch` notice (FO-2).
* **API not on main (FO-9b part 1 and 2):** merge, Undo, `fo_dup_review`, routes `GET duplicates/review`, `POST review/:id/preview`, `POST review/:id/merge`, `POST merges/:id/undo`, `POST review/:id/keep-separate` (brief `design/lead-b-briefs/FO-9b.md`).
* **Screens on main:** `sales/add-lead-panel.tsx` shows the 409's matches on Save only (exact keys; no similar name). No Engage-as-Corporate or add-contact screen (FO-4c). No list or merge screen.
* **New:** `web/src/modules/front-office/duplicates/` (`use-duplicate-check.ts`, `duplicate-hint.tsx`, `people-to-merge-page.tsx`, `merge-dialog.tsx`, `contract.ts`), one mount line in `add-lead-panel.tsx`, one route and one menu line in `sales-frame.tsx`. The team's code has no duplicate screen (AG-2-68: "Not built"); this is new, not a retrofit.

## 3. Business rules
* **BR-1 Warn, don't block** (EXPERIENCE §2.9; P-574 (2)): the hint never disables Save. The server's 409 on an exact key still asks before saving (AG-2-4 rules 5-6, AG-2-68 rule 16).
* **BR-2 When it checks:** a key loses focus (first + last name, email, phone), at least one key filled, 400 ms after the last change, one request at a time, the latest answer wins; a key edited after a match clears the hint and checks again. Never on the public web form (FO-2: it answers the same for a known person).
* **BR-3 Reasons in words, strongest first:** "Same email", "Same phone", "Similar name (78%)" (FO-9a's reasons and score); at most 10 named.
* **BR-4 Hidden records stay nameless:** only the line "Possible match with a record you cannot open — ask a manager", never a count or a name (AG-2-68 rule 11; FO-9a break B3).
* **BR-5 One choice, one box (r2, M1):** the hint offers "Use this person" per match and one "Add as new". "Use this person" = Link: Save sends `personId`, the lead goes on that person, no new person (AG-2-68 rule 16). "Add as new" sends `confirmedNew` and counts as Keep separate for every match shown (rule 16). A 409 on Save **replaces** the hint (one box, never two). Without a choice, Save on a similar-name-only hint saves as new.
* **BR-5b Nothing typed is lost silently (r2, M2):** after "Use this person", the box names each typed detail that differs from the record and will not be saved ("lp.work@example.org will not be added to Lena Park. Add it on her record after saving."), because the existing-person path keeps the record's details (`arrival.ts:90-91`).
* **BR-6 People to merge lists a pair only when the viewer may open both** (AG-2-68 rule 17; FO-9b DW8). List and Keep separate: `agent/prospect:edit`; preview, Merge and Undo: `agent/prospect:merge` (AG-2-68 §8, AG-2-16 §8; seeded keys, no new keys; r2, M5). No key → no menu item.
* **BR-7 A pair with a case is not merged here:** Merge is off with "This person has a case; merge them from the client record." (FO-9b part 2; P-575 (4)).
* **BR-8 Field by field, defaults said:** each field pre-picks the most complete, then the most recent value and says why ("only value", "newer"); the person picks which record stays (AG-2-16 rules 1, 8).
* **BR-9 What moves, before confirming:** FO-9b's preview (leads, notes, calls, consent copied, what stays) and AG-2-16 rule 3's line only for two open cases (never here: case pairs are refused, BR-7); nothing is deleted.
* **BR-10 Undo:** a toast after the merge, and **Undo merge** on every not-undone merge on the Merged tab (from FO-9b's merge records, automatic ones included, "Merged automatically"); Undo is always offered and a refusal shows the server's reason after the click (r2, M6).
* **BR-11 Decided pairs leave the lead (r2, M4):** after Merge or Keep separate, the lead page's "Possible match" notice and the list chip go (FO-9b clears `possible_match_person_id` for the pair).

## 4. Layout (EXPERIENCE §3: Side panel for S1, Library list for S2, Dialog/wizard ≤3 steps for S3; team tokens through `@/components/ui/controls`)
* **S1 (part 1):** in the Add a lead panel, a warn box under Phone: title "2 people on file look like this person.", one row per match (name, reasons, "Use this person"), the hidden line, and "None of these? Add as new: a new person is made, and these pairs are kept separate." with **Add as new** After a pick: "Adding to Lena Park's record. Change", and Save reads "Add lead to Lena Park". The same `DuplicateHint` mounts on Engage as Corporate (company match) and add contact when FO-4c builds them.
* **S2 (part 2):** Sales › **People to merge** (menu item with the open count, part 2; S1's board shows it ahead). Tabs To review · Merged · Kept separate. Table: People (both, with lead or client number) · What matched · Match (score 0-100 pill with its tooltip; no "strong" label) · First seen · actions.
* **S3 (part 3):** dialog "Merge A and B": 1 Choose what to keep (side by side, a radio per field, "Keep this one instead") · 2 What moves · 3 Confirm ("Merge 2 people"). Back keeps choices.
* States per screen: loading (skeleton rows), empty (S2: "No pairs to review…"), error (plain reason, Try again), no key (S2 says who to ask), conflict (409 "One of these records changed. Reload to see it."), long names wrap. 375 / 1024 / 1440 px; 200 % zoom.

## 4b. Best in class (vendor documentation as remembered, not re-read for this concept: Unverified)
Salesforce warns on create through duplicate rules and merges with a radio per field; HubSpot lists suggested pairs to review and merge; both treat a merge as final. **Copy:** the warning before save, the radio per field. **Beat them:** reasons in words, the hidden line instead of silence, defaults that say why, a "what moves" preview, and Undo. Effort saved: the warning reuses what was typed; "Use this person" types nothing again.

## 4c. Scorecard
EXPERIENCE §6 covers case-side screens; this is front office, so N/A. Its intent is met by BR-1, BR-3, BR-8 to BR-10 and the tooltips in §5.

## 5. Copy
"2 people on file look like this person." · "Checking for people on file…" · "Use this person" · "None of these? Add as new: a new person is made, and these pairs are kept separate." · "Adding to <name>'s record." · Merge…, Keep separate, Undo merge, Merge 2 people · Match tooltip: "An exact email or phone is a 100 match. A similar name alone scores its likeness." · Empty S2: "No pairs to review. When two records look like one person, they appear here." · No key: "You need access to People to merge. Ask an Owner or Admin." · BR-7's and FO-9b's refusal sentences word for word.

## 6. Contract and tests
* `duplicates/contract.ts` parses `DuplicateCheckOut` (shared, `ports/matching.ts`) and FO-9b's review, preview and merge answers once they exist.
* `tests/check_fo9s_duplicates_browser.ts` (Playwright on an isolated copy), a pass and a fail per rule: BR-1 Save stays on with a hint; BR-2 one request for three quick blurs, re-check after an edit, none on the web form; BR-3 "Same phone" for 416.555.0101 against +1 (416) 555-0101, nothing for a first name alone; BR-4 another rep's record → the line only; BR-5 "Use this person" makes no new person (count by API), "Add as new" makes one; part 2-3 cases follow BR-6 to BR-10 (a viewer of one side sees no pair; a Case Officer sees no Merge; a case pair's Merge is off; the chosen value is kept; Undo restores, a refused Undo shows the reason). Keyboard only, axe-core (no serious), 375/1024/1440 with no horizontal scroll.
* **J-29** (`tests/journeys/j_29.ts`, the join row) walks S1 → lead → S2 → S3 → Undo when parts 2-3 are in.

## 6b. Capability or scaffolding
All elements are the capability (P-33). Part 1 is *Needed for the proof* and buildable now. Parts 2-3 are *Needed for the proof* and wait on FO-9b part 2. The Engage/add-contact mounts are *Not built* here (FO-4c). AG-2-68's lead-banner Link / Keep separate is *Not built* (no route; the list covers the pairs).

## 7. Questions for the founder (r2, the challenge's; recommendation first)
1. **May an "Add as new" pair still merge by itself later?** (B1: a couple sharing one email.) **Recommend no:** "Add as new" writes the pair Kept separate and the automatic merge skips Kept-separate pairs (AG-2-68 rule 16).
2. **Do similar-name-only pairs go on People to merge?** (AG-2-68 §13 "No fuzzy name matching" against P-574 (2).) **Recommend yes**, listed with their score; never merged by themselves (automatic needs an exact key, P-574 (2)).
3. **Where the list lives:** AG-2-68 rule 17 says "the Contacts screen", which does not exist. **Recommend Sales › People to merge.**
* The keys (M5) and the Merged-tab API (M6) are decided by the requirement and main's code: §8 records them for the tech lead.
* Noted conflict, not a question: AG-2-68 §13 "No fuzzy name matching" against P-574 (2)'s similar-name match. P-574 is the founder's newer decision and FO-9a built it; this concept follows P-574.

## 8. Challenge answers (r2) and what FO-9b part 1-2 must carry (lines for the FO-9b brief, not new screens)
* **B1** → founder question 1; until answered, part 2's automatic merge skips any pair written Kept separate by "Add as new".
* **M1, M2** → BR-5, BR-5b (part 1; the concept's own change). **M5** → BR-6. **M4** → BR-11.
* **M3** FO-9b part 1: merged-away records are left out of the check and the 409 match, and a picked one is followed to its survivor (AG-2-68 rule 12).
* **M6** FO-9b part 2: `GET duplicates/merges` from the merge records (who, when, `automatic`, `mergeRef`, undone or not).
* **M7** FO-9b part 2: preview and merge take `survivorId`; merge returns `mergeRef`; preview returns each side's `updatedAt` for the conflict answer.
* **M8** FO-9b part 2: pairs are written at arrival (every door and Add a lead's "Add as new"), with the full match (exact keys and similar name); the check route stays read-only.
* Board fixes: S1 name reason carries its percentage; S2's "strong" label removed; S3's same-program line is about open cases only.

## Definition of ready
Acceptance: `tests/check_fo9s_duplicates_browser.ts` (part 1 cases now; parts 2-3 with FO-9b part 2) and J-29, green twice. Row text: BACKLOG FO-9s. Decisions: P-574 (2), P-575 (4); founder questions 1-3 answered (part 1 needs none of them); §8's FO-9b lines accepted by the tech lead. Part order: part 1 now (screens or runtime lane), parts 2-3 after FO-9b part 2. Concept approved by the tech lead after `challenge.md`.
