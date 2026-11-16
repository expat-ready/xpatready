// qa (16 Nov, Majors retest; C6.2, C4.9): QA-439 retest after #1643. The row's Expected, as worded: "order each person's
// Personal details first and each gate question before its details, so the conditions that exist drop the parts". What
// a person sees as Client A in the client's questionnaire (both families, on the configured checkpoint), the case opened
// by the case officer through the product's route (people added as the officer, nothing answered):
//   1 each person's list on the overview starts with "Personal details" (the row: it came after Employment, Military
//     service, Government positions and the common-law declaration; for the 0-4 child it was the child's last part);
//   2 the child's Personal details (date of birth 2024, marital status Single) typed on screen drops Military service,
//     Government positions, Statutory declaration of common-law union and the common-law evidence (Other documentary
//     evidence) from the child's list (screen, and the client's view underneath);
//   3 inside a part, each gate question comes before its details (the row's three examples, and the marital status
//     before the marriage date): "Purpose of the visit" before "…when it is 'other'"; "Whether the case is a request …"
//     before "The type of IRCC document"; "Who will pay" before "Details of who pays expenses when not self or parents";
//     "Current marital status" before "Date the person married …";
//   4 Study permit, Client A alone (an adult): the minor's "Custodianship declaration" is not asked before Client A's
//     Personal details (absent, or after it: that part holds the date of birth and its gate, "Whether the person is 17
//     years of age or less and comes to Canada to study without an accompanying parent", IMM 5646's condition in the
//     release); once the adult date of birth is typed and that gate answered No on screen, it is gone.
// Fails on main 3ea36a0d3 (before #1643: Personal details last). US$0, live AI off, never :4400.
//   zsh tools/isolated.sh qa_439 4475 start && node tests/qa/check_qa439_deciders_first.cjs 4475 xr_studio_qa_439 <shots dir> [width]
const fs = require("fs"); const path = require("path"); const { execFileSync } = require("child_process");
const { chromium } = require("../../node_modules/playwright");
const port = process.argv[2], DB = process.argv[3], SHOTS = process.argv[4], W = Number(process.argv[5] ?? 1024);
if (!port || port === "4400" || !/^xr_studio_(?!demo)/.test(DB ?? "")) { console.log("usage: <port of an isolated copy, never 4400> <its database> [shots] [width]"); process.exit(2); }
const base = `http://localhost:${port}`;
const sql = (q) => execFileSync("psql", [`postgresql://xr_studio@127.0.0.1:54329/${DB}`, "-Atc", q], { encoding: "utf8" }).trim();
const call = async (method, p, actor, body) => { const r = await fetch(base + "/api" + p, { method, headers: { "x-actor": actor, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); let b = null; try { b = await r.json(); } catch { /* not JSON */ } return { status: r.status, body: b }; };
let failed = 0, passed = 0; const ok = (name, pass, detail) => { pass ? passed++ : failed++; console.log(`${pass ? "PASS" : "FAIL"} C6.2 QA-439 ${name}${!pass && detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const before = (text, a, b) => { const i = text.indexOf(a), j = text.indexOf(b); return { a: i, b: j, ok: j < 0 || (i >= 0 && i < j) }; };

(async () => {
  if (sql("select count(*) from config_release r join combination c on c.id=r.combination_id where c.combination_key in ('vv.single','sp.outside')") < "2") {
    const l = await call("POST", "/demo/load", "user-A", { sample: "configured" }); if (l.status >= 300) { console.log("STOP the configured checkpoint did not load", l.status); process.exit(2); }
  }
  const combo = (k) => sql(`select id from combination where combination_key='${k}'`);
  const open = async (key, family) => {
    const ref = `QA439-${key}-${Date.now() % 1000000}`;
    const made = await call("POST", "/runtime/cases", "user-O", { combinationId: combo(key), reference: ref, clientActor: "user-P", principal: { displayName: "Sample Principal Q" }, idempotencyKey: ref });
    const ids = { principal: made.body?.people?.find((x) => x.role === "principal")?.subject_id };
    for (const [role, name] of family) { const a = await call("POST", `/runtime/cases/${made.body?.id}/people`, "user-O", { role, displayName: name }); ids[role] = a.body?.subject_id; }
    return { id: made.body?.id, ids };
  };
  const b = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : fs.existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
  const ctx = await b.newContext({ viewport: { width: W, height: 1000 }, reducedMotion: "reduce" });
  await ctx.addInitScript(() => { try { localStorage.setItem("xr-actor", "user-P"); } catch { /* ignore */ } });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  const shot = (n) => SHOTS ? p.screenshot({ path: path.join(SHOTS, `qa439-${n}-${W}.png`), fullPage: false }) : null;
  const overview = async (id) => { await p.goto(`${base}/cases/${id}/questionnaire`); await p.getByText(/parts done/).waitFor({ timeout: 60000 }); };
  const listOf = (sid) => p.locator(`main section[aria-labelledby='p-${sid}'] li button > span:first-child`).allInnerTexts();
  const openPart = async (sid, title) => { await p.locator(`main section[aria-labelledby='p-${sid}'] li button`, { hasText: title }).first().click(); await p.locator("main").getByText(/^Part \d+ of \d+ · /).first().waitFor({ timeout: 20000 }); await p.waitForTimeout(400); return (await p.locator("main").innerText()); };
  const partOrder = async (id, sid, title, a, bb, label, n) => {
    await overview(id); const t = await openPart(sid, title); const r = before(t, a, bb);
    ok(`3 ${label}: in "${title}", "${a.slice(0, 50)}" comes before "${bb.slice(0, 60)}" (or the detail is not shown)`, r.ok, { gateAt: r.a, detailAt: r.b }); await shot(n);
  };

  // Visitor visa family: principal, spouse, child.
  const vv = await open("vv.single", [["spouse_or_partner", "Sample Spouse Q"], ["child", "Sample Child Q"]]);
  ok("setup: a Visitor visa family case opens (principal, spouse, child)", !!vv.id && !!vv.ids.child && !!vv.ids.spouse_or_partner, vv);
  await overview(vv.id); await shot("01-vv-overview");
  for (const [role, who] of [["principal", "Client A (the principal)"], ["spouse_or_partner", "the spouse"], ["child", "the child"]]) {
    const l = await listOf(vv.ids[role]);
    ok(`1 Visitor visa: ${who}'s list on the overview starts with "Personal details"`, l[0] === "Personal details", { first: l.slice(0, 4), at: l.indexOf("Personal details") + 1, of: l.length });
  }
  const childBefore = await listOf(vv.ids.child);
  const LIFE = ["Military service", "Government positions", "Statutory declaration of common-law union", "Other documentary evidence"];
  ok("2 Visitor visa, setup: before the child's date of birth, the child's list holds the adult-life parts", LIFE.every((x) => childBefore.includes(x)), childBefore);
  // 2: the child's Personal details typed on screen.
  let t = await openPart(vv.ids.child, "Personal details");
  const dob = p.locator("main fieldset", { hasText: /^Date of birth/ }).first();
  await dob.getByLabel("Day").fill("10"); await dob.getByLabel("Month").fill("03"); await dob.getByLabel("Year").fill("2024");
  await p.locator("main").getByLabel("Current marital status").selectOption({ label: "Single" });
  await shot("02-vv-child-personal");
  await p.locator("main").getByRole("button", { name: "Save and come back later" }).click(); await p.waitForTimeout(2500);
  await overview(vv.id); const childAfter = await listOf(vv.ids.child); await shot("03-vv-overview-after-child");
  ok("2 Visitor visa: with the child born 2024 and Single, Military service, Government positions, the common-law declaration and its evidence are gone from the child's list", LIFE.every((x) => !childAfter.includes(x)), { left: LIFE.filter((x) => childAfter.includes(x)), parts: childAfter.length });
  const cv = (await call("GET", `/runtime/cases/${vv.id}/questionnaire`, "user-P")).body;
  const apiChild = (cv?.sections ?? []).filter((s) => s.subjectId === vv.ids.child).map((s) => s.title);
  const ans = (cv?.sections ?? []).filter((s) => s.subjectId === vv.ids.child).flatMap((s) => s.questions).find((q) => q.fact === "person.date_of_birth")?.answer?.value;
  ok("2 Visitor visa (data): the client's view stores the child's date of birth 2024-03-10 and lists none of those parts for the child", String(ans ?? "").startsWith("2024-03-10") && LIFE.every((x) => !apiChild.includes(x)), { dob: ans, left: LIFE.filter((x) => apiChild.includes(x)) });
  // 3: inside parts.
  const app = cv?.case?.people?.find((x) => x.role === "case")?.subject_id;
  await partOrder(vv.id, app, "Details of visit to Canada", "Purpose of the visit to Canada", "Description of the visit purpose when it is 'other'", "Visitor visa", "04-vv-visit");
  await partOrder(vv.id, app, "Request for a change of sex or gender identifier", "Whether the case is a request to change", "The type of IRCC document", "Visitor visa", "05-vv-sex-request");
  await partOrder(vv.id, vv.ids.principal, "Personal details", "Current marital status", "Date the person married or began the common-law relationship", "Visitor visa (the principal)", "06-vv-principal-personal");

  // Study permit family: principal, spouse, child.
  const sp = await open("sp.outside", [["spouse_or_partner", "Sample Spouse Q"], ["child", "Sample Child Q"]]);
  ok("setup: a Study permit family case opens (principal, spouse, child)", !!sp.id && !!sp.ids.child, sp);
  await overview(sp.id); await shot("07-sp-overview");
  for (const [role, who] of [["principal", "Client A (the principal)"], ["spouse_or_partner", "the spouse"], ["child", "the child"]]) {
    const l = await listOf(sp.ids[role]);
    ok(`1 Study permit: ${who}'s list on the overview starts with "Personal details"`, l[0] === "Personal details", { first: l.slice(0, 4), at: l.indexOf("Personal details") + 1, of: l.length });
  }
  const spApp = (await call("GET", `/runtime/cases/${sp.id}/questionnaire`, "user-P")).body?.case?.people?.find((x) => x.role === "case")?.subject_id;
  await partOrder(sp.id, spApp, "Details of intended study in Canada", "Who will pay the expenses in Canada", "Details of who pays expenses when not self or parents", "Study permit", "08-sp-study");

  // 4: Study permit, Client A alone (an adult).
  const one = await open("sp.outside", []);
  await overview(one.id); await shot("09-sp-alone-overview");
  const all = await p.locator("main section[aria-labelledby^='p-'] li button > span:first-child").allInnerTexts();
  const sections = await p.locator("main section[aria-labelledby^='p-']").evaluateAll((es) => es.map((e) => e.getAttribute("aria-labelledby")));
  const flat = []; for (const s of sections) for (const x of await p.locator(`main section[aria-labelledby='${s}'] li button > span:first-child`).allInnerTexts()) flat.push(`${s === `p-${one.ids.principal}` ? "P" : "A"}|${x}`);
  const cust = flat.indexOf("A|Custodianship declaration"), pd = flat.indexOf("P|Personal details");
  ok("4 Study permit, Client A alone: the minor's \"Custodianship declaration\" is not asked before Client A's Personal details (date of birth)", cust < 0 || (pd >= 0 && pd < cust), { custodianshipPart: cust + 1, personalDetailsPart: pd + 1, of: all.length });
  t = await openPart(one.ids.principal, "Personal details");
  const dob2 = p.locator("main fieldset", { hasText: /^Date of birth/ }).first();
  await dob2.getByLabel("Day").fill("10"); await dob2.getByLabel("Month").fill("03"); await dob2.getByLabel("Year").fill("1990");
  await p.locator("main fieldset", { hasText: /^Whether the person is 17 years of age or less/ }).first().getByRole("radio", { name: "No", exact: true }).check();
  await shot("10a-sp-alone-personal");
  await p.locator("main").getByRole("button", { name: "Save and come back later" }).click(); await p.waitForTimeout(2500);
  await overview(one.id); const after = await p.locator("main section[aria-labelledby^='p-'] li button > span:first-child").allInnerTexts(); await shot("10-sp-alone-after-dob");
  ok("4 Study permit, Client A alone: with an adult date of birth (1990) typed and the minor question answered No, \"Custodianship declaration\" is gone", !after.includes("Custodianship declaration"), { parts: after.length });
  ok("no page errors", errs.length === 0, errs.slice(0, 3));
  await b.close(); console.log(`${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})().catch((e) => { console.log("STOP", String(e?.message ?? e).slice(0, 400)); process.exit(1); });
