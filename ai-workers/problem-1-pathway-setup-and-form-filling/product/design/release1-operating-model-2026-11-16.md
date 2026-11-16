# Release 1 operating model: build 10, prove 10, every day (Lead 69, 16 Nov 2026, 20:5x IST)

Asked by the founder (A123-A125, 20:4x-20:5x IST 16 Nov): his intent is "build 10 and prove 10 every day"; scope stays as decided ("Whatever we have decided is decided ... production class"; "I don't want to cut any corners"); plan capacity, build and proving, learning and waste; agents work 24/7; "whatever is the best strategy ... it should be followed going forward consistently by every lead". Recorded as **P-644**.

## 1. Where we are (measured, not estimated)
Sources: `qa/CAPABILITIES.md` on main (d66bcfd2d), `MVP-CHECKLIST.md` (Lead branch), 294 PRs merged to main 9-16 Nov (GitHub API), `design/merge-queue-failures-2026-11-16.md`. Full analyst report: `design/release1-forecast-2026-11-16.md`.

| Measure | Now | Needed for 29 Nov |
|---|---|---|
| Release 1 rows proven (qa Works) | 11 of 101 (0 on 14 Nov; 2 at 00:00 16 Nov; 11 at 18:24 16 Nov; 6 of today's came from M2/M3 rows already Works when the table grew from 81 to 101 rows) | 101 |
| Rows by state | Not built 67 · Partial 22 · Built awaiting qa 1 · Works 11 | |
| Parts (BACKLOG rows) left to build | 178 of 204 (171 untouched; 45 rows have no part merged) | 0 |
| Parts fully merged a day | 6.5 mean 13-16 Nov (11 on 14-15 Nov; 3 on 16 Nov) | **~15 a day** |
| New Works a day from qa verdicts | ~2.5 (qa gives ~25 row verdicts a day; most are Partial) | **~7 a day** |
| Built → Works | median ~35 h (n=4) | under 12 h |
| Approved → merged | median 61 min, p90 132 min (n=78); failed batches 5.6% | |

**Forecast at today's rates:** all 101 proven about **15 Dec** (best 4-5 Dec at the 14-15 Nov rate; worst mid-Jan at the 16 Nov rate). By 29 Nov: about 30-45 of 101. 29 Nov needs 2.4× today's build rate and 2.8× today's prove rate.

Outside items (`design/outside-dependencies.md`): AWS account done (domain purchase blocked, fallback Cloudflare Registrar 18 Nov, staging on AWS's own address until then, P-625); BoldSign sandbox done; Google Calendar verification 4-6 weeks (started); Stripe test keys only when PF-5 goes live. These hold a few rows' last step, not the build.

## 2. Where the time goes (waste, from the data)
1. **Too few builders at once.** At 20:4x IST, 4 of ~30 cloud lanes were running; most had finished or waited on the queue. Volume (178 parts) is the main driver.
2. **Splitting.** On 16 Nov, 11 of 20 app-code PRs were sub-parts or hardening (PF-6b, PF-6r, PF-6f, FO-3sa, FO-7mv ...), so only 3 checklist parts finished. Sub-parts are real work but are not named in the checklist, so progress is invisible and rows stay Partial.
3. **Proving is serial and late.** Built → Works ~35 h; 5 rows have every part merged but are not yet proven (R1.4, R1.16, R1.38, R1.40, R1.80).
4. **Lead churn.** A Lead hands over every 2-3 h (P-446 at 200k); each start read costs ~120k tokens and an hour of slower steering.
5. **Merge waits** (61 min median) and batch failures (5.6%) are small next to 1-3.

## 3. The model (P-644; every Lead follows it)
**Targets, every IST day, from 17 Nov:** at least **10 Release 1 rows fully built** (every part merged) and **10 rows proven** (qa Works on main); floor 7 and 7, the pace 29 Nov needs. Scope is fixed (P-609, P-614); gates unchanged (P-290, P-303, P-339).

**Four seats under the Lead:**

| Seat | Owns | Lanes |
|---|---|---|
| **Lead** (this seat) | the pipeline: merge queue, CI, records, outside items, founder; daily numbers; unblocking every seat within 30 min | — |
| **Build Lead A = Lead B** (P-558) | platform (PF) and front office (FO) rows | up to 8 cloud builders |
| **Build Lead C** (new) | case side, money and audit, forms and release rows (everything not PF/FO) | up to 8 cloud builders |
| **Prove Lead** (new) | qa for every built row: qa lanes start on the merge signal, one row per lane, packs on GitHub's machines; target built → Works under 12 h; bugs to the owning Build Lead at once | 4-6 qa lanes |

Build Leads write briefs, answer their lanes' questions in PR comments and keep **two ready rows per lane** (P-599). The Prove Lead never builds; Build Leads never score (P-290).

**Rules that change behaviour:**
1. **Whole parts first.** A PR finishes a checklist part. When a part must split (800 lines, P-610), the Build Lead adds the sub-parts to the checklist row first, so the board counts them.
2. **Rows in order of fewest parts left,** within each Build Lead's group, so rows finish rather than all being half-done (P-622 finish before starting).
3. **The WIP limit (P-623) stays.** Prove capacity is raised so builders are not stopped by it; a stopped builder fixes its group's qa bugs first, as P-623 says.
4. **Lanes are never idle.** A lane whose PR is labelled takes its next ready row (P-337/P-341 warm lane) or ends; each check reads claude.ai/code and refills empty slots (A120 standing approval).
5. **The daily report** opens with: rows built today, rows proven today, against 10/10, and the date forecast from the 3-day rate.
6. **Learning:** every evening the Lead lists the day's three biggest time losses with numbers and one fix each, recorded in STATE; a fix that changes a rule goes to DECISIONS.

**Capacity limits:** about 20 cloud lanes plus 4 Leads at once. The weekly plan rises about 2.5-3% an hour at that load; the founder resets the account near 98% (P-643). The Mac runs only the Leads, the demo and qa (P-348e).

## 4. What this needs from the founder
Nothing new. Reset the account when told (P-643); the Stripe test keys when PF-5 goes live; the settings line when #1865 merges. Starting the two new Lead seats needs a founder-typed turn (sessions start only then, P-348e), or he clicks the cards.

## 5. Confidence (honest)
* The product: high. Every proven row passed an independent Opus review, a breaker for money and security, the walls between firms (PF-12) and qa's walk. UI/UX gold standard is not yet proven across the app: a best-in-class design review per module is added to the Prove Lead's walk (P-473, P-352).
* All 101 by 29 Nov: **low (about 1 in 4)** even with the model; it needs 2.4× the build rate on day one. Likely with the model: **3-6 Dec**. The forecast is re-measured each evening; the 17 Nov check (P-609) reports it.
