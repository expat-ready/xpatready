# PF-31 "work in many tabs": break report, round 3 (23 Nov 2026)

Breaker did not build it. Heads: api `448664d9` (a comment only, vs `a74a4738`) · web `0fb34c22` (fixes in `c5d66805`, `84de9f91`) · standard `9cf9b964`. I read the code with `git diff 7f6e9d777 0fb34c22e` and attacked the fresh copy on :4733 (`xr_studio_pf31b`, built from `84de9f91`, AI_LIVE=off, US$0). My own records: offices Brk Halifax `417acb52…` and Brk Regina in `sample-solo`, and lead L-00003 `cf3c104a…` in `sample-firm`. I used user-O, user-T and user-S only. The probes are Playwright scripts in the session scratchpad and were not committed.

## B1 bypass attempts (the fix: owner = a hash of the session token; `session.ts` `staffScope`/`onStaffChange`; `drafts.tsx` `valid`/`who`; `workspace.tsx` `load`)
| Attempt | Result |
|---|---|
| Same tab: O types `+1 416 555 7777` and signs out. T signs in with the in-app form, **no reload** | **Held.** At sign-out the draft key is removed and the workspace is reset to one tab (`who:null`). T sees the field closed, no draft line and one tab. |
| Two windows, two people (T in window 1, O in a fresh window 2) | **Held in the app.** O's field stays closed and shows no "other windows" line while T types. |
| A forged `who` in `xr.workspace.v1` | **Held.** With another session's scope the tabs are ignored. With this session's own scope, the object title and the `//evil.example` path are dropped; see m2 for an id that is still accepted. |
| A stale draft from before the session changed (expiry, then reload) | **Held** for leaks: the draft is not shown while signed out, and a new sign-in clears it. That clearing is what M1 below is about. |
| BroadcastChannel messages with a forged `who`, sent from a page under my control | **Partly.** See m1. |
| The person's own draft survives a reload | **Held.** T's `+1 416 555 1111` is back after a reload, with the dot. |
| A second window of the same session (`window.open`, which copies sessionStorage) mirrors | **Held.** It mirrors at once, with "also open in 1 other window". |

## Earlier findings re-checked
* **M1 (Keep mine, "where"): fixed.** I picked AB while a colleague moved the office to GB. 409 → table "Yours: AB, Canada" → Keep mine → Save → stored `CA|AB`. In the reverse case, I changed only the name while a colleague moved it to GB: Keep mine stored `name mine|GB`, so their change was kept.
* **M2 (inactive-tab drafts after reload): fixed.** After the reload the unmounted office tab shows "unsaved changes". × asks once, and No keeps the tab. The `beforeunload` guard fires. At the cap, a drafted last tab is kept, a tab without a draft (x3) is dropped, and the notice "12 items were open… one was closed" shows.
* **M3 (1024 px): fixed.** With 12 long titles the document stays 1024 px wide.
* **m1/m2 (hostile storage): fixed, with one leftover (m2 below).**

## New findings

**M1 Major: when the session ends, the person loses their own unsaved typing, with no warning and no way back.**
`onStaffChange` treats any change of token as a change of owner (`drafts.tsx` `onStaffChange` → removes every `xr.draft.*`). `endSession` on a 401 and every new sign-in fire it, even when it is the same person.
* Repro 1 (401): T types `+1 416 555 5555` on L-00003. T's session is then ended elsewhere: `POST session/local` for user-T, the local identity's one session per person. T presses Save → 401 → the sign-in card shows, and **storage already holds no draft**. T signs in again → the field is closed and the number is gone.
* Repro 2 (expiry): T types `+1 416 555 8888`. The stored session's `expiresAt` passes (the default token lasts 1 h) → reload → the draft key is still there, the sign-in card shows → T signs in again → **0 drafts**, the typing is gone.
* The same thing happens for "a second window" opened by hand (Ctrl+N or pasting the address). It needs its own sign-in, which ends window 1's session for that person, so window 1's draft goes at its next request.
* This breaks §2.13 and BIC-21: drafts are "kept over a reload", and "nothing typed is lost" is the reason drafts exist. The standard's new sentence only covers "signing out, or another person signing in".
* Expected: the owner is the person and firm (staff id + firm id from `/me`), not the token. A session that ends keeps the draft hidden until that same person signs in again; another person signing in still drops it. At minimum, say so before discarding.

**M2 Major (a regression from the B1 fix): tabs no longer come back after a reload in Product Studio and the case area.**
`load()` keeps tabs only when `staffScope()` is set (`workspace.tsx` `load`: `s.who === staffScope() && staffScope()`). Studio (`/`) and the case area (`/cases`) are staff frames with the strip (`App.tsx` Shell `workspace`, `runtime/cases.tsx` `workspace={!client}`), but they run on simulated people and have no staff token.
* Repro: at `/`, Ctrl-click "Program structure" → 2 tabs → reload → 1 tab. At `/cases`, Ctrl-click "Clients" → 2 tabs → reload → 1 tab. The stored `who` is `null`.
* This breaks §2.13 ("open tabs … come back after a reload"; Rollout: "the strip is on every staff frame now"). Either scope those areas by the simulated person, or narrow the standard to staff-token areas and record that.

**m1 Minor: other people's windows still receive every draft, and any same-origin script can forge one.**
`post()` sends every draft, with its values in clear, to every window of the browser. Only the receiving app filters by `who`.
* From O's window (devtools / a same-origin script) I read T's broadcast `{"t":"draft",…"values":"+1 416 555 4444","who":"5txtcg1bq45ve",…}`. I then posted it back with `values:"+1 416 555 6666"`, and **T's field changed to 6666**.
* This needs script access in the same browser profile, so it is Minor. But the standard's new words "another person's window never receives them" are not true at the transport level. Reword the standard, or end-to-end key the channel by session.

**m2 Minor: `keptTab` still accepts an id with quotes** (`workspace.tsx` `keptTab`: length only). A kept tab `{"id":"c\"]",…}` under the session's own scope is restored, and `focusTab`'s selector (`[data-ws-panel="c"]"]`) throws on Alt+PageDown or Delete (seen in round 1). It is not a crash. Restrict ids to `[a-z0-9]`.

## What else held
No page errors in any run. The API is unchanged apart from a comment, so the round-1 If-Match/ETag results still stand.

Breaker: Changes. M1 (own unsaved draft lost when the session ends: a 401, a 1 h expiry, or a second sign-in) · M2 (Studio and case-area tabs no longer survive a reload) · m1 (drafts still broadcast in clear to other people's windows; forgeable) · m2 (a quoted tab id is still accepted). B1 held in all seven attempts. Round-1 M1, M2, M3, m1 and m2 are fixed.
