# PF-13 part 2: Branding panel — independent review (round 1)

Reviewer: a fresh agent that did not build the screen, 22 Nov. Commit **39253167e19404c934996bf81266e66668452cc4** (branch `claude/jolly-ramanujan-eb9jik`, PR #2910). Isolated copy `pf13rev` on :4442 (fresh database, `AI_LIVE=off`, `PLATFORM_IDENTITY=local`), stopped afterwards. US$0. Read: concept, challenge, build notes, screenshots, STANDARDS, EXPERIENCE, QUALITY, the diff (`web/src/modules/platform/branding/*`, the route and menu lines, the check). The API (parts 1a, 1b) is merged and was not reviewed.

## Verdict
**Ship** (Approve): no Blocker, no Major; seven Minors below, each a Should.

## What I ran
* The builder's check `tests/check_pf13_branding_browser.ts 4442 xr_studio_pf13rev` on a fresh copy: **36/36, exit 0**. Its screenshots were restored afterwards (`git checkout`).
* My own Playwright walk, written before reading the check's steps: Owner from the menu at 1440; Tab through the whole page (the focus ring is visible on every control); Enter on "Choose a logo file" opens the file chooser; an SVG with a script; a contrast failure; a long sender name in two scripts (French and Chinese); double-click Save; Save with nothing changed; reload with unsaved changes; two tabs saving different fields; 1024 px; 1024 px at 200 % zoom (512 CSS px); the Case Officer by address and by API.

## Done-when lines (builder's brief)
| Line | Result | Evidence |
|---|---|---|
| A colour failing contrast is refused with the ratio | Met | `#ffee00` shows "Contrast 1.2:1 on white; at least 4.5:1 is needed." on the field (aria-describedby); `#777777` shows 4.47:1, cut and not rounded (parity with `branding.ts`); Save sends nothing and focus goes to the field; `pf13-5` |
| An SVG with a script is refused | Met | Refused when chosen, also when it is named `.png`; no blob address is made and the script never runs; the API returns 415; `pf13-6` |
| A 6 MB logo is refused with the limit | Met | "The logo can be at most 2 MB."; the API returns 413; exactly 2 MB is accepted and 2 MB + 1 byte is refused; `pf13-7` |
| The preview changes before Save; nothing is stored until Save | Met | No non-GET request before Save, the read is unchanged and there are no audit lines. After Save there are 5 audit lines and exactly 4 writes. A double-click sent one PUT |
| Keyboard only, axe-core, 375/1024/1440 | Met | Tab order logo → colour → picker → neutral → sender → favicon → banner → Save → Discard; axe is clean in 9 states (and a planted fault is caught); no sideways scroll at 375/1024/1440 or at 200 % zoom (512 = 512) |

## D1–D20 (out of 5)
| D | Score | Evidence |
|---|---|---|
| D1 Requirement fit | 5 | BR-1 to BR-8 each map to a behaviour and a check line (DW6a to DW6g, DW7) |
| D2 Data integrity | 4 | Only the changed fields are sent, so two tabs editing different fields both stick (verified). Same field: the last save wins with no conflict shown (m4) |
| D3 Reuse | 5 | Words, limits and ratio come from the server and are proved by parity tests; no API copy |
| D4 Rule integrity | N/A | No dependent questions |
| D5 Stability and recovery | 4 | Double-click guarded (`sending` ref); partial save and lost answer handled (M1); the beforeunload prompt fired on reload. Edits typed during a Save are lost (m5); a failed re-read hides the BR-8 line (m7) |
| D6 Freshness and governance | 4 | One audit line per changed key (API); Sample limits labelled in the code comments |
| D7 AI trust | N/A | No AI |
| D8 Orientation | 5 | Crumb "My account › Branding"; the menu entry is highlighted |
| D9 Flow | 5 | One Save; "Nothing has changed." when clean; partial save says what is left |
| D10 Language | 5 | Plain words, server wording, hints name the limits; no IDs on the main path |
| D11 Feedback and state | 4 | Unsaved marker, per-image "not saved yet", saved notice. Loading is text, not a skeleton (m3); Discard is silent when clean (m2) |
| D12 Visual quality | 5 | Team tokens and controls; calm two-column layout; `w1`/`pf13-9` screenshots |
| D13 Accessibility | 4 | axe clean, keyboard complete, zoom fine. An image error is not tied to its button (m1) |
| D14 Team look | 5 | PlatformFrame, Field/Input/Button/Notice as on Offices |
| D15 Speed | 5 | Two reads per view (staff and public), no per-row requests; the form showed under ~1.2 s, including opening the previous page |
| D16 Testability | 5 | A pass and a fail for every BR; parity tests read the server functions; a rule's removal fails its line (e.g. `colourProblem` returning null fails DW6b's 4.47:1 assertion) |
| D17 First-use | simulated only | No intended user walked it |
| D18 Provenance | 4 | The firm name comes from the public read; the preview says nothing is saved until Save |
| D19 Closure | 3 | Drawing the brand on the real client pages and PDFs is Not built (concept §6b); not a finding |
| D20 Pain and wow | simulated only | — |

## Standards [M] (only lines this screen touches; the rest are N/A: no masters, engine, AI, release or migration)
* §3.10 pass and fail per rule: met. §6 server authorisation: met (Case Officer PUT 403; the page shows no values). §7 strict TS, no `any` in web code, comments give the why with numbers: met. §7 axe on every state: met. §8 uploads: met. Bytes are sniffed, the header size is checked before drawing, the blob is built from the checked bytes with the checked type, used only as an `<img>` source, and revoked on replace, discard and unmount. §5 no per-row requests: met. §4 optimistic concurrency: **not met, carried from part 1a** (no version on the branding API; m4).
* EXPERIENCE §2.4 preview beside the editor: met. §2.8 confirm before a destructive action: Discard asks with a native `confirm()`, as other editors do. §2.12: met. §4 states: loading has no skeleton (m3); conflict state absent (m4); empty, error, read-only and saving are all drawn.

## Scorecard BIC (configuration screen; concept did not opt in: only "Always" checks scored)
| BIC | Score | Evidence |
|---|---|---|
| 11 One primary per panel | Met | Save only (`w1-owner-1440`, `w4-1024`) |
| 13 Errors what and how | Met | Field words with the fix; typed input kept; focus to the first error |
| 14 Help in place | Met | Visible hints for limits and "Not set" fallbacks; there are no icon-only buttons |
| 18 States drawn | Partly | Loading is text, not a skeleton (m3) |
| 19 Low cognitive load | Met | One heading per panel and one primary; red only for errors |
| 20 Accessible | Met | Keyboard walk; 200 % zoom at 1024 px; headings h1 › h2 |
| 01–10, 12, 15–17 | N/A | No case facts, AI, filing or review on this screen |

## Issues (all Minor, Should; none blocks)
* **m1** `branding-page.tsx:50,55`: an image refusal (`role="alert"`) is not in the Choose button's `aria-describedby` (only the hint is), so returning to the button does not re-announce it. Fix: add the error's id to `aria-describedby`.
* **m2** `branding-page.tsx:203`: when the form is clean, "Discard changes" has `aria-disabled` but looks enabled (opacity 1), and a click does nothing and says nothing. Fix: style it as disabled, or say "Nothing to discard." as Save does.
* **m3** `branding-page.tsx:89`: loading is the line "Loading the branding…", not a skeleton (EXPERIENCE §4, BIC-18). Fix: a form-shaped skeleton.
* **m4** No conflict state: two people saving the same field, the last one wins with nothing shown. The cause is the API (part 1a has no version; STANDARDS §4, EXPERIENCE §4), so it is outside this PR and already listed in the build notes. Fix: a follow-up row (a version on the branding read, then 409 with a reload).
* **m5** `branding-page.tsx:141,175`: fields stay editable while saving. `setDraft(next)` is built from the draft as it was at Save, so text typed during a Save (a few hundred ms with three images) is lost. Fix: disable the inputs while `busy`, or merge the later edits.
* **m6** `branding-page.tsx:171` vs `:88`: if the final re-read fails, `read.error` replaces the whole page with "Could not load the branding". The BR-8 line "Could not confirm every change. Please reload…" is never seen. Fix: keep the form and show that line when data is already loaded.
* **m7** (nits) Concept §4 names a toast for "Branding saved."; the build shows an inline notice: align one or the other. `:93`: after "Use the neutral colour" and then an invalid colour, the preview shows the saved colour, not the neutral one that was the last acceptable value (BR-3).

## Journey test (reviewer role; the one score for this check)
Journeys: (1) Owner sets all five from the menu and saves (main); (2) contrast refused, then a passing colour; (3) hostile SVG / 6 MB / pixel-bomb header; (4) partial save and lost answer (builder's routed stubs, re-run); (5) Remove + Discard; (6) Case Officer by address; (7) reload with unsaved changes and a double-click Save; (8) two tabs; (9) 1024 at 200 % zoom. The step across the boundary (the brand on real client pages and emails) is Not built here; R1.47 already proves the email layout.

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | All five saved; read and audit match |
| Next step obvious | 1 | One Save; partial save names what is left |
| Plain words | 1 | Server wording; limits in the hints |
| Feedback and state | 1 | Unsaved marker, per-image state, saved and part-saved notices |
| Correct data | 1 | Read has exactly the typed values (lower-cased colour, trimmed name, non-Latin text kept); firm B untouched |
| Error recovery | 1 | Refusals keep the form; the next Save sends only what failed |
| Accessibility and sizes | ½ | axe clean, keyboard, 375/1024/1440 and 200 %; m1 |
| Speed | 1 | Under ~1.2 s to the form; refusals immediate |
| Visual quality | 1 | Team look; preview clear (`pf13-3`, `w1`) |
| Trust and sources | 1 | No AI; preview labelled "Nothing is saved until you press Save" |
| **Total** | **9.5 / 10** | Pass (8+ and no 0). To raise accessibility: fix m1 |

## Could not check
A real screen reader; an intended user's unaided walk (D17, D20 stay with the founder); a real network loss (the stubs abort in the browser). Graph (P-86): `graph.mjs` ran, but its generated pages list has no `/platform/*` pages and does not see the template-literal API calls, so it cannot judge this screen. The check does visit `/platform/branding` and names R1.23 in every line. No separate journey-test file was written, because the brief allows only this file.

**Verdict: Approve**

Reviewer: Approve 39253167e19404c934996bf81266e66668452cc4

## Round 2 (diff 39253167e..7c17c4b93)
Diff-only re-read of `branding-page.tsx`, `check_pf13_branding_browser.ts` (DW6h), build notes and concept, plus the break report's MAJOR-1. The check was not re-run: I accept the builder's 40/40, exit 0 on a fresh isolated copy at this head. DW6h asserts the locked state while the PUT is held, so it could not pass on the old code, where every field stayed open.

**Break MAJOR-1 / review m5: fixed.** A `fieldset disabled={busy}` (`:188-204`) wraps every field: logo, colour text, picker, "Use the neutral colour", sender name, favicon and banner, with their Choose (and the hidden file input), Remove and Undo. Save and Discard sit outside it. Nothing can change `draft` between the click and `setDraft(next)` (`:176`), so no edit can be lost and no object address can leak that way. The break report's variant (a new logo chosen while the old one uploads, then a revoked address put back) cannot happen now either. DW6h holds the logo PUT and reads the disabled state of sender, colour, picker, favicon Choose and banner Remove. Once the Save ends it checks they are open again and a new edit shows "Unsaved changes".

**The Minor fixes are correct:**
* m1: `aria-describedby` now holds the hint and the error id.
* m2: "Nothing to discard." is shown, and the misleading `aria-disabled` is gone.
* m6 and the breaker's point:
  * `read.error && !d` keeps the form when data is already loaded. TanStack Query keeps the last data on a failed refetch, so the "Could not confirm … reload" line is now seen.
  * A first load that fails, or a change of token (a new query key, so no data), still gets "Could not load the branding".
* m7:
  * The concept now says an inline notice.
  * `goodColour` as `{ colour: string | null }` tells "never typed a good colour" (fall back to the saved colour) apart from "chose the neutral colour" (`colour: null`, so the neutral colour is shown).
* Pasted spaces:
  * `maxLength` 40 lets ` #1F4E79 ` in. `colourProblem` and `colourValue` trim it.
  * Longer junk such as `#1f4e79;background:url(x)` is refused by the same rule and never reaches `style`, because the preview takes only `colourNow` or a stored value.
* Long file name: `[overflow-wrap:anywhere]` on the hint.
* `staffToken()` stop (`:163`):
  * After a 401, `staffApi` ends the session, so the remaining images are counted as not saved and are not sent.
  * The refetch then fails, and the sign-in card replaces the page anyway.
  * This is sound, but no browser test covers it. The build notes say so.

**New in the diff (Minor, Should; neither blocks):**
* **r2-m1** Focus is lost when a keyboard user saves with Enter from inside a field:
  * Pressing Enter in Sender name or Brand colour with a valid change submits the form. The focused input then sits in the disabled fieldset, so the browser drops focus to `body`.
  * On success nothing moves it back. "Branding saved." is announced by the live region, but the user's place is gone (WCAG 2.4.3).
  * DW7 saves with Enter only on the Save button (line 313), so the check does not see this.
  * Fix: before `setBusy(true)`, move focus to Save (or to `[data-branding-said]`) when `document.activeElement` is inside `[data-branding-fields]`. Or put focus back on that field after a success.
* **r2-m2 (nit)** On a partial save, `focusError()` (requestAnimationFrame) is called before `finally { setBusy(false) }`. It works only if React commits `busy=false` before the next frame. That is the normal order, but no test checks focus after a partial save.
  * Fix: call `focusError` after `setBusy(false)`, for example from an effect or after the `finally`.

**Listed and not fixed: Minor is enough for each:**
* m3, the loading line: polish (EXPERIENCE §4). No data is at risk.
* m4, no conflict state: the cause is the merged API's design (part 1a has no version). It needs its own row, as the build notes say.
* A PNG with a sound structure and garbage pixels: the server takes it too. It is a valid image of the allowed size and type, and it is shown to the Owner before Save.
* The "Saved/Not saved" line is not seen after a 401 mid-save: the sign-in card replaces every staff page in the same way. After signing in again, the read shows what is stored.

**Journey score:** 9.5 / 10 stays. m1 is fixed, but r2-m1 is a new keyboard gap, so accessibility stays at ½. Pass.

**Verdict: Approve** (no open Blocker or Major; r2-m1 and r2-m2 are Should, fix in a follow-up or in this PR at the builder's choice)

Reviewer: Approve 7c17c4b93bc0e506a66134af1cff8a71c00550bc

## Round 3 (diff 7ddd1fa87..54eb2781b)

Diff-only re-review under the Lead's standing permission A277. 7ddd1fa87 is records-only on top of the approved 7c17c4b93 (review.md and build-notes.md only). Since then: the merge of origin/main fa452613d, which GitHub showed as a conflict, and one fix, 54eb2781b. Not re-run: the builder reports check_pf13_branding_browser.ts 40/40, exit 0, on a fresh isolated copy, typecheck.mjs PASS and `web` `tsc --noEmit` clean, and nothing in this diff changes runtime behaviour.

**1. Conflict resolution in `web/src/modules/platform/routes.tsx`:**
* Both sides are kept. This PR's `BrandingPage` import and its `/platform/branding` route are there, and so are main's (PF-18s part 3) `NotificationsPage` import and its `/account/notifications` route.
* Compared with main's side (`fa452613d^2`), the only difference is this PR's two lines. Nothing from main was lost, and nothing is duplicated (16 routes, one import each).
* No path appears twice across all `modules/*/routes.tsx`. The two new paths sit in different prefixes (`/platform/…` and `/account/…`).
* `account-sections.ts` has one entry for each, with the right keys and no duplicate path: Notifications uses `agent/notification:manage-preferences` and Branding uses `agent/settings:edit`.

**2. Test fix in `tests/check_pf13_branding_browser.ts:53`:**
* `new Blob([new Uint8Array(bytes)], { type })` copies the same bytes into a fresh `ArrayBuffer`-backed view. That satisfies TS 5.7+'s `BlobPart` (TS2322 on `Uint8Array<ArrayBufferLike>`).
* The upload sends the same content. For callers that pass a `subarray` (the cut-short files), the copy holds exactly the view's bytes, not the whole parent buffer, so it is no looser than before. The field name, file name, type, method, URL and headers are unchanged.

**3. Panel files:**
* `git diff --stat 7ddd1fa87 54eb2781b` on `branding/` shows no change.
* It shows one line in `account-sections.ts`: main's Notifications entry. `git diff fa452613d^2 fa452613d` confirms the merge kept main's file plus only this PR's own Branding line from before.

**Findings:** none. r2-m1 and r2-m2 from round 2 are still open as Should, as recorded there. Neither is touched by this diff.

**Journey score:** 9.5 / 10 stays. No behaviour changed.

**Verdict: Approve**

Reviewer: Approve 54eb2781b631fe23c7dd96a2a7dca303d33bde53

## Merge of main (diff 78e92f8ed..1ca8370e6)

Diff-only re-review of merge commit 1ca8370e6262dd0c8f4dd42240f6728eda78a734 (parents 78e92f8ed, this PR's last approved commit, and 346446303, origin/main after #2884 and #2906).

1. **`routes.tsx` against main's side (`git diff 1ca8370e6^2 1ca8370e6`):** exactly two added lines and nothing removed: `import { BrandingPage } from "./branding/branding-page";` and `{ path: "/platform/branding", element: <BrandingPage /> }`, both placed between Offices and Support. Main's `SupportPage, SupportTicketPage` import and its `/platform/support` and `/platform/support/:id` routes are kept, as is `/account/notifications`. No route path appears twice in the merged file (checked with `sort | uniq -d`), and `/platform/branding` matches no other path.
2. **Scope of the merge (`git diff --stat 1ca8370e6^2 1ca8370e6`):** 24 files, 1151 insertions, 0 deletions. All of them are this PR's own files: the PF-13 screen folder and screenshots, `qa/built/R1.23.md`, `MODULE.rows/PF-13.md`, `tests/check_pf13_branding_browser.ts`, the three `branding/` files, plus one line each in `account-sections.ts` (the Branding entry) and `routes.tsx`. The merge drops none of main's lines. `git diff 78e92f8ed 1ca8370e6` over `modules/platform/branding`, the PF-13 screen folder and the PF-13 check script is empty, so the merge did not change the panel.
3. **Builder's results at 1ca8370e6 (not re-run):** `run-suites.sh --only` exit 0: pf13 branding 40/40, pf18h home 25/25, pf18s offices 28/28, pf5s2 billing 55/55, pf6a frame 52/52; typecheck PASS. These match the routes and nav files that the merge touched.

**Findings:** none.

**Journey score:** 9.5 / 10 stays. No behaviour changed.

**Verdict: Approve**

Reviewer: Approve 1ca8370e6262dd0c8f4dd42240f6728eda78a734
