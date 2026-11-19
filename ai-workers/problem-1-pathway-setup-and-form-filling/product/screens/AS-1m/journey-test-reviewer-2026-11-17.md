# AS-1m journey test (reviewer role), 17 Nov 2026

Reviewer: Opus, a fresh session. Commit 5a5ed9d799d514c892f24cf597cdb722d79bb542. **There is no UI change, so there is no browser walk.** The people who "use" this row are the builders of FO-15b (AS-1 on a lead) and CS-106c (the case assessment), who call `EligibilityPort`. The journeys were walked through the port's own surface: `tests/check_as1m_eligibility_move.ts`, the shared contract, and seven mutations on a scratch copy. Nothing ran on :4400.

## Journeys (persona: the downstream builder; goal "assess a person against a release through the door")
1. **Main path.** List the assessable releases, read the required facts, then assess a principal who meets every gate. Expected: LIKELY_ELIGIBLE, no reasons, with `rules_version` and the disclaimer. **Held**, for the fake and for the adapter (contract case 3).
2. **Alternate.** A fact is missing. Expected: POSSIBLY_ELIGIBLE, with the fact named in the question's words, never NOT. **Held**: "Passport number (Sample)" was named.
3. **Alternate.** A gate is not met, or a review gate is not met. Expected: NOT_ELIGIBLE naming the gate; for a review gate, POSSIBLY with GATE_NEEDS_REVIEW. **Held**, and it equals the moved `assess()` on 6 profiles.
4. **Spouse.** Expected: the spouse's key is listed only where a gate reads it; it is read from the spouse's facts; the principal's answer never fills it; with no spouse the gate does not apply. **Held** (4 checks).
5. **Error.** Expected: an unknown release, a malformed id, or another workspace's release is a typed RELEASE_NOT_FOUND. **Held**, and a malformed id causes no database read.
6. **Error.** Expected: a release with no rules is NO_RULES, never a result. **Held.**
7. **Bad input.** No principal, two principals, or no persons. Expected: a ZodError before any lookup. **Held.**
8. **Recovery.** The same input is sent twice. Expected: byte-equal results, and a fact no rule reads changes nothing. **Held.**
9. **Across the boundary.** Expected: old callers through `engine/runtime/eligibility.ts`, `render.ts` and `eligibility-gates.ts` get the same functions. **Held** (identity checks; SH3 85/85, B124 12/12).

## Break it
* **Seven mutations** (a value import into `engine/runtime/`, the spouse role ignored, a spouse gate without a spouse, the fake grid dropped, needs_review ignored, the workspace binding dropped, NO_RULES dropped): every one turned the test red.
* **A fact key containing `|`:** it lands as a list row that `factsOf` ignores, and it cannot reach another person. Harmless.
* **A release whose every gate is the spouse's, with no spouse:** LIKELY_ELIGIBLE with no gate read. This is review m2, latent until AS-1g.

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | The contract passes 8 of 8 for both the fake and the adapter. |
| Next step obvious | 1 | The port's doc lines say what each call returns and throws; the refusals are typed. |
| Plain words | ½ | Reasons carry gate labels and question words. "Firm" in the port and the contract means workspace (m1). |
| Feedback and state | 1 | RELEASE_NOT_FOUND, NO_RULES or ZodError, each distinct. |
| Correct data | 1 | Byte-for-byte move; the adapter equals `assess()`. |
| Error recovery | 1 | Bad input is refused before any read; a malformed id causes no database read. |
| Accessibility and screen sizes | 1 | N/A: no UI changed, so nothing could regress. |
| Speed | 1 | One query per call; the port-contract check took 945 ms. |
| Visual quality | 1 | N/A: no UI changed. |
| Trust and sources | 1 | `rules_version`, content hash and disclaimer come from the release; Sample is labelled. |

**9.5 / 10, pass** (no criterion at 0). On the 8 applicable criteria it is 7.5 / 8.
**What would raise it:** fix m1's wording.
**Not tested:** a real caller of the port (none yet), a real screen reader, and an intended user's unaided walk (D17 and D20 stay with the founder).
