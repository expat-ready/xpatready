// J-69 (map row 69, R1.69: "Read log, fingerprint, keep-period reminder"), written by the qa lane (23 Nov) BEFORE its
// last part merges, so qa only has to run it when it does. Persona: the Sample firm's case officer, who opens a client's
// stored document, and the firm's representative (Owner), who reads who opened it and is reminded when a closed file's
// keep period ends; on an isolated copy of the running app (its own database and port, never :4400), by screens where
// they exist and on the routes and the database underneath.
// Done when (CAPABILITIES R1.69), word for word as the steps:
//   W1 "Each read of a document writes a line": the officer opens a stored document twice and the representative once
//      (GET /api/runtime/documents/:id/file, the route the case's "Open the document" button fetches; merged: C6.4 and
//      challenge M1): exactly one audit line per read ("viewed", entity "case document"), each naming who, when and which
//      document; a client and another firm read nothing and write no line. On screen, the document is opened from the
//      Documents panel: printed as a NOTE, not counted (CS-D5 is R1.68's part, not R1.69's; the read's line is already
//      proved through the file route above).
//   W2 (the same clause, the reading side): the "Read by" panel for holders of agent/document:view-access-log lists those
//      lines for the document, newest first (CS-D6 part 1: GET /api/runtime/documents/:id/reads is this journey's guess;
//      the brief names the panel, not the path); the case's client gets 403 and another firm 404 (counted only where
//      the representative's own read answers 200, so a missing route never passes as a wall); on screen, the panel shows
//      it on the document's line.
//   W3 "each file has a fingerprint": the stored sha256 equals the sha256 of the uploaded bytes, in the database, the
//      upload's answer and the checklist (merged: C6.4); the Documents panel shows "Fingerprint (SHA-256)" (CS-D6).
//   W4 (the same clause: a changed file is caught): a file edited on disk is refused on read (409, in words) and writes
//      no "viewed" line (merged: bytesOf); "Check the file is unchanged" answers unchanged for an intact file and a
//      mismatch for the edited one, each with one audit line (CS-D6 part 1: POST /api/runtime/documents/:id/check-unchanged,
//      this journey's guess).
//   W5 "a keep-period reminder fires": the representative saves "Keep closed client files for 6 years" (AUD-5 part 1,
//      #2008, merged) and KeepPeriodPort.forFirm reads it; the list "Documents past their keep period" shows the closed
//      case's document and never the open case's (CS-D6 part 1: GET /api/runtime/documents/past-keep-period, a guess).
//   W6 (the same clause, on the fake clock): CS-D6's weekly reminder (api/src/documents/keep-period.ts, the brief's
//      file; with PF-14's notifications) run on FakeClock + fakeJobs over 14 days (two weekly runs) reminds each
//      recipient at least once and at most once a week (never once a day) about the closed case's document and never
//      about the open case's. The service's shape is this journey's guess as well as its file: a class with register(),
//      built from { db, jobs, notifications, clock, keepPeriods }, register({ sweep: false }); qa aligns it when CS-D6 lands.
//   W7: the Documents panel at 400, 1024 and 1440 px: nothing cut off sideways, axe clean; no page error.
//   W8: the walk ends at R1.70's first step: the officer is on the document's line on the Documents panel, where R1.70's
//      expiry, translation and notarisation flags will show (CS-D7c, CS-D7; not judged here).
// Fails on main today only where a part is not merged (P-606); each failing label names its part: CS-D6 part 1 (reads
// panel, fingerprint shown, unchanged check, keep list), CS-D6's reminder (with PF-14), CS-D5 (the panel's open
// control, R1.68). Not walked (said): the "previewed" line (CS-D5's route is not named yet) and the "read by AI" line
// (a live read is paid; a replay needs a saved read for these synthetic bytes); Dispose is CS-D6 part 2 (with CS-X3).
// Labelled test data: the second case is closed by writing its closing fields as case-close.ts writes them, dated 7
// years ago (Sample). Sample values only; US$0, no model call, live AI off. Screenshots: product/screens/J-69/screenshots/.
// Run from prototype/ (HEADED=1 opens a visible browser, slowed):
//   zsh studio/tools/isolated.sh j69 4475 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j69 4475 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_69.ts j69 4475
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { textPdf } from "../../acceptance/lib/fixtures.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { KeepPeriods } from "../../api/src/platform/keep-period/service.ts";
import { FakeClock } from "../../ports/clock.ts";
import { fakeJobs, type JobHandler, type JobRun } from "../../ports/jobs.ts";
import { fakeNotifications } from "../../ports/notifications.ts";
import { client, recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [NAME, PORT] = [process.argv[2] ?? "j69", Number(process.argv[3] ?? 4475)];
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..", "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-69", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const HEADED = process.env.HEADED === "1";
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const { ok, summary } = recorder();
const { call } = client(PORT, DBNAME);
const PSQL = ["/opt/homebrew/opt/postgresql@18/bin/psql", "/usr/local/bin/psql", "/usr/bin/psql"].find((p) => existsSync(p)) ?? "psql";
const sql = (q: string) => execFileSync(PSQL, [`postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, "-X", "-q", "-Atc", q], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim().split("\n")[0].trim();
const run = Date.now().toString(36);
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const OFFICER = "user-O", REP = "user-R", CLIENT = "user-P", OTHER_FIRM = "user-S";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });

// ------------------------------------------------------------------------------------------------ setup (Sample)
await seedSampleFirms(db);
const firmA = sql(`select id from platform_firm where key = 'sample-firm'`);
const vv = () => sql(`select c.id from combination c where c.combination_key = 'vv.single' and exists (select 1 from config_release r where r.combination_id = c.id and r.status = 'RELEASED')`);
if (!vv()) await call("POST", "/demo/load", { sample: "configured" }, "user-A");
const VV = vv();
const openCase = async (n: string) => (await call("POST", "/runtime/cases", { combinationId: VV, reference: `J69-${run}-${n}`, clientActor: CLIENT, principal: { displayName: `Sample Client J69 ${n}` }, representative: REP, caseOfficers: [OFFICER] }, OFFICER)).body?.id as string | undefined;
const caseA = await openCase("A"), caseB = await openCase("B");
type Line = { id: string; label: string; state: string; documents: { id: string; file_name: string; sha256?: string; current: boolean }[] };
const linesOf = async (caseId: string) => ((await call("GET", `/runtime/cases/${caseId}/checklist`, undefined, OFFICER)).body?.people as { subject: string; lines: Line[] }[] | undefined)?.[0]?.lines ?? [];
const [lineA, lineA2] = (await linesOf(caseA ?? "")).filter((l) => l.state === "not_requested");
const [lineB] = (await linesOf(caseB ?? "")).filter((l) => l.state === "not_requested");
ok("J-69 setup: the Visitor visa is released; two cases of the Sample firm (A open, B to be closed), each with a document line not yet requested", !!VV && !!caseA && !!caseB && !!lineA && !!lineA2 && !!lineB, { VV, caseA, caseB });
const pdf = (n: string) => new Uint8Array(textPdf(["SYNTHETIC SPECIMEN - MADE-UP TEST DOCUMENT - NOT VALID", `Sample synthetic document (J-69 ${n} ${run})`]));
const upload = async (line: string, bytes: Uint8Array, name: string) => {
  const fd = new FormData(); fd.append("file", new Blob([bytes as Uint8Array<ArrayBuffer>]), name);
  const r = await fetch(`${BASE}/api/runtime/checklist-lines/${line}/documents`, { method: "POST", headers: { "x-actor": OFFICER }, body: fd });
  const b = await r.json().catch(() => null) as { document?: { id: string; sha256: string } } | null;
  return { status: r.status, id: b?.document?.id ?? "", sha256: b?.document?.sha256 ?? "" };
};
const BYTES_A = pdf("A"), BYTES_T = pdf("T"), BYTES_B = pdf("B");
const docA = await upload(lineA.id, BYTES_A, "passport.pdf"), docT = await upload(lineA2.id, BYTES_T, "bank-statements.pdf"), docB = await upload(lineB.id, BYTES_B, "passport.pdf");
ok("J-69 setup: the officer uploads three Sample PDFs (two on case A, one on case B), each stored", [docA, docT, docB].every((d) => d.status === 201 && !!d.id), [docA.status, docT.status, docB.status]);
// Labelled test data: case B closed 7 years ago (its closing fields as case-close.ts writes them).
sql(`update runtime_case set status = 'CLOSED', close_outcome = 'CLOSED_BY_STAFF', closed_reason = 'Sample (J-69): closed for the keep-period walk', closed_at = now() - interval '7 years' where id = '${caseB}'`);
const signIn = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email: sql(`select email from platform_staff where actor_id = '${REP}'`), secondStep: true }) });
const repTok = ((await signIn.json()) as { token?: string }).token;
if (!repTok) { console.error("STOP  local sign-in refused (start the copy with PLATFORM_IDENTITY=local)"); process.exit(2); }
// CS-D6 part 1's routes sit behind PF-4's guard (a staff session, not x-actor; qa 24 Nov, journey drift on main f0bc60179):
// the Owner (R), the Case Officer (O, no view-access-log key) and the other firm's Owner (S) sign in like repTok above.
const tokenOf = async (actor: string, firmKey = "sample-firm") => ((await (await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey, email: sql(`select email from platform_staff where actor_id = '${actor}' and firm_id = (select id from platform_firm where key = '${firmKey}')`), secondStep: true }) })).json().catch(() => ({}))) as { token?: string }).token ?? null;
const officerTok = await tokenOf(OFFICER), otherTok = await tokenOf(OTHER_FIRM, "sample-solo");
const staffCall = async (method: string, path: string, token: string | null, body?: unknown) => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }).catch(() => null);
  return { status: r?.status ?? 0, body: (await r?.json().catch(() => null)) as any };
};
const viewed = (doc: string) => sql(`select count(*) from audit_event where action = 'viewed' and entity = 'case document' and entity_key = '${doc}'`);
const fileOf = (doc: string) => execFileSync("find", [join(STUDIO, "var", `isolated-${NAME}`), "-type", "f", "-path", `*/${sql(`select path from case_document where id = '${doc}'`)}`], { encoding: "utf8" }).trim().split("\n").filter(Boolean)[0] ?? "";

const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 250 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
try {
  // ---------------------------------------------------------------------------------------------- W1 each read writes a line
  const t0 = sql(`select now()`), before = Number(viewed(docA.id));
  const reads = [await call("GET", `/runtime/documents/${docA.id}/file`, undefined, OFFICER), await call("GET", `/runtime/documents/${docA.id}/file`, undefined, OFFICER), await call("GET", `/runtime/documents/${docA.id}/file`, undefined, REP)];
  const lines = sql(`select coalesce(string_agg(actor || '|' || entity_key || '|' || (at >= '${t0}'::timestamptz and at <= now())::text, ';' order by at), '') from audit_event where action = 'viewed' and entity = 'case document' and entity_key = '${docA.id}'`).split(";").filter(Boolean);
  ok("J-69 W1: three reads of case A's document (the officer twice, the representative once) write exactly three 'viewed' lines, each naming who, which document and when (inside the walk)",
    reads.every((r) => r.status === 200) && Number(viewed(docA.id)) === before + 3 && lines.length === 3 && lines.filter((l) => l.startsWith(`${OFFICER}|${docA.id}|true`)).length === 2 && lines.filter((l) => l.startsWith(`${REP}|${docA.id}|true`)).length === 1, { statuses: reads.map((r) => r.status), lines });
  const n1 = viewed(docA.id);
  const byClient = await call("GET", `/runtime/documents/${docA.id}/file`, undefined, CLIENT), byOther = await call("GET", `/runtime/documents/${docA.id}/file`, undefined, OTHER_FIRM);
  ok("J-69 W1 fail: the case's client (403) and another firm's representative (404) read nothing, and no line is written", [403, 404].includes(byClient.status) && byOther.status === 404 && viewed(docA.id) === n1, { client: byClient.status, otherFirm: byOther.status });

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: BASE, colorScheme: "light", reducedMotion: "reduce" });
  await ctx.addInitScript((a) => { try { localStorage.setItem("xr-actor", a); } catch { /* private window */ } }, REP);
  const p: Page = await ctx.newPage(); p.on("pageerror", (e) => errors.push(String(e)));
  const panel = p.locator("[data-documents-panel]"), row = p.locator(`[data-line="${lineA.id}"]`);
  const open = async () => { await p.goto(`/cases/${caseA}`); await panel.waitFor({ timeout: 30_000 }); await row.filter({ hasText: "passport.pdf" }).waitFor({ timeout: 30_000 }); };
  await open();
  // Line actions live in the line's ⋯ menu (checklist.tsx); CS-D5 may put "Open" there, or on the row.
  const OPEN = /open|view|preview|download/i, menu = row.locator("[data-line-menu]");
  let opener = row.getByRole("button", { name: OPEN }).or(row.getByRole("link", { name: OPEN }));
  if (!(await opener.count()) && (await menu.count())) { await menu.first().click(); opener = p.getByRole("menuitem", { name: OPEN }); }
  const n2 = Number(viewed(docA.id)), controls = await opener.count();
  if (controls) { await opener.first().click(); await p.waitForTimeout(1500); } else await p.keyboard.press("Escape");
  // NOTE, not counted: opening from the panel is CS-D5's (R1.68); R1.69's clause is proved by the reads above.
  console.log(`NOTE  J-69 W1 on screen (CS-D5, R1.68's viewer): open control on the line ${controls ? "found" : "not found"}; lines added by opening it: ${Number(viewed(docA.id)) - n2}`);
  await panel.screenshot({ path: join(SHOTS, "w1-documents-panel-1440.png") });

  // ---------------------------------------------------------------------------------------------- W2 the "Read by" panel
  const log = await staffCall("GET", `/runtime/documents/${docA.id}/reads`, repTok);
  const items: { who?: string; at?: string; action?: string }[] = log.body?.lines ?? [];
  const ats = items.map((x) => Date.parse(x.at ?? ""));
  ok("J-69 W2 (CS-D6 part 1): the representative (Owner, signed in) reads the document's 'Read by' list: every read, who and when, newest first",
    log.status === 200 && items.length >= 3 && items.filter((x) => x.action === "viewed" && /Case officer/.test(x.who ?? "")).length >= 2 && ats.every((t, i) => Number.isFinite(t) && (i === 0 || t <= ats[i - 1])), { status: log.status, n: items.length });
  // The client is not staff: with no staff session the route answers 401 (CS-D6 DW2), and lists nothing.
  const logOfficer = await staffCall("GET", `/runtime/documents/${docA.id}/reads`, officerTok), logClient = await call("GET", `/runtime/documents/${docA.id}/reads`, undefined, CLIENT), logOther = await staffCall("GET", `/runtime/documents/${docA.id}/reads`, otherTok);
  ok("J-69 W2 fail (CS-D6 part 1): without agent/document:view-access-log the case officer gets 403, the case's client (no staff session) 401, another firm's Owner 404; none sees a line (counted only where the representative's read answers 200)",
    log.status === 200 && !!officerTok && !!otherTok && logOfficer.status === 403 && logClient.status === 401 && logOther.status === 404 && ![logOfficer, logClient, logOther].some((x) => Array.isArray(x.body?.lines)), { rep: log.status, officer: logOfficer.status, client: logClient.status, otherFirm: logOther.status });
  // On screen (CS-D6 part 1): the line's ⋯ → "File details…" opens a dialog that asks for the staff sign-in inline.
  const dialog = p.getByRole("dialog");
  await row.locator("[data-line-menu]").first().click(); await p.locator('[data-action="file-details"]').click();
  await dialog.locator("[data-document-reads]").first().waitFor({ timeout: 15_000 }).catch(() => undefined);
  if (await dialog.locator("[data-sign-in-card]").isVisible().catch(() => false)) {
    await dialog.getByLabel("Firm key").fill("sample-firm"); await dialog.getByLabel("Work email").fill(sql(`select email from platform_staff where actor_id = '${REP}'`));
    await dialog.getByRole("button", { name: "Sign in" }).click();
  }
  const readLines = await dialog.locator("[data-read-lines]").waitFor({ timeout: 30_000 }).then(() => dialog.locator("[data-read-lines] li").allInnerTexts(), () => [] as string[]);
  const readBy = (await dialog.locator("[data-read-by]").first().innerText().catch(() => "")).replace(/\s+/g, " ");
  ok("J-69 W2 (CS-D6 part 1, on screen): the line's File details shows 'Read by' with the case officer's openings, newest first, in words", /Read by/i.test(readBy) && readLines.filter((l) => /Case officer/.test(l) && /Opened the file/.test(l)).length >= 2, { readLines: readLines.slice(0, 4), readBy: readBy.slice(0, 200) });
  await dialog.screenshot({ path: join(SHOTS, "w2-file-details-read-by-1440.png") }).catch(() => undefined);

  // ---------------------------------------------------------------------------------------------- W3 each file has a fingerprint
  const shown = (await linesOf(caseA!)).find((l) => l.id === lineA.id)?.documents.find((d) => d.id === docA.id);
  ok("J-69 W3: case A's document's fingerprint is the sha256 of the uploaded bytes: in the database, the upload's answer and the checklist",
    sql(`select sha256 from case_document where id = '${docA.id}'`) === sha(BYTES_A) && docA.sha256 === sha(BYTES_A) && shown?.sha256 === sha(BYTES_A) && sha(BYTES_A) !== sha(BYTES_T), { stored: sql(`select sha256 from case_document where id = '${docA.id}'`), uploaded: sha(BYTES_A) });
  const dlgText = (await dialog.innerText().catch(() => "")).replace(/\s+/g, " "), fp = (await dialog.locator("[data-fingerprint]").first().textContent().catch(() => ""))?.trim();
  ok("J-69 W3 (CS-D6 part 1, on screen): the line's File details shows 'Fingerprint (SHA-256)' with the file's own full hash", /Fingerprint \(SHA-256\)/i.test(dlgText) && fp === sha(BYTES_A), { fp, label: /Fingerprint \(SHA-256\)/i.test(dlgText) });
  await p.keyboard.press("Escape");

  // ---------------------------------------------------------------------------------------------- W4 a changed file is caught
  // One session per person (PF-4): the dialog's sign-in above ended repTok's session, so the representative signs in again.
  const repTok2 = await tokenOf(REP);
  const check = (doc: string) => staffCall("POST", `/runtime/documents/${doc}/check-unchanged`, repTok2, {});
  const checks = () => Number(sql(`select count(*) from audit_event where entity = 'case document' and entity_key in ('${docA.id}', '${docT.id}') and action not in ('viewed', 'uploaded')`));
  const c0 = checks(), intact = await check(docA.id);
  ok("J-69 W4 (CS-D6 part 1, the unchanged check): 'Check the file is unchanged' answers unchanged for the intact file and writes one audit line",
    intact.status === 200 && intact.body?.unchanged === true && intact.body?.found_sha256 === sha(BYTES_A) && checks() === c0 + 1, { status: intact.status, body: intact.body });
  const disk = fileOf(docT.id);
  if (disk) appendFileSync(disk, "\n% tampered (J-69)\n");
  const vT = viewed(docT.id), tampered = await call("GET", `/runtime/documents/${docT.id}/file`, undefined, OFFICER);
  ok("J-69 W4: a file edited on disk is caught on read: 409 in words ('changed on disk'), and no 'viewed' line is written", !!disk && tampered.status === 409 && /changed on disk/.test(tampered.body?.detail ?? JSON.stringify(tampered.body)) && viewed(docT.id) === vT, { disk: !!disk, status: tampered.status, detail: tampered.body?.detail });
  const c1 = checks(), mismatch = await check(docT.id);
  ok("J-69 W4 (CS-D6 part 1): the unchanged check shows a mismatch for the edited file and writes one audit line",
    mismatch.status === 200 && mismatch.body?.unchanged === false && mismatch.body?.found_sha256 !== mismatch.body?.sha256 && checks() === c1 + 1, { status: mismatch.status, body: mismatch.body });

  // ---------------------------------------------------------------------------------------------- W5 keep period and its list
  const saved = await fetch(`${BASE}/api/platform/keep-periods/closed-client-files`, { method: "PUT", headers: { "content-type": "application/json", authorization: `Bearer ${repTok2}` }, body: JSON.stringify({ years: 6 }) });
  const forFirm = await new KeepPeriods(db).forFirm(firmA);
  ok("J-69 W5: the representative saves 'Keep closed client files for 6 years' (AUD-5 part 1, #2008) and KeepPeriodPort.forFirm reads 6 from the firm setting", saved.status === 200 && forFirm.closedClientFilesYears === 6 && forFirm.source === "firm setting", { status: saved.status, forFirm });
  const past = await call("GET", `/runtime/documents/past-keep-period`, undefined, REP);
  const listed = JSON.stringify(past.body ?? "");
  ok("J-69 W5 (missing: CS-D6 part 1, the keep list; the path is a guess): 'Documents past their keep period' lists closed case B's document (closed 7 years ago) and never open case A's",
    past.status === 200 && listed.includes(docB.id) && !listed.includes(docA.id) && !listed.includes(docT.id), { status: past.status, detail: past.body?.detail });

  // ---------------------------------------------------------------------------------------------- W6 the reminder, on the fake clock
  const clock = new FakeClock(new Date()), jobs = fakeJobs(clock), inner = fakeNotifications({ now: () => clock.now() });
  const told: { staffId: string; kind: string; item: string; id: string }[] = [], handlers = new Map<string, JobHandler>();
  const notifications = { ...inner, async notify(tx: unknown, r: { staffId: string }, k: Parameters<typeof inner.notify>[2], i: Parameters<typeof inner.notify>[3]) { told.push({ staffId: r.staffId, kind: k, item: i.kind, id: i.id }); return inner.notify(tx, r, k, i); } };
  const watched = { ...jobs, async handle(n: string, h: JobHandler) { handlers.set(n, h); return jobs.handle(n, h); }, get jobs() { return jobs.jobs; } };
  const KEEP_MODULE = "../../api/src/documents/keep-period.ts";   // CS-D6's file (its brief's touch list); a variable, so the type check does not need it yet
  let built = "";
  try {
    const mod = await import(KEEP_MODULE) as Record<string, unknown>;
    const Svc = Object.values(mod).find((v) => typeof v === "function" && typeof (v as { prototype?: { register?: unknown } }).prototype?.register === "function") as (new (p: unknown) => { register(o?: unknown): Promise<void> }) | undefined;
    if (Svc) { await new Svc({ db, jobs: watched, notifications, clock, keepPeriods: new KeepPeriods(db, undefined, () => clock.now()) }).register({ sweep: false }); built = "registered"; } else built = "no service with register() in the module";
  } catch (e) { built = `not built: ${String((e as Error).message ?? e).split("\n")[0].slice(0, 120)}`; }
  for (let d = 0; d < 14; d++) await clock.advance({ days: 1 });
  const aboutB = told.filter((t) => /keep/i.test(t.kind) && [docB.id, caseB].includes(t.id)), aboutA = told.filter((t) => [docA.id, docT.id, caseA].includes(t.id));
  const perPerson = new Map<string, number>(); for (const t of aboutB) perPerson.set(`${t.staffId}|${t.id}`, (perPerson.get(`${t.staffId}|${t.id}`) ?? 0) + 1);
  ok("J-69 W6 (missing: CS-D6's weekly reminder, with PF-14): on the fake clock over 14 days, the keep-period reminder reaches each recipient at least once and at most once a week (1-2, never once a day) about closed case B's document, never about open case A's",
    built === "registered" && aboutB.length > 0 && [...perPerson.values()].every((n) => n >= 1 && n <= 2) && aboutA.length === 0, { built, jobs: watched.jobs.length, aboutB: aboutB.length, perPerson: [...perPerson.values()], aboutA: aboutA.length });
  // A redelivered job (the same run handed over again) adds no second reminder.
  const done = jobs.jobs.filter((x) => x.status === "done" && handlers.has(x.name)), before6 = new Set(inner.sent().map((r) => `${r.staffId}|${r.item.id}|${r.kind}`)).size;
  for (const x of done) await handlers.get(x.name)!({ name: x.name, payload: x.payload, key: x.key, firmId: x.firmId, runAt: x.runAt, attempt: x.attempt + 1 } as JobRun).catch(() => undefined);
  ok("J-69 W6 (missing: CS-D6's weekly reminder): a redelivered reminder job adds no second reminder for the same person and document", built === "registered" && done.length > 0 && aboutB.length > 0 && new Set(inner.sent().map((r) => `${r.staffId}|${r.item.id}|${r.kind}`)).size === before6, { built, done: done.length });

  // ---------------------------------------------------------------------------------------------- W7 sizes, axe, errors
  for (const width of [400, 1024, 1440]) {
    await p.setViewportSize({ width, height: 900 }); await open(); await p.waitForTimeout(300);
    const wide = await p.evaluate(() => { const el = document.querySelector("[data-documents-panel]")!; return { panel: el.scrollWidth - el.clientWidth, page: document.documentElement.scrollWidth - document.documentElement.clientWidth, right: el.getBoundingClientRect().right - window.innerWidth }; });
    const axe = await new AxeBuilder({ page: p }).include("[data-documents-panel]").withTags(TAGS).analyze();
    ok(`J-69 W7: the Documents panel at ${width} px: nothing cut off sideways, axe clean`, wide.panel <= 1 && wide.page <= 1 && wide.right <= 1 && axe.violations.length === 0, { wide, axe: axe.violations.map((v) => `${v.id} (${v.nodes.length})`) });
    await panel.screenshot({ path: join(SHOTS, `w7-documents-panel-${width}.png`) });
  }
  ok("J-69 W7: no page error in the browser", errors.length === 0, errors);

  // ---------------------------------------------------------------------------------------------- W8 R1.70's first step
  await p.setViewportSize({ width: 1440, height: 900 }); await open();
  ok("J-69 W8: the walk ends at R1.70's first step: case A's document is on its line on the Documents panel, where its expiry, translation and notarisation flags will show (CS-D7c, CS-D7)",
    ((await row.innerText()) ?? "").includes("passport.pdf") && (await row.getAttribute("data-state")) === "received", await row.getAttribute("data-state"));
  await ctx.close();
} finally {
  await browser.close(); await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
