// PF-23: logs nobody can read personal data from, metrics and alarms (NFR5-14; Doc-1 §8.4; SA-8-27; SA-11-37, BR-2,
// BR-5, BR-16). Each line of the row's Done when has a pass and a fail.
// Part 1, no server: redaction by field name and by pattern; the JSON logger, Nest's own messages and console calls;
// a small Nest app hooked like main.ts (request lines, X-Request-Id, firm from the request's StaffContext, an error
// thrown with personal data); a job that fails with personal data; metric lines as embedded metric format; alerts
// (an audit write failing after its retries raises one, a second within 5 min none; stuck jobs; legal clocks);
// AlertPort's fake; the "no personal data in logs" scanner failing on a planted leaking line.
// PF-23r (Part 1c and the end of Part 2): the redaction budget and "[shared]", id fields refused in alerts, frames only
// for a stack whose message spans lines, time ranges and "Cookie sid=…", PostgreSQL DETAIL and Prisma meta stripped
// (a refused insert of a seeded name logs and answers without the name).
// Part 2, an isolated copy: the hooked server's api.log (correlation id kept or made, one line per request, no
// personal value from a request), /api/health/live and /ready, ready 503 with its database down and 200 back.
// US$0, no model call.
//   zsh studio/tools/isolated.sh pf23obs 4487 start && tsx studio/tests/check_pf23_observability.ts 4487 xr_studio_pf23obs
import "reflect-metadata";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Catch, Controller, Get, Module, Post, Req, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AlertDetail, fakeAlerts } from "../ports/alert.ts";
import { ALERT_REPEAT_MS, clocksNear, LogAlerts, stuckJobs, STUCK_JOB_MS, writeAuditWithAlarm } from "../api/src/platform/observability/alerts.ts";
import { observe, patchConsole } from "../api/src/platform/observability/hook.ts";
import { observeJob } from "../api/src/platform/observability/jobs.ts";
import { JsonLog, logPort, useLog } from "../api/src/platform/observability/log.ts";
import { emfProblems, mailLine } from "../api/src/platform/observability/metrics.ts";
import { alertIds } from "../api/src/platform/observability/alerts.ts";
import { logText, redact, REDACT_BUDGET, redactText } from "../api/src/platform/observability/redact.ts";
import { CANARIES, scanText, seededValues } from "../api/src/platform/observability/scan-logs.ts";
import { recorder } from "./runtime/api.ts";
import { runContract } from "../ports/contracts/contract.ts";
import { alertPortContract } from "../ports/contracts/alert-port.contract.ts";

const PORT = Number(process.argv[2] ?? 4487), DB = process.argv[3] ?? "xr_studio_pf23obs";
const STUDIO = join(import.meta.dirname, "..");
const { ok, summary } = recorder();
const C = Object.values(CANARIES);
const leaks = (text: string) => C.filter((v) => text.includes(v));
const sentence = `could not send to ${CANARIES.name} <${CANARIES.email}>, phone ${CANARIES.phone}, passport ${CANARIES.document}, Authorization: Bearer ${CANARIES.bearer}`;

/** A logger whose lines are kept, installed as the process's logger until restored. */
function capture() {
  const lines: string[] = [];
  const l = new JsonLog((line) => { lines.push(line); });
  const was = useLog(l);
  return { l, lines, restore: () => useLog(was), parsed: () => lines.map((x) => JSON.parse(x) as Record<string, unknown>) };
}

// ---- Part 1a: redaction
{
  const r = redact({ email: CANARIES.email, phone: CANARIES.phone, name: CANARIES.name, passportNumber: CANARIES.document, authorization: `Bearer ${CANARIES.bearer}`, cookie: "sid=abc", body: sentence, subject: sentence, attachmentName: "passport-scan.pdf", "person.given_names": "Canary", caseId: "3f1d2c1e-7b8a-4c5d-9e0f-112233445566", rule: "BR-16", count: 3 }) as Record<string, unknown>;
  ok("PF-23 pass (redaction by name): email, phone, name, document number, Authorization, cookie, body, subject, attachment name and a dotted given-names key are replaced", ["email", "phone", "name", "passportNumber", "authorization", "cookie", "body", "subject", "attachmentName", "person.given_names"].every((k) => r[k] === "[redacted]"), r);
  ok("PF-23 pass (redaction keeps ids and rule names): a record id, a rule name and a count stay as they are", r.caseId === "3f1d2c1e-7b8a-4c5d-9e0f-112233445566" && r.rule === "BR-16" && r.count === 3, r);
  const t = redactText(sentence);
  ok("PF-23 pass (redaction by pattern): email, phone, document number and bearer token in free text are replaced", !leaks(t).filter((v) => v !== CANARIES.name).length && /\[email\]/.test(t) && /\[number\]/.test(t) && /\[token\]|\[redacted\]/.test(t), t);
  const keep = "case 3f1d2c1e-7b8a-4c5d-9e0f-112233445566 on 2026-11-14T10:00:00Z took 1234 ms (IMM 5257, rule BR-5, P2002)";
  ok("PF-23 fail-guard (no over-redaction): a uuid, an ISO time, a duration, a form code and an error code are not taken for personal data", redactText(keep) === keep, redactText(keep));
  const cyc: Record<string, unknown> = { id: "x" }; cyc.self = cyc;
  ok("PF-23 (redaction never throws): a cycle, a bigint and deep nesting become markers", JSON.stringify(redact({ cyc, big: 10n, deep: { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } } })).includes("[cycle]"));
  const compound = redact({ client_full_name: CANARIES.name, applicantName: CANARIES.name, family_names: "Personname", nameOfApplicant: CANARIES.name, visit_contact_name: CANARIES.name, recipientEmail: "x", templateName: "booking.confirmed", queueName: "mail", fieldName: "person.given_names" }) as Record<string, unknown>;
  ok("PF-23 pass (review m3, compound keys): client_full_name, applicantName, family_names, nameOfApplicant, visit_contact_name and recipientEmail are replaced", ["client_full_name", "applicantName", "family_names", "nameOfApplicant", "visit_contact_name", "recipientEmail"].every((k) => compound[k] === "[redacted]"), compound);
  ok("PF-23 fail-guard (review m3): a template's, a queue's and a field's own names are kept", compound.templateName === "booking.confirmed" && compound.queueName === "mail" && compound.fieldName === "person.given_names", compound);
  ok("PF-23 pass (review m4): every pair of a cookie header is replaced, not only the first", !/abc|def/.test(redactText("Cookie: sid=abc; other=def")), redactText("Cookie: sid=abc; other=def"));
  ok("PF-23 pass/fail (review m5): an 8-digit UCI 1234-5678 is replaced; a year range 2026-2027 is kept", redactText("uci 1234-5678") === "uci [number]" && redactText("2026-2027") === "2026-2027");
  const shared = { id: "r-1" };
  ok("PF-23 fail-guard (review m6): an epoch time in ms, a package@version frame and a value shared by two fields are kept", redactText("at 1794662215060") === "at 1794662215060" && redactText("node_modules/@nestjs+core@11.1.29/x.js") === "node_modules/@nestjs+core@11.1.29/x.js" && JSON.stringify(redact({ a: shared, b: shared })) === '{"a":{"id":"r-1"},"b":"[shared]"}'); // PF-23r: the second sight is "[shared]", never "[cycle]"
  const err = redact(Object.assign(new Error(sentence), { code: "P2002" })) as Record<string, unknown>;
  ok("PF-23 pass (an error): kept as class, code and frames; its message, which quotes a name, is never kept", err.errorName === "Error" && err.code === "P2002" && Array.isArray(err.frames) && (err.frames as unknown[]).length > 0 && !leaks(JSON.stringify(err)).length, err);
}

// ---- Part 1c: PF-23r, redaction hardening (#1759 review minors 1-4; FO-13 break 11)
{
  // (1) A graph with 20 shared references per level over 10 levels: walked once per value, inside the budget.
  let level: unknown = { id: "leaf" };
  for (let i = 0; i < 10; i++) { const refs: Record<string, unknown> = {}; for (let j = 0; j < 20; j++) refs[`r${j}`] = level; level = refs; }
  const t0 = performance.now(), wide = JSON.stringify(redact(level)), ms = performance.now() - t0;
  ok("PF-23r pass (budget, review minor 1): 20 shared references per level over 10 levels finish in under a second, shared values show [shared], nothing over budget", ms < 1000 && /\[shared\]/.test(wide) && !/over budget/.test(wide) && (wide.match(/\[shared\]/g) ?? []).length < REDACT_BUDGET, { ms: Math.round(ms), shared: (wide.match(/\[shared\]/g) ?? []).length });
  const many = Array.from({ length: 50 }, (_, i) => Array.from({ length: 50 }, (_, j) => ({ i, j })));
  const big = JSON.stringify(redact(many));
  ok(`PF-23r fail (budget): ${50 * 50 * 3} distinct values in one call stop at ${REDACT_BUDGET}: the rest is [over budget]`, /\[over budget\]/.test(big) && big.includes('{"i":0,"j":0}'), big.length);
  const cyc: Record<string, unknown> = { id: "c" }; cyc.self = cyc;
  ok("PF-23r fail-guard (budget): a cycle is still [cycle], not [shared]", JSON.stringify(redact(cyc)) === '{"id":"c","self":"[cycle]"}', redact(cyc));
  // (2) alertIds: spaces become "_" only in entity and queue; an id with a space is a name.
  const a = alertIds({ entity: "case fact", queue: "mail out", entityKey: "Client A", firmId: "Acme Firm" });
  ok("PF-23r pass (alertIds, review minor 2): entity \"case fact\" → case_fact, queue \"mail out\" → mail_out", a.entity === "case_fact" && a.queue === "mail_out", a);
  ok("PF-23r fail (alertIds, review minor 2): entityKey \"Client A\" and a firmId with a space are refused (not_an_id), never Client_A", a.entityKey === "not_an_id" && a.firmId === "not_an_id", a);
  ok("PF-23r fail-guard (alertIds): a real id is kept as it is", alertIds({ entityKey: "3f1d2c1e-7b8a-4c5d-9e0f-112233445566", firmId: "firm-0001" }).entityKey === "3f1d2c1e-7b8a-4c5d-9e0f-112233445566");
  // (3) A stack whose message spans several lines (Prisma-style): frames only, plus the error's class.
  const prismaStack = `PrismaClientKnownRequestError: \nInvalid \`prisma.client.create()\` invocation:\n\nUnique constraint failed for ${CANARIES.name} <${CANARIES.email}>\n    at Ra.handleRequestError (/app/node_modules/@prisma/client/runtime/library.js:121:7315)\n    at async Fill.save (/app/api/src/fill-case.ts:379:5)`;
  const st = logText(prismaStack);
  ok("PF-23r pass (frames only, review minor 3): a 3-line error message with a stack logs its class and frames, never the message lines", /^\[stack\] PrismaClientKnownRequestError at /.test(st) && st.includes("fill-case.ts:379:5") && !/Invalid|Unique constraint/.test(st) && !leaks(st).length, st);
  const before = prismaStack.split("\n").slice(0, 4).join("\n");
  ok("PF-23r fail-guard (frames only): text with no frame line is still redacted by pattern only (a name stays: it cannot be found by pattern, which is why frames-only matters)", logText(before).includes(CANARIES.name) && !logText(before).includes(CANARIES.email));
  ok("PF-23r fail-guard (frames only): a first line that is not an error class (\"Client: …\") gives no class", logText(`Client: hello\n    at x (/a.js:1:1)`) === "[stack] at x (/a.js:1:1)", logText(`Client: hello\n    at x (/a.js:1:1)`));
  // (4) Time ranges and cookies.
  ok("PF-23r fail-guard (UCI8, review minor 4): a time range 0900-1700 stays; a UCI 1234-5678 is still replaced", redactText("open 0900-1700") === "open 0900-1700" && redactText("2330-2400") === "2330-2400" && redactText("uci 1234-5678") === "uci [number]", [redactText("open 0900-1700"), redactText("uci 1234-5678")]);
  ok("PF-23r pass (cookie, review minor 4): \"Cookie sid=abc\" with no \":\" is redacted; the word cookie in a sentence is kept", !/abc/.test(redactText("Cookie sid=abc")) && redactText("the cookie expired") === "the cookie expired", redactText("Cookie sid=abc"));
  // (5) PostgreSQL DETAIL and Prisma meta (FO-13 break 11): they repeat the refused row's values.
  const pgText = `error: duplicate key value violates unique constraint "person_name_key"\nDETAIL:  Key (display_name)=(${CANARIES.name}) already exists.`;
  ok("PF-23r pass (DETAIL): a DETAIL line, a Key (…)=(…) value list and a \"Failing row contains\" row lose their values; column and constraint names stay", !leaks(redactText(pgText)).length && /person_name_key/.test(redactText(pgText)) && !redactText(`Key (display_name)=(${CANARIES.name}) already exists.`).includes(CANARIES.name) && redactText(`Key (display_name)=(${CANARIES.name})`).includes("display_name") && !redactText(`Failing row contains (1, ${CANARIES.name}, null).`).includes(CANARIES.name), redactText(pgText));
  const meta = redact({ code: "P2002", meta: { modelName: "Person", target: ["display_name"], driverAdapterError: { cause: { originalMessage: `Key (display_name)=(${CANARIES.name})` } }, cause: CANARIES.name }, detail: `Key (display_name)=(${CANARIES.name}) already exists.` }) as { meta: Record<string, unknown>; detail: unknown };
  ok("PF-23r pass (Prisma meta, a pg error's detail field): only the model and the constraint's columns stay", meta.meta.modelName === "Person" && JSON.stringify(meta.meta.target) === '["display_name"]' && meta.meta.driverAdapterError === "[redacted]" && meta.meta.cause === "[redacted]" && meta.detail === "[redacted]" && !leaks(JSON.stringify(meta)).length, meta);
  // PF-23r review round 1, Minors 1-5.
  ok("PF-23r pass/fail (review r1 m1, review bot): 0900-1700, 1730-2400 stay (whole and half hours); UCIs 1130-0847, 1130-0845, 0915-1745 and 2359-2459 are replaced", redactText("0900-1700") === "0900-1700" && redactText("1730-2400") === "1730-2400" && redactText("uci 1130-0847") === "uci [number]" && redactText("uci 1130-0845") === "uci [number]" && redactText("0915-1745") === "[number]" && redactText("2359-2459") === "[number]", [redactText("uci 1130-0847"), redactText("2359-2459")]);
  const quoted = `Client "JJ" ${CANARIES.name}`;
  ok("PF-23r fail (review r1 m2): a value with a quote in it loses all of itself in DETAIL, Failing row and Cookie sid=\"…\"", [`DETAIL:  Key (display_name)=(${quoted}) already exists.`, `Failing row contains (1, ${quoted}, null).`, `Cookie sid="${CANARIES.bearer}"; b=1`].every((t) => !redactText(t).includes(CANARIES.name) && !redactText(t).includes("JJ") && !redactText(t).includes(CANARIES.bearer)), [`DETAIL: x "JJ"`, `Cookie sid="${CANARIES.bearer}"`].map(redactText));
  ok("PF-23r fail (review r1 m3): a bare Key (lower(email::text))=(…) loses its value; the expression stays", redactText(`Key (lower(email::text))=(${CANARIES.name}) already exists.`) === "Key (lower(email::text))=([redacted]) already exists.", redactText(`Key (lower(email::text))=(${CANARIES.name}) already exists.`));
  ok("PF-23r fail-guard (review r1 m4): a text line starting \"at 10:00\" is not a frame: the text is redacted by pattern, not cut to frames", logText(`Summary line\nat 10:00 the job ran for ${CANARIES.email}`) === "Summary line\nat 10:00 the job ran for [email]", logText(`Summary line\nat 10:00 the job ran for ${CANARIES.email}`));
  ok("PF-23r fail-guard (review r1 m4): in a stack, a message line \"at Client A's office\" is not kept as a frame", !logText(`Error: x\nat ${CANARIES.name}'s office\n    at f (/a.js:1:2)`).includes(CANARIES.name), logText(`Error: x\nat ${CANARIES.name}'s office\n    at f (/a.js:1:2)`));
  const d = new Date(0);
  ok("PF-23r fail-guard (review r1 m5): a Date met twice is written twice, never [shared]", JSON.stringify(redact({ startedAt: d, at: d })) === '{"startedAt":"1970-01-01T00:00:00.000Z","at":"1970-01-01T00:00:00.000Z"}', redact({ startedAt: d, at: d }));
  ok("PF-23r fail (Prisma meta, review bot): a target or modelName shaped like a column but a document number (AB123456) is replaced", (() => { const m = (redact({ meta: { target: ["AB123456"], modelName: "AB123456" } }) as Record<string, Record<string, unknown>>).meta; return m.target === "[redacted]" && m.modelName === "[redacted]"; })());
  ok("PF-23r fail-guard (Prisma meta): a target that is not a column name list is replaced too", (redact({ meta: { target: [CANARIES.name] } }) as Record<string, Record<string, unknown>>).meta.target === "[redacted]");
}

// ---- Part 1b: the logger, Nest's messages, LogPort
{
  const cap = capture();
  logPort.info("mail_sent", { to: CANARIES.email, subject: sentence, messageId: "m-1", templateKey: "booking.confirmed" });
  logPort.error("mail_failed", new Error(sentence), { messageId: "m-2", firmId: "firm-0003", correlationId: "sweep-0001" });
  // Nest's own call shapes on the logger: error(message, stack, context) and warn(message, context).
  cap.l.error(`send failed for ${CANARIES.name} ${CANARIES.email}`, new Error(sentence).stack, "Mailer");
  cap.l.warn(`retrying ${CANARIES.email}`, "Mailer");
  cap.restore();
  const p = cap.parsed();
  ok("PF-23 pass (one JSON logger): every line is JSON with time, level and event", p.length === 4 && p.every((x) => typeof x.time === "string" && !Number.isNaN(Date.parse(String(x.time))) && /^(info|warn|error)$/.test(String(x.level)) && typeof x.event === "string"), p);
  ok("PF-23 pass (LogPort): ids and template keys kept, the address and subject replaced", p[0].messageId === "m-1" && p[0].templateKey === "booking.confirmed" && p[0].to === "[redacted]" && p[0].subject === "[redacted]", p[0]);
  ok("PF-23 pass (review m7, outside a request): a caller's firmId and correlationId are kept", p[1].firmId === "firm-0003" && p[1].correlationId === "sweep-0001", p[1]);
  ok("PF-23 fail-guard (an error, LogPort and Nest's own logger): no seeded email, phone, name, document number or bearer token in any line", !leaks(cap.lines.join("\n")).length, leaks(cap.lines.join("\n")));
}

// ---- Part 1c: a Nest app hooked like main.ts
// Decorators applied by hand (tests run without experimentalDecorators, like api/src/platform/).
class ProbeController {
  ping() { return { ok: true }; }
  boom(): never { throw new Error(sentence); }
  // A route that writes a request header to the console, as careless code might: the request side's negative control.
  echo(req: { headers: Record<string, unknown> }) { console.log("echo", req.headers["x-note"]); return { ok: true }; }
  async slow() { await new Promise((r) => setTimeout(r, 400)); return { ok: true }; }
}
Controller("api/pf23")(ProbeController);
for (const [m, dec] of [["ping", Get("ping")], ["boom", Post("boom")], ["echo", Get("echo")], ["slow", Get("slow")]] as const) dec(ProbeController.prototype, m, Object.getOwnPropertyDescriptor(ProbeController.prototype, m)!);
Req()(ProbeController.prototype, "echo", 0);
class Problems implements ExceptionFilter { // as main.ts's ProblemErrors does for a 500: console.error(e), then plain words
  catch(e: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<{ status(n: number): { json(b: unknown): void } }>();
    const status = (e as { getStatus?: () => number }).getStatus?.() ?? 500;
    if (status >= 500) console.error(e);
    res.status(status).json({ status, detail: "Something went wrong on the server." });
  }
}
Catch()(Problems);
class ProbeModule {}
Module({ controllers: [ProbeController] })(ProbeModule);

{
  const lines: string[] = [];
  const app = await NestFactory.create<NestExpressApplication>(ProbeModule, { logger: ["error", "warn"] });
  const hooked = observe(app, { sink: (l) => { lines.push(l); } });
  // PF-4's guard puts the signed-in staff member's StaffContext on req.platform; here a header stands in for it.
  app.use((req: { headers: Record<string, unknown>; platform?: unknown }, _res: unknown, next: () => void) => { if (typeof req.headers["x-test-firm"] === "string") req.platform = { firmId: req.headers["x-test-firm"] }; next(); });
  app.useGlobalFilters(new Problems());
  await app.listen(0, "127.0.0.1");
  const base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  const got: Record<string, { status: number; rid: string | null }> = {};
  const call = async (key: string, path: string, init: RequestInit = {}) => { const r = await fetch(base + path, init); await r.text(); got[key] = { status: r.status, rid: r.headers.get("x-request-id") }; };
  let jobThrew = false, consoleThrew = false;
  try {
    await call("kept", "/api/pf23/ping", { headers: { "X-Request-Id": "pf23-run-0001" } });
    await call("made", "/api/pf23/ping");
    await call("refused", "/api/pf23/ping", { headers: { "X-Request-Id": CANARIES.email } });
    await call("phoneId", "/api/pf23/ping", { headers: { "X-Request-Id": "4165550199" } });
    await call("firm", "/api/pf23/ping", { headers: { "x-test-firm": "firm-0001" } });
    await call("boom", `/api/pf23/boom?email=${encodeURIComponent(CANARIES.email)}&name=${encodeURIComponent(CANARIES.name)}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${CANARIES.bearer}`, cookie: `sid=${CANARIES.bearer}` }, body: JSON.stringify({ email: CANARIES.email, phone: CANARIES.phone, name: CANARIES.name, passport: CANARIES.document }) });
    new Logger("Mailer").error(`send failed for ${CANARIES.name} ${CANARIES.email}`, new Error(sentence).stack); // Nest's static Logger, after app.useLogger
    await call("echo", "/api/pf23/echo", { headers: { "x-note": `Bearer ${CANARIES.bearer} ${CANARIES.email}` } });
    const ctl = new AbortController(); setTimeout(() => ctl.abort(), 80);
    await fetch(`${base}/api/pf23/slow`, { signal: ctl.signal, headers: { "X-Request-Id": "pf23-aborted-01" } }).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 500));
    try {
      console.error(new Error(sentence).stack); // a stack written as text
      console.log({ get x() { throw new Error("getter"); } });
      const { proxy, revoke } = Proxy.revocable({}, {}); revoke(); console.log(proxy);
    } catch { consoleThrew = true; }
    const okJob = observeJob("render", async (_j: { id: string; firmId: string }) => { console.log("rendering"); return 1; });
    await okJob({ id: "job-0002", firmId: "firm-0002" });
    await call("unmatched", `/api/pf23/${encodeURIComponent(CANARIES.email)}`);
    // A job that fails with personal data in its payload and its error.
    const mailJob = observeJob("mail", async (_j: { id: string; createdAt: Date; data: unknown }) => { throw new Error(sentence); });
    await mailJob({ id: "job-0001", createdAt: new Date(Date.now() - 1500), data: { to: CANARIES.email, subject: sentence } }).catch(() => { jobThrew = true; });
    await new Promise((r) => setTimeout(r, 50));
  } finally { hooked.restore(); await app.close(); }

  const p = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
  const req = (rid: string | null) => p.filter((x) => x.event === "request" && x.correlationId === rid);
  ok("PF-23 pass (request line): a request logs exactly one JSON request line, with route, status, duration and its correlation id", req("pf23-run-0001").length === 1 && req("pf23-run-0001")[0].route === "/api/pf23/ping" && req("pf23-run-0001")[0].status === 200 && typeof req("pf23-run-0001")[0].durationMs === "number" && req("pf23-run-0001")[0].method === "GET", req("pf23-run-0001"));
  ok("PF-23 pass (X-Request-Id): a supplied id is kept and sent back", got.kept.rid === "pf23-run-0001", got.kept);
  ok("PF-23 pass (no X-Request-Id): a new id is made, sent back and logged", /^[0-9a-f-]{36}$/.test(got.made.rid ?? "") && req(got.made.rid).length === 1, got.made);
  ok("PF-23 fail (X-Request-Id holding an email or a phone number): not kept; a new id instead", got.refused.rid !== CANARIES.email && /^[0-9a-f-]{36}$/.test(got.refused.rid ?? "") && got.phoneId.rid !== "4165550199", { refused: got.refused, phone: got.phoneId });
  ok("PF-23 pass (firm): a request whose StaffContext names a firm carries firmId on its line", req(got.firm.rid)[0]?.firmId === "firm-0001", req(got.firm.rid)[0]);
  ok("PF-23 fail-guard (firm): a request with no StaffContext has no firmId", !("firmId" in (req("pf23-run-0001")[0] ?? {})));
  const boom = req(got.boom.rid)[0];
  ok("PF-23 pass (an error): the 500 is one request line (Errors 1) and one console error line with the request's correlation id, the error's class and frames", got.boom.status === 500 && boom?.Errors === 1 && boom?.route === "/api/pf23/boom" && p.some((x) => x.event === "console" && x.level === "error" && x.correlationId === got.boom.rid && Array.isArray(x.errors)), { boom, status: got.boom.status });
  ok("PF-23 pass (Nest's Logger once hooked): its error is a JSON line with frames, and the message (which quotes a name) is not kept", p.some((x) => x.event === "nest" && x.context === "Mailer" && x.level === "error" && Array.isArray(x.frames) && /not logged/.test(String(x.message))));
  ok("PF-23 pass (review m14, negative control): a header a route writes to the console reaches the log, redacted (so the request-side check can fail)", p.some((x) => x.event === "console" && x.correlationId === got.echo.rid && /echo Bearer \[token\] \[email\]/.test(String(x.message))), p.filter((x) => x.correlationId === got.echo.rid));
  ok("PF-23 pass (review m8): a request the caller aborted is logged as aborted (499), never as a success", p.some((x) => x.event === "request" && x.correlationId === "pf23-aborted-01" && x.status === 499 && x.outcome === "aborted" && x.Errors === 0), p.filter((x) => x.correlationId === "pf23-aborted-01"));
  ok("PF-23 pass (review m2): a stack written as text keeps its frames only; its first line (the message) is gone", p.some((x) => x.event === "console" && /^\[stack\] (Error )?at /.test(String(x.message))), p.filter((x) => x.event === "console").map((x) => String(x.message).slice(0, 60)));
  ok("PF-23 fail-guard (review m1): a throwing getter and a revoked proxy never make console.* throw", !consoleThrew && p.some((x) => x.event === "console" && /unreadable value/.test(JSON.stringify(x))));
  ok("PF-23 pass (review m7, jobs): a job's lines, its handler's own included, carry job:<id> as correlation id and its firm", p.some((x) => x.event === "console" && x.message === "rendering" && x.correlationId === "job:job-0002" && x.firmId === "firm-0002") && p.some((x) => x.event === "job" && x.jobId === "job-0002" && x.correlationId === "job:job-0002"));
  ok("PF-23 pass/fail (review m9): a job with no created time has no JobAge metric; one with it has", p.some((x) => x.event === "job" && x.jobId === "job-0002" && !("JobAge" in x)) && p.some((x) => x.event === "job" && x.jobId === "job-0001" && typeof x.JobAge === "number"));
  ok("PF-23 pass (unmatched path): its line says \"unmatched\", never the path a person typed", req(got.unmatched.rid)[0]?.route === "unmatched", req(got.unmatched.rid)[0]);
  ok("PF-23 pass (a job): a failed job writes its job line (queue, id, outcome, waited) and an error line, and the failure reaches the caller", jobThrew && p.some((x) => x.event === "job" && x.queue === "mail" && x.jobId === "job-0001" && x.outcome === "failed" && x.JobFailures === 1 && Number(x.ageMs) >= 1500) && p.some((x) => x.event === "job_error" && x.jobId === "job-0001"), p.filter((x) => String(x.event).startsWith("job")));
  const all = lines.join("\n");
  ok("PF-23 fail-guard (a request, an error and a job): no seeded email, phone, name, document number or bearer token in the captured output", !leaks(all).length && !/sid=/.test(all), leaks(all));
  const metricLines = p.filter((x) => "_aws" in x);
  ok("PF-23 pass (metrics): every request and job line parses as CloudWatch embedded metric format", metricLines.length >= 8 && metricLines.every((x) => !emfProblems(x).length), metricLines.map(emfProblems).filter((x) => x.length));
  ok("PF-23 pass (console restored): after restore, console is the process's own again", !String(console.error).includes("l.write"));
}

// ---- Part 1d: metric lines, pass and fail
{
  const cap = capture();
  mailLine("sent", 2, "TRANSACTIONAL"); mailLine("bounced");
  cap.restore();
  const p = cap.parsed();
  ok("PF-23 pass (mail metrics): sent and bounced lines parse as embedded metric format, with no address", p.length === 2 && p.every((x) => !emfProblems(x).length) && p[0].MailSent === 2 && p[1].MailBounced === 1, p);
  const broken = JSON.parse(cap.lines[0]) as Record<string, unknown>; delete broken.MailSent;
  ok("PF-23 fail (embedded metric format): a line missing its metric value, a dimension value or _aws is refused", emfProblems(broken).some((x) => /MailSent/.test(x)) && emfProblems({ ...p[0], Service: undefined }).some((x) => /dimension Service/.test(x)) && emfProblems({ a: 1 }).length > 0);
}

// ---- Part 1e: alerts (AlertPort) — audit-write failure, repeats, stuck jobs, clocks
{
  let now = new Date("2026-11-14T10:00:00Z");
  const clock = { now: () => now };
  const cap = capture();
  const alerts = new LogAlerts(clock);
  let tries = 0;
  const failing = () => { tries++; return Promise.reject(new Error(`insert failed for ${CANARIES.email}`)); };
  const ids = { firmId: "firm-0001", entity: "case", entityKey: "case-0001" };
  const first = await writeAuditWithAlarm(failing, ids, { alerts, retryMs: 0 }).then(() => "wrote", () => "threw");
  const alertsAfter = () => cap.parsed().filter((x) => x.event === "alert");
  ok("PF-23 pass (audit-write failure, BR-5): retried 3 times, then one alert, one audit-failure metric, and the failure reaches the caller", first === "threw" && tries === 3 && alertsAfter().length === 1 && alertsAfter()[0].alert === "audit_write_failed" && alertsAfter()[0].Alerts === 1 && cap.parsed().filter((x) => x.event === "audit_write_failed" && x.AuditWriteFailures === 1).length === 1, { tries, alerts: alertsAfter() });
  now = new Date(now.getTime() + 4 * 60_000);
  await writeAuditWithAlarm(failing, { ...ids, entityKey: "case-0002" }, { alerts, retryMs: 0 }).catch(() => undefined);
  ok("PF-23 fail (a second audit-write failure within 5 min, Sample): raises no alert", alertsAfter().length === 1 && cap.parsed().some((x) => x.event === "alert_repeat"), alertsAfter().length);
  now = new Date(now.getTime() + ALERT_REPEAT_MS);
  await writeAuditWithAlarm(failing, ids, { alerts, retryMs: 0 }).catch(() => undefined);
  ok("PF-23 pass (after the 5 min): the next failure raises a new alert", alertsAfter().length === 2);
  let n = 0;
  const flaky = () => (++n === 1 ? Promise.reject(new Error("busy")) : Promise.resolve("ok"));
  const second = await writeAuditWithAlarm(flaky, { firmId: "firm-0002", entity: "case", entityKey: "c-9" }, { alerts, retryMs: 0 });
  ok("PF-23 fail (a write that succeeds on its retry): no alert", second === "ok" && alertsAfter().length === 2);
  // Review M1: this app's own entity names have spaces; the alarm must still sound and the write's own error must reach the caller.
  const dbError = new Error("insert failed");
  const caught = await writeAuditWithAlarm(() => Promise.reject(dbError), { firmId: "firm-0009", entity: "case fact", entityKey: CANARIES.email }, { alerts, retryMs: 0 }).then(() => null, (e: unknown) => e);
  const m1 = alertsAfter().find((x) => x.firmId === "firm-0009");
  ok("PF-23 pass (review M1): entity \"case fact\" raises one alert (entity case_fact) and the caller gets the write's own error, not a validation error", caught === dbError && m1?.entity === "case_fact" && m1?.alert === "audit_write_failed", { m1, caught: String(caught) });
  ok("PF-23 fail-guard (review M1): an entityKey that is an email is never written: it becomes not_an_id", m1?.entityKey === "not_an_id" && !leaks(cap.lines.join("\n")).length, m1?.entityKey);
  const t = now.getTime();
  const twoQueues = await stuckJobs([{ queue: "mail out", id: "j-7", since: new Date(t - STUCK_JOB_MS - 60_000) }, { queue: "render2", id: "j-8", since: new Date(t - STUCK_JOB_MS - 60_000) }], clock, alerts);
  ok("PF-23 pass (review M1, stuck jobs): a queue named with a space still alerts, and never stops the next queue's alert", twoQueues.join() === "mail out,render2", twoQueues);
  const stuck = await stuckJobs([{ queue: "mail", id: "j-1", since: new Date(t - STUCK_JOB_MS - 60_000) }, { queue: "mail", id: "j-2", since: new Date(t - STUCK_JOB_MS - 120_000) }, { queue: "render", id: "j-3", since: new Date(t - STUCK_JOB_MS + 60_000) }], clock, alerts);
  ok("PF-23 pass (stuck job, SA8-D40): a queue with jobs over the limit raises one job_stuck; a queue under it raises none", stuck.join() === "mail" && alertsAfter().filter((x) => x.alert === "job_stuck" && x.queue === "mail").length === 1 && alertsAfter().find((x) => x.alert === "job_stuck" && x.queue === "mail")?.count === 2 && !alertsAfter().some((x) => x.queue === "render"), stuck);
  const near = await clocksNear("breach_clock_near", [{ id: "br-1", firmId: "firm-0001", dueAt: new Date(t + 23 * 3_600_000) }, { id: "br-2", dueAt: new Date(t + 3 * 86_400_000) }], clock, alerts);
  const dsr = await clocksNear("privacy_clock_near", [{ id: "dsr-1", dueAt: new Date(t + 4 * 86_400_000) }, { id: "dsr-2", dueAt: new Date(t + 6 * 86_400_000) }], clock, alerts);
  ok("PF-23 pass/fail (legal clocks, NFR5-14): a breach due in 23 h and a privacy request due in 4 days alert; 3 days and 6 days away do not", near.join() === "br-1" && dsr.join() === "dsr-1", { near, dsr });
  cap.restore();
  ok("PF-23 (alerts): every alert line parses as embedded metric format with an AlertKind dimension, and no personal value", alertsAfter().every((x) => !emfProblems(x).length && typeof x.AlertKind === "string") && !leaks(cap.lines.join("\n")).length);
  const refused = (d: unknown) => { try { AlertDetail.parse(d); return false; } catch { return true; } };
  ok("PF-23 fail (AlertPort payload): an email, a name or free text in an alert's detail is refused; a rule is required", refused({ rule: "BR-5", entityKey: CANARIES.email }) && refused({ rule: "BR-5", firmId: CANARIES.name }) && refused({ rule: "BR-5", note: "x" }) && refused({ entity: "case" }));
  const fake = fakeAlerts();
  await fake.raise("audit.chain_integrity_failure", { rule: "BR-2", entity: "audit_event", entityKey: "seq-41" });
  const fakeRefused = await fake.raise("job_stuck", { rule: "x y" } as never).then(() => false, () => true);
  ok("PF-23 pass/fail (AlertPort's fake): keeps a valid alert in order; refuses a bad one like the adapter", fake.raised.length === 1 && fake.raised[0].kind === "audit.chain_integrity_failure" && fakeRefused);
}

// ---- PF-0c: the log-line adapter and the fake run AlertPort's shared contract
await runContract(alertPortContract, "LogAlerts", () => new LogAlerts(), ok);
await runContract(alertPortContract, "fakeAlerts", () => fakeAlerts(), ok);

// ---- Part 1f: the CI check "no personal data in logs" (scan-logs.ts)
const scanCli = (args: string[]) => spawnSync(join(STUDIO, "node_modules", ".bin", "tsx"), [join(STUDIO, "api", "src", "platform", "observability", "scan-logs.ts"), ...args], { encoding: "utf8" });
{
  const seeded = seededValues();
  ok("PF-23 pass (seeded values): the sample data's people are read (an email, a passport number, a two-word name) with PF-23's canaries", seeded.includes("client.a@example.com") && seeded.includes("Z7000001") && seeded.includes("SAMPLE SPOUSE STUDENT") && C.every((c) => seeded.includes(c)));
  ok("PF-23 pass (review m13): a person's given and family names are also seeded joined, as a full name", seeded.some((v) => /^\S.* \S+$/.test(v) && seeded.includes(v) && v.endsWith("Representative")), seeded.filter((v) => v.endsWith("Representative")));
  ok("PF-23 fail-guard (seeded values): a lone word such as SAMPLE, a program name, or given names alone (\"Solo Sample\", also inside an employer's name) are not taken for a person", !seeded.includes("SAMPLE") && !seeded.includes("Study permit") && !seeded.includes("Solo Sample"));
  const dir = mkdtempSync(join(tmpdir(), "pf23-"));
  try {
    writeFileSync(join(dir, "clean-api.log"), `${JSON.stringify({ level: "info", event: "request", route: "/api/x/:id", note: "[email] Bearer [token]" })}\n`);
    // The deliberately leaking line (row PF-23: "shown once, then removed"): planted here, in a temporary file only.
    writeFileSync(join(dir, "leak-api.log"), `${JSON.stringify({ level: "info", event: "request" })}\n${JSON.stringify({ level: "error", event: "console", message: `could not send to ${CANARIES.email}` })}\n`);
    const clean = scanCli([join(dir, "clean-api.log")]), leak = scanCli([join(dir, "leak-api.log")]), self = scanCli(["--self-test"]);
    ok("PF-23 pass (scanner): a redacted log passes (exit 0)", clean.status === 0, clean.stdout.trim());
    ok("PF-23 fail (scanner): a deliberately leaking line fails the check (exit 1), naming file, line 2 and rule, never the value", leak.status === 1 && /leak-api\.log:2: an email address|leak-api\.log:2: a seeded personal value/.test(leak.stdout) && !leak.stdout.includes(CANARIES.email), leak.stdout.trim());
    ok("PF-23 (scanner): its own self-test passes, as CI runs it", self.status === 0, self.stdout.trim());
    const none = scanCli([join(dir, "no-such-folder")]);
    ok("PF-23 (review m13): with no server log to read, the check says \"nothing scanned\" plainly", none.status === 0 && /nothing scanned/.test(none.stdout), none.stdout.trim());
    ok("PF-23 fail-guard (scanner rules): Node's \"removed in pg@9.0\" warning and a package@1.2.3 frame are not addresses; a real one is", scanText("will be removed in pg@9.0. Use async/await\nat node_modules/@nestjs+core@11.1.29/x.js", "f", seeded).length === 0 && scanText("sent to someone@firm.example", "f", seeded).length === 1);
    ok("PF-23 fail (scanner rules): a seeded name, a bearer credential and a JWT are each found", scanText(`x ${CANARIES.name}\nAuthorization: Bearer abcdefgh12345678\nt=eyJhbGciOi.eyJzdWIiOi.sig`, "f", seeded).length === 3);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// ---- Part 2: a live copy
const LOG = join(STUDIO, "var", `isolated-${DB.replace("xr_studio_", "")}`, "api.log");
const psql = (q: string) => execFileSync("/opt/homebrew/opt/postgresql@18/bin/psql", ["postgresql://xr_studio@127.0.0.1:54329/postgres", "-XAtc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const get = async (path: string, init: RequestInit = {}) => {
  try { const r = await fetch(`http://127.0.0.1:${PORT}${path}`, init); const text = await r.text(); let body: unknown = null; try { body = JSON.parse(text); } catch { body = text; } return { status: r.status, body: body as Record<string, unknown> | null, rid: r.headers.get("x-request-id"), cache: r.headers.get("cache-control") }; }
  catch (e) { return { status: 0, body: { error: (e as Error).message } as Record<string, unknown>, rid: null, cache: null }; }
};
let cut = false;
try {
  const rid = `pf23-live-${Date.now()}`;
  const live = await get("/api/health/live", { headers: { "X-Request-Id": rid } });
  ok("PF-23 pass (live): /api/health/live answers 200 with no person header, never cached, and keeps the supplied X-Request-Id", live.status === 200 && live.body?.status === "ok" && live.rid === rid && live.cache === "no-store", live);
  await get("/api/catalogue?email=" + encodeURIComponent(CANARIES.email) + "&name=" + encodeURIComponent(CANARIES.name), { headers: { authorization: `Bearer ${CANARIES.bearer}`, "x-actor": CANARIES.name } });
  await get("/api/combinations/" + encodeURIComponent(CANARIES.document) + "/submit", { method: "POST", headers: { "content-type": "application/json", "x-actor": "author" }, body: JSON.stringify({ note: sentence, email: CANARIES.email, phone: CANARIES.phone }) });
  await new Promise((r) => setTimeout(r, 200));
  const log = readFileSync(LOG, "utf8"), mine = log.split("\n").filter((l) => l.includes(`"correlationId":"${rid}"`));
  ok("PF-23 pass (live log): the request is one JSON line in the server's log, with its correlation id, route, status and duration", mine.length === 1 && (() => { const x = JSON.parse(mine[0]) as Record<string, unknown>; return x.event === "request" && x.route === "/api/health/live" && x.status === 200 && typeof x.durationMs === "number" && !emfProblems(x).length; })(), mine);
  ok("PF-23 fail-guard (live log): no seeded email, phone, name, document number or bearer token from the requests above reaches the server's log", !leaks(log).length, leaks(log));
  const scanned = scanCli([LOG]);
  ok("PF-23 pass (live log): the CI check passes on this copy's log", scanned.status === 0, scanned.stdout.trim());
  const ready = await get("/api/health/ready");
  ok("PF-23 pass (ready): database answers → 200, status ok; the job queue counted and ok (PF-14's runner is the probe since PF-23w)", ready.status === 200 && ready.body?.status === "ok" && (ready.body?.checks as Record<string, Record<string, unknown>>)?.job_queue?.ok === true && ready.cache === "no-store", ready.body);
  psql(`alter database "${DB}" with allow_connections false`); cut = true;
  psql(`select pg_terminate_backend(pid) from pg_stat_activity where datname = '${DB}' and pid <> pg_backend_pid()`);
  const down = await get("/api/health/ready");
  ok("PF-23 fail (ready): the database down → 503, failing names exactly database and job_queue (pg-boss is on the same database; PF-23w), in words, never the connection string or the database's address (review m12)", down.status === 503 && [...((down.body?.failing as string[] | undefined) ?? [])].sort().join() === "database,job_queue" && /does not answer/.test(JSON.stringify(down.body)) && !/postgres(ql)?:\/\/|127\.0\.0\.1|54329|xr_studio/.test(JSON.stringify(down.body)), down.body);
  const liveDown = await get("/api/health/live");
  ok("PF-23 pass (live while the database is down): the process still answers 200", liveDown.status === 200);
  psql(`alter database "${DB}" with allow_connections true`); cut = false;
  let back = await get("/api/health/ready");
  for (let i = 0; i < 20 && back.status !== 200; i++) { await new Promise((r) => setTimeout(r, 500)); back = await get("/api/health/ready"); }
  ok("PF-23 pass (ready): the database back → 200 again, without a restart", back.status === 200 && back.body?.status === "ok", back.body);
  // PF-23r (FO-13 break 11): a refused insert of a seeded name, through the product's route and on the database itself.
  const m3 = await import("../acceptance/lib/m3.ts");
  const combo = () => m3.sql(`select c.id from combination c where c.combination_key='vv.single' and exists (select 1 from config_release r where r.combination_id=c.id)`);
  if (!combo()) await m3.call("POST", "/demo/load", { sample: "configured" }, "user-A");
  const f = await m3.firms(), officer = f.officer ?? "user-O";
  const open = () => m3.call("POST", "/runtime/cases", { combinationId: combo(), clientActor: "user-P", principal: { displayName: "Sample Client N" }, reference: `${CANARIES.name} ${m3.run}`, ...(f.rep ? { representative: f.rep, caseOfficers: [officer] } : {}) }, officer);
  const first = await open(), dup = await open();
  await new Promise((r) => setTimeout(r, 200));
  const after = readFileSync(LOG, "utf8");
  ok("PF-23r pass (a refused insert of a seeded name, the answer): the product refuses the second case with the same reference (409) and its answer never repeats the name", first.status === 201 && dup.status === 409 && !JSON.stringify(dup.body).includes(CANARIES.name), [first.status, dup.status, dup.body]);
  ok("PF-23r fail-guard (a refused insert of a seeded name, the server's log): the name is in no line of the server's log", !after.includes(CANARIES.name));
  // The same refusal straight from PostgreSQL's driver: its error carries DETAIL with the value; logged every way the app logs.
  const pg = (await import("pg")).default, c = new pg.Client({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DB}` });
  await c.connect();
  let pgErr: (Error & { detail?: string }) | undefined;
  try {
    await c.query("create temporary table pf23r_probe (display_name text unique)");
    await c.query("insert into pf23r_probe values ($1)", [CANARIES.name]);
    await c.query("insert into pf23r_probe values ($1)", [CANARIES.name]);
  } catch (e) { pgErr = e as Error & { detail?: string }; } finally { await c.end(); }
  const cap = capture();
  logPort.error("db_refused", pgErr, { table: "pf23r_probe" });
  logPort.warn("db_refused", { cause: { ...pgErr }, detail: pgErr?.detail, text: `${pgErr?.message}\nDETAIL:  ${pgErr?.detail}`, meta: { modelName: "Probe", driverAdapterError: { cause: { originalMessage: pgErr?.detail } } } });
  const unpatch = patchConsole(cap.l); // the app's console calls, as the server patches them
  try { console.error(`${pgErr?.stack}\nDETAIL:  ${pgErr?.detail}`); console.error(pgErr); console.warn("refused:", { ...pgErr }); } finally { unpatch(); }
  cap.restore();
  ok("PF-23r fail (the driver's error repeats the name: the check can fail)", typeof pgErr?.detail === "string" && pgErr.detail.includes(CANARIES.name), pgErr?.detail);
  ok("PF-23r pass (a refused insert of a seeded name, logPort): the error, its fields, its DETAIL text and a Prisma-style meta are logged without the name", cap.lines.length >= 2 && !cap.lines.join("\n").includes(CANARIES.name) && cap.parsed().some((x) => x.event === "db_refused" && x.level === "warn"), cap.lines);
} catch (e) { ok(`PF-23: the live part ran to its end (crashed: ${(e as Error).message})`, false); }
finally { if (cut) { try { psql(`alter database "${DB}" with allow_connections true`); } catch { /* stop drops it anyway */ } } }
process.exitCode = summary() ? 1 : 0;
