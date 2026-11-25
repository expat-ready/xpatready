// PF-0c: FilesPort's contract (ports/files.ts). Run by fakeFiles and by LocalFiles (api/src/front-office/files.ts).
// The port file's sentences: every file belongs to one firm and another firm's key reads as absent; a key is written
// once (the same bytes and type again are accepted as a retry; other bytes or another type are refused with
// FileKeyTaken), so a stored document never changes under its key; put answers the key and the bytes' sha256 (lower-case
// hex); a key is lower-case path segments with no `.` or `..` segment. PF-Fd: delete answers deleted true once, then false
// (also for another firm's key); a deleted key is retired (put refused, even with the same bytes); bad keys are refused.
// PF-15: usedBytes is the firm's live bytes: a retry adds nothing, a deleted key stops counting, another firm's never counts.
import { defineContract, expect, expectRefused } from "./contract.ts";
import { FileKeyTaken, sha256Hex, type FilesPort } from "../files.ts";

const FIRM_A = "0c0c0c0c-0000-4000-8000-0000000000a1", FIRM_B = "0c0c0c0c-0000-4000-8000-0000000000b2";
const bytesOf = (s: string) => new TextEncoder().encode(s);
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

/** `make` gives an empty store each call. */
export const filesPortContract = defineContract("FilesPort", (make: () => Promise<FilesPort> | FilesPort) => [
  {
    name: "a stored file reads back with its bytes, type and sha256 (lower-case hex), and exists",
    async run() {
      const f = await make(), body = bytesOf("retainer v1");
      const put = await f.put(FIRM_A, "retainers/r-1/v1.pdf", body, "application/pdf");
      expect(put.key === "retainers/r-1/v1.pdf" && put.sha256 === await sha256Hex(body) && /^[0-9a-f]{64}$/.test(put.sha256), "put answers the key and the sha256", put);
      const got = await f.get(FIRM_A, "retainers/r-1/v1.pdf");
      expect(got && same(got.bytes, body) && got.contentType === "application/pdf" && got.sha256 === put.sha256 && got.key === put.key, "get gives the same file", got && { ...got, bytes: got.bytes.length });
      expect(await f.exists(FIRM_A, "retainers/r-1/v1.pdf") === true, "exists answers true");
    },
  },
  {
    name: "another firm's key reads as absent (get null, exists false)",
    async run() {
      const f = await make();
      await f.put(FIRM_A, "docs/a.txt", bytesOf("firm A only"), "text/plain");
      expect(await f.get(FIRM_B, "docs/a.txt") === null, "firm B gets null");
      expect(await f.exists(FIRM_B, "docs/a.txt") === false, "firm B: exists false");
      expect(await f.get(FIRM_A, "docs/never.txt") === null && await f.exists(FIRM_A, "docs/never.txt") === false, "a key never written is absent too");
    },
  },
  {
    name: "a key is write-once: the same bytes and type again are a retry, other bytes or another type are refused (FileKeyTaken)",
    async run() {
      const f = await make(), body = bytesOf("signed copy");
      const first = await f.put(FIRM_A, "signed/s-1.pdf", body, "application/pdf");
      const retry = await f.put(FIRM_A, "signed/s-1.pdf", bytesOf("signed copy"), "application/pdf");
      expect(retry.sha256 === first.sha256, "the same bytes again are accepted", retry);
      await expectRefused(() => f.put(FIRM_A, "signed/s-1.pdf", bytesOf("other bytes"), "application/pdf"), "other bytes under the key", (e) => e instanceof FileKeyTaken);
      await expectRefused(() => f.put(FIRM_A, "signed/s-1.pdf", body, "text/plain"), "another type under the key", (e) => e instanceof FileKeyTaken);
      const got = await f.get(FIRM_A, "signed/s-1.pdf");
      expect(got && same(got.bytes, body) && got.contentType === "application/pdf", "the stored file never changed", got && { contentType: got.contentType, bytes: got.bytes.length });
    },
  },
  {
    name: "the same key in another firm is that firm's own file",
    async run() {
      const f = await make();
      await f.put(FIRM_A, "shared/name.txt", bytesOf("A"), "text/plain");
      await f.put(FIRM_B, "shared/name.txt", bytesOf("B"), "text/plain");
      const a = await f.get(FIRM_A, "shared/name.txt"), b = await f.get(FIRM_B, "shared/name.txt");
      expect(a && b && new TextDecoder().decode(a.bytes) === "A" && new TextDecoder().decode(b.bytes) === "B", "each firm reads its own bytes");
    },
  },
  {
    name: "changing the bytes after put, or the bytes get returned, never changes the stored file",
    async run() {
      const f = await make(), body = bytesOf("original");
      await f.put(FIRM_A, "copy/c.txt", body, "text/plain");
      body[0] = 0x58;
      const got = await f.get(FIRM_A, "copy/c.txt");
      expect(got && new TextDecoder().decode(got.bytes) === "original", "put kept its own copy");
      got!.bytes[0] = 0x59;
      const again = await f.get(FIRM_A, "copy/c.txt");
      expect(again && new TextDecoder().decode(again.bytes) === "original", "get gave a copy");
    },
  },
  {
    name: "a key with a `..` segment, upper case or a leading slash, or a firm id that is not a uuid, is refused",
    async run() {
      const f = await make(), b = bytesOf("x");
      for (const key of ["../escape.txt", "a/../../b.txt", "Upper/Case.txt", "/leading.txt"]) await expectRefused(() => f.put(FIRM_A, key, b, "text/plain"), `key ${key}`);
      await expectRefused(() => f.put("firm-a", "ok/key.txt", b, "text/plain"), "a firm id that is not a uuid");
    },
  },
  // PF-Fd: delete (the caller asked LegalHoldPort first; the port's comment).
  {
    name: "PF-Fd DW1: a stored file is deleted (deleted true), then get is null and exists false; deleting it again answers deleted false",
    async run() {
      const f = await make();
      await f.put(FIRM_A, "docs/gone.txt", bytesOf("to dispose"), "text/plain");
      const d = await f.delete(FIRM_A, "docs/gone.txt");
      expect(d.deleted === true, "the first delete answers deleted true", d);
      expect(await f.get(FIRM_A, "docs/gone.txt") === null && await f.exists(FIRM_A, "docs/gone.txt") === false, "the file reads as absent");
      expect((await f.delete(FIRM_A, "docs/gone.txt")).deleted === false, "a second delete answers deleted false");
      expect((await f.delete(FIRM_A, "docs/never.txt")).deleted === false, "a key never written answers deleted false");
    },
  },
  {
    name: "PF-Fd DW2: another firm deleting the firm's key answers deleted false and the file still reads back unchanged",
    async run() {
      const f = await make(), body = bytesOf("firm A's file");
      const put = await f.put(FIRM_A, "docs/walled.txt", body, "text/plain");
      expect((await f.delete(FIRM_B, "docs/walled.txt")).deleted === false, "firm B: deleted false");
      const got = await f.get(FIRM_A, "docs/walled.txt");
      expect(got && same(got.bytes, body) && got.sha256 === put.sha256, "firm A's file is unchanged");
      await f.put(FIRM_B, "docs/walled.txt", bytesOf("firm B's own"), "text/plain");   // firm B's key was never retired
    },
  },
  {
    name: "PF-Fd DW3: a deleted key is retired: put of it is refused (FileKeyTaken) with other bytes and with the very same bytes and type; another key still saves",
    async run() {
      const f = await make(), body = bytesOf("disposed copy");
      await f.put(FIRM_A, "signed/d-1.pdf", body, "application/pdf");
      await f.delete(FIRM_A, "signed/d-1.pdf");
      await expectRefused(() => f.put(FIRM_A, "signed/d-1.pdf", bytesOf("other bytes"), "application/pdf"), "other bytes under a deleted key", (e) => e instanceof FileKeyTaken);
      await expectRefused(() => f.put(FIRM_A, "signed/d-1.pdf", bytesOf("disposed copy"), "application/pdf"), "the same bytes and type under a deleted key", (e) => e instanceof FileKeyTaken);
      await expectRefused(() => f.put(FIRM_A.toUpperCase(), "signed/d-1.pdf", body, "application/pdf"), "the same key with the firm id in upper case", (e) => e instanceof FileKeyTaken);
      expect(await f.get(FIRM_A, "signed/d-1.pdf") === null, "the deleted key stays absent");
      const other = await f.put(FIRM_A, "signed/d-2.pdf", body, "application/pdf");
      expect(other.key === "signed/d-2.pdf" && await f.exists(FIRM_A, "signed/d-2.pdf"), "a different key in the firm still saves");
    },
  },
  {
    name: "PF-Fd DW4: delete refuses a key with a `..` segment, upper case or a leading slash, and a firm id that is not a uuid",
    async run() {
      const f = await make();
      for (const key of ["../escape.txt", "a/../../b.txt", "Upper/Case.txt", "/leading.txt"]) await expectRefused(() => f.delete(FIRM_A, key), `delete key ${key}`);
      await expectRefused(() => f.delete("firm-a", "ok/key.txt"), "delete with a firm id that is not a uuid");
    },
  },
  {
    name: "PF-15 usedBytes: the firm's live bytes; a retry adds nothing, a deleted (retired) key and another firm's files never count",
    async run() {
      const f = await make();
      expect(await f.usedBytes(FIRM_A) === 0, "an empty firm uses 0 bytes");
      await f.put(FIRM_A, "u/one.txt", bytesOf("12345"), "text/plain");
      await f.put(FIRM_A, "u/deep/two.txt", bytesOf("123"), "text/plain");
      await f.put(FIRM_A, "u/one.txt", bytesOf("12345"), "text/plain");
      await f.put(FIRM_B, "u/one.txt", bytesOf("1234567890"), "text/plain");
      expect(await f.usedBytes(FIRM_A) === 8, "5 + 3 bytes; the retry adds nothing; firm B's 10 do not count", await f.usedBytes(FIRM_A));
      await f.delete(FIRM_A, "u/one.txt");
      expect(await f.usedBytes(FIRM_A) === 3, "a deleted key no longer counts", await f.usedBytes(FIRM_A));
      expect(await f.usedBytes(FIRM_B) === 10, "firm B: its own 10 bytes");
      await expectRefused(() => f.usedBytes("firm-a"), "a firm id that is not a uuid");
    },
  },
]);
