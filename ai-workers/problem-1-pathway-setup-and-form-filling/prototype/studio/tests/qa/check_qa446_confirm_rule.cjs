// qa (16 Nov, Majors retest; C6.3, C8.3): QA-446 retest after #1678. Walk 1: the officer was told there was nothing to
// confirm for the principal and the child, but the representative's checklist then said their values were not
// confirmed ("Values confirmed: 1 fact" / "none yet"); Confirm section on a "0 to confirm" section confirmed one answer;
// the Study permit child counted "to confirm" where the Visitor visa child did not; the spouse's 61 confirmed answers
// read "54 facts". Expected, as worded: "one rule on both screens (either the client's own and a minor's answers need the
// officer's confirmation and are counted 'to confirm', or they do not and the checklist says so), and Confirm section
// disabled or explained at 0." On the configured checkpoint, for a Visitor visa family and a Study permit family (Client A
// the principal, an adult spouse, a child aged 10), opened by the case officer with the firm's representative; Client A
// types every answer through the client's own route (dates of birth first, as the client's phone does). Then on screen:
//   1 the officer's case page: the principal's and the child's tabs carry no "to confirm", the spouse's does, and the
//     household line = the sum of the tabs (and = the Agent view's data underneath), on both pathways (one rule);
//   2 a principal's section reading "0 to confirm": Confirm section is disabled or explained (its words beside it, or
//     the reply), it confirms nothing (data: 0), the section still reads "0 to confirm" and its answers stay "Declared";
//   3 the officer presses Confirm section on every section with something to confirm (the spouse's tab and the parents'
//     tabs: their answers, typed by Client A for adults, are "to confirm" by the same rule): household "0 to confirm";
//   4 every filing sent for review (round 1); the representative's review screen: the principal's and the child's
//     filings say "declared by Client A" and "0 to confirm", never "none yet" or "not confirmed"; the spouse's says
//     "confirmed by" and "0 to confirm"; each line adds up (facts = declared + confirmed + to confirm); the spouse's
//     "confirmed by" count = the answers the officer confirmed on the spouse's tab and the spouse's relatives' tabs.
// Fails on main b26ad9430 (before #1678): step 4 reads "Values confirmed: none yet" / "1 fact" and step 2 confirms one.
// US$0, live AI off, never :4400.
//   zsh tools/isolated.sh qa_446 4477 start && node tests/qa/check_qa446_confirm_rule.cjs 4477 xr_studio_qa_446 <shots dir> [width]
const fs = require("fs"); const path = require("path"); const { execFileSync } = require("child_process");
const { chromium } = require("../../node_modules/playwright");
const port = process.argv[2], DB = process.argv[3], SHOTS = process.argv[4], W = Number(process.argv[5] ?? 1024);
if (!port || port === "4400" || !/^xr_studio_(?!demo)/.test(DB ?? "")) { console.log("usage: <port of an isolated copy, never 4400> <its database> [shots] [width]"); process.exit(2); }
const base = `http://localhost:${port}`;
const sql = (q) => execFileSync("psql", [`postgresql://xr_studio@127.0.0.1:54329/${DB}`, "-Atc", q], { encoding: "utf8" }).trim();
const call = async (method, p, actor, body) => { const r = await fetch(base + "/api" + p, { method, headers: { "x-actor": actor, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); let b = null; try { b = await r.json(); } catch { /* not JSON */ } return { status: r.status, body: b }; };
let failed = 0, passed = 0; const ok = (name, pass, detail) => { pass ? passed++ : failed++; console.log(`${pass ? "PASS" : "FAIL"} C6.3 C8.3 QA-446 ${name}${!pass && detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const yearsAgo = (y) => { const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - y); return d.toISOString().slice(0, 10); };

async function clientAnswersAll(caseId, dobs) {
  for (const [sid, dob] of dobs) await call("PUT", `/runtime/cases/${caseId}/answers/${sid}/person.date_of_birth`, "user-P", { value: dob, expectedId: null });
  let n = 0;
  for (let round = 0; round < 3; round++) {
    const cv = (await call("GET", `/runtime/cases/${caseId}/questionnaire?mode=sqr`, "user-P")).body;
    let more = 0;
    for (const s of cv?.sections ?? []) for (const q of s.questions ?? []) {
      if (q.hidden || q.group || q.answer) continue;
      const v = q.options?.length ? (q.options[0].key ?? q.options[0].code ?? q.options[0].value ?? q.options[0]) : q.value_type === "yes_no" ? false : q.value_type === "date" ? (q.shape?.datePrecision === "month" ? "2015-01" : "2015-01-01") : q.value_type === "number" ? "5"
        : q.value_type === "address" ? { street_name: "Sample Road", city: "Sample City", country: "Canada" } : q.shape?.phone ? { country_code: "1", number: "5550100" } : q.value_type === "country" ? "India" : "SAMPLE";
      if ((await call("PUT", `/runtime/cases/${caseId}/answers/${q.subjectId}/${q.fact}`, "user-P", { value: v, expectedId: null })).status < 300) { n++; more++; }
    }
    if (!more) break;
  }
  return n;
}

(async () => {
  if (sql("select count(*) from config_release r join combination c on c.id=r.combination_id where c.combination_key in ('vv.single','sp.outside')") < "2") {
    const l = await call("POST", "/demo/load", "user-A", { sample: "configured" }); if (l.status >= 300) { console.log("STOP the configured checkpoint did not load", l.status); process.exit(2); }
  }
  const firm = (await call("GET", "/runtime/firm", "user-O")).body;
  const rep = (firm?.users ?? []).find((u) => (u.duties ?? []).includes("represent"))?.id ?? "user-R";
  const b = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : fs.existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
  const errs = [];
  for (const [key, fam] of [["vv.single", "Visitor visa"], ["sp.outside", "Study permit"]]) {
    const ref = `QA446-${key}-${Date.now() % 1000000}`;
    const made = await call("POST", "/runtime/cases", "user-O", { combinationId: sql(`select id from combination where combination_key='${key}'`), reference: ref, clientActor: "user-P", principal: { displayName: "Sample Client A" }, representative: rep, caseOfficers: ["user-O"], idempotencyKey: ref });
    const id = made.body?.id; const P = made.body?.people?.find((x) => x.role === "principal")?.subject_id;
    const S = (await call("POST", `/runtime/cases/${id}/people`, "user-O", { role: "spouse_or_partner", displayName: "Sample Spouse A" })).body?.subject_id;
    const C = (await call("POST", `/runtime/cases/${id}/people`, "user-O", { role: "child", displayName: "Sample Child A" })).body?.subject_id;
    const n = await clientAnswersAll(id, [[P, yearsAgo(40)], [S, yearsAgo(38)], [C, yearsAgo(10)]]);
    ok(`${fam} setup: a family case (Client A, spouse 38, child 10) with Client A's answers (${n})`, !!id && !!S && !!C && n > 100, { status: made.status, n });
    const ctx = await b.newContext({ viewport: { width: W, height: 1000 }, reducedMotion: "reduce" });
    await ctx.addInitScript(() => { try { if (!sessionStorage.getItem("qa446")) { localStorage.setItem("xr-actor", "user-O"); sessionStorage.setItem("qa446", "1"); } } catch { /* ignore */ } });
    const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message));
    const shot = (nm) => SHOTS ? p.screenshot({ path: path.join(SHOTS, `qa446-${key}-${nm}-${W}.png`), fullPage: false }) : null;
    const counts = async () => { await p.goto(`${base}/cases/${id}`); const hh = p.locator("[data-household-to-confirm]"); await hh.waitFor({ timeout: 60000 }); await p.locator("[data-tab]").first().waitFor({ timeout: 60000 }); await p.waitForTimeout(500);
      const tabs = Object.fromEntries(await p.locator("[data-tab]").evaluateAll((els) => els.map((e) => [e.getAttribute("data-tab"), Number(e.querySelector("[data-tab-to-confirm]")?.getAttribute("data-tab-to-confirm") ?? "0")])));
      return { household: Number(await hh.getAttribute("data-household-to-confirm")), tabs, line: (await hh.locator("xpath=..").innerText()).replace(/\s+/g, " ") }; };
    // 1
    const c1 = await counts(); await shot("1-case-page");
    const agent = (await call("GET", `/runtime/cases/${id}/questionnaire?mode=agent`, "user-O")).body;
    const apiHH = agent.summary.answered - agent.summary.confirmed;
    const sum = Object.values(c1.tabs).reduce((a, x) => a + x, 0);
    ok(`${fam} 1 the principal's and the child's tabs show nothing to confirm; the spouse's shows some`, (c1.tabs[P] ?? 0) === 0 && (c1.tabs[C] ?? 0) === 0 && (c1.tabs[S] ?? 0) > 0, { principal: c1.tabs[P], child: c1.tabs[C], spouse: c1.tabs[S] });
    ok(`${fam} 1 the household line ("${c1.line.match(/\d+ to confirm/)?.[0]}") = the sum of the tabs = the Agent view underneath`, c1.household === sum && sum === apiHH, { household: c1.household, tabs: sum, api: apiHH });
    // 2
    await p.locator(`[role="tab"][data-tab="${P}"]`).click(); await p.waitForTimeout(500);
    const zero = p.locator('#agent-view section[aria-labelledby^="h-"]:visible').filter({ hasText: / 0 to confirm/ }).filter({ hasText: "Declared" }).first();
    const zeroTitle = await zero.locator("h2").innerText().catch(() => "");
    const btn = zero.getByRole("button", { name: "Confirm section" });
    const disabled = await btn.isDisabled().catch(() => null);
    const beside = (await zero.locator("header").innerText().catch(() => "")).replace(/\s+/g, " ");
    let reply = null, toast = "";
    if (disabled === false) {
      const rq = p.waitForResponse((r) => /\/sections\/[^/]+\/confirm$/.test(r.url()) && r.request().method() === "POST", { timeout: 20000 }).then((x) => x.json()).catch(() => null);
      await btn.click(); reply = await rq;
      toast = await p.getByText(/: (nothing to confirm|\d+ answers? confirmed)/).last().innerText({ timeout: 10000 }).catch(() => "");
    }
    await p.waitForTimeout(800);
    const after = (await zero.locator("header").innerText().catch(() => "")).replace(/\s+/g, " ");
    const stillDeclared = await zero.getByText("Declared", { exact: true }).first().isVisible().catch(() => false);
    const confirmedMarks = await zero.getByText("Confirmed", { exact: true }).count();
    ok(`${fam} 2 on "${zeroTitle}" (0 to confirm), Confirm section is disabled or explained (disabled: ${disabled})`, disabled === true || /nothing to confirm/i.test(`${beside} ${toast}`), { disabled, beside, toast });
    ok(`${fam} 2 it confirms nothing: the section still reads "0 to confirm", its answers stay Declared (none marked Confirmed), the reply confirmed 0`, / 0 to confirm/.test(after) && stillDeclared && confirmedMarks === 0 && (reply === null || reply.confirmed === 0), { after, stillDeclared, confirmedMarks, reply: reply && { confirmed: reply.confirmed } });
    await shot("2-zero-section");
    // 3: every tab with something to confirm (the spouse's, and the relatives' tabs: parents typed by Client A are adults).
    for (let pass = 0; pass < 4; pass++) {
      const todo = await p.locator("[data-tab]").evaluateAll((els) => els.filter((e) => e.querySelector("[data-tab-to-confirm]")).map((e) => e.getAttribute("data-tab")));
      if (!todo.length) break;
      for (const tab of todo) {
        await p.locator(`[role="tab"][data-tab="${tab}"]`).click(); await p.waitForTimeout(500);
        const secs = p.locator('#agent-view section[aria-labelledby^="h-"]:visible');
        for (let k = 0, n = await secs.count(); k < n; k++) {
          const sec = secs.nth(k); const head = await sec.locator("header").innerText().catch(() => "");
          if (/ 0 to confirm/.test(head)) continue;
          const bt = sec.getByRole("button", { name: "Confirm section" }); if (await bt.isDisabled().catch(() => true)) continue;
          await bt.click(); await p.waitForTimeout(900);
        }
      }
      await p.waitForTimeout(800);
    }
    const c3 = await counts(); await shot("3-after-confirm");
    ok(`${fam} 3 after Confirm section on every section with something to confirm (the spouse's and the relatives' tabs), the household reads "0 to confirm"`, c3.household === 0, { household: c3.household, tabs: c3.tabs });
    // 4
    const prep = (await call("GET", `/runtime/cases/${id}/prepare`, "user-O")).body;
    const filings = prep?.filings ?? [];
    const sent = await call("POST", `/runtime/cases/${id}/reviews`, "user-O", { filings: filings.map((f) => f.id) });
    const round = sent.body?.id;
    const ctxR = await b.newContext({ viewport: { width: W, height: 1000 } }); await ctxR.addInitScript((a) => { try { localStorage.setItem("xr-actor", a); } catch { /* ignore */ } }, rep);
    const r = await ctxR.newPage(); r.on("pageerror", (e) => errs.push(e.message));
    await r.goto(`${base}/cases/${id}/representative-review/${round}`);
    const items = r.locator('[data-check="confirmations"]'); await items.first().waitFor({ timeout: 60000 }).catch(() => {});
    await items.first().scrollIntoViewIfNeeded().catch(() => {});
    if (SHOTS) await r.screenshot({ path: path.join(SHOTS, `qa446-${key}-4-rep-review-${W}.png`) });
    const words = (await items.allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
    // Which line is whose: the round's own rows (API), each filing's wording, which must be on the screen as shown.
    const rows = (await call("GET", `/runtime/reviews/${round}`, rep)).body?.filings ?? [];
    const wordingOf = (fid) => rows.find((x) => x.filing === fid)?.checks?.find((k) => k.key === "confirmations")?.wording ?? "";
    const of = (sid) => { const f = filings.find((x) => (x.applicants ?? []).some((a) => a.subject === sid)); const api = wordingOf(f?.id); return { f, w: words.find((x) => api && x.includes(api)) ?? `(not on screen; API: ${api})` }; };
    const nums = (w) => { const facts = Number(/(\d+) facts?/.exec(w)?.[1] ?? NaN); const parts = [...w.matchAll(/(\d+) (declared|confirmed) by/g)].reduce((a, m) => a + Number(m[1]), 0) + Number(/(\d+) to confirm/.exec(w)?.[1] ?? 0) + Number(/(\d+) waits? for the client/.exec(w)?.[1] ?? 0); return { facts, parts }; };
    ok(`${fam} 4 setup: round 1 sent with every filing (${filings.length}); the representative's review shows one Values line per filing`, sent.status === 201 && words.length === filings.length, { status: sent.status, words: words.length, filings: filings.length });
    for (const [sid, who] of [[P, "the principal (Client A)"], [C, "the child"]]) {
      const w = of(sid).w;
      ok(`${fam} 4 ${who}'s filing says "declared by Client A" and "0 to confirm", never "none yet" or "not confirmed"`, /declared by Client A/.test(w) && /· 0 to confirm/.test(w) && !/none yet|not confirmed/i.test(w), w);
    }
    const ws = of(S).w;
    const conf = (agentNow) => agentNow.sections.filter((s) => s.subjectId.split("/")[0] === S).flatMap((s) => [...s.questions.flatMap((q) => (q.group ? q.rows.map((x) => x.answer) : [q.answer])), ...(s.group && s.group.rows === 0 && s.group.none_apply ? [s.group.none_apply] : [])]).filter((a) => a && a.confirmed && a.mark === "confirmed").length;
    const officerConfirmed = conf((await call("GET", `/runtime/cases/${id}/questionnaire?mode=agent`, "user-O")).body);
    const shown = Number(/(\d+) confirmed by Case officer/.exec(ws)?.[1] ?? 0);
    ok(`${fam} 4 the spouse's filing says "confirmed by" and "0 to confirm"`, /confirmed by/.test(ws) && /· 0 to confirm/.test(ws) && !/none yet/i.test(ws), ws);
    ok(`${fam} 4 the spouse's "confirmed by Case officer" count (${shown}) = the answers the officer confirmed on the spouse's tabs (${officerConfirmed})`, shown === officerConfirmed && shown > 0, { shown, officerConfirmed, ws });
    ok(`${fam} 4 every filing's Values line adds up (facts = declared + confirmed + to confirm)`, words.every((w) => { const x = nums(w); return x.facts === x.parts; }), words);
    await ctx.close(); await ctxR.close();
  }
  ok("no page errors", errs.length === 0, errs.slice(0, 3));
  await b.close(); console.log(`${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})().catch((e) => { console.log("STOP", String(e?.message ?? e).slice(0, 400)); process.exit(1); });
