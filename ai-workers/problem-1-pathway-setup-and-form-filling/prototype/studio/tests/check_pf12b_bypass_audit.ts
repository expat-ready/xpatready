// PF-12b part 1 (QA-499; R1.4 "every use writes an audit line"; P-607, P-571 (1), AG-1-45): every bypass use that crosses
// firms writes one platform.bypass audit_event line per firm it touches, in that firm's transaction, or is refused.
// DW1 the outbox sweep, the demo reset and the demo inbox on the two Sample firms (one line per firm, in that firm's
// trail only); DW2 a line that cannot be written refuses the use and rolls its work back (500 in plain words); DW3 every
// BYPASS_USES entry names how it audits; DW4 sign-up verify writes its line under the new firm in the transaction that
// creates it; DW7 QA-499's count matches the uses × firms touched, and an own-firm door adds none. A scratch database
// with every migration and the Sample firms, through the app's walled pool (xr_app); dropped at the end. No server, no
// browser, no model call (US$0).
//   tsx studio/tests/check_pf12b_bypass_audit.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { FakeClock } from "../ports/clock.ts";
import { fakeAudit } from "../ports/audit.ts";
import { fakeBilling } from "../ports/billing.ts";
import { fakeFiles } from "../ports/files.ts";
import { fakeJobs } from "../ports/jobs.ts";
import { fakeMail } from "../ports/mail.ts";
import { auditEvent } from "../api/src/platform/audit/audit-event.ts";
import { appDatabaseUrl, asBypass, asJob, BYPASS_USES, BypassNotRecorded, BypassRefused, FirmScopeError, inRequest, onBypassAudit, touchFirm, WalledPool } from "../api/src/platform/firm-scope.ts";
import { FirmSignUp, type SignUpPorts } from "../api/src/platform/firms/signup.ts";
import { LocalSignUp } from "../api/src/platform/firms/signup-identity.ts";
import { resetSampleFirmSettings } from "../api/src/platform/identity/demo-reset.ts";
import { PlatformInbox } from "../api/src/platform/messages/demo-inbox.ts";
import { Messages, type MessagesDeps } from "../api/src/platform/messages/send/messages.ts";
import { requestScope } from "../api/src/platform/observability/log.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { WebAddressCatchUp } from "../api/src/platform/web-address/routes.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf12b_${process.pid}`, URL = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const sql = (q: string) => execFileSync(join(BIN, "psql"), [URL, "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
/** QA-499's count: the platform.bypass lines of one use, as "firm:count" in firm order. */
const lines = (use: string) => sql(`select coalesce(string_agg(f || ':' || n, ',' order by f), '') from (select detail->>'firmId' as f, count(*) as n from audit_event where action = 'platform.bypass' and detail->>'use' = '${use}' group by 1) x`);
const total = () => Number(sql(`select count(*) from audit_event where action = 'platform.bypass'`));
const errOf = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { return e; } };
const plain = (e: unknown) => e instanceof BypassNotRecorded && e.getStatus() === 500 && /could not be written to the firm's activity record, so nothing was done/.test(JSON.stringify(e.getResponse()));

/** DW3's reader: the entries whose audit field is missing or says nothing (also run on a broken copy of the list). */
export function unaudited(list: Readonly<Record<string, object>>): string[] {
  return Object.entries(list as Record<string, { audit?: unknown }>).filter(([, e]) => !(e.audit === "per-firm" || (typeof e.audit === "string" && /^none: .{40,}$/.test(e.audit)))).map(([k]) => k);
}

// ---------------------------------------------------------------------------------------------------------- DW3 first
ok("PF-12b DW3 pass: every BYPASS_USES entry names how it audits (per-firm, or none with its reason)", unaudited(BYPASS_USES).length === 0, unaudited(BYPASS_USES));
const broken = { ...BYPASS_USES, "pf12b.new-use": { why: "a use added without its audit field", routes: [] } };
ok("PF-12b DW3 fail: a use added without `audit`, or with an empty none, is named by the check", JSON.stringify(unaudited(broken)) === '["pf12b.new-use"]' && unaudited({ x: { audit: "none: " } }).length === 1);
const PER_FIRM = ["job:messages.outbox_sweep", "platform.demo.inbox", "platform.demo.reset", "platform.firms.signup", "platform.web-address.catch-up"];
const DOORS = ["fo.booking.public-page", "fo.booking.self-service", "fo.sales.web-form", "platform.identity.authenticate", "platform.identity.invitation", "platform.identity.sign-in", "platform.web-address.host"];
const perFirm = Object.entries(BYPASS_USES).filter(([, e]) => e.audit === "per-firm").map(([k]) => k).sort();
ok("PF-12b DW3 pass: the five cross-firm uses audit per firm; the seven own-firm doors say why not yet (part 2 moves them)", JSON.stringify(perFirm) === JSON.stringify(PER_FIRM) && DOORS.every((d) => /^none: an own-firm door/.test(BYPASS_USES[d].audit)), perFirm);
ok("PF-12b DW3 pass: the two uses that touch no firm say why (the purge: our own register; re-encrypt: every job runs as its firm)", /platform_signup_pending/.test(BYPASS_USES["job:platform.signup.purge"].audit) && /runs as that firm/.test(BYPASS_USES["job:platform.secret_box.reencrypt"].audit));

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
const clients: PrismaClient[] = [], pools: WalledPool[] = [];
try {
  for (const d of readdirSync(MIG).filter((d) => /^\d{14}_/.test(d)).sort()) execFileSync(join(BIN, "psql"), [URL, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
  const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL, options: "-c TimeZone=UTC" }) }); clients.push(owner);
  await seedSampleFirms(owner);
  const [A, B] = sql(`select id from platform_firm order by key`).split("\n");
  sql(`insert into msg_firm (firm_id) values ('${A}'), ('${B}') on conflict do nothing`);
  const INBOX = "client-a@sample.example.com";
  for (const f of [A, B]) {
    sql(`insert into msg_outbox (id, firm_id, channel, address, rendered_hash, class, state, created_at, updated_at) values (gen_random_uuid(), '${f}', 'EMAIL', 'stuck@sample.example.com', repeat('a', 64), 'TRANSACTIONAL', 'QUEUED', now() - interval '10 minutes', now())`);
    sql(`insert into msg_outbox (id, firm_id, channel, address, rendered_hash, class, state, provider_id, created_at, updated_at, sent_at) values (gen_random_uuid(), '${f}', 'EMAIL', '${INBOX}', repeat('a', 64), 'TRANSACTIONAL', 'SENT', 'local:${f}', now(), now(), now())`);
  }
  // The app's own client: xr_app through the walled pool (PF-12), as the API connects.
  const pool = new WalledPool({ connectionString: appDatabaseUrl(URL, {}), options: "-c TimeZone=UTC" }); pools.push(pool);
  const db = new PrismaClient({ adapter: new PrismaPg(pool) }); clients.push(db);
  const clock = new FakeClock(new Date());
  const jobs = fakeJobs(clock);
  const messages = new Messages({ db, jobs, clock } as unknown as MessagesDeps);
  const inbox = new PlatformInbox(db as never, fakeFiles(), () => true);
  const inboxRoute = { method: "GET", path: "/api/demo/platform-inbox" };

  // ---------------------------------------------------------------------------------------------------------- DW1
  // The known limit (review m1, break M1): the line is written where a use calls touchFirm; a use that reads without the call
  // writes none. The guard is the named list, one use at a time (no use inside another) and this suite, per use.
  ok("PF-12b DW1 fail (QA-499's count before any use runs, and the known limit): a cross-firm read that never calls touchFirm writes no line, so QA-499's count reads 0", total() === 0 && (await asBypass("platform.demo.reset", () => db.platformStaff.findMany({ select: { firmId: true } }))).length >= 2 && total() === 0);
  const queued = await requestScope.run({ correlationId: "job:0b12b000-0000-4000-8000-00000000a001", firmId: () => undefined }, () => asJob("messages.outbox_sweep", () => messages.sweep()));
  ok("PF-12b DW1 pass: the outbox sweep writes one platform.bypass line per firm it read, then queues both firms' rows", lines("job:messages.outbox_sweep") === [A, B].sort().map((f) => `${f}:1`).join(",") && queued === 2, { lines: lines("job:messages.outbox_sweep"), queued });
  const line = sql(`select actor || '|' || entity || '|' || entity_key || '|' || (detail->>'method') || '|' || (detail->>'correlationId') from audit_event where action = 'platform.bypass' and detail->>'use' = 'job:messages.outbox_sweep' and detail->>'firmId' = '${A}'`);
  ok("PF-12b DW1 pass: the line names the use, the actor (system:<use>), the firm, the method (none outside a request) and the correlation id", line === `system:job:messages.outbox_sweep|platform_firm|${A}|none|job:0b12b000-0000-4000-8000-00000000a001`, line);
  await resetSampleFirmSettings(db);
  ok("PF-12b DW1 pass: the demo reset writes one line per Sample firm, each in its own firm's trail", lines("platform.demo.reset") === [A, B].sort().map((f) => `${f}:1`).join(","), lines("platform.demo.reset"));
  await requestScope.run({ correlationId: "0b12b000-0000-4000-8000-00000000c0de", firmId: () => undefined }, () => inRequest(inboxRoute, () => inbox.list(INBOX, undefined)));
  ok("PF-12b DW1 pass: the demo inbox writes one line per firm whose mail it listed, with the method and the request's correlation id", lines("platform.demo.inbox") === [A, B].sort().map((f) => `${f}:1`).join(",") && sql(`select string_agg(distinct (detail->>'method') || ':' || (detail->>'correlationId'), ',') from audit_event where detail->>'use' = 'platform.demo.inbox'`) === "GET:0b12b000-0000-4000-8000-00000000c0de");
  ok("PF-12b DW1 pass/fail: firm A's trail shows its own lines only, never firm B's (and B's the same)", sql(`select count(*) from audit_event where action = 'platform.bypass' and detail->>'firmId' = '${A}' and entity_key <> '${A}'`) === "0" && sql(`select count(*) from audit_event where action = 'platform.bypass' and detail->>'firmId' = '${A}'`) === "3" && sql(`select count(*) from audit_event where action = 'platform.bypass' and detail->>'firmId' = '${B}'`) === "3");
  sql(`delete from platform_firm_web_address where firm_id in ('${A}', '${B}')`);
  const catchUp = new WebAddressCatchUp(db as never); catchUp.onApplicationBootstrap(); const caught = await catchUp.done;
  ok("PF-12b DW1 pass (catch-up): the start-up catch-up writes one line per firm it gave an address, in that firm's own transaction (with its firm.web_address.set line)", caught?.results.length === 2 && lines("platform.web-address.catch-up") === [A, B].sort().map((f) => `${f}:1`).join(",") && sql(`select count(*) from (select xmin from audit_event where detail->>'firmId' = '${A}' and action in ('firm.web_address.set', 'platform.bypass') and (action <> 'platform.bypass' or detail->>'use' = 'platform.web-address.catch-up') group by xmin) x`) === "1", { caught, lines: lines("platform.web-address.catch-up") });
  const tx0 = {}; const rec = fakeAudit(); const was0 = onBypassAudit(rec);
  await asBypass("platform.demo.reset", async () => { await touchFirm(tx0, A); await touchFirm(tx0, A); await touchFirm(tx0, B); });
  await touchFirm({}, A);   // outside a bypass use: nothing crossed a wall
  onBypassAudit(was0);
  ok("PF-12b DW1 pass: one line per firm and transaction (a second touch of the same firm adds none); outside a bypass use touchFirm writes nothing", rec.entries.length === 2 && rec.entries.map((e) => e.firmId).join(",") === `${A},${B}`, rec.entries);

  // Break M1, M2, m3, m4 (the breaker's report, screens/PF-12b/break-report.md).
  const nested = await errOf(() => inRequest(inboxRoute, () => asBypass("platform.demo.inbox", () => asBypass("platform.identity.authenticate", () => db.platformStaff.findMany()))));
  ok("PF-12b fail (break M1): a bypass use inside another is refused before any query (it would cross under the outer use's lines)", nested instanceof BypassRefused, String(nested));
  const spoof = fakeAudit(), wasS = onBypassAudit(spoof);
  await requestScope.run({ correlationId: "Jane.Doe.passport.lost", firmId: () => undefined }, () => asBypass("platform.demo.reset", async () => { await touchFirm({}, A); }));
  await requestScope.run({ correlationId: "job:Jane.Doe.passport.lost", firmId: () => undefined }, () => asBypass("platform.demo.reset", async () => { await touchFirm({}, B); }));
  await requestScope.run({ correlationId: "0b12b000-0000-4000-8000-00000000beef", firmId: () => undefined }, () => asBypass("platform.demo.reset", async () => { await touchFirm({}, A); }));
  const clientErr = await errOf(() => asBypass("platform.demo.reset", () => touchFirm(db, A)));
  const tx4 = {};
  await asBypass("platform.demo.reset", () => Promise.all([touchFirm(tx4, A), touchFirm(tx4, A), touchFirm(tx4, A)]));
  onBypassAudit(wasS);
  ok("PF-12b fail (break M2): a caller's X-Request-Id that is not our id shape (free text, or free text after job:) is never kept in the trail (null); a uuid is kept", spoof.entries[0]?.detail.correlationId === null && spoof.entries[1]?.detail.correlationId === null && spoof.entries[2]?.detail.correlationId === "0b12b000-0000-4000-8000-00000000beef", spoof.entries.map((e) => e.detail));
  ok("PF-12b fail (break m3): touchFirm refuses the client in place of a transaction (its line would commit alone)", clientErr instanceof FirmScopeError, String(clientErr));
  ok("PF-12b pass (break m4): three touches of one firm at the same moment in one transaction write one line", spoof.entries.length === 4, spoof.entries.length);

  // ---------------------------------------------------------------------------------------------------------- DW2
  const refusing = fakeAudit({ failOn: (e) => e.action === "platform.bypass" });
  sql(`insert into platform_firm_setting (firm_id, key, value, changed_by, changed_at) values ('${A}', 'platform.language', '"fr"', 'test', now()) on conflict (firm_id, key) do update set value = '"fr"'`);
  const settingLines = () => sql(`select count(*) from audit_event where action = 'platform.setting.change'`);
  const beforeLines = settingLines(), beforeJobs = jobs.jobs.length;
  const was = onBypassAudit(refusing);
  const resetErr = await errOf(() => resetSampleFirmSettings(db));
    await clock.advance({ hours: 2 });   // a new hour: the sweep's job keys are new, so only the refusal can stop them
  const sweepErr = await errOf(() => asJob("messages.outbox_sweep", () => messages.sweep()));
  const inboxErr = await errOf(() => inRequest(inboxRoute, () => inbox.list(INBOX, undefined)));
  onBypassAudit(was);
  ok("PF-12b DW2 fail: a line that cannot be written refuses the demo reset; firm A's setting is unchanged and no setting line is stored (rolled back)", plain(resetErr) && sql(`select value::text from platform_firm_setting where firm_id = '${A}' and key = 'platform.language'`) === '"fr"' && settingLines() === beforeLines, { resetErr: String(resetErr), value: sql(`select value::text from platform_firm_setting where firm_id = '${A}' and key = 'platform.language'`) });
  ok("PF-12b DW2 fail: the sweep is refused and queues nothing (a job fails and is retried)", sweepErr instanceof BypassNotRecorded && (jobs.jobs.length) === beforeJobs, { sweepErr: String(sweepErr) });
  const onlyB = fakeAudit({ failOn: (e) => e.action === "platform.bypass" && e.firmId === B }), wasB = onBypassAudit(onlyB);
  await clock.advance({ hours: 1 });
  const jobsBefore = jobs.jobs.length, partErr = await errOf(() => asJob("messages.outbox_sweep", () => messages.sweep()));
  onBypassAudit(wasB);
  const newJobs = jobs.jobs.slice(jobsBefore).map((j) => (j.payload as { firmId: string }).firmId);
  ok("PF-12b DW2 fail (break m6): when only firm B's line fails, B's rows are not queued, A's are (with A's line), and the sweep then fails", partErr instanceof BypassNotRecorded && JSON.stringify(newJobs) === JSON.stringify([A]) && onlyB.entries.map((e) => e.firmId).join(",") === A, { partErr: String(partErr), newJobs, lines: onlyB.entries.map((e) => e.firmId) });
  ok("PF-12b DW2 fail: a request (the demo inbox) answers 500 in plain words, and no line was stored for it", plain(inboxErr) && lines("platform.demo.inbox") === [A, B].sort().map((f) => `${f}:1`).join(","), String(inboxErr));
  await resetSampleFirmSettings(db);
  ok("PF-12b DW2 pass: with the trail writable again the same reset runs (A's setting back to its default, one more line per firm)", sql(`select value::text from platform_firm_setting where firm_id = '${A}' and key = 'platform.language'`) === '"en"' && lines("platform.demo.reset") === [A, B].sort().map((f) => `${f}:2`).join(","));

  // ---------------------------------------------------------------------------------------------------------- DW4
  const identity = new LocalSignUp(() => clock.now());
  const ports: SignUpPorts = { audit: auditEvent, billing: fakeBilling({ prices: [] }), identity, mail: fakeMail({ clock }), clock, appUrl: "https://app.expatready.test" };
  const s = new FirmSignUp(db, ports);
  const p = await s.plans(); await clock.advance({ seconds: 5 });
  const form = { email: "owner@pf12b.example.com", password: "correct horse battery staple 77", firmName: "PF12b Immigration", countryCode: "CA", acceptedTerms: p.terms.map((t) => t.id), formStamp: p.formStamp, planCode: p.defaultPlan };
  await s.signUp(form, "10.12.0.1"); await s.settled();
  const link = identity.sent.find((m) => m.to === form.email)?.text ?? "";
  const token = /token=([A-Za-z0-9_-]{43})/.exec(link)?.[1] ?? "", code = /code=(\d{6})/.exec(link)?.[1] ?? "";
  const firmsBefore = sql(`select count(*) from platform_firm`), signupBefore = lines("platform.firms.signup");
  const badErr = await errOf(() => s.verify({ token: "x".repeat(43), code }, "10.12.0.2"));
  ok("PF-12b DW4 fail: a refused verify (an unknown link) makes no firm and writes no line", badErr !== null && sql(`select count(*) from platform_firm`) === firmsBefore && lines("platform.firms.signup") === signupBefore, String(badErr));
  const was4 = onBypassAudit(refusing);
  const rolled = await errOf(() => s.verify({ token, code }, "10.12.0.3"));
  onBypassAudit(was4);
  ok("PF-12b DW4 fail: when the new firm's line cannot be written, the verify is refused and the firm is not made (the same transaction)", plain(rolled) && sql(`select count(*) from platform_firm`) === firmsBefore && sql(`select count(*) from platform_signup_pending where email = '${form.email}' and used_at is null`) === "1", String(rolled));
  const made = await s.verify({ token, code }, "10.12.0.4");
  const newFirm = sql(`select id from platform_firm where key = '${made.firmKey}'`);
  ok("PF-12b DW4 pass: a verify writes its one line under the new firm, in the transaction that creates it (the same transaction id as firm.created)", lines("platform.firms.signup") === `${newFirm}:1` && sql(`select count(distinct xmin::text) from audit_event where detail->>'firmId' = '${newFirm}' and action in ('firm.created', 'platform.bypass')`) === "1", { lines: lines("platform.firms.signup"), newFirm });
  const staffA = sql(`select email from platform_staff where firm_id = '${A}' order by email limit 1`);
  const p2 = await s.plans(); await clock.advance({ seconds: 5 });
  await s.signUp({ ...form, email: staffA, formStamp: p2.formStamp }, "10.12.0.5"); await s.settled();
  ok("PF-12b DW4 pass: a sign-up with firm A's staff email (the lookup read A's staff) writes A's line before the 'already have an account' email", lines("platform.firms.signup").split(",").includes(`${A}:1`), lines("platform.firms.signup"));

  // ---------------------------------------------------------------------------------------------------------- DW7
  const before7 = total();
  await inRequest({ method: "GET", path: "/api/public/forms/abc" }, () => asBypass("fo.sales.web-form", () => db.foWebForm.findMany({ take: 1 })));
  await asJob("platform.signup.purge", () => s.purgeExpired());
  ok("PF-12b DW7 pass: an own-firm door (the web form's lookup) and the purge (no firm) add no line", total() === before7, { before7, after: total() });
  const expected = { "job:messages.outbox_sweep": 2, "platform.demo.reset": 4, "platform.demo.inbox": 2, "platform.firms.signup": 2, "platform.web-address.catch-up": 2 };
  const byUse = Object.fromEntries(sql(`select detail->>'use' || '=' || count(*) from audit_event where action = 'platform.bypass' group by detail->>'use' order by 1`).split("\n").filter(Boolean).map((l) => l.split("=")).map(([k, v]) => [k, Number(v)]));
  ok("PF-12b DW7 pass: QA-499's count equals the uses × firms touched (sweep 2, reset 2 × 2, inbox 2, sign-up 2, catch-up 2), no door among them", JSON.stringify(byUse) === JSON.stringify(Object.fromEntries(Object.entries(expected).sort())) && !DOORS.some((d) => d in byUse), byUse);
} finally {
  for (const c of clients) await c.$disconnect().catch(() => {});
  for (const p of pools) await p.end().catch(() => {});
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for the next run's drop */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
