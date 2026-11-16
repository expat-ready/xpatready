# Common rules for every Prove Lead qa brief (read with the row's brief)

* **Model and effort:** Opus 5.5, medium (P-608); the fresh reader Opus high (P-303).
* **Start:** skill `qa` (`/qa capability <ROW>`), a fresh branch `claude/qa-<row>` from origin/main; you test main's head. One row per lane (P-278, P-434b).
* **Parts first (P-606 (2)):** `python3 tools/trace-requirements.py --brief <ROW>` (P-604) and the MVP-CHECKLIST row's parts against merged PR titles. A part not merged → one line "parts missing: <ids>" in qa's row, no walk, no reader, and end the lane after the records PR.
* **Works (P-339):** pack green on main's head on GitHub's runners on the counted data (cite the merge batch run and job ids that made main's head; ask the Lead for a `nightly.yml` dispatch only when no batch covers the pack, P-439), an independent re-run, a fresh Opus reader's verdict. An open Major or Critical keeps the row Partial (P-305).
* **Gate A:** by screens to the next capability's first step (P-348c); by API where there is no screen (P-616).
* **Keep it small (P-640):** one pack per row, reuse existing journeys, nothing heavy run twice locally; runner waits are ~90 min, so do not trigger extra runs.
* **Records:** qa alone edits `qa/CAPABILITIES.md` and `qa/BUGS.md`, through a `qa:` PR (P-314); report `qa/reports/<date>-capability-<row>.md`. Label `review: approved` only on an Opus `Reviewer: Approve <sha>` and green ci (P-385).
* **Bugs:** a new row in BUGS.md names the owning seat: PF/FO → Lead B; else → Build Lead C. The Prove Lead routes them from `design/prove-lead-state.md`.
* **Never:** build or fix app code; live AI (US$0, P-175); edit STATE, RULES, DECISIONS, BACKLOG; personal names. Times only from `TZ=Asia/Kolkata date`. Push every step (P-557).
* **Report back:** a cloud lane lists no Lead, so the PR comment is the record (qa skill §5); the Prove Lead reads merged and open `qa:` PRs.
