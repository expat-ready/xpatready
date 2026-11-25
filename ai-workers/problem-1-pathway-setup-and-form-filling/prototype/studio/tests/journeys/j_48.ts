// J-48 (map row 48, R1.48: "Each message shows Sent, Delivered, Bounced or Failed from the provider's test events; a hard
// bounce stops sends to that address; the from-name is the firm's"): the join-and-walk row, brief
// build-lead-c-briefs/J-48.md. It adds no feature: it joins PF-19b parts 1-3 and PF-19r parts 1-2 and walks them like a
// person on an isolated copy of the running app (its own database and port, never :4400).
//   W1 a visitor books on the firm's public booking page (browser); visitor and host each get the email, from the firm;
//   W2 an Owner invites a staff member from the Team screen (browser); the invitation has the same layout;
//   W3 "Send to ..." an adult on a case (by API: the case's own screen is C6.16's, walked by its suite); the link email
//      goes through the outbox;
//   W4 an adult's address hard-bounces (the provider's test event for a Sample bounce address); the next send is refused
//      and the sender reads why;
//   W5 where staff read the state: the lead page's Messages box (browser, axe, 1024 and 1440 px) and the staff read for
//      a case party (API); ends at J-49's first step, the one-click unsubscribe headers of W1's host email.
//   DW1 MailPort is MessagePort · DW2 the email adapter by setting (recorded SES answers, nothing leaves the machine) ·
//   DW3 a verified hard bounce stops sends (in process: a running copy fetches Amazon's certificate, so the signed notice
//   is given to the same handler with the run's own certificate; "Not verified on the running copy") · DW4 the sender
//   name is the firm's · DW5 the trial cap · DW6 (QA-601) a send the provider keeps refusing ends Failed: the local
//   adapter refuses a Sample refused address as SES refuses a send; the worker's tries run in process on a fake clock
//   (five tries over about half an hour), and the lead page's Messages box shows "Failed" in words (browser, axe).
// Fails on the stand-in (P-606): every DW judge is run again on its stand-in and must fail there (the "NR" lines).
// Sample rows only; US$0, no model call, no real email. Run from prototype/ (HEADED=1 opens a visible browser):
//   zsh studio/tools/isolated.sh j48 4436 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j48 4436 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_48.ts j48 4436
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { createSign, generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { Readable } from "node:stream";
import { chromium, type Page } from "playwright";
import { copyFirmHoursTo } from "../../api/src/front-office/booking-seed.ts";
import { LocalFiles } from "../../api/src/front-office/files.ts";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { auditEvent } from "../../api/src/platform/audit/audit-event.ts";
import { Secret } from "../../api/src/platform/config/secret.ts";
import { LocalMail } from "../../api/src/platform/identity/session/mail.ts";
import { NoticeRefused, SesNotices, snsStringToSign } from "../../api/src/platform/messages/channels/email/bounces.ts";
import { connectLocalNotices, localEmail, SAMPLE_BOUNCE_ADDRESSES, SAMPLE_REFUSED_ADDRESSES } from "../../api/src/platform/messages/channels/email/local.ts";
import { UnsubscribeTokens } from "../../api/src/platform/messages/channels/email/unsubscribe.ts";
import { ConsentStore } from "../../api/src/platform/messages/consent/consent-store.ts";
import { channelsOf, emailAdapter } from "../../api/src/platform/messages/send/channels.ts";
import { FIRM_SEND_TRIES, Messages } from "../../api/src/platform/messages/send/messages.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { fakeAlerts } from "../../ports/alert.ts";
import { FakeClock } from "../../ports/clock.ts";
import { fakeJobs } from "../../ports/jobs.ts";
import { fakeMail } from "../../ports/mail.ts";
import { HELD_DAILY_LIMIT } from "../../ports/messages.ts";
import { client, recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [NAME, PORT] = [process.argv[2] ?? "j48", Number(process.argv[3] ?? 4436)];
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..", "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-48", "screenshots"); mkdirSync(SHOTS, { recursive: true });
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
const firm = (key: string) => { const [id, name, contact] = sql(`select id || '|' || operating_name || '|' || contact_email from platform_firm where key = '${key}'`).split("|"); return { id, name, contact }; };
const A = firm("sample-firm"), B = firm("sample-solo");
ok("J-48 setup: both Sample firms and their front office are seeded, with different names", !!A.id && !!B.id && A.name !== B.name && fo.failed.length === 0, fo.failed);
const staff = (actor: string) => { const [id, email] = sql(`select id || '|' || email from platform_staff where actor_id = '${actor}'`).split("|"); return { id, email }; };
const R = staff("user-R"), O = staff("user-O"), S = staff("user-S");
// A person cannot set up a consultation type by screens yet (FO-3a): one Sample type, hosted by the Case officer.
if (sql(`select count(*) from fo_consultation_type where firm_id = '${A.id}' and slug = 'free'`) === "0") {
  await copyFirmHoursTo(db, A.id, [O.id]);
  await db.foConsultationType.create({ data: { firmId: A.id, slug: "free", name: "Free consultation", modes: ["VIDEO"], hostStaffIds: [O.id], minutes: 30, windowDays: 60 } });
}
async function signIn(firmKey: string, email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey, email, secondStep: true }) });
  const b = await r.json() as { token?: string; detail?: string }; if (b.token) return b.token;
  console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`); process.exit(2);
}
const tok = { R: await signIn("sample-firm", R.email), S: await signIn("sample-solo", S.email) };
const api = async (t: string | null, method: string, path: string, body?: unknown, actor?: string): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}), ...(actor ? { "x-actor": actor } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let b: unknown = text; try { b = JSON.parse(text); } catch { /* text */ } return { status: r.status, body: b };
};
type Mail = { from: string; reply_to: string | null; subject: string; body: string; html: string; class: string; headers: Record<string, string> };
const inbox = async (address: string, want = 1): Promise<Mail[]> => {
  let m: Mail[] = [];
  await until(async () => { m = (await api(null, "GET", `/demo/platform-inbox?address=${encodeURIComponent(address)}`)).body?.messages ?? []; return m.length >= want; }, 90_000);
  return m;
};
type Row = { id: string; state: string; reason: string | null; provider: string | null; kind: string | null; subject: string | null };
const outboxTo = (address: string): Row[] => JSON.parse(rawSql(`select coalesce(json_agg(json_build_object('id', id, 'state', state, 'reason', state_reason, 'provider', provider_id, 'kind', subject_kind, 'subject', subject_id) order by created_at), '[]') from msg_outbox where address = '${address.toLowerCase()}'`));
const stateIs = (address: string, state: string, ms = 150_000) => until(async () => outboxTo(address).some((r) => r.state === state), ms);
/** The one layout (PF-19b): every email's HTML ends with the firm's own "Sent by <firm>" line. */
const oneLayout = (m: Mail | undefined, f: { name: string }) => !!m && m.html.includes(`Sent by ${f.name}`);
const fromFirm = (m: Mail | undefined, f: { name: string; contact: string }) => !!m && m.from.startsWith(`${f.name} <`) && m.reply_to === f.contact;

const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 250 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
async function pageAs(t: string | null): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  if (t) await ctx.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), t);
  p.on("pageerror", (e) => errors.push(String(e))); return p;
}
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const axeOf = async (p: Page, name: string) => { const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze(); ok(`J-48 ${name}: axe finds no WCAG A/AA violation`, r.violations.length === 0, r.violations.map((v) => `${v.id}: ${v.nodes.length}`)); };
const noSideways = async (p: Page, name: string) => { for (const w of [1024, 1440]) { await p.setViewportSize({ width: w, height: 900 }); ok(`J-48 ${name} at ${w} px: no sideways page scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)); } };

// A seat lent to each firm for its invitation (W2, DW4), given back in the finally.
const plans = [A, B].map((f) => sql(`select p.id || '|' || p.seats_limit from platform_subscription s join platform_plan p on p.id = s.plan_id where s.firm_id = '${f.id}' and s.status <> 'ENDED' limit 1`).split("|"));
for (const [id, seats] of plans) sql(`update platform_plan set seats_limit = ${Number(seats) + 10} where id = '${id}'`);
const invited: [string, string][] = [];   // [token, invitation id], revoked at the end: repeatable on a kept copy
try {
  // ---------------------------------------------------------------------------------------------- W1 a visitor books
  const visitor = `j48.visitor.${run}@example.com`, v = await pageAs(null), hostHad = outboxTo(O.email).length;   // a kept copy holds earlier runs' host emails
  await v.goto(`${BASE}/book/sample-firm`); await v.locator("[data-type-card]").first().waitFor({ timeout: 30_000 });
  await axeOf(v, "W1 the firm's booking page"); await noSideways(v, "W1 the firm's booking page");
  await v.getByRole("link", { name: "Choose Free consultation" }).click(); await v.getByRole("heading", { name: "Choose a time" }).waitFor();
  const days = v.locator('[role="group"] button:not([disabled])');
  for (let i = 0; i < 3 && (await days.count()) === 0; i++) { await v.getByRole("button", { name: "Next month" }).click(); await v.waitForTimeout(800); }
  await days.first().click(); await v.locator("[data-day-times] li button").first().click();
  await v.getByRole("heading", { name: "Your details" }).waitFor();
  await v.getByLabel("Given names").fill("Visitor"); await v.getByLabel("Family name").fill(`Sample ${run}`); await v.getByLabel("Email").fill(visitor);
  await v.waitForTimeout(3500);   // the form's minimum fill time
  await v.getByRole("button", { name: "Book this time" }).click();
  await v.locator('[data-public-state="booked"]').waitFor({ timeout: 20_000 });
  await shot(v, "W1-booked-1440"); await axeOf(v, "W1 You are booked");
  const vMail = await inbox(visitor), hMail = await inbox(O.email, Math.min(hostHad + 1, 50));   // the inbox lists the newest first
  ok("J-48 W1 pass: the visitor books on the firm's public page and finds the confirmation in the demo inbox, from the firm's name, with the one layout",
    vMail.length === 1 && fromFirm(vMail[0], A) && oneLayout(vMail[0], A), vMail.map((m) => [m.from, m.reply_to, m.subject]));
  ok("J-48 W1 pass: the host finds the booking email too, from the firm's name, with the one layout", outboxTo(O.email).length === hostHad + 1 && fromFirm(hMail[0], A) && oneLayout(hMail[0], A), hMail.map((m) => [m.from, m.subject]));

  // ---------------------------------------------------------------------------------------------- W2 an Owner invites
  const invitee = `j48-invitee-${run}@sample-firm.example.com`, owner = await pageAs(tok.R);
  await owner.goto(`${BASE}/platform/team`); await owner.locator("[data-seat-line]").waitFor({ timeout: 30_000 });
  await owner.locator("[data-invite-open]").click(); await owner.getByLabel("Email, person 1").fill(invitee);
  await shot(owner, "W2-invite-1440"); await axeOf(owner, "W2 Team, Invite people");
  await owner.locator("[data-send-invites]").click();
  const iMail = await inbox(invitee);
  const invId = sql(`select id from platform_invitation where firm_id = '${A.id}' and email = '${invitee}' order by created_at desc limit 1`); if (invId) invited.push([tok.R, invId]);
  ok("J-48 W2 pass: the Owner invites a staff member from the Team screen; the invitation is in the demo inbox from the firm's name, with the same layout as W1's",
    iMail.length === 1 && iMail[0].from.startsWith(`${A.name} <`) && oneLayout(iMail[0], A), iMail.map((m) => [m.from, m.subject]));
  await owner.keyboard.press("Escape"); await noSideways(owner, "W2 Team");

  // ---------------------------------------------------------------------------------------------- W3 "Send to ..." on a case
  const openable = async () => ((await api(null, "GET", "/runtime/openable", undefined, "user-O")).body ?? []).find((r: { combination: string; startable: boolean }) => /Visitor visa/.test(r.combination) && r.startable);
  let vv = await openable();
  if (!vv) {   // as check_pf19r_case_links.ts: a fresh copy has no released pathway; this releases the Visitor visa (Sample, no model call)
    execFileSync(join(STUDIO, "node_modules", ".bin", "tsx"), ["--tsconfig", join(STUDIO, "api", "tsconfig.json"), join(STUDIO, "tests", "runtime", "setup_visitor_visa.ts"), String(PORT), DBNAME], { stdio: ["ignore", "ignore", "inherit"], timeout: 600_000 });
    vv = await openable();
  }
  if (!vv) throw new Error("STOP  Visitor visa could not be released on this copy");   // thrown, so the finally still gives back what the walk borrowed
  const yearsAgo = (y: number) => { const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - y); return d.toISOString().slice(0, 10); };
  const newCase = async (tag: string) => {
    const c = await api(null, "POST", "/runtime/cases", { combinationId: vv.combination_id, reference: `J48-${tag}-${run}`, clientActor: "user-P", principal: { displayName: "Sample Client A" } }, "user-O");
    const id = c.body?.id as string, P = c.body?.people?.find((x: { role: string }) => x.role === "principal")?.subject_id as string;
    const adult = (await api(null, "POST", `/runtime/cases/${id}/people`, { role: "spouse_or_partner", displayName: "Sample Partner" }, "user-O")).body?.subject_id as string;
    for (const [s, d] of [[P, yearsAgo(40)], [adult, yearsAgo(38)]]) await api(null, "PUT", `/runtime/cases/${id}/answers/${s}/person.date_of_birth`, { value: d, expectedId: null }, "user-O");
    return { id, adult };
  };
  const sendTo = (k: { id: string; adult: string }, address: string) => api(null, "POST", `/runtime/cases/${k.id}/people/${k.adult}/link`, { address }, "user-O");   // case staff (the Case officer)
  const k1 = await newCase("w3"), partner = `j48.partner.${run}@example.com`;
  const sent3 = await sendTo(k1, partner), pMail = await inbox(partner), r3 = outboxTo(partner);
  ok("J-48 W3 pass: \"Send to ...\" an adult on a case: the link email goes through the outbox (one row, the case party's) and arrives from the firm's name with the one layout",
    sent3.status < 300 && r3.length === 1 && r3[0].kind === "CASE_PARTY" && fromFirm(pMail[0], A) && oneLayout(pMail[0], A), { status: sent3.status, r3, from: pMail[0]?.from });

  // ---------------------------------------------------------------------------------------------- W4 a hard bounce stops the next send
  const k2 = await newCase("w4"), gone = SAMPLE_BOUNCE_ADDRESSES[0];
  sql(`delete from msg_suppression where firm_id = '${A.id}' and address = '${gone}'`);   // a kept copy starts W4 clean
  const mine = () => outboxTo(gone).filter((r) => r.subject === k2.adult);   // this run's rows only: a kept copy holds earlier runs' rows for the same Sample address
  const sent4 = await sendTo(k2, gone), bounced = await until(async () => mine().some((r) => r.state === "BOUNCED"), 150_000);
  const again = await sendTo(k2, gone), rows4 = mine();
  ok("J-48 W4 pass: the adult's address hard-bounces (the provider's test event): the message reads BOUNCED and the address is suppressed once",
    sent4.status < 300 && bounced && sql(`select count(*) from msg_suppression where firm_id = '${A.id}' and address = '${gone}' and reason = 'HARD_BOUNCE'`) === "1", { status: sent4.status, rows4 });
  ok("J-48 W4 pass: sending again sends nothing, and the person sending reads why in words (409, \"Not sent: this address does not take email from the firm\")",
    again.status === 409 && again.body?.code === "ADDRESS_NOT_SENT" && /^Not sent: this address does not take email from the firm/.test(again.body?.detail ?? "") && rows4.length === 1 && mine().length === 1, again.body);
  ok("J-48 W4 fail: an address that did not bounce is not refused (W3's partner gets a second email)", (await sendTo(k1, partner)).status < 300 && (await until(async () => outboxTo(partner).length === 2 && outboxTo(partner).every((r) => r.state === "DELIVERED"), 150_000)), outboxTo(partner));

  // ---------------------------------------------------------------------------------------------- W5 where staff read the state
  ok("J-48 W5 pass: W1's and W2's emails read DELIVERED within one worker cycle (the provider's test events, no SES)", (await stateIs(visitor, "DELIVERED")) && (await stateIs(invitee, "DELIVERED")), [outboxTo(visitor), outboxTo(invitee)]);
  // The booking's arrival (FO-2 part 3b, the real ArrivalPort) made the visitor a person with a lead; on the in-memory stand-in there is neither.
  const leadId = sql(`select l.id from fo_lead l join fo_person p on p.id = l.person_id where l.firm_id = '${A.id}' and lower(p.email) = '${visitor}' order by l.created_at desc limit 1`);
  await owner.setViewportSize({ width: 1440, height: 900 }); await owner.goto(`${BASE}/front-office/leads/${leadId}`);
  const box = owner.locator("[data-messages-panel]"); await box.locator("[data-message]").first().waitFor({ timeout: 30_000 });
  const words = await box.locator("[data-state-word]").allInnerTexts(), boxText = (await box.count()) ? await box.innerText() : "";
  await box.scrollIntoViewIfNeeded(); await shot(owner, "W5-lead-messages-1440");
  ok("J-48 W5 pass: the booking created a lead, and its page's Messages box shows the visitor's email as Delivered, in words, from the firm's name, the address masked",
    !!leadId && words.length >= 1 && words.every((w) => w === "Delivered") && boxText.includes(`from ${A.name}`) && boxText.includes("j…@example.com") && !boxText.includes(visitor), { leadId, words, boxText: boxText.slice(0, 300) });
  await axeOf(owner, "W5 the lead page with its Messages box"); await noSideways(owner, "W5 the lead page");
  const party = (id: string, t = tok.R) => api(t, "GET", `/platform/messages?subjectKind=CASE_PARTY&subjectId=${id}`);
  const st = async (id: string) => (((await party(id)).body?.messages ?? []) as { state: string; fromName: string }[]);
  const p3 = await st(k1.adult), p4 = await st(k2.adult), other = await party(k1.adult, tok.S);
  ok("J-48 W5 pass: the staff read gives W3's messages as DELIVERED and W4's as BOUNCED, each with the firm's name (no case-page box yet: the case side's row)",
    p3.length === 2 && p3.every((m) => m.state === "DELIVERED" && m.fromName === A.name) && p4.length === 1 && p4[0].state === "BOUNCED", { p3, p4 });
  ok("J-48 W5 fail: another firm's Owner reads none of it (404)", other.status === 404, other.status);
  // W2's invitation is to a staff member: no staff read or screen lists a staff member's messages yet, so its state is read from the database (a question on the PR).
  ok("J-48 W5 (database only): the invitation's state is DELIVERED with one Delivered event", outboxTo(invitee)[0]?.state === "DELIVERED" && sql(`select count(*) from msg_event where outbox_id = '${outboxTo(invitee)[0]?.id}' and kind = 'DELIVERED'`) === "1");
  // The walk ends at J-49's first step: the one-click unsubscribe headers. Service and marketing email carry them, transactional email does not
  // (unsubscribe.ts). W1's host email is SERVICE and has them; the visitor's confirmation is sent as TRANSACTIONAL and has none (a question on the PR).
  const unsub = (m: Mail | undefined) => /^<https?:\/\/[^>]+\/api\/public\/unsubscribe\/[A-Za-z0-9_-]+>$/.test(m?.headers?.["List-Unsubscribe"] ?? "") && m?.headers?.["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click";
  ok("J-48 ends at J-49's first step: W1's host email (SERVICE) carries the one-click unsubscribe headers; the visitor's confirmation (TRANSACTIONAL) carries none", hMail[0]?.class === "SERVICE" && unsub(hMail[0]) && vMail[0]?.class === "TRANSACTIONAL" && Object.keys(vMail[0]?.headers ?? {}).length === 0, [hMail[0]?.class, hMail[0]?.headers, vMail[0]?.class, vMail[0]?.headers]);

  // ---------------------------------------------------------------------------------------------- DW4 the sender name is the firm's
  const bInvitee = `j48-invitee-${run}@sample-solo.example.com`, bInv = await api(tok.S, "POST", "/platform/staff/invitations", { email: bInvitee, roles: ["CASE_OFFICER"] });
  if (bInv.body?.id) invited.push([tok.S, bInv.body.id]);
  const bMail = await inbox(bInvitee), aAll = [vMail[0], hMail[0], iMail[0], pMail[0]];
  const dw4 = (mails: (Mail | undefined)[], f: { name: string; contact: string }, not: { name: string }) => mails.every((m) => !!m && m.from.startsWith(`${f.name} <`) && !m.from.includes(not.name) && !m.html.includes(`Sent by ${not.name}`));
  ok("J-48 DW4 pass: each of firm A's four emails (booking, host, invitation, case link) has the firm's operating name as its From name and its contact address as Reply-To; firm B's invitation has firm B's name and address",
    dw4(aAll, A, B) && dw4([bMail[0]], B, A) && aAll.every((m) => fromFirm(m, A)) && fromFirm(bMail[0], B), [aAll.map((m) => [m?.from, m?.reply_to]), [bMail[0]?.from, bMail[0]?.reply_to]]);
  ok("J-48 DW4 fail: firm A's email never carries firm B's name (the same judge with the firms swapped is false)", !dw4(aAll, B, A));

  // ---------------------------------------------------------------------------------------------- DW1 MailPort is MessagePort
  const dw1 = (address: string) => outboxTo(address).some((r) => r.provider?.startsWith("local:"));
  ok("J-48 DW1 pass: the running app's MAIL_PORT (W2's invitation) and MESSAGES_MAIL (W1's booking mail) both write msg_outbox", dw1(invitee) && dw1(visitor), [outboxTo(invitee), outboxTo(visitor)]);
  const standIn = `j48.standin.${run}@example.com`, msg = { firmId: A.id, to: standIn, replyTo: A.contact, class: "TRANSACTIONAL" as const, subject: "Stand-in (Sample)", text: "Sample." };
  await fakeMail().send(msg); await new LocalMail(() => Date.now()).send(msg);
  ok("J-48 DW1 NR [fails on the stand-in]: the same email through fakeMail() and LocalMail writes no msg_outbox row", !dw1(standIn) && outboxTo(standIn).length === 0);

  // ---------------------------------------------------------------------------------------------- DW2 the email adapter by setting (recorded SES)
  const seen: { host: string; raw: string }[] = [];
  const recorded = {
    metadata: { handlerProtocol: "http/1.1" },
    async handle(req: { hostname: string; body: string | Uint8Array }) {
      const body = JSON.parse(typeof req.body === "string" ? req.body : new TextDecoder().decode(req.body)) as { Content: { Raw: { Data: string } } };
      seen.push({ host: req.hostname, raw: Buffer.from(body.Content.Raw.Data, "base64").toString("utf8").replace(/\r\n[ \t]+/g, " ") });
      return { response: { statusCode: 200, headers: { "content-type": "application/json" }, body: Readable.from([Buffer.from(JSON.stringify({ MessageId: `0101019a-rec-${randomBytes(6).toString("hex")}-000000` }))]) } };
    },
    updateHttpClientConfig() {}, httpHandlerConfigs() { return {}; }, destroy() {},
  };
  const files = new LocalFiles(join(STUDIO, "var", `isolated-${NAME}`, "front-office-files")), clock = new FakeClock(new Date()), consent = new ConsentStore(auditEvent, clock), alerts = fakeAlerts();
  const tokens = new UnsubscribeTokens({ current: 3, keys: new Map([[3, new Secret("PLATFORM_SECRET_BOX_KEYS v3", randomBytes(32).toString("base64"))]]) });
  const sesOptions = { files, tokens, publicBase: "https://app.expatready.example", sender: "messages@mail.expatready.example", requestHandler: recorded as never,
    credentials: { accessKeyId: new Secret("SES_ACCESS_KEY_ID", `AKIA${randomBytes(8).toString("hex").toUpperCase()}`), secretAccessKey: new Secret("SES_SECRET_ACCESS_KEY", randomBytes(30).toString("base64")) } };
  const bySetting = (environment: "local" | "test", region: string | null) => emailAdapter({ environment, ses: { region } }, sesOptions);
  connectLocalNotices(null);   // this process's own local sends give no test event
  type Wired = { m: Messages; jobs: ReturnType<typeof fakeJobs> };   // each wiring has its own job runner: one queue has one handler
  const wire = async (environment: "local" | "test", region: string | null): Promise<Wired> => { const jobs = fakeJobs(clock), m = new Messages({ db, consent, files, jobs, alerts: () => alerts, channels: channelsOf([["EMAIL", bySetting(environment, region)]]), clock }); await m.register(); return { m, jobs }; };
  const sendBy = async ({ m, jobs }: Wired, firmId: string, address: string) => {
    const r = await db.$transaction((t) => m.send(t, { firmId, channel: "EMAIL", class: "TRANSACTIONAL", address, content: { subject: "Your documents (Sample)", text: "Sample." }, idempotencyKey: randomUUID() }));
    if (r.state === "QUEUED") { await m.dispatch(firmId, [r.outboxId]); await jobs.runDue(); }
    return { ...r, row: await db.msgOutbox.findUniqueOrThrow({ where: { id: r.outboxId } }) };
  };
  const viaSes = await wire("test", "ca-central-1"), viaLocal = await wire("local", "ca-central-1");
  const dw2 = async (m: Wired, tag: string) => { const n = seen.length, r = await sendBy(m, A.id, `j48.${tag}.${run}@example.com`); return { r, real: seen.length === n + 1 && seen.at(-1)!.host === "email.ca-central-1.amazonaws.com" && r.row.state === "SENT" && !!r.row.providerId?.startsWith("ses:") }; };
  const s2 = await dw2(viaSes, "ses");
  ok("J-48 DW2 pass: PLATFORM_ENVIRONMENT=test with PLATFORM_SES_REGION picks the SES adapter (one signed request to SES's endpoint, on a recorded answer); local picks the local adapter",
    s2.real && bySetting("local", "ca-central-1") === localEmail && bySetting("test", null) === localEmail && bySetting("test", "ca-central-1") !== localEmail, { row: s2.r.row.providerId, hosts: seen.map((x) => x.host) });
  ok("J-48 DW2 NR [fails on the stand-in]: with the local setting the same send never reaches SES", !(await dw2(viaLocal, "local")).real);
  ok("J-48 DW4 pass (SES): the message SES is given has the firm's name as the From display name and its contact address as Reply-To", new RegExp(`^From: "?${A.name}"? <messages@mail\\.expatready\\.example>`, "m").test(seen[0]?.raw ?? "") && new RegExp(`^Reply-To: .*${A.contact}`, "m").test(seen[0]?.raw ?? ""), seen[0]?.raw.slice(0, 400));

  // ---------------------------------------------------------------------------------------------- DW3 a verified hard bounce stops sends
  const sns = generateKeyPairSync("rsa", { modulusLength: 2048 }), CERT_URL = "https://sns.ca-central-1.amazonaws.com/SimpleNotificationService-rec.pem";
  const notices = new SesNotices({ db, consent, fetchCert: async (url) => { if (url !== CERT_URL) throw new Error("unexpected certificate"); return sns.publicKey.export({ type: "spki", format: "pem" }).toString(); } });
  const signed = (row: { id: string; providerId: string | null }, firmId: string, to: string, bounceType: string, key = sns.privateKey) => {
    const message = { notificationType: "Bounce", mail: { messageId: (row.providerId ?? "").replace(/^ses:/, ""), destination: [to], tags: { firm: [firmId], outbox: [row.id] } }, bounce: { bounceType, bounceSubType: "General", bouncedRecipients: [{ emailAddress: to }] } };
    const n: Record<string, string> = { Type: "Notification", MessageId: randomUUID(), TopicArn: "arn:aws:sns:ca-central-1:000000000000:ses-notices", Message: JSON.stringify(message), Timestamp: new Date().toISOString(), SignatureVersion: "2", SigningCertURL: CERT_URL };
    n.Signature = createSign("RSA-SHA256").update(snsStringToSign(n)).sign(key, "base64"); return n;
  };
  const supp = (firmId: string, address: string) => sql(`select count(*) from msg_suppression where firm_id = '${firmId}' and address = '${address}' and reason = 'HARD_BOUNCE'`);
  const hard = `j48.hard.${run}@example.com`, soft = `j48.soft.${run}@example.com`, forged = `j48.forged.${run}@example.com`;
  const h1 = await sendBy(viaSes, A.id, hard), hardNotice = signed(h1.row, A.id, hard, "Permanent");
  await notices.receive(hardNotice); await notices.receive(hardNotice);   // SNS may deliver twice
  /** The DW3 judge: the row is BOUNCED, the address suppressed once, and the next email to it (transactional too) is SUPPRESSED and never reaches SES. */
  const dw3 = async (first: { outboxId: string }, firmId: string, address: string) => { const n = seen.length, next = await sendBy(viaSes, firmId, address); const state = (await db.msgOutbox.findUniqueOrThrow({ where: { id: first.outboxId } })).state; return { state, next: next.row.state, reached: seen.length - n, stopped: state === "BOUNCED" && supp(firmId, address) === "1" && next.state === "SUPPRESSED" && seen.length === n }; };
  ok("J-48 DW3 pass (in process; Not verified on the running copy, which fetches Amazon's certificate): a verified SNS Permanent bounce marks the row BOUNCED and suppresses the address once (the notice twice changes nothing); the next email to it, transactional included, is SUPPRESSED and not sent",
    (await dw3(h1, A.id, hard)).stopped && (await db.msgEvent.count({ where: { outboxId: h1.outboxId, kind: "BOUNCED" } })) === 1);
  const s1 = await sendBy(viaSes, A.id, soft); await notices.receive(signed(s1.row, A.id, soft, "Transient"));
  const nr3 = await dw3(s1, A.id, soft);
  ok("J-48 DW3 NR [fails on the stand-in]: with no hard bounce (a soft one) the judge fails for that reason alone: the row stays SENT, the address is not suppressed and the next email reaches SES", !nr3.stopped && nr3.state === "SENT" && supp(A.id, soft) === "0" && nr3.next === "SENT" && nr3.reached === 1, nr3);
  const f1 = await sendBy(viaSes, A.id, forged), otherKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
  const refusedHere = await notices.receive(signed(f1.row, A.id, forged, "Permanent", otherKey)).then(() => false, (e) => e instanceof NoticeRefused);
  const door = await fetch(`${BASE}/api/public/messages/ses-notices`, { method: "POST", headers: { "content-type": "text/plain; charset=UTF-8" }, body: JSON.stringify(signed(f1.row, A.id, forged, "Permanent", otherKey)) });
  const wrongFirm = await notices.receive(signed(f1.row, B.id, forged, "Permanent")).then(() => "taken", () => "refused");
  ok("J-48 DW3 fail: a notice signed by another key is refused by the handler, and a verified one naming another firm changes nothing: nothing stored, the row still SENT. The running copy's own door also answers 400 to it (Not verified there: it answers 400 to any notice here, since it cannot fetch Amazon's certificate)",
    refusedHere && door.status === 400 && supp(A.id, forged) === "0" && supp(B.id, forged) === "0" && (await db.msgOutbox.findUniqueOrThrow({ where: { id: f1.outboxId } })).state === "SENT", { door: door.status, wrongFirm });

  // ---------------------------------------------------------------------------------------------- DW5 the trial cap
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(clock.now());
  for (const f of [A, B]) await db.msgFirm.upsert({ where: { firmId: f.id }, create: { firmId: f.id }, update: {} });
  const counter = (firmId: string, n: number) => sql(`insert into msg_send_counter (firm_id, day, sent, updated_at) values ('${firmId}', '${day}', ${n}, now()) on conflict (firm_id, day) do update set sent = ${n}`);
  const was = [A, B].map((f) => [f.id, sql(`select coalesce((select sent from msg_send_counter where firm_id = '${f.id}' and day = '${day}'), 0)`)]);
  /** The DW5 judge: with 49 sent today, the 50th goes out and the 51st is held QUEUED with "daily limit" and one alert for the firm. */
  const dw5 = async (f: { id: string }, tag: string) => {
    counter(f.id, 49); const before = alerts.raised.filter((a) => a.kind === "send_cap_reached" && a.detail.firmId === f.id).length;
    const r50 = await sendBy(viaSes, f.id, `j48.${tag}50.${run}@example.com`), r51 = await sendBy(viaSes, f.id, `j48.${tag}51.${run}@example.com`), r52 = await sendBy(viaSes, f.id, `j48.${tag}52.${run}@example.com`);
    return { r50: r50.row.state, r51: [r51.row.state, r51.row.stateReason], r52: r52.row.state, held: r50.row.state === "SENT" && r51.row.state === "QUEUED" && r51.row.stateReason === HELD_DAILY_LIMIT && r52.row.stateReason === HELD_DAILY_LIMIT && alerts.raised.filter((a) => a.kind === "send_cap_reached" && a.detail.firmId === f.id).length === before + 1 };
  };
  const bWas = sql(`select status from platform_firm where id = '${B.id}'`);
  sql(`update platform_firm set status = 'TRIAL' where id = '${B.id}'`);
  try {
    const t5 = await dw5(B, "trial");
    ok("J-48 DW5 pass: the 51st email of a trial firm's day is held with \"daily limit\" and one alert (the 52nd adds none)", t5.held, t5);
    const nr5 = await dw5(A, "active");
    ok("J-48 DW5 NR [fails on the stand-in]: a firm that is not on trial sends its 50th, 51st and 52nd (the judge fails because nothing is held)", !nr5.held && nr5.r50 === "SENT" && nr5.r51[0] === "SENT" && nr5.r52 === "SENT", nr5);
  } finally {
    sql(`update platform_firm set status = '${bWas}' where id = '${B.id}'`); for (const [id, n] of was) counter(id, Number(n));
    sql(`update msg_outbox set state = 'FAILED', state_reason = 'J-48: test rows put away' where state = 'QUEUED' and state_reason = '${HELD_DAILY_LIMIT}' and address like 'j48.%.${run}@example.com'`);
  }
  // ---------------------------------------------------------------------------------------------- DW6 a refused send ends Failed (QA-601)
  // Its own fake clock and job runner (the hours it moves never touch DW5's day); the rows are the visitor's, so W5's lead page shows them.
  const clock6 = new FakeClock(new Date()), jobs6 = fakeJobs(clock6);
  const m6 = new Messages({ db, consent: new ConsentStore(auditEvent, clock6), files, jobs: jobs6, alerts: () => alerts, channels: channelsOf([["EMAIL", localEmail]]), clock: clock6 });
  await m6.register();
  const visitorPerson = sql(`select id from fo_person where firm_id = '${A.id}' and lower(email) = '${visitor}' order by created_at desc limit 1`);
  /** The DW6 judge: an email to `address` the worker and the sweep try for up to 8 fake hours ends FAILED "send failed", with one FAILED event, after FIRM_SEND_TRIES tries. */
  const dw6 = async (address: string) => {
    const r = await db.$transaction((t) => m6.send(t, { firmId: A.id, person: { kind: "FO_PERSON", id: visitorPerson }, channel: "EMAIL", class: "TRANSACTIONAL", address, content: { subject: "Your documents (Sample)", text: "Sample." }, idempotencyKey: randomUUID() }));
    await m6.dispatch(A.id, [r.outboxId]); await jobs6.runDue();
    const row = () => db.msgOutbox.findUniqueOrThrow({ where: { id: r.outboxId }, select: { state: true, stateReason: true } });
    const seenReasons: (string | null)[] = [(await row()).stateReason];
    for (let h = 1; h <= 8 && (await row()).state === "QUEUED"; h++) { await clock6.advance({ hours: 1 }); await m6.sweep(); await jobs6.runDue(); seenReasons.push((await row()).stateReason); }
    const end = await row(), failedEvents = await db.msgEvent.count({ where: { outboxId: r.outboxId, kind: "FAILED" } });
    return { id: r.outboxId, end, seenReasons, failedEvents, failed: end.state === "FAILED" && end.stateReason === "send failed" && failedEvents === 1 && seenReasons[0] === `send failed: try 1 of ${FIRM_SEND_TRIES}` };
  };
  const f6 = await dw6(SAMPLE_REFUSED_ADDRESSES[0]);
  ok(`J-48 DW6 pass (QA-601): an email the provider refuses is tried ${FIRM_SEND_TRIES} times ("Trying again" between), then ends FAILED "send failed" with one Failed event, never QUEUED for ever`, !!visitorPerson && f6.failed, f6);
  const nr6 = await dw6(`j48.taken.${run}@example.com`);
  ok("J-48 DW6 NR [fails on the stand-in]: an address the provider takes is not failed (the judge fails because the row is SENT after one try)", !nr6.failed && nr6.end.state === "SENT" && nr6.failedEvents === 0, nr6);
  await owner.setViewportSize({ width: 1440, height: 900 }); await owner.goto(`${BASE}/front-office/leads/${leadId}`);
  const failedLine = owner.locator(`[data-messages-panel] [data-message="${f6.id}"]`); await failedLine.waitFor({ timeout: 30_000 });
  const fWord = await failedLine.locator("[data-state-word]").innerText(), fWhy = (await failedLine.locator("[data-reason]").count()) ? await failedLine.locator("[data-reason]").innerText() : "";
  await failedLine.scrollIntoViewIfNeeded(); await shot(owner, "DW6-lead-messages-failed-1440");
  ok("J-48 DW6 pass: the lead page's Messages box shows the refused email as \"Failed\" in words, with why (\"The email provider did not take it\"), the address masked",
    fWord === "Failed" && fWhy === "The email provider did not take it" && !(await failedLine.innerText()).includes(SAMPLE_REFUSED_ADDRESSES[0]), { fWord, fWhy });
  await axeOf(owner, "DW6 the lead page with a Failed message");

  ok("J-48: no script error on any page walked", errors.length === 0, errors);
} finally {
  for (const [t, id] of invited) await api(t, "POST", `/platform/staff/invitations/${id}/revoke`, {}).catch(() => undefined);
  for (const [id, seats] of plans) sql(`update platform_plan set seats_limit = ${seats} where id = '${id}'`);
  await browser.close(); await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
