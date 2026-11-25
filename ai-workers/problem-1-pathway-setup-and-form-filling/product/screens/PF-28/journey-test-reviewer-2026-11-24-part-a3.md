# PF-28 A3 (R1.10, front-office sales and retainers): journey test (reviewer, 24 Nov)

Head: **36a0f9441b25bc8cfdbf85a0237bb697ba02d4dc** (PR #3531). Reviewer: Opus 5.5. Live AI off; cost US$0. Isolated copies only, on :4436–:4439 (never :4400), each stopped afterwards: `rva3`, `runtime_pf28a3`, `rvsweep`, `rvprobe`, and a worktree of origin/main (`rvmaina3`). The reviewer's probe script lived in the session scratchpad and was not committed.

**This is an API-only change: no screen changed.** So this score covers the API journeys (j_10's walk over every PF/FO route, and the suites), not a browser walk. The screens that call these doors are unchanged. I checked their bodies by reading the code: the web form and the embed send the trap as a text input's value (`web-form-page.tsx:52`, `form-embed.js:168`), and the retainer page sends `expectedVersion` as a number (`retainer-page.tsx:46,50`). Every value they send still passes.

## Journeys (persona: a firm's staff screen, or a script calling the API on its behalf)
| # | Goal | Steps | Expected | Result |
|---|---|---|---|---|
| J1 | Every sales door names a bad field | j_10 W2 front-office sales | 422 naming the field in plain words, or 413/404 as ruled | **PASS**: 291 probes, 0 off (qa's main score had 5 of 272 off) |
| J2 | Every retainer door names a bad field | j_10 W2 retainers | as above | **PASS**: 72 probes, 0 off (was 12 of 72) |
| J3 | A field sent alone is named first, even on a random record id | `check_pf28_a3_fo_fields.ts` W and L (31 probes) | 422 on that field, in the service's words; never another field's rule, never 404 | **PASS** 6/6. On main's code 3/6: W, L and the empty signature request fail |
| J4 | A value the rule takes still passes (no tightening) | A3 test P (13 calls), plus 35 reviewer probes | The next rule or the look-up answers | **Held**. See J4 notes below |
| J5 | The web form: the trap and a long message | `check_fo2_leads_prospects.ts` | Trap text: thank-you, nothing stored. Non-text trap: 422 `website`. 5001 characters: 422 `message` | **119/119** |
| J6 | Wrong order: a malformed id with a bad body | j_10 W2 and the sweep | 404 first | **Held** (`check_pf28_inputs` 51/51) |
| J7 | Nothing stored by any refusal | A3 test N, j_10 W4 | Row counts unchanged; no 500 | **Held** |
| J8 | Across the boundary: what A2 and A5 own | j_10 W2 booking, W3, W3 schema, W5 | Still red, and not this PR's | Red as expected. W3 lists no sales or retainer item |

**J4 notes:**
- 5000 characters with spaces around them pass.
- `e`+U+0301 ×5000 passes (5000 after NFC), and 5000 × U+1D400 passes.
- Signed offline in multipart, `{reason, expectedVersion:"1", signedVersion:""}`, reaches `file` "Upload the signed PDF.".
- A template upload with `kind=CONSULTATION` reaches `file`.
- `representativeStaffId:""` reaches "Choose the representative.".

## Break it (about 15 minutes, by API)
- **Counting:** U+0958 ×2600 (5200 after NFC) is refused at 5000, as `text()` refuses it. Edit with `expectedVersion: 1e21` passes to the 404, as the service allows it; 1.5 and "1" are refused.
- **Bodies with several bad fields:**
  - Close `{note: 2001 characters}` names both `reasonId` and `note`.
  - Identity `{documentNumber:""}` names `requestId` and `documentNumber`.
  - Draft `{kind:"", templateId:"x"}` names both fields.
- **Repeated or empty multipart values:** a repeated `expectedVersion` (sent as a list) gives 422 `expectedVersion`. `signedVersion` "0" gives 422 on its field.
- **Found (review m1):** a disclosure of 50,000 spaces + "d" was 422 on main and now passes the parse. The stored value would be trimmed to "d". This loosens the old bound; it does not tighten anything.
- **Found (review m2):** withdraw `{reason: 5, expectedStatus: "x"}` names only `expectedStatus`. Sent alone, `reason` is still named first.
- **Seen (pre-existing service words):**
  - `fees: "x"` answers "At most 50 rows.", which is a clumsy instruction for a value that is not a list.
  - The note limits read "at most 5000 characters.", starting in lower case.
  - A bad signer id is named `signerPersonIds.0`.

## Score (QUALITY.md "Journey score")
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1–J7 all pass. This PR's Done when is met (W2 sales and retainers PASS; A3 test exit 0) |
| Next step obvious | 1 | Every refusal names its field, and "Nothing was saved." ends the detail |
| Plain words | ½ | No zod words left on these doors. Clumsy words remain: "At most 50 rows." for a value that is not a list; a lower-case start; the `signerPersonIds.0` path |
| Feedback and state | 1 | 422 Problem Details with `code: INVALID` and `fields`, counted ("2 fields need a change") |
| Correct data | 1 | Nothing stored (A3 test N; j_10 W4); valid values pass unchanged (P) |
| Error recovery | 1 | When the named field is fixed, the next rule or the look-up answers (P; probes g, o, p, q) |
| Accessibility and screen sizes | ½ | No screen changed and none was walked: no axe, keyboard or width run this time |
| Speed | ½ | No answer felt slow, but none was timed against the STANDARDS §9 budgets |
| Visual quality | ½ | No screen in the diff, so none was viewed |
| Trust and sources | 1 | Sample data only; no AI; no immigration value; US$0 |

**8/10, pass** (8 or more, and no criterion at 0). To raise it, in order of value:
1. Clearer words for `fees` when it is not a list (for example "Send the fee rows as a list.").
2. Put back an outer length bound alongside the refine (review m1).
3. Re-run the FO-2 and FO-5s browser suites' axe and keyboard steps on merged `main`.

Not tested: a real screen reader, and an intended user's own walk (D17 and D20 stay with the founder). The PR's full 22-suite `--only` set was not run; I ran 4 suites (j_10, the A3 test, fo2, the PF-28 sweep).
