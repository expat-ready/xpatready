// qa gate A walk for the Release 1 case-side map rows 74, 76, 77 and 80 (P-348 (3), P-322), by screens only, as the Case
// officer (user-O), on the configured checkpoint. The API is only read underneath (and probed for routes that should exist).
//   74 Government deadlines that remind; working days with holidays: open a later-stage case (With an LMIA, route "Study,
//      then work") by screens with the study permit's valid-until date on Canada Day 2027 (a Thursday holiday) and see the
//      deadline line; look for a reminder (Needs you, task, notice) and a working-day move.
//   76 Notes; one timeline per record: look for a note box and a timeline on the case page; read the firm's Activity page.
//   77 Submission number and UCI; decision, close, reopen: look for a decision, close and reopen control on the case page;
//      probe the routes; the case's status underneath.
//   80 IRCC forms per applicant from one set of answers: on the Sample family case, Prepare application lists each
//      person's own forms; a copy is generated for two people's IMM 5257 by screens; the next capability's first step,
//      Ready to file (C7.6), opens and lists them.
// A "GAP" line is a part of the row the app does not offer (expected while the row is not built); FAIL is a defect in what
// is offered. Exit 1 on any FAIL. Sample data, live AI off, US$0.
//   zsh studio/tools/isolated.sh qa_r1walk 4475 start --ttl 120 && trap 'zsh studio/tools/isolated.sh qa_r1walk 4475 stop' EXIT && QA_WIDTH=1440 node studio/tests/qa/check_qa_r1_case_walk.cjs 4475 <shots dir>
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("../../node_modules/playwright");
const AxeBuilder = require("../../node_modules/@axe-core/playwright").default;

const PORT = process.argv[2] ?? "4475", BASE = `http://localhost:${PORT}`;
const SHOTS = process.argv[3] ?? path.join(__dirname, "../../../../product/qa/reports/2026-11-15-capability-R1-case/walk");
const W = Number(process.env.QA_WIDTH ?? 1440), TAG = `${W}`;
const results = [], gaps = [];
const ok = (name, pass, detail = "") => { results.push(pass); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail === "" ? "" : ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`); };
const gap = (name, detail = "") => { gaps.push(name); console.log(`GAP   ${name}${detail === "" ? "" : ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`); };
const T = { timeout: 30000 };
const run = Date.now().toString(36);
const api = async (method, url, body, actor = "user-O") => { const r = await fetch(`${BASE}/api${url}`, { method, headers: { "content-type": "application/json", "x-actor": actor }, body: body === undefined ? undefined : JSON.stringify(body) }); let b = null; try { b = await r.json(); } catch { /* empty */ } return { status: r.status, body: b }; };

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(fs.existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
  const errors = [];
  const ctxFor = async (actor) => { const c = await browser.newContext({ viewport: { width: W, height: 900 }, deviceScaleFactor: 1, timezoneId: "America/Toronto" }); await c.addInitScript((a) => { localStorage.setItem("xr-actor", a); }, actor); return c; };
  const shot = async (p, name, full = false) => p.screenshot({ path: path.join(SHOTS, `${name}-${TAG}.png`), fullPage: full });
  const wide = async (p, what) => ok(`no sideways scroll at ${W} px: ${what}`, !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  try {
    // 0. The configured checkpoint, through the Demo menu (as the Configuration author), when the copy has none.
    let open = (await api("GET", "/runtime/openable", undefined, "user-R")).body ?? [];
    if (!open.some((o) => /With an LMIA/.test(o.combination))) {
      const c0 = await ctxFor("user-A"), p0 = await c0.newPage();
      await p0.goto(`${BASE}/`); await p0.getByRole("button", { name: /^Demo/ }).click(T);
      await p0.getByRole("menuitem", { name: /Load the configured checkpoint/ }).click(T);
      await p0.getByRole("dialog").getByRole("button", { name: "Load the configured checkpoint" }).click(T);
      await p0.getByRole("dialog", { name: "Configured checkpoint loaded" }).waitFor({ timeout: 600000 });
      await c0.close();
      open = (await api("GET", "/runtime/openable", undefined, "user-R")).body ?? [];
    }
    ok("setup: the checkpoint offers With an LMIA as a later stage of a route", open.some((o) => /With an LMIA/.test(o.combination) && o.stage), open.map((o) => o.combination));

    const ctx = await ctxFor("user-O"), p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(e.message));

    // ---- 74: the deadline line on a later stage, and what a person is reminded of.
    const HOLIDAY = "2027-07-01"; // Canada Day, a Thursday: a working-day rule with holidays would move a deadline off it.
    await p.goto(`${BASE}/cases`);
    await p.getByRole("button", { name: "Open a case" }).click(T);
    const dlg = p.getByRole("dialog"), sel = dlg.getByLabel("Combination (released)");
    await sel.locator("option", { hasText: "With an LMIA" }).first().waitFor({ state: "attached", ...T });
    const label = (await sel.locator("option").allTextContents()).map((t) => t.trim()).find((t) => t.startsWith("With an LMIA"));
    await sel.selectOption({ label }, T);
    await dlg.getByLabel("UCI (optional)").fill("12345678");
    await dlg.getByLabel("Study permit valid until (optional)").fill(HOLIDAY);
    const ref = `QA-R1-${run}`;
    await dlg.getByLabel("Your own reference (optional)").fill(ref);
    await dlg.getByLabel("Principal applicant's name").fill(`Client W ${run}`);
    await shot(p, "01-74-open-later-stage-with-date");
    await dlg.getByRole("button", { name: /^Open( case| the case)?$/ }).click(T);
    await p.waitForURL(/\/cases\/[0-9a-f-]{36}/, T);
    const caseId = p.url().match(/\/cases\/([0-9a-f-]{36})/)[1];
    await p.locator("[data-stage-deadline]").first().waitFor(T);
    const dl = (await p.locator("[data-stage-deadline]").first().innerText()).replace(/\s+/g, " ").trim();
    await p.locator("[data-stage-deadline]").first().scrollIntoViewIfNeeded();
    await shot(p, "02-74-deadline-line");
    ok("74 part built: the later stage shows its deadline from the earlier stage's date, labelled Sample", /Apply for the work permit by/.test(dl) && /1 Jul 2027|July 1, 2027|2027-07-01|Jul 1, 2027/.test(dl) && /Sample/.test(dl), dl);
    const st = (await api("GET", `/runtime/cases/${caseId}/stages`)).body;
    const cur = st?.stages?.find((s) => s.state === "CURRENT");
    ok("74 underneath: the deadline is worked out on read, due on the date as entered, sample: true", cur?.deadline?.due === HOLIDAY && cur.deadline.sample === true, cur?.deadline);
    if (cur?.deadline?.due === HOLIDAY) gap("74 working days with holidays: a deadline on Canada Day (a holiday) is shown as is; no working-day or holiday calendar on the case side", dl);
    const body74 = (await p.locator("main, body").first().innerText());
    const remind = /remind|Needs you|overdue|due in \d+ day|days left/i.test(body74);
    const prep = (await api("GET", `/runtime/cases/${caseId}/prepare`)).body;
    const taskHasDeadline = JSON.stringify(prep?.tasks ?? []).match(/deadline|Apply for the work permit by/i);
    if (!remind && !taskHasDeadline) gap("74 reminds: no reminder, task or Needs-you line comes from the deadline (the code says \"never a reminder\", engine/runtime/stages.ts BR-8)");
    else ok("74 reminds: a reminder or task names the deadline", true, { remind, taskHasDeadline: !!taskHasDeadline });

    // ---- 76: notes and one timeline per record.
    const caseText = await p.locator("body").innerText();
    const noteBox = await p.getByRole("button", { name: /add (a )?note|new note/i }).count() + await p.getByLabel(/^note/i).count();
    const timeline = /timeline|activity on this case|history of this case/i.test(caseText);
    if (!noteBox) gap("76 notes: the case page has no note box or Add a note");
    else ok("76 notes: a note box is on the case page", true);
    if (!timeline) gap("76 one timeline per record: the case page has no timeline of its own");
    else ok("76 timeline on the case page", true);
    for (const u of [`/runtime/cases/${caseId}/notes`, `/runtime/cases/${caseId}/timeline`, `/runtime/cases/${caseId}/activity`]) {
      const r = await api("GET", u);
      if (r.status === 404) gap(`76 underneath: GET ${u.replace(caseId, ":id")} answers 404`);
      else ok(`76 underneath: GET ${u.replace(caseId, ":id")} answers ${r.status}`, r.status === 200, r.status);
    }
    await p.goto(`${BASE}/activity`);
    await p.getByText(new RegExp(`case ${caseId.slice(0, 8)}`)).first().waitFor({ timeout: 15000 }).catch(() => {});
    const act = await p.locator("body").innerText();
    await shot(p, "03-76-firm-activity-page");
    const shortId = caseId.slice(0, 8);
    const apiLines = ((await api("GET", "/activity")).body ?? []).filter((x) => x.summary?.includes(`case ${shortId}`));
    ok("76 underneath: the audit keeps the case's opening line, readable by its firm's staff through GET /activity (one feed for the whole firm)", apiLines.some((x) => x.action === "opened"), apiLines.map((x) => x.summary.slice(0, 90)));
    if (/This page is for the configuration people/.test(act)) gap("76 no screen shows case staff a case's history: the Activity page tells the Case officer \"This page is for the configuration people\"");
    else ok("76 the Activity page lists the case just opened", act.includes(shortId), { has_short_id: act.includes(shortId) });

    // ---- 77: decision, close, reopen (the number and UCI are C8.2's; its pack ran on the same commit).
    await p.goto(`${BASE}/cases/${caseId}`);
    await p.getByText(ref).first().waitFor(T);
    const ctl = {};
    for (const [k, re] of Object.entries({ decision: /record (the )?decision|approved|refused|decision/i, close: /close (the )?case|^close$/i, reopen: /reopen/i })) ctl[k] = await p.getByRole("button", { name: re }).count();
    for (const k of Object.keys(ctl)) { if (!ctl[k]) gap(`77 ${k}: no ${k} control on the case page`); else ok(`77 ${k} control on the case page`, true); }
    for (const [m, u] of [["POST", `/runtime/cases/${caseId}/decision`], ["POST", `/runtime/cases/${caseId}/close`], ["POST", `/runtime/cases/${caseId}/reopen`]]) {
      const r = await api(m, u, {});
      if (r.status === 404) gap(`77 underneath: ${m} ${u.replace(caseId, ":id")} answers 404`);
      else ok(`77 underneath: ${m} ${u.replace(caseId, ":id")} answers ${r.status} (not 404)`, true, r.status);
    }
    const listed = ((await api("GET", "/runtime/cases")).body?.cases ?? []).find((c) => c.id === caseId);
    ok("77 underneath: the case's status is OPEN, as opened (nothing sets another status)", listed?.status === "OPEN", listed?.status);
    await shot(p, "04-77-case-header-no-decision-close-reopen");

    // ---- 80: forms per applicant from one set of answers, on the Sample family case, to Ready to file's first step.
    const fam = ((await api("GET", "/runtime/cases")).body?.cases ?? []).find((c) => c.reference === "SAMPLE-VV-FAMILY-1");
    ok("setup: the checkpoint's Sample family case is there", !!fam);
    await p.goto(`${BASE}/cases`);
    await p.getByRole("link", { name: /SAMPLE-VV-FAMILY-1/ }).first().click(T);
    await p.getByRole("heading", { name: /Prepare application/ }).first().waitFor(T);
    await p.getByText("IMM 5257 for Child 18 or over (Sample)", { exact: true }).first().waitFor(T);
    const famText = await p.locator("body").innerText();
    const people = ["Client A (Sample)", "Partner (Sample)", "Child (Sample)", "Child 18 or over (Sample)"];
    const each = Object.fromEntries(people.map((n) => [n, (famText.match(new RegExp(`IMM \\d{4}( SCH1)? for ${n.replace(/[()]/g, "\\$&")}\\n`, "g")) ?? []).length]));
    ok("80: Prepare application lists each applicant's own forms (IMM 5257 for every person)", people.every((n) => famText.includes(`IMM 5257 for ${n}`)), each);
    ok("80: one household questionnaire (one set of answers) for everyone", /questions for this household/.test(famText) && /Client questionnaire/.test(famText));
    const prepF = (await api("GET", `/runtime/cases/${fam.id}/prepare`)).body;
    const byPerson = {}; for (const i of prepF?.items ?? []) if (i.kind === "form") (byPerson[i.person] ??= []).push(i.form);
    ok("80 underneath: each form line belongs to one person's own filing (filing owner = the person)", (prepF?.items ?? []).filter((i) => i.kind === "form").every((i) => prepF.filings.find((f) => f.id === i.filing)?.applicants.some((a) => a.subject === i.subject)), byPerson);
    const minorNoSch1 = !(byPerson["Child (Sample)"] ?? []).includes("IMM 5257 SCH1") && (byPerson["Child 18 or over (Sample)"] ?? []).includes("IMM 5257 SCH1");
    ok("80: a person's forms follow the person (the minor child has no IMM 5257 SCH1; the adult child has one)", minorNoSch1, byPerson);
    const famShort = fam.id.slice(0, 8);
    const genLines = async () => ((await api("GET", "/activity")).body ?? []).filter((x) => x.entity === "form copy" && x.entityKey === "IMM 5257" && x.summary.includes(`case ${famShort}`));
    const before = (await genLines()).map((x) => x.id);
    for (const n of ["Client A (Sample)", "Partner (Sample)"]) {
      const head = p.getByText(`IMM 5257 for ${n}`, { exact: true }).first();
      await head.scrollIntoViewIfNeeded();
      const card = head.locator("xpath=ancestor::*[.//button[normalize-space()='Generate a new copy']][1]");
      await card.getByRole("button", { name: "Generate a new copy" }).first().click(T);
      await p.waitForTimeout(4000);
      await shot(p, `05-80-copy-${n.startsWith("Client") ? "client-a" : "partner"}`);
    }
    const fresh = (await genLines()).filter((x) => !before.includes(x.id));
    const asked = fresh.filter((x) => x.action === "queued").map((x) => x.summary), made = fresh.filter((x) => x.action === "generated").map((x) => x.summary);
    ok("80 underneath: a copy asked for the principal and one for the spouse, each generated and read back intact (audit lines)", asked.some((t) => /principal/i.test(t)) && asked.some((t) => /spouse/i.test(t)) && made.length >= 2 && made.every((t) => /read back (\d+)\/\1, intact/.test(t)), { asked, made });
    const famText2 = await p.locator("body").innerText();
    ok("80: no error banner after generating", !/Something went wrong|Internal server error/i.test(famText2));
    // The next capability's first step: Ready to file (C7.6).
    await p.getByRole("button", { name: "Ready to file" }).first().click(T);
    await p.waitForTimeout(2500);
    const rtf = await p.locator("body").innerText();
    await shot(p, "06-80-next-step-ready-to-file");
    ok("80 → C7.6 first step: Ready to file opens and lists the people's IMM 5257 lines", people.slice(0, 2).every((n) => rtf.includes(`IMM 5257 for ${n}`)) && /Ready to file|Pass with a reason/.test(rtf));
    await wide(p, "family case, Ready to file");
    const axe = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = axe.violations.filter((v) => ["serious", "critical"].includes(v.impact));
    ok("axe: no serious or critical violation on the family case page", serious.length === 0, serious.map((v) => `${v.id} (${v.nodes.length})`));
    ok("no page error during the walk", errors.length === 0, errors.slice(0, 3));
    await ctx.close();
  } catch (e) {
    ok("walk ran to the end", false, String(e).slice(0, 400));
  } finally {
    await browser.close();
    const fail = results.filter((x) => !x).length;
    console.log(`\n${results.length - fail}/${results.length} passed · ${gaps.length} GAP (parts not offered) · width ${W}`);
    process.exit(fail ? 1 : 0);
  }
})();
