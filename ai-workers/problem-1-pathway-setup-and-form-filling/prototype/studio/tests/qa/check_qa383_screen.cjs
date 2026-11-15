// qa (15 Nov, capability old-majors; QA-383 by screens, gate A P-348 (3)): on a With an LMIA case of the configured
// checkpoint, the client opens their questionnaire and finds "Country or territory where the person currently resides".
// Fails while the screen offers a choice worded with the map note's lead-in "only option:"; passes when it reads "Canada".
// The case is opened by route (the officer's step, not under test). US$0, live AI off.
//   zsh tools/isolated.sh qa_383s 4477 start && node tests/qa/check_qa383_screen.cjs 4477 xr_studio_qa_383s <screenshot dir>
const { chromium } = require("playwright");
const { execFileSync } = require("node:child_process");
const port = Number(process.argv[2] ?? 4477), db = process.argv[3] ?? "xr_studio_qa_383s", base = `http://localhost:${port}`, shots = process.argv[4] ?? ".";
const sql = (q) => execFileSync("psql", [`postgresql://xr_studio@127.0.0.1:54329/${db}`, "-Atc", q], { encoding: "utf8" }).trim();
const LABEL = "Country or territory where the person currently resides";
const api = (method, path, body, actor) => fetch(`${base}/api${path}`, { method, headers: { "content-type": "application/json", "x-actor": actor }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
let failed = 0; const ok = (name, pass, d) => { if (!pass) failed++; console.log(`${pass ? "PASS" : "FAIL"} ${name}${d ? " — " + JSON.stringify(d) : ""}`); };
(async () => {
  const comboId = () => sql("select id from combination where combination_key='wp.lmia_inside'");
  if (!comboId()) await api("POST", "/demo/load", { sample: "configured" }, "user-A");
  ok("QA-383s setup: With an LMIA is on the configured checkpoint", !!comboId());
  const opened = await api("POST", "/runtime/cases", { combinationId: comboId(), reference: `QA383S-${Date.now().toString(36)}`, clientActor: "user-P", principal: { displayName: "Sample Client A" } }, "user-O");
  ok("QA-383s setup: a case opens", opened.status === 201, { status: opened.status });
  const b = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : require("node:fs").statSync("/opt/pw-browsers/chromium", { throwIfNoEntry: false })?.isFile() ? { executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] } : {}) });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } }); await ctx.addInitScript(() => localStorage.setItem("xr-actor", "user-P"));
  const p = await ctx.newPage();
  await p.goto(`${base}/cases/${opened.body.id}/questionnaire`); await p.waitForLoadState("networkidle");
  await p.screenshot({ path: `${shots}/qa383-start.png`, fullPage: true });
  if (process.env.QA_DEBUG) console.log("BUTTONS", JSON.stringify(await p.getByRole("button").allInnerTexts()), "LINKS", JSON.stringify(await p.getByRole("link").allInnerTexts()));
  const q = p.getByText(LABEL, { exact: false }).first();
  // A person opens the sections from the list one by one (back to the list each time) until the question shows.
  const url = p.url(), sections = (await p.getByRole("button").allInnerTexts()).filter((t) => t.includes("\n"));
  for (let i = 0; i < sections.length && !(await q.isVisible().catch(() => false)); i++) {
    await p.goto(url); await p.waitForLoadState("networkidle");
    const all = await p.getByRole("button").allInnerTexts(), at = all.findIndex((t, k) => t === sections[i] && all.slice(0, k).filter((x) => x === sections[i]).length === sections.slice(0, i).filter((x) => x === sections[i]).length);
    await p.getByRole("button").nth(at).click().catch(() => {});
    await p.waitForURL(/part=/, { timeout: 5000 }).catch(() => {}); await p.waitForLoadState("networkidle");
    await q.waitFor({ state: "visible", timeout: 3000 }).catch(() => {}); // the part's questions render after its data loads
    if (process.env.QA_DEBUG) await p.screenshot({ path: `${shots}/qa383-part-${i}.png`, fullPage: true });
    if (process.env.QA_DEBUG) console.log("SECTION", i, sections[i].split("\n")[0], "→", p.url().slice(-40), JSON.stringify(((await p.locator("main").innerText().catch(() => "")).match(/[^\n]*(resid|country)[^\n]*/gi) ?? []).slice(0, 6)));
    await p.waitForLoadState("networkidle");
  }
  const seen = await q.isVisible().catch(() => false);
  ok("QA-383s: the client reaches the question by screens", seen);
  if (seen) {
    await q.scrollIntoViewIfNeeded();
    const box = q.locator("xpath=ancestor::*[self::fieldset or self::div][.//select or .//input[@type='radio'] or .//*[@role='combobox' or @role='radio']][1]");
    const text = (await box.innerText().catch(() => "")) + " " + (await box.locator("option").allInnerTexts().catch(() => [])).join(" | ");
    ok("QA-383s: the question's answer box is found (a list or choices), so the next step asserts something", (await box.count()) > 0);
    const sel = box.locator("select").first();
    if (await sel.count()) await sel.selectOption({ index: 1 }).catch(() => {}); // the one choice offered, as a person picks it
    await (await box.count() ? box : q).screenshot({ path: `${shots}/qa383-question.png` });
    await p.screenshot({ path: `${shots}/qa383-page.png` });
    ok('QA-383s fail (C6.19): no choice on screen reads "only option:"', !/only option/i.test(text), { text: text.replace(/\s+/g, " ").slice(0, 300) });
  }
  await b.close(); process.exitCode = failed ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
