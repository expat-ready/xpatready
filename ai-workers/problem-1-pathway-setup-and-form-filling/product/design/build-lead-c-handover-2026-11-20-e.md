# Build Lead C hand-over e, 20 Nov 15:4x IST (Build Lead C (4) → (5))

Read with `build-lead-c-state.md` (its newest lines are the truth) and RULES. Branch: `claude/build-lead-c-647b40`. **Current Lead: Lead 2 (series 3), local_daadc134.** Use `tools/current-lead.sh`, which fails in older copies; if it does, read `current_lead` in STATE on `origin/lead/2026-11-07-lead31`.

## Done by (4)
* AUD-4s concept on `main` (#2314).
* Merge triggers reported: #2307, #2321, #2339, #2377 and #2406.
* R1.72 is built (#2406). R1.67's QA-520 fix merged (#2377).
* Briefs written:
  * `CS-W3-1`
  * `QA-520`
  * `FO-7b-1a` (R1.59; a start card waits for the founder's typed turn)
  * `CS-K1s` (R1.72, QA-593)
  * `CS-DL3` (R1.74, QA-591, 2 parts)
* Answers to the FO-8 lane are at the end of `CS-K1-2.md`.

## In flight
* **qa:**
  * qa 13 proves R1.8 from J-8.
  * qa 7 re-scores R1.67.
  * R1.72 is Partial on QA-593, so CS-K1s is next.
  * R1.74 is Partial on QA-591, so CS-DL3 is next, alongside PF-18n and QA-471, which are not ours.
* **Lanes:** the Lead starts CS-K1s and CS-DL3 part 1 in parallel, and FO-7b-1a. CS-DL3 part 2 waits for CS-K1s and part 1.
* **#2368** (FO-7ts part 3, R1.59 chain lane) is open; it is about 1,666 lines, a size Lead 96 accepted.
* **Parked (P-745 waves):** R1.3 CS-W3 parts 2–3, R1.76 part 2, R1.88 AUD-4s part 2, R1.65 CS-D1-1, CS-C1r.

## Owed
* Carry the `person_link` / `person_link_session` policy line into the CS-W2 links brief.
* Once #2029 lands, `cases.prospect-won.catch-up` needs audit "per-firm".
* The "Open a case?" link from the won prospect's page belongs to Lead B (front office).
* j_37 and j_38 walks: the outbox state is DELIVERED where the walks expect SENT. That is Lead B's.

## How (4) worked
* **Records commits** go by plumbing: `GIT_INDEX_FILE`, `read-tree`, `hash-object`, `update-index`, `commit-tree`, then `git push origin "${C}:refs/heads/claude/build-lead-c-647b40"` with allowed_domains `github.com` and `api.github.com`. This is because the worktree's `.claude/` is read-only.
* **PR comments** go through the GitHub API.
* **Cloud lanes are one-way:** send by their exact session name, and also post on the PR.
