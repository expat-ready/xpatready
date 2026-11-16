# qa · capability R1.6 (map row 6, Permissions) · main ddc6e919c (tree 64b53a515) · 16 Nov 2026, 10:xx IST

Asked by Lead 64 after J-6 part 1 (#1914) merged: score R1.6 on part 1 "if its capability text is met without the role editor (your call)". qa platform lane, cloud copy. Verdict by a fresh Opus reader at high effort who ran nothing (P-303): `2026-11-16-capability-R1.6/verdicts.md`. Tester's facts: `…/tester-notes.md`. Live AI off; no priced call; nothing on :4400.

## Verdict
**R1.6 Partial (unchanged).** Held by two Majors from J-6's own break report, still open on main and now logged: QA-477 and QA-478. Parts missing besides: PF-6 (screens; J-6 part 2, the role editor). P-606 does not allow Works while PF-6 is unbuilt. The Lead's request would only change that once QA-477 and QA-478 are closed (see Questions).

| Done-when clause | Result | Evidence |
|---|---|---|
| A route with no permission key is refused | Met, stricter: an undeclared platform route stops start-up | PF-4 119/119 (GitHub job 133065965074, qa re-run); qa sweep: all 60 guarded handlers declare access, 401 without a token |
| "Own" keys return only own records, "all" the firm's | Met for leads and retainers, but the two disagree (QA-477) | J-6 50/50 headed and headless; PF-6b DW6 (24/24, job 133065965071) |
| Money and licence keys never come with another key | Money: met for duty bundles and role changes; not for invitations (QA-478). Licence: rule proven only on PF-6b's test route (no LICENCE route on main) | PF-6b DW3-DW5; qa sweep money lines; `check_qa478_479_r16_breaks.ts` |
| Wrong role by URL refused on screen and API | Met on the Leads screen and the API; except take, which names a hidden lead's owner (QA-479, Minor) | J-6 W3; qa sweep 403 per staff member; QA-479 line |

## What works
* **Every suite on the batch that made main's head:** ci 43796001718, tree = main's. 499 PASS, 0 FAIL, 19 quarantined.
* **J-6's walk on the Leads screen, 50/50 twice** (once headed under xvfb, once headless):
  * an Owner sees every lead;
  * a Case Officer with "own" sees only their own leads, both by role and by the firm setting, and every own-versus-all judge fails on a copy with no own rule;
  * a wrong person or wrong role by URL is refused on screen and by the API;
  * the walk ends at Invite staff.
* **qa's own sweep** (`tests/qa/check_r16_permission_sweep.ts`, 13/13 twice):
  * reads every handler from the source, 68 in all, 60 of them on guarded paths;
  * checks no token → 401;
  * for each active Sample staff member, checks 403 `MISSING_PERMISSION` exactly where the person lacks a key, and never 401/403 on a GET whose keys they hold;
  * the Case Officer holds exactly SA-06's four money keys (MS-D21(10)), no read-only role holds any, and no route mixes a money key with a general one.

## Bugs
0 Blocker · 0 Critical · 2 Major new · 2 Minor new. All are logged in `qa/BUGS.md` and owned by J-6's break report; the reader found that none had been logged.
* **QA-477** (Conflict · Major, F2): own versus all differs between leads and retainers for the same viewer and the same area, and the leads routes carry no `@OwnOrAll`. Needs a ruling (SA-6-24 against AG-2-13c).
* **QA-478** (Gap · Major, F3): an accepted invitation into Billing/Finance hands out 12 money keys and writes no money-keys audit line. Reproduced twice by the failing line in `tests/qa/check_qa478_479_r16_breaks.ts`.
* **QA-479** (Bug · Minor, F5): take on a lead the person cannot see answers 409, naming its owner, not 404. Its failing line is in the same check.
* **QA-480** (Ambiguity · Minor, records): BACKLOG PF-6b's "no starter-role bundle hands out a money key" contradicts SA-06 MS-D21(10) and Appendix C. What was built is the narrower duty-bundle rule.

## Coverage and suites
Suites come from the CI batch above, and qa re-ran the three R1.6 packs. c8 coverage and the graph were not run in this round (one capability).

## Could not test
* PF-6's screens (staff, roles, licences) and J-6 part 2 (the role editor) are not built.
* No licence route runs in the app.
* The walk was headless under xvfb; no person watched it.
* J-6 runs in no GitHub workflow.
* The seed has no Admin, Billing/Finance or Read-only person, so the sweep covers 3 staff members.
* Amendment A6 (on branch `lead-b-front-office`) was not read.
* `j_6.ts` starts `tsx` by bare name, so it fails without `tsx` on PATH (environment; a portability point for the J-6 owner).

## Questions for the Lead
1. **QA-477** needs a ruling: one own-versus-all rule for `agent/prospect`. Either Owners and Admins always see all (leads today), or all needs `view.all` and the setting (retainers and PF-6b). Then the leads routes get `@OwnOrAll` and PF-6b's sweep.
2. **After QA-477 and QA-478 are fixed:** do you rule R1.6 Works on part 1, with part 2 re-proving four things? Those four are: the editor's money and licence groups ticked one by one; the own-only sweep in every list the screens show; the Invite step on screen; and the role copy through the editor. Under P-606, qa holds it Partial until PF-6 merges unless you rule so.
3. **QA-480:** reword PF-6b (2) and R1.6's Done when to the SA-06 reading?

## Suggestions
* Make `@OwnOrAll` required on every list route that returns an owned area, so the sweep cannot miss a route. *Needed for the proof* · *Capability*.
* Run `tests/journeys/` on GitHub (nightly is enough), so a walk's verdict has a runner's run id. *Later* · *Scaffolding*.
