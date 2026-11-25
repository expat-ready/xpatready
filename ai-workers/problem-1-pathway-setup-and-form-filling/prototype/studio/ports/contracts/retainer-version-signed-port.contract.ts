// R1.60 a2 (gap G5, rules.md R17): RetainerVersionSignedPort's contract (ports/retainer-signed.ts). Run by
// fakeRetainerVersionSigned and by PgRetainerVersionSigned (api/src/front-office/retainers/signed-hooks.ts) in
// tests/check_r160_prepared_act.ts. The port file's sentences: true only while the version is its retainer's current one
// and the retainer is signed; an undone retainer answers false; another firm's version or an unknown id is false.
import { defineContract, expect } from "./contract.ts";
import type { RetainerVersionSignedPort } from "../retainer-signed.ts";

/** What a case may do: make a signed retainer version of `firm` (its id), undo its signing, and name another firm. */
export type RetainerVersionSignedHarness = {
  port: RetainerVersionSignedPort;
  firm: string;
  otherFirm: string;
  signedVersion(): Promise<string>;
  undo(versionId: string): Promise<void>;
};

export const retainerVersionSignedPortContract = defineContract("RetainerVersionSignedPort", (make: () => Promise<RetainerVersionSignedHarness> | RetainerVersionSignedHarness) => [
  { name: "a signed version answers true", async run() { const h = await make(), v = await h.signedVersion(); expect(await h.port.versionSigned(h.firm, v), "the signed version is signed"); } },
  { name: "a signed version undone answers false", async run() { const h = await make(), v = await h.signedVersion(); await h.undo(v); expect(!(await h.port.versionSigned(h.firm, v)), "the undone version is not signed"); } },
  { name: "another firm's version, or an unknown id, answers false (never an error)", async run() {
    const h = await make(), v = await h.signedVersion();
    expect(!(await h.port.versionSigned(h.otherFirm, v)), "firm B does not see firm A's version as signed");
    expect(!(await h.port.versionSigned(h.firm, "00000000-0000-4000-8000-00000000dead")), "an unknown id is not signed");
  } },
]);
