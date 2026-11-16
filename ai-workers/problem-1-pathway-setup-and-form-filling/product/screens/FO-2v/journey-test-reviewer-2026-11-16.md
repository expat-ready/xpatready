# FO-2v journey test, reviewer role (16 Nov)

Commit `87a811e983c8c8241be879727144e152720b355c`. Isolated copy `review_fo2v` on :4437 (runtime lane, `PLATFORM_IDENTITY=local`), never :4400. Sample firms are seeded by the script. The people are the Owner (user-R), the Case Manager (user-T, "Second representative"), the Case Officer (user-O), a second Case Officer, and two Case Officers made for the run (one leaves, one is the previous owner in J7). Firm B is user-S. A Playwright replay walked each journey in headless Chromium: real clicks and typing on the Leads screens, with the API used only for the other person's competing action. After each step it read the database. The run was repeated: 21/22 lines passed twice, and the one fail is the real finding J7. The replay script and screenshots live in the reviewer's scratch worktree, not in the repo. US$0, no model call.

## Journeys (persona · goal · expected)
1. **J1, main path.** Owner, setting off: "show me the leads I work". All open lists the Owner's own lead and the Unassigned ones, not the Case Officers' leads and not firm B's. A link to a Case Officer's lead shows "Lead not found". Add with a matching email gives a nameless match.
2. **J2, alternate.** Owner, setting on: every firm lead is listed and opens, never firm B's.
3. **J3, the real race (AG-2-86 rule 3).** The Case Officer is on Unassigned. The Case Manager takes the lead first, then the Officer clicks Take it. The toast reads "Second representative (Sample) already has this lead." and the row leaves the list. In the database the owner is the Manager, with one `lead.taken` line. The 409 body has no `ownerStaffId` or id.
4. **J4, stale page (error).** Same as J3, but the Manager's take is aged 11 minutes. Take gives the GET 404 wording, and nothing changes.
5. **J5, wrong role by URL.** The Officer's Take on the Owner's own lead gives 404, byte for byte the same as GET, with no name or id. Take on firm B's lead gives the same 404. Close on the Owner's lead gives 404 before any field validation.
6. **J6, deactivated owner (recovery).** The leaver's lead shows "(Inactive) Name" in Unassigned, with Take it. The Officer takes it. A second taker within 10 minutes gets 409 naming the Officer.
7. **J7, break.** The setting is on while the Manager assigns lead LM from its owner (MOVER, a Case Officer made for the run) to himself, so the lead is never Unassigned. MOVER is then deactivated, the setting is off, and the Officer takes the lead. Expected: 404.
8. **J8, keyboard only.** Owner, setting off: Tab reaches Take it and Enter takes the lead. It is the Owner's and shows under Mine.

## What held
- J1–J6 and J8 passed, every one with the database checked.
- axe WCAG 2.2 A/AA was clean on Leads at 1440 px. There was no sideways scroll at 1024 or 400 px. No page errors apart from the expected 404/409 resource lines.
- The Unassigned badge ("3 unassigned") equals the database count of open leads with no active owner, so no hidden owned lead is counted.
- All open loaded in 0.42–0.52 s, including navigation.

## Findings
- **J7 (Minor; the breaker's m1).** The answer is `409 "Second representative (Sample) already has this lead."` where 404 is due. `leads.ts:213` checks the previous owner's status **now**. Fix: store `fromUnassigned` in the audit detail when the owner changes (see `review.md` issue 2).
- **J4 (observation, by the brief; no fix asked).** On a list that was still on screen, the click past the window gives "No such lead in your firm." for a row the person can see. The list then refreshes and the row goes. The brief and AG-2-64 rule 4e prescribe the GET 404, so this is only scored under plain words.
- **Firm scope of the race read (Major, from code review and the breaker's m2).** No journey reaches it without forging an audit line. See `review.md` issue 1.

## Score (QUALITY.md "Journey score")
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1–J3, J6, J8 completed through the screen |
| Next step obvious | 1 | Take it, then a toast, then the row leaves the list (J3 screenshot at 1440) |
| Plain words | ½ | J4: "No such lead in your firm." for a lead still on screen |
| Feedback and state | 1 | The toast names who; the list and badge are read again |
| Correct data | ½ | Database exact in J1–J6, J8; J7 leaks the owner's name; firm-scope condition open |
| Error recovery | 1 | A refused Take changes nothing and redraws the list (J3, J4) |
| Accessibility and screen sizes | 1 | axe clean; 1024 and 400 px fit; keyboard Take (J8) |
| Speed | 1 | 0.42–0.52 s for the first view |
| Visual quality | 1 | Team look unchanged (J1, J3 screenshots) |
| Trust and sources | 1 | No AI; the 409 says who has the lead, from the audit line |

**8.5 / 10, pass** (8 or more, no 0). To raise it: fix J7 (correct data → 1). Plain words stays ½ by the brief's choice.

**Not tested:** a real screen reader; 200 % zoom (the 400 px width stood in); an intended user's unaided walk (D17 and D20 stay with the founder).
