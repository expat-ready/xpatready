// PF-11 part 1: FirmExportPort's contract (ports/firm-export.ts), run by fakeFirmExport and PgFirmExport in
// tests/check_pf11_firm_export.ts. The port file's sentences: a registered module appears in collect, in registration
// order; a module registers once; a row of another firm, a short row or a cell of the wrong kind is refused.
import { defineContract, expect, expectRefused } from "./contract.ts";
import { FirmExportRefused, type FirmExportPort } from "../firm-export.ts";

/** A fresh port each call, and two firm ids the adapter may read as (`firmId` has rows; `otherFirmId` is another firm). */
export type FirmExportHarness = { port: FirmExportPort<unknown>; firmId: string; otherFirmId: string };

const section = (firmId: string, rows: unknown[][] = [[firmId, "Row one", 3]]) => ({
  key: "items", title: "Items", columns: [{ key: "firm_id", kind: "text" as const }, { key: "name", kind: "text" as const }, { key: "count", kind: "number" as const }], rows: rows as never,
});
const refused = (e: unknown) => e instanceof FirmExportRefused;

export const firmExportPortContract = defineContract("FirmExportPort", (make: () => Promise<FirmExportHarness> | FirmExportHarness) => [
  {
    name: "a test module registers and appears in collect, after the modules before it, with its sections and files",
    async run() {
      const h = await make();
      h.port.register("test-a", async (f) => ({ module: "test-a", sections: [section(f)] }));
      h.port.register("test-b", async () => ({ module: "test-b", sections: [], files: [], words: "Nothing here yet." }));
      const out = await h.port.collect(h.firmId);
      expect(h.port.modules().join() === "test-a,test-b" && out.map((m) => m.module).join() === "test-a,test-b", "both modules, in order", h.port.modules());
      expect(out[0].sections[0].rows.length === 1 && out[1].files.length === 0 && out[1].words === "Nothing here yet.", "the sections, files and words as answered", out);
    },
  },
  {
    name: "a module registers once",
    async run() {
      const h = await make(), ex = async () => ({ module: "twice", sections: [] });
      h.port.register("twice", ex);
      await expectRefused(() => h.port.register("twice", ex), "a second exporter under one name", refused);
    },
  },
  {
    name: "a section holding a row of another firm is refused",
    async run() {
      const h = await make();
      h.port.register("leaky", async (f) => ({ module: "leaky", sections: [section(f, [[f, "Mine", 1], [h.otherFirmId, "Theirs", 2]])] }));
      await expectRefused(() => h.port.collect(h.firmId), "another firm's row", refused);
    },
  },
  {
    name: "a row shorter than its columns, or a number column holding text, is refused",
    async run() {
      const h = await make(), g = await make();
      h.port.register("short", async (f) => ({ module: "short", sections: [section(f, [[f, "No count"]])] }));
      g.port.register("typed", async (f) => ({ module: "typed", sections: [section(f, [[f, "Text count", "3"]])] }));
      await expectRefused(() => h.port.collect(h.firmId), "a short row", refused);
      await expectRefused(() => g.port.collect(g.firmId), "text in a number column", refused);
    },
  },
]);
