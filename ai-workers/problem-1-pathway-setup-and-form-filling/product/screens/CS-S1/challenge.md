# CS-S1 part 2 (R1.102): not ready on main 9c7502919 — question for the tech lead

Raised 22 Nov ~04:0x IST by the runtime lane (cloud, `/next runtime CS-S1 part 2`). No code written.

## Facts (checked on origin/main 9c7502919)
1. **PF-30a is not on main and has no open PR or branch.** No `ports/find.ts` / `ports/find.port.ts`, no `api/src/platform/find/`, no `FindPort` anywhere in `studio/` (`git grep -n "FindPort\|platform/find"` empty; open-PR search "PF-30a" empty). The brief `design/briefs/CS-S1.md` makes part 2 "ready … after part 1, PF-30a (`ports/find.ts`, `GET /api/platform/find`), CS-K1 … and CS-K3 (`api/src/case-access.ts`) are on main". Part 2's `case-finder.ts`, DW7 (case number first through the finder) and DW10 (`GET /api/platform/find?q=Dupont`) cannot be built or tested without it.
2. **`caseScope` / `api/src/case-access.ts` does not exist.** The brief says visibility goes "through CS-K3's `caseScope`, never a second rule". CS-K3's BACKLOG row (line 1116) is `CaseSummaryPort`, not a scope function, and nothing on main reads `agent/case:view.own` / `view.all`. Main does have the inputs (`Case.fileOwner`, `CaseTeamMember`, `identity/catalogue.ts` `scopeOf`), but writing the rule here would be the "second rule" the brief forbids, and DW8 (`hidden_count`) depends on it.
3. Already on main: part 1 (`case_party_index`, triggers, #2035), `ports/party-search.ts` with `fakePartySearch()` (FO-13c made it under CS-S1's names), `ports/matching.ts`.
4. Duplicate check: searched BACKLOG*.md, open PRs ("CS-S1", "R1.102", "PF-30a"), remote branches (`css1|cs-s1|party-search|find|pf-30`), main's code; only `claim/CS-S1-part-1` and `runtime/CS-S1-part-1` (part 1, merged). None for part 2.

## Options
* **A (recommended): build PF-30a first, then CS-S1 part 2.** PF-30a is itself a missing part of R1.102 (runtime lane, ~450 lines, breaker yes), so it moves the same item and unblocks DW7/DW10. Also name where `caseScope` lives: either a small CS-K3-style row (`api/src/case-access.ts`: view.all → all firm cases; view.own → `fileOwner` or an open `case_team_member` row) or a line in PF-30a/CS-S1 part 2 allowing it there.
* **B: split part 2 now.** Build the real `PartySearchPort` adapter, the contract, the audit line and DW6, DW8, DW9, DW11, DW12 (~450 lines), with the scope rule above written inside the row; leave `case-finder.ts`, DW7 and DW10 to a part 3 after PF-30a. Faster for FO-13c's real adapter, but it writes a scope rule without a row and leaves R1.102 Partial anyway.

Waiting for the tech lead's ruling; this lane stops here (P-606: no widening without it).
