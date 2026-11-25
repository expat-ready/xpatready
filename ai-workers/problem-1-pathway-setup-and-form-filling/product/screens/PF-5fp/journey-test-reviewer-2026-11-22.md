# PF-5fp (R1.92, the firm profile API): journey test, reviewer, 22 Nov 2026

Commit `180c6706b46594db53e59e6e24f641d091c76f15` (branch `claude/sharp-johnson-ztwuoq`, PR #3003). Isolated copy `rv192` on :4793 (`AI_LIVE=off PLATFORM_IDENTITY=local`, `--ttl 30`, never :4400), stopped afterwards (database removed). Live AI off, US$0.

**This row has no screen** (PF-5s builds it). I walked the journeys as HTTP calls to the product's own routes, signed in through the local stand-in as each role. There was no browser, no Playwright and no axe. The two UI-only criteria are N/A.

## Journeys (persona · goal · steps · expected → result)
1. **Main.** Owner, sample-firm: "put our public phone, email and website on the profile, and move us to Vancouver time in USD". I read the profile with GET and saved it with PUT using that version. Expected: one save, read back the same, one audit line per changed key. **Held**: 200 with `changed` = 5, GET returns the same values, and 5 `platform.setting.change` lines.
2. **Alternate.** Owner: switch the language to French, set UTC, then `Etc/GMT+5`, and clear the public email (`""`) and phone (`null`). **Held**: each answered 200 and named its changed field. An empty save `{version}` answers 200 with `changed: []` and writes nothing.
3. **Empty.** Firm B (sample-solo) has never saved. **Held**: phone, email and website are null, with defaults en, America/Toronto and CAD; `offices` is 1 (the implicit office, as PF-18a defines it).
4. **Error.** Mars/Olympus, ftp website, "call us", EUR, a missing version, an unknown `firmId`, `[]` and bad JSON. **Held**: 422 naming each field in words, 400 for bad JSON, nothing written. Not quite: `http://` is accepted under the words "starting https://" (review m3). Errors from different stages are not named together (m4).
5. **Wrong role.** A Case Officer saves: 403. An Admin changes the billing email: 403 "Only the firm's Owner can change the billing email." and nothing from that save is written. The same Admin can change the website, and it is audited as the Admin. **Held**.
6. **Read-only details.** Owner sends legalName, operatingName, countryCode and businessAddress. **Held**: 422, and each message says who does change it (support, or Billing).
7. **Recovery (two tabs or a double click).** Four parallel PUTs from one version. **Held**: 200, 409, 409, 409; the 409 carries `latest`. A stale version after another save gets 409 and nothing is written.
8. **Other firm.** Firm B's Owner reads and saves its own profile. **Held**: firm B's values only, and firm A's settings rows are byte-identical. Firm A's office and licence record give 404 to firm B.
9. **Boundary.** Offices with time zones and the licence record go through the existing routes, re-checked in the check's O1 and L1 lines (both passed). The hand-over to PF-5s is the `canChange` and `readOnly` lists. `canChange` shows Owner {details, ownerOnly}, Admin {details} and Case Officer {} as expected.

## Data underneath
Each changed key leaves one `platform_firm_setting` row and one audit line, and the billing email leaves one `platform_firm.billing_email` update and one line. Personal values (public phone and email, billing email) sit only in the audit before/after, never in `detail` or a log. `check_r192_firm_profile` re-ran 30/30 twice; the second run came after my probes.

## Break-it pass (details in `review.md`)
* **Minor:** names inherited from the object (`toString`, `constructor`, `__proto__`) are refused as "read-only" with `fields: {}` and code text in `issues` (m2).
* **Minor:** an Admin's save that carries the unchanged billing email gets 403 for the whole save (m5).
* **Minor:** `--------1234567` is accepted as a phone number (m3).
* No Blocker or Major.

## Score (each 0, ½, 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1, 2 and 5 through the product's own routes |
| Next step obvious | 1 | `canChange`, `readOnly`, `version` and `licensedStaff` tell PF-5s what to grey out and show; a 409 carries `latest` |
| Plain words | ½ | Refusals say who changes a field ("ExpatReady support", "on Billing"), but the website words say https while http passes, and inherited names show code text |
| Feedback and state | ½ | Field-level 422 and `changed`, but errors from different stages are not named together (m4) |
| Correct data | 1 | Values read back exactly, one line per change, firm B never touches firm A, no write after a refusal |
| Error recovery | 1 | Parallel saves give one 200 and the rest 409 with `latest`; a stale save writes nothing |
| Accessibility and screen sizes | N/A | No screen in this row (PF-5s) |
| Speed | 1 | Every call took tens of milliseconds on the copy |
| Visual quality | N/A | No screen |
| Trust and sources | 1 | Every field traces to AG01-29(7) or AG-16-1 in code; the audit shows who, before and after; no AI |

**Score: 7 of 8 applicable criteria (8.75/10 scaled), no criterion at 0: Pass.** The most valuable fixes come first:
1. Name every bad field in one 422 and use `Object.hasOwn` for the read-only names (feedback).
2. Align the website rule with its words (plain words).

**Could not test:** a visible-browser walk, axe, widths and keyboard (there is no screen). D17 and D20 stay with the founder.
