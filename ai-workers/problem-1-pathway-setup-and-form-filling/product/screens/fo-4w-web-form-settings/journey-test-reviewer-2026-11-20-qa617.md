# Journey test (reviewer): QA-617, switching the web form on links the firm's consent wording (PR #2649 at deab70f16)

I did not build this. All runs were on my own isolated copies, started and stopped in the same command: :4537 (pack and probe) and :4538 (j_26). I never used :4400, :4527 or :4426. Live AI was off; cost US$0. Probe script: session scratchpad `probe617.mjs` (not committed).

## Journeys (from QA-617, the tech lead's ruling, concept FO-4 r2 screen 2b, QA-605's switch)
1. **Main (new firm).** The Owner of a firm whose set-up made the form off with no consent wording opens Sales › Settings › Web form and presses "Switch the form on". The form goes on, linked to the firm's current wording.
2. **Alternate (switch off, then on again).** The link stays when switched off. A newer wording published later does not move the form.
3. **Error: firm with no wording at all.** The press says why in plain words. The form stays off and nothing is written.
4. **Race.** Four presses at once on one version.
5. **Wrong role.** Not changed by this PR (same key `agent/prospect:configure-form`). QA-605's 403 checks still pass in the pack.
6. **Recovery.** Focus after the refusal, reload, keyboard press.
7. **Sizes.** Keyboard at 1440 px, 1024 px, and 200 % zoom (512 CSS px at scale 2).
8. **Across the boundary (J-26).** Switch on → save site → copy snippet → visitor sends → lead in Unassigned. No SQL consent link.

## What held
- **Suites, each run twice on the exact head:** `check_fo4w_web_form_settings_browser.ts` 51/51 and 51/51. `tests/journeys/j_26.ts` 18/18 and 18/18.
- **J8, no SQL wording link left in j_26:**
  - The only SQL write is j_26.ts:60, which sets `enabled = false`, `allowed_sites` and `thank_you_text`. It does not set `consent_wording_version_id`.
  - j_26.ts:62 asserts the form starts `false|none`.
  - j_26.ts:102 asserts that the screen's switch linked the firm's set-up wording and that the audit line names it.
  - The `ConsentStore`/`auditEvent` imports are gone.
- **J1 (probe):** the Sample firm has one wording (`EMAIL/MARKETING/en-CA/v1`, from `ensureBookingWording`). The switch-on gives 200, the row is linked to that id, and there is one audit line: `enabled_before false, enabled_after true, consentWordingVersionId_before null, consentWordingVersionId_after <id>`.
- **J2 (probe):**
  - Switching off: 200, and the link is kept. The line has only `enabled_before/after` (`flattenValues` drops unchanged keys).
  - I then added a newer version row (v101) and switched on again: 200, and the form kept v1. That matches the concept: "picking a new version never edits the old".
- **J3 (probe, real server, no stand-in):** I deleted the firm's wording rows in my throwaway database (superuser, replica role). The `PUT …/enabled` call returns 422 `NO_CONSENT_WORDING` with `fields.enabled` = the plain sentence. The row stays `false|none`, there are 0 new audit lines, and the version is unchanged.
  - On the screen, by keyboard (Enter) at 1440, 1024 and 200 % zoom: the red notice under the switch shows the sentence, the page still says "This form is off", focus stays on "Switch the form on", there is no sideways scroll, no "Something went wrong" and no page error.
  - Screenshots in the session scratchpad: `rv617-1440-no-wording.png`, `rv617-1024-no-wording.png`, `rv617-1024-zoom200-no-wording.png`.
- **J4 (race):** 4 rounds, each with 4 parallel switch-ons on one version. Every round gave `[200, 409, 409, 409]`, exactly one audit line, and the link equal to the current wording.
- **Typecheck and sweeps:** `tsc -p api/tsconfig.json` shows no error in any touched file (15 errors, all in unrelated test files). `check_aud_values.ts` 14 passed, 0 failed. `graph.mjs`: G1, G2, G4 and G5 are 0.

## Findings
- **Minor: the refusal gives no way forward.** "…your firm has no consent wording for people sending an enquiry to agree to, and no screen sets one yet." (`web-form-settings.ts:123`).
  - It is plain, but it names no fix (BIC-13: "one reason and one or two fixes"), and "screen" is builder language.
  - Expected by the ruling while the builder's Question is open, so it is not blocking.
- **Minor: the refused path is never tested on the real server in the pack.**
  - pack :136-157 uses a stand-in transaction, and pack :230 fakes the 422 with `page.route` and a hand-built body.
  - A firm with no wording is reachable for real. `onFirmCreated` writes the wording in its own transaction (`firm-seed.ts:154`). If that fails, `seedCreatedFirms` (`firm-seed.ts:169`) never retries it, because the firm is already seeded.
  - My J3 shows the real HTTP and screen path works. The pack does not prove it.

## Score (QUALITY.md "Journey score")
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | A new firm switches its form on by screens alone. J1, and j_26 18/18 twice |
| Next step obvious | 1 | One primary "Switch the form on" under "On or off" (`rv617-1024-no-wording.png`) |
| Plain words | 1 | "Switched on." The refusal sentence is plain, though it offers no fix (counted under recovery) |
| Feedback and state | 1 | Off pill, the off notice and the red refusal agree. The success notice appears on switch-on |
| Correct data | 1 | Link = newest EMAIL/MARKETING wording of this firm; one line with before/after; race gives one winner; refusal writes nothing |
| Error recovery | ½ | A firm with no wording is a dead end ("no screen sets one yet"), pending the tech lead's Question |
| Accessibility and screen sizes | 1 | Keyboard press; focus kept; no sideways scroll at 1440, 1024 and 200 %. The pack's axe runs in the off and on states |
| Speed | 1 | The pack's throttled keyboard presses all complete. Only one extra indexed read on switch-on |
| Visual quality | 1 | Team notice and button, unchanged layout |
| Trust and sources | 1 | No AI. The audit line names which wording was linked |
| **Total** | **9.5 / 10** | **Pass** (8 or more, no 0) |

**To raise the score:** once the Question is answered, make the refusal name where, or who, sets the wording.

**Could not test:** a real screen reader, and axe on the no-wording state on the real server (the pack runs axe on the off and on states only). D17 and D20 stay with the founder.
