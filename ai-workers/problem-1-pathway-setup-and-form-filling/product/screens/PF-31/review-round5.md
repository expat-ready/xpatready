# PF-31 "work in many tabs": independent review, round 5 (diff only, 23 Nov 2026)

Reviewer did not build it. Scope set by the tech lead: exactly two fixes, review round 4 Should 2 and breaker round 4 m2.
* (b) web PR 3193, head `95114f969d9756fbb415e91cb8e822adfb7eb6f3`. Reviewed: `git diff 03e82b4f5 95114f969` (4 files, +35/-5).
* `03e82b4f5` is a pure merge: `git show --remerge-diff 03e82b4f5` has no hunks (no conflict resolution). Its first parent `9d6df7337` is the approved `3966a0f88` plus `review-round4.md` only. I looked at nothing else from main.

Evidence: my probes `rv5.cjs` and `rv5b.cjs` (uncommitted, in my scratchpad) on :4738 (`xr_studio_pf31r5`, built from this head). Signed in as `user-S` (sample-solo) only, on my own offices "RV5 Halifax" and "RV5 Regina". No page errors in any run. I did not rerun the check (it signs in as R and T). The builder's logs agree with my reading: the old code gives 63/65 and fails exactly the two new lines; the new code gives 65/65, twice.

## Verdict
**(b) web: Ship (Approve).** Both findings are fixed for the case they describe. One narrower residual case remains (Should 1 below). It is the same class as m2, a Minor: nothing is shown to or saved by another person. No Blocker or Major.

Journey score (reviewer, the one score for this check): **9.5 / 10**, pass, no 0.

## The two findings
* **Review round 4 Should 2 (Sign out answered 401 kept drafts and tabs): fixed.**
  * `frame.tsx:89` calls `signOutHere()` before the server call. `forget()` (`drafts.tsx:116-120`) clears memory, every `xr.draft.*` key and every staff tab list (`xr.workspace.v1:*` except `:local`).
  * So when the 401 then sets a reason (`session.ts:99`), there is nothing left to keep.
  * The workspace does not write the list back while the call is pending: its save effect runs only on `[tabs, active]` (`workspace.tsx:93-95`), and `forget()` changes neither.
  * Probe A: S's draft on RV5 Halifax, the office tab showing "unsaved changes", the session ended on the server, then Sign out. The answer was 401. Storage afterwards: `["xr.workspace.v1:local"]`, with no draft. The page shows "Signed in elsewhere" with focus on its heading.
* **Breaker round 4 m2 (the other window kept the draft): fixed for a signed-in window.**
  * `signOutHere()` posts `{t:"signout"}` with the sender's owner. The receiver (`drafts.tsx:76`) runs `forget()` and then `endSession(null)`.
  * The reason is null, so the receiver's own `onStaffChange` handlers (`drafts.tsx:42`, `workspace.tsx:197`) keep nothing either.
  * Probe A: window 2 showed the same draft. After Sign out in window 1, window 2 has storage `["xr.workspace.v1:local"]`, no dialog, and the sign-in card. After a reload it is still signed out and still empty.

## Does it break anything else
* **A "signout" from another owner is ignored.** The general filter (`drafts.tsx:74`, `m.who !== who`) runs before the new branch. Probe A posted three messages on `xr-sync`: `who:"someoneelse"`, `who:null`, and one with no `who`. Windows 1 and 2 stayed signed in and kept the draft. In the other direction, S's Sign out did not touch a window holding another owner's token (probe A, w3: its token and its own list were still there).
* **A signout reaching a window already signed out is ignored** (`!who`, `:74`). Probe A, w4: storage and focus were unchanged, with no error. One case is not covered; see Should 1.
* **The sales frame's Sign out.** `sales-frame.tsx:62` now calls `signOutHere()` before `setStaffToken(null)`. Probe C: Sign out from `/front-office/leads` emptied that window and also the second window, which had the office draft open. That window now shows the sign-in card, with no dialog.
  * Noticed outside the diff, not from PF-31: the sales frame never calls `/platform/session/sign-out`. After its Sign out the same token still gets 200 from `/platform/me`. That is for the lead to triage, not this round.
* **The order of events in the sending window.** The broadcast goes out before `forget()`, while `who` is still set (`post` needs it). After a 200, `endSession(null)` runs as before. After a network error or a 5xx, it still signs out. A late 401 for the replaced token is still ignored (`session.ts:99`).
* **Notice.** A receiving window shows the plain sign-in card with no message. That matches the person's own Sign out, so it is acceptable. After a deliberate Sign out answered 401, the person sees "Signed in elsewhere". That text is true, and the 401 branch (`frame.tsx:91-92`) is unchanged.
* **Focus** (Should 2, not from this diff). After Sign out, focus lands on `BODY`, both in the signing-out window after a 200 (`rv5b` b1, f1) and in a receiving window brought to the front (f2). The 401 case is fine: "Signed in elsewhere" focuses its heading.
  * Cause, by reading: `endSession` makes `workspace.tsx:200-202` load the "local" list, which has new tab ids. The `TabHost` and its `PlatformFrame` remount, so `had` (`frame.tsx:85`) is false and `SignInCard focus` (`frame.tsx:103`) is not set.
  * That code is unchanged since the approved `3966a0f88` (round 4 introduced the per-owner reload).
* **The new check lines test the fix.**
  * `check_pf31_multitab_browser.ts:293` reaches the 401 path for real: R signs in elsewhere just before the click.
  * `:294` can pass only through the broadcast. Without it, window 2 makes no call within the 10 s. Even after a call, a 401 would set a reason, and the draft would be kept.
  * `kept2` and `staffLists` read storage, not the screen, which is the right test for a shared computer.
  * Not covered by the check (my probes cover them): a foreign "signout" being ignored (the filter is shared with the draft message, which `:207` tests), the sales frame's Sign out, and a 200 Sign out across windows.

## Issues, ranked (no Must)
**Should**
1. **A window whose session ended by itself keeps the person's draft and tabs after that person signs out on purpose in another window.**
   * `drafts.tsx:74` returns on `!who` before the `signout` branch.
   * Probe `rv5b` B': window 2 holds S's draft. Its session ends by itself ("Signed in elsewhere"), so it keeps the draft hidden, as designed. S signs in again in window 1, then signs out.
   * Window 2 still holds `xr.draft.platform-office:630610c0…` and `xr.workspace.v1:71dtvg1tfbcwa`. A realistic path: one token expires in both windows, the person signs in again in one window only, then signs out.
   * Nothing is shown to anyone: the next person to sign in there drops them, as B1 does. But "Sign out on purpose leaves nothing for the next person at a shared computer" does not hold for that window. Probe A's simpler window (no kept draft, w4) is fine.
   * Fix: handle `t:"signout"` before the `!who` return when `m.who` is set. Drop the stored drafts whose `who === m.who` and the list `xr.workspace.v1:<m.who>`. Call `endSession(null)` only when `who === m.who`.
2. **Focus goes to the page body after Sign out** (pre-existing in the approved code, not from this diff). See "Focus" above (`workspace.tsx:200-202`, `frame.tsx:85,103`).
   * Fix: keep "a session was seen here" outside the remounted frame, for example a module-level flag set at sign-out. Or move focus to the sign-in card's heading after the workspace reload.
3. Round-4 Shoulds 1, 3 and 4 remain open in their follow-up, as recorded. They are out of this round's scope.

## Journey test (reviewer role), on the changed paths
Journeys, as the firm's representative at a shared computer:
* Sign out after the session already ended on the server: **held** (round 4: failed).
* Sign out with the same record open in a second window: **held** (round 4: failed).
* Sign out from Sales with a draft in another window: held.
* Break-it: a forged or foreign "signout" is ignored; an already signed-out window is untouched; a residual signed-out window with kept typing (Should 1).

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Sign out empties this window and the person's other windows (probes A, C) |
| Next step obvious | 1 | The sign-in card, or "Signed in elsewhere" with "Sign in again here" |
| Plain words | 1 | Unchanged |
| Feedback and state | ½ | Sign out still drops typing with no question (round-4 Should 1) |
| Correct data | 1 | Storage only `xr.workspace.v1:local` after Sign out, 200 or 401 |
| Error recovery | 1 | A 401 or network failure on Sign out still forgets and ends the session |
| Accessibility and screen sizes | 1 | The 401 notice takes focus; the body focus after a 200 is pre-existing (Should 2) |
| Speed | 1 | The other window empties within about 1 s |
| Visual quality | 1 | Unchanged |
| Trust and sources | 1 | Nothing of one person is shown to or saved by another; Should 1 is storage only |
| **Total** | **9.5 / 10** | **Pass** |

## Could not check
* Safari and Firefox `BroadcastChannel` timing, and a real screen reader.
* The check myself (it signs in as R and T on sample-firm). I read it and the builder's two 65/65 logs and the 63/65 log on the old code.
* An intended user's unaided walk (D17/D20 stay with the founder).

**Verdict: Approve** (no open Blocker or Major).
(b) Approve 95114f969d9756fbb415e91cb8e822adfb7eb6f3
