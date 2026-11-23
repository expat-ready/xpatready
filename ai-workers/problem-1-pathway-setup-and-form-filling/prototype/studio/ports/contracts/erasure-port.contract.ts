// PF-21d part 1a: ErasurePort's contract (ports/erasure.ts). Run by fakeErasure and by the real registry ErasureRegistry
// (api/src/platform/erasure/registry.ts): rules 1 and 2 of the port file. eraserCases: rules 3 to 5 on one eraser, run
// by each module's own test with a harness that seeds a person in two firms.
import { defineContract, expect, expectRefused, type ContractCase } from "./contract.ts";
import { ErasureRefused, EraseOutcome, type Eraser, type ErasureOrder, type ErasurePort } from "../erasure.ts";

const noop = (module: string): Eraser => ({ module, erase: async () => ({ outcome: "NOTHING", note: "no rows" }) });

export const erasurePortContract = defineContract("ErasurePort", (make: () => ErasurePort) => [
  {
    name: "erasers are listed in the order they registered",
    async run() {
      const p = make(); p.register(noop("front-office")); p.register(noop("platform.messages"));
      expect(p.erasers().map((e) => e.module).join() === "front-office,platform.messages", "registration order", p.erasers().map((e) => e.module));
    },
  },
  {
    name: "a module registers once; a second register is refused and the first kept",
    async run() {
      const p = make(), first = noop("front-office"); p.register(first);
      await expectRefused(() => p.register(noop("front-office")), "second register", (e) => e instanceof ErasureRefused);
      expect(p.erasers().length === 1 && p.erasers()[0] === first, "the first kept");
    },
  },
  {
    name: "a name that is not a module name is refused",
    async run() {
      const p = make();
      for (const bad of ["", "Front Office", "../x", "a".repeat(61)]) await expectRefused(() => p.register(noop(bad)), `"${bad}"`, (e) => e instanceof ErasureRefused);
      expect(p.erasers().length === 0, "nothing registered");
    },
  },
]);

/** What a module's test hands eraserCases: its eraser, a transaction runner in a firm's scope, and two firms each holding
 *  the same person's rows (seeded fresh per call) with a counter of that person's rows. */
export type EraserHarness<Tx> = {
  eraser: Eraser<Tx>;
  run<T>(firmId: string, fn: (tx: Tx) => Promise<T>): Promise<T>;
  seed(): Promise<{ order: ErasureOrder; otherFirmOrder: ErasureOrder; otherPersonId: string }>;
  rowsOf(firmId: string, personId: string): Promise<number>;
};

export function eraserCases<Tx>(make: () => Promise<EraserHarness<Tx>>): ContractCase[] {
  return [
    {
      name: "erases the person's rows in that firm only: another firm's and another person's rows stay",
      async run() {
        const h = await make(), s = await h.seed();
        const out = EraseOutcome.parse(await h.run(s.order.firmId, (tx) => h.eraser.erase(tx, s.order)));
        expect(out.outcome !== "NOTHING", "something erased or kept", out);
        expect(await h.rowsOf(s.order.firmId, s.order.personId) === 0, "the person's rows gone");
        expect(await h.rowsOf(s.otherFirmOrder.firmId, s.otherFirmOrder.personId) > 0, "the other firm's rows stay");
        expect(await h.rowsOf(s.order.firmId, s.otherPersonId) > 0, "another person's rows stay");
      },
    },
    {
      name: "a second call for the same order answers NOTHING",
      async run() {
        const h = await make(), s = await h.seed();
        await h.run(s.order.firmId, (tx) => h.eraser.erase(tx, s.order));
        const again = EraseOutcome.parse(await h.run(s.order.firmId, (tx) => h.eraser.erase(tx, s.order)));
        expect(again.outcome === "NOTHING", "NOTHING the second time", again);
      },
    },
  ];
}
