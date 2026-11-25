// PF-26 part 1 (R1.34; AG-2-93, SA-11-40; shape product/screens/PF-26/shape.md): PersonExportPort, its registry and the
// package. Each line a pass and a fail: the contract on fakePersonExport and PersonExportRegistry (order, a module once,
// bad names and declarations refused, one failing exporter fails the whole build, answers outside the declaration
// refused); the exporter rules (exporterCases) on a well-behaved in-memory exporter, and the same cases catching three
// broken ones (one that sweeps in a family member, one that drops a deleted item, one that leaves an empty section out);
// the package's bytes and hash; the feature file registers the registry. No database, no model call (US$0).
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf26_person_export_port.ts
import "reflect-metadata";
import { createHash } from "node:crypto";
import { runContract } from "../ports/contracts/contract.ts";
import { exporterCases, personExportPortContract, type ExporterHarness } from "../ports/contracts/person-export-port.contract.ts";
import { buildPersonPackage, fakePersonExport, packageBytes, PACKAGE_FORMAT, type ExportSubject, type PersonExporter } from "../ports/person-export.ts";

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const uuid = () => globalThis.crypto.randomUUID();

const { PersonExportRegistry } = await import("../api/src/platform/person-export/registry.ts");
const feature = (await import("../api/src/features/platform-person-export.ts")).default;

// ------------------------------------------------------------------- the port's contract (fake and registry)
const rFake = await runContract(personExportPortContract, "fakePersonExport", () => fakePersonExport(), ok);
const rReal = await runContract(personExportPortContract, "PersonExportRegistry", () => new PersonExportRegistry(), ok);
ok("PF-26 pass/fail (AG-2-93 rules 3, 4; Failure state): PersonExportPort's contract on fakePersonExport and PersonExportRegistry (order kept, a module once, bad names and declarations refused, one failing exporter fails the whole build, an answer outside the declaration refused)",
  [rFake, rReal].every((r) => r.failed.length === 0 && r.passed.length === 6), [rFake, rReal]);

// ------------------------------------------------------------------- the exporter rules on an in-memory module
type Row = { firm: string; person: string; text: string; deleted?: boolean };
type Flaw = "none" | "family" | "drops-deleted" | "omits-empty";
const harness = (flaw: Flaw) => async (): Promise<ExporterHarness<Row[]>> => {
  const rows: Row[] = [];
  const exporter: PersonExporter<Row[]> = {
    module: "test-module", declares: ["notes", "calls"],
    async sections(tx, s) {
      const mine = tx.filter((r) => r.firm === s.firmId && (s.records.includes(r.person) || (flaw === "family" && r.text.startsWith("family"))));
      const notes = mine.filter((r) => flaw !== "drops-deleted" || !r.deleted).map((r) => ({ text: r.text, ...(r.deleted ? { deleted: true as const } : {}) }));
      const out = [{ name: "notes", title: "Notes", items: notes }];
      return flaw === "omits-empty" ? out : [...out, { name: "calls", title: "Calls", items: [] }];
    },
  };
  return {
    exporter,
    run: async (_firm, fn) => fn(rows),
    async seed() {
      const firm = uuid(), other = uuid(), person = uuid(), merged = uuid(), family = uuid(), k = uuid().slice(0, 8);
      rows.push({ firm, person, text: `own ${k}` }, { firm, person, text: `gone ${k}`, deleted: true }, { firm, person: merged, text: `merged ${k}` },
        { firm, person: family, text: `family ${k}` }, { firm: other, person, text: `elsewhere ${k}` });
      const subject: ExportSubject = { firmId: firm, personId: person, records: [person, merged] };
      return { subject, marker: `own ${k}`, deletedMarker: `gone ${k}`, mergedMarker: `merged ${k}`, familyMarker: `family ${k}`, otherFirmMarker: `elsewhere ${k}` };
    },
  };
};
const runCases = async (flaw: Flaw) => {
  const res: { name: string; ok: boolean; why?: string }[] = [];
  for (const c of exporterCases(harness(flaw))) { try { await c.run(); res.push({ name: c.name, ok: true }); } catch (e) { res.push({ name: c.name, ok: false, why: String((e as Error).message) }); } }
  return res;
};
const good = await runCases("none");
ok("PF-26 pass (AG-2-93 rules 3, 4, 11; SA-11-40): exporterCases pass on a module that reads the person and the records merged into it, marks a deleted note, answers every declared section (an empty one too), and reads no family member and no other firm",
  good.length === 2 && good.every((r) => r.ok), good);
const family = await runCases("family"), dropped = await runCases("drops-deleted"), omits = await runCases("omits-empty");
ok("PF-26 fail (SA-11-40; AG-2-93 rules 4, 11): exporterCases catch a module that sweeps in a family member, one that leaves out a deleted note, and one that leaves out an empty section",
  !family[0].ok && /family/.test(family[0].why ?? "") && !dropped[0].ok && /deleted/.test(dropped[0].why ?? "") && omits.every((r) => !r.ok), { family, dropped, omits });

// ------------------------------------------------------------------- the package and its bytes
{
  const p = fakePersonExport<Row[]>(); const h = await harness("none")(); p.register(h.exporter);
  const s = await h.seed();
  const pkg = await buildPersonPackage(p, (fn) => h.run(s.subject.firmId, fn), s.subject, new Date("2026-11-25T05:00:00Z"));
  const { bytes, sha256 } = await packageBytes(pkg), text = new TextDecoder().decode(bytes);
  const back = JSON.parse(text);
  ok("PF-26 pass (AG-2-93 rule 10, JSON as built; SA-11-36 complete): the package is UTF-8 JSON naming its format, firm, person, both records, unmasked, with the module's sections; its hash is the sha256 of exactly those bytes",
    back.format === PACKAGE_FORMAT && back.personId === s.subject.personId && back.records.length === 2 && back.masked === false && back.modules[0].module === "test-module"
      && back.modules[0].sections.map((x: { name: string }) => x.name).join() === "notes,calls" && sha256 === createHash("sha256").update(bytes).digest("hex") && /^[0-9a-f]{64}$/.test(sha256), { back, sha256 });
  const again = await packageBytes(await buildPersonPackage(p, (fn) => h.run(s.subject.firmId, fn), s.subject, new Date("2026-11-25T05:00:00Z")));
  const later = await packageBytes(await buildPersonPackage(p, (fn) => h.run(s.subject.firmId, fn), s.subject, new Date("2026-11-25T05:00:01Z")));
  ok("PF-26 pass/fail: the same data at the same time gives the same bytes; another time gives another hash", again.sha256 === sha256 && later.sha256 !== sha256);
}

// ------------------------------------------------------------------- the feature file
ok("PF-26 pass/fail: the feature file registers PersonExportRegistry as a provider (modules inject it), no controller yet (part 2)",
  Array.isArray(feature.providers) && feature.providers.includes(PersonExportRegistry) && !("controllers" in feature), feature);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
