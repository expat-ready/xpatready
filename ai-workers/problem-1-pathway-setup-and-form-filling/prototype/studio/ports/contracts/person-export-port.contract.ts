// PF-26 part 1: PersonExportPort's contract (ports/person-export.ts). Run by fakePersonExport and by the real registry
// PersonExportRegistry (api/src/platform/person-export/registry.ts): rules 1 and 2 of the port file, and the package's
// order and all-or-nothing build. exporterCases: rules 3 to 5 on one exporter (that one person of that firm only, every
// merged record, every declared section, deleted items marked), run by each module's own test with a harness that seeds
// the person, a family member and the same person's rows in another firm, each carrying its own marker text.
import { defineContract, expect, expectRefused, type ContractCase } from "./contract.ts";
import { buildPersonPackage, checkAnswer, ExporterFailed, PersonExportRefused, type ExportSubject, type PersonExporter, type PersonExportPort } from "../person-export.ts";

const FIRM = "11111111-1111-4111-8111-111111111111", PERSON = "22222222-2222-4222-8222-222222222222";
const SUBJECT: ExportSubject = { firmId: FIRM, personId: PERSON, records: [PERSON] };
const one = (module: string, section = "notes", items: Record<string, unknown>[] = []): PersonExporter =>
  ({ module, declares: [section], sections: async () => [{ name: section, title: "Notes", items: items as never }] });
const noTx = <T>(fn: (tx: unknown) => Promise<T>) => fn(undefined);
const NOW = new Date("2026-11-25T05:00:00.000Z");

export const personExportPortContract = defineContract("PersonExportPort", (make: () => PersonExportPort) => [
  {
    name: "exporters are listed in the order they registered, and the package follows that order",
    async run() {
      const p = make(); p.register(one("front-office")); p.register(one("case-side", "cases"));
      expect(p.exporters().map((e) => e.module).join() === "front-office,case-side", "registration order", p.exporters().map((e) => e.module));
      const pkg = await buildPersonPackage(p, noTx, SUBJECT, NOW);
      expect(pkg.modules.map((m) => m.module).join() === "front-office,case-side" && pkg.masked === false && pkg.personId === PERSON && pkg.generatedAt === NOW.toISOString(), "package order, unmasked", pkg);
    },
  },
  {
    name: "a module registers once; a second register is refused and the first kept, its name and sections fixed",
    async run() {
      const p = make(), first = one("front-office"); p.register(first);
      await expectRefused(() => p.register(one("front-office", "other")), "second register", (e) => e instanceof PersonExportRefused);
      Object.assign(first, { module: "renamed", declares: ["x"] });
      expect(p.exporters().length === 1 && p.exporters()[0].module === "front-office" && p.exporters()[0].declares.join() === "notes", "the first kept, fixed at registration", p.exporters());
    },
  },
  {
    name: "a bad name, no sections function, or a bad declaration is refused",
    async run() {
      const p = make();
      for (const bad of ["", "Front Office", "../x", "a".repeat(61)]) await expectRefused(() => p.register(one(bad)), `"${bad}"`, (e) => e instanceof PersonExportRefused);
      await expectRefused(() => p.register({ module: "no-fn", declares: ["a"] } as unknown as PersonExporter), "no sections function", (e) => e instanceof PersonExportRefused);
      for (const declares of [[], ["Notes"], ["a", "a"], "notes"]) await expectRefused(() => p.register({ module: "bad-declares", declares, sections: async () => [] } as unknown as PersonExporter), `declares ${JSON.stringify(declares)}`, (e) => e instanceof PersonExportRefused);
      expect(p.exporters().length === 0, "nothing registered");
    },
  },
  {
    name: "one exporter failing, or none registered, fails the whole build: no partial package",
    async run() {
      const p = make(); p.register(one("front-office"));
      p.register({ module: "case-side", declares: ["cases"], sections: async () => { throw new Error("Client B's file is unreadable"); } });
      let err: unknown; try { await buildPersonPackage(p, noTx, SUBJECT, NOW); } catch (e) { err = e; }
      expect(err instanceof ExporterFailed && err.module === "case-side" && !err.message.includes("Client B"), "the failing module named, its cause kept out of the message", String(err));
      await expectRefused(() => buildPersonPackage(make(), noTx, SUBJECT, NOW), "no exporter", (e) => e instanceof ExporterFailed);
    },
  },
  {
    name: "an answer outside the declaration (undeclared, twice, missing, not plain JSON, deleted not true) fails the build",
    async run() {
      const e = { module: "front-office", declares: ["notes", "calls"] };
      const ok = [{ name: "notes", title: "Notes", items: [] }, { name: "calls", title: "Calls", items: [] }];
      expect(checkAnswer(e, ok).length === 2, "a full answer passes");
      const bad: [string, unknown][] = [
        ["undeclared", [...ok, { name: "money", title: "Money", items: [] }]],
        ["twice", [...ok, ok[0]]],
        ["missing (an empty section is answered)", [ok[0]]],
        ["NaN", [ok[0], { ...ok[1], items: [{ n: Number.NaN }] }]],
        ["undefined", [ok[0], { ...ok[1], items: [{ n: undefined }] }]],
        ["deleted false", [ok[0], { ...ok[1], items: [{ deleted: false }] }]],
        ["not a list", { notes: [] }],
      ];
      for (const [what, answer] of bad) await expectRefused(() => checkAnswer(e, answer), what, (x) => x instanceof ExporterFailed);
    },
  },
  {
    name: "the subject's records start with the person and hold each once",
    async run() {
      const p = make(); p.register(one("front-office"));
      const other = "33333333-3333-4333-8333-333333333333";
      for (const records of [[other, PERSON], [PERSON, PERSON], []]) await expectRefused(() => buildPersonPackage(p, noTx, { ...SUBJECT, records }, NOW), `records ${records.length}`);
    },
  },
]);

/** What a module's test hands exporterCases: its exporter, a transaction runner in a firm's scope, and a seed (fresh per
 *  call) of one person whose rows carry `marker` (one of them deleted, carrying `deletedMarker`; one on an earlier record
 *  merged into the person, carrying `mergedMarker`), a family member's rows carrying `familyMarker`, and the same person's
 *  rows in another firm carrying `otherFirmMarker`. A module with nothing deletable or mergeable passes null for those. */
export type ExporterHarness<Tx> = {
  exporter: PersonExporter<Tx>;
  run<T>(firmId: string, fn: (tx: Tx) => Promise<T>): Promise<T>;
  seed(): Promise<{ subject: ExportSubject; marker: string; deletedMarker: string | null; mergedMarker: string | null; familyMarker: string; otherFirmMarker: string }>;
};

export function exporterCases<Tx>(make: () => Promise<ExporterHarness<Tx>>): ContractCase[] {
  return [
    {
      name: "answers every declared section, the person's own and merged rows, deleted ones marked; never a family member's or another firm's",
      async run() {
        const h = await make(), s = await h.seed();
        const sections = checkAnswer(h.exporter, await h.run(s.subject.firmId, (tx) => h.exporter.sections(tx, s.subject)));
        const text = JSON.stringify(sections);
        expect(text.includes(s.marker), "the person's rows are in it");
        if (s.mergedMarker) expect(text.includes(s.mergedMarker), "the merged record's rows are in it");
        if (s.deletedMarker) {
          const item = sections.flatMap((x) => x.items).find((i) => JSON.stringify(i).includes(s.deletedMarker!));
          expect(item?.deleted === true, "the deleted item is in it, marked deleted", item);
        }
        expect(!text.includes(s.familyMarker), "no family member's rows");
        expect(!text.includes(s.otherFirmMarker), "no other firm's rows");
      },
    },
    {
      name: "a person with no rows in this module still gets every declared section, empty",
      async run() {
        const h = await make(), s = await h.seed();
        const nobody = { ...s.subject, personId: "44444444-4444-4444-8444-444444444444", records: ["44444444-4444-4444-8444-444444444444"] };
        const sections = checkAnswer(h.exporter, await h.run(nobody.firmId, (tx) => h.exporter.sections(tx, nobody)));
        expect(sections.every((x) => x.items.length === 0), "every section empty", sections.map((x) => [x.name, x.items.length]));
      },
    },
  ];
}
