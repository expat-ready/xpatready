# PF-31 "work in many tabs": independent review, round 3 (diff only, 23 Nov 2026)

Reviewer did not build it. Previous rounds: `review.md` (round 1), `review-round2.md` (round 2). The breaker's `break-report.md` blocked round 2's heads (B1, M1–M3, m1–m4).

Heads reviewed:
* (c) API PR 3192 `448664d9961dd8b091ef6366e82c8adc87e0bec1`: `git diff a74a4738d 448664d99`, the header only.
* (b) web PR 3193 `0fb34c22e1b107789805cd243b84ae5425704759`: `git diff 7f6e9d777 0fb34c22e`. That is `c5d668053` (my round-2 Shoulds), `84de9f917` (the breaker fixes) and the check's new lines.
* (a) standard PR 3194 `9cf9b964482a258f3dd35feb26cde41a34c294cf`: `git diff 4bdb4f4c7 9cf9b9644`.

Evidence:
* The running copy on :4733 (db `xr_studio_pf31b`, built from `84de9f917`, the same code as `0fb34c22e`; AI_LIVE=off, US$0).
* My own Playwright probes `rv3.mjs`, `rv3b.mjs` and `rv3c.mjs`. They are uncommitted and live in my scratchpad.
* I signed in only as `user-S` (sample-solo) and used my own offices ("RV3 A/B …").
* I did not rerun the builder's check: it signs in as `user-R` and `user-O`, which would end the concurrent runs' sessions. I read its new lines instead.

## Verdict
* **(c) API: Ship (Approve).** It only changes the header, `if-match.ts:1` now says §2.13. My round-2 Should 3 is closed for (c).
* **(b) web: Ship after fixes (Changes).** The breaker's B1, M1, M2 and M3 and my round-2 Shoulds are all fixed in the running app. The B1 fix brings in one Must: a session that ends by itself (the 1-hour token expiry, or "Signed in elsewhere") now silently deletes the same person's unsaved typing and open tabs.
* **(a) standard: Ship (Approve).** The new text says drafts and tabs are dropped on "signing out, or another person signing in". That is the right rule. Today the code goes further than the text (Must 1). Merge (a) after (b), as before.
* Journey score (reviewer, the one score for this check): **8.5 / 10**, pass, no 0. It was 9.5 in round 2. Correct data and error recovery drop to ½ because an hourly session end loses typing.

## The breaker's findings and my round-2 Shoulds, checked in the app
* **B1, drafts and tabs crossing people and firms: fixed.** `drafts.tsx` keys every draft and message with `who` (a hash of the token, `session.ts` `staffScope`). `workspace.tsx` stores `who` with the tabs and resets them on a change of person.
  * Probe B1b: I typed a draft, then signed out. Drafts went 1 → 0, the stored tabs were `who:null` with one tab, and there was no strip. Signing in again through the card gave no drafts and one tab.
  * Probe B1 (rv3b): a BroadcastChannel draft from another owner is ignored (the field is unchanged and nothing is stored). The same message with this session's own scope does mirror, which is the control.
  * A corrupt `xr.workspace.v1` (a non-string title, `null`, `//evil…`, an id with `"`) gives one clean tab and no page error (m1). The version shape is checked before If-Match (m2).
* **M1, keep mine dropping "where": fixed.** `mineOnto` groups `WHERE_GROUP` (`office-panel.tsx:25`). Probe: I picked AB while a colleague moved the office to GB (200).
  * The row read "Where: United Kingdom | AB, Canada". Both sides are now in words, so my round-2 Should 4 is fixed.
  * After Keep mine, the form showed In Canada / AB, and Save stored `CA AB`.
* **M2, a draft in an unmounted tab losing its guards: fixed.** Each draft records its item (`at`).
  * After a reload, the office tab not shown still has its dot, and a synthetic `beforeunload` is prevented.
  * × asks once: No keeps the tab and the draft, and the draft comes back when the tab is opened. Yes drops both, and focus goes to the active tab.
  * At the cap with a drafted tab, the drafted tab is kept, a clean one is closed, and the notice says "12 items were open… so one was closed".
* **M3, sideways scroll at 1024 px: fixed** (`relative` on each tab button). With 12 tabs with long titles at 1024 px, `scrollWidth` = 1024.
* **Round-2 Shoulds 1–2 (focus): fixed.** After Save, Close or Yes on ×, focus is on the selected tab, never `<body>` (`workspace.tsx` `leave()`, and `close()` on a background tab). Should 3 (headers) is fixed in all three files. Should 4 is fixed (above).
* Not changed: the breaker's m3 (arrow keys landing inside an office tab's dialog; Alt+PageUp/Down still work) and m4 (the people PATCH with no version, recorded as intended in the study). Both are Minor and need no action for this item.

## Issues, ranked
**Must**
1. **(b) A session that ends by itself erases the same person's unsaved typing and open tabs, with no question and no message.**
   * **Cause.** `drafts.tsx` (the `onStaffChange` handler) clears `entries` and every stored `xr.draft.*` whenever `staffScope()` changes. `workspace.tsx` (the new `onStaffChange` effect) resets to one tab. The scope is a hash of the *token*, and the token changes on every session end: `session.ts:67` `endSession("TOKEN_EXPIRED")` after `expiresIn` = 3600 s with no refresh (`api/src/platform/identity/service.ts:199`), and any 401 such as SIGNED_IN_ELSEWHERE.
   * **Probe rv3c.** I opened 3 tabs and typed in one office, with the token set to expire in 20 s. After expiry: drafts 1 → 0, stored tabs 3 → 1 (`who:null`). The page shows only "Sign in to your firm", with nothing about the lost changes. Probe rv3b (Signed in elsewhere) gives the same result: the draft is gone, and the notice says nothing about it.
   * **Why it matters.** In round 2 a draft survived a session end and came back after signing in again in the same tab. Now every staff member loses everything they typed once an hour. This conflicts with §2.13 "each tab keeps its state … typed values; drafts come back", with BIC-21 "kept over a reload … asked about before its tab closes", and with the (a) text itself, which drops drafts only on "signing out, or another person signing in".
   * **Fix.**
     * Scope drafts and tabs to the *person and firm*, not the token. Use the sign-in answer's `staffId` + `firmKey` (or the token's `sub` + firm), hashed.
     * On a session end, keep them stored but unread while signed out (`who` = null already hides them).
     * On the next sign-in, show them again if it is the same person, and drop them if it is anyone else. An explicit Sign out may still drop them, as (a) says.
     * Add a check: a draft and 3 tabs, then expire the token, then sign in again as the same person: both are back. A different person: neither is.
   * This keeps B1 closed: another person never matches, and the broadcast filter is unchanged.

**Should**
2. **(b) The check does not test the B1 broadcast filter, the cap, or the unmounted tab's close question and leave guard.** `check_pf31_multitab_browser.ts` covers only the M2 dot (T6) and the same-tab sign-out/sign-in for B1. Breaker cases with no check line:
   * Two windows owned by two people, where one person's typing must not reach the other.
   * × on an unmounted drafted tab must ask.
   * `beforeunload` with only a stored draft must be prevented.
   * At the cap, the drafted tab must be kept.

   My probes show all four hold today, but removing any of those code paths would not fail the check. Fix: add one line each. For the broadcast, post a draft with another `who` from a second page, as `rv3b.mjs` does.
3. **(b) The B1 check signs in as `user-O`** (`check_pf31_multitab_browser.ts`, the last block). Its comment still says "Last: it signs T out". Fix the comment. Signing in as a person the breaker also uses will end the breaker's session during concurrent runs. Consider `user-T`, or note the collision.

## Journey test (reviewer role), on the changed paths
Journeys, as the firm's representative:
* Edit with a colleague's "where" conflict: held.
* Reload with a draft in a hidden tab, then close it: held.
* 12 tabs at 1024 px: held.
* Sign out and sign in: held.
* **An hour's session ends mid-edit: failed** (Must 1).
* Break-it: another owner's broadcast is ignored; corrupt stored tabs do not crash; no page errors.

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Edit, conflict and Save all finish |
| Next step obvious | 1 | Tabs close on Close or Save; the cap notice says what happened |
| Plain words | 1 | "Where: United Kingdom / AB, Canada"; "12 items were open…" |
| Feedback and state | 1 | The dot survives a reload; close asks; focus stays on the strip |
| Correct data | ½ | Keep mine keeps the whole "where" (CA AB stored). A session end deletes typed work silently (Must 1) |
| Error recovery | ½ | Recovery from a conflict works. Recovery from a session end loses everything (Must 1) |
| Accessibility and screen sizes | 1 | No sideways scroll at 1024 px with 12 tabs; focus is never on `<body>`; axe is clean (round 2, unchanged markup) |
| Speed | 1 | Unchanged |
| Visual quality | 1 | Unchanged; the strip scrolls inside itself |
| Trust and sources | 1 | Another person's draft is never shown or saved |
| **Total** | **8.5 / 10** | **Pass**; Must 1 still blocks (b) |

## Could not check
* A real screen reader, Safari or Firefox.
* Two real people in two windows: the local identity keeps one session per person, and the other people are in use by the breaker. I simulated it with a broadcast from another owner.
* The builder's full check at this head (not rerun, to keep sessions isolated).
* An intended user's unaided walk (D17/D20 stay with the founder).

**Verdict: Block** for (b) until Must 1 is fixed. **Approve** for (c) and (a).

Reviewer:
* (c) Approve 448664d9961dd8b091ef6366e82c8adc87e0bec1
* (b) Changes 0fb34c22e1b107789805cd243b84ae5425704759
* (a) Approve 9cf9b964482a258f3dd35feb26cde41a34c294cf
