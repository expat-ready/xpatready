# PF-31 "work in many tabs": break report, round 4 (23 Nov 2026)

Breaker did not build it. Heads: web `da3ad249` (`git diff 0fb34c22e 182dad581`, then `git diff 182dad581 da3ad2497`) · standard `1f41ceb8` · api `448664d9` (unchanged). The copy was on :4734 (`xr_studio_pf31c`, AI_LIVE=off, US$0). My own records: offices Brk Halifax `91567e17…` and Brk Regina in `sample-solo`. I used user-S, plus user-O once, as the other firm's person. The forged tokens were never sent to the server as a real sign-in. The probes are Playwright scripts in the session scratchpad and were not committed.

How the fix works:
* The owner is a hash of the JWT's `iss|sub`. In this local mode `sub` is the staff row id; in Cognito it is `identity_subject`, which the schema keeps unique. So no two firms share a `sub`.
* Each owner has its own tab list, `xr.workspace.v1:<owner>`, or `:local` where there is no staff session.
* Sign out on purpose (`sessionEndReason()` null) drops that person's drafts and tabs. A session that ends by itself keeps them, hidden.

## Attempts
| # | Attempt | Result |
|---|---|---|
| F1 | S types "Brk Halifax PRIVATE S draft" in the office tab, then Sign out (platform header) | **Held.** Storage keeps only `xr.workspace.v1:local` (one generic "Offices" tab). No draft key and no S tab list are left. When S signs in again, the field shows the saved name and no draft. |
| F2 | The signed-out "local" scope: `/`, `/cases`, and S's office address | **Held.** The local list holds only Studio and case pages plus the generic "Offices" tab from the page S signed out on. The office address while signed out shows no dialog and no strip. Studio and case-area tabs now come back after a reload (round-3 M2 fixed). |
| F7 → F5a | Session ends by itself ("signed in elsewhere": `POST session/local` for user-S), then the same person signs in | **Held.** At the 401 the draft and S's tab list stay hidden. After S signs in again, "Brk Halifax KEPT S draft" and the office tab with its dot come back. |
| F5b | Expiry (`expiresAt` in the past), then the same person | **Held.** "Brk Halifax S expiry draft" comes back with the tab and the dot (round-3 M1 fixed). |
| F6 | Expiry for firm A's person (S), then firm B's person (O) signs in | **Held.** O sees one tab ("Leads"). S's draft key and S's tab list are removed from storage. S signing in afterwards gets no draft (F6b). |
| F3 | A forged JWT-shaped token (`sub` = S's staff id, bad signature) in sessionStorage, while S's hidden draft is kept (after F7) | **Partly.** See m1. On the staff pages (`/platform/offices`, the office edit page) the first paint shows **no** strip and no form. `GET /platform/me` → 401 first, so the draft never shows or saves. |
| F4 | A forged token for another firm's person (user-T's `sub`) | **Held.** Studio shows only the local "Immigration programs" tab; nothing of S. |
| F8 | Two windows of one session (`window.open`), then Sign out on purpose in window 1 | **Partly.** See m2. |
| — | A tab id with quotes | **Held** by reading the code: `keptTab` now requires `^[A-Za-z0-9_-]{1,40}$` (round-3 m2). |

## Findings

**m1 Minor: a forged token shows the kept person's tab titles and unsaved dots in Studio, which never checks the staff token.**
* Repro: after F7, S's draft is kept hidden. Write `{"token":"<header>.<{iss:'expatready-local-standin',sub:'<S staff id>'}>.AAAA", expiresAt: now+1h}` to `xr-staff-session` and open `/`.
* The strip shows "Office: Brk Halifax, **unsaved changes**", the office address and S's other tabs. They are still there after 2.5 s, because Studio calls only `/api/runs`, `/api/draft`, `/api/session` and `/api/catalogue`, never `/platform/me`.
* `staffScope()` (`session.ts`) decodes the JWT payload without checking it, and `ownerNow()` (`workspace.tsx`) uses it on non-staff frames.
* No draft value shows and nothing can be saved. Writing sessionStorage already lets a person read the kept draft directly, so this adds titles only. Hence Minor, in line with the "same-origin script out of scope" ruling.
* An easy hardening: use the staff scope only after `/platform/me` has confirmed the token (or `"local"` until then).

**m2 Minor: Sign out on purpose in one window leaves the draft and tabs in the person's other window.**
* Repro: S has the office open in window 1 and window 2 (same session, mirrored), with the draft "Brk Halifax two-window draft". S signs out in window 1.
* Window 1 now holds 0 drafts. Window 2 holds **1**, and still shows the open panel with the draft.
* After window 2 reloads, it shows the sign-in card. Its storage still holds the draft and `xr.workspace.v1:<S>`, because its next request ends the revoked session "by itself" (`sessionEndReason()` set) and so keeps them.
* Nothing shows to another person: the next sign-in in window 2 drops them, and a Save would be 401. But the new rule, "Sign out on purpose drops them, so nothing is left in storage for the next person at a shared computer", does not hold for the second window.
* Fix: broadcast a "signed out" message to the same owner's windows over `xr-sync` so they drop their copies too, or reword the standard.

## What held
B1 held in all of F1, F2, F4, F5, F6 and F7. No page errors in any run. Re-checked fixes: round-3 M1 (the person's own draft survives expiry and "signed in elsewhere"), round-3 M2 (local tab lists come back after a reload) and round-3 m2 (tab ids) are fixed. Round-3 m1 is now a scope ruling (a same-origin script in the same profile is out of scope); the standard's wording "never shows or saves" matches what I observed. The API is unchanged, so the round-1 If-Match/ETag results still stand.

Breaker: Approve. m1 (a forged token shows the kept person's tab titles in Studio; no draft value, no save) · m2 (Sign out in one window leaves the draft hidden in the person's other window's storage). Both are Minors, for the PR's list or a follow-up row.
