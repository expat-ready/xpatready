# PF-13 part 2: the Branding panel (concept, one page)

Row: BACKLOG **PF-13** (map row 23; Release 1 capability **R1.23** "firm logo, colour, favicon"). Parts 1a and 1b (API and images) are on `main`. No board: the tech lead approves after the independent challenger (P-223 (4)). Drafted 22 Nov by the screens builder.

## 1. Job
An Owner or Admin sets how clients see the firm (logo, one brand colour, sender name, favicon, banner) and **sees it on a client page header, an email header and a PDF header before saving** (AG-1-6, AG-1-9, AG-16-2; P-574 (1)).

## 2. What exists, what is new
* On `main` (not changed here): `GET|PUT /api/platform/branding` (colour, senderName, …; 422 with `fields`), `PUT|DELETE /api/platform/branding/:kind` (logo, favicon, banner; one multipart `file`; 413 over 2 MB / 256 KB, 415 unless PNG or JPEG), `GET /api/public/firms/:firmKey/branding` (the firm's name). Keys `agent/settings:list` / `agent/settings:edit`. One audit line per changed key.
* New: the page `/platform/branding` in `web/src/modules/platform/branding/` (page, pure contract, preview), its route line, one menu line (My account → Branding, for `agent/settings:edit`, the same place and key as Offices), `tests/check_pf13_branding_browser.ts`. No API change, no migration, no new library.

## 3. Business rules
* **BR-1 (AG-1-9):** the preview is drawn from the values on the form, saved or not. A change to any field changes the preview at once.
* **BR-2 (row "nothing is stored until Save"):** choosing a file or typing sends nothing. Chosen images are held in the browser; Save sends the changed text values (one PUT, only when one changed, only the changed fields), then each changed image one after another (PUT or DELETE), carrying on past a refusal, and **always ends with one `GET /api/platform/branding`**, which becomes the form's new starting point (challenge M1). Closing or reloading the tab with unsaved changes asks first; moving to another page inside the app does not, as in the app's other editors (`BrowserRouter` has no route blocker; challenge m3).
* **BR-3 (row; WCAG 2.1 SC 1.4.3, 4.5:1, as part 1a cites):** a brand colour under 4.5:1 on white is refused on the field with its ratio, in the server's own words ("Contrast 2.32:1 on white; at least 4.5:1 is needed."); the preview keeps the last acceptable colour; Save does not send. The ratio is cut, never rounded up, exactly as the server does (a parity test reads both functions).
* **BR-4 (row; part 1b):** a file is accepted only when its first bytes are PNG or JPEG (never by its name or its declared type); an SVG, with or without a script, is refused when chosen: "Use a PNG or JPEG file." It is never drawn, not even in the preview. Before anything is drawn the page also reads the size the file's header declares and refuses, in the server's words, a file that is cut short, arithmetic-coded, wider or taller than 65,535 px or over 89.5 megapixels; then it draws only once the browser has decoded it (challenge M2). The preview address is built from the checked bytes with the checked type, used only as an `<img>` source and revoked on replace, remove, discard and leaving (challenge m1). The server's 415 stays the authority.
* **BR-5 (row; part 1b's Sample limits):** a file over its limit is refused when chosen, with the limit: "The logo can be at most 2 MB." (favicon 256 KB, banner 2 MB). The server's 413 stays the authority.
* **BR-6 (AG-16-2):** only Owner and Admin (`agent/settings:edit`) see the entry and the form; anyone else who types the address sees "Only an Owner or Admin can change the firm's branding." and no values.
* **BR-7 (AG-16-2 "until set"):** an unset colour shows ExpatReady's neutral colour (from the read's `neutral.colour`), an unset sender name shows the firm's name (from `GET /api/public/firms/{me.firmKey}/branding` → `name`; "Your firm" if that read fails; challenge m2), an unset image shows none; "Remove" and "Use the neutral colour" put a value back to unset (on Save).
* **BR-8:** a refusal from the server on Save is shown in its words on its field; what was saved before the refusal is said plainly ("Saved: colour, sender name. Not saved: logo."), and the unsaved part stays on the form. When a request's answer never arrives the page cannot know: it says "Could not confirm every change; the form shows what is stored now." and shows the read (challenge M1).

## 4. Layout (EXPERIENCE: a settings form with a side preview)
Inside `PlatformFrame` (crumb "Branding"). Two columns from 1024 px (form left, preview right, the preview sticks while the form scrolls); one column at 375 px (form, then preview).
* **Form:** Logo (Choose file, Remove; thumbnail; "PNG or JPEG, at most 2 MB") · Brand colour (text field `#rrggbb` plus the browser's colour picker; under it the live line "Contrast 8.59:1 on white") · Sender name (at most 80 characters; hint "Unset: your firm's name") · Favicon (256 KB) · Banner (2 MB). Footer bar: "Unsaved changes" marker, **Discard changes**, **Save**.
* **Preview** (heading "Preview", note "This is how clients will see your firm. Nothing is saved until you press Save."): (a) *Client page*: a browser-tab strip with the favicon and firm name, the banner, then a header with the logo and firm name on the brand colour; (b) *Email*: "From: <sender name>", a header with the logo and name on the brand colour; (c) *PDF*: a white page top with the logo, the firm's name and a rule in the brand colour. Each preview is a labelled figure; images have alt text.
* **States:** loading · refused (BR-6) · load error · clean · unsaved · field error (BR-3, -4, -5) · saving · saved (a notice under the buttons, "Branding saved.", said to screen readers; review m7) · part-saved (BR-8).

## 4b. Best in class
**Unverified (from memory; docs.stripe.com is not reachable from the builder's session; challenge m4):** Stripe's Branding settings (docs.stripe.com/get-started/account/branding: icon, logo, brand and accent colour, with a side preview of Checkout, emails and receipts that follows unsaved edits) is the pattern copied: fields left, three real-surface previews right, one Save. Shopify's theme editor previews before publish the same way. What we add: the contrast ratio shown as you type with the pass mark (Stripe picks contrast silently), and refusals said at the moment of choosing a file, with the limit.

## 5. Copy
Title "Branding" · intro "How clients see your firm on its pages, emails and documents." · errors as BR-3, -4, -5 · empty image "No logo yet" · leave guard "Discard your unsaved branding changes?".

## 6. Tests (`tests/check_pf13_branding_browser.ts`, isolated copy, Sample firms, US$0)
A pass and a fail each: **DW6a** preview changes before Save and the API read is unchanged (fail: after Save the read has the values and one audit line per changed key) · **DW6b** contrast (a failing colour refused with the ratio, nothing sent; a passing one accepted; parity of the web and server ratio on a list of colours) · **DW6c** an SVG with a script refused when chosen and by the API (415), never drawn; a PNG accepted · **DW6d** a 6 MB logo refused with "2 MB" when chosen and by the API (413); a small one accepted; exactly 2 MB accepted, 2 MB + 1 byte and a favicon of 256 KB + 1 byte refused (m5); a list of files (cut short, oversized header, arithmetic JPEG, SVG, good PNG and JPEG) gets the same yes or no from the page's check and the server's `walkImage` (M2) · **DW6g** a partial save: the logo refused by the server after the colour saved → "Saved: brand colour. Not saved: logo.", the read has the colour, the logo is still marked changed (M1) · **DW6e** the Case Officer: no entry, the refusal, no values (fail: the Owner has both) · **DW6f** Remove and Discard · **DW7** keyboard only (Tab to every control, Save by Enter, focus on the first field in error), axe-core WCAG 2.2 A/AA clean in every state, 375/1024/1440 with no sideways scroll (fail: axe finds a planted unlabelled button).

## 6b. Capability or scaffolding (P-33, P-26)
Capability, needed for the proof (R1.23): every element above. **Not built here** (said in the PR, no silent cut): the accent colour, tagline, footer and email signature fields (the API has them; the builder's brief names only logo, colour, sender name, favicon and banner); drawing the brand on the real client pages and PDFs (row's "applied" line, its own part).

## 7. Questions (recommendation first)
1. The other four values (accent colour, tagline, footer, email signature): **recommend a follow-up part on this same page** after R1.23 is proven; they need no new design.
2. The menu line in `account-sections.ts` is outside the brief's touch list: **recommend allowing it** (one line; without it nobody reaches the page by screens, gate A).

## Challenge (22 Nov)
`challenge.md`: Build after these changes; no Blocker, Majors M1 and M2 and Minors m1 to m5 all taken into the text above. The challenger agrees with both §7 recommendations.

## Definition of ready
Acceptance test named (§6) · row text and "Done when" (BACKLOG PF-13; the builder's brief) · decisions: none open (P-574, P-629 answered; Q1 and Q2 are the tech lead's).
