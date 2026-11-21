# Review: FO-3st3 part 3a, Settings → Booking types (PR #2718) at 6b2a083c2

Reviewer: Opus 5.5, fresh context (did not build it). Skill `screen-review`; journey test `journey-test-reviewer-fo3st3-part3a-2026-11-21.md` (**8.5/10**). 21 Nov 2026, ~10:40 IST.
**Scope:** `booking/area.tsx`, `booking/settings/{contract.ts,types-page.tsx}`, `calendar-page.tsx` (menu moved), `routes.tsx`, `MODULE.rows/FO-3st3.md`, `tests/check_fo3st3_types_browser.ts`, `tests/journeys/j_42.ts` (W0). No API file changed (`types.ts` and `types.controller.ts` are as on `main`).
**The bar:** concept r2 BR-19, §4 "Settings → Booking types", §5, §6 J-T1..J-T4; `design/settings.html` §4; STANDARDS, EXPERIENCE, QUALITY.

**Verdict: Block (Ship after fixes).** J-T1..J-T4 hold on the real app and in the suite, and the server enforces every rule. Two Majors: the allow flags were dropped along with Timings even though their API is on `main`, and J-42's new W0 step fails at this commit because the preview loads twice.

## Runs (my copy `review_fo3st3` on :4581; never :4400 or the builder's :4573)
- **Suite:** `check_fo3st3_types_browser.ts` **37/37 twice**, exit 0.
- **J-42** (`j_42.ts review_fo3st3 4581`, run from a scratch worktree at 6b2a083c2):
  - W0 create: PASS.
  - **W0 "Preview as a booker shows the type's times…": FAIL** (`[]`; see M2).
  - W1-W5: PASS.
  - W6: aborted by a web 404 at 05:20:05 UTC while another copy (`fo3st3_r2`) rebuilt the shared web build. That is environmental: this PR does not change W6 or later.
- **My walks:** a headless Playwright walk as the Admin, a Case Officer, a Read-only user and two tabs, at 1440, 1024, 400 and 512 px CSS (1024 at 200 %). The database was checked after each journey.
- **Graph (P-86):** G3 lists the type routes as "no test reaches". That is the tool missing template-literal paths: the page calls them and the suite drives them in a browser. One real gap remains: `PUT booking-types/:id/hosts/:staffId/set` ("Uses set") is untested (m5).

## The split (part 3a now, Timings as 3b later)
**Justified for Timings.** I checked on `main` (a66044692):
- there is no `booking-timings` route, setting or `resolveTimings`;
- the per-type timing columns are NOT NULL with defaults (`front-office-booking.prisma`);
- the strict PATCH body refuses timing fields (`types.ts:94`).

So "Uses firm default (<value>)" and "Reset to firm default" cannot be expressed, and P-606 forbids inventing the API. Deferring the notice-longer-than-window warning is also right: it needs the firm's defaults.
**Not justified for the allow flags (M1).** Concept §4 puts "Allow reschedule" and "Allow cancellation" in Advanced "with FO-3pa", and §5 has their words. FO-3pa is on `main`:
- `types.ts:86-87` accepts `allowReschedule` and `allowCancel` on create and PATCH, and `:121` answers them;
- the public manage page and the service honour them (`manage-page.tsx:92-94`, `service.ts:321,849`).

They need nothing from 1b-ii. Lead B's "no Advanced section" ruling was argued from Timings only. The proposed FO-3st3b row names "Timings and the type's Advanced overrides, J-T5", not the flags. So a concept element that already has its API now sits on no row, and no screen can set it. Meanwhile `showOnBookingPage`, the third FO-3pa flag, was built.

## Judgment calls on the builder's additions (accepted unless listed)
- **Accepted:** the "Retired" pill (the P-116 word), "Purpose" (the server's words; "Never (case type)" needs it), "Ways to meet" (the API needs at least one), and the status lines "Added <name>.", "<name> is saved.", "<name> is retired. Its bookings stay."
- **Read-only Hosts "<n> hosts": accepted as an API gap.** I checked: no route gives staff names to a `:list` holder (`GET /platform/staff` needs `agent/staff:manage`, `staff-read/routes.ts:11`). It needs a follow-up row (m6).
- **Strings added but not listed:**
  - "You can view booking types but not change them."
  - "<name> is deleted. Its bookings stay."
  - "Visitors do not see this type now; the preview shows the times it would offer."
  - "A follow-up or case review is never on the booking page."
  - "Preview as a booker: <name>" and "The times the booking page offers. Nothing is booked."
  - "No host", "A former colleague", "Link copied.", "Embed code copied.", "Could not copy. …", "Could not load the booking types."

  All are plain. List them in the PR so §5 ("every string") can take them (n1).

## Code
- **Sound:**
  - Server authorisation: Case Officer and Read-only get 403 on create, duplicate, switch-off, delete and host-set (my walk); there is no menu or list without `:list`.
  - Double-click: Duplicate added 1 row; Save on New made 1 row.
  - Stale save: 409 with the concept's words and Reload.
  - Deleted in another tab, then saved here: "No such booking type." The rename keeps the slug.
  - The host-set row is written and read back, one audit line per create, and errors from the server land on the field (Name, Web address, Length, Description, Ways to meet), with the input kept.
- **Tests fail when the rule goes (by reading):**
  - dropping `error={errors.name}` fails J-T1 (`aria-describedby` text);
  - removing the `edits` gate fails J-T4's button count;
  - removing the menu key check fails the Billing and finance line.

## D1–D20 (1–5)
D1 3: J-T1..J-T4 met; allow flags missing (M1) · D2 4: server refuses bad, duplicate and stale data; one row on double-click · D3 4: shared `area.tsx`, house controls and time helpers · D4 4: "Never (case type)" and "On booking page" are the server's · D5 3: reload, double-click and two tabs hold; preview double load (M2); Esc drops edits (m2) · D6 4: server audit line per change · D7 5: no AI · D8 4: crumbs "Bookings › Booking types", menu entry (hidden under 768 px, see "Not checked") · D9 4: one primary per panel; empty state has no action (m4) · D10 4: concept words; n1 · D11 3: status lines; m2, m3 · D12 4: team tokens, aligned table, calm panel · D13 3: axe clean in every state, no sideways scroll at 400, 512@2x, 1024 and 1440, keyboard-complete; focus lost (m1) · D14 4: Library list + side panel like Sales settings · D15 4: list in 250-350 ms, save to row 121 ms; three reads per view (types, staff, firm name through the public door, n2) · D16 3: pass and fail per J-T; "Uses set" untested (m5); J-42 W0 flaky (M2) · D17 simulated only · D18 4: preview reasons and refusals are the server's words · D19 3: W0 now makes the type on the screen; timings and flags are still database setup · D20 simulated only.

## BIC scorecard (concept §4c; BIC-03, 05-10, 12, 15-17 N/A per concept; 01, 02 N/A: no person or public form here)
| Check | Score | Evidence |
|---|---|---|
| BIC-04 | Met | "Description (optional)"; length 4 and an 81-character name are refused at the field (suite; `fo3st3-name-81-1440.png`) |
| BIC-11 | Met | One primary per area: "New booking type" on the page, "Save type" in the panel (`fo3st3-panel-1024.png`) |
| BIC-13 | Partly | On the field with input kept, but no summary at the top; a Hosts or Ways-to-meet error sits below the fold at 1024 px (m3) |
| BIC-14 | Partly | The "Retired" pill has a hover `title` in the list only: none on keyboard focus, none on the panel badge (`types-page.tsx:74,134`) |
| BIC-18 | Partly | Skeletons, read-only line, refusal; the empty state has no "New booking type" action, which the board draws (m4) |
| BIC-19 | Met | One heading and one primary per panel; three type sizes; red only for errors (1440 and 1024 shots) |
| BIC-20 | Partly | Keyboard-only create works and 200 % zoom has no sideways scroll; focus falls to BODY after confirms (m1) |

## Issues (Must = Blocker/Major, fix with a failing test; Should = fix or list with a follow-up row)
**M1 (Must). Allow reschedule / Allow cancellation are missing although their API is on `main`** (concept §4, §5; `types.ts:86-87`). **Fix:** add the two checkboxes to the panel (with their read-only text), each with a pass and a fail check: unticked → the manage page offers no Reschedule. Or have the tech lead record on the PR, by name, which row builds them. Either one closes M1. Building them is better: they have no Timings dependency.
**M2 (Must). The preview loads twice and blanks itself; J-42 W0 fails at 6b2a083c2** (`types-page.tsx:211-213`).
- **What happens:** the first, unranged request draws the days. The effect then sets zone and date, which changes the query key, so the list drops back to skeletons until the second request answers.
- **Evidence:** two `/preview` requests on every open (my walk). My J-42 run got `[]` after the first day had appeared, and its `W0-preview-1440.png` shows the skeletons under a set date and zone.
- **Fix:** keep the earlier answer while the new one loads (`placeholderData: keepPreviousData`), or skip the first draw by getting the zone first. In `j_42.ts:158-160`, wait for a day that has a time. Re-run J-42 twice.

**m1 (Should). Focus is lost to `<body>`** after Keep, Retire, Delete or Duplicate in the list, and after closing the preview dialog. The dialogs unmount on close, and a busy Duplicate is disabled. **Fix:** return focus to the row's name button, or to the heading when the row has gone.
**m2 (Should). Esc or Cancel throws away typed edits without asking.** House panels use `confirmClose` (`add-lead-panel.tsx:83`, `invite-panel.tsx:47`). **Fix:** the same guard on a dirty draft.
**m3 (Should). No error summary in the panel** (BIC-13). **Fix:** a "There is a problem" list at the top of the form, linking to each field.
**m4 (Should). The empty state has no action** (board §4: "+ New booking type"). **Fix:** put the button in the Notice.
**m5 (Should). "Uses set" is untested.** My walk shows it works (set saved, shown again, reset to default). **Fix:** add one check in `check_fo3st3_types_browser.ts`.
**m6 (Should). A suspended host is hidden from the editor but kept on the type.** The list still names them; unticking every visible host saves `[suspended]`, and the preview says "This type has no host". Read-only shows "<n> hosts". **Fix:** show a former host as a ticked row that can be removed. Add a follow-up row for a staff-names read for `:list` holders.
**n1.** List the added strings (above) in the PR.
**n2.** The firm name comes from the public, per-IP throttled list (`types-page.tsx:44`) and is fetched again after every action, because its key shares the invalidated prefix. Give it its own key, or read it from a staff route.

## Not checked
- A real screen reader.
- An intended user's unaided walk (D17, D20 stay with the founder).
- A rebuilt mutation run: my rule-removal checks are by reading.
- The Bookings side menu is hidden below 768 px (also at 1024 px with 200 % zoom), with no row in its place. This is the frame's existing pattern, shared with Sales (`sales-frame.tsx:32`), not this PR's. For qa/BUGS.

My suite runs rewrote the tracked `fo3st3-*-1024.png` in the main checkout (another J-42 run there also touched `J-42/screenshots/`). Do not stage them with this file.

Verdict: Changes needed. Blockers: none. Majors: M1, M2. Minors: m1-m6, n1, n2.

---

# Re-review: diff `6b2a083c2..a50ac3c38` only (head a50ac3c388d0f371e776ed0ff8243e409ba41989)

Same reviewer, 21 Nov 2026 ~11:35 IST. I read only the new diff: `types-page.tsx`, `contract.ts`, `check_fo3st3_types_browser.ts`, and `j_42.ts:159-160`. d59d962bf and a40efddaf change screenshots only.

## Runs (a fresh copy `review2_fo3st3` on :4582; the checkout's code was identical to a50ac3c38, later commits change only PNGs)
- **Suite:** run 1 on the fresh copy: **48/49**, with **FAIL "break m5: closing the preview puts the keyboard back on 'Preview as a booker'"**. Runs 2 and 3: 48/48 each (the empty-state check runs only on an empty firm).
- **J-42** (scratch worktree at a50ac3c38): **W0 all PASS**, including "Preview as a booker shows the type's times…" (the M2 failure is gone). W1 and DW1 also passed. I stopped it after W1 because W2 onwards is unchanged.
- **Probe:** I closed the preview 8 times and read focus at once and again after 150 ms.
  - At once: 4 of 8 on the page root.
  - After 150 ms: 8 of 8 on "Preview as a booker".

## Earlier findings
| Finding | Now | Evidence |
|---|---|---|
| M1 allow flags | **Fixed** | "Allow reschedule" and "Allow cancellation" are under Advanced, with read-only text, and they reach the PATCH. Suite pass and fail go through the booker's manage page (Reschedule offered, then gone, Cancel stays). My walk: unticking "Allow cancellation" saves `allowCancel=false` |
| M2 preview loads twice | **Fixed** | `placeholderData: keepPreviousData` (`types-page.tsx:232`), and `j_42.ts:159-160` waits for a day with a time. J-42 W0 passes. There are still two requests, but nothing blanks |
| m1 focus after actions | **Fixed** | My walk: Keep and Retire → the row's name; Duplicate → its Duplicate button; Delete → the "Booking types" heading; preview close → "Preview as a booker" (after a short delay, see M3) |
| m2 unsaved edits | **Fixed** | Clean Esc closes with no question. Dirty Esc and dirty Cancel ask "Discard your unsaved changes?", and dismissing keeps the panel |
| m3 error summary | **Open (Should)** | To be listed in the PR as a follow-up, which is acceptable for a Should |
| m4 empty state | **Fixed** | The Notice carries "New booking type", and the header button is hidden then. A suite check runs on an empty firm |
| m5 Uses set untested | **Fixed** | Suite: pick "Morning calls" → host-set row; "(default)" → back to default |
| m6 suspended host | **Fixed** | Shown ticked with "(suspended: offers no times)"; unticking and saving removes them (suite pass and fail). "<n> hosts" for read-only stays an API gap, so the follow-up row is still needed |
| n1 strings | Open | List them in the PR. New ones: "Advanced", "What a booker may do from the link in their email. Timing overrides come with Timings.", "Discard your unsaved changes?", "(suspended: offers no times)", "The set of hours for <host> was not saved: … Open the type to choose again." |
| n2 firm name | **Fixed** | Its own key `["fo-firm-name", firmKey]` with `staleTime: Infinity` |

Breaker fixes, read and run:
- A set save that fails after the type saved closes the panel with "Added <name>." plus a warning naming the host; there is one type row (suite).
- The date guard holds: 9999-12-31 is not taken and there is no page error.
- An emptied web address shows the kept slug as hint and placeholder, and the body omits the slug, so the server keeps it.
- The list reloads in `act`'s `finally`, so it also reloads after a refused action.
- "Uses set" re-reads the sets on open (`refetchOnMount: "always"`).

## New
**M3 (Must, test only). The new focus check races and failed on a fresh copy** (`check_fo3st3_types_browser.ts`, "break m5").
- **Why:** the check reads `document.activeElement` straight after the dialog detaches. The code moves focus in a `setTimeout(…, 0)` (`types-page.tsx:209`), behind Radix's own unmount focus.
- **Evidence:** my probe gets the page root at once in 4 of 8 closes, and "Preview as a booker" after 150 ms in 8 of 8. The product behaviour is right; the gate is flaky, and it failed on run 1 on a fresh copy, which is CI's condition.
- **Fix:** poll for up to 1 s before asserting, as the stale-save check already does at `:142`. Run it twice on fresh copies.

**n3.** Advanced sits between Definition and Hosts; concept §4 orders Definition · Hosts · Advanced · Share. Moving it is a one-line move. Optional.

**n4.** No suite check covers the list-focus returns or the unsaved guard (my walk covers both). Add them with M3 if cheap.

Verdict: Changes needed. Blockers: none. Majors: M3 (flaky focus check, test-only fix). Minors: m3 (follow-up listed), n1, n3, n4.

---

# Re-review 2: diff `a50ac3c38..792937f69` without PNGs (head 792937f69ed18004e0f06367347d479d770aec31)

Same reviewer, 21 Nov 2026 ~12:10 IST. I read the diff only; I ran nothing (the builder asked that no suite run in the main checkout). The code changes are all in 15dfdfa4f. 95b87eaf8, df65f1690 and 792937f69 change only PNGs (and this file).

| Finding | Now | Evidence |
|---|---|---|
| M3 flaky focus check | **Fixed** | `check_fo3st3_types_browser.ts:200-202` polls focus up to 20 × 50 ms (1 s) before asserting, the same way the stale-save check does. My probe measured focus arriving within 150 ms in 8 of 8 closes, so 1 s is ample. It still fails if focus never returns. Builder: 49/49 twice on fresh copies (fo3st3_f1, fo3st3_f2) |
| n3 Advanced order | **Fixed** | A pure move of the unchanged block to after Hosts and before Share, in concept §4's order (Definition · Hosts · Advanced · Share). Read-only still shows the flags as text in the Definition list |
| m3 error summary, n1 strings, read-only "<n> hosts" | Open (Shoulds) | Going into the PR as follow-ups, which is acceptable for Shoulds |
| n4 list-focus and unsaved-guard checks | Open (nit) | Covered by my walk on a50ac3c38; this diff does not change either behaviour |

No new issue: the diff touches no other line of behaviour. J-42 is 25/25 twice by the builder; its 3 HELD lines (W0 timings, W8, W9) are outside this PR. My own J-42 W0 run on a50ac3c38 passed, and this diff does not touch W0.

Verdict: Approve 792937f69ed18004e0f06367347d479d770aec31
