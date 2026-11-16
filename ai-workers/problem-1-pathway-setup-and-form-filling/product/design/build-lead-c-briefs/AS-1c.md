# Brief: AS-1c, Express Entry gains its assessment: FSW gates and the FSW and CRS grids, cited, on the existing filing pathway (cloud builder lane; row owner Build Lead C)

Written 16 Nov 23:5x IST by Build Lead C. Row: `product/BACKLOG.md` **AS-1c** (line 1147), **read with P-650, which replaces its "Question 3" sentence.** Release 1 row: **R1.106**.
**PR title:** `configurator: AS-1c — Express Entry's assessment: FSW gates, FSW and CRS grids, cited`
**Model: Opus 5.5, effort: high** (every value cited from an official source; a release on a live filing pathway). Decisions: **P-650** (founder, 17 Nov, via Lead 71), P-577, P-541, P-170, AGENTS rule 4, P-113, P-315, P-172, P-496 (1).
**Ready when:** **AS-1g and AS-1s are merged**, and this lane holds the configurator's change on the Express Entry combination (no other lane is changing `individual.economic.express_entry.*`; check open PRs).

**P-650, as it applies here:**
* **Express Entry stays end to end. This row ADDS the assessment to the existing pathway, and never makes an assessment-only copy.** The two steps stay exactly as they are: `individual.economic.express_entry.profile` ("Step 1 of 2") and `…pr_application` ("Step 2 of 2"). Their forms, the answer sheet for portal-only steps (P-113), the P-315/P-172 hard stop and the portal fill are all unchanged.
* **Where the assessment goes:** on the **Profile** step's combination, where FSW eligibility and the CRS rank apply. If the configurator's model puts grids on the category instead, say which in step 0 and follow the model; never change both.
* **The release:** one new release of that combination through the configurator's own guarded change. It carries the gates and grids **plus everything the current release carries, unchanged**.
  * The release diff must show **only** the gates and grids added.
  * Open cases pinned to the earlier release keep it (P-496 (1), P-137).
* **Step 0:** confirm the configurator publishes a release that adds grids to a combination that has form lines. If it refuses, stop and ask ("Question for the tech lead"). P-650 (3)'s "assessment-only release kind" row is for **AS-2d** (the provincial streams); Express Entry never needs it.

**Values: from canada.ca only, read on the day** (AGENTS rule 4, P-170).
* Each FSW minimum requirement, each FSW selection-factor band, each CRS band and each language-conversion row carries a `source_ref`: URL, section, a quote that contains the value, and the date read.
* Anything not citable stays **Sample**. If a needed page is blocked on the cloud network, write **"Not verified: canada.ca blocked on the cloud network"**, label the value Sample, and go on (Lead 70's standing rule).
* Never take a value from memory, a third-party site or a calculator.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime AS-1c` and build this one data row end to end on a fresh branch from `origin/main`, one PR. Read the row, P-650 (DECISIONS on `lead/2026-11-07-lead31`), AS-1g's import format (`samples/score-grids/README.md`), and `samples/programs.json` (the Express Entry entries only).

**Touch (nothing else):** `samples/score-grids/express-entry-*.json`; the Profile combination's set-up data, through the configurator's import; `tests/check_as1c_express_entry_cited.ts`.

**Done when** (P-606), each with a pass and a fail:
* every grid row and gate value has a citation whose quote contains the value, or is labelled Sample, and the test fails otherwise;
* three worked profiles, each worked out by hand from the cited tables with the page reference in the test, give the expected FSW and CRS totals;
* a profile missing education gives POSSIBLY, with education named;
* `listAssessable()` returns the Express Entry Profile;
* the release's content hash is stable across two imports;
* **added for P-650:** the new release's diff against the previous one lists only gates and grids. Its forms, answer-sheet steps and hard stop are byte-equal, and a case pinned to the previous release is unchanged.

The Express Entry, C7.x and C11.x suites that use these combinations, the demo reset and the checkpoint load pass unchanged. Full `ci` green.

**Review:** Opus reviewer at high (breaker no, as the row says: it is data). **The reviewer checks every citation:** that the page and quote contain the value, and that the date is today.

**Holds / parallel safety:** the Express Entry combinations' set-up while the PR is open. No schema, no code.

**CI rule (Lead 71):** keep the PR a draft until the reviewer approves the head, then mark it ready once.

**Rules (standard, every Build Lead C brief, P-644):** Opus 5.5 at the effort above, no model switch mid-session (P-605, P-608). **Whole part first** (P-644 (1)): this PR finishes the part named here; if it must split (over 800 changed lines, P-610), stop and ask in a PR comment before coding, so Build Lead C lists the sub-parts first. Finish whole: an item that needs more than the touch list → stop and ask in a PR comment headed **"Question for the tech lead"** (Build Lead C answers within 30 min); never widen the row silently, never leave a piece for later (P-606). One part, one session, one PR from a fresh branch off `origin/main`; new files only as listed. Duplicate check (P-526): one `Duplicate check:` line in the PR body. A **fresh Opus reviewer** (P-303); re-review reads only the new commits (P-277). The label `review: approved` only after `Reviewer: Approve <sha>` on the exact head **and** green CI on that sha (P-277, P-385); the Lead applies it (P-384); never push to a PR carrying `queued`. Merge `main` only on a conflict (P-270). Before asking for the label, run on `main` merged into your branch the suites of every CI part red on any earlier head plus every suite sharing your shard's demo database, and paste the result lines. **Live AI off, US$0, never a priced button, no real keys** (P-175). Times only from the clock port (P-607). Push after every step (P-557). Event names from `ports/events.ts`. Report to the current Lead (`tools/current-lead.sh`) for the queue and to **Build Lead C** (row owner, branch `claude/build-lead-c-647b40`, state file `product/design/build-lead-c-state.md`) for the row. Read only the files the draft brief names and the code you change (P-556).
