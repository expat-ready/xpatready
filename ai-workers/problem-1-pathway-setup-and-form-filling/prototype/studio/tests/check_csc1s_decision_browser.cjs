// CS-C1s part 2 (screens lane; concept screens/CS-C1s/concept.md §6): the case page's "Decision and closing" panel and
// the header's closing line, walked like a person in a browser at 1440 px and 375 px, with axe (WCAG 2.2 AA) on the
// panel and each open dialog, and the data checked underneath. Named cases of the brief:
//   DS3 a staff person records Approved (Sample) on a submitted filing, closes the case with a reason, sees the outcome,
//       reason and date in the header, reopens with a reason, and the case is open at the same stage;
//   DS4 a case with no decision is withdrawn with a reason and a date; the header reads Withdrawn;
//   DS5 refusals: Close with a filing undecided is not offered and a forced call changes nothing; Withdraw after a
//       decision is not offered and a forced call shows "A filing has a decision…"; an empty reason shows "Give a reason.";
//       the case officer (no agent/case:record-decision) is offered no act and a forced call is 403; a double click on
//       Record the decision records one row; with no staff session the panel shows the sign-in inline, then the rows.
// Cases are opened and prepared through the API as the case officer (the simulated person, as the case page does);
// "submitted" is C8.2's filing_record row written in SQL (the submission screen is C8.2's own check). The staff sign-in
// is PF-4's local stand-in on this copy (PLATFORM_IDENTITY=local, PLATFORM_SAMPLE_SEED=on). No model call, US$0, never
// :4400. With SHOTS=<folder>, the walk's screenshots are written there.
//   zsh studio/tools/isolated.sh csc1s 4491 start AI_LIVE=off PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on && node studio/tests/check_csc1s_decision_browser.cjs 4491 xr_studio_csc1s
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const { chromium } = require("../node_modules/playwright");
const AxeBuilder = require("../node_modules/@axe-core/playwright").default;
const PORT = Number(process.argv[2] ?? 4491), DB = process.argv[3] ?? "xr_studio_csc1s", BASE = `http://localhost:${PORT}`, SHOTS = process.env.SHOTS || null;
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const PSQL = fs.existsSync("/opt/homebrew/opt/postgresql@18/bin/psql") ? "/opt/homebrew/opt/postgresql@18/bin/psql" : "psql";
const sql = (q) => execFileSync(PSQL, [`postgresql://xr_studio@127.0.0.1:54329/${DB}`, "-Atc", q], { encoding: "utf8" }).trim();
let pass = 0, failed = 0;
const ok = (name, c, detail) => { c ? pass++ : failed++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const OWNER = "representative@sample-firm.example.com", OFFICER = "user-o@sample-firm.example.com";

(async () => {
  const b = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : fs.existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
  const http = await (await b.newContext()).request;
  const api = async (method, path, json, o = {}) => {
    const headers = { "content-type": "application/json", ...(o.actor ? { "x-actor": o.actor } : {}), ...(o.token ? { authorization: `Bearer ${o.token}` } : {}) };
    const r = await http.fetch(`${BASE}/api${path}`, { method, headers, data: json, timeout: 600000 });
    return { status: r.status(), body: await r.json().catch(() => null) };
  };
  const signIn = async (email) => (await api("POST", "/platform/session/local", { firmKey: "sample-firm", email, secondStep: true })).body?.token;
  if (sql("select count(*) from config_release r join combination c on c.id = r.combination_id where c.combination_key = 'vv.single' and r.status = 'RELEASED'") === "0") {
    const l = await api("POST", "/demo/load", { sample: "configured" }, { actor: "user-A" });
    ok("setup: the configured checkpoint loads", l.status < 300, l.status);
  }
  const vv = sql("select id from combination where combination_key = 'vv.single'");
  let ownerToken = await signIn(OWNER);
  const officerToken = await signIn(OFFICER);
  ok("setup: the representative (Owner, Case manager) and the case officer sign in as firm staff (local stand-in)", !!ownerToken && !!officerToken, { ownerToken: !!ownerToken, officerToken: !!officerToken });
  let n = 0;
  const openCase = async (name, submitted) => {
    const r = await api("POST", "/runtime/cases", { combinationId: vv, reference: `CSC1S-${process.pid}-${++n}`, clientActor: "user-P", principal: { displayName: name }, representative: "user-R", caseOfficers: ["user-O"] }, { actor: "user-O" });
    const id = r.body?.id;
    await api("GET", `/runtime/cases/${id}/prepare`, undefined, { actor: "user-O" });
    const filing = sql(`select id from filing where case_id = '${id}' and active order by created_at limit 1`);
    if (submitted) sql(`insert into filing_record (id, workspace_id, case_id, filing_id, submission_group_id, our_reference, submitted_on, application_number, prepared_by, recorded_by, filed_facts)
      select gen_random_uuid(), workspace_id, case_id, id, submission_group_id, 'SAMPLE-CSC1S', '2026-11-02', 'V3001' || substr(md5(id::text), 1, 5), 'user-O', 'user-O', '[]' from filing where id = '${filing}'`);
    return { id, filing, stage: sql(`select id from case_stage where case_id = '${id}' and state = 'CURRENT'`) };
  };
  const A = await openCase("Sample Client CSC1S A", true), B = await openCase("Sample Client CSC1S B", false), N = await openCase("Sample Client CSC1S N", false), R = await openCase("Sample Client CSC1S R", true);
  ok("setup: three cases with one filing each; case A's recorded as submitted", !!A.filing && !!B.filing && !!N.filing && sql(`select count(*) from filing_record where filing_id = '${A.filing}'`) === "1", [A, B]);

  for (const width of [1440, 375]) {
    const ctx = await b.newContext({ viewport: { width, height: width === 375 ? 812 : 1000 } });
    const p = await ctx.newPage();
    const errors = []; p.on("pageerror", (e) => errors.push(e.message));
    const shot = async (name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.locator("[data-case-decision]").screenshot({ path: `${SHOTS}/${name}-${width}.png` }); } };
    const axe = async (what, scope) => { const r = await new AxeBuilder({ page: p }).include(scope).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze(); ok(`axe (WCAG 2.2 AA) at ${width}: ${what}`, r.violations.length === 0, r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)); };
    const sideways = async () => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    await p.goto(BASE); await p.evaluate(() => { try { localStorage.setItem("xr-actor", "user-O"); sessionStorage.removeItem("xr-staff-session"); } catch { /* ignore */ } });
    const panel = p.locator("[data-case-decision]");
    const openCasePage = async (id) => { await p.goto(`${BASE}/cases/${id}`); await panel.waitFor({ timeout: 60000 }); };
    const dialog = p.getByRole("dialog");
    const toastGone = async () => p.waitForTimeout(150);

    // ---- no staff session (a fresh browser context): the sign-in inline, then the rows ------------------------------------
    await openCasePage(A.id);
    await panel.locator("[data-decision-no-session]").waitFor({ timeout: 30000 });
    ok(`DS5 fail at ${width}: with no staff session the panel says "Sign in as firm staff to see and record decisions." and offers the sign-in inline (no act)`,
      /Sign in as firm staff to see and record decisions\./.test(await panel.innerText()) && (await panel.locator("[data-sign-in-card]").count()) === 1 && (await panel.locator("[data-act]").count()) === 0);
    await shot("1-no-session");
    await axe("the panel with the inline sign-in", "[data-case-decision]");
    await panel.getByLabel("Firm key").fill("sample-firm"); await panel.getByLabel("Work email").fill(OFFICER);
    await panel.getByRole("button", { name: "Sign in" }).click();
    await panel.locator("[data-decision-filing]").first().waitFor({ timeout: 30000 });
    ok(`DS3 pass at ${width}: signed in, the rows replace the sign-in in place; "Signed in as" names the staff member`, (await panel.locator("[data-sign-in-card]").count()) === 0 && /Signed in as .+ \(firm staff\)/.test(await panel.innerText()));

    // ---- DS5: the case officer, no key: no act offered; a forced call is 403 ------------------------------------------
    ok(`DS5 fail at ${width}: the case officer (no agent/case:record-decision) is offered no act, and is told who can`,
      (await panel.locator("[data-act]").count()) === 0 && /Your role does not record decisions\. An Owner, Admin or Case manager can\./.test(await panel.innerText()));
    const rowsBefore = sql(`select count(*) from case_decision where case_id = '${A.id}'`);
    const forced = await p.evaluate(async ([id, filing]) => { const t = JSON.parse(sessionStorage.getItem("xr-staff-session")).token; const r = await fetch(`/api/runtime/cases/${id}/decisions`, { method: "POST", headers: { authorization: `Bearer ${t}`, "content-type": "application/json" }, body: JSON.stringify({ filingId: filing, outcome: "APPROVED", decidedOn: "2026-11-16" }) }); return r.status; }, [A.id, A.filing]);
    ok(`DS5 fail at ${width}: a forced decision by the case officer is 403 and records nothing`, forced === 403 && sql(`select count(*) from case_decision where case_id = '${A.id}'`) === rowsBefore, forced);
    await shot("2-no-key");

    // Sign in as the representative (Owner, Case manager) for the acts: a new session replaces the officer's.
    await p.evaluate(([t]) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_000_000 })), [ownerToken]);
    await openCasePage(A.id);
    await panel.locator("[data-act='decide']").waitFor({ timeout: 30000 });
    const firstRun = width === 1440;
    if (firstRun) {
      // ---- DS5: Close is not offered while a filing is undecided; Withdraw is offered before any decision -------------
      ok("DS5 fail: before any decision, Close the case is not offered; the panel says how many are decided", (await panel.locator("[data-act='close']").count()) === 0 && /Close the case once every filing has a decision: 0 of 1 decided\./.test(await panel.innerText()));
      ok("DS4 pass: before any decision, Withdraw the case is offered (quiet), Record a decision on the submitted filing", (await panel.locator("[data-act='withdraw']").count()) === 1 && (await panel.locator("[data-act='decide']").count()) === 1);
      const forcedClose = await api("POST", `/runtime/cases/${A.id}/close`, { reason: "Too early (Sample)" }, { token: ownerToken });
      ok("DS5 fail: a forced Close with a filing undecided is refused (409 NOT_DECIDED) and changes nothing", forcedClose.status === 409 && forcedClose.body?.code === "NOT_DECIDED" && sql(`select status from runtime_case where id = '${A.id}'`) === "OPEN", forcedClose.status);
      await shot("3-open-submitted");
      await axe("the panel, a submitted filing", "[data-case-decision]");

      // ---- DS3: record Approved (Sample); a double click records one row ----------------------------------------------
      await panel.locator("[data-act='decide']").click();
      await dialog.waitFor();
      ok("DS3 pass: Record a decision opens on the filing, Outcome Approved and Refused each marked Sample, the date empty",
        /Record a decision: Sample Client CSC1S A/.test(await dialog.innerText()) && (await dialog.locator("[data-outcome-choice]").count()) === 2 && (await dialog.locator("[data-sample-mark]").count()) === 2 && (await dialog.locator("[data-act-date]").inputValue()) === "");
      await dialog.getByRole("button", { name: "Record the decision" }).click();
      await dialog.locator("[role=alert]").first().waitFor();
      ok("DS5 fail: Record with no outcome and no date names both fields, nothing recorded", /Choose the outcome\./.test(await dialog.innerText()) && /Give the date\./.test(await dialog.innerText()) && sql(`select count(*) from case_decision where case_id = '${A.id}'`) === "0");
      await axe("the Record a decision dialog with its errors", "[role=dialog]");
      await dialog.locator("[data-outcome-choice='APPROVED']").check();
      await dialog.locator("[data-act-date]").fill("2026-11-16");
      await dialog.locator("[data-act-text]").fill("Visa counterfoil received (Sample).");
      await dialog.getByRole("button", { name: "Record the decision" }).dblclick();
      await dialog.waitFor({ state: "detached", timeout: 30000 });
      await panel.locator("[data-latest-decision='APPROVED']").waitFor({ timeout: 30000 });
      ok("DS3 pass / DS5 double click: Approved (Sample) recorded once, the row reads it with its date and note", sql(`select count(*) || '|' || min(outcome) || '|' || min(decided_on::text) from case_decision where case_id = '${A.id}' and kind = 'DECISION'`) === "1|APPROVED|2026-11-16"
        && /Approved\s*Sample\s*· decided 16 Nov 2026 · “Visa counterfoil received \(Sample\)\.”/.test(await panel.locator("[data-decision-filing]").innerText()));
      ok("DS3 pass: after the decision, Close the case is the one filled act; Withdraw is no longer offered", (await panel.locator("[data-act='close']").count()) === 1 && (await panel.locator("[data-act='withdraw']").count()) === 0);
      // ---- DS5: Withdraw after a decision: a forced call answers in the screen's words ---------------------------------
      const forcedW = await api("POST", `/runtime/cases/${A.id}/withdraw`, { reason: "Late (Sample)", withdrawnOn: "2026-11-17" }, { token: ownerToken });
      ok("DS5 fail: a forced Withdraw after a decision is refused (409 HAS_DECISION), the case still open", forcedW.status === 409 && forcedW.body?.code === "HAS_DECISION" && sql(`select status from runtime_case where id = '${A.id}'`) === "OPEN", forcedW.status);
      await shot("4-decided");

      // ---- DS3: close with a reason; an empty one first ----------------------------------------------------------------
      await panel.locator("[data-act='close']").click();
      await dialog.waitFor();
      await dialog.locator("[data-act-text]").fill("   ");
      await dialog.getByRole("button", { name: "Close the case" }).click();
      await dialog.getByText("Give a reason.").waitFor({ timeout: 15000 });
      ok("DS5 fail: Close with a reason of spaces shows the API's \"Give a reason.\" on the field; the case still open", sql(`select status from runtime_case where id = '${A.id}'`) === "OPEN");
      await axe("the Close the case dialog with its error", "[role=dialog]");
      await dialog.locator("[data-act-text]").fill("Visa approved; file complete (Sample).");
      await dialog.getByRole("button", { name: "Close the case" }).click();
      await dialog.waitFor({ state: "detached", timeout: 30000 });
      const end = p.locator("[data-case-end-line]");
      await end.waitFor({ timeout: 30000 });
      const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      const endText = await end.innerText();
      ok("DS3 pass: the header reads Closed, and the line gives the outcome, the date, the decision and the reason (each outcome Sample)",
        (await p.locator("[data-case-status-pill]").innerText()) === "Closed" && endText.includes("Closed by staff") && endText.includes(`on ${today}`) && /Decision: Approved/.test(endText) && endText.includes("Reason: Visa approved; file complete (Sample).") && (await end.locator("[data-sample-mark]").count()) === 2, endText);
      ok("DS3 data: the case is CLOSED_BY_STAFF with the reason, closed from its current stage", sql(`select status || '|' || close_outcome || '|' || closed_reason || '|' || closed_from_stage from runtime_case where id = '${A.id}'`) === `CLOSED|CLOSED_BY_STAFF|Visa approved; file complete (Sample).|${A.stage}`);
      ok("DS3 pass: closed, only Reopen the case is offered", (await panel.locator("[data-act]").count()) === 1 && (await panel.locator("[data-act='reopen']").count()) === 1);
      await shot("5-closed");
      if (SHOTS) await p.screenshot({ path: `${SHOTS}/5-closed-page-${width}.png` });
      await axe("the case header and the closed panel", "main");

      // ---- DS3: reopen with a reason, back at the same stage ------------------------------------------------------------
      await panel.locator("[data-act='reopen']").click();
      await dialog.waitFor();
      ok("DS3 pass: Reopen says where the case goes back to", /The case goes back to /.test(await dialog.innerText()));
      await dialog.locator("[data-act-text]").fill("IRCC reconsideration request (Sample).");
      await dialog.getByRole("button", { name: "Reopen the case" }).click();
      await dialog.waitFor({ state: "detached", timeout: 30000 });
      await p.getByText(/Reopened\. The case is back at /).first().waitFor({ timeout: 15000 });
      await p.locator("[data-case-end-line]").waitFor({ state: "detached", timeout: 15000 });
      ok("DS3 pass: reopened, the header reads Open again, no closing line, and the case is at the same stage",
        (await p.locator("h1").innerText()).includes("Open") && sql(`select status || '|' || coalesce(close_outcome, '') from runtime_case where id = '${A.id}'`) === "OPEN|" && sql(`select state from case_stage where id = '${A.stage}'`) === "CURRENT");
      // A correction keeps the earlier decision in the history.
      await panel.locator("[data-act='decide']").click(); await dialog.waitFor();
      ok("DS3 pass: on a decided filing the act is Correct the decision, which says the earlier one stays", /This records a new decision\. The earlier one stays in the history\./.test(await dialog.innerText()));
      await dialog.locator("[data-outcome-choice='REFUSED']").check(); await dialog.locator("[data-act-date]").fill("2026-11-18");
      await dialog.getByRole("button", { name: "Record the correction" }).click();
      await dialog.waitFor({ state: "detached", timeout: 30000 });
      await panel.locator("[data-decision-history-toggle]").click();
      ok("DS3 pass: the correction is the latest; 1 earlier decision opens the history with who recorded each, by name",
        sql(`select count(*) from case_decision where case_id = '${A.id}' and kind = 'DECISION'`) === "2" && /recorded by Representative \(Sample\)/.test(await panel.locator("[data-decision-history]").innerText()), await panel.locator("[data-decision-filing]").innerText());
      await shot("6-corrected");
    }

    // ---- DS5: the state moves while a dialog is open (another tab): the refusal in the screen's words, nothing changed ----
    if (firstRun) {
      await openCasePage(R.id);
      await panel.locator("[data-act='withdraw']").click(); await dialog.waitFor();
      await dialog.locator("[data-act-date]").fill("2026-11-17"); await dialog.locator("[data-act-text]").fill("Client withdrew (Sample).");
      const other = await api("POST", `/runtime/cases/${R.id}/decisions`, { filingId: R.filing, outcome: "REFUSED", decidedOn: "2026-11-16" }, { token: ownerToken });
      await dialog.getByRole("button", { name: "Withdraw the case" }).click();
      await dialog.locator("[data-act-refusal]").waitFor({ timeout: 15000 });
      ok("DS5 fail: Withdraw after a decision (recorded in another tab) shows \"A filing has a decision…\" in the dialog; the case still open",
        other.status === 201 && (await dialog.locator("[data-act-refusal]").innerText()) === "A filing has a decision, so the case cannot be withdrawn. Close it with a reason instead." && sql(`select status from runtime_case where id = '${R.id}'`) === "OPEN", other.status);
      await axe("a dialog with a refusal", "[role=dialog]");
      await dialog.getByRole("button", { name: "Cancel" }).click(); await dialog.waitFor({ state: "detached" });
      await panel.locator("[data-act='close']").waitFor({ timeout: 15000 });
      ok("DS5 pass: after the refusal the panel read again: Withdraw is gone, Close the case is offered", (await panel.locator("[data-act='withdraw']").count()) === 0);
      await panel.locator("[data-act='close']").click(); await dialog.waitFor();
      await dialog.locator("[data-act-text]").fill("Refused; client informed (Sample).");
      // Another tab adds a filing that has no decision yet (a person added to the case: C6.13's Add filing, in SQL here).
      sql(`set session_replication_role = replica; insert into filing (id, workspace_id, case_id, submission_group_id, subject_id, combination_key, mode, stage_id) select gen_random_uuid(), workspace_id, case_id, submission_group_id, gen_random_uuid(), combination_key, mode, stage_id from filing where id = '${R.filing}'`);
      await dialog.getByRole("button", { name: "Close the case" }).click();
      await dialog.locator("[data-act-refusal]").waitFor({ timeout: 15000 });
      ok("DS5 fail: Close with a filing undecided shows \"Every filing needs a decision…\" in the dialog and changes nothing",
        (await dialog.locator("[data-act-refusal]").innerText()) === "Every filing needs a decision before the case is closed. Before any decision, withdraw the case." && sql(`select status from runtime_case where id = '${R.id}'`) === "OPEN");
      await shot("9-refusal");
      await dialog.getByRole("button", { name: "Cancel" }).click(); await dialog.waitFor({ state: "detached" });
    }

    // ---- break M2: the staff session ends while a dialog is open: the panel says so, nothing recorded --------------------
    if (firstRun) {
      const T2 = await signIn(OWNER);
      await p.evaluate(([t]) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_000_000 })), [T2]);
      await openCasePage(R.id);
      await panel.locator("[data-act='close']").click(); await dialog.waitFor();
      await dialog.locator("[data-act-text]").fill("Session test (Sample).");
      const out = await api("POST", "/platform/session/sign-out", undefined, { token: T2 });
      await dialog.getByRole("button", { name: "Close the case" }).click();
      await panel.locator("[data-decision-session-lost]").waitFor({ timeout: 15000 });
      ok("DS5 fail (break M2): the session ended elsewhere while Close was open: the panel says \"Close the case was not sent: nothing was recorded\" and offers the sign-in",
        out.status < 300 && /^Close the case was not sent: nothing was recorded\./.test(await panel.locator("[data-decision-session-lost]").innerText()) && (await panel.locator("[data-sign-in-card]").count()) === 1 && sql(`select status from runtime_case where id = '${R.id}'`) === "OPEN", out.status);
      await axe("the panel after the session ended", "[data-case-decision]");
      await panel.getByLabel("Firm key").fill("sample-firm"); await panel.getByLabel("Work email").fill(OWNER);
      await panel.getByRole("button", { name: "Sign in" }).click();
      await dialog.locator("[data-act-restored]").waitFor({ timeout: 30000 });
      ok("DS5 pass (review M2): signed in again, Close the case opens again with the reason typed before; nothing sent yet",
        (await dialog.locator("[data-act-text]").inputValue()) === "Session test (Sample)." && sql(`select status from runtime_case where id = '${R.id}'`) === "OPEN");
      await dialog.getByRole("button", { name: "Cancel" }).click(); await dialog.waitFor({ state: "detached" });
      // One session per person: the sign-in above ended the earlier one, so the walk goes on with the new one.
      ownerToken = await p.evaluate(() => JSON.parse(sessionStorage.getItem("xr-staff-session")).token);
    }

    // ---- DS4: withdraw case B (no decision) with a reason and a date ------------------------------------------------------
    if (firstRun) {
      await openCasePage(B.id);
      await panel.locator("[data-act='withdraw']").waitFor({ timeout: 30000 });
      ok("DS4 pass: a case with nothing submitted offers no Record a decision, and names the filing not submitted", (await panel.locator("[data-act='decide']").count()) === 0 && /Not submitted yet: Sample Client CSC1S B/.test(await panel.innerText()));
      await panel.locator("[data-act='withdraw']").click();
      await dialog.waitFor();
      await dialog.locator("[data-act-date]").fill("2026-11-15");
      await dialog.getByRole("button", { name: "Withdraw the case" }).click();
      await dialog.getByText("Give a reason.").waitFor({ timeout: 15000 });
      ok("DS5 fail: Withdraw with an empty reason shows \"Give a reason.\"; the case still open", sql(`select status from runtime_case where id = '${B.id}'`) === "OPEN");
      await axe("the Withdraw the case dialog with its error", "[role=dialog]");
      await dialog.locator("[data-act-text]").fill("The client withdrew before filing (Sample).");
      await dialog.getByRole("button", { name: "Withdraw the case" }).click();
      await dialog.waitFor({ state: "detached", timeout: 30000 });
      const end = p.locator("[data-case-end-line='WITHDRAWN']");
      await end.waitFor({ timeout: 30000 });
      ok("DS4 pass: the header reads Withdrawn, with the withdrawal date and the reason",
        (await p.locator("[data-case-status-pill]").innerText()) === "Withdrawn" && /Withdrawn\s*Sample\s*on 15 Nov 2026 \(recorded .+\) · Reason: The client withdrew before filing \(Sample\)\./.test(await end.innerText()), await end.innerText());
      ok("DS4 data: one WITHDRAWAL row dated 15 Nov; the case is CLOSED WITHDRAWN", sql(`select count(*) || '|' || min(decided_on::text) from case_decision where case_id = '${B.id}' and kind = 'WITHDRAWAL'`) === "1|2026-11-15" && sql(`select status || '|' || close_outcome from runtime_case where id = '${B.id}'`) === "CLOSED|WITHDRAWN");
      await shot("7-withdrawn");
    } else {
      // 375 px: the same acts stack, full width, with no sideways scroll; one more full walk on case N.
      await openCasePage(N.id);
      await panel.locator("[data-act='withdraw']").waitFor({ timeout: 30000 });
      const w = await panel.locator("[data-act='withdraw']").boundingBox(), pb = await panel.boundingBox();
      ok("375 pass: the act button is full width in the panel and the page has no sideways scroll", !!w && !!pb && w.width > pb.width - 40 && !(await sideways()), [w?.width, pb?.width]);
      await panel.locator("[data-act='withdraw']").click(); await dialog.waitFor();
      await dialog.locator("[data-act-date]").fill("2026-11-14"); await dialog.locator("[data-act-text]").fill("Withdrawn on the phone (Sample).");
      await axe("the Withdraw dialog at 375", "[role=dialog]");
      await dialog.getByRole("button", { name: "Withdraw the case" }).click();
      await dialog.waitFor({ state: "detached", timeout: 30000 });
      await p.locator("[data-case-end-line='WITHDRAWN']").waitFor({ timeout: 30000 });
      ok("DS4 pass at 375: withdrawn, the header line wraps without sideways scroll", !(await sideways()));
      await panel.locator("[data-act='reopen']").click(); await dialog.waitFor();
      await dialog.locator("[data-act-text]").fill("Came back (Sample).");
      await dialog.getByRole("button", { name: "Reopen the case" }).click();
      await dialog.waitFor({ state: "detached", timeout: 30000 });
      await p.locator("[data-case-end-line]").waitFor({ state: "detached", timeout: 15000 });
      ok("DS3 pass at 375: reopened, open again at the same stage", sql(`select status from runtime_case where id = '${N.id}'`) === "OPEN" && sql(`select state from case_stage where id = '${N.stage}'`) === "CURRENT");
      await shot("8-reopened");
      await axe("the panel at 375", "[data-case-decision]");
    }
    await toastGone();
    ok(`no page errors at ${width}`, errors.length === 0, errors);
    await ctx.close();
  }
  await b.close();
  console.log(`\n${pass} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
