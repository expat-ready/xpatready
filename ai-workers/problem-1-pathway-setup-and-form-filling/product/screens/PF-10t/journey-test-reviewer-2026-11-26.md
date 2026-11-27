# Journey test: PF-10t people import (reviewer, 2026-11-26)

Head `984a9219af06dedbe7ed79b8b51e7d4a7a04c535`.

**What was tested:** API level only. There is no screen until R1.35 part 4 (PF-10s), so the journeys were walked through the routes a screen will call. The setup was the check's harness on a scratch database, Nest on :4436, two firms, with the real `fo_person`, `ConsentStore` and audit and fake jobs. US$0. The script is in the reviewer's scratchpad (`probe10t/probe.mts`, not committed).

## Journeys (persona, goal, result)
| # | Persona and goal | Steps | Result |
|---|---|---|---|
| J1 main | Firm Admin: "bring our old contact spreadsheet in" | upload, mapping offered, preview with the declaration ticked, run | Held. Created, merged, skipped and error counts are right; states read PARTIAL or COMPLETED; check DW1 to DW6 pass. |
| J2 alternate | Admin re-imports the same file | upload, preview, run | Held for ordinary emails: 0 to create and no new consent. **Failed with 500** when the file holds a person whose email the consent store cannot keep (J6). |
| J3 error | Admin's file has bad rows | preview, then read the rows | Held. Each reason is in words ("Email: is not an email address", "Given names: is too long", "has characters that cannot be saved"). |
| J4 wrong role | Case Officer opens the import list or a record's origin | GET list, GET origin | Held. 403 MISSING_PERMISSION naming `agent/import:view-report`; 401 with no token. |
| J5 other firm | Solo firm's Owner looks at the other firm's work | list, batch view, origin | Held: no other-firm batch is listed and the batch view is 404. Origin answers `imported:false` (200), not 404 (review m2). |
| J6 error | Admin imports a file containing `x@ex_ample.com` or `josé@example.com` for a known person | preview | **500 "Internal server error"** for the whole file, with no row named. The email is printed in the server log (review M2). |
| J7 consent | Admin imports "yes" for a person who withdrew and was later merged away | preview, run | **A new person was created with live marketing consent**: `allows()` returned CONSENT (review M1). |
| J8 recovery | A colleague fills a field between the preview and the run | preview, edit, run | Held. The new value was kept and only the still-empty phone was filled. |
| J9 suppression | Admin imports "yes" for a suppressed or unsubscribed person | preview, run | Known person: SKIP, no consent. New person at a suppressed address: a consent row is written, but the gate still refuses (review m1). |

## Data underneath
* Each created person exists once. A merge writes exactly the filled fields and never overwrites one (P5).
* Audit: one `front_office.person.imported` line per person made and one `import_filled` line per person filled, naming the batch and the fields.
* Consent rows carry `IMPORT_DECLARED|IMPORT_DECLARED|import:<batch>`.
* Outbox 0 and leads 0: nothing sent and no lead made.
* Firm walls and keys are enforced on the server (J4, J5).

## Break pass (15 min)
* Long text: 201 characters refused.
* Non-English text: 李明 imported.
* An RTL override character: refused.
* Consent values: "maybe" is a row error; "OUI" is a yes.
* Unknown list query key: 422.
* Bad page: read as page 1.
* Merged-away email: a new person is created (J7).
* Email outside the consent store's form: 500 (J6).

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | J1 works; J6 makes a whole file impossible to import |
| Next step obvious | ½ | Row reasons say what to fix; a 500 names no row and no next step |
| Plain words | 1 | Rule words such as "needs an email (consent is for email)" and "needs a given or family name" |
| Feedback and state | 1 | Totals, per-row outcome, PARTIAL/COMPLETED, the list's counts and undo deadline |
| Correct data | ½ | Fill-only holds; but consent is revived at a withdrawn address (J7) and a consent row is written at a suppressed address (J9) |
| Error recovery | 0 | J6: the preview fails as a whole with no row named, and a re-import of a person the import itself created fails the same way |
| Accessibility and screen sizes | ½ | N/A: no screen in this part (part 4) |
| Speed | 1 | The 18-test check runs in 9.7 s; each preview under 1 s |
| Visual quality | ½ | N/A: no screen in this part |
| Trust and sources | 1 | Origin reads Import with the batch and source name; consent names the batch; audit is in the row's transaction |

**Total 6.5/10: fail (below 8, and one 0).**

## Fixes that would raise the low scores (most valuable first)
1. Error recovery and task completed: keep an email the consent store cannot keep out at `check()` as a row error in words, and make `consentState` fail closed, never throw (M2).
2. Correct data: follow a merged-away match to its survivor (M1). Do not record consent for a new person at a suppressed or unsubscribed address (m1).
3. Add the missing pass and fail tests (M3), so these do not regress.

## Could not test
* A browser, a screen reader, axe, the 1024 and 1440 px widths (no screen).
* An intended user's unaided walk (D17 and D20 stay with the founder).
* The real FO-9b merge flow for J7: the tombstone was set directly.
