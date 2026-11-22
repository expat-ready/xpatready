// PF-F1b (R1.65): the server uses the file store PLATFORM_FILES names. PF-F1's chooser is bound in one place
// (api/src/platform/files/choose.ts `filesProviders` and `boundFiles`), which the six feature files that bound
// `LocalFiles` themselves now use; EntitledFiles (PF-15) wraps whichever store is bound. The row's four cases, each with
// a pass and a fail, on Nest contexts built from the features' own provider lists, on the recorded fake S3 client (no
// network, no AWS, no database: the database is a stub that only proves the storage-limit check was reached). US$0.
//   tsx studio/tests/check_pff1b_bind.ts
import "reflect-metadata";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

const STUDIO = join(import.meta.dirname, ".."), WORK = join(STUDIO, "var", `pff1b-check-${process.pid}`);
// Set before anything reads the configuration (it is read once per process): a local server with the link key.
process.env.PLATFORM_ENVIRONMENT = "local";
process.env.PLATFORM_FILES_LINK_KEY = randomBytes(32).toString("base64");
process.env.FO_FILES_DIR = join(WORK, "files");
delete process.env.PLATFORM_FILES; delete process.env.NODE_ENV;

const { FileKeyTaken } = await import("../ports/files.ts");
const { LocalFiles, FileLinks } = await import("../api/src/front-office/files.ts");
const { S3Files, S3FileLinks, DEFAULT_FILES_REGION } = await import("../api/src/platform/files/s3-files.ts");
const { filesProviders, boundFiles, RECORDED_S3 } = await import("../api/src/platform/files/choose.ts");
const { EntitledFiles } = await import("../api/src/platform/entitlements/storage.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { Db } = await import("../api/src/core.ts");
const { registerFeatures } = await import("../api/src/features.ts");
const { fakeS3 } = await import("./fixtures/pff1-s3/fake-s3.ts");
const { runContract } = await import("../ports/contracts/contract.ts");
const { filesPortContract } = await import("../ports/contracts/files-port.contract.ts");

const FIRM_A = "0c0c0c0c-0000-4000-8000-0000000000a1", FIRM_B = "0c0c0c0c-0000-4000-8000-0000000000b2", PERSON = "5a5a5a5a-0000-4000-8000-000000000001";
const BUCKET = "pff1b-recorded-bucket", KMS = "arn:aws:kms:ca-central-1:000000000000:key/00000000-0000-4000-8000-00000000f1f1";
const S3_ENV = { PLATFORM_FILES: "s3", PLATFORM_FILES_BUCKET: BUCKET, PLATFORM_FILES_KMS_KEY_ID: KMS };
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail)?.slice(0, 500)}` : ""}`); };
const refused = async (f: () => unknown, test: (e: unknown) => boolean = () => true) => { try { await f(); return false; } catch (e) { return test(e); } };
const bytesOf = (s: string) => new TextEncoder().encode(s);
const FEATURES = ["front-office-identity-check", "front-office-retainers", "platform-branding", "platform-entitlements", "platform-messages", "platform-support"];
type Provider = { provide?: unknown; useFactory?: (...a: never[]) => unknown } | (new (...a: never[]) => unknown);

/** The database stub: any use throws, so a put that reaches PF-15's storage-limit check is seen (and nothing else is). */
class DbReached extends Error {}
const stubDb = new Proxy({}, { get: (_t, p) => (typeof p !== "string" || p === "then" || /^on(Module|Application)/.test(p) || p.startsWith("before") ? undefined : () => { throw new DbReached(p); }) });   // Nest's lifecycle hooks pass through
/** A Nest context of the files bindings as the app merges them: the shared providers once, then the retainers' own. */
/** The six features re-exported, one line each, in a folder of their own: `registerFeatures` (main.ts's own merge) reads
 *  it, so the provider order below is the app's (review M2): each object once, in file order, a later one wins a name. */
const FEATURE_DIR = join(WORK, "features");
mkdirSync(FEATURE_DIR, { recursive: true });
for (const f of FEATURES) writeFileSync(join(FEATURE_DIR, `${f}.ts`), `export { default } from ${JSON.stringify(join(STUDIO, "api/src/features", `${f}.ts`))};\n`);
/** PF-18b's own test builds its app from the support feature alone, with no PLATFORM_ENVIRONMENT (platform-messages reads
 *  the configuration at import on main, so an app holding it needs the environment with or without this row). */
const SUPPORT_ONLY = join(WORK, "features-support");
mkdirSync(SUPPORT_ONLY, { recursive: true });
writeFileSync(join(SUPPORT_ONLY, "platform-support.ts"), `export { default } from ${JSON.stringify(join(STUDIO, "api/src/features/platform-support.ts"))};\n`);
/** The merged module's files bindings (LocalFiles and S3FileLinks, in the app's order) on PlatformClock and the stub database. */
async function appFiles(): Promise<Provider[]> {
  class AppLike {}
  await registerFeatures(AppLike, FEATURE_DIR);
  return (Reflect.getMetadata("providers", AppLike) as Provider[]).filter((p) => typeof p === "object" && (p.provide === LocalFiles || p.provide === S3FileLinks));
}
async function context(clock: new () => { now(): number } = PlatformClock) {
  class FilesOnly {}
  Module({ providers: [...await appFiles(), { provide: PlatformClock, useClass: clock }, { provide: Db, useValue: stubDb }] as never })(FilesOnly);
  return NestFactory.createApplicationContext(FilesOnly, { logger: false, abortOnError: false });
}
const withEnv = async <T>(env: Record<string, string | undefined>, f: () => Promise<T>): Promise<T> => {
  const before = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(env)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  try { return await f(); } finally { for (const [k, v] of Object.entries(before)) v === undefined ? delete process.env[k] : (process.env[k] = v); }
};

mkdirSync(WORK, { recursive: true });
try {
  // The binding is in one place: every feature that bound the store now takes it from choose.ts.
  const features = Object.fromEntries(await Promise.all(FEATURES.map(async (f) => [f, (await import(`../api/src/features/${f}.ts`)).default as { providers: Provider[] }])));
  const src = Object.fromEntries(FEATURES.map((f) => [f, readFileSync(join(STUDIO, "api/src/features", `${f}.ts`), "utf8")]));
  /** A feature that binds its own store: it makes a LocalFiles, or lists the LocalFiles class as a provider. */
  const bindsOwnStore = (text: string, providers: readonly unknown[]) => /new LocalFiles\(/.test(text) || providers.includes(LocalFiles);
  ok("R1.65 PF-F1b one place pass: none of the six feature files makes or provides LocalFiles itself any more", FEATURES.every((f) => !bindsOwnStore(src[f]!, features[f]!.providers)), FEATURES.filter((f) => bindsOwnStore(src[f]!, features[f]!.providers)));
  ok("R1.65 PF-F1b one place pass: the features that injected the store by name take the one shared provider list (the same objects), the rest call boundFiles()", ["front-office-identity-check", "platform-branding", "platform-support"].every((f) => filesProviders.every((p: unknown) => features[f]!.providers.includes(p as Provider))) && ["platform-entitlements", "platform-messages", "front-office-retainers"].every((f) => /boundFiles\(\)/.test(src[f]!)));
  ok("R1.65 PF-F1b one place fail: the scan finds a feature as it was before (main's identity-check and messages lines)", bindsOwnStore("", [LocalFiles, FileLinks]) && bindsOwnStore("const files = new LocalFiles();", []) && !bindsOwnStore("const files = boundFiles();", [...filesProviders]));
  // The shared FilesPort contract (P-606 (8); the port-contract guard): EntitledFiles over each store, with a database
  // whose limit is Unlimited (null), and boundFiles in each mode, each make an empty store.
  const unlimited = { $queryRaw: async () => [{ firmId: FIRM_A, code: "sample", name: "Sample", seats: null, value: null, hasRow: true, hard: false }] };
  const recordedS3 = () => { (globalThis as Record<symbol, unknown>)[RECORDED_S3] = { requestHandler: fakeS3({ bucket: BUCKET, region: DEFAULT_FILES_REGION, requireKmsKeyId: KMS }).handler }; };
  const contracts = [
    await runContract(filesPortContract, "EntitledFiles", () => new EntitledFiles(unlimited as never, () => Date.now(), null, join(WORK, "c-entitled", randomBytes(6).toString("hex"))), null),
    await withEnv(S3_ENV, async () => runContract(filesPortContract, "EntitledFiles over S3Files", () => { recordedS3(); return new EntitledFiles(unlimited as never, () => Date.now(), null, boundFiles()); }, null)),
    await withEnv({ PLATFORM_FILES: "local" }, async () => runContract(filesPortContract, "boundFiles", () => { process.env.FO_FILES_DIR = join(WORK, "c-bound", randomBytes(6).toString("hex")); return boundFiles(); }, null)),
    await withEnv(S3_ENV, async () => runContract(filesPortContract, "boundFiles (s3)", () => { recordedS3(); return boundFiles(); }, null)),
  ];
  delete (globalThis as Record<symbol, unknown>)[RECORDED_S3]; process.env.FO_FILES_DIR = join(WORK, "files");
  for (const r of contracts) ok(`R1.65 PF-F1b contract: ${r.adapter} keeps every case of the FilesPort contract`, r.failed.length === 0 && r.passed.length >= 11, r.failed);


  // Case 1: unset outside production gives the local adapter.
  {
    const app = await context();
    const store = app.get(LocalFiles) as unknown as InstanceType<typeof EntitledFiles>, links = app.get(S3FileLinks, { strict: false });
    const inner = store.store;
    ok("R1.65 PF-F1b case 1 pass: PLATFORM_FILES unset (not production): the bound store is EntitledFiles over FO-5's LocalFiles, and no S3 links are bound", store instanceof EntitledFiles && inner instanceof LocalFiles && links === null, { store: store?.constructor?.name, inner: inner?.constructor?.name, links });
    const put = await store.put(FIRM_A, "bind/known.txt", bytesOf("local"), "text/plain").catch((e) => e);
    ok("R1.65 PF-F1b case 1 pass: a new key through the bound store reaches PF-15's storage-limit check (the database stub is asked)", put instanceof DbReached, put?.constructor?.name);
    await (inner as InstanceType<typeof LocalFiles>).put(FIRM_A, "bind/known.txt", bytesOf("local"), "text/plain");
    ok("R1.65 PF-F1b case 1 pass: a retry of a stored key skips the limit check and is accepted (PF-15 break m4 kept)", (await store.put(FIRM_A, "bind/known.txt", bytesOf("local"), "text/plain")).key === "bind/known.txt");
    await inner.delete(FIRM_A, "bind/known.txt");
    ok("R1.65 PF-F1b case 1 fail: a retired key still gives FileKeyTaken, never the storage limit", await refused(() => store.put(FIRM_A, "bind/known.txt", bytesOf("local"), "text/plain"), (e) => e instanceof FileKeyTaken));
    const seen = fakeS3({ bucket: BUCKET, region: DEFAULT_FILES_REGION, requireKmsKeyId: KMS });
    (globalThis as Record<symbol, unknown>)[RECORDED_S3] = { requestHandler: seen.handler };
    ok("R1.65 PF-F1b case 1 fail: with PLATFORM_FILES unset nothing goes to S3 even when an S3 client is at hand", boundFiles() instanceof LocalFiles && seen.seen.length === 0);
    delete (globalThis as Record<symbol, unknown>)[RECORDED_S3];
    await app.close();
  }

  // Case 2: PLATFORM_FILES=s3 with the recorded fake client serves a put and a get through the bound port.
  {
    const s3 = fakeS3({ bucket: BUCKET, region: DEFAULT_FILES_REGION, requireKmsKeyId: KMS });
    (globalThis as Record<symbol, unknown>)[RECORDED_S3] = { requestHandler: s3.handler };
    await withEnv(S3_ENV, async () => {
      const app = await context();
      const store = app.get(LocalFiles) as unknown as InstanceType<typeof EntitledFiles>, inner = store.store;
      ok("R1.65 PF-F1b case 2 pass: PLATFORM_FILES=s3: the bound store is EntitledFiles over S3Files in ca-central-1", store instanceof EntitledFiles && inner instanceof S3Files && (inner as InstanceType<typeof S3Files>).region === "ca-central-1", inner?.constructor?.name);
      await inner.put(FIRM_A, "bind/doc.pdf", bytesOf("the client's copy"), "application/pdf");
      const retry = await store.put(FIRM_A, "bind/doc.pdf", bytesOf("the client's copy"), "application/pdf"), got = await store.get(FIRM_A, "bind/doc.pdf");
      ok("R1.65 PF-F1b case 2 pass: a put and a get through the bound port reach the bucket (KMS-encrypted, under the firm's prefix)", retry.key === "bind/doc.pdf" && new TextDecoder().decode(got!.bytes) === "the client's copy" && s3.object(`${FIRM_A}/bind/doc.pdf`)?.kmsKeyId === KMS && s3.seen.some((r) => r.method === "GET" && r.key === `${FIRM_A}/bind/doc.pdf`));
      const fresh = await store.put(FIRM_A, "bind/new.pdf", bytesOf("new"), "application/pdf").catch((e) => e);
      ok("R1.65 PF-F1b case 2 pass: a new key on S3 reaches PF-15's storage-limit check too (the limit is not lost on S3)", fresh instanceof DbReached && s3.object(`${FIRM_A}/bind/new.pdf`) === null, fresh?.constructor?.name);
      await inner.delete(FIRM_A, "bind/doc.pdf");
      ok("R1.65 PF-F1b case 2 fail: on S3 a retired key gives FileKeyTaken, never the limit check; another firm reads the key as absent", await refused(() => store.put(FIRM_A, "bind/doc.pdf", bytesOf("the client's copy"), "application/pdf"), (e) => e instanceof FileKeyTaken) && await store.get(FIRM_B, "bind/doc.pdf") === null);
      const links = app.get(S3FileLinks, { strict: false });
      ok("R1.65 PF-F1b case 2 pass: in the app's provider order the S3 download links are bound on S3, over the store's own S3Files (review M1, break B1 and r2 m2)", links instanceof S3FileLinks && (links as unknown as { files: unknown }).files === inner, { links: links?.constructor?.name ?? null, sameStore: (links as unknown as { files?: unknown } | null)?.files === inner });
      ok("R1.65 PF-F1b case 2 fail: the same app with PLATFORM_FILES=local sends nothing to the bucket", await withEnv({ PLATFORM_FILES: "local" }, async () => { const n = s3.seen.length; const f = boundFiles(); await f.put(FIRM_A, "bind/l.txt", bytesOf("l"), "text/plain"); return f instanceof LocalFiles && s3.seen.length === n; }));
      await app.close();
    });
    delete (globalThis as Record<symbol, unknown>)[RECORDED_S3];
  }

  // Case 3: production with PLATFORM_FILES unset refuses to start (a real process building the Nest context).
  {
    const start = join(WORK, "start.ts");
    writeFileSync(start, [
      `import "reflect-metadata";`,
      `import { Module } from "@nestjs/common"; import { NestFactory } from "@nestjs/core";`,
      `import { LocalFiles } from ${JSON.stringify(join(STUDIO, "api/src/front-office/files.ts"))};`,
      `import { S3FileLinks } from ${JSON.stringify(join(STUDIO, "api/src/platform/files/s3-files.ts"))};`,
      `import { registerFeatures } from ${JSON.stringify(join(STUDIO, "api/src/features.ts"))};`,
      `import { PlatformClock } from ${JSON.stringify(join(STUDIO, "api/src/platform/identity/port.ts"))};`,
      `class AppLike {} await registerFeatures(AppLike, process.env.PFF1B_FEATURES || ${JSON.stringify(FEATURE_DIR)});`,
      `const files = Reflect.getMetadata("providers", AppLike).filter((p) => typeof p === "object" && (p.provide === LocalFiles || p.provide === S3FileLinks));`,
      `import { Db } from ${JSON.stringify(join(STUDIO, "api/src/core.ts"))};`,
      `class App {} Module({ providers: [...files, PlatformClock, { provide: Db, useValue: {} }] })(App);`,
      `const app = await NestFactory.createApplicationContext(App, { logger: false, abortOnError: false }); console.log("STARTED"); await app.close();`,
    ].join("\n"));
    const run = (env: Record<string, string>) => spawnSync(join(STUDIO, "node_modules/.bin/tsx"), ["--tsconfig", join(STUDIO, "api/tsconfig.json"), start], { cwd: STUDIO, encoding: "utf8", env: { ...process.env, PLATFORM_FILES: "", NODE_ENV: "", PLATFORM_FILES_LINK_KEY: "", ...env } });
    const prod = run({ NODE_ENV: "production" });
    ok("R1.65 PF-F1b case 3 fail: production with PLATFORM_FILES unset refuses to start (exit non-zero, never STARTED, the setting named)", prod.status !== 0 && !/STARTED/.test(prod.stdout) && /PLATFORM_FILES is not set/.test(prod.stderr), { status: prod.status, err: prod.stderr.slice(0, 600) });
    const noKey = run({ NODE_ENV: "production", ...S3_ENV });
    ok("R1.65 PF-F1b case 3 fail: production with PLATFORM_FILES=s3 and no link key refuses to start, naming PLATFORM_FILES_LINK_KEY", noKey.status !== 0 && !/STARTED/.test(noKey.stdout) && /PLATFORM_FILES_LINK_KEY/.test(noKey.stderr), { status: noKey.status, err: noKey.stderr.slice(0, 600) });
    const local = run({ NODE_ENV: "production", PLATFORM_FILES: "local", FO_FILES_DIR: join(WORK, "prod-local") });
    ok("R1.65 PF-F1b case 3 pass: production with PLATFORM_FILES=local starts (no link key needed)", local.status === 0 && /STARTED/.test(local.stdout), { status: local.status, err: local.stderr.slice(0, 600) });
    const noEnv = run({ PLATFORM_ENVIRONMENT: "", PFF1B_FEATURES: SUPPORT_ONLY });
    ok("R1.65 PF-F1b case 3 pass: an app built from one feature with PLATFORM_ENVIRONMENT unset (as FO-13i's and PF-18b's tests build theirs) still starts on the local adapter: unset is the server loader's refusal, not the binding's", noEnv.status === 0 && /STARTED/.test(noEnv.stdout), { status: noEnv.status, err: noEnv.stderr.slice(0, 600) });
    const noEnvProd = run({ PLATFORM_ENVIRONMENT: "", NODE_ENV: "production", PFF1B_FEATURES: SUPPORT_ONLY });
    ok("R1.65 PF-F1b case 3 fail: the same with NODE_ENV=production and PLATFORM_FILES unset still refuses to start", noEnvProd.status !== 0 && !/STARTED/.test(noEnvProd.stdout) && /PLATFORM_FILES is not set/.test(noEnvProd.stderr), { status: noEnvProd.status, err: noEnvProd.stderr.slice(0, 600) });
    const badKey = run({ PLATFORM_FILES_LINK_KEY: "too short" });
    ok("R1.65 PF-F1b case 3 fail: any other configuration fault (a malformed link key) still stops the start-up, naming the setting", badKey.status !== 0 && !/STARTED/.test(badKey.stdout) && /PLATFORM_FILES_LINK_KEY/.test(badKey.stderr), { status: badKey.status, err: badKey.stderr.slice(0, 600) });
    const dev = run({});
    ok("R1.65 PF-F1b case 3 pass: outside production, unset starts on the local adapter", dev.status === 0 && /STARTED/.test(dev.stdout), { status: dev.status, err: dev.stderr.slice(0, 600) });
    ok("R1.65 PF-F1b case 3 fail: the recorded S3 client is refused in production (a test seam never reaches a real server)", await withEnv({ NODE_ENV: "production", ...S3_ENV }, async () => { (globalThis as Record<symbol, unknown>)[RECORDED_S3] = { requestHandler: {} }; try { return await refused(() => boundFiles(), (e) => /recorded S3 client/.test(String(e))); } finally { delete (globalThis as Record<symbol, unknown>)[RECORDED_S3]; } }));
  }

  // Round 1's Minors (break m2, m3, m4).
  {
    const seam = (environment: string) => { (globalThis as Record<symbol, unknown>)[RECORDED_S3] = { requestHandler: {} }; try { boundFiles({ ...S3_ENV, PLATFORM_ENVIRONMENT: environment }); return "used"; } catch (e) { return String(e); } finally { delete (globalThis as Record<symbol, unknown>)[RECORDED_S3]; } };
    ok("R1.65 PF-F1b break m2 fail: the recorded S3 client is refused on the AWS test environment and production, honoured only on a local server", /refused outside PLATFORM_ENVIRONMENT=local/.test(seam("test")) && /refused outside/.test(seam("production")) && seam("local") === "used");
    const { loadPlatformConfig } = await import("../api/src/platform/config/settings.ts");
    const keyOk = (v: string) => { try { loadPlatformConfig({ PLATFORM_ENVIRONMENT: "local", PLATFORM_FILES_LINK_KEY: v }); return true; } catch (e) { return /PLATFORM_FILES_LINK_KEY/.test(String(e)) ? false : String(e); } };
    ok("R1.65 PF-F1b break m4 fail: a link key of one repeated character, or under 32 characters, is refused at start; a random one is accepted", keyOk("a".repeat(40)) === false && keyOk(randomBytes(12).toString("base64")) === false && keyOk(randomBytes(32).toString("base64")) === true);
    const key = randomBytes(32).toString("base64"), { Secret } = await import("../api/src/platform/config/secret.ts"), { inspect } = await import("node:util");
    const links = new S3FileLinks({ exists: async () => true, signedGetUrl: async () => "" }, new Secret("PLATFORM_FILES_LINK_KEY", key), () => Date.now());
    const dump = inspect(links, { depth: 5, showHidden: true }) + JSON.stringify(links);
    const kb = [...Buffer.from(key, "utf8").subarray(0, 6)], spaced = kb.map((b) => b.toString(16).padStart(2, "0")).join(" "), decimal = kb.join(",");
    const old = inspect({ macKey: Buffer.from(key, "utf8") }) + JSON.stringify({ macKey: Buffer.from(key, "utf8") });   // the leak round 1 found
    ok("R1.65 PF-F1b break m3 fail: a dump of the bound links never shows the key: not its text, its bytes as inspect prints them (spaced hex) or as JSON does (decimal); the same check sees the old Buffer leak", !dump.includes(key) && !dump.replace(/\s+/g, " ").includes(spaced) && !dump.includes(decimal) && !/Buffer/.test(dump) && old.includes(spaced) && old.includes(decimal) && links.sign(FIRM_A, PERSON, "a/b.txt").token.length > 40);
  }

  // Case 4: a link opened through the bound links for another firm gives 404.
  {
    let nowMs = Date.UTC(2026, 10, 22, 12, 0, 0);
    const s3 = fakeS3({ bucket: BUCKET, region: DEFAULT_FILES_REGION, requireKmsKeyId: KMS, now: () => nowMs });
    (globalThis as Record<symbol, unknown>)[RECORDED_S3] = { requestHandler: s3.handler };
    await withEnv(S3_ENV, async () => {
      class Clock { now() { return nowMs; } }
      const linked = await context(Clock);
      const links = linked.get(S3FileLinks), store = linked.get(LocalFiles) as unknown as InstanceType<typeof EntitledFiles>;
      await store.store.put(FIRM_A, "signed/s.pdf", bytesOf("signed"), "application/pdf");
      const l = links.sign(FIRM_A, PERSON, "signed/s.pdf");
      ok("R1.65 PF-F1b case 4 pass: the bound links open the firm's own link (200, an address on the bucket that ends with the link)", links instanceof S3FileLinks && (await links.open(l.token, FIRM_A, PERSON)).status === 200);
      ok("R1.65 PF-F1b case 4 fail: the same link opened for another firm gives 404", JSON.stringify(await links.open(l.token, FIRM_B, PERSON)) === `{"status":404}`);
      nowMs += 300_000;
      ok("R1.65 PF-F1b case 4 fail: past 5 minutes on the bound clock it gives 404", (await links.open(l.token, FIRM_A, PERSON)).status === 404);
      await linked.close();
    });
    delete (globalThis as Record<symbol, unknown>)[RECORDED_S3];
    const local = new FileLinks(randomBytes(32).toString("base64")), t = local.sign(FIRM_A, PERSON, "signed/s.pdf", Date.now());
    ok("R1.65 PF-F1b case 4 fail: on the local adapter the routes' own links (FileLinks) refuse another firm too", (local.check(t.token, FIRM_B, PERSON, Date.now()) as { refused?: string }).refused === "invalid");
  }
} finally { rmSync(WORK, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
