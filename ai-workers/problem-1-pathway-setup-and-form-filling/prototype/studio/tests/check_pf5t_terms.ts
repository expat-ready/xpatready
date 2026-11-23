// PF-5t part 1 (checklist row 100; Lead B's brief rev 16.61): a new terms version asks again at the next sign-in, and the
// acceptances are shown. Every "Done when" line (DW1 to DW5), a pass and a fail each, on a scratch database and a Nest app
// of PF-4's, PF-4b's and PF-5t's classes with the local stand-ins and a test clock. No network, US$0. Wording and versions
// Sample; Unconfirmed: no counsel.
//   tsx studio/tests/check_pf5t_terms.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeBilling } from "../ports/billing.ts";
import { FakeClock } from "../ports/clock.ts";
import { fakeMail } from "../ports/mail.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf5t_scratch_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
type Res = { status: number; body: any };
const call = async (base: string, method: string, path: string, o: { token?: string; body?: unknown } = {}): Promise<Res> => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  const r = await fetch(`${base}${path}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await r.text(); let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body };
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
const { MAIL_PORT, LocalMail } = await import("../api/src/platform/identity/session/mail.ts");
const { PlatformSession } = await import("../api/src/platform/identity/session/service.ts");
const { PlatformSessionController, PublicInvitationController } = await import("../api/src/platform/identity/session/routes.ts");
const { StaffReads } = await import("../api/src/platform/staff-read/service.ts");
const { StaffReadController } = await import("../api/src/platform/staff-read/routes.ts");
const { PlatformTerms, OWNER_ONLY } = await import("../api/src/platform/terms/service.ts");
const { PlatformTermsController } = await import("../api/src/platform/terms/routes.ts");
const { TERMS_GATE, TERMS_PENDING } = await import("../api/src/platform/terms/gate.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const { FirmSignUp } = await import("../api/src/platform/firms/signup.ts");
const { LocalSignUp } = await import("../api/src/platform/firms/signup-identity.ts");
const feature = (await import("../api/src/features/platform-terms.ts")).default;

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const clock = new (class extends PlatformClock { t = Date.now(); override now() { return this.t; } })();
const local = new LocalIdentity("pf5t-check-signing-key-0123456789abcdef", () => clock.now());
const admin = new LocalIdentityAdmin(() => clock.now());
const base_providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
  { provide: IDENTITY_ADMIN_PORT, useValue: admin }, { provide: MAIL_PORT, useValue: new LocalMail(() => clock.now()) }, PlatformSession, StaffReads];
const controllers = [PlatformIdentityController, PlatformSessionController, PublicInvitationController, StaffReadController, PlatformTermsController];

let app: { close(): Promise<void> } | null = null;
try {
  // ------------------------------------------------------------------- the start-up rule (no gate → no start-up)
  @Module({ controllers: controllers as never[], providers: [...base_providers, PlatformTerms] as never[] }) class NoGate {}
  let refused: Error | null = null;
  { const a = await NestFactory.create(NoGate, { logger: false }); try { await a.init(); } catch (e) { refused = e as Error; } await a.close().catch(() => undefined); }
  ok("PF-5t fail: an app that serves the terms routes without the guard's TERMS_GATE stops at start-up, saying why", refused instanceof Error && /TERMS_GATE/.test(refused.message), String(refused));

  @Module({ controllers: controllers as never[], providers: [...base_providers, ...(feature.providers as never[])] as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false }); await nest.listen(0, "127.0.0.1"); app = nest;
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;
  const terms = nest.get(PlatformTerms);
  ok("PF-5t pass: the feature registers the terms controller, the service and the guard's TERMS_GATE; the app starts (every route declared)",
    feature.controllers.includes(PlatformTermsController) && (feature.providers as any[]).some((p) => p?.provide === TERMS_GATE));

  await seedSampleFirms(db);
  const idOf = async (actorId: string) => (await db.platformStaff.findFirstOrThrow({ where: { actorId } })).id;
  const FIRM_A = (await db.platformFirm.findUniqueOrThrow({ where: { key: "sample-firm" } })).id, FIRM_B = (await db.platformFirm.findUniqueOrThrow({ where: { key: "sample-solo" } })).id;
  const R = await idOf("user-R"), O = await idOf("user-O"), T = await idOf("user-T"), S = await idOf("user-S");
  const signIn = async (actorId: string, firmKey = "sample-firm") => { const r = await call(base, "POST", "/api/platform/session/local", { body: { firmKey, actorId, secondStep: true } }); if (r.status !== 200) throw new Error(JSON.stringify(r.body)); return r.body.token as string; };
  const rows = (where: string) => Number(sql(`select count(*) from platform_terms_acceptance where ${where}`));
  /** A new version published now (the clock moves to just after it, so it is current). */
  const publish = (kind: string, version: string) => { const id = sql(`insert into platform_terms_version (id, kind, version, url, published_at) values (gen_random_uuid(), '${kind}', '${version}', '/legal/${version}', now()) returning id`).split("\n")[0]; clock.t = Date.now() + 1000; return id; };

  // --------------------------------------------------------------- DW5 (part): the seed leaves nothing pending
  clock.t = Date.now();
  let tR = await signIn("user-R"), tO = await signIn("user-O"), tT = await signIn("user-T");
  const quiet = await Promise.all([[tR, "/api/platform/staff"], [tO, "/api/platform/me/account"], [tT, "/api/platform/me/account"]].map(([t, p]) => call(base, "GET", p, { token: t })));
  ok("PF-5t DW5 pass: with no new version the seeded staff are never stopped (the seed accepts the current Sample versions)", quiet.every((q) => q.status === 200), quiet.map((q) => q.status));
  ok("PF-5t DW5 pass: the seed's acceptance lines: the Owner accepts all three for firm A, every other person the privacy notice only",
    rows(`firm_id = '${FIRM_A}' and staff_id = '${R}'`) === 3 && rows(`staff_id = '${O}'`) === 1 && rows(`staff_id = '${T}'`) === 1 && rows(`staff_id = '${S}'`) === 3);
  const mine0 = await call(base, "GET", "/api/platform/me/terms", { token: tR });
  ok("PF-5t DW5 fail: GET /me/terms with nothing new answers an empty list (never a version already accepted)", mine0.status === 200 && Array.isArray(mine0.body.pending) && mine0.body.pending.length === 0 && /Sample/.test(mine0.body.note), mine0.body);

  // ----------------------------------------------------------------------------------- DW1: a new terms of service
  const tos2 = publish("TERMS_OF_SERVICE", "sample-2026-12-01");
  const blocked = await call(base, "GET", "/api/platform/staff", { token: tR });
  ok("PF-5t DW1 pass: after a new terms-of-service version, the Owner's next request answers 428 TERMS_PENDING with the words",
    blocked.status === 428 && blocked.body.code === "TERMS_PENDING" && blocked.body.detail === TERMS_PENDING, blocked.body);
  const mineR = await call(base, "GET", "/api/platform/me/terms", { token: tR });
  ok("PF-5t DW1 pass: GET /me/terms shows the Owner the pending version: kind, version, link and published date",
    mineR.status === 200 && mineR.body.pending.length === 1 && mineR.body.pending[0].id === tos2 && mineR.body.pending[0].kind === "TERMS_OF_SERVICE" && mineR.body.pending[0].url === "/legal/sample-2026-12-01" && !!Date.parse(mineR.body.pending[0].publishedAt), mineR.body);
  const coT = await Promise.all([call(base, "GET", "/api/platform/me/account", { token: tO }), call(base, "GET", "/api/platform/me/terms", { token: tO })]);
  ok("PF-5t DW1 fail: a Case Officer is not blocked by firm terms an Owner has not accepted (200; nothing pending for them)", coT[0].status === 200 && coT[1].body.pending.length === 0, coT.map((c) => [c.status, c.body.pending]));
  const otherOwnerFirm = await call(base, "GET", "/api/platform/me/account", { token: tT });
  ok("PF-5t DW1 fail: a Case Manager who is not an Owner is not blocked either", otherOwnerFirm.status === 200, otherOwnerFirm.status);
  const acc1 = await call(base, "POST", "/api/platform/me/terms/accept", { token: tR, body: { versionIds: [tos2] } });
  const after = await call(base, "GET", "/api/platform/staff", { token: tR });
  ok("PF-5t DW1 pass: the Owner accepting it clears it: the next request answers 200, one row, one audit line platform.terms.accepted",
    acc1.status === 200 && acc1.body.pending.length === 0 && after.status === 200 && rows(`version_id = '${tos2}'`) === 1
    && sql(`select count(*) from audit_event where action = 'platform.terms.accepted' and detail->>'staffId' = '${R}' and detail->'versionIds' ? '${tos2}'`) === "1", [acc1.body, after.status]);
  const tS = await signIn("user-S", "sample-solo");
  const soloBlocked = await call(base, "GET", "/api/platform/me/account", { token: tS });
  ok("PF-5t DW1 fail: firm A's Owner accepting never clears another firm's Owner (firm B's Owner is still asked)", soloBlocked.status === 428, soloBlocked.status);
  ok("PF-5t DW1 pass: firm B's Owner accepts and is let through", (await call(base, "POST", "/api/platform/me/terms/accept", { token: tS, body: { versionIds: [tos2] } })).status === 200 && (await call(base, "GET", "/api/platform/me/account", { token: tS })).status === 200);

  // ------------------------------------------------------------------------------------ DW2: a new privacy notice
  const pn2 = publish("PRIVACY_NOTICE", "sample-2026-12-02");
  const all = await Promise.all([tR, tO, tT].map((t) => call(base, "GET", "/api/platform/me/account", { token: t })));
  ok("PF-5t DW2 pass: a new privacy-notice version blocks every staff member (Owner, Case Officer, Case Manager: 428)", all.every((a) => a.status === 428 && a.body.code === "TERMS_PENDING"), all.map((a) => a.status));
  const accO = await call(base, "POST", "/api/platform/me/terms/accept", { token: tO, body: { versionIds: [pn2] } });
  const afterO = await Promise.all([tO, tR, tT].map((t) => call(base, "GET", "/api/platform/me/account", { token: t })));
  ok("PF-5t DW2 pass: the Case Officer accepts their own and is let through", accO.status === 200 && afterO[0].status === 200, [accO.body, afterO[0].status]);
  ok("PF-5t DW2 fail: one person's acceptance never clears another's (the Owner and the Case Manager still 428)", afterO[1].status === 428 && afterO[2].status === 428, afterO.map((a) => a.status));
  for (const t of [tR, tT]) await call(base, "POST", "/api/platform/me/terms/accept", { token: t, body: { versionIds: [pn2] } });
  ok("PF-5t DW2 pass: once each has accepted, each is let through, one row each", (await Promise.all([tR, tT].map((t) => call(base, "GET", "/api/platform/me/account", { token: t })))).every((a) => a.status === 200) && rows(`version_id = '${pn2}'`) === 3);

  // ------------------------------------------------------------- DW3: who may accept, old versions and replays
  const dpa2 = publish("DATA_PROCESSING", "sample-2026-12-03");
  const coAccept = await call(base, "POST", "/api/platform/me/terms/accept", { token: tO, body: { versionIds: [dpa2] } });
  ok("PF-5t DW3 fail: a Case Officer accepting firm terms → 403 with the words, nothing written", coAccept.status === 403 && coAccept.body.detail === OWNER_ONLY && rows(`version_id = '${dpa2}'`) === 0, coAccept.body);
  const tosOld = sql(`select id from platform_terms_version where kind = 'TERMS_OF_SERVICE' and version = 'sample-2026-11-15'`);
  const old = await Promise.all([[tosOld], ["0f5a0000-0000-4000-8000-00000000dead"], ["not-a-uuid"], []].map((v) => call(base, "POST", "/api/platform/me/terms/accept", { token: tR, body: { versionIds: v } })));
  ok("PF-5t DW3 fail: an old version id, an unknown one, a malformed one or none → 400 TERMS_NOT_CURRENT for the two not current, 422 CHECK_FIELDS for the malformed one and none (PF-28 part 2b), nothing written", old.slice(0, 2).every((o) => o.status === 400) && old.slice(2).every((o) => o.status === 422) && old[0].body.code === "TERMS_NOT_CURRENT" && rows(`staff_id = '${R}' and version_id = '${tosOld}'`) === 1, old.map((o) => [o.status, o.body.code]));
  const first = await call(base, "POST", "/api/platform/me/terms/accept", { token: tR, body: { versionIds: [dpa2] } });
  const audits = sql(`select count(*) from audit_event where action = 'platform.terms.accepted'`);
  const replay = await call(base, "POST", "/api/platform/me/terms/accept", { token: tR, body: { versionIds: [dpa2] } });
  ok("PF-5t DW3 pass: the Owner accepts the new data-processing terms (200, one row)", first.status === 200 && rows(`version_id = '${dpa2}'`) === 1, first.body);
  ok("PF-5t DW3 fail: a replay answers the same and writes no second row and no second audit line", replay.status === 200 && JSON.stringify(replay.body) === JSON.stringify(first.body) && rows(`version_id = '${dpa2}'`) === 1 && sql(`select count(*) from audit_event where action = 'platform.terms.accepted'`) === audits, [first.body, replay.body]);
  // Checked again under the firm lock (Devin review on #1957): a session context gone stale while it waited saves nothing.
  const dpaStale = publish("DATA_PROCESSING", "sample-2026-12-03b");
  const ctxR = { firmId: FIRM_A, staffId: R, firmKey: "sample-firm", roles: (await db.platformRoleGrant.findMany({ where: { staffId: R, endedAt: null } })).map((g) => g.role as string), keys: [], duties: [], authTime: 0, via: "local" as const };
  // A current session: signed in after the person's latest revocation (every sign-in ends the one before, 1 ms earlier), so
  // only the change under test can refuse it (a clock-based time could fall before that revocation on a fast machine).
  const lastRev = sql(`select coalesce(floor(extract(epoch from max(revoked_at))), 0) from platform_session_revocation where staff_id = '${R}'`);
  ctxR.authTime = Math.max(Number(lastRev) + 1, Math.ceil(clock.t / 1000));
  const tryStale = (c: unknown) => terms.accept(c as never, { versionIds: [dpaStale] }).then(() => 200, (e: any) => e.getStatus?.() ?? 500);
  const stale = [await tryStale({ ...ctxR, roles: [...ctxR.roles, "ADMIN"] })];
  sql(`update platform_staff set status = 'DEACTIVATED' where id = '${R}'`); stale.push(await tryStale(ctxR)); sql(`update platform_staff set status = 'ACTIVE' where id = '${R}'`);
  ok("PF-5t DW3 fail (Devin review): under the lock, roles changed meanwhile → 409, deactivated meanwhile → 401; nothing written", stale[0] === 409 && stale[1] === 401 && rows(`version_id = '${dpaStale}'`) === 0, stale);
  const fresh = await call(base, "POST", "/api/platform/me/terms/accept", { token: tR, body: { versionIds: [dpaStale] } });
  ok("PF-5t DW3 pass: the same person with a current session accepts it", fresh.status === 200 && rows(`version_id = '${dpaStale}'`) === 1, fresh.body);
  // Two Owners at once (break): firm A gets a second Owner; both accept a new version together → one firm row.
  sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${FIRM_A}', '${T}', 'OWNER', 'seed:PF-5t-check')`);
  const tos3 = publish("TERMS_OF_SERVICE", "sample-2026-12-04");
  tT = await signIn("user-T"); tR = await signIn("user-R");
  const both = await Promise.all([tR, tT].map((t) => call(base, "POST", "/api/platform/me/terms/accept", { token: t, body: { versionIds: [tos3] } })));
  ok("PF-5t DW3 pass/fail: two Owners accepting at once → both 200, the firm's version recorded once", both.every((b) => b.status === 200) && rows(`version_id = '${tos3}'`) === 1, [both.map((b) => b.status), rows(`version_id = '${tos3}'`)]);

  // ------------------------------------------------------------------------ DW4: the acceptances list ("shown")
  // A sign-up's own acceptances (PF-5): a firm made through FirmSignUp with the current versions.
  const fclock = new FakeClock(new Date());
  const identity = new LocalSignUp(() => fclock.now());
  const signup = new FirmSignUp(db, { audit: auditEvent, billing: fakeBilling(), identity, mail: fakeMail({ clock: fclock }), clock: fclock, appUrl: "https://app.expatready.test" });
  const plans = await signup.plans(); await fclock.advance({ seconds: 5 });
  await signup.signUp({ email: "owner@pf5t.example.com", password: "a long sample pass 1", firmName: "PF5t Sample Firm", countryCode: "CA", acceptedTerms: plans.terms.map((t) => t.id), formStamp: plans.formStamp }, "10.5.0.1"); await signup.settled();
  const link = identity.sent.find((m) => m.to === "owner@pf5t.example.com")?.text ?? "";
  await signup.verify({ token: /token=([A-Za-z0-9_-]{43})/.exec(link)?.[1], code: /code=(\d{6})/.exec(link)?.[1] }, "10.5.0.2").catch(() => undefined);   // Checkout after the commit is not this row's
  const FIRM_C = sql(`select id from platform_firm where contact_email = 'owner@pf5t.example.com'`);
  const listC = FIRM_C ? await terms.acceptances({ firmId: FIRM_C, staffId: "", firmKey: "", roles: [], keys: [], duties: [], authTime: 0, via: "local" }) : null;
  ok("PF-5t DW4 pass: a sign-up's own acceptances (PF-5) appear in its firm's list: the Owner, the three current versions", !!listC && listC.acceptances.length === 3 && new Set(listC.acceptances.map((a) => a.staffId)).size === 1 && plans.terms.every((t) => listC.acceptances.some((a) => a.versionId === t.id)), listC);
  const list = await call(base, "GET", "/api/platform/terms/acceptances", { token: tO });
  const a = list.body.acceptances ?? [];
  ok("PF-5t DW4 pass: firm A's list shows who, when and which version (name, kind, version, time), newest first",
    list.status === 200 && a.some((x: any) => x.staffId === O && x.staffName && x.versionId === pn2 && x.kind === "PRIVACY_NOTICE" && x.version === "sample-2026-12-02" && !!Date.parse(x.acceptedAt))
    && a.some((x: any) => x.staffId === R && x.versionId === dpa2 && x.forFirm === true) && a.every((x: any, i: number) => i === 0 || x.acceptedAt <= a[i - 1].acceptedAt), a.slice(0, 3));
  ok("PF-5t DW4 fail: firm A's list never shows firm B's or the signed-up firm's acceptances", list.status === 200 && !a.some((x: any) => x.staffId === S) && !(listC?.acceptances ?? []).some((x) => a.some((y: any) => y.id === x.id)) && a.length === rows(`firm_id = '${FIRM_A}'`), a.length);
  const tS2 = await signIn("user-S", "sample-solo");
  await call(base, "POST", "/api/platform/me/terms/accept", { token: tS2, body: { versionIds: (await call(base, "GET", "/api/platform/me/terms", { token: tS2 })).body.pending.map((p: any) => p.id) } });
  const noKey = await call(base, "GET", "/api/platform/terms/acceptances", { token: tS2 });
  ok("PF-5t DW4 fail: firm B's Owner sees only firm B's acceptances (none of firm A's)", noKey.status === 200 && noKey.body.acceptances.length > 0 && noKey.body.acceptances.every((x: any) => x.staffId === S), noKey.body);
  void FIRM_B;
  // Pagination (STANDARDS §6; review m1, break m1): newest first, a page at a time, no row twice.
  const p1 = await call(base, "GET", "/api/platform/terms/acceptances?limit=2", { token: tO }), p2 = await call(base, "GET", `/api/platform/terms/acceptances?limit=2&cursor=${p1.body.nextCursor}`, { token: tO });
  const pageIds = [...(p1.body.acceptances ?? []), ...(p2.body.acceptances ?? [])].map((x: any) => x.id);
  ok("PF-5t DW4 pass: the list pages (limit 2, then the cursor): the next page follows on, no row twice, in the full list's order",
    p1.body.acceptances?.length === 2 && !!p1.body.nextCursor && p2.body.acceptances?.length === 2 && new Set(pageIds).size === 4 && JSON.stringify(pageIds) === JSON.stringify(a.slice(0, 4).map((x: any) => x.id)), [p1.body, p2.body]);
  const badPage = await Promise.all(["?limit=0", "?limit=201", "?limit=x", "?cursor=nope", `?cursor=${listC?.acceptances[0]?.id}`].map((q) => call(base, "GET", `/api/platform/terms/acceptances${q}`, { token: tO })));
  ok("PF-5t DW4 fail: a bad limit, a malformed cursor or another firm's row as cursor → 422 (never another firm's page)", badPage.every((b) => b.status === 422), badPage.map((b) => b.status));

  // ------------------------------------- the "new version" rule (review M1, break M2) and older databases (break M1)
  // A version published while a sign-up waits for its email check is pending for the new Owner (they accepted an older one).
  const plans2 = await signup.plans(); await fclock.advance({ seconds: 5 });
  await signup.signUp({ email: "late@pf5t.example.com", password: "a long sample pass 2", firmName: "PF5t Late Firm", countryCode: "CA", acceptedTerms: plans2.terms.map((t) => t.id), formStamp: plans2.formStamp }, "10.5.0.3"); await signup.settled();
  const between = publish("TERMS_OF_SERVICE", "sample-2026-12-07"), betweenPn = publish("PRIVACY_NOTICE", "sample-2026-12-07");
  await fclock.set(new Date(clock.t));
  const link2 = identity.sent.find((m) => m.to === "late@pf5t.example.com")?.text ?? "";
  await signup.verify({ token: /token=([A-Za-z0-9_-]{43})/.exec(link2)?.[1], code: /code=(\d{6})/.exec(link2)?.[1] }, "10.5.0.4").catch(() => undefined);
  const late = sql(`select p.firm_id || ' ' || p.id from platform_staff p where p.email = 'late@pf5t.example.com'`).split(" ");
  const latePending = late[1] ? (await terms.pending({ firmId: late[0], staffId: late[1], firmKey: "", roles: ["OWNER"], keys: [], duties: [], authTime: 0, via: "local" })).map((x) => x.id).sort() : null;
  ok("PF-5t rule pass (review M1, break M2): a version published between sign-up and its email check is asked of the new Owner (both kinds)", JSON.stringify(latePending) === JSON.stringify([between, betweenPn].sort()), latePending);
  // A person who joined after the current version and never accepted one of its kind is not asked by this row (Question 1).
  const mk = (actor: string, created: string) => sql(`with s as (insert into platform_staff (id, firm_id, actor_id, email, display_name, status, created_at, updated_at) values (gen_random_uuid(), '${FIRM_A}', '${actor}', '${actor}@pf5t.example.com', 'Sample ${actor}', 'ACTIVE', ${created}, now()) returning id, firm_id)
    insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) select gen_random_uuid(), firm_id, id, 'CASE_OFFICER', 'seed:PF-5t-check' from s returning staff_id`);
  mk("user-new", "now()"); mk("user-old", "now() - interval '40 days'");
  const [joinedAfter, joinedBefore] = await Promise.all(["user-new", "user-old"].map(async (x) => call(base, "GET", "/api/platform/me/account", { token: await signIn(x) })));
  ok("PF-5t rule fail: a person who joined after the current privacy notice, with none accepted, is not stopped (200)", joinedAfter.status === 200, joinedAfter.status);
  ok("PF-5t rule pass: a person who joined before the current privacy notice, with none accepted, is asked (428)", joinedBefore.status === 428, joinedBefore.status);
  // An older database (break M1): a firm and its people from before the Sample versions, never accepted; the seed then
  // gives each Sample person their first acceptance of each kind, and never a later new version.
  const oldFirm = await db.platformFirm.create({ data: { key: "pf5t-old", operatingName: "PF5t Old Firm", countryCode: "CA", status: "ACTIVE", ownerName: "Sample Old Owner", ownerEmail: "old@pf5t-old.example.com", billingEmail: "old@pf5t-old.example.com", contactEmail: "old@pf5t-old.example.com", createdAt: new Date("2026-11-14T00:00:00Z") } });
  const oldOwner = await db.platformStaff.create({ data: { firmId: oldFirm.id, actorId: "user-OLDO", email: "old@pf5t-old.example.com", displayName: "Sample Old Owner", status: "ACTIVE", createdAt: new Date("2026-11-14T00:00:00Z") } });
  await db.platformRoleGrant.create({ data: { firmId: oldFirm.id, staffId: oldOwner.id, role: "OWNER", grantedBy: "seed:PF-5t-check" } });
  const oldCtx = { firmId: oldFirm.id, staffId: oldOwner.id, firmKey: "pf5t-old", roles: ["OWNER"], keys: [], duties: [], authTime: 0, via: "local" as const };
  const beforeSeed = (await terms.pending(oldCtx)).length;
  const sampleOld = [{ key: "pf5t-old", name: "PF5t Old Firm", solo: true, office: { country: "Canada" }, users: [{ id: "user-OLDO", name: "Sample Old Owner", email: "old@pf5t-old.example.com", duties: ["firm_admin"], licence: null }] }];
  await seedSampleFirms(db, sampleOld as never);
  const afterSeed = (await terms.pending(oldCtx)).length, oldRows = rows(`staff_id = '${oldOwner.id}'`);
  ok("PF-5t DW5 pass (break M1): on an older database the seed accepts the current Sample versions for its people (3 pending → 0)", beforeSeed === 3 && afterSeed === 0 && oldRows === 3, [beforeSeed, afterSeed, oldRows]);
  const oldNew = publish("DATA_PROCESSING", "sample-2026-12-08");
  await seedSampleFirms(db, sampleOld as never);
  ok("PF-5t DW5 fail: a second seed after a new version accepts nothing more: the new version stays pending for the Owner", rows(`staff_id = '${oldOwner.id}'`) === 3 && (await terms.pending(oldCtx)).some((x) => x.id === oldNew), rows(`staff_id = '${oldOwner.id}'`));

  // --------------------------------------------- DW5: the open routes while pending; the other rules unchanged
  publish("PRIVACY_NOTICE", "sample-2026-12-05");
  const open = await Promise.all([call(base, "GET", "/api/platform/me", { token: tO }), call(base, "GET", "/api/platform/me/terms", { token: tO }), call(base, "GET", "/api/platform/me/", { token: tO })]);
  ok("PF-5t DW5 pass: while pending, GET /me and GET /me/terms still answer 200 (matched on the declared route, so a trailing slash too)", open.every((o) => o.status === 200) && open[1].body.pending.length === 1, open.map((o) => o.status));
  const closed = await Promise.all([["GET", "/api/platform/me/account"], ["GET", "/api/platform/me/account/"], ["GET", "/api/platform/terms/acceptances"], ["PUT", "/api/platform/me/account"]].map(([m, p]) => call(base, m, p, { token: tO, body: m === "PUT" ? {} : undefined })));
  ok("PF-5t DW5 fail: every other staff route answers 428 while pending, with or without a trailing slash", closed.every((c) => c.status === 428 && c.body.code === "TERMS_PENDING"), closed.map((c) => c.status));
  const cased = await Promise.all(["/API/PLATFORM/ME/ACCOUNT", "/Api/Platform/Me/Terms/../Account", "/api/platform/ME/account"].map((p) => call(base, "GET", p, { token: tO })));
  ok("PF-5t DW5 fail: another letter case or a dot segment never gets a closed route past the check (never 200)", cased.every((c) => c.status !== 200 && c.status < 500), cased.map((c) => c.status));
  const unsigned = await Promise.all([call(base, "GET", "/api/platform/staff"), call(base, "GET", "/api/platform/me/terms")]);
  const noKeyPending = await call(base, "GET", "/api/platform/staff", { token: tO });
  ok("PF-5t DW5 fail: the guard's other rules come first: no token → 401; a missing key → 403 (not 428)", unsigned.every((u) => u.status === 401) && noKeyPending.status === 403, [unsigned.map((u) => u.status), noKeyPending.status]);
  const pub = await call(base, "GET", `/api/public/invitations/${"A".repeat(43)}`), door = await call(base, "POST", "/api/platform/session/local", { body: { firmKey: "sample-firm", actorId: "user-O", secondStep: true } });
  ok("PF-5t DW5 pass: the public doors and the sign-in door are untouched while pending (no 428)", pub.status !== 428 && pub.status < 500 && door.status === 200, [pub.status, door.status]);
  const tO2 = door.body.token as string;
  const pendingId = (await call(base, "GET", "/api/platform/me/terms", { token: tO2 })).body.pending[0]?.id;
  ok("PF-5t DW5 pass: the new session is still asked (next sign-in), accept answers while pending, then the person carries on",
    (await call(base, "GET", "/api/platform/me/account", { token: tO2 })).status === 428 && (await call(base, "POST", "/api/platform/me/terms/accept", { token: tO2, body: { versionIds: [pendingId] } })).status === 200 && (await call(base, "GET", "/api/platform/me/account", { token: tO2 })).status === 200);
  publish("PRIVACY_NOTICE", "sample-2026-12-06");
  const out = await call(base, "POST", "/api/platform/session/sign-out", { token: tR });
  ok("PF-5t DW5 pass: sign-out still answers while pending", out.status === 200, out.body);
  const pastGuard = await call(base, "GET", "/api/platform/me/account", { token: tR });
  ok("PF-5t DW5 fail: after sign-out the old session is refused (401), never let through by the terms check", pastGuard.status === 401, pastGuard.status);
} catch (e) {
  fail++; console.log(`FAIL  the check stopped: ${(e as Error)?.stack ?? e}`);
} finally {
  await app?.close().catch(() => undefined);
  await db.$disconnect().catch(() => undefined);
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for prune-test-dbs.sh */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
