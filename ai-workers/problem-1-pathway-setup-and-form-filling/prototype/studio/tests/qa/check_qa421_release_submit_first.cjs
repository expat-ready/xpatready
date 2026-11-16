// qa (16 Nov, Majors retest; C5.1): QA-421 retest after #1644. The row, as the Configuration author: after adding a
// document to Visitor visa (not yet submitted), the banner's "Review and release (N)" opened a page whose one button was
// "Hand to the Approver →", the Visitor visa row "Held back: Not submitted for review". Expected, as worded: "while a
// combination of the draft is not submitted, the page's next step is 'Submit Visitor visa for review →' (to its tab), and
// the hand-off waits." Walked through the screens on the configured checkpoint, as the author:
//   setup (scaffolding, P-598 option 1, as the fix's own check does): the configured load's other pending change (the
//   LMIA's) is submitted through the API first, so the Visitor visa is the author's only unsubmitted change;
//   1 Immigration programs › Visitor visa › Documents: "Add a document" (a library type, for the spouse), "Save to draft";
//   2 the banner's "Review and release (N)": the page reads "Next: submit … Visitor visa for review", its one filled
//     button is "Submit Visitor visa for review →", there is no "Hand to the Approver", and the Visitor visa row reads
//     "Not submitted for review" (data: GET /draft holds it back with that reason);
//   3 the Submit link opens the Visitor visa's own Review and release tab, with "Submit for review";
//   4 after "Submit for review" there, back on Review and release: the Submit step is gone and the hand-off is back.
// Fails on main 3ea36a0d3 (before #1644): step 2 shows "Hand to the Approver →" and no Submit. US$0, never :4400.
//   zsh tools/isolated.sh qa_421 4476 start && node tests/qa/check_qa421_release_submit_first.cjs 4476 xr_studio_qa_421 <shots dir> [width]
const fs = require("fs"); const path = require("path"); const { execFileSync } = require("child_process");
const { chromium } = require("../../node_modules/playwright");
const port = process.argv[2], DB = process.argv[3], SHOTS = process.argv[4], W = Number(process.argv[5] ?? 1024);
if (!port || port === "4400" || !/^xr_studio_(?!demo)/.test(DB ?? "")) { console.log("usage: <port of an isolated copy, never 4400> <its database> [shots] [width]"); process.exit(2); }
const base = `http://localhost:${port}`;
const sql = (q) => execFileSync("psql", [`postgresql://xr_studio@127.0.0.1:54329/${DB}`, "-Atc", q], { encoding: "utf8" }).trim();
const call = async (method, p, actor, body) => { const r = await fetch(base + "/api" + p, { method, headers: { "x-actor": actor, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); let b = null; try { b = await r.json(); } catch { /* not JSON */ } return { status: r.status, body: b }; };
let failed = 0, passed = 0; const ok = (name, pass, detail) => { pass ? passed++ : failed++; console.log(`${pass ? "PASS" : "FAIL"} C5.1 QA-421 ${name}${!pass && detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };

(async () => {
  if (sql("select count(*) from config_release r join combination c on c.id=r.combination_id where c.combination_key='vv.single'") === "0") {
    const l = await call("POST", "/demo/load", "user-A", { sample: "configured" }); if (l.status >= 300) { console.log("STOP the configured checkpoint did not load", l.status); process.exit(2); }
  }
  const VV = sql("select id from combination where combination_key='vv.single'");
  const pending = ((await call("GET", "/draft", "user-A")).body?.rows ?? []).filter((r) => r.held && /^Not submitted for review/.test(r.why ?? "") && r.combinationId !== VV);
  for (const r of pending) await call("POST", `/combinations/${r.combinationId}/submit`, "user-A", { note: "qa QA-421 retest setup (P-598): the configured load's pending change, submitted first." });
  const left = ((await call("GET", "/draft", "user-A")).body?.rows ?? []).filter((r) => r.held && /^Not submitted for review/.test(r.why ?? ""));
  ok("setup (P-598): nothing else waits for the author's Submit", left.length === 0, left.map((r) => r.label));

  const b = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : fs.existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
  const ctx = await b.newContext({ viewport: { width: W, height: 1000 }, reducedMotion: "reduce" });
  await ctx.addInitScript(() => { try { localStorage.setItem("xr-actor", "user-A"); } catch { /* ignore */ } });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  const shot = (n) => SHOTS ? p.screenshot({ path: path.join(SHOTS, `qa421-${n}-${W}.png`), fullPage: false }) : null;
  const main = p.locator("main");

  // 1. Documents tab: add a document (a library type), save to draft.
  await p.goto(`${base}/c/${VV}/documents`);
  await p.locator("[data-add-document]").waitFor({ timeout: 60000 });
  await p.locator("[data-add-document]").click();
  const d = p.getByRole("dialog"); await d.getByLabel("Document type", { exact: true }).waitFor({ timeout: 20000 });
  await d.getByLabel("Document type", { exact: true }).locator("option").nth(2).waitFor({ state: "attached", timeout: 20000 });
  const opts = await d.getByLabel("Document type", { exact: true }).locator("option").evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent })));
  const pick = opts.find((o) => /marriage certificate/i.test(o.t)) ?? opts.filter((o) => o.v).slice(-1)[0];
  await d.getByLabel("Document type", { exact: true }).selectOption(pick.v);
  const who = await d.getByLabel("Whose document", { exact: true }).locator("option").evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent })));
  const spouse = who.find((o) => /spouse/i.test(o.t)); if (spouse) await d.getByLabel("Whose document", { exact: true }).selectOption(spouse.v);
  await shot("01-add-document");
  await d.getByRole("button", { name: "Save to draft" }).click();
  await d.waitFor({ state: "detached", timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const row = ((await call("GET", "/draft", "user-A")).body?.rows ?? []).find((r) => r.combinationId === VV);
  ok(`1 setup: the document "${pick?.t}" is saved to the Visitor visa's draft, held back as not submitted`, !!row?.held && /^Not submitted for review/.test(row?.why ?? ""), { dialogOpen: await d.count(), row: row && { held: row.held, why: row.why } });
  await shot("02-document-saved");

  // 2. The banner's Review and release (N).
  const banner = p.getByRole("link", { name: /^Review and release \(\d+\)$/ }).first();
  const bannerText = await banner.innerText().catch(() => "");
  await banner.click(); await p.waitForURL(/\/release$/, { timeout: 20000 });
  await p.getByRole("heading", { name: "Review and release", level: 1 }).waitFor({ timeout: 30000 }); await p.locator("main table").first().waitFor({ timeout: 30000 }); await p.waitForTimeout(800);
  const t = (await main.innerText()).replace(/\s+/g, " ");
  ok(`2 the banner "${bannerText}" opens Review and release`, /\/release$/.test(p.url()));
  ok("2 the page's next step reads \"Next: submit … Visitor visa for review\"", /Next: submit [^.]*Visitor visa for review/.test(t), t.slice(0, 400));
  const link = main.getByRole("link", { name: "Submit Visitor visa for review →", exact: true });
  ok("2 the step's button is \"Submit Visitor visa for review →\"", (await link.count()) === 1, await main.getByRole("link").allInnerTexts());
  ok("2 the hand-off waits: no \"Hand to the Approver\" on the page", !/Hand to the Approver/.test(t) && (await p.locator('[data-handoff="approver"]').count()) === 0, (t.match(/Hand to [^→]*→/g) ?? []));
  const filled = await main.locator('[data-slot="button"]').evaluateAll((els) => els.filter((e) => /(^|\s)bg-primary(\s|$)/.test(e.className) && !e.disabled && e.getAttribute("aria-disabled") !== "true").map((e) => e.textContent.trim()));
  ok("2 one filled button on the page, the Submit", filled.length === 1 && filled[0] === "Submit Visitor visa for review →", filled);
  const vvRow = (await main.locator("table tr", { hasText: "Visitor visa" }).first().innerText().catch(() => "")).replace(/\s+/g, " ");
  ok("2 the Visitor visa row reads \"Not submitted for review\"", /Not submitted for review/.test(vvRow), vvRow);
  await shot("03-release-page");

  // 3. The Submit link opens its tab.
  await link.click().catch(() => {});
  await p.waitForURL((u) => u.pathname === `/c/${VV}/review`, { timeout: 15000 }).catch(() => {});
  const submit = p.getByRole("button", { name: "Submit for review", exact: true });
  const there = await submit.waitFor({ timeout: 30000 }).then(() => true, () => false);
  ok("3 Submit opens the Visitor visa's own Review and release tab, with \"Submit for review\"", new URL(p.url()).pathname === `/c/${VV}/review` && there, p.url());
  await shot("04-vv-review-tab");

  // 4. Submitted: the hand-off comes back.
  if (there) { await submit.click(); await p.locator('[data-handoff="content-reviewer"]').waitFor({ timeout: 30000 }).catch(() => {}); }
  await p.goto(`${base}/release`); await p.locator("main table").first().waitFor({ timeout: 30000 }); await p.waitForTimeout(1200);
  const t4 = (await main.innerText()).replace(/\s+/g, " ");
  ok("4 after Submit for review: no Submit step, and the hand-off to the Approver is back", (await p.locator('[data-next-step="submit"]').count()) === 0 && /Hand to the Approver/.test(t4), t4.slice(0, 300));
  const row4 = ((await call("GET", "/draft", "user-A")).body?.rows ?? []).find((r) => r.combinationId === VV);
  ok("4 (data): the Visitor visa is no longer \"Not submitted for review\"", !/^Not submitted for review/.test(row4?.why ?? ""), row4?.why);
  await shot("05-release-after-submit");
  ok("no page errors", errs.length === 0, errs.slice(0, 3));
  await b.close(); console.log(`${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})().catch((e) => { console.log("STOP", String(e?.message ?? e).slice(0, 400)); process.exit(1); });
