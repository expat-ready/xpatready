// FO-3a part 2a DW6: ConsultRecordPort's contract (ports/consult-record.ts). Run by fakeConsultRecords and by the adapter
// (api/src/front-office/booking/consult/port.ts) in tests/check_fo3a2_consult_record.ts (P-606 (8): a port's fake and real
// adapters pass the same contract). The port file's sentences: read answers the firm's record by its id in the port's
// shape, or null; another firm's id, an unknown id, a string that is not an id and a firm id that is not one all read
// null (never told apart, never thrown); the read inside a transaction is the one that transaction sees.
import { defineContract, expect } from "./contract.ts";
import { ConsultRecordRead, type ConsultRecordPort } from "../consult-record.ts";

/** What a contract case needs: the port, a firm with one known record (`expected`), another firm, and a transaction. */
export type ConsultRecordHarness = {
  port: ConsultRecordPort<any>;
  firmId: string;
  otherFirmId: string;
  expected: ConsultRecordRead;
  inTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T>;
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export const consultRecordPortContract = defineContract("ConsultRecordPort", (make: () => Promise<ConsultRecordHarness> | ConsultRecordHarness) => [
  {
    name: "read answers the firm's record by its id, in the port's shape (party, items, fee, booking)",
    async run() {
      const h = await make(), r = await h.port.read(undefined, h.firmId, h.expected.recordId);
      expect(ConsultRecordRead.safeParse(r).success && same(r, h.expected), "the record, as expected", { r, expected: h.expected });
    },
  },
  {
    name: "another firm's id, an unknown id and a string that is not an id read null",
    async run() {
      const h = await make();
      const got = [await h.port.read(undefined, h.otherFirmId, h.expected.recordId), await h.port.read(undefined, h.firmId, "00000000-0000-4000-8000-000000000000"), await h.port.read(undefined, h.firmId, "x")];
      expect(got.every((g) => g === null), "null, null, null", got);
    },
  },
  {
    name: "a firm id that is not one reads null, never throws",
    async run() {
      const h = await make(), got: unknown[] = [];
      for (const f of ["x", "", null as unknown as string]) got.push(await h.port.read(undefined, f, h.expected.recordId));
      expect(got.every((g) => g === null), "null for each", got);
    },
  },
  {
    name: "the read runs inside the caller's transaction",
    async run() {
      const h = await make(), r = await h.inTransaction((tx) => h.port.read(tx, h.firmId, h.expected.recordId));
      expect(same(r, h.expected), "the record, read in the transaction", r);
    },
  },
]);
