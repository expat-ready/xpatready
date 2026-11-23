// J-106 (map row 106, R1.106: pathway assessment AS-1, Express Entry and FSW scores), written by the qa lane (Track B,
// A286, 22 Nov) as the row's re-walk on today's main and the journey qa runs when its last part merges. On an isolated
// copy of the running app (its own database and port, never :4400).
// Done when (CAPABILITIES R1.106): "Answers give the scores from cited official rules (page, quote, date, P-170), each
// score with its parts; a missing answer says what is needed".
// Parts (MVP-CHECKLIST row 106): AS-1m (merged #2105: EligibilityPort and its configurator door), AS-1g (score grids as
// cited data), AS-1s (the scoring rules), AS-1c (Express Entry's FSW gates and the FSW and CRS grids, cited, released),
// FO-15a, FO-15b, FO-15s (the lead's assessment: record, API, panel), CS-106c (the case's assessment shows the scores).
//   W0 (AS-1m, the door): the configurator's EligibilityPort answers on the copy's own releases: a list (no error), an
//       unknown release refused by name, never a guessed result.
//   W1 (cited official rules): Express Entry (FSW) is assessable: its release is listed by the door, and its score grids
//       are stored as data with a source on every factor and band (IRCC page, quote, date; P-170). FAILS today: AS-1g,
//       AS-1c.
//   W2 (answers give the scores, each with its parts): assessing a person's answers against that release gives the FSW
//       grid (total, pass mark gap) and the CRS grid (total), each with one line per factor (points, maximum, source).
//       FAILS today: AS-1s, AS-1c.
//   W3 (a missing answer says what is needed): the same assessment with an answer left out names the missing fact, and
//       its score line reads "missing" (points null, shown "—"), never an earned 0. FAILS today: AS-1s, AS-1c.
//   W4 (on the lead, by the firm's staff): a lead's Assessment routes list the assessable programs and run it (FO-15a,
//       FO-15b; the panel FO-15s). FAILS today.
//   W5 (on the case): the case's assessment stores and returns the scores (CS-106c). FAILS today.
// Score values are never written here: every number comes from the release's cited grids (AGENTS rule 4, P-170); this
// walk asserts the shape and the citations, not points it would have to invent.
// Configuration loaded by Demo › Reset to the six (Load sample; the configuration is not under test, P-33); firms by
// seedSampleFirms. US$0, no model call, live AI off. Run from prototype/:
//   zsh studio/tools/isolated.sh j106 4476 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j106 4476 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_106.ts j106 4476
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ConfiguratorEligibility, prismaReleases } from "../../api/src/configurator/eligibility.door.ts";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { EligibilityRefused, type AssessableRelease, type EligibilityResult } from "../../ports/eligibility.port.ts";
import { recorder } from "../runtime/api.ts";

const NAME = process.argv[2] ?? "j106", PORT = Number(process.argv[3] ?? 4476), DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`;
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const STUDIO = join(import.meta.dirname, "..", "..");
const { ok, summary } = recorder();
const PSQL = ["/opt/homebrew/opt/postgresql@18/bin/psql", "/usr/local/bin/psql", "/usr/bin/psql"].find((p) => existsSync(p)) ?? "psql";
const sql = (q: string) => execFileSync(PSQL, [`postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, "-X", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- answers read loosely, as the other journeys
const j = async (method: string, path: string, body?: unknown, h: Record<string, string> = {}): Promise<{ status: number; body: any }> => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { "content-type": "application/json", ...h }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let b: unknown = t; try { b = JSON.parse(t); } catch { /* text */ } return { status: r.status, body: b };
};
const EE = /express.?entry|federal skilled worker|\bfsw\b/i;

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
try {
  // Setup: the six Sample programs (Load sample), the two Sample firms.
  const six = await j("POST", "/api/demo/reset-to-six", { confirm: "RESET" }, { "x-actor": "user-A" });
  await seedSampleFirms(db); await seedSampleFirmsFrontOffice(db);
  ok("setup: Demo › Reset to the six loads the Sample programs; the Sample firms are seeded", six.status === 200 || six.status === 201, { status: six.status, sample: six.body?.sample });
  const workspace = sql(`select workspace_id from combination limit 1`);
  const door = new ConfiguratorEligibility(prismaReleases(db, workspace));

  // ------------------------------------------------------------------------------------------ W0: AS-1m's door answers
  let list: AssessableRelease[] | string = "not read";
  try { list = await door.listAssessable(); } catch (e) { list = String(e); }
  ok("R1.106 W0 (AS-1m): the EligibilityPort door lists the releases a person can be assessed against (a list, no error)", Array.isArray(list), list);
  let unknown = "";
  try { await door.assess({ release_id: globalThis.crypto.randomUUID(), persons: [{ role: "principal", known: {} }] }); } catch (e) { unknown = e instanceof EligibilityRefused ? e.code : String(e); }
  ok("R1.106 W0 fail (AS-1m): an unknown release is refused by name (RELEASE_NOT_FOUND), never a guessed result", unknown === "RELEASE_NOT_FOUND", unknown);

  // ------------------------------------------------------------------------------------------ W1: cited official rules
  const ee = Array.isArray(list) ? list.find((r) => EE.test(r.name)) : undefined;
  const eeCombination = sql(`select coalesce(string_agg(combination_key, ','), '') from combination where combination_key like '%express_entry%'`);
  ok("R1.106 W1 (missing: AS-1c, Express Entry's FSW gates and grids released): Express Entry (FSW) is listed as assessable",
    !!ee, { assessable: Array.isArray(list) ? list.map((r) => r.name) : list, expressEntryCombinations: eeCombination || "none" });
  const gridTables = sql(`select coalesce(string_agg(table_name, ','), '') from information_schema.tables where table_schema = 'public' and table_name in ('score_ruleset', 'score_factor', 'score_band', 'language_conversion')`);
  const uncited = gridTables.includes("score_band") ? sql(`select (select count(*) from score_factor where coalesce(source_ref, '') = '') + (select count(*) from score_band where coalesce(source_ref, '') = '')`) : "no tables";
  const grids = gridTables.includes("score_ruleset") ? sql(`select coalesce(string_agg(key || ':' || coalesce(source_ref, ''), ' | '), '') from score_ruleset`) : "";
  ok("R1.106 W1 (missing: AS-1g score grids as data, AS-1c the FSW and CRS grids): the FSW and CRS grids are stored with a source on every factor and band (IRCC page, quote, date; P-170)",
    gridTables.split(",").length === 4 && uncited === "0" && /fsw/i.test(grids) && /crs/i.test(grids) && /canada\.ca/.test(grids) && /\d{4}-\d{2}-\d{2}/.test(grids), { gridTables: gridTables || "none", uncited, grids: grids.slice(0, 300) || "none" });

  // ------------------------------------------------------------------------------------------ W2 and W3: scores and what is missing
  let full: EligibilityResult | string = "no Express Entry release to assess (AS-1c)", gap: EligibilityResult | string = full;
  if (ee) {
    const facts = await door.requiredFacts(ee.release_id);
    // The answers: every fact the release asks, as a Sample person who answered them; values chosen from each fact's own list.
    const known: Record<string, unknown> = {};
    for (const f of facts.facts.filter((x) => x.role === "principal")) known[f.key] = (f as { values?: string[] }).values?.[0] ?? "Sample";
    try { full = await door.assess({ release_id: ee.release_id, persons: [{ role: "principal", known }] }); } catch (e) { full = String(e); }
    const leftOut = Object.keys(known)[0];
    const fewer = { ...known }; delete fewer[leftOut];
    try { gap = await door.assess({ release_id: ee.release_id, persons: [{ role: "principal", known: fewer }] }); } catch (e) { gap = String(e); }
  }
  const scores = typeof full === "object" ? full.scores : [];
  const lineOk = (l: { points: number | null; max: number | null; source_ref: string | null }) => l.max !== null && !!l.source_ref;
  ok("R1.106 W2 (missing: AS-1s scoring rules, AS-1c grids): the answers give the FSW and CRS scores, each with its parts (one line per factor: points, maximum, source)",
    scores.some((g) => /fsw/i.test(g.grid)) && scores.some((g) => /crs/i.test(g.grid)) && scores.every((g) => g.lines.length > 0 && g.lines.every(lineOk) && g.total === g.lines.reduce((s, l) => s + (l.points ?? 0), 0)),
    typeof full === "object" ? { outcome: full.outcome, scores: full.scores } : full);
  const missingLine = typeof gap === "object" ? gap.scores.flatMap((g) => g.lines).some((l) => l.points === null) : false;
  ok("R1.106 W3 (missing: AS-1s, AS-1c): an answer left out is named as missing, and its score line reads missing (no points), never an earned 0",
    typeof gap === "object" && gap.missing_facts.length > 0 && gap.reasons.some((r) => r.kind === "FACT_MISSING") && missingLine,
    typeof gap === "object" ? { outcome: gap.outcome, missing: gap.missing_facts, missingLine } : gap);

  // ------------------------------------------------------------------------------------------ W4: on the lead (FO-15)
  const owner = sql(`select email from platform_staff where actor_id = 'user-R'`);
  const token = (await j("POST", "/api/platform/session/local", { firmKey: "sample-firm", email: owner, secondStep: true })).body?.token as string | undefined;
  const auth = token ? { authorization: `Bearer ${token}` } : {};
  const lead = await j("POST", "/api/front-office/leads", { requestId: globalThis.crypto.randomUUID(), givenNames: "Client", familyName: "A", email: `client.a.${Date.now()}@example.com`, source: "Phone call (Sample)" }, auth);
  const person = String(lead.body?.personId ?? lead.body?.person?.id ?? sql(`select coalesce(person_id::text, '') from fo_lead where id = '${lead.body?.id ?? "00000000-0000-0000-0000-000000000000"}'`));
  ok("setup: the firm's Owner adds a lead (Client A)", lead.status === 201 && !!person, { status: lead.status, person });
  const assessable = await j("GET", `/api/front-office/people/${person}/assessment/assessable`, undefined, auth);
  const tables = sql(`select coalesce(string_agg(table_name, ','), '') from information_schema.tables where table_schema = 'public' and table_name in ('fo_assessment', 'fo_assessment_fact')`);
  ok("R1.106 W4 (missing: FO-15a the lead's assessment record, FO-15b its routes, FO-15s the panel): the lead's Assessment lists the assessable programs (Express Entry among them)",
    assessable.status === 200 && tables.split(",").length === 2 && JSON.stringify(assessable.body).match(EE) !== null, { status: assessable.status, tables: tables || "none" });

  // ------------------------------------------------------------------------------------------ W5: on the case (CS-106c)
  const caseSide = readFileSync(join(STUDIO, "api", "src", "assessments.ts"), "utf8");
  ok("R1.106 W5 (missing: CS-106c): the case's assessment stores and returns AS-1's scores beside the lead's frozen result", /\bscores\b/.test(caseSide) && /From the lead/.test(caseSide + readFileSync(join(STUDIO, "web", "src", "runtime", "eligibility.tsx"), "utf8")), "api/src/assessments.ts stores no scores; no \"From the lead\" on the case's assessment page");
} finally {
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
