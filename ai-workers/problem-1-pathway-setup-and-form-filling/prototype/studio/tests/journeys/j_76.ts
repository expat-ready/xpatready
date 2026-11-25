// J-76 (map row 76, R1.76: "Notes; one timeline per record"), written by the qa lane (22 Nov) BEFORE its parts merge,
// so qa only has to run it when they do. Persona: a firm's Owner (and a second firm's Owner, for the walls) on an
// isolated copy of the running app (its own database and port, never :4400), by screens where they exist and on the
// routes and the database underneath.
// Done when (CAPABILITIES R1.76; judged on the checklist row's words, "Notes; one timeline per record"), as the steps:
//   W1 "Staff add a note to a case": CS-NT1 part 1 (#2999, takes over #2320): POST /api/runtime/cases/:id/notes; the
//      list names who wrote it and when; case_note holds it with its author and the database's time.
//   W2 "kept add-only": an edit writes the next version and the first stays readable (the history route); the database
//      refuses UPDATE and DELETE on case_note, and on the front office's fo_note (FO-1a).
//   W3 "or a person": a note on a person: the case client (CS-NT1 part 3: case_client_id and its route, the brief's
//      line); and the front office's note on a prospect, kept on its person (FO-2 part 4, merged: fo_note.person_id).
//   W4 "each case ... has its own timeline": CS-NT1 part 3, GET /api/runtime/cases/:id/timeline: case A1's note is on
//      A1's timeline with who and when, and never on case A2's.
//   W5 "each ... person ... has its own timeline": CS-NT1t (BACKLOG, the Lead's ruling 23 Nov), GET
//      /api/case-clients/:id/timeline (the row's own path; another firm's person 404).
//   W6 "each ... prospect has its own timeline": FO-2 part 4 (merged): the prospect's note is on its timeline with who
//      and when; another prospect's timeline never shows it.
//   W7 "another firm's lines never appear": firm B (sample-solo) writes a prospect note and a case note; firm A's
//      timelines and lists never show them, and firm A reading firm B's record is 404 (only counted where firm A's own
//      read of that route answers 200, so a missing route never passes as a wall).
//   W8 by screens: the notes and timeline panel on the case page (CS-NT1 part 4) and the prospect page's timeline
//      (FO-4 part 2b).
// Fails on main today only where a part is not merged (P-606); each failing label names its part. Assumed paths (said):
// CS-NT1 part 3's /api/runtime/cases/:id/timeline is the brief's; the case client's notes route
// (/api/runtime/clients/:id/notes) is a guess; a person's timeline is CS-NT1t's /api/case-clients/:id/timeline; the
// panel's words ("Notes", "Add note") are guesses until CS-NT1 part 4's concept. Cases are opened through the merged
// route (POST /api/runtime/cases, the simulated case officer) after Demo › Load the configured checkpoint. Sample values
// only; US$0, no model call, no live mail. No screenshots. Run from prototype/:
//   zsh studio/tools/isolated.sh j76 4476 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j76 4476 stop' EXIT && npx tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_76.ts j76 4476
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "../runtime/api.ts";

const [NAME, PORT] = [process.argv[2] ?? "j76", Number(process.argv[3] ?? 4476)];
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`;
const HEADED = process.env.HEADED === "1";
const { ok, summary } = recorder();
const { sql: rawSql, call } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const refused = (q: string) => { try { rawSql(q); return false; } catch { return true; } };
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- answers read loosely, as the other journeys
type Ans = { status: number; body: any };
const api = async (t: string | null, method: string, path: string, body?: unknown): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const x = await r.text(); let b: unknown = x; try { b = JSON.parse(x); } catch { /* text */ } return { status: r.status, body: b };
};
const has = (b: unknown, s: string) => JSON.stringify(b ?? "").includes(s);
const table = (t: string) => sql(`select count(*) from information_schema.tables where table_name = '${t}'`) === "1";
const column = (t: string, c: string) => sql(`select count(*) from information_schema.columns where table_name = '${t}' and column_name = '${c}'`) === "1";
/** The line of a timeline or list that carries this text (any of the shapes the parts may answer). */
const lineWith = (b: unknown, s: string): Record<string, unknown> | undefined => {
  const o = b as Record<string, unknown> | null;
  const arr = (Array.isArray(b) ? b : (o?.lines ?? o?.items ?? o?.notes ?? [])) as Record<string, unknown>[];
  return arr.find((l) => JSON.stringify(l).includes(s));
};

// ------------------------------------------------------------------------------------------------ setup (Sample)
await seedSampleFirms(db);
const fo = await seedSampleFirmsFrontOffice(db);
const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
const staffOf = (actor: string) => { const [id, email, name] = sql(`select id || '|' || email || '|' || display_name from platform_staff where actor_id = '${actor}'`).split("|"); return { id, email, name }; };
const R = staffOf("user-R"), S = staffOf("user-S");   // firm A's Owner, firm B's Owner
const signIn = async (firmKey: string, email: string) => {
  const r = await api(null, "POST", "/platform/session/local", { firmKey, email, secondStep: true });
  if (!r.body?.token) { console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${r.body?.detail}`); process.exit(2); }
  return r.body.token as string;
};
const tA = await signIn("sample-firm", R.email), tB = await signIn("sample-solo", S.email);
ok("J-76 setup: the two Sample firms (A sample-firm, B sample-solo), their front office and both Owners signed in", !!A && !!B && fo.failed.length === 0 && !!tA && !!tB, fo.failed);
if (sql(`select count(*) from config_release r join combination c on c.id = r.combination_id where c.combination_key = 'vv.single' and r.status = 'RELEASED'`) === "0") {
  const l = await call("POST", "/demo/load", { sample: "configured" }, "user-A");
  ok("J-76 setup: Demo › Load the configured checkpoint", l.status === 200 || l.status === 201, l.status);
}
const vv = sql(`select id from combination where combination_key = 'vv.single'`);
const openCase = async (actor: string, clientActor: string, name: string, team: Record<string, unknown>) =>
  call("POST", "/runtime/cases", { combinationId: vv, reference: `J76-${run}-${Math.random().toString(36).slice(2, 6)}`, clientActor, principal: { displayName: name }, ...team }, actor);
const a1 = await openCase("user-O", "user-P", `Sample Client J76 ${run} One`, { representative: "user-R", caseOfficers: ["user-O"] });
const a2 = await openCase("user-O", "user-P", `Sample Client J76 ${run} Two`, { representative: "user-R", caseOfficers: ["user-O"] });
const b1 = await openCase("user-S", "user-Q", `Sample Client J76 ${run} B`, {});
const A1: string = a1.body?.id ?? "", A2: string = a2.body?.id ?? "", B1: string = b1.body?.id ?? "";
const clientA1 = A1 ? sql(`select coalesce(client_id::text, '') from runtime_case where id = '${A1}'`) : "";
ok("J-76 setup: firm A has two cases (A1, A2) and firm B one (B1), each with its case client", !!A1 && !!A2 && !!B1 && !!clientA1 && sql(`select count(*) from case_client where id = '${clientA1}'`) === "1", [a1.status, a2.status, b1.status]);
// Front office: a lead each, engaged into a prospect (FO-2), by each firm's Owner.
const prospectFor = async (t: string, given: string, email: string) => {
  const lead = await api(t, "POST", "/front-office/leads", { requestId: randomUUID(), source: "Phone call", givenNames: given, familyName: "Sample", email, confirmedNew: true });
  const leadId = lead.body?.id ?? sql(`select coalesce(max(l.id::text), '') from fo_lead l join fo_person p on p.id = l.person_id where lower(p.email) = lower('${email}')`);
  const eng = leadId ? await api(t, "POST", `/front-office/leads/${leadId}/engage`) : { status: 0, body: null };
  const prospectId = leadId ? sql(`select coalesce(max(id::text), '') from fo_prospect where lead_id = '${leadId}'`) : "";
  return { leadId: leadId as string, prospectId, status: [lead.status, eng.status] };
};
const pA = await prospectFor(tA, `Noor${run}`, `noor.${run}@example.org`), pA2 = await prospectFor(tA, `Ravi${run}`, `ravi.${run}@example.org`), pB = await prospectFor(tB, `Lina${run}`, `lina.${run}@example.org`);
ok("J-76 setup: firm A has two prospects and firm B one (FO-2, engaged from a lead)", !!pA.prospectId && !!pA2.prospectId && !!pB.prospectId, [pA.status, pA2.status, pB.status]);

const caseNote = `Sample case note ${run}: client called about the visitor visa`, caseNote2 = `Sample case note ${run}: client called about the visitor visa (corrected)`;
const personNote = `Sample person note ${run}: prefers email`, prospectNote = `Sample prospect note ${run}: asked about fees`;
const bCaseNote = `Firm B case note ${run}`, bProspectNote = `Firm B prospect note ${run}`;
const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 250 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
try {
  // ------------------------------------------------------------------------------------------- W1 a note on a case
  const added = await api(tA, "POST", `/runtime/cases/${A1}/notes`, { text: caseNote });
  const noteKey: string = added.body?.note?.id ?? added.body?.id ?? added.body?.noteKey ?? "";   // CS-NT1 part 1 answers { note: { id } }
  ok("J-76 W1 (part missing: CS-NT1 part 1, #2999): firm A's Owner adds a note to case A1 (201)", added.status === 201 && !!noteKey, { status: added.status, detail: added.body?.detail ?? null });
  const listA1 = await api(tA, "GET", `/runtime/cases/${A1}/notes`);
  const shown = lineWith(listA1.body, caseNote);
  ok("J-76 W1 (part missing: CS-NT1 part 1, #2999): the case's notes list it with who wrote it (the Owner's name) and when", listA1.status === 200 && !!shown && has(shown, R.name) && /\d{4}-\d{2}-\d{2}T/.test(JSON.stringify(shown)), { status: listA1.status });
  const stored = table("case_note") ? sql(`select count(*) || '|' || min(author) || '|' || (min(created_at) is not null) from case_note where case_id = '${A1}' and text = '${caseNote}'`) : "no case_note table";
  ok("J-76 W1 (part missing: CS-NT1 part 1, #2999): case_note holds it once, with its author (staff:<the Owner>) and the database's time", stored === `1|staff:${R.id}|true`, stored);

  // ------------------------------------------------------------------------------------------- W2 kept add-only
  const edited = noteKey ? await api(tA, "PUT", `/runtime/cases/${A1}/notes/${noteKey}/text`, { text: caseNote2, version: 1 }) : { status: 0, body: null };
  const hist = noteKey ? await api(tA, "GET", `/runtime/cases/${A1}/notes/${noteKey}/versions`) : { status: 0, body: null };
  ok("J-76 W2 (part missing: CS-NT1 part 1, #2999): an edit writes the next version and the first stays readable in the note's history", edited.status === 200 && hist.status === 200 && has(hist.body, caseNote) && has(hist.body, caseNote2), { edit: edited.status, history: hist.status });
  ok("J-76 W2 (part missing: CS-NT1 part 1, #2999): the database keeps both versions, the first unchanged", table("case_note") && sql(`select count(*) from case_note where case_id = '${A1}' and text in ('${caseNote}', '${caseNote2}')`) === "2" && sql(`select coalesce(min(text), '') from case_note where case_id = '${A1}' and version = 1`) === caseNote);
  ok("J-76 W2 fail (part missing: CS-NT1 part 1, #2999): the database refuses to change or remove a note version (UPDATE and DELETE on case_note)",
    table("case_note") && sql(`select count(*) from case_note where case_id = '${A1}'`) !== "0" && refused(`update case_note set text = 'changed' where case_id = '${A1}'`) && refused(`delete from case_note where case_id = '${A1}'`) && sql(`select count(*) from case_note where case_id = '${A1}' and text = 'changed'`) === "0");

  // ------------------------------------------------------------------------------------------- W3 or a person
  const onClient = await api(tA, "POST", `/runtime/clients/${clientA1}/notes`, { text: personNote });
  ok("J-76 W3 (part missing: CS-NT1 part 3, notes on a case client; the route is this journey's guess): firm A's Owner adds a note to the case client (a person)",
    onClient.status === 201 && column("case_note", "case_client_id") && sql(`select count(*) from case_note where case_client_id = '${clientA1}' and text = '${personNote}'`) === "1", { status: onClient.status, column: table("case_note") && column("case_note", "case_client_id") });
  const pNote = await api(tA, "POST", `/front-office/prospects/${pA.prospectId}/notes`, { text: prospectNote });
  const foRow = sql(`select count(*) || '|' || coalesce(min(n.by_actor), '') || '|' || (min(n.created_at) is not null) || '|' || coalesce(min(n.person_id::text), '') from fo_note n where n.firm_id = '${A}' and n.text = '${prospectNote}'`);
  const personOfProspect = sql(`select l.person_id from fo_prospect p join fo_lead l on l.id = p.lead_id where p.id = '${pA.prospectId}'`);
  ok("J-76 W3: a note on a prospect (FO-2 part 4, merged) is stored once on its person with who and when (fo_note)", pNote.status === 201 && foRow === `1|staff:${R.id}|true|${personOfProspect}`, { status: pNote.status, foRow });
  ok("J-76 W2 fail: the front office's notes are add-only too: the database refuses UPDATE and DELETE on fo_note (FO-1a)",
    refused(`update fo_note set text = 'changed' where text = '${prospectNote}'`) && refused(`delete from fo_note where text = '${prospectNote}'`) && sql(`select count(*) from fo_note where text = '${prospectNote}'`) === "1");

  // Firm B writes its own lines (for W7).
  const bCase = await api(tB, "POST", `/runtime/cases/${B1}/notes`, { text: bCaseNote });
  const bPros = await api(tB, "POST", `/front-office/prospects/${pB.prospectId}/notes`, { text: bProspectNote });
  ok("J-76 W7 setup: firm B's Owner writes a prospect note (FO-2, merged)", bPros.status === 201, bPros.status);
  ok("J-76 W7 setup (part missing: CS-NT1 part 1, #2999): firm B's Owner writes a note on its own case B1", bCase.status === 201, bCase.status);

  // ------------------------------------------------------------------------------------------- W4 each case its own timeline
  const tl1 = await api(tA, "GET", `/runtime/cases/${A1}/timeline`), tl2 = await api(tA, "GET", `/runtime/cases/${A2}/timeline`);
  const tlLine = lineWith(tl1.body, caseNote2) ?? lineWith(tl1.body, caseNote);
  ok("J-76 W4 (part missing: CS-NT1 part 3, GET cases/:id/timeline): case A1's timeline shows its note with who and when", tl1.status === 200 && !!tlLine && has(tlLine, R.name) && /\d{4}-\d{2}-\d{2}T/.test(JSON.stringify(tlLine)), { status: tl1.status });
  ok("J-76 W4 fail (part missing: CS-NT1 part 3): case A2's own timeline answers and never shows case A1's note", tl2.status === 200 && !has(tl2.body, caseNote) && !has(tl2.body, caseNote2), tl2.status);

  // ------------------------------------------------------------------------------------------- W5 each person its own timeline
  const ptl = await api(tA, "GET", `/case-clients/${clientA1}/timeline`);   // CS-NT1t's path
  ok("J-76 W5 (part missing: CS-NT1t, GET case-clients/:id/timeline): the case client's own timeline shows the note on that person",
    ptl.status === 200 && !!lineWith(ptl.body, personNote), ptl.status);

  // ------------------------------------------------------------------------------------------- W6 each prospect its own timeline
  const prTl = await api(tA, "GET", `/front-office/prospects/${pA.prospectId}/timeline`), prTl2 = await api(tA, "GET", `/front-office/prospects/${pA2.prospectId}/timeline`);
  const prLine = lineWith(prTl.body, prospectNote) as { kind?: string; actorName?: string; at?: string } | undefined;
  ok("J-76 W6: the prospect's own timeline (FO-2 part 4) shows its note with who (the Owner's name) and when", prTl.status === 200 && prLine?.kind === "NOTE" && prLine.actorName === R.name && !!prLine.at && !Number.isNaN(Date.parse(prLine.at)), { status: prTl.status, line: prLine ?? null });
  ok("J-76 W6 fail: another prospect's timeline (same firm) answers and never shows that note", prTl2.status === 200 && !has(prTl2.body, prospectNote), prTl2.status);

  // ------------------------------------------------------------------------------------------- W7 another firm's lines never appear
  const prTlAfter = await api(tA, "GET", `/front-office/prospects/${pA.prospectId}/timeline`), crossPr = await api(tA, "GET", `/front-office/prospects/${pB.prospectId}/timeline`);
  ok("J-76 W7: firm A's prospect timeline never shows firm B's prospect note, and firm A reading firm B's prospect timeline is 404 (its own is 200)",
    prTlAfter.status === 200 && !has(prTlAfter.body, bProspectNote) && crossPr.status === 404 && !has(crossPr.body, bProspectNote), [prTlAfter.status, crossPr.status]);
  const listA1b = await api(tA, "GET", `/runtime/cases/${A1}/notes`), crossNotes = await api(tA, "GET", `/runtime/cases/${B1}/notes`);
  ok("J-76 W7 (part missing: CS-NT1 part 1, #2999): firm A's case notes never show firm B's case note, and firm A reading case B1's notes is 404 (its own is 200)",
    listA1b.status === 200 && bCase.status === 201 && !has(listA1b.body, bCaseNote) && crossNotes.status === 404 && !has(crossNotes.body, bCaseNote), [listA1b.status, crossNotes.status]);
  const crossTl = await api(tA, "GET", `/runtime/cases/${B1}/timeline`);
  ok("J-76 W7 (part missing: CS-NT1 part 3): firm A's case timeline never shows firm B's note, and firm A reading case B1's timeline is 404 (its own is 200)",
    tl1.status === 200 && bCase.status === 201 && !has(tl1.body, bCaseNote) && crossTl.status === 404 && !has(crossTl.body, bCaseNote), [tl1.status, crossTl.status]);

  // ------------------------------------------------------------------------------------------- W8 by screens
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
  await ctx.addInitScript((x) => { sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })); localStorage.setItem("xr-actor", "user-R"); }, tA);
  const p: Page = await ctx.newPage(); p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(`${BASE}/cases/${A1}`);
  const caseReady = await p.locator("[data-case-decision]").waitFor({ timeout: 60_000 }).then(() => true, () => false);
  ok("J-76 W8: case A1's page opens for firm A's Owner (the case page, merged)", caseReady);
  const notesPanel = p.getByRole("region", { name: /notes/i });
  const sawPanel = await notesPanel.waitFor({ timeout: 10_000 }).then(() => true, () => false);
  const screenNote = `Sample screen note ${run}: documents promised Friday`;
  let addedOnScreen = false;
  if (sawPanel) {
    await notesPanel.getByRole("textbox").first().fill(screenNote);
    await notesPanel.getByRole("button", { name: /add note/i }).click();
    addedOnScreen = await notesPanel.getByText(screenNote).first().waitFor({ timeout: 15_000 }).then(() => true, () => false);
  }
  ok("J-76 W8 (part missing: CS-NT1 part 4, the notes and timeline panel on the case page): the Owner adds a note on the case page and it shows on the case's timeline, stored in case_note",
    sawPanel && addedOnScreen && table("case_note") && sql(`select count(*) from case_note where case_id = '${A1}' and text = '${screenNote}'`) === "1", { panel: sawPanel, shown: addedOnScreen });
  await p.goto(`${BASE}/front-office/prospects/${pA.prospectId}`);
  const sawProspect = await p.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 30_000 }).then(() => true, () => false);
  const onTimeline = sawProspect && (await p.getByText(prospectNote).first().waitFor({ timeout: 10_000 }).then(() => true, () => false));
  ok("J-76 W8 (part missing: FO-4 part 2b, the prospect page's notes and timeline): the prospect page shows its timeline with the note, and never firm B's",
    onTimeline && (await p.getByText(bProspectNote).count()) === 0, { page: sawProspect, note: onTimeline });
  ok("J-76: no page error during the walk", errors.length === 0, errors.slice(0, 5));
} finally {
  await browser.close();
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
