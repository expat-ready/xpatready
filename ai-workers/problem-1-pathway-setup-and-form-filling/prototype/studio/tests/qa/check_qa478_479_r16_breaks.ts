// qa, R1.6 (map row 6), from J-6 part 1's own break report (screens/J-6/break-report.md F3, F5), confirmed by qa on main
// ddc6e919c. Each line fails today and passes when its finding is fixed:
//   QA-478 (F3, Gap · Major; PF-6b ruling 2 (b)): money keys handed out by an accepted invitation write no money-keys audit
//     line. An Owner invites a Billing/Finance person (a role carrying MONEY keys); the invitee accepts by the emailed
//     link; a `platform.staff.money_keys_granted` line is expected, as the role-change door writes one
//     (api/src/platform/identity/service.ts) and the accept door does not (api/src/platform/identity/session/service.ts).
//   QA-479 (F5, Bug · Minor; AG-2-86 rule 3): "take" on a lead the person may not see answers 409 ALREADY_TAKEN naming the
//     owner, where GET, close and reopen answer the same 404 as another firm's lead. Expected: 404 for take too.
// (F2, QA-477, is a Conflict between two rules with no decided answer, so it has no failing line here; its repro is in the
//  report.) Run from prototype/ (an isolated copy; never :4400):
//   zsh studio/tools/isolated.sh qa478 4479 start --ttl 20 PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on \
//     && trap 'zsh studio/tools/isolated.sh qa478 4479 stop' EXIT \
//     && tsx --tsconfig studio/api/tsconfig.json studio/tests/qa/check_qa478_479_r16_breaks.ts 4479 xr_studio_qa478
// Sample rows only; US$0, no model call.
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { platformAuditWorkspaceId } from "../../api/src/platform/audit/audit-event.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../../api/src/platform/settings.ts";
import { client, recorder } from "../runtime/api.ts";
const PORT = Number(process.argv[2] ?? 4479), DBNAME = process.argv[3] ?? "xr_studio_qa478", BASE = `http://localhost:${PORT}`;
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db);
await seedSampleFirmsFrontOffice(db);
const run = Date.now().toString(36);
const call = async (method: string, path: string, token?: string, body?: unknown) => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let j: any = t; try { j = JSON.parse(t); } catch { /* text */ }
  return { status: r.status, body: j };
};
const signIn = async (actor: string) => (await call("POST", "/api/platform/session/local", undefined, { firmKey: "sample-firm", email: sql(`select email from platform_staff where actor_id = '${actor}'`), secondStep: true })).body.token as string;
const owner = await signIn("user-R"), officer = await signIn("user-O");
ok("setup: the Owner and a Case Officer sign in", !!owner && !!officer);

// QA-478: an accepted invitation into a money-bearing role writes the money-keys audit line. The invitation is made the
// way PF-4b's own test makes one (only the token's hash is stored), because the local stand-in emails no link.
const email = `bill.qa.${run}@example.com`, firmA = sql(`select id from platform_firm where key = 'sample-firm'`), ownerId = sql(`select id from platform_staff where actor_id = 'user-R'`);
const token = randomBytes(32).toString("base64url"), hash = createHash("sha256").update(token).digest("hex");
const invId = sql(`insert into platform_invitation (id, firm_id, email, roles, token_hash, invited_by, created_at, expires_at) values (gen_random_uuid(), '${firmA}', '${email}', '{BILLING_FINANCE}', '${hash}', 'staff:${ownerId}', now(), now() + interval '72 hours') returning id`);
ok("QA-478 setup: a pending invitation into Billing/Finance exists", /^[0-9a-f-]{36}$/.test(invId), invId);
const link = token;
const before = Number(sql(`select count(*) from audit_event where action = 'platform.staff.money_keys_granted'`));
const acc = link ? await call("POST", `/api/public/invitations/${link}/accept`) : { status: 0, body: null };
const staffId = acc.body?.staffId as string | undefined;
ok("QA-478 setup: the invitee accepts and joins as Billing/Finance", acc.status === 200 && !!staffId, acc.body);
const moneyKeys = Number(sql(`select count(distinct k.key) from platform_role_permission rp join platform_permission_key k on k.key = rp.permission_key where rp.role::text = 'BILLING_FINANCE' and k.class = 'MONEY'`));
const after = Number(sql(`select count(*) from audit_event where action = 'platform.staff.money_keys_granted'`));
ok(`QA-478: the accepted invitation that hands out ${moneyKeys} money keys writes its own money-keys audit line (PF-6b ruling 2 (b), as the role-change door does)`, moneyKeys > 0 && after === before + 1, { moneyKeys, before, after });

// QA-479: take on a lead the person may not see answers the same 404 as GET
const add = await call("POST", "/api/front-office/leads", owner, { requestId: randomUUID(), givenNames: `Qa${run}`, familyName: "Sample", email: `qa.${run}@qa479.example`, source: "Phone call (Sample)" });
const otherLead = String(add.body?.id ?? add.body?.lead?.id ?? "");
ok("QA-479 setup: the Owner adds a lead and owns it (AG-2-4)", add.status === 201 && sql(`select coalesce(owner_staff_id::text, '-') from fo_lead where id = '${otherLead}'`) === ownerId, add.body);
// The firm setting "everyone sees all" off (AG-2-13c): a Case Officer then sees only their own and unassigned leads.
await writeSetting(db, { firmId: firmA, key: EVERYONE_SEES_ALL.key, value: false, by: "seed:qa-479", workspaceId: await platformAuditWorkspaceId(db), reason: "qa QA-479" });
const get = otherLead ? await call("GET", `/api/front-office/leads/${otherLead}`, officer) : { status: 0, body: null };
ok("QA-479 setup: the Case Officer cannot see another person's lead (GET 404)", !!otherLead && get.status === 404, { otherLead, get: get.status });
const take = otherLead ? await call("POST", `/api/front-office/leads/${otherLead}/take`, officer, {}) : { status: 0, body: null };
ok("QA-479: take on that lead answers the same 404, not a 409 naming its owner (AG-2-86 rule 3)", take.status === 404, { status: take.status, code: take.body?.code, detail: take.body?.detail });
await db.$disconnect();
process.exitCode = summary() ? 1 : 0;
