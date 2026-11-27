// PF-4c part 2 (BACKLOG PF-4c; AG-1-34 the licence-number typo check; AG1-D19 no validity, expiry or register look-up;
// SA6-D9 no permission reads a licence; AG-1-31 a licence number is never logged): PUT /api/platform/staff/:id/credential
// answers a warning when the number does not match the format the country pack holds for that licensing body, and
// always saves. A pass and a fail per Done when line (brief design/lead-b-briefs/PF-4c.md, part 2, DW6):
//   DW6a a number that does not match the body's pattern → saved, with the warning · a matching one → saved, no warning ·
//        a body with no pattern → saved, no warning · a body the pack does not know → saved, no warning
//   DW6b the number in no log line, no audit line and no answer other than the saved record's own read; the warning
//        names the body, never the number
//   DW6c the pack's patterns: every numberPattern carries its source (url, page, quote, date) and compiles; a pattern
//        without a source, one that does not compile, or one with a nested repeat (review m1) stops the pack loading
// The committed pack now holds the College's pattern (read at college-ic.ca 23 Nov 2026, R1.92); the route cases still give one body a
// TEST-ONLY pattern in memory ("R" and 6 digits, marked Sample, never written to the file).
// A scratch database (every migration, the Sample firms) and a Nest app of PF-4's classes with the local stand-in, a test
// clock and the fake MailPort. No server, no browser, no model call (US$0). The database is dropped.
//   tsx studio/tests/check_pf4c_licence_format.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fakeMail } from "../ports/mail.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf4c2_${process.pid}`, urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const call = async (base: string, method: string, path: string, o: { token?: string; body?: unknown } = {}) => {
  const r = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", ...(o.token ? { authorization: `Bearer ${o.token}` } : {}) }, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await r.text(); let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body, text };
};
/** Everything the process writes while `fn` runs (stdout and stderr): the log lines a licence number must never reach. */
const captured = async <T>(fn: () => Promise<T>) => {
  const lines: string[] = [], out = process.stdout.write.bind(process.stdout), err = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((c: string | Uint8Array, ...a: unknown[]) => { lines.push(String(c)); return out(c as never, ...(a as [])); }) as typeof process.stdout.write;
  process.stderr.write = ((c: string | Uint8Array, ...a: unknown[]) => { lines.push(String(c)); return err(c as never, ...(a as [])); }) as typeof process.stderr.write;
  try { return { value: await fn(), log: lines.join("") }; } finally { process.stdout.write = out; process.stderr.write = err; }
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
const { MAIL_PORT } = await import("../api/src/platform/identity/session/mail.ts");
const { LICENSING_BODIES, BODIES_FILE, bodiesOf, bodyNamed, licenceWarning } = await import("../api/src/platform/identity/licence-format.ts");

// ------------------------------------------------------------------------------------- DW6c: the pack's patterns
const pack = JSON.parse(readFileSync(BODIES_FILE, "utf8"));
ok("PF-4c DW6c pass: the committed pack loads; every body with a numberPattern carries url, page, quote and date and its pattern compiles",
  LICENSING_BODIES.length === pack.bodies.length && LICENSING_BODIES.every((b) => !b.numberPattern || (b.source && b.source.url && b.source.page && b.source.quote && b.source.date && (() => { try { new RegExp(b.numberPattern!, "u"); return true; } catch { return false; } })())),
  LICENSING_BODIES.filter((b) => b.numberPattern).map((b) => [b.name, b.source]));
const throws = (raw: unknown) => { try { bodiesOf(raw); return null; } catch (e) { return (e as Error).message; } };
const unsourced = throws({ bodies: [{ name: "Test body", kind: "TEST", numberPattern: "R\\d{6}" }] });
const halfSourced = throws({ bodies: [{ name: "Test body", kind: "TEST", numberPattern: "R\\d{6}", source: { url: "https://example.org", page: "Register", quote: "" , date: "2026-11-22" } }] });
const broken = throws({ bodies: [{ name: "Test body", kind: "TEST", numberPattern: "R(\\d{6", source: { url: "https://example.org", page: "Register", quote: "a quote", date: "2026-11-22" } }] });
const nested = ["(a+)+", "R(\\d+)*", "(R\\d{1,})+"].map((pat) => throws({ bodies: [{ name: "Test body", kind: "TEST", numberPattern: pat, source: { url: "https://example.org", page: "Register", quote: "a quote", date: "2026-11-22" } }] }));
const flat = ["R\\d{6}", "(R|Q)\\d{6}", "[A-Z]{2}-\\d{4,6}"].map((pat) => throws({ bodies: [{ name: "Test body", kind: "TEST", numberPattern: pat, source: { url: "https://example.org", page: "Register", quote: "a quote", date: "2026-11-22" } }] }));
ok("PF-4c review m1 fail: a pattern repeating a group that already repeats ((a+)+, R(\\d+)*, (R\\d{1,})+) stops the pack loading; flat patterns (R\\d{6}, (R|Q)\\d{6}, [A-Z]{2}-\\d{4,6}) load",
  nested.every((m) => /repeats a group/.test(m ?? "")) && flat.every((m) => m === null), { nested, flat });
const sourced = throws({ bodies: [{ name: "Test body", kind: "TEST", numberPattern: "R\\d{6}", source: { url: "https://example.org", page: "Register", quote: "a quote", date: "2026-11-22" } }] });
ok("PF-4c DW6c fail: a pattern with no source, a source with an empty quote, or a pattern that does not compile stops the pack loading, naming the body; a sourced one loads",
  /Test body/.test(unsourced ?? "") && /Test body/.test(halfSourced ?? "") && /Test body/.test(broken ?? "") && sourced === null, { unsourced, halfSourced, broken, sourced });

// ---------------------------------------------------------------------- DW6a (the function): pattern, no pattern
const TEST_BODY = { name: "Test College", kind: "TEST", numberPattern: "R\\d{6}", source: { url: "https://example.org", page: "Sample", quote: "Sample", date: "2026-11-22" } };
ok("PF-4c DW6a pass: licenceWarning — a matching number gives no warning (the whole number must match: 'R123456')", licenceWarning(TEST_BODY, "R123456") === null);
ok("PF-4c DW6a fail: licenceWarning — a mismatch gives the plain warning naming the body and never the number ('R12345', 'xR123456', 'R1234567')",
  ["R12345", "xR123456", "R1234567"].every((n) => licenceWarning(TEST_BODY, n) === "This doesn't look like a Test College licence number. Check it."));
ok("PF-4c DW6a pass: licenceWarning — no body, or a body with no pattern, gives no warning", licenceWarning(undefined, "anything") === null && licenceWarning({ name: "No pattern", kind: "X" }, "anything") === null);
ok("PF-4c pass: bodyNamed finds a body by its name in any letter case and spacing, and by the College's or the Chambre's kind; a law society is found only by its name",
  bodyNamed("  college of immigration and citizenship consultants ")?.kind === "CICC" && bodyNamed("CICC")?.kind === "CICC" && bodyNamed("cnq")?.kind === "CNQ"
  && bodyNamed("LAW_SOCIETY") === undefined && bodyNamed("Law Society of Ontario")?.kind === "LAW_SOCIETY" && bodyNamed("Some other body") === undefined);

// ---------------------------------------------- DW6c, the committed College pattern (PF-4c part 2 data, 23 Nov, R1.92)
// Read at the College's own page (college-ic.ca, "Working with an immigration consultant", tab "Other items to note", last
// modified 22 Mar 2024, read 23 Nov 2026): "licence number (begins with the letter 'R' and is followed by 6 numbers. For
// example: R123456)". Every other body: no pattern (the Chambre's and the law societies' pages publish none that a lane read).
const cicc = LICENSING_BODIES.find((b) => b.kind === "CICC");
ok("PF-4c DW6c (data): the committed pack gives the College the pattern its own page states (R and 6 numbers), sourced from college-ic.ca with the page's words; no other body has one",
  cicc?.numberPattern === "R[0-9]{6}" && /^https:\/\/college-ic\.ca\//.test(cicc.source?.url ?? "") && /begins with the letter .R. and is followed by 6 numbers/.test(cicc.source?.quote ?? "") && /^\d{4}-\d{2}-\d{2}$/.test(cicc.source?.date ?? "")
    && LICENSING_BODIES.filter((b) => b.numberPattern).length === 1, LICENSING_BODIES.filter((b) => b.numberPattern).map((b) => b.name));
ok("PF-4c DW6c (data) pass: the College's own example R123456 gives no warning, by its name and by CICC", licenceWarning(bodyNamed("College of Immigration and Citizenship Consultants"), "R123456") === null && licenceWarning(bodyNamed("CICC"), "R123456") === null);
ok("PF-4c DW6c (data) fail: a College number in another shape is warned, never the number in the words ('X-12', 'R12345', '123456', 'R1234567')",
  ["X-12", "R12345", "123456", "R1234567"].every((n) => licenceWarning(cicc, n) === "This doesn't look like a College of Immigration and Citizenship Consultants licence number. Check it."));

// ------------------------------------------------------------------------------------- DW6a, DW6b over the route
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const clock = new (class extends PlatformClock { t = Date.now(); override now() { return this.t; } })();
const local = new LocalIdentity("pf4c2-check-signing-key-0123456789abcdef", () => clock.now());
const mail = fakeMail();
const college = LICENSING_BODIES.find((b) => b.kind === "CICC")!;
const saved = { numberPattern: college.numberPattern, source: college.source };
let app: { close(): Promise<void> } | null = null;
try {
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard }, { provide: MAIL_PORT, useValue: mail }];
  @Module({ controllers: [PlatformIdentityController] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false }); await nest.listen(0, "127.0.0.1"); app = nest;
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;
  await seedSampleFirms(db);
  const signIn = async (actorId: string) => (await call(base, "POST", "/api/platform/session/local", { body: { firmKey: "sample-firm", actorId, secondStep: true } })).body.token as string;
  const tR = await signIn("user-R"), O = sql(`select id from platform_staff where actor_id = 'user-O'`);
  const put = (number: string, body = college.name) => call(base, "PUT", `/api/platform/staff/${O}/credential`, { token: tR, body: { representativeType: "College member (CICC)", licensingBody: body, licenceNumber: number } });
  const stored = () => sql(`select licence_number from platform_staff_credential where staff_id = '${O}'`);

  // TEST-ONLY: the College gets a Sample pattern in memory; the committed pack holds none (see the header).
  college.numberPattern = "R\\d{6}"; college.source = { url: "https://example.org/test-only", page: "Sample (test only)", quote: "Sample (test only)", date: "2026-11-22" };
  const MISMATCH = "Q98-7654", MATCH = "R246813";
  const bad = await captured(() => put(MISMATCH));
  ok("PF-4c DW6a fail: a number that does not match the body's pattern → 200, saved, with the warning \"This doesn't look like a … licence number. Check it.\"; the record holds the number",
    bad.value.status === 200 && bad.value.body.saved === true && bad.value.body.warning === `This doesn't look like a ${college.name} licence number. Check it.` && stored() === MISMATCH, bad.value.body);
  const good = await captured(() => put(MATCH));
  ok("PF-4c DW6a pass: a matching number → 200, saved, no warning", good.value.status === 200 && good.value.body.saved === true && !("warning" in good.value.body) && stored() === MATCH, good.value.body);
  const byKind = await put(MISMATCH, "CICC");
  ok("PF-4c DW6a fail: the body given by its kind (CICC) is checked the same way → saved, with the warning", byKind.status === 200 && typeof byKind.body.warning === "string" && stored() === MISMATCH, byKind.body);
  const noPattern = await put("anything at all 123", "Law Society of Ontario");
  ok("PF-4c DW6a pass: a body with no pattern → saved, no warning", noPattern.status === 200 && noPattern.body.saved === true && !("warning" in noPattern.body) && stored() === "anything at all 123", noPattern.body);
  const unknownBody = await put("Z-1", "A body the pack does not know");
  ok("PF-4c DW6a pass: a body the pack does not know → saved, no warning (never a refusal)", unknownBody.status === 200 && !("warning" in unknownBody.body) && stored() === "Z-1", unknownBody.body);

  // DW6b: the number in no log line, audit line or answer (the saved record's own read is the only place it is shown).
  const audit = sql(`select coalesce(string_agg(a::text, ' '), '') from audit_event a where action = 'platform.staff.credential_saved'`);
  const outbox = sql(`select coalesce(string_agg(m::text, ' '), '') from msg_outbox m`);
  const answers = [bad.value.text, good.value.text, byKind.text];
  ok("PF-4c DW6b fail: neither number appears in any log line written while saving, in any audit line, in the outbox or in an email",
    ![MISMATCH, MATCH].some((n) => bad.log.includes(n) || good.log.includes(n) || audit.includes(n) || outbox.includes(n) || mail.sent.some((m) => JSON.stringify(m).includes(n))) && audit.length > 0,
    { inLog: [bad.log.includes(MISMATCH), good.log.includes(MATCH)], inAudit: [audit.includes(MISMATCH), audit.includes(MATCH)] });
  ok("PF-4c DW6b fail: the save's answer (and its warning) never carries the number", answers.every((t, i) => !t.includes(i === 1 ? MATCH : MISMATCH)), answers);
  ok("PF-4c DW6b pass: the saved record holds the last number saved (its own read is where it shows)", stored() === "Z-1");
} finally {
  college.numberPattern = saved.numberPattern; college.source = saved.source;
  await app?.close().catch(() => {});
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for prune-test-dbs.sh */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
