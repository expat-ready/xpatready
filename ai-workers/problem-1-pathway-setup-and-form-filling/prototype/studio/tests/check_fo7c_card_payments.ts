// FO-7c part 1 (R1.57; brief briefs/track-b/FO-7c-1.md, FO-7c.md's named cases): the firm's payment account on the fake
// rail. DW1 (step-up and key), DW2 (the lifecycle on the fixture events), DW3 (the webhook door), the walls (part 1's
// share of DW4: the firm found under the walls, another firm's account never read), DW10 (no secret in an answer, a log
// or a column) and the rail's event check on the fake and on the Stripe adapter alike. DW5-DW9, DW11 and DW4's pay link
// are parts 2 and 3. The fixtures under tests/fixtures/fo7c-stripe/ are NOT recorded from Stripe (each file says why).
// A scratch database (every migration), a Nest app of PF-4's guard, PF-12's walls and this row's classes with the local
// sign-in stand-in; the API connects as xr_app. Fake rail, fake mail, fake notifications: no network, no key, US$0.
//   tsx studio/tests/check_fo7c_card_payments.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Stripe from "stripe";
import { PaymentAccounts, BREAK_WORDS, isBroken, stateFrom } from "../api/src/client-money/card/account.ts";
import { RailSignatureError, fakeCardRail, type CardRail } from "../api/src/client-money/card/rail.ts";
import { StripeCardRail } from "../api/src/client-money/card/stripe-rail.ts";
import { fakeMail } from "../ports/mail.ts";
import { NOTIFICATION_KIND, fakeNotifications } from "../ports/notifications.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), FIX = join(import.meta.dirname, "fixtures", "fo7c-stripe");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo7c_scratch_${process.pid}`, urlOf = (user = "xr_studio") => `postgresql://${user}@127.0.0.1:54329/${DB}`;
const sql = (q: string, user = "xr_studio") => execFileSync(join(BIN, "psql"), [urlOf(user), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
/** Everything the run says: every answer, and every log line of the app (DW10 scans it). */
const said: string[] = [];
for (const out of [process.stdout, process.stderr]) { const was = out.write.bind(out); out.write = ((chunk: unknown, ...a: unknown[]) => { said.push(String(chunk)); return (was as (...x: unknown[]) => boolean)(chunk, ...a); }) as typeof out.write; }
const SECRET = /\b(sk|rk)_(test|live)_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9+/=]{8,}/;
const fixture = (name: string) => JSON.parse(readFileSync(join(FIX, `${name}.json`), "utf8")) as { source: string; event: Record<string, unknown> };

// ------------------------------------------------------------- the rail's event check: the fake and the Stripe adapter
// One contract for both (P-606). The values are made here, never real: a made-up platform key and two signing values.
const hookSecret = ["whsec", randomBytes(24).toString("hex")].join("_"), otherSecret = ["whsec", randomBytes(24).toString("hex")].join("_");
const stripeLib = new Stripe(["sk", "test", randomBytes(24).toString("hex")].join("_"));
const eventBody = JSON.stringify({ ...fixture("account.updated.charges-enabled").event });
const rails: [string, CardRail][] = [["the fake rail", fakeCardRail({ webhookSecret: hookSecret })], ["the Stripe adapter", new StripeCardRail(stripeLib, hookSecret)]];
const header = (secret: string, body = eventBody, at = Date.now()) => stripeLib.webhooks.generateTestHeaderString({ payload: body, secret, timestamp: Math.floor(at / 1000) });
const refusedSig = (f: () => unknown) => { try { f(); return false; } catch (e) { return e instanceof RailSignatureError; } };
for (const [name, rail] of rails) {
  const e = rail.verifyEvent(eventBody, header(hookSecret));
  ok(`FO-7c rail pass (${name}): an event signed with the connected-accounts secret is read: its id, type, account and its object's id (part 2b), nothing else`, JSON.stringify(e) === JSON.stringify({ id: "evt_1SampleFo7cActive", type: "account.updated", account: "acct_1SampleFo7c000001", objectId: "acct_1SampleFo7c000001" }), e);
  ok(`FO-7c rail fail (${name}): no header, another secret (the platform webhook's), a changed body or a signature over 5 minutes old → refused`,
    refusedSig(() => rail.verifyEvent(eventBody, undefined)) && refusedSig(() => rail.verifyEvent(eventBody, header(otherSecret))) && refusedSig(() => rail.verifyEvent(eventBody.replace("acct_1Sample", "acct_1Other0"), header(hookSecret)))
    && refusedSig(() => rail.verifyEvent(eventBody, header(hookSecret, eventBody, Date.now() - 6 * 60_000))));
}
{ const now = Math.floor(Date.now() / 1000), [t, v1] = header(hookSecret).split(","), junk = "v1=" + "0".repeat(64), odd = "v1=" + "\u00e9".repeat(64);
  const odds = [`${t},${junk},${v1}`, `${t},${v1},${junk}`, `${t}.0,${v1}`, `t=${now + 600},${v1}`, `t=1,${t},${v1}`, `${t},t=1,${v1}`, ` ${t},${v1}`, `${t},${odd}`, `t=0x${now.toString(16)},${v1}`];
  const verdict = (r: CardRail, h: string) => { try { r.verifyEvent(eventBody, h); return "read"; } catch (e) { return e instanceof RailSignatureError ? "refused" : `other: ${(e as Error).name}`; } };
  const fake = odds.map((h) => verdict(rails[0][1], h)), real = odds.map((h) => verdict(rails[1][1], h));
  ok("FO-7c rail pass (round 2 n2): on odd headers (two v1 values, odd timestamps, repeated t, a leading space, non-ASCII bytes) the fake and the Stripe adapter answer alike, and never anything but read or refused",
    JSON.stringify(fake) === JSON.stringify(real) && fake.every((v) => v === "read" || v === "refused") && fake[0] === "read" && fake[1] === "read" && fake[7] === "refused", { fake, real }); }
ok("FO-7c rail pass: the fake signs as Stripe's library checks (its header passes the Stripe adapter with the same secret)", (rails[1][1].verifyEvent(eventBody, (rails[0][1] as ReturnType<typeof fakeCardRail>).sign(eventBody))).id === "evt_1SampleFo7cActive");
ok("FO-7c fixtures: each file says it is not recorded from Stripe and names the type file and date it was built from", readdirSync(FIX).length === 6 && readdirSync(FIX).every((f) => /NOT recorded from Stripe.*Events\.d\.ts.*2[26] Nov 2026/.test((JSON.parse(readFileSync(join(FIX, f), "utf8")) as { source: string }).source)));

// ------------------------------------------------------------------------------------- the mapping alone (AG-16-15)
const P = { status: "PENDING", chargesEnabled: false, payoutsEnabled: false } as const, on = { chargesEnabled: true, payoutsEnabled: true, requirementsDue: false }, off = { chargesEnabled: false, payoutsEnabled: false, requirementsDue: true };
ok("FO-7c DW2 rule pass: Connected only once charges are enabled; requirements due with charges on is RESTRICTED and not a break; charges off after that is a break",
  stateFrom(P, on).status === "ACTIVE" && stateFrom(P, { ...on, requirementsDue: true }).status === "RESTRICTED" && !isBroken(stateFrom(P, { ...on, requirementsDue: true })) && isBroken(stateFrom(stateFrom(P, on), off)));
ok("FO-7c DW2 rule fail: an account that never had charges stays PENDING (not a break), payouts on alone included; a disconnected account is not revived by an account read",
  stateFrom(P, off).status === "PENDING" && !isBroken(stateFrom(P, off)) && stateFrom(P, { chargesEnabled: false, payoutsEnabled: true, requirementsDue: false }).status === "PENDING" && stateFrom({ status: "DISCONNECTED", chargesEnabled: false, payoutsEnabled: false }, on).status === "DISCONNECTED");

// --------------------------------------------------------------------------------------------- the scratch database
execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf();
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_LOCAL_SECRET", "APP_DATABASE_URL", "PLATFORM_STRIPE_SECRET_KEY", "PLATFORM_STRIPE_CONNECT_WEBHOOK_SECRET"]) delete process.env[k];

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { FirmWallsInterceptor } = await import("../api/src/features/platform-firm-walls.ts");
const { PaymentAccountController, StripeConnectHookController, connectRawBody } = await import("../api/src/client-money/card/routes.ts");
const { default: feature, firmOfAccount } = await import("../api/src/features/client-money-card.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");

const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(), options: "-c TimeZone=UTC" }) });
const clock = new (class extends PlatformClock { override now() { return Date.now(); } })();
const local = new LocalIdentity("fo7c-check-signing-key-0123456789abcdef", () => clock.now());
const rail = fakeCardRail({ webhookSecret: hookSecret }), mail = fakeMail(), notes = fakeNotifications();
let ahead = 0, lookups = 0;   // the service's clock, moved ahead for the step-up case; firm lookups made by the door
type Res = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
let app: { close(): Promise<void> } | null = null;
try {
  const accounts = { provide: PaymentAccounts, useFactory: (db: InstanceType<typeof Db>) => new PaymentAccounts(db, { rail, audit: auditEvent, clock: { now: () => new Date(Date.now() + ahead) }, mail, notifications: notes, appUrl: "https://app.example.test", firmOfAccount: (a: string) => { lookups++; return firmOfAccount(db)(a); } }), inject: [Db] };
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard,
    { provide: APP_GUARD, useExisting: PlatformGuard }, { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor }, accounts];
  @Module({ controllers: [PlatformIdentityController, PaymentAccountController, StripeConnectHookController] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false }); connectRawBody(nest as never); await nest.listen(0, "127.0.0.1"); app = nest;
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;
  const read = async (r: Response): Promise<Res> => { const t = await r.text(); said.push(t); let b: unknown = t; try { b = JSON.parse(t); } catch { /* text */ } return { status: r.status, body: b }; };
  const call = async (token: string | undefined, method: string, path: string, body?: unknown) => read(await fetch(`${base}/api${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }));
  /** One fixture event, for an account and under an event id, signed (or not) and posted to the door as raw bytes. */
  const hook = async (name: string, account: string, id: string, sign: (body: string) => string | undefined = (b) => rail.sign(b)) => {
    const body = JSON.stringify({ ...fixture(name).event, id, account }), s = sign(body);
    return read(await fetch(`${base}/api/hooks/stripe-connect`, { method: "POST", headers: { "content-type": "application/json", ...(s ? { "stripe-signature": s } : {}) }, body }));
  };
  ok("setup: the feature registers the two controllers and the service (part 2a's two: the pay link and the door; part 3's card refund); with no Stripe key its service connects nothing (503)", feature.controllers.length === 5 && (feature.providers[0] as { provide: unknown }).provide === PaymentAccounts);

  await seedSampleFirms(owner);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  const staff = (actor: string, firm: string) => sql(`select id from platform_staff where actor_id = '${actor}' and firm_id = '${firm}'`);
  const signIn = async (actorId: string, firmKey: string) => { const r = await call(undefined, "POST", "/platform/session/local", { firmKey, actorId, secondStep: true }); if (r.status !== 200) throw new Error(JSON.stringify(r.body)); return r.body.token as string; };
  const tOwner = await signIn("user-R", "sample-firm"), tOfficer = await signIn("user-O", "sample-firm"), tB = await signIn("user-S", "sample-solo");
  const ownersA = sql(`select string_agg(s.email, ',' order by s.email) from platform_staff s join platform_role_grant g on g.staff_id = s.id and g.role = 'OWNER' and g.ended_at is null where s.firm_id = '${A}' and s.status = 'ACTIVE'`).split(",");
  const row = (firm = A) => sql(`select coalesce((select status || ':' || charges_enabled || ':' || payouts_enabled || ':' || coalesce(stripe_account_id, '') from money_payment_account where firm_id = '${firm}'), 'none')`);
  const audits = (action: string) => Number(sql(`select count(*) from audit_event where action = '${action}'`));
  const receipts = () => Number(sql(`select count(*) from webhook_receipt where service = 'stripe-connect'`));
  const made = () => rail.calls().filter((c) => c.name === "createAccount").length;
  const ONB = "/front-office/money/payment-account/onboarding", VIEW = "/front-office/money/payment-account";

  // ------------------------------------------------------------------------------------- DW1: step-up and the key
  const noSettings = await call(tOwner, "POST", ONB);
  ok("FO-7c setup fail: before the firm's payment settings exist, connecting is refused in words (409 PAYMENTS_NOT_SET_UP), no account made", noSettings.status === 409 && noSettings.body?.code === "PAYMENTS_NOT_SET_UP" && row() === "none" && made() === 0, noSettings.body);
  for (const f of [A, B]) sql(`insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${f}', 'seed:FO-7c-1', now())`);
  ahead = 6 * 60_000; const stale = await call(tOwner, "POST", ONB); ahead = 0;
  ok("FO-7c DW1 fail: the Owner without step-up (the sign-in is 6 minutes old) → 401 STEP_UP_REQUIRED, no account made", stale.status === 401 && stale.body?.code === "STEP_UP_REQUIRED" && row() === "none" && made() === 0, stale.body);
  const officer = await call(tOfficer, "POST", ONB), officerView = await call(tOfficer, "GET", VIEW), anon = await call(undefined, "POST", ONB);
  ok("FO-7c DW1 fail: a person without agent/payment-rail:connect → 403 on connecting and on the status; not signed in → 401; no account made", officer.status === 403 && officerView.status === 403 && anon.status === 401 && row() === "none" && made() === 0, [officer.body, officerView.body]);
  for (const role of ["ADMIN", "BILLING_FINANCE"]) sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${A}', '${staff("user-T", A)}', '${role}', 'seed:FO-7c-1')`);
  const tMoney = await signIn("user-T", "sample-firm"), money = [await call(tMoney, "POST", ONB), await call(tMoney, "GET", VIEW)];
  ok("FO-7c DW1 fail: an Admin who is also Billing/Finance (holds agent/payment:record, not agent/payment-rail:connect) → 403 on both routes, no account made", money.every((r) => r.status === 403) && row() === "none" && made() === 0, money.map((r) => r.body));
  const first = await call(tOwner, "POST", ONB), acctA = row().split(":")[3];
  ok("FO-7c DW1 pass: the Owner, just signed in → one account (PENDING, an acct_ id), a hosted sign-up link, one audit line by the Owner", first.status === 200 && first.body.status === "PENDING" && /^https:\/\//.test(first.body.url) && /^PENDING:false:false:acct_/.test(row()) && made() === 1
    && sql(`select count(*) || ':' || min(actor) from audit_event where action = 'payment_account.onboarding_started' and firm_id = '${A}'`) === `1:staff:${staff("user-R", A)}`, first.body);
  const [again, twin] = await Promise.all([call(tOwner, "POST", ONB), call(tOwner, "POST", ONB)]);
  ok("FO-7c DW1 pass: a second call (and two at once) → the same account, a fresh link each, no second account or audit line", again.status === 200 && twin.status === 200 && row().split(":")[3] === acctA && made() === 1 && new Set([first.body.url, again.body.url, twin.body.url]).size === 3 && audits("payment_account.onboarding_started") === 1, [again.body, twin.body]);
  const v0 = await call(tOwner, "GET", VIEW);
  ok("FO-7c status pass: GET answers the status, the two switches and the alert only (no account id, no processor object)", v0.status === 200 && JSON.stringify(v0.body) === JSON.stringify({ status: "PENDING", chargesEnabled: false, payoutsEnabled: false, alert: null }), v0.body);

  // ----------------------------------------------------------------------------------------- DW3: the webhook door
  const lookupsBefore = lookups;
  const unsigned = await hook("account.updated.charges-enabled", acctA, "evt_fo7c_unsigned", () => undefined);
  const forged = await hook("account.updated.charges-enabled", acctA, "evt_fo7c_forged", (b) => header(otherSecret, b));
  const old = await hook("account.updated.charges-enabled", acctA, "evt_fo7c_old", (b) => rail.sign(b, hookSecret, new Date(Date.now() - 6 * 60_000)));
  ok("FO-7c DW3 fail: an unsigned event, one signed with another secret (the platform webhook's) and one signed 6 minutes ago → 400, nothing stored, nothing changed, the firm lookup never asked", [unsigned, forged, old].every((r) => r.status === 400 && r.body?.code === "SIGNATURE") && receipts() === 0 && row() === `PENDING:false:false:${acctA}` && lookups === lookupsBefore, [unsigned.body, forged.body]);
  const notEvent = await (async () => { const b = JSON.stringify({ id: "evt_fo7c_notevent", object: "charge", account: acctA }); return read(await fetch(`${base}/api/hooks/stripe-connect`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": rail.sign(b) }, body: b })); })();
  const notJson = await read(await fetch(`${base}/api/hooks/stripe-connect`, { method: "POST", headers: { "content-type": "text/plain", "stripe-signature": rail.sign("not json") }, body: "not json" }));
  ok("FO-7c DW3 fail (schema after the signature, PF-28 amendment 1): a correctly signed body that is not an event, or not JSON → 400 NOT_AN_EVENT, nothing stored, no lookup", notEvent.status === 400 && notEvent.body?.code === "NOT_AN_EVENT" && notJson.status === 400 && notJson.body?.code === "NOT_AN_EVENT" && receipts() === 0 && lookups === lookupsBefore, [notEvent.body, notJson.body]);
  const unknown = await hook("account.updated.charges-enabled", "acct_1NobodysAccount", "evt_fo7c_unknown");
  ok("FO-7c DW3 pass: a signed event for an unknown account → 200, nothing written (logged by its id only)", unknown.status === 200 && receipts() === 0 && audits("payment_account.status_changed") === 0 && said.some((l) => l.includes("evt_fo7c_unknown")) && !said.some((l) => l.includes("acct_1NobodysAccount")), unknown.body);

  // ------------------------------------------------------------------------------- DW2: the lifecycle (AG-16-15, -16)
  rail.set(acctA, { chargesEnabled: true, payoutsEnabled: true, requirementsDue: false, detailsSubmitted: true });
  const active = await hook("account.updated.charges-enabled", acctA, "evt_fo7c_1");
  ok("FO-7c DW2 pass: account.updated with charges enabled → ACTIVE (after the rail's own read), one receipt as the firm, one audit line by system:stripe-connect, no email", active.status === 200 && row() === `ACTIVE:true:true:${acctA}`
    && sql(`select firm_id || ':' || (handled_at is not null) from webhook_receipt where service = 'stripe-connect' and event_id = 'evt_fo7c_1'`) === `${A}:true` && sql(`select min(actor) from audit_event where action = 'payment_account.status_changed'`) === "system:stripe-connect" && mail.sent.length === 0, active.body);
  const dup = await hook("account.updated.charges-enabled", acctA, "evt_fo7c_1");
  ok("FO-7c DW3 pass: the same event id twice → stored once, handled once (one receipt, one audit line)", dup.status === 200 && dup.body.duplicate === true && receipts() === 1 && audits("payment_account.status_changed") === 1, dup.body);
  rail.set(acctA, { requirementsDue: true });
  const due = await hook("account.updated.requirements-due", acctA, "evt_fo7c_2"), vDue = await call(tOwner, "GET", VIEW);
  ok("FO-7c DW2 pass: requirements due with charges still enabled → RESTRICTED, shown, no email, no item, no alert", due.status === 200 && row() === `RESTRICTED:true:true:${acctA}` && mail.sent.length === 0 && notes.sent().length === 0 && vDue.body.alert === null, vDue.body);
  rail.set(acctA, { chargesEnabled: false, payoutsEnabled: false });
  const broke = await hook("account.updated.charges-disabled", acctA, "evt_fo7c_3"), vBroke = await call(tOwner, "GET", VIEW);
  const to = () => mail.sent.map((m) => m.to).sort().join(",");
  ok("FO-7c DW2 pass: charges turned off after ACTIVE → a break (Failed): one email to each Owner and to nobody else, one home item, the alert's words on the status", broke.status === 200 && row() === `RESTRICTED:false:false:${acctA}` && to() === ownersA.join(",") && ownersA.length >= 1
    && notes.sent().length === ownersA.length && notes.sent().every((n) => n.kind === NOTIFICATION_KIND.PAYMENT_ACCOUNT_DISCONNECTED && n.item.id === A) && vBroke.body.alert?.words === BREAK_WORDS && audits("payment_account.broke") === 1, [to(), vBroke.body]);
  const sameBreak = await hook("account.updated.charges-disabled", acctA, "evt_fo7c_3"), stillOff = await hook("account.updated.charges-disabled", acctA, "evt_fo7c_4");
  ok("FO-7c DW2 fail: the same break event again, and another event while still broken → no second email, no second audit line", sameBreak.body.duplicate === true && stillOff.status === 200 && mail.sent.length === ownersA.length && audits("payment_account.broke") === 1, to());
  rail.set(acctA, { chargesEnabled: true, payoutsEnabled: true, requirementsDue: false });
  const back = await hook("account.updated.charges-enabled", acctA, "evt_fo7c_5"), vBack = await call(tOwner, "GET", VIEW);
  ok("FO-7c DW2 pass: reconnected → ACTIVE, the alert cleared, no \"fixed\" email", back.status === 200 && row() === `ACTIVE:true:true:${acctA}` && vBack.body.alert === null && mail.sent.length === ownersA.length, vBack.body);
  rail.deauthorize(acctA);
  const gone = await hook("account.application.deauthorized", acctA, "evt_fo7c_6"), vGone = await call(tOwner, "GET", VIEW);
  ok("FO-7c DW2 pass: account.application.deauthorized → DISCONNECTED, a new break: one more email to each Owner, the item unread again (not a second one)", gone.status === 200 && row() === `DISCONNECTED:false:false:${acctA}` && mail.sent.length === 2 * ownersA.length && to() === [...ownersA, ...ownersA].sort().join(",")
    && notes.sent().length === ownersA.length && vGone.body.alert?.code === "PAYMENT_ACCOUNT_DISCONNECTED", [to(), vGone.body]);
  const late = await hook("account.updated.charges-enabled", acctA, "evt_fo7c_7");
  ok("FO-7c DW2 fail: an account event arriving after the disconnect does not revive the account (still DISCONNECTED, no email)", late.status === 200 && row() === `DISCONNECTED:false:false:${acctA}` && mail.sent.length === 2 * ownersA.length);
  const re = await call(tOwner, "POST", ONB), acctA2 = row().split(":")[3];
  const stray = await hook("account.updated.charges-enabled", acctA, "evt_fo7c_8");
  const vRe = await call(tOwner, "GET", VIEW);
  ok("FO-7c DW2 fail (Lead B on #2938): the Owner starts connecting again → a new account (PENDING) and the alert STAYS until it is Connected; the lost account's events now match no firm", re.status === 200 && acctA2 !== acctA && row() === `PENDING:false:false:${acctA2}` && made() === 2 && stray.status === 200 && row() === `PENDING:false:false:${acctA2}` && vRe.body.alert?.code === "PAYMENT_ACCOUNT_DISCONNECTED", vRe.body);

  // ------------------------------------------------------------------------------------------------- the walls
  const vB = await call(tB, "GET", VIEW);
  ok("FO-7c walls pass: another firm's Owner reads only their own firm (NOT_CONNECTED), never firm A's account; firm A's events changed nothing of firm B", vB.status === 200 && vB.body.status === "NOT_CONNECTED" && row(B) === "none" && Number(sql(`select count(*) from webhook_receipt where firm_id = '${B}'`)) === 0, vB.body);
  const asApp = (firm: string | null, q: string) => sql(`begin; ${firm ? `set local app.firm_id = '${firm}';` : ""} ${q}; commit;`, "xr_app");
  ok("FO-7c walls pass: the firm is found under the walls by the narrow lookup alone: xr_app with no firm reads no account row, the lookup answers the firm's id (null when unknown) and nothing else",
    asApp(null, "select count(*) from money_payment_account") === "0" && asApp(B, `select count(*) from money_payment_account where stripe_account_id = '${acctA2}'`) === "0" && asApp(A, "select count(*) from money_payment_account") === "1"
    && asApp(null, `select money_firm_of_stripe_account('${acctA2}')`) === A && asApp(null, `select coalesce(money_firm_of_stripe_account('acct_1NobodysAccount')::text, 'null')`) === "null"
    && sql(`select prosecdef || ':' || pg_get_userbyid(proowner) || ':' || has_function_privilege('public', oid, 'execute') || ':' || has_function_privilege('xr_app', oid, 'execute') from pg_proc where proname = 'money_firm_of_stripe_account'`) === "true:xr_wall_reader:false:true");
  ok("FO-7c walls fail: the door is on no bypass use (it runs as the firm it found)", ![...readdirSync(join(STUDIO, "api/src/client-money/card")).map((f) => join(STUDIO, "api/src/client-money/card", f)), join(STUDIO, "api/src/features/client-money-card.ts")].some((f) => /asBypass|BYPASS_ROLE/.test(readFileSync(f, "utf8"))));

  // A break whose email cannot be sent: firm B, on the service with a failing sender (its own account, made here).
  const mute = new PaymentAccounts(nest.get(Db), { rail, audit: auditEvent, clock: { now: () => new Date() }, mail: fakeMail({ failOn: () => true }), notifications: notes, appUrl: "https://app.example.test", firmOfAccount: firmOfAccount(nest.get(Db)) });
  const { withFirm } = await import("../api/src/platform/firm-scope.ts"), ownerB = { firmId: B, staffId: staff("user-S", B), authTime: Date.now() / 1000 } as never;
  await withFirm(B, () => mute.onboard(ownerB)); const acctB = row(B).split(":")[3], post = (id: string, type: string) => { const b = JSON.stringify({ ...fixture("account.updated.charges-enabled").event, id, type, account: acctB }); return mute.receive(Buffer.from(b), rail.sign(b)); };
  rail.set(acctB, { chargesEnabled: true, payoutsEnabled: true, requirementsDue: false }); await post("evt_fo7c_b1", "account.updated"); rail.deauthorize(acctB); await post("evt_fo7c_b2", "account.application.deauthorized");
  ok("FO-7c DW2 fail: a break whose email cannot be sent still disconnects the account and leaves the home item (the failure logged by the event's id); firm A untouched",
    row(B) === `DISCONNECTED:false:false:${acctB}` && notes.sent().some((n) => n.item.id === B) && said.some((l) => l.includes("payment_account_break_mail_failed") && l.includes("evt_fo7c_b2")) && row() === `PENDING:false:false:${acctA2}`, row(B));
  const brokeB = () => Number(sql(`select count(*) from audit_event where action = 'payment_account.broke' and firm_id = '${B}'`)), itemsB = () => notes.sent().filter((n) => n.item.id === B).length, b0 = [brokeB(), itemsB()];
  await withFirm(B, () => mute.onboard(ownerB)); const acctB2 = row(B).split(":")[3]; rail.deauthorize(acctB2);
  { const b = JSON.stringify({ ...fixture("account.application.deauthorized").event, id: "evt_fo7c_b3", account: acctB2 }); await mute.receive(Buffer.from(b), rail.sign(b)); }
  ok("FO-7c DW2 fail (round 2 n1): re-onboarded after a disconnect, the half-made account removed before it connects → the same break: DISCONNECTED, no second break line, email or item",
    row(B) === `DISCONNECTED:false:false:${acctB2}` && acctB2 !== acctB && b0[0] === 1 && brokeB() === 1 && itemsB() === b0[1] && !said.some((l) => l.includes("payment_account_break_mail_failed") && l.includes("evt_fo7c_b3")), { b0, broke: brokeB(), items: itemsB() });

  // ------------------------------------------------------------------- with no Stripe key: nothing connects (the feature)
  process.env.PLATFORM_ENVIRONMENT = "local";
  const bare = await (feature.providers[0] as { useFactory: (db: unknown) => PaymentAccounts }).useFactory(nest.get(Db));
  const refusal = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { const x = e as { getStatus?: () => number; getResponse?: () => unknown }; return { status: x.getStatus?.() ?? 0, body: JSON.stringify(x.getResponse?.() ?? null) }; } };
  const r1 = await refusal(() => bare.onboard({ firmId: A, staffId: staff("user-R", A), authTime: Date.now() / 1000 } as never)), r2 = await refusal(() => bare.receive(Buffer.from(eventBody), header(hookSecret)));
  ok("FO-7c pass: a server with no Stripe key and connect secret makes no account and takes no event (503 on both)", r1?.status === 503 && r2?.status === 503 && made() === 4, [r1, r2]);
  ok("FO-7c fail: that 503 answer names no setting (plain words; the setting names go to the server log only, once per process however many calls)", ![r1, r2].some((r) => /PLATFORM_|STRIPE_|secret|key/i.test(r?.body ?? "")) && said.filter((l) => l.includes("payment_account_not_set_up") && l.includes("PLATFORM_STRIPE_CONNECT_WEBHOOK_SECRET")).length === 1, [r1, r2]);

  // Breaker m1: a break whose change rolls back sends no email. Through the real outbox sender (MessagesMail, PF-19r):
  // the email is written in the change's transaction and dispatched only after it commits. Two Owners; the home item of
  // the second throws, so the whole change rolls back after the first Owner's email was written.
  {
    const { MessagesMail } = await import("../api/src/platform/messages/send/mail.ts"), { LocalFiles } = await import("../api/src/front-office/files.ts");
    const { mkdtempSync } = await import("node:fs"), { tmpdir } = await import("node:os");
    let written = 0, dispatched = 0, notified = 0;
    const rec = { send: async () => { written++; return { outboxId: crypto.randomUUID(), state: "QUEUED" }; }, dispatch: async () => { dispatched++; } };
    const outbox = new MessagesMail({ db: nest.get(Db), messages: rec as never, files: new LocalFiles(mkdtempSync(join(tmpdir(), "fo7c-mm-"))) });
    const shaky = { async notify() { if (++notified === 2) throw new Error("forced: the second Owner's home item"); } };
    const svc = new PaymentAccounts(nest.get(Db), { rail, audit: auditEvent, clock: { now: () => new Date() }, mail: outbox, notifications: shaky as never, appUrl: "https://app.example.test", firmOfAccount: firmOfAccount(nest.get(Db)) });
    sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${A}', '${staff("user-T", A)}', 'OWNER', 'seed:FO-7c-1')`);
    const post = (id: string, type: string) => { const b = JSON.stringify({ ...fixture("account.updated.charges-enabled").event, id, type, account: acctA2 }); return svc.receive(Buffer.from(b), rail.sign(b)); };
    rail.set(acctA2, { chargesEnabled: true, payoutsEnabled: true, requirementsDue: false }); await post("evt_fo7c_m1a", "account.updated");
    const vConn = await call(tOwner, "GET", VIEW);
    ok("FO-7c DW2 pass (Lead B on #2938): the new account Connected (charges enabled) → the alert clears, no email", row() === `ACTIVE:true:true:${acctA2}` && vConn.body.alert === null && written === 0, vConn.body);
    const before = row(); rail.set(acctA2, { chargesEnabled: false, payoutsEnabled: false });
    const failed = await post("evt_fo7c_m1b", "account.updated").then(() => false, () => true);
    ok("FO-7c DW2 fail (breaker m1): a break whose change rolls back (the second Owner's item fails) sends no email: written in the change, never dispatched; the account and its receipt as before",
      failed && before === `ACTIVE:true:true:${acctA2}` && row() === before && written === 1 && dispatched === 0 && Number(sql(`select count(*) from webhook_receipt where event_id = 'evt_fo7c_m1b'`)) === 0, { failed, before, row: row(), written, dispatched });
    notified = 10;   // the retry: every item now goes through
    await post("evt_fo7c_m1b", "account.updated");
    ok("FO-7c DW2 pass (breaker m1): the processor's retry of that event records the break once and dispatches one email per Owner after the commit", row() === `RESTRICTED:false:false:${acctA2}` && dispatched === 2 && written === 3, { row: row(), written, dispatched });
    rail.deauthorize(acctA2); await post("evt_fo7c_m1c", "account.application.deauthorized");
    ok("FO-7c DW2 fail: Failed then Disconnected with no reconnect between is the same break: DISCONNECTED, no second email", row() === `DISCONNECTED:false:false:${acctA2}` && dispatched === 2 && written === 3, { row: row(), written, dispatched });
  }

  // ------------------------------------------------------------------------------------------- DW10: no secret
  const columns = sql(`select coalesce(string_agg(t, ' '), '') from (select row_to_json(a)::text t from money_payment_account a union all select row_to_json(w)::text from webhook_receipt w union all select row_to_json(e)::text from audit_event e) x`);
  const spoken = [...said, columns, JSON.stringify(mail.sent), JSON.stringify(notes.sent()), JSON.stringify(rail.calls())].join("\n");
  ok("FO-7c DW10 pass: no sk_, rk_ or whsec_ value in any answer, log line, email or column of the run (the signing values were in use throughout)", !SECRET.test(spoken) && !spoken.includes(hookSecret) && spoken.length > 1000);
  ok("FO-7c DW10 fail: the scan does catch a planted signing value and a planted key", SECRET.test(`x ${hookSecret} y`) && SECRET.test(["sk", "test", "0123456789abcdef"].join("_")));
  ok("FO-7c DW10 pass: nothing in part 1 writes a payment, a refund or a trust entry", sql(`select (select count(*) from money_payment) + (select count(*) from money_refund) + (select count(*) from money_trust_entry)`) === "0");
} finally {
  await app?.close(); await owner.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
