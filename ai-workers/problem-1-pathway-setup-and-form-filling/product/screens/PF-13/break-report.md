# PF-13 part 2: Branding panel — break report (22 Nov)

Breaker: a fresh agent that did not build the screen. Commit `39253167` on `claude/jolly-ramanujan-eb9jik` (PR #2910). Isolated copy `pf13brk` on :4443 (`AI_LIVE=off PLATFORM_IDENTITY=local`), Chromium via Playwright, Sample firm `sample-firm`, Owner `user-R`, Case Officer `user-O`. US$0, no model call. Copy stopped and removed after. Scope: concept §3 BR-1 to BR-8 and §4. §6b "Not built" (the accent colour, tagline, footer and signature; the brand on the real pages) is not a finding. The merged API (parts 1a, 1b) was attacked only through the panel.
Paths are under `prototype/studio/web/src/modules/platform/branding/`.

## Verdict
**Changes: 1 Major, 5 Minor, no Blocker.**

## Findings

**MAJOR-1: edits made while a Save is running are thrown away without a word.**
* Did: chose a logo; delayed its PUT by 3 s (route stub; a 2 MB upload on a slow line takes as long). During the save: typed a sender name, typed colour `#0b6e4f` and chose a favicon.
* Expected: those edits stay on the form and show as "Unsaved changes" (BR-2: the read becomes the starting point, and nothing typed is lost). Or the fields are locked while saving.
* Actual: the page said "Branding saved." The sender field and the colour field went back to empty, the favicon choice disappeared and "Unsaved changes" went away. The server holds none of the three. The favicon's object address was never revoked: 1 still live with nothing pending, so it leaks until the page closes.
* Where: `branding-page.tsx:141` (`next` starts from the `draft` captured at click) and `:175` (`setDraft(next)` replaces anything changed since). Only Save and Discard are locked while busy (`:202-203`). The colour and sender inputs (`:189`, `:198`) and Choose/Remove/Undo (`:50-52`) stay live.
* Variant (from reading the code): choosing a new logo while the old one uploads revokes the old address (`:99`). If the server then refuses the old one, `next` puts the revoked address back, and the thumbnail shows broken.

**MINOR-1: a pasted colour with spaces around it is cut, then refused.**
* Did: pasted or typed ` #1F4E79 `.
* Expected: accepted. `colourValue` and `colourProblem` trim (`contract.ts:38-41`), and the server trims.
* Actual: `maxLength={7}` keeps ` #1F4E7`, which gets "Brand colour: a colour as #rrggbb…".
* Where: `branding-page.tsx:189`.

**MINOR-2: a long file name with no spaces makes the whole page scroll sideways.**
* Did: chose a banner named `<img…>` + 250 × `A` + `.png`.
* Actual: scrollWidth 2548 at 1440 px, 2468 at 1024 px and 2252 at 375 px. A realistic 60-character name held at 375 px.
* Where: `branding-page.tsx:54`. The state `<span>` has no `overflow-wrap:anywhere`, which the preview has.

**MINOR-3: when the read at the end of Save fails, the planned message never shows.**
* Did: let the PUT succeed, then stubbed the final GET with a 500.
* Expected: "Could not confirm every change. Please reload the page to see what is stored." (`:171`).
* Actual: the whole form is replaced by "Could not load the branding" with the bare text "500". The failed refetch sets `read.error`, so the early return at `:88` wins. The user is not told that the sender name was in fact saved.

**MINOR-4: a session that ends (401) in the middle of Save loses the user's choices, and no one says what was saved.**
* Did: the sender PUT succeeded, then the logo PUT got a 401 (stub, `TOKEN_EXPIRED`).
* Actual: the banner PUT was still sent, with no token, and so was the GET. The frame then swapped to "Sign in to your firm". The sender name is stored, but no "Saved: … Not saved: …" line is shown (BR-8), and the chosen banner is gone. Nothing leaks: the token is cleared, so no request after the 401 carries a token.
* Where: `branding-page.tsx:28` and `:164` (the loop carries on after the session ends).
* After a new sign-in the form shows the read, which is true. That is why this is Minor.

**MINOR-5: a PNG with corrupt pixel data passes the "draw only once decoded" check.**
* Did: chose a file with a valid PNG structure (CRCs correct) but 50 garbage bytes as its IDAT.
* Actual: Chromium's `img.decode()` resolved, so the page accepted the file (`branding-page.tsx:34`). At Save the server stored it as a 32 × 24 `image/png`.
* This is consistent with the server (the authority, part 1b), so it is noted rather than counted against the panel. BR-4's "decoded" is weaker than it reads.

## What held
* **Nothing sent before Save:** choosing 12 files (good, refused, bombs, oversized) and typing in both fields sent no `/api` request.
* **Uploads refused when chosen, in the server's words:**
  * an SVG with a script, PNG magic followed by SVG, and JPEG magic followed by HTML: "Use a PNG or JPEG file.";
  * a zero-byte file: "Choose a PNG or JPEG file.";
  * a 30 MB file: "The banner can be at most 2 MB." (only 12 bytes read).
* **No script ran (`alert` count 0):** a file name `<img src=x onerror=alert(1)>…` is shown as text. A PNG with HTML after IEND is shown only as an `<img>` from a blob typed `image/png`.
* **Pixel bombs within the server's limits:** an 81 MP logo (77 KB) and an 88 MP favicon (84 KB) decode in about 0.7 s without a hang. This is the same limit as the server.
* **Choosing twice:**
  * choosing quickly twice (a 64 MP PNG, then a small JPEG): the second choice wins;
  * the same file twice: accepted again, because the input is reset.
* **Object addresses:**
  * 9 made and 9 revoked on replace, undo, a failed decode and leaving the page in the app (outside MAJOR-1);
  * discard and a successful Save left 0 live.
* **Save:**
  * a double click sends one set of requests (`sending` ref);
  * images-only Save sends no values PUT;
  * a lost values PUT (aborted) gives "Could not confirm every change; the form shows what is stored now." with focus on the message.
* **Colour field:**
  * upper case is accepted and counts as unchanged against the stored lower case;
  * `#fff`, `#1f4`, `1f4e79`, `red` and `#1f4e79;background:url(x)` are refused or cut, and never reach `style`;
  * low contrast gives "Contrast 1.51:1 on white; …" and the preview keeps the last good colour;
  * the colour picker writes the field, and a light pick is refused with its ratio.
* **Sender name:**
  * 81 characters: refused on the field;
  * 16 family emoji (80 code points, 128 UTF-16 units): accepted, the same count as the server;
  * HTML is shown as text;
  * U+200B, U+202E and a tab: the server's refusal is shown on the field ("plain text only…"), with "Not saved: brand colour and sender name." (one transaction, true);
  * Latin, CJK and Arabic text saves.
* **Case Officer:**
  * by address: "Only an Owner or Admin can change the firm's branding.";
  * no request for the branding read or the firm name;
  * the API refuses the PUT (403).
* **Two tabs:**
  * a stale tab that changed only the sender name did not overwrite the colour the other tab saved (only changed fields are sent);
  * after Save it shows the fresh colour.
* **Keyboard and layout:**
  * Tab reaches each Choose button, the colour text, the picker, Use neutral, the sender name, Save and Discard;
  * Enter on Choose opens the file chooser;
  * a refused file is announced (`role=alert`) and keeps focus on its button;
  * no sideways scroll at 375 px or at 512 px (1024 px at 200 % zoom) with a normal file name.

## Not tested
* The real beforeunload prompt (headless Chromium accepts it silently).
* Screen-reader output.
* A slow 3G upload: MAJOR-1 used a stubbed delay instead.
