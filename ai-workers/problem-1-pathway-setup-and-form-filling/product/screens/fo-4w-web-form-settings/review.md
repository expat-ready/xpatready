# Review: FO-4w web-form settings (Sales › Settings › Web form) and J-26, PR #2525

I am a fresh-context reviewer and did not build this.

- **Commit reviewed:** `43f51b83c1256125a6ef8e59f795a6c261f26a4b` on `claude/magical-franklin-d11aig`; diff `origin/main...43f51b83c`, 19 files, +560 / -5.
- **Row:** FO-4w (Lead 2, series 3, on #2451).
- **Concept:** FO-4 r2 screen 2b (`origin/lead-b-front-office` `screens/fo-4-sales/concept.md:27`).
- **Requirements:** AG-2-5 rules 1, 2, 13; AG-2-49 rule 4 (`trace-requirements.py --brief FO-4b`).

**Verdict (skill wording): Ship after fixes.** One Major (M1) is open.

## What I ran (exact head, scratch worktree, never :4400, live AI off, US$0)
- `check_fo4w_web_form_settings_browser.ts` on its own copy `rev_fo4w` :4446: **25/25**.
- `j_26.ts` on its own copy `rev_j26` :4447, the run its header names: **15/15**.
- Probes (throwaway scripts, deleted):
  - 4 parallel PUTs with the same version, ×5 rounds: exactly one 200 per round, the rest 409, one audit line per win. The lock holds.
  - Odd bodies all get 422 with a field: non-list, bad version, extra key, number entry, 300-character site, `null`, array.
  - Bad id and unknown id: 404.
  - `siteEntry` on 13 inputs: the wildcard and invalid host characters are accepted (M1).
  - Browser walk at 1440, 1024, 720 (200 %) and 400 px, keyboard only, plus Case Officer and Case Manager. Screenshots `r01`–`r08` are in the session scratchpad.
- `graph.mjs`: G1 0, G2 0, G4 0, G5 0.
  - G3 lists both routes as unreached. That is a parser limit: the suite calls them through its `api()` helper (check_fo4w:69-80) and the page through `staffApi`. Not a finding.

## Concept fit: page, not right panel
- Accepted. Concept §2 itself puts **Settings: Web form** in the Sales menu. There is one seeded form per firm and no form list to open a panel from. The page keeps the sites next to the snippet they unlock.
- The reason is written in the page header comment and the PR. It should also go in `screens/fo-4w-web-form-settings/` as build-notes or challenge (m5).
- The row's scope is met: allowed sites, `embedSnippet(publicOrigin, token)` with Copy, the hosted link with Copy, and J-26 with `Completes: R1.26`.
- On/off, consent wording and thank-you text are the panel's later parts and are not findings.

## Issues, ranked

### M1 Major (Must): the entry check accepts things that are not hosts and answers "Saved."
- **Where:** `api/src/front-office/sales/web-form-settings.ts:39-50` (`siteEntry`). It trusts `new URL()`, whose host parser allows `*`, `,`, `;`, `'`, `$` and `!`.
- **Failure scenario:**
  1. The Owner enters `https://*.example.com`, the usual way other embed tools list subdomains.
  2. The screen says "Saved. 1 site can show this form." (`r03`).
  3. The firm pastes the snippet on `https://www.example.com`.
  4. `corsFor` (public.ts:146-148) compares exactly, so the read gets no `Access-Control-Allow-Origin` (probe confirmed). Visitors get only the "Send us an enquiry" link while the Owner believes the form is live.
- A typo such as `https://www,example.com` is saved in the same way.
- `https://x;sandbox` is saved and goes verbatim into the `frame-ancestors` header (public.ts:199-201). It does no harm today because that header is only on the JSON read, but it is an unvalidated header write.
- This is the screen's one job (AG-2-49 rule 4, BIC-04 "a malformed value is refused at the field with its fix"), so a false success is Major.
- **Fix:**
  - After `new URL`, refuse unless `u.hostname` matches `^[a-z0-9-]+(\.[a-z0-9-]+)*\.?$` (punycode already applied) or is a bracketed IPv6 literal.
  - Give `*` its own words: "Enter each site in full, for example https://www.example.com; a * pattern is not supported."
  - Add a fail case to `check_fo4w_web_form_settings_browser.ts`, on screen or by API: `https://*.example.com` → 422 `sites.0`, nothing saved.

### m1 Minor (Should): field errors stick to row positions after Remove
- **Where:** `web/src/modules/front-office/sales/web-form-settings-page.tsx:80`. The Remove handler changes `rows` but not `errors`, which are keyed by index (:42, :64).
- **Scenario:**
  1. Rows are `…/contact`, `ftp://…` and a valid `https://c.example.com`. Save.
  2. Remove Site 1. The ftp row now says "without a page", and the valid row says "Only http:// or https://" (`r02`).
- The next Save corrects it. No wrong data is stored.
- The suite removes rows only from the end (check_fo4w:115), so it misses this.
- **Fix:** shift or clear the errors on Remove, and add a remove-the-middle-row case.

### m2 Minor (Should, test): removing the row lock fails no test
- **Where:** the `for update` at web-form-settings.ts:72.
- Without it, two saves holding the same version both pass the compare: last write wins and two audit lines are written.
- The suite tests only a sequential stale save. My parallel probe shows the code is right today.
- The username/password refusal (:45) is also untested.
- **Fix:** add the 4-parallel-PUT check (one 200, the rest 409, one audit line).

### m3 Minor (Should): a no-op save still writes
- Saving the unchanged list bumps `updated_at`, writes a "0 added, 0 removed" audit line (:76-83), and makes another editor's open copy stale for nothing.
- **Fix:** when `added` and `removed` are both empty, return the current view without writing.

### m4 Minor (Should): words
- The off notice (page:101) says "until it is switched on", but nothing on this page or elsewhere switches it on. Say "An Owner or Admin can switch it on in a later release" or name where.
- The visible "Remove" alone is on PRODUCT §4's "Not" list. Use "Remove site" (the aria-label is already full).
- The error summary "Some sites need fixing." names no row. BIC-13 asks for a summary with the same words; focus does go to the first bad field.

### m5 Minor (Should): records
- `web/src/modules/front-office/embed/snippet.ts:3-5` still says "No screen shows it yet … (FO-4's, not built)". That is now false and breaks the STANDARDS §5 comment [M].
- The page comment's "(stated on the PR)" is a process note.
- The screen folder has no build-notes, so there is no retrofit mapping to check (skill step 6).
- There is no 1024 px screenshot, which concept §6 asks for; mine is `r04`.
- The page's zod shape lives in the page, not `contract.ts`, against concept §2's "zod shapes in contract.ts".

## Standards [M], summary
- **Met:**
  - Server authorisation by key on both routes, deny by default (401, 403, 404 tested).
  - Firm scope on the read, the lock, the update and the audit.
  - Optimistic concurrency: a stale save gets 409 with Reload, though it does not show what changed.
  - RFC 9457 field errors `sites.<n>`.
  - One request per view.
  - axe in every state; keyboard path; 1024 px and 200 %.
  - Team tokens and components; path on the page; one primary per card.
  - Audit on configuration change (AG-2-49 §9).
- **Partly:**
  - Input validation, the OWASP basics (M1).
  - Comments say why (m5).
  - "A rule's test fails when the rule is removed" (m2).
  - In-page confirmation for destructive actions: saving an empty list turns the live embed into the link at once, with no confirm, though the result is said plainly after the save.

## D1–D20 (1–5)
D1 4 (rules built; M1) · D2 3 (race-proof; malformed hosts stored, M1) · D3 4 (one snippet source; hosted URL built twice) · D4 N/A · D5 4 (stale → Reload; unsaved rows lost on reload) · D6 4 (audit line; no-op lines m3) · D7 N/A · D8 5 (crumb, active menu) · D9 4 · D10 4 (m4) · D11 3 (false "Saved.", m1) · D12 4 (Remove misaligned, `r02`) · D13 5 (keyboard, axe 0, 1024/200 %/400/375) · D14 4 (zod outside contract.ts) · D15 5 (57 ms) · D16 4 (m2, no wildcard case) · D17 simulated only · D18 4 · D19 4 (R1.26 by screens, J-26 15/15) · D20 simulated only.

## BIC scorecard (1440 `r01`/`r03`, 1024 `r04`)
Partly (Should): BIC-04 malformed sites accepted (M1); BIC-13 summary generic (m4). Met: BIC-11 (one primary "Save sites"), BIC-14, BIC-18 (skeleton, saved/failed, read-only says why), BIC-19, BIC-20. N/A: 01-03, 05-10, 12, 15-17.

## Journey test (reviewer's one score)
**9 / 10, pass.** Details are in `journey-test-reviewer-2026-11-20.md`:
- Feedback and state ½ (M1, m1).
- Correct data ½ (M1).
- Every other criterion 1.

## Breaker
`break-report.md` (separate run) records its own Major: a save of 6+ ordinary sites returns 500 (the audit value's 200-character cap). I did not re-run it; it must be closed with M1. The shared tree now holds the builder's uncommitted fixes; this review covers 43f51b83c only.

## Could not check
- A real screen reader.
- An Admin login (the Sample firm has none; the check is by key).
- `walk.mjs` video (no ffmpeg).
- An intended user's unaided walk (D17 and D20 stay with the founder).

**Verdict: Block** for 43f51b83c. Fix before approval:
1. **M1:** refuse wildcard and invalid-host entries in `siteEntry`, with a fail test.
2. The breaker's M1 (500 on 6+ sites), per `break-report.md`.

Minors m1–m5 should be fixed or listed in the PR.

## Re-review on e9dc1b3ef (round 2; diff `43f51b83c..e9dc1b3ef` only)

### What I ran
Fresh scratch worktree at `e9dc1b3efa43d5a801c0b2ca9028e283b5f95bc9`, on fresh copies `rev2_fo4w` :4446 and `rev2_j26` :4447 (never :4400). Both copies are now stopped. Live AI was off; US$0.
- `check_fo4w_web_form_settings_browser`: **31/31**.
- `j_26.ts`: **15/15**.
- Probes:
  - `siteEntry` on 13 inputs.
  - A browser walk of my own m1 scenario.
  - The wildcard entered on screen.
  - The off notice.
  - A 1024 px check.

### Status of each finding
- **M1: closed.**
  - The `HOST` check (web-form-settings.ts:24, :64) refuses each of these: `https://*.example.com`, `https://www,example.com`, `https://x;sandbox`, `https://a'b.com`, `-bad.example.com`, `under_score.example.com` and a trailing dot.
  - It still accepts `https://EXAMPLE.com:443/` (stored as `https://example.com`), IDN (punycode), IPv4, `[::1]`, `localhost` and `.co.uk`.
  - On screen the wildcard is refused on its field and nothing is stored (`r2-01`).
  - Fail test: check_fo4w "break m1". It fails if `HOST` is removed.
- **Breaker M1: closed.**
  - `listFor` keeps the audit lists within 200 characters, as whole sites marked "(+n more)".
  - One site is capped at 200 characters, on the server and in `maxLength`.
  - Tests: 20 long sites save (200), are cleared (200) with two audit lines, and a site over 200 characters gets 422 on its field.
  - Removing `listFor` brings back the 500, so the test fails.
- **m1: closed.**
  - My walk: rows page, ftp, valid → Save → Remove Site 1. Now ftp keeps "Only http:// or https://" and the valid row has no error. Focus is on a site field, including after removing the last row.
  - Test added (it removes the first row).
- **m2: partly closed.** A username/password fail test was added. There is still no parallel-save test for the row lock. My probe in round 1 showed the lock holds. This stays a listed Minor.
- **m3: closed.** An unchanged list returns the same version and writes no audit line, with a test.
  - Nit: the comparison is order-sensitive, so a reordered list still writes one "0 added, 0 removed" line.
- **m4: closed.**
  - The off notice now reads "While it is off, visitors see … on your site and on the hosted page."
  - The button is "Remove site".
  - The summary is "Not saved: check sites 1 and 2."
- **m5: partly closed.** The `snippet.ts` comment is fixed. The zod shape is still in the page, and there are still no build-notes and no 1024 px screenshot. These are listed as open Minors in the PR, which the skill allows.

### New in this diff
- **Nit:** check_fo4w uses `const focusedIsSite = true;` inside an `ok(...)`, which is a constant. The real guard is the `waitForFunction` before it, which throws on a timeout and fails the run. Delete the constant or record the wait's result.
- No new Blocker, Major or Minor.

### Journey score
**9.5 / 10, pass.**
- Correct data: ½ → 1. Only real hosts are stored, and 20 sites save.
- Feedback and state stays ½. The false "Saved." and the misplaced messages are gone, but unsaved rows are still lost without a warning on reload or when leaving the page (round-1 break-it, Minor).
- Every other criterion: 1.

**Verdict: Approve** for e9dc1b3efa43d5a801c0b2ca9028e283b5f95bc9. No Blocker or Major is open. Open Minors m2 (race test), m5 (zod shape, build-notes, 1024 px screenshot) and two Nits (order-sensitive no-op, constant `focusedIsSite`) are listed in the PR as follow-ups.
