// PF-Fw: FilesPort's own limits (ports/files.ts: FILE_MAX_BYTES, wellFormedType, parseFilePut, FileTooLarge,
// FileTypeMalformed). The row's four cases, each with a pass and a fail, on the fake and on both adapters (LocalFiles in
// a throwaway folder; S3Files on the recorded fake S3 client, tests/fixtures/pff1-s3/fake-s3.ts), and the shared
// FilesPort contract, unchanged, on all three. No AWS account, no network, no database, no server (US$0).
//   tsx --tsconfig api/tsconfig.json studio/tests/check_pffw_files_limits.ts
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { runContract } from "../ports/contracts/contract.ts";
import { filesPortContract } from "../ports/contracts/files-port.contract.ts";
import { FILE_MAX_BYTES, FileTooLarge, FileTypeMalformed, fakeFiles, parseFilePut, sha256Hex, type FilesPort } from "../ports/files.ts";
import { LocalFiles } from "../api/src/front-office/files.ts";
import { MAX_BYTES } from "../api/src/platform/files/file-type.ts";
import { DEFAULT_FILES_REGION, objectKey, S3Files } from "../api/src/platform/files/s3-files.ts";
import { fakeS3, type FakeS3 } from "./fixtures/pff1-s3/fake-s3.ts";

const STUDIO = join(import.meta.dirname, ".."), WORK = join(STUDIO, "var", `pffw-check-${process.pid}`);
const FIRM_A = "0c0c0c0c-0000-4000-8000-0000000000a1";
const BUCKET = "pffw-recorded-bucket", KMS = "arn:aws:kms:ca-central-1:000000000000:key/00000000-0000-4000-8000-00000000f1f1";
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail)?.slice(0, 500)}` : ""}`); };
const refused = async (f: () => unknown, test: (e: unknown) => boolean = () => true) => { try { await f(); return false; } catch (e) { return test(e); } };

/** The recorded fake S3, with every GetObject body counted: `reads` goes up only when the SDK reads a body's bytes. */
function rig() {
  const s3: FakeS3 = fakeS3({ bucket: BUCKET, region: DEFAULT_FILES_REGION, requireKmsKeyId: KMS });
  const track = { reads: 0 };
  const handler = {
    ...s3.handler,
    async handle(req: { method: string; path: string; query?: Record<string, unknown> }) {
      const out = await s3.handler.handle(req as never) as { response: { statusCode: number; body?: Readable } };
      if (req.method === "GET" && out.response.statusCode === 200 && out.response.body && (req.query ?? {})["list-type"] === undefined) {
        const inner = out.response.body;
        let started = false;
        out.response.body = new Readable({ read() {   // the stream's _read: called only when a consumer asks for bytes
          if (started) return;
          started = true; track.reads++;
          inner.on("data", (c) => this.push(c)); inner.on("end", () => this.push(null)); inner.on("error", (e) => this.destroy(e));
        } });
      }
      return out;
    },
  };
  return { s3, track, files: new S3Files({ bucket: BUCKET, kmsKeyId: KMS, requestHandler: handler as never, credentials: undefined }) };
}
let localN = 0;
const local = () => new LocalFiles(join(WORK, `local-${++localN}`));

mkdirSync(WORK, { recursive: true });
try {
  // The cap is SA-8-58's document limit, the same number the upload check (file-type.ts) uses.
  ok("PF-Fw cap: FILE_MAX_BYTES is SA-8-58's 25 MB, file-type.ts MAX_BYTES.document, and no upload class is larger", FILE_MAX_BYTES === 25 * 1024 * 1024 && FILE_MAX_BYTES === MAX_BYTES.document && Object.values(MAX_BYTES).every((n) => n <= FILE_MAX_BYTES), { FILE_MAX_BYTES, MAX_BYTES });

  // The contract, unchanged, on the fake and both adapters (P-606 (8)).
  for (const [name, make] of [["fakeFiles", () => fakeFiles()], ["LocalFiles", local], ["S3Files", () => rig().files]] as const) {
    const r = await runContract(filesPortContract, name, make as () => FilesPort, null);
    ok(`PF-Fw contract: ${name} passes every case of the FilesPort contract, unchanged`, r.failed.length === 0 && r.passed.length >= 11, r.failed);
  }

  const atCap = new Uint8Array(FILE_MAX_BYTES).fill(0x61), overCap = new Uint8Array(FILE_MAX_BYTES + 1).fill(0x61);
  const LONE = "text/plain; name=\uD800x", PAIR = "text/plain; name=😀", CONTROL = "text/plain; name=a\u0007b", DEL = "text/plain; name=a\u007fb";
  // The port's check itself: what every adapter calls first.
  ok("PF-Fw port: parseFilePut accepts a put at the cap and a type with a whole surrogate pair", parseFilePut({ firmId: FIRM_A, key: "p/a.txt", bytes: atCap, contentType: PAIR }).bytes.byteLength === FILE_MAX_BYTES);
  ok("PF-Fw port: parseFilePut refuses one byte over the cap with FileTooLarge, naming the size and the cap", await refused(() => parseFilePut({ firmId: FIRM_A, key: "p/a.txt", bytes: overCap, contentType: "text/plain" }), (e) => e instanceof FileTooLarge && e.name === "FileTooLarge" && e.bytes === FILE_MAX_BYTES + 1 && e.max === FILE_MAX_BYTES));
  ok("PF-Fw port: parseFilePut refuses a lone surrogate, a C0 control character and DEL with FileTypeMalformed", await refused(() => parseFilePut({ firmId: FIRM_A, key: "p/a.txt", bytes: atCap, contentType: LONE }), (e) => e instanceof FileTypeMalformed && e.name === "FileTypeMalformed")
    && await refused(() => parseFilePut({ firmId: FIRM_A, key: "p/a.txt", bytes: atCap, contentType: CONTROL }), (e) => e instanceof FileTypeMalformed)
    && await refused(() => parseFilePut({ firmId: FIRM_A, key: "p/a.txt", bytes: atCap, contentType: DEL }), (e) => e instanceof FileTypeMalformed));

  for (const [name, make] of [["fakeFiles", () => ({ files: fakeFiles() as FilesPort, s3: null as FakeS3 | null })], ["LocalFiles", () => ({ files: local() as FilesPort, s3: null as FakeS3 | null })], ["S3Files", () => { const r = rig(); return { files: r.files as FilesPort, s3: r.s3 as FakeS3 | null }; }]] as const) {
    // Case 1: a lone surrogate in the content type.
    {
      const { files, s3 } = make();
      ok(`PF-Fw case 1 fail (${name}): a lone surrogate in the content type is refused (FileTypeMalformed); nothing is stored, no request is sent`, await refused(() => files.put(FIRM_A, "t/lone.txt", new TextEncoder().encode("x"), LONE), (e) => e instanceof FileTypeMalformed)
        && await files.exists(FIRM_A, "t/lone.txt") === false && await files.usedBytes(FIRM_A) === 0 && (s3 === null || s3.seen.every((r) => r.method !== "PUT")));
      ok(`PF-Fw case 1 fail (${name}): a control character in the content type is refused the same way`, await refused(() => files.put(FIRM_A, "t/ctl.txt", new TextEncoder().encode("x"), CONTROL), (e) => e instanceof FileTypeMalformed) && await files.exists(FIRM_A, "t/ctl.txt") === false);
      const put = await files.put(FIRM_A, "t/pair.txt", new TextEncoder().encode("x"), PAIR), got = await files.get(FIRM_A, "t/pair.txt");
      ok(`PF-Fw case 1 pass (${name}): a type with a whole surrogate pair is stored and read back exactly`, got?.contentType === PAIR && got.sha256 === put.sha256, got && { contentType: got.contentType });
    }
    // Case 2: one byte over the cap.
    {
      const { files, s3 } = make();
      ok(`PF-Fw case 2 fail (${name}): a put one byte over the cap is refused (FileTooLarge); nothing is stored, no request is sent`, await refused(() => files.put(FIRM_A, "big/over.bin", overCap, "application/octet-stream"), (e) => e instanceof FileTooLarge && e.bytes === FILE_MAX_BYTES + 1)
        && await files.exists(FIRM_A, "big/over.bin") === false && await files.usedBytes(FIRM_A) === 0 && (s3 === null || (s3.keys().length === 0 && s3.seen.every((r) => r.method !== "PUT"))));
    }
    // Case 3: a put at the cap.
    {
      const { files } = make();
      const put = await files.put(FIRM_A, "big/at.bin", atCap, "application/octet-stream"), got = await files.get(FIRM_A, "big/at.bin");
      ok(`PF-Fw case 3 pass (${name}): a put of exactly the cap is stored and reads back whole`, got?.bytes.byteLength === FILE_MAX_BYTES && got.sha256 === put.sha256 && await files.usedBytes(FIRM_A) === FILE_MAX_BYTES, got && got.bytes.byteLength);
    }
  }
  if (localN > 0) ok("PF-Fw case 2 (LocalFiles): the refused puts left no file and no .tmp behind in any folder", readdirSync(WORK).every((d) => !JSON.stringify(readdirSync(join(WORK, d), { recursive: true })).includes("over.bin") && !JSON.stringify(readdirSync(join(WORK, d), { recursive: true })).includes("lone.txt")));

  // Case 4: an S3 object over the cap is never read into memory (S3's get checks its size first).
  {
    const { s3, track, files } = rig();
    const key = objectKey(FIRM_A, "s3/huge.bin"), sha256 = await sha256Hex(overCap);
    const status = await s3.rawPut(key, overCap, { "content-type": "application/octet-stream", "x-amz-server-side-encryption": "aws:kms", "x-amz-server-side-encryption-aws-kms-key-id": KMS, "x-amz-meta-sha256": sha256, "x-amz-meta-type": Buffer.from("application/octet-stream").toString("base64url") });
    track.reads = 0;
    ok("PF-Fw case 4 fail (S3Files): an object one byte over the cap (put around the adapter) is refused on get with FileTooLarge, and its body is never read", status === 200 && await refused(() => files.get(FIRM_A, "s3/huge.bin"), (e) => e instanceof FileTooLarge && e.bytes === FILE_MAX_BYTES + 1) && track.reads === 0, { status, reads: track.reads });
    await files.put(FIRM_A, "s3/at.bin", atCap, "application/octet-stream");
    track.reads = 0;
    const got = await files.get(FIRM_A, "s3/at.bin");
    ok("PF-Fw case 4 pass (S3Files): an object at the cap is read (its body read once) and served whole", got?.bytes.byteLength === FILE_MAX_BYTES && track.reads === 1, { reads: track.reads, bytes: got?.bytes.byteLength });
  }
} finally { rmSync(WORK, { recursive: true, force: true }); }

console.log(`\nPF-Fw: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
