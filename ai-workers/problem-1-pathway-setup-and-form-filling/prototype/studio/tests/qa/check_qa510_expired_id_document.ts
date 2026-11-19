// QA-510 (Gap, Major; R1.110 Done when: "an expired document refused as the basis"): FO-13i's identity check recorded a
// document whose expiry is already past. Refusing it is the firm's own rule (P-735, P-579), not a Code duty; Unconfirmed:
// no counsel. Failed on main 34c5e1e99 (201 for an expired passport); FO-13i part 2 refuses an expiry before the firm's
// today (the firm's zone, the injected clock) with 422 naming documentExpiry, nothing stored, while today and a future
// expiry still record (201). The firm's zone is moved to one where the clock's instant is already the next day, so a
// check that read UTC (or the server's zone) instead of the firm's would fail the "yesterday in the firm" case. Set-up as check_fo13i_identity.ts:
// one scratch database with every migration, the Sample firms, a Nest app of the identity-check feature beside PF-4's
// guard and the local sign-in stand-in. No server of the app, no browser, no model call (US$0). Dropped at the end.
//   tsx studio/tests/qa/check_qa510_expired_id_document.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const STUDIO = join(import.meta.dirname, "..", ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_qa510_${process.pid}`, URL = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;
const WORK = join(STUDIO, "var", `qa510-check-${process.pid}`);
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const psql = (args: string[]) => execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = (q: string) => psql(["-Atc", q]);

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
mkdirSync(WORK, { recursive: true });
process.env.DATABASE_URL = URL; process.env.FO_FILES_DIR = join(WORK, "files"); process.env.FO_FILES_LINK_KEY = "qa510-check-link-key-0123456789abcdef";
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED"]) delete process.env[k];

const { ConfigReadGuard, Db } = await import("../../api/src/core.ts");
const { seedSampleFirms } = await import("../../api/src/platform/seed-sample-firms.ts");
const { seedSampleFirmsFrontOffice } = await import("../../api/src/front-office/firm-seed.ts");
const { PlatformClock } = await import("../../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../../api/src/platform/identity/guard.ts");
const identity = (await import("../../api/src/features/front-office-identity-check.ts")).default;

const apps: { close(): Promise<void> }[] = [];
try {
  for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) psql(["-f", join(MIG, d, "migration.sql")]);
  const db = new Db();
  await seedSampleFirms(db); await seedSampleFirmsFrontOffice(db);
  const A = sql(`select id from platform_firm where key='sample-firm'`);
  const R = sql(`select id from platform_staff where actor_id='user-R'`);
  const local = new LocalIdentity("qa510-check-signing-key-0123456789abcdef", () => Date.now());
  const tok = local.issue(R, { authTimeMs: Date.now() - 60_000, secondStep: true });
  // 19 Nov 23:30 UTC is 20 Nov 05:00 in Kolkata: the firm's today is 2026-11-20.
  let nowMs = Date.parse("2026-11-19T23:30:00Z");
  sql(`insert into platform_firm_setting (firm_id, key, value, changed_by) values ('${A}', 'platform.time_zone', '"Asia/Kolkata"', 'test') on conflict (firm_id, key) do update set value = excluded.value`);
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: { now: () => nowMs } }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard }, ...identity.providers];
  @Module({ controllers: identity.controllers as never[], providers: providers as never[] }) class TestApp {}
  const app = await NestFactory.create(TestApp, { logger: false });
  await app.listen(0, "127.0.0.1"); apps.push(app);
  const BASE = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}/api/front-office`;
  const pid = "00000000-0000-4000-8000-0000000a5101";
  sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values ('${pid}', '${A}', 'Client A', 'Sample', 'client.a@example.com', 'test', now());
    insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, created_by, updated_at) values ('00000000-0000-4000-8000-0000000a5102', '${A}', '${pid}', 'MANUAL', 'WEBSITE', '${R}', 'test', now())`);
  const save = async (documentExpiry: string, requestId: string = crypto.randomUUID()) => {
    const r = await fetch(`${BASE}/people/${pid}/identity-checks`, { method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
      body: JSON.stringify({ requestId, method: "IN_PERSON", documentType: "PASSPORT", issuingCountry: "CA", documentExpiry, documentNumberLast4: "q7r2", details: ["NAME"] }) });
    const t = await r.text(); let b: any = t; try { b = JSON.parse(t); } catch { /* text */ }
    return { status: r.status, body: b };
  };
  const future = await save("2031-05-31");
  ok("QA-510 pass: a passport that expires after today records (201)", future.status === 201, future);
  const today = await save("2026-11-20");
  ok("QA-510 pass: a passport that expires on the firm's today still records (201)", today.status === 201, today);
  const SENTENCE = "This document has expired. Check a current one.";
  const expired = await save("2025-01-31");
  ok("QA-510 fail case: a passport that expired before today is refused with 422 and the field's sentence", expired.status === 422 && expired.body?.fields?.documentExpiry === SENTENCE && expired.body?.code === "INVALID", expired);
  const yesterday = await save("2026-11-19");
  ok("QA-510 fail case: the firm's yesterday (still today in UTC) is refused with 422 on documentExpiry", yesterday.status === 422 && yesterday.body?.fields?.documentExpiry === SENTENCE, yesterday);
  const n = sql(`select count(*) from fo_identity_check where person_id='${pid}'`);
  ok("QA-510: the refused expired documents leave no check behind (only the two that recorded)", n === "2", n);
  // A zone behind UTC: 20 Nov 03:00 UTC is 19 Nov 22:00 in Toronto, so the firm's today is still 2026-11-19 (code that read
  // UTC, or a server set to a zone ahead of it, would refuse this).
  sql(`update platform_firm_setting set value = '"America/Toronto"' where firm_id = '${A}' and key = 'platform.time_zone'`);
  nowMs = Date.parse("2026-11-20T03:00:00Z");
  const west = await save("2026-11-19");
  ok("QA-510 pass: in a zone behind UTC, the firm's today (still 19 Nov there, 20 Nov in UTC) records (201)", west.status === 201, west);
  // A replay after the firm's midnight returns the saved check (one row), never 422 (STANDARDS §4 idempotent creates).
  const rid = crypto.randomUUID(), first = await save("2026-11-19", rid);
  nowMs += 24 * 3600_000;
  const again = await save("2026-11-19", rid);
  ok("QA-510: a check saved on its expiry day and replayed after the firm's midnight returns the same check (201), not 422", first.status === 201 && again.status === 201 && again.body?.id === rid, { first: first.status, again });
  const fresh = await save("2026-11-19");
  ok("QA-510 fail case: a new Save of the same document after that midnight is refused (422)", fresh.status === 422 && fresh.body?.fields?.documentExpiry === SENTENCE, fresh);
  const ev = sql(`select count(*) from module_event where type='identity.checked'`), rows = sql(`select count(*) from fo_identity_check where person_id='${pid}'`);
  ok("QA-510: a refused check writes no row or event (four saved checks, four events)", ev === "4" && rows === "4", { ev, rows });
} catch (e) {
  ok("QA-510 ran to the end", false, String((e as Error)?.stack ?? e));
} finally {
  for (const a of apps) await a.close().catch(() => {});
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* dropped */ }
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\nQA-510 expired document: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
