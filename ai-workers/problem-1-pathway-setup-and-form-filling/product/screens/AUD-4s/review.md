# AUD-4s part 1 — review of the Activity log concept (records only)

Reviewer: a fresh Opus context that neither drafted nor challenged this concept. 16 Nov 2026. PR #2027, branch `claude/screens-aud4s-concept`, head `cd3ea6709b14f5672e4b2c90a640d80bb23bfe5e`. Read: `concept-draft.md`, `design/draft-1.html`, both screenshots, `challenge.md`, briefs `AUD-4s.md`, `AUD-4.md`, `AUD-1c.md`, Build Lead C's `AUD-4s-1.md` (from `origin/claude/build-lead-c-647b40`), `EXPERIENCE.md`, `design/TEAM-PATTERNS.md`, `QUALITY.md`, P-392 and P-407, and the cited requirement lines in `domain/requirements-2026-11-02/`. There is no running app and no code, so the parts of `screen-review` that need a running screen are N/A (listed at the end).

Verdict: Block

Two Majors, both small edits to records: one challenge fix (M1) is in the draft but missing from the board, and the acceptance walk cannot pass as written. Everything else holds. Once both are fixed, a re-review of the new commit should take minutes.

## Brief's Done when (Build Lead C, `AUD-4s-1.md:11`)
| Item | State | Evidence |
|---|---|---|
| `challenge.md` beside the draft, every Blocker and Major fixed | **Partly** | 0 Blockers. M2–M7 are applied in both the draft and the board. M1 is applied in the draft only (Major 1 below). |
| Best in class: at least 3 products, what is taken from each, marked honestly | Met | `concept-draft.md:39-52`: four products. GitHub is quoted verbatim with a date. Clio, 1Password and Atlassian are marked **Unverified** with the reason (proxy 403), to be re-read before part 2's label (PR body). Nothing the page copies depends on an Unverified fact: the grantable key, the 7-day default and the export cap all come from AG-16-26 and AUD-4. |
| Acceptance walk replayable for `check_aud4s_activity_log_browser.ts` | **Not met** | `concept-draft.md:71-78` (Major 2). |
| `brief-check.sh` passes on the PR body | Met | I ran it on the PR #2027 body from the REST API: exit 0. |
| `concept.md` with Build Lead C's approval line | Not yet (expected) | That is the Lead's step after this review. `challenge.md:60-64` (Lead response, Agreement) is empty, as the skill expects at this point. |

## Challenge items: applied, or only claimed? (draft · board)
* **M1** Person source and people who left: draft yes (BR-14 `:32`, the `actors` ask `:68`). **Board no:** see Major 1.
* **M2** firm switch in the same tab: BR-13 `:31`, DW1b `:79` · board `:187`. Applied.
* **M3** every filter read back: BR-12 `:30`, DW6 `:79` · board 3 chips and sentence `:142-143`, confirm repeats the sentence `:158`. Applied (Minor 2).
* **M4** walk without AUD-3b: BR-4 `:22`, step 3 `:74` · board 3 note `:143`. Applied.
* **M5** integrity copy: `:60`, marked "Unconfirmed: no counsel" · board `:166`. Applied.
* **M6** overdue in orange: BR-7 `:25`, DW4b `:79` · board `:169-170`. Applied (Minor 3).
* **M7** keyboard: When cell as the disclosure `:35` · board `:114-118`. Focus after Show more `:35,78` · board `:188`. `aria-controls` points to a real element (`:87` → `:107`). Applied.
* **m1** the board's confirm now reads "Export these lines as CSV?" with no count (`draft-1.html:156`); disabled Export, fetch and save, and CSV zone at `:29,35`. **m2** `:70`, `:107`. **m3** Q1 `:85`. **m4** no-access `:184`, board 3 newest first, PF-6's signed-in-elsewhere `:187`. **m5** `:35`. All applied.

## Findings
### Blocker
None.

### Major
1. **M1 is not on the board, though the draft says "Board … updated to match" (`concept-draft.md:94`).** The Person list shows three active people and no one who has left (`draft-1.html:94`). No board shows "Show only this person's changes" (Who cells `draft-1.html:114-118`; open line `:130-136`). Until AUD-4 adds `actors`, BR-14 (`concept-draft.md:32`, `:68`) makes that line action the only way to reach a departed person's lines. So the Admin's story (AG-16 `:468`, "when a rep leaves … what they changed") cannot be walked on the board, and part 2's builder has no drawing of the control. **Fix:** in board 1 add a departed person to Person (for example "Case Officer (Sample) — left"). In board 2's open line add the "Show only this person's changes" control in the Who cell.
2. **The acceptance walk fails if replayed literally (`concept-draft.md:74-78`).**
   * Step 3 turns "ExpatReady staff access" on, and no later step turns it off. Step 5 then expects the top line to be "Exported the activity log", but that is the Owner's (firm staff) line, which the shortcut hides (BR-4 `:22`). The export would also hold staff lines only.
   * Step 4's 600-character line must also pass the shortcut filter, and the walk does not say whose line it is.
   * Step 5's "again, Enter on 'Export CSV' → one file" is unclear, because the page button and the confirm's button have the same name (`draft-1.html:88,159`).
   * Step 6 leaves From invalid before step 7.
   * Step 7 says "over 50 lines", but "Showing 150 lines" needs at least 150 lines in the 30 days.

   **Fix:**
   * After step 3, add "Space again; aria-pressed false; the sentence no longer names the shortcut".
   * Name the 600-character line's author.
   * Write step 5 as "Enter on the page's Export CSV, then Enter on the confirm's Export CSV".
   * Seed at least 151 lines for step 7, and set a valid From/To before it.

### Minor
1. Board 3's sentence leaves out the time zone (`draft-1.html:143`), against BR-11 (`concept-draft.md:29`) and board 1 (`:106`).
2. Board 3 has an Advanced filter set (Record, `draft-1.html:142`) but does not draw Advanced, which BR-12 says opens by itself (`concept-draft.md:30`). Draw it open, or note "Advanced open (cropped)".
3. "Overdue" uses the `unknown` style's "–" mark (`draft-1.html:39-40,169`), the same shape as "Not checked yet" (`:172`). The text differs, so this is not colour alone, but EXPERIENCE §1 asks status "by shape and text". Give overdue its own mark.
4. The board shows facts that the copy and the contract do not have. "Last good check: 16 Nov at 10:00." (`draft-1.html:167`) needs a field that the integrity contract lacks (`concept-draft.md:70`: `state, lastCheckedAt, range`). "Checks run every 30 minutes; the last one is late. The lines are still shown." (`:170`) is not in §5 (`concept-draft.md:60`). Add both to §5 (and the field to the AUD-1c ask), or drop them.
5. The test list disagrees between sections. The definition of ready names W1 and DW1-DW5 (`concept-draft.md:91`). §6 adds DW1b, DW3b, DW4b and DW6 (`:79`). The PR body says DW1-DW6. Pick one list.
6. AG-13-43 is paraphrased too narrowly. Q1 (`concept-draft.md:85`) gives full personal data "to holders of `agent/audit:read`". The text (`AG-13-…v1.19…md:482`) says "to anyone holding the existing audit-log **and export** permissions". Quote it exactly so the Lead sees that AUD-4's export route checks `agent/audit:read` alone. Not a change to this concept.
7. BR-4 (`concept-draft.md:22`) clears only Done by when the shortcut is pressed. Person set to a firm staff member plus the shortcut still gives an empty list. The sentence names both, so the filter is not silent. State whether Person is cleared too.
8. §4b says "before the label" (`concept-draft.md:40`). Write "before part 2's label", as the PR body does. Clio's "Beats" claim (`:44`) rests on an Unverified summary, so keep it out of the PR body and the demo (`challenge.md:42`).

## Other questions the caller asked
* **Sources:** every requirement quote I checked matches. AG-16 `:467-468`, `:632`, `:635`, `:637`; SA-11-14 (including "no legal floors"); SA-11-34; SA-2-29; SA-11-30; AG-13-43; and SA-11-6 at Doc 2 `:4993`. The conflict between SA-11-6 and AG-13-43 goes to the founder as Q1 (AGENTS rule 2).
* **Values:** no immigration value appears. The limits are labelled Sample: one year (BR-3), 100,000 (BR-6, board `:185`), 60 minutes (BR-7). The 30-minute check interval comes from AUD-1c.
* **Legal duty:** none is promised. "kept for 7 years for security" is SA-11-14's own product wording, and SA-11-14 says "no legal floors". The integrity copy promises no investigation and is marked Unconfirmed: no counsel. No "compliant", "tamper-proof" or "legally required" appears.
* **Scope:** nothing is out of scope. "Show only this person's changes", the overdue state and the extra DW cases all answer the challenge or EXPERIENCE [M] rules. The asks of AUD-4 (`actors`) and AUD-1c (`NOT_CHECKED`, range times) are recorded as asks, not built here.
* **Consistency:** the rules agree across draft, board and copy, except Major 1 and Minors 1, 2, 4 and 5.

## D1–D20 (concept and board only, out of 5)
* D1 5: every rule is cited.
* D2 4: BR-13 covers the client side, but the walk has a data-state gap.
* D3 5: no new route or table.
* D4 N/A.
* D5 4: double export and session change are covered.
* D6 5: integrity, overdue state and the keep sentence.
* D7 N/A: no AI.
* D8 5: trail.
* D9 4: the Admin story is not drawn (Major 1).
* D10 5: plain copy, with codes only under Advanced.
* D11 5: every state is drawn.
* D12 5: team tokens.
* D13 4: keyboard plan is sound; overdue shape (Minor 3).
* D14 4: departures are recorded.
* D15 N/A.
* D16 4: a pass and a fail per case, but the walk is not replayable.
* D17 and D20: simulated only.
* D18 5: raw under Advanced, sentence read-back.
* D19 4: SA-2-29 is met only in part until AUD-3b (recorded).

## BIC-01–20
N/A. This is a firm-settings screen, outside the P-407 §6 scope for case screens (`concept-draft.md:55`). I agree.

## Journey score (journey-test, reviewer role)
**8.8 / 10 on the paper walk.** Two of the ten criteria (correct data, speed) were N/A; the 7 points from the other eight are scaled to 10 (7 / 8). That is a pass with no criterion at 0. The full report is in `journey-test-reviewer-2026-11-16.md`.

## What I could not check
* No running screen, so I did no browser walk, axe check, timings, data check underneath or break-it pass.
* I did not run the graph tool: no code exists for it to map.
* GitHub's quotes were not re-read: vendor and docs hosts are unreachable from this copy, as instructed.
* The team-code names (`audit-read.controller.ts:90,100`, `FilterLayout` and the others) stay Unverified, as the challenge says: there is no `code/` here.
* D17 and D20 stay with the founder.

## Round 2 (diff `cd3ea6709..61a6399340`, P-277)
I read only the new commit's changes to `concept-draft.md`, `design/draft-1.html` and the two screenshots. My own committed files were ignored.

**Round-1 Majors**
* **Major 1: fixed.** Person now lists "Case Officer B (Sample) — left the firm" (`draft-1.html:96`). Board 2's open line has "Show only this person's changes" next to Done by (`:134`). BR-14 now says the leaver is marked "left the firm" (`concept-draft.md:32`). The 1024 screenshot shows both.
* **Major 2: fixed.** The walk now has a seed of 151 lines with named authors (`concept-draft.md:72`).
  * Step 3 turns the shortcut off again.
  * Step 6 names the page's and the confirm's "Export CSV" buttons, and the export line is now visible.
  * Step 7 resets From.
  * Step 8 has 152 lines in range (the seed plus the export), so "Showing 150 lines" holds.
  * Two wording slips remain (Minors 2 and 3 below). Neither stops a builder from replaying the walk.

**Round-1 Minors:** 1 to 8 are applied.
* The board 3 sentence names the time zone, and Advanced is drawn open with the Record field (`draft-1.html:144-145`).
* Overdue has its own class and a ⏱ mark (`:41-42,170`).
* "Last good check" is removed.
* The definition of ready lists every case (`:91`).
* Q1 now uses AG-13-43's own words (`:85`).
* BR-4 covers Person plus the shortcut (`:22`).
* §4b now says "part 2's label" (`:40`).

**New in this diff**
* Blocker: none.
* Major: none.
* Minor 1: the edit to BR-7 garbled the sentence (`concept-draft.md:25`). The bold part now reads "… overdue … + 'Checks run …' · not checked: 'The first check runs …' when over 60 minutes have passed". As written, the 60-minute trigger attaches to the not-checked text. Move "when over 60 minutes have passed" back after the overdue label, and drop the not-checked text from BR-7.
* Minor 2: §5 now has the not-checked help sentence twice (`concept-draft.md:60`). Remove the "· not checked: …" copy.
* Minor 3: walk step 5 contradicts itself (`concept-draft.md:77`). "On that open line" refers to the Owner's line from step 4, but the button there filters the Owner, not the departed Case Officer. Its "or pick them in Person" also gives the test two paths. The seed does not place the Case Officer's 5 lines on the first page of 50 either. Use one path: "pick 'Case Officer B (Sample) — left the firm' in Person → the five lines".
* Minor 4: step 4 (`:76`) assumes the Owner's 600-character line is on the first page. Put that line first in the seed's order, for example "the newest line".
* Minor 5: BR-4's new empty-state words "No ExpatReady staff changes by <person>" (`:22`) are not in §5's copy. Add them there.

**Unchanged and still sound:** sources, Sample labels, no legal-duty wording, no added scope. The longer Person option makes the Shortcut wrap at 1024 px, still with no sideways scroll.

**Journey score:** 9.4 / 10 on the paper walk, 7½ of 8 scorable. "Task completed" is now 1, because the Admin's leaver journey can be walked on the board. "Accessibility" stays ½ until Minor 3 is fixed.

Verdict: Approve 61a6399340c66039c98977f6a22a762d0e9c018f
