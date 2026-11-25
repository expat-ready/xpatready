// AUD-2 part 2 (map row 97, R1.97; SA-11-5, SA-11-6, SA-11-14, NFR5-08; P-571 (3)): the daily export of the audit chain to
// the write-once archive, the S3 Object Lock adapter on a recorded bucket, and the checker's anchor comparison. DW1-DW8,
// a pass and a fail each.
//   Part A: AuditArchivePort's contract on the fake and on S3AuditArchive over the recorded bucket
//           (tests/fixtures/aud2-s3/), plus the S3 requests themselves. No network, no AWS account (US$0).
//   Part B: a scratch database (every migration): the export, its resume, its walls, and the anchor check.
// Owed (P-821): AUD-2c's real bucket in ca-central-1, one live put and one refused delete in the founder's account.
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_aud2_archive.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeAlerts } from "../ports/alert.ts";
import { ArchiveKeyExists, ArchiveRetained, type AuditArchivePort } from "../ports/audit-archive.ts";
import { runContract } from "../ports/contracts/contract.ts";
import { auditArchivePortContract } from "../ports/contracts/audit-archive-port.contract.ts";
import { ACTIVITY_LOG_YEARS } from "../ports/keep-period.ts";
import { fakeAuditArchive } from "../api/src/platform/audit/write-once/fake.ts";
import { S3AuditArchive, S3AuditArchiveError } from "../api/src/platform/audit/write-once/s3-archive.ts";
import { AuditChainExport } from "../api/src/platform/audit/write-once/daily-export.ts";
import { chooseAuditArchive, RECORDED_ARCHIVE_S3 } from "../api/src/platform/audit/write-once/bind.ts";
import { AuditChainVerifier } from "../api/src/platform/audit/chain/verify.ts";
import { entryHash, ZERO_HASH } from "../api/src/platform/audit/canonical.ts";
import { fakeLockedS3 } from "./fixtures/aud2-s3/fake-s3-lock.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_aud2a_scratch_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const refused = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { return e; } };
const BUCKET = "aud2-recorded-bucket", CREDS = { accessKeyId: "AKIDAUD2RECORDED", secretAccessKey: "aud2-recorded-secret" };
const clockAt = (t0: number) => { let t = t0; return { now: () => new Date(t), advance: (ms: number) => { t += ms; } }; };
const s3Harness = (lockless = false) => {
  const c = clockAt(Date.parse("2026-11-25T06:20:00Z")), bucket = fakeLockedS3({ bucket: BUCKET, region: "ca-central-1", now: c.now, lockless });
  return { bucket, c, archive: new S3AuditArchive({ bucket: BUCKET, credentials: CREDS, requestHandler: bucket.handler as never, now: c.now }) };
};

// ------------------------------------------------------------------------------------- Part A: the two adapters
await runContract(auditArchivePortContract, "fakeAuditArchive", () => { const c = clockAt(Date.parse("2026-11-25T06:20:00Z")); return { archive: fakeAuditArchive(c.now), now: c.now, advance: c.advance }; }, ok);
await runContract(auditArchivePortContract, "S3AuditArchive", () => { const h = s3Harness(); return { archive: h.archive, now: h.c.now, advance: h.c.advance }; }, ok);
{
  const h = s3Harness(), until = new Date(Date.parse("2033-11-25T06:20:00Z"));
  await h.archive.put("audit/c1/2026-11-25-1-3.jsonl", Buffer.from("a\nb\nc\n"), until);
  const put = h.bucket.seen.find((r) => r.method === "PUT")!;
  ok("AUD-2 DW1 pass: the S3 put is write-once and locked: If-None-Match *, Object Lock COMPLIANCE until the date asked, its SHA-256 checksum, to the bucket in ca-central-1",
    put.headers["if-none-match"] === "*" && put.headers["x-amz-object-lock-mode"] === "COMPLIANCE" && Date.parse(put.headers["x-amz-object-lock-retain-until-date"]!) === until.getTime()
      && put.headers["x-amz-checksum-sha256"] === Buffer.from(h.bucket.object("audit/c1/2026-11-25-1-3.jsonl")!.meta.sha256!, "hex").toString("base64"), put.headers);
  const K = "audit/c1/2026-11-25-1-3.jsonl", firstVersion = h.bucket.versions(K)[0]!.id;
  ok("AUD-2 DW1 fail: deleting the locked version straight at the bucket, before the keep-until date, is refused (403)", (await h.bucket.rawDelete(K, firstVersion)) === 403);
  // review M1: a DELETE with no version id is allowed on a versioned bucket and writes a delete marker; a later put then
  // adds a new version. Neither hides or replaces what was written first, as the adapter reads it.
  const marker = await h.bucket.rawDelete(K), reput = await h.bucket.rawPut(K, Buffer.from("forged\n"));
  const after = await h.archive.get(K), listed = await h.archive.list("audit/c1/");
  ok("AUD-2 DW1 fail (review M1): a delete marker and a later put under the same key, sent straight to the bucket, hide nothing: the adapter still lists the key and reads the first bytes",
    marker === 204 && reput === 200 && after?.bytes.toString() === "a\nb\nc\n" && listed.includes(K) && h.bucket.versions(K).length === 3, { marker, reput, got: after?.bytes.toString() });
  ok("AUD-2 DW1 fail (review M1): the adapter refuses to put a key that has any version, even one hidden behind a delete marker", (await refused(() => h.archive.put(K, Buffer.from("again"), until))) instanceof ArchiveKeyExists);
  const lockless = s3Harness(true);
  const e = await refused(() => lockless.archive.put("audit/c1/x.json", Buffer.from("x"), until));
  ok("AUD-2 DW1 fail: a bucket that does not apply the lock is an error after the put (LockNotApplied), never a silent unlocked copy", e instanceof S3AuditArchiveError && e.code === "LockNotApplied", String(e));
  ok("AUD-2 DW1 fail: a bucket outside Canada is refused at start (P-559)", (await refused(async () => new S3AuditArchive({ bucket: BUCKET, region: "us-east-1" }))) instanceof Error);
  const was = process.env.PLATFORM_ENVIRONMENT;
  (globalThis as Record<symbol, unknown>)[RECORDED_ARCHIVE_S3] = { credentials: CREDS, requestHandler: h.bucket.handler };
  const s3 = chooseAuditArchive({ PLATFORM_AUDIT_ARCHIVE: "s3", PLATFORM_AUDIT_ARCHIVE_BUCKET: BUCKET });
  const prod = await refused(async () => chooseAuditArchive({ PLATFORM_AUDIT_ARCHIVE: "s3", PLATFORM_AUDIT_ARCHIVE_BUCKET: BUCKET, PLATFORM_ENVIRONMENT: "production" }));
  delete (globalThis as Record<symbol, unknown>)[RECORDED_ARCHIVE_S3];
  const none = chooseAuditArchive({ PLATFORM_ENVIRONMENT: "production" }), fake = chooseAuditArchive({});
  ok("AUD-2 DW2 pass: PLATFORM_AUDIT_ARCHIVE=s3 binds the S3 adapter (ca-central-1 by default); unset, a local server gets the fake (Sample)", s3.kind === "s3" && (s3.archive as S3AuditArchive).region === "ca-central-1" && fake.kind === "fake", [s3.kind, fake.kind]);
  ok("AUD-2 DW2 fail: production with no S3 archive has none (never the fake); the recorded client is refused outside a local server", none.kind === "none" && none.archive === null && prod instanceof Error, [none.kind, String(prod)]);
  process.env.PLATFORM_ENVIRONMENT = was;
}

// ------------------------------------------------------------------------------------- Part B: the export
execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
try {
  const A = "00000000-0000-4000-8000-0000000a2a01", B = "00000000-0000-4000-8000-0000000a2a02";
  const WS = sql(`insert into workspace (id, key, label) values (gen_random_uuid(), 'aud2-check', 'AUD-2 check lines') returning id`).split("\n")[0];
  const DEMO = sql(`insert into workspace (id, key, label) values (gen_random_uuid(), 'demo', 'Demo (check)') on conflict (key) do update set label = excluded.label returning id`).split("\n")[0];
  const add = (firm: string | null, n: number, ws = WS) => { for (let i = 0; i < n; i++) sql(`insert into audit_event (id, workspace_id, actor, action, entity, summary, detail, firm_id) values (gen_random_uuid(), '${ws}', 'system:aud2', 'check.line', 'aud2', 'Sample line ${i}', '{"n": 1.0, "k": "v"}'::jsonb, ${firm ? `'${firm}'` : "null"})`); };
  const E = "00000000-0000-4000-8000-0000000a2a05";   // a chain of 12 lines, read 2 at a time (break Blocker of part 2: seq sorted as text)
  add(A, 5); add(B, 3); add(null, 2); add(null, 2, DEMO); add(E, 12);
  const c = clockAt(Date.parse("2026-11-25T06:20:00Z"));
  const store = fakeAuditArchive(c.now) as AuditArchivePort & { failPut: boolean };
  const x = new AuditChainExport({ db, archive: store, now: c.now, page: 2 });
  const day1 = await x.run(), keys1 = await store.list("audit/");
  const file = async (k: string) => (await store.get(k))!.bytes.toString("utf8").trim().split("\n").map((l) => JSON.parse(l) as Record<string, string | null>);
  const fa = await file(`audit/${A}/2026-11-25-1-5.jsonl`), fb = await file(`audit/${B}/2026-11-25-1-3.jsonl`);
  ok("AUD-2 DW3 pass: a day's export holds every line of each firm's and the platform's chain once, in seq order, each with its hashes, and one anchor per chain",
    day1.exports.length === 4 && fa.map((l) => l.seq).join() === "1,2,3,4,5" && fb.length === 3 && keys1.filter((k) => k.includes("/anchors/")).length === 4 && fa.every((l) => /^[0-9a-f]{64}$/.test(l.entryHash ?? "")), keys1);
  const fe = await file(`audit/${E}/2026-11-25-1-12.jsonl`);
  ok("AUD-2 DW3 pass: a chain of 12 lines, read in pages of 2, is one file 1-12 in number order (never 1, 10, 11, 12, 2 …)", fe.map((l) => l.seq).join() === "1,2,3,4,5,6,7,8,9,10,11,12", fe.map((l) => l.seq));
  ok("AUD-2 DW3 fail: the demo's sample: chain is not archived (the reset restarts it by design)", !keys1.some((k) => k.startsWith("audit/sample")), keys1);
  ok("AUD-2 DW4 pass: firm A's file holds only firm A's chain; firm B's only B's", fa.every((l) => l.firmId === A && l.chainKey === A) && fb.every((l) => l.firmId === B), [fa.map((l) => l.firmId), fb.map((l) => l.firmId)]);
  const line3 = fa[2]!, rebuilt = entryHash(Buffer.from(fa[1]!.entryHash!, "hex"), { chainKey: A, seq: line3.seq!, id: line3.id!, at: line3.at!, workspaceId: line3.workspaceId!, firmId: line3.firmId, caseId: line3.caseId, combinationId: line3.combinationId, actor: line3.actor!, actorType: line3.actorType!, action: line3.action!, entity: line3.entity!, entityKey: line3.entityKey, summary: line3.summary!, correlationId: line3.correlationId, supportSessionId: line3.supportSessionId, detail: line3.detail });
  ok("AUD-2 DW4 fail: the archived file alone re-verifies (a line's hash recomputed from the file, with no database, matches)", rebuilt.toString("hex") === line3.entryHash && fa[0]!.prevHash === ZERO_HASH.toString("hex"));
  const until = (await store.get(`audit/${A}/2026-11-25-1-5.jsonl`))!.retainUntil;
  ok(`AUD-2 DW5 pass: everything is kept for the activity log's ${ACTIVITY_LOG_YEARS} years (AUD-5's number), from the day it is written`, until.toISOString() === "2033-11-25T06:20:00.000Z", until);
  ok("AUD-2 DW5 fail: an exported file cannot be replaced or deleted inside its keep period", (await refused(() => store.put(`audit/${A}/2026-11-25-1-5.jsonl`, Buffer.from("x"), until))) instanceof ArchiveKeyExists
    && (await refused(() => store.remove(`audit/${A}/2026-11-25-1-5.jsonl`))) instanceof ArchiveRetained);
  add(A, 2);
  const again = await x.run();
  ok("AUD-2 DW6 pass: a second run the same day writes nothing new (today's anchor is there), even with new lines", again.exports.length === 0 && (await store.list("audit/")).length === keys1.length, again);
  c.advance(86_400_000);
  // A crash between the file and its anchor: the anchor's put fails once.
  const flaky: AuditArchivePort = { ...store, put: async (k, b, u) => { if (k.includes("/anchors/") && k.includes(A)) throw new Error("the store did not answer (Sample)"); return store.put(k, b, u); }, get: (k) => store.get(k), list: (p) => store.list(p), remove: (k) => store.remove(k) };
  const crashed = await new AuditChainExport({ db, archive: flaky, now: c.now }).run();
  ok("AUD-2 DW6 fail (break M3): one chain's failure stops no other: firm A is reported failed, every other chain with new lines is exported", crashed.failed.map((y) => y.chainKey).join() === A, crashed);
  c.advance(86_400_000); add(A, 1);   // review M3: the anchor's put failed all of 26 Nov; the run on 27 Nov, with a new line, finishes that file
  const resumed = await x.run(), aFiles = (await store.list(`audit/${A}/`)).filter((k) => k.endsWith(".jsonl"));
  ok("AUD-2 DW6 fail (review M3): a run that stopped after the file and before its anchor resumes on a later day: the file 6-7 and its anchor, no second overlapping file",
    aFiles.join() === `audit/${A}/2026-11-25-1-5.jsonl,audit/${A}/2026-11-26-6-7.jsonl` && resumed.exports.find((e) => e.chainKey === A)?.resumed === true && resumed.failed.length === 0, [aFiles, resumed]);

  // ----------------------------------------------------------------------------------- the anchor in the checker
  const alerts = fakeAlerts(), v = new AuditChainVerifier({ db, alerts, now: c.now, anchors: x });
  const clean = await v.pass("full");
  ok("AUD-2 DW7 pass: with the anchors in the archive, every chain verifies and matches its newest anchor", clean.findings.length === 0, clean.findings);
  // An owner rewrites firm A's line 7 (the exported anchor's line), recomputes it and every later hash, and moves the
  // checker's own record to match (xr_app may write it: part 1's breaker minor 5), so the chain alone verifies again.
  type R7 = { seq: string; id: string; at: string; atype: string; summary: string; detail: string | null };
  const rows7 = await db.$queryRaw<R7[]>`select seq::text seq, id::text id, to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') at, actor_type::text atype, summary, detail::text detail from audit_event where chain_key = ${A} and seq >= 7 order by audit_event.seq`;
  let prevH: Buffer = Buffer.from((await db.$queryRaw<{ h: Uint8Array }[]>`select entry_hash h from audit_event where chain_key = ${A} and seq = 6`)[0]!.h);
  const rechained = rows7.map((r) => {
    const summary = r.seq === "7" ? "Rewritten line (Sample)" : r.summary, prev = prevH;
    prevH = entryHash(prev, { chainKey: A, seq: r.seq, id: r.id, at: r.at, workspaceId: WS, firmId: A, caseId: null, combinationId: null, actor: "system:aud2", actorType: r.atype, action: "check.line", entity: "aud2", entityKey: null, summary, correlationId: null, supportSessionId: null, detail: r.detail });
    return { seq: BigInt(r.seq), summary, prev, hash: prevH };
  });
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`alter table audit_event disable trigger aud_event_no_change`;
    for (const r of rechained) await tx.$executeRaw`update audit_event set summary = ${r.summary}, prev_hash = ${r.prev}, entry_hash = ${r.hash} where chain_key = ${A} and seq = ${r.seq}`;
    await tx.$executeRaw`alter table audit_event enable trigger aud_event_no_change`;
    await tx.$executeRaw`update aud_chain_check c set verified_hash = e.entry_hash from audit_event e where c.chain_key = ${A} and e.chain_key = ${A} and e.seq = c.verified_seq`;
  });
  const noAnchor = await new AuditChainVerifier({ db, alerts: fakeAlerts(), now: c.now }).pass("full");
  const withAnchor = await v.pass("full"), f = withAnchor.findings.find((y) => y.chainKey === A);
  ok("AUD-2 DW7 fail: without the archive the rewritten, re-hashed line, with the checker's own record moved to match, passes the chain check (why the export exists)", !noAnchor.findings.some((y) => y.chainKey === A), noAnchor.findings);
  ok("AUD-2 DW8 pass: with it, the checker reports firm A at the anchor's seq 7 as an anchor mismatch, and one alert with ids only",
    f?.why === "anchor" && f.fromSeq === "7" && alerts.raised.length === 1 && alerts.raised[0]!.detail.entityKey === A && !/Rewritten|Sample line/.test(JSON.stringify(alerts.raised)), [withAnchor.findings, alerts.raised]);
  sql(`begin; alter table audit_event disable trigger aud_event_no_change; delete from audit_event where chain_key = '${B}' and seq = 3; alter table audit_event enable trigger aud_event_no_change;
       update aud_chain_check c set verified_seq = 2, verified_hash = e.entry_hash from audit_event e where c.chain_key = '${B}' and e.chain_key = '${B}' and e.seq = 2; commit;`);
  const tail = await v.pass("full"), fB = tail.findings.find((y) => y.chainKey === B);
  ok("AUD-2 DW8 fail: firm B's newest exported line removed and the checker's record moved back to seq 2 (the chain alone still verifies 1-2) is found against its anchor; firm B's break never marks the platform chain",
    fB?.why === "anchor" && fB.fromSeq === "3" && !tail.findings.some((y) => y.chainKey === "platform"), tail.findings);

  // ----------------------------------------------------------------------------------- the ledger read whole
  const G = "00000000-0000-4000-8000-0000000a2a07", H = "00000000-0000-4000-8000-0000000a2a08", P = "00000000-0000-4000-8000-0000000a2a09";
  add(G, 4); add(H, 4); add(P, 3); c.advance(86_400_000);
  const day4 = await x.run();
  ok("AUD-2 DW9 setup: three more firms exported whole", [G, H, P].every((k) => day4.exports.some((y) => y.chainKey === k)), day4);
  // break M1: a forged newest anchor (another day's name, a higher seq, holding a real hash) hides a rewrite.
  const gHead = (await store.list(`audit/${G}/anchors/`))[0]!, real = JSON.parse((await store.get(gHead))!.bytes.toString()) as { entryHash: string };
  await store.put(`audit/${G}/anchors/2026-12-31-9.json`, Buffer.from(JSON.stringify({ chainKey: G, seq: "4", entryHash: real.entryHash, file: `audit/${G}/2026-11-28-1-4.jsonl`, fileSha256: "0".repeat(64) })), new Date(Date.now() + 86_400_000 * 400));
  const forgedPass = await v.pass("incremental"), fG = forgedPass.findings.find((y) => y.chainKey === G);
  const gExport = await (add(G, 1), c.advance(86_400_000), x.run());
  ok("AUD-2 DW9 fail (break M1): an anchor that is not its file's (a forged one under another name) makes the chain's archive not whole: an anchor finding, and the export refuses that chain while the others go on",
    fG?.why === "anchor" && gExport.failed.some((y) => y.chainKey === G) && !gExport.failed.some((y) => y.chainKey === H), [forgedPass.findings, gExport.failed]);
  // break "not caught": lines after the newest anchor rewritten and re-hashed are never exported as if whole.
  add(H, 2);
  const hRows = await db.$queryRaw<{ seq: string; id: string; at: string; prev: Uint8Array; detail: string | null }[]>`select seq::text seq, id::text id, to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') at, prev_hash prev, detail::text detail from audit_event where chain_key = ${H} and seq >= 5 order by audit_event.seq`;
  const h5 = hRows[0]!, f5 = entryHash(Buffer.from(h5.prev), { chainKey: H, seq: "5", id: h5.id, at: h5.at, workspaceId: WS, firmId: H, caseId: null, combinationId: null, actor: "system:aud2", actorType: "SYSTEM", action: "check.line", entity: "aud2", entityKey: null, summary: "Changed before export (Sample)", correlationId: null, supportSessionId: null, detail: h5.detail });
  sql(`begin; alter table audit_event disable trigger aud_event_no_change; update audit_event set summary = 'Changed before export (Sample)', entry_hash = '\\x${f5.toString("hex")}' where chain_key = '${H}' and seq = 5; alter table audit_event enable trigger aud_event_no_change; commit;`);
  c.advance(86_400_000);
  const hExport = await x.run(), hFiles = (await store.list(`audit/${H}/`)).filter((k) => k.endsWith(".jsonl"));
  ok("AUD-2 DW9 fail (break): a chain whose lines after its anchor no longer link (line 6's prev_hash is not line 5's new hash) is refused, not archived; the chain's files stay 1-4",
    hExport.failed.some((y) => y.chainKey === H && /does not verify from seq 6/.test(y.why)) && hFiles.length === 1, [hExport.failed, hFiles]);
  // review M2: a chain removed whole from the database, with the checker's own record, is still checked from the archive.
  sql(`begin; alter table audit_event disable trigger aud_event_no_change; set local app.audit_sample_reset = 'off'; delete from audit_event where chain_key = '${P}'; alter table audit_event enable trigger aud_event_no_change; delete from aud_chain_check where chain_key = '${P}'; commit;`);
  const gone = await v.pass("full"), fP = gone.findings.find((y) => y.chainKey === P);
  ok("AUD-2 DW10 fail (review M2): a chain deleted whole with its check row is still found from its archive (an anchor finding at seq 3)", fP?.why === "anchor" && fP.fromSeq === "3", gone.findings);
  // break M4: a bucket that does not apply the lock never ends with unlocked exports, however many runs.
  const lk = s3Harness(true), lx = new AuditChainExport({ db, archive: lk.archive, now: c.now });
  const r1 = await lx.run(), r2 = await lx.run(), r3 = await lx.run();
  ok("AUD-2 DW10 fail (break M4): with a bucket that does not lock, every run refuses every chain (LockNotApplied, then 'not kept until a future date'); no anchor is ever written",
    [r1, r2, r3].every((r) => r.exports.length === 0 && r.failed.length > 0) && !lk.bucket.seen.some((y) => y.method === "PUT" && y.key.includes("/anchors/")), [r1.failed.slice(0, 2), r3.failed.slice(0, 2)]);

  // break R3: a pending file planted in the archive (it links on from the last anchor) is anchored only if it is the
  // database's own lines.
  add(E, 2); c.advance(86_400_000);
  const eAnchor = JSON.parse((await store.get((await store.list(`audit/${E}/anchors/`)).at(-1)!))!.bytes.toString()) as { seq: string; entryHash: string };
  const eReal = await db.$queryRaw<{ seq: string; id: string; at: string; detail: string | null }[]>`select seq::text seq, id::text id, to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') at, detail::text detail from audit_event where chain_key = ${E} and seq > ${BigInt(eAnchor.seq)} order by audit_event.seq`;
  let ph = eAnchor.entryHash;
  const planted = eReal.map((r) => {
    const l = { chainKey: E, seq: r.seq, id: r.id, at: r.at, workspaceId: WS, firmId: E, caseId: null, combinationId: null, actor: "system:aud2", actorType: "SYSTEM", action: "check.line", entity: "aud2", entityKey: null, summary: "Planted (Sample)", correlationId: null, supportSessionId: null, detail: r.detail, prevHash: ph, entryHash: "" };
    l.entryHash = entryHash(Buffer.from(ph, "hex"), l).toString("hex"); ph = l.entryHash; return l;
  });
  const pKey = `audit/${E}/2026-11-20-${eReal[0]!.seq}-${eReal.at(-1)!.seq}.jsonl`;
  await store.put(pKey, Buffer.from(planted.map((l) => `${JSON.stringify(l)}\n`).join("")), new Date(Date.now() + 86_400_000 * 400));
  const r3x = await x.run();
  ok("AUD-2 DW10 fail (break R3): a pending file planted in the archive that links on from the last anchor, but is not the database's lines, is never anchored",
    r3x.failed.some((y) => y.chainKey === E && /is not the database's lines/.test(y.why)) && !(await store.list(`audit/${E}/anchors/`)).some((n) => n.endsWith(`-${eReal.at(-1)!.seq}.json`)), r3x.failed);

  // break R1: the 30-minute check's archive reads do not grow with the archive: one listing and the newest anchor a chain.
  let gets = 0, lists = 0;
  const counted: AuditArchivePort = { put: (k, b, u) => store.put(k, b, u), get: (k) => { gets++; return store.get(k); }, list: (p) => { lists++; return store.list(p); }, remove: (k) => store.remove(k) };
  const cx = new AuditChainExport({ db, archive: counted, now: c.now }), cv = new AuditChainVerifier({ db, alerts: fakeAlerts(), now: c.now, anchors: cx });
  const anchorsNow = (await store.list("audit/")).filter((k) => k.includes("/anchors/")).length;
  await cv.pass("incremental");
  const incGets = gets, incLists = lists, chainsArchived = new Set((await store.list("audit/")).map((k) => k.split("/")[1])).size;
  gets = 0; lists = 0; await cv.pass("full");
  ok(`AUD-2 DW10 pass (break R1): the 30-minute check reads at most one anchor and makes one listing per archived chain (${incGets} reads, ${incLists} listings for ${chainsArchived} chains and ${anchorsNow} anchors); the weekly one reads every anchor`,
    incGets <= chainsArchived && incLists <= chainsArchived && gets >= anchorsNow, { incGets, incLists, chainsArchived, anchorsNow, fullGets: gets });
} finally {
  await db.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
