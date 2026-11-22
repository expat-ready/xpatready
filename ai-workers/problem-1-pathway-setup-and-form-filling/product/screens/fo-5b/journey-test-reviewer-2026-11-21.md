# Journey test, FO-5b (reviewer role), 21 Nov 2026

Commit 3060c388dba4e1164c4a52c8f10ccdbcf94a3876 (PR #2720). **This row is API only.** No screen exists until FO-5s, so there was no visible browser. Each journey was walked as HTTP calls, the way the FO-5s screen will make them. Isolated copy `rev_fo5b` ran on the runtime lane's port **:4436** (WAY-OF-WORKING; never :4400), started by `tools/isolated.sh` from a detached worktree at the commit, with `PLATFORM_IDENTITY=local`. Script: scratchpad `journey/j.mts`. The copy was stopped afterwards and its database dropped.

**Setup outside the product:** the copy started with no front-office pipelines (`fo_stage` empty, so `POST leads` answered 500 P2003). I ran `seedSampleFirmsFrontOffice` on the copy's database, as the suites do. This is an upstream copy-start gap, not FO-5b. Everything after that went through the product's own routes: lead, engage, conflict check, template upload, draft, send.

## Journeys (persona, goal, expected)
1. **Owner (user-R), main:** "Which of the Code's items does my template mark?" Read the placeholder list, upload a template with every marker but (k), open its checklist. Expected: 25 of 26, (k) missing with its section, the Code's words and our note.
2. **Owner, draft:** prepare a retainer from a prospect on that template. Expected: one quiet line on the draft, a link to the checklist, Send allowed.
3. **Owner, across the boundary:** send it, then give the template every marker. Expected: send is not blocked by the 25 of 26. The sent agreement keeps 25 and its file hash. The template shows 26.
4. **Owner, error:** upload an unknown marker, a marker used as a section, and `{code.marked}`. Expected: 422 naming each one.
5. **Wrong role or firm:** a case officer, a firm-B owner, no sign-in, a malformed id, a retainer's id. Expected: allowed only with the key and only in the firm.
6. **Alternate:** a CONSULTATION template's checklist.
7. **Recovery:** three reads at once, a double upload, non-English and long text around a marker.

## What happened
| # | Result | Time |
|---|---|---|
| 1 | Placeholders 200: 26 markers labelled "Clause marker for Code s. 24(3)(k) (prints nothing)". Upload 201, no warnings. Checklist 200: "25 of 26 items marked in this template", `blocksSend:false`, "Unconfirmed: no counsel". Source line names the Code, SOR/2022-128, s. 24(3), current to 2026-10-29, URL. (k) has its section, its verbatim text and an "Ours:" note | 15 / 303 / 12 ms |
| 2 | Draft 201. Read 200: `canSend:true`, no blockers, line "Code s. 24(3): 25 of 26 items marked in this agreement's template.", link works (200), `versions[].codeMarked` has 25 | 94 / 22 ms |
| 3 | First send 409: FO-13c conflict gate (existing; "Record a conflict-of-interest check…"). After recording NO_CONFLICT, send 200 **SENT** with 25 of 26. Template v2 shows 26 of 26. The agreement still shows 25 with the same sha256. DB `code.marked` holds 25 letters without k | 69 ms |
| 4 | 422 UNKNOWN_PLACEHOLDER for `{code.s24_3_zz}`, `{code.s24_3_k-as-a-section}` and `{code.marked}`, each named | under 300 ms |
| 5 | Case officer 200 (CASE_OFFICER holds `agent/retainer:list`). Firm B 404 "No such template in your firm." Malformed id 404. Retainer id 404. No sign-in 401. No role without the key was available to see a 403 (review m2) | |
| 6 | CONSULTATION template checklist 200, "1 of 26 items marked". The draft returns null for CONSULTATION (review m3) | |
| 7 | Three reads at once: 200/26 x3, max 19 ms. Double upload: one 201, one 409 NAME_TAKEN. "Mandat 契約 ✓" with 3 000 characters and a marker: 201, "2 of 26" (k and i) | |

Our words: 0 of 55 of our strings (summary, source line, draft line, 26 notes, 26 labels) contain "required", "must" or "correct" (AG-05 rule 7).

## Break it (15 min)
Duplicate names are refused (409). Concurrent reads stay consistent. Long and non-English text is handled. Tenancy holds (404). An unknown or section marker is refused. Nothing Blocker or Major found. Minor: after the template changes, the draft's link opens the template's newer state (25 on the agreement, 26 behind the link). The agreement's own `items[]` stay right (review m1).

## Score (QUALITY.md "Journey score")
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1-J3: checklist, draft line, send never blocked, sent list unchanged |
| Next step obvious | ½ | the draft links the checklist, but that link can show a newer template version than the agreement (m1) |
| Plain words | ½ | summary and line are plain, 0 forbidden words; the section refusal "{code.s24_3_k-as-a-section} is not a placeholder we know." is technical (m6) |
| Feedback and state | 1 | `blocksSend:false`, present or missing per item, `codeMarked` per version |
| Correct data | 1 | 26 of 26 verbatim against the page (script); DB list write-once |
| Error recovery | 1 | 422 naming the marker; 409 NAME_TAKEN; 404 for firm B |
| Accessibility and screen sizes | ½ | not testable: API only (FO-5s carries axe, 375/1024/1440) |
| Speed | 1 | reads 12-22 ms, draft 94 ms, upload 303 ms, send 69 ms |
| Visual quality | ½ | not testable: API only |
| Trust and sources | 1 | source line with current-to date and URL, "Unconfirmed: no counsel", notes labelled "Ours:" |

**8 / 10, no 0: pass.** Most valuable fixes to raise the halves: m1 (put the agreement's template version in `codeChecklist`), m6 (a plain message for a marker used as a section). The two "not testable" halves move only when FO-5s builds the screen.

Not tested: a visible-browser walk, screen reader, zoom (no screen). D17 and D20 stay with the founder or an intended user.
