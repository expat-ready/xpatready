// J-49 (map row 49, R1.49: "A send without the purpose's consent is refused before it leaves, on every path; one-click
// unsubscribe withdraws that purpose; service messages still go"): the join-and-walk row. It adds no feature: it joins
// PF-19b (sending: the consent gate in MessagePort, the one-click unsubscribe door) with FO-2's booking tick (the consent
// the gate reads) and walks them like a person on an isolated copy of the running app (own database and port, never :4400).
// It starts where J-48 ends (j_48.ts W5): a booking on the firm's public page and the unsubscribe headers of a firm email.
//   W1 two visitors book on the firm's public page (browser): visitor A ticks the firm's marketing box, visitor B does not;
//      the tick is stored as A's email marketing consent, and B has none;
//   W2 a marketing email without consent is blocked: no screen or door on main sends marketing yet (campaigns are not
//      built), so the firm's marketing email is sent through MessagePort in process, on the copy's own database and files;
//      B's is SUPPRESSED before it leaves (nothing in the demo inbox) and A's goes; B's lead page says why, in words
//      (browser, axe, 1024 and 1440 px);
//   W3 unsubscribe works: A opens the List-Unsubscribe link of that email from the demo inbox (browser): the page has one
//      button and records nothing; Unsubscribe records one withdrawal; the used link then answers the not-found page;
//   W4 after it: the next marketing email to A is not sent, one queued before the click is stopped by the worker's
//      re-check, a service email to A still goes; A's lead page shows both, in words (browser, axe). The walk ends at map
//      row 50's first step (in-app notifications, Not built on main: no screen to open), so it ends on this lead page.
//   DW1 the gate reads the real consent store (the booking's tick in msg_consent) · DW2 the gate reads the withdrawal the
//   running copy's unsubscribe door wrote. Each DW judge is run again on its stand-in (fakeConsent) and must fail there
//   (the "NR" lines, P-606).
// Not here: QA-518's address-wide stop (one unsubscribe stops every person record at that address) is #2618's own check
// (check_qa518_unsubscribe_address.ts); the case side's link emails (QA-495) are PF-19r's.
// Sample rows only; US$0, no model call, no real email. Run from prototype/ (HEADED=1 opens a visible browser):
//   zsh studio/tools/isolated.sh j49 4592 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j49 4592 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_49.ts j49 4592
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { copyFirmHoursTo } from "../../api/src/front-office/booking-seed.ts";
import { LocalFiles } from "../../api/src/front-office/files.ts";
import { SAMPLE_BOOKING_WORDING, seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { auditEvent } from "../../api/src/platform/audit/audit-event.ts";
import { connectLocalNotices, localEmail } from "../../api/src/platform/messages/channels/email/local.ts";
import { ConsentStore } from "../../api/src/platform/messages/consent/consent-store.ts";
import { channelsOf } from "../../api/src/platform/messages/send/channels.ts";
import { Messages } from "../../api/src/platform/messages/send/messages.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { fakeAlerts } from "../../ports/alert.ts";
import { FakeClock } from "../../ports/clock.ts";
import { fakeConsent, type ConsentPort } from "../../ports/consent.ts";
import { fakeJobs } from "../../ports/jobs.ts";
import type { MessageSend } from "../../ports/messages.ts";
import { client, recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [NAME, PORT] = [process.argv[2] ?? "j49", Number(process.argv[3] ?? 4592)];
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..", "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-49", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const HEADED = process.env.HEADED === "1";
const { ok, summary } = recorder();
const { sql: rawSql, until } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
type Ans = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks

// ------------------------------------------------------------------------------------------------ setup (Sample)
await seedSampleFirms(db);
const fo = await seedSampleFirmsFrontOffice(db);
const [firmId, firmName] = sql(`select id || '|' || operating_name from platform_firm where key = 'sample-firm'`).split("|");
ok("J-49 setup: the Sample firm and its front office are seeded", !!firmId && fo.failed.length === 0, fo.failed);
const staff = (actor: string) => { const [id, email] = sql(`select id || '|' || email from platform_staff where actor_id = '${actor}'`).split("|"); return { id, email }; };
const R = staff("user-R"), O = staff("user-O");
// A person cannot set up a consultation type by screens yet (FO-3a): one Sample type, hosted by the Case officer (as J-48).
if (sql(`select count(*) from fo_consultation_type where firm_id = '${firmId}' and slug = 'free'`) === "0") {
  await copyFirmHoursTo(db, firmId, [O.id]);
  await db.foConsultationType.create({ data: { firmId, slug: "free", name: "Free consultation", modes: ["VIDEO"], hostStaffIds: [O.id], minutes: 30, windowDays: 60 } });
}
async function signIn(email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email, secondStep: true }) });
  const b = await r.json() as { token?: string; detail?: string }; if (b.token) return b.token;
  console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`); process.exit(2);
}
const ownerToken = await signIn(R.email);
const api = async (method: string, path: string): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method });
  const text = await r.text(); let b: unknown = text; try { b = JSON.parse(text); } catch { /* text */ } return { status: r.status, body: b };
};
type Mail = { id: string; class: string; subject: string; headers: Record<string, string> };
const inboxNow = async (address: string): Promise<Mail[]> => (await api("GET", `/demo/platform-inbox?address=${encodeURIComponent(address)}`)).body?.messages ?? [];
const inbox = async (address: string, want = 1): Promise<Mail[]> => { let m: Mail[] = []; await until(async () => (m = await inboxNow(address)).length >= want, 90_000); return m; };
type Row = { id: string; state: string; reason: string | null; class: string };
const outbox = (id: string): Row => JSON.parse(rawSql(`select json_build_object('id', id, 'state', state, 'reason', state_reason, 'class', class) from msg_outbox where id = '${id}'`) || "null");
const consentRows = (person: string) => JSON.parse(rawSql(`select coalesce(json_agg(json_build_object('source', source, 'kind', recorded_kind, 'withdrawn', withdrawn_at is not null, 'via', withdrawn_via) order by given_at), '[]') from msg_consent where firm_id = '${firmId}' and subject_kind = 'FO_PERSON' and subject_id = '${person}' and channel = 'EMAIL' and purpose = 'MARKETING'`)) as { source: string; kind: string; withdrawn: boolean; via: string | null }[];
const withdrawals = (person: string) => Number(sql(`select count(*) from msg_consent_withdrawal where firm_id = '${firmId}' and subject_kind = 'FO_PERSON' and subject_id = '${person}' and channel = 'EMAIL' and purpose = 'MARKETING' and via = 'UNSUBSCRIBE'`));

const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 250 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
async function pageAs(t: string | null): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  if (t) await ctx.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), t);
  p.on("pageerror", (e) => errors.push(String(e))); return p;
}
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const axeOf = async (p: Page, name: string) => { const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze(); ok(`J-49 ${name}: axe finds no WCAG A/AA violation`, r.violations.length === 0, r.violations.map((v) => `${v.id}: ${v.nodes.length}`)); };
const noSideways = async (p: Page, name: string) => { for (const w of [1024, 1440]) { await p.setViewportSize({ width: w, height: 900 }); ok(`J-49 ${name} at ${w} px: no sideways page scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)); } await p.setViewportSize({ width: 1440, height: 900 }); };

try {
  // ---------------------------------------------------------------------------------------------- W1 two visitors book
  /** Books the Sample free consultation on the firm's public page, with or without the firm's marketing tick. */
  const book = async (who: string, address: string, tick: boolean) => {
    const v = await pageAs(null);
    await v.goto(`${BASE}/book/sample-firm`); await v.locator("[data-type-card]").first().waitFor({ timeout: 30_000 });
    await v.getByRole("link", { name: "Choose Free consultation", exact: true }).click(); await v.getByRole("heading", { name: "Choose a time" }).waitFor();
    const days = v.locator('[role="group"] button:not([disabled])');
    for (let i = 0; i < 3 && (await days.count()) === 0; i++) { await v.getByRole("button", { name: "Next month" }).click(); await v.waitForTimeout(800); }
    await days.first().click(); await v.locator("[data-day-times] li button").first().click();
    await v.getByRole("heading", { name: "Your details" }).waitFor();
    await v.getByLabel("Given names").fill(who); await v.getByLabel("Family name").fill(`Sample ${run}`); await v.getByLabel("Email").fill(address);
    const box = v.getByRole("checkbox");
    const offered = (await box.count()) === 1 && !(await box.isChecked()) && (await v.getByText(SAMPLE_BOOKING_WORDING).count()) === 1;
    if (offered && tick) await box.check();
    await shot(v, `W1-details-${tick ? "ticked" : "not-ticked"}-1440`);
    if (tick) await axeOf(v, "W1 Your details, with the firm's marketing tick");
    await v.waitForTimeout(3500);   // the form's minimum fill time
    await v.getByRole("button", { name: "Book this time" }).click();
    await v.locator('[data-public-state="booked"]').waitFor({ timeout: 20_000 });
    await v.context().close();
    const person = sql(`select id from fo_person where firm_id = '${firmId}' and lower(email) = '${address}' order by created_at desc limit 1`);
    const lead = sql(`select id from fo_lead where firm_id = '${firmId}' and person_id = '${person}' order by created_at desc limit 1`);
    return { address, person, lead, offered };
  };
  const A = await book("Visitor A", `j49.a.${run}@example.com`, true), B = await book("Visitor B", `j49.b.${run}@example.com`, false);
  ok("J-49 W1 pass: the firm's public booking page offers one marketing tick, unticked, beside the firm's own wording (its Sample booking wording)", A.offered && B.offered);
  const cA = consentRows(A.person), cB = consentRows(B.person);
  ok("J-49 W1 pass: visitor A's tick is stored as A's own email marketing consent (BOOKING_FORM, self-service, live)", cA.length === 1 && cA[0].source === "BOOKING_FORM" && cA[0].kind === "SELF_SERVICE" && !cA[0].withdrawn, cA);
  ok("J-49 W1 fail: visitor B, who left the box empty, has no marketing consent", !!B.person && cB.length === 0, cB);
  const confA = await inbox(A.address), confB = await inbox(B.address);
  ok("J-49 W1 pass: both visitors still get their booking confirmation (transactional: no consent needed, no unsubscribe link)",
    confA.length === 1 && confB.length === 1 && [confA[0], confB[0]].every((m) => m.class === "TRANSACTIONAL" && !m.headers["List-Unsubscribe"]), [confA, confB].map((x) => x.map((m) => [m.class, m.subject])));

  // ---------------------------------------------------------------------------------------------- W2 a marketing send without consent is blocked
  // The firm's MessagePort in process, on the copy's own database and files (the demo inbox reads the same folder).
  const files = new LocalFiles(join(STUDIO, "var", `isolated-${NAME}`, "front-office-files")), clock = new FakeClock(new Date());
  connectLocalNotices(null);   // this process's local sends give no test events (the copy's own sends do)
  const wire = async (consent: ConsentPort<never>) => { const jobs = fakeJobs(clock), m = new Messages({ db, consent: consent as never, files, jobs, alerts: () => fakeAlerts(), channels: channelsOf([["EMAIL", localEmail]]), clock }); await m.register(); return { m, jobs }; };
  const real = await wire(new ConsentStore(auditEvent) as never);
  type Wired = Awaited<ReturnType<typeof wire>>;
  const send = async (w: Wired, to: { address: string; person: string }, cls: MessageSend["class"], o: { hold?: boolean } = {}) => {
    const r = await db.$transaction((t) => w.m.send(t, { firmId, person: { kind: "FO_PERSON", id: to.person }, channel: "EMAIL", class: cls, address: to.address,
      content: { subject: cls === "MARKETING" ? `Spring information session (Sample ${run})` : `Your consultation notes (Sample ${run})`, text: "Sample." }, idempotencyKey: randomUUID() }));
    if (!o.hold && r.state === "QUEUED") { await w.m.dispatch(firmId, [r.outboxId]); await w.jobs.runDue(); }
    return { id: r.outboxId, first: r.state, row: outbox(r.outboxId) };
  };
  /** The DW1 judge: marketing to the visitor who ticked goes; to the one who did not, it is SUPPRESSED for no consent. */
  const dw1 = async (w: Wired) => { const a = await send(w, A, "MARKETING"), b = await send(w, B, "MARKETING"); return { a, b, holds: a.row.state === "SENT" && b.row.state === "SUPPRESSED" && b.row.reason === "NO_CONSENT: MARKETING" }; };
  const g = await dw1(real);
  ok("J-49 W2 pass: the firm's marketing email to visitor B (no consent) is SUPPRESSED before it leaves, reason NO_CONSENT: MARKETING, and never reaches B's inbox",
    g.b.first === "SUPPRESSED" && g.b.row.reason === "NO_CONSENT: MARKETING" && (await inboxNow(B.address)).length === 1, g.b);
  const mA = await inbox(A.address, 2), mkt = mA.find((m) => m.id === g.a.id);
  ok("J-49 W2 fail: the same marketing email to visitor A (ticked) goes, and arrives with the one-click unsubscribe headers", g.a.row.state === "SENT" && !!mkt && /\/api\/public\/unsubscribe\/[A-Za-z0-9_-]+>$/.test(mkt.headers["List-Unsubscribe"] ?? "") && mkt.headers["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click", [g.a.row, mkt?.headers]);
  ok("J-49 DW1 pass: the gate reads the real consent store: A's booking tick (msg_consent) lets it through, B's empty box does not", g.holds, g);
  // The stand-in is judged on its answers, as the gate gives them to send(): rows written through it would sit on both
  // lead pages as "Not sent" (review m2), and A, who ticked, would read "no consent".
  const ask = (to: { address: string; person: string }) => ({ firmId, subject: { kind: "FO_PERSON" as const, id: to.person }, channel: "EMAIL" as const, address: to.address, class: "MARKETING" as const });
  const stand = fakeConsent(), nrA = await stand.allows(null, ask(A)), nrB = await stand.allows(null, ask(B));
  const dw1Answers = (a: { allowed: boolean }, b: { allowed: boolean; reason: string }) => a.allowed && !b.allowed && b.reason === "NO_CONSENT";
  ok("J-49 DW1 pass (the gate's answers): the real consent store allows A and refuses B for NO_CONSENT", dw1Answers(await new ConsentStore(auditEvent).allows(db as never, ask(A)), await new ConsentStore(auditEvent).allows(db as never, ask(B))));
  ok("J-49 DW1 NR [fails on the stand-in]: with fakeConsent (no booking tick in it) the judge fails because A is refused for NO_CONSENT too", !dw1Answers(nrA, nrB) && !nrA.allowed && nrA.reason === "NO_CONSENT", [nrA, nrB]);
  const owner = await pageAs(ownerToken);
  const messagesBox = async (lead: string) => {
    await owner.goto(`${BASE}/front-office/leads/${lead}`);
    const box = owner.locator("[data-messages-panel]"); await box.locator("[data-message]").first().waitFor({ timeout: 30_000 });
    return box;
  };
  const line = async (box: ReturnType<Page["locator"]>, id: string) => { const l = box.locator(`[data-message="${id}"]`); await l.waitFor({ timeout: 30_000 }); return { word: await l.locator("[data-state-word]").innerText(), why: (await l.locator("[data-reason]").count()) ? await l.locator("[data-reason]").innerText() : "", text: await l.innerText() }; };
  const boxB = await messagesBox(B.lead), lB = await line(boxB, g.b.id);
  await boxB.scrollIntoViewIfNeeded(); await shot(owner, "W2-lead-B-not-sent-1440");
  ok("J-49 W2 pass: B's lead page (the Owner) shows the marketing email as \"Not sent\", why in words (\"no consent to marketing on this channel\"), the address masked",
    lB.word === "Not sent" && lB.why === "Not sent: no consent to marketing on this channel" && !lB.text.includes(B.address), lB);
  await axeOf(owner, "W2 B's lead page with a Not sent message"); await noSideways(owner, "W2 B's lead page");

  // ---------------------------------------------------------------------------------------------- W3 unsubscribe works
  const queued = await send(real, A, "MARKETING", { hold: true });   // written before the click, delivered after it (W4)
  const link = (mkt?.headers["List-Unsubscribe"] ?? "").replace(/^<|>$/g, "").replace(/^https?:\/\/[^/]+/, BASE);
  const person = await pageAs(null);
  const opened = await person.goto(link);
  await person.getByRole("heading", { name: `Unsubscribe from ${firmName}'s marketing email?` }).waitFor({ timeout: 15_000 });
  await shot(person, "W3-unsubscribe-page-1440"); await axeOf(person, "W3 the unsubscribe page");
  ok("J-49 W3 pass: A opens the email's unsubscribe link: one page, in the firm's name, with one Unsubscribe button; opening it records nothing (a link scanner unsubscribes no one)",
    opened?.status() === 200 && (await person.getByRole("button").count()) === 1 && withdrawals(A.person) === 0 && !consentRows(A.person)[0]?.withdrawn, opened?.status());
  await person.getByRole("button", { name: "Unsubscribe" }).click();
  await person.getByRole("heading", { name: "You are unsubscribed" }).waitFor({ timeout: 15_000 });
  await shot(person, "W3-unsubscribed-1440"); await axeOf(person, "W3 You are unsubscribed");
  const afterA = consentRows(A.person);
  ok("J-49 W3 pass: Unsubscribe says \"You are unsubscribed\" and records one withdrawal (email marketing, via UNSUBSCRIBE); A's booking consent now reads withdrawn",
    withdrawals(A.person) === 1 && afterA.length === 1 && afterA[0].withdrawn && afterA[0].via === "UNSUBSCRIBE", afterA);
  const again = await fetch(link, { method: "POST" });
  ok("J-49 W3 fail: the used link is spent: a second click answers the not-found page (404) and records nothing more", again.status === 404 && withdrawals(A.person) === 1, again.status);

  // ---------------------------------------------------------------------------------------------- W4 after it
  /** The DW2 judge: after the copy's door wrote the withdrawal, the gate refuses marketing to A, WITHDRAWN: MARKETING. */
  const askA = ask(A);
  const dw2 = (d: { allowed: boolean; reason: string }) => !d.allowed && d.reason === "WITHDRAWN";
  const next = await send(real, A, "MARKETING");
  ok("J-49 W4 pass: the next marketing email to A is not sent (SUPPRESSED, WITHDRAWN: MARKETING) and is not in A's inbox",
    next.row.state === "SUPPRESSED" && next.row.reason === "WITHDRAWN: MARKETING" && !(await inboxNow(A.address)).some((m) => m.id === next.id), next.row);
  const realSays = await new ConsentStore(auditEvent).allows(db as never, askA);
  ok("J-49 DW2 pass: the gate's consent read (ConsentStore.allows, which MessagePort.send and its worker call) reads, on the copy's database, the withdrawal the running copy's unsubscribe door wrote", dw2(realSays), realSays);
  // The stand-in holds A's tick as the booking gave it; the door's withdrawal never reaches it. Judged on its answer: a
  // row written with its consent id would break the outbox's foreign key to msg_consent (the fake's id is not a real row).
  const fake = fakeConsent(), w0 = await fake.publishWording(null, { firmId, channel: "EMAIL", purpose: "MARKETING", locale: "en", text: "Sample: email news, yes", by: "seed:j49" });
  await fake.record(null, { firmId, subject: askA.subject, channel: "EMAIL", purpose: "MARKETING", wordingId: w0.id, source: "BOOKING_FORM", recordedKind: "SELF_SERVICE", recordedBy: "system:booking" });
  const fakeSays = await fake.allows(null, askA);
  ok("J-49 DW2 NR [fails on the stand-in]: fakeConsent holding A's tick never sees the door's withdrawal: the judge fails, it still allows A's marketing", !dw2(fakeSays) && fakeSays.allowed, fakeSays);
  await real.m.dispatch(firmId, [queued.id]); await real.jobs.runDue();
  const q = outbox(queued.id);
  ok("J-49 W4 pass: a marketing email written before the click and sent after it is stopped by the worker's re-check (QUEUED, then SUPPRESSED WITHDRAWN: MARKETING)",
    queued.first === "QUEUED" && q.state === "SUPPRESSED" && q.reason === "WITHDRAWN: MARKETING", [queued.first, q]);
  const svc = await send(real, A, "SERVICE"), svcMail = (await inbox(A.address, 3)).find((m) => m.id === svc.id);
  ok("J-49 W4 fail: a service email to A still goes and arrives (an unsubscribe is marketing only)", svc.row.state === "SENT" && svcMail?.class === "SERVICE", [svc.row, svcMail?.class]);
  const boxA = await messagesBox(A.lead), lNext = await line(boxA, next.id), lSvc = await line(boxA, svc.id), lSent = await line(boxA, g.a.id);
  await boxA.scrollIntoViewIfNeeded(); await shot(owner, "W4-lead-A-after-unsubscribe-1440");
  ok("J-49 W4 pass: A's lead page shows the marketing email after the unsubscribe as \"Not sent: the person withdrew consent\", the service email and the first marketing email as sent, the address masked",
    lNext.word === "Not sent" && lNext.why === "Not sent: the person withdrew consent" && lSvc.word === "Sent" && lSent.word === "Sent" && !lNext.text.includes(A.address), [lNext, lSvc.word, lSent.word]);
  await axeOf(owner, "W4 A's lead page after the unsubscribe"); await noSideways(owner, "W4 A's lead page");
  ok("J-49: no script error on any page walked", errors.length === 0, errors);
} finally {
  await browser.close(); await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
