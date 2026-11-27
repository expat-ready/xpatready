// CS-NT1 part 4 (concept product/screens/CS-NT1d/concept.md §6; R1.76 j_76 W8): the case page's "Notes and timeline"
// panel, walked like a person in a browser at 1440 px and 375 px, with axe (WCAG 2.2 AA) on the panel, and the data
// checked underneath. Named cases, each a pass and a fail:
//   DP1 add → shows in the notes and on the timeline, stored once; a double Add stores one (M5)
//   DP2 an empty note is not sent (Add note disabled); 5,001 characters are refused on the box with the count
//   DP3 pin moves a note first; unpin puts it back
//   DP4 edit → "Edited", History shows both versions; the case officer sees no Edit on the Owner's note
//   DP5 a conflict (the note changed in another tab) keeps the typed words and offers "Use the current note"
//   DP6 "For the client" and "Show to the client" are hidden without agent/note:share-with-client; with it, the badge
//   DP7 the mention list holds only staff who may open the case (the case team first); the person is told once; a
//       forced mention of someone outside the case is 400 and nothing is written (ruling 1 on #3694); the notes,
//       timeline and people reads keep to the reader's caseScope (404 outside it, the "part 3s" order)
//   DP8 a kind chip shows only that kind; Show older reads the next page; the end line when there is no more
//   DP9 no staff session → the sign-in inline; another firm's case → the firm words
//   DP10 Show to the client → in the client's read; Make internal → gone from it (M2)
//   DP11 a pin alone never marks a note "Edited" (M1)
//   DP12 a known line type shows its words, an unknown one "{Kind} change", an access line (viewed) not at all (B1)
// Cases are opened through the API as the case officer (the simulated person, as the case page does); audit lines and
// role keys are fixtures written in SQL and put back at the end. The staff sign-in is PF-4's local stand-in
// (PLATFORM_IDENTITY=local, PLATFORM_SAMPLE_SEED=on). No model call, US$0, never :4400. SHOTS=<folder> writes screenshots.
//   zsh studio/tools/isolated.sh csnt1d 4438 start AI_LIVE=off PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on && node studio/tests/check_csnt1d_panel_browser.cjs 4438 xr_studio_csnt1d
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const { chromium } = require("../node_modules/playwright");
const AxeBuilder = require("../node_modules/@axe-core/playwright").default;
const PORT = Number(process.argv[2] ?? 4438), DB = process.argv[3] ?? "xr_studio_csnt1d", BASE = `http://localhost:${PORT}`, SHOTS = process.env.SHOTS || null;
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const PSQL = fs.existsSync("/opt/homebrew/opt/postgresql@18/bin/psql") ? "/opt/homebrew/opt/postgresql@18/bin/psql" : "psql";
const sql = (q) => execFileSync(PSQL, [`postgresql://xr_studio@127.0.0.1:54329/${DB}`, "-Atc", q], { encoding: "utf8" }).trim();
let pass = 0, failed = 0;
const ok = (name, c, detail) => { c ? pass++ : failed++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const OWNER = "representative@sample-firm.example.com", OFFICER = "user-o@sample-firm.example.com";
const SHARE = "agent/note:share-with-client", VIEW_ALL = "agent/case:view.all";
const removed = [];   // role keys taken away for a check, put back at the end
const takeKey = (role, key) => { const n = sql(`with d as (delete from platform_role_permission where role = '${role}' and permission_key = '${key}' returning 1) select count(*) from d`); if (n !== "0") removed.push([role, key]); };
const putBack = () => { for (const [role, key] of removed.splice(0)) sql(`insert into platform_role_permission (role, permission_key) values ('${role}', '${key}') on conflict do nothing`); };

(async () => {
  const b = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : fs.existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
  const errors = [];
  try {
    const http = await (await b.newContext()).request;
    const api = async (method, path, json, o = {}) => {
      const headers = { "content-type": "application/json", ...(o.actor ? { "x-actor": o.actor } : {}), ...(o.token ? { authorization: `Bearer ${o.token}` } : {}) };
      const r = await http.fetch(`${BASE}/api${path}`, { method, headers, data: json, timeout: 600000 });
      return { status: r.status(), body: await r.json().catch(() => null) };
    };
    const signIn = async (firmKey, email) => (await api("POST", "/platform/session/local", { firmKey, email, secondStep: true })).body?.token;
    if (sql("select count(*) from config_release r join combination c on c.id = r.combination_id where c.combination_key = 'vv.single' and r.status = 'RELEASED'") === "0") {
      const l = await api("POST", "/demo/load", { sample: "configured" }, { actor: "user-A" });
      ok("setup: the configured checkpoint loads", l.status < 300, l.status);
    }
    const vv = sql("select id from combination where combination_key = 'vv.single'");
    const ownerToken = await signIn("sample-firm", OWNER), officerToken = await signIn("sample-firm", OFFICER);
    const soloOwner = sql("select s.email from platform_staff s join platform_firm f on f.id = s.firm_id join platform_role_grant g on g.staff_id = s.id and g.ended_at is null where f.key = 'sample-solo' and g.role = 'OWNER' limit 1");
    const soloToken = soloOwner ? await signIn("sample-solo", soloOwner) : null;
    ok("setup: the Owner and the case officer of sample-firm, and sample-solo's Owner, sign in as firm staff (local stand-in)", !!ownerToken && !!officerToken && !!soloToken, { ownerToken: !!ownerToken, officerToken: !!officerToken, soloToken: !!soloToken });
    const staffId = (actor) => sql(`select s.id from platform_staff s join platform_firm f on f.id = s.firm_id where f.key = 'sample-firm' and s.actor_id = '${actor}'`);
    const [R, O, T] = ["user-R", "user-O", "user-T"].map(staffId);
    let n = 0;
    const openCase = async (name) => (await api("POST", "/runtime/cases", { combinationId: vv, reference: `CSNT1D-${process.pid}-${++n}`, clientActor: "user-P", principal: { displayName: name }, representative: "user-R", caseOfficers: ["user-O"] }, { actor: "user-O" })).body?.id;
    const A = await openCase("Sample Client CSNT1D A"), L = await openCase("Sample Client CSNT1D Lines");
    ok("setup: two cases of sample-firm", !!A && !!L, [A, L]);
    const ws = sql(`select workspace_id from runtime_case where id = '${L}'`);
    // DP8, DP12: case L's audit lines: 60 documents uploaded, one decision, one unknown type, one access line.
    sql(`insert into audit_event (id, workspace_id, at, actor, action, entity, entity_key, summary, case_id)
      select gen_random_uuid(), '${ws}', now() - (g || ' minutes')::interval, 'staff:${R}', 'uploaded', 'case document', gen_random_uuid()::text, 'Sample upload ' || g, '${L}' from generate_series(10, 69) g`);
    sql(`insert into audit_event (id, workspace_id, at, actor, action, entity, entity_key, summary, case_id) values
      (gen_random_uuid(), '${ws}', now() - interval '3 minutes', 'staff:${R}', 'case.decision.recorded', 'case', '${L}', 'Decision recorded on case (Sample)', '${L}'),
      (gen_random_uuid(), '${ws}', now() - interval '2 minutes', 'staff:${R}', 'case.sample-unknown-act', 'case', '${L}', 'An act this screen has no words for', '${L}'),
      (gen_random_uuid(), '${ws}', now() - interval '1 minutes', 'staff:${R}', 'viewed', 'case document', gen_random_uuid()::text, 'Viewed a document', '${L}')`);
    // Break M1 / review M1: 60 access lines newer than every other line: a whole page of the API's would be views.
    sql(`insert into audit_event (id, workspace_id, at, actor, action, entity, entity_key, summary, case_id)
      select gen_random_uuid(), '${ws}', now() - (g || ' seconds')::interval, 'staff:${R}', 'viewed', 'case document', gen_random_uuid()::text, 'Viewed ' || g, '${L}' from generate_series(1, 60) g`);

    for (const width of [1440, 375]) {
      const first = width === 1440;
      const ctx = await b.newContext({ viewport: { width, height: width === 375 ? 812 : 1000 } });
      const p = await ctx.newPage();
      p.on("pageerror", (e) => errors.push(e.message));
      const panel = p.locator("[data-case-notes]");
      const shot = async (name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await panel.screenshot({ path: `${SHOTS}/${name}-${width}.png` }); } };
      const axe = async (what) => { const r = await new AxeBuilder({ page: p }).include("[data-case-notes]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze(); ok(`axe (WCAG 2.2 AA) at ${width}: ${what}`, r.violations.length === 0, r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)); };
      const as = async (token) => { await p.evaluate((t) => { if (t) sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_000_000 })); else sessionStorage.removeItem("xr-staff-session"); localStorage.setItem("xr-actor", "user-O"); }, token); };
      const openPage = async (id) => { await p.goto(`${BASE}/cases/${id}`); await panel.waitFor({ timeout: 60000 }); };
      await p.goto(BASE); await as(null);

      // ---- DP9: no session → the sign-in inline -------------------------------------------------------------------
      await openPage(A);
      await panel.locator("[data-notes-no-session]").waitFor({ timeout: 30000 });
      ok(`DP9 fail at ${width}: with no staff session the panel offers the sign-in inline and no writer`, (await panel.locator("[data-sign-in-card]").count()) === 1 && (await panel.locator("[data-note-text]").count()) === 0);
      await shot("1-no-session");
      await as(ownerToken);
      await p.route("**/api/runtime/cases/*/notes", async (r) => { await new Promise((ok2) => setTimeout(ok2, 1500)); await r.continue(); });   // slow the read to see the skeleton
      await p.goto(`${BASE}/cases/${A}`);
      await panel.locator("[data-notes-loading]").waitFor({ timeout: 60000 });
      const below = async () => panel.evaluate((s) => Math.round(s.getBoundingClientRect().height));
      const hLoading = await below();
      await panel.locator("[data-note-text]").waitFor({ timeout: 30000 });
      const hLoaded = await below();
      await p.unroute("**/api/runtime/cases/*/notes");
      ok(`review M2 at ${width}: the panel keeps its height from the skeleton to the loaded panel (nothing below moves)`, hLoading === hLoaded, { hLoading, hLoaded });
      ok(`DP9 pass at ${width}: signed in, the writer and the notes show; "Signed in as" names the staff member`, /Signed in as .+ \(firm staff\)/.test(await panel.innerText()));
      if (first) {
        ok("DP1 setup: a case with no note says so", (await panel.locator("[data-notes-empty]").count()) === 1);
        await axe("the empty panel");
        // ---- DP2 ----------------------------------------------------------------------------------------------------
        const before0 = sql(`select count(*) from case_note where case_id = '${A}'`);
        await panel.locator("[data-note-add]").click();
        ok("DP2 fail (challenge m4): Add on an empty note says \"Write the note first.\" in words and sends nothing", /Write the note first\./.test(await panel.locator("[data-note-error]").innerText()) && sql(`select count(*) from case_note where case_id = '${A}'`) === before0);
        await panel.locator("[data-note-text]").fill("x".repeat(5001));
        ok("DP2 fail: 5,001 characters: the box says to keep it to 5,000 with the count, Add note disabled", /Keep the note to 5,000 characters \(5,001 now\)\./.test(await panel.innerText()) && (await panel.locator("[data-note-add]").isDisabled()));
        await axe("the writer with its error");
        // ---- DP1: add; a double Add stores one --------------------------------------------------------------------
        const words = `Sample note ${process.pid}: documents promised Friday`;
        await panel.locator("[data-note-text]").fill(words);
        await panel.locator("[data-note-add]").dblclick();
        await panel.locator("[data-notes-list]").getByText(words).waitFor({ timeout: 30000 });
        await panel.locator("[data-case-timeline]").getByText(words).waitFor({ timeout: 30000 });
        const ownerName = sql(`select display_name from platform_staff where id = '${R}'`);
        ok("DP1 pass: the note shows in the notes with who and when, and on the timeline", (await panel.locator("[data-note-by]").first().innerText()).startsWith(`${ownerName} · `), ownerName);
        ok("DP1 fail (M5): a double Add stored one note", sql(`select count(distinct note_key) from case_note where case_id = '${A}' and text = '${words}'`) === "1");
        await shot("2-added");
        // ---- DP3, DP11: pin moves it first; a pin alone is not "Edited" -------------------------------------------
        await api("POST", `/runtime/cases/${A}/notes`, { text: "Sample later note" }, { token: ownerToken });
        await openPage(A); await panel.locator("[data-note]").nth(1).waitFor({ timeout: 30000 });
        ok("DP3 setup: the newer note is first", /Sample later note/.test(await panel.locator("[data-note]").first().innerText()));
        await panel.locator("[data-note]").filter({ hasText: words }).locator("[data-note-pin]").click();
        await p.waitForFunction((w) => document.querySelector("[data-note]")?.textContent?.includes(w), words, { timeout: 30000 });
        ok("DP3 pass: pinned, it moves first with the Pinned badge", /Pinned/.test(await panel.locator("[data-note]").first().innerText()));
        ok("DP11 fail (M1): a pin alone does not mark the note Edited", (await panel.locator("[data-note]").first().locator("[data-note-edited]").count()) === 0);
        await panel.locator("[data-note]").first().locator("[data-note-pin]").click();
        await p.waitForFunction(() => document.querySelector("[data-note]")?.textContent?.includes("Sample later note"), null, { timeout: 30000 });
        ok("DP3 fail: unpinned, it goes back below the newer note, no Pinned badge on either", !/Pinned/.test(await panel.locator("[data-notes-list]").innerText()));
        // ---- DP4: edit; History; DP5 conflict ----------------------------------------------------------------------
        const card = panel.locator("[data-note]").filter({ hasText: words });
        await card.locator("[data-note-edit]").click();
        await card.locator("[data-note-edit-text]").fill(`${words} (edited)`);
        await card.locator("[data-note-save]").click();
        await panel.locator("[data-note]").filter({ hasText: "(edited)" }).locator("[data-note-edited]").waitFor({ timeout: 30000 });
        const edited = panel.locator("[data-note]").filter({ hasText: "(edited)" });
        await edited.locator("[data-note-history]").click();
        await edited.locator("[data-note-version]").nth(1).waitFor({ timeout: 30000 });
        ok("DP4 pass: Edited shows, and History lists the words changed and the first version", /Words changed/.test(await edited.locator("[data-note-versions]").innerText()) && /Written/.test(await edited.locator("[data-note-versions]").innerText()));
        const key = sql(`select note_key from case_note where case_id = '${A}' and text = '${words} (edited)'`);
        const byKey = panel.locator(`[data-note='${key}']`);
        await byKey.locator("[data-note-edit]").click();
        await byKey.locator("[data-note-edit-text]").fill("My words, typed while someone else changed it");
        const v = Number(sql(`select max(version) from case_note where note_key = '${key}'`));
        await api("PUT", `/runtime/cases/${A}/notes/${key}/text`, { text: `${words} (changed in another tab)`, version: v }, { token: ownerToken });
        await byKey.locator("[data-note-save]").click();
        await panel.locator("[data-note-conflict]").waitFor({ timeout: 30000 });
        ok("DP5 fail: the conflict says so, keeps the typed words and shows the current note", (await panel.locator("[data-note-edit-text]").inputValue()) === "My words, typed while someone else changed it" && /changed in another tab/.test(await panel.innerText()));
        await axe("a note in conflict");
        ok("DP5 fail (break m7): after a conflict there is no plain Save; replacing their words is its own button", (await byKey.locator("[data-note-save]").count()) === 0 && (await byKey.locator("[data-note-overwrite]").count()) === 1);
        await panel.locator("[data-note-use-current]").click();
        ok("DP5 pass: Use the current note puts its words in the box", /changed in another tab/.test(await panel.locator("[data-note-edit-text]").inputValue()));
        await shot("3-conflict");
        // ---- DP6, DP10: with the key, For the client, the badge, and the client's read ------------------------------
        await openPage(A); await panel.locator("[data-note]").first().waitFor({ timeout: 30000 });
        ok("DP6 pass: with the key, For the client is offered", (await panel.locator("[data-note-for-client]").count()) === 1);
        const shareCard = panel.locator("[data-note]").filter({ hasText: "Sample later note" });
        await shareCard.locator("[data-note-visibility]").click();
        await shareCard.getByText("Client can see this").waitFor({ timeout: 30000 });
        const clientSees = async () => JSON.stringify((await api("GET", `/runtime/cases/${A}`, undefined, { actor: "user-P" })).body ?? {}).includes("Sample later note");
        ok("DP10 pass: Show to the client → the badge, and the note is in the client's read", await clientSees());
        await shareCard.locator("[data-note-visibility]").click();
        await p.waitForFunction(() => ![...document.querySelectorAll("[data-note]")].some((n) => n.textContent.includes("Sample later note") && n.textContent.includes("Client can see this")), null, { timeout: 30000 });
        ok("DP10 fail: Make internal → gone from the client's read", !(await clientSees()));
        // ---- DP7: mentions ---------------------------------------------------------------------------------------
        takeKey("CASE_MANAGER", VIEW_ALL);   // user-T (Case manager only, not on case A) can no longer open it
        await panel.locator("[data-note-mention-open]").click();
        await panel.locator(`[data-note-person='${O}']`).waitFor({ timeout: 30000 });
        await p.keyboard.press("Escape");
        await p.waitForFunction(() => document.activeElement?.hasAttribute("data-note-mention-open"), null, { timeout: 5000 }).catch(() => undefined);
        ok("DP7 (break m4): Escape closes the list and gives focus back to Mention", (await panel.locator("[data-note-person]").count()) === 0 && await panel.locator("[data-note-mention-open]").evaluate((b) => b === document.activeElement));
        await panel.locator("[data-note-mention-open]").click();
        await panel.locator(`[data-note-person='${O}']`).waitFor({ timeout: 30000 });
        const people = await panel.locator("[data-note-person]").evaluateAll((els) => els.map((e) => e.getAttribute("data-note-person")));
        ok("DP7 pass: the mention list holds the case officer (on this case) first, and never someone who cannot open the case", people[0] === O && !people.includes(T), { people, O, T });
        await axe("the mention list open");
        await panel.locator(`[data-note-person='${O}']`).click();
        const before = sql(`select count(*) from msg_notification where kind = 'note-mention'`);
        await panel.locator("[data-note-text]").fill("Sample note for the case officer");
        await panel.locator("[data-note-add]").click();
        await panel.locator("[data-note-told]").waitFor({ timeout: 30000 });
        ok("DP7 pass: after Add the panel says who was told, and the case officer is told once", Number(sql(`select count(*) from msg_notification where kind = 'note-mention'`)) - Number(before) === 1);
        const forced = await api("POST", `/runtime/cases/${A}/notes`, { text: "Sample forced mention", mentions: [T] }, { token: ownerToken });
        ok("DP7 fail: a forced mention of someone who cannot open the case is 400, nothing written", forced.status === 400 && sql(`select count(*) from case_note where case_id = '${A}' and text = 'Sample forced mention'`) === "0", forced);
        // Review M3, break m10: the people read is one query, whatever the firm's size: 1,000 more Case officers (view.all; the per-person reads took about 1 s per 300).
        const firmA = sql("select id from platform_firm where key = 'sample-firm'");
        sql(`with s as (insert into platform_staff (id, firm_id, email, display_name, updated_at) select gen_random_uuid(), '${firmA}', 'bulk-${process.pid}-' || g || '@example.org', 'Sample Bulk ' || lpad(g::text, 4, '0'), now() from generate_series(1, 1000) g returning id)
          insert into platform_role_grant (id, staff_id, role, firm_id, granted_by) select gen_random_uuid(), id, 'CASE_OFFICER', '${firmA}', 'test' from s`);
        const t0 = Date.now(), bulk = await api("GET", `/runtime/cases/${A}/notes/people`, undefined, { token: ownerToken }), ms = Date.now() - t0;
        ok("review M3 pass: with 1,000 more staff the people read answers in under 1.5 s, the case team still first, all 1,000 listed", bulk.status === 200 && ms < 1500 && bulk.body.people[0].staffId === O && bulk.body.people.filter((x) => x.name.startsWith("Sample Bulk")).length === 1000, { status: bulk.status, ms });
        const t1 = Date.now(), withMention = await api("POST", `/runtime/cases/${A}/notes`, { text: "Sample mention among many", mentions: [O] }, { token: ownerToken }), ms1 = Date.now() - t1;
        ok("review M3 fail-safe: an add with a mention among 1,000 more staff is saved (201) in under 1.5 s", withMention.status === 201 && ms1 < 1500, { status: withMention.status, ms1 });
        sql(`with s as (select id from platform_staff where email like 'bulk-${process.pid}-%') , g as (delete from platform_role_grant where staff_id in (select id from s)) delete from platform_staff where id in (select id from s)`);
        const tToken = await signIn("sample-firm", sql(`select email from platform_staff where id = '${T}'`));
        const outside = await Promise.all([`/runtime/cases/${A}/notes`, `/runtime/cases/${A}/timeline`, `/runtime/cases/${A}/notes/people`].map((u) => api("GET", u, undefined, { token: tToken }).then((r) => r.status)));
        ok("DP7 fail (caseScope, the part 3s order): a Case manager who cannot open the case gets 404 on its notes, timeline and people", outside.every((s) => s === 404), outside);
        putBack();
        const inside = await Promise.all([`/runtime/cases/${A}/notes`, `/runtime/cases/${A}/timeline`].map((u) => api("GET", u, undefined, { token: tToken }).then((r) => r.status)));
        ok("DP7 pass (caseScope): with agent/case:view.all back, the same person reads them (200)", inside.every((s) => s === 200), inside);
        // ---- DP8, DP12 on case L --------------------------------------------------------------------------------
        await openPage(L);
        const tl = panel.locator("[data-case-timeline]");
        await tl.locator("[data-timeline-line]").first().waitFor({ timeout: 30000 });
        ok("DP12 fail (B1; break M1): 61 access lines newer than the rest are not shown, and the older lines are (no false \"Nothing has happened\")", (await tl.locator("[data-timeline-type='viewed']").count()) === 0 && (await tl.locator("[data-timeline-empty]").count()) === 0 && (await tl.locator("[data-timeline-line]").count()) === 10);
        ok("DP12 pass: the unknown type reads \"Other change\", the decision \"Decision recorded\", an upload \"Document uploaded\"; no 8-character id",
          /Other change/.test(await tl.locator("[data-timeline-type='case.sample-unknown-act']").innerText()) && /Decision recorded/.test(await tl.innerText()) && /Document uploaded/.test(await tl.innerText()) && !(await tl.innerText()).includes("An act this screen has no words for"));
        ok("DP8 pass: the first 10 lines show, then Show older", (await tl.locator("[data-timeline-line]").count()) === 10 && (await tl.locator("[data-timeline-older]").count()) === 1);
        await tl.locator("[data-timeline-older]").click();
        await p.waitForFunction(() => document.querySelectorAll("[data-timeline-line]").length > 10, null, { timeout: 30000 });
        await tl.locator("[data-timeline-older]").click();
        await tl.locator("[data-timeline-end]").waitFor({ timeout: 30000 });
        const uploads = await tl.locator("[data-timeline-line]").evaluateAll((els) => els.map((e) => /Sample upload (\d+)/.exec(e.textContent ?? "")?.[1]).filter(Boolean));
        ok("DP8 pass: Show older reads the next page, to the end line, each of the 60 uploads exactly once, the access line left out", uploads.length === 60 && new Set(uploads).size === 60, uploads.length);
        await tl.locator("[data-timeline-kind='DECISION']").click();
        await p.waitForFunction(() => document.querySelectorAll("[data-timeline-line]").length === 1, null, { timeout: 30000 });
        ok("DP8 fail: the Decisions chip shows only the decision", (await tl.locator("[data-timeline-line='DECISION']").count()) === 1 && (await tl.locator("[data-timeline-line='DOCUMENT']").count()) === 0);
        await shot("4-timeline");
        await axe("the timeline");
      }
      // ---- DP4 fail, DP6 fail: the case officer; then no share key; then read-only ----------------------------------
      await as(officerToken); await openPage(A);
      await panel.locator("[data-note]").first().waitFor({ timeout: 30000 });
      ok(`DP4 fail at ${width}: the case officer sees no Edit on the Owner's notes`, (await panel.locator("[data-note-edit]").count()) === 0);
      takeKey("CASE_OFFICER", SHARE);
      await openPage(A); await panel.locator("[data-note]").first().waitFor({ timeout: 30000 });
      ok(`DP6 fail at ${width}: without the share key, no For the client and no Show to the client`, (await panel.locator("[data-note-for-client]").count()) === 0 && (await panel.locator("[data-note-visibility]").count()) === 0);
      takeKey("CASE_OFFICER", "agent/case:edit");
      await openPage(A); await panel.locator("[data-notes-read-only]").waitFor({ timeout: 30000 });
      ok(`DP6 fail at ${width}: without agent/case:edit, no writer: "Your role can read notes but not add them."`, (await panel.locator("[data-note-text]").count()) === 0);
      putBack();
      ok(`no sideways scroll at ${width}`, !(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
      await shot("5-officer");
      // ---- DP9 fail: another firm's case → the firm words ---------------------------------------------------------
      await as(soloToken); await openPage(A);
      await panel.getByText("This case is not in the firm you are signed in to.").waitFor({ timeout: 30000 }).catch(() => undefined);
      ok(`DP9 fail at ${width}: another firm's Owner sees "This case is not in the firm you are signed in to." and no note`, /This case is not in the firm you are signed in to, or your role cannot open it\./.test(await panel.innerText()) && (await panel.locator("[data-note]").count()) === 0);
      await ctx.close();
    }
    // Round 4 (pr-suites: c95 BIC-14, A24-3 m3): the panel puts the case page's tips below the fold. Focusing one scrolls
    // the page; the shared Tip keeps it open through that scroll, and Escape still closes it at once (WCAG 1.4.13).
    {
      const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
      const p = await ctx.newPage();
      await p.goto(BASE); await p.evaluate(() => localStorage.setItem("xr-actor", "user-O"));
      await p.goto(`${BASE}/cases/${A}`);
      const tip = p.locator("[data-applicant-tip]").first();
      await tip.waitFor({ timeout: 60000 });
      const below = await tip.evaluate((e) => e.getBoundingClientRect().top > window.innerHeight);
      await tip.focus();
      const shown = await p.getByRole("tooltip").first().waitFor({ timeout: 5000 }).then(() => true, () => false);
      ok("round 4 pass: a tip below the panel (below the fold) opens on keyboard focus and stays open through the scroll", below && shown, { below, shown });
      await p.keyboard.press("Escape");
      const gone = await p.getByRole("tooltip").first().waitFor({ state: "hidden", timeout: 1000 }).then(() => true, () => false);
      ok("round 4 fail: Escape closes that tip at once, even within 600 ms of the focus", gone && await tip.evaluate((e) => e === document.activeElement));
      await ctx.close();
    }
    ok("no page error during the walk", errors.length === 0, errors.slice(0, 5));
  } finally {
    putBack();
    await b.close();
  }
  console.log(`\n${pass} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { putBack(); console.error(e); process.exit(1); });
