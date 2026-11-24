# qa capability R1.46: template text editor, a plain text box (24 Nov)

**Run:** `/qa capability R1.46`, cloud qa copy, Opus 5.5 medium, live AI off, US$0. Tested on main f0bc60179, after the journey fix #3337 merged (j_46 now asks for the key `sales.lead.going_cold`).

**Verdict: Works** (was Partial). P-339 is met: the pack is green on main's head on GitHub's runners, and a fresh Opus reader agrees.

## Evidence
| What | Where | Result |
|---|---|---|
| item-proof, started by hand from #3179's `Completes: R1.46` | run 45316980967, job 138186340169, on f0bc60179 | PASS: j_46 22/22, "1 of 1 planned run(s) ran and passed" |
| walks.yml, j_46 | run 45316906595, job 138186116594, on f0bc60179 | 22 PASS, 0 FAIL, exit 0, with video and traces |
| Fresh Opus reader (read only, P-339) | this session | Works, high confidence |

The earlier red run (item-proof 45269701199 on d2a45dd4e, 7/22) was journey drift: the key was renamed to `sales.lead.*`. #3337 fixed it, and this head is new.

## Done when, clause by clause
* **A plain text box.** W1 finds one `textarea[data-template-body]` and no contenteditable element.
* **The box saves.** W1: "Published: version 1". After a reload the box holds exactly the French, Arabic, Chinese and emoji text that was typed. The API, the newest stored version (+1) and one audit line, which leaves the wording out, all agree.
* **A field goes in from the picker.** W2: `{{ lead_number }}` goes in exactly at the cursor, and the cursor stays after it. The picker offers exactly the registry's lead fields, and the preview fills in L-0042. The insert also works keyboard only (Tab, the arrow keys, Enter), and publishing stores the token.
* **Over the length limit is refused, with the limit.** W3: the limit (10000) is the registry's constant, and the API reads the same. At 10,001 characters the field is aria-invalid and its note names 10000, the API answers 422 with the limit in words, and nothing is stored. Exactly 10,000 characters publishes.
* **Roles.** W4: the Case Officer sees the message read-only, and the API refuses their publish (403).
* **Sizes.** W5: 400, 1024 and 1440 px, no sideways scroll, axe clean, no page error.
* **Gate A.** W6 ends at R1.47's first step: the firm's public booking page offers the Free consultation.

## Bugs
* **QA-771 (new, Bug · Minor, forms):** the limit counts UTF-16 units, not characters. 9,999 letters plus one emoji, which is 10,000 characters to a person, is refused as "10001 characters". This does not block Works, because the Done when holds for plain text. Smallest fix: one counting helper (code points) used by both the API check and the field's note.

## Questions for the Lead
None.

## Suggestions
* *Later · Capability:* QA-771's fix, then turn j_46's NOTE line into a counted step.
