// PF-F1 (R1.65): the S3 FilesPort adapter (api/src/platform/files/s3-files.ts) and its chooser (choose.ts), on the
// recorded fake S3 client (tests/fixtures/pff1-s3/fake-s3.ts: the SDK's own request handler, so the real S3Client builds
// every request and nothing reaches the network). The row's six cases, each with a pass and a fail, and the shared
// FilesPort contract on S3Files. No AWS account, no network, no database, no server, no model call (US$0).
//   tsx studio/tests/check_pff1_s3_files.ts
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runContract } from "../ports/contracts/contract.ts";
import { filesPortContract } from "../ports/contracts/files-port.contract.ts";
import { FileKeyTaken, sha256Hex, type FilesPort } from "../ports/files.ts";
import { LocalFiles } from "../api/src/front-office/files.ts";
import { Secret } from "../api/src/platform/config/secret.ts";
import { chooseFiles, filesAdapterOf, s3SettingsOf } from "../api/src/platform/files/choose.ts";
import { DEFAULT_FILES_REGION, objectKey, S3FileLinks, S3Files, S3_LINK_SECONDS } from "../api/src/platform/files/s3-files.ts";
import { fakeS3, type FakeS3, type SeenRequest } from "./fixtures/pff1-s3/fake-s3.ts";

const STUDIO = join(import.meta.dirname, ".."), WORK = join(STUDIO, "var", `pff1-check-${process.pid}`);
const FIRM_A = "0c0c0c0c-0000-4000-8000-0000000000a1", FIRM_B = "0c0c0c0c-0000-4000-8000-0000000000b2";
const PERSON_1 = "5a5a5a5a-0000-4000-8000-000000000001", PERSON_2 = "5a5a5a5a-0000-4000-8000-000000000002";
const BUCKET = "pff1-recorded-bucket", KMS = "arn:aws:kms:ca-central-1:000000000000:key/00000000-0000-4000-8000-00000000f1f1";
const LINK_KEY = new Secret("PFF1_LINK_KEY", randomBytes(32).toString("base64"));
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail)?.slice(0, 500)}` : ""}`); };
const refused = async (f: () => unknown, test: (e: unknown) => boolean = () => true) => { try { await f(); return false; } catch (e) { return test(e); } };
const bytesOf = (s: string) => new TextEncoder().encode(s);
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);
// Made by this run, never real: the SDK signs with them and the fake never checks a signature.
const creds = { accessKeyId: new Secret("PFF1_ACCESS_KEY_ID", `AKIA${randomBytes(8).toString("hex").toUpperCase()}`), secretAccessKey: new Secret("PFF1_SECRET_ACCESS_KEY", randomBytes(30).toString("base64")) };
const rig = (o: { requireKms?: boolean; now?: () => number; pageSize?: number } = {}) => {
  const s3 = fakeS3({ bucket: BUCKET, region: DEFAULT_FILES_REGION, requireKmsKeyId: o.requireKms === false ? null : KMS, now: o.now, pageSize: o.pageSize });
  return { s3, files: new S3Files({ bucket: BUCKET, kmsKeyId: KMS, credentials: creds, requestHandler: s3.handler as never }) };
};
/** The check over the adapter (case 3): every PutObject request the adapter sent that does not ask for KMS encryption under the key. */
const unencryptedPuts = (seen: readonly SeenRequest[], kmsKeyId: string) => seen.filter((r) => r.method === "PUT" && (r.headers["x-amz-server-side-encryption"] !== "aws:kms" || r.headers["x-amz-server-side-encryption-aws-kms-key-id"] !== kmsKeyId));
const contractCase = (r: { passed: string[]; failed: string[] }, start: string) => ({ passed: r.passed.filter((n) => n.startsWith(start)).length, failed: r.failed.filter((n) => n.startsWith(start)).length });

mkdirSync(WORK, { recursive: true });
try {
  // The shared contract (P-606 (8)): S3Files keeps every FilesPort behaviour the fake and LocalFiles keep.
  const all = await runContract(filesPortContract, "S3Files", () => rig({ pageSize: 2 }).files, ok);
  ok("R1.65 PF-F1 contract: S3Files keeps every case of the FilesPort contract", all.failed.length === 0 && all.passed.length >= 11, all.failed);

  // Case 1: the firm wall.
  {
    const { s3, files } = rig();
    await files.put(FIRM_A, "docs/passport.pdf", bytesOf("firm A's passport copy"), "application/pdf");
    ok("R1.65 PF-F1 case 1 pass: firm B's read of firm A's key gives null (and exists false); firm A reads it", await files.get(FIRM_B, "docs/passport.pdf") === null && await files.exists(FIRM_B, "docs/passport.pdf") === false && (await files.get(FIRM_A, "docs/passport.pdf"))?.contentType === "application/pdf");
    ok("R1.65 PF-F1 case 1 pass: the object key is <firm id>/<key>, in lower case even for an upper-case firm id", same(new Uint8Array(s3.keys().map((k) => k.length)), new Uint8Array([`${FIRM_A}/docs/passport.pdf`.length])) && s3.keys()[0] === `${FIRM_A}/docs/passport.pdf` && objectKey(FIRM_A.toUpperCase(), "docs/passport.pdf") === `${FIRM_A}/docs/passport.pdf`, s3.keys());
    ok("R1.65 PF-F1 case 1 pass: every request went to the bucket's own host in ca-central-1 and named only firm A's or firm B's prefix", s3.seen.length > 0 && s3.seen.every((r) => r.host === `${BUCKET}.s3.ca-central-1.amazonaws.com` && (r.key.startsWith(`${FIRM_A}/`) || r.key.startsWith(`${FIRM_B}/`))), s3.seen.map((r) => `${r.host} ${r.key}`));
    ok("R1.65 PF-F1 case 1 fail: a key that would leave the firm's prefix, or a firm id that is not a uuid, is refused before any request", await refused(() => files.get(FIRM_B, `../${FIRM_A}/docs/passport.pdf`)) && await refused(() => files.get(`${FIRM_A}/docs`, "passport.pdf")) && await refused(() => files.exists("", "docs/passport.pdf")) && await refused(() => files.usedBytes(`${FIRM_A}/`)));
    // An adapter with no firm prefix (every firm in one space) must fail the contract's wall case.
    const noWall = (): FilesPort => { const f = rig().files; return { put: (_f, k, b, c) => f.put(FIRM_A, k, b, c), get: (_f, k) => f.get(FIRM_A, k), exists: (_f, k) => f.exists(FIRM_A, k), delete: (_f, k) => f.delete(FIRM_A, k), usedBytes: () => f.usedBytes(FIRM_A) }; };
    const broken = contractCase(await runContract(filesPortContract, "S3Files without the firm prefix", noWall, null), "another firm's key reads as absent");
    ok("R1.65 PF-F1 case 1 fail: an adapter that keeps no firm prefix fails the contract's firm-wall case", broken.failed === 1 && broken.passed === 0, broken);
  }

  // Case 2: write-once by a conditional put.
  {
    const { s3, files } = rig(), body = bytesOf("signed retainer"), sha = await sha256Hex(body);
    const first = await files.put(FIRM_A, "retainers/r-1/v1.pdf", body, "application/pdf");
    const again = await files.put(FIRM_A, "retainers/r-1/v1.pdf", bytesOf("signed retainer"), "application/pdf");
    ok("R1.65 PF-F1 case 2 pass: the same bytes twice is accepted, with the same sha256", first.sha256 === sha && again.sha256 === sha && again.key === "retainers/r-1/v1.pdf", { first, again });
    ok("R1.65 PF-F1 case 2 fail: other bytes under the key give FileKeyTaken, and so does another type", await refused(() => files.put(FIRM_A, "retainers/r-1/v1.pdf", bytesOf("other bytes"), "application/pdf"), (e) => e instanceof FileKeyTaken) && await refused(() => files.put(FIRM_A, "retainers/r-1/v1.pdf", body, "text/plain"), (e) => e instanceof FileKeyTaken));
    const stored = s3.object(`${FIRM_A}/retainers/r-1/v1.pdf`);
    ok("R1.65 PF-F1 case 2 pass: the stored object never changed", stored !== null && same(stored.bytes, body) && stored.contentType === "application/pdf" && stored.meta.sha256 === sha, stored && { ...stored, bytes: stored.bytes.length });
    const puts = s3.seen.filter((r) => r.method === "PUT");
    ok("R1.65 PF-F1 case 2 pass: every put of a file is a conditional put (If-None-Match: *)", puts.length === 4 && puts.every((r) => r.headers["if-none-match"] === "*"), puts.map((r) => r.headers["if-none-match"]));
    // Two writers of one key: the other writer's bytes land after this put's request is built; only one may win.
    let raced = false;
    s3.before(async (r) => { if (r.method === "PUT" && r.key.endsWith("/race/k.txt") && !raced) { raced = true; await s3.rawPut(r.key, bytesOf("the other writer"), { "content-type": "text/plain", "x-amz-server-side-encryption": "aws:kms", "x-amz-server-side-encryption-aws-kms-key-id": KMS, "x-amz-meta-sha256": "0".repeat(64) }); } });
    const lost = await refused(() => files.put(FIRM_A, "race/k.txt", bytesOf("this writer"), "text/plain"), (e) => e instanceof FileKeyTaken);
    s3.before(null);
    ok("R1.65 PF-F1 case 2 fail: when another writer takes the key first, this put gives FileKeyTaken and the other writer's bytes stay", lost && new TextDecoder().decode(s3.object(`${FIRM_A}/race/k.txt`)!.bytes) === "the other writer");
    // An adapter that overwrites must fail the contract's write-once case.
    const overwrites = (): FilesPort => { const r = rig(); return { put: async (f, k, b, c) => { const key = objectKey(f, k), sha256 = await sha256Hex(b); await r.s3.rawPut(key, b, { "content-type": c, "x-amz-server-side-encryption": "aws:kms", "x-amz-server-side-encryption-aws-kms-key-id": KMS, "x-amz-meta-sha256": sha256 }); return { key: k, sha256 }; }, get: (f, k) => r.files.get(f, k), exists: (f, k) => r.files.exists(f, k), delete: (f, k) => r.files.delete(f, k), usedBytes: (f) => r.files.usedBytes(f) }; };
    const broken = contractCase(await runContract(filesPortContract, "S3Files with an unconditional put", overwrites, null), "a key is write-once");
    ok("R1.65 PF-F1 case 2 fail: an adapter whose put is not conditional fails the contract's write-once case", broken.failed === 1 && broken.passed === 0, broken);
    // Versions (the row): a new version is a new key; v1 stays as it was.
    await files.put(FIRM_A, "retainers/r-1/v2.pdf", bytesOf("signed retainer, second version"), "application/pdf");
    ok("R1.65 PF-F1 case 2 pass: a new version is a new key (v2 beside v1), and v1 reads back unchanged", same((await files.get(FIRM_A, "retainers/r-1/v1.pdf"))!.bytes, body) && new TextDecoder().decode((await files.get(FIRM_A, "retainers/r-1/v2.pdf"))!.bytes) === "signed retainer, second version");
    // S3's "a conflicting write is in progress" (409) is asked again; an error S3 gives is never passed on in its own words.
    s3.failNext("PUT", "ConditionalRequestConflict");
    ok("R1.65 PF-F1 case 2 pass: a put S3 answers 409 (a conflicting write in progress) is asked again and stored", (await files.put(FIRM_A, "retry/c.txt", bytesOf("c"), "text/plain")).key === "retry/c.txt" && await files.exists(FIRM_A, "retry/c.txt"));
    s3.failNext("PUT", "AccessDenied");
    let said = "";
    try { await files.put(FIRM_A, "retry/denied.txt", bytesOf("d"), "text/plain"); } catch (e) { said = `${(e as Error).name}: ${(e as Error).message}`; }
    ok("R1.65 PF-F1 case 2 fail: a put S3 refuses (403) fails with the error's name and status only, and stores nothing", said === "S3FilesError: files: S3 put failed (AccessDenied 403)" && await files.exists(FIRM_A, "retry/denied.txt") === false, said);
  }

  // Case 3: encryption on every put.
  {
    const { s3, files } = rig();
    await files.put(FIRM_A, "enc/a.txt", bytesOf("a"), "text/plain");
    await files.put(FIRM_A, "enc/a.txt", bytesOf("a"), "text/plain");
    await files.put(FIRM_B, "enc/b.txt", bytesOf("b"), "text/plain");
    await files.delete(FIRM_A, "enc/a.txt");   // the tombstone is a put too
    const puts = s3.seen.filter((r) => r.method === "PUT");
    ok("R1.65 PF-F1 case 3 pass: every put request (3 files and a delete's tombstone) carries x-amz-server-side-encryption: aws:kms and the configured key", puts.length === 4 && unencryptedPuts(s3.seen, KMS).length === 0, puts.map((r) => [r.headers["x-amz-server-side-encryption"], r.headers["x-amz-server-side-encryption-aws-kms-key-id"]]));
    ok("R1.65 PF-F1 case 3 pass: the stored objects are held under that KMS key", s3.keys().length === 2 && s3.keys().every((k) => s3.object(k)!.sse === "aws:kms" && s3.object(k)!.kmsKeyId === KMS));
    // A put without the header: the bucket's policy refuses it (PF-F1c), and on a bucket with no such policy the check over the adapter's requests finds it.
    ok("R1.65 PF-F1 case 3 fail: a put without the encryption header is refused by the bucket (403) and stores nothing", await s3.rawPut(`${FIRM_A}/enc/plain.txt`, bytesOf("plain"), { "content-type": "text/plain" }) === 403 && s3.object(`${FIRM_A}/enc/plain.txt`) === null);
    ok("R1.65 PF-F1 case 3 fail: a put under another KMS key is refused by the bucket (403)", await s3.rawPut(`${FIRM_A}/enc/other.txt`, bytesOf("x"), { "content-type": "text/plain", "x-amz-server-side-encryption": "aws:kms", "x-amz-server-side-encryption-aws-kms-key-id": "alias/another" }) === 403);
    const open = rig({ requireKms: false });
    await open.files.put(FIRM_A, "enc/a.txt", bytesOf("a"), "text/plain");
    await open.s3.rawPut(`${FIRM_A}/enc/plain.txt`, bytesOf("plain"), { "content-type": "text/plain" });
    await open.s3.rawPut(`${FIRM_A}/enc/s3-managed.txt`, bytesOf("x"), { "content-type": "text/plain", "x-amz-server-side-encryption": "AES256" });
    const found = unencryptedPuts(open.s3.seen, KMS);
    ok("R1.65 PF-F1 case 3 fail: the check over the adapter fails on a put without the header (and on one with S3-managed keys), and names only those", found.length === 2 && found.map((r) => r.key).join() === `${FIRM_A}/enc/plain.txt,${FIRM_A}/enc/s3-managed.txt`, found.map((r) => r.key));
    ok("R1.65 PF-F1 case 3 fail: an adapter with no KMS key, or no bucket, cannot be made", await refused(() => new S3Files({ bucket: BUCKET, kmsKeyId: "" })) && await refused(() => new S3Files({ bucket: BUCKET } as never)) && await refused(() => new S3Files({ bucket: "", kmsKeyId: KMS })));
  }

  // Case 4: signed links for one firm and one person, 5 minutes (Sample), on an injected clock.
  {
    let nowMs = Date.UTC(2026, 10, 22, 12, 0, 0);
    const { s3, files } = rig({ now: () => nowMs }), body = bytesOf("the client's signed copy");
    const links = new S3FileLinks(files, LINK_KEY, () => nowMs);
    await files.put(FIRM_A, "signed/s-1.pdf", body, "application/pdf");
    await files.put(FIRM_B, "signed/s-1.pdf", bytesOf("firm B's own file"), "application/pdf");
    const link = links.sign(FIRM_A, PERSON_1, "signed/s-1.pdf");
    ok("R1.65 PF-F1 case 4 pass: a link ends 5 minutes after it is made", S3_LINK_SECONDS === 300 && Date.parse(link.expiresAt) === nowMs + 300_000, link.expiresAt);
    const opened = await links.open(link.token, FIRM_A, PERSON_1);
    const url = opened.status === 200 ? new URL(opened.url) : null;
    ok("R1.65 PF-F1 case 4 pass: the firm's own person opens it: a signed GET address for firm A's key in ca-central-1, 300 seconds", !!url && url.hostname === `${BUCKET}.s3.ca-central-1.amazonaws.com` && url.pathname === `/${FIRM_A}/signed/s-1.pdf` && url.searchParams.get("X-Amz-Expires") === "300" && url.searchParams.get("X-Amz-Date") === "20261122T120000Z" && /^[0-9a-f]{64}$/.test(url.searchParams.get("X-Amz-Signature") ?? "") && (url.searchParams.get("X-Amz-Credential") ?? "").endsWith("/ca-central-1/s3/aws4_request"), opened);
    const got = opened.status === 200 ? await s3.fetchUrl(opened.url) : null;
    ok("R1.65 PF-F1 case 4 pass: the address gives the file's bytes", got?.status === 200 && same(got.bytes, body), got?.status);
    ok("R1.65 PF-F1 case 4 fail: the link for another firm gives 404 (and never firm B's file of the same key)", JSON.stringify(await links.open(link.token, FIRM_B, PERSON_1)) === `{"status":404}`);
    ok("R1.65 PF-F1 case 4 fail: the link for another person of the same firm gives 404", JSON.stringify(await links.open(link.token, FIRM_A, PERSON_2)) === `{"status":404}`);
    const [b64, mac] = link.token.split(".") as [string, string];
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(b64, "base64url").toString("utf8")), e: Math.floor(nowMs / 1000) + 86_400 })).toString("base64url");
    ok("R1.65 PF-F1 case 4 fail: an altered link (a later end time, a changed signature, no signature, not a token) gives 404", (await Promise.all([`${forged}.${mac}`, `${b64}.${mac.slice(0, -1)}${mac.endsWith("A") ? "B" : "A"}`, b64, "", "a.b", undefined as never].map((t) => links.open(t, FIRM_A, PERSON_1)))).every((r) => r.status === 404));
    ok("R1.65 PF-F1 case 4 fail: a link signed with another server's key gives 404", (await new S3FileLinks(files, new Secret("OTHER", randomBytes(32).toString("base64")), () => nowMs).open(link.token, FIRM_A, PERSON_1)).status === 404);
    nowMs += 299_000;
    const late = await links.open(link.token, FIRM_A, PERSON_1);
    ok("R1.65 PF-F1 case 4 pass: at 4 min 59 s the link still opens, and its address lasts only the 1 second left", late.status === 200 && new URL(late.url).searchParams.get("X-Amz-Expires") === "1" && late.expiresAt === link.expiresAt, late);
    nowMs += 1_000;
    ok("R1.65 PF-F1 case 4 fail: at 5 minutes the link gives 404 (clock injected)", JSON.stringify(await links.open(link.token, FIRM_A, PERSON_1)) === `{"status":404}`);
    ok("R1.65 PF-F1 case 4 fail: at 5 minutes the addresses handed out earlier are refused by S3 too (403: nothing outlives the link)", opened.status === 200 && (await s3.fetchUrl(opened.url)).status === 403 && late.status === 200 && (await s3.fetchUrl(late.url)).status === 403);
    nowMs += 3_600_000;
    ok("R1.65 PF-F1 case 4 fail: an hour later it still gives 404", (await links.open(link.token, FIRM_A, PERSON_1)).status === 404);
    const gone = links.sign(FIRM_A, PERSON_1, "signed/s-1.pdf"), never = links.sign(FIRM_A, PERSON_1, "signed/never.pdf");
    await files.delete(FIRM_A, "signed/s-1.pdf");
    ok("R1.65 PF-F1 case 4 fail: a link to a deleted file, or to a key never written, gives 404", (await links.open(gone.token, FIRM_A, PERSON_1)).status === 404 && (await links.open(never.token, FIRM_A, PERSON_1)).status === 404);
    ok("R1.65 PF-F1 case 4 fail: a link is not made without a person, for a bad key, or with a link key under 32 characters; an address never lasts over 5 minutes", await refused(() => links.sign(FIRM_A, "", "signed/s-1.pdf")) && await refused(() => links.sign(FIRM_A, PERSON_1, "../x")) && await refused(() => new S3FileLinks(files, new Secret("SHORT", "short"), () => nowMs)) && await refused(() => files.signedGetUrl(FIRM_A, "signed/s-1.pdf", nowMs, 301)) && await refused(() => files.signedGetUrl(FIRM_A, "signed/s-1.pdf", nowMs, 0)));
    ok("R1.65 PF-F1 case 4 pass: no link, token or address holds the link key or the AWS secret", ![link.token, JSON.stringify(opened), String(creds.secretAccessKey)].some((t) => t.includes(LINK_KEY.reveal()) || t.includes(creds.secretAccessKey.reveal())));
  }

  // Case 5: the chooser fails closed.
  {
    const said = (f: () => unknown) => { try { f(); return ""; } catch (e) { return (e as Error).message; } };
    ok("R1.65 PF-F1 case 5 fail: PLATFORM_FILES unset with NODE_ENV=production refuses to start, naming the setting", /^configuration: PLATFORM_FILES is not set/.test(said(() => chooseFiles({ NODE_ENV: "production" }))) && /PLATFORM_FILES is not set/.test(said(() => chooseFiles({ NODE_ENV: "production", PLATFORM_FILES: "  " }))) && /PLATFORM_FILES is not set/.test(said(() => chooseFiles({ PLATFORM_ENVIRONMENT: "production" }))), said(() => chooseFiles({ NODE_ENV: "production" })));
    // The same refusal in a real process: the start-up stops with a non-zero exit.
    // Started as run-suites.sh starts a suite (the tsx binary with the app's tsconfig, a file, not -e): the batch on
    // Node 24.21.0 failed inside tsx's loader on `--import tsx -e` before the refusal (#2955, merge batch shard 22).
    const startFile = join(WORK, "start.ts");
    writeFileSync(startFile, `import { chooseFiles } from ${JSON.stringify(join(STUDIO, "api/src/platform/files/choose.ts"))};\nchooseFiles();\nconsole.log("STARTED");\n`);
    const child = spawnSync(join(STUDIO, "node_modules/.bin/tsx"), ["--tsconfig", join(STUDIO, "api/tsconfig.json"), startFile], { cwd: STUDIO, encoding: "utf8", env: { ...process.env, NODE_ENV: "production", PLATFORM_FILES: "", PLATFORM_ENVIRONMENT: "", FO_FILES_DIR: join(WORK, "child") } });
    ok("R1.65 PF-F1 case 5 fail: a process started so exits non-zero and never reaches its next line", child.status !== 0 && !/STARTED/.test(child.stdout) && /PLATFORM_FILES is not set/.test(child.stderr), { status: child.status, err: child.stderr.slice(0, 600) });
    ok("R1.65 PF-F1 case 5 pass: unset outside production is the local adapter; PLATFORM_FILES=local is the local adapter, in production too", chooseFiles({ FO_FILES_DIR: WORK }) instanceof LocalFiles && filesAdapterOf({ NODE_ENV: "test" }) === "local" && filesAdapterOf({ PLATFORM_FILES: "local", NODE_ENV: "production" }) === "local" && filesAdapterOf({}) === "local");
    const env = { NODE_ENV: "production", PLATFORM_FILES: "s3", PLATFORM_FILES_BUCKET: BUCKET, PLATFORM_FILES_KMS_KEY_ID: KMS };
    const chosen = chooseFiles(env, { credentials: creds, requestHandler: fakeS3({ bucket: BUCKET, region: "ca-central-1", requireKmsKeyId: KMS }).handler as never });
    ok("R1.65 PF-F1 case 5 pass: PLATFORM_FILES=s3 with its bucket and KMS key is the S3 adapter, in ca-central-1 unless the region is set", chosen instanceof S3Files && chosen.region === "ca-central-1" && chosen.bucket === BUCKET && s3SettingsOf({ ...env, PLATFORM_FILES_REGION: "ca-west-1", PLATFORM_FILES_KMS_KEY_ID: "alias/expatready-files" }).region === "ca-west-1" && await chosen.exists(FIRM_A, "nothing/here.txt") === false);
    ok("R1.65 PF-F1 case 5 fail: any other value of PLATFORM_FILES refuses to start, in every environment", ["S3", "aws", "local,s3", "none", "fake"].every((v) => /PLATFORM_FILES must be local or s3/.test(said(() => chooseFiles({ PLATFORM_FILES: v })))));
    const without = (name: string) => said(() => chooseFiles({ ...env, [name]: undefined }));
    ok("R1.65 PF-F1 case 5 fail: s3 without its bucket or its KMS key refuses to start, naming the setting; a malformed bucket, key or region too", /PLATFORM_FILES_BUCKET is not set/.test(without("PLATFORM_FILES_BUCKET")) && /PLATFORM_FILES_KMS_KEY_ID is not set/.test(without("PLATFORM_FILES_KMS_KEY_ID")) && /PLATFORM_FILES_BUCKET must be/.test(said(() => chooseFiles({ ...env, PLATFORM_FILES_BUCKET: "Has Spaces" }))) && /PLATFORM_FILES_KMS_KEY_ID must be/.test(said(() => chooseFiles({ ...env, PLATFORM_FILES_KMS_KEY_ID: "a key?" }))) && /PLATFORM_FILES_REGION must be/.test(said(() => chooseFiles({ ...env, PLATFORM_FILES_REGION: "canada" }))));
    ok("R1.65 PF-F1 case 5 fail: a refusal names the setting and never its value", !said(() => chooseFiles({ ...env, PLATFORM_FILES_BUCKET: "Has Spaces" })).includes("Has Spaces") && !said(() => chooseFiles({ PLATFORM_FILES: "fake" })).includes("fake"));
  }

  // Case 6: FO-5's local adapter is unchanged and is what the chooser gives; its own suites run in their own files.
  {
    const local = () => chooseFiles({ PLATFORM_FILES: "local", FO_FILES_DIR: join(WORK, "local", crypto.randomUUID()) });
    const r = await runContract(filesPortContract, "chooseFiles(local)", local, null);
    ok("R1.65 PF-F1 case 6 pass: the chooser's local adapter is FO-5's LocalFiles and keeps every case of the FilesPort contract", local() instanceof LocalFiles && r.failed.length === 0 && r.passed.length === all.passed.length, r.failed);
    // This row's own commits only: from the merge-base of the commit that last changed this check and origin/main, to that
    // commit. Never HEAD: in a merge batch HEAD also holds the other PRs of the batch (#2955, batch shard 22). Once the row
    // is on main the range is empty.
    const git = (...a: string[]) => spawnSync("git", a, { cwd: STUDIO, encoding: "utf8" });
    const own = git("log", "-1", "--format=%H", "--", "tests/check_pff1_s3_files.ts").stdout.trim(), base = own ? git("merge-base", own, "origin/main") : null;
    const diff = own && base?.status === 0 ? git("diff", "--name-only", `${base.stdout.trim()}..${own}`, "--", "api/src/front-office", "ports", "tests/check_fo5_retainers.ts", "tests/check_fo5b_retainer_checklist.ts", "tests/check_pffd_delete.ts", "tests/check_pffp_pdf.ts", "tests/check_pf0p_ports.ts") : null;
    if (diff?.status === 0) ok("R1.65 PF-F1 case 6 pass: this row changed no file of FO-5, of the ports, or of their tests", diff.stdout.trim() === "", diff.stdout);
    else console.log("NOT TESTED  R1.65 PF-F1 case 6: origin/main or this row's history is not in this copy, so the unchanged-files comparison did not run");
    const noRetry = (): FilesPort => { const f = local(); return { put: async (firm, k, b, c) => { if (await f.exists(firm, k)) throw new FileKeyTaken(k); return f.put(firm, k, b, c); }, get: (firm, k) => f.get(firm, k), exists: (firm, k) => f.exists(firm, k), delete: (firm, k) => f.delete(firm, k), usedBytes: (firm) => f.usedBytes(firm) }; };
    const broken = await runContract(filesPortContract, "LocalFiles refusing a retry", noRetry, null);
    ok("R1.65 PF-F1 case 6 fail: a local adapter changed to refuse the same bytes again fails the contract", broken.failed.length >= 1, broken.failed);
  }

  // Round 1's Minors (review m4; break m1, m3, m6, m7, m8, m9), each with a pass and a fail.
  {
    let nowMs = Date.UTC(2026, 10, 22, 12, 0, 0);
    const { s3, files } = rig({ now: () => nowMs }), sha = await sha256Hex(bytesOf("real bytes"));
    const kmsHeaders = { "x-amz-server-side-encryption": "aws:kms", "x-amz-server-side-encryption-aws-kms-key-id": KMS };
    await s3.rawPut(`${FIRM_A}/planted/x.txt`, bytesOf("other bytes"), { "content-type": "text/plain", ...kmsHeaders, "x-amz-meta-sha256": sha });
    await s3.rawPut(`${FIRM_A}/planted/none.txt`, bytesOf("no sha"), { "content-type": "text/plain", ...kmsHeaders });
    await files.put(FIRM_A, "planted/ok.txt", bytesOf("real bytes"), "text/plain");
    ok("R1.65 PF-F1 m4 pass: an object the adapter wrote reads back", (await files.get(FIRM_A, "planted/ok.txt"))?.sha256 === sha);
    ok("R1.65 PF-F1 m4 fail: an object whose bytes do not match its sha256, or that has none, is never served by get", await refused(() => files.get(FIRM_A, "planted/x.txt"), (e) => /S3 get failed \(IntegrityMismatch\)/.test(String(e))) && await refused(() => files.get(FIRM_A, "planted/none.txt"), (e) => /S3 get failed \(IntegrityMismatch\)/.test(String(e))));
    const links = new S3FileLinks(files, LINK_KEY, () => nowMs), opened = await links.open(links.sign(FIRM_A, PERSON_1, "planted/ok.txt").token, FIRM_A, PERSON_1);
    const url = opened.status === 200 ? new URL(opened.url) : null, fetched = opened.status === 200 ? await s3.fetchUrl(opened.url) : null;
    ok("R1.65 PF-F1 break m1 pass: a link's address makes S3 answer Content-Disposition: attachment and Cache-Control: no-store", url?.searchParams.get("response-content-disposition") === "attachment" && url?.searchParams.get("response-cache-control") === "no-store" && fetched?.headers["content-disposition"] === "attachment" && fetched?.headers["cache-control"] === "no-store", fetched?.headers);
    const unsigned = url ? new URL(url) : null;
    unsigned?.searchParams.delete("response-content-disposition");
    ok("R1.65 PF-F1 break m1 fail: without the override the same object would come back with no Content-Disposition (an HTML upload would render)", !!unsigned && (await s3.fetchUrl(unsigned.toString())).headers["content-disposition"] === undefined);
    const fresh = links.sign(FIRM_A, PERSON_1, "planted/ok.txt");
    nowMs = Number.NaN;
    ok("R1.65 PF-F1 break m9 fail: a clock that gives no time (NaN) opens no link (404)", JSON.stringify(await links.open(fresh.token, FIRM_A, PERSON_1).catch((e) => `threw: ${(e as Error).message}`)) === `{"status":404}`);
    nowMs = Date.UTC(2026, 10, 22, 12, 0, 0);
    ok("R1.65 PF-F1 break m9 pass: the same link opens once the clock gives the time again", (await links.open(fresh.token, FIRM_A, PERSON_1)).status === 200);
    const exact = "text/plain; charset=utf-8 ", accented = "text/plain; name=été";
    const spaced = await files.put(FIRM_A, "types/t.txt", bytesOf("t"), exact), again = await files.put(FIRM_A, "types/t.txt", bytesOf("t"), exact);
    await files.put(FIRM_A, "types/u.txt", bytesOf("u"), accented);
    ok("R1.65 PF-F1 r2-m2 pass: a type with a space at its end, or not ASCII, is kept exactly (get gives it back; the same put again is a retry); S3 serves a safe header", spaced.sha256 === again.sha256 && (await files.get(FIRM_A, "types/t.txt"))?.contentType === exact && (await files.get(FIRM_A, "types/u.txt"))?.contentType === accented && s3.object(`${FIRM_A}/types/u.txt`)?.contentType === "application/octet-stream" && s3.object(`${FIRM_A}/types/t.txt`)?.contentType === "application/octet-stream");
    ok("R1.65 PF-F1 r2-m2 fail: the same type without its space, or another type, is FileKeyTaken (as LocalFiles and the fake)", await refused(() => files.put(FIRM_A, "types/t.txt", bytesOf("t"), exact.trim()), (e) => e instanceof FileKeyTaken) && await refused(() => files.put(FIRM_A, "types/t.txt", bytesOf("t"), "text/csv"), (e) => e instanceof FileKeyTaken) && await refused(() => files.put(FIRM_A, "types/u.txt", bytesOf("u"), "text/plain; name=ete"), (e) => e instanceof FileKeyTaken));
    const local = new LocalFiles(join(WORK, "types-local"));
    await local.put(FIRM_A, "types/t.txt", bytesOf("t"), exact);
    ok("R1.65 PF-F1 r2-m2 pass: LocalFiles answers the same way for the same puts (one rule for both adapters)", (await local.get(FIRM_A, "types/t.txt"))?.contentType === exact && await refused(() => local.put(FIRM_A, "types/t.txt", bytesOf("t"), exact.trim()), (e) => e instanceof FileKeyTaken));
    s3.failNext("PUT", "NoSuchBucket");
    let putSaid = "";
    try { await files.put(FIRM_A, "types/v.txt", bytesOf("v"), "text/plain"); } catch (e) { putSaid = (e as Error).message; }
    ok("R1.65 PF-F1 r2-m1 fail: a put to a missing bucket (404 NoSuchBucket) fails naming it, not as an unsettled key", putSaid === "files: S3 put failed (NoSuchBucket 404)", putSaid);
    s3.failNext("GET", "NoSuchBucket");
    let said = "";
    try { await files.get(FIRM_A, "planted/ok.txt"); } catch (e) { said = (e as Error).message; }
    ok("R1.65 PF-F1 break m6 fail: a missing bucket (404 NoSuchBucket) is an error, never \"no such file\"", said === "files: S3 get failed (NoSuchBucket 404)", said);
    ok("R1.65 PF-F1 break m6 pass: a missing key (404 NoSuchKey) is still null", await files.get(FIRM_A, "planted/never.txt") === null);
    const sayOf = (f: () => unknown) => { try { f(); return ""; } catch (e) { return (e as Error).message; } };
    const env = { PLATFORM_FILES: "s3", PLATFORM_FILES_BUCKET: BUCKET, PLATFORM_FILES_KMS_KEY_ID: KMS };
    ok("R1.65 PF-F1 break m7 pass: a Canadian region (ca-west-1 with its own key), an alias and a key id are accepted", s3SettingsOf({ ...env, PLATFORM_FILES_REGION: "ca-west-1", PLATFORM_FILES_KMS_KEY_ID: KMS.replace("ca-central-1", "ca-west-1") }).region === "ca-west-1" && !!s3SettingsOf({ ...env, PLATFORM_FILES_KMS_KEY_ID: "alias/expatready-files" }) && !!s3SettingsOf({ ...env, PLATFORM_FILES_KMS_KEY_ID: "00000000-0000-4000-8000-00000000f1f1" }));
    const badBuckets = ["a..b", "192.168.1.1", "xn--bucket", "with.dot", "ends-s3alias", "-lead"], badKeys = ["::::", "AKIAPFF1", "arn:aws:kms:ca-central-1:000000000000:key/nope"];
    ok("R1.65 PF-F1 break m7 fail: a bucket name S3 forbids or a dotted one, a value that is no KMS key, a region outside Canada, or a key in another region, refuses to start", badBuckets.every((b) => /PLATFORM_FILES_BUCKET must be/.test(sayOf(() => s3SettingsOf({ ...env, PLATFORM_FILES_BUCKET: b })))) && badKeys.every((k) => /PLATFORM_FILES_KMS_KEY_ID must be a KMS key/.test(sayOf(() => s3SettingsOf({ ...env, PLATFORM_FILES_KMS_KEY_ID: k })))) && ["us-east-1", "eu-west-1"].every((r) => /must be a region in Canada/.test(sayOf(() => s3SettingsOf({ ...env, PLATFORM_FILES_REGION: r })))) && /in the bucket's region/.test(sayOf(() => s3SettingsOf({ ...env, PLATFORM_FILES_REGION: "ca-west-1" }))) && /stays in Canada/.test(sayOf(() => new S3Files({ bucket: BUCKET, kmsKeyId: KMS, region: "us-east-1" }))) && /in the bucket's region/.test(sayOf(() => new S3Files({ bucket: BUCKET, kmsKeyId: KMS, region: "ca-west-1" }))));
    ok("R1.65 PF-F1 break m8 fail: production written in any case, with spaces, or as prod refuses to start when PLATFORM_FILES is unset", [{ NODE_ENV: "Production" }, { NODE_ENV: " production" }, { NODE_ENV: "prod" }, { PLATFORM_ENVIRONMENT: "PRODUCTION" }].every((e) => /PLATFORM_FILES is not set/.test(sayOf(() => filesAdapterOf(e)))));
    ok("R1.65 PF-F1 break m8 pass: test, development and local still default to the local adapter", ["test", "development", "local", "productionish"].every((v) => filesAdapterOf({ NODE_ENV: v, PLATFORM_ENVIRONMENT: v }) === "local"));
  }

  // The port-contract guard sees S3Files and its contract call.
  const guard = spawnSync(process.execPath, [join(STUDIO, "tools/check-port-contracts.mjs"), "--list"], { encoding: "utf8" });
  ok("R1.65 PF-F1 guard: tools/check-port-contracts.mjs exits 0 and lists S3Files under FilesPort", guard.status === 0 && /S3Files/.test(guard.stdout), (guard.stdout + guard.stderr).slice(-400));
} finally { rmSync(WORK, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
