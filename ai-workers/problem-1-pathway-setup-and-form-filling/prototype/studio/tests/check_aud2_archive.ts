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
  ok("AUD-2 DW1 fail: a DELETE sent straight to the bucket before the keep-until date is refused (403), whatever the adapter says", (await h.bucket.rawDelete("audit/c1/2026-11-25-1-3.jsonl")) === 403);
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
  add(A, 5); add(B, 3); add(null, 2); add(null, 2, DEMO);
  const c = clockAt(Date.parse("2026-11-25T06:20:00Z"));
  const store = fakeAuditArchive(c.now) as AuditArchivePort & { failPut: boolean };
  const x = new AuditChainExport({ db, archive: store, now: c.now, page: 2 });
  const day1 = await x.run(), keys1 = await store.list("audit/");
  const file = async (k: string) => (await store.get(k))!.bytes.toString("utf8").trim().split("\n").map((l) => JSON.parse(l) as Record<string, string | null>);
  const fa = await file(`audit/${A}/2026-11-25-1-5.jsonl`), fb = await file(`audit/${B}/2026-11-25-1-3.jsonl`);
  ok("AUD-2 DW3 pass: a day's export holds every line of each firm's and the platform's chain once, in seq order, each with its hashes, and one anchor per chain",
    day1.exports.length === 3 && fa.map((l) => l.seq).join() === "1,2,3,4,5" && fb.length === 3 && keys1.filter((k) => k.includes("/anchors/")).length === 3 && fa.every((l) => /^[0-9a-f]{64}$/.test(l.entryHash ?? "")), keys1);
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
  const crashed = await refused(() => new AuditChainExport({ db, archive: flaky, now: c.now }).run());
  const resumed = await x.run(), aFiles = (await store.list(`audit/${A}/`)).filter((k) => k.endsWith(".jsonl"));
  ok("AUD-2 DW6 fail: a run that stopped after the file and before its anchor resumes the next time: one file 6-7, its anchor, no second file",
    crashed instanceof Error && aFiles.join() === `audit/${A}/2026-11-25-1-5.jsonl,audit/${A}/2026-11-26-6-7.jsonl` && resumed.exports.find((e) => e.chainKey === A)?.resumed === true, [aFiles, resumed]);

  // ----------------------------------------------------------------------------------- the anchor in the checker
  const alerts = fakeAlerts(), v = new AuditChainVerifier({ db, alerts, now: c.now, anchors: x });
  const clean = await v.pass("full");
  ok("AUD-2 DW7 pass: with the anchors in the archive, every chain verifies and matches its newest anchor", clean.findings.length === 0, clean.findings);
  // An owner rewrites firm A's line 7 (the exported head) and recomputes its hash, so the chain itself verifies again.
  const row = (await db.$queryRaw<{ id: string; at: string; prev: Uint8Array; detail: string | null }[]>`select id::text id, to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') at, prev_hash prev, detail::text detail from audit_event where chain_key = ${A} and seq = 7`)[0]!;
  const forged = entryHash(Buffer.from(row.prev), { chainKey: A, seq: "7", id: row.id, at: row.at, workspaceId: WS, firmId: A, caseId: null, combinationId: null, actor: "system:aud2", actorType: "SYSTEM", action: "check.line", entity: "aud2", entityKey: null, summary: "Rewritten line (Sample)", correlationId: null, supportSessionId: null, detail: row.detail });
  sql(`begin; alter table audit_event disable trigger aud_event_no_change; update audit_event set summary = 'Rewritten line (Sample)', entry_hash = '\\x${forged.toString("hex")}' where chain_key = '${A}' and seq = 7; alter table audit_event enable trigger aud_event_no_change; commit;`);
  const noAnchor = await new AuditChainVerifier({ db, alerts: fakeAlerts(), now: c.now }).pass("full");
  const withAnchor = await v.pass("full"), f = withAnchor.findings.find((y) => y.chainKey === A);
  ok("AUD-2 DW7 fail: without the archive the rewritten, re-hashed line passes the chain check (why the export exists)", !noAnchor.findings.some((y) => y.chainKey === A), noAnchor.findings);
  ok("AUD-2 DW8 pass: with it, the checker reports firm A at the anchor's seq 7 as an anchor mismatch, and one alert with ids only",
    f?.why === "anchor" && f.fromSeq === "7" && alerts.raised.length === 1 && alerts.raised[0]!.detail.entityKey === A && !/Rewritten|Sample line/.test(JSON.stringify(alerts.raised)), [withAnchor.findings, alerts.raised]);
  sql(`begin; alter table audit_event disable trigger aud_event_no_change; delete from audit_event where chain_key = '${B}' and seq = 3; alter table audit_event enable trigger aud_event_no_change; commit;`);
  const tail = await v.pass("full"), fB = tail.findings.find((y) => y.chainKey === B);
  ok("AUD-2 DW8 fail: firm B's newest exported line removed (the chain alone still verifies 1-2) is found against its anchor; firm B's break never marks the platform chain",
    fB?.why === "anchor" && fB.fromSeq === "3" && !tail.findings.some((y) => y.chainKey === "platform"), tail.findings);
} finally {
  await db.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
