// FO-2 part 1 (BACKLOG row FO-2, rev 15.1; brief design/lead-b-briefs/FO-2.md; contracts §2.1, §7; AG-2-5, -8a, -13c, -49,
// -84, -86): the arrival path, the public door, the lead lists, one lead and Take it, each Done-when line with a pass and
// a fail, on one scratch database (every migration, PF-3's and FO-1a's Sample seeds), dropped at the end. US$0.
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
import { openMinutes, openMinutesIn, openWindows } from "../api/src/front-office/sales/open-minutes.ts";
import { LIMITS, PublicForms, PublicFormsController, publicFormBodyLimit, type SalesPorts } from "../api/src/front-office/sales/public.ts";
import express from "express";
import type { AddressInfo } from "node:net";
import { SalesController } from "../api/src/front-office/sales/routes.ts";
import { auditEvent, platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";
import { assertEveryRouteDeclared } from "../api/src/platform/identity/guard.ts";
import { dutiesOf, PLATFORM_ACCESS, type StaffContext } from "../api/src/platform/identity/keys.ts";
import { ConsentStore } from "../api/src/platform/messages/consent/consent-store.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { BUSINESS_HOURS, CLOSED_DAYS, EVERYONE_SEES_ALL, readSetting, TIME_ZONE, writeSetting } from "../api/src/platform/settings.ts";

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
  const service = sql(`insert into fo_service (firm_id, label, sort_order, created_by) values ('${A}', 'Work permit (Sample)', 1, 'seed:FO-2-test') returning id`);   // no released combination here: the firm's own service (AG-16-76)

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
  const page = await forms.read(tokenA, req(), { setHeader: (n: string, v: string) => { if (n === "Content-Security-Policy") csp.push(v); if (n === "Cache-Control") csp.push(`cache:${v}`); } });
  ok("FO-2 pass: the open read gives the form's words, a submissionId and a load stamp, never cached", typeof page.submissionId === "string" && /^\d+\.[A-Za-z0-9_-]+$/.test(page.loadStamp) && page.consentText?.includes("Sample") && page.interestedIn.length > 0, page);
  ok("FO-2 pass: the served form carries frame-ancestors naming the allowed site, and no-store", csp[0] === `frame-ancestors 'self' ${OWN} ${SITE}` && csp[1] === "cache:no-store", csp);

  const leadsBefore = count("fo_lead"), receiptsBefore = count("fo_arrival_receipt");
  const bot = await post({ ...lena, website: "http://spam.example" });
  ok("FO-2 fail: the honeypot filled → answered like any other (the thank-you text), nothing stored", bot.thankYouText.length > 0 && count("fo_lead") === leadsBefore && count("fo_arrival_receipt") === receiptsBefore, bot);
  // PF-28 A3 (R1.10): the trap field takes any text but no other type; the message's own length (text()'s count) is read at
  // the parse, so it is named even when the names' rules would answer first.
  const trapObj = await refusal(() => post({ ...lena, website: { pf28: 1 } })), fields = (a: typeof trapObj) => (a?.body.fields ?? {}) as Record<string, string>;
  ok("PF-28 A3 fail: a trap field that is not text → 422 naming website in plain words, nothing stored", trapObj?.status === 422 && fields(trapObj).website === "This must be text." && count("fo_lead") === leadsBefore, trapObj?.body);
  const longMsg = await refusal(() => post({ message: "a".repeat(5001) })), wideMsg = await refusal(() => post({ message: "\u{1F600}".repeat(5000) }));
  ok("PF-28 A3 fail: a 5001-character message with no name → 422 naming message in its own words (before the names' rules)", longMsg?.status === 422 && fields(longMsg).message === "at most 5000 characters.", longMsg?.body);
  ok("PF-28 A3 pass: 5000 characters of 2 UTF-16 units each pass the parse (counted as characters): the names' rule answers, not the message's", wideMsg?.status === 422 && !!fields(wideMsg).givenNames && !fields(wideMsg).message && count("fo_lead") === leadsBefore, wideMsg?.body);
  const quick = await forms.read(tokenA, req());
  clock += 1000;
  const fast = await forms.submit(tokenA, { submissionId: quick.submissionId, loadStamp: quick.loadStamp, ...lena }, req());
  ok("FO-2 fail: a fill 1 second after the form was drawn → answered like any other, nothing stored", fast.thankYouText === bot.thankYouText && count("fo_lead") === leadsBefore, fast);
  const altered = await refusal(() => forms.submit(tokenA, { submissionId: quick.submissionId, loadStamp: quick.loadStamp.replace(/^\d+/, String(clock - 10_000)), ...lena }, req()));
  ok("FO-2 fail: an altered load stamp → \"reload\" (400 RELOAD), nothing stored", altered?.body.code === "RELOAD" && count("fo_lead") === leadsBefore, altered);
  // Break M1 / review M2: a page drawn before a restart (a new key) or a day ago is never lost silently.
  const before = await drawn(), restarted = new PublicForms(db, { ...ports, formKey: Buffer.from("another process") });
  const lost = await refusal(() => restarted.submit(tokenA, { submissionId: before.submissionId, loadStamp: before.loadStamp, ...lena }, req()));
  clock += 25 * 3_600_000;
  const old = await refusal(() => forms.submit(tokenA, { submissionId: before.submissionId, loadStamp: before.loadStamp, ...lena }, req()));
  ok("FO-2 fail: after a restart, or a day later, a person's post is told to reload (never a silent thank-you), nothing stored", lost?.status === 400 && lost.body.detail === "This page is out of date. Please reload it and send the form again." && old?.body.code === "RELOAD" && count("fo_lead") === leadsBefore, [lost, old]);
  const shown = await drawn();
  const w2 = await db.$transaction((tx) => consent.publishWording(tx, { firmId: A, channel: "EMAIL", purpose: "MARKETING", locale: "en", text: "New wording (Sample).", by: "seed:FO-2-test" }));
  sql(`update fo_web_form set consent_wording_version_id = '${w2.id}' where firm_id = '${A}'`);
  const swapped = await refusal(() => forms.submit(tokenA, { submissionId: shown.submissionId, loadStamp: shown.loadStamp, ...lena }, req()));
  sql(`update fo_web_form set consent_wording_version_id = '${wording.id}' where firm_id = '${A}'`);
  ok("FO-2 fail (Devin): the form's wording changed after the page was drawn → reload; no consent for wording the visitor never saw", swapped?.body.code === "RELOAD" && count("msg_consent", `wording_id = '${w2.id}'`) === 0, swapped);
  ok("FO-2 fail (break m1): a bad body is refused at the field whether sent fast or slow (a bot learns nothing from the order)", (await refusal(async () => { const q = await forms.read(tokenA, req()); return forms.submit(tokenA, { submissionId: q.submissionId, loadStamp: q.loadStamp, givenNames: "Nobody" }, req()); }))?.status === 422);

  const f1 = await drawn();
  const first = await post(lena, { form: f1 });
  const lenaLead = sql(`select id from fo_lead where firm_id = '${A}' order by created_at desc limit 1`);
  ok("FO-2 pass: a fill 3 seconds after → one lead, one receipt CREATED, the answer is the thank-you text", count("fo_lead") === leadsBefore + 1 && sql(`select outcome from fo_arrival_receipt where lead_id = '${lenaLead}'`) === "CREATED" && first.thankYouText === bot.thankYouText);
  await post(lena, { form: f1 });
  ok("FO-2 pass: the same submissionId twice → one lead", count("fo_lead") === leadsBefore + 1 && count("fo_arrival_receipt", `lead_id = '${lenaLead}'`) === 1);
  ok("FO-2 pass: the lead is Unassigned (no owner) with source WEBSITE and the form's name, no stage, type or value", sql(`select coalesce(owner_staff_id::text, 'none') || '|' || source || '|' || source_detail || '|' || state from fo_lead where id = '${lenaLead}'`) === "none|WEBSITE|Website enquiry form|OPEN");
  ok("FO-2 pass: the web form's message is the lead's first note, INTERNAL, stored as plain text", sql(`select visibility || '|' || text from fo_note where lead_id = '${lenaLead}'`) === "INTERNAL|I need an LMIA. <script>alert(1)</script>");
  ok("FO-2 pass: the tick writes one consent row through ConsentPort (FO_PERSON, the form's wording, an address hash, no address)", sql(`select count(*) || '|' || min(c.subject_kind::text) || '|' || min(c.wording_id::text) || '|' || (min(length(c.ip_hash)) = 64)::text from msg_consent c join fo_lead l on l.person_id = c.subject_id where l.id = '${lenaLead}'`) === `1|FO_PERSON|${wording.id}|true`);
  ok("FO-2 pass: the phone is kept in E.164", sql(`select phone from fo_person p join fo_lead l on l.person_id = p.id where l.id = '${lenaLead}'`) === "+14165550101");
  const noTick = await post({ givenNames: "Ana", email: "ana@example.org" });
  const anaLead = sql(`select l.id from fo_lead l join fo_person p on p.id = l.person_id where p.email = 'ana@example.org'`);
  ok("FO-2 fail: no tick → the lead with no consent row", !!anaLead && noTick.thankYouText === first.thankYouText && count("msg_consent c join fo_lead l on l.person_id = c.subject_id", `l.id = '${anaLead}'`) === 0);
  ok("FO-2 fail: no email and no phone → refused at the field", (await refusal(() => post({ givenNames: "Nobody" })))?.status === 422);
  ok("FO-2 fail (break m4): a name with a direction override or a zero-width space → refused at the field", (await refusal(() => post({ givenNames: "Le\u202ena", email: "rlo@example.org" })))?.status === 422 && (await refusal(() => post({ givenNames: "Le\u200bna", email: "zw@example.org" })))?.status === 422);
  const unk = await refusal(() => post({ ...lena, isAdmin: true }));   // PF-28 part 3b: 422 naming the field sent, nothing internal
  ok("FO-2 fail: an unknown field in the body → refused 422 naming only the field sent, no internal detail", unk?.status === 422 && Object.keys((unk.body.fields ?? {}) as object).join() === "isAdmin" && !/stack|prisma|sql|Error/i.test(JSON.stringify(unk.body)), unk?.body);
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
  const known = await post({ ...lena, consent: false }), fresh = await post({ givenNames: "Mo", email: "mo@example.org" });
  ok("FO-2 pass: the answer never says whether the person is known (known and new get the same answer)", JSON.stringify(known) === JSON.stringify(fresh), [known, fresh]);
  const repeat = sql(`select l.id || '|' || l.person_id || '|' || coalesce(l.possible_match_person_id::text, '') from fo_lead l join fo_person p on p.id = l.person_id where p.email = 'lena@example.org' order by l.created_at desc limit 1`).split("|");
  const lenaPerson = sql(`select person_id from fo_lead where id = '${lenaLead}'`);
  ok("FO-2 pass: a repeat enquiry → a new lead flagged as a possible match of the earlier person", repeat[0] !== lenaLead && repeat[2] === lenaPerson);
  ok("FO-2 fail: the repeat is never linked or merged (its own person record)", repeat[1] !== lenaPerson);

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
  const forms2 = forms;
  const one = await forms2.read(tokenA, req({ ip: "203.0.113.9" }));
  clock += 3000;
  const posted = [];
  for (let i = 0; i < LIMITS.postsPerIp; i++) posted.push(await refusal(() => forms2.submit(tokenA, { submissionId: one.submissionId, loadStamp: one.loadStamp, ...hp }, req({ ip: "203.0.113.9" }))));
  const before31 = count("fo_lead");
  const thirtyFirst = await refusal(() => forms2.submit(tokenA, { submissionId: one.submissionId, loadStamp: one.loadStamp, ...lena }, req({ ip: "203.0.113.9" })));
  ok("FO-2 pass: 30 posts a minute from one address are taken", posted.every((p) => p === null));
  clock += 61_000;
  const bigs = [];
  for (let i = 0; i < LIMITS.postsPerIp; i++) bigs.push((await refusal(() => forms2.submit(tokenA, { message: "x".repeat(33 * 1024) }, req({ ip: "203.0.113.10" }))))?.status);
  ok("FO-2 fail (review M1): oversized posts count toward the address limit: 30 × 413, then the 31st → 429", bigs.every((x) => x === 413) && (await refusal(() => forms2.submit(tokenA, { ...hp }, req({ ip: "203.0.113.10" }))))?.status === 429, bigs);
  clock -= 61_000;
  ok("FO-2 fail: the 31st post a minute from one address → 429 and no lead", thirtyFirst?.status === 429 && count("fo_lead") === before31, thirtyFirst);
  for (let i = 0; i < LIMITS.postsPerForm - LIMITS.postsPerIp; i++) await forms2.submit(tokenA, { submissionId: one.submissionId, loadStamp: one.loadStamp, ...hp }, req());
  const sixtyFirst = await refusal(() => forms2.submit(tokenA, { submissionId: one.submissionId, loadStamp: one.loadStamp, ...lena }, req()));
  ok("FO-2 fail: the 61st post a minute for one form token from many addresses → 429", sixtyFirst?.status === 429 && count("fo_lead") === before31);
  clock += 61_000;
  ok("FO-2 pass: a minute later the form takes posts again", (await refusal(() => forms2.submit(tokenA, { submissionId: one.submissionId, loadStamp: one.loadStamp, ...hp }, req()))) === null);

  // ------------------------------------------------------------------------------------------- attribution
  await post({ givenNames: "Utm", email: "utm@example.org", attribution: { utmCampaign: "spring", landingPage: "https://maple.example/lmia" } });
  const utm = await leads.read(R, sql(`select l.id from fo_lead l join fo_person p on p.id = l.person_id where p.email = 'utm@example.org'`)) as { attribution: Record<string, string> | null };
  ok("FO-2 pass: attribution present on a form lead (campaign and landing page), one write-once row", utm.attribution?.utmCampaign === "spring" && utm.attribution.landingPage === "https://maple.example/lmia" && count("fo_lead_attribution") === 1, utm);
  ok("FO-2 fail: a lead that arrived with no campaign facts has no attribution (nothing guessed)", ((await leads.read(R, anaLead)) as { attribution: unknown }).attribution === null);
  await post({ givenNames: "Long", email: "long@example.org", attribution: { landingPage: `https://maple.example/?q=${"x".repeat(2100)}` } });
  ok("FO-2 pass (Devin): a captured landing page over 2,000 characters is cut to length, the enquiry kept", sql(`select length(a.landing_page) from fo_lead_attribution a join fo_lead l on l.id = a.lead_id join fo_person p on p.id = l.person_id where p.email = 'long@example.org'`) === "2000");
  ok("FO-2 fail: an attribution field outside the list → refused (422)", (await refusal(() => post({ givenNames: "X", email: "x@example.org", attribution: { fbp: "1" } })))?.status === 422);   // PF-28 part 3b: a field error is 422
  // PF-28 part 3b, break M1, m1, m2: a body nested too deep to measure is unreadable (400), never a 500; a captured landing
  // page longer than the old 32 000 bound is still cut and kept; a "__proto__" inside attribution is refused like any other key.
  let deep: unknown = []; for (let k = 0; k < 100_000; k++) deep = [deep];
  const deepR = await refusal(() => post({ givenNames: "Deep", email: "deep@example.org", zz: deep }));
  ok("PF-28 part 3b fail (break M1): a body nested 100 000 deep → 400 BAD_REQUEST, never a 500", deepR?.status === 400 && deepR.body.code === "BAD_REQUEST", deepR?.status);
  await post({ givenNames: "Longer", email: "longer@example.org", attribution: { landingPage: `https://maple.example/?q=${"x".repeat(32_001)}` } });
  ok("PF-28 part 3b pass (break m1): a landing page of 32 001 characters is cut to 2 000 and the enquiry kept (captured, never refused for length)", sql(`select length(a.landing_page) from fo_lead_attribution a join fo_lead l on l.id = a.lead_id join fo_person p on p.id = l.person_id where p.email = 'longer@example.org'`) === "2000");
  const protoR = await refusal(() => post({ givenNames: "Proto", email: "proto@example.org", attribution: JSON.parse('{"__proto__":{"polluted":1},"utmSource":"x"}') }));
  ok("PF-28 part 3b fail (break m2): attribution.__proto__ → 422 naming it, nothing stored", protoR?.status === 422 && !!(protoR.body.fields as Record<string, string> | undefined)?.["attribution.__proto__"] && sql(`select count(*) from fo_person where email = 'proto@example.org'`) === "0", protoR?.body);

  // ------------------------------------------------------------------------------------------- lists and visibility
  const unassigned = await leads.list(R, "unassigned");
  ok("FO-2 pass: Unassigned leads lists the open leads with no owner, oldest first", unassigned.length > 0 && unassigned.every((l) => l.ownerStaffId === null) && unassigned[0].id === lenaLead, unassigned.slice(0, 2));
  const nobody = { ...O, keys: O.keys.filter((k) => !["agent/prospect:view.all", "agent/prospect:assign"].includes(k)) };
  ok("FO-2 fail: a person who may neither see all nor assign → 403 on Unassigned leads", (await refusal(() => leads.list(nobody, "unassigned")))?.status === 403);
  ok("FO-2 fail: an unknown view → refused", (await refusal(() => leads.list(R, "everything")))?.status === 422);

  const taken = await leads.take(O, lenaLead) as { ownerStaffId: string };
  ok("FO-2 pass: Take it on an unowned lead → the taker owns it, one audit line, one lead.taken event", taken.ownerStaffId === O.staffId && count("audit_event", `entity_key = '${lenaLead}' and action = 'lead.taken'`) === 1 && count("module_event", `subject_id = '${lenaLead}' and type = '${EVENT.LEAD_TAKEN}'`) === 1);
  const again = await refusal(() => leads.take(T, lenaLead));
  ok("FO-2 fail: Take it on an owned lead → 409 with the owner's name", again?.status === 409 && again.body.detail === "Case officer (Sample) already has this lead.", again);

  // The match line names no one the viewer may not see (everyone-sees-all off).
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "system:test", workspaceId: await platformAuditWorkspaceId(db as never) });
  await post({ ...lena, consent: false });
  const newer = sql(`select l.id from fo_lead l join fo_person p on p.id = l.person_id where p.email = 'lena@example.org' order by l.created_at desc limit 1`);
  const matched = sql(`select possible_match_person_id from fo_lead where id = '${newer}'`);
  sql(`update fo_lead set owner_staff_id = '${T.staffId}' where id = '${newer}'`);   // owned by T (Assign is part 2)
  sql(`update fo_lead set owner_staff_id = '${R.staffId}' where person_id = '${matched}'`);
  const tView = await leads.read(T, newer) as { possibleMatch: { line: string } };
  // FO-2v (QA-477): the Owner sees another person's lead only with view.all and everyone-sees-all on (no Owner override).
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "system:test", workspaceId: await platformAuditWorkspaceId(db as never) });
  const rView = await leads.read(R, newer) as { possibleMatch: { line: string } };
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "system:test", workspaceId: await platformAuditWorkspaceId(db as never) });
  ok("FO-2 fail: the match line names no one the viewer may not see", tView.possibleMatch.line === "Possible match with a person you cannot see", tView.possibleMatch);
  ok("FO-2 pass: an Owner (view.all, everyone-sees-all on) sees the matched person's name", /^Possible match: Lena Park \(L-\d{5}\)$/.test(rView.possibleMatch.line), rView.possibleMatch);
  ok("FO-2 fail: with everyone-sees-all off, another person's lead is not found (404) and not listed", (await refusal(() => leads.read(O, newer)))?.status === 404 && !(await leads.list(O, "all")).some((l) => l.id === newer));
  ok("FO-2 pass: with everyone-sees-all off, a person still sees their own lead", (await leads.list(T, "mine")).some((l) => l.id === newer));
  // Break M2 and review m6, with everyone-sees-all off: two people racing Take it: one wins, the other hears who has it.
  let wins = 0, named = 0;
  for (let i = 0; i < 6; i++) {
    await post({ givenNames: `Race${i}`, email: `race${i}@example.org` });
    const lid = sql(`select l.id from fo_lead l join fo_person p on p.id = l.person_id where p.email = 'race${i}@example.org'`);
    const r = await Promise.allSettled([leads.take(O, lid), leads.take(T, lid)]);
    wins += r.filter((x) => x.status === "fulfilled").length;
    named += r.filter((x) => x.status === "rejected" && /already has this lead/.test(JSON.stringify((x.reason as { getResponse?: () => unknown }).getResponse?.()))).length;
  }
  ok("FO-2 fail (break M2, review m6): 6 races of two Take it: exactly one wins each, the other gets 409 naming the owner", wins === 6 && named === 6, { wins, named });
  // FO-2 DWn (AG-2-86 rule 3, Lead B on #1813): a late Take it by someone who could see the lead unowned → 409 with the name.
  const takenByT = async (n: string) => { await post({ givenNames: n, email: `${n}@example.org` }); const id = sql(`select l.id from fo_lead l join fo_person p on p.id = l.person_id where p.email = '${n}@example.org'`); await leads.take(T, id); return id; };
  const lateLead = await takenByT("late");
  const late = await refusal(() => leads.take(O, lateLead)), hidden = await refusal(() => leads.take(nobody, lateLead));
  ok("FO-2 DWn fail: everyone-sees-all off, a Case Officer's Take it after a Case Manager's → 409 naming the Case Manager", late?.status === 409 && late.body.detail === "Second representative (Sample) already has this lead.", late);
  ok("FO-2 DWn pass: someone who could never see it unowned (no view.all, no assign) → 404, no name", hidden?.status === 404 && !JSON.stringify(hidden.body).includes("Second representative"), hidden);
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "system:test", workspaceId: await platformAuditWorkspaceId(db as never) });

  const late2 = await takenByT("late2");
  ok("FO-2 DWn fail: the same with everyone-sees-all on → 409 naming the Case Manager", (await refusal(() => leads.take(O, late2)))?.body.detail === "Second representative (Sample) already has this lead.");
  ok("FO-2 fail: firm A's staff reading firm B's lead → 404", (await refusal(() => leads.read(SOLO, lenaLead)))?.status === 404 && (await refusal(() => leads.take(SOLO, lenaLead)))?.status === 404);
  ok("FO-2 fail: firm B's lists never show firm A's leads (firm B has none)", (await leads.list(SOLO, "all")).length === 0 && count("fo_lead", `firm_id = '${A}'`) > 0);

  // ============================================================================ part 2 (Lead B's named tests on #1813)
  const wk = (["MON", "TUE", "WED", "THU", "FRI"] as const).map((day) => ({ day, opens: "09:00", closes: "17:00" }));
  const tor = { zone: "America/Toronto", hours: wk, closedDays: [] as string[] }, dt = (x: string) => new Date(x);
  ok("FO-2 p2 pass: arrived Fri 16:30, read Mon 09:30 in Sample hours → 60 open minutes", openMinutes(dt("2026-11-13T16:30:00-05:00"), dt("2026-11-16T09:30:00-05:00"), tor) === 60);
  ok("FO-2 p2 fail: arrived on a closed day before opening → counted from the next opening", openMinutes(dt("2026-11-11T07:00:00-05:00"), dt("2026-11-12T10:00:00-05:00"), { ...tor, closedDays: ["2026-11-11"] }) === 60);
  ok("FO-2 p2 pass: arrived and read inside one open day → the plain difference", openMinutes(dt("2026-11-16T10:00:00-05:00"), dt("2026-11-16T11:15:00-05:00"), tor) === 75);
  ok("FO-2 p2 fail: across the clock change (1 Nov 2026, open 00:30-03:30 local) → 240 real minutes, not 180", openMinutes(dt("2026-11-01T00:00:00-04:00"), dt("2026-11-01T06:00:00-05:00"), { zone: tor.zone, hours: [{ day: "SUN", opens: "00:30", closes: "03:30" }], closedDays: [] }) === 240);
  const rows = await leads.list(R, "all");
  const firmCal = { zone: await readSetting<string>(db, A, TIME_ZONE.key), hours: await readSetting<{ day: string; opens: string; closes: string }[]>(db, A, BUSINESS_HOURS.key), closedDays: await readSetting<string[]>(db, A, CLOSED_DAYS.key) };
  ok("FO-2 p2 pass: every open list row carries waitedOpenMinutes, exactly the firm's open minutes since arrival (review m7)", rows.length > 0 && rows.every((l) => l.waitedOpenMinutes === openMinutes(l.arrivedAt, new Date(clock), firmCal)), rows.slice(0, 1));
  ok("FO-2 p2 fail (break m8): a wait longer than 400 days still counts the latest open days", openMinutes(new Date(clock - 500 * 86_400_000), new Date(clock), firmCal) >= openMinutes(new Date(clock - 30 * 86_400_000), new Date(clock), firmCal) && openMinutes(new Date(clock - 30 * 86_400_000), new Date(clock), firmCal) > 0);
  const t0 = Date.now(), win = openWindows(new Date(clock - 300 * 86_400_000), new Date(clock), firmCal);
  for (let i = 0; i < 500; i++) openMinutesIn(win, new Date(clock - (i % 300) * 86_400_000), new Date(clock));
  ok("FO-2 p2 fail (review M4): 500 rows up to 300 days old are counted from one walk in well under a second", Date.now() - t0 < 1000, Date.now() - t0);

  // Assignees (Lead B rev 16.29): a Read-only member and a suspended Case Manager are added to firm A first.
  const addStaff = (name: string, role: string, status: string) => { const id = sql(`insert into platform_staff (id, firm_id, email, display_name, status, updated_at) values (gen_random_uuid(), '${A}', '${name.toLowerCase()}@sample-firm.example.com', '${name} (Sample)', '${status}', now()) returning id`); sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${A}', '${id}', '${role}', 'seed:FO-2-test')`); return id; };
  const ro = addStaff("Viewer", "READ_ONLY", "ACTIVE"), away = addStaff("Away", "CASE_MANAGER", "SUSPENDED");
  const forT = await leads.assignees(T), forO = await leads.assignees(O), forSolo = await leads.assignees(SOLO);
  const ids = forT.assignees.map((a) => a.staffId);
  ok("FO-2 p2 pass: a Case Manager gets every active staff member, READ_ONLY included (AG-2-13c rule 11)", [R.staffId, O.staffId, T.staffId, ro].every((x) => ids.includes(x)) && forT.oneUser === false, forT);
  ok("FO-2 p2 fail: no suspended or deactivated person is offered", !ids.includes(away));
  ok("FO-2 p2 fail: a Case Officer (no assign key) gets assignees: []", forO.assignees.length === 0);
  ok("FO-2 p2 pass: sample-solo gives oneUser: true", forSolo.oneUser === true);
  ok("FO-2 p2 fail: firm A's list never names firm B's staff", !ids.includes(SOLO.staffId) && !forSolo.assignees.some((a) => ids.includes(a.staffId)));

  // Assign to… (AG-2-13c).
  const toAssign = sql(`select id from fo_lead where firm_id = '${A}' and state = 'OPEN' and owner_staff_id is null order by arrived_at limit 1`);
  ok("FO-2 p2 fail: Assign to a suspended person → refused at the field", (await refusal(() => leads.assign(R, toAssign, { staffId: away, expectedOwnerStaffId: null })))?.status === 422);
  ok("FO-2 p2 fail: Assign to someone outside the firm → refused at the field", (await refusal(() => leads.assign(R, toAssign, { staffId: SOLO.staffId, expectedOwnerStaffId: null })))?.status === 422);
  const assigned = await leads.assign(R, toAssign, { staffId: T.staffId, expectedOwnerStaffId: null }) as { ownerStaffId: string };
  ok("FO-2 p2 pass: Assign to an active person who works leads; the audit line names the previous owner (none)", assigned.ownerStaffId === T.staffId && sql(`select coalesce(detail->>'previousOwnerStaffId', 'null') from audit_event where entity_key = '${toAssign}' and action = 'lead.taken' and detail->>'via' = 'ASSIGN'`) === "null");
  ok("FO-2 p2 fail: Assign to the person who already has it → 409", (await refusal(() => leads.assign(R, toAssign, { staffId: T.staffId, expectedOwnerStaffId: T.staffId })))?.status === 409);
  const toRo = sql(`select id from fo_lead where firm_id = '${A}' and state = 'OPEN' and owner_staff_id is null order by arrived_at limit 1`);
  ok("FO-2 p2 pass: Assign to a READ_ONLY member → done (any role, AG-2-13c rule 11)", ((await leads.assign(R, toRo, { staffId: ro, expectedOwnerStaffId: null })) as { id?: string; ownerStaffId?: string }).ownerStaffId === ro || sql(`select owner_staff_id from fo_lead where id = '${toRo}'`) === ro);

  await post({ givenNames: "Stale", email: "stale@example.org" });
  const staleLead = sql(`select l.id from fo_lead l join fo_person p on p.id = l.person_id where p.email = 'stale@example.org'`);
  await leads.take(O, staleLead);
  const stale = await refusal(() => leads.assign(R, staleLead, { staffId: T.staffId, expectedOwnerStaffId: null }));
  ok("FO-2 p2 fail (break M2): a stale Assign (the list showed it Unassigned) after a Take → 409, the taker keeps it", stale?.body.code === "STALE_OWNER" && sql(`select owner_staff_id from fo_lead where id = '${staleLead}'`) === O.staffId, stale);
  ok("FO-2 p2 fail (break M2): Assign without the owner the list showed → refused at the field", (await refusal(() => leads.assign(R, staleLead, { staffId: T.staffId })))?.status === 422);
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "system:test", workspaceId: await platformAuditWorkspaceId(db as never) });
  await post({ givenNames: "Hand", email: "handover@example.org" });
  const handover = sql(`select l.id from fo_lead l join fo_person p on p.id = l.person_id where p.email = 'handover@example.org'`);
  await leads.take(T, handover);
  const given = await leads.assign(T, handover, { staffId: O.staffId, expectedOwnerStaffId: T.staffId }) as { done?: boolean };
  ok("FO-2 p2 fail (break M1): assigning on a lead the assigner then cannot see → done (not 404), and saved", given.done === true && sql(`select owner_staff_id from fo_lead where id = '${handover}'`) === O.staffId, given);
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "system:test", workspaceId: await platformAuditWorkspaceId(db as never) });

  const goneId = addStaff("Gone", "CASE_OFFICER", "ACTIVE");
  await post({ givenNames: "Orphan", email: "orphan@example.org" });
  const orphan = sql(`select l.id from fo_lead l join fo_person p on p.id = l.person_id where p.email = 'orphan@example.org'`);
  sql(`update fo_lead set owner_staff_id = '${goneId}' where id = '${orphan}'`); sql(`update platform_staff set status = 'DEACTIVATED' where id = '${goneId}'`);
  ok("FO-2 p2 fail (Devin, break m9): a deactivated owner's lead (shown Unassigned) assigns with expectedOwnerStaffId null", ((await leads.assign(R, orphan, { staffId: T.staffId, expectedOwnerStaffId: null })) as { ownerStaffId?: string }).ownerStaffId === T.staffId);

  // X-4: a one-user firm's form lead is owned by its one user.
  const soloWording = await db.$transaction((tx) => consent.publishWording(tx, { firmId: S, channel: "EMAIL", purpose: "MARKETING", locale: "en", text: "Send me news by email. (Sample)", by: "seed:FO-2-test" }));
  const tokenS = sql(`update fo_web_form set enabled = true, consent_wording_version_id = '${soloWording.id}', allowed_sites = '{${SITE}}' where firm_id = '${S}' returning public_token`);
  await post({ givenNames: "Solo", email: "solo@example.org" }, { token: tokenS });
  ok("FO-2 p2 pass: in a one-user firm the form lead is owned by its one user (X-4)", sql(`select owner_staff_id from fo_lead where firm_id = '${S}' order by created_at desc limit 1`) === SOLO.staffId);
  await post({ givenNames: "Many", email: "many@example.org" });
  ok("FO-2 p2 fail: in a firm of several the form lead stays Unassigned", sql(`select coalesce(l.owner_staff_id::text, 'none') from fo_lead l join fo_person p on p.id = l.person_id where p.email = 'many@example.org'`) === "none");

  // Add a lead by hand (AG-2-4).
  const rid = () => crypto.randomUUID();
  const knownCheck = await refusal(() => leads.add(R, { requestId: rid(), source: "Phone call", givenNames: "Lena", email: "LENA@example.org" }));
  ok("FO-2 p2 pass: Add a lead checks for a known person first (409 KNOWN_PERSON with the match)", knownCheck?.status === 409 && knownCheck.body.code === "KNOWN_PERSON" && /Lena Park/.test(JSON.stringify(knownCheck.body.matches)), knownCheck);
  const hidden2 = await refusal(() => leads.add(nobody, { requestId: rid(), source: "Phone call", givenNames: "Lena", email: "lena@example.org" }));
  ok("FO-2 p2 fail: the known-person answer names no one the adder may not see", hidden2?.status === 409 && !/Lena/.test(JSON.stringify(hidden2.body.matches)), hidden2);
  const picked = await leads.add(R, { requestId: rid(), source: "Phone call", personId: lenaPerson }) as { person: { id: string }; ownerStaffId: string };
  ok("FO-2 p2 pass: picking the known person makes a lead on that person (no new person), owned by the adder", picked.person.id === lenaPerson && picked.ownerStaffId === R.staffId);
  ok("FO-2 p2 fail: picking another firm's person → 404", (await refusal(() => leads.add(SOLO, { requestId: rid(), source: "Phone call", personId: lenaPerson })))?.status === 404);
  const handRid = rid(), kai = { requestId: handRid, source: "Phone call", givenNames: "Kai", familyName: "Lee", phone: "416-555-0199", confirmedNew: true };
  const hand = await leads.add(R, kai) as { id: string; ownerStaffId: string; attribution: unknown; door: string };
  await leads.add(R, kai);
  ok("FO-2 p2 pass: a lead added by hand is owned by its adder, with no attribution", hand.ownerStaffId === R.staffId && hand.door === "MANUAL" && hand.attribution === null);
  ok("FO-2 p2 fail: the same Add request twice → one lead", count("fo_lead l join fo_person p on p.id = l.person_id", `p.phone = '+14165550199'`) === 1);
  const retryRid = rid(), mo = { requestId: retryRid, source: "Phone call", givenNames: "Mo", familyName: "Retry", email: "mo.retry@example.org" };
  const moFirst = await leads.add(R, mo) as { id: string }, moAgain = await leads.add(R, mo) as { id: string };
  ok("FO-2 p2 fail (review M1): the same Add retried (no confirmedNew) returns its own lead, not 409 KNOWN_PERSON", moAgain.id === moFirst.id && count("fo_person", `email = 'mo.retry@example.org'`) === 1);
  ok("FO-2 p2 fail (review m4): the same request id with other details → 409 REQUEST_REUSED", (await refusal(() => leads.add(R, { ...mo, givenNames: "Other" })))?.body.code === "REQUEST_REUSED");
  const raceRid = rid();
  const raced = await Promise.allSettled([leads.add(R, { requestId: raceRid, source: "Phone call", givenNames: "Ra", email: "ra1@example.org", confirmedNew: true }), leads.add(R, { requestId: raceRid, source: "Phone call", givenNames: "Rb", email: "ra2@example.org", confirmedNew: true })]);
  ok("FO-2 p2 fail (Devin): one request id sent twice at once with other details → one lead, the other REQUEST_REUSED", raced.filter((x) => x.status === "fulfilled").length === 1 && raced.some((x) => x.status === "rejected" && /REQUEST_REUSED/.test(JSON.stringify((x.reason as { getResponse?: () => unknown }).getResponse?.()))), raced.map((x) => x.status));
  ok("FO-2 p2 fail (review m6): Add with no source → refused at the field (AG-2-4 rule 1)", (await refusal(() => leads.add(R, { requestId: rid(), givenNames: "Src", email: "src@example.org", confirmedNew: true })))?.status === 422);
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "system:test", workspaceId: await platformAuditWorkspaceId(db as never) });
  const tPerson = sql(`select person_id from fo_lead where firm_id = '${A}' and owner_staff_id = '${T.staffId}' and state = 'OPEN' limit 1`);
  ok("FO-2 p2 fail (review M2): picking a person the adder may not see → 404 (AG-2-4 rule 6)", (await refusal(() => leads.add(O, { requestId: rid(), source: "Phone call", personId: tPerson })))?.status === 404);
  const tLead = sql(`select id from fo_lead where firm_id = '${A}' and owner_staff_id = '${T.staffId}' and state = 'OPEN' limit 1`);
  ok("FO-2 p2 fail (review m2): Close by someone who cannot see the lead → 404, no owner named (the 409 is Take it's only)", (await refusal(() => leads.close(O, tLead, { reasonId: sql(`select id from fo_reason where firm_id = '${A}' and key = 'NOT_INTERESTED'`) })))?.status === 404);
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "system:test", workspaceId: await platformAuditWorkspaceId(db as never) });
  ok("FO-2 p2 pass (break m6): personId null counts as absent (a new person)", ((await leads.add(R, { requestId: rid(), source: "Phone call", personId: null, givenNames: "Nell", email: "nell@example.org" })) as { person: { givenNames: string } }).person.givenNames === "Nell");
  ok("FO-2 p2 fail: Add with no email and no phone → refused at the field", (await refusal(() => leads.add(R, { requestId: rid(), source: "Phone call", givenNames: "Nobody", confirmedNew: true })))?.status === 422);

  // Close and Reopen (AG-2-80).
  const sysReason = sql(`select id from fo_reason where firm_id = '${A}' and kind = 'LEAD_CLOSE' and is_system limit 1`);
  const reason = sql(`select id from fo_reason where firm_id = '${A}' and kind = 'LEAD_CLOSE' and key = 'NOT_INTERESTED'`);
  ok("FO-2 p2 fail: Close without a reason, or with a system reason, or with firm B's → refused at the field", (await refusal(() => leads.close(R, hand.id, {})))?.status === 422 && (await refusal(() => leads.close(R, hand.id, { reasonId: sysReason })))?.status === 422 && (await refusal(() => leads.close(R, hand.id, { reasonId: sql(`select id from fo_reason where firm_id = '${S}' and key = 'NOT_INTERESTED'`) })))?.status === 422);
  const closed = await leads.close(R, hand.id, { reasonId: reason, note: "Not now." }) as { state: string; closeReason: string };
  ok("FO-2 p2 pass: Close with a reason → CLOSED, listed under Closed, one lead.closed event with the reason key", closed.state === "CLOSED" && closed.closeReason === "Not interested" && (await leads.list(R, "closed")).some((l) => l.id === hand.id) && sql(`select payload->>'closeReasonKey' from module_event where subject_id = '${hand.id}' and type = '${EVENT.LEAD_CLOSED}'`) === "NOT_INTERESTED");
  ok("FO-2 p2 fail: Close twice → 409", (await refusal(() => leads.close(R, hand.id, { reasonId: reason })))?.status === 409);
  ok("FO-2 p2 fail: Reopen without a reason → refused at the field", (await refusal(() => leads.reopen(R, hand.id, {})))?.status === 422);
  const reopened = await leads.reopen(R, hand.id, { reason: "They called back." }) as { state: string; ownerStaffId: string };
  ok("FO-2 p2 pass: Reopen → OPEN with its owner, the reason kept as an INTERNAL note, one lead.reopened event", reopened.state === "OPEN" && reopened.ownerStaffId === R.staffId && count("fo_note", `lead_id = '${hand.id}' and text = 'Reopened: They called back.' and visibility = 'INTERNAL'`) === 1 && count("module_event", `subject_id = '${hand.id}' and type = '${EVENT.LEAD_REOPENED}'`) === 1);
  ok("FO-2 p2 fail (Devin): the closing note survives Reopen (kept as an INTERNAL note)", count("fo_note", `lead_id = '${hand.id}' and text = 'Closed (Not interested): Not now.'`) === 1);
  ok("FO-2 p2 fail: Reopen an open lead → 409", (await refusal(() => leads.reopen(R, hand.id, { reason: "x" })))?.status === 409);

  // Part 1's Minors: captured attribution cleaned, not refused (break n3, n4); two first enquiries race (Devin).
  await post({ givenNames: "Mark", email: "mark@example.org", attribution: { utmSource: "goo​gle", landingPage: `https://maple.example/?q=${"x".repeat(1999)}\u{1F600}` } });
  const markAttr = sql(`select a.utm_source || '|' || right(a.landing_page, 1) || '|' || length(a.landing_page) from fo_lead_attribution a join fo_lead l on l.id = a.lead_id join fo_person p on p.id = l.person_id where p.email = 'mark@example.org'`).split("|");
  await post({ givenNames: "Emo", email: "emo@example.org", attribution: { utmCampaign: "a" + "\u{1F600}".repeat(150), referrerUrl: "https://ref.example/\u2028x" } });
  ok("FO-2 p2 fail (review M3): a campaign of 150 emoji and U+2028 in a referrer → the lead kept, both stored cleaned and cut whole", sql(`select length(a.utm_campaign) || '|' || a.referrer_url from fo_lead_attribution a join fo_lead l on l.id = a.lead_id join fo_person p on p.id = l.person_id where p.email = 'emo@example.org'`) === "151|https://ref.example/x");
  await post({ givenNames: "Deva", email: "deva@example.org", attribution: { utmContent: "\u0958".repeat(200) } });
  ok("FO-2 p2 fail (break M4): a captured value that grows when normalised is cut after, the lead kept", sql(`select length(a.utm_content) from fo_lead_attribution a join fo_lead l on l.id = a.lead_id join fo_person p on p.id = l.person_id where p.email = 'deva@example.org'`) === "200");
  ok("FO-2 p2 pass (break m3): a 61-character name with emoji is taken (limits count characters)", (await refusal(() => post({ givenNames: "A" + "\u{1F600}".repeat(60), email: "emoji@example.org" }))) === null);
  ok("FO-2 p2 fail (break n3): an invisible mark inside a captured value is dropped, the lead kept", markAttr[0] === "google", markAttr);
  ok("FO-2 p2 fail (break n4): the cut never splits a character (no lone half of an emoji)", markAttr[1] !== "�" && Number(markAttr[2]) <= 2000, markAttr);
  ok("FO-2 p2 fail (break m4): a name with U+061C, U+3164 or a tag character → refused at the field", (await Promise.all(["Le؜na", "Leㅤna", "Le\u{E0041}na"].map((n) => refusal(() => post({ givenNames: n, email: "marks@example.org" }))))).every((r) => r?.status === 422));
  const [f1r, f2r] = await Promise.all([drawn(), drawn()]);
  await Promise.all([f1r, f2r].map((f) => forms.submit(tokenA, { submissionId: f.submissionId, loadStamp: f.loadStamp, givenNames: "Twin", email: "twin@example.org" }, req())));
  ok("FO-2 p2 fail (Devin): two first enquiries at once with one new email → the later is flagged as a possible match", sql(`select count(*) filter (where possible_match_person_id is not null) || '/' || count(*) from fo_lead l join fo_person p on p.id = l.person_id where p.email = 'twin@example.org'`) === "1/2");

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
  const want: Record<string, string> = { list: "agent/prospect:show", read: "agent/prospect:show", take: "agent/prospect:edit", add: "agent/prospect:create", assignees: "agent/prospect:show", assign: "agent/prospect:assign", close: "agent/prospect:edit", reopen: "agent/prospect:edit" };
  ok("FO-2 pass: every staff route declares its seeded agent/prospect:* key (default deny)", Object.entries(want).every(([m, k]) => keysOf(m) === k && Number(sql(`select count(*) from platform_role_permission where permission_key = '${k}'`)) > 0), Object.keys(want).map((m) => `${m}=${keysOf(m)}`));
  const readOnly = sql(`select string_agg(permission_key, ',') from platform_role_permission where role = 'READ_ONLY'`).split(",");
  ok("FO-2 DWn fail: a Read-only person cannot Take it, add, assign, close or reopen (403 at the guard)", ["take", "add", "assign", "close", "reopen"].every((m) => !readOnly.includes(keysOf(m)!)) && readOnly.includes("agent/prospect:show"));
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
console.log(`\nFO-2 leads (parts 1-2): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
