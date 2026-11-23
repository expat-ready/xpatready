# FO-4w web-form settings: journey test (reviewer, 20 Nov 2026, commit 43f51b83c)

This is the reviewer's one journey score for this check. I ran it on isolated copies :4446 (`rev_fo4w`) and :4447 (`rev_j26`), never :4400. Live AI was off and the cost was US$0. The browser was Chromium `/opt/pw-browsers/chromium`. Everything ran from a scratch worktree at the exact head, so no screenshot in the shared tree was rewritten.

The walk was headless and scripted the way a person works: clicks, typing, Tab and Enter, reading what is on screen. My scripts and screenshots are throwaway and live under the session scratchpad (`shots/r01`–`r08`). The Sample firm's Owner is also a Case Manager. The pure Case Manager is `second.representative@…`. The Sample firm has no Admin.

## Journeys
| # | Persona and goal | Steps | Expected | Result |
|---|---|---|---|---|
| J1 | Owner, keyboard only, 1440 px: "put our enquiry form on our website" | Sign-in card (type, Tab, Enter). Tab to the Sales menu's **Web form**, Enter. Type a site, Enter. Copy snippet | Saved, and the snippet is on the clipboard | Held. Menu to page took 57 ms. Tab order: menu, then Site 1, Remove, Add a site, Save sites, snippet, Copy snippet. Saved by Enter. The clipboard holds `embedSnippet`'s exact text (PR suite) |
| J2 | Visitor from a campaign, on the firm's site with the copied snippet | Blog link with utm and gclid → contact page → fill → Send | The firm's thank-you, one lead (door WEB_FORM) with attribution | Held (J-26 W2, 15/15): spring / google / cpc / GCLID, landing and referring page, no cookie or storage |
| J3 | Visitor on the hosted link (alternate) | Open the hosted page link → empty Send → fill → Send | Each field's error on its own field; one lead with no attribution | Held (J-26 W4) |
| J4 | Owner, error: bad entries | Enter `…/contact`, `ftp://…` and `our website`, then Save | Each refused on its own field, focus on the first, nothing saved | Held. Focus went to Site 1. The input was kept. The summary says only "Some sites need fixing." |
| J5 | Owner, error: a wildcard site, as other embed tools allow | Enter `https://*.example.com` and Save | Refused, or explained | **Not met.** The screen said "Saved. 1 site can show this form." (`r03`). After that the public read from `https://www.example.com` gets no `Access-Control-Allow-Origin`, so the embed falls back to the link. `https://a,b.com` and `https://x;sandbox` are also saved (review M1) |
| J6 | Owner, recovery: removes a refused row after a failed save | Three rows (page, ftp, valid). Save. Remove Site 1 | The remaining rows keep their own messages | **Not met.** The ftp row now shows "without a page", and the valid `https://c.example.com` shows "Only http:// or https://" (`r02`, review m1). The next Save corrects them |
| J7 | Two Owners save the same form (two tabs, a race) | 4 parallel PUTs with the same version, ×5 rounds; then a stale save on screen | One wins per round, the rest get 409; the screen offers Reload | Held: exactly one 200 per round, 5 audit lines. The screen's stale notice works and Reload shows their list |
| J8 | Case Officer and Case Manager, wrong role by URL | Leads, then `/front-office/settings/web-form` directly, then the API | No menu item; the page says who may; API 403 | Held (`r06`): "Owners and Admins only". GET and PUT return 403, signed-out 401, another firm's form 404 |
| J9 | Owner at 1024 px, 200 % zoom (720 CSS px), 400 px; form off; a 224-character form name | Open the page | No sideways scroll, axe clean, states drawn | Held (`r04`, `r05`, `r07`, `r08`). axe found 0 issues at 1024 px. The off notice reads "until it is switched on", but this page has no switch (review m4) |
| J10 | Next step: Owner's Leads › Unassigned | After J2 and J3 | Both leads listed | Held (J-26 W5) |

## Data underneath
- Each save writes `allowed_sites` exactly as `siteOf` gives it, merges duplicates and writes one `fo.web_form.sites_changed` audit line naming the added and removed sites.
- A refused save (422 or 409) writes nothing.
- Another firm's row stays unchanged (404).
- The server enforces the key: the GET and PUT routes carry `@PermissionKeys("agent/prospect:configure-form")`.
- A no-op save (the same list) still bumps the version and writes a "0 added, 0 removed" line (review m3).

## Break-it (15 min)
- Wildcard and invalid host characters accepted, with a false "Saved." message: **Major** (M1).
- Errors stick to row positions after Remove: Minor (m1).
- Non-English host: `https://bücher.de` is stored as punycode `https://xn--bcher-kva.de`, which matches what the browser sends. Holds.
- Oversized body handling holds: 300-character site → 422 "too long", 21 sites → 422, extra key → 422, `sites: "x"` → 422, bad id → 404.
- A reload with unsaved rows loses them without a warning (Minor, folded into m1's fix note).
- A double press is guarded: the busy button blocks it.

## Score (0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J2, J10. j_26 15/15 and the PR suite 25/25 on my copies |
| Next step obvious | 1 | "Save your site above first" before a site exists. Snippet and link each sit next to their Copy button (`r01`) |
| Plain words | 1 | Plain and specific refusals. Small issues: "Remove" alone, "switched on" with no switch (m4) |
| Feedback and state | ½ | False "Saved. 1 site can show this form" for a site that can never match (J5). Misplaced messages after Remove (J6) |
| Correct data | ½ | Race-safe and versioned (J7), but entries that are not hosts are stored (M1) |
| Error recovery | 1 | Input kept, focus on the first error, stale save → Reload (J4, J7) |
| Accessibility and screen sizes | 1 | Keyboard path (J1); axe 0 in every state; 1024 px, 200 %, 400 px and 375 px with no sideways scroll |
| Speed | 1 | 57 ms from menu to page with Sample data; one request per view |
| Visual quality | 1 | Team card, tokens and Notice components. Remove drifts below the input when an error shows (`r02`, cosmetic) |
| Trust and sources | 1 | The snippet comes from the one source (`embed/snippet.ts`). No AI. The data is Sample |

**Score: 9 / 10. Pass (8 or more, no 0).** Fixes that raise it, most valuable first:
1. Refuse wildcards and host characters that are not valid (M1).
2. Clear or re-key the field errors on Remove (m1).

Not tested:
- a real screen reader;
- an Admin (the Sample firm has none; the check is by key);
- an intended user's unaided walk (D17 and D20 stay with the founder);
- the `walk.mjs` video (no ffmpeg here).
