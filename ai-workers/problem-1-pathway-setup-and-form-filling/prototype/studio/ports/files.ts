// PF-0p (rows rev 16): the file store port (documents, signed copies, uploads). Every file belongs to one firm; another
// firm's key reads as absent. A key is written once: the same bytes and type again are accepted (a retry), other bytes
// or another type are refused, so a stored document never changes under its key. FO-5 builds the real adapter. This
// folder imports only zod and its own files (sha256 by the platform's Web Crypto, a global: no import).
import { z } from "zod";
import { FirmId } from "./audit.ts";

/** A file key: lower-case path segments (`retainers/<id>/v1.pdf`), no `..`, no leading or trailing slash. */
export const FileKey = z.string().max(300).regex(/^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/, "lower-case path segments").refine((k) => !k.split("/").some((s) => s === ".." || s === "."), "no . or .. segment");
/** PF-Fw: the largest file the port stores or reads, in bytes: SA-8-58 (SA8-D32, R32), "Upload size limits are built
 *  constants — 25 MB for documents, 10 MB for images"; the larger of the two. SA-8-58 names upload limits: applying the
 *  number to every stored file (generated renders, mail attachments too) is this row's inference (PF-Fw review m4), not a
 *  source. The same number as
 *  api/src/platform/files/file-type.ts `MAX_BYTES.document` (tests/check_pffw_files_limits.ts keeps them equal). Every
 *  adapter reads this one constant: a put over it is refused before any adapter stores a byte, and S3's get checks an
 *  object's size against it before reading the object into memory. */
export const FILE_MAX_BYTES = 25 * 1024 * 1024;
/** The bytes' real length: %TypedArray%.prototype.byteLength, which an own property, a subclass's getter or a Proxy
 *  cannot fake (a Proxy throws: break m1). */
const typedLength = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), "byteLength")!.get!;
const realLength = (b: Uint8Array): number => typedLength.call(b) as number;
/** ES2024's String.prototype.isWellFormed (Node 20+; this project's TypeScript lib is es2023): no lone surrogate. */
const isWellFormed = (s: string): boolean => (String.prototype as unknown as { isWellFormed(this: string): boolean }).isWellFormed.call(s);
/** PF-Fw: the longest content type, in UTF-8 bytes: S3's adapter keeps the exact type in object metadata (base64url,
 *  2 KB of metadata in all), so 768 bytes is the most every adapter can keep (break m6). */
export const TYPE_MAX_BYTES = 768;
/** PF-Fw: a content type is well formed: no lone surrogate (it cannot be written as UTF-8, so no adapter could keep it
 *  exactly), no control character (Unicode's Cc: C0, DEL and C1, so also CSI U+009B; a header, a log line or a terminal
 *  would carry it; a tab too, review m1 and break m4), no line or paragraph separator (U+2028, U+2029: a line break to
 *  JavaScript), and at most TYPE_MAX_BYTES. */
export const wellFormedType = (t: string): boolean => isWellFormed(t) && !/[\p{Cc}\u2028\u2029]/u.test(t) && new TextEncoder().encode(t).byteLength <= TYPE_MAX_BYTES;
export const FilePut = z.strictObject({
  firmId: FirmId,
  key: FileKey,
  bytes: z.instanceof(Uint8Array).refine((b) => realLength(b) <= FILE_MAX_BYTES, `at most ${FILE_MAX_BYTES} bytes`),
  contentType: z.string().regex(/^[\w.+-]+\/[\w.+-]+(;.*)?$/, "a media type").refine(wellFormedType, "well formed: no lone surrogate, no control character"),
});
export type FilePut = z.infer<typeof FilePut>;

export type StoredFile = { key: string; bytes: Uint8Array; contentType: string; sha256: string };

export interface FilesPort {
  /** Stores `bytes` under the firm's `key`; resolves with the key and the bytes' sha256 (lower-case hex). */
  put(firmId: string, key: string, bytes: Uint8Array, contentType: string): Promise<{ key: string; sha256: string }>;
  /** The firm's file, or null (also for another firm's key). */
  get(firmId: string, key: string): Promise<StoredFile | null>;
  exists(firmId: string, key: string): Promise<boolean>;
  /** PF-Fd: removes the firm's file. The caller has already asked `LegalHoldPort.isHeld` (PF-21b) in the same transaction that marks
   *  its record disposed, and been told not held (SA-11 BR-7: a hold beats any deletion); this port does not check holds (it has no
   *  transaction). The order for callers: commit the record's change first (marked disposed, still naming the key and its
   *  sha256), then call `delete`; a failed or skipped delete leaves bytes with no live record, which a later cleanup
   *  (PF-F2) removes. A caller never deletes and then rolls back. `deleted: false` (no error, nothing changed) when the key
   *  is absent, already deleted or another firm's (the firm wall: a refusal would tell firm B the key exists). A deleted
   *  key is retired: a later `put` of it is refused (FileKeyTaken) even with the same bytes and type, so a sha256 kept
   *  as proof never points at other bytes. A bad key or firm id is refused as in `put`. */
  delete(firmId: string, key: string): Promise<{ deleted: boolean }>;
  /** PF-15 (SA-3-40): the bytes the firm's stored files take now: every live file's bytes, a deleted (retired) key's not
   *  (its bytes are gone). Another firm's files never count. A malformed firm id is refused. */
  usedBytes(firmId: string): Promise<number>;
}

/** Refused: the key already holds other bytes or another content type. */
export class FileKeyTaken extends Error {
  constructor(readonly key: string) { super(`file key ${key} already holds other content`); this.name = "FileKeyTaken"; }
}

/** PF-Fw: refused: the bytes are over FILE_MAX_BYTES (a put), or the stored object is (S3's get). Nothing is stored or read. */
export class FileTooLarge extends Error {
  constructor(readonly bytes: number, readonly max = FILE_MAX_BYTES) { super(`a file is at most ${max} bytes; this one is ${bytes}`); this.name = "FileTooLarge"; }
}
/** PF-Fw: refused: the content type has a lone surrogate or a control character. */
export class FileTypeMalformed extends Error {
  constructor() { super("a content type may not hold a lone surrogate or a control character"); this.name = "FileTypeMalformed"; }
}

/** PF-Fw: the one check of a put, which every adapter (and the fake) calls before it touches its store: an oversized put
 *  is refused with FileTooLarge and a malformed content type with FileTypeMalformed (named errors); any other bad field
 *  is refused by FilePut as before (a ZodError). The size is the bytes' real length, and the answer holds a copy of
 *  exactly the bytes checked, taken at once: a faked byteLength or a buffer that grows after the check never reaches a
 *  store (break m1, m2). */
export function parseFilePut(input: { firmId: string; key: string; bytes: Uint8Array; contentType: string }): FilePut {
  let bytes: Uint8Array | undefined;
  if (input?.bytes instanceof Uint8Array) {
    const n = realLength(input.bytes);
    if (n > FILE_MAX_BYTES) throw new FileTooLarge(n);
    bytes = new Uint8Array(n); bytes.set(input.bytes);   // a plain Uint8Array (never a subclass) of the checked bytes
  }
  if (typeof input?.contentType === "string" && !wellFormedType(input.contentType)) throw new FileTypeMalformed();
  return FilePut.parse(bytes ? { ...input, bytes } : input);
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new Uint8Array(bytes)));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The fake: in memory, per firm, write-once like the real store; a deleted key is retired. */
export function fakeFiles(): FilesPort & { readonly count: number } {
  const store = new Map<string, StoredFile>(), retired = new Set<string>();
  const id = (firmId: string, key: string) => `${FirmId.parse(firmId).toLowerCase()}|${FileKey.parse(key)}`;
  return {
    async put(firmId, key, bytes, contentType) {
      const p = parseFilePut({ firmId, key, bytes, contentType });
      const sha256 = await sha256Hex(p.bytes), at = id(p.firmId, p.key), had = store.get(at);
      if (retired.has(at)) throw new FileKeyTaken(p.key);
      if (had && (had.sha256 !== sha256 || had.contentType !== p.contentType)) throw new FileKeyTaken(p.key);
      if (!had) store.set(at, { key: p.key, bytes: new Uint8Array(p.bytes), contentType: p.contentType, sha256 });
      return { key: p.key, sha256 };
    },
    async get(firmId, key) { const f = store.get(id(firmId, key)); return f ? { ...f, bytes: new Uint8Array(f.bytes) } : null; },
    async exists(firmId, key) { return store.has(id(firmId, key)); },
    async delete(firmId, key) {
      const at = id(firmId, key);
      if (!store.delete(at)) return { deleted: false };
      retired.add(at);
      return { deleted: true };
    },
    async usedBytes(firmId) { const p = `${FirmId.parse(firmId).toLowerCase()}|`; let n = 0; for (const [k, f] of store) if (k.startsWith(p)) n += f.bytes.byteLength; return n; },
    get count() { return store.size; },
  };
}
