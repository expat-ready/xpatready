# Board v53: top numbers (A69, amended by A70) — notes for the Lead
Branch `board/v53-top-numbers` (from `lead/2026-11-07-lead31`; merges into it cleanly). No PR opened: the Lead reviews and merges.

**What changed.** Top strip: three numbers above the key-number strip:
* Works today "X of 10", with the S/M/L mix.
* Plan % per capability at Works, with % per merged change beside it.
* Lanes working of started, with the idle lanes named.

Capabilities tab: a "Sizes and requirements" table, with size per capability, `Source:` ids by section, and a not-mapped count.

Rules caught today: inside Health item 4 only. The counts are label-guard removals, check-docs CI failures, shard-1 rules-and-tools step failures, and the Lead-reported breaches and push-guard refusals.

The founder-facing page says "capability" for checklist items. Formulas: `FORMULAS.md` (Top numbers; Capabilities tab; Rules caught today).

**Review (P-596).** Four fresh Opus reviews of the FORMULAS.md diff:
* Round 1: 1 Major, 6 Minor.
* Round 2: 1 Major, 6 Minor.
* Round 3: 5 Minor.
* Round 4: 1 Minor, then APPROVE at `02e832eea`.

Every finding was fixed, or stated in the sheet as an accepted limit.

**Live run.** 15 Nov 08:57 IST, records `02e832eea`, main `d59d74c34`. 65 s, 157 API calls, trust agree on 27 keys.
* Works today: 0 of 10.
* Plan % per Works: not measured. The usage readings cover 16 h of 24.
* Lanes: 7 working. Started and idle are not measured, because no Lead input was given here.
* Sizes: S 21 · M 21 · L 8 · not shaped 51. 36 of 101 capabilities are not mapped to a requirement.
* Health 4: amber, with 3 label-guard removals today (#1753, #1777).

**For the Lead (open points, not settled here):**
1. **Lead input keys.** Add `breaches_found` and `push_guard_refusals` to `lead-input.json` at each check. They are counts for today; without them, Health 4 says "not reported".
2. **"records-check".** No CI check of that name exists in `.github/workflows/`, so none is counted. If a records check is meant, name it and it can be added.
3. **GraphQL in cloud sessions.** GitHub GraphQL is refused there. The snapshot now falls back to REST for branches (the push activity) and for open-PR detail. On the Mac nothing changes.
4. **Pre-existing, not changed here.** For scope and built, the board tests Status `== "Not shaped"` while the reconciler tests starts-with (ruling A4). A Status such as "Not shaped yet" would make them disagree. The new size rule uses starts-with in both scripts.
5. **BACKLOG format.** Three things the parse cannot read reliably:
   * Bold first cells (`| **FO-5f** |`, FO-3f, PF-4f) are not read as rows by the board.
   * 20 rows carry unescaped `|` inside backticks.
   * Unbolding and escaping in BACKLOG (the Lead's file) removes both limits.
6. **Lanes working can exceed started.** Working counts every pushed branch, including tooling branches. Idle is matched lane by lane rather than "started minus working" (stated in FORMULAS.md).
