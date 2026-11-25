# Journey test, reviewer: PF-5t part 2 (terms page, Settings → Terms), 18 Nov 2026

Commit `379f2c0ff9df280df05551af02696cc7b5e9fc9d` (PR #2135). Isolated copy `rev_pf5t` on :4546 with `PLATFORM_IDENTITY=local`, stopped afterwards; never :4400.

Method: headless Chromium driven like a person (click, type, read). Versions were published with SQL, the test seed the brief names, because there is no publishing screen. Rows were checked in the database after each journey. The script and screenshots stayed in the scratchpad and are not committed. The committed screenshots in `screenshots/` match what I saw.

Wording and versions are Sample. **Unconfirmed: no counsel.**

## Journeys (persona · goal · expected)
1. **Main path, Owner, keyboard only at 1024 px**
   * Goal: "Sign in to see complaints".
   * What I did: published a privacy notice and data processing terms, signed in at `/platform/complaints`, tabbed to I accept and pressed Enter.
   * Expected: the terms page lists both, accepting records both, and the person stays at `/platform/complaints`.
   * **Held.** The page showed 0.42 s after sign-in.
     * Heading: "We've updated our data processing terms and privacy notice."
     * Focus went to the heading, and the Tab order was link, link, I accept, Sign out, then the header.
     * Accept to content took 0.11 s, at the same URL.
     * Database: 1 privacy-notice row for the Owner, 1 firm row for the data processing terms, 1 `platform.terms.accepted` audit line.
   * Focus after accepting fell to `<body>` (m2).
2. **Alternate, Second representative (not an Owner)**
   * Expected: asked only for the privacy notice, not the firm terms the Owner already accepted.
   * **Held:** `["PRIVACY_NOTICE"]`.
3. **Error, stale version**
   * What I did: a newer privacy notice was published while the page was open, then I clicked I accept.
   * **Held:**
     * The page answered "Not accepted: This is not a current version of our terms. Reload the page and accept the versions shown."
     * The list refreshed to the new version, and I accept then worked: 1 row.
   * The words ask for a reload that is no longer needed (m5).
4. **Error, a 403 from accept (DW8)**
   * **Held in the pack:** the server's words are shown, nothing is recorded, and the person stays signed in.
5. **Recovery, reload and double click**
   * **Held:**
     * Reload keeps the terms page.
     * A double click on I accept leaves 1 row and shows no error.
6. **Two tabs, one person**
   * What I did: tab A accepts, then tab B clicks I accept.
   * **Held:** B's replay answers with nothing pending, B carries on, and there is 1 row.
7. **Published while working, a 428 with no navigation**
   * What I did: on Settings → Terms (64 rows), a privacy notice was published, then I clicked Show more.
   * **Held** on the real code: the terms page replaces the list.
   * With the code's 428 listener removed, the person sees only "Could not load more: Please accept the updated terms to continue." and the pack still passes 25/25 (review M1).
8. **Sign out while pending (DW9)**
   * **Held:** the header's Sign out and the card's both end the session, and no row is written.
9. **Wrong role**
   * What I did: a staff member with no role (added for the test) opened `/platform/terms` by its address.
   * **Held:**
     * "Not available: Your roles do not include the permission this needs (agent/settings:list)."
     * There is no Terms entry in the menu.
   * The key in the words is the guard's text, outside this row.
10. **Across the boundary: Settings → Terms at 375, 512, 720 and 1024 px**
    * **Held:**
      * No sideways page scroll; the table scrolls inside its box.
      * axe found nothing at any width.
      * 4 API calls including sign-in, 50 rows, then Show more → 64.

## Break-it pass (15 min)
* A 150-character unbroken version scrolls the terms page sideways at every width from 375 to 1024 (m3, Minor).
  * At 375 px it also squeezes the Who column on Settings → Terms to one letter per line.
* No duplicate rows from a double click, two tabs or a replay.
* The URL column only takes `https://` or `/` (a database check). `safeUrl` also guards it.
* A person can only be asked for another firm's version through part 1's API, which the earlier review covered.

## Score (QUALITY "Journey score")
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J2, J4, J8: every DW walked end to end |
| Next step obvious | 1 | One card, one filled "I accept", Sign out beside it (`terms-page-owner-1440.png`) |
| Plain words | 1 | Plain heading and hint. "Themself" is the only odd word (m4) |
| Feedback and state | 1 | Busy on both buttons, "Not accepted" notice, loading line |
| Correct data | 1 | 1 row per version and person (or firm), the audit line, the non-Owner rule held (J1, J2, J5, J6) |
| Error recovery | 1 | The 400 refreshes and recovers (J3). The 403 keeps the session (J4). A 428 mid-page shows the terms page (J7) |
| Accessibility and screen sizes | ½ | axe clean at 375 to 1440 and keyboard-complete. But focus is lost after accepting (m2) and a long version overflows (m3) |
| Speed | 1 | 0.42 s to the terms page, 0.11 s to accept, no call per row |
| Visual quality | 1 | Team card, Notice and Table, calm, aligned at 375, 1024 and 1440 |
| Trust and sources | 1 | Each version linked with its published date. "Wording Sample. Unconfirmed: no counsel." on both screens |

**Score: 9.5 / 10, no criterion at 0: pass.** To reach 10, return focus to the page's heading after accepting, and wrap long versions.

## Could not test
* A real screen reader.
* An intended user's unaided walk (D17 and D20 stay with the founder).
* The full CI, because the PR is a draft.
