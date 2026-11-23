// AUD-2 part 1 (map rows 97 and 105; R1.105; SA-11-5, SA-11-6, SA-11-14; P-571 (3)): the write-once archive port, interface
// and fake. A store nobody can overwrite and nobody can delete from inside its keep period: what PF-11c's day-90 close
// writes first, and AUD-2's daily chain export writes later. The real adapter (S3 with Object Lock in compliance mode,
// `@aws-sdk/client-s3` through STANDARDS §1) is AUD-2's later part: until it exists nothing is wired, and a caller with no
// archive refuses its step (PF-11c raises firm_closure_blocked), never a silent pass.
//
// The rules every adapter keeps (the fake proves them in tests/check_pf11c_close.ts; S3 compliance mode keeps them by itself):
// 1. put(key, bytes, retainUntil) writes once: a key already written is refused (ArchiveKeyExists), never replaced.
// 2. remove(key) is refused while the clock is before the object's retainUntil (ArchiveRetained): deleting inside a keep
//    period is refused. retainUntil can never be shortened (no call changes it).
// 3. get(key) returns the bytes as written with their sha256 and retainUntil, or null.
// 4. list(prefix) returns every key under a prefix, sorted.
// This folder imports only zod, node:crypto and its own files (case-side contract v0.1 §1 rule 3).
import { createHash } from "node:crypto";
import { z } from "zod";

/** A key: lower-case path segments of letters, digits and . _ - (no "..", no leading "/"): `firms/<firmId>/closure-<seq>.jsonl`. */
export const ArchiveKey = z.string().max(400).regex(/^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/, "an archive key: lower-case path segments").refine((k) => !k.split("/").includes(".."), "no '..' segment");
const RetainUntil = z.date().refine((d) => !Number.isNaN(d.getTime()) && d.getUTCFullYear() <= 9999, "a real date");

export type ArchivedObject = { key: string; bytes: Buffer; sha256: string; retainUntil: Date; writtenAt: Date };

export class ArchiveKeyExists extends Error {
  constructor(readonly key: string) { super(`archive: ${key} is already written; a key is never replaced`); this.name = "ArchiveKeyExists"; }
}
export class ArchiveRetained extends Error {
  constructor(readonly key: string, readonly retainUntil: Date) { super(`archive: ${key} is kept until ${retainUntil.toISOString()}; it cannot be deleted inside its keep period`); this.name = "ArchiveRetained"; }
}

export interface AuditArchivePort {
  put(key: string, bytes: Buffer, retainUntil: Date): Promise<{ sha256: string }>;
  get(key: string): Promise<ArchivedObject | null>;
  list(prefix: string): Promise<string[]>;
  remove(key: string): Promise<void>;
}

export const sha256Of = (b: Buffer) => createHash("sha256").update(b).digest("hex");

/** The fake: in memory, on the caller's clock (a test moves it past retainUntil). `failPut` makes the next puts throw. */
export function fakeAuditArchive(now: () => Date): AuditArchivePort & { objects: Map<string, ArchivedObject>; failPut: boolean } {
  const objects = new Map<string, ArchivedObject>();
  const self = {
    objects, failPut: false,
    async put(key: string, bytes: Buffer, retainUntil: Date) {
      const k = ArchiveKey.parse(key), until = RetainUntil.parse(retainUntil);
      if (!Buffer.isBuffer(bytes)) throw new TypeError("archive: bytes must be a Buffer");
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
