// PF-19b part 3 (R1.48; brief lead-b-briefs/PF-19b3.md, DW6, with DW4 and DW5 on the running copy): the front-office lead
// page's Messages panel in a real browser against the isolated copy's real routes (no fake API). Three emails to the
// lead's person are written to the copy's outbox (its own database and file store) and left for the copy's own worker:
// its outbox sweep sends them with the local adapter, whose test events (connected by the app) make one DELIVERED and a
// Sample bounce address BOUNCED with no SES (DW4); a third, sent by this test with no events, stays SENT. The panel shows
// Sent, Delivered and Bounced in words; keyboard only; axe-core (WCAG 2.2 AA); no sideways scroll at 375, 1024 and 1440 px,
// with screenshots; a Read-only person who may not see the lead, and firm B, get 404 and no panel (DW5). US$0.
//   zsh studio/tools/isolated.sh runtime_pf19b3 4537 start PLATFORM_IDENTITY=local && tsx studio/tests/check_pf19b3_panel_browser.ts 4537 xr_studio_runtime_pf19b3
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { LocalFiles } from "../api/src/front-office/files.ts";
import { auditEvent, platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";
import { connectLocalNotices, localEmail, SAMPLE_BOUNCE_ADDRESSES } from "../api/src/platform/messages/channels/email/local.ts";
import { ConsentStore } from "../api/src/platform/messages/consent/consent-store.ts";
import { channelsOf } from "../api/src/platform/messages/send/channels.ts";
import { Messages, SWEEP_AFTER_MS } from "../api/src/platform/messages/send/messages.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../api/src/platform/settings.ts";
import { fakeAlerts } from "../ports/alert.ts";
import { FakeClock } from "../ports/clock.ts";
import { fakeJobs } from "../ports/jobs.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");
const PORT = Number(process.argv[2] ?? 4537), DBNAME = process.argv[3] ?? "xr_studio_runtime_pf19b3";
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "pf-19b3-messages", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const { ok, summary } = recorder();
const { sql: rawSql, until } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db);
const fo = await seedSampleFirmsFrontOffice(db);
const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
ok("PF-19b3 setup: the Sample firms and their front office are seeded", !!A && !!B && fo.failed.length === 0, fo.failed);
await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "seed:pf19b3", workspaceId: await platformAuditWorkspaceId(db), reason: "PF-19b part 3 test" });
const addStaff = (firm: string, role: string, tag: string) => {
  const email = `pf19b3-${tag}-${run}@example.com`;
  const id = sql(`insert into platform_staff (id, firm_id, email, display_name, actor_id, updated_at) values (gen_random_uuid(), '${firm}', '${email}', 'Sample ${tag} ${run}', 'pf19b3-${tag}-${run}', now()) returning id`);
  sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${firm}', '${id}', '${role}', 'seed:pf19b3')`); return { id, email };
};
const O = addStaff(A, "CASE_OFFICER", "officer"), RO = addStaff(A, "READ_ONLY", "reader"), FB = addStaff(B, "OWNER", "firmb");
async function signIn(firmKey: string, email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey, email, secondStep: true }) });
  const b = await r.json() as { token?: string; detail?: string }; if (b.token) return b.token;
  console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`); process.exit(2);
}
const tokens = { O: await signIn("sample-firm", O.email), RO: await signIn("sample-firm", RO.email), FB: await signIn("sample-solo", FB.email) };

// The lead (Officer's own) and its person, then three emails to the person.
const given = `Mira${run}`, addr = `mira.${run}@example.com`;
const personId = sql(`insert into fo_person (firm_id, given_names, family_name, email, created_by, updated_at) values ('${A}', '${given}', 'Sample', '${addr}', 'seed:pf19b3', now()) returning id`);
const leadId = sql(`insert into fo_lead (firm_id, person_id, door, source, owner_staff_id, created_by, updated_at) values ('${A}', '${personId}', 'MANUAL', 'Phone (Sample)', '${O.id}', 'seed:pf19b3', now()) returning id`);
const person = { kind: "FO_PERSON" as const, id: personId };
const files = new LocalFiles(join(STUDIO, "var", `isolated-${DBNAME.replace(/^xr_studio_/, "")}`, "front-office-files"));
const consent = new ConsentStore(auditEvent), clock = new FakeClock(new Date()), jobs = fakeJobs(clock);
const here = new Messages({ db, consent, files, jobs, alerts: () => fakeAlerts(), channels: channelsOf([["EMAIL", localEmail]]), clock });
await here.register();
connectLocalNotices(null);   // this test's own send gets no test event: it stays SENT
const write = (address: string, subject: string) => db.$transaction((t) => here.send(t, { firmId: A, person, channel: "EMAIL", class: "TRANSACTIONAL", address, content: { subject, text: `BODY-${run}: see you Monday.` }, idempotencyKey: randomUUID() }));
const sentHere = await write(addr, "Our call notes (Sample)");
await here.dispatch(A, [sentHere.outboxId]); await jobs.runDue();
// Two left QUEUED for the copy's own worker: the sweep takes QUEUED rows older than SWEEP_AFTER_MS, each minute.
const forCopy = await write(addr, "Booked (Sample)"), bounceTo = SAMPLE_BOUNCE_ADDRESSES[1], forBounce = await write(bounceTo, "Booked again (Sample)");
sql(`update msg_outbox set created_at = now() - interval '${Math.ceil(SWEEP_AFTER_MS / 60_000) + 1} minutes' where id in ('${forCopy.outboxId}', '${forBounce.outboxId}')`);
const stateOf = (id: string) => sql(`select state from msg_outbox where id = '${id}'`);
const settled = await until(async () => stateOf(forCopy.outboxId) === "DELIVERED" && stateOf(forBounce.outboxId) === "BOUNCED", 150_000);
ok("DW4 pass (the running copy): its own worker sends a lead's email with the local adapter, and its test event makes it DELIVERED within one worker cycle (no SES)",
  settled && stateOf(forCopy.outboxId) === "DELIVERED" && sql(`select count(*) from msg_event where outbox_id = '${forCopy.outboxId}' and kind = 'DELIVERED'`) === "1", { d: stateOf(forCopy.outboxId), b: stateOf(forBounce.outboxId) });
ok("DW4 pass (the running copy): a Sample bounce address reads BOUNCED and the address is suppressed", stateOf(forBounce.outboxId) === "BOUNCED"
  && sql(`select count(*) from msg_suppression where firm_id = '${A}' and address = '${bounceTo}' and reason = 'HARD_BOUNCE'`) === "1");
ok("DW4 fail (the running copy): a message the copy did not send (no test event) stays SENT", stateOf(sentHere.outboxId) === "SENT");
// The next email to the bounced address is stopped by the gate (SUPPRESSED, reason "SUPPRESSED: HARD_BOUNCE"): the panel words it (review M1).
const afterBounce = await write(bounceTo, "Third try (Sample)");
ok("DW4 pass (the running copy): the next send to the bounced address is suppressed", afterBounce.state === "SUPPRESSED" && afterBounce.reason === "SUPPRESSED: HARD_BOUNCE", afterBounce);

// DW5 on the running copy: the real route and the platform guard.
const api = (tok: string | null, path: string) => fetch(`${BASE}/api${path}`, { headers: tok ? { authorization: `Bearer ${tok}` } : {} });
const q = `/platform/messages?subjectKind=LEAD&subjectId=${leadId}`;
const mine = await api(tokens.O, q), mineBody = await mine.text();
ok("DW5 pass (route): the lead's owner gets its four messages; no body text and no full address in the answer",
  mine.status === 200 && (JSON.parse(mineBody) as { messages: unknown[] }).messages.length === 4 && !mineBody.includes(`BODY-${run}`) && !mineBody.includes(addr) && !mineBody.includes("Booked (Sample)"), { status: mine.status, body: mineBody.slice(0, 300) });
const roR = await api(tokens.RO, q), fbR = await api(tokens.FB, q), none = await api(null, q);
const words = async (r: Response) => `${r.status}:${((await r.json()) as { detail?: string }).detail}`;
const roW = await words(roR), fbW = await words(fbR);
ok("DW5 fail (route): a Read-only person who may not see the lead, and firm B's Owner → 404 with the same words; no session → 401", roW === fbW && roW.startsWith("404:") && none.status === 401, { roW, fbW, none: none.status });

// DW6: the panel in the browser.
const browser: Browser = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
async function pageAs(tok: string, width = 1440): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  await ctx.addInitScript((t) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })), tok);
  p.on("pageerror", (e) => errors.push(String(e))); return p;
}
const panel = (p: Page) => p.locator("[data-messages-panel]");
try {
  const p = await pageAs(tokens.O);
  // Keyboard only: from the Leads list to the lead, by Tab and Enter.
  await p.goto(`${BASE}/front-office/leads?view=mine`);
  await p.getByRole("link", { name: new RegExp(given) }).waitFor({ timeout: 30_000 });
  let reached = false;
  for (let i = 0; i < 80 && !reached; i++) { await p.keyboard.press("Tab"); reached = await p.evaluate((id) => (document.activeElement as HTMLAnchorElement | null)?.getAttribute("href")?.endsWith(id) ?? false, leadId); }
  if (reached) await p.keyboard.press("Enter");
  await panel(p).locator("[data-message]").first().waitFor({ timeout: 30_000 }).catch(() => undefined);
  ok("DW6 pass (keyboard only): Tab reaches the lead in the Leads list and Enter opens its page with the Messages panel", reached && (await panel(p).count()) === 1 && p.url().endsWith(leadId));
  const stateWords = await panel(p).locator("[data-state-word]").allInnerTexts();
  ok("DW6 pass: the panel shows Sent, Delivered, Bounced and Not sent as words, one per message", ["Sent", "Delivered", "Bounced", "Not sent"].every((w) => stateWords.includes(w)) && stateWords.length === 4, stateWords);
  const text = await panel(p).innerText();
  ok("DW6 pass: each message names its channel, the masked address, its class, the from-name and what happened with times",
    text.includes(`Email to m…@example.com`) && text.includes("Transactional") && text.includes(`from ${sql(`select operating_name from platform_firm where id = '${A}'`)}`) && /Delivered [A-Z][a-z]{2} \d{1,2}, \d{4}/.test(text) && text.includes("Bounced"), text.slice(0, 500));
  ok("DW6 fail (review M1): a stored reason shows in plain words, never as a code (Not sent: an earlier email to this address bounced; hard bounce in words)",
    text.includes("Not sent: an earlier email to this address bounced") && text.includes("The address does not exist or refuses email") && !/SUPPRESSED|HARD_BOUNCE|NO_CONSENT|hard bounce/.test(text), text.slice(0, 800));
  ok("DW6 fail: the page shows no body text and no full address of any message", !(await p.content()).includes(`BODY-${run}`) && !text.includes(addr) && !text.includes(bounceTo));
  // The state is never colour alone: the word is in the pill's own text.
  ok("DW6 pass: each state pill carries its word (never colour alone)", (await panel(p).locator("[data-state] [data-state-word]").count()) === 4);
  for (const w of [1440, 1024, 375]) {
    await p.setViewportSize({ width: w, height: 900 }); await p.waitForTimeout(150);
    ok(`DW6 pass (${w} px): no sideways page scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    const r = await new AxeBuilder({ page: p }).withTags(TAGS).include("[data-messages-panel]").analyze();
    ok(`DW6 pass (${w} px): axe finds no WCAG A/AA violation in the panel`, r.violations.length === 0, r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target?.join(" ")}`).join(" | ") || undefined);
    await p.screenshot({ path: join(SHOTS, `lead-messages-${w}.png`), fullPage: true });
  }
  const full = await new AxeBuilder({ page: p }).withTags(TAGS).analyze();
  ok("DW6 pass: axe finds no WCAG A/AA violation on the whole lead page with the panel", full.violations.length === 0, full.violations.map((v) => `${v.id}: ${v.nodes[0]?.target?.join(" ")}`).join(" | ") || undefined);
  // Review m1: 51 messages on a second lead; "Show older messages" by keyboard puts focus on the first older message.
  const p51 = sql(`insert into fo_person (firm_id, given_names, family_name, created_by, updated_at) values ('${A}', 'Paged${run}', 'Sample', 'seed:pf19b3', now()) returning id`);
  const lead51 = sql(`insert into fo_lead (firm_id, person_id, door, source, owner_staff_id, created_by, updated_at) values ('${A}', '${p51}', 'MANUAL', 'Phone (Sample)', '${O.id}', 'seed:pf19b3', now()) returning id`);
  for (let i = 0; i < 51; i++) await db.$transaction((t) => here.send(t, { firmId: A, person: { kind: "FO_PERSON", id: p51 }, channel: "EMAIL", class: "TRANSACTIONAL", address: `paged${i}.${run}@example.com`, content: { subject: "Paged (Sample)", text: "x" }, idempotencyKey: randomUUID() }));
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto(`${BASE}/front-office/leads/${lead51}`); await panel(p).locator("[data-message]").first().waitFor({ timeout: 30_000 });
  const firstPage = await panel(p).locator("[data-message]").count();
  await p.getByRole("button", { name: "Show older messages" }).focus(); await p.keyboard.press("Enter");
  await p.waitForFunction(() => document.querySelectorAll("[data-messages-panel] [data-message]").length === 51, null, { timeout: 15_000 }).catch(() => undefined);
  await p.waitForTimeout(200);
  const focused = await p.evaluate(() => { const a = document.activeElement; return a?.matches("[data-message]") ? [...document.querySelectorAll("[data-messages-panel] [data-message]")].indexOf(a) : -1; });
  ok("DW6 pass (review m1): 50 shown, then Show older messages by keyboard loads the 51st and focus moves to it (not the top of the page)",
    firstPage === 50 && (await panel(p).locator("[data-message]").count()) === 51 && focused === 50 && (await p.getByRole("button", { name: "Show older messages" }).count()) === 0, { firstPage, focused });
  // Review m2: a failed load offers Try again, which loads the messages once the network is back.
  const e = await pageAs(tokens.O);
  let blocked = true;
  await e.route("**/api/platform/messages?**", (rt) => (blocked ? rt.abort("failed") : rt.continue()));
  await e.goto(`${BASE}/front-office/leads/${leadId}`);
  await e.getByRole("button", { name: "Try again" }).waitFor({ timeout: 30_000 }).catch(() => undefined);
  const offered = (await e.getByRole("button", { name: "Try again" }).count()) === 1;
  blocked = false; if (offered) await e.getByRole("button", { name: "Try again" }).click();
  await panel(e).locator("[data-message]").first().waitFor({ timeout: 15_000 }).catch(() => undefined);
  ok("DW6 fail→pass (review m2): a failed load says so with a Try again button; Try again then shows the messages", offered && (await panel(e).locator("[data-message]").count()) === 4);
  errors.splice(0, errors.length, ...errors.filter((x) => !/Failed to fetch|NetworkError/.test(x)));
  const r = await pageAs(tokens.RO);
  await r.goto(`${BASE}/front-office/leads/${leadId}`); await r.getByRole("heading", { name: "Lead not found" }).waitFor({ timeout: 30_000 }).catch(() => undefined);
  ok("DW6 fail: a Read-only person who may not see the lead reads Lead not found, with no Messages panel", (await r.getByRole("heading", { name: "Lead not found" }).count()) === 1 && (await panel(r).count()) === 0);
  ok("DW6: no script error on any page", errors.length === 0, errors);
} finally {
  await browser.close(); await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
