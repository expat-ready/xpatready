# FO-9s part 1 break report: the duplicate warning on Add a lead (R1.29)

Written 22 Nov 2026 by a breaker that did not build or review this screen. PR #2900, branch `claude/screens-fo9s-warn`. Spec: concept r3 BR-1 to BR-5b (`origin/claude/runtime-fo9s-concept`). **Asked head 4eda1fc4e. Mid-run the builder pushed the round-1 review fixes (20527b379), and the shared `web/dist` was rebuilt (stamp f5ba7fab… matches 20527b379).** Every finding below was re-run on 20527b379 and still reproduces. F1 to F3 also reproduced on 4eda1fc4e. Isolated copy `brk_dup` on :4581 (`PLATFORM_IDENTITY=local`), seeded by `check_fo9s_duplicates_browser.ts` (20/20, exit 0): Sample firm, actors user-O Case Officer and user-T Case Manager, "everyone sees all" off. My probes were Playwright scripts plus direct API calls, kept in scratch and not committed. Screenshots are in scratch too. Evidence below is the exact steps, the observed values and file:line. US$0.

## Verdict: no Blocker. Two Majors (a typed detail lost silently; same-name rows that cannot be told apart). Four Minors.

## Findings
**F1 Major: the 409 box's "Use existing person" silently drops a typed phone or email the person does not have** (BR-5 and BR-5b).
* Steps (O): seed Zara Quinn with an email and no phone. Open Add a lead. Type First name "Zara…", Zara's email, Phone "416 555 0177", Source, note "A1 …". The hint shows; make no choice and press Save. The 409 box replaces the hint. Press **Use existing person**.
* Expected: BR-5 says that with no choice, the 409 box *replaces* the hint, so it is now the one place to choose. BR-5b's headline is "never dropped". So the phone should be offered ("Also keep in the lead's first note: 416 555 0177"), or at least the adder should be told it is not kept.
* Actual: 409 then 201. The lead is on Zara's person, which still has no phone. The first note is "A1 …" only. Nothing on screen says the phone was discarded.
* Code: `add-lead-panel.tsx:134` calls `send({ personId })` with no choice. `noteOf` (`:84`) adds the line only when `choice?.kind === "person"`.
* The review's m5 parked this for the Lead as "FO-4al's path". I rank it Major: it is the commonest path (the adder ignores the hint and saves), and it is exactly the loss BR-5b was written to stop.
* Fix: when the 409's `personId` is one of the check's matches, reuse that match's reasons through `unmatchedDetails`. Otherwise offer every typed email and phone. Show the same tick box inside the 409 box.

**F2 Major: two people with the same name give identical rows, so the adder cannot tell which one to pick** (BR-3, BR-5; wrong-person risk).
* Steps (O): two Sample people both named "Wren… Hale", one with an email and one with a phone. In the panel, type "Wren…", "Hale" and a new email, then leave the field.
* Actual: "2 people on file look like this person." and then two rows, each "Wren… Hale · Similar name (100%) · Use this person". Both buttons have the same accessible name, "Use this person: Wren… Hale".
* The same happens with an exact key: after BR-5's own "Add as new" on an email match (the builder's D5, founder question 1's couple sharing an email), the next adder sees two rows of "Omar… Haddad · Same email · Similar name (100%)".
* Code: `duplicate-hint.tsx:73-75` shows only the name and the reasons (build notes: "FO-9a's check returns the name only").
* Expected: the adder can tell the rows apart before "Use this person" puts the lead on one of them.
* Fix (for the Lead, as it touches FO-9a's answer): give each named match one detail the adder may already see, such as the newest lead number (the 409 already sends `lead`) or the masked email and phone. Show it under the name and add it to the aria-label.

**F3 Minor: a pick whose record the adder can no longer open leaves the panel stuck.**
* Steps: O picks Xavi Ruiz. In another session the lead goes to the Case Manager (simulated with `update fo_lead set owner_staff_id`). O presses "Add lead to Xavi… Ruiz".
* Actual: 404, and the banner reads "No such person in your firm." The box still says "Adding to Xavi… Ruiz's record." A second Save gives 404 again.
* Expected: the pick is cleared, the check runs again, and the message explains that the record can no longer be opened.
* Code: `add-lead-panel.tsx:79` turns any 404 into `errors.form` and keeps `choice`.
* Fix: on 404 with a `personId`, call `choose(null)` and `dup.request(checkBody(f))`, and show "You can no longer open that record. Choose again."

**F4 Minor: an "Add as new" made earlier skips an exact match that appears later.**
* Steps: O types "Wren… Hale" and the new email `wren.twin…`. The hint names Wren Hale by similar name; O picks Add as new. Before O saves, a second session adds "Wendy Twin" with that same email (201). O saves.
* Actual: 201. Two people now share the email, and O never saw the exact match.
* Code: `add-lead-panel.tsx:88` sends `confirmedNew`, which also skips the server's exact-key 409.
* Fix: send `confirmedNew` only while the check's answer is fresh (for example, re-check just before Save), or let the server ignore `confirmedNew` when an exact match was created after the check.

**F5 Minor: the check accepts a value that Save then refuses, and fixing it drops the pick.**
* Steps: type "Zoë…" "Nunez" and Phone "call after 5 ​☎" (with a zero-width space). The hint names Zoë… Ñúñez (100%). Pick them; the phone is offered. Save.
* Actual: 422 under Phone, "One line, no control characters.", for a character the adder cannot see. Editing Phone is a key edit, so the pick and the hint clear, and the adder has to wait for the check and pick again.
* Fix: strip zero-width characters from the key fields on input. Or, while a person is picked, keep the pick when a refused key is edited, as long as the matched keys are unchanged.

**F6 Minor: at 200 % zoom (720x450) a long picked name squeezes out the form** (left over from review M1).
* Steps: pick a 100+100-character name at 360x225 CSS px with deviceScaleFactor 2.
* Actual: the footer button now wraps, so nothing overflows sideways. But it is 156 px tall in a 225 px viewport: its bottom is clipped and the fields area is gone.
* With a realistic 47-character name ("María Fernanda de los Ángeles Rodríguez-Hernández"), the button is 60 px tall and the work area is 43 px.
* Fix: show the name in the label clamped to one line (`line-clamp-1` plus a `title`), since the choice box already shows it in full.

## What held (re-run on 20527b379 unless marked)
* **BR-1:** Save stays enabled with the hint shown. The seed check passed 20/20.
* **BR-2:**
  * Typing all four keys with Tab at 15 ms per key sends exactly one check, and typing into Source sends none (C1).
  * A 3 s check for the old phone, then an edit and a blur: the old answer is dropped and the queued check runs. The hint never names the old match (A3, 4eda1fc4e).
  * An aborted check is retried when the field is left again (C5).
* **Save while a check is in flight:** with a 3 s route delay, Save on an exact email gives the 409 box only. When the late answer arrives, the counts are still hint 0, choice 0, 409 box 1 (A2, 4eda1fc4e; the logic is unchanged in 20527b379). Editing a key clears the 409 box.
* **Editing a key after a pick:** the pick and the hint clear, and Save reads "Save lead" again (C4).
* **Double click and Escape:** a double click on "Add lead to …" sends one POST and makes one lead. Escape asks "Discard this lead? …"; dismissing it keeps the panel and the pick.
* **BR-4, hidden records:**
  * The raw check answer is `{matches: [], hidden: 1, hiddenLine}`, with no id, name or count.
  * The DOM holds neither the hidden person's name nor their id.
  * Median timing over 15 calls: 9 ms for a hidden match, 8 ms for no match.
  * `personId` of a hidden person gets a 404 identical to a random uuid's.
  * The 409 box shows the nameless line only.
* **BR-3:** 12 people on one phone give 10 rows; the title reads "10 people…", as FO-9a gives no total. "Same phone" matches 416-555-0166 against +1 416 555 0166. NFD and accented names score 100 %. Emoji-only names return no match and no error. A 200-character name returns 200.
* **BR-5b guard:** a 4,992-character note plus a kept email blocks Save with the guard sentence and sends nothing. Unticking then saves (201).
* **Keyboard:**
  * Tab from Phone reaches "Use this person"; Enter moves focus to Change, and Change moves it to the first match (including the 3rd of 10 rows).
  * At 200 % zoom, Tab runs First note → Cancel → Add lead to ….
* **Layout:** no sideways scroll at 375 px, 1024 px or 200 % zoom with 200-character names. No page errors in any run.

## Not checked
* A real screen reader.
* Reload or Back in the middle of an Add: the panel keeps no draft, which is FO-4's behaviour and not this row's.
* The Engage and add-contact mounts and parts 2-3: not built (concept §6b).

## Re-check (round 2) at 60af218c7
I pulled 60af218c7 and started a new `brk_dup` copy on :4581. `web/dist`'s stamp (71643108…) matched the source. The seed check passed 32/32. The copy is stopped.

**Verdict: no Blocker and no Major. F1, F2, F3 and F6 are fixed. F4 and F5 were not in this round and stay open as Minors. Two new Minors.**

* **F1, fixed.**
  * Hint ran and matched the email (R1b): the 409 box offers only the phone, "With Use existing person, also keep in the lead's first note: 416 555 0178". With it ticked, the note gets the line.
  * Unticking reads "Not saved: 416 555 0178", and the note is only what was typed.
  * Hint never ran, because Save was pressed with Enter from Phone (R1a): it offers both details, and the note gets "Also gave: zara…@example.org · 416 555 0177". See N1.
  * A 4,975-character note sends nothing and shows the guard; unticking clears it, and then Save gives 201.
  * A late check answer arriving after the 409 box shrinks the offer from both details to the phone only. It is correct, but it changes while the adder reads it.
* **F2, fixed.** The two Wren Hale rows now read "· L-00015" and "· L-00016", and the aria-labels add the lead number.
  * Leak probe: Pia's older lead belongs to O and her newer lead was moved to T. O sees L-00017 (O's own) and T sees L-00018.
  * A hidden match still returns no lead and no id.
  * The number is chosen with the same `sees()` rule as the 409 (`duplicates/service.ts:61-64`). No leak found.
* **F3, fixed.** After a pick, the lead was moved to T and O pressed Save. The result was 404, then "Xavi… Ruiz can no longer be opened. Choose again, or add as new." The pick was dropped and one new check ran, which showed the nameless hidden line. Saving again gave the hidden 409 box. See N2 for where focus goes.
* **F4, not fixed** (Minor, unchanged): an "Add as new" made earlier still sends `confirmedNew` past an exact match added later.
* **F5, not fixed** (Minor, unchanged): a zero-width character in Phone still passes the check and is refused on Save.
* **F6, fixed.** At 200 % zoom (360x225 CSS px, deviceScaleFactor 2), a 57-character name gives a 44 px button and a 59 px fields area. A 200-character name gives a 60 px button and a 43 px fields area. The label is cut at 40 characters with "…" and the full name in `title`. Nothing is clipped or scrolls sideways.

**New**
* **N1 Minor: when the hint never ran, the 409 offer also includes the email that matched exactly.**
  * The first note then keeps the person's own email as "Also gave: zara…@example.org · …". This is noise, not a loss.
  * Code: `add-lead-panel.tsx:66`, `extraFor` with empty reasons.
  * Fix: leave out a typed value equal to the key the 409 matched on. The 409 could return which key matched, or the screen could leave out the email when the 409 came from an email-only match.
* **N2 Minor: two errors leave keyboard focus away from the message.**
  * The note guard on the 409 path: the textarea gets `aria-invalid=true`, but focus stays on the 409 box (`DIV role=status`). On the hint path, focus goes to the textarea as it should.
  * After F3's 404, focus falls to the dialog container, and the "can no longer be opened" banner is only seen if the adder looks.
  * Fix: on the 409 path, focus `[aria-invalid=true]` after the box's own focus effect. After the 404, focus the banner (`tabIndex=-1`) or the first hint button.
