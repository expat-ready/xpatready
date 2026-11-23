# Journey test: CS-D7c + CS-D7 document flags (R1.70), reviewer, 23 Nov 2026

The reviewer did not build this. It tests PR #3180 at head `157dfdb6d9d56506adf19d57bacdd4d11091b3f3`.
- **Copy:** isolated copy `rev_csd7` on :4481 (not :4400), started fresh and stopped afterwards. Live AI off, US$0.
- **Walk:** Playwright (headless Chromium) driven by mouse like a person. The script was a scratchpad file (not committed); the data was read underneath with SQL.
- **Data:** the sample's wp.family release. The passport type got cited test defaults through CS-D7c's own governed change: `REQUIRED_IF_NOT_EN_FR`, notarisation `NOT_REQUIRED`, `has_expiry`, 365 days.
- **Other activity:** after these runs, another session changed the working tree (case-document-flags.ts, readiness-inputs.ts, …, from 05:37 UTC). Everything below is from 157dfdb only.

## Journeys (persona: the case officer, unless named)
1. **Main path.** Goal: "mark the Spanish passport so the team knows it needs a translation". Case page → Documents → passport line ⋯ → Document flags… → Language Spanish → Save flags.
   Expected: one "Translation + translator's affidavit" line, Needed, under the person.
2. **Alternate.** Provided needs its detail: Provided with no detail is refused; with the detail it is accepted.
3. **Warning.** Goal: "flag that the passport expired". Expiry yesterday → a warning on the line; nothing is blocked; readiness lists it.
4. **Two officers.** Both open the same document's flags. B sets the expiry to 2031-05-05. A changes notarisation, gets the 409, and saves again.
5. **Reopen.** A reopens the dialog on the same page after B's change, changes the language and saves.
6. **Wrong role by URL.** Client, configuration author, the other firm's staff, nobody.
7. **Recovery.** Double click on Save. A replacement file on the line.
8. **Old release.** A case pinned to release 1 (before the defaults) keeps release 1's behaviour.
9. **Across the boundary.** Checklist → readiness: does readiness read the flags?

## What held
- **J1:** the menu item, the dialog and the Spanish line all worked. The line reads "For Passport … (passport.pdf), in Spanish" with the type's quote under "Source". The dialog says where each value comes from: "(from the document type)" or "(set by staff)".
- **J2:** Provided without a detail gives the server's words, and the dialog stays open. With the detail, the line shows Provided.
- **J3:** expiry yesterday shows "Expired on 2026-11-22: … Nothing is blocked." on the line, and the line stays Received.
- **J6:** the client gets 403, the author 403, the other firm's staff 404, nobody 401. The officer gets 403 on the library defaults route.
- **J7 (double click):** one request, guarded by `sending.current`.
- **J8:** on release 1, the document's flags are all "not set" and `defaults` is null. Spanish adds no line there.
- **Hostile input:** a 301-character detail gives 400. Arabic, Japanese and emoji text is stored. Half an emoji gives 400. An unknown field gives 400. "EN" is stored as "en".
- **Screen sizes:** 1024 px and 200 % zoom (720 CSS px at 2×) have no sideways scroll, and the dialog scrolls to Save.
- **Builder's suites, re-run on :4481:** check_csd5c_type_defaults 24/24, check_csd5_flags 28/28, check_csd5_flags_browser 30/30. The browser suite covers axe 0 serious, keyboard only and 1440/1024/375 px.

## Findings
**F1 (Major): the dialog overwrites a colleague's flags.** The server's version check is right, but the panel defeats it. Two paths:
- **J4 (after a 409):** B set the expiry to 2031-05-05 (version 3). A's save got 409 "read them again". A's expiry input still showed the old 2026-11-22. A pressed Save again, and the database now has `2026-11-22|REQUIRED|4`. The audit says "expiry date … 2031-05-05 → 2026-11-22", a change A never made.
- **J5 (reopen):** B had set notarisation Required. A reopened the dialog on the same page and changed only the language. The audit shows two lines: "language Spanish → German" and "notarisation Required → not set". A never touched notarisation.
- **Cause:** `web/src/pages/case/document-flags/panel.tsx:25`. `<Form>` is not keyed, so its `useState` values (`:33-38`) are set once, from the cached or stale view. `f.version` is read fresh on each render. `save` (`:47-48`) sends every field.
- **Fix:** key the form on `v.flags.version` (or reset it when the version changes), and do not show the form from cached data. Better still, send only the fields the person changed. Add a two-context browser check.

**F2 (Major): the flags do not reach readiness or the counts.**
- **J3/J9:** with an expired passport and a Needed translation, the readiness section ("1 block and 12 open warnings") and `GET …/prepare` name neither. The person header still says "1 of 2 received".
- The row's own text says "Readiness (C7.6) reads the warning as an item, not a stop" (CS-D7 (4)).
- The translation line has no action: no upload, no request, nothing in its own row. It is resolved only through the passport's ⋯ → Document flags → Provided + detail.

**F3 (Minor, Should): two contradicting translation items.** The release's own "May be needed" lines still say "it depends on a document's contents … check it by hand for now":
- "Certified translation of documents not in English or French"
- "Translator's affidavit"

Both say this right under the new "Translation + translator's affidavit — Needed" line, although the language is now known.

**F4 (Minor, Should): a new file loses the flags.**
- **J7:** after a replacement passport is uploaded, the new current file has `language: null`, so the Needed translation line disappears.
- The row says the language is "picked by staff at upload". Today it is picked only afterwards, in the panel.

## Score (QUALITY.md "Journey score")
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1–J3: flags set, line shown, warning shown |
| Next step obvious | ½ | The translation line has no action (F2), and the contradicting items confuse (F3) |
| Plain words | ½ | Words are plain, but F3's duplicate items and the double "Translation" legend and label |
| Feedback and state | ½ | "Now:" lines and the warnings are good; after a 409 the inputs stay stale (F1) |
| Correct data | ½ | The single-person path is exact (SQL, one audit line per flag); two silent overwrites (F1) |
| Error recovery | ½ | Provided-needs-detail recovers well; the 409 retry overwrites (F1) |
| Accessibility and screen sizes | 1 | axe 0 serious; keyboard path; 1024 px and 200 % with no sideways scroll |
| Speed | ½ | No request per row (worked out in `stored()`); not timed against the §9 budgets |
| Visual quality | 1 | Team Pill, FoldOut and Dialog; builder's screenshots CSD7-01..04 |
| Trust and sources | 1 | The type's quote and source on the line and in the dialog; origin shown per flag |
| **Total** | **7 / 10** | **Fail (below 8)** |

**Fixes that raise the score, most valuable first:**
1. F1: form reset and only changed fields sent (correct data, error recovery, feedback).
2. F2: readiness and the counts read the warnings and the Needed translations (next step).
3. F3/F4: one translation item per document, and flags kept on a replacement file (plain words, next step).

## Not tested
- A real screen reader.
- An intended user's unaided walk (D17/D20 stay with the founder).
- The client's own link pages (they show no flags; not in the rows' scope).
- Timings against the STANDARDS §9 budgets.
- The full CI set: the PR is a draft, so only the guard and pr-rules have run.
