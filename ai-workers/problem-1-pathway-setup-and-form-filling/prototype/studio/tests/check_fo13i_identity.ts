// FO-13i (P-579, P-606; brief lead-b-briefs/FO-13i.md, Lead B 16 Nov): the client identity check's API. Named cases
// DW1-DW6 of the brief, each with a passing and a failing case (Code SOR/2022-128 s. 24(2)(a); Unconfirmed: no counsel).
// One scratch database, demo-shaped (rev 16.7): every migration before FO-13i's, the Sample firms and staff, FO-13i's
// migration (checked right after it), then every later one and FO-1a's front-office seed. A Nest app is built from the
// two features' own classes (identity check, retainers) beside PF-4's guard and the local sign-in stand-in, with a test
// clock; the real FilesPort in a scratch folder. No server of the app, no browser, no model call (US$0). Dropped at the end.
//   tsx studio/tests/check_fo13i_identity.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const NEW = "20261118140000_fo13i_identity_check_key", KEY = "agent/identity-check:record";
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo13i_${process.pid}`, URL = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;
const WORK = join(STUDIO, "var", `fo13i-check-${process.pid}`);

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const psql = (args: string[]) => execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = (q: string) => psql(["-Atc", q]);
const refused = (q: string, re: RegExp) => { try { sql(q); return false; } catch (e) { return re.test(String((e as { stderr?: string }).stderr ?? e)); } };

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
mkdirSync(WORK, { recursive: true });
process.env.DATABASE_URL = URL; process.env.FO_FILES_DIR = join(WORK, "files"); process.env.FO_FILES_LINK_KEY = "fo13i-check-link-key-0123456789abcdef";
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED"]) delete process.env[k];

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { seedSampleFirmsFrontOffice } = await import("../api/src/front-office/firm-seed.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { EVERYONE_SEES_ALL, writeSetting } = await import("../api/src/platform/settings.ts");
const { platformAuditWorkspaceId } = await import("../api/src/platform/audit/audit-event.ts");
const { JsonLog, useLog } = await import("../api/src/platform/observability/log.ts");
const { buildDocx } = await import("../api/src/front-office/retainers/docx.ts");
const { Retainers } = await import("../api/src/front-office/retainers/service.ts");
const { clearingConflicts } = await import("./lib/conflict-clear.ts");
const { EVENT } = await import("../ports/events.ts");
const { fakeAudit } = await import("../ports/audit.ts");
const { LocalFiles } = await import("../api/src/front-office/files.ts");
const { IdentityChecks } = await import("../api/src/front-office/compliance/identity/service.ts");
const identity = (await import("../api/src/features/front-office-identity-check.ts")).default;
const retainers = (await import("../api/src/features/front-office-retainers.ts")).default;

// PF-23's capture: every log line of the run (the JSON log and the console) is kept and searched at DW6.
const logged: string[] = [];
useLog(new JsonLog((l) => { logged.push(l); }));
for (const m of ["log", "info", "warn", "error", "debug"] as const) { const was = console[m].bind(console); console[m] = (...a: unknown[]) => { logged.push(a.map(String).join(" ")); was(...a); }; }

const apps: { close(): Promise<void> }[] = [];
try {
  // ------------------------------------------------------------------------------- DW6: the migration (parallel world)
  const all = readdirSync(MIG).filter((d) => /^\d{14}_/.test(d)).sort();
  for (const d of all.filter((x) => x < NEW)) psql(["-f", join(MIG, d, "migration.sql")]);
  const db = new Db();
  await seedSampleFirms(db);
  const counts = () => sql(`select (select count(*) from platform_role_permission) || ':' || (select count(*) from platform_permission_key) || ':' || (select count(*) from platform_staff) || ':' || (select count(*) from platform_role_grant)`);
  const before = counts().split(":").map(Number);
  ok("FO-13i DW6 fail: before the migration the key is not seeded", sql(`select count(*) from platform_role_permission where permission_key = '${KEY}'`) === "0");
  psql(["-f", join(MIG, NEW, "migration.sql")]);   // its own rows counted alone (a later key migration adds rows too, FO-13c)
  const after = counts().split(":").map(Number);
  ok(`FO-13i DW6 pass: the migration (own stamp, later than ${all.filter((x) => x < NEW).at(-1)}) adds the key for OWNER, ADMIN, CASE_MANAGER, CASE_OFFICER and its catalogue row (NONE, GENERAL), on demo data, changing no other row`,
    all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1 && after[0] === before[0] + 4 && after[1] === before[1] + 1 && after[2] === before[2] && after[3] === before[3]
    && sql(`select string_agg(role::text, ',' order by role) from platform_role_permission where permission_key = '${KEY}'`) === "OWNER,ADMIN,CASE_MANAGER,CASE_OFFICER"
    && sql(`select scope || ':' || class from platform_permission_key where key = '${KEY}'`) === "NONE:GENERAL", { before, after });
  ok("FO-13i DW6 fail: the migration does not apply twice", (() => { try { psql(["-f", join(MIG, NEW, "migration.sql")]); return false; } catch (e) { return /duplicate key/.test(String((e as { stderr?: string }).stderr)); } })());
  for (const d of all.filter((x) => x > NEW)) psql(["-f", join(MIG, d, "migration.sql")]);
  await seedSampleFirmsFrontOffice(db);

  const A = sql(`select id from platform_firm where key='sample-firm'`), B = sql(`select id from platform_firm where key='sample-solo'`);
  const sid = (actor: string) => sql(`select id from platform_staff where actor_id='${actor}'`);
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "seed:fo13i", workspaceId: await platformAuditWorkspaceId(db as never) });
  const local = new LocalIdentity("fo13i-check-signing-key-0123456789abcdef", () => Date.now());
  const token = (staffId: string) => local.issue(staffId, { authTimeMs: Date.now() - 60_000, secondStep: true });
  const staff = async (firmId: string, name: string, role: string) => {
    const s = await db.platformStaff.create({ data: { firmId, email: `${name}@fo13i.example.com`, displayName: `Sample ${name}`, actorId: `fo13i-${name}`, status: "ACTIVE" } });
    await db.platformRoleGrant.create({ data: { firmId, staffId: s.id, role: role as never, grantedBy: "seed:fo13i" } });
    return { id: s.id, token: token(s.id) };
  };
  const R = { id: sid("user-R"), token: token(sid("user-R")) }, O = { id: sid("user-O"), token: token(sid("user-O")) }, S = { id: sid("user-S"), token: token(sid("user-S")) };
  const RO = await staff(A, "read-only", "READ_ONLY"), BF = await staff(A, "billing", "BILLING_FINANCE");

  let nowMs = Date.now();
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: { now: () => nowMs } }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
    ...identity.providers, ...retainers.providers.filter((p) => !identity.providers.includes(p as never))];
  @Module({ controllers: [...identity.controllers, ...retainers.controllers] as never[], providers: providers as never[] }) class TestApp {}
  const app = await NestFactory.create(TestApp, { logger: false });
  await app.listen(0, "127.0.0.1"); apps.push(app);
  const BASE = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}/api/front-office`;
  type Res = { status: number; body: any; text: string; headers: Headers };
  const call = async (method: string, path: string, tok: string, body?: Record<string, unknown> | FormData): Promise<Res> => {
    // Each Save makes its own requestId unless the case names one (the idempotency cases do).
    if (method === "POST" && /identity-checks$/.test(path) && body) {
      if (body instanceof FormData) { if (!body.has("requestId")) body.append("requestId", crypto.randomUUID()); }
      else if (!("requestId" in body)) body = { requestId: crypto.randomUUID(), ...body };
    }
    const headers: Record<string, string> = { authorization: `Bearer ${tok}` };
    if (body && !(body instanceof FormData)) headers["content-type"] = "application/json";
    const r = await fetch(`${path.startsWith("/") ? BASE.replace("/api/front-office", "") : `${BASE}/`}${path}`, { method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
    const text = await r.text(); let b: any = text; try { b = JSON.parse(text); } catch { /* bytes */ }
    return { status: r.status, body: b, text, headers: r.headers };
  };

  // People: PR's lead is user-R's, PO's lead user-O's (Case Officer); "everyone sees all" is off.
  let n = 1;
  const u = () => `00000000-0000-4000-8000-${String(n++).padStart(12, "0")}`;
  const person = (owner: string | null, given: string, firm = A) => {
    const id = u();
    sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values ('${id}', '${firm}', '${given}', 'Sample', '${given.toLowerCase().replace(/ /g, ".")}@example.com', 'test', now());
      insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, created_by, updated_at) values ('${u()}', '${firm}', '${id}', 'MANUAL', 'WEBSITE', ${owner ? `'${owner}'` : "null"}, 'test', now())`);
    return id;
  };
  const PR = person(R.id, "Client A"), PO = person(O.id, "Client B"), PB = person(S.id, "Client C", B);
  const FULL = "AB1234567", BYTES_MARK = "FO13I-COPY-BYTES-CANARY";
  const good = { method: "IN_PERSON", documentType: "PASSPORT", issuingCountry: "CA", documentExpiry: "2031-05-31", documentNumberLast4: "q7r2", details: ["NAME", "HOME_ADDRESS"] };
  const rows = (p: string) => Number(sql(`select count(*) from fo_identity_check where person_id = '${p}'`));

  // ---------------------------------------------------------------------------------------------------------- DW1
  const c1 = await call("POST", `people/${PR}/identity-checks`, R.token, good);
  ok("FO-13i DW1 pass: a check with a 4-character last-four saves → 201, stored upper case, no copy", c1.status === 201 && c1.body.documentNumberLast4 === "Q7R2" && c1.body.hasCopy === false && rows(PR) === 1, c1);
  const r5 = await call("POST", `people/${PR}/identity-checks`, R.token, { ...good, documentNumberLast4: "Q7R2X" });
  const rFull = await call("POST", `people/${PR}/identity-checks`, R.token, { ...good, documentNumberLast4: FULL });
  const rNum = await call("POST", `people/${PR}/identity-checks`, R.token, { ...good, documentNumberLast4: undefined, documentNumber: FULL });
  const rNote = await call("POST", `people/${PR}/identity-checks`, R.token, { ...good, method: "OTHER", methodDetail: `Seen passport ${FULL} at the office` });
  ok("FO-13i DW1 fail: a 5-character or full number → 422 naming documentNumberLast4; a full `documentNumber` → 422 naming it; a number in the note → 422 naming methodDetail; nothing stored",
    r5.status === 422 && r5.body.fields?.documentNumberLast4 && rFull.status === 422 && rFull.body.fields?.documentNumberLast4 && rNum.status === 422 && rNum.body.fields?.documentNumber
    && rNote.status === 422 && rNote.body.fields?.methodDetail && rows(PR) === 1, [r5.body, rNum.body, rNote.body]);
  const spaced = ["Seen passport AB 123 4567", "AB12 3456", "AB\u00a0123\u00a04567", "AB.123.456.7", "AB/123/4567", "AB_123_4567", "ＡＢ１２３４５６７", "AB ١٢٣٤٥٦٧", "AB १२३४५६७", "AB123\u200b4567", "AB12\u20603456", "AB12\u00ad34567"];
  const sp = await Promise.all(spaced.map((d) => call("POST", `people/${PR}/identity-checks`, R.token, { method: "OTHER", methodDetail: d, details: ["NAME"] })));
  const fine = await call("POST", `people/${PO}/identity-checks`, O.token, { method: "OTHER", methodDetail: "Seen at the office on video, 2 people present", details: ["NAME"] });
  ok("FO-13i DW1 fail (break B-1): a number spaced, dotted, slashed, full-width, in Arabic-Indic or Devanagari digits, or split by a hidden character → 422 naming methodDetail, nothing stored; a note with a few digits saves",
    sp.every((r) => r.status === 422 && r.body.fields?.methodDetail) && rows(PR) === 1 && fine.status === 201, sp.map((r, i) => `${spaced[i]}: ${r.status}`).filter((x) => !x.endsWith("422")));
  const rXX = await call("POST", `people/${PR}/identity-checks`, R.token, { ...good, issuingCountry: "XX" });
  ok("FO-13i DW1 fail: an issuing country XX → 422 naming issuingCountry, nothing stored", rXX.status === 422 && rXX.body.fields?.issuingCountry && rows(PR) === 1, rXX.body);

  // ---------------------------------------------------------------------------------------------------------- DW2
  const ALL5 = ["NAME", "HOME_ADDRESS", "PHONE", "EMAIL", "BUSINESS_DETAILS"];
  const c2 = await call("POST", `people/${PR}/identity-checks`, R.token, { method: "VIDEO", details: ALL5 });
  const list = await call("GET", `people/${PR}/identity-checks`, R.token);
  ok("FO-13i DW2 pass (s. 24(2)(a)): the five corroborated details are stored and listed on the person's timeline, newest first, with who checked",
    c2.status === 201 && JSON.stringify(sql(`select details_corroborated from fo_identity_check where id = '${c2.body.id}'`)) === JSON.stringify(`{${ALL5.join(",")}}`)
    && list.status === 200 && list.body.checks.length === 2 && list.body.checks[0].id === c2.body.id && JSON.stringify(list.body.checks[0].details) === JSON.stringify(ALL5)
    && list.body.checks[0].checkedBy.staffId === R.id && !JSON.stringify(list.body).includes("identity/"), list.body);
  const rUnk = await call("POST", `people/${PR}/identity-checks`, R.token, { method: "VIDEO", details: ["NAME", "PASSPORT_NUMBER"] });
  const rNone = await call("POST", `people/${PR}/identity-checks`, R.token, { method: "VIDEO", details: [] });
  ok("FO-13i DW2 fail: an unknown detail → 422 naming details; none → 422; nothing stored", rUnk.status === 422 && rUnk.body.fields?.details && rNone.status === 422 && rows(PR) === 2, rUnk.body);

  // ---------------------------------------------------------------------------------------------------------- DW3
  const form = (fields: Record<string, string | string[]>, file?: { bytes: Uint8Array; name: string; type: string }) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) f.append(k, x);
    if (file) f.append("copy", new Blob([file.bytes as Uint8Array<ArrayBuffer>], { type: file.type }), file.name);
    return f;
  };
  const pdf = new TextEncoder().encode(`%PDF-1.4\n% ${BYTES_MARK}\n%%EOF\n`);
  const docFields = { method: "DOCUMENT_COPY", documentType: "PASSPORT", issuingCountry: "IN", documentNumberLast4: "Z9k1", details: ["NAME", "EMAIL"] };
  const c3 = await call("POST", `people/${PR}/identity-checks`, R.token, form(docFields, { bytes: pdf, name: "passport.pdf", type: "application/pdf" }));
  const row3 = sql(`select copy_file_key || '|' || copy_sha256 from fo_identity_check where id = '${c3.body?.id}'`).split("|");
  ok("FO-13i DW3 pass: a check with a copy saves both in one insert (key identity/<person>/<uuid>.pdf, sha256 of the bytes), the number's last 4 upper case",
    c3.status === 201 && c3.body.hasCopy === true && c3.body.documentNumberLast4 === "Z9K1" && new RegExp(`^identity/${PR}/[0-9a-f-]{36}\\.pdf$`).test(row3[0]) && /^[0-9a-f]{64}$/.test(row3[1]), [c3.body, row3]);
  ok("FO-13i DW3 fail: an update to a saved check is refused by the database (write a new check instead)",
    refused(`update fo_identity_check set document_number_last4 = '0000' where id = '${c3.body.id}'`, /a check is a record \(write a new check instead\)/));
  const txt = await call("POST", `people/${PR}/identity-checks`, R.token, form(docFields, { bytes: new TextEncoder().encode("just text, renamed"), name: "passport.pdf", type: "application/pdf" }));
  const noDoc = await call("POST", `people/${PR}/identity-checks`, R.token, form({ method: "IN_PERSON", details: "NAME" }, { bytes: pdf, name: "x.pdf", type: "application/pdf" }));
  ok("FO-13i DW3 fail: a text file renamed .pdf → 415; a copy with no document named → 422; nothing stored", txt.status === 415 && noDoc.status === 422 && noDoc.body.fields?.documentType && rows(PR) === 3, [txt.body, noDoc.body]);
  const failing = new IdentityChecks(db, new LocalFiles(), { now: () => nowMs }, fakeAudit({ failOn: (e) => e.action === "identity.checked" }) as never);
  const ctxR0 = { staffId: R.id, firmId: A, firmKey: "sample-firm", roles: [], keys: [], duties: [], authTime: 0, via: "local" as const };
  const lost = await failing.record(ctxR0, PR, { ...docFields, requestId: crypto.randomUUID() }, { bytes: pdf, size: pdf.length }).then(() => null, (e) => ({ status: e.getStatus?.(), body: e.getResponse?.() }));
  ok("FO-13i DW3 fail: when the insert fails (a forced audit failure) no check is stored, nothing names the stored copy, and the answer says so",
    lost?.status === 500 && lost.body.copyReferenced === false && /not attached to any record/.test(lost.body.detail) && rows(PR) === 3 && sql(`select count(*) from fo_identity_check where copy_file_key is not null`) === "1", lost);
  const filesOnDisk = () => { const d = join(WORK, "files", A.toLowerCase(), "identity"); try { return readdirSync(d, { recursive: true }).filter((f) => !String(f).endsWith(".meta") && /\./.test(String(f))).length; } catch { return 0; } };
  const onDisk = filesOnDisk();
  const lines2 = await Promise.all(["Seen in person\nat the office", "Seen\tin person", "\u200b\u200b", "\u3164", "\u0301"].map((d) =>
    call("POST", `people/${PR}/identity-checks`, R.token, form({ ...docFields, method: "OTHER", methodDetail: d }, { bytes: pdf, name: "p.pdf", type: "application/pdf" }))));
  ok("FO-13i DW3 fail (break B-2): a note with a line break or tab, or only hidden characters, with a copy → 422 naming methodDetail before the copy is stored (no new file on disk, no row)",
    lines2.every((r) => r.status === 422 && r.body.fields?.methodDetail) && filesOnDisk() === onDisk && rows(PR) === 3, lines2.map((r) => r.status));
  const link = await call("POST", `identity-checks/${c3.body.id}/copy/download-link`, R.token);
  const got = await call("GET", link.body.url, R.token);
  ok("FO-13i DW3 pass: the copy's link works within its lifetime: the same bytes, as an attachment, not cached, not sniffed",
    link.status === 200 && /^\/api\/front-office\/identity-copies\//.test(link.body.url) && got.status === 200 && got.text.includes(BYTES_MARK)
    && /attachment/.test(got.headers.get("content-disposition") ?? "") && got.headers.get("cache-control") === "no-store" && got.headers.get("x-content-type-options") === "nosniff", [link.body, got.status]);
  const firmB = await call("GET", link.body.url, S.token), bLink = await call("POST", `identity-checks/${c3.body.id}/copy/download-link`, S.token);
  const noShow = await call("GET", link.body.url, BF.token), noShowLink = await call("POST", `identity-checks/${c3.body.id}/copy/download-link`, BF.token);
  const other = await call("GET", link.body.url, RO.token);
  ok("FO-13i DW3 fail: the link is refused for firm B (404, and firm B gets no link) and for a person without agent/document:show (403); another person's replay is 404",
    firmB.status === 404 && bLink.status === 404 && noShow.status === 403 && noShowLink.status === 403 && other.status === 404, [firmB.status, bLink.status, noShow.status, noShowLink.status, other.status]);
  const retainerRoute = await call("GET", `files/${link.body.url.split("/").pop()}`, R.token);
  nowMs += 5 * 60_000 + 1000;
  const late = await call("GET", link.body.url, R.token);
  ok("FO-13i DW3 fail: the link is refused after its lifetime (410), and the retainers' files/:token does not serve it (404)", late.status === 410 && retainerRoute.status === 404, [late.status, retainerRoute.status]);
  nowMs = Date.now();

  // Idempotent creates (STANDARDS §4 [M]; Devin on #2011): one requestId is one check.
  const RID = crypto.randomUUID(), before7 = rows(PR), ev = () => Number(sql(`select count(*) from module_event where type = '${EVENT.IDENTITY_CHECKED}'`));
  const ev0 = ev(), withCopy = () => form({ ...docFields, requestId: RID }, { bytes: pdf, name: "p.pdf", type: "application/pdf" });
  // Three at once on a fresh id first (the database's unique id decides, review n4), then one after another.
  const i3 = await Promise.all([1, 2, 3].map(() => call("POST", `people/${PR}/identity-checks`, R.token, withCopy())));
  const i1 = i3.find((r) => r.status === 201) ?? i3[0], i2 = await call("POST", `people/${PR}/identity-checks`, R.token, withCopy());
  ok("FO-13i DW3 pass (idempotent): the same Save replayed, one after another and three at once, is one check (its id is the requestId), one event, one copy on disk",
    i1.status === 201 && i1.body.id === RID && i2.body?.id === RID && i3.every((r) => r.body?.id === RID) && rows(PR) === before7 + 1 && ev() === ev0 + 1 && filesOnDisk() === onDisk + 1, [i1.status, i2.status, i3.map((r) => r.status), rows(PR) - before7, ev() - ev0]);
  const iOther = await call("POST", `people/${PR}/identity-checks`, R.token, { ...good, requestId: RID }), iBad = await call("POST", `people/${PR}/identity-checks`, R.token, { ...good, requestId: "x" });
  const iNone = await fetch(`${BASE}/people/${PR}/identity-checks`, { method: "POST", headers: { authorization: `Bearer ${R.token}`, "content-type": "application/json" }, body: JSON.stringify(good) }).then(async (r) => ({ status: r.status, body: await r.json() }));
  const otherBytes = new TextEncoder().encode("%PDF-1.4\n% other bytes\n%%EOF\n");
  const iBytes = await call("POST", `people/${PR}/identity-checks`, R.token, form({ ...docFields, requestId: RID }, { bytes: otherBytes, name: "p.pdf", type: "application/pdf" }));
  const iB = await call("POST", `people/${PB}/identity-checks`, S.token, { ...good, requestId: RID });
  ok("FO-13i DW3 fail (idempotent): the same requestId with other details or another copy → 409 REQUEST_REUSED (also from firm B, which learns nothing else); a missing or malformed requestId → 422; nothing stored",
    iOther.status === 409 && iOther.body.code === "REQUEST_REUSED" && iBytes.status === 409 && iBytes.body.code === "REQUEST_REUSED" && iBad.status === 422 && iNone.status === 422 && iNone.body.fields?.requestId && iB.status === 409 && rows(PR) === before7 + 1 && rows(PB) === 0, [iOther.status, iBytes.status, iBad.status, iNone.status, iB.status]);

  // ---------------------------------------------------------------------------------------------------------- DW4
  clearingConflicts(db, { retainers: Retainers.prototype });   // FO-13c: the conflict check first
  const svc = app.get(Retainers), ctxR = { staffId: R.id, firmId: A, firmKey: "sample-firm", roles: [], keys: [], duties: [], authTime: 0, via: "local" as const };
  const tpl = await svc.uploadTemplate(ctxR, { name: "FO-13i retainer" }, { bytes: buildDocx(["Client {client.name}", "{#fees}", "{label}: {amount}", "{/fees}"]), size: 1000 });
  const prospectOf = (p: string) => {
    const id = u();
    sql(`insert into fo_prospect (id, firm_id, lead_id, type, stage_id, subject_person_id, primary_contact_person_id, owner_staff_id, created_by, updated_at)
      select '${id}', '${A}', l.id, 'INDIVIDUAL', (select id from fo_stage where firm_id = '${A}' and pipeline = 'INDIVIDUAL' and key = 'ENGAGED'), '${p}', '${p}', '${R.id}', 'test', now() from fo_lead l where l.person_id = '${p}';
      update fo_lead set state = 'ENGAGED', engaged_at = now(), engaged_by = 'test' where person_id = '${p}';
      insert into fo_stage_move (firm_id, prospect_id, to_stage_id, cause, by_actor) select firm_id, id, stage_id, 'PERSON', 'test' from fo_prospect where id = '${id}'`);
    return id;
  };
  const PN = person(R.id, "Client D");
  const draftFor = async (p: string) => (await svc.draft(ctxR, prospectOf(p), { templateId: tpl.id, fees: [{ label: "Fee", amountMinor: 100000, when: "ON_SIGNING" }] })).id;
  const rNo = await draftFor(PN), rYes = await draftFor(PR);
  const sNo = await call("POST", `retainers/${rNo}/send`, R.token, { expectedVersion: 1 });
  const line = sql(`select summary || '|' || (detail->>'warning') from audit_event where action = 'retainer.sent' and entity_key = '${rNo}'`);
  ok("FO-13i DW4 pass: Send without a check → 200 SENT with \"No identity check is recorded for Client D Sample.\" in warnings and on the version's audit line",
    sNo.status === 200 && sNo.body.status === "SENT" && JSON.stringify(sNo.body.warnings) === JSON.stringify(["No identity check is recorded for Client D Sample."]) && /no identity check is recorded for the signer\|NO_IDENTITY_CHECK$/.test(line), [sNo.body?.warnings, line]);
  const sYes = await call("POST", `retainers/${rYes}/send`, R.token, { expectedVersion: 1 });
  ok("FO-13i DW4 fail: with a check recorded for the signer → 200 and no warning (answer and audit line)",
    sYes.status === 200 && sYes.body.status === "SENT" && Array.isArray(sYes.body.warnings) && sYes.body.warnings.length === 0 && sql(`select coalesce(detail->>'warning', 'none') from audit_event where action = 'retainer.sent' and entity_key = '${rYes}'`) === "none", sYes.body?.warnings);

  // Break B-3: a company's signatory (their lead is user-O's) is warned about on R's Send, so R may record their check.
  const CO = u(), SIG = person(O.id, "Signatory"), PC = person(R.id, "Primary"), PCO = u();
  sql(`insert into fo_company (id, firm_id, operating_name, normalised_name, created_by, updated_at) values ('${CO}', '${A}', 'Sample Bakery Ltd', 'sample bakery', 'test', now());
    insert into fo_company_contact (firm_id, company_id, person_id, role, created_by) values ('${A}', '${CO}', '${PC}', 'PRIMARY', 'test'), ('${A}', '${CO}', '${SIG}', 'SIGNATORY', 'test');
    update fo_lead set state = 'ENGAGED', engaged_at = now(), engaged_by = 'test' where person_id = '${PC}';
    insert into fo_prospect (id, firm_id, lead_id, type, stage_id, subject_company_id, primary_contact_person_id, owner_staff_id, created_by, updated_at)
      select '${PCO}', '${A}', l.id, 'CORPORATE', (select id from fo_stage where firm_id = '${A}' and pipeline = 'CORPORATE' and key = 'ENGAGED'), '${CO}', '${PC}', '${R.id}', 'test', now() from fo_lead l where l.person_id = '${PC}';
    insert into fo_stage_move (firm_id, prospect_id, to_stage_id, cause, by_actor) select firm_id, id, stage_id, 'PERSON', 'test' from fo_prospect where id = '${PCO}'`);
  const rCo = (await svc.draft(ctxR, PCO, { templateId: tpl.id, fees: [{ label: "Fee", amountMinor: 100000, when: "ON_SIGNING" }] })).id;
  const sCo = await call("POST", `retainers/${rCo}/send`, R.token, { expectedVersion: 1 });
  const coList = await call("GET", `people/${SIG}/identity-checks`, R.token), coRec = await call("POST", `people/${SIG}/identity-checks`, R.token, { method: "VIDEO", details: ["NAME"] });
  const oCo = await call("GET", `people/${SIG}/identity-checks`, RO.token);
  ok("FO-13i DW4 pass (break B-3): a company's signatory warned about on Send can be listed and checked by the prospect's owner (the signatory's lead is another's); a reader with neither still gets 404",
    sCo.status === 200 && /Signatory Sample/.test(JSON.stringify(sCo.body.warnings)) && coList.status === 200 && coRec.status === 201 && oCo.status === 404, [sCo.body?.warnings, coList.status, coRec.status, oCo.status]);

  // ---------------------------------------------------------------------------------------------------------- DW5
  const o1 = await call("POST", `people/${PO}/identity-checks`, O.token, { method: "IN_PERSON", details: ["NAME"] });
  const ro = await call("POST", `people/${PO}/identity-checks`, RO.token, { method: "IN_PERSON", details: ["NAME"] });
  ok("FO-13i DW5 pass/fail: a Case Officer records on their own lead's person (201); a person without agent/identity-check:record → 403, nothing stored",
    o1.status === 201 && ro.status === 403 && rows(PO) === 2, [o1.status, ro.status]);
  const oSeesR = await call("GET", `people/${PR}/identity-checks`, O.token), oRecR = await call("POST", `people/${PR}/identity-checks`, O.token, { method: "IN_PERSON", details: ["NAME"] });
  const oLink = await call("POST", `identity-checks/${c3.body.id}/copy/download-link`, O.token), bList = await call("GET", `people/${PR}/identity-checks`, S.token);
  const oOwn = await call("GET", `people/${PO}/identity-checks`, O.token), bOwn = await call("GET", `people/${PB}/identity-checks`, R.token);
  ok("FO-13i DW5 fail: a reader who cannot see the person → 404 on list, record and the copy's link (the Case Officer on another's lead; firm B; firm A on firm B's person)",
    oSeesR.status === 404 && oRecR.status === 404 && oLink.status === 404 && bList.status === 404 && bOwn.status === 404 && rows(PR) === 4, [oSeesR.status, oRecR.status, oLink.status, bList.status, bOwn.status]);
  ok("FO-13i DW5 pass: the Case Officer lists their own person's checks", oOwn.status === 200 && oOwn.body.checks.length === 2, oOwn.body);

  // ---------------------------------------------------------------------------------------------------------- DW6
  const allRows = Number(sql(`select count(*) from fo_identity_check`));
  const outbox = sql(`select coalesce(string_agg(payload::text, ' '), '') from module_event where type = '${EVENT.IDENTITY_CHECKED}'`);
  const audit = sql(`select coalesce(string_agg(summary || ' ' || coalesce(detail::text, ''), ' '), '') from audit_event where entity = 'fo_identity_check' or action like 'retainer.%'`);
  const secrets = [FULL, "Q7R2", "Q7R2X", "q7r2", "Z9K1", "Z9k1", BYTES_MARK, link.body.url.split("/").pop(), row3[0], row3[1]];
  const where = (s: string) => secrets.filter((x) => s.includes(x));
  ok(`FO-13i DW6 pass: one identity.checked event and one audit line per saved check (${allRows}), ids, method and detail names only`,
    Number(sql(`select count(*) from module_event where type = '${EVENT.IDENTITY_CHECKED}'`)) === allRows && Number(sql(`select count(*) from audit_event where entity = 'fo_identity_check'`)) === allRows && /"method": ?"DOCUMENT_COPY"/.test(outbox), outbox.slice(0, 300));
  ok("FO-13i DW6 fail: the captured log lines, the outbox payloads and the audit details hold no document number (full or last 4), no copy key, sha256 or link, and no copy bytes",
    where(logged.join("\n")).length === 0 && where(outbox).length === 0 && where(audit).length === 0, { log: where(logged.join("\n")), outbox: where(outbox), audit: where(audit) });
} catch (e) {
  fail++; console.log(`FAIL  FO-13i: the run stopped — ${String((e as Error)?.stack ?? e).slice(0, 800)}`);
} finally {
  for (const a of apps) await a.close();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\nFO-13i: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
