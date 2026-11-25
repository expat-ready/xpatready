// FO-14 part A: PortalActivityPort's contract (ports/portal-activity.ts). Run by fakePortalActivity
// (ports/fakes/portal-activity.fake.ts) and by PgPortalActivity (api/src/front-office/activity/adapter.ts) in
// tests/check_fo14_activity.ts. The port file's sentences: an event recorded in the caller's transaction is read back,
// newest first, with its kind, case, source and a time; another firm's events never appear; another firm's person is
// refused and nothing is kept; a bad kind, source or unknown field is refused; `limit` caps the read.
import { defineContract, expect, expectRefused } from "./contract.ts";
import { PortalActivityRefused, type PortalActivityPort } from "../portal-activity.ts";

/** A firm A and a firm B, a new person of either (`person`), and `inFirm`, which runs `fn` as that firm in a transaction
 *  (the fake's is no transaction at all). */
export type PortalActivityHarness = {
  port: PortalActivityPort;
  firmA: string; firmB: string;
  person(firmId: string): Promise<string>;
  inFirm<T>(firmId: string, fn: (tx: unknown) => Promise<T>): Promise<T>;
  read<T>(firmId: string, fn: () => Promise<T>): Promise<T>;
};

const refused = (e: unknown) => e instanceof PortalActivityRefused;
const CASE = "00000000-0000-4000-8000-0000000000c1";

export const portalActivityPortContract = defineContract("PortalActivityPort", (make: () => Promise<PortalActivityHarness> | PortalActivityHarness) => [
  {
    name: "an event recorded in the caller's transaction is read back, newest first, with its kind, case, source and time",
    async run() {
      const h = await make(), p = await h.person(h.firmA);
      await h.inFirm(h.firmA, (tx) => h.port.record(tx, { firmId: h.firmA, personId: p, kind: "VIEW", source: "signing" }));
      await h.inFirm(h.firmA, (tx) => h.port.record(tx, { firmId: h.firmA, personId: p, kind: "PAID", caseId: CASE, source: "pay-link", sourceRef: "link-1" }));
      const r = await h.read(h.firmA, () => h.port.recent(h.firmA, p, 10));
      expect(r.length === 2 && r[0].kind === "PAID" && r[0].caseId === CASE && r[0].source === "pay-link" && r[1].kind === "VIEW" && r[1].caseId === null, "two events, newest first", r);
      expect(r.every((e) => e.at instanceof Date) && r[0].at.getTime() >= r[1].at.getTime(), "each has a time, newest first", r);
      expect(Object.keys(r[0]).sort().join() === "at,caseId,kind,source", "only kind, caseId, source and at", r[0]);
    },
  },
  {
    name: "another firm's events never appear",
    async run() {
      const h = await make(), a = await h.person(h.firmA), b = await h.person(h.firmB);
      await h.inFirm(h.firmB, (tx) => h.port.record(tx, { firmId: h.firmB, personId: b, kind: "SIGNED", source: "signing" }));
      const asA = await h.read(h.firmA, () => h.port.recent(h.firmA, b, 10)), own = await h.read(h.firmA, () => h.port.recent(h.firmA, a, 10));
      expect(asA.length === 0 && own.length === 0, "firm A reads none of firm B's person's events", { asA, own });
      const asB = await h.read(h.firmB, () => h.port.recent(h.firmB, b, 10));
      expect(asB.length === 1 && asB[0].kind === "SIGNED", "firm B reads its own", asB);
    },
  },
  {
    name: "another firm's person is refused and nothing is kept",
    async run() {
      const h = await make(), b = await h.person(h.firmB);
      await expectRefused(() => h.inFirm(h.firmA, (tx) => h.port.record(tx, { firmId: h.firmA, personId: b, kind: "VIEW", source: "signing" })), "firm A records an event for firm B's person", refused);
      const r = await h.read(h.firmA, () => h.port.recent(h.firmA, b, 10));
      expect(r.length === 0, "nothing kept", r);
    },
  },
  {
    name: "a bad kind, a bad source or an unknown field is refused",
    async run() {
      const h = await make(), p = await h.person(h.firmA);
      for (const bad of [{ kind: "OPENED", source: "signing" }, { kind: "VIEW", source: "Signing door" }, { kind: "VIEW", source: "" }, { kind: "VIEW", source: "signing", extra: 1 }])
        await expectRefused(() => h.inFirm(h.firmA, (tx) => h.port.record(tx, { firmId: h.firmA, personId: p, ...bad } as never)), `refused: ${JSON.stringify(bad)}`, refused);
      expect((await h.read(h.firmA, () => h.port.recent(h.firmA, p, 10))).length === 0, "nothing kept");
    },
  },
  {
    name: "limit caps the read to the newest events",
    async run() {
      const h = await make(), p = await h.person(h.firmA);
      for (const kind of ["SIGN_IN", "VIEW", "UPLOAD"] as const) await h.inFirm(h.firmA, (tx) => h.port.record(tx, { firmId: h.firmA, personId: p, kind, source: "portal" }));
      const r = await h.read(h.firmA, () => h.port.recent(h.firmA, p, 2));
      expect(r.length === 2 && r[0].kind === "UPLOAD" && r[1].kind === "VIEW", "the newest two", r);
    },
  },
]);
