# FO-5s part 3a break report: Withdraw and Signed offline panels (PR #3679)

**Head:** e1418b1d2e7778b2d5ed8e5f77a65242bcd8ebaa. **Copy:** isolated `brk_fo5s3` on :4567 (`PLATFORM_IDENTITY=local`, fake e-signature, US$0), stopped afterwards. **Scope (P-26):** concept fo-5s-retainer-signing r2 §4 S5 actions and S6 panels, §5 copy, BR-10, BR-11, BIC-09/13/20. Signing in used sessionStorage `xr-staff-session`. I tested through Playwright Chromium and direct API calls as Owner + Case Manager (user-R), plus a Case Manager, a Case Officer, Billing/Finance and a Read-only user I created.

**Verdict: Block.** 1 Blocker, 1 Major, 7 Minor.

## Blocker

**B1. After a 409 the Signed offline panel quietly clears itself, and the next press files the colleague's newer version as signed.**
`end-panels.tsx:69`: the reset effect depends on `[open, r.version.n]`. The 409 handler calls `onStale()` (`:85`), which re-reads the retainer. A colleague's Edit raises `r.version.n`, so the effect runs and clears the error, the reason, the file and the "Version signed" pick.
Steps:
1. Version 1 is Sent. Open the retainer page and press Signed offline.
2. Attach a valid PDF and type the reason "Signed v1 at the office".
3. A colleague edits it: `PATCH /retainers/:id {expectedVersion:1, expectedStatus:"SENT", fees:[…]}` makes v2, a Draft.
4. Press Record as signed on paper.

Observed: the server answers 409 "This agreement has a newer version (2) than the one you saw (1)". The panel then shows `alerts: []`, reason "", no file, and the select is on "Version 2 (current)" (screenshot `offline-after-colleague-edit.png`). If the person attaches the PDF again, types the reason and presses again, the retainer becomes SIGNED_OFFLINE on v2 (audit `signedVersion: 2, status_before: DRAFT`) and the prospect is Won. Version 2 was never sent, so the client never saw it. This cannot be undone.
The same happens when "Version 1" was picked on a v1 and v2 sent retainer and a colleague makes v3: there is no message, and the pick resets to "Version 3 (current)".
Expected: the server's words stay on screen (BIC-13), and the file, reason and pick are kept. Only an explicit pick may choose the new version. The stale check from break B-24 ("a newer one saved meanwhile is never filed as signed") must not be undone by the page.

## Major

**M1. On a consultation agreement, the panel and the toast say the person "becomes a client". They do not.**
`end-panels.tsx:92` and `:82` ignore `r.kind` and the `prospectWon` the server returns.
Steps:
1. Upload a CONSULTATION template.
2. `POST /prospects/:id/retainers {kind:"CONSULTATION",…}`, then send it.
3. Open its page and press Signed offline.

Observed: the panel says "Marks the retainer Signed offline and makes ‹name› a client." After you record it, the toast says "Recorded as signed on paper. ‹name› is now a client." (`consult-offline-toast.png`). The prospect's stage stays ACTIVE: the server never makes a client from a consultation agreement (contracts §7 §2.3-§2.4).
Expected: the copy names the real effect of an action that cannot be undone (BIC-09). The toast follows `prospectWon`. A retainer whose prospect was already Won gets the same false toast.

## Minor

- **m1. After a server refusal, focus goes to the panel, not the field.** Steps: Signed offline with a PNG renamed `.pdf`, a zero-byte file, a reason with ESC/BEL characters or only zero-width spaces; press Enter on the confirm button. Observed: the field shows the server's words with `aria-invalid=true` and `role=alert` (good), but focus lands on the dialog DIV, and Tab goes to Close. Errors the page catches itself do focus the field (`:74-76`). Expected: the same focus in both cases.
- **m2. The Withdraw panel stays open, still offering Withdraw, after a colleague finishes the retainer.** Steps: tab 1 opens Withdraw with a reason; tab 2 (a Case Manager) records it on paper; tab 1 presses Withdraw retainer. Observed: 409 "This agreement is now signed on paper (your page showed sent). Open it again." The page has already re-read it (status pill "Signed on paper"), yet the panel still says "Version 1, sent to …" and the confirm button is live. A second press gives 409 "A signed agreement cannot be withdrawn." Expected: once the action is no longer possible, the panel closes or turns read-only. "Open it again" is the wrong instruction, because the page already re-read it.
- **m3. "Version signed" offers earlier versions after the client signed.** On CLIENT_SIGNED with v1 and v2 sent, the select offers Version 1. Picking it always gets 409 "The client signed version 2 electronically…" (`:98`). Expected: hide the pick, or offer only the current version, when the status is CLIENT_SIGNED.
- **m4. Pressing Escape while a request is running loses the outcome and focus.** Steps: delay `/withdraw` by 2.5 s, confirm, press Escape. Observed on success: a toast appears, but focus ends on BODY (the Withdraw button it returned to is gone). Observed when a colleague withdrew first: the 409 is never shown anywhere. Expected: focus goes to the h1, and the refusal is told, for example in a toast.
- **m5. Escape, the X or a click outside throws away a typed reason or a chosen file without asking** (no `confirmClose` on either Panel, `:51`, `:89`).
- **m6. On a consultation agreement, Withdraw points to the wrong next step.** Its text says "to go on, prepare a new retainer from the prospect" (`:54`); a consultation agreement comes from its booking.
- **m7. A long unbroken name is cut off at 375 px.** Steps: a 75-letter one-word given name. Observed: the panel's description, its `data-*-says` paragraph and the hint scroll sideways in the panel body (243-291 px, `w375-open-offline.png`). The panel's text has no `overflow-wrap:anywhere`; the title does. The page behind already overflows by 298 px, which is not this PR's code.

Seen in the API, outside this diff, not counted: a reason with U+0000 gets **404 "Not found (it may have been removed by a reset)"**, because `service.ts:62`'s control-character range starts at U+0001. Two `file` parts get 413 "Add at most 20 files at a time", but only one is allowed.

## What held
- **Keys:** a Read-only user, a Case Officer and Billing/Finance see no S5 end actions and get 403 MISSING_PERMISSION on both routes. A Case Manager and the Owner see exactly Withdraw and Signed offline. Neither is offered after Withdrawn or Signed on paper.
- **Double submit:** a double click on Withdraw retainer and Enter pressed 3 times on Record each sent 1 POST. 3 parallel withdraws gave 1×200 and 2×409 CHANGED, with one audit line. 3 parallel Signed offline gave 1×200 and 2×409, with one `prospect.won`. Withdraw racing Signed offline gave one winner.
- **Colleague changes during Withdraw:** after an Edit, a Send or a withdraw by someone else, the 409 is shown in the server's words and kept, and the page re-reads.
- **Reasons:** 200 characters after trim pass; 201 get 422 on the field. The textarea's `maxLength` stops at 200, both typed and pasted. Whitespace only is refused on the field before the request. ESC and BEL get 422 "Remove control characters." on the field.
- **Files:** zero bytes, PNG renamed `.pdf` and a header without `%%EOF` get 422 on the file field. 10 MB + 1 is refused in the browser ("At most 10 MB.", focus on the file input) and by the API with 422. Exactly 10 MB is accepted. 20 MB + 1 gets 413. A PDF with planted instructions and the name `../../../etc/passwd.pdf` is stored under a generated key (`retainers/<id>/signed-offline-<attempt>.pdf`); nothing reads or acts on its text.
- **Versions:** an earlier version picked while it is still current is filed as a copy (v1 becomes v3 SIGNED_OFFLINE). `signedVersion` 0 or above the current version gets 422.
- **Accessibility:** focus order is file, (version), reason, Cancel, Record, Close, and it stays trapped in the dialog. Fields have labels. `aria-invalid` and `aria-describedby` point to an error with `role=alert`; refusals at the top are `role=alert`. Focus returns to the open button on Cancel and to the h1 after success. No page errors.
- **Layout:** with ordinary and non-English names (Vietnamese, Arabic, Chinese), there is no sideways scroll at 375, 1024, 720×450 (200 % of 1440) or 512×384, and the footer stays on screen.

Scripts and screenshots (not committed): the breaker's scratchpad, `shots/`.
