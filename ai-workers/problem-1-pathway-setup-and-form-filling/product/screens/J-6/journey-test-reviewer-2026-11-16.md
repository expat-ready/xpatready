# J-6 part 1: journey test (reviewer role), 16 Nov 2026, PR #1914 at 4be3234b2

Setup: an isolated copy on :4440 (`PLATFORM_IDENTITY=local`), seeded by the PR's own `j_6.ts`. Then I walked in a visible Chromium (headed under xvfb, slowed), signing in through the sign-in card, never with an injected token. Scratch evidence is not committed.

## Journeys
1. **Case Officer, keyboard only.** Goal: "show me my leads".
   * Sign-in card: Firm key, then Tab to Work email, then Enter. Leads shows in 0.93 s.
   * The first chip is Unassigned, and it is empty.
   * All open shows only their own two leads. axe: 0 violations.
2. **Case Officer, wrong person by URL.** They type the other Case Officer's lead address.
   * "Lead not found / There is no such lead in your firm, or it is not one you may see. / Back to Leads" (230 ms).
   * No name leaks. axe: 0. The API answers 404.
3. **Owner.** Goal: "see everything".
   * Sign in through the card: 0.54 s. All open lists all 6 firm-A leads; firm B's lead is absent. axe: 0.
4. **Screen sizes.** The Case Officer's All open at 1024 px, 400 px, and 1024 px at 200 % (512 CSS px): no sideways scroll at any of them.
5. **Case Officer without view.all.** The setting is on and `agent/prospect:view.all` is removed from the Case Officer role. This is the A6 case the PR does not walk.
   * Chips show only Mine and All open.
   * All open shows only their own leads.
6. **Wrong role by URL.** The same person types `?view=unassigned`.
   * The screen falls back to Mine; nothing of Unassigned shows.
   * The API answers 403 "Unassigned leads are seen by people who may see all…".
7. **Recovery and repeat.**
   * Re-running the PR's walk on the same copy: 40/43. A3's exact audit counts and W5's seat limit (409 `plan-limit-reached`) fail.
   * On a fresh copy it passes, twice.
8. **Step across the boundary** (row 5, Invite staff). Done by API only (PF-6 part 2 has no screen yet): the Case Officer gets 403 and the Owner gets PENDING.

## Data underneath
* `fo_lead.owner_staff_id` equals the adder.
* Owner `assign` changes the owner; it is restored afterwards.
* Billing/Finance writes one `platform.staff.money_keys_granted` line and one `roles_changed` line.
* Refusals happen on the server: 404 and 403, independent of the screen.

## Break-it (permissions)
* Wrong person by URL: refused.
* Wrong firm by URL: refused (404).
* Wrong role by URL: refused (the API's 403 for `?view=unassigned`; the screen falls back silently).
* Mutation, no own rule: the PR's checks catch it (38/43).
* Not covered by the PR: removing the view.all key test in `sales/common.ts:59-60` leaves J-6 green (review M1).

## Findings
* Major M1 and M2 are in `review.md`: the Case Officer without view.all, and wrong role by URL, are not in the scripted walk. The product handles both correctly.
* Minor: Unassigned silently falls back to Mine, with no line saying why. This is FO-4's screen, so it is not this row's to fix. It is noted only.
* Minor: one console 404 "Failed to load resource" on the Lead not found page. This is expected, and there is no page error.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1, 3 and 5: own and all are correct for each person |
| Next step obvious | ½ | Lead not found offers "Back to Leads"; the row-5 step has no screen yet (API only) |
| Plain words | 1 | "There is no such lead in your firm, or it is not one you may see." |
| Feedback and state | ½ | `?view=unassigned` falls back to Mine without a word (journey 6) |
| Correct data | 1 | Owner, audit lines and server refusals checked in the DB and API |
| Error recovery | 1 | Back to Leads; nothing leaks on refusal |
| Accessibility and screen sizes | 1 | axe 0 on 3 states; keyboard sign-in; 400, 1024 px and 200 % clean |
| Speed | 1 | Rows in 0.5–0.9 s; not found in 230 ms |
| Visual quality | 1 | Screenshots W2 and W3: team frame, aligned table, centred notice |
| Trust and sources | 1 | Sample labelled ("Phone call (sample)"); no AI |
| **Total** | **9/10** | **Pass** (8 or more, no 0) |

To raise it: give the row-5 step a screen once PF-6 part 2 is on `main` (not this row's work); add one line where Unassigned is not available (FO-4).

Not tested: a real screen reader; an intended user's unaided walk (D17/D20 stay with the founder).
