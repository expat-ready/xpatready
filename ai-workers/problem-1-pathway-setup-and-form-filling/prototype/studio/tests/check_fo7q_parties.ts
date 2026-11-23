// FO-7q part 3 (R1.56; asked by FO-7s1 on #3305, agreed by the tech lead): the names on the invoice reads and the
// won-party search (G2). Named per rule, each with a pass and a fail:
//   P1 another firm's party never answers: not in the search (either way round), not as a name on a label;
//   P2 a prospect is never found: only a client is, the subject of a won prospect (won_at set) or the linked party of a
//      case (a client opened on the case side has no prospect, review M1); open prospects, merged-away parties and
//      people who are neither are not;
//   P3 a name is never guessed: a person with no stored name is never found and shows name null on an invoice, though
//      their email matches the words searched;
//   P4 C5 as the invoice reads (AG-6-1 §8): the party scope, or the client of a case in scope; an empty scope, nobody;
//   P5 billTo {kind, name} and caseLabel on the list rows and the detail;
//   P6 the province: the one a new draft takes (billToProvince, P-797), a code or null, never guessed;
//   P7 the route: staff session only (401 without), agent/invoice:list (403 without), the query by PF-28's one rule (422).
// A scratch database (every migration; fixtures written with the replica role, as check_csmv1_money_visibility.ts does),
// the reads feature in a Nest app with PF-4's guard and PF-12's walls; the local sign-in stand-in. No network, no model
// call (US$0). Dropped at the end.
//   tsx studio/tests/check_fo7q_parties.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeMail } from "../ports/mail.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin", "/usr/local/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo7q3_${process.pid}`, urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };

// ------------------------------------------------------------------------------------- the name rule alone
const { personName } = await import("../api/src/client-money/reads/parties.ts");
ok("FO-7q P3 pass: a stored name is given names then family name, trimmed", personName("  Client ", " Sample ") === "Client Sample" && personName(null, "Sample") === "Sample");
ok("FO-7q P3 fail: neither stored (null or blank) → null, never a guess", personName(null, null) === null && personName("  ", "") === null);

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_LOCAL_SECRET", "APP_DATABASE_URL"]) delete process.env[k];

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { FirmWallsInterceptor } = await import("../api/src/features/platform-firm-walls.ts");
const { MAIL_PORT } = await import("../api/src/platform/identity/session/mail.ts");
const readsFeature = (await import("../api/src/features/client-money-reads.ts")).default;
const { PartyReads, labelsOf, PARTY_LIMIT } = await import("../api/src/client-money/reads/parties.ts");
const { InvoiceReads } = await import("../api/src/client-money/reads/invoices.ts");
const { PartyReadsController } = await import("../api/src/client-money/reads/routes.ts");
const { withFirm } = await import("../api/src/platform/firm-scope.ts");

const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const clock = new (class extends PlatformClock { override now() { return Date.now(); } })();
const local = new LocalIdentity("fo7q3-check-signing-key-0123456789abcdef", () => clock.now());
type Res = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
let app: { close(): Promise<void> } | null = null;
try {
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard,
    { provide: APP_GUARD, useExisting: PlatformGuard }, { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor }, { provide: MAIL_PORT, useValue: fakeMail() }, ...readsFeature.providers];
  @Module({ controllers: [PlatformIdentityController, ...readsFeature.controllers] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false }); await nest.listen(0, "127.0.0.1"); app = nest;
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;
  ok("setup: the reads feature registers the party search's controller and service", readsFeature.controllers.includes(PartyReadsController) && readsFeature.providers.some((p) => (p as { provide?: unknown }).provide === PartyReads));
  const call = async (token: string | undefined, path: string): Promise<Res> => {
    const r = await fetch(`${base}/api${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
    const t = await r.text(); let b: unknown = t; try { b = JSON.parse(t); } catch { /* text */ } return { status: r.status, body: b };
  };
  await seedSampleFirms(owner);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  sql(`update platform_firm set business_address = '{"province_state":"ON"}'::jsonb where id = '${A}'; update platform_firm set business_address = '{}'::jsonb where id = '${B}'`);
  const staff = (actor: string, firm: string) => sql(`select id from platform_staff where actor_id = '${actor}' and firm_id = '${firm}'`);
  const keysOf = (roles: string[]) => sql(`select string_agg(distinct permission_key, ',') from platform_role_permission where role::text in (${roles.map((r) => `'${r}'`).join(",")})`).split(",");
  const ctxOf = (actor: string, firm: string, roles: string[]) => ({ staffId: staff(actor, firm), firmId: firm, firmKey: firm === A ? "sample-firm" : "sample-solo", roles, keys: keysOf(roles), duties: [], authTime: 0, via: "local" }) as never;
  const ctxR = ctxOf("user-R", A, ["OWNER", "CASE_MANAGER"]), ctxB = ctxOf("user-S", B, ["OWNER", "CASE_MANAGER"]);

  // ---------------------------------------------------------------------------------------------- fixtures (Sample)
  const rep = (q: string) => sql(`set session_replication_role = replica; ${q}`);
  const person = (firm: string, given: string | null, family: string | null, email: string, merged?: string): string => { const id: string = randomUUID();
    rep(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at${merged ? ", merged_into_id, merged_at" : ""}) values ('${id}', '${firm}', ${given === null ? "null" : `'${given}'`}, ${family === null ? "null" : `'${family}'`}, '${email}', 'seed:FO-7q-3', now()${merged ? `, '${merged}', now()` : ""})`); return id; };
  const company = (firm: string, name: string): string => { const id: string = randomUUID(); rep(`insert into fo_company (id, firm_id, operating_name, normalised_name, created_by, updated_at) values ('${id}', '${firm}', '${name}', '${name.toLowerCase()}', 'seed:FO-7q-3', now())`); return id; };
  let pn = 0;
  const prospect = (firm: string, subject: { person?: string; company?: string }, won: boolean) => rep(`insert into fo_prospect (id, firm_id, number, lead_id, type, stage_id, subject_person_id, subject_company_id, primary_contact_person_id, created_by, updated_at, won_via, won_at)
    values ('${randomUUID()}', '${firm}', 'P-${String(++pn).padStart(5, "0")}', '${randomUUID()}', '${subject.company ? "CORPORATE" : "INDIVIDUAL"}', '${randomUUID()}', ${subject.person ? `'${subject.person}'` : "null"}, ${subject.company ? `'${subject.company}'` : "null"}, '${subject.person ?? randomUUID()}', 'seed:FO-7q-3', now(), ${won ? "'CONVERTED', now()" : "null, null"})`);
  // Firm A: PW won; PP an open prospect (never won); PX no prospect at all; PN won with no name (email says "wonbee");
  // PM won but merged away into PW; CW a won company; CQ a company prospect, open. Firm B: PB won, the same words.
  const PW = person(A, "Client Wonbee", "Sample", "fo7q3.pw@example.org"), PP = person(A, "Client Wonbee", "Pending", "fo7q3.pp@example.org");
  const PX = person(A, "Client Wonbee", "Nobody", "fo7q3.px@example.org"), PN = person(A, null, null, "client.wonbee.noname@example.org");
  const PM = person(A, "Client Wonbee", "Merged", "fo7q3.pm@example.org", PW), CW = company(A, "Wonbee Holdings (Sample)"), CQ = company(A, "Wonbee Pending Co (Sample)");
  const PB = person(B, "Client Wonbee", "Firm B", "fo7q3.pb@example.org");
  prospect(A, { person: PW }, true); prospect(A, { person: PP }, false); prospect(A, { person: PN }, true); prospect(A, { person: PM }, true);
  prospect(A, { company: CW }, true); prospect(A, { company: CQ }, false); prospect(B, { person: PB }, true);
  // a case X whose client is the company CW (P4), and Y whose client is PW
  const W = randomUUID(); sql(`insert into workspace (id, key, label) values ('${W}', 'fo7q3-${W.slice(0, 8)}', 'FO-7q part 3 (Sample)')`);
  let n = 0;
  const newCase = (kind: "PERSON" | "COMPANY", party: string) => { const id = randomUUID(), client = randomUUID(); n++;
    rep(`insert into case_client (id, workspace_id, firm_key, firm_id, client_number, display_name, display_kind, ${kind === "PERSON" ? "fo_person_id" : "fo_company_id"}, created_by) values ('${client}', '${W}', 'sample-firm', '${A}', ${n}, 'Client ${n} (Sample)', '${kind}', '${party}', 'seed:FO-7q-3');
      insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, case_number, firm_key, firm_id, client_id, status) values ('${id}', '${W}', '${randomUUID()}', 'user-P', 'user-O', 'C-2026-${String(n).padStart(5, "0")}', 'sample-firm', '${A}', '${client}', 'OPEN')`);
    return id; };
  const X = newCase("COMPANY", CW), Y = newCase("PERSON", PW);
  // review M1: PD is a client opened on the case side (an fo_person with no prospect at all), the client of case D
  const PD = person(A, "Client Wonbee", "Direct", "fo7q3.pd@example.org"), D = newCase("PERSON", PD);
  // review round 2 r2-m1: CD is a company opened on the case side (no prospect at all), the client of case E
  const CD = company(A, "Wonbee Direct Co (Sample)"), E = newCase("COMPANY", CD);
  const invoice = (who: { person?: string; company?: string }, caseId: string | null) => { const id = randomUUID();
    rep(`insert into money_invoice (id, firm_id, person_id, company_id, case_id, currency, created_by, updated_at) values ('${id}', '${A}', ${who.person ? `'${who.person}'` : "null"}, ${who.company ? `'${who.company}'` : "null"}, ${caseId ? `'${caseId}'` : "null"}, 'CAD', 'staff:${staff("user-R", A)}', now())`); return id; };
  const IW = invoice({ person: PW }, Y), IN = invoice({ person: PN }, null), IC = invoice({ company: CW }, X);

  const db = nest.get(Db);
  const allA = new PartyReads(db, async () => "ALL" as const);
  const inA = <T>(fn: () => Promise<T>) => withFirm(A, fn), inB = <T>(fn: () => Promise<T>) => withFirm(B, fn);
  const ids = (p: { items: { id: string }[] }) => p.items.map((i) => i.id);
  const wonbee = await inA(() => allA.search(ctxR, { q: "wonbee" }));

  // ------------------------------------------------------------------------------- P2: a prospect is never found
  ok("FO-7q P2 pass: the won person (PW) and the won company (CW) are found, each with its kind", ids(wonbee).includes(PW) && ids(wonbee).includes(CW)
    && wonbee.items.find((i) => i.id === PW)?.kind === "PERSON" && wonbee.items.find((i) => i.id === CW)?.kind === "COMPANY", wonbee.items);
  ok("FO-7q P2 fail: an open prospect (PP, and the company CQ) is never found, nor a person with no prospect (PX)", ![PP, CQ, PX].some((x) => ids(wonbee).includes(x)), wonbee.items.map((i) => i.name));
  ok("FO-7q P2 fail: a merged-away party (PM, though won) is never found; its survivor is", !ids(wonbee).includes(PM) && ids(wonbee).includes(PW));
  ok("FO-7q P2 pass (review M1): a client opened on the case side (PD, no prospect) is found, as the linked party of case D", ids(wonbee).includes(PD), wonbee.items.map((i) => i.name));
  ok("FO-7q P2 pass (review r2-m1): a company opened on the case side (CD, no prospect) is found, as the linked party of case E", ids(wonbee).includes(CD), wonbee.items.map((i) => i.name));
  ok("FO-7q P2 pass: exactly the four clients (PW, PD, CW, CD) answer", wonbee.items.length === 4, wonbee.items.map((i) => i.name));
  ok("FO-7q P2 pass (review m2): people and companies form one list, cut and ordered by the name shown", wonbee.items.every((x, i, a) => i === 0 || a[i - 1]!.name.toLowerCase() <= x.name.toLowerCase()), wonbee.items.map((i) => i.name));

  // ---------------------------------------------------------------------------- P1: another firm's party never answers
  ok("FO-7q P1 fail: firm B's won party with the same words (PB) never answers firm A, even with the widest scope (the SQL firm checks and PF-12's walls both hold it)", !ids(wonbee).includes(PB));
  const fromB = await inB(() => new PartyReads(db, async () => "ALL" as const).search(ctxB, { q: "wonbee" }));
  ok("FO-7q P1 pass: firm B finds its own (PB) and none of firm A's", ids(fromB).length === 1 && ids(fromB)[0] === PB, fromB.items);
  const scopedWithA = await inB(() => new PartyReads(db, async () => ({ cases: [X, Y], parties: [PW, CW] })).search(ctxB, { q: "wonbee" }));
  ok("FO-7q P1 fail: firm A's party and case ids put into firm B's scope still find nothing of firm A's (SQL firm checks and walls)", ids(scopedWithA).length === 0, scopedWithA.items);
  const crossLabel = await inA(() => labelsOf(db, A, [{ personId: PB, companyId: null, caseId: null }]));
  ok("FO-7q P1 fail: a label read for firm B's person id under firm A gives no name", crossLabel[0]?.billTo?.kind === "PERSON" && crossLabel[0]?.billTo?.name === null, crossLabel);

  // ------------------------------------------------------------------------------------- P3: a name is never guessed
  ok("FO-7q P3 fail: a won person with no stored name (PN) is never found, though their email holds the words", !ids(wonbee).includes(PN));
  const byEmail = await inA(() => allA.search(ctxR, { q: "fo7q3.pw" }));
  ok("FO-7q P3 fail: the search reads names only, never an email", byEmail.items.length === 0, byEmail.items);
  ok("FO-7q P3 pass: every name answered is the stored one", wonbee.items.find((i) => i.id === PW)?.name === "Client Wonbee Sample" && wonbee.items.find((i) => i.id === CW)?.name === "Wonbee Holdings (Sample)");

  // ----------------------------------------------------------------------------------- P4: C5, as the invoice reads
  const scoped = (s: { cases: string[]; parties: string[] }) => inA(() => new PartyReads(db, async () => s).search(ctxR, { q: "wonbee" }));
  const onlyPW = await scoped({ cases: [], parties: [PW] });
  ok("FO-7q P4 pass: a party in the caller's party scope is found; one outside it (CW) is not", ids(onlyPW).length === 1 && ids(onlyPW)[0] === PW, onlyPW.items);
  const viaCase = await scoped({ cases: [X], parties: [] }), viaD = await scoped({ cases: [D], parties: [] }), notD = await scoped({ cases: [X], parties: [PW] });
  ok("FO-7q P4 pass (review M1): the case-side client PD is found through their own case D in scope", ids(viaD).length === 1 && ids(viaD)[0] === PD, viaD.items);
  ok("FO-7q P4 fail (review M1): PD is a client, but outside the caller's scope (cases X, party PW) is not found", !ids(notD).includes(PD) && !ids(notD).includes(CD) && ids(notD).length === 2, notD.items);
  const viaE = await scoped({ cases: [E], parties: [] });
  ok("FO-7q P4 pass (review r2-m1): the case-side company CD is found through its own case E in scope, and nobody else", ids(viaE).length === 1 && ids(viaE)[0] === CD, viaE.items);
  ok("FO-7q P4 pass: the client of a case in scope (X's company CW) is found, and nobody else", ids(viaCase).length === 1 && ids(viaCase)[0] === CW, viaCase.items);
  const none = await scoped({ cases: [], parties: [] }), prospectInScope = await scoped({ cases: [], parties: [PP, CQ] });
  ok("FO-7q P4 fail: an empty scope finds nobody; an open prospect in scope is still never found", none.items.length === 0 && prospectInScope.items.length === 0, { none: none.items, prospectInScope: prospectInScope.items });
  const failClosedApp = await inA(() => new PartyReads(db).search(ctxR, { q: "wonbee" }));
  ok("FO-7q P4 fail: with no scope given (failClosed) nobody is found", failClosedApp.items.length === 0);

  // ----------------------------------------------------------------------- P5: billTo and caseLabel on the reads
  const reads = new InvoiceReads(db, async () => "ALL" as const), list = await inA(() => reads.list(ctxR, { pageSize: "200" }));
  const row = (id: string) => list.items.find((r) => r.id === id);
  ok("FO-7q P5 pass: a list row names its person and its case number", row(IW)?.billTo?.kind === "PERSON" && row(IW)?.billTo?.name === "Client Wonbee Sample" && row(IW)?.caseLabel === "C-2026-00002", row(IW));
  ok("FO-7q P5 pass: a company's row names the company and its case", row(IC)?.billTo?.kind === "COMPANY" && row(IC)?.billTo?.name === "Wonbee Holdings (Sample)" && row(IC)?.caseLabel === "C-2026-00001", row(IC));
  ok("FO-7q P5 fail (P3 on the reads): a person with no stored name shows name null, never the email; no case → caseLabel null", row(IN)?.billTo?.kind === "PERSON" && row(IN)?.billTo?.name === null && row(IN)?.caseLabel === null, row(IN));
  const det = await inA(() => reads.detail(ctxR, IW)), detN = await inA(() => reads.detail(ctxR, IN));
  ok("FO-7q P5 pass: the detail carries the same Bill to and case label as its row", JSON.stringify(det.billTo) === JSON.stringify(row(IW)?.billTo) && det.caseLabel === "C-2026-00002", { billTo: det.billTo, caseLabel: det.caseLabel });
  ok("FO-7q P5 fail: the detail of the unnamed person's invoice shows name null", detN.billTo?.name === null && detN.caseLabel === null, detN.billTo);
  const noIds = await inA(() => labelsOf(db, A, [{ personId: null, companyId: null, caseId: null }]));
  ok("FO-7q P5 fail: a row with no party and no case gets billTo null and caseLabel null, never a name", noIds[0]?.billTo === null && noIds[0]?.caseLabel === null, noIds);

  // --------------------------------------------------------------------------------------------- P6: the province
  ok("FO-7q P6 pass: each hit carries the province a new draft takes (firm A's ON, P-797)", wonbee.items.every((i) => i.province === "ON"), wonbee.items);
  ok("FO-7q P6 fail: firm B has no province on record → null, never a guess", fromB.items.every((i) => i.province === null), fromB.items);

  // ------------------------------------------------------------------------------- P7: the route and its input
  const signIn = async (actorId: string, firmKey: string) => {
    const s = await fetch(`${base}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey, actorId, secondStep: true }) });
    const b = await s.json() as { token?: string }; if (!b.token) throw new Error(JSON.stringify(b)); return b.token; };
  const tR = await signIn("user-R", "sample-firm");
  const P = "/front-office/money/parties";
  const noSession = await call(undefined, `${P}?q=wonbee`), withSession = await call(tR, `${P}?q=wonbee`);
  ok("FO-7q P7 fail: no session → 401", noSession.status === 401, noSession);
  ok("FO-7q P7 pass: user-R (holds agent/invoice:list) gets 200 through the app's own scope (PgMoneyVisibility): clients of firm A only (PW, PD, CW, CD), at least one",
    withSession.status === 200 && withSession.body?.items?.length >= 1 && withSession.body.items.every((i: { id: string }) => [PW, PD, CW, CD].includes(i.id)), withSession);
  // READ_ONLY is the one seeded role without agent/invoice:list: user-T's grants are ended and READ_ONLY given instead
  ok("setup: READ_ONLY holds no agent/invoice:list", sql(`select count(*) from platform_role_permission where role::text = 'READ_ONLY' and permission_key = 'agent/invoice:list'`) === "0");
  const T = staff("user-T", A);
  rep(`update platform_role_grant set ended_at = now(), ended_by = 'seed:FO-7q-3', end_reason = 'Sample' where staff_id = '${T}' and ended_at is null;
    insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values ('${randomUUID()}', '${A}', '${T}', 'READ_ONLY', 'seed:FO-7q-3')`);
  const tT = await signIn("user-T", "sample-firm"), noKeyRes = await call(tT, `${P}?q=wonbee`);
  ok("FO-7q P7 fail: a staff member without agent/invoice:list (READ_ONLY) → 403", noKeyRes.status === 403, noKeyRes);
  const short = await call(tR, `${P}?q=w`), missing = await call(tR, P), extra = await call(tR, `${P}?q=wonbee&firmId=${B}`), long = await call(tR, `${P}?q=${"a".repeat(101)}`);
  ok("FO-7q P7 fail: q shorter than 2, missing, over 100, or an extra field (a firm id) → 422 naming the field, nothing read",
    [short, missing, extra, long].every((r) => r.status === 422), [short.status, missing.status, extra.status, long.status, extra.body]);
  const nul = await call(tR, `${P}?q=wo%00nbee`);
  ok("FO-7q P7 fail (breaker m1): a NUL character in q → 422 naming q, never a database 500", nul.status === 422 && JSON.stringify(nul.body).includes("q"), nul);
  const pct = await inA(() => allA.search(ctxR, { q: "%%" })), under = await inA(() => allA.search(ctxR, { q: "__" }));
  ok("FO-7q P7 fail: % and _ are letters, not patterns: they match no name", pct.items.length === 0 && under.items.length === 0, { pct: pct.items.length, under: under.items.length });
  for (let i = 0; i < PARTY_LIMIT + 5; i++) { const p = person(A, `Client Many${String(i).padStart(2, "0")}`, "Sample", `fo7q3.m${i}@example.org`); prospect(A, { person: p }, true); }
  const many = await inA(() => allA.search(ctxR, { q: "many" }));
  ok(`FO-7q P7 pass: at most ${PARTY_LIMIT} answer, ordered by name`, many.items.length === PARTY_LIMIT && many.items.every((x, i, a) => i === 0 || a[i - 1]!.name.toLowerCase() <= x.name.toLowerCase()), many.items.length);
} finally {
  await app?.close(); await owner.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* best effort */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
