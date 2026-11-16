// qa (16 Nov, Majors retest; C6.1, C6.2): QA-427 retest after #1652. The row: the case page's Client questionnaire card
// said "Next: Client A answers on their phone, for everyone travelling. Hand to Client A" on a new case, after Client A
// finished all parts, after the representative approved all filings and after the submission was recorded. Expected, as
// worded: "the card reads the case: 'Client A has answered every part · Next: confirm the answers', then the next case
// step, and nothing after submission." On Demo › Load the finished story (a recorded family case, and a thin case), as
// the case officer, the card read on screen at each stage of a new Visitor visa family case (Client A, spouse 38, child 10;
// Client A's answers typed through the client's own route, as the phone does):
//   1 the thin case (its client owes answers): "Next: <client> answers on their phone", with the hand-off;
//   2 Client A has answered every part: "Client A has answered every part" and "Next: confirm the answers", never
//     "Next: Client A answers" (data: the client's own questionnaire owes 0);
//   3 the officer presses Confirm section on every section with something to confirm (screen): "Next: prepare the forms";
//   4 every filing sent for review (API): no "Next: Client A answers" and no hand-off to Client A;
//   5 the representative approves every filing (API): "Next: Ready to file, then Record the submission";
//   6 the finished story's family case, submission recorded (3 filings submitted; the fourth, split out to file on paper,
//     never sent): never "Next: Client A answers", no hand-off to Client A; its next step is the case's.
// Limit: no case with every filing submitted is reachable here without the validated-PDF and paper path (the story leaves
// one filing out), so "nothing after submission" is read only where part of the case is still to file (step 6).
// Fails on main 3ea36a0d3 (before #1652): steps 2-6 read "Next: Client A answers on their phone". US$0, never :4400.
//   zsh tools/isolated.sh qa_427 4473 start && node tests/qa/check_qa427_client_card.cjs 4473 xr_studio_qa_427 <shots dir> [width]
const fs = require("fs"); const path = require("path"); const { execFileSync } = require("child_process");
const { chromium } = require("../../node_modules/playwright");
const port = process.argv[2], DB = process.argv[3], SHOTS = process.argv[4], W = Number(process.argv[5] ?? 1024);
if (!port || port === "4400" || !/^xr_studio_(?!demo)/.test(DB ?? "")) { console.log("usage: <port of an isolated copy, never 4400> <its database> [shots] [width]"); process.exit(2); }
const base = `http://localhost:${port}`;
const sql = (q) => execFileSync("psql", [`postgresql://xr_studio@127.0.0.1:54329/${DB}`, "-Atc", q], { encoding: "utf8" }).trim();
const call = async (method, p, actor, body) => { const r = await fetch(base + "/api" + p, { method, headers: { "x-actor": actor, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); let b = null; try { b = await r.json(); } catch { /* not JSON */ } return { status: r.status, body: b }; };
let failed = 0, passed = 0; const ok = (name, pass, detail) => { pass ? passed++ : failed++; console.log(`${pass ? "PASS" : "FAIL"} C6.1 QA-427 ${name}${!pass && detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const yearsAgo = (y) => { const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - y); return d.toISOString().slice(0, 10); };
const owes = async (id) => ((await call("GET", `/runtime/cases/${id}/questionnaire`, "user-P")).body?.sections ?? []).reduce((n, s) => n + s.missing.length, 0);

async function clientAnswersAll(id, dobs) {
  for (const [sid, dob] of dobs) await call("PUT", `/runtime/cases/${id}/answers/${sid}/person.date_of_birth`, "user-P", { value: dob, expectedId: null });
  for (let round = 0; round < 5; round++) {
    const v = (await call("GET", `/runtime/cases/${id}/questionnaire`, "user-P")).body;
    for (const s of v?.sections ?? []) {
      for (const q of s.questions) {
        if (q.group || q.answer || q.hidden) continue;
        const val = q.options?.length ? (q.options[0].key ?? q.options[0].code ?? q.options[0].value ?? q.options[0]) : q.value_type === "yes_no" ? false : q.value_type === "date" ? (q.shape?.datePrecision === "month" ? "2015-01" : "2015-01-01") : q.value_type === "number" ? "5"
          : q.value_type === "address" ? { street_name: "Sample Road", city: "Sample City", country: "Canada" } : q.shape?.phone ? { country_code: "1", number: "5550100" } : q.value_type === "country" ? "India" : "SAMPLE";
        await call("PUT", `/runtime/cases/${id}/answers/${q.subjectId}/${q.fact}`, "user-P", { value: val, expectedId: null });
      }
      if (s.group?.required && s.group.rows === 0 && !s.group.none_apply?.value) await call("PUT", `/runtime/cases/${id}/groups/${s.subjectId}/${s.section}/none-apply`, "user-P", { noneApply: true, expectedId: s.group.none_apply?.id ?? null });
    }
    if ((await owes(id)) === 0) break;
  }
}

(async () => {
  if (sql("select count(*) from filing_record") === "0") {
    const r = await call("POST", "/demo/checkpoints/finished-story", "user-A", { confirm: "RESET" });
    for (let i = 0; i < 120 && r.status < 300; i++) { const st = (await call("GET", "/demo/status", "user-A")).body?.story; if (st && st.state !== "running") break; await sleep(5000); }
  }
  const cases = (await call("GET", "/runtime/cases", "user-O")).body?.cases ?? [];
  const thin = cases.find((c) => /THIN/.test(c.reference)), story = cases.find((c) => /FAMILY/.test(c.reference));
  ok("setup: the finished story is loaded (a recorded family case and a thin case)", !!thin && !!story && sql("select count(*) from filing_record") !== "0", cases.map((c) => c.reference));
  const firm = (await call("GET", "/runtime/firm", "user-O")).body;
  const rep = (firm?.users ?? []).find((u) => (u.duties ?? []).includes("represent"))?.id ?? "user-R";
  const b = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : fs.existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
  const ctx = await b.newContext({ viewport: { width: W, height: 1000 }, reducedMotion: "reduce" });
  await ctx.addInitScript(() => { try { localStorage.setItem("xr-actor", "user-O"); } catch { /* ignore */ } });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  const shot = (n) => SHOTS ? p.screenshot({ path: path.join(SHOTS, `qa427-${n}-${W}.png`), fullPage: false }) : null;
  const card = () => p.locator("p.font-medium", { hasText: /^Client questionnaire$/ }).locator("xpath=..");
  const read = async (id) => { await p.goto(`${base}/cases/${id}`); await card().waitFor({ timeout: 60000 }); await card().locator("[data-slot=skeleton]").waitFor({ state: "detached", timeout: 30000 }).catch(() => {}); await p.waitForTimeout(1200); await card().scrollIntoViewIfNeeded().catch(() => {}); return { text: (await card().innerText()).replace(/\s+/g, " "), handoff: await card().getByRole("button", { name: /^Hand to Client/ }).count() }; };

  // 1
  let c = await read(thin.id); await shot("1-thin-case");
  ok(`1 a case whose client owes answers: "${c.text}"`, /Next: Client [A-Z] answers on their phone/.test(c.text) && c.handoff === 1, c);
  // 2
  const ref = `QA427-${Date.now() % 1000000}`;
  const made = await call("POST", "/runtime/cases", "user-O", { combinationId: sql("select id from combination where combination_key='vv.single'"), reference: ref, clientActor: "user-P", principal: { displayName: "Sample Client A" }, representative: rep, caseOfficers: ["user-O"], idempotencyKey: ref });
  const id = made.body?.id, P = made.body?.people?.find((x) => x.role === "principal")?.subject_id;
  const S = (await call("POST", `/runtime/cases/${id}/people`, "user-O", { role: "spouse_or_partner", displayName: "Sample Spouse A" })).body?.subject_id;
  const C = (await call("POST", `/runtime/cases/${id}/people`, "user-O", { role: "child", displayName: "Sample Child A" })).body?.subject_id;
  c = await read(id); await shot("2a-new-case");
  ok(`2 setup: a new family case reads "Next: Client A answers" while Client A owes answers ("${c.text}")`, /Next: Client A answers on their phone/.test(c.text), c);
  await clientAnswersAll(id, [[P, yearsAgo(40)], [S, yearsAgo(38)], [C, yearsAgo(10)]]);
  const left = await owes(id);
  ok("2 setup (data): Client A's own questionnaire owes 0 answers", left === 0, left);
  c = await read(id); await shot("2b-client-done");
  ok(`2 Client A done: "Client A has answered every part" and "Next: confirm the answers" ("${c.text}")`, /Client A has answered every part/.test(c.text) && /Next: confirm the answers/.test(c.text), c);
  ok("2 Client A done: never \"Next: Client A answers\"", !/Next: Client A answers/.test(c.text), c.text);
  // 3
  for (let pass = 0; pass < 4; pass++) {
    const todo = await p.locator("[data-tab]").evaluateAll((els) => els.filter((e) => e.querySelector("[data-tab-to-confirm]")).map((e) => e.getAttribute("data-tab")));
    if (!todo.length) break;
    for (const tab of todo) {
      await p.locator(`[role="tab"][data-tab="${tab}"]`).click(); await p.waitForTimeout(500);
      const secs = p.locator('#agent-view section[aria-labelledby^="h-"]:visible');
      for (let k = 0, n = await secs.count(); k < n; k++) {
        const sec = secs.nth(k); if (/ 0 to confirm/.test(await sec.locator("header").innerText().catch(() => ""))) continue;
        const bt = sec.getByRole("button", { name: "Confirm section" }); if (await bt.isDisabled().catch(() => true)) continue;
        await bt.click(); await p.waitForTimeout(900);
      }
    }
    await p.waitForTimeout(800);
  }
  c = await read(id); await shot("3-confirmed");
  const hh = Number(await p.locator("[data-household-to-confirm]").getAttribute("data-household-to-confirm"));
  ok(`3 every answer confirmed (household ${hh} to confirm): "Next: prepare the forms and send them for review" ("${c.text}")`, hh === 0 && /Next: prepare the forms and send them for review/.test(c.text) && !/Next: Client A answers/.test(c.text), c);
  // 4
  const filings = (await call("GET", `/runtime/cases/${id}/prepare`, "user-O")).body?.filings ?? [];
  const sent = await call("POST", `/runtime/cases/${id}/reviews`, "user-O", { filings: filings.map((f) => f.id) });
  c = await read(id); await shot("4-in-review");
  ok(`4 every filing with the representative (round ${sent.body?.number ?? "?"}): no "Next: Client A answers", no hand-off to Client A ("${c.text}")`, sent.status === 201 && !/Next: Client A answers/.test(c.text) && c.handoff === 0, { status: sent.status, ...c });
  // 5
  const round = sent.body?.id;
  const rows = (await call("GET", `/runtime/reviews/${round}`, rep)).body?.filings ?? [];
  const st = [];
  for (const r of rows) {
    await call("POST", `/runtime/reviews/${round}/open`, rep, { filing: r.filing });
    st.push((await call("POST", `/runtime/reviews/${round}/decision`, rep, { filing: r.filing, verdict: "approve", form_hashes: Object.fromEntries(r.forms.map((x) => [x.item, x.live_hash ?? "waits"])), confirm_unticked: true })).status);
  }
  const statuses = ((await call("GET", `/runtime/reviews/${round}`, rep)).body?.filings ?? []).map((r) => r.status);
  c = await read(id); await shot("5-approved");
  ok(`5 setup: the representative approved every filing (${statuses.join(", ")})`, statuses.length === filings.length && statuses.every((x) => x === "approved"), { st, statuses });
  ok(`5 approved: "Next: Ready to file, then Record the submission" ("${c.text}")`, /Next: Ready to file, then Record the submission/.test(c.text) && !/Next: Client A answers/.test(c.text), c);
  // 6
  const prep6 = (await call("GET", `/runtime/cases/${story.id}/prepare`, "user-O")).body?.filings ?? [];
  c = await read(story.id); await shot("6-story-recorded");
  const sub6 = prep6.filter((f) => String(f.status).toLowerCase() === "submitted").length;
  ok(`6 the finished story's case, ${sub6} of ${prep6.length} filings submitted: never "Next: Client A answers"; the card names the case's own next step (hand-off to Client A shown: ${c.handoff}) ("${c.text}")`, sub6 > 0 && !/Next: Client A answers/.test(c.text) && /Next: (prepare|Ready to file|confirm)|Nothing more is asked/.test(c.text), c);
  ok("no page errors", errs.length === 0, errs.slice(0, 3));
  await b.close(); console.log(`${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})().catch((e) => { console.log("STOP", String(e?.message ?? e).slice(0, 400)); process.exit(1); });
