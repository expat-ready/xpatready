// FO-2 (BACKLOG row FO-2 and its rev 15.1 amendment; brief design/lead-b-briefs/FO-2.md; contracts §2.1, §7 binding;
// AG-2-5, -8a, -13c, -49, -84, -86): leads and the public web form. Part 1: the arrival path, the public door (token,
// allowed site, honeypot, minimum fill time, limits, size), the lead lists and one lead, Take it and Assign (part 2:
// Add a lead by hand, Close, Reopen, Engage and prospects); each Done-when line with a pass and a fail. One scratch
// database with every migration and the Sample firms (PF-3's seed, then FO-1a's), dropped at the end. No server, no
// browser, no model call (US$0).
//   tsx studio/tests/check_fo2_leads_prospects.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeAudit } from "../ports/audit.ts";
import { EVENT } from "../ports/events.ts";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { Leads } from "../api/src/front-office/sales/leads.ts";
import { LIMITS, PublicForms, PublicFormsController, publicFormBodyLimit, type SalesPorts } from "../api/src/front-office/sales/public.ts";
import express from "express";
import type { AddressInfo } from "node:net";
import { SalesController } from "../api/src/front-office/sales/routes.ts";
import { auditEvent, platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";
import { assertEveryRouteDeclared } from "../api/src/platform/identity/guard.ts";
import { dutiesOf, PLATFORM_ACCESS, type StaffContext } from "../api/src/platform/identity/keys.ts";
import { ConsentStore } from "../api/src/platform/messages/consent/consent-store.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../api/src/platform/settings.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo2_${process.pid}`, URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;
const SITE = "https://maple.example", OWN = "http://localhost:4400";

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const sql = (q: string) => execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8" }).trim();
/** The status and body a refused call gives (HttpException), or null when it did not throw. */
async function refusal(fn: () => Promise<unknown>): Promise<{ status: number; body: Record<string, unknown> } | null> {
  try { await fn(); return null; } catch (e) {
    const x = e as { getStatus?: () => number; getResponse?: () => unknown };
    if (!x.getStatus) throw e;
    return { status: x.getStatus(), body: x.getResponse!() as Record<string, unknown> };
  }
}
const count = (t: string, where = "true") => Number(sql(`select count(*) from ${t} where ${where}`));

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_, options: "-c TimeZone=UTC" }) });
try {
  for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
  await seedSampleFirms(db);
  const fo = await seedSampleFirmsFrontOffice(db);
  ok("FO-2 setup: both Sample firms have a front office", fo.results.length === 2 && fo.failed.length === 0, fo);

  const firm = (key: string) => sql(`select id from platform_firm where key = '${key}'`);
  const A = firm("sample-firm"), S = firm("sample-solo");
  const ctxOf = (actorId: string, keysOverride?: string[]): StaffContext => {
    const [id, firmId] = sql(`select id || '|' || firm_id from platform_staff where actor_id = '${actorId}'`).split("|");
    const roles = sql(`select string_agg(role::text, ',') from platform_role_grant where staff_id = '${id}'`).split(",");
    const keys = keysOverride ?? sql(`select string_agg(distinct permission_key, ',') from platform_role_permission where role::text = any(string_to_array('${roles.join(",")}', ','))`).split(",");
    return { staffId: id, firmId, firmKey: firmId === A ? "sample-firm" : "sample-solo", roles, keys, duties: dutiesOf(new Set(keys)), authTime: 0, via: "local" };
  };
  const R = ctxOf("user-R"), O = ctxOf("user-O"), T = ctxOf("user-T"), SOLO = ctxOf("user-S");

  let clock = Date.parse("2026-11-16T10:00:00Z");
  const consent = new ConsentStore(auditEvent);
  const ports: SalesPorts = { audit: auditEvent, consent, now: () => clock, publicOrigin: OWN, formKey: Buffer.from("fo2-test-stamp-key (Sample, not a secret)") };
  const forms = new PublicForms(db, ports), leads = new Leads(db, ports);
  const wording = await db.$transaction((tx) => consent.publishWording(tx, { firmId: A, channel: "EMAIL", purpose: "MARKETING", locale: "en", text: "Send me news and offers from the firm by email. I can stop at any time. (Sample)", by: "seed:FO-2-test" }));
  const tokenA = sql(`update fo_web_form set enabled = true, consent_wording_version_id = '${wording.id}', allowed_sites = '{${SITE}}' where firm_id = '${A}' returning public_token`);
  const tokenS = sql(`select public_token from fo_web_form where firm_id = '${S}'`);
  // A fresh database has no released combination, so the firm adds its own service (AG-16-76: a firm may add its own).
  const service = sql(`insert into fo_service (firm_id, label, sort_order, created_by) values ('${A}', 'Work permit (Sample)', 1, 'seed:FO-2-test') returning id`);

  let ipN = 0;
  const req = (o: { ip?: string; origin?: string | null; length?: number } = {}) => ({ ip: o.ip ?? `198.51.100.${(ipN++ % 200) + 1}`, headers: { ...(o.origin === null ? {} : { origin: o.origin ?? SITE }), ...(o.length ? { "content-length": String(o.length) } : {}) } });
  const drawn = async (token = tokenA, r = req()) => { const f = await forms.read(token, r); clock += 3000; return f; };
  const post = async (fields: Record<string, unknown>, o: { token?: string; ip?: string; origin?: string | null; form?: Awaited<ReturnType<typeof drawn>> } = {}) => {
    const f = o.form ?? (await drawn(o.token ?? tokenA));
    return forms.submit(o.token ?? tokenA, { submissionId: f.submissionId, loadStamp: f.loadStamp, ...fields }, req({ ip: o.ip, origin: o.origin }));
  };
  const lena = { givenNames: "Lena", familyName: "Park", email: "lena@example.org", phone: "+1 416 555 0101", interestedIn: service, message: "I need an LMIA. <script>alert(1)</script>", consent: true };

  // ---------------------------------------------------------------------------------------------- the public door
  const csp: string[] = [];
  const page = await forms.read(tokenA, req(), { setHeader: (n: string, v: string) => { if (n === "Content-Security-Policy") csp.push(v); } });
  ok("FO-2 pass: the open read gives the form's words, a submissionId and a load stamp", typeof page.submissionId === "string" && /^\d+\.[A-Za-z0-9_-]+$/.test(page.loadStamp) && page.consentText?.includes("Sample") && page.interestedIn.length > 0, page);
  ok("FO-2 pass: the served form carries frame-ancestors naming the allowed site", csp[0] === `frame-ancestors 'self' ${OWN} ${SITE}`, csp);

  const leadsBefore = count("fo_lead"), receiptsBefore = count("fo_arrival_receipt");
  const bot = await post({ ...lena, website: "http://spam.example" });
  ok("FO-2 fail: the honeypot filled → answered like any other (the thank-you text), nothing stored", bot.thankYouText.length > 0 && count("fo_lead") === leadsBefore && count("fo_arrival_receipt") === receiptsBefore, bot);
  const quick = await forms.read(tokenA, req());
  clock += 1000;
  const fast = await forms.submit(tokenA, { submissionId: quick.submissionId, loadStamp: quick.loadStamp, ...lena }, req());
  ok("FO-2 fail: a fill 1 second after the form was drawn → answered like any other, nothing stored", fast.thankYouText === bot.thankYouText && count("fo_lead") === leadsBefore, fast);
  const altered = await forms.submit(tokenA, { submissionId: quick.submissionId, loadStamp: quick.loadStamp.replace(/^\d+/, String(clock - 10_000)), ...lena }, req());
  ok("FO-2 fail: an altered load stamp → answered like any other, nothing stored", altered.thankYouText === bot.thankYouText && count("fo_lead") === leadsBefore);

  const f1 = await drawn();
  const first = await post(lena, { form: f1 });
  const lenaLead = sql(`select id from fo_lead where firm_id = '${A}' order by created_at desc limit 1`);
  ok("FO-2 pass: a fill 3 seconds after → one lead, one receipt CREATED, the answer is the thank-you text", count("fo_lead") === leadsBefore + 1 && sql(`select outcome from fo_arrival_receipt where lead_id = '${lenaLead}'`) === "CREATED" && first.thankYouText === bot.thankYouText);
  await post(lena, { form: f1 });
  ok("FO-2 pass: the same submissionId twice → one lead", count("fo_lead") === leadsBefore + 1 && count("fo_arrival_receipt", `lead_id = '${lenaLead}'`) === 1);
  ok("FO-2 pass: the lead is Unassigned (no owner) with source WEBSITE and the form's name, no stage, type or value", sql(`select coalesce(owner_staff_id::text, 'none') || '|' || source || '|' || source_detail || '|' || state from fo_lead where id = '${lenaLead}'`) === "none|WEBSITE|Website enquiry form|OPEN");
  ok("FO-2 pass: the web form's message is the lead's first note, INTERNAL, stored as plain text", sql(`select visibility || '|' || text from fo_note where lead_id = '${lenaLead}'`) === "INTERNAL|I need an LMIA. <script>alert(1)</script>");
  ok("FO-2 pass: the tick writes one consent row through ConsentPort (FO_PERSON, the form's wording, an address hash, no address)",
    sql(`select count(*) || '|' || min(c.subject_kind::text) || '|' || min(c.wording_id::text) || '|' || (min(length(c.ip_hash)) = 64)::text from msg_consent c join fo_lead l on l.person_id = c.subject_id where l.id = '${lenaLead}'`) === `1|FO_PERSON|${wording.id}|true`);
  ok("FO-2 pass: the phone is kept in E.164", sql(`select phone from fo_person p join fo_lead l on l.person_id = p.id where l.id = '${lenaLead}'`) === "+14165550101");
  const noTick = await post({ givenNames: "Ana", email: "ana@example.org" });
  const anaLead = sql(`select l.id from fo_lead l join fo_person p on p.id = l.person_id where p.email = 'ana@example.org'`);
  ok("FO-2 fail: no tick → the lead with no consent row", !!anaLead && noTick.thankYouText === first.thankYouText && count("msg_consent c join fo_lead l on l.person_id = c.subject_id", `l.id = '${anaLead}'`) === 0);
  ok("FO-2 fail: no email and no phone → refused at the field", (await refusal(() => post({ givenNames: "Nobody" })))?.status === 422);
  ok("FO-2 fail: an unknown field in the body → refused with no internal detail", (await refusal(() => post({ ...lena, isAdmin: true })))?.body.detail === "We could not read this form. Please reload the page and try again.");
  const big = await refusal(() => post({ ...lena, message: "x".repeat(33 * 1024) }));
  ok("FO-2 fail: a body over 32 KB → 413 and nothing saved", big?.status === 413 && count("fo_person", `email = 'lena@example.org'`) === 1, big);

  // AG-2-49 rule 2 at the door itself (the hook in main.ts): refused as it is read, before any parser or handler.
  const spy: unknown[] = [];
  const door = express();
  publicFormBodyLimit(door);
  door.use(express.json({ limit: "5mb" }));   // the app-wide parser after it, as in main.ts
  door.post("/api/public/forms/:token/submissions", (q, r) => { spy.push(q.body); r.status(201).json({}); });
  const srv = door.listen(0, "127.0.0.1");
  await new Promise((done) => srv.once("listening", done));
  const at = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/api/public/forms/${tokenA}/submissions`;
  const send = (body: string, chunked = false) => fetch(at, { method: "POST", headers: { "content-type": "application/json" }, body: chunked ? new Blob([body]).stream() : body, ...(chunked ? { duplex: "half" } : {}) } as RequestInit);
  const big33 = JSON.stringify({ message: "x".repeat(33 * 1024) });
  const r413 = await send(big33), r413c = await send(big33, true), r201 = await send(JSON.stringify({ message: "hello" }));
  ok("FO-2 fail: a 33 KB body → 413 before the handler (the spy saw nothing), also sent in chunks", r413.status === 413 && r413c.status === 413 && (await r413.json()).code === "TOO_LARGE" && spy.length === 1, [r413.status, r413c.status, spy.length]);
  ok("FO-2 pass: a small body reaches the handler, parsed once", r201.status === 201 && (spy[0] as { message?: string })?.message === "hello");
  srv.close();
  // The person known or not: the same answer.
  const known = await post({ ...lena, consent: false }), fresh = await post({ givenNames: "Mo", email: "mo@example.org" });
  ok("FO-2 pass: the answer never says whether the person is known (known and new get the same answer)", JSON.stringify(known) === JSON.stringify(fresh), [known, fresh]);
  const repeat = sql(`select l.id || '|' || l.person_id || '|' || coalesce(l.possible_match_person_id::text, '') from fo_lead l join fo_person p on p.id = l.person_id where p.email = 'lena@example.org' order by l.created_at desc limit 1`).split("|");
  const lenaPerson = sql(`select person_id from fo_lead where id = '${lenaLead}'`);
  ok("FO-2 pass: a repeat enquiry → a new lead flagged as a possible match of the earlier person", repeat[0] !== lenaLead && repeat[2] === lenaPerson);
  ok("FO-2 fail: the repeat is never linked or merged (its own person record)", repeat[1] !== lenaPerson);

  // Allowed sites and an off form.
  ok("FO-2 fail: a page outside the allowed sites → refused", (await refusal(() => post(lena, { origin: "https://evil.example" })))?.status === 403);
  ok("FO-2 fail: no Origin at all → refused", (await refusal(() => post(lena, { origin: null })))?.status === 403);
  ok("FO-2 pass: our own hosted page is allowed", (await post({ givenNames: "Own", email: "own@example.org" }, { origin: OWN })).thankYouText.length > 0);
  sql(`update fo_web_form set enabled = false where firm_id = '${A}'`);
  const off = await refusal(() => forms.read(tokenA, req())), offPost = await refusal(() => forms.submit(tokenA, { ...lena }, req()));
  const unknown = await refusal(() => forms.read("x".repeat(30), req()));
  ok("FO-2 pass: a form that is off → \"This form is not available\" (read and post)", off?.status === 404 && off.body.detail === "This form is not available." && offPost?.body.detail === "This form is not available.");
  ok("FO-2 fail: an unknown token gives the very same answer", JSON.stringify(unknown) === JSON.stringify(off));
  sql(`update fo_web_form set enabled = true where firm_id = '${A}'`);

  // Limits (AG-2-49 rule 1's defaults): 30 a minute per address, 60 a minute per form token.
  clock += 120_000;
  const hp = { ...lena, website: "x" };   // honeypot posts count toward the limits and store nothing
  const forms2 = new PublicForms(db, { ...ports, now: () => clock });
  const one = await forms2.read(tokenA, req({ ip: "203.0.113.9" }));
  clock += 3000;
  const posted = [];
  for (let i = 0; i < LIMITS.postsPerIp; i++) posted.push(await refusal(() => forms2.submit(tokenA, { submissionId: one.submissionId, loadStamp: one.loadStamp, ...hp }, req({ ip: "203.0.113.9" }))));
  const before31 = count("fo_lead");
  const thirtyFirst = await refusal(() => forms2.submit(tokenA, { submissionId: one.submissionId, loadStamp: one.loadStamp, ...lena }, req({ ip: "203.0.113.9" })));
  ok("FO-2 pass: 30 posts a minute from one address are taken", posted.every((p) => p === null));
  ok("FO-2 fail: the 31st post a minute from one address → 429 and no lead", thirtyFirst?.status === 429 && count("fo_lead") === before31, thirtyFirst);
  for (let i = 0; i < LIMITS.postsPerForm - LIMITS.postsPerIp; i++) await forms2.submit(tokenA, { submissionId: one.submissionId, loadStamp: one.loadStamp, ...hp }, req());
  const sixtyFirst = await refusal(() => forms2.submit(tokenA, { submissionId: one.submissionId, loadStamp: one.loadStamp, ...lena }, req()));
  ok("FO-2 fail: the 61st post a minute for one form token from many addresses → 429", sixtyFirst?.status === 429 && count("fo_lead") === before31);
  clock += 61_000;
  ok("FO-2 pass: a minute later the form takes posts again", (await refusal(() => forms2.submit(tokenA, { submissionId: one.submissionId, loadStamp: one.loadStamp, ...hp }, req()))) === null);

  // A one-user firm (X-4): its one user owns every lead.
  const soloWording = await db.$transaction((tx) => consent.publishWording(tx, { firmId: S, channel: "EMAIL", purpose: "MARKETING", locale: "en", text: "Send me news by email. (Sample)", by: "seed:FO-2-test" }));
  sql(`update fo_web_form set enabled = true, consent_wording_version_id = '${soloWording.id}', allowed_sites = '{${SITE}}' where firm_id = '${S}'`);
  await post({ givenNames: "Solo", email: "solo@example.org" }, { token: tokenS });
  ok("FO-2 pass: in a one-user firm the form lead is owned by its one user (X-4)", sql(`select owner_staff_id from fo_lead where firm_id = '${S}' order by created_at desc limit 1`) === SOLO.staffId);
  ok("FO-2 fail: in a firm of three the form lead stays Unassigned", sql(`select count(*) from fo_lead where firm_id = '${A}' and door = 'WEB_FORM' and owner_staff_id is not null`) === "0");

  // ------------------------------------------------------------------------------------------- attribution
  await post({ givenNames: "Utm", email: "utm@example.org", attribution: { utmCampaign: "spring", landingPage: "https://maple.example/lmia" } });
  const utm = await leads.read(R, sql(`select l.id from fo_lead l join fo_person p on p.id = l.person_id where p.email = 'utm@example.org'`)) as { attribution: Record<string, string> | null };
  ok("FO-2 pass: attribution present on a form lead (campaign and landing page), one write-once row", utm.attribution?.utmCampaign === "spring" && utm.attribution.landingPage === "https://maple.example/lmia" && count("fo_lead_attribution") === 1, utm);
  ok("FO-2 fail: a lead that arrived with no campaign facts has no attribution (nothing guessed)", ((await leads.read(R, anaLead)) as { attribution: unknown }).attribution === null);
  ok("FO-2 fail: an attribution field outside the list → refused", (await refusal(() => post({ givenNames: "X", email: "x@example.org", attribution: { fbp: "1" } })))?.status === 400);

  // ------------------------------------------------------------------------------------------- lists and visibility
  const unassigned = await leads.list(R, "unassigned");
  ok("FO-2 pass: Unassigned leads lists the open leads with no owner, oldest first", unassigned.length > 0 && unassigned.every((l) => l.ownerStaffId === null) && unassigned[0].id === lenaLead, unassigned.slice(0, 2));
  const nobody = { ...O, keys: O.keys.filter((k) => !["agent/prospect:view.all", "agent/prospect:assign"].includes(k)) };
  ok("FO-2 fail: a person who may neither see all nor assign → 403 on Unassigned leads", (await refusal(() => leads.list(nobody, "unassigned")))?.status === 403);
  ok("FO-2 fail: an unknown view → refused", (await refusal(() => leads.list(R, "everything")))?.status === 422);

  // Take it and Assign.
  const taken = await leads.take(O, lenaLead) as { ownerStaffId: string };
  ok("FO-2 pass: Take it on an unowned lead → the taker owns it, one audit line, one lead.taken event",
    taken.ownerStaffId === O.staffId && count("audit_event", `entity_key = '${lenaLead}' and action = 'lead.taken'`) === 1 && count("module_event", `subject_id = '${lenaLead}' and type = '${EVENT.LEAD_TAKEN}'`) === 1);
  const again = await refusal(() => leads.take(T, lenaLead));
  ok("FO-2 fail: Take it on an owned lead → 409 with the owner's name", again?.status === 409 && again.body.detail === "Case officer (Sample) already has this lead.", again);
  const fakeT = await refusal(() => leads.assign(R, repeat[0], { staffId: crypto.randomUUID() }));
  ok("FO-2 fail: Assign to someone who is no active staff of the firm → refused", fakeT?.status === 422);
  ok("FO-2 pass: Assign to an active person of the firm", ((await leads.assign(R, repeat[0], { staffId: T.staffId })) as { ownerStaffId: string }).ownerStaffId === T.staffId);

  // The match line names no one the viewer may not see (everyone-sees-all off).
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "test", workspaceId: await platformAuditWorkspaceId(db as never) });
  await post({ ...lena, consent: false });
  const newer = sql(`select l.id from fo_lead l join fo_person p on p.id = l.person_id where p.email = 'lena@example.org' order by l.created_at desc limit 1`);
  const matched = sql(`select possible_match_person_id from fo_lead where id = '${newer}'`);
  await leads.assign(R, newer, { staffId: T.staffId });
  sql(`update fo_lead set owner_staff_id = '${R.staffId}' where person_id = '${matched}'`);
  const tView = await leads.read(T, newer) as { possibleMatch: { line: string } };
  const rView = await leads.read(R, newer) as { possibleMatch: { line: string } };
  ok("FO-2 fail: the match line names no one the viewer may not see", tView.possibleMatch.line === "Possible match with a person you cannot see", tView.possibleMatch);
  ok("FO-2 pass: an Owner sees the matched person's name", /^Possible match: Lena Park \(L-\d{5}\)$/.test(rView.possibleMatch.line), rView.possibleMatch);
  ok("FO-2 fail: with everyone-sees-all off, another person's lead is not found (404) and not listed", (await refusal(() => leads.read(O, newer)))?.status === 404 && !(await leads.list(O, "all")).some((l) => l.id === newer));
  ok("FO-2 pass: with everyone-sees-all off, a person still sees their own lead", (await leads.list(T, "mine")).some((l) => l.id === newer));
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "test", workspaceId: await platformAuditWorkspaceId(db as never) });

  // Firm A and firm B.
  ok("FO-2 fail: firm A's staff reading firm B's lead → 404", (await refusal(() => leads.read(SOLO, lenaLead)))?.status === 404 && (await refusal(() => leads.take(SOLO, lenaLead)))?.status === 404);
  ok("FO-2 pass: firm B's lists never show firm A's leads", (await leads.list(SOLO, "all")).every((l) => sql(`select firm_id from fo_lead where id = '${l.id}'`) === S));

  // ------------------------------------------------------------------------------------------- audit and events
  const createdLines = count("audit_event", `action = 'lead.created' and entity = 'fo_lead'`), createdEvents = count("module_event", `type = '${EVENT.LEAD_CREATED}'`);
  ok("FO-2 pass: every lead made wrote one audit line and one lead.created event", createdLines === count("fo_lead") && createdEvents === count("fo_lead"), [createdLines, createdEvents, count("fo_lead")]);
  ok("FO-2 pass: the events carry ids, never a name, email or phone", sql(`select count(*) from module_event where type like 'lead.%' and (payload::text ~ '@' or payload::text ~ 'Lena')`) === "0");
  const failAudit = fakeAudit({ failOn: (e) => e.action === "lead.created" || e.action === "lead.taken" });
  const failing = new Leads(db, { ...ports, audit: failAudit as never }), failingForms = new PublicForms(db, { ...ports, audit: failAudit as never });
  const n0 = count("fo_lead"), r0 = count("fo_arrival_receipt"), e0 = count("module_event"), c0 = count("msg_consent");
  const ff = await drawn();
  const failedPost = await failingForms.submit(tokenA, { submissionId: ff.submissionId, loadStamp: ff.loadStamp, ...lena, email: "fail@example.org" }, req()).then(() => null, (e) => String(e));
  ok("FO-2 fail: a forced audit failure rolls the arrival back (no person, lead, receipt, consent or event)", failedPost !== null && count("fo_lead") === n0 && count("fo_person", `email = 'fail@example.org'`) === 0 && count("fo_arrival_receipt") === r0 && count("msg_consent") === c0 && count("module_event") === e0, failedPost);
  const unowned = sql(`select id from fo_lead where firm_id = '${A}' and state = 'OPEN' and owner_staff_id is null limit 1`);
  await failing.take(O, unowned).catch(() => undefined);
  ok("FO-2 fail: a forced audit failure rolls Take it back", sql(`select coalesce(owner_staff_id::text, 'none') from fo_lead where id = '${unowned}'`) === "none" && count("module_event", `subject_id = '${unowned}' and type = '${EVENT.LEAD_TAKEN}'`) === 0);

  // ------------------------------------------------------------------------------------------- routes and keys
  const keysOf = (m: string) => (Reflect.getMetadata(PLATFORM_ACCESS, (SalesController.prototype as unknown as Record<string, object>)[m]) as { keys?: string[] } | undefined)?.keys?.join(",");
  const want: Record<string, string> = { list: "agent/prospect:show", read: "agent/prospect:show", take: "agent/prospect:edit", assign: "agent/prospect:assign" };
  ok("FO-2 pass: every staff route declares its seeded agent/prospect:* key (default deny)", Object.entries(want).every(([m, k]) => keysOf(m) === k && Number(sql(`select count(*) from platform_role_permission where permission_key = '${k}'`)) > 0), Object.keys(want).map((m) => `${m}=${keysOf(m)}`));
  const readOnly = sql(`select string_agg(permission_key, ',') from platform_role_permission where role = 'READ_ONLY'`).split(",");
  ok("FO-2 fail: a Read-only person cannot write (holds none of the write routes' keys)", ["take", "assign"].every((m) => !readOnly.includes(keysOf(m)!)) && readOnly.includes("agent/prospect:show"));
  const routes = Object.keys(want).map((m) => ({ name: `SalesController.${m}`, method: "GET", path: "/api/front-office/leads", access: Reflect.getMetadata(PLATFORM_ACCESS, (SalesController.prototype as unknown as Record<string, object>)[m]) }));
  ok("FO-2 pass: PF-4's start-up rule accepts every route", (() => { try { assertEveryRouteDeclared(routes); return true; } catch { return false; } })());
  ok("FO-2 pass: the public door is outside the guarded paths and its read is an open read", Reflect.getMetadata("path", PublicFormsController) === "api/public/forms" && Reflect.getMetadata("studio:read-scope", PublicFormsController.prototype.read) === "open");
} catch (e) {
  fail++;
  console.log(`FAIL  FO-2: the check stopped — ${String((e as Error).stack ?? e).slice(0, 1200)}`);
} finally {
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* the next run's dropdb */ }
}
console.log(`\nFO-2 leads (part 1): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
