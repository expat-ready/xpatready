// J-105 (map row 105, R1.105: keep periods; a leaving firm is closed, not deleted), written by the qa lane (Track B,
// A286, 22 Nov) BEFORE the row's last parts merge, so qa only has to run it when they do. On an isolated copy of the
// running app (its own database and port, never :4400).
// Done when (CAPABILITIES R1.105): "Each record kind has a keep period; deleting inside it refused; a leaving firm is
// read-only, exported, closed at 90 days, never deleted early".
// Parts (MVP-CHECKLIST row 105): AUD-5 (part 1 #2008 and part 2 merged), PF-11c, PF-5's close at 90 days; the walk also
// needs PF-11 (the firm's data download, "exported") and AUD-2 (the write-once archive PF-11c writes the export to),
// which the checklist row does not list (noted in the qa report).
//   W1 (each record kind has a keep period): the firm's Owner reads the keep periods: every record class of
//       KEEP_PERIODS has a number of years and a source; the College's rule carries page, quote and date and
//       "Unconfirmed: no counsel"; the closed-client-file setting is saved by the Owner (a reason needed below 6 years,
//       on its field), refused to a Case Officer (403) and to no session (401), and the save writes one audit line.
//   W2 (deleting inside it refused): underneath, an activity-log line cannot be deleted even by the app's database role
//       (the 7-year floor holds); and the deleters AUD-5 names (PF-21d's erasure, PF-11c's purge) ask AUD-5's check
//       before deleting. FAILS today: no deleter calls KeepPeriodPort.check (AUD-5 part 2 has no caller; PF-21d,
//       PF-11c not merged).
//   W3 (a leaving firm is read-only): a firm whose subscription ended (the hold written to the copy as Stripe's webhook
//       would: no Stripe key, US$0) signs in on screen; Plan and billing says its data is kept until the day 90 days
//       after the hold; a write is refused (402, in words) and nothing is stored.
//   W4 (exported): the held firm's Owner can download the firm's data (PF-11's route, open on hold) and the page offers
//       it (PF-11s). FAILS today: PF-11, PF-11s not merged.
//   W5 (closed at 90 days, never deleted early): a daily job closes a firm whose 90 days ran out (archived first: PF-11c
//       with AUD-2), and a firm on day 30 keeps every row. The "never early" half passes today; the close FAILS (PF-11c).
//   W6: Plan and billing on hold at 400, 1024, 1440 px: no sideways scroll, axe clean; no page error.
// Sample data only (seedSampleFirms: sample-firm, sample-solo); US$0, no model call, live AI off, no Stripe call.
// Legal readings Unconfirmed: no counsel. Screenshots: product/screens/J-105/screenshots/. Run from prototype/:
//   zsh studio/tools/isolated.sh j105 4475 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j105 4475 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_105.ts j105 4475
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { KeepClass } from "../../ports/keep-period.ts";
import { recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const NAME = process.argv[2] ?? "j105", PORT = Number(process.argv[3] ?? 4475), DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`;
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const STUDIO = join(import.meta.dirname, "..", "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-105", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const { ok, summary } = recorder();
const PSQL = ["/opt/homebrew/opt/postgresql@18/bin/psql", "/usr/local/bin/psql", "/usr/bin/psql"].find((p) => existsSync(p)) ?? "psql";
const as = (user: string, q: string) => execFileSync(PSQL, [`postgresql://${user}@127.0.0.1:54329/${DBNAME}`, "-X", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = (q: string) => as("xr_studio", q);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- answers read loosely, as the other journeys
const j = async (method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; body: any }> => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let b: unknown = t; try { b = JSON.parse(t); } catch { /* text */ } return { status: r.status, body: b };
};
const signIn = async (firmKey: string, email: string) => (await j("POST", "/api/platform/session/local", { firmKey, email, secondStep: true })).body?.token as string | undefined;
/** Every .ts file under a folder (the code read for W2's "who asks the check"; read only). */

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db); await seedSampleFirmsFrontOffice(db); await db.$disconnect();
const browser = await chromium.launch({ headless: !process.env.HEADED, slowMo: process.env.HEADED ? 150 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [], stripe: string[] = [];
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
try {
  const firmA = sql(`select id from platform_firm where key = 'sample-firm'`), firmL = sql(`select id from platform_firm where key = 'sample-solo'`);
  const ownerA = sql(`select email from platform_staff where actor_id = 'user-R'`), officerA = sql(`select email from platform_staff where actor_id = 'user-O'`);
  const ownerL = sql(`select email from platform_staff where actor_id = 'user-S'`);
  const tOwner = await signIn("sample-firm", ownerA), tOfficer = await signIn("sample-firm", officerA);
  if (!tOwner || !tOfficer) throw new Error("STOP  the sample firm's Owner and Case Officer could not sign in (start the copy with PLATFORM_IDENTITY=local)");

  // ------------------------------------------------------------------------------------------ W1: a keep period per record kind
  const kp = await j("GET", "/api/platform/keep-periods", undefined, tOwner);
  const periods: { class: string; years: number | null; kind: string; sources: string[]; words: string }[] = kp.body?.periods ?? [];
  const classes = KeepClass.options;
  ok("R1.105 W1: every record kind has its keep period (years and at least one source) in the firm's keep periods", kp.status === 200 && classes.every((c) => periods.some((p) => p.class === c && typeof p.years === "number" && p.years > 0 && p.sources.length > 0 && p.words.length > 0)), { status: kp.status, classes, got: periods.map((p) => `${p.class}:${p.years}`) });
  const col = kp.body?.college ?? {};
  ok("R1.105 W1: the College's rule is cited (document, section, page, quote, url, read date) and says 'Unconfirmed: no counsel'", !!col.page && !!col.quote && /^https:\/\//.test(col.url ?? "") && /^\d{4}-\d{2}-\d{2}$/.test(col.read ?? "") && col.unconfirmed === "Unconfirmed: no counsel", col);
  ok("R1.105 W1: the activity log's period is a floor (7 years) and the closed client files' one a reminder, said in words", periods.find((p) => p.class === "activity_log")?.kind === "FLOOR" && periods.find((p) => p.class === "closed_client_file")?.kind === "REMINDER" && /not a lock/.test(kp.body?.closedClientFiles?.words ?? ""), kp.body?.closedClientFiles);
  const anon = await j("GET", "/api/platform/keep-periods");
  ok("R1.105 W1 fail: the keep periods are refused with no session (401)", anon.status === 401, anon.status);
  const auditBefore = Number(sql(`select count(*) from audit_event where firm_id = '${firmA}' and action = 'platform.setting.change'`));
  const below = await j("PUT", "/api/platform/keep-periods/closed-client-files", { years: 4 }, tOwner);
  ok("R1.105 W1 fail: 4 years (below the College's 6) with no reason is refused on the reason field, in words; nothing saved", below.status === 422 && !!below.body?.fields?.reason && /College/.test(below.body?.detail ?? "") && Number(sql(`select count(*) from audit_event where firm_id = '${firmA}' and action = 'platform.setting.change'`)) === auditBefore, below.body);
  const byOfficer = await j("PUT", "/api/platform/keep-periods/closed-client-files", { years: 8 }, tOfficer);
  ok("R1.105 W1 fail: a Case Officer (no agent/legal-settings:manage) cannot change it (403)", byOfficer.status === 403, byOfficer.status);
  const saved = await j("PUT", "/api/platform/keep-periods/closed-client-files", { years: 8 }, tOwner);
  const after = await j("GET", "/api/platform/keep-periods", undefined, tOwner);
  ok("R1.105 W1: the Owner saves 8 years; the read says it in words and the row's period is 8", saved.status === 200 && saved.body?.saved === true && after.body?.closedClientFiles?.years === 8 && after.body?.periods?.find((p: { class: string }) => p.class === "closed_client_file")?.years === 8, { saved: saved.body, read: after.body?.closedClientFiles });
  ok("R1.105 W1: the save writes one audit line (platform.setting.change)", Number(sql(`select count(*) from audit_event where firm_id = '${firmA}' and action = 'platform.setting.change'`)) === auditBefore + 1);

  // ------------------------------------------------------------------------------------------ W2: deleting inside it refused
  const line = sql(`select id from audit_event where firm_id = '${firmA}' order by at desc limit 1`);
  let refusedWords = "";
  try { as("xr_app", `begin; select set_config('app.firm_id', '${firmA}', true); delete from audit_event where id = '${line}'; commit;`); } catch (e) { refusedWords = String((e as { stderr?: string }).stderr ?? e); }
  ok("R1.105 W2: underneath, an activity-log line cannot be deleted, even by the app's database role (the audit table's insert-only rule, AUD-1; not the keep-period check itself)", /never changed or deleted/.test(refusedWords) && sql(`select count(*) from audit_event where id = '${line}'`) === "1", refusedWords.slice(0, 200));
  // A record inside its keep period: a client person of firm A whose file closed today (Sample). Deleting it through the
  // app (PF-21d's erasure of one person, the one deleter Release 1 names) must be refused in words, the row kept.
  const kept = sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${firmA}', 'Kept', 'Sample', 'kept.${Date.now()}@example.com', 'seed:J-105', now()) returning id`);
  const del = await j("DELETE", `/api/front-office/people/${kept}`, undefined, tOwner);
  const erase = await j("POST", "/api/platform/erasure/run", { subject: { kind: "PERSON", id: kept } }, tOwner);
  const refusedInPeriod = [del, erase].some((r) => r.status === 409 && /keep|kept until|period/i.test(JSON.stringify(r.body ?? "")));
  ok("R1.105 W2 (missing: AUD-5's callers, PF-21d's erasure and PF-11c's purge): deleting a record inside its keep period through the app is refused in words (409, kept until <date>) and the row stays",
    refusedInPeriod && sql(`select count(*) from fo_person where id = '${kept}'`) === "1", { delete: del.status, erasure: erase.status });

  // ------------------------------------------------------------------------------------------ W3: a leaving firm is read-only
  // The subscription ended (Stripe's "canceled" → the firm on hold, PF-5 part 2's webhook): written as the webhook writes it.
  sql(`update platform_firm set status = 'PAYMENT_HOLD' where id = '${firmL}'`);
  sql(`insert into module_event (id, firm_id, type, subject_id, payload, occurred_at) values (gen_random_uuid(), '${firmL}', 'firm.payment_hold', '${firmL}', jsonb_build_object('firmId', '${firmL}'::text, 'reason', 'payment needed'), now() - interval '30 days')`);
  const holdAt = new Date(sql(`select to_char(max(occurred_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') from module_event where firm_id = '${firmL}' and type = 'firm.payment_hold'`));
  const day90 = new Date(holdAt.getTime() + 90 * 86_400_000);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
  await ctx.route(/stripe\.com/, (r) => { stripe.push(r.request().url()); return r.abort(); });
  const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(`${BASE}/account`);
  await p.getByLabel("Firm key").fill("sample-solo"); await p.getByLabel("Work email").fill(ownerL); await p.getByRole("button", { name: "Sign in" }).click();
  await p.locator("[data-account], [data-terms-page], [data-billing-summary]").first().waitFor({ timeout: 20_000 }).catch(() => undefined);
  const tL = await p.evaluate(() => JSON.parse(sessionStorage.getItem("xr-staff-session") ?? "{}").token as string | undefined);
  await p.goto(`${BASE}/settings/billing`); await p.locator("[data-billing-summary]").waitFor({ timeout: 30_000 });
  const holdWords = (await p.locator("[data-billing-hold]").innerText().catch(() => "")).replace(/\s+/g, " ");
  const longDay = (d: Date) => [d.toLocaleDateString("en-CA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }), d.toLocaleDateString("en-CA", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }), d.toISOString().slice(0, 10)];
  const bill = await j("GET", "/api/platform/billing", undefined, tL);
  ok("R1.105 W3: the leaving firm's Owner signs in on screen and Plan and billing says the firm is on hold and its data is kept until day 90",
    /kept until/i.test(holdWords) && bill.body?.hold?.deletionDate?.slice(0, 10) === day90.toISOString().slice(0, 10), { holdWords, deletionDate: bill.body?.hold?.deletionDate, day90: longDay(day90) });
  await shot(p, "w3-billing-on-hold-1440");
  const leadsBefore = sql(`select count(*) from fo_lead where firm_id = '${firmL}'`);
  const write = await j("POST", "/api/front-office/leads", { requestId: globalThis.crypto.randomUUID(), givenNames: "Client", familyName: "A", email: `client.a.${Date.now()}@example.com`, source: "Phone call (Sample)" }, tL);
  ok("R1.105 W3 fail: a write by the leaving firm is refused (402) in plain words; nothing is stored", write.status === 402 && /on hold/.test(write.body?.detail ?? "") && sql(`select count(*) from fo_lead where firm_id = '${firmL}'`) === leadsBefore, { status: write.status, detail: write.body?.detail });

  const read = await j("GET", "/api/front-office/leads", undefined, tL);
  ok("R1.105 W3 (Conflict: \"read-only\" vs 402 on reads, for Lead B to settle from SA-02; tech lead on #2992): the leaving firm can still read its own records (the Leads list answers 200)", read.status === 200, { status: read.status, detail: read.body?.detail });

  // ------------------------------------------------------------------------------------------ W4: exported
  const exportRead = await j("GET", "/api/platform/firm-export", undefined, tL);
  const exportAsk = await j("POST", "/api/platform/firm-export", {}, tL);
  const downloadOffered = (await p.getByRole("button", { name: /download (your|the firm's) data/i }).count()) + (await p.getByRole("link", { name: /download (your|the firm's) data/i }).count());
  ok("R1.105 W4 (missing: PF-11 the firm's data download, PF-11s its panel): the leaving firm's Owner can request and download the firm's data while on hold, offered on Plan and billing",
    [200, 201, 202].includes(exportAsk.status) && downloadOffered > 0, { read: exportRead.status, request: exportAsk.status, downloadOffered });

  // ------------------------------------------------------------------------------------------ W5: closed at 90, never early
  const rowsL = () => Number(sql(`select (select count(*) from platform_staff where firm_id = '${firmL}') + (select count(*) from fo_person where firm_id = '${firmL}')`));
  const rows30 = rowsL();
  ok("R1.105 W5: never deleted early: on day 30 of the hold the firm is not deleted and keeps every row", sql(`select status from platform_firm where id = '${firmL}'`) === "PAYMENT_HOLD" && rows30 > 0, { rows30 });
  // module_event is insert-only: a newer hold line dated 91 days ago (the account reads the newest by seq).
  sql(`insert into module_event (id, firm_id, type, subject_id, payload, occurred_at) values (gen_random_uuid(), '${firmL}', 'firm.payment_hold', '${firmL}', jsonb_build_object('firmId', '${firmL}'::text, 'reason', 'payment needed'), now() - interval '91 days')`);
  const past = await j("GET", "/api/platform/billing", undefined, tL);
  ok("R1.105 W5: on day 91 Plan and billing's deletion date has passed (the 90-day clock ran out)", !!past.body?.hold?.deletionDate && new Date(past.body.hold.deletionDate).getTime() < Date.now(), past.body?.hold);
  const schedules = sql(`select string_agg(name, ',') from platform_jobs.schedule`);
  const closer = schedules.split(",").filter((n) => /clos|exit|firm.*(purge|delete)/i.test(n) && !/signup/.test(n));
  // Run the closing job now (as its daily schedule would), rather than wait a day: one job sent by its own name.
  let sent = "no closing job";
  if (closer.length) { try { sql(`insert into platform_jobs.job (name, data) values ('${closer[0]}', '{}'::jsonb)`); sent = "sent"; } catch (e) { sent = String((e as { stderr?: string }).stderr ?? e).split("\n")[0]; } }
  for (let i = 0; i < 30 && sent === "sent" && sql(`select status from platform_firm where id = '${firmL}'`) !== "DELETED"; i++) await wait(1000);
  ok("R1.105 W5 (missing: AUD-2's S3 write-once archive (CLOSURE_ARCHIVE unset) and PF-11's full export: until both, PF-11c part 1 (#3195) closes no firm and raises firm_closure_blocked, features/platform-firm-closure.ts:3, closure.ts:84-89): the closing job, run now, closes a firm whose 90 days ran out, its export archived first; the firm reads closed (DELETED)",
    closer.length > 0 && sql(`select status from platform_firm where id = '${firmL}'`) === "DELETED", { closingJobs: closer, sent, status: sql(`select status from platform_firm where id = '${firmL}'`) });

  // ------------------------------------------------------------------------------------------ W6: sizes, axe, errors
  for (const width of [400, 1024, 1440]) {
    await p.setViewportSize({ width, height: 900 }); await p.goto(`${BASE}/settings/billing`); await p.locator("[data-billing-summary]").waitFor({ timeout: 30_000 }); await wait(300);
    const wide = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const axe = await new AxeBuilder({ page: p }).withTags(TAGS).analyze();
    ok(`R1.105 W6: Plan and billing on hold at ${width} px: no sideways scroll, axe clean`, wide <= 1 && axe.violations.length === 0, { wide, axe: axe.violations.map((v) => `${v.id} (${v.nodes.length})`) });
    if (width === 400) await shot(p, "w6-billing-on-hold-400");
  }
  ok("R1.105: no page error in the browser, and no request reached stripe.com", errors.length === 0 && stripe.length === 0, { errors, stripe });
  await ctx.close();
} finally {
  await browser.close();
}
process.exit(summary() ? 1 : 0);
