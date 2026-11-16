// qa (13 Nov, Bake walk 1 on main b26ad9430): QA-445. On a Visitor visa family case (principal, spouse, child), Client A
// fills part 1 "Details of visit to Canada" and presses "Save and continue": the screen says "✓ Saved" and stays on part 1
// (the overview then reads it Done). Likely cause: #1643 orders the application's parts after the principal's
// (engine/runtime/case.ts), the web's byPerson puts them first, and #1659's Save and continue works out its target on one
// order and opens it as a position in the other. Expected: Save and continue opens another part (or the overview).
// Fails today; passes when fixed. US$0, live AI off. Through the screens, except opening the case (the product's own route).
// Extended 16 Nov (Majors retest after #1671), to the row's own words, "Save and continue opens the next part that is not
// done", on both families of the row: the Visitor visa family (the walk stayed on parts 1-7) and a Study permit family
// (principal, spouse, child; the walk stayed on 60 of 66 presses). After part 1, each family is pressed through its first
// 10 parts: before each press the part's required single answers are given through the client's own route (as if typed
// on another device; a part with a required list keeps its summary and is left with "leave them for now and continue"),
// then "Save and continue" on screen; after each press the screen must show "Part k of N" naming the part the client's own
// view says is next not done (the first later part not done; the overview when none), never the part just left.
//   zsh tools/isolated.sh qa_445 4472 start && node tests/qa/check_qa445_save_and_continue.cjs 4472 [database] [shots dir] [width]
//   (loads the configured checkpoint itself when the copy has no released Visitor visa, about 2 min; never :4400)
const fs = require("fs"); const path = require("path"); const { chromium } = require("playwright");
const port = process.argv[2]; if (!port || port === "4400") { console.log("usage: <port of an isolated copy>, never 4400"); process.exit(2); }
const SHOTS = process.argv[4], W = Number(process.argv[5] ?? 1440), PRESSES = Number(process.env.QA445_PRESSES ?? 10);
const base = `http://localhost:${port}`;
const call = async (method, path, actor, body) => { const r = await fetch(base + "/api" + path, { method, headers: { "x-actor": actor, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); let b = null; try { b = await r.json(); } catch { /* not JSON */ } return { status: r.status, body: b }; };
let failed = 0; const ok = (name, pass, detail) => { if (!pass) failed++; console.log(`${pass ? "PASS" : "FAIL"} ${name}${!pass && detail ? `: ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
// The client's own view in the questionnaire's order (person by person, a relative after their person) and its "done".
const clientParts = async (caseId, passed) => {
  const v = (await call("GET", `/runtime/cases/${caseId}/questionnaire`, "user-P")).body;
  const at = (id) => { const [own, rel] = id.split("/"); return v.case.people.findIndex((p) => p.subject_id === own) + (rel ? 0.5 : 0); };
  return [...v.sections].sort((a, b) => at(a.subjectId) - at(b.subjectId)).map((s) => {
    const invalid = s.questions.some((q) => (q.group ? q.rows.some((r) => r.answer?.problems.length) : q.answer?.problems.length));
    const k = `${s.subjectId}|${s.section}`;
    return { key: k, title: s.title, done: !v.checks.some((c) => c.subjectId === s.subjectId && c.section === s.section) && !invalid && !s.missing.length && (s.answered > 0 || passed.has(k)) };
  });
};
const SAMPLE = { yes_no: false, text: "SAMPLE", date: "2000-01-15", number: 1, country: "India", address: { street_number: "1", street_name: "SAMPLE ROAD", city: "NEW DELHI", country: "India" } };
const answerPart = async (caseId, key) => {
  const v = (await call("GET", `/runtime/cases/${caseId}/questionnaire`, "user-P")).body; const s = v.sections.find((x) => `${x.subjectId}|${x.section}` === key); if (!s) return;
  for (const q of s.questions) {
    if (!q.required || q.hidden || q.group || q.answer) continue;
    const o = q.options?.[0], value = o !== undefined ? (typeof o === "object" ? o.value ?? o.code ?? o.key : o) : q.value_type === "code" ? "SAMPLE" : SAMPLE[q.value_type];
    if (value !== undefined) await call("PUT", `/runtime/cases/${caseId}/answers/${q.subjectId}/${q.fact}`, "user-P", { value, expectedId: null });
  }
};
const nextNotDone = (parts, from) => { for (let k = 1; k < parts.length; k++) { const i = (from + k) % parts.length; if (!parts[i].done) return i; } return null; };

(async () => {
  const find = async (name) => ((await call("GET", "/runtime/openable", "user-O")).body ?? []).find((r) => r.combination === name && r.startable);
  if (!(await find("Visitor visa"))) {
    await call("POST", "/demo/reset", "user-A", { confirm: "RESET" });
    const l = await call("POST", "/demo/load", "user-A", { sample: "configured" });
    if (l.status >= 300) { console.log("STOP the configured checkpoint did not load", l.status); process.exit(2); }
  }
  const b = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : fs.existsSync("/opt/pw-browsers/chromium-1243/chrome-linux64/chrome") ? { executablePath: "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome" } : {}) });
  for (const [fam, combo] of [["Visitor visa", "Visitor visa"], ["Study permit", "Outside Canada"]]) {
    const row = await find(combo);
    const ref = `QA445-${fam.length}-${Date.now() % 100000}`;
    const made = await call("POST", "/runtime/cases", "user-O", { combinationId: row.combination_id, reference: ref, clientActor: "user-P", principal: { displayName: "Sample Principal Q" }, idempotencyKey: ref });
    ok(`QA-445 ${fam} setup: a case opens`, made.status < 300 && !!made.body?.id, made); if (!made.body?.id) continue;
    const caseId = made.body?.id;
    const ctx = await b.newContext({ viewport: { width: W, height: 1000 } });
    await ctx.addInitScript(() => { try { if (!sessionStorage.getItem("qa445")) { localStorage.setItem("xr-actor", "user-O"); sessionStorage.setItem("qa445", "1"); } } catch {} });
    const p = await ctx.newPage(); await p.goto(`${base}/cases/${caseId}`); await p.waitForLoadState("networkidle");
    const shot = (n) => SHOTS ? p.screenshot({ path: path.join(SHOTS, `qa445-${fam === "Visitor visa" ? "vv" : "sp"}-${n}-${W}.png`) }) : null;
    // The add buttons name the release's lines ("Add spouse or partner (travelling)" on the Visitor visa; the Study permit's own words).
    for (const [btn, name] of [[/^Add .*(spouse|partner)/i, "Sample Spouse Q"], [/^Add .*child/i, "Sample Child Q"]]) {
      await p.getByRole("button", { name: btn }).first().click(); const d = p.getByRole("dialog"); await d.getByLabel("Name").fill(name); await d.getByRole("button", { name: "Add", exact: true }).click(); await p.waitForTimeout(1500);
    }
    await p.getByRole("button", { name: "Hand to Client A (simulated)" }).click(); await p.waitForTimeout(2000);
    await p.getByRole("button", { name: "Start", exact: true }).first().click(); await p.waitForTimeout(1200);
    const m = p.locator("main");
    if (fam === "Visitor visa") {
      ok("QA-445 setup: part 1 is Details of visit to Canada", /Part 1 of \d+ · Details of visit to Canada/.test(await m.innerText()));
      await m.getByLabel("Purpose of the visit to Canada").selectOption({ label: "Family Visit" });
      await m.getByLabel("Street number").fill("12"); await m.getByLabel("Street name").fill("Sample Street"); await m.getByLabel("City or town").fill("Toronto");
      await m.getByLabel("Country", { exact: true }).fill("Canada");
      await m.getByLabel(/Name of a person or institution/).fill("Sample Host Q"); await m.getByLabel(/Relationship of the person/).fill("Cousin");
      await m.getByLabel(/Funds available/).fill("8000");
      for (const [lg, d, mo] of [["Planned first day", "14", "06"], ["Planned last day", "20", "07"]]) { const fsx = m.locator("fieldset", { hasText: lg }); await fsx.getByLabel("Day").fill(d); await fsx.getByLabel("Month").fill(mo); await fsx.getByLabel("Year").fill("2027"); }
      await shot("01-part1-filled");
      await m.getByRole("button", { name: "Save and continue" }).click(); await p.waitForTimeout(2500);
      const after = new URL(p.url()).searchParams.get("part"); const text = await m.innerText();
      ok("QA-445 setup: the part saved", /✓ Saved|Part 2 of|Client questionnaire/.test(text));
      ok("QA-445 fail today: Save and continue on part 1 opens another part (or the overview), not part 1 again", after !== "1", { part: after, head: text.slice(0, 160) });
      await shot("02-after-part1");
    }
    // The row's words, press by press.
    const passedSet = () => p.evaluate((id) => { try { return JSON.parse(localStorage.getItem(`xr-passed-${id}`) ?? "[]"); } catch { return []; } }, caseId).then((x) => new Set(x));
    const partOf = async () => { const t = await m.innerText(); const r = /Part (\d+) of (\d+) · ([^\n]*)/.exec(t); return r ? { n: Number(r[1]), of: Number(r[2]), title: r[3].trim(), whom: (/Answering for [^\n]*|Answered once for the whole application[^\n]*/.exec(t) ?? [""])[0] } : null; };
    let cur = await partOf(); let parts = await clientParts(caseId, await passedSet()); let curKey = cur ? parts[cur.n - 1]?.key : null;
    const stuck = [], wrong = []; let presses = 0;
    for (let i = 0; i < PRESSES && cur; i++) {
      await answerPart(caseId, curKey);
      const was = `${cur.title}|${cur.whom}`;
      await m.getByRole("button", { name: "Save and continue" }).click(); presses++;
      const moved = await p.waitForFunction((w) => { const t = document.querySelector("main")?.innerText ?? ""; const r = /Part \d+ of \d+ · ([^\n]*)/.exec(t); const h = r ? `${r[1].trim()}|${(/Answering for [^\n]*|Answered once for the whole application[^\n]*/.exec(t) ?? [""])[0]}` : "overview"; return (h !== w && !document.querySelector("button[aria-busy]")) || /You can fix these now/.test(t); }, was, { timeout: 30000 }).then(() => true, () => false);
      if (moved && await m.getByRole("button", { name: "leave them for now and continue" }).isVisible().catch(() => false)) { await m.getByRole("button", { name: "leave them for now and continue" }).click(); await p.waitForTimeout(1500); }
      const now = await partOf(); parts = await clientParts(caseId, await passedSet());
      const at = parts.findIndex((x) => x.key === curKey), want = nextNotDone(parts, at);
      const landed = now ? parts[now.n - 1]?.key : null;
      if (landed === curKey || (now && `${now.title}|${now.whom}` === was)) stuck.push({ press: presses, part: was, screen: now && `Part ${now.n} of ${now.of} · ${now.title}` });
      else if ((want === null ? null : parts[want].key) !== landed) wrong.push({ press: presses, from: was, screen: now ? `Part ${now.n} of ${now.of} · ${now.title}` : "overview", want: want === null ? "overview" : `Part ${want + 1} · ${parts[want].title}` });
      if (i === 2) await shot("03-press3");
      if (!now) break; cur = now; curKey = landed;
    }
    ok(`QA-445 ${fam}: Save and continue never stays on the part it was pressed on (${presses} presses)`, stuck.length === 0, stuck.slice(0, 3));
    ok(`QA-445 ${fam}: each press opens the next part that is not done (the client's own view; the overview when none)`, wrong.length === 0, wrong.slice(0, 3));
    await ctx.close();
  }
  await b.close(); console.log(failed ? `${failed} failed` : "all passed"); process.exit(failed ? 1 : 0);
})().catch((e) => { console.log("STOP", String(e?.message ?? e).slice(0, 400)); process.exit(1); });
