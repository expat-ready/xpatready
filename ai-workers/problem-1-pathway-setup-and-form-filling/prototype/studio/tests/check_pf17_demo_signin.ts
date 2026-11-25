// PF-17 part 4 (R1.93; concept r2 Q4, challenge M1; Lead 26 on #3470): our console can be signed into on the demo.
// Lead 26's terms, each proven with a pass and a fail: DS1 the start-up seed adds two Sample ExpatReady staff (Platform
// Owner, Support) only with PLATFORM_ENVIRONMENT=local and PLATFORM_SYSTEM_IDENTITY=local, idempotent, and each signs in
// through PF-4s's stand-in; DS2 the seed run anywhere else (test, production, or no stand-in) is refused and writes
// nothing; DS3 the stand-in itself is refused at start-up outside local (PF-24's one loader); DS4 the people are labelled
// Sample and no password, secret or token is in git (the seed's own entries, start.sh's line); DS5 start.sh turns the
// stand-in on for the demo only as a default, and the copy's PLATFORM_ENVIRONMENT stays local. One scratch database,
// dropped at the end. No model call (US$0).
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf17_demo_signin.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf17d_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 700)}` : ""}`); };
const refusal = async (f: () => unknown): Promise<string> => { try { await f(); return ""; } catch (e) { return `${(e as Error)?.constructor?.name}: ${String((e as Error)?.message ?? e)}`; } };

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);
for (const k of Object.keys(process.env)) if (/^PLATFORM_/.test(k)) delete process.env[k];
process.env.PLATFORM_ENVIRONMENT = "local";

const { seedSampleOnStart } = await import("../api/src/platform/identity/sample-seed.ts");
const { SAMPLE_SYSTEM_STAFF, SampleStaffRefused, sampleSystemStaffDecision, seedSampleSystemStaff } = await import("../api/src/platform/system-identity/sample-staff.ts");
const { loadPlatformConfig } = await import("../api/src/platform/config/settings.ts");
const { SystemLocalIdentity } = await import("../api/src/platform/system-identity/local.ts");
const { SystemIdentity } = await import("../api/src/platform/system-identity/service.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");

const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const ours = () => Number(sql(`select count(*) from plat_system_staff`));
const emails = SAMPLE_SYSTEM_STAFF.map((p) => p.email);
try {
  // ------------------------------------------------------------------ DS2 refused anywhere but local with the stand-in (first: nothing written)
  const env = (more: Record<string, string>) => ({ PLATFORM_SAMPLE_SEED: "on", DATABASE_URL: urlOf(DB), ...more });
  await seedSampleOnStart(env({ PLATFORM_ENVIRONMENT: "local" }));
  ok("DS2 fail: the start-up seed with the Sample firms on but PLATFORM_SYSTEM_IDENTITY unset adds no ExpatReady staff", ours() === 0, ours());
  const elsewhere = await Promise.all((["test", "production"] as const).map((environment) => refusal(() => seedSampleSystemStaff(owner, { environment, systemIdentity: { via: "local" } }))));
  const noStandIn = await refusal(() => seedSampleSystemStaff(owner, { environment: "local", systemIdentity: { via: "cognito" } }));
  ok("DS2 fail: the seed called directly for test or production (even claiming the stand-in) or with Cognito is refused (SampleStaffRefused) and writes nothing",
    elsewhere.every((e) => e.startsWith("SampleStaffRefused") && /PLATFORM_ENVIRONMENT=(test|production)/.test(e)) && noStandIn.startsWith("SampleStaffRefused") && ours() === 0, { elsewhere, noStandIn, rows: ours() });
  ok("DS2 pass/fail: the decision runs only for local with the local stand-in",
    sampleSystemStaffDecision({ environment: "local", systemIdentity: { via: "local" } }).run && !sampleSystemStaffDecision({ environment: "local", systemIdentity: { via: "none" } }).run
    && !sampleSystemStaffDecision({ environment: "test", systemIdentity: { via: "local" } }).run && !sampleSystemStaffDecision({ environment: "production", systemIdentity: { via: "local" } }).run);
  ok("DS2 fail: SampleStaffRefused is its own error class (a caller can tell a refusal from a database failure)", new SampleStaffRefused("x") instanceof Error);

  // ------------------------------------------------------------------ DS3 the stand-in is refused at start-up outside local
  const loaderRefuses = await Promise.all((["test", "production"] as const).map((e) => refusal(() => loadPlatformConfig({ PLATFORM_ENVIRONMENT: e, PLATFORM_SYSTEM_IDENTITY: "local", DATABASE_URL: urlOf(DB) }))));
  ok("DS3 fail: PF-24's loader refuses PLATFORM_SYSTEM_IDENTITY=local when PLATFORM_ENVIRONMENT is test or production, naming the setting (the start-up stops)",
    loaderRefuses.every((e) => /PLATFORM_SYSTEM_IDENTITY/.test(e)), loaderRefuses.map((e) => e.slice(0, 200)));
  const localOk = await refusal(() => loadPlatformConfig({ PLATFORM_ENVIRONMENT: "local", PLATFORM_SYSTEM_IDENTITY: "local", DATABASE_URL: urlOf(DB) }));
  ok("DS3 pass: the same setting with PLATFORM_ENVIRONMENT=local loads", localOk === "", localOk);

  // ------------------------------------------------------------------ DS1 local with the stand-in: two Sample staff, idempotent, each signs in
  // DS6 (Lead 28 on #3470, SA-11 BR-16): the start-up's own lines name no person: counts only, never an email.
  const said: string[] = [], keep = { log: console.log, warn: console.warn, error: console.error };
  for (const k of ["log", "warn", "error"] as const) console[k] = (...a: unknown[]) => { said.push(a.map(String).join(" ")); };
  let twice: PromiseSettledResult<unknown>[];
  try { twice = await Promise.allSettled([1, 2].map(() => seedSampleOnStart(env({ PLATFORM_ENVIRONMENT: "local", PLATFORM_SYSTEM_IDENTITY: "local" })))); }
  finally { Object.assign(console, keep); }
  const staffLines = said.filter((l) => /ExpatReady staff/.test(l));
  ok("DS6 fail (Lead 28, SA-11 BR-16): the seed's start-up lines hold no email address, only how many were added",
    staffLines.length > 0 && said.every((l) => !/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(l)) && staffLines.some((l) => /added: [0-9]+/.test(l)), said.map((l) => l.replace(/[^\s"]+@[^\s"]+/g, "<email>")));
  ok("DS1 fail (break m1): two start-ups at once on one database both carry on (neither stops on the other's insert)", twice.every((t) => t.status === "fulfilled"), twice.map((t) => t.status === "rejected" ? String(t.reason).slice(0, 200) : "ok"));
  const rows = sql(`select s.email || '|' || s.display_name || '|' || s.status || '|' || string_agg(g.role_code, ',') from plat_system_staff s join plat_system_role_grant g on g.staff_id = s.id group by s.id order by s.email`).split("\n");
  ok("DS1 pass: local with the stand-in, the start-up seed adds the Sample Platform Owner and the Sample Support member, active, one role each",
    rows.length === 2 && rows.some((r) => r === "ops.sample@expatready.example.com|Platform Owner (Sample)|ACTIVE|platform-owner") && rows.some((r) => r === "support.sample@expatready.example.com|Support (Sample)|ACTIVE|platform-support"), rows);
  sql(`update plat_system_role_grant set role_code = 'platform-auditor' where staff_id = (select id from plat_system_staff where email = 'support.sample@expatready.example.com')`);
  await seedSampleOnStart(env({ PLATFORM_ENVIRONMENT: "local", PLATFORM_SYSTEM_IDENTITY: "local" }));
  ok("DS1 fail: a second start adds nobody and leaves a changed person's roles as they are (adds only who is missing)",
    ours() === 2 && sql(`select g.role_code from plat_system_role_grant g join plat_system_staff s on s.id = g.staff_id where s.email = 'support.sample@expatready.example.com'`) === "platform-auditor", ours());
  sql(`update plat_system_role_grant set role_code = 'platform-support' where staff_id = (select id from plat_system_staff where email = 'support.sample@expatready.example.com')`);
  const clock = new (class extends PlatformClock { override now() { return Date.now(); } })();
  const identity = new SystemIdentity(owner as never, new SystemLocalIdentity(null, () => clock.now()), clock);
  const signed = await Promise.all(emails.map(async (email) => { try { const r = await identity.localSignIn({ email, secondStep: true }, { device: null }); return typeof r.token === "string" && r.token.length > 20; } catch { return false; } }));
  const noStep = await refusal(() => identity.localSignIn({ email: emails[0], secondStep: false }, { device: null }));
  ok("DS1 pass: each Sample staff member signs in through PF-4s's local stand-in by work email (a token issued per sign-in, none stored)", signed.every(Boolean), signed);
  ok("DS1 fail: without the second step the Sample Platform Owner is refused, as any of our staff", noStep !== "", noStep);

  // ------------------------------------------------------------------ DS4 Sample labels, no secret in git
  const seedSrc = readFileSync(join(STUDIO, "api", "src", "platform", "system-identity", "sample-staff.ts"), "utf8");
  ok("DS4 pass: every seeded person is labelled Sample, on the example domain, with only an email, a display name and one role",
    SAMPLE_SYSTEM_STAFF.every((p) => /\(Sample\)$/.test(p.displayName) && p.email.endsWith("@expatready.example.com") && Object.keys(p).sort().join() === "displayName,email,role"));
  ok("DS4 fail: the seed's source holds no password, secret or token value (no assignment of one, no long random string)",
    !/(password|secret|token)\s*[:=]\s*["'`]/i.test(seedSrc) && !/["'`][A-Za-z0-9+/=_-]{32,}["'`]/.test(seedSrc));

  // ------------------------------------------------------------------ DS5 start.sh: a default for the demo, never forced
  const start = readFileSync(join(STUDIO, "start.sh"), "utf8");
  ok("DS5 pass: start.sh defaults PLATFORM_SYSTEM_IDENTITY to local (an exported value wins) beside PLATFORM_ENVIRONMENT's local default",
    /^export PLATFORM_SYSTEM_IDENTITY="\$\{PLATFORM_SYSTEM_IDENTITY:-local\}"/m.test(start) && /^export PLATFORM_ENVIRONMENT="\$\{PLATFORM_ENVIRONMENT:-local\}"/m.test(start));
  ok("DS5 fail: start.sh sets no secret for our stand-in (its signing key stays random per start)", !/PLATFORM_SYSTEM_LOCAL_SECRET/.test(start));
} catch (e) {
  fail++; console.log(`FAIL  unexpected error — ${String((e as Error)?.stack ?? e).slice(0, 1500)}`);
} finally {
  await owner.$disconnect().catch(() => undefined);
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for the cleanup tool */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
