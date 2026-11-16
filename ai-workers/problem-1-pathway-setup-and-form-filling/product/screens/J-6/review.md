# J-6 part 1 review: PR #1914 at 4be3234b2 (R1.6, own versus all; money and licence apart)

Reviewer: a fresh Opus 5.5 context, not the builder. Brief: the J-rows.md J-6 section plus amendment A6 of `P-626-order.md` (A6 wins). Diff: `git diff origin/main..4be3234b2`. It adds `j_6.ts` (167 lines), 6 screenshots and `qa/built/J-6-part1.md`. It is test and evidence only: 168 lines, under the 800 limit.
Journey test (reviewer role): `screens/J-6/journey-test-reviewer-2026-11-16.md`, **9/10, pass**.

## What I ran (isolated copies on :4437–:4440, never :4400)
* The PR's command on a fresh copy: **43/43, exit 0**. A second fresh copy: 43/43.
* **Mutation M1** (no own rule: "everyone sees all" left on). This is a scratch copy of `j_6.ts`; the repo is untouched. Result: **38/43**. A1 list, A1 by URL, W2 All open and W3 ×2 fail. So the core cases have real teeth.
* **Variant V2** (the case A6 names: "everyone sees all" **on**, with the Case Officer's `agent/prospect:view.all` deleted, as PF-6b DW6 does in its own DB). Result: **44/44**. The product already meets it on screen and by API.
* My own walk in a visible browser (headed under xvfb), signing in through the card like a person. Details are in the journey-test report.
* The same copy re-run without a restart: **40/43**. A3's audit counts and W5's 409 `plan-limit-reached` fail.
* `graph.mjs --check`: exit 0.

## Do the named cases prove what they claim?
| Case | Claim | Verdict |
|---|---|---|
| A1 list and by URL | Owner sees all; Case Officer sees own; 404 for others; 404 across firms | **Proven** (M1 fails it). Proven only on the "setting off" branch (see M1 below). |
| A2 GENERAL key | Case Officer `assign` 403; Owner 200 and owner changes | Proven. The fake half `{status:200}` is constructed. |
| A3 MONEY | fail: Case Officer 403, no money line; pass: Owner writes `money_keys_granted` | The pass is proven. The "fail" is a **staff:manage** refusal (GENERAL), not a money-class rule (m3). |
| A4 MONEY/LICENCE/own-all | PF-6b re-run, pass and fail half per class | Real (PF-6b exit 0). The fake half `{...real, failHalf:false}` is self-fulfilling. `DW[34]` lets DW3 alone satisfy MONEY (m4). |
| W1 | Owner's All open lists the 3 firm-A leads, not firm B's | Proven. The fake half is constructed. |
| W2 All open | Case Officer sees only their own | **Proven** (M1 fails it). |
| W2 Mine | "own versus all on screen" | **Proves nothing about the rule.** Under M1 it still passes. Its "[fails on the fake]" line is false (m1). |
| W3 ×3 | "Lead not found", nothing leaked | **Proven** (M1 fails 2 of 3; the Owner's and the other officer's leads). |
| W3 own lead / W4 | opens; "not a broken page" | **Weak.** It also passes on "Could not load the lead" (`lead-page.tsx:27`) (m2). |
| W5 | Invite staff: Case Officer 403, Owner PENDING | Proven by API (no screen on `main`; acceptable). |

The core own-versus-all checks are genuine. About 20 of the 43 lines are `[fails on the fake]` halves judged against hand-made answers. Those lines show only that a predicate is not always true. They do not show that the test fails without the rule.

## Scope
Within A6 and the right size: no feature, no swaps, and step 0's grep is plausible. **But one A6 part-1 line is not walked.** A6 says the screen half is PF-6's Done-when line, "a Case Officer **without view.all** seeing only their own items", and that part 2 is **only** the role editor line. See M1.

## The PR body's Questions
1. **"Own" is made with the setting; a role without view.all needs part 2's role editor.** **Not sound.** The no-view.all state needs no editor. PF-6b DW6 makes it with one `delete from platform_role_permission …`. J-6 already sets up by SQL (`addStaff`, `writeSetting`), and the setting itself has no screen or route on `main` either. V2 passes 44/44 now.
2. **No LICENCE route on `main`; DW5's test route is the proof.** **Sound.** No route declares `case:form-approve`, `case:review-approve` or `retainer:countersign`; they appear only in `keys.ts`. The recommendation is right.
3. **Unassigned leads show in the Case Officer's All open.** **Sound.** `sales/common.ts:60` (`seesUnassigned` includes view.all). Under M1's set-up below they no longer show, so the assertion can tighten there.

## Findings
**Major**
* **M1. The "Case Officer without view.all" case (A6 part 1, PF-6 Done-when) is not walked, and that branch has no guard.**
  * J-6 turns the setting off, so `everyone && keys.includes(view.all)` in `api/src/front-office/sales/common.ts:59-60` is false whatever the key. Removing the key test there leaves J-6 green.
  * Nothing else covers it on Leads: PF-6b DW6 sweeps only `RetainersController.read`, and FO-2 checks only the Unassigned 403.
  * **Fix:** add the V2 leg (setting on, Case Officer role without `agent/prospect:view.all`), with API list and by-URL checks plus W2 on screen. Keep the setting-off leg. Change Question 1.
* **M2. A6 (c), "wrong *role* by URL refused on screen and API", is walked only as wrong *person*.**
  * W3 is wrong person; A2, A3 and W5 are API only.
  * With M1's set-up, the role case exists on `main`: a Case Officer typing `/front-office/leads?view=unassigned` gets no Unassigned chip and lands on Mine, and the API answers 403 "Unassigned leads are seen by people who may see all…". Both were seen in my walk.
  * **Fix:** add this as a screen check plus an API check.

**Minor**
* m1. The constructed `[fails on the fake]` halves (A2, A3, W1, W3, W4, W5, A4) and W2 Mine's false claim. **Fix:** replace them with one real negative leg (M1's mutation: re-run A1, W2 and W3 with no own rule and assert they show the others), or relabel them as judge sanity checks and leave them out of the pass count.
* m2. `j_6.ts:151,156`: assert that the heading equals `<given> Sample`, not just that it is not "Lead not found".
* m3. `j_6.ts:99`: relabel A3's fail as a GENERAL refusal. Alternatively, add the live money fail half: the Owner assigns Read-only and no money line is written.
* m4. `j_6.ts:111`: split `DW[34]` so that DW3 and DW4 each need both their halves.
* m5. Not repeatable on a kept copy (40/43). Compare counts with a "before" value, and free the seat W5 uses.
* m6. `j_6.ts:122` injects the session token, so the walk never uses the sign-in card. The brief's W2 says "signs in". The card works (my walk, keyboard only).
* m7. The script has no axe, no 400/1024 px widths and no keyboard path (journey-test §3). My walk covered them, all clean.
* m8. The PR's "On the demo" says "Turn 'everyone sees all' off", but no screen or route on `main` does that. Fix the text.
* m9. W1–W5 reuse the brief's W1–W5 names with other meanings (the brief's W3 is the licence message, W4 the Billing/Finance audit line). Part 2 will collide. Prefix them (P1-W1…) or add a mapping line.

## D1–D20 (only the dimensions this test-only PR touches)
* D1 Partly: A6 (b) is met on the setting branch only (M1, M2).
* D2: N/A (no writes beyond the test's own).
* D5: Partly: not repeatable on one copy (m5).
* D11: Met (Lead not found + Back to Leads).
* D13: Met (my walk: axe 0, no sideways scroll, keyboard).
* D15: Met (rows in 0.5–0.9 s).
* D16: **Partly**: the key branch is untested (M1), and the fake halves are self-fulfilling (m1).
* D17, D20: simulated only.
* D3, D4, D6, D7, D18, D19: N/A.
* D8, D9, D10, D12, D14: Met (screenshots W2, W3).

BIC-01–20 (`EXPERIENCE.md` §6): **N/A**. This is a front-office Leads screen, not a case-side screen.

## Not checked
A real screen reader; an intended user's unaided walk (D17/D20); CI on this head (I read only the PR body's claim).

Verdict: Changes requested
* Blockers: none.
* Majors: M1 (no Case Officer without view.all; Question 1's premise is wrong), M2 (no wrong-role-by-URL case, on screen and API).
* Minors: m1–m9.
