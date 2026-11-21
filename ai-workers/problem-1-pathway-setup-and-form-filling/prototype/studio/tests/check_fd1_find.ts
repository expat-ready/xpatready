// PF-30a (BACKLOG row PF-30a; map row 102, P-586; AG-7-75 rule 3, AG-7-88, AG-2-1 rule 10, AG17-D6): the one find door
// (FindPort, GET /api/platform/find) and the front office's finder. Each Done-when line has a pass and a fail, on one
// scratch database dropped at the end; FindPort's contract runs on the fake and the real registry; the route runs in a
// small Nest app hooked like main.ts (PF-23's logger), whose lines PF-23's scanner reads for the query. US$0, no model call.
//   tsx studio/tests/check_fd1_find.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeFind, findQueryOf, FindResult, PARTIAL_LINE, type FindHit } from "../ports/find.ts";
import { findPortContract } from "../ports/contracts/find-port.contract.ts";
import { runContract } from "../ports/contracts/contract.ts";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { FrontOfficeFinder, phoneForFirm } from "../api/src/front-office/find.ts";
import { Corporate } from "../api/src/front-office/sales/corporate/service.ts";
import { Leads } from "../api/src/front-office/sales/leads.ts";
import { Prospects } from "../api/src/front-office/sales/prospects.ts";
import type { SalesPorts } from "../api/src/front-office/sales/public.ts";
import { clearingConflicts } from "./lib/conflict-clear.ts";
import { auditEvent, platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";
import { FindRegistry } from "../api/src/platform/find/registry.ts";
import { FindController } from "../api/src/platform/find/routes.ts";
import { dutiesOf, type StaffContext } from "../api/src/platform/identity/keys.ts";
import { ConsentStore } from "../api/src/platform/messages/consent/consent-store.ts";
import { observe } from "../api/src/platform/observability/hook.ts";
import { scanText } from "../api/src/platform/observability/scan-logs.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../api/src/platform/settings.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fd1_${process.pid}`, URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const sql = (q: string) => execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8" }).trim();
async function refusal(fn: () => unknown): Promise<{ status: number; body: Record<string, unknown> } | null> {
  try { await fn(); return null; } catch (e) {
    const x = e as { getStatus?: () => number; getResponse?: () => unknown };
    if (!x.getStatus) return { status: 0, body: { error: String(e) } };
    return { status: x.getStatus(), body: x.getResponse!() as Record<string, unknown> };
  }
}
const all = (r: FindResult) => r.groups.flatMap((g) => g.hits);
const ids = (r: FindResult, kind = "person") => all(r).filter((h) => h.kind === kind).map((h) => h.id);
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

// ------------------------------------------------------------------------------------- the port: contract and the query reader
await runContract(findPortContract, "fakeFind", () => fakeFind(), ok);
await runContract(findPortContract, "FindRegistry", () => new FindRegistry() as never, ok);
{
  const e = findQueryOf(" ANNA@EXAMPLE.COM "), p = findQueryOf("+1 416 555 0100"), n = findQueryOf("p-00012"), w = findQueryOf("Ann");
  ok("PF-30a pass (query read once): an email lower-cased, a phone kept for the firm's reader, a file number upper-cased, a name as its key",
    e.email === "anna@example.com" && e.nameKey === "" && p.phone === "+1 416 555 0100" && n.number === "P-00012" && w.nameKey === "ann" && w.email === null && w.phone === null && w.number === null, { e, p, n, w });
  ok("PF-30a fail (breaker m1): \"a.\", \"a%\" and a lone emoji are no 2-character name search", findQueryOf("a.").nameKey === "" && findQueryOf("a%").nameKey === "" && (await refusal(() => findQueryOf("😀"))) !== null);
  ok("PF-30a fail (query read once): a short number is no phone, words are no email, a name is no file number",
    findQueryOf("12345").phone === null && findQueryOf("anna at example").email === null && findQueryOf("Anna Smith").number === null);
  ok("PF-30a pass: the firm's country is the phone's default (CA reads 4165550100; GB reads 020 7946 0958)", phoneForFirm("4165550100", "CA") === "+14165550100" && phoneForFirm("020 7946 0958", "GB") === "+442079460958");
  ok("PF-30a fail: a number that is not one gives no phone", phoneForFirm("555", "CA") === null && phoneForFirm("12345678901234567", "GB") === null);
}

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_, options: "-c TimeZone=UTC" }) });
try {
  for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
  await seedSampleFirms(db);
  const fo = await seedSampleFirmsFrontOffice(db);
  ok("PF-30a setup: both Sample firms have a front office", fo.failed.length === 0);
  const firm = (key: string) => sql(`select id from platform_firm where key = '${key}'`);
  const A = firm("sample-firm");
  const ctxOf = (actorId: string): StaffContext => {
    const [id, firmId] = sql(`select id || '|' || firm_id from platform_staff where actor_id = '${actorId}'`).split("|");
    const roles = sql(`select string_agg(role::text, ',') from platform_role_grant where staff_id = '${id}'`).split(",");
    const keys = sql(`select string_agg(distinct permission_key, ',') from platform_role_permission where role::text = any(string_to_array('${roles.join(",")}', ','))`).split(",");
    return { staffId: id, firmId, firmKey: firmId === A ? "sample-firm" : "sample-solo", roles, keys, duties: dutiesOf(new Set(keys)), authTime: 0, via: "local" };
  };
  const R = ctxOf("user-R"), T = ctxOf("user-T"), SOLO = ctxOf("user-S");
  const ws = await platformAuditWorkspaceId(db as never);
  const everyone = (value: boolean) => writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value, by: "system:test", workspaceId: ws });
  await everyone(true);
  const ports: SalesPorts = { audit: auditEvent, consent: new ConsentStore(auditEvent), publicOrigin: "http://localhost:4400" };
  const leads = new Leads(db, ports), pros = new Prospects(db, ports), corp = new Corporate(db, ports);
  clearingConflicts(db, { prospects: Prospects.prototype });
  const add = async (who: StaffContext, p: Record<string, unknown>) => (await leads.add(who, { requestId: randomUUID(), source: "Phone call", ...p })) as { id: string; number: string; person: { id: string } };
  const reason = (kind: string, key: string) => sql(`select id from fo_reason where firm_id = '${A}' and kind = '${kind}' and key = '${key}'`);

  const registry = new FindRegistry();
  new FrontOfficeFinder(db, registry).onModuleInit();
  ok("PF-30a setup: the front office's finder registers on the door at start-up", JSON.stringify(registry.modules()) === JSON.stringify(["front-office"]));
  const find = (who: StaffContext, q: string) => registry.find(who, q);

  const anna = await add(R, { givenNames: "Anna", familyName: "Sample", email: "anna@example.com", phone: "+1 416 555 0100" });
  const annabel = await add(R, { givenNames: "Annabel", familyName: "Sample", email: "annabel@example.com" });
  const hannah = await add(R, { givenNames: "Hannah", familyName: "Sample", email: "hannah@example.com" });
  const omar = await add(T, { givenNames: "Omar", familyName: "Haddad", email: "omar@example.com" });

  // ------------------------------------------------------------------------------------- email, phone, name
  const byEmail = await find(R, "ANNA@EXAMPLE.COM");
  ok("PF-30a pass: \"ANNA@EXAMPLE.COM\" finds anna@example.com (EMAIL), opening her lead", ids(byEmail).includes(anna.person.id) && all(byEmail)[0].matched_on.includes("EMAIL") && all(byEmail)[0].url === `/front-office/leads/${anna.id}` && FindResult.safeParse(byEmail).success, byEmail);
  ok("PF-30a fail: another address (anna@example.org) finds no one", all(await find(R, "anna@example.org")).length === 0);
  const ph1 = await find(R, "+1 416 555 0100"), ph2 = await find(R, "4165550100");
  ok("PF-30a pass: \"+1 416 555 0100\" and \"4165550100\" find the same person (PHONE)", ids(ph1)[0] === anna.person.id && ids(ph2)[0] === anna.person.id && all(ph2)[0].matched_on.includes("PHONE"), { ph1, ph2 });
  ok("PF-30a fail: another number (4165550109) finds no one", all(await find(R, "4165550109")).length === 0);
  const ann = await find(R, "Ann");
  ok("PF-30a pass: \"Ann\" finds Anna and Annabel by the start of a name", ids(ann).includes(anna.person.id) && ids(ann).includes(annabel.person.id), ann);
  ok("PF-30a fail: \"Ann\" does not find Hannah (inside a word is not a prefix) nor Omar", !ids(ann).includes(hannah.person.id) && !ids(ann).includes(omar.person.id), ann);
  ok("PF-30a pass: a one-letter misspelling of a full name (\"Anabel Sample\") still finds Annabel by trigram similarity", ids(await find(R, "Anabel Sample")).includes(annabel.person.id));
  const route = new FindController(registry);
  const one = await refusal(() => route.find({ platform: R }, { q: "a" })), none = await refusal(() => route.find({ platform: R }, {})), long = await refusal(() => route.find({ platform: R }, { q: "x".repeat(101) }));
  const misspelt = await refusal(() => route.find({ platform: R }, { query: "Anna" }));
  ok("PF-30a fail (PF-28): a misspelt query key (query=) → 422 naming it", misspelt?.status === 422 && JSON.stringify(misspelt.body).includes("query"), misspelt);
  ok("PF-30a fail: a 1-character query, no query or 101 characters → 400, the refusal not repeating it", one?.status === 400 && none?.status === 400 && long?.status === 400 && !JSON.stringify(long).includes("xxxx"), { one, none, long });
  const veryLong = await refusal(() => route.find({ platform: R }, { q: "x".repeat(600) }));
  ok("PF-30a fail (breaker m2): 600 characters → the same 400 QUERY_LENGTH as 101", veryLong?.status === 400 && JSON.stringify(veryLong.body).includes("QUERY_LENGTH"), veryLong);
  const zelda = await add(R, { givenNames: "Zelda5", familyName: "Sample", email: "zelda5@example.com" });
  ok("PF-30a pass (breaker m4): a name shaped like a file number (\"zelda5\") is still searched as a name", ids(await find(R, "zelda5")).includes(zelda.person.id));
  const jose = await add(R, { givenNames: "José", familyName: "García", email: "jose.garcia@example.com" });
  const li = await add(R, { givenNames: "李", familyName: "明", email: "li.ming@example.com" });
  ok("PF-30a pass: an accented name typed with its accent (\"José\") finds José García by prefix; a non-Latin full name (李 明) by FO-9a's exact key", ids(await find(R, "José")).includes(jose.person.id) && ids(await find(R, "李 明")).includes(li.person.id));
  ok("PF-30a fail: a non-Latin letter is never read as a prefix of another (王 does not find 李明)", !ids(await find(R, "王芳")).includes(li.person.id));
  const olga = await add(R, { givenNames: "Ольга", familyName: "Петрова", email: "olga@example.com" });
  const dana = await add(R, { givenNames: "דנה", familyName: "כהן", email: "dana@example.com" });
  const digits = [await find(R, "04"), await find(R, "05"), await find(R, "0674")].map((r) => ids(r));
  ok("PF-30a fail (round 2 M1): typed digits (\"04\", \"05\", \"0674\") never prefix-match the hex keys of Cyrillic, Hebrew or Chinese names", digits.every((d) => !d.includes(olga.person.id) && !d.includes(dana.person.id) && !d.includes(li.person.id)), digits);
  ok("PF-30a pass (round 2 M1): those people are still found by their own full names", ids(await find(R, "Ольга Петрова")).includes(olga.person.id) && ids(await find(R, "דנה כהן")).includes(dana.person.id));
  ok("PF-30a pass: 2 characters are enough (\"An\" through the route)", ids(await route.find({ platform: R }, { q: "An" })).includes(anna.person.id));

  // ------------------------------------------------------------------------------------- own versus all
  await everyone(false);
  const tFinds = await find(T, "Anna");
  ok("PF-30a fail: a view.own person (T, with \"everyone sees all\" off) does not find another owner's lead (R's Anna)", !ids(tFinds).includes(anna.person.id) && !JSON.stringify(tFinds).includes(anna.person.id), tFinds);
  ok("PF-30a pass: T finds T's own lead (Omar); R finds R's own (Anna)", ids(await find(T, "Omar")).includes(omar.person.id) && ids(await find(R, "Anna")).includes(anna.person.id));
  await everyone(true);
  ok("PF-30a pass: with view.all and \"everyone sees all\" on, T finds R's Anna", ids(await find(T, "Anna")).includes(anna.person.id));

  // ------------------------------------------------------------------------------------- lost, closed, prospect numbers, companies
  const pa = await pros.engage(R, anna.id) as { id: string; number: string };
  await pros.lost(R, pa.id, { reasonId: reason("PROSPECT_LOST", "PRICE") });
  const lost = (await find(R, "Anna")).groups.flatMap((g) => g.hits).find((h) => h.id === anna.person.id);
  ok("PF-30a pass: a lost prospect's person is found and labelled \"Lost\", opening the prospect", lost?.subtitle === `Lost ${pa.number}` && lost.url === `/front-office/prospects/${pa.id}`, lost);
  await leads.close(R, hannah.id, { reasonId: reason("LEAD_CLOSE", "NOT_INTERESTED") });
  const closed = all(await find(R, "Hannah")).find((h) => h.id === hannah.person.id);
  ok("PF-30a pass: a closed lead's person is found and labelled \"Closed\"", closed?.subtitle === `Closed ${hannah.number}`, closed);
  const pb = await pros.engage(R, annabel.id) as { id: string; number: string };
  const byNumber = await find(R, pa.number.toLowerCase());
  ok("PF-30a pass: a prospect number (typed lower case) finds that prospect first, labelled Lost", all(byNumber)[0]?.kind === "prospect" && all(byNumber)[0].id === pa.id && all(byNumber)[0].subtitle === "Lost" && all(byNumber)[0].matched_on[0] === "NUMBER", byNumber);
  const prefix = await find(R, pa.number.slice(0, 6));
  ok("PF-30a pass: a number's prefix finds the prospects that start with it", ids(prefix, "prospect").includes(pa.id) && ids(prefix, "prospect").includes(pb.id), prefix);
  ok("PF-30a fail: a number no prospect has finds none", ids(await find(R, "P-99999"), "prospect").length === 0);
  const ana2 = await add(R, { givenNames: "Ana", familyName: "Baker", email: "ana@pinebakery.example" });
  const pine = await corp.engage(R, ana2.id, { companyName: "Pine Bakery Ltd" }) as { company?: { id: string } };
  ok("PF-30a pass: a company is found by the start of its name (\"Pine\")", ids(await find(R, "Pine"), "company").includes(pine.company!.id));
  // Nothing in the front office is deleted (FO-1a: rows are never removed), so the row's "a deleted lead is not found" has no
  // record on main; the closest real case: a person with no lead or prospect (a company contact only) is not found as a person.
  const zed = await corp.addContact(R, pine.company!.id, { givenNames: "Zed", familyName: "Contactonly", email: "zed@pinebakery.example", role: "HR" }) as { contacts: { name: string }[] };
  ok("PF-30a fail: a person with no lead or prospect (a company contact only) is not found", zed.contacts.some((c) => c.name === "Zed Contactonly") && all(await find(R, "zed@pinebakery.example")).length === 0);
  ok("PF-30a pass: one finder answers at most 8 hits", await (async () => { for (let i = 0; i < 10; i++) await add(R, { givenNames: `Annalise${i}`, familyName: "Sample", email: `annalise${i}@example.com` }); return all(await find(R, "Ann")).length === 8; })());

  // ------------------------------------------------------------------------------------- review M1: the cap never hides the caller's own
  sql(`insert into fo_person (firm_id, given_names, family_name, created_by, created_at, updated_at) select '${A}', 'Ann' || g, 'Crowd', 'test', now() - interval '1 day', now() from generate_series(1, 57) g;
       insert into fo_lead (firm_id, person_id, door, source, owner_staff_id, created_by, updated_at) select firm_id, id, 'MANUAL', 'Phone call', '${R.staffId}', 'test', now() from fo_person where family_name = 'Crowd'`);
  const mine = await add(T, { givenNames: "Anneliese", familyName: "Mine", email: "anneliese@example.com" });
  const tProspect = await pros.engage(T, mine.id) as { id: string; number: string };
  await everyone(false);
  const crowded = await find(T, "Ann"), crowdedNumber = await find(T, "P-0");
  await everyone(true);
  ok("PF-30a pass (review M1): with 57 older \"Ann…\" people of another owner, a view.own caller (T) still finds T's own Anneliese, and T's prospect by a number prefix",
    ids(crowded).includes(mine.person.id) && ids(crowdedNumber, "prospect").includes(tProspect.id), { crowded, crowdedNumber });
  ok("PF-30a fail (review M1): none of the 57 other-owner people, nor R's prospects, is named to T", !all(crowded).some((h) => h.title.endsWith("Crowd")) && !ids(crowdedNumber, "prospect").includes(pa.id));
  sql(`insert into fo_person (firm_id, given_names, family_name, created_by, created_at, updated_at) select '${A}', 'Anna' || g, 'Nolead', 'test', now() - interval '2 days', now() from generate_series(1, 80) g`);
  ok("PF-30a pass (breaker M1): 80 older \"Anna…\" people with no lead or prospect never crowd out R's own (view all)", ids(await find(R, "Anna")).includes(anna.person.id) && !all(await find(R, "Anna")).some((h) => h.title.endsWith("Nolead")));
  const noShow = { ...R, keys: R.keys.filter((k) => k !== "agent/prospect:show") };
  ok("PF-30a fail (review m3): a person without agent/prospect:show finds nothing in the front office", all(await find(noShow, "Anna")).length === 0 && ids(await find(R, "Anna")).includes(anna.person.id));

  // ------------------------------------------------------------------------------------- a slow module is dropped
  registry.register("slow-sample", async () => { await sleep(2000); return [{ kind: "case", id: randomUUID(), title: "Sample slow case", subtitle: null, matched_on: ["NAME"], url: "/cases" } satisfies FindHit]; });
  const t0 = Date.now(), slow = await find(R, "Anna"), took = Date.now() - t0;
  ok("PF-30a pass: a finder that sleeps 2 s is dropped with the partial-results line; the front office still answers", slow.partial && slow.message === PARTIAL_LINE && ids(slow).includes(anna.person.id) && !slow.groups.some((g) => g.kind === "case") && took < 1500, { took, slow });
  const fresh = new FindRegistry(); new FrontOfficeFinder(db, fresh).onModuleInit();
  const quick = await fresh.find(R, "Anna");
  ok("PF-30a fail: with no slow module the answer is whole (no partial line)", !quick.partial && quick.message === null);

  // ------------------------------------------------------------------------------------- firms never mix
  const soloEmail = await fresh.find(SOLO, "anna@example.com"), soloName = await fresh.find(SOLO, "Ann"), soloNumber = await fresh.find(SOLO, pa.number);
  const leak = JSON.stringify([soloEmail, soloName, soloNumber]);
  ok("PF-30a fail: no hit from firm A ever appears for firm B (by email, name or prospect number)", [soloEmail, soloName, soloNumber].every((r) => all(r).length === 0) && !leak.includes(anna.person.id) && !leak.includes(pa.id), leak);
  const bPerson = await add(SOLO, { givenNames: "Annika", familyName: "Solo", email: "annika@solo.example" });
  ok("PF-30a pass: firm B finds its own people (Annika) and only them", JSON.stringify(ids(await fresh.find(SOLO, "Ann"))) === JSON.stringify([bPerson.person.id]));

  // ------------------------------------------------------------------------------------- the query is never logged (PF-23's scanner)
  fresh.register("broken-sample", async (_c, q) => { throw new Error(`no record for ${q.text}`); });
  class ProbeModule {}
  Module({ controllers: [FindController], providers: [{ provide: FindRegistry, useValue: fresh }] })(ProbeModule);
  const lines: string[] = [];
  const app = await NestFactory.create<NestExpressApplication>(ProbeModule, { logger: ["error", "warn"] });
  const hooked = observe(app, { sink: (l) => { lines.push(l); } });
  app.use((req: { platform?: StaffContext }, _res: unknown, next: () => void) => { req.platform = R; next(); });
  await app.listen(0, "127.0.0.1");
  const base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  const queries = ["anna@example.com", "Annabel Sample", "4165550100", pa.number];
  let statuses: number[] = [], body = "";
  try {
    for (const q of queries) { const r = await fetch(`${base}/api/platform/find?q=${encodeURIComponent(q)}`); statuses.push(r.status); body = await r.text(); }
    const short = await fetch(`${base}/api/platform/find?q=A`); statuses.push(short.status); await short.text();
  } finally { hooked.restore(); await app.close(); }
  const findings = scanText(lines.join("\n"), "find-probe.log", queries);
  ok("PF-30a pass (logs): through GET /api/platform/find the hooked server logs request lines, and PF-23's scanner finds none of the queries in them",
    statuses.join(",") === "200,200,200,200,400" && lines.some((l) => l.includes("/api/platform/find")) && findings.length === 0 && queries.every((q) => !lines.join("\n").includes(q)) && JSON.parse(body).groups.length >= 1, { statuses, findings, lines: lines.length });
  const control = scanText(JSON.stringify({ event: "log", message: "find Annabel Sample" }), "planted.log", queries);
  ok("PF-30a fail (logs): a line that does hold a query (planted) is caught by the same scanner", control.length === 1, control);
  ok("PF-30a pass (review m4): a dropped finder is logged by its module and a reason word only, never its error's words", lines.some((l) => l.includes("finder broken-sample dropped (ERROR)")) && !lines.join("\n").includes("no record for"));
} finally {
  await db.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
