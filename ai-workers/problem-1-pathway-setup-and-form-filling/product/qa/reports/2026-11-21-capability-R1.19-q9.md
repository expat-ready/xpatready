# qa capability R1.19 (lane Q9), 21 Nov 2026

Lane: qa Q9 (cloud copy), Opus 5.5, medium effort. Live AI off, US$0. Main: ee19b3730 (#1959, PF-5 part 2, merged 23:33 IST), merged into this branch.

## Verdict
**Superseded 22 Nov: see the update at the end (Partial, held only on P-339).** Earlier: Works, subject to the period question (answered by #2870). The fresh Opus reader scored it Partial at 70%, with one gap: the billing period is stored only in the audit line. If the audit line is accepted as the record, the reader scores Works at about 80%. j_19 now checks the period (below).

Duplicate check: no new BUGS row. The firm-key clause is QA-483 (open, Ambiguity). QA-481 (the code reaching no inbox) is met by PF-5v part 2; its row is closed in BUGS history. I test QA-483's self-serve wording.

## All parts merged (P-606)
PF-5 part 1 #1815 · PF-5v parts 1 and 2 · PF-5t · PF-5s part 1 #2608 · PF-5 part 2 #1959 (ee19b3730). J-19 = `tests/journeys/j_19.ts`, written in this PR because none was on main.

## Done when, clause by clause (QA-483's wording)
| Clause | Evidence | Met |
|---|---|---|
| Self-serve sign-up makes exactly one firm | j_19 W1 (screens: Pricing → Yearly → Sign up → inbox link → Confirm) and W2: one `platform_firm` for the email, name "Sample Évora Firm 移民 …" as typed, CA | yes |
| … with plan | one `platform_subscription`, TRIAL on `team` (the plan chosen); `period_after = YEARLY` on its audit line | yes (period: see Q1) |
| … trial end | `trial_ends_at` = confirmation + the plan's 14 days (± 2 min); the same value on the audit line and in GET /api/platform/billing | yes |
| … and one Owner | one `platform_staff`, ACTIVE, with the email as typed, one open OWNER grant | yes |
| The same verified email again is refused in words | same neutral 202 "check your email" (no enumeration); the inbox gets "You already have an ExpatReady account"; no second pending row, no second firm; a reused Confirm link answers 404 and makes nothing | yes |
| Stored as entered, with audit lines | firm.created, platform.staff.owner_created, platform.terms.accepted, platform.subscription.created, once each | yes |
| Gate A: ends at the next capability's first step | W5: the Owner signs in → Team → Invite people opens the invite form (J-5's W1 step 2) | yes |

## Proof
* **Fails on the fake (P-606):** on main b6daec801, before #1959: 18/21, exit 1. The three FAILs were PF-5 part 2's: `trial_ends_at` null, its audit value, and billing 404. On #1959's head 1057c2026: 21/21.
* **The lane's own walk:** walk.mjs + record.ts on main ee19b3730's tree:
  * the first version: 21/21 twice (65cae34e6);
  * after the reader, with the Yearly period checked: 22/22 twice (4baff0b41).
  * Every run exit 0, by itself (no 143).
* **Suites, twice each** on 65cae34e6 (= main ee19b3730 + j_19), every run exit 0:

  | Suite | Result |
  |---|---|
  | `check_pf5_signup_billing` | 94/94 |
  | `check_pf5t_terms` | 42/42 |
  | `check_pf5v_signup_mail` | 13/13 |
  | `check_pf5s1_signup_browser` | 48/48 |
  | `check_pf5t_terms_browser` | 35/35 |
* **GitHub runs:**
  * walks 44934930791 (Lead dispatch) walked cc01e3548, the j_19 from before the reader: not the head that merges.
  * **walks 44936828314** (Lead dispatch, job 136945351490) on 017f5569f (same j_19 as 4baff0b41, main ee19b3730 merged in): j_19 **22/22, exit 0**, video, trace, 21 step shots.
  * item-proof runs on this PR's merge (`Completes: R1.19`).
  * item-proof 44933362062 (on #1959's merge) ran no suite: not cited.
* **Fresh Opus reader** (ran nothing, P-303): Partial at 70%, for the period; Works at about 80% if the audit line counts. It also noted:
  * The country is fixed to CA, so "as entered" there proves little.
  * The billing read is by API, not on a billing screen. The header now says so.
  * Stripe's own trial end, card and Checkout are not proven: they wait on the founder's Stripe test account (BACKLOG J-19), and the Done when does not need them.

## Not tested
* The shared demo (:4400) read-only walk: not reachable from a cloud copy.
* Stripe Checkout and webhook with a real test account: US$0, no keys.
* 400 and 1024 px and 200% zoom for these screens: covered by the PF-5s1 browser suite's own checks (48/48), not re-walked by hand.
* Video recording locally: the container's Playwright wants ffmpeg-1013 and only 1011 is installed. I linked them in a scratch browsers folder; GitHub's walk records the video.

## Questions for the Lead
1. **The period** (Monthly or Yearly) has no column on `platform_subscription`. It goes to Stripe as the price at Checkout, and here it lives only in the pending row and the audit line. Is the audit line enough as the record of what was entered (Works), or should the row get a column (Partial, with a builder row)?
2. **CAPABILITIES row R1.19 and QA-483:** the Done-when text still says "or firm key" and "invitation". This PR rewrites the row's Done when to QA-483's wording. Close QA-483 if you agree.
3. **W5 opens the invite form but does not send.** J-5 walks the send. Is J-19's "first staff invite" met by reaching the form?

## Suggestions
* *Later · Capability:* store `period` on `platform_subscription` at sign-up (one column, set from the pending row), so the billing page can show it before Stripe runs.

## Update 22 Nov 02:3x IST: PF-5 part 3 (#2870, d0253335c) and the stored period
**Row: Partial, held only on P-339.** No GitHub pack run is on main's head yet. On the evidence every clause is met, and question 1 above is answered by #2870.
* **The change:** #2870 adds `platform_subscription.billing_period` (NOT NULL, default MONTHLY; backfilled from the audit line). Checkout's price follows the stored period.
* **What j_19 checks now:**
  * W2: after the Yearly sign-up on screen, `billing_period = 'YEARLY'`.
  * New W2b: a public-door sign-up with no period stores `'MONTHLY'`.
  * A missing column reads as a FAIL, not a crash.
* **Fails on the fake:** on fc5c68d51 (main ee19b3730, before #2870), 22/24, exit 1. The two FAILs are exactly the billing_period checks.
* **On 31e89ad2d** (main d0253335c + this PR), via walk.mjs + record.ts: **24/24 twice, exit 0**, by itself.
* **Suites, twice each** on 31e89ad2d, every run exit 0:

  | Suite | Result |
  |---|---|
  | `check_pf5_signup_billing` | 102/102 |
  | `check_pf5t_terms` | 42/42 |
  | `check_pf5v_signup_mail` | 13/13 |
  | `check_pf5s1_signup_browser` | 48/48 |
  | `check_pf5t_terms_browser` | 35/35 |

  An earlier attempt went red in two checks with a Prisma validation error. Cause: the fail-on-fake worktree shared node_modules with this copy, and starting its copy regenerated the Prisma client from the old schema. That was the lane's own mistake. I regenerated the client and reran everything: all green.
* **GitHub:**
  * walks j_19 **44950091079** on 31e89ad2d (Lead dispatch, job 136986055611): **24/24, exit 0**, with video and trace.
  * #2870's item-proof 44949023938 ran while j_19 was not on main: not cited.
* **Fresh Opus reader** on the period (ran nothing): **Works on substance, 90%.**
  * The screen always sends the period.
  * The pending row is replaced, never reused.
  * Verify writes the period in the same transaction as the audit line.
  * The webhook never writes billing_period.
  * The backfill reads the audit line's `period`.
  * Small gap: no check sends an explicit MONTHLY from the screen; the default covers it.
  * Not R1.19's: a later plan or period change does not update billing_period.
* **Next:** after #2857 merges, item-proof runs on its merge commit (pack + j_19) and the Lead dispatches walks j_19 on main. Then the one-line Works PR.
* **Lesson:** a worktree for a fail-on-fake run must not share node_modules with the copy under test (Prisma generates into it). Use a separate install, or regenerate before the next run.
