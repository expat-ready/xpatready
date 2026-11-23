// R1.90 (PF-5's invited sign-up; P-566 "invited link kept"; SA-2-22; j_90 W4): the private single-use sign-up link,
// written first (P-606) on PF-4s part 1's staff sign-in (#2927). A pass and a fail per line, on an isolated copy with both
// local stand-ins (PLATFORM_IDENTITY=local, PLATFORM_SYSTEM_IDENTITY=local), the fake BillingPort; US$0, no Stripe call.
//   IS1 who makes a link: our staff with `system/signup-link:manage` (Platform Owner, Admin: the PF-4s seed, Appendix A)
//       → 201 with the link once; Support → 403; a firm's Owner token → 403 (PF-4s's wall); no reason → 400; a country
//       other than CA → 422 on the field; the token is stored only as its hash.
//   IS2 the invited person opens it: GET /api/public/signup/:token shows the email, the plan and the period, and makes
//       nothing; an unknown token → 404 in the same words as a used or expired one.
//   IS3 the link signs up once: POST /api/public/signup/:token (password, firm name, the current terms) starts the same
//       email check as the self-serve sign-up (202, the provider's code to the link's email; the body cannot name
//       another email: 422); Confirm (POST signup/verify) makes one firm in TRIAL on the link's plan and period and marks
//       the link used with its firm; two Confirms at once → one firm; the link used → 404, still one firm.
//   IS4 an expired link (14 days, PF-3's table): 404 on GET and POST, no firm.
//   IS5 our staff's audit: making a link writes one line on our trail with the reason (never the token).
//   IS6 (review/break M1) a malformed token (65 characters, a dot, a %) → the one 404 on GET and POST, never 500.
//   IS7 (review/break M2) every refused open leaves its platform.bypass line: an unknown token one firm-less line, a used
//       link one line on its firm's trail; a link gone between the form and Confirm → 404, no firm, its line kept.
//   IS8 (review m1) the link's page is limited per IP (contracts §0.6): past the limit → 429.
// Open questions (PR, "Question for the tech lead"): the route prefix (/api/system, PF-4s's wall, vs the row's
// /api/platform/signup-links), whether the link is emailed by us or handed over by our staff, and where plan and period
// live (PF-3's table has neither: a column add). Until the routes are built this check fails at IS1 (test first).
//   zsh studio/tools/isolated.sh runtime_r190i 4437 start PLATFORM_IDENTITY=local PLATFORM_SYSTEM_IDENTITY=local && tsx studio/tests/check_r190_invited_signup.ts 4437 xr_studio_runtime_r190i
import "reflect-metadata";
import { createHash } from "node:crypto";
import { client, recorder } from "./runtime/api.ts";

const PORT = Number(process.argv[2] ?? 4437), DBNAME = process.argv[3] ?? "xr_studio_runtime_r190i", BASE = `http://localhost:${PORT}`;
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- answers read loosely, as the other checks
type Res = { status: number; body: any };
const call = async (method: string, path: string, o: { token?: string; body?: unknown } = {}): Promise<Res> => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { "content-type": "application/json", ...(o.token ? { authorization: `Bearer ${o.token}` } : {}) }, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const t = await r.text(); let body: unknown = t; try { body = JSON.parse(t); } catch { /* text */ } return { status: r.status, body };
};
const person = (label: string, role: string) => {
  const email = `r190i-${label.toLowerCase()}-${run}@expatready.example`;
  const id = sql(`insert into plat_system_staff (id, email, display_name) values (gen_random_uuid(), '${email}', 'Sample ${label} ${run}') returning id`);
  sql(`insert into plat_system_role_grant (id, staff_id, role_code) values (gen_random_uuid(), '${id}', '${role}') returning id`);
  return { id, email };
};
const staffToken = async (email: string) => {
  const r = await call("POST", "/api/system/session/local", { body: { email, secondStep: true } });
  if (r.status !== 200 || !r.body?.token) throw new Error(`STOP  our staff's local sign-in refused (start the copy with PLATFORM_SYSTEM_IDENTITY=local): ${JSON.stringify(r.body).slice(0, 200)}`);
  return r.body.token as string;
};
const firmsOf = (email: string) => sql(`select count(*) from platform_firm where owner_email = '${email}'`);
const tokenOf = (link: unknown) => String(link ?? "").match(/token=([A-Za-z0-9_-]{32,})/)?.[1] ?? null;
const PLAN = sql(`select code from platform_plan where active order by code limit 1`);
// The same form as the self-serve sign-up (PF-5): the current terms version ids accepted, from the public plans read.
let TERMS: string[] = [];
const signUp = (token: string, extra: Record<string, unknown> = {}) => call("POST", `/api/public/signup/${token}`, { body: { password: "Correct-horse-9!", firmName: `Sample Invited Firm ${run}`, acceptedTerms: TERMS, ...extra } });

try {
  TERMS = ((await call("GET", "/api/public/plans")).body?.terms ?? []).map((t: { id: string }) => t.id);
  const OWNER = person("Owner", "platform-owner"), SUPPORT = person("Support", "platform-support");
  const tOwner = await staffToken(OWNER.email), tSupport = await staffToken(SUPPORT.email);
  const firmTok = (await call("POST", "/api/platform/session/local", { body: { firmKey: "sample-firm", actorId: "user-R", secondStep: true } })).body?.token as string;
  const invited = `invited.r190i.${run}@example.com`, ask = { email: invited, countryCode: "CA", planCode: PLAN, period: "YEARLY", reason: "Sales-led firm (Sample)" };

  // ------------------------------------------------------------------------------------------ IS1 who makes a link
  const bySupport = await call("POST", "/api/system/signup-links", { token: tSupport, body: ask });
  const byFirm = await call("POST", "/api/system/signup-links", { token: firmTok, body: ask });
  const noReason = await call("POST", "/api/system/signup-links", { token: tOwner, body: { ...ask, reason: undefined } });
  const notCA = await call("POST", "/api/system/signup-links", { token: tOwner, body: { ...ask, countryCode: "US" } });
  ok("R1.90 IS1 fail: Support (no system/signup-link:manage) → 403; a firm's Owner token → 403; no reason → 400; country US → 422 on countryCode; no link stored", bySupport.status === 403 && byFirm.status === 403 && noReason.status === 400 && notCA.status === 422 && JSON.stringify(notCA.body).includes("countryCode") && sql(`select count(*) from platform_signup_link where email = '${invited}'`) === "0", { bySupport: bySupport.status, byFirm: byFirm.status, noReason: noReason.status, notCA: notCA.status });
  const auditBefore = Number(sql(`select count(*) from plat_system_audit where staff_id = '${OWNER.id}'`));   // after the refused calls (each writes its own line)
  const made = await call("POST", "/api/system/signup-links", { token: tOwner, body: ask });
  const token = tokenOf(made.body?.link);
  ok("R1.90 IS1 pass: a Platform Owner makes the link → 201 with the link (token shown once) and its 14-day end", made.status === 201 && !!token && Math.abs(Date.parse(made.body?.expiresAt) - (Date.now() + 14 * 86_400_000)) < 120_000, made);
  if (!token) throw new Error("STOP  no link made: the rest needs one (test first: the routes are not built yet)");
  const stored = sql(`select token_hash from platform_signup_link where email = '${invited}'`);
  ok("R1.90 IS1 pass: only the token's hash is stored (sha256), never the token", stored === createHash("sha256").update(token).digest("hex") && !sql(`select row_to_json(l)::text from platform_signup_link l where email = '${invited}'`).includes(token));

  const ADMIN = person("Admin", "platform-admin"), tAdmin = await staffToken(ADMIN.email);
  const byAdmin = await call("POST", "/api/system/signup-links", { token: tAdmin, body: { ...ask, email: `admin.r190i.${run}@example.com` } });
  const badPlan = await call("POST", "/api/system/signup-links", { token: tAdmin, body: { ...ask, planCode: "no-such-plan" } }), extraKey = await call("POST", "/api/system/signup-links", { token: tAdmin, body: { ...ask, firmName: "x" } });
  ok("R1.90 IS1 pass/fail (review m3): an Admin makes a link too (201); an unknown plan → 422 on planCode; an unknown field → 422 naming it", byAdmin.status === 201 && badPlan.status === 422 && JSON.stringify(badPlan.body).includes("planCode") && extraKey.status === 422 && JSON.stringify(extraKey.body).includes("firmName"), { byAdmin: byAdmin.status, badPlan: badPlan.status, extraKey: extraKey.status });

  // ------------------------------------------------------------------------------------------ IS5 our staff's audit
  const line = sql(`select coalesce(reason, '') || '|' || route || '|' || outcome from plat_system_audit where staff_id = '${OWNER.id}' order by at desc limit 1`);
  ok("R1.90 IS5 pass: making the link writes one line on our staff's trail with the reason; the token is in no line", Number(sql(`select count(*) from plat_system_audit where staff_id = '${OWNER.id}'`)) === auditBefore + 1 && line.startsWith("Sales-led firm (Sample)|/api/system/signup-links|") && sql(`select count(*) from plat_system_audit where row_to_json(plat_system_audit)::text like '%${token}%'`) === "0", line);

  // ------------------------------------------------------------------------------------------ IS2 the invited person opens it
  const shown = await call("GET", `/api/public/signup/${token}`), unknown = await call("GET", `/api/public/signup/${"x".repeat(43)}`);
  ok("R1.90 IS2 pass: opening the link shows the email, the plan and the period, and makes nothing", shown.status === 200 && shown.body?.email === invited && shown.body?.plan?.code === PLAN && shown.body?.period === "YEARLY" && firmsOf(invited) === "0" && sql(`select count(*) from platform_signup_link where email = '${invited}' and used_at is null`) === "1", shown);
  ok("R1.90 IS2 fail: an unknown token → 404 (j_90 W4: the door's own 404, not 'Cannot GET')", unknown.status === 404 && !/Cannot GET/i.test(JSON.stringify(unknown.body)), unknown);

  sql(`update platform_plan set active = false where code = '${PLAN}' returning id`);
  const gone = await call("GET", `/api/public/signup/${token}`);
  sql(`update platform_plan set active = true where code = '${PLAN}' returning id`);
  ok("R1.90 IS2 fail (review m3): the link's plan no longer offered → 409 PLAN_GONE in words, nothing made; offered again → the link works", gone.status === 409 && gone.body?.code === "PLAN_GONE" && (await call("GET", `/api/public/signup/${token}`)).status === 200 && firmsOf(invited) === "0", gone);

  // ------------------------------------------------------------------------------------------ IS3 the link signs up once
  const other = await signUp(token, { email: `someone.else.${run}@example.com` }), noTerms = await signUp(token, { acceptedTerms: [] });
  ok("R1.90 IS3 fail: the body cannot name another email (422), the current terms must be accepted (422 on acceptedTerms), and nothing is made", other.status === 422 && noTerms.status === 422 && JSON.stringify(noTerms.body).includes("acceptedTerms") && firmsOf(invited) === "0", { other, noTerms });
  const sent = await signUp(token);
  ok("R1.90 IS3 pass: the invited form is sent → 202 'check your email' (the same email check as the self-serve sign-up), and no firm yet", sent.status === 202 && firmsOf(invited) === "0" && sql(`select count(*) from platform_signup_pending where email = '${invited}' and used_at is null`) === "1", sent);
  let verifyLink: string | undefined;
  for (let i = 0; i < 75 && !verifyLink; i++) { await new Promise((r) => setTimeout(r, 200)); const box = (await call("GET", `/api/demo/platform-inbox?address=${encodeURIComponent(invited)}`)).body?.messages ?? []; verifyLink = (box as { body: string }[]).map((m) => m.body.match(/token=([A-Za-z0-9_-]{43})&code=(\d{6})/)?.[0]).find(Boolean); }
  const [vt, vc] = [verifyLink?.match(/token=([A-Za-z0-9_-]{43})/)?.[1], verifyLink?.match(/code=(\d{6})/)?.[1]];
  const [a, b] = await Promise.all([call("POST", "/api/public/signup/verify", { body: { token: vt, code: vc } }), call("POST", "/api/public/signup/verify", { body: { token: vt, code: vc } })]);
  const firm = sql(`select f.status || '|' || p.code || '|' || s.billing_period || '|' || s.status from platform_firm f join platform_subscription s on s.firm_id = f.id join platform_plan p on p.id = s.plan_id where f.owner_email = '${invited}'`);
  ok("R1.90 IS3 pass: Confirm makes one firm in a trial on the link's plan and period (two at once → one), and the link is used with its firm", !!verifyLink && [a.status, b.status].includes(200) && firmsOf(invited) === "1" && firm.endsWith(`|${PLAN}|YEARLY|TRIAL`) && sql(`select count(*) from platform_signup_link where email = '${invited}' and used_at is not null and firm_id is not null`) === "1", { verifyLink: !!verifyLink, a: a.status, b: b.status, firm });
  const again = await signUp(token), reopened = await call("GET", `/api/public/signup/${token}`);
  ok("R1.90 IS3 fail: a used link → 404 on POST and GET, in the unknown token's words; still one firm", again.status === 404 && reopened.status === 404 && JSON.stringify(again.body?.detail) === JSON.stringify(unknown.body?.detail) && firmsOf(invited) === "1", { again, reopened });

  // ------------------------------------------------------------------------------------------ IS4 an expired link
  const late = `late.r190i.${run}@example.com`, lateToken = `R${run}`.padEnd(43, "q").slice(0, 43);
  sql(`insert into platform_signup_link (id, token_hash, email, country_code, created_by, created_at, expires_at) values (gen_random_uuid(), '${createHash("sha256").update(lateToken).digest("hex")}', '${late}', 'CA', 'staff:${OWNER.id}', now() - interval '15 days', now() - interval '1 day') returning id`);
  const lateGet = await call("GET", `/api/public/signup/${lateToken}`), latePost = await signUp(lateToken);
  ok("R1.90 IS4 fail: a link past its 14 days → 404 on GET and POST, no firm", lateGet.status === 404 && latePost.status === 404 && firmsOf(late) === "0", { lateGet: lateGet.status, latePost: latePost.status });

  // ------------------------------------------------------------------------------------------ IS6 malformed tokens
  const bad = ["A".repeat(65), "a.b", "%41" + "A".repeat(40), "abc~def", "%41" + "A".repeat(42), "%41".repeat(43)];   // the last two decode to a token's shape (break R2-M1)
  const badAnswers = await Promise.all(bad.flatMap((t) => [call("GET", `/api/public/signup/${t}`), signUp(t)]));
  ok("R1.90 IS6 fail (review/break M1, R2-M1): a malformed token (65 characters, a dot, a %, a tilde, a %-encoded token that decodes to the shape) → the one 404 on GET and POST, never 500", badAnswers.every((a) => a.status === 404 && a.body?.detail === unknown.body?.detail), badAnswers.map((a) => a.status));

  // ------------------------------------------------------------------------------------------ IS7 refused opens keep their line
  const opens = () => Number(sql(`select count(*) from audit_event where action = 'platform.bypass' and detail->>'step' = 'signup-link.open'`));
  const firmLines = () => Number(sql(`select count(*) from audit_event where action = 'platform.bypass' and firm_id = (select firm_id from platform_signup_link where email = '${invited}')`));
  const o0 = opens(), f0 = firmLines();
  await call("GET", `/api/public/signup/${"z".repeat(43)}`); const o1 = opens();
  await call("GET", `/api/public/signup/${token}`); const f1 = firmLines();
  ok("R1.90 IS7 pass (review/break M2): an unknown token's refused open leaves one firm-less line; a used link's refused open leaves one line on its firm's trail", o1 === o0 + 1 && f1 === f0 + 1, { o0, o1, f0, f1 });
  const lateForm = `form.r190i.${run}@example.com`, mk = await call("POST", "/api/system/signup-links", { token: tOwner, body: { ...ask, email: lateForm } }), t2 = tokenOf(mk.body?.link);
  const sent2 = t2 ? await signUp(t2) : null;
  sql(`update platform_signup_link set expires_at = created_at + interval '1 second' where email = '${lateForm}' returning id`);   // expired between the form and Confirm
  let v2: string | undefined;
  for (let i = 0; i < 75 && !v2; i++) { await new Promise((r) => setTimeout(r, 200)); const box = (await call("GET", `/api/demo/platform-inbox?address=${encodeURIComponent(lateForm)}`)).body?.messages ?? []; v2 = (box as { body: string }[]).map((m) => m.body.match(/token=([A-Za-z0-9_-]{43})&code=(\d{6})/)?.[0]).find(Boolean); }
  const gone2 = sql(`select count(*) from audit_event where action = 'platform.bypass' and detail->>'step' = 'signup.verify-link-gone'`);
  const conf2 = await call("POST", "/api/public/signup/verify", { body: { token: v2?.match(/token=([A-Za-z0-9_-]{43})/)?.[1], code: v2?.match(/code=(\d{6})/)?.[1] } });
  ok("R1.90 IS7 fail (review m3): a link expired between the form and Confirm → 404 at Confirm, no firm, the link unused, the refusal's line kept", sent2?.status === 202 && conf2.status === 404 && firmsOf(lateForm) === "0" && sql(`select count(*) from platform_signup_link where email = '${lateForm}' and used_at is null`) === "1" && Number(sql(`select count(*) from audit_event where action = 'platform.bypass' and detail->>'step' = 'signup.verify-link-gone'`)) === Number(gone2) + 1, { sent2: sent2?.status, conf2: conf2.status });

  // ------------------------------------------------------------------------------------------ IS8 the page's per-IP limit
  const burst = [];
  for (let i = 0; i < 32; i++) burst.push((await call("GET", `/api/public/signup/${"y".repeat(43)}`)).status);
  ok("R1.90 IS8 fail (review m1): opening links from one place is limited: past 30 in the window → 429", burst.includes(429) && burst.slice(0, 5).every((x) => x === 404), burst.join(","));
} catch (e) {
  ok(`R1.90: the check stopped — ${String((e as Error)?.message ?? e).slice(0, 400)}`, false);
}
process.exitCode = summary() ? 1 : 0;
