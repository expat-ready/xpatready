# PF-5t part 2: break report (screens), PR #2135 at 379f2c0

Breaker, 18 Nov 2026. Isolated copy `brk_pf5t` on :4548 (`PLATFORM_IDENTITY=local`, database `xr_studio_brk_pf5t`, Sample firms seeded, versions inserted into `platform_terms_version`). Playwright with headless Chromium at 375, 1024, 1440 and 720 px (1440 at 200 %). Stopped at the end. Nothing fixed. Wording and versions Sample. Unconfirmed: no counsel.

**How the bundle was checked.** At 14:11 UTC, partway through the run, the branch moved on to 79859beeb in the shared folder and `web/dist` was rebuilt from that commit. So every result below was run again with the browser served a bundle built from `git archive 379f2c0ff` (checked: it holds "Themself", not "Their own"). The API process had started from 379f2c0. One earlier result came from the rebuild window: a 428 that did not bring the terms page, which never happened again on 379f2c0. It is not counted.

Scope (brief PF-5t.md "Part 2, screens", wave1-terms.md): the terms page inside `PlatformFrame`, accepting and returning to the same address, Settings → Terms, keyboard, axe, and 375/1024/1440.

## Findings

### Major

**M1. Endless request loop when GET /me/terms fails while terms are pending.**
* Steps: a person has a pending version. GET `/api/platform/me/terms` answers 500, a network error or an unexpected shape (forced with a Playwright route). The person opens /platform/team, /account or /platform/terms.
* Expected: one failed check and a clear message. Or the page shows its own error, as the code comment says.
* Actual: in 3 s the browser sends 134–187 calls to `/me/terms` and the same number to the page's own route (`/platform/staff`, `/me/account` or `/terms/acceptances`). That is about 1,600 in 10 s. It never stops, and the page flickers between "Checking who is signed in…" and "Not available".
* Cause: the page's call gets 428 and the gate invalidates the terms query (terms-gate.tsx:19). That query has no data yet, so its refetch puts it back to `pending`. `checked` turns false (terms-gate.tsx:25), so the frame unmounts the page (frame.tsx:95). The terms query fails, `checked` turns true, the page mounts again and its query sends again: another 428. The same code is in 79859beeb.

**M2. What the person typed is lost when a 428 brings the terms page mid-action.**
* Steps: an Owner opens Complaints → Record a complaint and types a name and a summary. A privacy notice is published. The Owner presses Save, which gets 428. The terms page shows. The Owner presses I accept.
* Expected: "Accepting returns the person where they were" (brief), and what was typed is kept (EXPERIENCE BIC-13).
* Actual: the address is the same, but the drawer is closed. Opening it again shows empty fields. Team → Invite people does the same: the email typed into the invitation is gone.
* Cause: frame.tsx:96 swaps the children for `TermsPage`, which unmounts every open panel and its state.

### Minor

* **m1. A long version string pushes the page sideways.** A 300-character version with no spaces makes the page 2,041 px wide at 375, 2,353 at 1024 and 2,201 at 720 (200 %). The `<li>` has no overflow-wrap (terms-gate.tsx:55–56). This breaks BIC-20 at 1024 and 200 %, but needs unusual data. In Settings → Terms the same version makes the table 2,675 px wide inside its own scroll box. The page itself stays put, but Who/For/Accepted move off-screen (acceptances-page.tsx:31).
* **m2. `safeUrl` makes a link out of protocol-relative and bare-root urls.** The database check allows `^(https://|/)`, so `//evil.example/terms` is accepted. It shows as "Read the privacy notice" pointing to http://evil.example/terms. The url `/` shows as a link to the app's own home, on the terms page and in Settings → Terms (contract.ts:25). `javascript:` is refused by the database.
* **m3. Focus is lost after the page changes.** After I accept succeeds, focus goes to `<body>` on the page that comes back. After a refusal (400 TERMS_NOT_CURRENT, or a mocked 409), focus also goes to `<body>`: the busy button turns disabled and drops it. The alert is still read out. In Settings → Terms, after the last "Show more", the button disappears and focus goes to `<body>` (terms-gate.tsx:36,66; acceptances-page.tsx:40). 79859beeb moves focus after accept; 379f2c0 does not.
* **m4. TERMS_NOT_CURRENT tells the person to reload when the page has already reloaded.** A newer privacy notice is published while the page shows, then I accept. The answer is 400 and the list updates to the new version by itself (terms-gate.tsx:44). The red notice still says "Reload the page and accept the versions shown." The words are part 1's; the screen shows them after it has already refreshed.
* **m5. The side menu and the crumb stay while terms are pending.** At 1024 and 1440 the side menu (Profile, Team, Terms) and "My account › Team" stay next to the terms page (frame.tsx:91). Each entry changes the address and shows the terms page again. At 375 the menu is hidden, because the small menu is inside the children. The content is still blocked.
* **m6. Unusual version text reads badly.** An empty or whitespace-only version reads "Data processing terms · version · published …". An Arabic version is not isolated (no `<bdi>`), so "الإصدار ٣ — 1795…" shows as "— ٣ الإصدار 1795…" in the line (terms-gate.tsx:56).

## What held
* **Version published while on a page.** With no click, nothing changes. The next menu click, chip or navigation shows the terms page. A 428 from a mutation also does: Invite answers 428, then the list refetch answers 428 and the terms page shows with focus on its heading (3 runs out of 3).
* **Two tabs on one session.** Accepting in tab A leaves tab B on the terms page. I accept in B then answers 200, writes nothing new (one database row) and shows B's content.
* **Not current any more.** The answer is 400 and the list updates to the version now current. Accepting again works.
* **Double-click on I accept.** One POST, one acceptance row, one audit line.
* **Sign out during accept.** The terms page's Sign out is disabled while busy, but the header Sign out is not. Using it while the request is held ends the session and records nothing (the request reaches the server after sign-out and gets 401). With the answer held instead, the acceptance is recorded, the session ends, and signing in again shows the content at the same address. No page errors.
* **Ended sessions.** Client-side expiry on the terms page shows the sign-in card with focus. A newer sign-in elsewhere, then I accept, shows "Signed in elsewhere".
* **Reload and address.** Reload keeps the terms page. Accepting returns to `/account?tab=x#frag` unchanged. Back after accepting only goes to the earlier page.
* **Part 1's rule.** The Case Officer is only ever asked for the privacy notice. An Owner with three pending kinds reads "We've updated our data processing terms, privacy notice and terms of service." and "Please read them…", and one accept records all three.
* **Settings → Terms paging.** 168 and then 186 rows, 150 of them with the same `accepted_at`, load in three "Show more" steps with no repeat and no gap. Keyboard "Show more" keeps focus while more pages remain. There is no sideways page scroll at 375, 1024 and 1440 with normal data.
* **Refusals.** A 403 on the list shows the server's words. A 409 on accept shows the server's words. axe finds no WCAG A/AA violation on either.
* **Keyboard.** The heading takes focus on load, and Tab goes to the link, then I accept, then Sign out.

## Not tested
* **A person without agent/settings:list.** No Sample role lacks it (GET /api/platform/roles: OWNER, ADMIN, CASE_MANAGER, CASE_OFFICER, BILLING_FINANCE and READ_ONLY all hold it). The menu entry rule and the 403 view were checked instead, with the 403 mocked.
