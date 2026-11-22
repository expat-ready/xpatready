// PF-28 part 3b walk at 1440 px on an isolated copy (argv: port, shots dir, public form token or ""): the screens whose
// routes 3b moved to the one input rule. Add a lead (the duplicate check runs), the lead's phone Edit (PATCH people/:id),
// Engage, the prospect's conflict check (preview, then Save check), the pipeline board, and the hosted web form (its
// public post). No front-office or public call is refused. The copy is seeded as the FO browser suites seed it
// (seedSampleFirms, seedSampleFirmsFrontOffice) and one Sample form is switched on for the last step.
const { chromium } = require("playwright");
const [port, shots, formToken] = process.argv.slice(2), BASE = `http://localhost:${port}`;
const log = (ok, s) => { console.log(`${ok ? "PASS" : "FAIL"}  ${s}`); if (!ok) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const tok = (await (await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", actorId: "user-R", secondStep: true }) })).json()).token;
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }), bad = [], good = [];
  await ctx.addInitScript((t) => { if (!sessionStorage.getItem("xr-staff-session")) sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3600000 })); }, tok);
  const p = await ctx.newPage();
  const watch = (pg) => pg.on("response", (r) => { const u = new URL(r.url()); if (!/^\/api\/(front-office|public\/forms)\//.test(u.pathname)) return; (r.status() >= 400 ? bad : good).push(`${r.request().method()} ${u.pathname} ${r.status()}`); });
  watch(p);
  const shot = (pg, n) => pg.screenshot({ path: `${shots}/${n}.png` });
  const run = Date.now().toString(36);
  // 1. Add a lead: the panel asks the duplicate check (POST duplicates/check) and saves
  await p.goto(`${BASE}/front-office/leads?view=mine`); await p.locator("[data-add-lead-open]").waitFor({ timeout: 30000 });
  await p.locator("[data-add-lead-open]").click(); await p.getByLabel("First name", { exact: true }).waitFor({ timeout: 20000 });
  await p.getByLabel("First name", { exact: true }).fill(`Walkb${run}`); await p.getByLabel("Email", { exact: true }).fill(`walkb.${run}@example.org`); await p.getByLabel("Source", { exact: true }).fill("Walk-in");
  await p.getByLabel("Email", { exact: true }).blur(); await p.waitForTimeout(800);
  await p.getByRole("button", { name: "Save lead" }).click(); await p.getByRole("heading", { level: 1, name: new RegExp(`Walkb${run}`) }).waitFor({ timeout: 20000 });
  log(good.some((x) => /^POST \/api\/front-office\/duplicates\/check 200$/.test(x)), "Add a lead: the duplicate check answers and the lead is saved");
  // 2. The lead's phone: Edit, type a number, Save (PATCH people/:personId { phone })
  await p.locator("[data-phone-edit-open]").click(); await p.locator("[data-phone-edit] input").fill("+1 416 555 0100"); await p.locator("[data-phone-edit]").getByRole("button", { name: "Save" }).click(); await p.waitForTimeout(1200);
  await shot(p, "1-lead-phone-saved");
  log(good.some((x) => /^PATCH \/api\/front-office\/people\/[0-9a-f-]+ 200$/.test(x)), "Phone Edit → Save: the number is kept");
  // 3. Engage as Individual, then the prospect's page: Run a check → No conflict → Save check
  await p.getByRole("button", { name: /^Engage/ }).first().click(); await p.getByRole("button", { name: "Engage as Individual" }).click(); await p.waitForTimeout(1500);
  const pros = await (await fetch(`${BASE}/api/front-office/prospects`, { headers: { authorization: `Bearer ${tok}` } })).json();
  const mine = (pros.prospects ?? pros.items ?? pros).find((x) => JSON.stringify(x).includes(`Walkb${run}`));
  await p.goto(`${BASE}/front-office/prospects/${mine.id}`); const panel = p.locator("[data-conflict-panel]"); await panel.locator("[data-conflict-status]").waitFor({ timeout: 30000 });
  await panel.getByRole("button", { name: "Run a check" }).click(); const drawer = p.getByRole("dialog", { name: "Run a conflict check" });
  await drawer.locator("[data-searched]").waitFor({ timeout: 15000 }); await drawer.getByLabel("No conflict").check(); await shot(p, "2-conflict-check");
  await drawer.getByRole("button", { name: "Save check" }).click(); await p.waitForTimeout(1500); await shot(p, "3-conflict-saved");
  log(good.some((x) => /^POST \/api\/front-office\/conflict-checks\/preview 200$/.test(x)) && good.some((x) => /^POST \/api\/front-office\/conflict-checks 201$/.test(x)), "Conflict check: the preview answers and Save check records it");
  // 4. The pipeline board (GET pipelines/:type/board)
  await p.goto(`${BASE}/front-office/pipeline`); await p.locator("[data-move]").first().waitFor({ timeout: 30000 }); await p.waitForTimeout(800); await shot(p, "4-pipeline");
  log(good.some((x) => /^GET \/api\/front-office\/(pipelines\/[A-Z]+\/board|prospects) 200$/.test(x)), "Pipeline: the board loads");
  // 5. The hosted web form: a visitor sends an enquiry (POST public/forms/:token/submissions)
  if (formToken) {
    const v = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); watch(v);
    await v.goto(`${BASE}/front-office/web-form/${formToken}`); await v.getByLabel("First name").waitFor({ timeout: 30000 });
    await v.getByLabel("First name").fill(`Visitor${run}`); await v.getByLabel("Email", { exact: true }).fill(`visitor.${run}@example.org`); await v.waitForTimeout(2300);
    await v.getByRole("button", { name: "Send my enquiry" }).click(); await v.locator('[data-form-state="thanks"]').waitFor({ timeout: 20000 }); await shot(v, "5-web-form-thanks");
    log(good.some((x) => /^POST \/api\/public\/forms\/[^/]+\/submissions 201$/.test(x)), "Hosted web form: the enquiry is sent and thanked");
  } else log(false, "Hosted web form: no form token given");
  log(bad.length === 0, `no front-office or public form call refused: ${JSON.stringify(bad)}`);
  await b.close();
})().catch((e) => { console.log(`FAIL  ${e.message.split("\n")[0]}`); process.exit(1); });
