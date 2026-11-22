// PF-28 part 3a walk at 1440 px on an isolated copy (argv: port, shots dir): the sales screens whose routes now read their
// input through the one rule. Leads (every view chip), Add a lead, the lead's page, Engage, the pipeline board and the
// web-form settings all work, and no front-office API call is refused (Add a lead with no source is refused by the page
// itself, before any call). The copy is seeded as the FO browser suites seed it (seedSampleFirms, seedSampleFirmsFrontOffice).
const { chromium } = require("playwright");
const [port, shots] = process.argv.slice(2), BASE = `http://localhost:${port}`;
const log = (ok, s) => { console.log(`${ok ? "PASS" : "FAIL"}  ${s}`); if (!ok) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const tok = (await (await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", actorId: "user-R", secondStep: true }) })).json()).token;
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }), bad = [], ok2xx = [];
  await ctx.addInitScript((t) => { if (!sessionStorage.getItem("xr-staff-session")) sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3600000 })); }, tok);
  const p = await ctx.newPage();
  p.on("response", (r) => { const u = new URL(r.url()); if (!u.pathname.startsWith("/api/front-office/")) return; (r.status() >= 400 ? bad : ok2xx).push(`${r.request().method()} ${u.pathname}${u.search} ${r.status()}`); });
  const shot = (n) => p.screenshot({ path: `${shots}/${n}.png` });
  // 1. Leads: every view chip loads (GET /leads?view=… through the strict query)
  await p.goto(`${BASE}/front-office/leads`); await p.getByRole("heading", { level: 1, name: "Leads" }).waitFor({ timeout: 30000 });
  const chips = await p.locator("[data-chip]").evaluateAll((els) => els.map((e) => e.getAttribute("data-chip")));
  for (const c of chips) { await p.locator(`[data-chip="${c}"]`).click(); await p.waitForTimeout(600); }
  await shot("1-leads");
  log(chips.length >= 3 && ok2xx.some((x) => /GET \/api\/front-office\/leads\?view=/.test(x)), `Leads: every view chip (${chips.join(", ")}) loads its list`);
  // 2. Add a lead: Save with no source → the page's own words; then with a source → the lead's page (POST /leads, strict body)
  await p.goto(`${BASE}/front-office/leads?view=mine`); await p.locator("[data-add-lead-open]").waitFor({ timeout: 30000 });
  await p.locator("[data-add-lead-open]").click(); await p.getByLabel("First name", { exact: true }).waitFor({ timeout: 20000 });
  const run = Date.now().toString(36);
  await p.getByLabel("First name", { exact: true }).fill(`Walk${run}`); await p.getByLabel("Email", { exact: true }).fill(`walk.${run}@example.org`);
  await p.getByRole("button", { name: "Save lead" }).click(); await p.waitForTimeout(500);
  const noSource = await p.locator("[data-add-lead]").innerText();
  await p.getByLabel("Source", { exact: true }).fill("Walk-in"); await shot("2-add-lead");
  await p.getByRole("button", { name: "Save lead" }).click();
  await p.getByRole("heading", { level: 1, name: new RegExp(`Walk${run}`) }).waitFor({ timeout: 20000 }); await p.waitForTimeout(500);
  await shot("3-lead-page");
  log(/source/i.test(noSource) && ok2xx.some((x) => /^POST \/api\/front-office\/leads 20\d$/.test(x)), "Add a lead: no source is refused on the page; with a source the lead is saved and its page opens");
  // 3. Engage (POST /leads/:id/engage) → the prospect's page; then the pipeline board loads (GET /prospects, strict query)
  const engage = p.getByRole("button", { name: /^Engage/ });
  await engage.first().click(); await p.getByRole("button", { name: "Engage as Individual" }).click(); await p.waitForTimeout(1500);
  await shot("4-engaged");
  log(ok2xx.some((x) => /^POST \/api\/front-office\/leads\/[0-9a-f-]+\/engage 20\d$/.test(x)), "Engage as Individual: the prospect is made");
  // 4. Pipeline: the board loads (GET /prospects, strict query); Move to… the next stage (POST prospects/:id/move, strict body)
  await p.goto(`${BASE}/front-office/pipeline`); const mv = p.locator("[data-move]").first(); await mv.waitFor({ timeout: 30000 });
  await mv.click(); const to = p.locator("[data-move-to]").first(), toName = await to.getAttribute("data-move-to"); await to.click(); await p.waitForTimeout(1500);
  await shot("5-pipeline-moved");
  log(ok2xx.some((x) => /^GET \/api\/front-office\/prospects/.test(x)) && ok2xx.some((x) => /^POST \/api\/front-office\/prospects\/[0-9a-f-]+\/move 200$/.test(x)), `Pipeline: the board loads and Move to… ${toName} saves`);
  // 5. Web-form settings: the page loads its forms (GET /web-forms)
  await p.goto(`${BASE}/front-office/settings/web-form`); await p.waitForTimeout(2000); await shot("6-web-form-settings");
  log(ok2xx.some((x) => /^GET \/api\/front-office\/web-forms/.test(x)), "Web-form settings: the forms load");
  log(bad.length === 0, `no front-office call refused: ${JSON.stringify(bad)}`);
  await b.close();
})().catch((e) => { console.log(`FAIL  ${e.message.split("\n")[0]}`); process.exit(1); });
