# PF-31 "work in many tabs": independent review, round 4 (diff only, 23 Nov 2026)

Reviewer did not build it. Previous rounds: `review.md`, `review-round2.md`, `review-round3.md` (round 3: (b) Changes, Must 1: an ended session wiped the person's own drafts and tabs). The breaker's `break-report-round3.md` raised M1 (the same thing), M2 (Studio and case-area tabs no longer restore), m1 (drafts broadcast in clear) and m2 (a quoted tab id).

Heads reviewed (the heads moved during this round; I reviewed the last ones):
* (c) API PR 3192 `448664d9961dd8b091ef6366e82c8adc87e0bec1`: unchanged since round 3 (approved).
* (b) web PR 3193 `da3ad2497818aabeb5abee37b02bdbfc6575e4e0`:
  * `git diff 0fb34c22e 182dad581`: drafts and tabs belong to the person; tabs restore without a staff session.
  * then `git diff 182dad581 da3ad2497`: Sign out on purpose drops them, and only a session that ended by itself keeps them.
* (a) standard PR 3194 `1f41ceb83edaf5e8aeb0b0e947723d2078d797e5`: `git diff 9cf9b9644 1f41ceb83`.

Evidence: my uncommitted probes in my scratchpad, signed in only as `user-S` (sample-solo), on my own offices "RV4 …".
* `rv4.mjs` on :4733 (`xr_studio_pf31b`, built from `182dad581`).
* `rv4b.mjs` on :4734 (`xr_studio_pf31c`, which has `da3ad2497`'s change).

I read the check's new lines. The builder reports 63/63 with exit 0, twice. I did not rerun it, because it signs in as R and T.

## Verdict
* **(c) API: Ship (Approve).** Unchanged.
* **(b) web: Ship (Approve).** Round-3 Must 1 is fixed. The breaker's M2 and m2 are fixed. m1 is settled by the standard's wording (a same-origin script in the same profile is out of scope; the app never shows or saves another owner's draft). Shoulds remain (below); none is a Blocker or Major.
* **(a) standard: Ship (Approve).** §2.13 now says exactly what the code does:
  * a session that ends by itself keeps drafts and tabs hidden for that person;
  * Sign out, or another person signing in, drops them;
  * another person's window never shows or saves them.

  Merge it after (b), as before.
* Journey score (reviewer, the one score for this check): **9.5 / 10**, pass, no 0.

## Earlier findings, checked in the app
* **Round-3 Must 1 / breaker M1 (own typing lost at session end): fixed.**
  * `staffScope()` now hashes the token's `iss|sub` (the staff id), not the token (`session.ts:49-56`).
  * `drafts.tsx:41` keeps the drafts of the person whose session ended (`sessionEndReason()` set). `workspace.tsx` keeps one list per owner (`xr.workspace.v1:<owner>`).
  * Expiry (rv4b A): token set to expire in 20 s, with 3 tabs and a draft. After expiry, the person's list and draft stay stored and hidden; the page shows the sign-in card. When the same person signs in again, all 3 tabs come back with the dot, and so does the typing.
  * Signed in elsewhere (rv4b C): same result; the typing is back after "Sign in again here".
  * The builder's check covers the same flow (lines ~271-279).
* **Sign out on purpose (`da3ad2497`) drops everything** (rv4b B). After Sign out only `xr.workspace.v1:local` remains: no draft, and no staff tab list. Signing in again gives one tab. The new check line asserts this.
* **B1 still holds.**
  * Another person signing in removes the other owners' drafts (`drafts.tsx:41-42`) and lists (`workspace.tsx:198`).
  * A broadcast from another owner is ignored; the check has a new line for it (`check_pf31_multitab_browser.ts:207`).
* **Breaker M2 (no restore without a staff session): fixed.** Owner "local" for Studio and the case area. In `/cases`, 3 tabs → reload → the same 3 (rv4 P3); the check has a new line for `/cases` (:295).
* **Breaker m2 (quoted tab id): fixed.** `keptTab` now accepts only `[A-Za-z0-9_-]{1,40}`. A stored `c"]` id is dropped, and Alt+PageDown gives no page error (rv4 P4).
* **Round-3 Should 3 (the check's comment and actor): fixed.** It names user-T and records the collision.
* **Round-3 Should 2 (check lines): partly.**
  * Added: the broadcast filter (:207), and "× on an unmounted drafted tab asks; No keeps it" (:120).
  * Still missing: the leave-page guard with a draft only in storage, and the cap keeping the drafted tab. Both hold in my probes (round 3).

## Issues, ranked (no Must)
**Should**
1. **(b) Sign out discards unsaved typing without asking.**
   * rv4b B: the office tab showed the unsaved dot, I pressed Sign out, and saw 0 dialogs; the draft was gone.
   * §2.13 says "a tab with unsaved changes … asks before it closes", and Sign out now closes every tab and drops its drafts (by design, for a shared computer).
   * Fix: in `platform/frame.tsx:86` `signOut` (and `front-office/sales/sales-frame.tsx:61`), when `anyDraft()` is true, ask first ("You have unsaved changes in N items. Sign out and discard them?").
2. **(b) Sign out whose server call answers 401 keeps the drafts after all.**
   * `frame.tsx:90`: when `/session/sign-out` answers 401 (the session already ended on the server, for example signed in elsewhere or expired early), the 401 handler has already called `endSession(<reason>)`. `sessionEndReason()` is then set, so `drafts.tsx:41` and `workspace.tsx:196` keep the person's drafts and tabs in storage, although the person pressed Sign out on purpose.
   * This is the shared-computer case the change is for.
   * Fix: after a Sign out click, drop them whatever the answer. For example, purge explicitly in `signOut`'s `finally`, or pass a "signed out" marker that wins over the reason.
3. **(b) A staff address reaches the shared "local" tab list.**
   * While signed out, a staff page's tab is saved under `xr.workspace.v1:local` (`workspace.tsx:93`, owner "local" when there is no staff token).
   * rv4 P2 and rv4b C: `/platform/offices/<uuid>|Offices` sits in the local list.
   * Nothing removes that list at a change of person (`:198` keeps `local`). It then shows in Studio or the case area to anyone using that browser tab with no staff session.
   * The record's name is not leaked (the title is the generic "Offices"), only its id.
   * Fix: do not keep `/platform/*` and `/front-office/*` paths in the local list (or do not persist while signed out in a staff area).
4. **(b) Two check lines are still missing** (round-3 Should 2): `beforeunload` with a draft only in storage, and the 12-tab cap keeping the drafted tab.

## Journey test (reviewer role), on the changed paths
Journeys, as the firm's representative:
* An hour's session ends mid-edit, then I sign in again: **held** (round 3: failed).
* Signed in elsewhere, then "Sign in again here": held.
* Sign out, then sign in: held (nothing kept).
* Studio and case-area tabs survive a reload: held.
* Break-it: a quoted tab id is dropped; another owner's broadcast is ignored; no page errors.

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Edit and Save; recovery after an expiry |
| Next step obvious | 1 | Sign in again brings back the tabs as they were |
| Plain words | 1 | Unchanged |
| Feedback and state | ½ | Sign out drops a dotted tab's typing with no question (Should 1) |
| Correct data | 1 | Typing kept across a session end; nothing of the last person shown to the next |
| Error recovery | 1 | Expiry and "signed in elsewhere" both recover the draft |
| Accessibility and screen sizes | 1 | Unchanged since round 3 (1024 px, focus, axe) |
| Speed | 1 | Unchanged |
| Visual quality | 1 | Unchanged |
| Trust and sources | 1 | Another person never sees or saves a draft; only an id-only address can stray into the local list (Should 3) |
| **Total** | **9.5 / 10** | **Pass** |

## Could not check
* Production identity: whether one person has the same token `sub` in two firms. If so, the same person would get their firm A tabs in firm B. That is not a leak to another person, and a save would hit a 404.
* A real screen reader, Safari or Firefox.
* Two real people in two windows (simulated in round 3).
* An intended user's unaided walk (D17/D20 stay with the founder).

**Verdict: Approve** (no open Blocker or Major), for all three PRs.

Reviewer:
* (c) Approve 448664d9961dd8b091ef6366e82c8adc87e0bec1
* (b) Approve da3ad2497818aabeb5abee37b02bdbfc6575e4e0
* (a) Approve 1f41ceb83edaf5e8aeb0b0e947723d2078d797e5

## Follow-up: web head `3966a0f8837381ef9ca5a80c3ccef12123f8c34d` (diff only, `git diff 4f20cff18 3966a0f88`)
Since `da3ad2497` it adds the round-4 report files and one CI-fix commit. I checked it on :4736 (`xr_studio_pf31d`, built from this head) with my own probes `rv4c.mjs` and `rv4d.mjs` (uncommitted, in my scratchpad). I used the Studio picker only (simulated people), with no staff sign-in.

* **PersonNotice outside WorkspaceRouter** (`App.tsx:46`): correct.
  * The component uses only `useToast` and `onActorChange` (`components/frame.tsx:181-197`) and no router hook, so mounting it outside the router is safe. It is still inside `ToastProvider` (`main.tsx`).
  * Probe rv4d, Studio with 1 tab and then with 3 tabs: one change of person in the picker pushes **one** notice.
  * Each tab's frame draws its own toaster (`frame.tsx:116,125`, from before this PR), and all of them read the one toast list. With 3 tabs, exactly one toaster is visible: the shown tab's (`checkVisibility` true). The other two are inside `hidden` panels, so they are neither shown nor announced. The `aria-live` region of a `display:none` panel is out of the accessibility tree.
  * Probe rv4c: changing the person from the second tab also gives one notice. A second browser window shows its own single notice, and none shows in the first window. No page errors.
* **check_bk4a's pattern** (`tests/check_bk4a.ts:91`): it accepts `<><PersonNotice /><WorkspaceRouter>` and still fails if the notice moves back inside the router (`<WorkspaceRouter><PersonNotice />` does not match `<(BrowserRouter|)><PersonNotice`). Fine.
* **"Open items" shows FoldArrow under 768 px** (`workspace.tsx:282`): `FoldArrow open={menu}` next to `aria-expanded`. It is a visual cue only, with no change in behaviour.
* **`web/src/runtime/MODULE.rows/PF-31.md`**: one line naming the check. Fine.
* Round-4 Shoulds 1–4 are not in this PR. They are deferred to a follow-up, as the coordinator recorded, and remain open there. None is a Blocker or Major.

**Verdict: Approve** for (b) at this head. (c) and (a) are unchanged and stay approved.
(b) Approve 3966a0f8837381ef9ca5a80c3ccef12123f8c34d
