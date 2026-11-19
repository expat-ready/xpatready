# Journey test: CS-D1t (R1.67, file-type check), reviewer role, 19 Nov 2026

Commit `14dcae83d`. Isolated copies only (4447, 4467, 4439; never :4400). Sample people, synthetic files, no model call (US$0). The walk was headless Playwright: this container has no visible browser and no ffmpeg. It used only what a person sees on the case's Documents panel, plus the API where no screen exists (the client's upload, and the door for a document with no line). Scratch script, not committed: the reviewer's scratchpad `walk/walk.mts`.

## Journeys
1. **Main.** The case officer uploads a real PDF on Client A's passport line: Received, the file named on the line (J-67 W1: held).
2. **Alternate.** A JPEG named `passport.png`, sent as image/png: stored as image/jpeg under `passport.jpg`, line Received (my walk; J-67 DW1: held).
3. **Error, wrong type.** A GIF named `passport.png`: "This type of file is not accepted. Allowed here: PDF, JPEG and PNG. Nothing was stored." on the line, which stays as it was (J-67 W2: held).
4. **Error, empty or damaged.** An empty file, and a PNG cut off after its signature: refused in words, nothing stored (J-67 W3, W4: held).
5. **Error, too large, by keyboard.** From the line's menu button: Enter, ↓ to "Upload a file…", Enter, then choose a 12 MB JPEG. The answer is PF-F4's words on the line, "This file is 12 MB; the limit for images is 10 MB. Allowed here: PDF, JPEG and PNG. Nothing was stored.", in 2.1–2.7 s. No row is added and focus stays on the menu button (held). A 30 MB PDF gets "The file is larger than 20 MB. Nothing was stored." (J-67 W5: held).
6. **Hostile file.** A PNG whose header declares 400 MP: refused, "too large to open safely", nothing stored (held). A PDF with `/JavaScript`: stored, and the audit line says "Contains scripts: opened only in the safe viewer" (`check_csd1t`: held). Nothing on screen shows the flag (finding 4 in review.md).
7. **Wrong role / other door.** The case's client uploads a JPEG on their own line through the API: stored under its own name (J-67 W6). A file the client sends that the check refuses gets 415, nothing stored (`check_csd1t`: held).
8. **Recovery.** A good file chosen right after a refusal is stored, and the refusal's words give way to the file (my walk step 2 after step 5: held).
9. **Odd names (API).** "passport" is stored as "passport.pdf". "护照 扫描.PDF" is kept as typed (held).
10. **Across the boundary.** The officer's Documents panel shows the client's stored file on its line, at 1440 and 1024 px (J-67 W7: held).

## Data underneath
Each refusal leaves the same rows, files on disk and "uploaded" audit lines for the person; each stored upload adds one of each (`check_csd1t`, J-67 DW2). The stored `media_type` and the file's extension on disk come from the bytes. Roles are checked on the server by the existing guard: neither door's guard changed.

## Break-it pass
* No-line door, 21 MB PDF: 413 "This file is too large for this upload." (no limit, no "Nothing was stored."). Minor, there before this PR (review finding 2).
* A 10 MB + 1 byte image is refused as "This file is 10 MB; the limit … is 10 MB". A pixel bomb's limit is "89.5", with no unit (PF-F4's words, review finding 3).
* Widths 1440, 1024, 400: no sideways scroll. axe WCAG 2.2 A/AA on the panel with a refusal shown: 0 violations at each width. Console and page errors: none.

## Score (each 0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | Every walk step completes. A truncated PDF is still stored (brief W line not walked, declared). The client's step is API-only (no client upload screen yet). |
| Next step obvious | 1 | The refusal names the allowed types; the line's menu still offers "Upload a file…" |
| Plain words | ½ | PF-F4's "10 MB; the limit is 10 MB" and "the limit is 89.5"; the vague words for 20 MB on the no-line door |
| Feedback and state | 1 | `role="alert"` under the line; state and files unchanged; ends "Nothing was stored." |
| Correct data | 1 | Rows, files and audit counts checked before and after; type and extension from the bytes; names corrected |
| Error recovery | 1 | The next good file after a refusal is stored |
| Accessibility and screen sizes | 1 | Keyboard path works; axe clean at 400/1024/1440; no sideways scroll |
| Speed | 1 | Small files answer at once; a 12 MB refusal in 2.1–2.7 s, including the upload |
| Visual quality | 1 | The error in the danger colour under the line; layout unchanged (`screenshots/W2-gif-refused-1440.png`) |
| Trust and sources | ½ | The scripts flag is only in the audit line, not on the document or the screen |

**Total 8.5 / 10, no criterion at 0: pass.** What would raise it, most valuable first:
1. Put the scripts flag on the document, so the screen can say it (needs the Lead's decision on a schema change).
2. PF-F4 words: round up, and add the unit after 89.5.
3. The no-line door's 20 MB words.
4. A PDF structure check (CS-D1).

**Could not test:** a visible headed walk or video (no display or ffmpeg here), a real screen reader, 200 % zoom, an intended user's unaided walk (D17, D20 stay with the founder).
