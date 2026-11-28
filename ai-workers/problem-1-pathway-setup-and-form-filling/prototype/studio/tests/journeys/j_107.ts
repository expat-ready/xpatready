// J-107 (map row 107, R1.107: pathway assessment AS-2, five provincial streams, client copy), written by the R1.107
// builder in AS-2a (shape: product/screens/AS-2/shape.md, approved by Lead 5 on #3663, 25 Nov). On an isolated copy of
// the running app (its own database and port, never :4400).
// Done when (CAPABILITIES R1.107): "Each stream says eligible or not with its cited rule; a client copy can be sent".
// Parts: AS-2a (cited gates, assessment-only releases, rule lines on EligibilityPort), AS-2d1 (Ontario, British Columbia,
// Saskatchewan), AS-2d2 (Alberta, Manitoba), FO-15a and FO-15b (the lead's stored assessment), AS-2c and AS-2cs (the
// client copy). Each stream's file is samples/provincial-streams/<province>.json (AS-2d1, AS-2d2): its combination key and
// two worked profiles, "eligible" and "not" (with the gate the "not" profile fails).
//   W1 (AS-2d1, AS-2d2): the door lists the five provincial releases, each assessment only.
//   W2: for each stream, the eligible profile gives LIKELY_ELIGIBLE and every rule it rests on is met, each with its
//       official page, section, quote and date (or labelled Sample).
//   W3: for each stream, the "not" profile gives NOT_ELIGIBLE naming its failed rule, with that rule's quote (BR-6, AG-3-13).
//   W4: Open a case on a provincial release is refused in words: "Assessment only: no forms" (P-650 (2)).
//   W5 (FO-15a, FO-15b, AS-2c, AS-2cs): a reviewed assessment on a prospect gives a client copy with the disclaimer.
// Immigration values are never written here: each comes from the stream's file, cited (AGENTS rule 4, P-170).
// Configuration by Demo › Reset to the six (the provincial streams load with it once AS-2d1 lands). US$0, live AI off. Run from prototype/:
//   zsh studio/tools/isolated.sh j107 4477 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j107 4477 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_107.ts j107 4477
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ConfiguratorEligibility, prismaReleases } from "../../api/src/configurator/eligibility.door.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import type { AssessableRelease, AssessInput, RuleLine } from "../../ports/eligibility.port.ts";
import { recorder } from "../runtime/api.ts";

const NAME = process.argv[2] ?? "j107", PORT = Number(process.argv[3] ?? 4477), DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`;
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

/** The five streams (P-607 (9), shape §"The five streams"), by the file each data part adds. */
const STREAMS = [
  { file: "on", province: "Ontario", part: "AS-2d1" }, { file: "bc", province: "British Columbia", part: "AS-2d1" }, { file: "sk", province: "Saskatchewan", part: "AS-2d1" },
  { file: "ab", province: "Alberta", part: "AS-2d2" }, { file: "mb", province: "Manitoba", part: "AS-2d2" },
] as const;
type StreamFile = { combination_key: string; profiles: { eligible: AssessInput["persons"]; not: AssessInput["persons"]; not_fails: string } };
const fileOf = (f: string): StreamFile | null => { const p = join(STUDIO, "samples", "provincial-streams", `${f}.json`); return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) as StreamFile : null; };
const cited = (r: RuleLine) => !!r.source && ("sample" in r.source || (/^https:\/\//.test(r.source.url) && !!r.source.quote && /^\d{4}-\d{2}-\d{2}$/.test(r.source.date)));

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
try {
  const six = await j("POST", "/api/demo/reset-to-six", { confirm: "RESET" }, { "x-actor": "user-A" });
  await seedSampleFirms(db);
  ok("setup: Demo › Reset to the six loads the Sample programs; the Sample firms are seeded", six.status === 200 || six.status === 201, { status: six.status });
  const workspace = sql(`select workspace_id from combination limit 1`);
  const door = new ConfiguratorEligibility(prismaReleases(db, workspace));
  const list: AssessableRelease[] = await door.listAssessable().catch(() => []);
  const keyOf = new Map(sql(`select r.id || '|' || c.combination_key from config_release r join combination c on c.id = r.combination_id where r.status = 'RELEASED'`).split("\n").filter(Boolean).map((l) => l.split("|") as [string, string]));

  for (const s of STREAMS) {
    const f = fileOf(s.file);
    const rel = f ? list.find((r) => keyOf.get(r.release_id) === f.combination_key) : undefined;
    // ---------------------------------------------------------------------------------------- W1
    ok(`R1.107 W1 ${s.province} (${s.part}): the stream is listed by the door as assessment only`, !!rel && rel.assessment_only, { file: f ? f.combination_key : `missing samples/provincial-streams/${s.file}.json (${s.part})`, listed: list.map((r) => `${r.name}${r.assessment_only ? " (assessment only)" : ""}`) });
    if (!f || !rel) { ok(`R1.107 W2 ${s.province} (${s.part}): the eligible profile is Likely eligible, every rule met and cited`, false, "no release"); ok(`R1.107 W3 ${s.province} (${s.part}): the "not" profile is Not eligible, naming its cited rule`, false, "no release"); continue; }
    // ---------------------------------------------------------------------------------------- W2, W3
    const yes = await door.assess({ release_id: rel.release_id, persons: f.profiles.eligible });
    ok(`R1.107 W2 ${s.province}: the eligible profile is Likely eligible, every rule met, each with its official page, quote and date (or Sample)`,
      yes.outcome === "LIKELY_ELIGIBLE" && yes.rules.length > 0 && yes.rules.every((r) => r.state === "met" && cited(r)), { outcome: yes.outcome, rules: yes.rules.map((r) => [r.ref, r.state, r.source && ("url" in r.source ? r.source.url : "Sample")]) });
    const no = await door.assess({ release_id: rel.release_id, persons: f.profiles.not });
    const failed = no.rules.find((r) => r.ref === f.profiles.not_fails);
    ok(`R1.107 W3 ${s.province}: the "not" profile is Not eligible, naming its failed rule with that rule's quote`,
      no.outcome === "NOT_ELIGIBLE" && no.reasons.some((x) => x.kind === "GATE_NOT_MET" && x.ref === f.profiles.not_fails) && failed?.state === "not_met" && !!failed.source && "quote" in failed.source, { outcome: no.outcome, reasons: no.reasons, failed });
  }

  // ------------------------------------------------------------------------------------------ W4: no case opens on it
  const first = STREAMS.map((s) => fileOf(s.file)).find(Boolean);
  const combo = first ? sql(`select coalesce(id::text, '') from combination where combination_key = '${first.combination_key.replace(/'/g, "''")}'`) : "";
  const open = combo ? await j("POST", "/api/runtime/cases", { combinationId: combo, clientActor: "user-P", principal: { displayName: "Client A (Sample)" } }, { "x-actor": "user-O" }) : { status: 0, body: "no provincial combination (AS-2d1)" };
  ok("R1.107 W4: Open a case on a provincial release is refused, in the words \"Assessment only: no forms\"", open.status === 409 && JSON.stringify(open.body).includes("Assessment only: no forms"), { status: open.status, body: open.body });

  // ------------------------------------------------------------------------------------------ W5: the client copy
  const share = existsSync(join(STUDIO, "api", "src", "front-office", "assessment", "share.ts"));
  const tables = sql(`select coalesce(string_agg(table_name, ','), '') from information_schema.tables where table_schema = 'public' and table_name in ('fo_assessment', 'fo_assessment_fact')`);
  ok("R1.107 W5 (missing: FO-15a, FO-15b the lead's stored assessment; AS-2c, AS-2cs the client copy): a reviewed assessment on a prospect gives a client copy with the disclaimer, sent only by a person",
    share && tables.split(",").length === 2, { share, tables: tables || "none" });
} finally {
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
