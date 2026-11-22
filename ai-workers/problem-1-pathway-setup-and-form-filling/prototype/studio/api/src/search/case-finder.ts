// CS-S1 part 2 (BACKLOG CS-S1 and PF-30a's batch 5 note; map row 102): the case side's finder on the one find door
// (ports/find.ts, GET /api/platform/find; batch 5: no case-side search route). It registers as "case" at start-up and
// answers from the one search service (party-search.ts): cases by number (kind `case`, an exact number first) and
// people on cases by name, email or phone (kind `case_person`), each opening its case page. Only cases inside the
// caller's `caseScope` are named; the door's answer has no place for a count (FindResult is PF-30a's strict shape), so
// the hidden count stays with the service and PartySearchPort. Without `agent/case:show` (every case read route needs
// it) the case side finds nothing. It only reads: no audit line, nothing logged (PF-23).
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { FINDER_MAX_HITS, type FindHit, type FindQuery } from "../../../ports/find.ts";
import { FindRegistry } from "../platform/find/registry.ts";
import type { StaffContext } from "../platform/identity/keys.ts";
import { CasePartySearch } from "./party-search.ts";

/** A stored role as words: SPOUSE_OR_PARTNER → "Spouse or partner". */
const roleWords = (role: string) => { const w = role.toLowerCase().replace(/_/g, " "); return w.charAt(0).toUpperCase() + w.slice(1); };
const statusWord = (status: string) => (status === "CLOSED" ? "Closed case" : "Case");

export class CaseFinder implements OnModuleInit {
  constructor(private readonly registry: FindRegistry, private readonly search: CasePartySearch) {}

  onModuleInit() { this.registry.register("case", (ctx, q) => this.find(ctx, q)); }

  async find(ctx: StaffContext, q: FindQuery): Promise<FindHit[]> {
    if (!ctx.keys.includes("agent/case:show")) return [];
    // An email or a phone is no name; anything else that holds a name (the door's own reading) is searched as typed.
    const r = await this.search.find(ctx, { name: q.email || q.phone || !q.nameKey ? null : q.text, email: q.email, phone: q.phone, caseNumber: q.number });
    const out: (FindHit & { rank: number })[] = r.cases.map((c) => ({
      kind: "case", id: c.caseId, title: (c.clientName ? `${c.caseNumber} · ${c.clientName}` : c.caseNumber).slice(0, 200), subtitle: statusWord(c.status),
      matched_on: ["NUMBER"], url: `/cases/${c.caseId}`, rank: c.exact ? 1000 : 800,
    }));
    const seen = new Set<string>();
    for (const p of r.parties) {
      // One employer can be several index rows on one case (a row per worked stage): shown once.
      const key = `${p.caseId}|${p.roleOnCase}|${p.displayName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ kind: "case_person", id: p.recordId, title: p.displayName.slice(0, 200) || "(no name)", subtitle: `${roleWords(p.roleOnCase)} · case ${p.caseNumber}`, matched_on: p.matchedOn, url: `/cases/${p.caseId}`, rank: p.rank });
    }
    return out.sort((a, b) => b.rank - a.rank || a.title.localeCompare(b.title) || a.id.localeCompare(b.id)).slice(0, FINDER_MAX_HITS).map(({ rank: _rank, ...h }) => h);
  }
}
// Decorators as calls: this folder is outside api/tsconfig.json's decorator files (as case-clients/live.ts does).
Injectable()(CaseFinder);
[FindRegistry, CasePartySearch].forEach((t, i) => Inject(t)(CaseFinder, undefined, i));
