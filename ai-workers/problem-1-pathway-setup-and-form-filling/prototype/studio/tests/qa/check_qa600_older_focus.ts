// QA-600 (R1.48, PF-19b part 3 DW6 review m1): after "Show older messages" by keyboard, focus must land on the first
// newly loaded message. messages-panel.tsx `older()` focuses `firstNew` in one requestAnimationFrame after fetchNextPage
// resolves; when React has not yet rendered the new row, the ref is null, the button unmounts and focus drops to <body>.
// Seen once in five runs of check_pf19b3_panel_browser.ts on main 1ee04f2b4. This check repeats the step on a slowed
// CPU (CDP throttling x6) so the race shows; it fails today if any try loses focus and passes once focus always lands.
// Sample rows only; US$0. Run from prototype/:
//   zsh studio/tools/isolated.sh qa600 4474 start --ttl 20 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh qa600 4474 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/qa/check_qa600_older_focus.ts 4474 xr_studio_qa600
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { LocalFiles } from "../../api/src/front-office/files.ts";
import { auditEvent } from "../../api/src/platform/audit/audit-event.ts";
import { connectLocalNotices, localEmail } from "../../api/src/platform/messages/channels/email/local.ts";
import { ConsentStore } from "../../api/src/platform/messages/consent/consent-store.ts";
import { channelsOf } from "../../api/src/platform/messages/send/channels.ts";
import { Messages } from "../../api/src/platform/messages/send/messages.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { fakeAlerts } from "../../ports/alert.ts";
import { FakeClock } from "../../ports/clock.ts";
import { fakeJobs } from "../../ports/jobs.ts";
import { client, recorder } from "../runtime/api.ts";
const PORT = Number(process.argv[2] ?? 4474), DBNAME = process.argv[3] ?? "xr_studio_qa600", TRIES = 6;
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..", "..");
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db); await seedSampleFirmsFrontOffice(db);
const A = sql(`select id from platform_firm where key = 'sample-firm'`);
const email = `qa600-${run}@example.com`;
const staff = sql(`insert into platform_staff (id, firm_id, email, display_name, actor_id, updated_at) values (gen_random_uuid(), '${A}', '${email}', 'Sample qa600 ${run}', 'qa600-${run}', now()) returning id`);
sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${A}', '${staff}', 'CASE_OFFICER', 'seed:qa600')`);
const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email, secondStep: true }) });
const token = ((await r.json()) as { token?: string }).token;
if (!token) { console.error("STOP  local sign-in refused (start the copy with PLATFORM_IDENTITY=local)"); process.exit(2); }
const files = new LocalFiles(join(STUDIO, "var", `isolated-${DBNAME.replace(/^xr_studio_/, "")}`, "front-office-files"));
const clock = new FakeClock(new Date()), jobs = fakeJobs(clock);
const here = new Messages({ db, consent: new ConsentStore(auditEvent), files, jobs, alerts: () => fakeAlerts(), channels: channelsOf([["EMAIL", localEmail]]), clock });
await here.register(); connectLocalNotices(null);
const person = sql(`insert into fo_person (firm_id, given_names, family_name, email, created_by, updated_at) values ('${A}', 'Paged${run}', 'Sample', 'paged.${run}@example.com', 'seed:qa600', now()) returning id`);
const lead = sql(`insert into fo_lead (firm_id, person_id, door, source, owner_staff_id, created_by, updated_at) values ('${A}', '${person}', 'MANUAL', 'Phone (Sample)', '${staff}', 'seed:qa600', now()) returning id`);
for (let i = 0; i < 51; i++) await db.$transaction((t) => here.send(t, { firmId: A, person: { kind: "FO_PERSON", id: person }, channel: "EMAIL", class: "TRANSACTIONAL", address: `paged${i}.${run}@example.com`, content: { subject: "Paged (Sample)", text: "x" }, idempotencyKey: randomUUID() }));
const browser = await chromium.launch(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {});
const lost: number[] = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await ctx.addInitScript((t) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })), token);
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
  for (let i = 0; i < TRIES; i++) {
    await p.goto(`${BASE}/front-office/leads/${lead}`);
    await p.locator("[data-messages-panel] [data-message]").first().waitFor({ timeout: 30_000 });
    await p.getByRole("button", { name: "Show older messages" }).focus(); await p.keyboard.press("Enter");
    await p.waitForFunction(() => document.querySelectorAll("[data-messages-panel] [data-message]").length === 51, null, { timeout: 20_000 }).catch(() => undefined);
    await p.waitForTimeout(500);
    const at = await p.evaluate(() => { const a = document.activeElement; return a?.matches("[data-message]") ? [...document.querySelectorAll("[data-messages-panel] [data-message]")].indexOf(a) : -1; });
    if (at !== 50) lost.push(i + 1);
  }
  ok(`QA-600: after Show older messages by keyboard, focus lands on the 51st message every time (${TRIES} tries, CPU x6)`, lost.length === 0, { triesLosingFocus: lost });
} finally { await browser.close(); await db.$disconnect(); }
process.exit(summary() ? 1 : 0);
