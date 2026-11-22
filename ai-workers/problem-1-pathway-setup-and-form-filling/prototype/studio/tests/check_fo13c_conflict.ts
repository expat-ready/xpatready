// FO-13c (P-579, P-606; brief lead-b-briefs/FO-13c.md): the conflict-of-interest check and its gate before a person
// becomes a client. Named cases DW1-DW7 of the brief, each with a passing and a failing case (Code SOR/2022-128 s. 5, 15,
// 16, 24(3)(o), 35(1)(c); "a recorded check before the retainer is sent" is our product rule; Unconfirmed: no counsel).
// One scratch database, demo-shaped (rev 16.7): every migration before FO-13c's key, the Sample firms and staff, the key
// migration (checked right after it), then every later one and FO-1a's front-office seed. A Nest app is built from the
// conflict and retainer features beside PF-4's guard and the local sign-in stand-in; the conflict service runs on the case
// side's `fakePartySearch()` (CS-S1b is not on main). Convert runs on the sales service. No browser, no model call (US$0).
//   tsx studio/tests/check_fo13c_conflict.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const NEW = "20261121030000_fo13c_conflict_check_key", KEY = "agent/conflict:check";
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo13c_${process.pid}`, URL = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;
const WORK = join(STUDIO, "var", `fo13c-check-${process.pid}`);

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const psql = (args: string[]) => execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = (q: string) => psql(["-Atc", q]);
const refused = (q: string, re: RegExp) => { try { sql(q); return false; } catch (e) { return re.test(String((e as { stderr?: string }).stderr ?? e)); } };

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
mkdirSync(WORK, { recursive: true });
process.env.DATABASE_URL = URL; process.env.FO_FILES_DIR = join(WORK, "files"); process.env.FO_FILES_LINK_KEY = "fo13c-check-link-key-0123456789abcdef";
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED"]) delete process.env[k];

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { seedSampleFirmsFrontOffice } = await import("../api/src/front-office/firm-seed.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { EVERYONE_SEES_ALL, writeSetting } = await import("../api/src/platform/settings.ts");
const { platformAuditWorkspaceId, auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const { buildDocx } = await import("../api/src/front-office/retainers/docx.ts");
const { Retainers } = await import("../api/src/front-office/retainers/service.ts");
const { Prospects } = await import("../api/src/front-office/sales/prospects.ts");
const { ConsentStore } = await import("../api/src/platform/messages/consent/consent-store.ts");
const { ConflictChecks, NOT_SEARCHED } = await import("../api/src/front-office/compliance/conflict/service.ts");
const { withFirm } = await import("../api/src/platform/firm-scope.ts");
const { EVENT } = await import("../ports/events.ts");
const { fakePartySearch } = await import("../ports/party-search.ts");
const conflictFeature = (await import("../api/src/features/front-office-conflict.ts")).default;
const retainers = (await import("../api/src/features/front-office-retainers.ts")).default;

const apps: { close(): Promise<void> }[] = [];
try {
  // ------------------------------------------------------------------------------- the key migration (parallel world)
  const all = readdirSync(MIG).filter((d) => /^\d{14}_/.test(d)).sort();
  for (const d of all.filter((x) => x < NEW)) psql(["-f", join(MIG, d, "migration.sql")]);
  const db = new Db();
  await seedSampleFirms(db);
  const counts = () => sql(`select (select count(*) from platform_role_permission) || ':' || (select count(*) from platform_permission_key)`).split(":").map(Number);
  const before = counts();
  ok("FO-13c key fail: before the migration agent/conflict:check is not seeded", sql(`select count(*) from platform_role_permission where permission_key = '${KEY}'`) === "0");
  psql(["-f", join(MIG, NEW, "migration.sql")]);
  const after = counts();
  for (const d of all.filter((x) => x > NEW)) psql(["-f", join(MIG, d, "migration.sql")]);
  ok("FO-13c key pass: the migration (its own stamp) adds the key for OWNER, ADMIN, CASE_MANAGER, CASE_OFFICER and its catalogue row (NONE, GENERAL) on demo data, nothing else",
    all.filter((d) => d.slice(0, 14) === NEW.slice(0, 14)).length === 1 && after[0] === before[0] + 4 && after[1] === before[1] + 1
    && sql(`select string_agg(role::text, ',' order by role) from platform_role_permission where permission_key = '${KEY}'`) === "OWNER,ADMIN,CASE_MANAGER,CASE_OFFICER"
    && sql(`select scope || ':' || class from platform_permission_key where key = '${KEY}'`) === "NONE:GENERAL", { before, after });
  await seedSampleFirmsFrontOffice(db);

  const A = sql(`select id from platform_firm where key='sample-firm'`), B = sql(`select id from platform_firm where key='sample-solo'`);
  const sid = (actor: string) => sql(`select id from platform_staff where actor_id='${actor}'`);
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "seed:fo13c", workspaceId: await platformAuditWorkspaceId(db as never) });
  const local = new LocalIdentity("fo13c-check-signing-key-0123456789abcdef", () => Date.now());
  const token = (staffId: string) => local.issue(staffId, { authTimeMs: Date.now() - 60_000, secondStep: true });
  const staff = async (firmId: string, name: string, role: string) => {
    const s = await db.platformStaff.create({ data: { firmId, email: `${name}@fo13c.example.com`, displayName: `Sample ${name}`, actorId: `fo13c-${name}`, status: "ACTIVE" } });
    await db.platformRoleGrant.create({ data: { firmId, staffId: s.id, role: role as never, grantedBy: "seed:fo13c" } });
    return { id: s.id, token: token(s.id) };
  };
  // R: Owner + Case Manager (the checker); T: Case Manager; O: Case Officer; AD: Admin (a confirmer); RO: read only; S: firm B.
  const who = (a: string) => ({ id: sid(a), token: token(sid(a)) });
  const R = who("user-R"), T = who("user-T"), O = who("user-O"), S = who("user-S");
  const AD = await staff(A, "admin", "ADMIN"), RO = await staff(A, "read-only", "READ_ONLY");

  const fake = fakePartySearch(A);
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: { now: () => Date.now() } }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
    { provide: ConflictChecks, useFactory: (d: InstanceType<typeof Db>) => new ConflictChecks(d, { now: () => Date.now() }, fake), inject: [Db] }, ...retainers.providers];
  @Module({ controllers: [...conflictFeature.controllers, ...retainers.controllers] as never[], providers: providers as never[] }) class TestApp {}
  const app = await NestFactory.create(TestApp, { logger: false });
  await app.listen(0, "127.0.0.1"); apps.push(app);
  const BASE = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}/api/front-office`;
  type Res = { status: number; body: any };
  const call = async (method: string, path: string, tok: string, body?: Record<string, unknown>): Promise<Res> => {
    if (method === "POST" && path === "conflict-checks" && body && !("requestId" in body)) body = { requestId: crypto.randomUUID(), ...body };
    const r = await fetch(`${BASE}/${path}`, { method, headers: { authorization: `Bearer ${tok}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text(); let b: any = text; try { b = JSON.parse(text); } catch { /* text */ }
    return { status: r.status, body: b };
  };
  const check = (prospectId: string, extra: Record<string, unknown> = {}, tok = R.token) => call("POST", "conflict-checks", tok, { prospectId, ...extra });

  let n = 1;
  const u = () => `00000000-0000-4000-8000-${String(n++).padStart(12, "0")}`;
  const person = (owner: string | null, given: string, o: { firm?: string; email?: string; phone?: string } = {}) => {
    const id = u(), firm = o.firm ?? A;
    sql(`insert into fo_person (id, firm_id, given_names, family_name, email, phone, created_by, updated_at) values ('${id}', '${firm}', '${given}', 'Sample', '${o.email ?? `${given.toLowerCase().replace(/ /g, ".")}@example.com`}', ${o.phone ? `'${o.phone}'` : "null"}, 'test', now());
      insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, created_by, updated_at) values ('${u()}', '${firm}', '${id}', 'MANUAL', 'WEBSITE', ${owner ? `'${owner}'` : "null"}, 'test', now())`);
    return id;
  };
  const prospectOf = (p: string, owner = R.id) => {
    const id = u();
    sql(`insert into fo_prospect (id, firm_id, lead_id, type, stage_id, subject_person_id, primary_contact_person_id, owner_staff_id, created_by, updated_at)
      select '${id}', '${A}', l.id, 'INDIVIDUAL', (select id from fo_stage where firm_id = '${A}' and pipeline = 'INDIVIDUAL' and key = 'ENGAGED'), '${p}', '${p}', '${owner}', 'test', now() from fo_lead l where l.person_id = '${p}';
      update fo_lead set state = 'ENGAGED', engaged_at = now(), engaged_by = 'test' where person_id = '${p}';
      insert into fo_stage_move (firm_id, prospect_id, to_stage_id, cause, by_actor) select firm_id, id, stage_id, 'PERSON', 'test' from fo_prospect where id = '${id}'`);
    return id;
  };
  const ctxR = { staffId: R.id, firmId: A, firmKey: "sample-firm", roles: ["OWNER", "CASE_MANAGER"], keys: [], duties: [], authTime: 0, via: "local" as const };
  const svc = app.get(Retainers), pros = new Prospects(db, { audit: auditEvent, consent: new ConsentStore(auditEvent), publicOrigin: "http://localhost:4400" });
  const plain = await svc.uploadTemplate(ctxR, { name: "FO-13c plain" }, { bytes: buildDocx(["Client {client.name}", "{#fees}", "{label}: {amount}", "{/fees}"]), size: 1000 });
  const disc = await svc.uploadTemplate(ctxR, { name: "FO-13c disclosure" }, { bytes: buildDocx(["Client {client.name}", "Conflict: {conflict.disclosure}", "{#fees}", "{label}: {amount}", "{/fees}"]), size: 1000 });
  const draft = async (prospectId: string, templateId = plain.id) => (await svc.draft(ctxR, prospectId, { templateId, fees: [{ label: "Fee", amountMinor: 100000, when: "ON_SIGNING" }] })).id;
  const send = (rid: string, tok = R.token) => call("POST", `retainers/${rid}/send`, tok, { expectedVersion: 1 });
  const ctxT = { ...ctxR, staffId: T.id, roles: ["CASE_MANAGER"] };
  const pdf = () => { const b = new TextEncoder().encode("%PDF-1.4\n% signed\n%%EOF\n"); return { bytes: b, size: b.length }; };
  const refusal = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { return (e as { getResponse?: () => any }).getResponse?.() ?? { error: String(e) }; } };
  const won = (p: string) => sql(`select s.kind from fo_prospect p join fo_stage s on s.id = p.stage_id where p.id = '${p}'`) === "WON";

  // ---------------------------------------------------------------------------------------------------------- DW1
  const P1 = person(R.id, "Dana"), X1 = prospectOf(P1), r1 = await draft(X1);
  const s1 = await send(r1);
  ok("FO-13c DW1 fail: Send without a check → 409 CONFLICT_CHECK_REQUIRED naming the reason and the Code; the retainer stays a draft",
    s1.status === 409 && s1.body.code === "CONFLICT_CHECK_REQUIRED" && /s\. 5, 15/.test(s1.body.detail) && sql(`select status from fo_retainer where id = '${r1}'`) === "DRAFT", s1);
  const l1 = await call("GET", `prospects/${X1}/conflict-checks`, R.token);
  const c1 = await check(X1, { result: "NO_CONFLICT" }), s1b = await send(r1);
  const l1b = await call("GET", `prospects/${X1}/conflict-checks`, R.token), rName = sql(`select display_name from platform_staff where id = '${R.id}'`);
  ok("FO-13s API pass/fail (clearance, names): before any check the list's clearance is the gate's refusal (not ok, CONFLICT_CHECK_REQUIRED, its words); after a NO_CONFLICT check it is ok and the check names its checker",
    l1.status === 200 && l1.body.clearance?.ok === false && l1.body.clearance.code === "CONFLICT_CHECK_REQUIRED" && /s\. 5, 15/.test(l1.body.clearance.detail)
    && l1b.body.clearance?.ok === true && l1b.body.checks[0].checkedByName === rName && l1b.body.checks[0].confirmedByName === null, [l1.body?.clearance, l1b.body?.clearance, l1b.body?.checks?.[0]?.checkedByName]);
  ok("FO-13c DW1 pass: with a recorded NO_CONFLICT check (201, who and when stored) → Send proceeds",
    c1.status === 201 && c1.body.result === "NO_CONFLICT" && c1.body.checkedBy === R.id && !!c1.body.checkedAt && s1b.status === 200 && s1b.body.status === "SENT", [c1, s1b.status]);
  const cv0 = prospectOf(person(R.id, "Ellis")), cvRef = await refusal(() => pros.convert(ctxR, cv0, {}));
  ok("FO-13c DW1 fail (R1.108): Convert to client without a recorded check → refused (409), the prospect is not won, no prospect.won", cvRef?.code === "CONFLICT_CHECK_REQUIRED" && !won(cv0)
    && sql(`select count(*) from module_event where type = '${EVENT.PROSPECT_WON}' and subject_id = '${cv0}'`) === "0", cvRef);
  await check(cv0, { result: "NO_CONFLICT" }); await pros.convert(ctxR, cv0, {});
  ok("FO-13c DW1 pass (R1.108): with a recorded check, Convert makes the client", won(cv0));

  // ---------------------------------------------------------------------------------------------------------- DW2
  // A current client (cv0's person, "Ellis") shares an email with a new person; a sponsor on a case shares a phone; a
  // person only user-O sees shares a name; firm B has the same email.
  const shared = sql(`select email from fo_person where id = (select subject_person_id from fo_prospect where id = '${cv0}')`);
  person(O.id, "Fenna Hidden"); person(S.id, "Gale", { firm: B, email: shared });
  const P2 = person(R.id, "Gale", { email: shared, phone: "+14165550199" }), X2 = prospectOf(P2);
  const pv = await call("POST", "conflict-checks/preview", R.token, { prospectId: X2 });
  const fo = pv.body.matches?.find((m: any) => m.source === "FRONT_OFFICE"), cs = pv.body.matches?.find((m: any) => m.source === "CASE");
  ok("FO-13c DW2 pass: a match with a current client (same email) is found and named as a client; a case's sponsor (same phone, fakePartySearch) is found with its case",
    pv.status === 200 && fo?.kind === "PROSPECT" && /· client$/.test(fo.displayName) && fo.matchedOn.includes("EMAIL") && cs?.kind === "SPONSOR" && cs.caseNumber === "C-2026-2" && cs.matchedOn.includes("PHONE"), pv.body);
  ok("FO-13c DW2 fail: firm B's person with the same email is never a match, and the person checked is not their own match",
    pv.body.matches.every((m: any) => m.recordId !== P2) && Number(sql(`select count(*) from fo_person where firm_id = '${B}' and email = '${shared}'`)) === 1 && pv.body.matches.filter((m: any) => m.source === "FRONT_OFFICE").length === 1, pv.body.matches);
  const P3 = person(T.id, "Fenna Hidden", { email: "fenna.other@example.com" }), X3 = prospectOf(P3, T.id);
  fake.parties.push({ firmId: A, kind: "OTHER_PARTY", recordId: u(), caseId: u(), caseNumber: "C-2026-9", roleOnCase: "OTHER_PARTY", displayName: "Fenna Hidden Sample", hidden: true, seenBy: [AD.id] });
  const pv3 = await call("POST", "conflict-checks/preview", T.token, { prospectId: X3 });
  ok("FO-13c DW2 fail: a match the checker (a Case Manager) may not see (user-O's lead; a hidden case party) is counted in hiddenCount and never named",
    pv3.status === 200 && pv3.body.hiddenCount === 2 && !/Fenna/.test(JSON.stringify(pv3.body.matches)) && !!pv3.body.hiddenLine, pv3.body);
  const c2 = await check(X2, { result: "NO_CONFLICT" }), grouped = c2.body.byCase?.[0];
  ok("FO-13c DW2 pass: the recorded check stores the matches as found, case matches grouped by case", c2.status === 201 && c2.body.matches.length === pv.body.matches.length && grouped?.caseNumber === "C-2026-2" && grouped.parties.length === 1, c2.body);

  // ---------------------------------------------------------------------------------------------------------- DW6
  const c3n = await check(X3, { result: "NO_CONFLICT" }, T.token), c3p = await check(X3, { result: "POTENTIAL_CONFLICT", disclosureText: "Sample." }, T.token);
  ok("FO-13c DW6 fail (review M1): with hidden matches any result at insert (NO_CONFLICT, POTENTIAL_CONFLICT) → 409 NEEDS_CONFIRMATION, nothing stored",
    c3n.status === 409 && c3n.body.code === "NEEDS_CONFIRMATION" && c3p.status === 409 && sql(`select count(*) from fo_conflict_check where prospect_id = '${X3}'`) === "0", [c3n.body, c3p.status]);
  const c3 = await check(X3, {}, T.token), id3 = c3.body.id;
  const selfC = await call("POST", `conflict-checks/${id3}/confirm`, T.token, { result: "NO_CONFLICT" }), oC3 = await call("POST", `conflict-checks/${id3}/confirm`, O.token, { result: "NO_CONFLICT" });
  const rC3 = await call("POST", `conflict-checks/${id3}/confirm`, R.token, { result: "NO_CONFLICT" }), bC3 = await call("POST", `conflict-checks/${id3}/confirm`, S.token, { result: "NO_CONFLICT" });
  ok("FO-13c DW6 fail: a check with hidden matches is written with no result; its checker confirming → 403; a Case Officer → 404 (its state is not told, break R3-m5); the Owner from whom the case party is hidden too → 403 (review M3); firm B → 404",
    c3.status === 201 && c3.body.result === null && c3.body.needsConfirmation === true && selfC.status === 403 && oC3.status === 404 && rC3.status === 403 && /hidden from you too/.test(rC3.body.detail) && bC3.status === 404, [c3.body, selfC.status, oC3.status, rC3.status, bC3.status]);
  const adFor = await call("GET", `conflict-checks/${id3}/for-confirmation`, AD.token), tFor = await call("GET", `conflict-checks/${id3}/for-confirmation`, T.token);
  const adList = await call("GET", `prospects/${X3}/conflict-checks`, AD.token), adPv = await call("POST", "conflict-checks/preview", AD.token, { prospectId: X3 }), adRec = await check(X3, { result: "CONFLICT_CANNOT_ACT" }, AD.token);
  ok("FO-13c DW6 pass (review M3): the firm's Admin reads the check waiting for confirmation with its terms searched again seeing every match (both hidden ones named, none hidden); its checker cannot (404)",
    adFor.status === 200 && adFor.body.id === id3 && adFor.body.hiddenNow === 0 && (JSON.stringify(adFor.body.matchesNow).match(/Fenna Hidden Sample/g) ?? []).length === 2 && tFor.status === 404, [adFor.body, tFor.status]);
  ok("FO-13c DW6 fail (break R2-M2): beyond confirming, the Admin has no reach into a prospect they cannot see: its list, preview and a new check → 404",
    adList.status === 404 && adPv.status === 404 && adRec.status === 404, [adList.status, adPv.status, adRec.status]);
  const sx = await send(await (async () => (await svc.draft(ctxT, X3, { templateId: plain.id, fees: [{ label: "Fee", amountMinor: 100000, when: "ON_SIGNING" }] })).id)(), T.token);
  ok("FO-13c DW6 fail: Send while the check waits for its confirmation → 409 CONFLICT_CHECK_UNCONFIRMED", sx.status === 409 && sx.body.code === "CONFLICT_CHECK_UNCONFIRMED", sx);
  const adC = await call("POST", `conflict-checks/${id3}/confirm`, AD.token, { result: "NO_CONFLICT" }), again = await call("POST", `conflict-checks/${id3}/confirm`, AD.token, { result: "NO_CONFLICT" });
  ok("FO-13c DW6 pass: the firm's Admin, who sees every match, confirms once (result recorded with who and when); a second confirmation → 409",
    adC.status === 200 && adC.body.result === "NO_CONFLICT" && adC.body.confirmedBy === AD.id && !!adC.body.confirmedAt && again.status === 409, [adC, again.status]);
  // Review M2: a reader who did not run the check (the prospect handed to another) reads it with the matches counted, not named.
  const rList = await call("GET", `prospects/${X2}/conflict-checks`, R.token);
  sql(`update fo_prospect set owner_staff_id = '${T.id}' where id = '${X2}'`);
  const tList = await call("GET", `prospects/${X2}/conflict-checks`, T.token), rGone = await call("GET", `prospects/${X2}/conflict-checks`, R.token);
  ok("FO-13c DW2 fail (review M2): the prospect's new owner reads R's check with no match named, all counted as hidden; R (the checker) read the names while it was theirs, and no longer sees the prospect (404)",
    tList.status === 200 && tList.body.checks.every((c: any) => c.matches.length === 0 && c.hiddenCount >= 2) && /client/.test(JSON.stringify(rList.body.checks[0].matches)) && rGone.status === 404, [tList.body, rList.status, rGone.status]);
  sql(`update fo_prospect set owner_staff_id = '${R.id}' where id = '${X2}'`);
  ok("FO-13c DW6 fail (FO-13's triggers): changing a recorded result or what was searched → refused by the database; deleting a check → refused",
    refused(`update fo_conflict_check set result = 'CONFLICT_CANNOT_ACT' where id = '${c1.body.id}'`, /never changes/) && refused(`update fo_conflict_check set searched_email = 'x@y.zz' where id = '${c1.body.id}'`, /never changes/)
    && refused(`delete from fo_conflict_check where id = '${c1.body.id}'`, /fo_conflict_check|refuse|never/i));
  const roC = await check(X2, { result: "NO_CONFLICT" }, RO.token), oC = await check(X2, { result: "NO_CONFLICT" }, O.token), bC = await check(X2, { result: "NO_CONFLICT" }, S.token);
  ok("FO-13c DW6 fail: without agent/conflict:check → 403; a Case Officer who cannot see the prospect, or firm B → 404", roC.status === 403 && oC.status === 404 && bC.status === 404, [roC.status, oC.status, bC.status]);
  const rid = crypto.randomUUID(), i1 = await check(X2, { requestId: rid, result: "NO_CONFLICT" }), i2 = await check(X2, { requestId: rid, result: "NO_CONFLICT" }), i3 = await check(X1, { requestId: rid, result: "NO_CONFLICT" });
  ok("FO-13c DW6 pass/fail (idempotent): one requestId replayed is one check; the same id for another prospect → 409 REQUEST_REUSED",
    i1.status === 201 && i2.body.id === rid && i3.status === 409 && sql(`select count(*) from fo_conflict_check where id = '${rid}'`) === "1", [i1.status, i2.status, i3.status]);

  // ---------------------------------------------------------------------------------------------------------- DW3
  const P4 = person(R.id, "Harper"), X4 = prospectOf(P4), r4 = await draft(X4);
  await check(X4, { result: "CONFLICT_CANNOT_ACT" });
  const s4 = await send(r4), o4 = await refusal(() => svc.signedOffline(ctxR, r4, { expectedVersion: "1", reason: "Signed at the office" }, pdf())), v4 = await refusal(() => pros.convert(ctxR, X4, {}));
  ok("FO-13c DW3 fail (s. 15(2), 16(1)): CONFLICT_CANNOT_ACT blocks Send, Signed offline and Convert with the Code's reason; the prospect is not won",
    s4.status === 409 && s4.body.code === "CONFLICT_CANNOT_ACT" && /15\(2\), 16\(1\)/.test(s4.body.detail) && o4?.code === "CONFLICT_CANNOT_ACT" && v4?.code === "CONFLICT_CANNOT_ACT" && !won(X4)
    && sql(`select status from fo_retainer where id = '${r4}'`) === "DRAFT", [s4.body, o4, v4]);
  const two = await Promise.all([send(r4), send(r4)]);
  ok("FO-13c DW3 fail: two Sends at once after CONFLICT_CANNOT_ACT are both refused", two.every((x) => x.status === 409 && x.body.code === "CONFLICT_CANNOT_ACT"), two.map((x) => x.status));
  await check(X4, { result: "NO_CONFLICT" });
  await svc.signedOffline(ctxR, r4, { expectedVersion: "1", reason: "Signed at the office" }, pdf());
  ok("FO-13c DW3 pass: after a new NO_CONFLICT check, Signed offline makes the client", won(X4));

  // ---------------------------------------------------------------------------------------------------------- DW4
  const P5 = person(R.id, "Indigo"), X5 = prospectOf(P5);
  const noText = await check(X5, { result: "POTENTIAL_CONFLICT" }), textOther = await check(X5, { result: "NO_CONFLICT", disclosureText: "x" });
  ok("FO-13c DW4 fail: POTENTIAL_CONFLICT without disclosure text → 422 on disclosureText; a disclosure with another result → 422",
    noText.status === 422 && !!noText.body.fields?.disclosureText && textOther.status === 422, [noText.body, textOther.status]);
  const TEXT = "We acted for your employer in 2025. Sample disclosure.";
  const LONG = "Sample disclosure 😀 ".repeat(450), XL = prospectOf(person(R.id, "Long Text")), cl = await check(XL, { result: "POTENTIAL_CONFLICT", disclosureText: LONG });
  const auditAfter = sql(`select coalesce(length(detail->>'disclosureText_after'), 0) || ':' || coalesce(length(detail::text), 0) from audit_event where entity_key = '${cl.body?.id}'`);
  ok("FO-13s break M1 pass/fail: a 9,000-character disclosure (the table takes 10,000) is stored whole (201), and the audit line keeps at most 4,000 of it, never a 500",
    cl.status === 201 && sql(`select length(disclosure_text) from fo_conflict_check where id = '${cl.body?.id}'`) === String([...LONG.trim()].length) && Number(auditAfter.split(":")[0]) <= 4000, [cl.status, auditAfter]);
  await check(X5, { result: "POTENTIAL_CONFLICT", disclosureText: TEXT });
  const X5b = prospectOf(person(R.id, "Indigo Two")), X5c = prospectOf(person(R.id, "Indigo Three")), r5old = await draft(X5b, disc.id);
  await check(X5b, { result: "POTENTIAL_CONFLICT", disclosureText: TEXT }); await check(X5c, { result: "POTENTIAL_CONFLICT", disclosureText: TEXT });
  const s5old = await send(r5old), s5plain = await send(await draft(X5c)), v5 = await refusal(() => pros.convert(ctxR, X5, {}));
  ok("FO-13c DW4 fail (s. 24(3)(o), 15(1)): a version drafted before the check, or a template without {conflict.disclosure}, is not sent (409 CONFLICT_DISCLOSURE_NOT_PRINTED); Convert without a signed retainer → 409 CONFLICT_CONSENT_NEEDED",
    s5old.status === 409 && s5old.body.code === "CONFLICT_DISCLOSURE_NOT_PRINTED" && s5plain.status === 409 && s5plain.body.code === "CONFLICT_DISCLOSURE_NOT_PRINTED" && v5?.code === "CONFLICT_CONSENT_NEEDED", [s5old.body, s5plain.body, v5]);
  const r5 = await draft(X5, disc.id), page5 = await svc.read(ctxR, r5), s5 = await send(r5);
  await svc.signedOffline(ctxR, r5, { expectedVersion: "1", reason: "Signed at the office" }, pdf());
  ok("FO-13c DW4 pass: a new version from a template with {conflict.disclosure} prints the disclosure, is sent, and once signed the client is made and the signed retainer is the check's written-consent reference",
    page5.version.values["conflict.disclosure"] === TEXT && !page5.missing.includes("conflict.disclosure") && s5.status === 200 && won(X5)
    && sql(`select written_consent_ref from fo_conflict_check where person_id = '${P5}' and result = 'POTENTIAL_CONFLICT'`) === r5, [page5.version.values["conflict.disclosure"], s5.status]);

  // Break B-1: a version made from a template without the placeholder never counts as printing it, even signed on paper
  // after a newer version that does print it.
  const X5d = prospectOf(person(R.id, "Indigo Four")); await check(X5d, { result: "POTENTIAL_CONFLICT", disclosureText: TEXT });
  const r5d = await draft(X5d); await svc.edit(ctxR, r5d, { templateId: disc.id, expectedVersion: 1, expectedStatus: "DRAFT" });
  const old5 = await refusal(() => svc.signedOffline(ctxR, r5d, { expectedVersion: "2", signedVersion: "1", reason: "Signed at the office" }, pdf()));
  ok("FO-13c DW4 fail (break B-1): Signed offline of version 1 (its template has no {conflict.disclosure}) after version 2 prints it → 409, not won, no consent recorded",
    old5?.code === "CONFLICT_DISCLOSURE_NOT_PRINTED" && !won(X5d) && sql(`select count(*) from fo_conflict_check where prospect_id = '${X5d}' and written_consent_ref is not null`) === "0", old5);
  await svc.signedOffline(ctxR, r5d, { expectedVersion: "2", reason: "Signed at the office" }, pdf());
  ok("FO-13c DW4 pass (break B-1): Signed offline of version 2, which prints it, makes the client", won(X5d));

  // Break R2-M1: the disclosure is printed, never a condition: a template using it as a section is refused at upload.
  const asSection = await refusal(() => svc.uploadTemplate(ctxR, { name: "FO-13c section" }, { bytes: buildDocx(["Client {client.name}", "{^conflict.disclosure}No conflict.{/conflict.disclosure}", "{#fees}", "{label}: {amount}", "{/fees}"]), size: 1000 }));
  ok("FO-13c DW4 fail (break R2-M1): a template with {^conflict.disclosure}…{/conflict.disclosure} is refused, naming it", !!asSection && /conflict\.disclosure-as-a-section/.test(JSON.stringify(asSection)), asSection);

  // ---------------------------------------------------------------------------------------------------------- DW5
  const P6 = person(R.id, "Jules"), X6 = prospectOf(P6), r6 = await draft(X6);
  await check(X6, { result: "NO_CONFLICT" });
  sql(`update fo_person set email = 'jules.new@example.com' where id = '${P6}'`);
  const s6 = await send(r6);
  ok("FO-13c DW5 fail: the person's email changed after the check → Send refused, a new check is needed (409 CONFLICT_CHECK_STALE)", s6.status === 409 && s6.body.code === "CONFLICT_CHECK_STALE" && /new check/.test(s6.body.detail), s6);
  const l6 = await call("GET", `prospects/${X6}/conflict-checks`, R.token);
  ok("FO-13s API fail (clearance): the list's clearance says the same stale refusal as Send, word for word", l6.body.clearance?.ok === false && l6.body.clearance.code === "CONFLICT_CHECK_STALE" && l6.body.clearance.detail === s6.body.detail, l6.body?.clearance);
  sql(`update fo_person set given_names = 'Jule' where id = '${P6}'`);
  const c6 = await check(X6, { result: "NO_CONFLICT" }), s6b = await send(r6);
  const P6b = person(R.id, "Kay"), X6b = prospectOf(P6b), r6b = await draft(X6b);
  await check(X6b, { result: "NO_CONFLICT" }); sql(`update fo_person set family_name = 'Samples' where id = '${P6b}'`);
  const s6c = await send(r6b);
  ok("FO-13c DW5 fail: a one-letter change of the family name alone also asks for a new check", s6c.status === 409 && s6c.body.code === "CONFLICT_CHECK_STALE", s6c.body);
  ok("FO-13c DW5 pass: a new check (it searches the new email and name) clears it", c6.body.searched?.email === "jules.new@example.com" && c6.body.searched?.name === "Jule Sample" && s6b.status === 200, [c6.body.searched, s6b.status]);

  // Break M-2: one requestId with another result is refused, never answered with the old one.
  const X8 = prospectOf(person(R.id, "Mo")), rid8 = crypto.randomUUID();
  const m1 = await check(X8, { requestId: rid8, result: "NO_CONFLICT" }), m2 = await check(X8, { requestId: rid8, result: "CONFLICT_CANNOT_ACT" });
  ok("FO-13c DW6 fail (break M-2): the same requestId with another result → 409 REQUEST_REUSED; the stored check is unchanged", m1.status === 201 && m2.status === 409 && m2.body.code === "REQUEST_REUSED", [m1.status, m2.body]);
  // Break M-5, m-1: a name the public form accepts (a C1 control mark, many emoji) is searched and stored cleaned, never a 500;
  // a disclosure with a direction mark is a 422 (PF-28 part 3b).
  const P9 = person(R.id, "Ana\u0085", { email: "ana.c1@example.com" }), X9 = prospectOf(P9), P9b = person(R.id, "😀".repeat(100), { email: "emoji@example.com" }), X9b = prospectOf(P9b);
  const n9 = await check(X9, { result: "NO_CONFLICT" }), n9b = await check(X9b, { result: "NO_CONFLICT" }), d9 = await check(X8, { result: "POTENTIAL_CONFLICT", disclosureText: "We acted \u202e for them." });
  ok("FO-13c DW6 pass/fail (break M-5, m-1): names with a control mark or 100 emoji are checked (201, stored cleaned); a disclosure with a direction mark → 422",
    n9.status === 201 && n9.body.searched.name === "Ana Sample" && n9b.status === 201 && d9.status === 422, [n9.status, n9.body?.searched, n9b.status, d9.status]);
  // Break M-1: a hidden match is still counted behind 60 visible matches of the same name (no row limit drops it).
  const P10 = person(T.id, "Quinn Many", { email: "quinn.many@example.com" }), X10 = prospectOf(P10, T.id);
  sql(`with p as (insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) select gen_random_uuid(), '${A}', 'Quinn Many', 'Sample', 'quinn.' || g || '@example.com', 'test', now() from generate_series(1, 60) g returning id)
    insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, created_by, updated_at) select gen_random_uuid(), '${A}', id, 'MANUAL', 'WEBSITE', '${T.id}', 'test', now() from p`);
  person(O.id, "Someone Else", { email: "quinn.many@example.com" });
  const pv10 = await call("POST", "conflict-checks/preview", T.token, { prospectId: X10 }), c10 = await check(X10, { result: "NO_CONFLICT" }, T.token);
  ok("FO-13c DW2 fail (break M-1): behind 60 visible same-name matches, the hidden same-email match is still counted, so NO_CONFLICT waits for a confirmation",
    pv10.status === 200 && pv10.body.hiddenCount === 1 && pv10.body.matches.length === 60 && c10.status === 409 && c10.body.code === "NEEDS_CONFIRMATION", [pv10.body?.hiddenCount, pv10.body?.matches?.length, c10.status]);

  // Break R3-M1: an Owner checking their own prospect sees every front-office match (contract §3.1's firm admin), so a
  // firm whose only Owner runs the check is never stuck on a match nobody can confirm.
  const X12 = prospectOf(person(R.id, "Sol Owner", { email: "sol.shared@example.com" })); person(O.id, "Other Person", { email: "sol.shared@example.com" });
  const pv12 = await call("POST", "conflict-checks/preview", R.token, { prospectId: X12 }), c12 = await check(X12, { result: "NO_CONFLICT" });
  ok("FO-13c DW2 pass (break R3-M1): the Owner's own check names the Case Officer's matching lead (nothing hidden) and is recorded at once",
    pv12.body.hiddenCount === 0 && /Other Person/.test(JSON.stringify(pv12.body.matches)) && c12.status === 201 && c12.body.result === "NO_CONFLICT", [pv12.body, c12.status]);

  // Break R2-M3: a client with very many matches can still be checked: the 200 strongest are stored, the rest counted.
  const P11 = person(R.id, "Rory Crowd", { email: "rory.crowd@example.com" }), X11 = prospectOf(P11);
  sql(`with p as (insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) select gen_random_uuid(), '${A}', 'Rory Crowd', 'Sample', 'rory.' || g || '@example.com', 'test', now() from generate_series(1, 210) g returning id)
    insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, created_by, updated_at) select gen_random_uuid(), '${A}', id, 'MANUAL', 'WEBSITE', '${R.id}', 'test', now() from p`);
  const c11 = await check(X11, { result: "NO_CONFLICT" });
  ok("FO-13c DW2 pass (break R2-M3): 210 matches → the check is recorded with the 200 strongest stored and notStored 10, never a 500 or a dead end",
    c11.status === 201 && c11.body.matches.length === 200 && c11.body.notStored === 10, [c11.status, c11.body?.matches?.length, c11.body?.notStored]);

  // A Corporate prospect: the party is its company (FO-1a's two kinds of party).
  const CO1 = u(), CO2 = u(), PCc = person(R.id, "Lane Contact"), XC = u();
  sql(`insert into fo_company (id, firm_id, operating_name, normalised_name, created_by, updated_at) values ('${CO1}', '${A}', 'Maple Sample Bakery Ltd', 'maple sample bakery', 'test', now()), ('${CO2}', '${A}', 'Maple Sample Bakery Inc', 'maple sample bakery', 'staff:${R.id}', now());
    insert into fo_company_contact (firm_id, company_id, person_id, role, created_by) values ('${A}', '${CO1}', '${PCc}', 'PRIMARY', 'test');
    update fo_lead set state = 'ENGAGED', engaged_at = now(), engaged_by = 'test' where person_id = '${PCc}';
    insert into fo_prospect (id, firm_id, lead_id, type, stage_id, subject_company_id, primary_contact_person_id, owner_staff_id, created_by, updated_at)
      select '${XC}', '${A}', l.id, 'CORPORATE', (select id from fo_stage where firm_id = '${A}' and pipeline = 'CORPORATE' and key = 'ENGAGED'), '${CO1}', '${PCc}', '${R.id}', 'test', now() from fo_lead l where l.person_id = '${PCc}';
    insert into fo_stage_move (firm_id, prospect_id, to_stage_id, cause, by_actor) select firm_id, id, stage_id, 'PERSON', 'test' from fo_prospect where id = '${XC}'`);
  const vC0 = await refusal(() => pros.convert(ctxR, XC, {})), cC = await check(XC, { result: "NO_CONFLICT" });
  await pros.convert(ctxR, XC, {});
  ok("FO-13c company pass/fail: a Corporate prospect's check is on its company (a similar company found, not itself); Convert refused before it, allowed after",
    vC0?.code === "CONFLICT_CHECK_REQUIRED" && cC.status === 201 && cC.body.partyKind === "COMPANY" && cC.body.companyId === CO1 && cC.body.matches.some((m: any) => m.kind === "COMPANY" && m.recordId === CO2) && cC.body.matches.every((m: any) => m.recordId !== CO1) && won(XC), [vC0, cC.body]);

  // Break R4-B1: a company contact (a person with no lead) matching a Case Manager's prospect is hidden from them, and
  // the Admin sees it and confirms, so the client can be made.
  const RC = u(); sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values ('${RC}', '${A}', 'Rae', 'Contact', 'rae.shared@example.com', 'test', now());
    insert into fo_company_contact (firm_id, company_id, person_id, role, created_by) values ('${A}', '${CO2}', '${RC}', 'PRIMARY', 'test')`);
  const X13 = prospectOf(person(T.id, "Rae Prospect", { email: "rae.shared@example.com" }), T.id), c13 = await check(X13, {}, T.token);
  const f13 = await call("GET", `conflict-checks/${c13.body.id}/for-confirmation`, AD.token), k13 = await call("POST", `conflict-checks/${c13.body.id}/confirm`, AD.token, { result: "NO_CONFLICT" });
  ok("FO-13c DW6 pass/fail (break R4-B1): a lead-less company contact is hidden from the Case Manager (hiddenCount 1), seen by the Admin (named, nothing hidden) who confirms, and the gate clears",
    c13.body.hiddenCount === 1 && f13.body.hiddenNow === 0 && /Rae Contact · company contact/.test(JSON.stringify(f13.body.matchesNow)) && k13.status === 200
    && sql(`select result from fo_conflict_check where id = '${c13.body.id}'`) === "NO_CONFLICT", [c13.body?.hiddenCount, f13.body, k13.status]);

  // ---------------------------------------------------------------------------------------------------------- DW7
  const ev0 = Number(sql(`select count(*) from module_event where type = '${EVENT.CONFLICT_CHECKED}'`));
  const c7 = await check(cv0, { result: "POTENTIAL_CONFLICT", disclosureText: "A conflict found after signing (Sample)." });
  const pay = JSON.parse(sql(`select payload::text from module_event where type = '${EVENT.CONFLICT_CHECKED}' and subject_id = '${c7.body.id}'`));
  const list7 = await call("GET", `prospects/${cv0}/conflict-checks`, R.token);
  ok("FO-13c DW7 pass (s. 35(1)(c)): a new check on an existing client giving POTENTIAL_CONFLICT is listed on the person and emits conflict.checked with the result kind, the person's and prospect's ids and clientAlready",
    c7.status === 201 && pay.result === "POTENTIAL_CONFLICT" && pay.personId && pay.prospectId === cv0 && pay.clientAlready === true && list7.body.checks[0].id === c7.body.id
    && Number(sql(`select count(*) from module_event where type = '${EVENT.CONFLICT_CHECKED}'`)) === ev0 + 1, [pay, list7.status]);
  ok("FO-13c DW7 fail: nothing ends by itself (the client stays won)", won(cv0));

  // ---------------------------------------------------------------------------------------------------------- also
  const events = sql(`select string_agg(payload::text, ' ') from module_event where type = '${EVENT.CONFLICT_CHECKED}'`);
  const audits = Number(sql(`select count(*) from audit_event where entity = 'fo_conflict_check'`)), checks = Number(sql(`select count(*) from fo_conflict_check`)) + Number(sql(`select count(*) from fo_conflict_check where confirmed_by is not null`));
  ok("FO-13c also: every check and confirmation is one audit line and one conflict.checked event; no payload holds a searched name, email or phone",
    audits === checks && Number(sql(`select count(*) from module_event where type = '${EVENT.CONFLICT_CHECKED}'`)) === checks && !/@|Sample|\+1416/.test(events), { audits, checks });
  const bare = new ConflictChecks(db, { now: () => Date.now() }), scope = await withFirm(A, () => bare.preview(ctxR, { prospectId: X1 }));
  ok("FO-13c also: without the case side's port (CS-S1b not on main) the answer says other parties on cases are not searched", scope.scope === NOT_SEARCHED && scope.matches.every((m: { source: string }) => m.source === "FRONT_OFFICE"), scope.scope);
} catch (e) {
  fail++; console.log(`FAIL  FO-13c: the run stopped — ${String((e as Error)?.stack ?? e).slice(0, 1200)}`);
} finally {
  for (const a of apps) await a.close();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\nFO-13c: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
