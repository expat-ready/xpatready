// PF-5 part 4 (brief design/briefs/track-b/PF-5-4.md; R1.105; SA-2-6, SA-2-38, SA2-D13; P-799): the 90-day payment-hold
// clock and its departure notices, a pass and a fail per Done when line (DW20-DW25). A scratch database (removed), the
// Sample firms, a fake clock and fake mail; the hold is the same firm.payment_hold event and firm status webhook.ts writes.
// No server, no browser, no model call (US$0).
//   tsx studio/tests/check_pf5_exit_clock.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeBilling } from "../ports/billing.ts";
import { FakeClock } from "../ports/clock.ts";
import { EVENT } from "../ports/events.ts";
import { fakeJobs } from "../ports/jobs.ts";
import { fakeMail, type MailPort } from "../ports/mail.ts";
import { MessageRefused } from "../ports/messages.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BREW = "/opt/homebrew/opt/postgresql@18/bin", bin = (n: string) => (existsSync(join(BREW, n)) ? join(BREW, n) : n);
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf5x_${process.pid}`, urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(bin("psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 700)}` : ""}`); };

execFileSync(bin("dropdb"), [...PG, "--if-exists", DB]); execFileSync(bin("createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(bin("psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_LOCAL_SECRET"]) delete process.env[k];
process.env.PLATFORM_ENVIRONMENT = "local";   // PF-24w: required, no default (the feature file loads the messages pipeline)

const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const { BillingAccount, DELETION_DAYS } = await import("../api/src/platform/billing/account.ts");
const { EXIT_NOTICE_DAYS, dueNotice, exitClock } = await import("../api/src/platform/billing/exit-clock.ts");
const { EXIT_NOTICE_CRON, EXIT_NOTICE_QUEUE, EXIT_NOTICE_ZONE, ExitNotices, exitNoticeWords } = await import("../api/src/platform/billing/exit-notices.ts");
const { BYPASS_USES, withFirm } = await import("../api/src/platform/firm-scope.ts");
const exitFeature = (await import("../api/src/features/platform-billing-exit.ts")).default;

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const DAY = 86_400_000, T0 = new Date("2026-12-01T15:00:00Z"), at = (d: number, h = 1) => new Date(T0.getTime() + d * DAY + h * 3_600_000);
const fake = new FakeClock(T0.toISOString());
let failFor: string | null = null;
const mail = fakeMail({ failOn: (m) => failFor !== null && m.to === failFor });
const APP = "https://app.example.test";
const notices = new ExitNotices({ db, mail, audit: auditEvent, now: () => fake.now(), appUrl: APP });
const run = async (d: number, h = 1) => { await fake.set(at(d, h)); return notices.sweep(); };
const firmOf = (key: string) => sql(`select id from platform_firm where key = '${key}'`);
const sentTo = (firm: string) => mail.sent.filter((m) => "firmId" in m && m.firmId.toLowerCase() === firm);
const daysSent = (firm: string) => sql(`select coalesce(string_agg(detail->>'day', ',' order by (detail->>'day')::int), '') from audit_event where firm_id = '${firm}' and action = 'firm.exit_notice_sent'`);
const hold = (firm: string, when: Date) => { sql(`update platform_firm set status = 'PAYMENT_HOLD' where id = '${firm}'`); sql(`insert into module_event (id, firm_id, type, subject_id, payload, occurred_at) values (gen_random_uuid(), '${firm}', '${EVENT.FIRM_PAYMENT_HOLD}', '${firm}', '{"firmId":"${firm}","reason":"stripe unpaid"}', '${when.toISOString()}')`); };
const emailsWith = (firm: string, roles: string) => sql(`select coalesce(string_agg(distinct s.email, ',' order by s.email), '') from platform_staff s join platform_role_grant g on g.staff_id = s.id and g.ended_at is null where s.firm_id = '${firm}' and s.status = 'ACTIVE' and g.role in (${roles})`).split(",").filter(Boolean);
const FORBIDDEN = [/legal obligation/i, /required by law/i, /\bCollege\b|\bIRCC\b|\bCICC\b|regulator|law society/i, /\b\d+\s*(years?|yrs?)\b/i, /\bs\.\s*\d|section \d/i];

try {
  await seedSampleFirms(db);
  const A = firmOf("sample-firm"), B = firmOf("sample-solo");
  // One Admin in firm A (a Case Officer given ADMIN as well), one Case Officer left as only that, and a billing email of no staff member.
  const officers = sql(`select s.id from platform_staff s join platform_role_grant g on g.staff_id = s.id and g.ended_at is null and g.role = 'CASE_OFFICER' where s.firm_id = '${A}' order by s.id`).split("\n").filter(Boolean);
  const caseManager = sql(`select s.id from platform_staff s join platform_role_grant g on g.staff_id = s.id and g.ended_at is null and g.role = 'CASE_MANAGER' where s.firm_id = '${A}' and not exists (select 1 from platform_role_grant o where o.staff_id = s.id and o.role = 'OWNER') order by s.id limit 1`);
  const adminId = caseManager || officers[1];
  sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${A}', '${adminId}', 'ADMIN', 'seed:PF-5-4')`);
  sql(`update platform_firm set billing_email = 'accounts@sample-firm.example' where id = '${A}'`);
  const ownersA = emailsWith(A, "'OWNER'"), adminsA = emailsWith(A, "'ADMIN'"), onlyOfficerA = sql(`select s.email from platform_staff s where s.firm_id = '${A}' and not exists (select 1 from platform_role_grant g where g.staff_id = s.id and g.ended_at is null and g.role in ('OWNER', 'ADMIN'))`).split("\n").filter(Boolean);
  const staffB = sql(`select email from platform_staff where firm_id = '${B}'`).split("\n").filter(Boolean);
  ok("setup: firm A has an Owner, an Admin and a staff member who is neither; firm B has staff", ownersA.length >= 1 && adminsA.length === 1 && onlyOfficerA.length >= 1 && staffB.length >= 1, { ownersA, adminsA, onlyOfficerA, staffB });

  // ------------------------------------------------------------------------------------------- the one constant
  ok("P-799 pass: EXIT_NOTICE_DAYS is day 0 then days 16, 46 and 83 of the hold, inside the 90 days", EXIT_NOTICE_DAYS.join() === "0,16,46,83" && DELETION_DAYS === 90 && Object.isFrozen(EXIT_NOTICE_DAYS));
  {
    const jc = new FakeClock("2026-12-01T05:00:00Z"), jobs = fakeJobs(jc);   // 00:00 Toronto; its own clock, so no sweep runs on the checks' clock
    await new ExitNotices({ db, mail, audit: auditEvent, now: () => jc.now(), appUrl: APP }).register(jobs);
    await jc.set("2026-12-01T11:40:00Z"); const early = jobs.jobs.filter((j) => j.name === EXIT_NOTICE_QUEUE).length;
    await jc.set("2026-12-01T11:50:00Z"); const first = jobs.jobs.filter((j) => j.name === EXIT_NOTICE_QUEUE).length;
    const zoneOk = EXIT_NOTICE_ZONE === "America/Toronto" && /^45 6-22 \* \* \*$/.test(EXIT_NOTICE_CRON);
    ok("job pass: the sweep is on PF-14's runner, hourly 06:45-22:45 Toronto (outside 01:00-03:00 in every Canadian zone)", zoneOk && early === 0 && first === 1, { early, first });
    ok("job fail: its bypass use is on the named list, outside a request only, audited per firm", BYPASS_USES[`job:${EXIT_NOTICE_QUEUE}`]?.outside === true && BYPASS_USES[`job:${EXIT_NOTICE_QUEUE}`]?.audit === "per-firm" && BYPASS_USES[`job:${EXIT_NOTICE_QUEUE}`]?.routes.length === 0);
  }

  {
    const p = (exitFeature.providers ?? []) as { provide?: unknown; inject?: unknown[] }[];
    ok("feature pass: platform-billing-exit.ts registers ExitNotices (with the billing ports, the messages mail and PF-14's runner) and no route", p.length === 1 && p[0].provide === ExitNotices && (p[0].inject?.length ?? 0) === 4 && !("controllers" in exitFeature), p.length);
  }

  // --------------------------------------------------------------------------- DW24: no clock, no notice
  await run(0);
  ok("PF-5 DW24 pass: an ACTIVE firm has no clock (exitClock null) and gets no notice", (await exitClock(db, A)) === null && (await exitClock(db, B)) === null && mail.sent.length === 0, mail.sent.length);
  for (const status of ["SECURITY_LOCK", "DELETED"] as const) {
    hold(B, at(-1)); sql(`update platform_firm set status = '${status}' where id = '${B}'`);
    const r = await withFirm(B, () => notices.runFirm(B)); await run(0);
    ok(`PF-5 DW24 fail: a ${status} firm with a hold event has no clock and gets no notice (run directly and by the sweep)`, (await exitClock(db, B)) === null && r.sent === null && sentTo(B).length === 0 && daysSent(B) === "", { r, n: sentTo(B).length });
    sql(`update platform_firm set status = 'ACTIVE' where id = '${B}'`);
  }

  // ------------------------------------------------------------------------------------------ DW20: day 0
  hold(A, T0);
  const r0 = await run(0), first = sentTo(A), to = first.map((m) => m.to).sort();
  const want = [...ownersA, ...adminsA, "accounts@sample-firm.example"].sort();
  ok("PF-5 DW20 pass: a hold starts → the day-0 notice goes once to the Owner, the Admin and the billing email", r0.sent === 1 && JSON.stringify(to) === JSON.stringify(want) && daysSent(A) === "0", { r0, to, want });
  ok("PF-5 DW20 fail: never to a staff member who is neither Owner nor Admin, nor to firm B's staff", !to.some((t) => onlyOfficerA.includes(t) || staffB.includes(t)) && sentTo(B).length === 0, to);
  const deletion = new Date(T0.getTime() + 90 * DAY), words = first[0];
  ok("PF-5 DW20 pass (SA-2-38): its text has the deletion date and the billing page", words.text.includes("1 Mar 2027") && words.subject.length > 0 && words.text.includes(`${APP}/settings/billing`) && deletion.toISOString().startsWith("2027-03-01"), words.text);
  ok("PF-5 DW20 fail (SA2-D13): no \"legal obligation\", regulator name, number of years or section in any notice's subject or text", first.every((m) => !FORBIDDEN.some((re) => re.test(`${m.subject}\n${m.text}`))), first[0].text);
  ok("PF-5 DW20 pass: a staff email is SERVICE and names its person; the billing email (no staff member) names none",
    first.filter((m) => m.to !== "accounts@sample-firm.example").every((m) => m.class === "SERVICE" && m.person?.kind === "STAFF") && first.filter((m) => m.to === "accounts@sample-firm.example").every((m) => m.class === "TRANSACTIONAL" && !m.person), first.map((m) => [m.class, m.person?.kind]));
  ok("PF-5 DW20 pass: the audit line names the day, the deletion date and the job (system actor)", sql(`select actor || '|' || entity || '|' || (detail->>'deletionDate') from audit_event where firm_id = '${A}' and action = 'firm.exit_notice_sent'`) === `system:platform.billing.exit_notices|platform_firm|${deletion.toISOString()}`);

  // --------------------------------------------------------------------------- DW21: days 16, 46, 83 once each
  await run(0, 5);
  ok("PF-5 DW21 fail: the job run again on day 0 sends nothing new", sentTo(A).length === first.length && daysSent(A) === "0", sentTo(A).length);
  await run(15, 23);
  ok("PF-5 DW21 fail: day 15 (late in the day) sends nothing", sentTo(A).length === first.length && daysSent(A) === "0");
  await run(16); const n16 = sentTo(A).length; await run(16, 8);
  ok("PF-5 DW21 pass: day 16 sends the warning once, to the same people; a second run that day sends nothing", n16 === first.length * 2 && sentTo(A).length === n16 && daysSent(A) === "0,16" && sentTo(A).slice(first.length).every((m) => /permanently deleted on 1 Mar 2027/.test(m.subject)), { n16, now: sentTo(A).length });

  // ------------------------------------------------------------------- DW23: paid on day 20, then a new hold
  sql(`update platform_firm set status = 'ACTIVE' where id = '${A}'`);
  await run(20); await run(46); await run(83);
  ok("PF-5 DW23 pass: paid on day 20 → no more notices (days 46 and 83 send nothing) and no clock", sentTo(A).length === n16 && daysSent(A) === "0,16" && (await exitClock(db, A)) === null, sentTo(A).length);
  hold(A, at(100, 0)); await run(100);
  const c2 = await exitClock(db, A);
  ok("PF-5 DW23 fail: a later hold starts a new clock: its own day 0 is sent, with its own deletion date", sentTo(A).length === n16 + first.length && c2?.noticesSent.map((n) => n.day).join() === "0" && c2.deletionDate.getTime() === at(190, 0).getTime() && daysSent(A) === "0,0,16", { c2, days: daysSent(A) });

  // ---------------------------------------------------------------------- DW22: the job down, then catch-up
  hold(B, T0);
  failFor = staffB.sort()[0];
  const down = await run(0);
  ok("PF-5 DW22 fail: a send that fails leaves no audit line (the notice counts as not sent)", down.failed === 1 && daysSent(B) === "", down);
  failFor = null;
  const before0 = sentTo(B).length; await run(0, 3);
  ok("PF-5 DW22 pass: the next run sends the rest once (the one already sent is not sent again) and records day 0", daysSent(B) === "0" && new Set(sentTo(B).map((m) => m.idempotencyKey)).size === sentTo(B).length && sentTo(B).length > before0, sentTo(B).map((m) => m.idempotencyKey));
  const perNotice = new Set(sentTo(B).map((m) => m.to)).size;
  await run(21);
  ok("PF-5 DW22 pass: the job down on days 16-20 → day 21 sends the day-16 warning once", daysSent(B) === "0,16" && sentTo(B).length === perNotice * 2, daysSent(B));
  await run(46); await run(46, 9);
  ok("PF-5 DW21 pass: day 46 sends once (twice in a day: once)", daysSent(B) === "0,16,46" && sentTo(B).length === perNotice * 3);
  await run(90, 0); await run(95);
  ok("PF-5 DW22 fail: the job down from day 47 to the deletion date → nothing is sent on or after it (day 83 is never sent late)", daysSent(B) === "0,16,46" && sentTo(B).length === perNotice * 3, daysSent(B));
  {
    const c = { holdSince: T0, holdSeq: "1", reason: "payment needed" as const, deletionDate: new Date(T0.getTime() + 90 * DAY), noticesSent: [] as { day: number; sentAt: Date }[] };
    ok("PF-5 DW22 pass: down for the whole hold → only the newest due notice is sent (day 84 → day 83, never 0, 16 or 46 late)", dueNotice(c, at(84)) === 83 && dueNotice(c, at(45, 23)) === 16 && dueNotice(c, at(-1)) === null && dueNotice(c, c.deletionDate) === null);
  }
  hold(B, at(200, 0)); await run(283); await run(283, 6);
  ok("PF-5 DW21 pass: day 83 sends once (here the newest due after a run on day 283 of a new hold, and once only)", daysSent(B).endsWith(",83") && daysSent(B).split(",").filter((d) => d === "83").length === 1, daysSent(B));

  // ------------------------------------------------------------- DW25: the clock agrees with the billing page
  {
    const acct = new BillingAccount(db, { audit: auditEvent, billing: fakeBilling({ prices: [] }), clock: fake, appUrl: APP });
    const who = (f: string) => ({ staffId: "0f5a0000-0000-4000-8000-0000000000aa", firmId: f, firmKey: "k", roles: ["OWNER"], keys: [], duties: [], authTime: 0, via: "local" as const });
    const view = await withFirm(A, () => acct.view(who(A) as never)), c = await exitClock(db, A);
    ok("PF-5 DW25 pass: exitClock's deletion date equals the billing page's hold deletion date for the same firm", !!c && !!view.hold && c.deletionDate.getTime() === new Date(view.hold.deletionDate).getTime() && c.holdSince.getTime() === new Date(view.hold.since).getTime(), { c, hold: view.hold });
    const cB = await exitClock(db, B), seqB = cB!.holdSeq, mailedDays = [...new Set(sentTo(B).map((m) => m.idempotencyKey!).filter((k) => k.includes(`:${seqB}:`)).map((k) => Number(/:day-(\d+):/.exec(k)![1])))].sort((x, y) => x - y);
    ok("PF-5 DW25 fail: noticesSent lists exactly the notices sent for the current hold (not an earlier hold's), each with the clock's time", cB!.noticesSent.map((n) => n.day).join() === mailedDays.join() && mailedDays.join() === "83" && cB!.noticesSent[0].sentAt.getTime() === at(283).getTime(), { sent: cB!.noticesSent, mailedDays });
  }

  // ------------------------------------------ review round 1: a refused address, the firm's calendar, the address hold
  {
    const ownerA = ownersA[0];
    const refusing: MailPort = { async send(m) { if (m.to === ownerA) throw new MessageRefused("this address is suppressed (a hard bounce)"); return mail.send(m); } };
    const n = new ExitNotices({ db, mail: refusing, audit: auditEvent, now: () => fake.now(), appUrl: APP });
    const before = sentTo(A).length; await fake.set(at(116));
    const r = await withFirm(A, () => n.runFirm(A)), got = sentTo(A).slice(before).map((m) => m.to).sort();
    const line = sql(`select (detail->>'refused') || '/' || (detail->>'recipients') from audit_event where firm_id = '${A}' and action = 'firm.exit_notice_sent' and detail->>'day' = '16' and entity_key like '%:${c2!.holdSeq}:%'`);
    ok("review M1 pass: an address that is always refused never holds back the others: they get the warning and the notice is recorded with 1 refused",
      r.sent === 16 && r.refused === 1 && !got.includes(ownerA) && got.length === want.length - 1 && line === `1/${want.length}`, { r, got, line });
    await fake.set(at(116, 5)); const again = await withFirm(A, () => n.runFirm(A));
    ok("review M1 fail: the next run sends nothing more for that notice (the refusal is final)", again.sent === null && sentTo(A).length === before + want.length - 1, again);
  }
  {
    const evening = { deletionDate: new Date(new Date("2026-12-01T02:00:00Z").getTime() + 90 * DAY), reason: "payment needed" as const };
    const toronto = exitNoticeWords(16, evening, "America/Toronto", APP), utc = exitNoticeWords(16, evening, "UTC", APP);
    ok("review M2 pass/fail: a hold that starts on 30 Nov at 21:00 Toronto names 28 Feb 2027 on the firm's calendar (UTC would say 1 Mar)", toronto.subject.endsWith("28 Feb 2027") && utc.subject.endsWith("1 Mar 2027"), [toronto.subject, utc.subject]);
    const addr = exitNoticeWords(0, { ...evening, reason: "business address needed" }, "America/Toronto", APP), pay = exitNoticeWords(0, evening, "America/Toronto", APP);
    ok("review m2 pass/fail: a hold for the business address says to add the address; a payment hold says to add a card or pay", /add your firm's business address/.test(addr.text) && !/add a card/.test(addr.text) && /add a card or pay the open invoice/.test(pay.text), addr.text);
  }
  {
    // review m3: three sweeps and a direct run at the same time on the same due notice → one line, one mail per recipient.
    const before = sentTo(A).length; await fake.set(at(146));
    await Promise.all([notices.sweep(), notices.sweep(), notices.sweep(), withFirm(A, () => notices.runFirm(A))]);
    const lines = sql(`select count(*) from audit_event where firm_id = '${A}' and action = 'firm.exit_notice_sent' and detail->>'day' = '46' and entity_key like '%:${c2!.holdSeq}:%'`);
    const keys = sentTo(A).slice(before).map((m) => m.idempotencyKey);
    ok("review m3 pass: concurrent runs write one audit line for the notice and send each recipient once", lines === "1" && keys.length === want.length && new Set(keys).size === keys.length, { lines, keys: keys.length });
  }
  ok("review m4 fail (SA2-D13): no notice of the whole run, any day or firm, says \"legal obligation\", a regulator, a number of years or a section", mail.sent.length >= 15 && mail.sent.every((m) => !FORBIDDEN.some((re) => re.test(`${m.subject}\n${m.text}`))), mail.sent.length);
} catch (e) {
  ok("PF-5 part 4: the check ran to the end", false, e instanceof Error ? e.stack : String(e));
} finally {
  await db.$disconnect();
  try { execFileSync(bin("dropdb"), [...PG, "--if-exists", DB]); } catch { /* left for the next run's drop */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
