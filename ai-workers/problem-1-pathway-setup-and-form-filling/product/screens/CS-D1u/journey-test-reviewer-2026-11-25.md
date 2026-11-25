# CS-D1u journey test: reviewer, 25 Nov (head d3510ea38c13767f7c7cb0a16dae7bbbc5f51747)

**Score: 8 / 10, pass** (8 or more, no criterion at 0). Who ran it: an independent reviewer, using scripted browser walks on isolated copies at :4463 and :4464 (never :4400), plus J-64 re-run. The browser was headless Chromium, not a person's unaided walk.

## Journeys
1. **Main path.** Persona: the Sample firm's case officer. Goal: "add the client's letter of invitation". Signed out, they press "Add Letter of invitation (Sample) for <person>…". The firm sign-in shows inline. They sign in, press Add again and choose a 6 MB PDF. The connection drops: "Upload paused: reconnecting". It comes back: "Resumed, 45%" … "uploaded". The file is listed. **Held**: J-64 W1 at 1440 px and W5 on a Pixel 7; my own keyboard walk at 1024 px with Enter and Space.
2. **Alternate: a second version.** A later upload of the same type is the one current file, and the earlier one shows "replaced". **Held** (DW7; probe D: six finishes in parallel give one current).
3. **Empty.** A person with no other documents shows only the label and Add. **Held.**
4. **Error: wrong bytes behind a .pdf name.** The person sees PF-F4's words, "…Allowed here: PDF, JPEG and PNG. Nothing was stored.", and no row is written. **Held** (W4, my 1024 px walk).
5. **Error: a damaged PDF.** CS-D1t's words show and no row is written. **But** the bytes stay in FilesPort (probe B). Major.
6. **Error: a sound PDF that pypdf reads slowly** (80k pages). The rail answers 500 "Try again in a moment", and every retry fails the same way. The multipart route stores the same file (probe A). Minor, declared.
7. **Wrong role.** A Read-only sign-in presses Add. The server answers 404 at creation and nothing is staged (DW3). On screen the words are "This upload is no longer on the server. Start it again." This is wrong and a dead end (found by reading `rail.ts:150` and `resumable-upload.ts:43`). Major.
8. **Wrong firm, by URL.** sample-solo's Owner gets 404 on HEAD and PATCH of the upload (W3, DW2). **Held.**
9. **Recovery.** A repeated finish (an empty PATCH, then HEAD) gives the same file id, with no second row or version (W2, DW6). The role is ended mid-upload: 404 "You can no longer add documents…", no document. With the role back, a HEAD finishes it (probe C). **Held**, though the bytes are kept again (finding 1).
10. **Across the screen boundary.** The listed document appears in the Documents panel's new block. Readers and preview of these files move with CS-D1, so I did not walk them.

## Data underneath
* One `plat_file` (SCANNING, the original's sha256) and one `case_document` per finish. `uploaded_by` is the linked case user.
* One audit line: "uploaded", actor `staff:<id>`, written inside the transaction.
* With the multipart route, the audit actor is still the simulated person (DW8).
* After a refusal in `onComplete`: no row, but FilesPort bytes and `.meta` are left (probes B and C).

## Accessibility and sizes
* axe (WCAG 2.2 A/AA) on the block: 0 violations at 1024 px (idle, sign-in card, listed, refused), at 720 px 2x (200 % zoom of 1440) and at 400 px.
* No sideways page scroll at any of these widths. J-64 W5 shows the block fits a Pixel 7.
* The focus ring is visible (3 px).
* Focus drops to `<body>` after the sign-in closes and after an upload finishes (the button is disabled while busy).
* A refusal is announced twice: an sr-only status and an alert with the same words.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | W1, W5, keyboard walk |
| Next step obvious | 1 | The Add label names the kind and the person; the sign-in is inline and says why |
| Plain words | ½ | The Read-only and revoked paths show "no longer on the server. Start it again." |
| Feedback and state | 1 | paused, resumed N%, uploaded, listed (`w1-1440-paused.png`) |
| Correct data | ½ | One row and one version, sha256 matches; refused bytes kept in FilesPort |
| Error recovery | ½ | Resume and repeat finish work; the slow-PDF retry loops; the 404 advice cannot work |
| Accessibility and screen sizes | ½ | axe 0 at all widths, no sideways scroll; focus lost twice, double announcement |
| Speed | 1 | Small PDF finishes in about 0.6 s; the case page's first view (0.6–1.2 s) is unchanged by this item |
| Visual quality | 1 | Team Button and type scale; wraps cleanly on a phone (`w5-pixel7-paused.png`) |
| Trust and sources | 1 | "(Sample)" on the kind; who and when on each file; the audit names the staff member |

**Fixes that raise the low scores, most valuable first:**
1. Store nothing before the door's checks pass (a pre-`put` check), or remove the key on a refusal. This raises correct data and error recovery.
2. Give a sign-in with no upload right a worded 403 instead of the expired-upload words. This raises plain words and error recovery.
3. Keep focus on the Add button (`aria-disabled` while busy, focus back after sign-in), and announce a refusal once. This raises accessibility.

**Not tested:** a real screen reader; an intended user's unaided walk (D17 and D20 stay with the founder); a deactivated staff member mid-upload; the S3 rail.

## Round 2 (diff-only, cba94bbb)
The round-1 journeys were replayed with J-64 W1 to W6 plus the staff-door suite (30/30), with refusal words checked underneath (403 and 404 bodies, no FilesPort bytes, no staging copy). J-64 as committed fails at W6 2 of 2 times on Linux Chromium. The cause is a test race (review R2-1): the file-chooser waiter is armed while Enter is already pressed. With a 150 ms wait, W1 to W6 pass 16/16 (focus back on Add after sign-in and after upload, axe 0 at 1024 px, the Read-only words).

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | W1, W5, W6 (keyboard) |
| Next step obvious | 1 | unchanged |
| Plain words | 1 | Read only: "Your role cannot add documents to cases. Nothing was stored."; no case user, role ended, person not on case: their own words |
| Feedback and state | ½ | the status line and the refusal are each said once; the Add button looks enabled while busy (R2-2) |
| Correct data | 1 | refused files leave no row, bytes or staging copy (DW5, DW9) |
| Error recovery | 1 | a slow sound PDF stores (DW11); a 5xx keeps the upload for a retry |
| Accessibility and screen sizes | 1 | focus kept (W6), axe 0, 1024 px |
| Speed | 1 | unchanged; the 10 MB, 90k-page PDF takes 7.9 s, which is the pypdf limit |
| Visual quality | 1 | "· current", earlier versions folded |
| Trust and sources | 1 | unchanged |

**Score 9.5 / 10, pass.** Fix first: R2-1, so the scripted replay is reliable. Not tested: a real screen reader, and an unaided walk by an intended user (D17/D20 stay with the founder).
