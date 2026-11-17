# Brief: AS-2d2, Alberta, Saskatchewan and Manitoba's chosen streams, cited, assessment only (cloud builder lane; row owner Build Lead C)

Written 17 Nov 00:0x IST by Build Lead C. Row: `product/BACKLOG.md` **AS-2d2**, read with **P-650 (2)**. Release 1 row: **R1.107** (map 107).
**PR title:** `configurator: AS-2d2 — Alberta, Saskatchewan and Manitoba's streams, cited, assessment only`
**Model: Opus 5.5, effort: high** (every value cited from the province's own site). Decisions: **P-650 (2)-(3)**, P-607 (9), P-577, P-541, P-170, AGENTS rule 4.
**Ready when:** **AS-2e is merged.** The founder confirmed the streams (P-653, 07:5x IST 17 Nov, "As proposed").
* **Streams (confirmed, P-653):**
  * Alberta: **Alberta Opportunity Stream**, eligibility only (gates, no score; AS-2e's gates-only stream).
  * Saskatchewan: **SINP International Skilled Worker** (at least 60 of 110 points). Reconcile the first factor's sub-points (75 against the stated 80) from the full grid and cite it.
  * Manitoba: **MPNP Skilled Worker in Manitoba (SWM)**. The **eligibility rules are cited** from immigratemanitoba.com/mpnp/skilled-worker/swm/eligibility/, read through the founder's Chrome on 17 Nov 12:58 IST (`official-sources/manitoba/README.md`, on main with the next records PR). The **points grid, EOI ranking, fees and language minimums stay Sample** until they are read. Swapping those in later is a data-only follow-up.
  * Sources, quotes and dates are in `build-lead-c-briefs/AS-2-streams-proposal.md`. No other stream is built.

**P-650 (2):** the provincial streams are **assessment only in Release 1**.
* Each is released as a combination under `individual.economic.provincial` with gates, a grid and lists, and **no form lines**.
* Each is labelled **"Assessment only: no forms"** wherever the configurator and the assessment panel name it.
* Filing for these streams comes later, as a new release of the same pathway.

**Step 0 (P-650 (3)):** confirm the configurator publishes a release with no form lines.
* `engine/channels.ts` already has a "No forms yet" state, which suggests it does.
* If it refuses, **stop and ask** ("Question for the tech lead"). A small row then adds the assessment-only release kind first.

**Values: only from each province's own official site, read on the day** (URL, section, a quote containing the value, date).
* Use the pages named in the proposal file. Anything not citable stays **Sample**.
* A page blocked on the cloud network: write **"Not verified: <site> blocked on the cloud network"** and label the value Sample.
* Never use memory, a consultant's or law firm's page, or a calculator.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime AS-2d2` and build this one data row end to end, on a fresh branch from `origin/main`, as one PR.

**Touch (nothing else):** `samples/score-grids/pnp-ab-*.json`, `samples/score-grids/pnp-sk-*.json`, `samples/score-grids/pnp-mb-*.json`, the combinations' set-up data through the configurator's own import, and `tests/check_as2d2_pnp_cited.ts`.

**Done when** (P-606), each with a pass and a fail:
* every value is cited with a quote containing it, or labelled Sample (the test fails otherwise);
* two worked profiles per stream, worked out by hand from the cited tables with the page reference in the test, give the expected outcome and total;
* a profile with no connection to the province gives NOT, with the gate named;
* `listAssessable()` returns the three streams;
* **added for P-650:** each release has no form lines and carries the "Assessment only: no forms" label.

Demo reset and checkpoint load pass unchanged. Full `ci` green.

**Review:** Opus reviewer at high (breaker no, as the row says: it is data). **The reviewer checks every citation:** that the page and quote contain the value, and that the date is today.

**PR rule (P-683, founder, 17 Nov):** get the reviewer's "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft (`draft: false`). Never push to an open PR unless it is a fix.

**Rules (standard, every Build Lead C brief, P-644):** Opus 5.5 at the effort above, no model switch mid-session (P-605, P-608). **Whole part first** (P-644 (1)): this PR finishes the part named here; if it must split (over 800 changed lines, P-610), stop and ask in a PR comment before coding, so Build Lead C lists the sub-parts first. Finish whole: an item that needs more than the touch list → stop and ask in a PR comment headed **"Question for the tech lead"** (Build Lead C answers within 30 min); never widen the row silently, never leave a piece for later (P-606). One part, one session, one PR from a fresh branch off `origin/main`; new files only as listed. Duplicate check (P-526): one `Duplicate check:` line in the PR body. A **fresh Opus reviewer** (P-303); re-review reads only the new commits (P-277). The label `review: approved` only after `Reviewer: Approve <sha>` on the exact head **and** green CI on that sha (P-277, P-385); the Lead applies it (P-384); never push to a PR carrying `queued`. Merge `main` only on a conflict (P-270). Before asking for the label, run on `main` merged into your branch the suites of every CI part red on any earlier head plus every suite sharing your shard's demo database, and paste the result lines. **Live AI off, US$0, never a priced button, no real keys** (P-175). Times only from the clock port (P-607). Push after every step (P-557). Event names from `ports/events.ts`. Report to the current Lead (`tools/current-lead.sh`) for the queue and to **Build Lead C** (row owner, branch `claude/build-lead-c-647b40`, state file `product/design/build-lead-c-state.md`) for the row. Read only the files the draft brief names and the code you change (P-556).
