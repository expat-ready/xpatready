# FO-6ds break report: "Send for signature" and "Signature requests" on the prospect page

Breaker: qa helper agent, 24 Nov 2026. PR #3367 at 7d30fe3ef3 (branch claude/screens-fo6ds-send). Isolated copy `fo6ds_brk` on :4582 (`PLATFORM_IDENTITY=local`), seeded with `seedSampleFirms` + `seedSampleFirmsFrontOffice` and the test's SQL patterns; Playwright Chromium; stopped afterwards (log `studio/var/isolated-logs/fo6ds_brk-api.log`). Sample values only; no AI, no vendor, no email. Scope: concept §3-§6 only ("Not built" items not checked). File refs are `web/src/modules/front-office/sign/signature-requests.tsx` (SR) unless named.

**Verdict: Approve** (round 2, on 232d508ec): M1-M4 and m1, m2, m5, m7 are fixed. No new Blocker or Major; five new Minors (r2-m1 to r2-m5 below).

Round 1 (7d30fe3ef) verdict was Changes: no Blocker. Three Majors: after a refused send the panel keeps a pick the person can no longer see or change, so every later Send fails the same way (M1-M3). And a send that fails after the panel is closed says nothing (M4).

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

## Round 2: re-break of 232d508ec (`git diff 7d30fe3ef..232d508ec`)
Fresh copy `fo6ds_brk2` on :4584, seeded as in round 1. I re-ran the round-1 scripts, then attacked the new paths (the reload effect that drops picks, the toast when the panel is closed, the opener disabled while sending). The copy is stopped; its log is `studio/var/isolated-logs/fo6ds_brk2-api.log`. Caveat: this working copy is shared. Another session moved HEAD to dda1ed320 and rebuilt the shared `web/dist` mid-run, so my last runs served f158b559b's `titleOf`. `signature-requests.tsx` is the same in both commits. The round-1 re-runs ran on 232d508ec.

**Fixed (re-run of the round-1 steps):**
- M1: D reloads disabled and **unticked**. Send then says "Pick at least one person to sign.", and nothing is stuck.
- M2: the removed signer leaves the pick as well as the list. The next Send gives the same recoverable "Pick at least one person…".
- M3: the select is cleared, and the next Send records with no firm signer.
- M4: Esc mid-send, then a 500, gives the toast "Could not send. Nothing was sent; please try again." This also works after navigating away from the page. A success with the panel closed toasts and puts focus on the new row.
- m1: ticking 12 gives "At most 9 people sign one document." and nothing is sent.
- m2: the opener is disabled while recording, so the panel cannot be reopened mid-send.
- m5: a typed title is kept when the file is changed.
- m7: "Try again" works by keyboard and pre-ticks the one person.
- Other held paths: after a drop, ticking Client B records. Changing prospect mid-send causes no stray row and no disabled opener on the other prospect. No page errors.

**New Minors on 232d508ec (none blocks):**
- **r2-m1. The m3 fix cut file names by characters, not UTF-16 units, so the screen refused its own pre-filled title.** `titleOf` at 232d508ec (`contract.ts:41`) gives 201 UTF-16 units for `"a"×199 + "😀tail.pdf"`, and 300 for 150 emoji. Its own check (`title.trim().length > 200`) then shows "The title has at most 200 characters." on a title the person never typed. They must edit the title before Send works (seen in the S5 re-run; the old function was re-run in node). **Already fixed in f158b559b** (cuts whole characters within 200 UTF-16 units). On the rebuilt bundle, 199/200/200 units were recorded with no error.
- **r2-m2. Focus is lost when the panel is closed during "Recording…".** The Panel returns focus to the opener, which is now `disabled={send.isPending}` (SR:109), so focus falls to `<body>`. It stays there after a failed answer (N1: `BODY` both times). A keyboard user starts again from the top of the page (WCAG 2.4.3). After a success, focus does reach the new row.
- **r2-m3. A cancelled file chooser makes the next file keep the old file's title.** Choose "Alpha offer.pdf", open the chooser and cancel (the input clears: `pick(null)` sets `file` to null), then choose "Beta contract.pdf". The title stays "Alpha offer" although the hint shows Beta contract.pdf. The keep-typed-title rule (SR:78) compares against `file`, which is now null, so it treats the old pre-fill as typed text.
- **r2-m4. A cleared firm signer can go out unnoticed.** After FIRM_SIGNER_NOT_IN_FIRM the select is cleared and the error explains it. But any edit (e.g. the title) clears the error (SR:127), and the next Send records with **no firm signer** although the person chose one. No warning stays near the select (N9).
- **r2-m5. When the panel is closed, the refusal toast passes the API's raw summary.** A real 422 for a title with a tab gives "Not recorded: One field needs a change: title: This must be plain text on one line. Nothing was saved." (a field key and a doubled sentence). The no-email case reads well: "Not recorded: ClientA Sample has no email address. Add an email first."

Round-2 scripts: the breaker's scratchpad `brk/r2/` (`ui.mts`, `ui2.mts`, `n.mts`, `n3.mts`), not committed.

