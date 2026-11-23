// PF-4bc (R1.5; row PF-4bc): the `cognito` side of PF-4b's IdentityAdminPort (api/src/platform/identity/session/provider.ts)
// on the recorded fake Cognito (tests/fixtures/pf4bc-cognito: the SDK's own request handler, so the real client builds and
// signs every request and nothing reaches the network). The row's "Done when", a pass and a fail each: the port's contract
// on both adapters; AdminCreateUser always sends MessageAction=SUPPRESS; a provider error maps to the port's error, never
// a raw AWS message; no credential in a log line. Plus: not set up → 503 with no call; passkeys; who Cognito is asked
// about. No AWS account, no network, no database, no server, no model call (US$0).
//   tsx studio/tests/check_pf4bc_cognito_admin.ts
import { runContract } from "../ports/contracts/contract.ts";
import { identityAdminPortContract, type IdentityAdminHarness } from "../ports/contracts/identity-admin-port.contract.ts";
import { fakeCognito } from "./fixtures/pf4bc-cognito/fake-cognito.ts";

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
let printed = "";   // everything this process prints, scanned for the made-up keys
for (const s of [process.stdout, process.stderr]) { const w = s.write.bind(s); s.write = ((chunk: unknown, ...a: unknown[]) => { printed += String(chunk); return (w as (...x: unknown[]) => boolean)(chunk, ...a); }) as typeof s.write; }

const { LocalIdentityAdmin, CognitoIdentityAdmin } = await import("../api/src/platform/identity/session/provider.ts");
// Made by this run, never real: the SDK signs with them and the fake never checks a signature.
const KEY_ID = `AKIAPF4BC${Math.random().toString(36).slice(2, 12).toUpperCase().padEnd(10, "X")}`, SECRET = `pf4bc-secret-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
