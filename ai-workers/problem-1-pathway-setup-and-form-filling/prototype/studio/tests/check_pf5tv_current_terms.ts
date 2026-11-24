// PF-5tv (Build Lead A's brief rev 16.99, from #1957's body point 3): one rule for "the current terms" at sign-up and at
// the gate. Two versions of one kind published at the same instant were ordered by chance at sign-up (`currentTerms`) and
// by `version desc` at the gate, so a firm that had just signed up could be asked again at once (428 TERMS_PENDING).
// Both now read terms/service.ts `currentVersions` (published_at desc, version desc, id desc). On a scratch database with
// FirmSignUp and the local stand-ins, a fake clock, no network, US$0. Wording and versions Sample; Unconfirmed: no counsel.
//   tsx studio/tests/check_pf5tv_current_terms.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeBilling } from "../ports/billing.ts";
import { FakeClock } from "../ports/clock.ts";
import { fakeMail } from "../ports/mail.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf5tv_scratch_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_LOCAL_SECRET"]) delete process.env[k];

const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { PlatformTerms, currentVersions } = await import("../api/src/platform/terms/service.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const { FirmSignUp } = await import("../api/src/platform/firms/signup.ts");
const { LocalSignUp } = await import("../api/src/platform/firms/signup-identity.ts");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const T0 = Date.now() + 3_600_000;   // every version below is newer than the seed's Sample versions
const fclock = new FakeClock(new Date(T0));
const clock = new (class extends PlatformClock { override now() { return fclock.now().getTime(); } })();
const terms = new PlatformTerms(db as never, clock);
const identity = new LocalSignUp(() => fclock.now());
const signup = new FirmSignUp(db, { audit: auditEvent, billing: fakeBilling(), identity, mail: fakeMail({ clock: fclock }), clock: fclock, appUrl: "https://app.expatready.test" });

/** Two terms-of-service versions "<m>.0" and "<m>.1" with one published_at, inserted in the order given (the heap order a
 *  plain scan returns); (kind, version) is unique, so each tie has its own m. The gate's rule calls "<m>.1" current. */
const tie = (at: Date, m: number, newerFirst: boolean) => {
  for (const v of newerFirst ? [`${m}.1`, `${m}.0`] : [`${m}.0`, `${m}.1`]) sql(`insert into platform_terms_version (id, kind, version, url, published_at) values (gen_random_uuid(), 'TERMS_OF_SERVICE', '${v}', '/legal/tos-${v}', '${at.toISOString()}')`);
  return `${m}.1`;
};
let n = 0;
/** One sign-up through FirmSignUp (plans, the form's wait, sign-up, the email check): the new Owner as the gate sees it. */
const signUpOwner = async () => {
  const i = ++n, email = `owner${i}@pf5tv.example.com`;
  const plans = await signup.plans(); await fclock.advance({ seconds: 5 });
  await signup.signUp({ email, password: `a long sample pass ${i}`, firmName: `PF5tv Sample Firm ${i}`, countryCode: "CA", acceptedTerms: plans.terms.map((t) => t.id), formStamp: plans.formStamp }, `10.7.${i >> 8}.${i & 255}`);
  await signup.settled();
  const link = identity.sent.find((m) => m.to === email)?.text ?? "";
  await signup.verify({ token: /token=([A-Za-z0-9_-]{43})/.exec(link)?.[1], code: /code=(\d{6})/.exec(link)?.[1] }, `10.8.${i >> 8}.${i & 255}`).catch(() => undefined);   // Checkout after the commit is not this row's
  const [firmId, staffId] = sql(`select firm_id || ' ' || id from platform_staff where email = '${email}'`).split(" ");
  const staff = { firmId, staffId, firmKey: "", roles: ["OWNER"], keys: [], duties: [], authTime: 0, via: "local" } as never;
  const accepted = sql(`select v.version from platform_terms_acceptance a join platform_terms_version v on v.id = a.version_id where a.staff_id = '${staffId}' and v.kind = 'TERMS_OF_SERVICE'`);
  return { offered: plans.terms.find((t) => t.kind === "TERMS_OF_SERVICE")?.version, accepted, mustAccept: staffId ? await terms.mustAccept(staff) : null, staff };
};

try {
  await seedSampleFirms(db);

  // --------------------------------------------- DW1: the tie, rows inserted 2.0 then 2.1 (red on main's code)
  const want1 = tie(new Date(T0 + 60_000), 2, false); await fclock.set(new Date(T0 + 120_000));
  const one = await signUpOwner();
  ok("PF-5tv DW1 fail→pass: two terms-of-service versions with one published_at (2.0 inserted first): the new Owner is offered and accepts 2.1, the version the gate calls current, and its first request is not stopped (no 428)",
    one.offered === want1 && one.accepted === want1 && one.mustAccept === false, one);

  // ------------------------------------------ DW2: 20 sign-ups, the tie inserted in both orders, always agreed
  const runs: { newerFirst: boolean; want: string; offered?: string; accepted: string; mustAccept: boolean | null }[] = [];
  for (let i = 0; i < 20; i++) {
    const newerFirst = i % 2 === 1, want = tie(new Date(T0 + (i + 2) * 600_000), i + 3, newerFirst);
    await fclock.set(new Date(T0 + (i + 2) * 600_000 + 60_000));
    const r = await signUpOwner(); runs.push({ newerFirst, want, offered: r.offered, accepted: r.accepted, mustAccept: r.mustAccept });
  }
  ok("PF-5tv DW2 pass: 20 sign-ups, the tie inserted in both orders: each Owner accepted exactly the version the gate calls current (the higher) and none is asked again (no 428)",
    runs.length === 20 && runs.every((r) => r.offered === r.want && r.accepted === r.want && r.mustAccept === false), runs.filter((r) => r.offered !== r.want || r.accepted !== r.want || r.mustAccept !== false));
  const now = clock.now();
  const gateIds = (await currentVersions(db, now)).map((r) => r.id).join(), signIds = (await signup.currentTerms()).map((r) => r.id).join();
  ok("PF-5tv DW2 pass: sign-up's currentTerms and the gate's read give the same ids in the same order (one per kind)", gateIds === signIds && gateIds.split(",").length === 3, [gateIds, signIds]);
  // ------------------------------------- DW3: a version published after sign-up still asks (PF-5t unchanged)
  const last = await signUpOwner();
  ok("PF-5tv DW3 pass: an Owner who has just signed up is not asked", last.mustAccept === false, last);
  sql(`insert into platform_terms_version (id, kind, version, url, published_at) values (gen_random_uuid(), 'TERMS_OF_SERVICE', '99.0', '/legal/dw3-99.0', '${new Date(clock.now() + 60_000).toISOString()}')`);
  await fclock.set(new Date(clock.now() + 120_000));
  const later = await terms.pending(last.staff);
  ok("PF-5tv DW3 fail: a later terms-of-service version published after sign-up is pending for that Owner (428 TERMS_PENDING, as PF-5t requires)",
    (await terms.mustAccept(last.staff)) === true && later.length === 1 && later[0].version === "99.0", later);
} catch (e) {
  fail++; console.log(`FAIL  the check stopped: ${(e as Error)?.stack ?? e}`);
} finally {
  await db.$disconnect().catch(() => undefined);
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for prune-test-dbs.sh */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
