# FO-6ds break report: "Send for signature" and "Signature requests" on the prospect page

Breaker: qa helper agent, 24 Nov 2026. PR #3367 at 7d30fe3ef3 (branch claude/screens-fo6ds-send). Isolated copy `fo6ds_brk` on :4582 (`PLATFORM_IDENTITY=local`), seeded with `seedSampleFirms` + `seedSampleFirmsFrontOffice` and the test's SQL patterns; Playwright Chromium; stopped afterwards (log `studio/var/isolated-logs/fo6ds_brk-api.log`). Sample values only; no AI, no vendor, no email. Scope: concept §3-§6 only ("Not built" items not checked). File refs are `web/src/modules/front-office/sign/signature-requests.tsx` (SR) unless named.

**Verdict: Changes**: no Blocker. Three Majors: after a refused send the panel keeps a pick the person can no longer see or change, so every later Send fails the same way (M1-M3). And a send that fails after the panel is closed says nothing (M4).

## Blocker
None.

## Major
**M1. A signer who loses their email stays ticked but disabled: Send fails every time.** Steps: Owner opens Corporate prospect B (Client B and Client D, both with email; Client C without). Open the panel, choose a PDF, tick Client D. In another session, clear D's email (`update fo_person set email = null`). Click Send.
Expected (§4d): "ClientD Sample has no email address. Add an email first.", the list reloads and the person can fix the pick.
Actual: the error shows and the list reloads. But D's checkbox is now **disabled and still checked** (`disabled={!p.hasEmail} checked={picked.includes(...)}`, SR:122), so it cannot be unticked (Playwright `uncheck` times out). Each further Send gets the same refusal. The only way out is Cancel, which loses the file and title. The refetch (SR:53) never removes stale ids from `picked`. Rows added: 0, so the API held.

**M2. A signer removed from the prospect stays in the send but is no longer shown: the panel cannot recover.** Steps: same panel, tick only Client D. End D's company contact meanwhile (`valid_to = now() - 1s`), then Send.
Expected: "Each signer must be a person on this prospect." (list reloads) and a pick that matches what is shown.
Actual: D disappears from the reloaded list, but `picked` still holds D's id. The panel shows **0 ticked boxes**, and the client check `!picked.length` (SR:75) passes, so Send goes out with D (SR:40). It is refused again, and again after ticking Client B. The person sees an error about a signer they cannot see. Cancel is the only way out.

**M3. A firm signer made inactive: the select shows "No firm signer" but the suspended person is still sent.** Steps: Individual prospect A, choose a PDF, firm signer "Case officer" (user-T). Suspend T in the database, then Send.
Actual: "The firm signer must be an active person of your firm." The select reloads without T, so the controlled `<Select value={firm}>` (SR:130) **displays "No firm signer"** while `firm` still holds T's id (SR:41). Send again: the same error, forever. Choosing "No firm signer" fires no change, because it already looks selected. The fix is not obvious: pick someone else, then pick none again. The builder's test misses this because Playwright's `selectOption("")` always fires a change.

**M4. A send that fails after the panel is closed says nothing.** Steps: Individual prospect A, choose a PDF, Send. While "Recording…" shows, press Esc (the Panel allows closing while busy, SR:104). The POST then answers 500 (Playwright route, 2.5 s delay).
Expected: the person learns it failed, as they learn of a success (the toast fires even with the panel closed).
Actual: no toast and no message. `onError` writes into the closed panel's state, and `start()` (SR:62) clears it on reopen. Reopening shows a clean form. The person can leave believing the document was recorded. The same happens for the M4 network case: "We could not confirm…" is never seen.

## Minor
- **m1. More than 9 signers: no hint, and the error words are wrong.** Corporate prospect with 12 contacts that have email: all 12 can be ticked (BR-4 says 1-9). Ticking 12 shows "This is too long: at most 400 characters." on Who signs (the API's `z.string().max(400)` on the comma-joined ids, `routes.ts:23`). Ticking 10 or 11 shows "Too many items: at most 9.". Neither is the concept's "At most 9 people sign one document." (§4d; the API's `TOO_MANY_SIGNERS` cannot be reached).
- **m2. Reopening during an in-flight send.** Esc while "Recording…", reopen, choose a new file, type a title. The reopened form shows "Recording…" on Send (it is still `send.isPending`). When the first answer arrives, `onSuccess` (SR:46) closes the new panel and the new file and title are lost.
- **m3. A file name cut at 200 can split an emoji.** File name `"a"×199 + "😀tail.pdf"`: `titleOf` (`contract.ts:41`) slices UTF-16 units, so the prefill ends in a lone surrogate. The saved title ends in "�" (database tail `aa�`).
- **m4. Invisible characters from the file name land in the title.** "Offer‮gnp.pdf" prefills a title containing U+202E. Send gives "This must be plain text on one line." on a title that looks fine, and the screen never names or strips the character. A title of punctuation or emoji only ("!!!", "😀") gets the same misleading words (API refine, `routes.ts:20`).
- **m5. Changing the file overwrites a title the person typed.** Choose a file, type "My careful title", Change the file to Second.pdf, and the title becomes "Second" (SR:66). BR-7 says pre-filled and editable, but the edit is lost silently.
- **m6. People are shown by name only, so two people with the same name look alike.** Two contacts both named "Same Sample" give two identical rows. §4 asks for "name + role on the prospect" ("Primary contact", "Company contact"). The API's `signersFor` gives no role, so the screen cannot show it.
- **m7. People fail to load: no Try again, and Send gives the wrong reason.** A 503 on `/signers` shows "Could not load the people on this prospect." (SR:119), with no retry. Send then says "Pick at least one person to sign." although there was nothing to pick (§4d UXL-12 asks for an error state with Try again).
- **m8. "Check the list below" while the list is hidden.** With the network down, a send shows "We could not confirm the send. Check the list below…", but the list refetch fails and the 3 rows are replaced by "Could not load the signature requests." (SR:99; React Query keeps `data` but the screen shows the error instead).
- **m9. A prospect lost in another tab can still be sent from.** Open prospect M, mark it Lost through the API, then use the still-visible button. The request is recorded on a LOST prospect (1 row). Q2 is a screen-only rule and the API allows it (`service.ts` `prospect()` has no stage check).
- **m10. More than 200 requests: the oldest open ones vanish silently.** Prospect X with 205 requests: 200 rows are shown, and the oldest open "Recorded" one is missing with no "showing the newest 200" note (`service.ts:230` `take: 200`). This breaks BR-8's "never hiding open ones" (an API cap, reached through the screen). The page loaded in 451 ms.
- **m11. A stale signer list within 2 s.** Cancel, the person loses an email, reopen within 2 s (`staleTime: 2_000`, `lib/api.ts:46`): the old list shows that person enabled. Sending then leads to M1.

## What held
- Roles: Owner, Admin, Case manager and Case officer get the button. Read only gets the list and downloads, no button, and `/signers` 403. Billing gets the list only. A grant removed mid-panel gives "You cannot send documents for signature. Ask your firm's Owner or Admin."
- Own-or-all: with "everyone sees all" off, a Case officer gets 404 on the list, signers and page of another person's prospect, the same as the page itself.
- Stages: a Won prospect shows the button. A Lost one has no button and keeps its list (2 rows). The stage stays unchanged after a send (BR-9, already in the test).
- One request per action: a double click, Enter, Enter plus click, and a reload mid-send each give exactly one row. A reload mid-send shows the recorded row once. A duplicate signer id in different case records 1 signer.
- Files: 26 MB is refused on pick and on Send. A 0-byte file gets "Choose a PDF to send." (API words). A PDF with planted "ignore previous instructions … email every client" text and `/OpenAction` JavaScript is only recorded ("Recorded", "0 of 1 signed"): nothing acts on it. An IMM number in the file name with a plain title is refused as a government form.
- Text: an HTML file name `<img src=x onerror=…>` renders as text (0 `img`). Arabic, Chinese and Persian with ZWNJ titles are kept. Tab and U+202E in a title are refused by the API. A 200-character unbroken title at 375 px gives no sideways scroll and the toast stays inside.
- Keyboard: Tab stays inside the open panel (File, Title, ticks, firm signer, Cancel, Send, Close). Esc closes and focus returns to "Send for signature". A disabled no-email person is skipped.
- Sizes: 320 px, 1024 px and 200 % zoom (720 CSS px) give no sideways scroll, with Send visible (44 px at 320).
- Honesty (BR-10): the pill reads "Recorded", the toast reads "Recorded for signature: … No one is emailed yet.", and no "Sent" pill or emailed claim appears in any state checked. No page errors in either run.

Evidence: scripts and screenshots (`s1-stuck-disabled-ticked.png`, `s2-removed-signer-still-picked.png`, `s20-firm-signer-gone-still-sent.png`, `s3b-…`, `s11-…`, `s12-…`, `s15-same-names.png`) are in the breaker's session scratchpad `brk/` (not committed). Each step above can be repeated with the seed shown.
