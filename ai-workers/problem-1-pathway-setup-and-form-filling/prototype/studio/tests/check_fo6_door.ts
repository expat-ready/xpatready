// FO-6 part 4 (BACKLOG row FO-6; rules note product/screens/FO-6-4/note.md; contracts §2.4, §7; P-564, AG-5-21): the
// public signing door, written BEFORE it is built (check first, P-606), so it runs red on main and each part of the
// build turns its own lines green. It walks the door the way a client's browser does, on an isolated copy of the
// running app (its own database and port, never :4400), on the fake adapter only:
//   A  Send emails the client one "Please sign" link (MailPort, the demo inbox), its token firm-first (part 3's shape).
//   B  GET /api/public/sign/:token: live state with the firm's name and no personal data; an unknown, malformed or other
//      firm's token, and the firm signer's own token, give one identical "This link does not work."; an ended request
//      (updated, withdrawn, declined, expired, and SENT past its expiry before any job ran) gives its state and the
//      firm's name, no personal data, and sends no code.
//   C  The email code (P-564, on by default): POST …/code mails 6 digits; consent and session refuse without a verified
//      code; the sixth wrong code locks the link for 15 minutes (a right code then is refused too); POST …/code/verify
//      sets an http-only cookie on the door's path; consent records its text version; GET …/session answers the
//      adapter's link; a forwarded link in a fresh browser (no cookie) needs the code; the link reopens until signed.
//   D  The code switched off (the firm setting): the session starts at consent, with no code sent.
//   E  The copy's stand-in signing page (fake adapter only): the session link is on the copy's own origin, its page has
//      a Sign button, and signing there marks the client signed (CLIENT_SIGNED) through the copy's own webhook door;
//      after that the link answers "signed", sends no code and opens no session. The firm signer's link (staff route,
//      `agent/retainer:show`, the retainer's representative only, after every client) opens the same page.
//   F  The door is rate limited per address and token (429), so one caller cannot block other clients' links.
// Stand-ins, said: the prospects, the conflict check and the ended requests (B) are written by SQL; the firm setting in D
// is written by SQL into platform_firm_setting (the Owner's switch has no route yet: note question 6). Sample values only;
// US$0, no model call, no live mail, no vendor call. Legal points (e-signature identity): Unconfirmed: no counsel.
// The third argument names the parts built so far (here "4a"): a line whose label names a part not yet built prints
// PENDING and is not counted, but a pending line that passes fails (its part is built: add it to the argument), so the
// suite holds what is merged while the later parts are built (P-606); with no third
// argument every line counts (that is how it ran red on main a26e80b6a, 2 of 31, exit 1). 4c's PR drops the argument.
// Run from prototype/:
//   zsh studio/tools/isolated.sh fo6door 4434 start PLATFORM_IDENTITY=local && tsx studio/tests/check_fo6_door.ts 4434 xr_studio_fo6door 4a
// (stop it after with: zsh studio/tools/isolated.sh fo6door 4434 stop)
import "reflect-metadata";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { buildDocx } from "../api/src/front-office/retainers/docx.ts";
import { client, recorder } from "./runtime/api.ts";

const PORT = Number(process.argv[2] ?? 4434), DBNAME = process.argv[3] ?? "xr_studio_fo6door";   // run-suites renames both for its own copy
if (PORT === 4400 || !/^xr_studio_\w+$/.test(DBNAME) || DBNAME === "xr_studio_demo") { console.log("refused: never the demo (port 4400 or its database)"); process.exit(2); }
const BASE = `http://localhost:${PORT}`;
const { ok: record, summary } = recorder();
const BUILT = process.argv[4] ? new Set(process.argv[4].split(",").map((x) => x.trim())) : null;   // null: every part counts
let pending = 0;
/** A line counts when every part its label names ("(part 4b+4c)", "(part 4a setting, 4b door)") is built; else PENDING. */
const ok = (name: string, c: unknown, detail?: unknown) => {
  const parts = (name.match(/\(part ([^)]*)\)/)?.[1] ?? "").match(/4[abc]/g) ?? [];
  if (BUILT && parts.some((x) => !BUILT.has(x))) {
    // Review m3: a pending line that passes means its part is built and the argument was not updated: fail loudly, so a
    // later part's real failures can never hide as PENDING.
    if (c) return record(`${name} — passes while marked pending: add its part to the third argument`, false);
    pending++; console.log(`PENDING  ${name} (part ${parts.filter((x) => !BUILT.has(x)).join(", ")} not built yet)`); return false;
  }
  return record(name, c, detail);
};
const { sql: rawSql, until } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const trySql = (q: string): string | null => { try { return sql(q); } catch (e) { console.log(`  note: ${String((e as { stderr?: string }).stderr ?? e).split("\n")[0]}`); return null; } };
const run = Date.now().toString(36);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const NOT_WORK = "This link does not work.";
const SIGN_LINK = /https?:\/\/[^\s)>"]+\/sign\/([0-9a-f]{32}\.[A-Za-z0-9_-]{43})/;
const TOKEN_SHAPE = /^[0-9a-f]{32}\.[A-Za-z0-9_-]{43}$/;

type Ans = { status: number; body: any; text: string; cookies: string[] };   // eslint-disable-line @typescript-eslint/no-explicit-any -- answers read loosely, as the journeys do
/** One browser for the API: its own cookie jar (the door's signing session is an http-only cookie). */
const jar = () => {
  const c = new Map<string, { value: string; path: string }>();   // a real browser's rule: a cookie goes only to its Path and below
  const call = async (method: string, path: string, body?: unknown, token?: string, form?: FormData): Promise<Ans> => {
    const pathOnly = path.split("?")[0], send = [...c].filter(([, v]) => pathOnly === v.path || pathOnly.startsWith(v.path.endsWith("/") ? v.path : `${v.path}/`));
    const headers: Record<string, string> = { ...(form ? {} : { "content-type": "application/json" }), ...(token ? { authorization: `Bearer ${token}` } : {}), ...(send.length ? { cookie: send.map(([k, v]) => `${k}=${v.value}`).join("; ") } : {}) };
    const r = await fetch(`${BASE}${path}`, { method, redirect: "manual", headers, body: form ?? (body === undefined ? undefined : JSON.stringify(body)) });
    const cookies = r.headers.getSetCookie();
    for (const s of cookies) { const [kv, ...attrs] = s.split(";"); const i = kv.indexOf("="); const p = attrs.map((a) => a.trim()).find((a) => /^path=/i.test(a))?.slice(5) || "/"; if (i > 0) c.set(kv.slice(0, i).trim(), { value: kv.slice(i + 1).trim(), path: p }); }
    const text = await r.text(); let b: unknown = null; try { b = JSON.parse(text); } catch { /* not JSON */ }
    return { status: r.status, body: b, text, cookies };
  };
  return Object.assign(call, { cookieCount: () => c.size });
};
const brief = (a: Ans) => ({ status: a.status, body: a.text.slice(0, 200) });
type Mail = { subject: string; body: string };
const inbox = async (address: string): Promise<Mail[]> => ((await (await fetch(`${BASE}/api/demo/platform-inbox?address=${encodeURIComponent(address)}`)).json().catch(() => ({}))) as { messages?: Mail[] }).messages ?? [];
const codeIn = async (address: string, after: number): Promise<string> => {
  let code = "";
  await until(async () => { const all = await inbox(address), m = all.slice(0, Math.max(0, all.length - after)).find((x) => /code/i.test(`${x.subject} ${x.body}`)); code = m?.body.match(/\b(\d{6})\b/)?.[1] ?? ""; return !!code; }, 10_000);
  return code;
};
const door = (t: string, rest = "") => `/api/public/sign/${t}${rest}`;

// ------------------------------------------------------------------------------------------------ setup (Sample)
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db);
const fo = await seedSampleFirmsFrontOffice(db);
await db.$disconnect();
const firmA = sql(`select id from platform_firm where key = 'sample-firm'`), firmB = sql(`select id from platform_firm where key = 'sample-solo'`);
const [ownerId, ownerEmail] = sql(`select id || '|' || email from platform_staff where actor_id = 'user-R'`).split("|");
const staffApi = jar();
const tok = (await staffApi("POST", "/api/platform/session/local", { firmKey: "sample-firm", email: ownerEmail, secondStep: true })).body?.token as string | undefined;
if (!firmA || !firmB || !tok || fo.failed.length) { console.error("STOP  setup: the Sample firms or the local sign-in are missing (start the copy with PLATFORM_IDENTITY=local)"); process.exit(2); }
const person = (tag: string) => {
  const given = `Door${tag}${run}`, email = `fo6door.${tag.toLowerCase()}.${run}@example.com`;
  const pid = sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${firmA}', '${given}', 'Sample', '${email}', 'test', now()) returning id`);
  return { pid, email, given };
};
/** An engaged individual prospect with a cleared conflict check (stand-ins by SQL, as j_54 and tests/lib/conflict-clear.ts). */
const prospect = (p: ReturnType<typeof person>) => {
  sql(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, state, engaged_at, engaged_by, created_by, updated_at) values (gen_random_uuid(), '${firmA}', '${p.pid}', 'MANUAL', 'WEBSITE', '${ownerId}', 'ENGAGED', now(), 'test', 'test', now())`);
  const id = sql(`insert into fo_prospect (id, firm_id, lead_id, type, stage_id, subject_person_id, primary_contact_person_id, owner_staff_id, created_by, updated_at)
    select gen_random_uuid(), '${firmA}', l.id, 'INDIVIDUAL', (select id from fo_stage where firm_id = '${firmA}' and pipeline = 'INDIVIDUAL' and key = 'ENGAGED'), '${p.pid}', '${p.pid}', '${ownerId}', 'test', now() from fo_lead l where l.person_id = '${p.pid}' returning id`);
  sql(`insert into fo_stage_move (firm_id, prospect_id, to_stage_id, cause, by_actor) select firm_id, id, stage_id, 'PERSON', 'test' from fo_prospect where id = '${id}'`);
  sql(`insert into fo_conflict_check (id, firm_id, party_kind, person_id, prospect_id, searched_name, searched_email, matches, result, checked_by) values (gen_random_uuid(), '${firmA}', 'PERSON', '${p.pid}', '${id}', '${p.given} Sample', '${p.email}', '[]', 'NO_CONFLICT', '${ownerId}') returning id`);
  return id;
};
const form = new FormData();
form.set("name", `FO-6 door retainer ${run} (Sample)`);
form.set("file", new Blob([new Uint8Array(buildDocx(["Client {client.name}", "{#fees}", "{label}: {amount}", "{/fees}"])).buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), "door.docx");
sql(`update fo_retainer_template set active = false where firm_id = '${firmA}'`);
const tpl = await staffApi("POST", "/api/front-office/retainer-templates", undefined, tok, form);
ok("FO-6 door setup: a retainer template is uploaded (FO-5)", tpl.status < 300 && !!tpl.body?.id, brief(tpl));
/** Prepares and sends a retainer by the API (FO-5 + part 3); answers the retainer id and the newest request's id. */
const sendFor = async (p: ReturnType<typeof person>) => {
  const prId = prospect(p);
  const d = await staffApi("POST", `/api/front-office/prospects/${prId}/retainers`, { templateId: tpl.body?.id, fees: [{ label: "Deposit on signing", amountMinor: 150000, when: "ON_SIGNING" }] }, tok);
  const s = d.body?.id ? await staffApi("POST", `/api/front-office/retainers/${d.body.id}/send`, { expectedVersion: 1 }, tok) : d;
  const req = d.body?.id ? sql(`select coalesce((select id::text from fo_signature_request where firm_id = '${firmA}' and document_id = '${d.body.id}' order by sent_at desc limit 1), '')`) : "";
  return { retainerId: String(d.body?.id ?? ""), send: s.status, req };
};
const linkFor = async (email: string): Promise<string> => {
  let t = "";
  await until(async () => { t = (await inbox(email)).map((m) => m.body.match(SIGN_LINK)?.[1]).find(Boolean) ?? ""; return !!t; }, 10_000);
  return t;
};
/** A signing request written by SQL (stand-in for B's ended states): firm A, one client and the firm signer; its tokens. */
const seeded = (end: "LIVE" | "UPDATED" | "WITHDRAWN" | "DECLINED" | "EXPIRED" | "PAST_EXPIRY") => {
  const p = person(`S${end}`), client = `${firmA.replace(/-/g, "")}.${randomBytes(32).toString("base64url")}`, firm = `${firmA.replace(/-/g, "")}.${randomBytes(32).toString("base64url")}`;
  const past = end === "EXPIRED" || end === "PAST_EXPIRY";
  const rq = sql(`insert into fo_signature_request (id, firm_id, document_kind, document_id, document_version_id, document_version, provider, provider_document_id, sent_by, sent_at, expires_at, updated_at)
    values (gen_random_uuid(), '${firmA}', 'RETAINER', '${randomUUID()}', '${randomUUID()}', 1, 'FAKE', 'fake-door-${end.toLowerCase()}-${randomUUID()}', '${ownerId}', now() - interval '${past ? 15 : 1} days', now() ${past ? "- interval '1 day'" : "+ interval '13 days'"}, now()) returning id`);
  sql(`insert into fo_signer (id, firm_id, request_id, role, sign_order, person_id, link_token_sha256) values (gen_random_uuid(), '${firmA}', '${rq}', 'CLIENT', 1, '${p.pid}', '${sha(client)}');
    insert into fo_signer (id, firm_id, request_id, role, sign_order, staff_id, link_token_sha256) values (gen_random_uuid(), '${firmA}', '${rq}', 'FIRM', 2, '${ownerId}', '${sha(firm)}'); select 1`);
  if (end === "UPDATED" || end === "WITHDRAWN") sql(`update fo_signature_request set status = 'CANCELLED', cancel_reason = '${end}' where id = '${rq}' returning id`);
  if (end === "DECLINED") sql(`update fo_signer set declined_at = now() where request_id = '${rq}' and role = 'CLIENT' returning id; update fo_signature_request set status = 'DECLINED' where id = '${rq}' returning id`);
  if (end === "EXPIRED") sql(`update fo_signature_request set status = 'EXPIRED' where id = '${rq}' returning id`);
  return { rq, client, firm, p };
};
const firmName = sql(`select operating_name from platform_firm where id = '${firmA}'`);
const personal = (a: Ans, p: { given: string; email: string }) => a.text.includes(p.given) || a.text.includes(p.email) || /@example\.com/.test(a.text);

try {
  // ---------------------------------------------------------------------------------------------- A Send emails one link
  const PA = person("A"), A = await sendFor(PA);
  ok("FO-6 door A (part 3, on main): Send makes one live signing request", A.send === 200 && /^[0-9a-f-]{36}$/.test(A.req), A);
  const TA = await linkFor(PA.email);
  ok("FO-6 door A (part 4a): the client's email holds one \"Please sign\" link, its token firm-first (firm id, then 43 random characters)", TOKEN_SHAPE.test(TA) && TA.startsWith(firmA.replace(/-/g, "")), { subjects: (await inbox(PA.email)).map((m) => m.subject) });
  ok("FO-6 door A (part 4a): only the token's sha256 is stored, never the token", !!TA && sql(`select count(*) from fo_signer where request_id = '${A.req}' and link_token_sha256 = '${sha(TA)}' and role = 'CLIENT'`) === "1");

  // ---------------------------------------------------------------------------------------------- B the door's state
  const a1 = jar(), live = await a1("GET", door(TA || "none"));
  ok("FO-6 door B (part 4b): GET on a live link answers 200: waiting for a signature, the firm's name, whether a code is needed, the consent text and its version",
    live.status === 200 && live.text.includes(firmName) && live.body?.codeRequired === true && typeof live.body?.consentTextVersion === "string", brief(live));
  ok("FO-6 door B (part 4b): the live state carries no personal data (no name, no email) before the code", live.status === 200 && !personal(live, PA), brief(live));
  const S = seeded("LIVE"), otherFirm = `${firmB.replace(/-/g, "")}.${S.client.split(".")[1]}`;
  const unknown = await jar()("GET", door(`${firmA.replace(/-/g, "")}.${randomBytes(32).toString("base64url")}`)), malformed = await jar()("GET", door("not-a-token")), other = await jar()("GET", door(otherFirm)), firmTok = await jar()("GET", door(S.firm));
  const same = [unknown, malformed, other, firmTok].every((x) => x.status === 404 && x.text === unknown.text && x.text.includes(NOT_WORK));
  ok("FO-6 door B (part 4b): an unknown, a malformed, another firm's token and the firm signer's own token give one identical 404 \"This link does not work.\"", same, [unknown, malformed, other, firmTok].map(brief));
  for (const end of ["UPDATED", "WITHDRAWN", "DECLINED", "EXPIRED", "PAST_EXPIRY"] as const) {
    const e = trySql("select 1") ? seeded(end) : null, j = jar(), st = e ? await j("GET", door(e.client)) : null, code = e ? await j("POST", door(e.client, "/code"), {}) : null;
    const want = { UPDATED: /updated/i, WITHDRAWN: /withdrawn/i, DECLINED: /declined/i, EXPIRED: /expired/i, PAST_EXPIRY: /expired/i }[end];
    ok(`FO-6 door B (part 4b): an ended request (${end}) answers its state and the firm's name, no personal data, and sends no code`,
      !!st && st.status === 200 && want.test(st.text) && st.text.includes(firmName) && !personal(st, e!.p) && !!code && code.status >= 400 && code.status < 500, st ? { state: brief(st), code: code!.status } : "not seeded");
  }

  // ---------------------------------------------------------------------------------------------- C the email code, consent, session
  const c1 = jar(), before = (await inbox(PA.email)).length;
  const noCodeConsent = await c1("POST", door(TA || "none", "/consent"), { agree: true, consentTextVersion: live.body?.consentTextVersion }), noCodeSession = await c1("GET", door(TA || "none", "/session"));
  ok("FO-6 door C (part 4b): consent and session without a verified code are refused by the door (401 or 403, code on, P-564); nothing is recorded",
    [401, 403].includes(noCodeConsent.status) && [401, 403].includes(noCodeSession.status) && sql(`select count(*) from fo_signer where request_id = '${A.req}' and consented_at is not null`) === "0", [brief(noCodeConsent), brief(noCodeSession)]);
  const ask = await c1("POST", door(TA || "none", "/code"), {}), code = ask.status < 300 ? await codeIn(PA.email, before) : "";
  ok("FO-6 door C (part 4b): POST …/code mails the client a 6-digit code through MailPort; only its sha256 is stored", ask.status < 300 && /^\d{6}$/.test(code) && sql(`select count(*) from fo_signer where request_id = '${A.req}' and code_sha256 = '${sha(code)}'`) === "1", { ask: brief(ask), gotCode: !!code });
  const verify = await c1("POST", door(TA || "none", "/code/verify"), { code });
  const cookie = verify.cookies.find((x) => /httponly/i.test(x)) ?? "";
  // The cookie's Path attribute is exactly the door's path (compared as text, no pattern built from the token: CodeQL on #3433).
  const pathIs = (setCookie: string, want: string) => setCookie.split(";").map((x) => x.trim()).some((x) => x.slice(0, 5).toLowerCase() === "path=" && x.slice(5) === want);
  ok("FO-6 door C (part 4b): the right code starts a signing session: an http-only, SameSite=Strict cookie on exactly the door's path, Sample 30 minutes",
    verify.status < 300 && !!cookie && pathIs(cookie, `/api/public/sign/${TA}`) && /samesite=strict/i.test(cookie) && /max-age=1800|expires=/i.test(cookie), { verify: brief(verify), cookie });
  const consent = await c1("POST", door(TA || "none", "/consent"), { agree: true, consentTextVersion: live.body?.consentTextVersion });
  ok("FO-6 door C (part 4b): consent is recorded once with its text version (AG-5-20)", consent.status < 300 && sql(`select count(*) from fo_signer where request_id = '${A.req}' and role = 'CLIENT' and consent_text_version = '${String(live.body?.consentTextVersion ?? "none")}'`) === "1", brief(consent));
  const twice = await c1("POST", door(TA || "none", "/consent"), { agree: true, consentTextVersion: live.body?.consentTextVersion });
  ok("FO-6 door C (part 4b): a second consent changes nothing (consent is written once; part 1's trigger)", twice.status < 300 && sql(`select count(*) from fo_signer where request_id = '${A.req}' and role = 'CLIENT' and consented_at is not null`) === "1", brief(twice));
  const doorLines = Number(sql(`select count(*) from audit_event where firm_id = '${firmA}' and actor = 'system:signing-door' and detail::text like '%${A.req}%'`) || "0");
  ok("FO-6 door C (part 4b): each door write so far (code sent, session started, consent) wrote its audit line (actor system:signing-door), never the code or token",
    doorLines >= 3 && sql(`select count(*) from audit_event where firm_id = '${firmA}' and (detail::text like '%${code || "none"}%' or detail::text like '%${TA ? TA.split(".")[1] : "none"}%')`) === "0", { doorLines });
  const session = await c1("GET", door(TA || "none", "/session"));
  ok("FO-6 door C (part 4b): GET …/session answers the adapter's embedded link", session.status === 200 && typeof session.body?.url === "string" && session.body.url.length > 0, brief(session));
  const fwd = jar(), fwdSession = await fwd("GET", door(TA || "none", "/session")), fwdConsent = await fwd("POST", door(TA || "none", "/consent"), { agree: true, consentTextVersion: live.body?.consentTextVersion });
  ok("FO-6 door C (part 4b): the link forwarded to a fresh browser (no cookie) needs the code: session and consent refused (401 or 403)", !!TA && [401, 403].includes(fwdSession.status) && [401, 403].includes(fwdConsent.status), [brief(fwdSession), brief(fwdConsent)]);
  const again = await c1("GET", door(TA || "none")), again2 = await c1("GET", door(TA || "none", "/session"));
  ok("FO-6 door C (part 4b): the link reopens until signed (AG-5-21): state 200 and the session again", again.status === 200 && again2.status === 200, [brief(again), brief(again2)]);
  // the lock: a seeded live request, six wrong codes
  const L = seeded("LIVE"), lj = jar(), lBefore = (await inbox(L.p.email)).length; await lj("POST", door(L.client, "/code"), {});
  const right = await codeIn(L.p.email, lBefore);
  const wrong: number[] = []; for (let i = 0; i < 6; i++) wrong.push((await lj("POST", door(L.client, "/code/verify"), { code: right === "000000" ? "111111" : "000000" })).status);
  const afterLock = await lj("POST", door(L.client, "/code/verify"), { code: right || "000000" });
  ok("FO-6 door C (part 4b): the sixth wrong code locks the link for 15 minutes (423, Sample); even the right code is then refused",
    !!right && wrong.slice(0, 5).every((s) => s === 422) && wrong[5] === 423 && afterLock.status === 423 && afterLock.cookies.length === 0 && /15 minutes/.test(afterLock.text) && sql(`select count(*) from fo_signer where request_id = '${L.rq}' and role = 'CLIENT' and locked_until > now() + interval '14 minutes'`) === "1", { wrong, after: brief(afterLock) });

  // ---------------------------------------------------------------------------------------------- D the code switched off
  const off = trySql(`insert into platform_firm_setting (firm_id, key, value, changed_by) values ('${firmA}', 'front_office.signing_email_code', 'false', 'system:test') on conflict (firm_id, key) do update set value = 'false' returning key`);
  const PD = person("D"), D = await sendFor(PD), TD = await linkFor(PD.email), dj = jar(), dBefore = (await inbox(PD.email)).length;
  const dState = await dj("GET", door(TD || "none")), dConsent = await dj("POST", door(TD || "none", "/consent"), { agree: true, consentTextVersion: dState.body?.consentTextVersion }), dSession = await dj("GET", door(TD || "none", "/session"));
  ok("FO-6 door D (part 4a setting, 4b door): with the firm's code switched off the state says no code is needed, the session starts at consent, and no code is mailed",
    !!off && dState.body?.codeRequired === false && dConsent.status < 300 && dConsent.cookies.some((x) => /httponly/i.test(x)) && dSession.status === 200 && (await inbox(PD.email)).length === dBefore, { setting: off, state: brief(dState), consent: brief(dConsent), session: brief(dSession), req: D.req });
  const d2 = jar(), d2Consent = await d2("POST", door(TD || "none", "/consent"), { agree: true, consentTextVersion: dState.body?.consentTextVersion }), d2Session = await d2("GET", door(TD || "none", "/session"));
  ok("FO-6 door D (part 4b; note question 2, as recommended): with the code off a second browser's consent starts its own session without writing consent again (a bearer link until signed), and replaces the first browser's session",
    d2Consent.status < 300 && d2Session.status === 200 && sql(`select count(*) from fo_signer where request_id = '${D.req || randomUUID()}' and role = 'CLIENT' and consented_at is not null`) === "1" && [401, 403].includes((await dj("GET", door(TD || "none", "/session"))).status), { consent: brief(d2Consent), session: brief(d2Session) });
  trySql(`delete from platform_firm_setting where firm_id = '${firmA}' and key = 'front_office.signing_email_code' returning key`);

  // ---------------------------------------------------------------------------------------------- E the stand-in signing page and the firm signer
  const url = String(session.body?.url ?? ""), onCopy = !!url && new URL(url, BASE).origin === new URL(BASE).origin;
  ok("FO-6 door E (part 4c): the fake adapter's session link is a page on the copy's own origin (never signing.fake.invalid)", onCopy, { url: url.slice(0, 120) });
  const browser = await chromium.launch(existsSync("/opt/pw-browsers/chromium") && process.platform !== "darwin" ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {});
  try {
    const ctx = await browser.newContext(); await ctx.route(/boldsign\.com|signing\.fake\.invalid/, (r) => r.abort());
    const pg = await ctx.newPage();
    if (onCopy) { await pg.goto(new URL(url, BASE).toString()); await pg.getByRole("button", { name: /^sign/i }).first().click({ timeout: 10_000 }).catch(() => undefined); }
    const signed = onCopy && await until(async () => sql(`select status from fo_signature_request where id = '${A.req}'`) === "CLIENT_SIGNED", 15_000);
    ok("FO-6 door E (part 4c): signing on the stand-in page marks the client signed through the copy's webhook door: the request reads CLIENT_SIGNED", signed, { request: A.req ? sql(`select status from fo_signature_request where id = '${A.req}'`) : "none" });
    const s1 = await c1("GET", door(TA || "none")), s2 = await c1("POST", door(TA || "none", "/code"), {}), s3 = await c1("GET", door(TA || "none", "/session"));
    ok("FO-6 door E (part 4b+4c): after signing the link answers \"already signed\" or \"has been signed\" in words (j_61's words), sends no code and opens no session (AG-5-21)",
      signed && s1.status === 200 && /already signed|has been signed/i.test(s1.text) && !personal(s1, PA) && s2.status >= 400 && s3.status >= 400, [brief(s1), s2.status, s3.status]);
    // the firm signer's link: not the representative → refused; the representative → the page
    // A Sample CASE_OFFICER of firm A, not the representative, who sees every prospect (EVERYONE_SEES_ALL on, a stand-in by SQL), so the refusal is the representative check's own.
    trySql(`insert into platform_firm_setting (firm_id, key, value, changed_by) values ('${firmA}', 'platform.everyone_sees_all', 'true', 'system:test') on conflict (firm_id, key) do update set value = 'true' returning key`);
    const other = sql(`select coalesce((select s.email from platform_staff s join platform_role_grant g on g.staff_id = s.id where s.firm_id = '${firmA}' and s.id <> '${ownerId}' and g.role::text = 'CASE_OFFICER' order by s.actor_id limit 1), '')`);
    const otherTok = other ? (await jar()("POST", "/api/platform/session/local", { firmKey: "sample-firm", email: other, secondStep: true })).body?.token as string | undefined : undefined;
    const firmBody = { consent: true, consentTextVersion: live.body?.consentTextVersion };   // the firm signer consents too (AG-5-25; part 3 refuses a signature without it)
    const notRep = otherTok ? await staffApi("POST", `/api/front-office/retainers/${A.retainerId}/firm-signing-link`, firmBody, otherTok) : null;
    ok("FO-6 door E (part 4c): a case officer who may read the retainer but is not its representative cannot get the firm signer's link (403 NOT_THE_REPRESENTATIVE)", notRep?.status === 403 && notRep.body?.code === "NOT_THE_REPRESENTATIVE", notRep ? brief(notRep) : "no Sample case officer");
    const noConsent = await staffApi("POST", `/api/front-office/retainers/${A.retainerId}/firm-signing-link`, {}, tok);
    ok("FO-6 door E (part 4c): the representative's link without consent is refused (422), nothing recorded", noConsent.status === 422 && sql(`select count(*) from fo_signer where request_id = '${A.req || randomUUID()}' and role = 'FIRM' and consented_at is not null`) === "0", brief(noConsent));
    const rep = await staffApi("POST", `/api/front-office/retainers/${A.retainerId}/firm-signing-link`, firmBody, tok);
    const repUrl = String(rep.body?.url ?? "");
    if (repUrl && new URL(repUrl, BASE).origin === new URL(BASE).origin) { await pg.goto(new URL(repUrl, BASE).toString()); await pg.getByRole("button", { name: /^sign/i }).first().click({ timeout: 10_000 }).catch(() => undefined); }
    const done = await until(async () => sql(`select status from fo_signature_request where id = '${A.req}'`) === "SIGNED", 15_000);
    ok("FO-6 door E (part 4c): the representative's link (with consent, its text version recorded) opens the same page and signs last: the request reads SIGNED (part 3 stores the files)", rep.status === 200 && done, { link: brief(rep), request: A.req ? sql(`select status from fo_signature_request where id = '${A.req}'`) : "none" });
    await ctx.close();
  } finally { await browser.close(); }

  // ---------------------------------------------------------------------------------------------- F rate limited
  const rj = jar(), statuses: number[] = [], hot = `${firmA.replace(/-/g, "")}.${randomBytes(32).toString("base64url")}`;
  for (let i = 0; i < 60; i++) statuses.push((await rj("GET", door(hot))).status);
  const elsewhere = await jar()("GET", door(TD || "none"));
  ok("FO-6 door F (part 4b): the door is rate limited per address and token (Sample 30 a minute): a burst of 60 on one token meets 429, while another link from the same address still answers",
    statuses.includes(429) && statuses.every((s) => s === 404 || s === 429) && elsewhere.status !== 429, { first429: statuses.indexOf(429), elsewhere: elsewhere.status });
} catch (e) {
  ok("FO-6 door: the walk finished without an error", false, String((e as Error)?.stack ?? e).slice(0, 400));
}
const failed = summary();
if (pending) console.log(`${pending} lines pending (parts not built yet)`);
process.exit(failed ? 1 : 0);
