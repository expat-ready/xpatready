// AUD-4 (map row 88, R1.88; AG-16-26, SA-6-33, AG-13-44, AG-13-43, AG-16-22, AG-13-31, SA-11-30, SA-11-14; P-607 (3)):
// the firm reads and exports its own activity log. DW1-DW9, a pass and a fail each. A scratch database (every
// migration, PF-3's Sample firms) and a small Nest app built from PF-4's session classes, the guard, PF-12's walls
// interceptor, PF-23's request middleware and this row's controller. Lines are inserted directly (the insert trigger
// fills their actor type); 100,000 more give EXPLAIN its plan. No browser, no model call (US$0). Dropped at the end.
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_aud4_firm_log.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFile, execFileSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fakeMail } from "../ports/mail.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_aud4_scratch_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const psqlAsync = (q: string) => new Promise<void>((ok2, no) => execFile(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-c", q], (e) => (e ? no(e) : ok2())));
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
type Res = { status: number; body: any; headers: Headers };
const call = async (base: string, path: string, token?: string): Promise<Res> => {
  const r = await fetch(`${base}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  const text = await r.text(); let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body, headers: r.headers };
};

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_LOCAL_SECRET"]) delete process.env[k];

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { IDENTITY_ADMIN_PORT, LocalIdentityAdmin } = await import("../api/src/platform/identity/session/provider.ts");
const { MAIL_PORT } = await import("../api/src/platform/identity/session/mail.ts");
const { PlatformSession } = await import("../api/src/platform/identity/session/service.ts");
const { PlatformSessionController } = await import("../api/src/platform/identity/session/routes.ts");
const { requestMiddleware } = await import("../api/src/platform/observability/hook.ts");
const { FirmWallsInterceptor } = await import("../api/src/features/platform-firm-walls.ts");
const auditFeature = (await import("../api/src/features/audit-firm-read.ts")).default;   // the row's own registration
const { PAGE } = await import("../api/src/platform/audit/firm-read/service.ts");
const { changesOf } = await import("../api/src/platform/audit/firm-read/render.ts");
const { csvCell, csvRow } = await import("../api/src/platform/audit/csv.ts");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const clock = new (class extends PlatformClock { t = Date.now(); override now() { return this.t; } })();
const local = new LocalIdentity("aud4-check-signing-key-0123456789abcdef", () => clock.now());
const R1 = "from=2026-01-01&to=2027-01-01";
/** A minimal RFC 4180 reader (quoted cells may hold commas, quotes and line breaks). */
function readCsv(s: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true; else if (ch === ",") { row.push(cell); cell = ""; } else if (ch === "\r" && s[i + 1] === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++; } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

let app: { close(): Promise<void> } | null = null;
try {
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
    { provide: IDENTITY_ADMIN_PORT, useValue: new LocalIdentityAdmin(() => clock.now()) }, { provide: MAIL_PORT, useValue: fakeMail() }, PlatformSession, ...auditFeature.providers, { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor }];
  @Module({ controllers: [PlatformIdentityController, PlatformSessionController, ...auditFeature.controllers] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false });
  nest.use(requestMiddleware());
  await nest.listen(0, "127.0.0.1"); app = nest;
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;

  await seedSampleFirms(db);
  const staff = (actorId: string) => db.platformStaff.findFirstOrThrow({ where: { actorId }, select: { id: true, firmId: true, displayName: true, firm: { select: { key: true } } } });
  const R = await staff("user-R"), O = await staff("user-O"), T = await staff("user-T"), S = await staff("user-S");
  const A = R.firmId, B = S.firmId, KEY_A = R.firm.key, KEY_B = S.firm.key;
  // An Admin (user-T gains ADMIN) and a person who will leave (D, an Admin of firm A, deactivated before the read).
  sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${A}', '${T.id}', 'ADMIN', 'seed:aud4-check')`);
  const D = sql(`insert into platform_staff (id, firm_id, email, display_name, actor_id, updated_at) values (gen_random_uuid(), '${A}', 'leaver@sample-firm.example.com', 'Departed Admin (Sample)', 'aud4-leaver', now()) returning id`).split("\n")[0];
  sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${A}', '${D}', 'ADMIN', 'seed:aud4-check')`);
  const E = sql(`insert into platform_staff (id, firm_id, email, display_name, actor_id, updated_at) values (gen_random_uuid(), '${A}', 'quiet@sample-firm.example.com', 'Quiet colleague (Sample)', 'aud4-quiet', now()) returning id`).split("\n")[0];   // never signs in: no line
  const WS = sql(`insert into workspace (id, key, label) values (gen_random_uuid(), 'aud4-check', 'AUD-4 check lines') returning id`).split("\n")[0];
  const line = (o: { firm: string | null; actor: string; action: string; entity: string; key?: string; summary: string; at: string; detail?: unknown; session?: string }) =>
    sql(`insert into audit_event (id, workspace_id, at, actor, action, entity, entity_key, summary, detail, firm_id, support_session_id) values (gen_random_uuid(), '${WS}', '${o.at}', '${o.actor}', '${o.action}', '${o.entity}', ${o.key ? `'${o.key}'` : "null"},
      $s$${o.summary}$s$, ${o.detail === undefined ? "null" : `$d$${JSON.stringify(o.detail)}$d$::jsonb`}, ${o.firm ? `'${o.firm}'` : "null"}, ${o.session ? `'${o.session}'` : "null"}) returning id`).split("\n")[0];
  const SESSION = "5e550000-0000-4000-8000-000000000001";
  const L = {
    setting: line({ firm: A, actor: `staff:${R.id}`, action: "platform.setting.change", entity: "platform_firm_setting", key: `${A}:firm.time_zone`, summary: "Firm sample-firm: setting firm.time_zone changed", at: "2026-06-01T10:00:00Z", detail: { key: "firm.time_zone", from: "America/Toronto", to: "America/Vancouver", firmId: A } }),
    caseLine: line({ firm: A, actor: "user-O", action: "answered", entity: "case", key: "0c0c0c0c-0000-4000-8000-000000000001", summary: "Case officer answered a question on case 0c0c0c0c", at: "2026-06-02T10:00:00Z" }),
    mystery: line({ firm: A, actor: "system:aud4", action: "fo.mystery.happened", entity: "fo_mystery", key: "m-1", summary: "A mystery happened (no module named this action).", at: "2026-06-03T10:00:00Z" }),
    support: line({ firm: A, actor: "system:support", action: "support.session.read", entity: "plat_support_session", key: SESSION, summary: "Support looked at the firm's settings in a support session.", at: "2026-06-04T10:00:00Z", session: SESSION }),
    formula: line({ firm: A, actor: `staff:${R.id}`, action: "platform.office.add", entity: "platform_office", key: "o-1", summary: '=HYPERLINK("http://example.invalid","x")', at: "2026-06-05T10:00:00Z" }),
    leaver: line({ firm: A, actor: `staff:${D}`, action: "platform.staff.roles_changed", entity: "platform_staff", key: O.id, summary: "Changed a person's roles.", at: "2026-06-06T10:00:00Z", detail: { name_before: "x", name_after: "y" } }),
    platform: line({ firm: null, actor: "system:console", action: "platform.firm.read", entity: "platform_firm", key: A, summary: "Our staff read firm A across firms.", at: "2026-06-07T10:00:00Z", detail: { firmId: A } }),
    other: line({ firm: B, actor: `staff:${S.id}`, action: "platform.setting.change", entity: "platform_firm_setting", key: `${B}:firm.time_zone`, summary: "Firm B setting", at: "2026-06-01T10:00:00Z" }),
  };
  const signIn = async (actorId: string, firmKey: string) => { const r = await fetch(`${base}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey, actorId, secondStep: true }) }); const b = await r.json() as any; if (r.status !== 200) throw new Error(JSON.stringify(b)); return b.token as string; };
  const tR = await signIn("user-R", KEY_A), tT = await signIn("user-T", KEY_A), tO = await signIn("user-O", KEY_A), tS = await signIn("user-S", KEY_B), tD = await signIn("aud4-leaver", KEY_A);
  sql(`update platform_staff set status = 'DEACTIVATED', deactivation_reason = 'left (Sample)' where id = '${D}'`);
  ok("setup: two firms, an Owner, an Admin, a Case Officer and a person deactivated after their line", A !== B && !!D, { A, B, D });

  // ------------------------------------------------------------------------- DW1: who may read
  const owner = await call(base, `/api/platform/audit?${R1}`, tR), admin = await call(base, `/api/platform/audit?${R1}`, tT);
  const ids = (r: Res): string[] => (r.body?.lines ?? []).map((l: any) => l.id);
  ok("AUD-4 DW1 pass: an Owner and an Admin read the firm's lines (agent/audit:read)", owner.status === 200 && admin.status === 200 && ids(owner).includes(L.setting) && ids(admin).includes(L.setting), [owner.status, admin.status]);
  const officer = await call(base, `/api/platform/audit?${R1}`, tO), none = await call(base, `/api/platform/audit?${R1}`), gone = await call(base, `/api/platform/audit?${R1}`, tD);
  const offExport = await call(base, `/api/platform/audit/export?${R1}`, tO);
  ok("AUD-4 DW1 fail: a Case Officer → 403 MISSING_PERMISSION (list and export); no token → 401; a deactivated Admin's token is refused",
    officer.status === 403 && officer.body?.code === "MISSING_PERMISSION" && offExport.status === 403 && none.status === 401 && (gone.status === 401 || gone.status === 403), [officer.status, officer.body?.code, offExport.status, none.status, gone.status]);

  // ------------------------------------------------------------------------- DW2: never another firm's line
  const bLine = sql(`select id || '|' || to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') from audit_event where id = '${L.other}'`).split("|");
  const forged = Buffer.from(JSON.stringify(["2026-12-31T00:00:00.000000Z", bLine[0]])).toString("base64url");
  const viaCursor = await call(base, `/api/platform/audit?${R1}&cursor=${forged}`, tR), viaPerson = await call(base, `/api/platform/audit?${R1}&person=${S.id}`, tR), viaFirm = await call(base, `/api/platform/audit?${R1}&firmId=${B}`, tR);
  const firmOf = (r: Res) => new Set((r.body?.lines ?? []).map((l: any) => sql(`select firm_id from audit_event where id = '${l.id}'`)));
  ok("AUD-4 DW2 pass: with firm B's line in the cursor, firm A reads only its own lines; ?firmId=B added is refused 422 naming it (PF-28 part 2b: an unknown filter key), never firm B's lines",
    viaCursor.status === 200 && [...firmOf(viaCursor)].every((f) => f === A) && !ids(viaCursor).includes(L.other) && viaFirm.status === 422 && Object.hasOwn(viaFirm.body?.fields ?? {}, "firmId"), [viaCursor.status, [...firmOf(viaCursor)]]);
  const bSees = await call(base, `/api/platform/audit?${R1}`, tS);
  ok("AUD-4 DW2 fail: firm B's staff id as the person filter gives none of B's lines (nothing); firm B reads its line and none of A's",
    viaPerson.status === 200 && viaPerson.body.lines.length === 0 && ids(bSees).includes(L.other) && !ids(bSees).some((i) => Object.values(L).filter((x) => x !== L.other).includes(i)), [viaPerson.body?.lines?.length, ids(bSees).length]);

  // ------------------------------------------------------------------------- DW3: platform lines, ExpatReady staff access
  const ours = await call(base, `/api/platform/audit?${R1}&ours=1`, tR);
  const sup = (owner.body.lines as any[]).find((l) => l.id === L.support);
  ok("AUD-4 DW3 pass: a line under a support session is shown to the firm as \"ExpatReady support\" and under the ExpatReady staff access filter",
    sup?.who === "ExpatReady support" && ids(ours).includes(L.support), sup);
  ok("AUD-4 DW3 fail: a platform line (firm_id null) about firm A is never shown to A; a firm staff line is not under ExpatReady staff access",
    !ids(owner).includes(L.platform) && !ids(ours).includes(L.setting) && ids(ours).length === 1, ids(ours));

  // ------------------------------------------------------------------------- DW4: dates required, one year at most
  const noFrom = await call(base, "/api/platform/audit?to=2027-01-01", tR), long = await call(base, "/api/platform/audit?from=2026-01-01T00:00:00Z&to=2027-01-01T00:00:00.001Z", tR);
  const micro = await call(base, "/api/platform/audit?from=2026-01-01T00:00:00Z&to=2027-01-01T00:00:00.000001Z", tR), exact = await call(base, "/api/platform/audit?from=2026-01-01T00:00:00Z&to=2027-01-01T00:00:00Z", tR);
  ok("AUD-4 DW4 pass: a range of exactly one year is read", exact.status === 200, exact.status);
  const feb31 = await call(base, "/api/platform/audit?from=2026-01-01&to=2026-02-31", tR), h24 = await call(base, "/api/platform/audit?from=2026-01-01T24:00:00Z&to=2026-03-01", tR);
  const y0 = await call(base, "/api/platform/audit?from=0000-01-01&to=0000-06-01", tR), area = await call(base, `/api/platform/audit?${R1}&area=constructor`, tR);
  const badTime = Buffer.from(JSON.stringify(["2026-13-45T99:99:99.000000Z", L.setting])).toString("base64url"), cur = await call(base, `/api/platform/audit?${R1}&cursor=${badTime}`, tR);
  ok("AUD-4 DW4 fail (break m2-m5): 31 February, hour 24 and year 0 → 400 (never rolled over or a 500); area=constructor → 400; a cursor with an impossible time → 400 BAD_CURSOR",
    feb31.status === 422 && h24.status === 422 && y0.status === 422 && area.status === 422 && cur.status === 422 && cur.body.code === "BAD_CURSOR", [feb31.status, h24.status, y0.status, area.status, cur.status]);
  ok("AUD-4 DW4 fail: no from → 400 DATES_REQUIRED; one year and a millisecond → 400 naming the limit; a microsecond (more precision than checked) → 400",
    noFrom.status === 422 && noFrom.body.code === "DATES_REQUIRED" && long.status === 422 && long.body.code === "RANGE_TOO_LONG" && /one year/.test(long.body.detail) && micro.status === 422, [noFrom.body?.code, long.body?.code, micro.status]);

  // ------------------------------------------------------------------------- DW5: 1,000 lines at one moment, 20 pages
  sql(`insert into audit_event (id, workspace_id, at, actor, action, entity, entity_key, summary, firm_id) select gen_random_uuid(), '${WS}', '2026-07-01T12:00:00.123456Z', 'system:aud4', 'check.same_at', 'platform_check', 'same-' || g, 'Same moment line ' || g, '${A}' from generate_series(1, 1000) g`);
  const seen: string[] = []; let cursor: string | null = "", pages = 0;
  while (cursor !== null && pages < 30) { const r = await call(base, `/api/platform/audit?${R1}&action=check.same_at${cursor ? `&cursor=${cursor}` : ""}`, tR); seen.push(...ids(r)); cursor = r.body.next; pages++; }
  ok(`AUD-4 DW5 pass: 1,000 lines with the same time page in ${1000 / PAGE} pages of ${PAGE}, no skip and no repeat (AG-13-31)`, pages === 20 && seen.length === 1000 && new Set(seen).size === 1000, { pages, n: seen.length, unique: new Set(seen).size });
  const timeOnly = Number(sql(`select count(*) from audit_event where firm_id = '${A}' and action = 'check.same_at' and at < '2026-07-01T12:00:00.123456Z'`));
  const badCursor = await call(base, `/api/platform/audit?${R1}&cursor=not-a-cursor`, tR);
  ok("AUD-4 DW5 fail: a time-only cursor (the stand-in) would lose all 950 lines after page 1; a cursor this log did not give → 422 BAD_CURSOR", timeOnly === 0 && badCursor.status === 422 && badCursor.body.code === "BAD_CURSOR", [timeOnly, badCursor.status]);

  // EXPLAIN on 100,000 lines of firm A (and 20,000 of B) over AUD-1a's (firm_id, at) index.
  sql(`insert into audit_event (id, workspace_id, at, actor, action, entity, entity_key, summary, firm_id) select gen_random_uuid(), '${WS}', '2025-01-01'::timestamptz + (g || ' seconds')::interval * 300, 'system:aud4', 'check.bulk', 'platform_check', 'bulk-' || g, 'Bulk line ' || g, '${A}' from generate_series(1, 100000) g;
       insert into audit_event (id, workspace_id, at, actor, action, entity, entity_key, summary, firm_id) select gen_random_uuid(), '${WS}', '2025-01-01'::timestamptz + (g || ' seconds')::interval * 300, 'system:aud4', 'check.bulk', 'platform_check', 'bulk-' || g, 'Bulk line ' || g, '${B}' from generate_series(1, 20000) g; analyze audit_event;`);
  const plan = sql(`explain (analyze, costs off, timing off, summary off) select e.id from audit_event e where e.firm_id = '${A}' and e.at >= '2025-01-01' and e.at < '2026-01-01' order by e.at desc, e.id desc limit 51`);
  console.log(`EXPLAIN (100,000 lines of firm A):\n${plan.split("\n").map((l) => `    ${l}`).join("\n")}`);
  ok("AUD-4 DW5 plan: the page reads AUD-1a's (firm_id, at) index, no sequential scan", /audit_event_firm_id_at_idx/.test(plan) && !/Seq Scan/.test(plan), plan);

  // ------------------------------------------------------------------------- DW6: the export
  const XR = "from=2025-01-01&to=2026-01-01&action=check.bulk", before = Number(sql("select count(*) from audit_event where action = 'audit.exported'"));
  // The export's line commits after the count and before the file is written: once it is there, the file is being
  // written from the snapshot. Then a firm action runs (measured) and lines land at the oldest end of the range, which
  // the newest-first batches read last: under the snapshot none of them is in the file (READ COMMITTED would show them).
  const exporting = fetch(`${base}/api/platform/audit/export?${XR}`, { headers: { authorization: `Bearer ${tR}` } });
  let answered = false; void exporting.then(() => { answered = true; }, () => { answered = true; });
  const exportedNow = () => Number(sql("select count(*) from audit_event where action = 'audit.exported'"));
  for (let i = 0; i < 2000 && exportedNow() === before && !answered; i++) await pause(2);
  const exported = sql("select entity || '|' || (detail->>'rows') || '|' || actor from audit_event where action = 'audit.exported'").split("\n").filter(Boolean);
  const t0 = Date.now(); const out = await fetch(`${base}/api/platform/session/sign-out`, { method: "POST", headers: { authorization: `Bearer ${tR}` } }), waited = Date.now() - t0, outBeforeAnswer = !answered;
  let lateBefore = 0;
  for (let i = 0; i < 400 && !answered; i++) {
    await psqlAsync(`insert into audit_event (id, workspace_id, at, actor, action, entity, entity_key, summary, firm_id) values (gen_random_uuid(), '${WS}', '2025-01-01T00:00:00.5Z', 'system:aud4', 'check.bulk', 'platform_check', 'late-${i}', 'Written during the export.', '${A}')`);
    if (!answered) lateBefore++;
  }
  const res = await exporting, csv = await res.text();
  const rows = readCsv(csv.replace(/^\uFEFF/, ""));
  clock.t += 1000; const tR2 = await signIn("user-R", KEY_A);   // the sign-out above ended tR's session
  ok("AUD-4 DW6 pass: the export commits exactly one audit.exported line (plat_audit_export, the row count, the exporter) before its data, and the file holds that count",
    res.status === 200 && exported.length === before + 1 && exported.at(-1) === `plat_audit_export|100000|staff:${R.id}` && res.headers.get("x-export-rows") === "100000" && rows.length === 100001 && rows[0][0] === "When (UTC)", { status: res.status, exported, rows: rows.length });
  const exLine = ((await call(base, `/api/platform/audit?from=2026-01-01&to=2027-01-01&action=audit.exported`, tR2)).body.lines as any[])[0];
  ok("AUD-4 DW6 fail (review M2): the export's own line shows no false change: its range is kept as rangeFrom/rangeTo, not a from/to pair",
    exLine?.changes?.length === 0 && exLine.advanced.detail.rangeFrom === "2025-01-01T00:00:00.000Z" && exLine.advanced.detail.from === undefined && exLine.actionWords === "Exported the activity log", exLine);
  ok(`AUD-4 DW6 pass: a firm action started while the export writes its file completes without waiting for it (sign-out in ${waited} ms${outBeforeAnswer ? ", before the export answered" : ""}; no lock is taken until AUD-1c, so this guards the future)`, out.status === 200 && waited < 5000, [out.status, waited, outBeforeAnswer]);
  ok(`AUD-4 DW6 fail: ${lateBefore} lines committed while the file was being written are not in it, and the file has exactly X-Export-Rows rows (the snapshot)`,
    lateBefore >= 1 && !csv.includes("Written during the export.") && rows.length - 1 === Number(res.headers.get("x-export-rows")), { lateBefore, rows: rows.length });
  sql(`create function aud4_force() returns trigger language plpgsql as $$ begin raise exception 'aud4 forced audit failure'; end $$;
       create trigger aud4_force before insert on audit_event for each row when (new.entity = 'plat_audit_export') execute function aud4_force();`);
  const forcedR = await fetch(`${base}/api/platform/audit/export?${R1}`, { headers: { authorization: `Bearer ${tT}` } }); const forcedBody = await forcedR.text();
  sql("drop trigger aud4_force on audit_event; drop function aud4_force();");
  ok("AUD-4 DW6 fail: a forced audit failure gives a 500 and no file (no CSV, no line; P-607 (3))", forcedR.status === 500 && !/text\/csv/.test(forcedR.headers.get("content-type") ?? "") && !forcedBody.includes("When (UTC)") && Number(sql("select count(*) from audit_event where action = 'audit.exported'")) === before + 1, [forcedR.status, forcedBody.slice(0, 80)]);
  const small = await call(base, `/api/platform/audit/export?${R1}&action=platform.office.add`, tT);
  const cell = readCsv(String(small.body).replace(/^\uFEFF/, ""))[1]?.[5];
  ok("AUD-4 DW6 fail: a summary starting = is written '= (formula injection); csv.ts prefixes =, +, -, @, tab, CR and quotes per RFC 4180",
    cell === `'=HYPERLINK("http://example.invalid","x")` && csvCell("@SUM(A1)") === "'@SUM(A1)" && csvCell("+1") === "'+1" && csvCell("-1") === "'-1" && csvCell("\tx") === "'\tx" && csvCell("a,\"b\"") === '"a,""b"""' && csvRow(["a", null, 2]) === "a,,2\r\n" && csvCell("plain") === "plain", cell);
  const big = await call(base, `/api/platform/audit/export?from=2025-01-01&to=2026-01-01`, tR2);
  ok("AUD-4 DW6 fail: an export over 100,000 lines → 413 \"Narrow the dates\" and no line", big.status === 413 && big.body.title === "Narrow the dates" && Number(sql("select count(*) from audit_event where action = 'audit.exported'")) === before + 2, [big.status, big.body?.title]);

  // ------------------------------------------------------------------------- DW7: words
  const all = (await call(base, `/api/platform/audit?from=2026-06-01&to=2026-06-30`, tR2)).body.lines as any[];
  const myst = all.find((l) => l.id === L.mystery), set = all.find((l) => l.id === L.setting), cas = all.find((l) => l.id === L.caseLine);
  ok("AUD-4 DW7 pass: a setting line shows \"field: old → new\" with the raw detail under Advanced; a case line is under Cases",
    set?.changes?.[0]?.words === "firm.time_zone: America/Toronto → America/Vancouver" && set.advanced.detail.from === "America/Toronto" && set.actionWords === "Changed a firm setting" && cas?.area === "cases", [set?.changes, cas?.area]);
  ok("AUD-4 DW7 fail: an action no module named has no words: its code is under Advanced and its summary is shown (never blank)",
    myst?.actionWords === null && myst.advanced.action === "fo.mystery.happened" && myst.summary.startsWith("A mystery") && changesOf({ id: "x" }).length === 0 && changesOf({ windows_before: [1] })[0]?.words === "windows: [1] → (none)", myst);

  // ------------------------------------------------------------------------- DW8, DW9: people who left
  const left = all.find((l) => l.id === L.leaver), byLeaver = await call(base, `/api/platform/audit?${R1}&person=${D}`, tR2);
  ok("AUD-4 DW8 pass: a deactivated person's lines still show their name", left?.who === "Departed Admin (Sample)" && left.staffId === D, left?.who);
  const people = owner.body.people as any[], gonePerson = people.find((p) => p.staffId === D);
  ok("AUD-4 DW9 pass: a person deactivated before the read is in people with active false, and filtering by them returns their lines",
    gonePerson?.active === false && gonePerson.name === "Departed Admin (Sample)" && ids(byLeaver).includes(L.leaver) && (byLeaver.body.lines as any[]).every((l) => l.staffId === D && l.who === "Departed Admin (Sample)"), [gonePerson, ids(byLeaver)]);
  ok("AUD-4 DW8/DW9 fail: another firm's staff are never in people, nor this firm's staff with no line (a colleague who never signed in)",
    !people.some((p) => p.staffId === S.id) && !people.some((p) => p.staffId === E) && people.some((p) => p.staffId === R.id) && people.some((p) => p.staffId === O.id), people);

  // ------------------------------------------------------------------------- DW10: record, area, actor type, simulated people
  const q = async (extra: string) => ids(await call(base, `/api/platform/audit?from=2026-06-01&to=2026-06-30&${extra}`, tR2));
  const byEntity = await q("entity=platform_firm_setting"), byKey = await q(`entity=case&entityKey=0c0c0c0c-0000-4000-8000-000000000001`), byType = await q("actorType=SYSTEM");
  const byO = await q(`person=${O.id}`), byOther = await q("entityKey=no-such-key");
  ok("AUD-4 DW10 pass: the record filter (entity, entity and key), the actor type and a simulated person (user-O, by staff id) each return exactly their lines",
    JSON.stringify(byEntity) === JSON.stringify([L.setting]) && JSON.stringify(byKey) === JSON.stringify([L.caseLine]) && byType.includes(L.mystery) && byType.includes(L.support) && !byType.includes(L.setting) && JSON.stringify(byO) === JSON.stringify([L.caseLine]) && byOther.length === 0,
    { byEntity, byKey, byType, byO });
  const { areaOf } = await import("../api/src/platform/audit/firm-read/action-names.ts");
  sql(`insert into audit_event (id, workspace_id, at, actor, action, entity, entity_key, summary, firm_id) values
    (gen_random_uuid(), '${WS}', '2026-06-10T10:00:00Z', 'system:aud4', 'check.area', 'money_invoice', 'a1', 'Money line', '${A}'),
    (gen_random_uuid(), '${WS}', '2026-06-10T10:00:01Z', 'system:aud4', 'check.area', 'msg_outbox', 'a2', 'Message line', '${A}'),
    (gen_random_uuid(), '${WS}', '2026-06-10T10:00:02Z', 'system:aud4', 'check.area', 'combination', 'a3', 'Configuration line', '${A}'),
    (gen_random_uuid(), '${WS}', '2026-06-10T10:00:03Z', 'system:aud4', 'check.area', 'library field', 'a4', 'Library line', '${A}'),
    (gen_random_uuid(), '${WS}', '2026-06-10T10:00:04Z', 'system:aud4', 'check.area', 'something new', 'a5', 'Other line', '${A}')`);
  const every = (await call(base, "/api/platform/audit?from=2026-06-01&to=2026-06-30", tR2)).body.lines as any[];
  const mismatch: unknown[] = [];
  for (const code of ["team", "front-office", "money", "messages", "cases", "configuration", "other"]) {
    const got = new Set(await q(`area=${code}`)), want = every.filter((l) => areaOf(l.advanced.entity) === code).map((l) => l.id);
    if (!want.length || got.size !== want.length || want.some((i) => !got.has(i))) mismatch.push({ code, got: got.size, want: want.length });
  }
  ok("AUD-4 DW10 pass: for each of the 7 areas the area filter returns exactly the lines areaOf names that area (the query and the words never drift)", every.length === 11 && mismatch.length === 0, mismatch);
  const removed = await q("entity=platform_firm_setting&actorType=SYSTEM"), noArea = await q("area=money&entity=platform_firm_setting");
  ok("AUD-4 DW10 fail: filters combine (a setting line written by a person is not under actor type SYSTEM; not under Money)", removed.length === 0 && noArea.length === 0, [removed, noArea]);

  // ------------------------------------------------------------------------- the export under load (break M1, M2, m1, m6)
  const emailish = await fetch(`${base}/api/platform/audit/export?${R1}&entityKey=client@example.com`, { headers: { authorization: `Bearer ${tR2}` } }); await emailish.text();
  ok("AUD-4 DW6 fail (break m1): an email-shaped filter value never fails the export's line: 200, and the line keeps \"(withheld)\"",
    emailish.status === 200 && sql("select detail->>'entityKey' from audit_event where action = 'audit.exported' order by at desc limit 1") === "(withheld)", emailish.status);
  const XB = "from=2025-01-01&to=2025-11-01&action=check.bulk";   // about 87,000 lines, under the limit
  const paused = await Promise.all([1, 2, 3, 4, 5, 6].map(() => fetch(`${base}/api/platform/audit/export?${XB}`, { headers: { authorization: `Bearer ${tT}` } })));
  const readers = paused.map((p) => p.body?.getReader());
  await Promise.all(readers.map((rd) => rd?.read()));   // one chunk each, then every reader stops
  const t1 = Date.now(); const bx = await fetch(`${base}/api/platform/audit/export?${R1}`, { headers: { authorization: `Bearer ${tS}` } }); const bText = await bx.text(); const bWait = Date.now() - t1;
  ok(`AUD-4 DW6 pass (break M1): six exports whose readers stopped hold no database connection: firm B's export then answers 200 in ${bWait} ms`,
    paused.every((p) => p.status === 200 || p.status === 503) && paused.filter((p) => p.status === 200).length >= 2 && bx.status === 200 && bText.includes("When (UTC)") && bWait < 5000, { statuses: paused.map((p) => p.status), b: bx.status, bWait });
  await Promise.all(readers.map((rd) => rd?.cancel()));
  await new Promise((r) => setTimeout(r, 300));
  const after = await call(base, `/api/platform/audit?${R1}`, tR2);
  const rd = readdirSync;
  ok("AUD-4 DW6 fail (break m6): readers that leave mid-file end cleanly: the next read works and no export file is left behind", after.status === 200 && !rd(tmpdir()).some((f) => f.startsWith("aud4-export-")), rd(tmpdir()).filter((f) => f.startsWith("aud4-export-")));
  const { FirmAuditLog, EXPORT_DIR } = await import("../api/src/platform/audit/firm-read/service.ts");
  const svc = nest.get(FirmAuditLog), n0 = Number(sql("select count(*) from audit_event where action = 'audit.exported'"));
  const ctxR = { staffId: R.id, firmId: A } as Parameters<typeof svc.exportCsv>[0];
  const cancelled = await svc.exportCsv(ctxR, { from: "2026-01-01", to: "2027-01-01" }, () => true).then(() => 0, (e: any) => e?.getStatus?.());
  ok("AUD-4 DW6 fail (re-review n2): an export whose reader left before it started writes no line and makes no file", cancelled === 499 && Number(sql("select count(*) from audit_event where action = 'audit.exported'")) === n0, cancelled);
  const { mkdtempSync, utimesSync, existsSync: ex } = await import("node:fs");
  const stale = mkdtempSync(join(tmpdir(), EXPORT_DIR)), fresh = mkdtempSync(join(tmpdir(), EXPORT_DIR)), old = new Date(Date.now() - 2 * 3600_000);
  utimesSync(stale, old, old); await svc.onModuleInit();
  ok("AUD-4 DW6 fail (re-review n1): an export file left by a stopped process is removed at start-up once over an hour old; a fresh one is kept", !ex(stale) && ex(fresh), [ex(stale), ex(fresh)]);
  rmSync(fresh, { recursive: true, force: true });
} catch (e) {
  fail++; console.log(`FAIL  the check stopped: ${(e as Error).stack ?? e}`);
} finally {
  await app?.close(); await db.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
