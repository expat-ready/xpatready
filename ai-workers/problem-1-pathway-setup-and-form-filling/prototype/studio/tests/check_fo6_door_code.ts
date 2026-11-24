// FO-6 part 4a (BACKLOG row FO-6; note product/screens/FO-6-4/note.md rules 1, 5, 6; P-564; Lead 24 on #3433): the
// pieces of the public signing door that come before its routes, each with a pass and a fail, on one scratch database
// (every migration, PF-3's and FO-1a's Sample seeds), dropped at the end:
//   S  Send emails the client one "Please sign" link (firm-first token whose sha256 is the client signer's; the firm
//      signer gets none; Reply-To the firm); a Send that does not commit emails nothing; a failing email leaves the send.
//   K  The firm's email-code setting (front_office.signing_email_code): on by default, a firm may switch it off.
//   C  The one-time code (signing/door-code.ts): sent once, not again unless asked, at most once a minute; single use;
//      the sixth wrong code locks 15 minutes and then even the right code is refused; a code asked after the lock starts
//      the count again; one audit line per change, never the code.
// Fake adapter, fake mail, an injected clock: no vendor call, no network, no model call (US$0). Sample values.
//   tsx studio/tests/check_fo6_door_code.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { AuditPort } from "../ports/audit.ts";
import { fakeMail } from "../ports/mail.ts";
import { LocalFiles } from "../api/src/front-office/files.ts";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { buildDocx } from "../api/src/front-office/retainers/docx.ts";
import { Retainers } from "../api/src/front-office/retainers/service.ts";
import { Leads } from "../api/src/front-office/sales/leads.ts";
import { Prospects } from "../api/src/front-office/sales/prospects.ts";
import { askCode, checkCode, codeOf, CODE_TRIES, type CodeLine } from "../api/src/front-office/signing/door-code.ts";
import { emailCodeOn, SIGNING_EMAIL_CODE } from "../api/src/front-office/signing/email-code.ts";
import { useSigningMail, useSigningPort } from "../api/src/front-office/signing/handlers.ts";
import { signingPublicBase } from "../api/src/front-office/signing/link-mail.ts";
import { fakeSigning } from "../api/src/front-office/signing/port.ts";
import { auditEvent, platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";
import { dutiesOf, type StaffContext } from "../api/src/platform/identity/keys.ts";
import { ConsentStore } from "../api/src/platform/messages/consent/consent-store.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../api/src/platform/settings.ts";
import { clearingConflicts } from "./lib/conflict-clear.ts";

type Tx = Prisma.TransactionClient;
const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo6code_${process.pid}`, URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;
const WORK = join(STUDIO, "var", `fo6code-check-${process.pid}`);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const sql = (q: string) => execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8" }).trim();

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_, options: "-c TimeZone=UTC" }) });
try {
  for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
  await seedSampleFirms(db);   // syncs the registered setting definitions, ours among them (imported above)
  const fo = await seedSampleFirmsFrontOffice(db);
  ok("FO-6 4a setup: the Sample firms have their pipelines", fo.failed.length === 0);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  const [rid, rFirm] = sql(`select id || '|' || firm_id from platform_staff where actor_id = 'user-R'`).split("|");
  const roles = sql(`select string_agg(role::text, ',') from platform_role_grant where staff_id = '${rid}'`).split(",");
  const keys = sql(`select string_agg(distinct permission_key, ',') from platform_role_permission where role::text = any(string_to_array('${roles.join(",")}', ','))`).split(",");
  const R: StaffContext = { staffId: rid, firmId: rFirm, firmKey: "sample-firm", roles, keys, duties: dutiesOf(new Set(keys)), authTime: 0, via: "local" };
  const ws = await platformAuditWorkspaceId(db as never);
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "system:test", workspaceId: ws });

  const signing = fakeSigning(), mail = fakeMail();
  useSigningPort(signing); useSigningMail(mail);
  const files = new LocalFiles(join(WORK, "files")), clock = { now: () => Date.now() };
  const svc = new Retainers(db, files, clock);
  clearingConflicts(db, { retainers: Retainers.prototype, prospects: Prospects.prototype });
  const salesPorts = { audit: auditEvent, consent: new ConsentStore(auditEvent), publicOrigin: "http://localhost:4400" };
  const leads = new Leads(db, salesPorts), pros = new Prospects(db, salesPorts);
  const tpl = await svc.uploadTemplate(R, { name: "FO-6 part 4a retainer (Sample)" }, { bytes: buildDocx(["Client {client.name}", "{#fees}", "{label}: {amount}", "{/fees}"]), size: 1000 });
  let n = 0;
  const prospect = async (given: string) => {
    const email = `${given.toLowerCase()}${++n}.fo6code@example.com`;
    const l = (await leads.add(R, { requestId: randomUUID(), givenNames: given, familyName: "Sample", email, source: "Phone call" })) as { id: string; person: { id: string } };
    const p = await pros.engage(R, l.id);
    return { id: p.id, personId: l.person.id, email };
  };
  const draft = async (p: { id: string }) => (await svc.draft(R, p.id, { templateId: tpl.id, fees: [{ label: "Deposit on signing", amountMinor: 150000, when: "ON_SIGNING" }] })).id;
  const reqOf = (r: string) => sql(`select coalesce((select id::text from fo_signature_request where document_id = '${r}' order by sent_at desc limit 1), '')`);
  const LINK = /\/sign\/([0-9a-f]{32}\.[A-Za-z0-9_-]{43})(\s|$)/;

  // ------------------------------------------------------------- S: Send emails the client's link
  const p1 = await prospect("Ana"), r1 = await draft(p1), m0 = mail.sent.length;
  await svc.send(R, r1, { expectedVersion: 1 });
  const q1 = reqOf(r1), mails = mail.sent.slice(m0), toClient = mails.filter((m) => m.to === p1.email.toLowerCase()), token = toClient[0]?.text.match(LINK)?.[1] ?? "";
  ok("FO-6 4a S pass: Send emails the client exactly one \"Please sign\" email (templateKey signing.please_sign, Reply-To the firm's contact address) and no one else",
    mails.length === 1 && toClient.length === 1 && toClient[0].templateKey === "signing.please_sign" && /^Please sign your retainer agreement with /.test(toClient[0].subject)
      && toClient[0].replyTo === sql(`select contact_email from platform_firm where id = '${A}'`), mails.map((m) => ({ to: m.to, subject: m.subject })));
  ok("FO-6 4a S pass: the link is <public base>/sign/<firm-first token> and the token's sha256 is the client signer's",
    !!token && toClient[0].text.includes(`${signingPublicBase()}/sign/${token}`) && token.startsWith(A.replace(/-/g, "")) && sql(`select count(*) from fo_signer where request_id = '${q1}' and role = 'CLIENT' and link_token_sha256 = '${sha(token)}'`) === "1", toClient[0]?.text);
  ok("FO-6 4a S fail: the firm signer's token is not the client's, and no signing table holds the token in clear",
    sql(`select count(*) from fo_signer where request_id = '${q1}' and role = 'FIRM' and link_token_sha256 <> '${sha(token)}'`) === "1"
      && sql(`select count(*) from (select to_jsonb(s)::text t from fo_signer s union all select to_jsonb(r)::text from fo_signature_request r) x where x.t like '%${token.split(".")[1] ?? "none"}%'`) === "0");
  const failingOn = (action: string): AuditPort<Tx> => ({ record: async (tx, e) => { if (e.action === action) throw new Error(`forced failure on ${action}`); return auditEvent.record(tx, e); } } as AuditPort<Tx>);
  const p2 = await prospect("Bea"), r2 = await draft(p2), m2 = mail.sent.length;
  const broken = await new Retainers(db, files, clock, failingOn("signing.request_sent")).send(R, r2, { expectedVersion: 1 }).then(() => "sent", () => "refused");
  ok("FO-6 4a S fail: a Send whose transaction does not commit emails nothing (no link to a request that does not exist)", broken === "refused" && mail.sent.length === m2 && reqOf(r2) === "", { broken, mails: mail.sent.length - m2 });
  // Review m1: a failure after record() (the retainer.sent event, written last in Send's transaction) emails nothing either.
  sql(`create function fo6code_fail_event() returns trigger language plpgsql as $$ begin raise exception 'forced failure on the event'; end $$;
    create trigger fo6code_fail_event before insert on module_event for each row when (new.type = 'retainer.sent') execute function fo6code_fail_event()`);
  const p2b = await prospect("Bo"), r2b = await draft(p2b), m2b = mail.sent.length;
  const afterRecord = await svc.send(R, r2b, { expectedVersion: 1 }).then(() => "sent", () => "refused");
  sql(`drop trigger fo6code_fail_event on module_event; drop function fo6code_fail_event()`);
  ok("FO-6 4a S fail: a failure after the request is recorded (its event, last in the transaction) emails nothing and leaves no request", afterRecord === "refused" && mail.sent.length === m2b && reqOf(r2b) === "", { afterRecord, mails: mail.sent.length - m2b });
  const p3 = await prospect("Cal"), r3 = await draft(p3), down = fakeMail({ failOn: () => true });
  useSigningMail(down);
  const sent3 = await svc.send(R, r3, { expectedVersion: 1 }).then(() => true, () => false);
  useSigningMail(mail);
  ok("FO-6 4a S pass: a failing email does not undo the Send (logged; the request stands)", sent3 && reqOf(r3) !== "" && sql(`select status from fo_retainer where id = '${r3}'`) === "SENT");

  // ------------------------------------------------------------- K: the firm's email-code setting
  ok("FO-6 4a K pass: the setting is registered for the front office, changed with agent/legal-settings:manage, on by default", SIGNING_EMAIL_CODE.key === "front_office.signing_email_code" && SIGNING_EMAIL_CODE.default === true
    && SIGNING_EMAIL_CODE.changePermission === "agent/legal-settings:manage" && (await emailCodeOn(db, A)) === true && (await emailCodeOn(db, B)) === true);
  await writeSetting(db, { firmId: B, key: SIGNING_EMAIL_CODE.key, value: false, by: "system:test", workspaceId: ws });
  ok("FO-6 4a K pass: a firm may switch it off; the other firm keeps the default", (await emailCodeOn(db, B)) === false && (await emailCodeOn(db, A)) === true);
  const bad = await writeSetting(db, { firmId: A, key: SIGNING_EMAIL_CODE.key, value: "no", by: "system:test", workspaceId: ws }).then(() => "written", () => "refused");
  ok("FO-6 4a K fail: a value that is not true or false is refused", bad === "refused" && (await emailCodeOn(db, A)) === true);

  // ------------------------------------------------------------- C: the one-time code
  const signer = sql(`select id from fo_signer where request_id = '${q1}' and role = 'CLIENT'`);
  let t = Date.parse("2026-11-24T10:00:00Z");
  const at = () => new Date(t), mins = (m: number) => { t += m * 60_000; };
  const lines: string[] = [];
  const line: CodeLine = async (tx, summary, after) => { lines.push(summary); await auditEvent.record(tx, { firmId: A, actor: "system:test-door", action: "signing.code", entity: "fo_signer", entityKey: signer, summary, detail: { signerId: signer }, before: null, after }); };
  const run = <T>(f: (tx: Tx) => Promise<T>) => db.$transaction((tx) => f(tx));   // door-code takes the request's lock itself (review m2)
  const ask = (resend?: boolean) => run((tx) => askCode(tx, A, signer, at(), { resend, line }));
  const check = (c: string) => run((tx) => checkCode(tx, A, signer, c, at(), { line }));
  ok("FO-6 4a C: codeOf takes exactly 6 digits (trimmed) and nothing else", codeOf(" 012345 ") === "012345" && [undefined, 12345, "12345", "1234567", "12a456", ""].every((x) => codeOf(x) === null));
  const a1 = await ask();
  const code1 = a1.verdict === "SENT" ? a1.code : "";
  ok("FO-6 4a C pass: the first ask sends a 6-digit code; only its sha256 is stored, with a 10-minute expiry",
    /^\d{6}$/.test(code1) && sql(`select count(*) from fo_signer where id = '${signer}' and code_sha256 = '${sha(code1)}' and code_expires_at = '${new Date(t + 600_000).toISOString()}'::timestamptz`) === "1");
  const a2 = await ask();
  mins(0.5); const a3 = await ask(true);
  ok("FO-6 4a C fail: asking again sends nothing while that code is live (ALREADY_SENT), and a resend within the minute is TOO_SOON", a2.verdict === "ALREADY_SENT" && a3.verdict === "TOO_SOON" && sql(`select code_sha256 from fo_signer where id = '${signer}'`) === sha(code1));
  const wrongCode = code1 === "000000" ? "111111" : "000000", wrong: string[] = [];
  for (let i = 0; i < CODE_TRIES; i++) wrong.push(await check(wrongCode));
  ok("FO-6 4a C fail: five wrong codes are WRONG and the sixth locks the link for 15 minutes", wrong.slice(0, 5).every((v) => v === "WRONG") && wrong[5] === "LOCKED"
    && sql(`select code_failures || '|' || (abs(extract(epoch from locked_until - '${new Date(t + 15 * 60_000).toISOString()}'::timestamptz)) < 1) from fo_signer where id = '${signer}'`) === "6|true", wrong);
  const lockedRight = await check(code1), lockedAsk = await ask(true);
  ok("FO-6 4a C fail: while locked even the right code is refused (LOCKED, not counted) and no new code is sent", lockedRight === "LOCKED" && lockedAsk.verdict === "LOCKED" && sql(`select code_verified_at is null from fo_signer where id = '${signer}'`) === "t");
  mins(15);
  const a4 = await ask();
  const code2 = a4.verdict === "SENT" ? a4.code : "";
  ok("FO-6 4a C pass: after the lock ends a new code is sent and the count starts again", !!code2 && sql(`select code_failures || '|' || coalesce(locked_until::text, 'none') from fo_signer where id = '${signer}'`) === "0|none");
  const old = await check(code1);
  ok("FO-6 4a C fail: the earlier code no longer works (only the newest code counts)", old === "WRONG", old);
  const right = await check(code2), reuse = await check(code2);
  ok("FO-6 4a C pass: the right code is OK once (code_verified_at set, the count cleared); the same code again is spent (EXPIRED)",
    right === "OK" && reuse === "EXPIRED" && sql(`select (code_verified_at = '${at().toISOString()}'::timestamptz) from fo_signer where id = '${signer}'`) === "t", { right, reuse });
  const p4 = await prospect("Dov"), r4 = await draft(p4); await svc.send(R, r4, { expectedVersion: 1 });
  const s4 = sql(`select id from fo_signer where request_id = '${reqOf(r4)}' and role = 'CLIENT'`), q4 = reqOf(r4);
  const a5 = await db.$transaction((tx) => askCode(tx, A, s4, at(), { line }));
  mins(11);
  const late = await db.$transaction((tx) => checkCode(tx, A, s4, a5.verdict === "SENT" ? a5.code : "x", at(), { line }));
  ok("FO-6 4a C fail: a code past its 10 minutes is EXPIRED and counted", late === "EXPIRED" && sql(`select code_failures from fo_signer where id = '${s4}'`) === "1", late);
  // Review m2: two checks of one right code at once: one OK, the other spent (the request's lock queues them).
  const p5 = await prospect("Eli"), r5 = await draft(p5); await svc.send(R, r5, { expectedVersion: 1 });
  const s5 = sql(`select id from fo_signer where request_id = '${reqOf(r5)}' and role = 'CLIENT'`);
  const a6 = await db.$transaction((tx) => askCode(tx, A, s5, at(), { line })), c6 = a6.verdict === "SENT" ? a6.code : "x";
  const both = await Promise.all([db.$transaction((tx) => checkCode(tx, A, s5, c6, at(), { line })), db.$transaction((tx) => checkCode(tx, A, s5, c6, at(), { line }))]);
  ok("FO-6 4a C fail: the same right code checked twice at once is OK once and spent once (the lock is door-code's own)", both.filter((v) => v === "OK").length === 1 && both.filter((v) => v === "EXPIRED").length === 1, both);
  const audit = sql(`select count(*) || '|' || count(*) filter (where to_jsonb(a)::text like '%${code1}%' or to_jsonb(a)::text like '%${code2}%') from audit_event a where action = 'signing.code'`);
  ok("FO-6 4a C pass: every change wrote one audit line in its transaction and none holds a code", Number(audit.split("|")[0]) === lines.length && audit.split("|")[1] === "0", { audit, lines: lines.length });
} finally {
  await db.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
