// PF-18b (AG-16-63, AG16-16; P-606): support tickets, /api/platform/support, behind PF-4's guard. Named cases DW1-DW7 (the
// brief, Lead B 16 Nov), each with a passing and a failing case, on the six seeded roles (one staff member per role in the
// Sample firm, a second Case Officer, and firm B's Owner). One scratch database (every migration, PF-3's Sample seed) and
// a Nest app built from the feature's own classes (features/platform-support.ts) beside PF-4's (the guard, the local
// stand-in's tokens), the audit port real, the file store a scratch folder, mail PF-0p's fake. No server of the app, no
// browser, no model call (US$0). The database and the folder are removed at the end.
//   tsx studio/tests/check_pf18b_support.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, ModulesContainer, NestFactory, Reflector } from "@nestjs/core";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf18b_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const OWN = "20261118073000_pf18b_support";

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const psql = (sql: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-XAtq", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const refused = (sql: string, re: RegExp) => { try { psql(sql); return false; } catch (e) { return re.test(String((e as { stderr?: string }).stderr ?? e)); } };

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
const folders = readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort();
for (const d of folders) execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);
const FILES = mkdtempSync(join(tmpdir(), "pf18b-files-"));
process.env.FO_FILES_DIR = FILES;
process.env.SUPPORT_INBOX = "support@expatready.example.com";
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED"]) delete process.env[k];

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard, assertEveryRouteDeclared, platformRoutes } = await import("../api/src/platform/identity/guard.ts");
const { MAIL_PORT } = await import("../api/src/platform/identity/session/mail.ts");
const { SupportService, ATTACHMENT_MAX_BYTES } = await import("../api/src/platform/support/support.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const { EVENT } = await import("../ports/events.ts");
const { fakeMail } = await import("../ports/mail.ts");
const { fakeFiles } = await import("../ports/files.ts");
const { fakeStaff } = await import("../ports/staff.ts");
const feature = (await import("../api/src/features/platform-support.ts")).default;

let mailFails = false;
const mail = fakeMail({ failOn: () => mailFails });
const db = new Db();
const apps: { close(): Promise<void> }[] = [];
const local = new LocalIdentity("pf18b-check-signing-key-0123456789abcdef", () => Date.now());
async function makeApp() {
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, PlatformClock, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
    { provide: MAIL_PORT, useValue: mail }, ...feature.providers];
  @Module({ controllers: feature.controllers as never[], providers: providers as never[] }) class TestApp {}
  const app = await NestFactory.create(TestApp, { logger: false });
  await app.listen(0, "127.0.0.1"); apps.push(app);
  return { app, base: `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}` };
}

type Res = { status: number; body: any; raw?: Uint8Array; type?: string | null };
let BASE = "";
const call = async (method: string, path: string, token?: string, body?: unknown): Promise<Res> => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path.startsWith("/api/") ? path : `/api/platform/support${path}`}`, { method, headers, body: body === undefined || method === "GET" ? undefined : JSON.stringify(body) });
  const raw = new Uint8Array(await r.arrayBuffer()), text = new TextDecoder().decode(raw); let b: any = text; try { b = JSON.parse(text); } catch { /* text or bytes */ }
  return { status: r.status, body: b, raw, type: r.headers.get("content-type") };
};
type Part = { bytes: Uint8Array; type: string; name?: string };
const raise = async (token: string, fields: Record<string, string>, files: Part[] = []): Promise<Res> => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  files.forEach((p, i) => f.append("files", new Blob([new Uint8Array(p.bytes)], { type: p.type }), p.name ?? `file${i + 1}`));
  const r = await fetch(`${BASE}/api/platform/support/tickets`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: f });
  const text = await r.text(); let b: any = text; try { b = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body: b };
};
const bytes = (s: string) => new TextEncoder().encode(s);
const PDF = bytes("%PDF-1.4\n% Sample support attachment\n%%EOF\n");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const filesStored = () => { try { return readdirSync(FILES, { recursive: true }).filter((f) => !String(f).endsWith(".meta") && /support\/[0-9a-f-]{36}\/\d$/.test(String(f))).length; } catch { return 0; } };
const tickets = async () => db.platformSupportTicket.count();

try {
  await seedSampleFirms(db);
  const firmA = (await db.platformFirm.findFirstOrThrow({ where: { key: "sample-firm" } })).id;
  const firmB = (await db.platformFirm.findFirstOrThrow({ where: { key: "sample-solo" } })).id;
  const ROLES = ["OWNER", "ADMIN", "CASE_MANAGER", "CASE_OFFICER", "BILLING_FINANCE", "READ_ONLY"] as const;
  type Role = (typeof ROLES)[number];
  const person = async (firmId: string, name: string, role: Role) => {
    const s = await db.platformStaff.create({ data: { firmId, email: `${name}@pf18b.example.com`, displayName: `Sample ${name}`, actorId: `pf18b-${name}`, status: "ACTIVE" } });
    await db.platformRoleGrant.create({ data: { firmId, staffId: s.id, role, grantedBy: "seed:pf18b" } });
    return { id: s.id, token: local.issue(s.id, { authTimeMs: Date.now() - 60_000, secondStep: true }), email: `${name}@pf18b.example.com`, name: `Sample ${name}` };
  };
  const as = {} as Record<Role, Awaited<ReturnType<typeof person>>>;
  for (const r of ROLES) as[r] = await person(firmA, r.toLowerCase().replace(/_/g, "-"), r);
  const officer2 = await person(firmA, "case-officer-2", "CASE_OFFICER");
  const ownerB = await person(firmB, "owner-b", "OWNER");

  const { app, base } = await makeApp();
  BASE = base;
  const svc = app.get(SupportService);

  // ---------------------------------------------------------------------------------------------------- routes, keys
  const routes = platformRoutes(app.get(ModulesContainer), app.get(Reflector)).filter((r) => r.path.startsWith("/api/platform/support"));
  ok("PF-18b: PF-4's start-up check passes with the six support routes, each declaring create or list", routes.length === 6 && (() => { try { assertEveryRouteDeclared(routes); return true; } catch { return false; } })()
    && routes.every((r) => r.access?.kind === "keys" && r.access.keys.length === 1 && /^agent\/support-ticket:(create|list)$/.test(r.access.keys[0])), routes.map((r) => `${r.method} ${r.path} ${JSON.stringify(r.access)}`));
  const grants = psql(`select string_agg(role || '=' || permission_key, ',' order by role, permission_key) from platform_role_permission where permission_key like 'agent/support-ticket:%'`);
  ok("PF-18b: both keys are on main for all six starter roles (PF-3's seed, SA-06 AG16-16): this row adds no key row", grants.split(",").length === 12 && ROLES.every((r) => grants.includes(`${r}=agent/support-ticket:create`) && grants.includes(`${r}=agent/support-ticket:list`)), grants);

  // ---------------------------------------------------------------------------------------------------- DW1
  const t1 = await raise(as.CASE_OFFICER.token, { body: "The intake form will not save (Sample).", page: "/cases/abc/intake?tab=2#top" });
  ok("PF-18b DW1 pass: a Case Officer raises a ticket; the page is noted without its query string; status OPEN; emailed", t1.status === 201 && t1.body.page === "/cases/abc/intake" && t1.body.status === "OPEN" && t1.body.emailed === true && t1.body.raisedBy === as.CASE_OFFICER.id, t1);
  const id1 = t1.body.id as string;
  const mine = await call("GET", "/tickets", as.CASE_OFFICER.token), one = await call("GET", `/tickets/${id1}`, as.CASE_OFFICER.token);
  ok("PF-18b DW1 pass: they see it in their list and by id, with its first message", mine.status === 200 && mine.body.items.some((t: { id: string }) => t.id === id1) && mine.body.allFirm === false && one.status === 200 && one.body.messages.length === 1 && one.body.messages[0].body.startsWith("The intake form"), { mine, one });
  const t2 = await raise(officer2.token, { body: "A second question (Sample).", page: "/settings/help" });
  const l2 = await call("GET", "/tickets", officer2.token), g2 = await call("GET", `/tickets/${id1}`, officer2.token), m2 = await call("POST", `/tickets/${id1}/messages`, officer2.token, { body: "Me too" });
  ok("PF-18b DW1 fail: a colleague (another Case Officer) never sees it: not in their list, and 404 by id and for a message", t2.status === 201 && !l2.body.items.some((t: { id: string }) => t.id === id1) && l2.body.items.length === 1 && g2.status === 404 && m2.status === 404, { l2: l2.body.items?.length, g2: g2.status, m2: m2.status });
  const guess = await call("GET", `/tickets/${crypto.randomUUID()}`, as.OWNER.token), junk = await call("GET", "/tickets/not-an-id", as.OWNER.token);
  ok("PF-18b DW1 fail: a guessed ticket id, or no id at all, is the same 404", guess.status === 404 && junk.status === 404 && guess.body.detail === junk.body.detail, { guess: guess.status, junk: junk.status });
  const cm = await call("GET", `/tickets/${id1}`, as.CASE_MANAGER.token);
  ok("PF-18b DW1 fail: a Case Manager (holds :list, not Owner or Admin) sees only their own: the officer's ticket is 404", cm.status === 404, cm.status);

  // ---------------------------------------------------------------------------------------------------- DW2
  const lo = await call("GET", "/tickets", as.OWNER.token), la = await call("GET", "/tickets", as.ADMIN.token);
  const both = (l: Res) => [id1, t2.body.id].every((id) => l.body.items.some((t: { id: string }) => t.id === id));
  ok("PF-18b DW2 pass: the Owner and the Admin each see every ticket of the firm", lo.status === 200 && la.status === 200 && both(lo) && both(la) && lo.body.allFirm === true && la.body.allFirm === true, { lo: lo.body.items?.length, la: la.body.items?.length });
  const ar = await call("POST", `/tickets/${id1}/messages`, as.ADMIN.token, { body: "Adding the steps we tried (Sample)." });
  ok("PF-18b DW2 pass: the Admin replies on a colleague's ticket (200, waiting on support)", ar.status === 200 && ar.body.status === "WAITING_ON_SUPPORT" && ar.body.messages[0].authorId === as.ADMIN.id, ar);
  const ob = await call("GET", `/tickets/${id1}`, ownerB.token), lb = await call("GET", "/tickets", ownerB.token), mb = await call("POST", `/tickets/${id1}/messages`, ownerB.token, { body: "x" });
  ok("PF-18b DW2 fail: firm B's Owner never sees firm A's ticket: 404 by id and for a message, and not in their list", ob.status === 404 && mb.status === 404 && lb.status === 200 && lb.body.items.length === 0, { ob: ob.status, mb: mb.status, lb: lb.body.items?.length });

  // ---------------------------------------------------------------------------------------------------- DW3
  const before = { t: await tickets(), f: filesStored() };
  const big = new Uint8Array(ATTACHMENT_MAX_BYTES + 1); big.set(PDF);
  const tooBig = await raise(as.CASE_OFFICER.token, { body: "Big file (Sample).", page: "/cases" }, [{ bytes: big, type: "application/pdf" }]);
  const exe = await raise(as.CASE_OFFICER.token, { body: "Odd file (Sample).", page: "/cases" }, [{ bytes: bytes("MZ\u0090 program"), type: "application/x-msdownload" }]);
  const lies = await raise(as.CASE_OFFICER.token, { body: "Says PNG (Sample).", page: "/cases" }, [{ bytes: PDF, type: "image/png" }]);
  const four = await raise(as.CASE_OFFICER.token, { body: "Four files (Sample).", page: "/cases" }, [0, 1, 2, 3].map(() => ({ bytes: PDF, type: "application/pdf" })));
  ok("PF-18b DW3 fail: over the Sample limit, an unlisted type, a type its bytes deny, and a fourth file are each refused (422) with the reason",
    tooBig.status === 422 && /larger than 10 MB \(Sample limit\)/.test(tooBig.body.fields?.["files.0"]) && exe.status === 422 && /attach a PDF, a PNG or JPEG image, or a plain text file/.test(exe.body.fields?.["files.0"])
    && lies.status === 422 && /not a PNG image/.test(lies.body.fields?.["files.0"]) && four.status === 422 && /at most 3/.test(four.body.fields?.files), { tooBig: tooBig.body.fields, exe: exe.body.fields, lies: lies.body.fields, four: four.body.fields });
  ok("PF-18b DW3 fail: nothing was stored and no ticket was made by those four", (await tickets()) === before.t && filesStored() === before.f, { tickets: [before.t, await tickets()], files: [before.f, filesStored()] });
  const good = await raise(as.CASE_OFFICER.token, { body: "Screenshot and the letter attached (Sample).", page: "/cases/abc" }, [{ bytes: PDF, type: "application/pdf" }, { bytes: PNG, type: "image/png" }]);
  const idg = good.body.id as string;
  ok("PF-18b DW3 pass: a valid PDF and PNG are stored under the ticket's own folder (support/<id>/1, /2)", good.status === 201 && JSON.stringify(good.body.messages[0].files) === "[1,2]" && filesStored() === before.f + 2
    && psql(`select file_keys::text from platform_support_message where ticket_id = '${idg}'`) === `{support/${idg}/1,support/${idg}/2}`, good);
  const link = await call("POST", `/tickets/${idg}/files/1/link`, as.CASE_OFFICER.token);
  const dl = await call("GET", link.body.url, as.CASE_OFFICER.token);
  ok("PF-18b DW3 pass: it downloads through a signed link: the same bytes and type, not cached", link.status === 200 && /^\/api\/platform\/support\/files\/[^/]+$/.test(link.body.url) && dl.status === 200 && dl.type?.startsWith("application/pdf") && Buffer.from(dl.raw!).equals(Buffer.from(PDF)), { link: link.status, dl: dl.status, type: dl.type });
  const other = await call("GET", link.body.url, officer2.token), bLink = await call("GET", link.body.url, ownerB.token);
  const linkPart = link.body.url.split("/").pop() as string, bent = `${linkPart.slice(0, -2)}${linkPart.endsWith("AA") ? "BB" : "AA"}`;
  const altered = await call("GET", `/files/${bent}`, as.CASE_OFFICER.token), none = await call("POST", `/tickets/${idg}/files/3/link`, as.CASE_OFFICER.token), notSeen = await call("POST", `/tickets/${idg}/files/1/link`, officer2.token);
  ok("PF-18b DW3 fail: only through a signed link for that person: a colleague's or another firm's use, an altered token, a file it does not have, a ticket not seen are each 404",
    other.status === 404 && bLink.status === 404 && altered.status === 404 && none.status === 404 && notSeen.status === 404, { other: other.status, bLink: bLink.status, altered: altered.status, none: none.status, notSeen: notSeen.status });
  // Review m3: a link the person was given stops working once they no longer see the ticket (assertKeyVisible, not FileLinks).
  const adminLink = await call("POST", `/tickets/${idg}/files/1/link`, as.ADMIN.token);
  const adminBefore = await call("GET", adminLink.body.url, as.ADMIN.token);
  await db.platformRoleGrant.deleteMany({ where: { staffId: as.ADMIN.id } });
  await db.platformRoleGrant.create({ data: { firmId: firmA, staffId: as.ADMIN.id, role: "CASE_OFFICER", grantedBy: "seed:pf18b" } });
  const adminAfter = await call("GET", adminLink.body.url, as.ADMIN.token);
  await db.platformRoleGrant.deleteMany({ where: { staffId: as.ADMIN.id } });
  await db.platformRoleGrant.create({ data: { firmId: firmA, staffId: as.ADMIN.id, role: "ADMIN", grantedBy: "seed:pf18b" } });
  ok("PF-18b DW3 fail (review m3): the Admin's link to a colleague's file downloads, then is 404 once they are no longer Admin (the ticket is re-checked)", adminLink.status === 200 && adminBefore.status === 200 && adminAfter.status === 404, { link: adminLink.status, before: adminBefore.status, after: adminAfter.status });
  const mid = crypto.randomUUID();
  ok("PF-18b DW3 fail (database): a message naming a file in another ticket's folder is refused, even written by the owner role",
    refused(`insert into platform_support_message (id, firm_id, ticket_id, author_kind, author_id, body, file_keys) values ('${mid}', '${firmA}', '${idg}', 'FIRM_STAFF', '${as.CASE_OFFICER.id}', 'x', '{support/${id1}/1}')`, /outside its own ticket's folder/));

  // ---------------------------------------------------------------------------------------------------- DW4
  ok("PF-18b DW4 fail: the database refuses to edit, delete or truncate a message, and to delete a ticket or change its page",
    refused(`update platform_support_message set body = 'changed' where ticket_id = '${id1}'`, /never changed or deleted/) && refused(`delete from platform_support_message where ticket_id = '${id1}'`, /never changed or deleted/)
    && refused("truncate platform_support_message cascade", /never truncated/) && refused(`delete from platform_support_ticket where id = '${id1}'`, /never deleted/)
    && refused(`update platform_support_ticket set page = '/x' where id = '${id1}'`, /only a ticket's status changes/));
  const pr = await raise(as.CASE_OFFICER.token, { body: "Urgent (Sample).", page: "/cases", priority: "HIGH" });
  ok("PF-18b DW4 fail: a priority in the request is refused (422, named), and no ticket is made", pr.status === 422 && /no priority/.test(pr.body.fields?.priority) && !JSON.stringify(pr.body).includes('"id"'), pr.body);
  // Breaker m1 (Build Lead A's condition): no firm route writes a SUPPORT message: the author is the service's, never the request's.
  const forgeRaise = await raise(as.CASE_OFFICER.token, { body: "Forged (Sample).", page: "/cases", authorKind: "SUPPORT", authorId: "support" });
  const forgeMsg = await call("POST", `/tickets/${id1}/messages`, as.OWNER.token, { body: "Forged reply (Sample).", authorKind: "SUPPORT", authorId: "support" });
  const supportRows = Number(psql(`select count(*) from platform_support_message where author_kind = 'SUPPORT'`));
  ok("PF-18b break m1 fail: firm staff sending authorKind SUPPORT (on a raise and on a message) are refused (422, both fields named), and no SUPPORT message is written",
    forgeRaise.status === 422 && /not a field/.test(forgeRaise.body.fields?.authorKind) && /not a field/.test(forgeRaise.body.fields?.authorId)
    && forgeMsg.status === 422 && /not a field/.test(forgeMsg.body.fields?.authorKind) && supportRows === 0, { forgeRaise: [forgeRaise.status, forgeRaise.body.fields], forgeMsg: [forgeMsg.status, forgeMsg.body.fields], supportRows });
  const answers = [t1, mine, one, lo, ar, good].map((r) => JSON.stringify(r.body)).join(" ");
  const cols = psql("select string_agg(column_name, ',') from information_schema.columns where table_name like 'platform_support_%'");
  ok("PF-18b DW4 pass: no answer and no column carries a priority", !/priority/i.test(answers) && !/priority/i.test(cols), cols);

  // ---------------------------------------------------------------------------------------------------- DW5
  const rep = await db.$transaction((tx) => svc.replyAsSupport(tx, { ticketId: id1, body: "Please try again now (Sample)." }));
  const seen = await call("GET", `/tickets/${id1}`, as.CASE_OFFICER.token);
  ok("PF-18b DW5 pass: replyAsSupport sets \"Waiting on firm\", and the raiser reads our reply", rep.status === "WAITING_ON_FIRM" && seen.body.status === "WAITING_ON_FIRM" && seen.body.messages.at(-1).authorKind === "SUPPORT" && seen.body.messages.at(-1).authorId === "support", seen.body);
  const next = await call("POST", `/tickets/${id1}/messages`, as.CASE_OFFICER.token, { body: "It works now, thank you (Sample)." });
  ok("PF-18b DW5 pass: the firm's next message sets \"Waiting on support\"", next.status === 200 && next.body.status === "WAITING_ON_SUPPORT", next);
  let unknown = 0; try { await db.$transaction((tx) => svc.replyAsSupport(tx, { ticketId: crypto.randomUUID(), body: "x" })); } catch (e) { unknown = (e as { getStatus?: () => number }).getStatus?.() ?? -1; }
  let empty = 0; try { await db.$transaction((tx) => svc.replyAsSupport(tx, { ticketId: id1, body: "   " })); } catch (e) { empty = (e as { getStatus?: () => number }).getStatus?.() ?? -1; }
  psql(`update platform_support_ticket set status = 'CLOSED' where id = '${t2.body.id}'`);
  let closed = 0; try { await db.$transaction((tx) => svc.replyAsSupport(tx, { ticketId: t2.body.id, body: "x" })); } catch (e) { closed = (e as { getStatus?: () => number }).getStatus?.() ?? -1; }
  const closedMsg = await call("POST", `/tickets/${t2.body.id}/messages`, officer2.token, { body: "Still there?" });
  ok("PF-18b DW5 fail: a reply to no such ticket is 404, an empty one 422, and a closed ticket takes no message from either side (409)", unknown === 404 && empty === 422 && closed === 409 && closedMsg.status === 409, { unknown, empty, closed, closedMsg: closedMsg.status });

  // ---------------------------------------------------------------------------------------------------- DW6
  const sent = mail.sent.filter((m) => m.subject.includes(id1));
  const email = sent[0], words = email ? `${email.subject}\n${email.text}\n${email.html ?? ""}` : "";
  ok("PF-18b DW6 pass: one email to our support inbox naming the firm, the ticket and the page", sent.length === 1 && email.to === "support@expatready.example.com" && words.includes("sample-firm") && words.includes("/cases/abc/intake") && words.includes(id1), email);
  const withFiles = mail.sent.find((m) => m.subject.includes(idg));
  ok("PF-18b DW6: the email carries no body, no file and no contact value (the raiser's name or email)",
    !!email && !words.includes("intake form will not save") && !email.attachments?.length && !words.includes(as.CASE_OFFICER.email) && !words.includes(as.CASE_OFFICER.name) && !!withFiles && !withFiles.attachments?.length && !withFiles.text.includes("Screenshot"), words);
  mailFails = true;
  const quiet = await raise(as.CASE_OFFICER.token, { body: "Mail is down (Sample).", page: "/cases" });
  mailFails = false;
  ok("PF-18b DW6 fail→pass: a failed send leaves the ticket saved (201, emailed false, readable)", quiet.status === 201 && quiet.body.emailed === false && (await call("GET", `/tickets/${quiet.body.id}`, as.CASE_OFFICER.token)).status === 200, quiet.body);
  const ev = await db.moduleEvent.findFirst({ where: { subjectId: id1, type: EVENT.SUPPORT_TICKET_RAISED } });
  const line = await db.auditEvent.findFirst({ where: { entity: "platform_support_ticket", entityKey: id1, action: "support.ticket.raised" } });
  ok("PF-18b: the outbox has support.ticket_created with ids only, and the audit line names fields, never the body or page",
    !!ev && JSON.stringify(Object.keys(ev.payload as object).sort()) === JSON.stringify(["createdAt", "files", "firmId", "raisedBy", "ticketId", "type"]) && !!line && !JSON.stringify(line).includes("intake form") && !JSON.stringify(line).includes("/cases/abc"), { ev: ev?.payload, line: line?.summary });

  // ---------------------------------------------------------------------------------------------------- DW7
  const files = fakeFiles(), boom = { async record() { throw new Error("forced audit failure (PF-18b DW7)"); } };
  const broken = new SupportService({ db, files, audit: boom as never, mail: fakeMail() });
  const ctx = fakeStaff({ staffId: as.CASE_OFFICER.id, firmId: firmA, roles: ["CASE_OFFICER"], keys: ["agent/support-ticket:create", "agent/support-ticket:list"] });
  const t7 = await tickets();
  let why = ""; try { await broken.raise(ctx, { body: "Forced failure (Sample).", page: "/cases" }, [{ bytes: PDF, size: PDF.length, contentType: "application/pdf" }]); } catch (e) { why = String((e as Error).message); }
  ok("PF-18b DW7: a forced failure after the file is stored leaves no ticket; the stored file is left in place (reported in the PR: FilesPort.delete runs only after a record's commit, the cleanup is PF-F2's)",
    /forced audit failure/.test(why) && (await tickets()) === t7 && files.count === 1, { why, tickets: [t7, await tickets()], stored: files.count });
  const okRun = new SupportService({ db, files: fakeFiles(), audit: auditEvent, mail: fakeMail() });
  const fine = await okRun.raise(ctx, { body: "Same, no failure (Sample).", page: "/cases" }, [{ bytes: PDF, size: PDF.length, contentType: "application/pdf" }]);
  ok("PF-18b DW7 pass: the same raise with a working audit makes the ticket", !!fine.id && (await tickets()) === t7 + 1);
  // The migration (rows rev 16.7): measured right after its own migration, never assumed to be the newest.
  const at = folders.indexOf(OWN);
  ok("PF-18b DW7 (migration): its stamp is later than PF-18a's offices and every migration before it", at > 0 && folders.slice(0, at).every((f) => f < OWN) && OWN > "20261116190000_pf18a_offices", { at, before: folders[at - 1] });
  const diff = execFileSync(join(STUDIO, "node_modules", ".bin", "prisma"), ["migrate", "diff", "--from-config-datasource", "--to-schema", join(STUDIO, "prisma", "schema"), "--script"], { cwd: STUDIO, encoding: "utf8", env: { ...process.env }, stdio: ["ignore", "pipe", "ignore"] });
  ok("PF-18b DW7 (migration): migrate diff has nothing for the support tables or types (main's own drift is PF-8r's NOTE)", !/platform_support|PlatformSupport/.test(diff), diff.split("\n").filter((l) => /platform_support|PlatformSupport/.test(l)));
  const walls = psql(`select string_agg(c.relname || ':' || c.relrowsecurity || c.relforcerowsecurity || ':' || (select count(*) from pg_policy p where p.polrelid = c.oid), ',' order by c.relname) from pg_class c where c.relname like 'platform_support_%' and c.relkind = 'r'`);
  ok("PF-18b (PF-12): both tables are walled (row-level security on and forced, one policy each)", walls === "platform_support_message:truetrue:1,platform_support_ticket:truetrue:1", walls);
  const raiserB = crypto.randomUUID();
  ok("PF-18b fail (database): a ticket raised by firm B's staff under firm A is refused", refused(`insert into platform_support_ticket (id, firm_id, raised_by, page, updated_at) values ('${raiserB}', '${firmA}', '${ownerB.id}', '/cases', now())`, /not staff of this firm/));

  // ---------------------------------------------------------------------------------------------------- the breaker's
  // M1: a character Node reads as text that the database's platform_support_has_text does not (U+20C1, Unicode 17's
  // Saudi Riyal sign; PostgreSQL 18 is at Unicode 16): a 422 named at the body, before any file is stored or row written.
  const tM1 = await tickets(), fM1 = filesStored();
  const odd = await raise(as.CASE_OFFICER.token, { body: "\u20c1", page: "/cases" }, [{ bytes: PDF, type: "application/pdf" }, { bytes: PDF, type: "application/pdf" }]);
  const oddMsg = await call("POST", `/tickets/${idg}/messages`, as.CASE_OFFICER.token, { body: "\u20c1" });
  let oddReply = 0; try { await db.$transaction((tx) => svc.replyAsSupport(tx, { ticketId: idg, body: "\u20c1" })); } catch (e) { oddReply = (e as { getStatus?: () => number }).getStatus?.() ?? -1; }
  ok("PF-18b break M1 fail: a body the database does not read as text is a 422 at the body (raise, message, reply), never a 500, and nothing is stored or made",
    odd.status === 422 && /letters, digits or punctuation/.test(odd.body.fields?.body) && oddMsg.status === 422 && oddReply === 422 && (await tickets()) === tM1 && filesStored() === fM1, { odd: [odd.status, odd.body.fields], oddMsg: oddMsg.status, oddReply, tickets: [tM1, await tickets()], files: [fM1, filesStored()] });
  // m3: an app path only.
  const pages = await Promise.all(["//evil.example.com/login", "/\\evil.example.com", "/clients/jane@client.example.com/intake", "/x\u202egnp.exe", "/x\u200b"].map((page) => raise(as.CASE_OFFICER.token, { body: "Path check (Sample).", page })));
  const fine3 = await raise(as.CASE_OFFICER.token, { body: "Path check (Sample).", page: "/cases/abc-1_2.3~x%20y" });
  ok("PF-18b break m3 fail→pass: another site, a backslash, an email, a direction override and an invisible mark are refused as pages; a plain app path passes",
    pages.every((r) => r.status === 422 && /an app path/.test(r.body.fields?.page)) && fine3.status === 201, pages.map((r) => r.status));
  ok("PF-18b break m3 (database): the page CHECK refuses another site and an email too", refused(`insert into platform_support_ticket (id, firm_id, raised_by, page, updated_at) values ('${crypto.randomUUID()}', '${firmA}', '${as.CASE_OFFICER.id}', '//evil.example.com', now())`, /platform_support_ticket_page/)
    && refused(`insert into platform_support_ticket (id, firm_id, raised_by, page, updated_at) values ('${crypto.randomUUID()}', '${firmA}', '${as.CASE_OFFICER.id}', '/a@b.example.com', now())`, /platform_support_ticket_page/));
  // m4: the limit counts characters, as the database does.
  const emoji = await raise(as.CASE_OFFICER.token, { body: "\u{1F600}".repeat(3000), page: "/cases" });
  const over = await raise(as.CASE_OFFICER.token, { body: "a".repeat(5001), page: "/cases" });
  ok("PF-18b break m4 pass/fail: 3,000 emoji (3,000 characters) are accepted; 5,001 characters are refused", emoji.status === 201 && over.status === 422 && /at most 5000/.test(over.body.fields?.body), { emoji: emoji.status, over: over.status });
  // m5: a field named after a built-in property is named in the answer.
  const proto = await raise(as.CASE_OFFICER.token, { body: "x (Sample).", page: "/cases", toString: "1" });
  ok("PF-18b break m5 fail: a field named toString is refused and named", proto.status === 422 && proto.body.fields?.toString === "not a field of a support ticket", proto.body);
  // m2: closed is final in the database too.
  ok("PF-18b break m2 fail (database): a closed ticket does not reopen, and takes no message, even from the owner role",
    refused(`update platform_support_ticket set status = 'OPEN' where id = '${t2.body.id}'`, /closed ticket never changes/)
    && refused(`insert into platform_support_message (id, firm_id, ticket_id, author_kind, author_id, body) values ('${crypto.randomUUID()}', '${firmA}', '${t2.body.id}', 'FIRM_STAFF', '${officer2.id}', 'x')`, /closed ticket takes no message/)
    && refused(`update platform_support_ticket set updated_at = '1999-01-01' where id = '${id1}'`, /never goes back/));
  // m9: the database's file-key rule is the app's: 1 to 3, each once.
  ok("PF-18b break m9 fail (database): a fourth file number and a repeated key are refused",
    refused(`insert into platform_support_message (id, firm_id, ticket_id, author_kind, author_id, body, file_keys) values ('${crypto.randomUUID()}', '${firmA}', '${idg}', 'FIRM_STAFF', '${as.CASE_OFFICER.id}', 'x', '{support/${idg}/4}')`, /outside its own ticket's folder/)
    && refused(`insert into platform_support_message (id, firm_id, ticket_id, author_kind, author_id, body, file_keys) values ('${crypto.randomUUID()}', '${firmA}', '${idg}', 'FIRM_STAFF', '${as.CASE_OFFICER.id}', 'x', '{support/${idg}/1,support/${idg}/1}')`, /distinct keys/));
} finally {
  for (const a of apps) await a.close().catch(() => undefined);
  await db.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
  rmSync(FILES, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
