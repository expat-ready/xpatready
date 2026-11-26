// PF-4bc (R1.5; row PF-4bc): the `cognito` side of PF-4b's IdentityAdminPort (api/src/platform/identity/session/provider.ts)
// on the recorded fake Cognito (tests/fixtures/pf4bc-cognito: the SDK's own request handler, so the real client builds and
// signs every request and nothing reaches the network). The row's "Done when", a pass and a fail each: the port's contract
// on both adapters; AdminCreateUser always sends MessageAction=SUPPRESS; a provider error maps to the port's error, never
// a raw AWS message; no credential in a log line. Plus: not set up → 503 with no call; passkeys; who Cognito is asked
// about. One scratch database (two tables) for the firm-lock race. No AWS account, no network, no server, no model call (US$0).
//   tsx studio/tests/check_pf4bc_cognito_admin.ts
import { randomBytes } from "node:crypto";
import { runContract } from "../ports/contracts/contract.ts";
import { identityAdminPortContract, type IdentityAdminHarness } from "../ports/contracts/identity-admin-port.contract.ts";
import { fakeCognito } from "./fixtures/pf4bc-cognito/fake-cognito.ts";

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
let printed = "";   // everything this process prints, scanned for the made-up keys
for (const s of [process.stdout, process.stderr]) { const w = s.write.bind(s); s.write = ((chunk: unknown, ...a: unknown[]) => { printed += String(chunk); return (w as (...x: unknown[]) => boolean)(chunk, ...a); }) as typeof s.write; }

const { LocalIdentityAdmin, CognitoIdentityAdmin } = await import("../api/src/platform/identity/session/provider.ts");
// Made by this run, never real: the SDK signs with them and the fake never checks a signature.
const KEY_ID = `AKIAPF4BC${randomBytes(8).toString("hex").toUpperCase().slice(0, 11)}`, SECRET = `pf4bc-secret-${randomBytes(24).toString("base64url")}`;   // CodeQL: crypto random
const POOL = "ca-central-1_Pf4bcPool", config = { userPoolId: POOL, clientId: "pf4bc-client", mfaRequired: true };
const makeCognito = () => {
  let t = Date.parse("2026-11-23T06:00:00Z");
  const fake = fakeCognito(POOL);
  const admin = new CognitoIdentityAdmin(config, { now: () => t, requestHandler: fake.requestHandler as never, credentials: { accessKeyId: KEY_ID, secretAccessKey: SECRET } });
  return { admin, fake, advance: (ms: number) => { t += ms; } };
};
const problemOf = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e: any) { return { status: e?.getStatus?.() as number, body: e?.getResponse?.() as Record<string, any>, text: JSON.stringify(e?.getResponse?.() ?? String(e)) }; } };

// ------------------------------------------------------------------------------- the port's contract, both adapters
await runContract(identityAdminPortContract, "LocalIdentityAdmin", (): IdentityAdminHarness => {
  let t = Date.parse("2026-11-23T06:00:00Z");
  const admin = new LocalIdentityAdmin(() => t);
  return { admin, advance: (ms) => { t += ms; }, enrol: (u) => admin.enrolled(u.staffId), signOuts: (u) => admin.signedOut.filter((s) => s === u.staffId).length };
}, ok);
const contractFakes: ReturnType<typeof fakeCognito>[] = [];
await runContract(identityAdminPortContract, "CognitoIdentityAdmin", (): IdentityAdminHarness => {
  const c = makeCognito(); contractFakes.push(c.fake);
  return { admin: c.admin, advance: c.advance, enrol: (u) => c.fake.enrol(u.email), signOuts: (u) => c.fake.users.get(u.email.toLowerCase())?.signOuts ?? 0 };
}, ok);

// ------------------------------------------------------------------------------ AdminCreateUser always SUPPRESS
const creates = contractFakes.flatMap((f) => f.seen).filter((s) => s.op === "AdminCreateUser");
ok("PF-4bc pass: every AdminCreateUser the contract made sent MessageAction=SUPPRESS, the email marked verified, the pool's id",
  creates.length >= 4 && creates.every((s) => s.body.MessageAction === "SUPPRESS" && s.body.UserPoolId === POOL && s.body.UserAttributes?.some((a: any) => a.Name === "email_verified" && a.Value === "true")), creates.map((s) => s.body));
{
  const c = makeCognito();
  await c.admin.createUser("again@example.com"); const again = await c.admin.createUser("again@example.com");
  const ops = c.fake.seen.map((s) => s.op);
  ok("PF-4bc fail: a second accept for a taken email (UsernameExistsException) never re-sends an invitation (no RESEND, no DesiredDeliveryMediums): it reads the user with AdminGetUser",
    JSON.stringify(ops) === JSON.stringify(["AdminCreateUser", "AdminCreateUser", "AdminGetUser"]) && c.fake.seen.every((s) => !/RESEND|DesiredDeliveryMediums|TemporaryPassword/.test(s.raw)) && again.subject === c.fake.users.get("again@example.com")!.sub, ops);
  ok("PF-4bc pass: the requests are the SDK's own (AWS JSON 1.1, X-Amz-Target, signed with the given key id: the credentials are used, not printed)",
    c.fake.seen.every((s) => /^AWSCognitoIdentityProviderService\.\w+$/.test(s.headers["x-amz-target"] ?? "") && (s.headers.authorization ?? "").includes(KEY_ID)), c.fake.seen[0]?.headers);
}

// --------------------------------------------------------------------- a provider error → the port's error, our words
const MARK = `raw-aws-text-${KEY_ID}-${SECRET}`;   // a provider message that quotes things: must never come back
const cases: [string, { status: number; type: string; message: string } | "drop", number, string][] = [
  ["TooManyRequestsException 400", { status: 400, type: "TooManyRequestsException", message: MARK }, 503, "SIGN_IN_PROVIDER_BUSY"],
  ["NotAuthorizedException 400 (the role may not call Cognito)", { status: 400, type: "NotAuthorizedException", message: MARK }, 503, "SIGN_IN_NOT_SET_UP"],
  ["AccessDeniedException 400", { status: 400, type: "AccessDeniedException", message: MARK }, 503, "SIGN_IN_NOT_SET_UP"],
  ["InternalErrorException 500", { status: 500, type: "InternalErrorException", message: MARK }, 502, "SIGN_IN_PROVIDER_ERROR"],
  ["InvalidParameterException 400", { status: 400, type: "InvalidParameterException", message: MARK }, 502, "SIGN_IN_PROVIDER_ERROR"],
  ["a dropped connection (no answer)", "drop", 503, "SIGN_IN_PROVIDER_UNREACHABLE"],
];
const answers: string[] = [];
for (const [what, f, status, code] of cases) {
  const c = makeCognito(); c.fake.failNext(f); c.fake.failNext(f);   // maxAttempts 2: a retryable error is asked twice
  const p = await problemOf(() => c.admin.createUser("err@example.com"));
  answers.push(p?.text ?? "");
  ok(`PF-4bc fail: ${what} → ${status} ${code}, our words, never the provider's message`, p?.status === status && p.body.code === code && !p.text.includes("raw-aws-text") && typeof p.body.detail === "string" && p.body.detail.length > 10, p);
}
{
  const c = makeCognito(); await c.admin.createUser("gone@example.com");
  const u = { staffId: "s1", subject: null, email: "nobody@example.com" };
  const signed = await problemOf(() => c.admin.signOutEverywhere(u)), reset = await problemOf(() => c.admin.resetTwoStep(u)), two = await c.admin.twoStep(u);
  ok("PF-4bc pass: a staff member with no provider user (UserNotFoundException): sign-out everywhere and reset succeed with nothing to end, two-step reads not set up", signed === null && reset === null && two.method === null, { signed, reset, two });
}

// ------------------------------------------------------------------------------------ no credential in a log line
ok("PF-4bc fail: the made-up key id and secret appear in no printed line and no error the port returned (scanned after every forced error above)", !printed.includes(KEY_ID) && !printed.includes(SECRET) && !answers.some((a) => a.includes(KEY_ID) || a.includes(SECRET)), { inPrinted: printed.includes(KEY_ID) || printed.includes(SECRET) });
ok("PF-4bc pass: the log line of a refused call names the call and the error's name only", /identity-admin: Cognito AdminCreateUser refused \(TooManyRequestsException 400\)/.test(printed) && !/raw-aws-text/.test(printed));

// -------------------------------------------------------------------------- not set up: 503, and no call is made
for (const [what, cfg] of [["no pool configured", { ...config, userPoolId: null }], ["a pool outside ca-central-1", { ...config, userPoolId: "us-east-1_Abc" }]] as const) {
  const fake = fakeCognito(POOL), admin = new CognitoIdentityAdmin(cfg, { requestHandler: fake.requestHandler as never, credentials: { accessKeyId: KEY_ID, secretAccessKey: SECRET } });
  const all = await Promise.all([() => admin.createUser("a@example.com"), () => admin.handOff("f", "a@example.com"), () => admin.redeem("x".repeat(43)), () => admin.signOutEverywhere({ staffId: "s", subject: null, email: "a@example.com" })].map(problemOf));
  ok(`PF-4bc fail: ${what} → every call 503 SIGN_IN_NOT_SET_UP saying why, and no request is made`, all.every((p) => p?.status === 503 && p.body.code === "SIGN_IN_NOT_SET_UP" && /not set up/.test(p.body.detail)) && fake.seen.length === 0, all);
}

// ----------------------------------------------------------------------------- passkeys, who is asked, redeem checks
{
  const c = makeCognito();
  const p = { staffId: "s-pk", email: "pk@example.com", subject: (await c.admin.createUser("pk@example.com")).subject };
  const t = { staffId: "s-totp", email: "totp@example.com", subject: (await c.admin.createUser("totp@example.com")).subject };
  c.fake.enrol(p.email, "passkey"); c.fake.enrol(t.email);
  const before = await c.admin.twoStep(p);
  await c.admin.resetTwoStep(p); await c.admin.resetTwoStep(t);
  const sets = c.fake.seen.filter((s) => s.op === "AdminSetUserMFAPreference");
  ok("PF-4bc pass: a passkey (WEB_AUTHN configured) reads PASSKEY; its reset turns passkey MFA and the authenticator app off, and two-step reads not set up although the passkey stays listed (break M3)", before.method === "PASSKEY" && sets[0]?.body.WebAuthnMfaSettings?.Enabled === false && sets[0]?.body.SoftwareTokenMfaSettings?.Enabled === false && c.fake.users.get(p.email)!.passkey && !c.fake.users.get(p.email)!.passkeyMfa && (await c.admin.twoStep(p)).method === null, sets.map((s) => s.body));
  ok("PF-4bc fail: an authenticator-app-only reset never sends WebAuthnMfaSettings (refused by a pool without MULTI_FACTOR_WITH_USER_VERIFICATION)", sets[1] && !("WebAuthnMfaSettings" in sets[1].body) && sets[1].body.SoftwareTokenMfaSettings?.Enabled === false, sets[1]?.body);
  const mark = c.fake.seen.length;
  await c.admin.signOutEverywhere(p); await c.admin.signOutEverywhere({ staffId: "s-x", subject: null, email: t.email });
  const after = c.fake.seen.slice(mark), looks = after.filter((x) => x.op === "AdminGetUser").map((x) => x.body.Username), outs = after.filter((x) => x.op === "AdminUserGlobalSignOut").map((x) => x.body.Username);
  ok("PF-4bc pass: Cognito is looked up by our `sub` when we hold it, else by the email, and the change is made on the `sub` it found", looks[0] === p.subject && looks[1] === t.email && outs[0] === p.subject && outs[1] === t.subject, { looks, outs });
  const code = /#code=(.+)$/.exec((await c.admin.handOff("firm-a", t.email)).url)![1];
  c.fake.disable(t.email);
  const disabled = await problemOf(() => c.admin.redeem(code));
  const code2 = /#code=(.+)$/.exec((await c.admin.handOff("firm-a", "never.created@example.com")).url)![1];
  const missing = await problemOf(() => c.admin.redeem(code2));
  ok("PF-4bc fail: a sign-in code for a person Cognito has disabled, or does not have, is refused (401 SIGN_IN_CODE_REFUSED)", disabled?.status === 401 && disabled.body.code === "SIGN_IN_CODE_REFUSED" && missing?.status === 401 && missing.body.code === "SIGN_IN_CODE_REFUSED", { disabled, missing });
}

// ---------------------------------------------------------------------------- the break report's findings (round 1)
{
  // M1: one deadline for every request and retry of a call, inside the callers' 5 s transaction.
  const c = makeCognito(); const u = { staffId: "s-slow", email: "slow@example.com", subject: (await c.admin.createUser("slow@example.com")).subject };
  c.fake.enrol(u.email); c.fake.slow(2_000);
  const t0 = Date.now(), slow = await problemOf(() => c.admin.resetTwoStep(u)), took = Date.now() - t0;
  ok("PF-4bc fail (break M1): Cognito answering in 2 s a request → the reset stops at the 3 s deadline (503), well inside the 5 s transaction, and the second step was never turned off", slow?.status === 503 && took < 4_000 && c.fake.users.get(u.email)!.totp && !c.fake.seen.some((x) => x.op === "AdminSetUserMFAPreference"), { slow, took });
  c.fake.slow(0);
  const t1 = Date.now(); await c.admin.resetTwoStep(u);
  ok("PF-4bc pass (break M1): at normal speed the same reset completes", !c.fake.users.get(u.email)!.totp && Date.now() - t1 < 3_000);
}
{
  // M2: a stale or foreign `sub` is refused, never reported done.
  const c = makeCognito();
  const a = { staffId: "s-a", email: "a.person@example.com", subject: (await c.admin.createUser("a.person@example.com")).subject };
  const b = { staffId: "s-b", email: "b.person@example.com", subject: (await c.admin.createUser("b.person@example.com")).subject };
  c.fake.enrol(a.email); c.fake.enrol(b.email);
  const live = c.fake.recreate(a.email); c.fake.enrol(a.email);
  const stale = [await problemOf(() => c.admin.signOutEverywhere(a)), await problemOf(() => c.admin.resetTwoStep(a))];
  ok("PF-4bc fail (break M2): our stored `sub` is gone and Cognito has another user under that email → 409 SIGN_IN_ACCOUNT_MISMATCH, and that user is not touched", stale.every((x) => x?.status === 409 && x.body.code === "SIGN_IN_ACCOUNT_MISMATCH") && live.signOuts === 0 && live.totp, stale);
  const foreign = { ...a, subject: b.subject };
  const fx = [await problemOf(() => c.admin.signOutEverywhere(foreign)), await problemOf(() => c.admin.resetTwoStep(foreign))];
  ok("PF-4bc fail (break M2): a record holding another person's `sub` → 409 SIGN_IN_ACCOUNT_MISMATCH, and the other person is not signed out or reset", fx.every((x) => x?.status === 409 && x.body.code === "SIGN_IN_ACCOUNT_MISMATCH") && c.fake.users.get(b.email)!.signOuts === 0 && c.fake.users.get(b.email)!.totp, fx);
  const fixed = { ...a, subject: live.sub }; await c.admin.signOutEverywhere(fixed);
  ok("PF-4bc pass (break M2): with the right `sub` the same sign-out reaches the live user", c.fake.users.get(a.email)!.signOuts === 1);
}
{
  // m1: Cognito unable to answer at redeem gives the code back; m2: a turned-off existing user is refused at accept.
  const c = makeCognito(); await c.admin.createUser("m1@example.com");
  const code = /#code=(.+)$/.exec((await c.admin.handOff("firm-a", "m1@example.com")).url)![1];
  c.fake.failNext({ status: 400, type: "TooManyRequestsException", message: "x" }); c.fake.failNext({ status: 400, type: "TooManyRequestsException", message: "x" });
  const busy = await problemOf(() => c.admin.redeem(code)), later = await c.admin.redeem(code).catch(() => null);
  ok("PF-4bc fail (break m1): a busy Cognito at redeem → 503, and the same code works once it answers", busy?.status === 503 && later?.email === "m1@example.com", { busy, later });
  c.fake.disable("m1@example.com");
  const off = await problemOf(() => c.admin.createUser("m1@example.com"));
  ok("PF-4bc fail (break m2): accept for an email whose Cognito user is turned off → 409 SIGN_IN_ACCOUNT_DISABLED, never an account that cannot sign in", off?.status === 409 && off.body.code === "SIGN_IN_ACCOUNT_DISABLED", off);
}
{
  // m3: an unknown error name is provider text: the log prints OtherError. m4: the `sub` must be exactly one UUID.
  const c = makeCognito(); c.fake.failNext({ status: 400, type: `Leak${KEY_ID}`, message: "x" });
  const odd = await problemOf(() => c.admin.createUser("m3@example.com"));
  ok("PF-4bc fail (break m3): an unknown error name is logged as OtherError, never as given", odd?.status === 502 && /AdminCreateUser refused \(OtherError 400\)/.test(printed) && !printed.includes(`Leak${KEY_ID}`), odd);
  const bad = await Promise.all([[{ Name: "sub", Value: "-".repeat(128) }], [], [{ Name: "sub", Value: "11111111-1111-4111-8111-111111111111" }, { Name: "sub", Value: "22222222-2222-4222-8222-222222222222" }]].map((attrs) => {
    const x = makeCognito(); x.fake.overrideNext({ User: { Username: "u", Attributes: attrs, Enabled: true } });
    return problemOf(() => x.admin.createUser("m4@example.com"));
  }));
  ok("PF-4bc fail (break m4): a `sub` that is not a UUID, missing, or given twice → 502 SIGN_IN_PROVIDER_ERROR, nothing stored", bad.every((x) => x?.status === 502 && x.body.code === "SIGN_IN_PROVIDER_ERROR"), bad);
}

{
  // Review M1 and m4: the deadline sits inside Prisma's default 5 s transaction; one throttled attempt is retried once.
  const { COGNITO_DEADLINE_MS, READ_DEADLINE_MS, READS_AT_ONCE } = await import("../api/src/platform/identity/session/provider.ts");
  ok("PF-4bc pass (review M1): one call's Cognito deadline (3 s) and the read deadline are under the callers' 5 s transaction limit", COGNITO_DEADLINE_MS <= 3_000 && READ_DEADLINE_MS <= COGNITO_DEADLINE_MS);
  const c = makeCognito(); c.fake.failNext({ status: 400, type: "TooManyRequestsException", message: "x" });
  const once = await c.admin.createUser("retry@example.com").catch(() => null);
  ok("PF-4bc pass (review m4): one throttled answer is retried once and the user is created (two attempts, the second succeeds)", !!once && c.fake.seen.filter((x) => x.op === "AdminCreateUser").length === 2, c.fake.seen.map((x) => x.op));
  // Review M2: the Team list's reads: one request a person in the usual case, at most READS_AT_ONCE at a time.
  const r = makeCognito(), people = [];
  for (let i = 0; i < 10; i++) { const e = `team${i}@example.com`; people.push({ staffId: `t${i}`, email: e, subject: (await r.admin.createUser(e)).subject }); r.fake.enrol(e); }
  r.fake.slow(100); const mark = r.fake.seen.length; let inFlight = 0, most = 0;
  const h = r.fake.requestHandler, orig = h.handle.bind(h);
  h.handle = (async (req: any, o: any) => { inFlight++; most = Math.max(most, inFlight); try { return await orig(req, o); } finally { inFlight--; } }) as typeof h.handle;
  const all = await Promise.all(people.map((p) => r.admin.twoStep(p)));
  ok("PF-4bc pass (review M2): ten Team rows read with one Cognito request each, at most 4 at a time, all TOTP", all.every((x) => x.method === "TOTP") && r.fake.seen.length - mark === 10 && most <= READS_AT_ONCE, { calls: r.fake.seen.length - mark, most });
}

{
  // Break R2-M2: the read deadline counts the queue: 40 rows with Cognito not answering → every row unknown in about 1.5 s.
  const r = makeCognito(), rows = [];
  for (let i = 0; i < 40; i++) { const e = `down${i}@example.com`; rows.push({ staffId: `d${i}`, email: e, subject: (await r.admin.createUser(e)).subject }); }
  r.fake.slow(60_000);
  const t0 = Date.now(), got = await Promise.all(rows.map((p) => r.admin.twoStep(p).then(() => "read", (e: any) => e?.getStatus?.())));
  const took = Date.now() - t0;
  r.fake.slow(0);
  ok("PF-4bc fail (break R2-M2): 40 Team rows with Cognito not answering → every row refused (503, shown unknown) within about 1.5 s, not one queue of 1.5 s each", got.every((x) => x === 503) && took < 2_500, { took, got: got.slice(0, 3) });
  const after = await r.admin.twoStep(rows[0]);
  ok("PF-4bc pass (break R2-M2): after that the queue is empty and the next read answers", after.method === null);
}
{
  // Break R2-M1: two resets in one firm while Cognito is slow, on real PostgreSQL with the service's own lockFirm and
  // FIRM_TX: never "Cognito changed, our records rolled back"; the second waits at most about 1.5 s and gets 503 FIRM_BUSY.
  const { execFileSync } = await import("node:child_process"); const { join } = await import("node:path");
  const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"], DB = `xr_studio_pf4bc_scratch_${process.pid}`;
  const { PrismaPg } = await import("@prisma/adapter-pg"); const { PrismaClient } = await import("@prisma/client");
  const lockMod = await import("../api/src/platform/identity/session/firm-lock.ts");
  const { lockFirm, FIRM_TX } = lockMod;
  // #3217 r3 follow-up: any lock wait in these transactions answers FIRM_BUSY (absent before: the error passes as it is).
  const busyOnLockTimeout = (lockMod as { busyOnLockTimeout?: (e: unknown) => never }).busyOnLockTimeout ?? ((e: unknown) => { throw e; });
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DB}` }) });
  try {
    const FIRM = "00000000-0000-4000-8000-00000000bc01";
    await db.$executeRawUnsafe("create table platform_firm(id uuid primary key)"); await db.$executeRawUnsafe("create table audit(who text)");
    await db.$executeRawUnsafe(`insert into platform_firm values ('${FIRM}')`);
    await db.$executeRawUnsafe("create table platform_staff(id uuid primary key)");
    const c = makeCognito(), ppl: { staffId: string; email: string; subject: string }[] = [];
    for (const e of ["race.a@example.com", "race.b@example.com"]) { ppl.push({ staffId: e, email: e, subject: (await c.admin.createUser(e)).subject }); c.fake.enrol(e); }
    c.fake.slow(900);   // a reset is 3 requests: 2.7 s, inside the 3 s deadline, longer than the 1.5 s lock wait
    const reset = (u: typeof ppl[number]) => problemOf(() => db.$transaction(async (tx) => {
      await lockFirm(tx as never, FIRM); await c.admin.resetTwoStep(u); await tx.$executeRawUnsafe(`insert into audit values ('${u.email}')`);
    }, FIRM_TX));
    const [ra, rb] = await Promise.all([reset(ppl[0]), (async () => { await new Promise((r) => setTimeout(r, 100)); return reset(ppl[1]); })()]);
    c.fake.slow(0);
    const audit = ((await db.$queryRawUnsafe("select who from audit")) as { who: string }[]).map((x) => x.who);
    const consistent = ppl.every((u) => audit.includes(u.email) === !c.fake.users.get(u.email)!.totp);
    ok("PF-4bc fail (break R2-M1; #3217 r3-m1): two resets in one firm with a slow Cognito → the first completes, the second gets 503 FIRM_BUSY (try again: the invitation page keeps its Continue) before any Cognito call, and for each person Cognito and our audit agree",
      ra === null && rb?.status === 503 && rb.body.code === "FIRM_BUSY" && consistent && c.fake.users.get(ppl[1].email)!.totp, { ra, rb, audit });
    // #3217 R3-m1 (breaker): after the firm lock, the person's row lock (endSessions) is bounded too: a row held elsewhere
    // gives FIRM_BUSY within the bound, never a wait that outlasts the transaction after the provider has changed.
    const STAFF = "00000000-0000-4000-8000-00000000bc02";
    await db.$executeRawUnsafe(`insert into platform_staff values ('${STAFF}')`);
    const { Client } = (await import("pg")).default;
    const holder = new Client({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DB}` }); await holder.connect();
    await holder.query("begin"); await holder.query(`select id from platform_staff where id = '${STAFF}' for update`);
    const t0 = Date.now();
    const attempt = problemOf(() => db.$transaction(async (tx) => {
      await lockFirm(tx as never, FIRM);
      await tx.$queryRawUnsafe(`select id from platform_staff where id = '${STAFF}' for update`);   // as endSessions
    }, FIRM_TX).catch(busyOnLockTimeout));
    // Without a bound the wait never ends (Prisma's limit does not stop a statement that is waiting): 6 s then counts as a fail.
    const held = await Promise.race([attempt, new Promise<"still waiting">((r) => setTimeout(() => r("still waiting"), 6_000))]);
    const took = Date.now() - t0; await holder.query("rollback"); await holder.end(); await attempt;
    ok("PF-4bc fail (#3217 R3-m1): a person's row held elsewhere after the firm lock → 503 FIRM_BUSY within about 3 s, not a wait the whole transaction long", typeof held === "object" && held?.status === 503 && held.body.code === "FIRM_BUSY" && took < 5_000, { held, took });
    ok("PF-4bc pass (break R2-M1; #3217 R3-m2): the transaction's limit covers two bounded lock waits (up to 3 s each: Postgres bounds each lock attempt, and a row lock can wait twice), the 3 s provider deadline and the commit", FIRM_TX.timeout >= 2 * 3_000 + 3_000 + 2_000, FIRM_TX);
    // Breaker m1 and m3, the helpers themselves: a transaction too old for the provider's deadline answers 503 before the
    // call; Prisma's P2028 is the same busy.
    const { roomForProvider, PROVIDER_ROOM_MS, txClock } = lockMod as { roomForProvider?: (tx: unknown) => void; PROVIDER_ROOM_MS?: number; txClock?: <T>(f: () => Promise<T>) => Promise<T> };
    const clock = txClock ?? (<T>(f: () => Promise<T>) => f());
    const late = await problemOf(() => db.$transaction(async (tx) => clock(async () => { await lockFirm(tx as never, FIRM); await new Promise((r) => setTimeout(r, FIRM_TX.timeout - (PROVIDER_ROOM_MS ?? 0) + 200)); roomForProvider?.(tx); return "called"; }), FIRM_TX).catch(busyOnLockTimeout));
    // Two transactions at once: each has its own clock (a shared one would refuse the fresh transaction).
    const [early, early2] = await Promise.all([1, 2].map(() => problemOf(() => db.$transaction(async (tx) => clock(async () => { await new Promise((r) => setTimeout(r, 50)); roomForProvider?.(tx); }), FIRM_TX))));
    ok("PF-4bc fail (breaker m1): a transaction with less than the provider's deadline plus 2 s left answers 503 FIRM_BUSY before the provider call; a fresh one goes on", late?.status === 503 && late.body.code === "FIRM_BUSY" && early === null && early2 === null, { late, early, early2 });
    const p2028 = await problemOf(async () => busyOnLockTimeout(Object.assign(new Error("Transaction API error: Unable to start a transaction in the given time."), { code: "P2028" })));
    ok("PF-4bc fail (breaker m3): Prisma's P2028 on these paths answers 503 FIRM_BUSY, not a 500", p2028?.status === 503 && p2028.body.code === "FIRM_BUSY", p2028);
    const { SIGN_OUT_TX } = lockMod as { SIGN_OUT_TX?: { timeout: number } };
    ok("PF-4bc fail (review m2): sign-out's limit is above FIRM_TX's, since a bounded holder may keep the firm lock that long", !!SIGN_OUT_TX && SIGN_OUT_TX.timeout > FIRM_TX.timeout, SIGN_OUT_TX);
  } finally { await db.$disconnect(); try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* prune-test-dbs.sh */ } }
}

// #3217 r3-m2 and r3-m3: how session/service.ts uses the lock, read from its source. A person's own sign-out calls no
// provider, so it never gives up on the firm lock (no revocation row would be written while the browser forgets the
// token); every provider-calling transaction takes the bounded lock inside FIRM_TX.
{
  const { readFileSync } = await import("node:fs"); const { join } = await import("node:path");
  const src = readFileSync(join(import.meta.dirname, "..", "api", "src", "platform", "identity", "session", "service.ts"), "utf8");
  const body = (name: string) => { const at = src.search(new RegExp(`async ${name}[(<]`)); return at < 0 ? "" : src.slice(at, src.indexOf("\n  async ", at + 10) < 0 ? undefined : src.indexOf("\n  async ", at + 10)); };
  ok("PF-4bc fail (#3217 r3-m2): signOut takes the firm lock without the bound (inFirm with bounded: false)", /bounded:\s*false/.test(body("signOut")), body("signOut").slice(0, 300));
  ok("PF-4bc pass (#3217 r3-m3, review m4): inFirm takes lockFirm inside FIRM_TX only when bounded, and maps a lock timeout to FIRM_BUSY", /if \(o\.bounded\) await lockFirm\(/.test(body("inFirm")) && /o\.bounded \? FIRM_TX : SIGN_OUT_TX/.test(body("inFirm")) && /busyOnLockTimeout\(e\)/.test(body("inFirm")), body("inFirm").slice(0, 400));
  const acc = body("accept"), lift = acc.indexOf("set local lock_timeout to default"), create = acc.indexOf("this.admin.createUser(");
  ok("PF-4bc fail (review m1): accept lifts the lock bound just before its provider call (what follows it waits within FIRM_TX)", lift > 0 && create > lift && acc.slice(lift, create).split("\n").length <= 3, { lift, create });
  ok("PF-4bc fail (review m3): accept's busy words are for a person not yet in the firm", /BUSY_WORDS_INVITEE/.test(acc));
  // Breaker m1: each provider call is preceded by roomForProvider within three lines.
  const before = (call: string) => { const at = src.indexOf(call); return at > 0 && /roomForProvider\(tx/.test(src.slice(src.lastIndexOf("\n", at - 200), at)) && src.slice(src.lastIndexOf("roomForProvider(tx", at), at).split("\n").length <= 3; };
  ok("PF-4bc fail (breaker m1): every provider call in session/service.ts is preceded by roomForProvider (createUser, signOutEverywhere, resetTwoStep)", ["this.admin.createUser(", "this.admin.signOutEverywhere(", "this.admin.resetTwoStep("].every(before));
  ok("PF-4bc pass (#3217 r3-m3): accept takes lockFirm inside FIRM_TX and maps a lock timeout to FIRM_BUSY", /lockFirm\(/.test(body("accept")) && /FIRM_TX/.test(body("accept")) && /busyOnLockTimeout/.test(body("accept")), body("accept").length);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
