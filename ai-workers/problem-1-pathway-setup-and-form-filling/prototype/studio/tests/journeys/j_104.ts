// J-104 (map row 104, R1.104: a consultation agreement signed before the first consultation), written by the qa lane
// (22 Nov) ahead of FO-3c (#2922, API only on SigningPort's fake), because no j_104 was on main. It walks a firm's
// licensed Case Officer (the host) and the person who books, on an isolated copy of the running app (its own database
// and port, never :4400). Done when (CAPABILITIES R1.104): "A booking whose type needs it cannot start until signed; the
// reminder goes; the signed copy is on the person. Unconfirmed: no counsel".
//   Setup (Sample rows written to the copy's database, as j_39 does): firm `maple104` with an Owner, a licensed Case
//   Officer (Client C, a Sample licence record), a Billing and finance host (Client D: no list key); firm `birch104` with
//   its own Owner (Client X); Mon-Fri 09:00-17:00 hours; a "Free consultation" type (FREE_CONSULT); a lead (Client P,
//   with an email). The Owner's CONSULTATION template (a Sample .docx built here) goes into FO-5's template store, in the
//   copy's own file folder; that is what makes the firm's consultations need an agreement (FO-3c's rule: an active
//   consultation template; the build has no per-type switch).
//   W1 (screen) Client C signs in on the sign-in card, opens Home › Bookings calendar and books Client P with New booking.
//   W2 (running app) that booking sends one agreement for signing: a CONSULTATION agreement for the booking is stored and
//      GET …/consultation-agreements/by-booking/:id says "Agreement not signed yet". Fails on the fake (P-606): read
//      before the booking, there is none. FO-3c leaves the booking-event poller unwired (its feature file says so), so
//      this stays red after #2922 until that poller is on main.
//   W3 (screen) the booking's panel says "Agreement not signed yet" (FO-3c is API only: red until a screen shows it).
//   From W4 on, the agreement is made and signed by FO-3c's own service run in this process on the copy's database and
//   file folder (a stand-in, said, not hidden: the poller and FO-6's signing webhook are not wired, and the only signer is
//   SigningPort's fake, whose state lives in the process that calls it). Its clock, jobs and mail are fakes. On main the
//   service does not exist yet, so every such step is a FAIL ("not built"), never a throw.
//   W4 cannot start until signed: a booking of Client C's that ended 40 minutes ago, its agreement sent and unsigned.
//      On screen she presses Attended: refused in plain words naming the agreement, the booking stays Scheduled; by API
//      the attendance answer and the consult record are refused (4xx naming the agreement), nothing changes.
//   W5 the reminder goes: a booking three days ahead, unsigned: when the clock reaches 24 hours before it, one reminder
//      is sent (FO-3c sends it to the person who signs for the firm, the host here); the clock an hour earlier sends
//      none (fails on the fake); and Client C's GET …/needs-you on the running copy lists the unsigned agreement.
//   W6 the person signs (the client's link with consent, then the fake signer), then the host signs; the agreement is
//      sealed; the signed copy is emailed to the person once, with the file attached.
//   W7 the signed copy is on the person: GET …/by-person/:personId on the running copy says "Agreement signed" with the
//      stored copy's sha256; the lead's page on screen says "Agreement signed" (red until a screen shows it).
//   W8 others: firm birch104's Owner reads it as not found (404); Client D (no list key) is refused (403).
//   W9 after signing the consultation can start: Attended on the W4 booking is saved on screen.
//   W10 the booking panel at 1440 px: no serious axe violation (WCAG 2.2 A/AA); no page error.
// Every value is Sample. Every legal reading (Code SOR/2022-128 s. 23 "signed", e-signature identity): Unconfirmed: no
// counsel. US$0, no model call, live AI off, no live mail (fakes in this process; the copy's own mail stays local).
// Screenshots: product/screens/J-104/screenshots/. Run from prototype/ (HEADED=1 opens a visible browser):
//   zsh studio/tools/isolated.sh j104 4472 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j104 4472 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_104.ts j104 4472
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const NAME = process.argv[2] ?? "j104", PORT = Number(process.argv[3] ?? 4472), DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`;
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, STUDIO = join(import.meta.dirname, "..", "..");
const FILES = join(STUDIO, "var", `isolated-${NAME}`, "front-office-files");   // the copy's own LocalFiles folder (isolated.sh STUDIO_VAR)
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-104", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
process.env.DATABASE_URL = URL_;
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_, options: "-c TimeZone=UTC" }) });
const { seedFirmFrontOffice } = await import("../../api/src/front-office/firm-seed.ts");
const { EVERYONE_SEES_ALL, TIME_ZONE, CLOSED_DAYS, writeSetting } = await import("../../api/src/platform/settings.ts");
const { platformAuditWorkspaceId } = await import("../../api/src/platform/audit/audit-event.ts");
const { wallToUtc } = await import("../../api/src/front-office/booking/slots.ts");
const { LocalFiles } = await import("../../api/src/front-office/files.ts");
const { Retainers } = await import("../../api/src/front-office/retainers/service.ts");
const { buildDocx } = await import("../../api/src/front-office/retainers/docx.ts");
const { FakeClock } = await import("../../ports/clock.ts"), { fakeJobs } = await import("../../ports/jobs.ts"), { fakeMail } = await import("../../ports/mail.ts");
const { fakeAudit } = await import("../../ports/audit.ts"), { EVENT } = await import("../../ports/events.ts");
const TZ = "America/Toronto", MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR, KEY = "maple104", KEY_B = "birch104";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------------------------------------------------ set-up
if (await db.platformFirm.findUnique({ where: { key: KEY } })) { console.error(`STOP  firm ${KEY} exists: start a fresh copy (isolated.sh … start)`); process.exit(2); }
const firm = async (key: string, name: string) => {
  const f = await db.platformFirm.create({ data: { key, operatingName: name, countryCode: "CA", status: "ACTIVE", contactEmail: `hello@${key}.example` } });
  await db.$transaction((tx) => seedFirmFrontOffice(tx, f.id));
  const ws = await platformAuditWorkspaceId(db as never);
  for (const [k, v] of [[TIME_ZONE.key, TZ], [CLOSED_DAYS.key, []], [EVERYONE_SEES_ALL.key, true]] as const) await writeSetting(db, { firmId: f.id, key: k, value: v, by: "system:test", workspaceId: ws });
  return f;
};
const M = await firm(KEY, "Maple Immigration (Sample)"), MB = await firm(KEY_B, "Birch Immigration (Sample)");
const person = async (f: { id: string; key: string }, name: string, role: string) => {
  const s = await db.platformStaff.create({ data: { firmId: f.id, email: `${name.replace(/\W/g, "").toLowerCase()}@${f.key}.example`, displayName: name } });
  await db.platformRoleGrant.create({ data: { firmId: f.id, staffId: s.id, role: role as never, grantedBy: "seed:j104" } });
  return s;
};
const F = await person(M, "Client F", "OWNER"), C = await person(M, "Client C", "CASE_OFFICER"), D = await person(M, "Client D", "BILLING_FINANCE"), X = await person(MB, "Client X", "OWNER");
await db.platformStaffCredential.create({ data: { firmId: M.id, staffId: C.id, representativeType: "RCIC", licensingBody: "College of Immigration and Citizenship Consultants (Sample)", licenceNumber: "R000104 (Sample)", updatedBy: "seed:j104" } });
await db.foAvailability.createMany({ data: [F, C, D].flatMap((h) => [1, 2, 3, 4, 5].map((weekday) => ({ firmId: M.id, staffId: h.id, weekday, startMinute: 540, endMinute: 1020, timeZone: TZ }))) });
const type = await db.foConsultationType.create({ data: { firmId: M.id, slug: "free-consultation", name: "Free consultation", purpose: "FREE_CONSULT" as never, modes: ["VIDEO", "PHONE"], hostStaffIds: [F.id, C.id, D.id], minutes: 30, windowDays: 60, minNoticeMinutes: 0 } });
const P = await db.foPerson.create({ data: { firmId: M.id, givenNames: "Client P", familyName: "Sample", email: "clientp@client104.example", createdBy: "test" } });
const lead = await db.foLead.create({ data: { firmId: M.id, personId: P.id, door: "MANUAL", source: "WEBSITE", ownerStaffId: C.id, createdBy: "test" } });
// The Owner's consultation template, through FO-5's own store, in the copy's file folder (so the running app reads it too).
const files = new LocalFiles(FILES);
const ctxOf = (s: { id: string; firmId: string }, firmKey: string) => ({ staffId: s.id, firmId: s.firmId, firmKey, roles: [], keys: [], duties: [], authTime: 0, via: "local" }) as never;
const TEMPLATE = ["# Consultation agreement (Sample)", "Client: {client.name} ({client.email})", "Licensee: {representative.name}, {representative.licensing_body}, {representative.licence_number}", "{#fees}", "{label}: {amount}", "{/fees}"];
const tplBytes = buildDocx(TEMPLATE);
const tpl = await new Retainers(db, files, { now: () => Date.now() }).uploadTemplate(ctxOf(F, KEY), { name: "Consultation agreement (Sample)", kind: "CONSULTATION" }, { bytes: tplBytes, size: tplBytes.length } as never).catch((e: unknown) => ({ error: String(e) }));
ok("J-104 setup: firms maple104 and birch104 (Sample), a licensed Case Officer, a Billing and finance host, a lead with an email, and the Owner's active CONSULTATION template in FO-5's store",
  "id" in (tpl as object) && (await db.foRetainerTemplate.count({ where: { firmId: M.id, kind: "CONSULTATION", active: true } })) === 1, tpl);

const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const plus = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const wall = (date: string, hhmm: string) => { const [y, m, d] = date.split("-").map(Number), [h, mi] = hhmm.split(":").map(Number); return wallToUtc(y, m, d, h * 60 + mi, TZ)!; };
const book = (startsAt: Date) => db.foBooking.create({ data: { firmId: M.id, typeId: type.id, staffId: C.id, personId: P.id, mode: "VIDEO", startsAt, endsAt: new Date(startsAt.getTime() + 30 * MIN), bookerTimeZone: TZ } });
const agreementsOf = async (bookingId: string) => Number((await db.$queryRaw<{ n: bigint }[]>`select count(*) n from fo_retainer r join fo_retainer_version v on v.firm_id = r.firm_id and v.retainer_id = r.id where r.firm_id = ${M.id}::uuid and r.kind = 'CONSULTATION' and v.merge_values->>'booking.id' = ${bookingId}`)[0].n);

const browser = await chromium.launch({ headless: !process.env.HEADED, slowMo: process.env.HEADED ? 200 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const settle = async (p: Page) => { await p.locator("main h1").first().waitFor({ timeout: 30_000 }); await p.locator("[data-loading]").first().waitFor({ state: "detached", timeout: 30_000 }).catch(() => undefined); await p.waitForTimeout(300); };
const go = async (p: Page, path: string) => { await p.goto(`${BASE}${path}`); await settle(p); };
async function signIn(firmKey: string, email: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: TZ, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(`${BASE}/account`);
  await p.getByLabel("Firm key").fill(firmKey); await p.getByLabel("Work email").fill(email); await p.getByRole("button", { name: "Sign in" }).click();
  await p.getByLabel("Firm key").waitFor({ state: "detached", timeout: 20_000 });
  return p;
}
const tokenOf = (p: Page) => p.evaluate(() => JSON.parse(sessionStorage.getItem("xr-staff-session") ?? "{}").token as string);
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other journeys
const api = async (token: string, method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const AGREEMENTS = "/front-office/consultation-agreements";
const pageText = async (p: Page) => (await p.locator("body").innerText()).replace(/\s+/g, " ");

try {
  // --------------------------------------------------------------------------------------------- W1, W2, W3
  const c = await signIn(KEY, C.email), tc = await tokenOf(c);
  await settle(c);
  await c.getByRole("link", { name: "Home", exact: true }).first().click(); await settle(c);
  await c.locator('a[href="/front-office/bookings"]').first().click(); await settle(c);
  const before = await db.foRetainer.count({ where: { firmId: M.id, kind: "CONSULTATION" } });
  await c.locator("[data-new-booking]").click();
  await c.locator("[data-person-find]").fill("Client P");
  await c.locator("[data-person]").selectOption({ index: 1 });
  await c.locator("[data-host]").selectOption({ label: "Client C (you)" });
  const slot = c.locator("[data-time-chooser] button[aria-pressed]").first();
  await slot.waitFor({ timeout: 15_000 }); await slot.click();
  await c.locator("[data-book]").click(); await c.locator("[data-book]").waitFor({ state: "detached", timeout: 15_000 });
  const said = await c.locator("[data-saved]").innerText().catch(() => "");
  const b1 = await db.foBooking.findFirst({ where: { firmId: M.id, staffId: C.id, personId: P.id }, orderBy: { createdAt: "desc" } });
  ok("J-104 W1: Client C signs in on screen, opens Home › Bookings calendar and books Client P with New booking: \"Booked\", stored once", said.startsWith("Booked Client P Sample") && !!b1, { said });
  if (!b1) throw new Error("no booking was made; the walk cannot go on");
  ok("J-104 W2 fail (before the booking, P-606): no consultation agreement existed", before === 0);
  let sent = 0; for (let i = 0; i < 40 && !sent; i++) { await wait(500); sent = await agreementsOf(b1.id); }
  const byBooking = await api(tc, "GET", `${AGREEMENTS}/by-booking/${b1.id}`);
  ok("J-104 W2: the booking sends one agreement for signing on the running app: one CONSULTATION agreement for it, and by-booking says \"Agreement not signed yet\"",
    sent === 1 && byBooking.status === 200 && byBooking.body?.words === "Agreement not signed yet", { stored: sent, byBooking: [byBooking.status, byBooking.body?.words ?? byBooking.body?.title] });
  await go(c, `/front-office/bookings/${b1.id}`);
  await c.locator("[data-booking-detail]").waitFor({ timeout: 15_000 }).catch(() => undefined);
  const panel1 = await pageText(c);
  ok("J-104 W3: the booking's panel says \"Agreement not signed yet\"", panel1.includes("Agreement not signed yet"), panel1.slice(0, 200));
  await shot(c, "w3-booking-panel-1440");

  // --------------------------------------------------------------------------------------------- the stand-in service
  // FO-3c's service in this process, on the copy's database and file folder, with fake clock, jobs, mail, audit and signer.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the module is not on main yet; read loosely
  let mod: any = null, sig: any = null;
  try { mod = await import("../../api/src/front-office/booking/consultation-agreement/service.ts"); sig = await import("../../api/src/front-office/signing/port.ts"); } catch (e) { console.log(`      (FO-3c's service is not here: ${String(e).slice(0, 120)})`); }
  const clock = new FakeClock(new Date()), jobs = fakeJobs(clock), mail = fakeMail({ clock }), audit = fakeAudit();
  const signing = sig?.fakeSigning ? sig.fakeSigning({ now: () => clock.now() }) : null;
  const svc = mod?.ConsultationAgreementService ? new mod.ConsultationAgreementService(db, { audit, clock, mail, jobs, signing, files, publicBaseUrl: BASE }) : null;
  if (svc) await svc.registerJobs();
  const NOT_BUILT = "FO-3c's service is not on main";
  const eventOf = (b: { id: string; firmId: string; sequence: number; status: string; typeId: string; staffId: string; personId: string | null; prospectId: string | null; mode: string; startsAt: Date; endsAt: Date; bookerTimeZone: string }) =>
    ({ type: EVENT.BOOKING_SCHEDULED, firmId: b.firmId, payload: { key: `${b.id}:${b.sequence}`, bookingId: b.id, sequence: b.sequence, status: b.status, typeId: b.typeId, staffId: b.staffId, personId: b.personId, prospectId: b.prospectId, mode: b.mode, startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString(), bookerTimeZone: b.bookerTimeZone } });

  // --------------------------------------------------------------------------------------------- W4 cannot start
  const b2 = await book(new Date(Math.floor((Date.now() - 70 * MIN) / (30 * MIN)) * 30 * MIN));   // ended about 40 minutes ago
  const s2 = svc ? await svc.onBookingEvent(eventOf(b2)) : null;
  const a2: string | null = s2?.sent ? s2.agreementId : null;
  ok("J-104 W4 setup (stand-in): the ended booking's agreement is sent and unsigned", !!a2, s2 ?? NOT_BUILT);
  await go(c, `/front-office/bookings/${b2.id}`);
  await c.locator("[data-booking-detail]").waitFor({ timeout: 15_000 });
  await c.locator("[data-booking-detail]").getByRole("button", { name: "Attended", exact: true }).click().catch(() => undefined);
  let afterClick0 = ""; for (let i = 0; i < 10 && afterClick0 !== "COMPLETED"; i++) { await wait(300); afterClick0 = (await db.foBooking.findUniqueOrThrow({ where: { id: b2.id } })).status; }
  const afterClick = (await db.foBooking.findUniqueOrThrow({ where: { id: b2.id } })).status, refusal = await pageText(c);
  await shot(c, "w4-attended-before-signing-1440");
  ok("J-104 W4 (screen): before the agreement is signed, Attended is refused in plain words naming the agreement, and the booking stays Scheduled",
    !!a2 && afterClick === "SCHEDULED" && /agreement/i.test(refusal) && /sign/i.test(refusal), { a2: !!a2, afterClick });
  // A second ended booking for the API judge (a status that moved cannot be put back: the table's own guard).
  const b3 = await book(new Date(Math.floor((Date.now() - 130 * MIN) / (30 * MIN)) * 30 * MIN));
  const s3 = svc ? await svc.onBookingEvent(eventOf(b3)) : null;
  const att = await api(tc, "POST", `/front-office/bookings/${b3.id}/attendance`, { outcome: "COMPLETED" });
  const rec = await api(tc, "PUT", `/front-office/bookings/${b3.id}/consult-record`, { summary: "Sample consult notes (J-104)" });
  const still = (await db.foBooking.findUniqueOrThrow({ where: { id: b3.id } })).status;
  ok("J-104 W4 (API): with its agreement unsigned, the attendance answer and the consult record are refused (4xx naming the agreement); nothing changes",
    !!s3?.sent && att.status >= 400 && att.status < 500 && /agreement/i.test(JSON.stringify(att.body)) && rec.status >= 400 && rec.status < 500 && /agreement/i.test(JSON.stringify(rec.body)) && still === "SCHEDULED", { sent: !!s3?.sent, attendance: [att.status, att.body?.detail], record: [rec.status, rec.body?.detail], still });

  // --------------------------------------------------------------------------------------------- W5 the reminder
  const day3 = plus(ymd(new Date()), 3);
  const b4 = await book(wall(day3, "15:00"));
  const s4 = svc ? await svc.onBookingEvent(eventOf(b4)) : null;
  const reminders = () => mail.sent.filter((m: { templateKey?: string }) => m.templateKey === "consultation_agreement.reminder");
  let earlyCount = -1, dueCount = -1;
  if (svc && s4?.sent) {
    await clock.set(new Date(b4.startsAt.getTime() - DAY - HOUR)); earlyCount = reminders().length;
    await clock.set(new Date(b4.startsAt.getTime() - DAY + MIN)); dueCount = reminders().length;
    await clock.set(new Date(b4.startsAt.getTime() - DAY + 2 * HOUR));
  }
  const rem = reminders() as { to: string; subject: string }[];
  ok("J-104 W5 fail (an hour before the 24-hour mark, P-606): no reminder yet", earlyCount === 0, earlyCount < 0 ? NOT_BUILT : earlyCount);
  ok("J-104 W5: 24 hours before the unsigned booking the reminder goes, once, to the person who signs for the firm (the licensed host, Client C)",
    dueCount === 1 && rem.length === 1 && rem[0].to === C.email.toLowerCase(), dueCount < 0 ? NOT_BUILT : rem.map((m) => [m.to, m.subject]));
  const needs = await api(tc, "GET", `${AGREEMENTS}/needs-you`);
  ok("J-104 W5: on the running copy Client C's \"needs you\" lists her unsigned agreements", needs.status === 200 && (needs.body?.items ?? []).some((i: { agreementId: string }) => i.agreementId === a2), [needs.status, needs.body?.items?.length ?? needs.body?.title]);

  // --------------------------------------------------------------------------------------------- W6 signing
  let sealedOk = false, copyMails = 0, sealedSha = "";
  if (svc && a2) {
    const link = (mail.inbox(P.email!) as { templateKey?: string; text: string }[]).find((m) => m.templateKey === "consultation_agreement.sent")?.text.match(/#([^\s]+)/)?.[1] ?? "";
    await svc.open(link); await svc.open(link, { consent: true });
    const req = await db.foSignatureRequest.findFirstOrThrow({ where: { firmId: M.id, documentId: a2 } });
    const client = await db.foSigner.findFirstOrThrow({ where: { firmId: M.id, requestId: req.id, role: "CLIENT" } }), firmSigner = await db.foSigner.findFirstOrThrow({ where: { firmId: M.id, requestId: req.id, role: "FIRM" } });
    for (const h of await signing.act(M.id, req.providerDocumentId, client.id, "signed")) await svc.signingEvent(h);
    await svc.hostLink(ctxOf(C, KEY), a2, { consent: true });
    for (const h of await signing.act(M.id, req.providerDocumentId, firmSigner.id, "signed")) await svc.signingEvent(h);
    sealedOk = await svc.seal(M.id, req.id);
    await clock.set(new Date(clock.now().getTime() + 5 * MIN));
    copyMails = (mail.inbox(P.email!) as { templateKey?: string; attachments?: unknown[] }[]).filter((m) => m.templateKey === "consultation_agreement.signed_copy" && (m.attachments?.length ?? 0) === 1).length;
    sealedSha = (await db.foSigningEvidence.findFirst({ where: { firmId: M.id, requestId: req.id } }))?.sealedSha256 ?? "";
  }
  ok("J-104 W6 (stand-in signer): Client P signs through the emailed link with consent, then Client C signs for the firm; the agreement is sealed and the signed copy is emailed to Client P once, attached",
    sealedOk && copyMails === 1 && /^[0-9a-f]{64}$/.test(sealedSha), svc ? { sealedOk, copyMails, sealedSha: !!sealedSha } : NOT_BUILT);

  // --------------------------------------------------------------------------------------------- W7, W8 the copy on the person
  const byPerson = await api(tc, "GET", `${AGREEMENTS}/by-person/${P.id}`);
  const mine = (byPerson.body?.agreements ?? []).find((x: { id: string }) => x.id === a2);
  ok("J-104 W7 (running copy): by-person says \"Agreement signed\" for Client P with the stored copy's sha256", byPerson.status === 200 && mine?.words === "Agreement signed" && !!sealedSha && JSON.stringify(mine).includes(sealedSha), [byPerson.status, mine?.words ?? byPerson.body?.title]);
  await go(c, `/front-office/leads/${lead.id}`);
  const leadText = await pageText(c);
  ok("J-104 W7 (screen): Client P's lead page says \"Agreement signed\" and offers the signed copy", leadText.includes("Agreement signed"), leadText.slice(0, 160));
  await shot(c, "w7-lead-page-1440");
  const x = await signIn(KEY_B, X.email), d = await signIn(KEY, D.email);
  const other = await api(await tokenOf(x), "GET", `${AGREEMENTS}/by-person/${P.id}`), noKey = await api(await tokenOf(d), "GET", `${AGREEMENTS}/by-person/${P.id}`);
  const otherById = a2 ? await api(await tokenOf(x), "GET", `${AGREEMENTS}/${a2}`) : { status: 0 };
  ok("J-104 W8: firm birch104's Owner reads Client P's agreements as not found (404, by person and by id); Client D without the list key is refused (403); the route itself answers its own firm (200, so a 404 is a refusal, not a missing route)", byPerson.status === 200 && other.status === 404 && otherById.status === 404 && noKey.status === 403, { other: other.status, otherById: otherById.status, noKey: noKey.status });
  await x.context().close(); await d.context().close();

  // --------------------------------------------------------------------------------------------- W9, W10
  await go(c, `/front-office/bookings/${b2.id}`);
  await c.locator("[data-booking-detail]").waitFor({ timeout: 15_000 });
  await c.locator("[data-booking-detail]").getByRole("button", { name: "Attended", exact: true }).click().catch(() => undefined);
  let started = ""; for (let i = 0; i < 20 && started !== "COMPLETED"; i++) { await wait(300); started = (await db.foBooking.findUniqueOrThrow({ where: { id: b2.id } })).status; }
  ok("J-104 W9: once the agreement is signed, Attended on that booking is saved (the consultation can start; it was refused in W4)", sealedOk && afterClick === "SCHEDULED" && started === "COMPLETED", { sealedOk, beforeSigning: afterClick, started });
  const bad = (await new AxeBuilder({ page: c }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id);
  ok("J-104 W10: the booking panel at 1440 px has no serious axe violation", bad.length === 0, bad);
  await shot(c, "w9-attended-after-signing-1440");
  ok("J-104: no page error during the walk", errors.length === 0, errors);
} catch (e) {
  ok("J-104: the walk ran to its end", false, String(e).slice(0, 500));
} finally {
  await browser.close(); await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
