// J-28 (map row 28, R1.28: consent recorded per purpose; brief design/lead-b-briefs/J-rows.md §J-28 on lead-b-front-office,
// split out of J-27 by Lead B (7), 19 Nov, P-733): the join-and-walk row. It adds no feature: it walks the merged parts
// (FO-2/FO-4 part 1's public web form, FO-3w's booking page with FO-2 part 3b's real ArrivalPort (#2196, QA-511), PF-19a's
// consent store, PF-19b part 2's one-click unsubscribe and the demo inbox, PF-19b part 1's send gate) on an isolated copy
// of the running app (its own database and port, never :4400), by screens at 1440 px, and asserts the stored rows
// underneath with SQL on that copy. Swaps: none (`arrival` is real since #2196).
//   W1 a visitor sends the web form with its consent ticked: one consent row, for that purpose only (EMAIL MARKETING), with
//      the wording the form showed, source WEB_FORM and the time; no row for any other purpose. Fail: an unticked form, none.
//   W2 the same visitor (same email) books on the booking page with the booking tick: one BOOKING_FORM row for that
//      purpose, the wording the page showed. Fail: a booking with the tick off records none (QA-511).
//   W3 the one-click unsubscribe link in a marketing mail (demo inbox) withdraws EMAIL MARKETING only: that row is
//      withdrawn by UNSUBSCRIBE, the visitor's other purpose (WhatsApp opt-in) stays granted. Fail: the link a second time
//      is 404 and records nothing more.
//   W4 a consent row cannot be edited or deleted (the database trigger); a new grant is a new row and the old row is
//      unchanged (supersede, never edit).
//   W5 ends at row 49's first step: a marketing send to the withdrawn purpose is blocked by the gate (SUPPRESSED, its
//      reason kept, nothing in the inbox); the same send before the unsubscribe was allowed and delivered.
// What the brief words differently, and why (raised on the PR): the web form has one consent tick, so W1's "another
// purpose unticked" is read as "no row for any other purpose"; the booking tick records the same purpose as the web form
// (EMAIL MARKETING: the firm's newest wording of that purpose, arrival-port.ts), so W3's "the booking purpose stays granted" is walked with the purpose
// that is really other, WhatsApp opt-in (WHATSAPP SERVICE), which no public door records yet: it is written as a staff
// record through ConsentPort (a fixture, Sample). A marketing mail has no product door either: it is written through
// MessagePort with the local adapter into the copy's own database and files, as check_pf19b2_ses.ts --app does, and the
// running app's demo inbox and unsubscribe page read and act on it. The firm, its host, hours, consultation type, web
// form and wordings are written straight to the copy (no screens for them in this walk). Sample rows only; US$0, no model
// call; live AI off.
// Run from prototype/ (HEADED=1 opens a visible browser, slowed; on Linux under xvfb-run):
//   zsh studio/tools/isolated.sh j28 4428 start --ttl 30 AI_LIVE=off PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on && trap 'zsh studio/tools/isolated.sh j28 4428 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_28.ts j28 4428
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { copyFirmHoursTo } from "../../api/src/front-office/booking-seed.ts";
import { ensureBookingWording, seedFirmFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { LocalFiles } from "../../api/src/front-office/files.ts";
import { auditEvent } from "../../api/src/platform/audit/audit-event.ts";
import { localEmail } from "../../api/src/platform/messages/channels/email/local.ts";
import { ConsentStore } from "../../api/src/platform/messages/consent/consent-store.ts";
import { channelsOf } from "../../api/src/platform/messages/send/channels.ts";
import { Messages } from "../../api/src/platform/messages/send/messages.ts";
import { fakeAlerts } from "../../ports/alert.ts";
import { FakeClock } from "../../ports/clock.ts";
import { fakeJobs } from "../../ports/jobs.ts";
import { recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [NAME, PORT] = [process.argv[2] ?? "j28", Number(process.argv[3] ?? 4428)];
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..", ".."), DB = `xr_studio_${NAME}`;
const DBURL = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;
process.env.STUDIO_VAR = join(STUDIO, "var", `isolated-${NAME}`);   // the copy's own files (tools/isolated.sh), so its inbox reads the mail
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-28", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const HEADED = process.env.HEADED === "1";
const { ok, summary } = recorder();
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: DBURL, options: "-c TimeZone=UTC" }) });
const psql = existsSync("/opt/homebrew/opt/postgresql@18/bin/psql") ? "/opt/homebrew/opt/postgresql@18/bin/psql" : "psql";
const sql = (q: string) => execFileSync(psql, [DBURL, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
/** A statement the database must refuse: its error's first line, or "" when it ran. */
const refused = (q: string) => { try { sql(q); return ""; } catch (e) { return String((e as { stderr?: string }).stderr ?? e).split("\n")[0]; } };
const consent = new ConsentStore(auditEvent);

// ------------------------------------------------------------------------------------------------ setup (Sample)
const run = Date.now().toString(36), key = `j28-${run}`;
const firm = await db.platformFirm.create({ data: { key, operatingName: "Sample J-28 firm", countryCode: "CA", status: "ACTIVE", contactEmail: `office-${run}@j28-firm.example` } });
await db.$transaction((tx) => seedFirmFrontOffice(tx, firm.id, "seed:J-28-test"));
await db.$transaction((tx) => ensureBookingWording(tx, firm.id, "seed:J-28-test"));   // version 1 (Sample); the web form pins its own version below
const formWording = await db.$transaction((tx) => consent.publishWording(tx, { firmId: firm.id, channel: "EMAIL", purpose: "MARKETING", locale: "en-CA", text: `Yes, Sample J-28 firm may email me news and offers. I can stop at any time. (Sample wording ${run})`, by: "seed:J-28-test" }));
const formText = sql(`select text from msg_consent_wording where id = '${formWording.id}'`);
// The booking tick shows the firm's newest EMAIL MARKETING wording, not the web form's pinned one: a newer version.
const bookingWording = await db.$transaction((tx) => consent.publishWording(tx, { firmId: firm.id, channel: "EMAIL", purpose: "MARKETING", locale: "en-CA", text: `Yes, Sample J-28 firm may email me news about consultations. I can stop at any time. (Sample booking wording ${run})`, by: "seed:J-28-test" }));
const waWording = await db.$transaction((tx) => consent.publishWording(tx, { firmId: firm.id, channel: "WHATSAPP", purpose: "SERVICE", locale: "en-CA", text: "Yes, the firm may message me about my enquiry on WhatsApp. (Sample wording)", by: "seed:J-28-test" }));
const token = randomBytes(24).toString("base64url");
sql(`update fo_web_form set enabled = true, public_token = '${token}', consent_wording_version_id = '${formWording.id}', updated_by = 'seed:J-28-test', updated_at = now() where firm_id = '${firm.id}'`);
const host = await db.platformStaff.create({ data: { firmId: firm.id, email: `host-${run}@j28-firm.example`, displayName: "Sample host", status: "ACTIVE" } });
await copyFirmHoursTo(db, firm.id, [host.id]);
await db.foConsultationType.create({ data: { firmId: firm.id, slug: "free", name: "Free consultation", modes: ["VIDEO"], hostStaffIds: [host.id], minutes: 30 } });
console.log(`setup (not through the product: no firm, staff, hours, type, web form or wording screens in this walk): firm ${key}, its web form on with an EMAIL MARKETING wording, one host, type "free"`);

const visitor = { given: "Visitor", family: `J28 ${run}`, email: `visitor.${run}@j28-client.example` };
const unticked = { given: "Unticked", family: `J28 ${run}`, email: `unticked.${run}@j28-client.example` };
const bookerOff = { given: "Booker", family: `NoTick ${run}`, email: `booker.${run}@j28-client.example` };
const autoMergeDone = async (personId: string) => {   // FO-9b part 2b: the merge job for this new person has finished (at most 20 s)
  for (let i = 0; i < 100; i++) { if (sql(`select count(*) from platform_jobs.job where name = 'fo.duplicates.auto_merge' and data->>'personId' = '${personId}' and state = 'completed'`) === "1") return true; await new Promise((r) => setTimeout(r, 200)); }
  return false;
};
const personOf = (email: string, nth = 0) => sql(`select id from fo_person where firm_id = '${firm.id}' and email = '${email}' order by created_at, id offset ${nth} limit 1`);
const rowsOf = (person: string) => (person ? sql(`select channel || '|' || purpose || '|' || source || '|' || coalesce(wording_id::text, '-') || '|' || recorded_by || '|' || (withdrawn_at is null) from msg_consent where subject_id = '${person}' order by given_at, id`) : "").split("\n").filter(Boolean);
const allowed = async (person: string, channel: "EMAIL" | "WHATSAPP", address: string) => consent.allows(db, { firmId: firm.id, subject: { kind: "FO_PERSON", id: person }, channel, address, class: "MARKETING" });

const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 250 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-CA", timezoneId: "America/Toronto", colorScheme: "light", reducedMotion: "reduce" });
const errors: string[] = [];
const newPage = async () => { const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(String(e).slice(0, 200))); return p; };
/** Each screen walked: a screenshot at 1440 px, axe (WCAG 2.2 A/AA), and no sideways page scroll at 1440 and 1024 px. */
const look = async (p: Page, name: string, where: string) => {
  await p.screenshot({ path: join(SHOTS, `${name}-1440.png`), fullPage: true });
  const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  ok(`J-28 axe: ${where}: no WCAG 2.2 A/AA violation`, r.violations.length === 0, r.violations.map((v) => `${v.id}: ${v.nodes.length}`));
  for (const w of [1440, 1024]) {
    await p.setViewportSize({ width: w, height: 900 });
    const sideways = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    ok(`J-28 ${w} px: ${where}: no sideways page scroll`, !sideways);
  }
  await p.setViewportSize({ width: 1440, height: 900 });
};
/** The web form sent as a person sends it; returns the consent words it showed. */
const sendForm = async (p: Page, who: typeof visitor, tick: boolean, shotAs?: string) => {
  await p.goto(`${BASE}/front-office/web-form/${token}`);
  await p.getByLabel("First name").waitFor({ timeout: 30_000 });
  const words = await p.locator("label:has(input[type=checkbox]) span").innerText();
  await p.getByLabel("First name").fill(who.given); await p.getByLabel("Last name (optional)").fill(who.family); await p.getByLabel("Email", { exact: true }).fill(who.email);
  if (tick) await p.getByRole("checkbox").check();
  if (shotAs) await look(p, shotAs, "the web form, filled");
  await p.getByRole("button", { name: "Send my enquiry" }).click();   // the page itself waits out its minimum fill time
  await p.locator('[data-form-state="thanks"], [role="alert"]').first().waitFor({ timeout: 20_000 });
  return { words, thanks: await p.locator('[data-form-state="thanks"]').count() === 1 };
};
/** One booking on the public page: the first open time; returns the consent words it showed and whether it booked. */
const book = async (p: Page, who: typeof visitor, tick: boolean, shotAs?: string) => {
  await p.goto(`${BASE}/book/${key}`);
  await p.locator("[data-type-card]").first().waitFor({ timeout: 30_000 });
  if (shotAs) await look(p, `${shotAs}-1-list`, "the booking page");
  await p.getByRole("link", { name: "Choose Free consultation" }).click();
  await p.getByRole("heading", { name: "Choose a time" }).waitFor();
  const monthHeading = p.locator("h2[aria-live]");
  for (let turn = 0; turn < 3; turn++) {
    if (turn) { const before = await monthHeading.innerText(); await p.getByRole("button", { name: "Next month" }).click(); await monthHeading.filter({ hasNotText: before }).waitFor(); }
    await p.locator("[data-loading]").waitFor({ state: "detached" });
    const days = p.getByRole("group", { name: await monthHeading.innerText() }).locator("button:not([disabled])");
    if (await days.count()) { await days.first().click(); break; }
  }
  const time = p.locator("[data-day-times] li button").first();
  await time.waitFor({ timeout: 20_000 });
  await time.click();
  await p.getByRole("heading", { name: "Your details" }).waitFor();
  await p.getByLabel("Given names").fill(who.given); await p.getByLabel("Family name").fill(who.family); await p.getByLabel("Email", { exact: true }).fill(who.email);
  const words = await p.locator("label:has(input[type=checkbox]) span").innerText();
  if (tick) await p.getByRole("checkbox").check();
  if (shotAs) await look(p, `${shotAs}-2-details`, "the booking details form");
  await p.getByRole("button", { name: "Book this time" }).click();
  await p.locator('[data-public-state="booked"], [data-summary], [role="alert"]').first().waitFor({ timeout: 20_000 });
  const booked = (await p.locator("main").innerText()).includes("You are booked");
  if (shotAs) await look(p, `${shotAs}-3-booked`, "the booking confirmation");
  return { words, booked };
};
type Mail = { id: string; class: string; subject: string; headers: Record<string, string> };
const inbox = async (address: string): Promise<Mail[]> => { const r = await fetch(`${BASE}/api/demo/platform-inbox?address=${encodeURIComponent(address)}`); return r.status === 200 ? ((await r.json()) as { messages: Mail[] }).messages : []; };
const messages = new Messages({ db, consent, files: new LocalFiles(), jobs: fakeJobs(new FakeClock(new Date())), alerts: () => fakeAlerts(), channels: channelsOf([["EMAIL", localEmail]]) });
const marketing = (person: string, address: string) => db.$transaction((tx) => messages.send(tx, { firmId: firm.id, person: { kind: "FO_PERSON", id: person }, channel: "EMAIL", class: "MARKETING", address, content: { subject: `News from Sample J-28 firm (Sample ${run})`, text: "Our spring information evening (Sample)." }, idempotencyKey: randomUUID() }));

try {
  // ---------------------------------------------------------------------------------------------- W1: the web form
  const t0 = new Date(Date.now() - 1_000);
  const p = await newPage();
  const sent = await sendForm(p, visitor, true, "W1-1-web-form");
  await look(p, "W1-2-thanks", "the web form's thank-you");
  const v = personOf(visitor.email), vRows = rowsOf(v);
  const given = v ? sql(`select given_at from msg_consent where subject_id = '${v}'`) : "";
  ok("J-28 W1: the visitor sends the web form with its consent ticked (the thank-you shows), and the tick's words are the firm's form wording", sent.thanks && sent.words === formText, sent);
  ok("J-28 W1 pass: underneath, exactly one consent row for the visitor: EMAIL MARKETING, source WEB_FORM, the wording the form showed, recorded by the web form, live",
    vRows.length === 1 && vRows[0] === `EMAIL|MARKETING|WEB_FORM|${formWording.id}|system:web-form|true`, vRows);
  ok("J-28 W1 pass: the row's time is the moment of sending (after the page was opened, not in the future)", !!given && new Date(given) >= t0 && new Date(given) <= new Date(), given);
  ok("J-28 W1 pass: no row for any other purpose (WhatsApp opt-in, WhatsApp marketing) was written by the tick", vRows.every((r) => r.startsWith("EMAIL|MARKETING|")) && v !== "" && sql(`select count(*) from msg_consent where subject_id = '${v}' and channel = 'WHATSAPP'`) === "0");
  ok("J-28 W1 pass: the consent's audit line names the web form as recorder", v !== "" && sql(`select count(*) from audit_event where action = 'consent.recorded' and actor = 'system:web-form' and entity_key in (select id::text from msg_consent where subject_id = '${v}')`) === "1");
  const u = await sendForm(await newPage(), unticked, false);
  const uPerson = personOf(unticked.email);
  ok("J-28 W1 fail: a visitor who leaves the tick empty is still taken (a lead and a person) but no consent row is written", u.thanks && uPerson !== "" && rowsOf(uPerson).length === 0, { thanks: u.thanks, person: !!uPerson, rows: rowsOf(uPerson) });

  // ---------------------------------------------------------------------------------------------- W2: the booking page
  const bp = await newPage();
  const b1 = await book(bp, visitor, true, "W2-1");
  const b = personOf(visitor.email, 1), bRows = rowsOf(b);
  const shownBooking = sql(`select id from msg_consent_wording where firm_id = '${firm.id}' and channel = 'EMAIL' and purpose = 'MARKETING' and text = $q$${b1.words}$q$`);
  ok("J-28 W2: the same visitor (same email) books on the booking page with the booking tick, and is booked", b1.booked, b1);
  ok("J-28 W2 pass: underneath, one BOOKING_FORM consent row for that purpose (EMAIL MARKETING), with the wording the page showed (the firm's newest, not the web form's), recorded by the booking page, live",
    bRows.length === 1 && shownBooking === bookingWording.id && shownBooking !== formWording.id && bRows[0] === `EMAIL|MARKETING|BOOKING_FORM|${shownBooking}|system:booking-page|true`, { bRows, shownBooking, words: b1.words });
  ok("J-28 W2: the booking's person is a new record flagged as a possible match of the web-form visitor, never linked (AG-2-84)",
    b !== "" && b !== v && sql(`select count(*) from fo_lead where person_id = '${b}' and possible_match_person_id = '${v}'`) === "1");
  ok("J-28 W2: the web form's row is untouched by the booking (still one row, live)", JSON.stringify(rowsOf(v)) === JSON.stringify(vRows));
  // FO-9b part 2b (P-574 (2); break M1 on #3527): the booking carries a consent, so it is never merged by itself (that
  // copy could never be undone); its job finishes and the pair waits on To review for a person.
  const jobDone = b ? await autoMergeDone(b) : false;
  ok("J-28 W2: the merge by itself leaves them apart (the booking carries a consent): its job finished, both records live, the pair To review",
    jobDone && sql(`select count(*) from fo_person where id in ('${v}', '${b}') and merged_into_id is null`) === "2"
      && sql(`select status from fo_dup_review where low_id = least('${v}'::uuid, '${b}'::uuid) and high_id = greatest('${v}'::uuid, '${b}'::uuid)`) === "OPEN", { jobDone });
  const b2 = await book(await newPage(), bookerOff, false);
  const off = personOf(bookerOff.email);
  ok("J-28 W2 fail: a booking with the tick off is booked and records no consent row (QA-511)", b2.booked && off !== "" && rowsOf(off).length === 0, { booked: b2.booked, rows: rowsOf(off) });

  // ---------------------------------------------------------------------------------------------- W3: one-click unsubscribe
  // The visitor's other purpose: a WhatsApp opt-in, recorded by staff (no public door records one yet; Sample fixture).
  await db.$transaction((tx) => consent.record(tx, { firmId: firm.id, subject: { kind: "FO_PERSON", id: v }, channel: "WHATSAPP", purpose: "SERVICE", wordingId: waWording.id, basis: "EXPRESS", source: "STAFF_RECORDED", locale: "en-CA", recordedKind: "USER", recordedBy: `staff:${host.id}` }));
  const before = await allowed(v, "EMAIL", visitor.email);
  const mail1 = await marketing(v, visitor.email);
  await messages.deliver(firm.id, mail1.outboxId);
  const box = (await inbox(visitor.email)).filter((m) => m.class === "MARKETING");
  const link = /<(.*)>/.exec(box[0]?.headers?.["List-Unsubscribe"] ?? "")?.[1] ?? "";
  ok("J-28 W5 fail half (before the unsubscribe): a marketing send to the visitor is allowed by their live consent and delivered to the demo inbox, with List-Unsubscribe one-click headers",
    before.allowed && mail1.state === "QUEUED" && box.length === 1 && link.startsWith(`${BASE}/api/public/unsubscribe/`) && box[0].headers["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click", { before, state: mail1.state, mails: box.length, link: link.replace(/unsubscribe\/.*/, "unsubscribe/<token>") });
  const up = await newPage();
  await up.goto(link || `${BASE}/api/public/unsubscribe/none`);
  const asked = await up.locator("h1").innerText().catch(() => "");
  await look(up, "W3-1-unsubscribe-page", "the unsubscribe page");
  ok("J-28 W3: the mail's link opens one page with one Unsubscribe button, and opening it records nothing", /Unsubscribe from .*marketing email\?/.test(asked) && (await up.getByRole("button", { name: "Unsubscribe" }).count()) === 1 && (await allowed(v, "EMAIL", visitor.email)).allowed, asked);
  const [answer] = await Promise.all([up.waitForNavigation(), up.getByRole("button", { name: "Unsubscribe" }).click()]);
  const doneText = await up.locator("h1").innerText();
  await look(up, "W3-2-unsubscribed", "the unsubscribed page");
  ok("J-28 W3: the visitor presses Unsubscribe → 'You are unsubscribed'", answer?.status() === 200 && doneText === "You are unsubscribed", [answer?.status(), doneText]);
  const after = rowsOf(v);
  ok("J-28 W3 pass: underneath, the web form's EMAIL MARKETING row is withdrawn via UNSUBSCRIBE, once, with a withdrawal row of its own",
    sql(`select withdrawn_via || '|' || (withdrawn_by like 'system:unsubscribe:%') from msg_consent where subject_id = '${v}' and channel = 'EMAIL'`) === "UNSUBSCRIBE|true"
      && sql(`select count(*) from msg_consent_withdrawal where subject_id = '${v}' and channel = 'EMAIL' and purpose = 'MARKETING' and via = 'UNSUBSCRIBE'`) === "1", after);
  ok("J-28 W3 pass: the visitor's other purpose stays granted: the WhatsApp opt-in row is live and the gate still allows it", after.some((r) => r.startsWith("WHATSAPP|SERVICE|STAFF_RECORDED|") && r.endsWith("|true"))
    && (await consent.allows(db, { firmId: firm.id, subject: { kind: "FO_PERSON", id: v }, channel: "WHATSAPP", address: "+14165550128", class: "SERVICE" })).allowed, after);
  ok("J-28 W3 pass: the withdrawal changed only the withdrawal columns (channel, purpose, wording, source and time as before)",
    sql(`select channel || '|' || purpose || '|' || source || '|' || wording_id || '|' || given_at from msg_consent where subject_id = '${v}' and channel = 'EMAIL'`) === `EMAIL|MARKETING|WEB_FORM|${formWording.id}|${given}`);
  const again = await fetch(link || `${BASE}/api/public/unsubscribe/none`, { method: "POST" });
  ok("J-28 W3 fail: the same link a second time → 404, and nothing more is recorded", again.status === 404 && sql(`select count(*) from msg_consent_withdrawal where subject_id = '${v}'`) === "1", again.status);
  // Not asserted (raised on the PR for qa): the booking's person has the same email and their own live EMAIL MARKETING
  // consent, and the unsubscribe withdrew only the web-form person's (persons are never linked, AG-2-84).
  const sameAddress = await allowed(b, "EMAIL", visitor.email);
  console.log(`NOTE  after the unsubscribe, a marketing send to the booking's person at the same address is ${sameAddress.allowed ? "still ALLOWED" : `blocked (${JSON.stringify(sameAddress)})`} (raised on the PR, not a line of this walk)`);

  // ---------------------------------------------------------------------------------------------- W4: never edited
  const vEmailRow = sql(`select id from msg_consent where subject_id = '${v}' and channel = 'EMAIL'`), bEmailRow = sql(`select id from msg_consent where subject_id = '${b}'`);
  const snap = (id: string) => sql(`select row_to_json(c)::text from msg_consent c where id = '${id}'`);
  const [vSnap, bSnap] = [snap(vEmailRow), snap(bEmailRow)];
  const editLive = refused(`update msg_consent set given_at = given_at - interval '1 day' where id = '${bEmailRow}'`);
  const editWithdrawn = refused(`update msg_consent set purpose = 'SERVICE' where id = '${vEmailRow}'`);
  const unwithdraw = refused(`update msg_consent set withdrawn_at = null, withdrawn_by = null, withdrawn_via = null where id = '${vEmailRow}'`);
  const del = refused(`delete from msg_consent where id = '${bEmailRow}'`);
  ok("J-28 W4 fail: editing a live consent row is refused by the database (only the withdrawal is ever set)", /only the withdrawal is ever set|evidence/.test(editLive), editLive);
  ok("J-28 W4 fail: editing or un-withdrawing a withdrawn consent row is refused by the database", /never changes|evidence|only the withdrawal/.test(editWithdrawn) && /never changes|evidence|only the withdrawal/.test(unwithdraw), [editWithdrawn, unwithdraw]);
  ok("J-28 W4 fail: deleting a consent row is refused by the database", /evidence|refused/.test(del), del);
  ok("J-28 W4: after the refused statements both rows are exactly as they were", snap(vEmailRow) === vSnap && snap(bEmailRow) === bSnap);
  const waOld = sql(`select id from msg_consent where subject_id = '${v}' and channel = 'WHATSAPP'`), waSnap = snap(waOld);
  const waNew = await db.$transaction((tx) => consent.record(tx, { firmId: firm.id, subject: { kind: "FO_PERSON", id: v }, channel: "WHATSAPP", purpose: "SERVICE", wordingId: waWording.id, basis: "EXPRESS", source: "STAFF_RECORDED", locale: "en-CA", recordedKind: "USER", recordedBy: `staff:${host.id}` }));
  const waDecision = await consent.allows(db, { firmId: firm.id, subject: { kind: "FO_PERSON", id: v }, channel: "WHATSAPP", address: "+14165550128", class: "SERVICE" });
  ok("J-28 W4 pass: a new grant of the same purpose is a new row; the old row is unchanged, and the gate now names the new one",
    waNew.id !== waOld && snap(waOld) === waSnap && sql(`select count(*) from msg_consent where subject_id = '${v}' and channel = 'WHATSAPP'`) === "2" && waDecision.allowed && waDecision.consentId === waNew.id, { waDecision, new: waNew.id });

  // ---------------------------------------------------------------------------------------------- W5: row 49's first step
  const blocked = await marketing(v, visitor.email);
  const gate = await allowed(v, "EMAIL", visitor.email);
  ok("J-28 W5 pass: a marketing send to the withdrawn purpose is blocked by the gate: SUPPRESSED, its reason kept (no live EMAIL MARKETING consent)",
    blocked.state === "SUPPRESSED" && /MARKETING/.test(blocked.reason ?? "") && !gate.allowed && sql(`select state || '|' || state_reason from msg_outbox where id = '${blocked.outboxId}'`) === `SUPPRESSED|${blocked.reason}`, { blocked, gate });
  await messages.deliver(firm.id, blocked.outboxId);   // the worker is asked to send it: it sends only a QUEUED row
  ok("J-28 W5 pass: asked to deliver, the blocked send still reaches nothing: the visitor's inbox holds only the one mail sent before the unsubscribe, and the row stays SUPPRESSED", sql(`select state from msg_outbox where id = '${blocked.outboxId}'`) === "SUPPRESSED" && (await inbox(visitor.email)).filter((m) => m.class === "MARKETING").length === 1);
  ok("J-28: no error in the browser", errors.length === 0, errors);
} catch (e) {
  ok(`J-28: the walk stopped — ${String((e as Error).stack ?? e).slice(0, 800)}`, false);
} finally {
  await browser.close();
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
