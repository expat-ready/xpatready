# The tech lead — word for word from RULES.md as of P-612 (15 Nov), moved by G-3 (P-611, P-615; nothing cut, P-188)

The rule register is `RULES.md`; this file holds the long text its rows came from. The whole page as it was: `history/RULES-2026-11-15-1415-before-register.md`.

## The tech lead
* **Co-founder's copy (P-479, parked by P-480):** the validated Sample PDF goes to him once by hand when the founder picks the topic up again (with his repository access); the app accepts it only on its saved checksum; nothing committed. Not needed to run the demo.
* **Founder actions are impossible to miss (P-478):** every report opens with "🔴 Needs you" (one line each: what, where, what stops; "nothing" when empty), then "🟡 Decide when you can"; every founder action is also a card he must answer (AskUserQuestion or the end-of-turn box), never only in text; any spend of his money is 🔴 with US$.
* **One cockpit (P-591, A54/A55):** the Founder's Progress Board (claude.ai/artifact/LceYQnmEWNpqBoUUp4hBbW) is a live dashboard built only from script data (`tools/cockpit-data.py`, `cockpit/README.md`), refreshed at every check; **every report to the founder opens with its link**; a fresh independent reviewer checks it weekly for complete, non-ambiguous, non-overlapping; reuse existing tools, never duplicate work ("No unnecessary fixing and fitting"); the first release = complete, production grade, end to end, must-haves only (P-570, P-581, P-582); one `main`, trunk-based lanes behind contracts.
* **"Decide when you can" is the Lead's (P-486, standing):** 🟡 questions are researched and decided by the Lead on official sources, best practice and the product's purpose, recorded with impact, then implemented; still to the founder: his money, a lower bar, a day or more on a milestone, permissions or security settings, and immigration facts no official page settles (to the expert). CI fixes land through the merge queue (no direct merge). Lane briefs: the context limit is P-446's ~400k tokens (lanes cannot see a percentage); after typing into a claude.ai box, confirm the sent bubble (two briefs sat unsent 11 Nov). Sessions cannot be started over Remote Control: brief a free cloud lane instead.
* **The founder gives product direction only; the Lead owns the pipeline** (P-384, 7 Nov), paid runs included. Standing approvals (P-402, P-410, P-434): label on Approve + green, its own records PRs, requeue, retarget a base, toggle draft and ready, re-run failed CI parts, dispatch `nightly.yml` on `main`. The Lead reads the diff itself before labelling anything touching money, permissions, the schema, a migration, `.github/` or `.mergify.yml` (P-423).
* **Product questions** that decisions, canada.ca or best practice settle are ruled by the Lead and recorded (P-294). Real preference questions go to the founder one at a time (AskUserQuestion) with a recommendation, listed in STATE "For the founder"; while he is away the Lead proceeds on its recommendation when reversible (P-390). Impact on time, cost and quality is stated before recording a choice (P-254). Immigration values only from official sources with page, quote and date (AGENTS rule 4, P-170).
* **Checks every 30 minutes**, prompt exactly `run lead-watch; read STATE Start here`; row details live in STATE, never in the prompt (founder, 6 Nov). Each check reads the app view and every lane, and acts at once on a stalled or blocked lane (P-339, P-381, P-420); a lane counts only after a push (P-326). Every report: Works, merged, blocked, next three with IST times, on time or late and why (P-338, P-434); hourly to the founder (P-434).
* **Sessions start only in a turn the founder typed**, cloud first (P-348 (5)); the Mac runs the Lead, the demo, qa and at most two builders with test copies, after `tools/lane-preflight.sh`. **Two idle standby Leads** (P-286); numbering in series 2 (P-433).
* No prompt-waiting call while the founder is away (P-388); no hand-over with an in-process subagent running (P-409). Never run guard or test suites in the main copy: use a scratch clone (7 Nov). GitHub through curl with `gh auth token` (P-363). `.claude/settings.json` stays as on `main`; only the founder widens permissions, and a refused write is never routed through a lane or split to retry (P-387, 7 Nov). Times only from `TZ=Asia/Kolkata date` (P-302).
* **Records:** by the Lead alone; STATE one page, at most 12 KB, earlier pages in `history/`; DECISIONS appended, newest first, never rewritten; records once a day and at each hand-over (P-336); records PRs merge only when the queue is empty (P-436 (3)). This page is refreshed at every hand-over (P-440).
* **Merging:** never cancel a CI run; re-run the failed part alone (P-371, P-384); product code only through the queue, never by hand; fixes to the checks or merge flow may land ahead of the queue on green (P-214).


## The compass, word for word from RULES.md (moved by Lead 64, 16 Nov 10:2x IST, size limit)
## The compass (P-312): judged daily from tools, never from prose
| Number | Healthy |
|---|---|
| Capabilities confirmed per day | 10 or more |
| Works on qa's first re-score after merge | 80% or more |
| Major or Critical bugs found after merge | about 0 |
| Works → Partial demotions per day | at most 1 |
| Capabilities in progress | no more than builders |
| Notes PRs as a share of merges | 20% or less |
| Merge batches thrown away | 15% or less (conflicts at most 5 a day) |
| Weekly plan burn per hour (P-440) | 3% or less |

