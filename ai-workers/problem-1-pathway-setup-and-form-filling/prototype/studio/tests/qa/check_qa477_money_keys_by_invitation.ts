// qa, QA-477 (R1.6, PF-6b ruling 2 (b): "a role grant that brings MONEY keys writes its own audit line"): the J-6
// breaker's F3, replayed by qa through the running app. A role change writes `platform.staff.money_keys_granted`
// (J-6 P1-A3 proves it); an invitation that gives a money role, once accepted, writes none.
//   Q1 the Owner invites a new person as Billing/Finance (201) through the real route;
//   Q2 the invitee accepts (200) and their /me lists money-class keys;
//   Q3 an audit line `platform.staff.money_keys_granted` names the new person (FAILS today: 0 lines).
// Run from prototype/ (never :4400):
//   zsh studio/tools/isolated.sh qa477 4474 start --ttl 15 PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on \
//     && trap 'zsh studio/tools/isolated.sh qa477 4474 stop' EXIT \
//     && tsx --tsconfig studio/api/tsconfig.json studio/tests/qa/check_qa477_money_keys_by_invitation.ts 4474 qa477
// US$0, no model call.
import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";

const PORT = Number(process.argv[2] ?? 4474), NAME = process.argv[3] ?? "qa477", BASE = `http://localhost:${PORT}`;
const { classOf } = await import("../../api/src/platform/identity/catalogue.ts");
let pass = 0, fail = 0;
const check = (label: string, ok: boolean, detail: unknown = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail !== "" ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ""}`); };
const call = async (method: string, path: string, token?: string, body?: unknown) => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const t = await r.text(); let b: any = t; try { b = JSON.parse(t); } catch { /* text */ } return { status: r.status, body: b };
};
const PSQL = ["/opt/homebrew/opt/postgresql@18/bin/psql", "/usr/local/bin/psql", "/usr/bin/psql"].find((x) => { try { execFileSync(x, ["--version"]); return true; } catch { return false; } }) ?? "psql";
const sql = (q: string) => execFileSync(PSQL, ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio", "-d", `xr_studio_${NAME}`, "-Atc", q], { encoding: "utf8" }).trim();

const tR = (await call("POST", "/api/platform/session/local", undefined, { firmKey: "sample-firm", actorId: "user-R", secondStep: true })).body.token as string;
const email = `qa477.${randomUUID().slice(0, 8)}@example.com`;
const inv = await call("POST", "/api/platform/staff/invitations", tR, { email, roles: ["BILLING_FINANCE"] });
check("Q1 the Owner invites a new person as Billing/Finance (201)", inv.status === 201, inv);
// The invitation email goes through MAIL_PORT's in-memory fake (not the demo inbox), and only the token's hash is kept,
// so qa sets a known token on the real row the route wrote (the way PF-4b's own suite seeds one) and accepts it.
const token = randomBytes(32).toString("base64url");
sql(`update platform_invitation set token_hash = '${createHash("sha256").update(token).digest("hex")}' where id = '${inv.body?.id}'`);
check("Q1 the invitation row is pending, for Billing/Finance", sql(`select roles::text from platform_invitation where id = '${inv.body?.id}'`) === "{BILLING_FINANCE}");
const acc = token ? await call("POST", `/api/public/invitations/${token}/accept`, undefined, {}) : { status: 0, body: null };
const staffId: string | undefined = acc.body?.staffId;
check("Q2 the invitee accepts (200) and is a staff member with Billing/Finance", acc.status === 200 && !!staffId && sql(`select string_agg(role::text, ',') from platform_role_grant where staff_id = '${staffId}'`) === "BILLING_FINANCE", acc.body);
const moneyKeys = staffId ? sql(`select string_agg(distinct rp.permission_key, ',') from platform_role_grant g join platform_role_permission rp on rp.role = g.role where g.staff_id = '${staffId}'`).split(",").filter((k) => classOf(k) === "MONEY") : [];
check("Q2 the accepted role carries money-class keys", moneyKeys.length > 0, moneyKeys.length);
const lines = staffId ? Number(sql(`select count(*) from audit_event where action = 'platform.staff.money_keys_granted' and (entity_key = '${staffId}' or detail::text like '%${staffId}%')`)) : -1;
check("Q3 a money-keys audit line names the new person (PF-6b ruling 2 (b)) — fails today (QA-477)", lines >= 1, { lines });

console.log(`${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
