# PF-21v review: the complaint view fields (PR #1848)

Reviewer (Opus 5.5, did not build it), 15 Nov. Commit **c799e5fa0eeee1574ab0c709127bb1ca4622cbec** on `claude/modest-goldberg-mcr1op`. I read the diff `origin/main...c799e5fa0`, five files. The PR head has since moved to **2eda64fb3**, which changes only `api/src/platform/MODULE.md` (2 lines; see "Not covered"). US$0, live AI off, no model call. :4400 was never touched.
**The bar:** brief `lead-b-briefs/PF-21v.md` (lead-b-front-office), STANDARDS §7, §9 and the module card `api/src/platform/MODULE.md`. A permissions and personal-data row (P-278, P-608). **There is no screen** (PF-21s builds it), so D1–D20, the BIC-01–20 scorecard, keyboard use, 1024 px and 200 % zoom are N/A. The brief's "What to build" section counts as "what gets built" (P-26).

## What I ran
* `check_pf21v_views.ts`: **51 passed, 0 failed** (about 8 s). It also passed on a scratch worktree of the commit.
* `check_pf21w_routes.ts`: 83/0. `check_pf21_complaints.ts`: 107/0.
* `check_pf4_identity.ts`: **118/118, parts A and B.** Part B ran against the real `main.ts` on an isolated copy at :4438, with `PLATFORM_IDENTITY=local` and `PLATFORM_SAMPLE_SEED=on`. That covers the start-up route check with the new route, and the demo reset. The copy is stopped and its database dropped.
* `graph.mjs --check`: exit 0, with no gap on complaints.
* `tsc` on the complaints files plus the new test, with `noUnusedLocals`: one error (m1). The whole-project `tsc` ran out of memory in this sandbox.
* Mutations, run on a scratch worktree. Each one turned the suite red:

| Mutation | Result |
|---|---|
| The brief's literal overdue rule (no `max(1, …)`) | 2 red (DW2: `[0,true]` at 22:01Z on the due day; the hourly sign check) |
| `people` built from every firm complaint, not the returned rows | 1 red (DW3 fail: the CASE_OFFICER gets "elsewhere"'s name) |
| `GET handlers` declared after `/:id` | DW5 ×3 get 404, DW6 red, and the suite crashes |
| The service's own 403 removed from `handlers()` | 1 red (DW5: the service refuses a keyless caller) |
| The calendar read once per row | 1 red (303 setting reads instead of 3) |
| A closed day counted | 11 red (DW1, DW2) |
| `people` carrying email | 2 red (DW3 "names only") |
| UTC dates instead of the firm's zone | 1 red (DW1, the March DST check) |

## Named cases (each ticked only when a mutation makes it fail)
- [x] **DW1 `businessDaysBetween`.**
  * Pass: Friday → 2, Tuesday → 1, Thursday → 1 late (`check_pf21v_views.ts:106-109`).
  * Fail: the weekend and the closed Monday are not counted (`:110-112`).
  * DST: the November and March weeks in Toronto, read in the zone (`:114-116`).
  * It shares `businessClose` with `acknowledgeBy`, so there is one day rule (`business-days.ts:52-63`).
- [x] **DW2 `businessDaysLeft`.**
  * The values run 2, 2, 1, 0, −1, −1, −2, −3 across the due week (`:136-141`).
  * The sign agrees with `overdue` for every hour over two weeks (`:142-148`).
  * Acknowledged and closed complaints give `null` (`:149-150`).
  * 3 setting reads for a page of 100, and 3 for `GET /:id` (`:155-157`).
- [x] **DW3 `people`.**
  * Pass: the OWNER's list names every handler and recorder, including the deactivated leaver. `GET /:id` names every actor and the handler change's from and to. A system actor is left out (`:176-184`).
  * Fail: the CASE_OFFICER gets no name of "elsewhere" or the leaver (`:189`), and gets the 404 without `people` (`:191`).
- [x] **DW4 `firmTimeZone`.** It equals the setting on the list and on `/:id`, and neither firm's zone appears in the other's answer (`:198-200`).
- [x] **DW5 `GET /handlers`.**
  * Pass: OWNER, ADMIN and CASE_MANAGER get 200, with exactly `{id, displayName}`, ordered as the database orders them (`:206-209`).
  * Fail: CASE_OFFICER, BILLING_FINANCE and READ_ONLY get 403 `MISSING_PERMISSION`; no token gets 401. Suspended, deactivated and firm B's staff are absent. The service also refuses on its own (`:211-224`).
- [x] **DW6 the start-up check.**
  * Passes, declared with `agent/complaint:record`. Stripping the declaration is refused by name. The route sits before `/:id`, and the CASE_OFFICER gets its 403, not `/:id`'s 404 (`:227-236`).
  * PF-21's suite passes unchanged. PF-21w's needed one count changed: deviation 1.

## The two deviations the builder raised
1. **PF-21w's DW9 count, 9 → 10: I agree.** The brief adds a tenth route and also requires that suite to pass "unchanged". Its exact `routes.length === 9` makes that impossible, so the brief contradicts itself. The change keeps the assertion exact (10, not ≥ 9), so a stray route still trips it. It is one line, in its own commit (c799e5fa0) so it can be dropped. The builder asked on the PR (Question 1) and did not change it silently. Strictly, the brief says "stop and ask" before changing, but building it as a separate commit with the question is a fair reading. Lead B should confirm.
2. **Overdue gives `-max(1, n)`: I agree.** With the literal rule ("minus the business days d with D < d ≤ T"), a complaint past 17:00 on its due day, or over the following weekend, gives 0. 0 is also the brief's "due today", and it breaks the brief's own "the sign must agree with `overdue`" (mutation 1 shows exactly that: `[0,true]`).
   * The clamp keeps the value monotonic: −1 from the due evening through the first business day after, then −2, and so on (probe P4 on Toronto's November DST week).
   * It is written in the type's comment (`complaints.ts:122-126`).
   * Lead B should restate the rule in the brief so PF-21s words "−1" as "overdue", not "1 day late on the due evening". That is wording for the screen, not a finding here.
3. (Question 3, MODULE.md outside the touch list.) STANDARDS §7 [M] requires the card to be updated, so updating it is right. It is in 2eda64fb3, not in the commit reviewed here.

## The checks you asked for
* **`people` leaking names.**
  * The ids come only from `items` (the list, after the `mine` filter, `complaints.ts:277,291`) or from one complaint already passed `canRead` (`:263,266`). The read is `firmScope` + `id in`, with `displayName` only (`:189-194`).
  * Probe H1-H3: a complaint was recorded by "elsewhere" for the CASE_OFFICER. While they were the handler, they got its recorder's name. Once it moved to ADMIN, all four views gave `people={}`, and `/:id` gave 404 with no `people`. The list is never widened.
  * Ids inside event `detail` (RECEIVED and REMINDER_SENT `handlerStaffId`) are always the current handler or a handler change's `from`, because the handler changes only through `changeHandler`. So they are named too.
* **`GET /handlers`.** It is declared with `@PermissionKeys(record)` and checked again in the service (`routes.ts:33-35`, `complaints.ts:297-300`).
  * `/handlers/`, `/HANDLERS` and `?status=SUSPENDED` give the CASE_OFFICER 403 and the OWNER the same 11 active staff.
  * A junk token gives 401 `TOKEN_REFUSED`. Firm B's Owner sees firm B's 2 staff only.
* **Sign rule and zones.**
  * The sign holds by construction: not overdue means now ≤ ackBy, so the value is ≥ 0, and the overdue branch is ≤ −1.
  * Kolkata (+5:30), Kiritimati (+14), Pago Pago (−11), Lord Howe (+30-minute DST) and St John's (−3:30) all count 2 for a Friday receipt.
  * The Toronto DST week's sequence is correct, with Monday counted from 00:00 local.
* **Calendar once per request.** `days()` is called once in `list` (`:288`) and in `get` (`:265`). The `seen` map shares each date's answer across rows. Writes (`record`, `change`) read it once inside their transaction.

## Findings
**Blocker:** none. **Major:** none.

**Minor** (none holds the label)
* **m1. Dead import, against STANDARDS §7 [M] "no dead code".** `localDate` is imported but never used (`complaints.ts:28`; `tsc --noUnusedLocals`: TS6133). Fix: drop it from the import.
* **m2. The cost grows with rows × days overdue.** `businessDaysBetween` walks every date from D to T for each row; the `seen` map saves only the zone work. A page of 100 complaints received in 2000–2001, still unacknowledged on 24 Nov 2026, takes **1.3–1.6 s** (`list("overdue")`, probe P1); one year overdue costs about 50 ms. The sample data is far below that, and scale work is the team's (§9), so this is a note. A fix if wanted: one prefix count per request.
* **m3. A firm with no opening days reads 0 ("due today") for all three calendar days.** `acknowledgeBy` then falls back to calendar days (`BUSINESS_HOURS = []`, probe P2: due in 2 days, `businessDaysLeft` 0). This is the brief's literal rule and the setting is unusual; note it for PF-21s.

## Not covered
* **The PR head is 2eda64fb3, not the reviewed commit.** I read its 2-line card diff: the Entry points line gains `/api/platform/complaints`, and the Tests line gains the PF-21w and PF-21v suites. It is accurate. My Approve names c799e5fa0 only; 2eda64fb3 needs a diff-only re-review line (P-277) before the label.
* A real screen and its users (PF-21s, J-109): D17 and D20 stay with the founder. Whole-project `tsc` ran out of memory here. The full CI set (`run-suites.sh`) and C10.1 are left to CI.

Journey score (reviewer role, API journeys; report: `journey-test-reviewer-2026-11-15.md`): **8.5/10, pass, no 0.**

Verdict: Approve c799e5fa0eeee1574ab0c709127bb1ca4622cbec

## Re-review, diff only (P-277): c799e5fa0..762632f0c
* **What I read:** 2eda64fb3 (the card, as read above), 946d28704 (m1: `localDate` dropped, `complaints.ts:28`), c8c484182 (records only), and 762632f0c (`BusinessDayTally` in `business-days.ts:76-103`, wired in `complaints.ts:135-139,195`; DW1 and DW2 tests added).
* **Suites at 762632f0c:** `check_pf21v_views.ts` 54/0, `check_pf21w_routes.ts` 83/0, `check_pf21_complaints.ts` 107/0.
* **The tally is correct.**
  * The forward and backward extension (`cum[k]` over `(lo, lo+k]`; the `shift` re-bases the old totals) matched a naive weekday count on 2000 random spans from 2000 to 2026, in random order: 0 mismatches.
  * It also gave 0 mismatches on 100 rows taken newest first across 26 years (the "all" view's order, so every row extends the tally backward).
  * The Apia skipped day (30 Dec 2011) is still not counted.
* **The new tests catch real breaks.** Each mutation turns the suite red:
  * a fresh tally per row: the DW2 timing check fails;
  * an off-by-one in the backward shift: 3 red;
  * a backward window shifted by one day: the DW1 shared-tally check fails.
* **Cost:** one walk of the dates per request. 26 years of dates take 245–355 ms however the rows are ordered; the concatenation is negligible next to the date work. Before this fix it was 1.3–1.6 s.
* **m4 (new, Minor). The DW2 check has a thin wall-clock margin.** It needs under 400 ms. Over five runs on this 4-core sandbox it measured 270, 373, 332, 271 and 347 ms; the last two ran with four busy loops beside it. It never failed, but a slower or busier CI runner can turn it red with no code cause. Fix if wanted: assert on the number of date look-ups (one per date, around 9 800), or widen the bound. It does not hold the label.
* **The breaker's Minors left as questions** (a calendar change after recording, a firm with no opening days (my m3), code-point sort of handlers): that is the right route, since they need a ruling, not code. My m1 and m2 are closed.

Verdict: Approve 762632f0cc4b97972c122b39b6947f1c8dacacfc
