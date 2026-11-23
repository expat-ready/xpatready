# Test-reliability lane, 23 Nov 2026 (founder: "Yes, beside product")

The ask: why do nine suites (plus c116 and pf5s, added by the Lead) go red when many suites run at once on one machine and pass alone?

**Method.**
* **Machine:** one cloud container, 4 cores, 15 GB.
* **"Packed":** three suites at once, each run by its own `run-suites.sh --only` with its own `COPY_PREFIX`, ports and log folder. Most rounds also ran 2 CPU-hog processes, and some ran with no hogs (where noted).
* **Before:** main 09b3893df. **After:** each PR's head.
* **Diagnosis:** evidence first (FAIL detail, copy API logs, product code), then the cause, made certain where possible (copy settings, Chromium CPU throttling, probe logging).
* **Live AI off, US$0.**

## Results

| Suite | Packed on main | Cause (proven unless marked) | PR | Packed after the fix |
|---|---|---|---|---|
| check_fo8_prospect_won.ts | red 1 of 3 | The copy's own server runs the live `prospect.won` poll (10 s) on the suite's database and made the suite's prospects into clients between steps (QA-753 DW4). With the poll at 200 ms the suite failed 2 of 2 runs. | #3280 | 10 of 10 |
| check_c116_channels_browser.ts | red 2 of 2 | **Product race:** `Button` has no `type`, so the dialog's Reload, inside `<form onSubmit={save}>`, also sent a Save on the older version (a second 409, Save left busy). The new guard step fails on main even alone. | #3281 | 10 of 10 |
| check_fo3st1_consult_browser.ts | red 1 of 2 | **Product race:** Save got the focus back in a `requestAnimationFrame` requested before React rendered `setBusy(false)`; when the frame ran first, Save was still disabled and the dialog kept the focus (seen packed, even with a 5 s wait). | #3282 | 10 of 10 |
| check_fo5s2_templates_browser.ts | red 1 of 2 | The check read "Upload version 4" with `isVisible()` before the page's refetch (`templates-page.tsx:52`). | #3283 | 10 of 10 |
| check_pf18h_home_browser.ts | red 1 of 2 | The check read the focus before the page's focus effect ran, which happens only after the refetch. One later red (focus on `<body>`) is **not explained**; 9 probe rounds did not reproduce it. | #3285 | 10 of 10 |
| check_pf5s_firm_profile_browser.ts (Lead 10) | green 1 of 1 here; CI run 45225109348 shard 18: red on both tries | **Product race:** same as fo3st1, in `firm-profile-page.tsx` (`focusProblem` and break m7's Save focus). 30× CPU throttle: 3 of 3 red before the fix, 3 of 3 green after. | #3300 | 10 of 10 |
| check_aud4_firm_log.ts | **not reproduced in 8 packed runs** (r2, A1, A2, Br2, W1, W3, W4, W6) | — | — | — |
| check_b124_unconfirmed_browser.cjs | **not reproduced in 6** (r3, D1, D2, Br2, W1, W4) | — | — | — |
| check_csk1s_clients_browser.ts | **not reproduced in 6** (C1, B1, C2, Br2, W2, W5) | see the demo-load finding below | — | — |
| check_forms_s4_library_browser.cjs | **not reproduced in 6** (r2, A1, A2, Br1, W2, W5) | see the speed-budget finding below | — | — |
| check_screen02_slice2_browser.cjs | **not reproduced in 6** (r2, A1, A2, Br1, W3, W6) | — | — | — |

The same mechanism showed up in three places. A focus move was requested with `requestAnimationFrame` *before* React rendered the state it depends on: a disabled button, or a refused field not yet marked. On a busy machine the frame can win, and then the focus is lost for good. A follow-up audit of other `requestAnimationFrame(... .focus())` calls placed after state updates may be worth a row; I did not count them.

## r1c (`tests/runtime/check_runtime_r1c.cjs`): the cause

**Red in 5 of 6 packed rounds here** (Z1–Z6: the R1 unit plus two other suites, no hogs). It was also **red in 2 of 2 alone runs**. The only failing step every time is the speed budget for the case page's first view:

| Run | Case page, best of 3 (all 3) | Load when judged |
|---|---|---|
| alone 1 | 1155 ms (1752, 1362, 1155) | 1.4 on 4 cores |
| alone 2 | 1230 ms (1276, 1500, 1230) | 1.8 |
| packed Z1 (pass) | 985 ms | ≤ 4 |
| packed Z2–Z6 | 1205–1399 ms | 2.8–3.5 |

* **Fact:** the budget is judged whenever the one-minute load is at or below the core count (`tests/speed_budget.cjs`, P-184). Three packed browser suites kept the load under 4 on 4 cores, so the budget was judged. Pilot B's large server would likewise have stayed "not busy" by this measure.
* **Fact:** on this hardware the case page's first view misses the 1 s budget even when nothing else runs (about 1.2 s). Packing adds about 100–200 ms. A faster CPU (Pilot B) passes alone, near the line, and misses when packed.
* **Judgement (medium confidence):** the cause is the case page's own first-view time sitting at the budget, not a timing fault in the check. The copy's API log for the alone run shows `GET /runtime/cases/:id/prepare` at a median of 974 ms (n=52, max 1468) and `/findings` at a median of 890 ms. **Not confirmed** which request gates the "Application details" heading the budget waits for; a browser trace would settle it.
* **Not changed:** the budget (as asked). The client-part view (about 300 ms) and the tab (about 120–150 ms) meet their budgets.

## Other findings

* **Demo load is slow:** `POST /api/demo/load` (configured checkpoint) takes about 150 s **alone** here, single-threaded (one core of Node plus database round trips). Three at once took 167 s each, so they do not serialise. When I added extra load, it crossed undici's 300 s header timeout, and pf18h, csk1s and fo8 stopped with `HeadersTimeoutError` (those rounds are counted as invalid above). On a heavily packed machine this alone can turn the suites that call it red.
* **forms_s4** shares the speed-budget gate: here it measured 1732 ms against 1 s at load 5.3 ("not judged" only because load was above 4 cores). On a larger machine the same miss would be judged.
* **Harness artefact:** with 4 hogs on 4 cores, isolated copies took more than isolated.sh's 30 s start wait (alone: about 10 s; 3 at once with 2 hogs: about 21 s).
