# R1.80 / C7.2: gate A walk 2, doing the step on screens (qa 8, 19 Nov 2026, 19:0x–19:1x IST)

qa 8 (case side; took over from qa 6, `handover.md`). It covers the two blocks fresh reader 2 named (`r180-reader-2.md`).

## Block 1: P-339 on main's head (4a4b6bc00)
Main's head is **4a4b6bc00**; at 19:1x IST nothing newer had merged. Both runs ran on GitHub's runners, checked out at 4a4b6bc00c51, with `GATE_B_DATA: checkpoint`, live AI off, US$0. Each job ended with "Gate B: passed".

| Capability | Pack run **44532804494** (dispatched by qa 6 on the Lead's ask) | Independent re-run **44532809449** |
|---|---|---|
| C7.1 | job 135590376481: "C7.1-application-type.test.ts on the checkpoint: exit 0, 12/12 passed" | job 135590388251: 12/12 |
| C7.2 | job 135590376005: "C7.2.test.ts on the checkpoint: exit 0, 11/11 passed" | job 135590388101: 11/11 |
| C7.8 | job 135590376230: "C7.8.test.ts on the checkpoint: exit 0, 20/20 passed" | job 135590388291: 20/20 |

The runs include #2214 (AUD-1m part 1, the `Audit.log` rewrite that reader 2 found on C7.2's path), so its P-339 objection is answered. The walk below runs the same app code: `git diff 4a4b6bc00 -- prototype/` on this branch is empty.

## Block 2: gate A by screens, doing C7.2's step
**Copy:** isolated `qa8_r180` on :4471 (`xr_studio_qa8_r180`), this cloud session's own clone, app code equal to main 4a4b6bc00. :4400 was not touched. Playwright Chromium at **1024 × 768**. Personas came from the app's own "Acting as" switch (simulated). No priced button was pressed; US$0.
**Data (P-322): the configured checkpoint**, loaded by screens as Configuration author: Demo › Load the configured checkpoint (151.4 s; "12 rows done, 0 partly, 0 waiting"). This is the data C7.2's pack counts on, so no finished-story loader was used and nothing was uploaded or filed by code.
**Replay:** `r180-walk-2/walk.cjs` (`node walk.cjs` against a copy on :4471 after the checkpoint loads).

Every step below is the Case officer's, on Cases › C-2026-00001 SAMPLE-VV-FAMILY-1, IMM 5257 for Client A (Sample).

| Step | Done on screen | Seen | Result |
|---|---|---|---|
| 0 | Open the case; Ready to file | "**1 block** and 16 open warnings stand before Ready to file." The block reads: "IMM 5257 for Client A (Sample): no validated copy read back for today's facts. Validate it in Adobe and upload the validated copy; IRCC returns it unprocessed otherwise." The line itself reads "Validated in Adobe on the Mac and read back equal (Sample): the validated file is kept on the Mac, not in these working files". | C7.2's starting state (text read from Client A's own panel by `walk.cjs`, "S1 ready"; Partner's panel reads 1 block and **17**). Screenshot `01` shows only Partner's lines, **not** Client A's panel (reader 3 caught this); the on-screen proof of Client A's block is step 6 |
| 0b | **Download** on the line's copy | Refused in words: "The copy could not be downloaded: … the validated file is kept on the Mac … It is not downloaded here, and the copy as the product made it (not validated) is not handed over in its place." (409; QA-285 by design). **Generate a new copy** (13:40) gave the same result: the new copy has the same facts, so it too reads as validated on the Mac and is not handed over. | as designed; note 2 |
| 1 | Tab "Client A (Sample)" › **Add** Fax number including country code › 91 / 1100000002 › Save | The line now reads "**Not validated yet**", and the copy reads "**Out of date** · Facts changed since this copy was made; generate a new copy to file it. Added, changed or removed: Fax number including country code" (P-171 (1)). | PASS · `02` |
| 2 | **Generate a new copy** | Copy of 19 Nov, 13:43 · 70 form fields written · read back and checked; Download works (IMM5257-copy-fa2938cf.pdf, 1.45 MB) | PASS |
| 3 | **Read back the validated copy** › choose the downloaded file **unchanged** (not validated) | Toast: "**This is the copy the product made, unchanged: it was not validated. Open it in Adobe, press Validate, save it and send the saved file. Nothing was recorded.**" The line stays "Not validated yet". After a reload, Ready to file still has its 1 block. No audit line was written. | PASS (refused, with the Validate words) · `03` |
| 4 | **Read back the validated copy** › choose that copy after Validate | Toast: "IMM 5257: validated copy read back". The line now reads "**Validated copy read back**" and its button "Read back again". The chip's title reads "Read back 70 of 70 values; **barcodes 5 of 5 read**". | PASS · `04` |
| 5 | Reload; **Ready to file** (C7.6's first step, the next capability) | Visitor visa: Client A (Sample) now reads "**16 open warnings** stand before Ready to file." with no "Blocks: fix it" and no validated-copy line. Each warning has "Pass with a reason…", and **Send for review** is shown and enabled. The other three people's filings each still have their own "no validated copy read back" block (their copies' validated files are on the Mac). | PASS · `06` (Client A's own panel: "16 open warnings stand before Ready to file.", no block; taken 19:2x IST on the same copy after reader 3's note) |
| 6 | (after reader 3) Tab "Client A (Sample)" › **Add** Alternate telephone number › 91 / 9800000009 › Save; reload | Line: "**Out of date: validate again**" (P-171 (1)). Client A's own panel: "**1 block and 17 open warnings** stand before Ready to file." · "**Blocks: fix it** · IMM 5257 for Client A (Sample): no validated copy read back for today's facts…", and "IMM 5257 for Client A (Sample) is out of date: \"Alternate telephone number including country code\" changed … Make a new copy." | PASS: the block is on Client A's panel on screen, and it comes back when a fact changes after Validate · `07` |

**walk.cjs output (the walk's own log, 19:1x IST):** `S1 ready: 1 block and 16 open warnings stand before Ready to file.` · `S3 data-validated: none` · `S3 ready after reload: 1 block and 16 open warnings` · `S4 data-validated: current` · `S4 pill title: Read back 70 of 70 values; barcodes 5 of 5 read`. Then `S5`, Client A's panel: `16 open warnings stand before Ready to file.` · `errors []`. Client A is the first filing on the panel, and the first "N block" match is read from there. The other filings have 17, 9 and 16 warnings, each with "1 block".

**Underneath (`audit_event`, this copy):**
* 13:43:16 "Case officer answered person.fax_number on case 897e089c (Agent view)".
* 13:43:23 the copy was queued, then "Copy fa2938cf of IMM 5257 … generated: 70 form fields written, read back 70/70, intact".
* 13:43:32 `validated` "Case officer read back a validated copy of IMM 5257 (copy fa2938cf) on case 897e089c: 70/70 values equal; barcodes 5 of 5 read, matching".
* Every line carries `case_id` (AUD-1m). No page errors.

**Gate A verdict for C7.2: PASS** on the checkpoint, by screens, from a state that is not yet filed, through to the next capability's first step (Ready to file, C7.6; precedent: C7.8's gate A).

## What the reader must weigh (said plainly)
1. **The validated file in step 4 is SYNTHETIC.** It was made by `tools/simulate_validate.py … Yes barcodes`, the same tool BK-19's browser check uses: the form's Validate flag and date, plus the barcodes written as a saved form keeps them. Adobe's Validate was not pressed here, for two reasons:
   * Acrobat and the Mac's validated PDFs are not in a cloud session.
   * No computer is attached to this session (`list_computer_folders`: none).

   What step 4 proves is the product's own door, by screens: it reads the barcodes and compares them with the facts (5 of 5), it says so on the line, and it lifts the block on Ready to file. Adobe's own Validate on a Studio-generated IMM 5257 is proven separately, by C7.2 Part 2's evidence (`result.json`: Validate passed on the first press, 5/5 barcodes, 186/186 positions, 75/75 read back, upload door 201 and current; closed QA-165 on #2235). Readers 1 and 2 both accepted that evidence. The product does not care where the file came from: it decodes the barcodes it receives, and step 3 shows that a file without Validate is refused. qa's judgement: the two together prove C7.2's checklist words. Confidence: high that the door works; the Adobe half rests on Part 2's evidence, not on this walk.
2. **On a copy without the Mac's files, the checkpoint's four IMM 5257 copies cannot be downloaded, even after "Generate a new copy" (step 0b).** This is QA-285's rule ("nothing is faked"), and its words say why. A real officer reaches a downloadable copy only after a fact changes. The walk did exactly that, which is also P-171 (1)'s rule. It is not a defect in R1.80. It is worth one line for the demo: on GitHub or a fresh machine, the checkpoint's Sample case shows this.
3. **The words for "not validated" (step 3) appear only in a toast, which goes away.** The line keeps "Not validated yet" and gives no reason on the line. Together with the barcode count shown only in the chip's title (reader 2's follow-up 3), this is logged as **QA-516 (UX · Minor)**. It is not a hold: the next step is still obvious ("Read back the validated copy"), and Ready to file names the block in words.
4. **The one-form spot-check clause.** Reader 2 said this clause was "P-726, not in this folder". Checked against DECISIONS.md: **P-726 is the two-track journeys decision**. The founder's one-form Adobe spot-check is **P-533**, and **P-542 (2)** says it "stays … but runs after the fact, any time within 48 h, and never holds" the proof. So the row cites P-533 and P-542 (2), not P-726. It is not a hold on Works.

## Not covered by this walk
Adobe's own Validate (see 1) · 400 and 1440 px, keyboard-only and axe on these states (covered underneath by `tests/check_bk19_validate_browser.ts` at 1440, 1024 and 400 px, axe clean, in the suites) · Paper channel (C11.6) was not needed: on the checkpoint the PDF-upload IMM 5257 already blocks without its validated copy.
