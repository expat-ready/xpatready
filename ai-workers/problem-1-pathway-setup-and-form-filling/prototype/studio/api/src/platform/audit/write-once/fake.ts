// AUD-2 part 1: the fake write-once archive (in memory), keeping every rule of AuditArchivePort (ports/audit-archive.ts);
// tests/check_pf11c_close.ts proves them. Out of ports/ because it needs node:crypto (via sha256.ts) and ports/ imports
// only zod (case-side contract v0.1 §1 rule 3; check_pf0p_ports.ts).
import { ArchiveKey, ArchiveKeyExists, ArchiveRetained, RetainUntil, type ArchivedObject, type AuditArchivePort } from "../../../../../ports/audit-archive.ts";
import { sha256Of } from "./sha256.ts";

/** The fake: in memory, on the caller's clock (a test moves it past retainUntil). `failPut` makes the next puts throw. */
export function fakeAuditArchive(now: () => Date): AuditArchivePort & { failPut: boolean } {
  // Private to the fake (break m3): only the four calls reach it, and every answer is a copy.
  const objects = new Map<string, ArchivedObject>();
  const self = {
    failPut: false,
    async put(key: string, bytes: Buffer, retainUntil: Date) {
      const k = ArchiveKey.parse(key), until = RetainUntil.parse(retainUntil);
      if (!Buffer.isBuffer(bytes)) throw new TypeError("archive: bytes must be a Buffer");
      if (until.getTime() <= now().getTime()) throw new RangeError("archive: a keep-until date in the past or now is refused");
      if (self.failPut) throw new Error("archive: the store did not answer (fake failPut)");
      if (objects.has(k)) throw new ArchiveKeyExists(k);
      const copy = Buffer.from(bytes), sha256 = sha256Of(copy);
      objects.set(k, Object.freeze({ key: k, bytes: copy, sha256, retainUntil: new Date(until.getTime()), writtenAt: now() }));
      return { sha256 };
    },
    async get(key: string) {
      const o = objects.get(ArchiveKey.parse(key));
      return o ? { ...o, bytes: Buffer.from(o.bytes), retainUntil: new Date(o.retainUntil.getTime()), writtenAt: new Date(o.writtenAt.getTime()) } : null;
    },
    async list(prefix: string) { return [...objects.keys()].filter((k) => k.startsWith(prefix)).sort(); },
    async remove(key: string) {
      const k = ArchiveKey.parse(key), o = objects.get(k);
      if (!o) return;
      if (now().getTime() < o.retainUntil.getTime()) throw new ArchiveRetained(k, o.retainUntil);
      objects.delete(k);
    },
  };
  return self;
}
