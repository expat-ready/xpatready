# Journey test: FO-4as Assign / Reassign and owner history (reviewer, 20 Nov 2026)

Commit `3118d382771d7a6019549bbc7c47118328c60e3d` (PR #2620) on my own isolated copy, :4441 (`xr_studio_rvas`, PLATFORM_IDENTITY=local, web rebuilt for this head; never :4400). Firms: sample-firm (Owner "Representative", Case Manager "Second representative", Case Officer) and sample-solo (one user). Leads came from the public web form (J-32's setup) or from Sample SQL rows. Script: scratchpad `jt/walk.mjs` (Playwright headless, Chromium `/opt/pw-browsers/chromium`). Screenshots are in scratchpad `jt/shots/`, and the PR's committed `fo-4-sales/screenshots/fo4as-*`. Live AI off, US$0.

## Journeys (main path first)
| # | Persona · goal | Steps | Expected → seen |
|---|---|---|---|
| J1 | Case Manager: "give this new enquiry to my case officer" | Leads (Unassigned) → open lead → Assign → pick Case officer → Assign | Owner line, toast, history "…assigned it to Case officer", one audit line → **held** (199 ms round trip; axe clean on the whole page) |
| J2 | Case Manager: "move it to the Owner" | Reassign → current owner left out of the list → pick Owner | Leads All open row reads the Owner → **held** |
| J3 | Two people at once (error) | Panel open; Case Officer takes it meanwhile; Assign | "Case officer (Sample) already has this lead. Nothing was changed…"; panel turns into "Reassign lead · now Case officer"; Escape → rail shows the new owner → **held** (`j3-stale-1440.png`) |
| J4 | Recovery: double click, reload | Double click Assign; reload | 1 audit line; history kept → **held** |
| J5 | Wrong role: Case Officer | Open a lead assigned to them; API assign; cross-firm assign | No Assign; 403; 422 "Choose an active person of your firm."; history names targets "A colleague" when they lack the key (declared limit) → **held** |
| J6 | One-user firm (DW18) | Solo user opens Leads and a lead | No Unassigned chip, Owner column, Take it, Assign, owner line or history → **held**. But the menu badge reads **"1 unassigned"** → **failed** (`j6-solo-leads-1440.png`) |
| J7 | Keyboard only | Tab ×11 to Assign, Enter, Tab to a radio, Space, Tab to Assign, Enter; also Escape | Assigned; focus back on Reassign after submit and on Assign after Escape → **held** |
| J8 | Screen sizes | 400, 1024, 720 (1440 @200 %), 512 (1024 @200 %) | No sideways scroll on page or panel; primary visible → **held** (`j8-panel-1024-at-200.png`) |
| J9 | Hand-off to the next screen | After assign, open Engage | "Case officer (Sample) stays its owner" (BR-7) → **held** |
| J10 | Break it | Long Greek/CJK names; assignee deactivated afterwards; `assignees` delayed 2 s; `assignees` returns 500 | Long names wrap, no scroll → held. After deactivation the history says "assigned it to **A colleague**" while the rail says "(Inactive) <name>". While delayed, the rail first shows only a filled Engage, then reflows. On a 500, Leads silently drops the Unassigned chip, Owner column and Take it in a firm of three |

## What held
Every rule of the item that the server enforces (AG-2-13c rules 1, 2, 4, 11; BR-5's conflict wording) shows correctly on screen. The data underneath is exact: one `lead.taken` audit line with `via: ASSIGN`, owner and previous owner, and nothing else changed. Builder suites re-run by me on this head: check_fo4as **22/22**, J-32 **8/8**. Console: only the expected 409 and the 500s I injected; no page errors.

## Findings
* **Major:** one-user firm still shows the "n unassigned" menu badge (`sales-frame.tsx:18-20`), against DW18, BR-10 and X-4. The PR's `fo4as-04-one-user-leads-1440.png` shows it too.
* Minor: history loses a departed assignee's name (`lead-owner.tsx:65`).
* Minor: rail reflow while `assignees` loads (`lead-page.tsx:105,152`).
* Minor: silent hiding when `assignees` fails (`prospect-actions.tsx:22`).
* Minor: empty "Owner history" with no text when there are no lines (`lead-owner.tsx:74`).

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J2, J7 done by screens |
| Next step obvious | 1 | The button reads Assign or Reassign by state; the panel says who has it now |
| Plain words | 1 | Plain verbs and errors, no ids. "…is now Case officer (Sample)'s." is awkward but clear |
| Feedback and state | ½ | Toast, rail and history update. But the badge in a one-user firm, the rail reflow, the silent hide on failure and the empty history |
| Correct data | 1 | One audit line on double click; stale and cross-firm refused with nothing changed |
| Error recovery | 1 | The conflict names the winner, the screen re-reads, and a retry works |
| Accessibility and screen sizes | 1 | axe clean, keyboard-complete, focus returned, 200 % zoom with no sideways scroll |
| Speed | 1 | Leads under 0.6 s, lead page 0.2 s, assign 0.2 s, no per-row request |
| Visual quality | 1 | One filled button per panel, team components, long names wrap |
| Trust and sources | ½ | The history is the audit with who and when. A departed assignee becomes "A colleague" |
| **Total** | **9 / 10** | **Pass** (8 or more, no 0). The Major still blocks the PR in review.md |

Highest-value fixes: hide the badge in a one-user firm and test it (Feedback). Name departed assignees in the history (Trust). Wait for `assignees` on the lead page and show an error when it fails (Feedback).

Not tested: a real screen reader; a visible headed walk (headless with screenshots instead); an intended user's unaided walk (D17 and D20 stay with the founder).
