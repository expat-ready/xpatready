# qa after-merge, Track A 5: night of 23-24 Nov 2026

Mode: after-merge (qa skill). Main **d9954de6e** (#3173, #3216 and #3180 merged 20:11Z). Isolated copies only (:4470, :4471, a fresh copy each run), never :4400. Live AI off, US$0, no live mail. The verdicts are qa's, each confirmed by a fresh Opus reader (P-339).

## Verdicts

| Row | Last part | Verdict | GitHub run | qa walk (main d9954de6e) |
|---|---|---|---|---|
| R1.92 | #3173 PF-4c part 2 | **Works** | item-proof 45256715945 on 4ff0fbf67, j_92 PASS | j_92 **24/24 twice**, exit 0 |
| R1.70 | #3180 CS-D7 | **Partial**: waits only on the QA-758 ruling | item-proof 45256754488 on d9954de6e, main's j_70 wrapper PASS | 29-step j_70 (#3218) **28/29 twice**, exit 1 (QA-758 step) |

Baseline before the merges: j_92 gave 19/20 on afe9727ee. The only FAIL was W6's warning, which is #3173's step.

## R1.92: Works
* **Done when corrected.** The row said "refused on the field". The team's requirement says otherwise: AG-1-34 (BACKLOG PF-4c, "a warning, never a refusal") and the tech lead's 22 Nov ruling on #3003. The row now reads "warned on the field, never refused". The requirement wins (AGENTS rule 2), and the reader confirmed this.
* **W1-W2 (profile):** the profile saves a valid IANA zone by screen and by API, with one audit line. A zone not on the list gets 422 on its field, and nothing is written.
* **W3-W5 (offices):** an office's zone is pre-filled from its province (Alberta gives America/Edmonton, BC gives America/Vancouver). Each office's hours show in its own zone, and the firm's first office keeps the firm's zone. A bad zone gets 422.
* **W6 (licence number):** the College's pattern is "R and 6 numbers", cited from college-ic.ca with page, quote and date. A number that does not match is saved and warned on the field, never refused, on both My account → Licence and the Owner's Licences panel. The field is not marked invalid, and axe is clean in the warning state. A corrected number saves with no false conflict, and the panel closes.
* **W7 (sizes and keyboard):** no WCAG violation at 400, 1024 and 1440 px, keyboard-only save works, and there are no page errors.
* **GitHub run caveat (reader):** item-proof ran on 4ff0fbf67, two merges before the head. Those two merges, #3216 (web address) and #3180 (case documents), touch no office, zone, licence or profile code (`git diff 4ff0fbf67 d9954de6e`). A walks run of j_92 on the head is asked of the tech lead; its run id replaces this one when it lands.
* **Limits:** only the College publishes a pattern, so law-society numbers are never warned. W4's Vancouver zone check is weak, but W3 checks the zone exactly. Deadlines and bookings in an office's zone were not walked. Evidence: 11 screenshots in `2026-11-24-after-merge-trackA5/R1.92/`. The run logs are not committed (`*.log` is gitignored); their last lines are: run 1 "24/24 passed", exit 0; run 2 "24/24 passed", exit 0.

## R1.70: Partial (every part merged)
* **What holds** in the 29-step walk:
  * The type's cited defaults go through the governed change: a case officer gets 403, an uncited value 400, and self-approval 403. The release publishes a new version.
  * The Document flags dialog (language, translation, notarisation, expiry) works. Provided needs its detail, and each changed flag writes one audit line.
  * The client gets 403.
  * The checklist shows the "Translation + translator's affidavit" line and an "Expired on …" warning, and blocks nothing. English takes the line away.
  * There is no WCAG violation at 400, 1024 and 1440 px.
  * The walk ends at R1.72's first step ("Convert to client").
* **The one failing step (both runs): QA-758.** A notarisation that is REQUIRED and not provided shows nothing on the checklist. The answer does carry `flags.notarisation` (`case-checklist.ts:174-175`), but warnings cover only expiry and age (`case-document-flags.ts:50`), and `web/src/runtime/checklist.tsx` has no notarisation. CS-D7's own Done when asked only for translation and expiry/age, so this is a gap in the row's wording, not a CS-D7 bug.
* **What flips it to Works:**
  * If the tech lead rules "the notarisation flag shows in the dialog only", qa retires the step, and the row is Works on 45256754488 plus a green j_70.
  * If the ruling is "the checklist warns", a small CS-D7 follow-up is needed first.
* **After #3218 merges,** item-proof for R1.70 runs the 29-step walk, which stays red on the QA-758 step until that ruling.
* **Limits:** not tested with the type's notarisation default set to REQUIRED (the fixture uses NOT_REQUIRED). How readiness treats notarisation was not checked. Evidence: 10 screenshots in `2026-11-24-after-merge-trackA5/R1.70/`. The run logs are not committed (`*.log` is gitignored); each run ends "28/29 passed", exit 1, and the only FAIL line in both is "FAIL  QA-758 (Ambiguity: CS-D7 reads only translation and expiry) W4: notarisation Required and not provided shows on the passport's checklist line (a warning or a line naming notarisation); nothing is blocked".

## #3218
#3180 merged first, so `j_70.ts` conflicted add/add again. qa merged main into #3218 at **7298f7eb7**, keeping #3218's 29-step walk. A fresh reviewer approved that merge (comment on #3218).

## Findings
* **QA-758** stays open: an Ambiguity, Minor, holding R1.70. Its row reaches main with #3218.
* **New, minor, not filed (reader):**
  * j_70's header says 375 px, but the walk checks 400 px.
  * j_92 ends at its size and error checks and does not hand on to a next capability's first step.
  * Both are left for the journeys' owners.

## Still waiting at the time of writing
* R1.86: #3185, plus PF-21rs (not built) and AUD-3.
* R1.90: #2935 and #3040.
* R1.10: #2933.
* R1.104: #3184.
* R1.46: #3179, queued.
* R1.85 stays Partial until PF-21d and PF-21rs merge.

## Questions for the tech lead
1. **QA-758:** should notarisation REQUIRED and not provided show on the checklist? This one ruling settles R1.70. Recommendation: dialog only for Release 1 (CS-D7's own Done when), and qa retires the step.
2. **Please dispatch** `gh workflow run walks.yml --ref main -f journeys="j_92"` on main's head. It is the P-339 run on the head for R1.92, which a cloud lane cannot start (P-439).
