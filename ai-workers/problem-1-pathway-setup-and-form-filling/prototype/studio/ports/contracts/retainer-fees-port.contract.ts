// FO-7w1: RetainerFeesPort's contract (ports/retainer-fees.ts), run on its adapter (api/src/front-office/retainers/
// retainer-fees-port.ts) in tests/check_fo7w1_retainer_invoice.ts (P-606 (8): every adapter of a port passes one contract).
// The port file's sentences: read answers the firm's retainer by its id in the port's shape (kind, status, the signer or
// the company, and the CURRENT version's fee rows in their order); another firm's id, an unknown id and a string that is
// not an id read null; a firm id that is not one reads null, never throws; the read is the one the caller's transaction sees.
import { defineContract, expect } from "./contract.ts";
import { RetainerFees, type RetainerFeesPort } from "../retainer-fees.ts";

/** What a case needs: the port, a firm with one known retainer whose current version is not its first (`expected`, as
 *  the port must answer it), another firm, a transaction, and a change made in it that only that transaction sees. */
export type RetainerFeesHarness = {
  port: RetainerFeesPort<any>;   // eslint-disable-line @typescript-eslint/no-explicit-any -- the transaction type is the adapter's
  firmId: string;
  otherFirmId: string;
  expected: RetainerFees;
  /** Runs fn in a transaction that is then rolled back; `change(tx)` sets the retainer's status to `changedStatus` in it. */
  inTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T>;
  change(tx: unknown): Promise<void>;
  changedStatus: string;
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export const retainerFeesPortContract = defineContract("RetainerFeesPort", (make: () => Promise<RetainerFeesHarness> | RetainerFeesHarness) => [
  {
    name: "read answers the firm's retainer by its id, in the port's shape, with the current version's rows in order",
    async run() {
      const h = await make(), r = await h.port.read(undefined, h.firmId, h.expected.id);
      expect(RetainerFees.safeParse(r).success && same(r, h.expected), "the retainer, as expected (its rows in position order)", { r, expected: h.expected });
    },
  },
  {
    name: "the id is read in any letter case",
    async run() {
      const h = await make(), r = await h.port.read(undefined, h.firmId, h.expected.id.toUpperCase());
      expect(same(r, h.expected), "the same retainer", r);
    },
  },
  {
    name: "another firm's id, an unknown id and a string that is not an id read null",
    async run() {
      const h = await make();
      const got = [await h.port.read(undefined, h.otherFirmId, h.expected.id), await h.port.read(undefined, h.firmId, "00000000-0000-4000-8000-000000000000"), await h.port.read(undefined, h.firmId, "x")];
      expect(got.every((g) => g === null), "null, null, null", got);
    },
  },
  {
    name: "a firm id that is not one reads null, never throws",
    async run() {
      const h = await make(), got: unknown[] = [];
      for (const f of ["x", "", null as unknown as string]) got.push(await h.port.read(undefined, f, h.expected.id));
      expect(got.every((g) => g === null), "null for each", got);
    },
  },
  {
    name: "the read is the one the caller's transaction sees (a change made in it, not yet committed)",
    async run() {
      const h = await make();
      const r = await h.inTransaction(async (tx) => { await h.change(tx); return h.port.read(tx, h.firmId, h.expected.id); });
      expect(r?.status === h.changedStatus, `status ${h.changedStatus}, read in the transaction`, r);
      const after = await h.port.read(undefined, h.firmId, h.expected.id);
      expect(same(after, h.expected), "outside it, the retainer as before (rolled back)", after);
    },
  },
]);
