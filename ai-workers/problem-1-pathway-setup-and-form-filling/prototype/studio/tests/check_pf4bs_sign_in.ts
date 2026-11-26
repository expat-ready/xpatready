// PF-4bs part 2a (R1.5; concept r3 §2, approved 24 Nov on #3214): the sign-in page's two doors on the local stand-in,
// every "Done when" line with a pass and a fail. A scratch database and a Nest app of PF-4's and PF-4b's classes with the
// local stand-ins, a test clock and a random sealing key. No network, no model call, US$0.
//   tsx studio/tests/check_pf4bs_sign_in.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeMail } from "../ports/mail.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf4bs_scratch_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
let printed = "";   // everything this process prints, scanned for the password
for (const s of [process.stdout, process.stderr]) { const w = s.write.bind(s); s.write = ((chunk: unknown, ...a: unknown[]) => { printed += String(chunk); return (w as (...x: unknown[]) => boolean)(chunk, ...a); }) as typeof s.write; }

type Res = { status: number; body: any };
const callAt = async (base: string, method: string, path: string, o: { token?: string; body?: unknown; from?: string } = {}): Promise<Res> => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  if (o.from) headers["x-forwarded-for"] = `198.18.0.1, ${o.from}`;   // the first hop is the caller's to say; the last is the load balancer's
  const r = await fetch(`${base}${path}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await r.text(); let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body };
};

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_LOCAL_SECRET"]) delete process.env[k];
process.env.PLATFORM_ENVIRONMENT = "local";

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { IDENTITY_ADMIN_PORT, LocalIdentityAdmin } = await import("../api/src/platform/identity/session/provider.ts");
const { MAIL_PORT } = await import("../api/src/platform/identity/session/mail.ts");
const { PlatformSession } = await import("../api/src/platform/identity/session/service.ts");
const { PlatformSessionController, PlatformSignInController, PublicInvitationController } = await import("../api/src/platform/identity/session/routes.ts");
const SI = await import("../api/src/platform/identity/session/sign-in.ts");
const { Secret } = await import("../api/src/platform/config/secret.ts");
const { aesGcmSecretBox } = await import("../api/src/platform/secret-box/aes-gcm.ts");
const feature = (await import("../api/src/features/platform-staff-read.ts")).default;

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const clock = new (class extends PlatformClock { t = Date.now(); override now() { return this.t; } })();
const local = new LocalIdentity("pf4bs-check-signing-key-0123456789abcdef", () => clock.now());
const signInKey = randomBytes(32), port = new SI.LocalSignIn(signInKey, () => clock.now());
let asked = 0, codesAsked = 0, codeDelay = 0;
const pw = port.password.bind(port); port.password = async (...a) => { asked++; return pw(...a); };
const pc = port.code.bind(port); port.code = async (...a) => { codesAsked++; if (codeDelay) await new Promise((r) => setTimeout(r, codeDelay)); return pc(...a); };
const box = aesGcmSecretBox({ current: 1, keys: new Map([[1, new Secret("test ring", randomBytes(32).toString("base64"))]]) });
const codeOf = (staffId: string, dt = 0) => SI.totp(port.secretOf(staffId), Math.floor((clock.now() + dt) / 30_000));
const SAMPLE_PW = SI.LOCAL_SAMPLE_PASSWORD;

const appOf = async (signIn: unknown, sealer: unknown) => {
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
    { provide: IDENTITY_ADMIN_PORT, useValue: new LocalIdentityAdmin(() => clock.now()) }, { provide: MAIL_PORT, useValue: fakeMail() }, PlatformSession,
    { provide: SI.SIGN_IN_PORT, useValue: signIn }, { provide: SI.SIGN_IN_BOX, useValue: sealer }, SI.SignInDoor];
  @Module({ controllers: [PlatformIdentityController, PlatformSessionController, PlatformSignInController, PublicInvitationController] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false }); await nest.listen(0, "127.0.0.1");
  return { nest, base: `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}` };
};

const apps: { close(): Promise<void> }[] = [];
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
let n = 0; const addr = () => `203.0.113.${(n++ % 250) + 1}`;   // a fresh address per try, where a check is not about addresses
try {
  const { nest, base } = await appOf(port, box); apps.push(nest);
  const call = (method: string, path: string, o: { token?: string; body?: unknown; from?: string } = {}) => callAt(base, method, path, o);
  await seedSampleFirms(db);
  const staffOf = async (actorId: string) => db.platformStaff.findFirstOrThrow({ where: { actorId }, select: { id: true, email: true } });
  const R = await staffOf("user-R"), O = await staffOf("user-O"), T = await staffOf("user-T");
  const audits = (action: string, staffId?: string) => Number(sql(`select count(*) from audit_event where action = '${action}'${staffId ? ` and detail->>'staffId' = '${staffId}'` : ""}`));
  const signIn = (email: string, password = SAMPLE_PW, from: string = addr()) => call("POST", "/api/platform/session/sign-in", { body: { email, password }, from });
  const code = (attempt: string, c: string, from: string = addr()) => call("POST", "/api/platform/session/sign-in/code", { body: { attempt, code: c }, from });
  const wrongOf = (staffId: string) => String((Number(codeOf(staffId)) + 500_000) % 1_000_000).padStart(6, "0");
  const nextWindow = () => { clock.t += SI.WINDOW_MS + 1; };
  ok("setup: the feature registers the sign-in controller, door, its port and its sealing box", (feature.controllers as unknown[]).includes(PlatformSignInController) && (feature.providers as unknown[]).includes(SI.SignInDoor) && (feature.providers as any[]).some((p) => p?.provide === SI.SIGN_IN_PORT) && (feature.providers as any[]).some((p) => p?.provide === SI.SIGN_IN_BOX));

  // ------------------------------------------------------------------ DW1: password (AG-1-40; concept §2 door 1)
  const first = await signIn(R.email);
  ok("PF-4bs DW1 pass: a first sign-in with the right password → 200 step set-up, with the key as text and an otpauth:// link (no QR)",
    first.status === 200 && first.body.step === "set-up" && /^[A-Z2-7]{32}$/.test(first.body.key) && first.body.otpauth === `otpauth://totp/ExpatReady:${encodeURIComponent(R.email)}?secret=${first.body.key}&issuer=ExpatReady&algorithm=SHA1&digits=6&period=30` && typeof first.body.attempt === "string", first.body);
  const wrong = await signIn(R.email, "not-the-password"), unknown = await signIn("nobody.here@example.com");
  ok("PF-4bs DW1 fail: a wrong password and an unknown email get the same 401 SIGN_IN_REFUSED and the same words",
    wrong.status === 401 && unknown.status === 401 && wrong.body.code === "SIGN_IN_REFUSED" && unknown.body.code === "SIGN_IN_REFUSED" && wrong.body.detail === SI.SIGN_IN_WORDS.refused && JSON.stringify(unknown.body) === JSON.stringify(wrong.body), [wrong.body, unknown.body]);
  const noPw = await signIn(R.email, ""), extra = await call("POST", "/api/platform/session/sign-in", { body: { email: R.email, password: SAMPLE_PW, firmKey: "x" } });
  const missing = await call("POST", "/api/platform/session/sign-in", { body: { email: R.email } }), missingCode = await call("POST", "/api/platform/session/sign-in/code", { body: {} });
  ok("PF-4bs DW1 fail: an empty password → 401 SIGN_IN_REFUSED; an unknown field or a missing one → 422 (the one input rule, PF-28)", noPw.status === 401 && noPw.body.code === "SIGN_IN_REFUSED" && extra.status === 422 && missing.status === 422 && missingCode.status === 422, [noPw.body, extra.status, missing.status, missingCode.status]);
  // Review M1, break M1: a known email with a wrong password (person read, refusal line) and an unknown one take the same time.
  const timeOf = async (email: string) => { const t = performance.now(); await signIn(email, "wrong-for-timing"); return performance.now() - t; };
  const known: number[] = [], unknownT: number[] = [];
  for (let i = 0; i < 8; i++) { known.push(await timeOf(T.email)); unknownT.push(await timeOf(`nobody.t${i}@example.com`)); }
  ok(`PF-4bs DW1 fail (review M1): a refusal takes at least ${SI.MIN_REFUSAL_MS} ms either way, and the medians for a known and an unknown email differ by under 40 ms`,
    Math.min(...known, ...unknownT) >= SI.MIN_REFUSAL_MS - 5 && Math.abs(median(known) - median(unknownT)) < 40, { known: median(known), unknown: median(unknownT) });
  nextWindow();

  // --------------------------------------------------------------- DW2: the code (AG-1-55; concept §2 doors 2, 3)
  const tOld = (await call("POST", "/api/platform/session/local", { body: { firmKey: "sample-firm", actorId: "user-O", secondStep: true } })).body.token as string;
  clock.t += 1000;
  const oSet = await signIn(O.email);
  const t1 = await code(oSet.body.attempt, codeOf(O.id)), old = await call("GET", "/api/platform/me", { token: tOld });
  ok("PF-4bs DW2 pass (AG-1-55): set-up finishes with the app's first code (a token), and the older session ends (its token → 401)", oSet.body.step === "set-up" && t1.status === 200 && !!t1.body.token && old.status === 401, [oSet.body.step, t1.body, old.status]);
  clock.t += 30_000;
  const oIn = await signIn(O.email);
  ok("PF-4bs DW2 pass: once set up, the next sign-in asks for the code only (no key)", oIn.status === 200 && oIn.body.step === "code" && !("key" in oIn.body), oIn.body);
  const bad = await code(oIn.body.attempt, wrongOf(O.id));
  ok("PF-4bs DW2 fail: a wrong code → 401 CODE_REFUSED \"Code not accepted\", try again", bad.status === 401 && bad.body.code === "CODE_REFUSED" && bad.body.title === "Code not accepted" && bad.body.detail === SI.SIGN_IN_WORDS.code, bad.body);
  const far = await code(oIn.body.attempt, codeOf(O.id, 60_000));
  ok("PF-4bs DW2 fail (review m3): a code two steps (60 s) ahead is refused (the window is one step either way)", far.status === 401 && far.body.code === "CODE_REFUSED", far.body);
  const linesBefore = audits("platform.staff.sign_in", O.id);
  const good = await code(oIn.body.attempt, codeOf(O.id));
  const me = await call("GET", "/api/platform/me", { token: good.body.token }), prev = await call("GET", "/api/platform/me", { token: t1.body.token });
  ok("PF-4bs DW2 pass: the right code → a token; /api/platform/me answers 200 as that person; one sign-in line; the session before it ends",
    good.status === 200 && good.body.tokenType === "Bearer" && me.status === 200 && me.body.staffId === O.id && audits("platform.staff.sign_in", O.id) === linesBefore + 1 && prev.status === 401, [good.body, me.body, prev.status]);
  const again = await code(oIn.body.attempt, codeOf(O.id, 30_000));
  ok("PF-4bs DW2 fail (review m4): the same attempt after it signed in → 401 ATTEMPT_EXPIRED \"Start again\" (never the password's words)", again.status === 401 && again.body.code === "ATTEMPT_EXPIRED", again.body);
  const o2 = await signIn(O.email), replay = await code(o2.body.attempt, codeOf(O.id));
  ok("PF-4bs DW2 fail: a code already used, on a new attempt → 401 CODE_REFUSED (a code works once)", replay.status === 401 && replay.body.code === "CODE_REFUSED", replay.body);
  const tampered = o2.body.attempt.slice(0, -2) + (o2.body.attempt.endsWith("AA") ? "BB" : "AA");
  const ta = await code(tampered, codeOf(O.id, 30_000)), tb = await code("not-an-attempt", "123456");
  ok("PF-4bs DW2 fail: a changed or made-up attempt → 401 SIGN_IN_REFUSED", ta.status === 401 && ta.body.code === "SIGN_IN_REFUSED" && tb.status === 401 && tb.body.code === "SIGN_IN_REFUSED", [ta.body, tb.body]);
  const NIL = "00000000-0000-0000-0000-000000000000";
  const op = await code(box.seal({ firmId: NIL, purpose: "set-password-code" }, JSON.stringify({ s: "x", u: O.id, st: "code", x: clock.now() + 60_000, n: "n1" })), codeOf(O.id, 30_000));
  ok("PF-4bs DW2 fail (N2): a value sealed for another purpose (set-password-code) does not open as an attempt → 401", op.status === 401 && op.body.code === "SIGN_IN_REFUSED", op.body);
  const shapeless = await code(box.seal({ firmId: NIL, purpose: "sign-in-attempt" }, JSON.stringify({ u: O.id, st: "code", x: clock.now() + 60_000 })), codeOf(O.id, 30_000));
  ok("PF-4bs DW2 fail (review m3): a properly sealed attempt with the wrong shape → 401 SIGN_IN_REFUSED, the provider not asked", shapeless.status === 401 && shapeless.body.code === "SIGN_IN_REFUSED", shapeless.body);
  clock.t += SI.ATTEMPT_MS + 1;
  const late = await code(o2.body.attempt, codeOf(O.id));
  ok("PF-4bs DW2 fail: an attempt older than 15 minutes → 401 ATTEMPT_EXPIRED \"That took too long. Start again.\"", late.status === 401 && late.body.code === "ATTEMPT_EXPIRED" && late.body.detail === SI.SIGN_IN_WORDS.expired, late.body);
  ok("PF-4bs DW2 pass: the sealed attempt is under the doors' 2000-character cap and holds no id or session in clear", o2.body.attempt.length < 2000 && !o2.body.attempt.includes(O.id) && /^sb1\.v1\./.test(o2.body.attempt), o2.body.attempt.length);
  nextWindow();

  // ------------------------------------------------------------------------------- DW3: limits (concept §2, m3)
  // Per email and address: 5 wrong, then even the right password is the same 401 from that address, the provider not asked.
  const home = "198.51.100.10"; asked = 0;
  for (let i = 0; i < SI.LIMITS.emailAddress; i++) await signIn(T.email, `wrong-${i}`, home);
  const askedAfterWrong = asked, blocked = await signIn(T.email, SAMPLE_PW, home);
  ok(`PF-4bs DW3 fail: after ${SI.LIMITS.emailAddress} wrong passwords from one address even the right one gets the same 401 there, and the provider is not asked`, blocked.status === 401 && blocked.body.code === "SIGN_IN_REFUSED" && asked === askedAfterWrong, [blocked.body, asked - askedAfterWrong]);
  const elsewhere = await signIn(T.email, SAMPLE_PW, "198.51.100.11");
  ok("PF-4bs DW3 pass (break M4): the person signs in from another address meanwhile (a stranger at one address cannot keep them out)", elsewhere.status === 200, elsewhere.body);
  for (let i = 0; i < SI.LIMITS.email; i++) await signIn(T.email, `wrong-many-${i}`);
  const backstop = await signIn(T.email, SAMPLE_PW, "198.51.100.12");
  ok(`PF-4bs DW3 fail: after ${SI.LIMITS.email} wrong passwords from any addresses, the email is refused everywhere (the backstop)`, backstop.status === 401 && backstop.body.code === "SIGN_IN_REFUSED", backstop.body);
  const linesAtLimit = audits("platform.staff.sign_in_refused", T.id);
  await signIn(T.email, "wrong-over", "198.51.100.13"); await signIn(T.email, "wrong-over", "198.51.100.14");
  ok("PF-4bs DW3 pass (review m2, break m3): tries over the limit write no refusal line", audits("platform.staff.sign_in_refused", T.id) === linesAtLimit, audits("platform.staff.sign_in_refused", T.id) - linesAtLimit);
  nextWindow();
  ok("PF-4bs DW3 pass: 15 minutes later the right password works again from the first address", (await signIn(T.email, SAMPLE_PW, home)).status === 200);
  // Per address, by X-Forwarded-For's last hop (review M3, break M2).
  const noisy = "192.0.2.50";
  for (let i = 0; i < SI.LIMITS.address; i++) await signIn(`nobody${i}@example.com`, "x", noisy);
  const slow = await signIn(T.email, SAMPLE_PW, noisy), other = await signIn(T.email, SAMPLE_PW, "192.0.2.51");
  ok(`PF-4bs DW3 fail: ${SI.LIMITS.address} refused tries from one address → 429 TOO_MANY_TRIES there; another address (its own last X-Forwarded-For hop) signs in`, slow.status === 429 && slow.body.code === "TOO_MANY_TRIES" && slow.body.detail === SI.SIGN_IN_WORDS.slow && other.status === 200, [slow.body, other.status]);
  const { signInAddressOf } = await import("../api/src/platform/identity/session/routes.ts");
  ok("PF-4bs DW3 pass: the address is the last X-Forwarded-For hop, else the socket's", signInAddressOf({ headers: { "x-forwarded-for": "10.0.0.1, 192.0.2.9" }, ip: "10.1.1.1" }) === "192.0.2.9" && signInAddressOf({ headers: {}, ip: "10.1.1.1" }) === "10.1.1.1");
  nextWindow();
  const burst = await Promise.all(Array.from({ length: 60 }, (_, i) => signIn(`burst${i}@example.com`, "x", "192.0.2.60")));
  ok(`PF-4bs DW3 fail (break M2): 60 parallel tries from one address — at most ${SI.LIMITS.address} answered 401, the rest 429`, burst.filter((r) => r.status === 401).length <= SI.LIMITS.address && burst.filter((r) => r.status === 429).length >= 60 - SI.LIMITS.address, burst.map((r) => r.status).join());
  nextWindow();
  // Per attempt: 5 wrong codes end it. Per person: 10 wrong codes across attempts, then 429 (review M2 scenario B).
  const tAttempt = (await signIn(T.email)).body.attempt as string; let last: Res = { status: 0, body: null };
  for (let i = 0; i < SI.LIMITS.codesPerAttempt; i++) last = await code(tAttempt, wrongOf(T.id));
  const afterCodes = await code(tAttempt, codeOf(T.id));
  ok(`PF-4bs DW3 fail: the ${SI.LIMITS.codesPerAttempt}th wrong code ends the attempt (401 ATTEMPT_EXPIRED), and the right code after it is refused`, last.status === 401 && last.body.code === "ATTEMPT_EXPIRED" && afterCodes.status === 401 && afterCodes.body.code === "ATTEMPT_EXPIRED", [last.body, afterCodes.body]);
  for (let i = SI.LIMITS.codesPerAttempt; i < SI.LIMITS.codesPerPerson; i++) await code((await signIn(T.email)).body.attempt, wrongOf(T.id));
  const fresh = await signIn(T.email), personSlow = await code(fresh.body.attempt, codeOf(T.id));
  ok(`PF-4bs DW3 fail (review M2): after ${SI.LIMITS.codesPerPerson} wrong codes for one person across new attempts, even the right code → 429 TOO_MANY_TRIES`, personSlow.status === 429 && personSlow.body.detail === SI.SIGN_IN_WORDS.codes, personSlow.body);
  nextWindow();
  const okAfter = await code((await signIn(T.email)).body.attempt, codeOf(T.id));
  ok("PF-4bs DW3 pass: 15 minutes later the person's right code signs in", okAfter.status === 200, okAfter.body);
  // Parallel guesses on one attempt with a slow provider (Cognito in 2b): each try is counted before the provider is asked.
  clock.t += 30_000; nextWindow();
  const pAttempt = (await signIn(T.email)).body.attempt as string; codeDelay = 50; codesAsked = 0;
  const par = await Promise.all(Array.from({ length: 20 }, () => code(pAttempt, wrongOf(T.id))));
  codeDelay = 0;
  ok(`PF-4bs DW3 fail (review M2 scenario C, break m2): 20 parallel wrong codes on one attempt with a 50 ms provider — at most ${SI.LIMITS.codesPerAttempt} reach it`, codesAsked <= SI.LIMITS.codesPerAttempt && par.every((r) => r.status === 401), { codesAsked, statuses: par.map((r) => r.status).join() });
  // The limiter's memory (review m1, break m5).
  const tries = new SI.Tries(2, 1000, 3);
  tries.take("victim", 0); tries.take("victim", 0); tries.take("a", 0); const full = tries.take("b", 0), floodIn = tries.take("c", 1), stillBlocked = tries.over("victim", 1);
  const sizeLater = (tries.over("victim", 5000), tries.over("a", 5000), tries.size);
  ok("PF-4bs DW3 pass (review m1): at the cap a new key is refused rather than evicting a blocked one; keys with no try left in the window are dropped",
    full && floodIn === false && stillBlocked && sizeLater <= 1, { full, floodIn, stillBlocked, sizeLater });
  nextWindow();

  // ----------------------------------------------------------------- DW4: not active; refusal lines (audit)
  sql(`update platform_staff set status = 'DEACTIVATED' where id = '${T.id}'`);
  const before = audits("platform.staff.sign_in_refused", T.id), inactive = await signIn(T.email);
  ok("PF-4bs DW4 fail: a deactivated person with the right password → 401 STAFF_NOT_ACTIVE, with one refusal line", inactive.status === 401 && inactive.body.code === "STAFF_NOT_ACTIVE" && audits("platform.staff.sign_in_refused", T.id) === before + 1, inactive.body);
  sql(`update platform_staff set status = 'ACTIVE' where id = '${T.id}'`);
  const refusedBefore = audits("platform.staff.sign_in_refused");
  await signIn(T.email, "wrong-again"); await signIn("still.nobody@example.com");
  ok("PF-4bs DW4 pass: a wrong password for a known person writes one refusal line on their firm; an unknown email writes none",
    audits("platform.staff.sign_in_refused") === refusedBefore + 1 && audits("platform.staff.sign_in_refused", T.id) === before + 2, audits("platform.staff.sign_in_refused"));

  // -------------------------------------------------------------- DW5: the lookup (migration 20261126100000)
  const fn = sql(`select pg_get_userbyid(p.proowner) || '|' || p.prosecdef || '|' || array_to_string(p.proconfig, ',') || '|' || pg_get_function_result(p.oid) || '|' || has_function_privilege('public', p.oid, 'execute') from pg_proc p where p.proname = 'platform_staff_of_email'`);
  const grantees = sql(`select string_agg(distinct split_part(a::text, '=', 1), ',' order by split_part(a::text, '=', 1)) from pg_proc p, unnest(p.proacl) a where p.proname = 'platform_staff_of_email'`);
  ok("PF-4bs DW5 pass: platform_staff_of_email is owned by xr_wall_reader, SECURITY DEFINER, search_path pinned (pg_temp last), returns a uuid only, not PUBLIC; EXECUTE for exactly xr_app and xr_staff_bypass (and its owner)",
    fn === "xr_wall_reader|true|search_path=pg_catalog, public, pg_temp|uuid|false" && grantees === "xr_app,xr_staff_bypass,xr_wall_reader", { fn, grantees });
  sql(`update platform_staff set email = '${R.email}' where actor_id = 'user-S'`);
  const dup = sql(`select coalesce(platform_staff_of_email('${R.email}')::text, 'null')`), dupIn = await signIn(R.email);
  ok("PF-4bs DW5 fail: an email two staff rows share answers null (never a guess), so the door refuses it", dup === "null" && dupIn.status === 401 && dupIn.body.code === "SIGN_IN_REFUSED", [dup, dupIn.body]);

  // --------------------------------------------------------------------------------- DW6: not set up → 503
  const off1 = await appOf(new SI.NotSetUpSignIn(), box); apps.push(off1.nest);
  const off2 = await appOf(port, null); apps.push(off2.nest);
  const n1 = await callAt(off1.base, "POST", "/api/platform/session/sign-in", { body: { email: O.email, password: SAMPLE_PW } });
  const n2 = await callAt(off2.base, "POST", "/api/platform/session/sign-in", { body: { email: O.email, password: SAMPLE_PW } });
  ok("PF-4bs DW6 fail: on a server not on the stand-in (until part 2b), or with no sealing key, sign-in → 503 SIGN_IN_NOT_SET_UP", n1.status === 503 && n1.body.code === "SIGN_IN_NOT_SET_UP" && n2.status === 503 && n2.body.code === "SIGN_IN_NOT_SET_UP", [n1.body, n2.body]);
  ok("PF-4bs DW6 pass: RFC 6238's test vector (SHA-1, T = 59 s) gives 287082", SI.totp(Buffer.from("12345678901234567890"), Math.floor(59 / 30)) === "287082");

  // ---------------------------------------------------------------------------- DW7: the password in no output
  ok("PF-4bs DW7 pass: the password appears in nothing this process printed, and in no audit line",
    !printed.includes(SAMPLE_PW) && sql(`select count(*) from audit_event where detail::text like '%${SAMPLE_PW}%' or summary like '%${SAMPLE_PW}%'`) === "0");
} catch (e) {
  ok("the check ran to the end", false, String((e as Error)?.stack ?? e));
} finally {
  for (const a of apps) await a.close().catch(() => {});
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for prune-test-dbs.sh */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
