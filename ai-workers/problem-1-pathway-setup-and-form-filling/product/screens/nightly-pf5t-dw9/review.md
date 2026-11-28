# Review: PR #4013, nightly fix for check_pf5t_terms_browser.ts DW9 (round 1)

Reviewed commit: `9325cfff35f2ecf54690eb345f73241cc344dffb` (branch `claude/loving-pasteur-c49vom`), diff
`git diff origin/main...9325cfff`: one file, `prototype/studio/tests/check_pf5t_terms_browser.ts` (lines 194-197).
This is a test fix, not a screen. No concept, screenshots or journey test apply: journey score **n/a (not a screen)**.

**1 Important, 1 Nit, 1 Pre-existing**

## What I checked and ran
* The CI log of the failed attempt (run 46099862629 attempt 1, job 140839645314, `gh api .../actions/jobs/140839645314/logs`):
  the click on `nav[aria-label="My account"] [data-account-section="/account"]` (test line 194 on main) failed because
  `<div role="dialog" id="radix-_r_3e_" … aria-describedby="pf-terms-why">` **intercepts pointer events**, 58 retries,
  then TimeoutError. So the terms modal was already up over `p` before DW9's click. That part of the claim is right.
* Timing in the same log: the suite started at 02:56:45.8 and the next suite started at 02:57:44.4 (59 s wall clock;
  the table says 50 s). Playwright's default 30 s click timeout is inside that, so the click began about 20 s after the
  process started.
* Plain suite on the head, my own copy (`isolated.sh rv_pf5t 4546`): **35/35, 21 s**, exit 0.
* Reproduction of a different trigger (scratch copies in `tests/`, deleted afterwards). I added one line before
  `[data-send-invites]` (line 178) that slows `GET /api/platform/staff` on `p` by 1.5 s. This is the staff list that is
  read again after Send invites (`web/src/modules/platform/staff/invite-panel.tsx:63`). The test's DB poll at line 179
  sees the invitation row before that read again reaches the server.
  * main + delay: **fails at the DW9 click with the CI's exact error** (the same `radix-_r_3e_` dialog intercepts pointer
    events). The run took about 22 s, with no 60 s wait.
  * head + delay: **35/35**.

## Findings

**1. Important: the root cause the PR and the code comment give is wrong (claim not proven / wrong root-cause record).**
`tests/check_pf5t_terms_browser.ts:194-196` and the PR body put the failure down to the bell's 60 s poll
(`notifications/contract.ts:28`, #3302). That poll cannot have fired in the failed run:
* The bell (`frame.tsx:102`) is only mounted while `!pending.terms`. It unmounts each time the terms page comes up and
  mounts again after each I accept: the last time is line 176, about 2 s before `pn6` is published. Its `refetchInterval`
  starts again on each mount.
* `p` itself was created well under 20 s before the click (above). A 60 s interval cannot land in that time.
* The PR body says "on the nightly runner it took 50 s, so the poll lands inside the window". The 50 s includes the 30 s
  the click spent timing out.

The trigger that does fit is a trailing staff call from `p` that reaches the server after `pn6` is published. The test
waits for the invitation's DB row (line 179), not for the browser's own follow-up. That follow-up is the staff list read
again at `invite-panel.tsx:63` (and the refreshes after I accept at line 176). On a loaded runner it answers 428, and
`terms-gate.tsx:25` brings up the terms page. The 1.5 s delay above reproduces the CI error exactly, on main, in a 22 s run.
The builder's 62 s forced wait proves the bell *can* cause the same symptom; it does not show the bell caused this one.
* **Fix:** change the comment at lines 194-196, and the PR body's root-cause section, so it says the cause correctly. For
  example: "pn6 above stays pending for the Owner, so any staff call from p after it is published (the staff list read
  again after Send invites, invite-panel.tsx:63, or later the bell's poll) may already have brought the terms page up
  over p, hiding the menu". Drop "commit that exposed it: 96dbb81ac". No code change is needed: the fix below stands as is.
* Root cause or symptom: **the code change fixes the root cause** (finding 1 is only about the stated cause). DW9's step
  no longer depends on `p` being quiet after `pn6`, whatever the trigger. `p.goto(`${BASE}/account`)` reloads the tab.
  The session survives in `sessionStorage`, the frame asks `GET /me/terms` and the terms page comes up, or is already up.
  There is no sleep, no raised timeout, no quarantine and no app change. What DW9 asserts is kept: Sign out on the terms
  page (line 200), the old token answers 401 (line 201), `pn4` not accepted (line 202), and no page error (line 203).
  Nothing asserted depended on the click. The "a version published while signed in asks at the next click" rule is still
  proved at line 147/148.

**2. Nit: the PR body's "residual" lines are wrong (PR body, "Risk").** Line 163 has no race: nothing is pending there,
because `pn2` was accepted at line 149 and `pn3` is published at line 164, after the click. The publish-then-act steps
are lines 147 (`pn2`, then the Profile click), 165 (`pn3`, then Show more) and 175 (`pn5`, then Send invites). Fix: name
147, 165 and 175.

**3. Pre-existing: the same class of race at lines 146-147, 164-165 and 174-175 (test races app's trailing requests).**
Each step publishes a version while `p` may still have a staff call in flight from the step before. Examples: the bell's
re-read on every navigation after the clicks at 163 and 172 (`bell.tsx:141`, `refetchOnMount: "always"`), and the list
loads. If that call answers 428 first, the terms page is up before the click, and the click at 147 or 165 or 175 is
intercepted. The windows are shorter than DW9's was: DW9 had break M1's 5 s plus a slow re-read. I agree with leaving
them out of this PR, for a different reason than the PR gives: in those three steps the click *is* what is tested (the
next click asks; a 428 inside the page brings the terms page with no move), so `goto` would change what they prove.
The right later fix is to let `p` go quiet before each publish, for example waiting for the bell's unread-count response
after the move, or `waitForLoadState("networkidle")`. Not this PR.

## Verdict
The code change is correct, a root-cause fix for the test, and safe. The open Important is the wrong cause written into
the code comment and the PR. It is a wording fix; round 2 only needs to check that comment.

Reviewer: Changes 9325cfff35f2ecf54690eb345f73241cc344dffb
