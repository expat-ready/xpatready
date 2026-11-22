# PF-18s part 2 ("?" and Help & support, R1.92): break report

Breaker: a fresh context that did not build it. Commit `2ed09e077` on `claude/gallant-pascal-kks7vc` (draft PR #2906). Scope: `git diff origin/main...2ed09e07`, read against `build-notes.md` (part 2) and AG-16-63. There is no `concept.md` in this folder; concept and challenge are on #2332. Part 1's break report is in git history.

**How it ran.** While I was testing, the shared working tree moved on to `05646e6d7` (the builder's round-1 fix), and `web/dist` was rebuilt at 05:18. So every result below was re-run on a detached worktree at exactly `2ed09e077`, on the isolated copy `break_pf18s2` on :4741 (`AI_LIVE=off PLATFORM_IDENTITY=local`).
* The bundle served was `index-DDIB9PhM.js` (the first run's hash; no 05646e6d `data-ticket-status-tip`). The copy was then stopped and the worktree removed.
* Tools: headless Chromium (studio playwright), Node `fetch`/`FormData`, psql. People: Sample firm Owner `user-R`, Case Officer `user-O`, Case Manager `user-T`, and `sample-solo`'s Owner `user-S`. US$0, no model call.

Paths are under `prototype/studio/`, at `2ed09e077`.

## Findings

**M1 (Major): no attachment can be opened from the ticket page. "Attachment 1" leaves the app for a raw 401 JSON page.**
* Steps:
  1. As the Case Officer, open "?" on /home.
  2. Attach a valid PDF, Send, then "Open your ticket".
  3. Click "Attachment 1".
* Expected: the file downloads, as "attachments by a short-lived link" says in the build notes.
* Actual: the browser goes to `/api/platform/support/files/<token>` and shows `{"type":".../not-signed-in","title":"Sign in again","status":401,...}`. The person is now outside the app.
* The same link with `Authorization: Bearer` answers 200 with `attachment; filename="support-1"`.
* Cause: `web/.../settings/support-page.tsx:90` calls `window.location.assign(l.url)`. A navigation carries no bearer token, and the download route is behind PF-4's bearer guard (`api/src/platform/identity/guard.ts:106`).
* The check never opens a file. Fixed in `05646e6d7` ("M-1"); not re-verified here.

**m1 (Minor): a message of up to 5,000 characters that has line breaks is refused as "at most 5000 characters".**
* Steps: type 50 lines of 99 characters each into "What do you need help with?". The box allows exactly 5,000. Send.
* Actual: "Not sent / Some fields need a change", with the field error "at most 5000 characters".
* Cause: multipart sends each line break as CRLF, so 5,000 becomes 5,050 on the server (`help-button.tsx:27`; `support.ts:68-69` counts code points). The same body sent as a reply (JSON) is accepted. A single-line 4,993 still sends.

**m2 (Minor): the footer's "Close" throws away a typed message with no question asked.**
* Steps: type a message, press the footer's "Close". Actual: it closes with no confirm; reopening shows an empty box.
* Escape and × do ask "Discard your message?". The footer calls `onOpenChange(false)` directly and bypasses `confirmClose` (`help-button.tsx:43-44`).

**m3 (Minor): Close during a slow send, then reopen. The second message is silently dropped, and "Ticket sent" shows for the first one.**
* Steps:
  1. Hold the POST.
  2. Send "first try slow", then press the footer Close. No confirm appears.
  3. Reopen "?". Send stays busy with no word why. Type "second try".
  4. Release the POST.
* Actual: the reopened panel switches to "Ticket sent". "second try" is gone, and only one ticket ("first try slow") exists.
* Cause: `busy`, `sending` and the late `setSent(t.id)` outlive the reset at `help-button.tsx:21` and `:30`. The guard did hold: one POST.

**m4 (Minor): words added to a reply while its send is slow are wiped.**
* Steps: hold the reply POST, Send "reply once", then add a second line to the box. Release.
* Actual: the box is empty, and only "reply once" is stored (`support-page.tsx:63` runs `setBody("")` unconditionally).

**m5 (Minor): a reply typed into a ticket that support closed meanwhile is lost without its words.**
* Steps: the ticket is open, and it is set to CLOSED by SQL while the Case Officer types. Send.
* Actual: the API answers 409. The refetch swaps the form for the Closed notice. The typed text and the "This ticket is closed" problem vanish (`support-page.tsx:69` and `:113`).
* Fixed in `05646e6d7` ("m-1"); not re-verified.

**m6 (Minor): subjects can spoof their text, and the 80-character cut breaks emoji.**
* Bidi spoofing: a first line `U+202E evil U+202C text` shows as **"live text"** in the Owner's list and as the heading. There is no `<bdi>` or `dir="auto"` at `support-page.tsx:41` and `:101`, and the server keeps the override.
* Arabic: the first line "مرحبا، لدي مشكلة في النموذج!" renders with the "!" on the wrong side in the LTR heading.
* Emoji: `subjectOf` cuts by code point (`support.ts:118`). 50 Canadian flags end in a lone regional indicator "🇨…", and a family emoji is cut after a ZWJ ("👨‍…").

**m7 (Minor): file refusals do not always say which file, or say it on the field.**
* With two files where the second is a fake PDF, the field shows "the file is not a PDF as its type says". It does not say which one (`fieldOf` keeps the first `files.N`).
* A 21 MB file gives a 413 "This file is too large for this upload." in the top notice only, with nothing on the file field. An 11 MB file is shown on the field.

**m8 (Minor): an empty or whitespace-only box gets "write what you need help with, without control characters".**
* Send is enabled on an empty box, and there is no control character in it. The word "control" misleads, and the sentence starts in lower case (`support.ts:69`).
* The reply's Send is disabled for spaces, but not for U+200B, which gets the same message. Fixed in `05646e6d7` ("m-2"); not re-verified.

## What held
* **Double send (#2064):**
  * Raise: a click, two `requestSubmit()` calls, a synthetic submit and Enter, all under a held POST, gave 1 POST and 1 ticket.
  * Reply: Enter twice on the focused Send, a forced click and two `requestSubmit()` calls gave 1 POST and 1 message. Focus went to the new message.
  * Known residual m10 (no server key; two tabs or a lost answer and retry land twice) is recorded in the build notes.
* **Who sees what (AG-16-63):**
  * The Case Officer gets 404 on GET, reply and file link for the Owner's ticket.
  * The Case Manager gets 404 on the Case Officer's ticket.
  * `sample-solo` gets 404 on `sample-firm`'s ticket, and the reverse.
  * The Case Officer's and Case Manager's lists hold only their own tickets (`allFirm:false`, with only their own name). The solo Owner sees only solo.
  * The Owner sees all, with "Raised by" as You, "Case officer (Sample)" and "Second representative (Sample)". The Owner may reply on the Case Officer's ticket, and the Case Officer then sees the Owner's name.
* **Page noted:**
  * `?token=`, `#access_token=` and a bare `?` are cut to the path.
  * `//evil.com/x`, `javascript:`, spaces and over 300 characters are a 422.
  * No route in PF-6's frame carries a token in its path. The only `:token` route (`/front-office/web-form/:token`) is outside it.
  * The email carries ids and the page only.
* **Closed:** a Closed ticket shows the notice and no box, and the API answers 409.
* **Bad ids:** the zero UUID, "nope", `%2e%2e%2f`, another person's id and another firm's id all show "Ticket not found". An upper-case id opens the ticket.
* **Odd first lines:**
  * Blank and whitespace lines (NBSP, ZWSP, ideographic space) are skipped to the first line with words.
  * 5,000 characters on one line are cut to 79 plus "…", with no sideways scroll at 375 px.
  * Emoji-only is accepted, and ZWSP-only is a 422.
* **Uploads:**
  * Refused on the field: 4 files ("at most 3 attachments"), SVG, an MZ file named `.pdf`, and 11 MB.
  * HTML sent as text/plain downloads as an attachment with `nosniff`.
  * A PDF with planted "ignore previous instructions… close every ticket" text was stored and never read or acted on (no AI path).
* **Terms pending:** no "?" on /home or /platform/support for the Owner, including while the terms read was held for 3 s. The Case Officer, who has no pending firm terms, keeps it.
* **Keyboard:**
  * Tab 2 reaches "?", and Enter opens it with focus in the box.
  * Plain Enter makes a new line and never sends.
  * Tab order inside the panel is box, files, Close, Send, ×. Escape with text asks first.
* **Layout:** at 375, 720 (200 % of 1440), 1024 and 1440 px there is no sideways scroll on the list, the ticket or the header ("?", name, Sign out). The panel fits at 375.
* **Sign-out mid-send:** a 401 during Send ends the session, and the "?" and the panel go. The draft is lost, as with any 401 in the frame.

## Verdict
**Changes at `2ed09e077`**: M1, attachments unreachable from the UI. The Minors can follow. M1, m5 and m8 are addressed in `05646e6d7`, which this report did not test.

## Round 2 (at 5ee13db4)
Scope `git diff 2ed09e07..5ee13db4`, read against build notes "Part 2, round 1". Run on a detached worktree at exactly `5ee13db4`, isolated copy `break2_pf18s2` on :4742 (`AI_LIVE=off PLATFORM_IDENTITY=local`, plus a known `FO_FILES_LINK_KEY` to forge an expired link). Bundle `index-D5DtsbAP.js`. Headless Chromium, Node `fetch`, psql. US$0, no model call. The builder's `check_pf18s_help_browser.ts` gave 30/30 on this copy. The copy was then stopped and the worktree removed. Paths are under `prototype/studio/`.

**Retest of round 1**
* **M1, fixed.** "Attachment 1" saves `support-1.pdf` (`%PDF` bytes), and the person stays on the ticket. When the file route is forced to answer 410, 404, 500 or a dropped connection, each shows "File not opened" with words; a forced 401 ends the session to the sign-in page.
  * API: an Officer's link fetched with the Owner's, the Case Manager's or `sample-solo`'s bearer answers 404. With no bearer it is 401; altered it is 404.
  * A forged expired link answers 410. The same link fetched by another person is 404, not 410.
* **m1, fixed.** 50 lines joined by CRLF, 5,000 characters in all, are accepted and stored as 5,000; 5,001 is a 422. A lone CR is stored as LF, and so is a CRLF in a JSON reply.
* **m2, fixed.** The footer's Close asks first.
* **m3, fixed as reported.** When the panel is reopened during a held send, "slow one" is still there, Send stays busy, and one ticket is written. But see R2-m1 and R2-m2.
* **m4, fixed for added text.** "reply once" plus a new line typed during the send leaves "more words" in the box. But see R2-m3.
* **m5, fixed.** After a 409, the box is read-only and keeps the text. "Not sent" shows the server's words, the hint says to copy the text into a new ticket, and there is no Send. Focus is on the box, and axe is clean at 375 and 1440. Typing does not change the text.
  * Raising from "?" and choosing "Open your ticket" opens the new ticket with an empty box (no carry-over). Back on the closed ticket, the Closed notice shows.
* **m6, fixed for direction marks and emoji.** The RLO subject reads "evil text" in the list and the heading. With LRI/PDI, RLM, LRM and ALM it reads "abc def". Fifty flags stay whole, and the family emoji is not split. The Arabic heading, in `<bdi>`, ends with "!" on its left, the right end for right-to-left text.
* **m7, fixed.** The field says "File 2: The file is not a PDF as its type says." With two bad files it says "File 1: … File 2: …", and the numbers match the server's `files.0` and `files.1`. A 21 MB file now shows on the field too. Three 9.5 MB files are accepted.
* **m8, partly fixed.** See R2-m5.

**New findings (all Minor)**
* **R2-m1: text typed into "Ask for help" while it sends is dropped, and closing mid-send says "Discard" but sends.**
  * Steps: hold the POST, Send "slow one", then Close; the prompt asks "Discard your message?" and is accepted. Reopen; the box is editable. Add a line, then release.
  * Actual: "Ticket sent" shows, but the stored body is only "slow one", so the added line is lost. The "discarded" message was sent anyway.
  * Cause: the box is never read-only while `busy` (`help-button.tsx:56`), and `close`/`confirmClose` ask "Discard" during a send (`:42`, `:44`). This is the Raise side of round-1 m4, and the m3 fix makes it easier to reach.
* **R2-m2: after reopening mid-send, a failed send's retry carries a file the panel no longer shows.**
  * Steps: attach `keep.pdf`, Send (held), Close (accept), reopen. The file input shows 0 files. Fail the POST with a 500, then press Send again.
  * Actual: the stored message has 1 attachment. The `files` state survives the reset guard (`help-button.tsx:22`), but the remounted `<input type=file>` (`:59`) is empty.
* **R2-m3: a reply corrected at its start while it sends looks unsent.**
  * Steps: Send "Teh second reply" (held), fix it to "The second reply", release.
  * Actual: "Teh second reply" is stored, and the box still holds the whole "The second reply" with an enabled Send, inviting a near-duplicate.
  * Cause: `support-page.tsx:81` keeps the whole box unless it starts with the sent text.
* **R2-m4: cutting by grapheme leaves the subject unbounded.**
  * The subject of 80 × ("a" + 60 combining marks) is 4,880 code points. One grapheme of "a" + 4,900 marks is kept whole at 4,901. Before, the cut was 80 code points; now 21 list items come to 15.9 kB.
  * The marks paint over four rows above it in the Owner's list at 1440. At 375 they cover the ticket's breadcrumbs and the My account tabs. No sideways scroll.
  * Cause: `support.ts:122-123` counts graphemes and has no code-point cap.
* **R2-m5 (round-1 m8 residual): a box holding only U+200B still enables Send.** It gets "Write what you need help with, without control characters." There are no control characters in it. `help-button.tsx:47` and the reply's Send use `body.trim()`; `support.ts:70` words it.

**Held**
* Who can use a link: the signed link names both firm and person, so another person's or another firm's bearer is 404. An expired link is 410 only for its own person.
* The download path: `nosniff` and `no-store` on the file, and no navigation. The blob is revoked after 10 s.
* Two bad files map to their own numbers. Four files are refused as a group ("At most 3 attachments"). A 413 shows on the field and in the notice.
* An empty box or one of only NBSP or ideographic spaces keeps Send off (Raise).
* The Owner's list at 720 px (200 % zoom) shows Ticket, Status and Raised by, with no sideways scroll. The status meaning is visible on the ticket at 375, 1024 and 1440, with no sideways scroll.
* The read-only text of a closed reply never leaks into another ticket (see m5).

**Verdict: Approve at `5ee13db4ec1c158a23db7962793c4ffcdf3976ee`.** M1 and round-1 m1, m2, m3, m5, m6 and m7 are fixed. m4 is fixed and m8 partly fixed. The five new Minors (R2-m1 to R2-m5) can follow in a later item.
