// AUD-5 part 1: KeepPeriodPort's contract (ports/keep-period.ts). Run by fakeKeepPeriods and by the real adapter
// KeepPeriods (api/src/platform/keep-period/service.ts). The port file's sentences: forFirm gives the firm's own number
// for closed client files, or null with "not set" (SA-11-33: no default); one firm's number never shows on another's
// read; a firm id that is not one is refused; check() is part 2 and refuses until then (no silent OK).
import { defineContract, expect, expectRefused } from "./contract.ts";
import type { KeepPeriodPort } from "../keep-period.ts";

/** What an adapter's test hands the contract: the port, two firms with no number yet, and a way to set one. */
export type KeepPeriodHarness = {
  port: KeepPeriodPort<unknown>;
  firmA: string;
  firmB: string;
  /** Sets a firm's number as its Owner would (the real adapter: through the settings write path). */
  set(firmId: string, years: number): Promise<void>;
  /** Puts both firms back to "not set". */
  clear(): Promise<void>;
};

export const keepPeriodPortContract = defineContract("KeepPeriodPort", (make: () => Promise<KeepPeriodHarness> | KeepPeriodHarness) => [
  {
    name: "a firm with no number reads null, \"not set\"",
    async run() {
      const h = await make(); await h.clear();
      const got = await h.port.forFirm(h.firmA);
      expect(got.closedClientFilesYears === null && got.source === "not set", "null and not set", got);
    },
  },
  {
    name: "a firm's number is read back as \"firm setting\"",
    async run() {
      const h = await make(); await h.clear();
      await h.set(h.firmA, 8);
      const got = await h.port.forFirm(h.firmA);
      expect(got.closedClientFilesYears === 8 && got.source === "firm setting", "8 years, firm setting", got);
    },
  },
  {
    name: "firm B's number never shows on firm A's read",
    async run() {
      const h = await make(); await h.clear();
      await h.set(h.firmB, 9);
      const a = await h.port.forFirm(h.firmA), b = await h.port.forFirm(h.firmB);
      expect(a.closedClientFilesYears === null && b.closedClientFilesYears === 9, "A not set, B 9", { a, b });
    },
  },
  {
    name: "a firm id that is not one is refused",
    async run() {
      const h = await make();
      await expectRefused(() => h.port.forFirm("sample-firm"), "forFirm(\"sample-firm\")");
    },
  },
  {
    name: "check() refuses until part 2 (no caller can take a silent OK)",
    async run() {
      const h = await make();
      await expectRefused(() => h.port.check(null, { firmId: h.firmA, class: "closed_client_file", startedAt: new Date(0), subject: "contract" }), "check()", (e) => e instanceof Error && e.name === "KeepCheckNotBuilt");
    },
  },
]);
