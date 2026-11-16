// qa, R1.6 (map row 6 "Permissions: deny by default, own versus all, money and licence apart"), independent of the
// builder's packs (PF-4, PF-6b, J-6): a sweep of every guarded route the source declares, on an isolated running copy.
//   1 the routes: every @Controller under api/src/platform and api/src/front-office, each handler's method, path and
//     declared access (@PermissionKeys, @AnyStaff, @StaffSignIn, @OpenRead), read from the source text;
//   2 deny by default: every route on a guarded path (/api/platform, /api/front-office) declares its access (no
//     undeclared handler), and with no token a keys or any-staff route answers 401, never 200;
//   3 keys exactly: for each Sample staff member of the firm (signed in through the local stand-in), a keys route answers
//     403 MISSING_PERMISSION when the person's keys (from /api/platform/me) lack one of the route's keys; a GET whose
//     keys they hold is never 401/403 (POST, PUT, PATCH and DELETE are only sent where they must be refused: no write
//     ever goes through, no priced call);
//   4 money apart: the Case Officer starter role holds exactly SA-06's four money keys (MS-D21(10)), a read-only role
//     none, and no route names a MONEY key alongside a general one;
//   5 licence apart: every route naming a LICENCE key is listed (none on main means the licence rule is proven only by
//     PF-6b's test route, which this check reports, not fails).
// Run from prototype/ (an isolated copy; never :4400):
//   zsh studio/tools/isolated.sh qa_r16 4476 start --ttl 30 PLATFORM_IDENTITY=local \
//     && trap 'zsh studio/tools/isolated.sh qa_r16 4476 stop' EXIT \
//     && tsx --tsconfig studio/api/tsconfig.json studio/tests/qa/check_r16_permission_sweep.ts 4476 xr_studio_qa_r16
// US$0, no model call; live AI off.
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { COMPLAINT_KEYS } from "../../api/src/platform/complaints/complaints.ts";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "../runtime/api.ts";
const PORT = Number(process.argv[2] ?? 4476), DBNAME = process.argv[3] ?? "xr_studio_qa_r16", BASE = `http://localhost:${PORT}`;
const STUDIO = join(import.meta.dirname, "..", ".."), API = join(STUDIO, "api", "src");
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const rows = (q: string) => rawSql(q).split("\n").map((l) => l.trim()).filter((l) => l && !/^(INSERT|UPDATE|DELETE) /.test(l));
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db);
const fo = await seedSampleFirmsFrontOffice(db);
ok("R1.6 setup: the Sample firms and their front office are seeded", fo.failed.length === 0, fo.failed);

// 1 the routes, from the source text
// Keys named through a constant (`COMPLAINT_KEYS.record`) are resolved from the module that exports it.
const CONSTS: Record<string, Record<string, string>> = { COMPLAINT_KEYS };
const keysOf = (args: string) => [...args.matchAll(/"([^"]+)"|([A-Z_]+)\.([a-zA-Z]+)/g)].map((m) => m[1] ?? CONSTS[m[2]]?.[m[3]] ?? `UNRESOLVED ${m[2]}.${m[3]}`);
type Route = { file: string; method: string; path: string; access: "keys" | "any-staff" | "sign-in" | "open" | "none"; keys: string[] };
const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : /\.ts$/.test(n) ? [p] : []; });
const routes: Route[] = [];
for (const f of [...files(join(API, "platform")), ...files(join(API, "front-office"))]) {
  const lines = readFileSync(f, "utf8").split("\n");
  let prefix: string | null = null, classAccess: Route["access"] | null = null, classKeys: string[] = [];
  lines.forEach((line, i) => {
    const c = /@Controller\(\s*"([^"]*)"/.exec(line);
    if (c) {
      prefix = c[1];
      const near = lines.slice(Math.max(0, i - 3), i + 1).join(" ");
      classAccess = /@PermissionKeys\(/.test(near) ? "keys" : /@AnyStaff\(/.test(near) ? "any-staff" : /@StaffSignIn\(/.test(near) ? "sign-in" : null;
      classKeys = [...near.matchAll(/@PermissionKeys\(([^)]*)\)/g)].flatMap((m) => keysOf(m[1]));
    }
    const h = /@(Get|Post|Put|Patch|Delete)\(\s*(?:"([^"]*)")?\s*\)/.exec(line);
    if (!h || prefix === null) return;
    let j = i; while (j > 0 && /^\s*@/.test(lines[j - 1])) j--;
    const near = lines.slice(j, i + 1).join(" ").replace(/\)\s*(\w+)\s*\(.*$/, ")");
    const keys = [...near.matchAll(/@PermissionKeys\(([^)]*)\)/g)].flatMap((m) => keysOf(m[1]));
    const access: Route["access"] = keys.length ? "keys" : /@AnyStaff\(/.test(near) ? "any-staff" : /@StaffSignIn\(/.test(near) ? "sign-in" : /@OpenRead\(/.test(near) ? "open" : classAccess ?? "none";
    routes.push({ file: relative(STUDIO, f), method: h[1].toUpperCase(), path: `/${prefix}/${h[2] ?? ""}`.replace(/\/+/g, "/").replace(/\/$/, ""), access, keys: keys.length ? keys : classKeys });
  });
}
const unresolved = routes.filter((r) => r.keys.some((k) => k.startsWith("UNRESOLVED")));
ok("R1.6 routes: every declared key is read (literal or a known constant)", unresolved.length === 0, unresolved.map((r) => `${r.method} ${r.path}: ${r.keys.join(",")}`));
const guarded = routes.filter((r) => /^\/api\/(platform|front-office)(\/|$)/i.test(r.path));
ok("R1.6 routes: the source declares guarded routes to sweep", guarded.length >= 20, { all: routes.length, guarded: guarded.length });
// 2 deny by default
const undeclared = guarded.filter((r) => r.access === "none");
ok("R1.6 deny by default: every handler on a guarded path declares its access", undeclared.length === 0, undeclared.map((r) => `${r.method} ${r.path} (${r.file})`));
const fill = (p: string) => p.replace(/:[A-Za-z]+\??/g, "00000000-0000-4000-8000-000000000000");
const call = async (method: string, path: string, token?: string) => {
  const r = await fetch(`${BASE}${fill(path)}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(method === "GET" ? {} : { "content-type": "application/json" }) }, body: method === "GET" ? undefined : "{}" });
  let code = ""; try { code = String((await r.json()).code ?? ""); } catch { /* not json */ }
  return { status: r.status, code };
};
const noToken: string[] = [];
for (const r of guarded.filter((x) => x.access === "keys" || x.access === "any-staff")) {
  const a = await call(r.method, r.path);
  if (a.status !== 401) noToken.push(`${r.method} ${r.path} → ${a.status} ${a.code}`);
}
ok("R1.6 deny by default: with no token every keys or any-staff route answers 401", noToken.length === 0, noToken);
// 3 keys exactly, per Sample staff member
const staff = rows(`select s.actor_id || '|' || s.email from platform_staff s join platform_firm f on f.id = s.firm_id where f.key = 'sample-firm' and s.status = 'ACTIVE' order by s.actor_id`).map((l) => { const [actor, email] = l.split("|"); return { actor, email }; });
ok("R1.6 setup: the Sample firm has several staff members to sweep with", staff.length >= 3, staff.map((s) => s.actor));
const keyRoutes = guarded.filter((r) => r.access === "keys");
for (const s of staff) {
  const sign = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email: s.email, secondStep: true }) });
  const token = (await sign.json()).token as string | undefined;
  if (!token) { ok(`R1.6 ${s.actor}: signs in through the local stand-in`, false, sign.status); continue; }
  const me = await (await fetch(`${BASE}/api/platform/me`, { headers: { authorization: `Bearer ${token}` } })).json();
  const held = new Set<string>(me.keys ?? me.permissionKeys ?? []);
  const wrong: string[] = []; let refused = 0, allowed = 0;
  for (const r of keyRoutes) {
    const lacks = r.keys.filter((k) => !held.has(k));
    if (lacks.length) {
      const a = await call(r.method, r.path, token);
      if (a.status !== 403 || a.code !== "MISSING_PERMISSION") wrong.push(`${r.method} ${r.path} lacks ${lacks.join(",")} → ${a.status} ${a.code}`); else refused++;
    } else if (r.method === "GET") {
      const a = await call(r.method, r.path, token);
      if (a.status === 401 || (a.status === 403 && a.code !== "NOT_LICENSED")) wrong.push(`GET ${r.path} holds ${r.keys.join(",")} → ${a.status} ${a.code}`); else allowed++;
    }
  }
  ok(`R1.6 keys exactly, ${s.actor} (${(me.roles ?? []).join("+")}, ${held.size} keys): refused where a key is missing, let through where held`, wrong.length === 0, { refused, allowed, wrong: wrong.slice(0, 6) });
}
// 4 money apart
const money = new Set(rows(`select key from platform_permission_key where class = 'MONEY'`));
ok("R1.6 money apart: the catalogue has MONEY keys to check", money.size > 0, money.size);
// SA-06 v3.15 MS-D21(10) (the product owner, 25 Oct): a Case Officer may create a draft from "Bill this" or "Add cost"
// (agent/invoice:create, agent/expense:create); v3.15 (1): :list and :show reach only invoices on records they can see.
// Issuing, payments, refunds and trust stay with the billing keys. Read-only holds no money key.
const SA06_OFFICER_MONEY = ["agent/expense:create", "agent/invoice:create", "agent/invoice:list", "agent/invoice:show"];
const officerMoney = rows(`select rp.permission_key from platform_role_permission rp join platform_permission_key k on k.key = rp.permission_key where k.class = 'MONEY' and rp.role::text = 'CASE_OFFICER' order by 1`);
ok("R1.6 money apart: the Case Officer starter role holds exactly SA-06's four draft and read money keys, no issuing, payment, refund or trust key", JSON.stringify(officerMoney) === JSON.stringify(SA06_OFFICER_MONEY), officerMoney);
const readOnlyMoney = rows(`select rp.role::text || ' ' || rp.permission_key from platform_role_permission rp join platform_permission_key k on k.key = rp.permission_key where k.class = 'MONEY' and rp.role::text ilike '%read%'`);
ok("R1.6 money apart: no read-only starter role carries a MONEY key", readOnlyMoney.length === 0, readOnlyMoney);
const mixed = keyRoutes.filter((r) => r.keys.some((k) => money.has(k)) && r.keys.some((k) => !money.has(k)));
ok("R1.6 money apart: no route asks for a MONEY key together with a general one", mixed.length === 0, mixed.map((r) => `${r.method} ${r.path}: ${r.keys.join(",")}`));
// 5 licence apart (reported)
const licence = new Set(rows(`select key from platform_permission_key where class = 'LICENCE'`));
const licenceRoutes = keyRoutes.filter((r) => r.keys.some((k) => licence.has(k)));
console.log(`NOTE  R1.6 licence apart: ${licence.size} LICENCE keys in the catalogue; routes on main naming one: ${licenceRoutes.map((r) => `${r.method} ${r.path}`).join(", ") || "none (proven only by PF-6b DW5's test route)"}`);
await db.$disconnect();
process.exitCode = summary() ? 1 : 0;
