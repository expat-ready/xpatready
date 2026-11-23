# QA-758 journey test (reviewer), 2026-11-23

Head `4230c38e7a1f7388f002fb68bf1a94321cbd475e`. Isolated copies from `run-suites.sh` (ports +14000, never :4400), live AI off, US$0.

## Journeys (case officer, firm staff)
1. **Main:** "This passport has to be notarised; I want the file to remind me until it is." Case → Documents → passport line ⋯ → Document flags… → Notarisation: Required → Save. Expected: the line warns, names notarisation and says what to do; the line's state is unchanged. **Held** (suite step "QA-758 fail"; `CSD7-05-notarisation-needed-line-400.png`).
2. **Done:** "It came back from the notary." Document flags → Provided + "Sample: notary public, 2026-11-20" → Save. Expected: the warning goes; the DB reads PROVIDED; 2 audit lines. **Held.**
3. **Back to default:** set the type's default (Not required) and clear the detail. Expected: no warning; the stored value is null. **Held**; audit total 13.
4. **Error:** Provided without a detail. Expected: refused in the server's words, the dialog stays. **Held** (the existing CS-D7 step; the rule is unchanged).
5. **From the type:** a type whose cited default is Required, nothing set by staff. Expected: the warning with key `|type`. **Held at function level** (direct call to flagWarnings). Not tested by any suite, hence review m2.
6. **Readiness (next screen):** the same warning shows as a `document_flag` item that can be passed, never a block. **Held by code** (readiness.ts:256 calls only `warn`; the same path as expiry, which check_csd5_flags.ts (4) tests). Not tested for notarisation specifically (m2).
7. **Not applicable line:** no flag warnings (case-checklist.ts:208, an existing test). **Held.**

## Checks
Keyboard only through the whole main path. axe-core WCAG 2.2 A/AA: 0 serious or critical on the panel at 400 px. No sideways scroll at 1440 and 400 px. No console or page errors. Mutation (rule disabled): the suite goes red on the QA-758 step. Data: the DB value and audit count are checked after each save.

## Break it (short)
Staff NOT_REQUIRED over the type's Required gives no warning (staff wins: correct). PROVIDED over the type's Required gives none. Staff Required on top of the type's Required raises a new key, so an earlier pass is asked again (by design, #3180 R3-m3). A new file has a new id and so a new key, which is correct.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1–3 green |
| Next step obvious | 1 | The words say "mark it Provided in Document flags with who notarised it and when" |
| Plain words | ½ | The warning is plain; the readiness group heading still reads "(expiry, age or translation)" (readiness.ts:328) |
| Feedback and state | 1 | The warning appears and goes on save; the line keeps its state |
| Correct data | 1 | DB PROVIDED / null; audit 9 → 13 exact |
| Error recovery | 1 | Provided without a detail is refused in words; going back to the default works |
| Accessibility and screen sizes | 1 | Keyboard only, axe 0, 400 and 1440 px |
| Speed | 1 | Computed in the existing per-document loop, no new requests |
| Visual quality | 1 | Same text-warn line as expiry (CSD7-05 screenshots) |
| Trust and sources | ½ | The line does not say whether Required came from staff or the type's cited default (the dialog does) |

**9/10: pass (8+ and no 0).** Most valuable fixes: name notarisation in the readiness group heading. Optionally say "(from the document type)" in the line's words when the type set it.

## Not tested
qa's j_70 (not on main). A real screen reader. 200 % zoom. An intended user's unaided walk (D17/D20 with the founder).
