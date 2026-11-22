// PF-0c: PartySearchPort's contract (ports/party-search.ts; case-side contract v0.1 §3.1; BACKLOG CS-S1). Run by
// fakePartySearch and by the case side's real adapter (api/src/search/party-search.ts CasePartySearch). What FO-13c's
// conflict check relies on: an email in any letter case, an E.164 phone and a full name each find the party, in FO-13's
// stored shape; a party on a case the caller may not see is never named, only counted, and then the answer names who
// may confirm; another firm's caller finds nothing and counts nothing; a key the port does not know is refused.
import { defineContract, expect, expectRefused } from "./contract.ts";
import { PartySearchResult, type PartySearchPort } from "../party-search.ts";

type Caller = { firmId: string; staffId: string };
/** The world an adapter is run in: a caller who sees `seen` but not `hidden` (both in the caller's firm), and a caller of another firm. */
export type PartySearchWorld = {
  port: PartySearchPort; viewer: Caller; outsider: Caller;
  seen: { name: string; email: string }; phoned: { name: string; phone: string }; hidden: { name: string };
};

export const partySearchPortContract = defineContract("PartySearchPort", (make: () => Promise<PartySearchWorld> | PartySearchWorld) => [
  {
    name: "an email in another letter case finds the party (EMAIL, score 1), in the port's shape",
    async run() {
      const w = await make(), r = await w.port.search(w.viewer, { email: ` ${w.seen.email.toUpperCase()} ` });
      expect(PartySearchResult.safeParse(r).success, "the answer has the port's shape", r);
      expect(r.matches.length >= 1 && r.matches.every((m) => m.matchedOn.includes("EMAIL") && m.score === 1) && r.matches.some((m) => m.displayName === w.seen.name), "found by email", r);
      expect(r.hidden_count === 0 && r.needs_confirmation_by_role.length === 0, "nothing hidden", r);
    },
  },
  {
    name: "a full name finds the party (NAME); an E.164 phone finds its party (PHONE)",
    async run() {
      const w = await make(), n = await w.port.search(w.viewer, { name: w.seen.name }), p = await w.port.search(w.viewer, { phone: w.phoned.phone });
      expect(n.matches.some((m) => m.displayName === w.seen.name && m.matchedOn.includes("NAME")), "found by name", n);
      expect(p.matches.some((m) => m.displayName === w.phoned.name && m.matchedOn.includes("PHONE")), "found by phone", p);
    },
  },
  {
    name: "a party on a case the caller may not see is not named: it is counted, and the answer names who may confirm",
    async run() {
      const w = await make(), r = await w.port.search(w.viewer, { name: w.hidden.name });
      expect(!r.matches.some((m) => m.displayName === w.hidden.name), "the hidden party is not named", r);
      expect(r.hidden_count === 1 && r.needs_confirmation_by_role.includes("FILE_OWNER") && r.needs_confirmation_by_role.includes("FIRM_ADMIN"), "counted, with the confirmers", r);
    },
  },
  {
    name: "another firm's caller finds nothing and counts nothing (absent, not hidden)",
    async run() {
      const w = await make();
      for (const q of [{ email: w.seen.email }, { name: w.seen.name }, { name: w.hidden.name }, { phone: w.phoned.phone }]) {
        const r = await w.port.search(w.outsider, q);
        expect(r.matches.length === 0 && r.hidden_count === 0 && r.needs_confirmation_by_role.length === 0, "nothing for another firm", r);
      }
    },
  },
  {
    name: "a key the port does not know (a case number) is refused; an empty search finds nothing",
    async run() {
      const w = await make();
      await expectRefused(() => w.port.search(w.viewer, { case_number: "C-2026-00001" } as never), "a case number is no search field");
      const r = await w.port.search(w.viewer, {});
      expect(r.matches.length === 0 && r.hidden_count === 0, "an empty search", r);
    },
  },
]);
