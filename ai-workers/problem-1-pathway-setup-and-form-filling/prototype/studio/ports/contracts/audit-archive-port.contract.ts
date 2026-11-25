// AUD-2 part 2 (P-606 (8)): AuditArchivePort's contract (ports/audit-archive.ts), run by the fake (fakeAuditArchive) and by
// the S3 Object Lock adapter on its recorded bucket (tests/check_aud2_archive.ts). The port file's rules: a put writes
// once (a taken key is refused, never replaced); a keep-until date not after now is refused; get returns the bytes as
// written with their sha256 and keep-until date, or null; list returns every key under a prefix, sorted; remove is
// refused inside the keep period and allowed after it; a key that is not lower-case path segments is refused.
import { defineContract, expect, expectRefused } from "./contract.ts";
import type { AuditArchivePort } from "../audit-archive.ts";

/** A fresh, empty store on its own clock; `advance` moves that clock forward. */
export type AuditArchiveHarness = { archive: AuditArchivePort; now(): Date; advance(ms: number): void };
const DAY = 86_400_000;

export const auditArchivePortContract = defineContract("AuditArchivePort", (make: () => AuditArchiveHarness) => [
  { name: "a put is read back as written, with its sha256 and keep-until date", run: async () => {
    const h = make(), until = new Date(h.now().getTime() + 30 * DAY), bytes = Buffer.from("line one\nline two\n");
    const { sha256 } = await h.archive.put("audit/c1/2026-11-25-1-2.jsonl", bytes, until);
    const o = await h.archive.get("audit/c1/2026-11-25-1-2.jsonl");
    expect(o && o.bytes.equals(bytes) && o.sha256 === sha256 && /^[0-9a-f]{64}$/.test(sha256) && o.retainUntil.getTime() >= until.getTime() - 1000, "get returns the bytes, the digest and the keep-until date", o && { sha: o.sha256, until: o.retainUntil });
    expect((await h.archive.get("audit/c1/none.jsonl")) === null, "a key never written reads as null");
  } },
  { name: "a key already written is refused and never replaced", run: async () => {
    const h = make(), until = new Date(h.now().getTime() + DAY);
    await h.archive.put("audit/c1/a.json", Buffer.from("first"), until);
    await expectRefused(() => h.archive.put("audit/c1/a.json", Buffer.from("second"), until), "a second put of one key", (e) => (e as Error).name === "ArchiveKeyExists");
    expect((await h.archive.get("audit/c1/a.json"))?.bytes.toString() === "first", "the first bytes stay");
  } },
  { name: "a keep-until date in the past or now is refused", run: async () => {
    const h = make();
    await expectRefused(() => h.archive.put("audit/c1/b.json", Buffer.from("x"), h.now()), "keep-until now", (e) => e instanceof RangeError);
    expect((await h.archive.list("audit/c1/")).length === 0, "nothing was written");
  } },
  { name: "remove is refused inside the keep period and allowed after it", run: async () => {
    const h = make();
    await h.archive.put("audit/c1/c.json", Buffer.from("kept"), new Date(h.now().getTime() + DAY));
    await expectRefused(() => h.archive.remove("audit/c1/c.json"), "a delete inside the keep period", (e) => (e as Error).name === "ArchiveRetained");
    expect((await h.archive.get("audit/c1/c.json"))?.bytes.toString() === "kept", "the object is still there");
    h.advance(DAY + 60_000);
    await h.archive.remove("audit/c1/c.json");
    expect((await h.archive.get("audit/c1/c.json")) === null, "after its keep period it can go");
  } },
  { name: "list returns every key under a prefix, sorted, and no other", run: async () => {
    const h = make(), until = new Date(h.now().getTime() + DAY);
    for (const k of ["audit/c2/b", "audit/c1/z", "audit/c2/a", "firms/x/y"]) await h.archive.put(k, Buffer.from(k), until);
    const l = await h.archive.list("audit/c2/");
    expect(l.join() === "audit/c2/a,audit/c2/b", "list by prefix, sorted", l);
  } },
  { name: "a key that is not lower-case path segments is refused", run: async () => {
    const h = make(), until = new Date(h.now().getTime() + DAY);
    for (const k of ["../x", "/abs", "Audit/X", "a//b", "a/../b"]) await expectRefused(() => h.archive.put(k, Buffer.from("x"), until), `key ${k}`);
  } },
]);
