// qa 9 (19 Nov), R1.31 gate A by screens (P-317): can a person make "totals per currency" appear? The Done-when says the
// board's totals are per currency, never mixed. J-30/J-31 set each prospect's value and currency with SQL (j_30.ts W3);
// this walk uses only screens and the public API: Owner engages a lead, opens the prospect, looks for any way to enter a
// deal value and currency (AG-2-2 "an optional deal value"), and reads the board's totals at 400, 1024 and 1440 px.
// Fails today (QA-530) and passes once a person can set a value. Sample rows only; US$0. Run from prototype/:
//   zsh studio/tools/isolated.sh qa9v 4477 start --ttl 20 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh qa9v 4477 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/qa/check_r131_gate_a_value.ts qa9v 4477 <shots-dir>
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "../runtime/api.ts";

const [NAME, PORT, SHOTS] = [process.argv[2] ?? "qa9v", Number(process.argv[3] ?? 4477), process.argv[4] ?? "/tmp/r131"];
mkdirSync(SHOTS, { recursive: true });
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`;
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}` }) });
await seedSampleFirms(db); await seedSampleFirmsFrontOffice(db);
const A = sql(`select id from platform_firm where key = 'sample-firm'`);
const [rid, remail] = sql(`select id || '|' || email from platform_staff where actor_id = 'user-R'`).split("|");
const tok = (await (await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email: remail, secondStep: true }) })).json() as { token: string }).token;
// The lead arrives as a person would phone in (data, not under test here: R1.29's door).
const p = sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${A}', 'Lena', 'Sample', 'qa9.lena@example.org', 'test', now()) returning id`);
const leadId = sql(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, created_by, updated_at, arrived_at) values (gen_random_uuid(), '${A}', '${p}', 'MANUAL', 'Phone call', '${rid}', 'test', now(), now()) returning id`);

const browser = await chromium.launch(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), tok);
const pg = await ctx.newPage();
await pg.goto(`${BASE}/front-office/leads/${leadId}`);
await pg.getByRole("button", { name: "Engage", exact: true }).click();
await pg.getByRole("button", { name: /Engage as Individual/ }).click();
await pg.waitForURL(/\/front-office\/prospects\//); await pg.locator("[data-stage-now]").waitFor();
const prospectId = pg.url().split("/prospects/")[1].split(/[?#]/)[0];
await pg.screenshot({ path: join(SHOTS, "r131-prospect-1440.png"), fullPage: true });
const page = await pg.locator("main").innerText();
ok("R1.31 gate A: the new prospect's screen shows Value \"Not set\"", /Value\s*Not set/.test(page), page.slice(0, 300));
const inputs = await pg.locator("main input, main select, main textarea").count();
const valueBtn = await pg.getByRole("button", { name: /value|amount|edit|currency/i }).count();
ok("R1.31 gate A (QA-530): the prospect's screen offers a way to set its value and currency (a field or an Edit)", inputs + valueBtn > 0, { inputs, valueBtn });
// Underneath: no route takes a value (PATCH, PUT on the prospect).
const tries: [string, number][] = [];
for (const m of ["PATCH", "PUT"]) {
  const r = await fetch(`${BASE}/api/front-office/prospects/${prospectId}`, { method: m, headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: JSON.stringify({ valueCents: 500000, currency: "CAD" }) });
  tries.push([m, r.status]);
}
ok("R1.31 gate A (QA-530): the API takes a prospect's value (PATCH or PUT /prospects/:id)", tries.some(([, s]) => s < 300), tries);
for (const w of [400, 1024, 1440]) {
  await pg.setViewportSize({ width: w, height: 900 });
  await pg.goto(`${BASE}/front-office/pipeline`); await pg.locator("[data-stage=\"ENGAGED\"]").waitFor();
  await pg.screenshot({ path: join(SHOTS, `r131-board-${w}.png`), fullPage: true });
  const totals = await pg.locator("[data-open-totals]").innerText().catch(() => "(none)");
  ok(`R1.31 gate A at ${w} px: the board's open totals show an amount a person entered`, /\d/.test(totals.replace(/\b\d+ (open|prospects?)\b/gi, "")), totals);
}
await browser.close(); await db.$disconnect();
summary("R1.31 gate A (value by screens)");
