// AS-1m: EligibilityPort's contract (ports/eligibility.port.ts; case-side contract v0.1 §3.2). Run by fakeEligibility
// (ports/fakes/eligibility.fake.ts) and by ConfiguratorEligibility (api/src/configurator/eligibility.door.ts) in
// tests/check_as1m_eligibility_move.ts. The port file's sentences: every answer has the port's shape; the three
// outcomes; a missing fact gives Possibly eligible with the fact named, never Not eligible; a rule not met gives Not
// eligible with the rule named; the same input gives the same result; an unknown release, or another workspace's, is a typed
// not-found; a malformed input is refused; facts no rule reads change nothing; the result names its release and hash; every rule read is a line with its state and source (AS-2a).
import { z } from "zod";
import { defineContract, expect, expectRefused } from "./contract.ts";
import { AssessableRelease, EligibilityRefused, EligibilityResult, RequiredFacts, type AssessInput, type EligibilityPort } from "../eligibility.port.ts";

/** What a contract case may use: the port, the same port bound to another workspace, and three fixed profiles (one per
 *  outcome) on one assessable release. */
export type EligibilityHarness = {
  port: EligibilityPort;
  other: EligibilityPort;
  profiles: { likely: AssessInput; possibly: AssessInput; not: AssessInput };
};

const notFound = (e: unknown) => e instanceof EligibilityRefused && e.code === "RELEASE_NOT_FOUND";
const UNKNOWN = "00000000-0000-4000-8000-000000000000";

export const eligibilityPortContract = defineContract("EligibilityPort", (make: () => Promise<EligibilityHarness> | EligibilityHarness) => [
  {
    name: "listAssessable gives one row per combination, in the port's shape, with the profiles' release among them",
    async run() {
      const h = await make(), list = await h.port.listAssessable();
      expect(z.array(AssessableRelease).safeParse(list).success, "every row is an AssessableRelease", list);
      expect(new Set(list.map((x) => x.combination_id)).size === list.length, "one row per combination", list);
      expect(list.some((x) => x.release_id === h.profiles.likely.release_id), "the profiles' release is assessable", list.map((x) => x.release_id));
    },
  },
  {
    name: "requiredFacts names each fact once per role, in the port's shape, and covers every fact a profile's result names",
    async run() {
      const h = await make(), id = h.profiles.likely.release_id, req = await h.port.requiredFacts(id);
      expect(RequiredFacts.safeParse(req).success && req.release_id === id, "a RequiredFacts for that release", req);
      const keys = req.facts.map((f) => `${f.role}|${f.key}`);
      expect(new Set(keys).size === keys.length, "each (role, key) once", keys);
      const r = await h.port.assess(h.profiles.possibly);
      expect(r.missing_facts.every((m) => keys.includes(`${m.role}|${m.key}`)), "every missing fact is a required fact", { missing: r.missing_facts, keys });
    },
  },
  {
    name: "the three profiles give the three outcomes, each result in the port's shape naming its release and hash",
    async run() {
      const h = await make(), list = await h.port.listAssessable();
      const hash = list.find((x) => x.release_id === h.profiles.likely.release_id)?.content_hash;
      for (const [want, input] of [["LIKELY_ELIGIBLE", h.profiles.likely], ["POSSIBLY_ELIGIBLE", h.profiles.possibly], ["NOT_ELIGIBLE", h.profiles.not]] as const) {
        const r = await h.port.assess(input);
        expect(EligibilityResult.safeParse(r).success, `${want}: an EligibilityResult`, r);
        expect(r.outcome === want, `the outcome is ${want}`, r.outcome);
        expect(r.rules_version.release_id === input.release_id && r.rules_version.content_hash === hash, "rules_version is the release and its hash", r.rules_version);
        expect(Array.isArray(r.scores) && r.disclaimer.length > 0, "scores is a list and the disclaimer is given", r);
      }
    },
  },
  {
    name: "a missing fact gives Possibly eligible with the fact named; a rule not met gives Not eligible with the rule named; Likely has no reason",
    async run() {
      const h = await make();
      const p = await h.port.assess(h.profiles.possibly), n = await h.port.assess(h.profiles.not), l = await h.port.assess(h.profiles.likely);
      expect(p.missing_facts.length > 0 && p.reasons.some((x) => x.kind === "FACT_MISSING"), "the missing fact is named, as a missing fact and a reason", p);
      expect(p.missing_facts.every((m) => p.reasons.some((x) => x.kind === "FACT_MISSING" && x.ref === m.key && x.role === m.role)), "each missing fact has its reason", p);
      expect(n.reasons.some((x) => x.kind === "GATE_NOT_MET"), "the rule not met is named", n);
      expect(l.reasons.length === 0 && l.missing_facts.length === 0, "Likely eligible has no reason and nothing missing", l);
    },
  },
  {
    name: "AS-2a: every rule read is a line with its state and source; Likely's lines are all met; Not eligible's failed rule is a not-met line",
    async run() {
      const h = await make();
      const l = await h.port.assess(h.profiles.likely), n = await h.port.assess(h.profiles.not), p = await h.port.assess(h.profiles.possibly);
      expect(l.rules.length > 0 && l.rules.every((x) => x.state === "met"), "Likely eligible: every rule line is met", l.rules);
      expect(n.reasons.filter((x) => x.kind === "GATE_NOT_MET").every((x) => n.rules.some((r) => r.ref === x.ref && r.role === x.role && r.state === "not_met")), "each rule not met is a not-met line", n);
      expect(p.missing_facts.length === 0 || p.rules.some((r) => r.state === "not_answered"), "a missing fact leaves its rule not answered", p.rules);
      expect(new Set(l.rules.map((r) => `${r.role}|${r.ref}`)).size === l.rules.length, "each rule once", l.rules);
    },
  },
  {
    name: "the same input gives the same result (byte-equal), and facts no rule reads change nothing",
    async run() {
      const h = await make(), a = await h.port.assess(h.profiles.likely), b = await h.port.assess(h.profiles.likely);
      expect(JSON.stringify(a) === JSON.stringify(b), "byte-equal", { a, b });
      const principal = h.profiles.likely.persons.find((x) => x.role === "principal")!;
      const extra = { release_id: h.profiles.likely.release_id, persons: [{ role: "principal" as const, known: { ...principal.known, "contract.no_rule_reads_this": "x" } }] };
      expect(JSON.stringify(await h.port.assess(extra)) === JSON.stringify(a), "an extra fact changes nothing", await h.port.assess(extra));
    },
  },
  {
    name: "an unknown release is a typed not-found, for requiredFacts and assess",
    async run() {
      const h = await make();
      await expectRefused(() => h.port.requiredFacts(UNKNOWN), "requiredFacts of an unknown release", notFound);
      await expectRefused(() => h.port.assess({ release_id: UNKNOWN, persons: [{ role: "principal", known: {} }] }), "assess on an unknown release", notFound);
      await expectRefused(() => h.port.assess({ release_id: "not-a-uuid", persons: [{ role: "principal", known: {} }] }), "assess on a malformed release id", notFound);
    },
  },
  {
    name: "another workspace's adapter does not list, read or assess this workspace's release",
    async run() {
      const h = await make(), id = h.profiles.likely.release_id;
      expect(!(await h.other.listAssessable()).some((x) => x.release_id === id), "not listed for the other workspace");
      await expectRefused(() => h.other.requiredFacts(id), "the other workspace's requiredFacts", notFound);
      await expectRefused(() => h.other.assess(h.profiles.likely), "the other workspace's assess", notFound);
    },
  },
  {
    name: "a malformed input is refused before any release is read: no principal, two principals",
    async run() {
      const h = await make(), id = h.profiles.likely.release_id;
      const zodError = (e: unknown) => e instanceof z.ZodError;
      await expectRefused(() => h.port.assess({ release_id: id, persons: [{ role: "spouse", known: {} }] }), "no principal", zodError);
      await expectRefused(() => h.port.assess({ release_id: id, persons: [{ role: "principal", known: {} }, { role: "principal", known: {} }] }), "two principals", zodError);
    },
  },
]);
