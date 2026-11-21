// The case side's PartySearchPort (case-side contract v0.1 §3.1; BACKLOG CS-S1, brief design/briefs/CS-S1.md part 2),
// created by FO-13c with exactly CS-S1's names because CS-S1b is not on main yet: `PartySearchPort.search(ctx, query)`
// and `fakePartySearch()` with five parties (client, spouse, sponsor, employer, one hidden). CS-S1b adds the real adapter
// (api/src/search/party-search.ts) and the shared contract (ports/contracts/party-search-port.contract.ts). A match is in
// FO-13's stored shape (fo_compliance_matches_ok) without `source`, which the caller sets to CASE. The firm comes from the
// caller's session (`ctx`), never from the query. This folder imports only zod and its own files.
import { z } from "zod";
import { normaliseEmail, personNameKey } from "./matching.ts";

export const PartySearchQuery = z.strictObject({ name: z.string().max(300).nullish(), email: z.string().max(320).nullish(), phone: z.string().max(40).nullish() });
export type PartySearchQuery = z.infer<typeof PartySearchQuery>;
export const PartyMatch = z.strictObject({
  kind: z.enum(["CLIENT", "APPLICANT", "FAMILY_MEMBER", "SPONSOR", "EMPLOYER", "OTHER_PARTY"]),
  recordId: z.string().uuid(), caseId: z.string().uuid(), caseNumber: z.string().regex(/^[A-Z][A-Z0-9]{0,5}(-[0-9]{1,8}){1,3}$/), clientId: z.string().uuid().optional(),
  roleOnCase: z.string().regex(/^[A-Z][A-Z_]{0,39}$/), displayName: z.string().max(300), matchedOn: z.array(z.enum(["NAME", "EMAIL", "PHONE"])).min(1).max(3),
  score: z.number().min(0).max(1),
});
export type PartyMatch = z.infer<typeof PartyMatch>;
export const PartySearchResult = z.strictObject({
  matches: z.array(PartyMatch), hidden_count: z.number().int().min(0),
  /** Who may confirm a check while hidden_count > 0 (§3.1 [F18]). */
  needs_confirmation_by_role: z.array(z.enum(["FILE_OWNER", "FIRM_ADMIN"])),
});
export type PartySearchResult = z.infer<typeof PartySearchResult>;

export interface PartySearchPort {
  /** Read-only; the case-visibility rule is applied in the port; another firm's parties are never read. */
  search(ctx: { firmId: string; staffId: string }, query: PartySearchQuery): Promise<PartySearchResult>;
}

/** A fake party: its case, role, keys, and whether this caller may see it. */
export type FakeParty = Omit<PartyMatch, "matchedOn" | "score"> & { firmId?: string; email?: string; phone?: string; hidden?: boolean; seenBy?: string[] };

/** The fake: the given firm's five Sample parties (client, spouse, sponsor, employer, one hidden), or the ones the test
 *  passes. With no firm, the parties answer every firm (CS-S1's `fakePartySearch()`). A party matches on its email (exact, lower-cased), its phone (exact) or its name (the same name key). */
export function fakePartySearch(firmId?: string, parties?: FakeParty[]): PartySearchPort & { parties: FakeParty[] } {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const list: FakeParty[] = parties ?? [
    { firmId, kind: "CLIENT", recordId: id(1), caseId: id(11), caseNumber: "C-2026-1", clientId: id(21), roleOnCase: "PRINCIPAL", displayName: "Sample Client Avery", email: "avery.client@example.test" },
    { firmId, kind: "FAMILY_MEMBER", recordId: id(2), caseId: id(11), caseNumber: "C-2026-1", clientId: id(21), roleOnCase: "SPOUSE_OR_PARTNER", displayName: "Sample Spouse Blair" },
    { firmId, kind: "SPONSOR", recordId: id(3), caseId: id(12), caseNumber: "C-2026-2", clientId: id(22), roleOnCase: "SPONSOR", displayName: "Sample Sponsor Casey", phone: "+14165550199" },
    { firmId, kind: "EMPLOYER", recordId: id(4), caseId: id(13), caseNumber: "C-2026-3", clientId: id(23), roleOnCase: "EMPLOYER", displayName: "Sample Employer Dale" },
    { firmId, kind: "OTHER_PARTY", recordId: id(5), caseId: id(14), caseNumber: "C-2026-4", clientId: id(24), roleOnCase: "OTHER_PARTY", displayName: "Sample Hidden Emery", hidden: true },
  ];
  return {
    parties: list,
    async search(ctx, query) {
      const q = PartySearchQuery.parse(query), email = normaliseEmail(q.email), name = q.name ? personNameKey(q.name, "") : "";
      const found = list.filter((p) => p.firmId === undefined || p.firmId === ctx.firmId).map((p) => {
        const on: PartyMatch["matchedOn"] = [];
        if (name && personNameKey(p.displayName, "") === name) on.push("NAME");
        if (email && p.email === email) on.push("EMAIL");
        if (q.phone && p.phone === q.phone) on.push("PHONE");
        return { p, on };
      }).filter((x) => x.on.length);
      const isHidden = (p: FakeParty) => !!p.hidden && !(p.seenBy ?? []).includes(ctx.staffId);   // a hidden party, unless this staff member sees its case
      const hidden = found.filter((x) => isHidden(x.p)).length;
      return {
        matches: found.filter((x) => !isHidden(x.p)).map(({ p, on }) => PartyMatch.parse({ kind: p.kind, recordId: p.recordId, caseId: p.caseId, caseNumber: p.caseNumber, clientId: p.clientId, roleOnCase: p.roleOnCase, displayName: p.displayName, matchedOn: on, score: on.includes("EMAIL") || on.includes("PHONE") ? 1 : 0.9 })),
        hidden_count: hidden, needs_confirmation_by_role: hidden ? ["FILE_OWNER", "FIRM_ADMIN"] : [],
      };
    },
  };
}
