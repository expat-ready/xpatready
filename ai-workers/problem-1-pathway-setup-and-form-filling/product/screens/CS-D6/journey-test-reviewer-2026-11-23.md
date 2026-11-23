# CS-D6 part 1 (R1.69): journey test, reviewer role, 23 Nov 2026

Head `bb13effa0c89df612b53dd8f5f81a46e4e0ec90a`. Copies: rv_j69 on :4492 (the journeys and my walk) and rv_csd6 on :4498 (API probes). Headless Chromium, Sample firm, synthetic PDFs only, US$0, no model call. This is the one journey score for this check.

## Journeys (from brief part 1 and the row)
1. **Main, case officer.** Upload a file on a line, open ⋯ → "File details…", sign in inline, read the full fingerprint, then "Check the file is unchanged" → Unchanged. No "Read by" shown (no key).
2. **Main, Owner.** Open the same dialog. "Read by" lists openings and checks, newest first, with names.
3. **Alternate, changed file.** The stored bytes are altered on disk. The check says "The file has changed", and the list shows "Checked: changed" first.
4. **Paging.** 55 openings plus a check: 50 lines, then "Show older" → 56. A new check refreshes the list to 57, newest first.
5. **Empty-ish.** A fresh file shows only the officer's check. No-reads text: "Nobody has opened this file yet."
6. **Error.** Check with the network down → "Could not reach the server. Please try again." A 404 → "No such document." The list route 500 is handled by a Notice (code read; my reopen was served from cache).
7. **Wrong role and wrong firm (API).** Officer and manager → 403 on the list. No bearer, or a forged `x-actor` → 401. Officer bearer plus Owner `x-actor` → 403. The other Sample firm's Owner → 404 with the same words as an unknown id. A bad cursor → 400 with a field message.
8. **Case outside scope (API, isolated DB only).** A `view.own` person off the case gets **200** on both routes, and a line is written. This is the review's M1.
9. **Recovery.** Escape returns focus to the line's ⋯ button. Reopen, double click (the button is busy-disabled) and reload are all fine.
10. **Boundary.** The dialog closes back onto the line. The keep list is part 2, not built.

## Walked and replayed
* The builder's `j_69.ts` passed **16/16 twice**, covering journeys 1-3, keyboard, 390 px and axe.
* My scratchpad script covered journeys 1-6 and 9:
  * keyboard: menu → item → Tab order inside the dialog (sign-in, Copy, close) → Enter on Check
  * focus moves into the dialog on open and back to ⋯ on Escape (not forced)
  * axe WCAG 2.2 A/AA: **0** on officer 1024, error, Owner list 1440
  * no sideways scroll at 1440 / 1024 / 720 (= 200 % zoom) / 400 px
  * console errors: only the two I caused on purpose (abort, 404)
* Timings: dialog opens in 60-84 ms, the check takes 38-77 ms, the list loads in 93 ms (1.1 s including a fixed 1 s wait in my script).

## Data underneath
* One "viewed" line per download, with the right actor (`user-O` → "Case officer (Sample)").
* One "checked unchanged" or "found changed" line per check, actor `staff:<id>`, `firm_id` set.
* A refused download (client, 403) writes nothing, and neither does a download refused for a changed file (409).
* **Not right:** all 11 check lines have `case_id` NULL. Their summary names the case number, not `case <8 hex>`, so the case's activity feed never shows them, and `check_case_feed.ts` fails (review M2).

## Break-it findings
* **Major:** the per-case scope (AG-9-53) is not applied (journey 8). Review M1.
* **Major:** check lines are not attributed to their case (above). Review M2.
* **Minor:**
  * the paging tie-break and the firm filter are untested
  * the cursor truncates to ms
  * Copy gives no message when the clipboard is refused, and "Copied" never resets
  * the empty state does not say what will appear
  * the page header says "Acting as: Case officer" while the dialog is signed in as the Owner (existing CS-C1s pattern)
* Not found:
  * a hostile id (`..%2F..`) → 404
  * a doubled `before` → 400
  * an upper-case id → resolved
  * long or non-English names are wrapped by `<bdi>` and `overflow-wrap:anywhere`

## Score (QUALITY.md "Journey score")
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | journeys 1-4 complete through the screen |
| Next step obvious | ½ | "File details…" sits in the ⋯ menu and needs a second sign-in, while the page says "Acting as: Case officer" |
| Plain words | 1 | "Opened the file", "Checked: changed", a one-line fingerprint explainer, "Ask the client to upload it again" |
| Feedback and state | 1 | busy button, result line or danger Notice, list refetched after a check |
| Correct data | ½ | one line each with the right actor, but check lines have no `case_id` (M2) and the case scope is not applied (M1) |
| Error recovery | 1 | network, 404 and cursor errors in words; a missing file reads as changed |
| Accessibility and screen sizes | 1 | axe 0 on four states, keyboard complete, focus managed, 400-1440 px and 200 % |
| Speed | 1 | all under 100 ms on Sample data |
| Visual quality | 1 | team Dialog, Button, Notice, Skeleton; aligned two-column list (`J-69/screenshots/w2-owner-read-by-1440.png`) |
| Trust and sources | ½ | who and when on each line, but AI and rules reads are not in the trail yet (deferred by ruling) |
| **Total** | **8.5 / 10** | **Pass** (8 or more, no 0) |

Fixes that raise the low criteria, most valuable first:
1. Use `caseScope` in `reach()` and name the case by its 8-hex id in the check's summary (M1, M2).
2. Land the "read by AI / by rules" line after #3188.
3. Write the empty state as "Openings, previews, AI reads and checks will appear here."

Could not test: a real screen reader; an intended user's unaided walk (D17/D20 stay with the founder); "previewed" (#3188 not merged).
