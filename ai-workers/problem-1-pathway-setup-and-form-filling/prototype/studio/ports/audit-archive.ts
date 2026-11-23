// AUD-2 part 1 (map rows 97 and 105; R1.105; SA-11-5, SA-11-6, SA-11-14; P-571 (3)): the write-once archive port
// (interface, key schema, errors). A store nobody can overwrite and nobody can delete from inside its keep period: what PF-11c's day-90 close
// writes first, and AUD-2's daily chain export writes later. The real adapter (S3 with Object Lock in compliance mode,
// `@aws-sdk/client-s3` through STANDARDS §1) is AUD-2's later part: until it exists nothing is wired, and a caller with no
// archive refuses its step (PF-11c raises firm_closure_blocked), never a silent pass.
//
// The rules every adapter keeps (the fake, `fakeAuditArchive` in api/src/platform/audit/write-once/fake.ts, proves them in
// tests/check_pf11c_close.ts; S3 compliance mode keeps them by itself):
// 1. put(key, bytes, retainUntil) writes once: a key already written is refused (ArchiveKeyExists), never replaced; a
//    retainUntil not after now is refused (RangeError).
// 2. remove(key) is refused while the clock is before the object's retainUntil (ArchiveRetained): deleting inside a keep
//    period is refused. retainUntil can never be shortened (no call changes it).
// 3. get(key) returns the bytes as written with their sha256 and retainUntil, or null.
// 4. list(prefix) returns every key under a prefix, sorted.
// This folder imports only zod and its own files (case-side contract v0.1 §1 rule 3); sha256Of and the fake, which need
// node:crypto, live in api/src/platform/audit/write-once/.
import { z } from "zod";

/** A key: lower-case path segments of letters, digits and . _ - (no "..", no leading "/"): `firms/<firmId>/closure-<seq>.jsonl`. */
export const ArchiveKey = z.string().max(400).regex(/^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/, "an archive key: lower-case path segments").refine((k) => !k.split("/").includes(".."), "no '..' segment");
export const RetainUntil = z.date().refine((d) => !Number.isNaN(d.getTime()) && d.getUTCFullYear() <= 9999, "a real date");

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
