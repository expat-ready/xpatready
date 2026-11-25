# Review: PF-5s1 DW4 keyboard step race (test-only)

Branch `claude/screens-pf5s1-keyboard-race`, head `f21f397fb69523622b174f294f467130db83138f` (proof commit `33e100ecb`). Row: Lead 17, comment on #3202, 24 Nov. Diff `origin/main...f21f397fb`: one file, `prototype/studio/tests/check_pf5s1_signup_browser.ts` (+36 −12). No app change. Reviewer session, fresh context; my own isolated copy `rev_pf5s1k` on :4603 (`PLATFORM_IDENTITY=local`), never :4400; US$0. This is the screen-review skill scaled to a test-only diff: no app code changed, so the D1–D20 scores and the BIC table stay as in `review.md` / `review-part2.md`. Only the behaviour this step tests was walked again (journey below).

**Verdict: Ship (Approve).** No Blocker, no Major, no Must. Two Should items, both older than this change.

## What I ran (all on :4603, a fresh restart before each run)
| Run | Result |
|---|---|
| Fixed file at `f21f397fb`, run 1 | **54/54 passed** |
| Fixed file, run 2 | **54/54 passed** |
| Fixed file, run 3, with 4 busy loops pinning all 4 CPUs | **54/54 passed** |
| `33e100ecb`'s file (old step plus the held run), scratch copy | **53/54**: `FAIL PF-5s1 DW4 fail (#3040 shard 4)…`, `held-frame run: locator.waitFor: Timeout 20000ms exceeded.`, the CI symptom |
| Mutation A: fixed step, init script makes `focus()` on `[data-signup-summary]` do nothing (the summary never takes focus) | **red**, exit 1: `page.waitForFunction: Timeout 10000ms exceeded` |
| Mutation B: fixed step, init script cancels the checkbox's click (Space never ticks) | **red**, exit 1: `waiting for locator('[data-signup-agree]:checked')` timed out |

The 10-in-a-row count is the builder's loop and I did not repeat it. My 3 green runs, one of them under full CPU load, agree with it. Scratch files were removed, the copy was stopped, and the screenshots were restored to HEAD. Five of them were already modified before my runs started. `git status` is clean.

## The questions
1. **Is the cause right? Yes.** `signup-page.tsx:43` `focusSummary = () => requestAnimationFrame(() => summary.current?.focus())` is called on a refusal the page makes itself (`:65`). The terms error is in the DOM as soon as React commits. The summary's focus waits for the next frame, which takes about 25 ms when the runner is idle (my walk below) and longer on a busy one. The old step began tabbing as soon as `[data-signup-terms-error]` showed. If the frame landed during `tabTo`, the step just tabbed on from the summary, which does no harm. If it landed after `tabTo`'s last check and before the key, the Space or Enter went to the summary `div`. The tick stayed off, the second Enter was refused on the page (no request), and `checkScreen` waited 20 s: `check_pf5s1_signup_browser.ts:220:9 → checkScreen :64`. That is the CI trace (job 138117798714, 2nd try). No other code on this page moves focus asynchronously after a refusal. The CI log shows the retry ran on a fresh copy (`run-suites.sh:269-272`), so the sign-up rate limit cannot explain the second failure.
2. **Is the hold faithful? Yes, close enough, and it runs the page's own callbacks.** It holds the page's real `requestAnimationFrame` callbacks, the one `focusSummary` queued included. It runs them unchanged with `performance.now()`, and only later. It does not fake focus or block anything. One difference: in CI the frame lands *before* the keydown. Under the hold it runs inside the keydown's capture phase, so the keydown targets the tick while keypress and keyup go to the summary. The outcome is the same, because a checkbox toggles on keyup and a button acts on Enter at keypress. The release on a key at the tick or the button is the worst instant, not a typical one. That is right for a deterministic proof. The 1.5 s fallback stands for a slow frame.
3. **Does the fix wait on state only? Yes.** It waits on `document.activeElement` matching `[data-signup-summary]`, then on `[data-signup-agree]:checked`, then tabs to the button. No sleeps. Each wait has a 10 s ceiling and throws, and the throw ends the run with exit 1. A refusal makes only one `focusSummary` call, so once focus is on the summary no late frame is left to steal the next key.
4. **Could it hide an app fault? No. It now catches two the old step missed.** Mutations A and B both go red. The old step would have passed A, because it never checked where focus went after a refusal. That focus move is what BIC-13 asks a reviewer to check ("check focus"). Under B the old step failed only through the 20 s `checkScreen` timeout.
5. **Is the assertion still meaningful? Yes, and it is stronger.** The DW4 line still compares `[data-signup-sent-to]` with the typed email after `checkScreen`. The new held run stays in the suite as the "fail" case, in the file's pass-and-fail pattern. Going back to the old waits turns it red, as `33e100ecb` shows.
6. **Can #3040 cause this? No.** On the server, #3040 adds `GET`/`POST signup/:token` (after `signup/verify`), the link controller, and a defaulted `signupLinkId` parameter on `signUpWork`. The refusal at issue happens on the page and sends no request. On the self-serve `POST /api/public/signup` (`signup.ts:133-152`), `signUpWork` runs after the answer (`this.later`), so a server change there cannot hold back the Check your email screen. #3065 (FO-6 part 3, retainer signing; 21 files, none touching sign-up) failed the same way.

## Issues (ranked)
1. **Should (not from this change): the run uses 8 of the 10 sign-up POSTs one IP may send in 10 minutes** (`api/src/platform/firms/signup.ts:41`, `signupPerIp: 10, windowMinutes: 10`). I counted with `signupPosts`: 7 at `33e100ecb`, 8 at the head; the held run adds the 8th. A second run on the same copy within 10 minutes gets a 429 and fails at DW2 (`:169`) with a misleading "terms error not visible" timeout. I hit this. CI is not affected, because each run and each retry gets a fresh copy. Fix: say "a new or restarted copy per run" in the file's usage comment. Do not raise the limit.
2. **Should (the file's existing style): when a new wait fails, the run throws an uncaught `TimeoutError` with no step name and skips the rest of the checks** (mutations A and B). The old `checkScreen` did the same, so nothing got worse. Fix (optional): a `.catch` that logs which state never came, as the held run already does.

No Must. Nothing is weakened.

## Journey test (reviewer, scaled to this step): **8.5 / 10, pass**
Person: a firm owner using only the keyboard. Goal: "Sign up without a mouse; if I miss the tick, tell me and let me fix it." I walked it headless in Playwright at 1440 and at 512 px wide (200 % zoom of 1024), using only Tab, typing, Enter and Space:
- Tab reaches Work email. I type the email, password and firm name, then press Enter. Focus is on the summary after **25–26 ms**. It reads "Please check the form / Please accept the terms to continue." (`role="alert"`).
- Tab order from the summary: email → password → firm name → Change → the tick. Space ticks it, and the summary and the tick's error go away. Tab reaches the button; Enter opens "Check your email", with focus on its heading. No sideways scroll at either width.
- Sending took 3.3 s. That is the form's anti-bot floor (`MIN_FILL_MS = 3_300`, `signup-page.tsx:16`), which a script hits and a person typing would not. The button shows it is busy.

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Check your email reached, keyboard only, both widths |
| Next step obvious | 1 | the summary names the one fix; the tick is the next control with an error |
| Plain words | 1 | "Please accept the terms to continue." |
| Feedback and state | 1 | focus moves to an alert summary; it clears on the tick |
| Correct data | ½ | the sent-to address matches; I did not read the pending row for this path (DW1–DW3 read theirs) |
| Error recovery | 1 | answers kept after the refusal; one Space then Enter recovers |
| Accessibility and screen sizes | 1 | logical order; 1440 and 512 px with no sideways scroll; the suite's axe checks pass |
| Speed | ½ | refusal and focus under 30 ms; the 3.3 s floor on a fast fill; not timed against `STANDARDS.md` §9 |
| Visual quality | ½ | not looked at again (no app change); screenshots unchanged from `review-part2.md` |
| Trust and sources | 1 | terms versions listed and linked; wording marked Sample |

## What I could not check
- The original CI run's first try: no FAIL lines, and its api.log was not uploaded. The cause is shown by mechanism and by reproduction, not by a trace from that try.
- The builder's 10 runs in a row: I ran 3.
- A real screen reader, and an intended user's own walk (D17/D20 stay with the founder).

Reviewer: Approve f21f397fb69523622b174f294f467130db83138f

Verdict: Approve at f21f397fb69523622b174f294f467130db83138f
