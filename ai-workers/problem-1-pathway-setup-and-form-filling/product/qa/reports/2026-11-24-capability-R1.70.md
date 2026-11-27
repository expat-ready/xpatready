# qa capability R1.70: expiry, translation and notarisation flags (24 Nov)

**Run:** `/qa capability R1.70`, cloud qa copy, Opus 5.5 medium, live AI off, US$0. Tested on main f0bc60179, after QA-758's fix (#3327) merged. Isolated copy :4474 only; :4400 not touched.

**Verdict: Works** (was Partial). P-339 is met: the pack is green on main's head on GitHub's runners, and a fresh Opus reader agrees.

## Evidence
| What | Where | Result |
|---|---|---|
| item-proof, started by hand from #3180's `Completes: R1.70` | run 45316975523, job 138186510813, on f0bc60179 | PASS: j_70 29/29, "1 of 1 planned run(s) ran and passed" |
| walks.yml, j_70 | run 45316906595, job 138186116711, on f0bc60179 | 29 PASS, 0 FAIL, exit 0, with video and traces |
| `check_csd5_flags_browser.ts` (the screen suite) | local, fresh isolated copy :4474, on f0bc60179 | 40/40, including the 5 QA-758 lines |
| Fresh Opus reader (read only, P-339) | this session | Works, high confidence |

## Done when, clause by clause
* **A document carries the flags.** In j_70 W2, the dialog sets language and expiry. The API returns translation REQUIRED and notarisation NOT_REQUIRED, both from the document type, and expires_on 2020-01-02. The database row and one audit line per flag are checked. Provided with no detail is refused in words.
* **The type's defaults are governed.** W1 refuses the officer (403), a value with no citation (400) and self-approval (403), and the release publishes a new version.
* **The checklist reads expiry.** W4 checks "Expired on 2020-01-02" through the API and on screen, and nothing is blocked.
* **The checklist reads translation.** W4 checks the "Translation + translator's affidavit" line through the API and on screen. Choosing English removes it again. A type with no rule adds no line.
* **The checklist reads notarisation (QA-758).** With notarisation set to Required and not provided, the line's warnings include "Needs notarisation: … Nothing is blocked." and the line keeps its state. This was the one failing step on d9954de6e; it passes now. On screen, the suite shows the warning, and marking notarisation Provided (or putting it back on the type's default) takes it away.
* **Gate A.** W6 ends at R1.72's first step: a prospect's screen that offers "Convert to client".

## Bugs
None new. **QA-758 closed** (`history/qa-bugs-closed-2026-11-24-r170.md`).

## Notes and limits
* On GitHub, the notarisation step checks the API only. The on-screen proof is the local suite above, which uses the same `flag_warnings` rendering that the GitHub expiry step proves on screen. The reader recorded this as a note; it does not block Works.
* Not walked: a notarisation warning on a document whose type says Required by default (only a Required value set by staff was walked; the code handles both, `case-document-flags.ts:52`).

## Questions for the Lead
None.

## Suggestions
* *Later · Scaffolding:* add the on-screen notarisation warning to j_70 W4 so the GitHub walk proves it on screen too (one locator, as the expiry step does).
