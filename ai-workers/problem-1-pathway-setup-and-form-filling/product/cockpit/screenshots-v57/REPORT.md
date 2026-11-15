# Board v57: report to the tech Lead (cloud board session, 15 Nov ~11:0x IST)
Branch `board/v57-team-and-tooltips` (cut from `lead/2026-11-07-lead31`, merged with it once to take the shortened lead skill). The head is this file's commit. Messaging the Lead's Mac session (`local_dc187db5…`, Lead 54 since 10:46 IST; the brief named Lead 53) from the cloud failed twice ("target session could not be verified"), so the report is here.

**Changed** (only `cockpit/`, `tools/cockpit-data.py`, `tools/test_cockpit_data.py`):
1. **Tooltips**: every number on the strip, Plan and pace, Capacity, the Health panel, Factory and Team has `data-tip` keys. They open on hover, keyboard focus and tap; Esc closes; on a phone they show as a bottom sheet. The text comes from `data.json › explain` (107 entries): what it counts, the window, n and what n counts, how to read it, the compass band where it governs, then source, class, sha and as-of. The data script adds the missing n fields at their source. A null n carries `n_reason`, and the page shows "not measured". Not read is never 0: the pipeline numbers, healing, merges per day and the merge trends turn null offline. Every former "n/a" now reads "not measured".
2. **Team tab** (new): the org view by component (`org.components`).
   * Layout: the founder on top; then the two Leads, with standbys under the tech Lead; then eight component cards with owner, job, who acts if a lane falls behind, and the escalation chain.
   * Lanes: cloud or Mac, row, PR, state, last push (IST) and idle; behind lanes are flagged red; each lane lists the capability rows it serves.
   * New optional Lead input fields per session: `component` and `owner` (README).
   * **Deviation, from evidence:** Audit and the configurator's AS rows (AS-1*, AS-2d*, AS-2e) go to the tech Lead, not Lead B, because BACKLOG's "The release holder's rows" lists them. AS-2c/AS-2cs stay Front office.
   * J rows are mapped through the map row named in their Area cell.
   * The old org chart and "Our team right now" moved out of Factory.
3. `data.schema.json` validates `explain`, lanes and the component order. `FORMULAS.md` has the new sections "Team by component" and "Tooltips".

**Checks:**
* 87 unit tests OK, including the new TeamByComponent and Tooltips classes. The second step of `cockpit-tests.yml` on the fixture passes: trust agree, 0 invariants broken. `check-docs.sh` reports docs OK.
* axe-core 4.10.2: 0 serious or critical on every tab at 375, 1024 and 1440, light and dark, with the health panel and a tooltip open. Fixing this also cleared older issues: the strip label contrast (`--ink3` darkened), html lang, the architecture SVG, and two sideways-scroll boxes.
* A fresh Opus reviewer (high, P-608) audited the FORMULAS changes and found 5 Major and 11 Minor issues, all fixed. Its diff-only re-check confirmed the fixes, and its last 4 points are fixed in the final commit. One limit is accepted and written in FORMULAS: letter ranges in "release holder's rows" are not expanded; this has no effect today.

**Screenshots** (this folder, fixture data): `team-1440.png`, `team-1024.png`, `team-375.png`, `team-dark-1024.png`, `tip-375.png`, `tip-cycle-1440.png` ("a change usually takes", n = 11).

**For the Lead:** merge into `lead/2026-11-07-lead31`, refresh with the live Lead input, and publish. The live board shows a Lead B owner only when a session with role `lead-b` is in `lead-input.json`.
