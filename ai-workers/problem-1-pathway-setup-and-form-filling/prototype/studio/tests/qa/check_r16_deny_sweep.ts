// qa, R1.6 (map row 6: deny by default, own versus all, money and licence apart), independent of the builders' packs:
// a sweep of EVERY route the running app serves under /api/platform/* and /api/front-office/* (read from the app's own
// feature list, the way PF-4's start-up rule reads it), called over HTTP on an isolated copy:
//   S1 no token on each route (except the sign-in doors)              → 401, never data;
//   S2 a Case Officer (user-O) on each route whose declared keys they lack → 403 with a reason in words, never 2xx;
//   S3 the same routes as the Owner (user-R) are never 401/403 for a key the Owner holds (the sweep is not vacuous);
//   S4 money and licence keys: no duty hands out a money-class key, and the Case Officer holds no licence-class key. It does NOT prove the NOT_LICENSED refusal (PF-6b DW5 does, on a
//      test route: no running route declares a licence-class key yet). Scope: the 60 platform and front-office routes only,
//      not the case side's routes.
// Path parameters get a random uuid; bodies are {} (the guard runs before validation, so the status is the guard's).
// Run from prototype/ (never :4400):
//   zsh studio/tools/isolated.sh qar16 4473 start --ttl 20 PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on \
//     && trap 'zsh studio/tools/isolated.sh qar16 4473 stop' EXIT \
//     && tsx --tsconfig studio/api/tsconfig.json studio/tests/qa/check_r16_deny_sweep.ts 4473
// US$0, no model call. Fails today if any route leaks; passes when every route is guarded.
import "reflect-metadata";
import { MODULE_METADATA } from "@nestjs/common/constants.js";
import { Reflector } from "@nestjs/core";
import { randomUUID } from "node:crypto";

const PORT = Number(process.argv[2] ?? 4473), BASE = `http://localhost:${PORT}`;
process.env.PLATFORM_ENVIRONMENT ??= "local";   // PF-24w: required, no default (the feature files read the loader at import)
const { registerFeatures } = await import("../../api/src/features.ts");
const { controllerRoutes } = await import("../../api/src/platform/identity/guard.ts");
let pass = 0, fail = 0;
const check = (label: string, ok: boolean, detail: unknown = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail !== "" ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const call = async (method: string, path: string, token?: string) => {
  const init: RequestInit = { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(method === "GET" || method === "HEAD" ? {} : { "content-type": "application/json" }) } };
  if (!(method === "GET" || method === "HEAD")) init.body = "{}";
  const r = await fetch(`${BASE}${path}`, init); const t = await r.text(); let body: any = t; try { body = JSON.parse(t); } catch { /* text */ }
  return { status: r.status, body };
};
const signIn = async (actorId: string) => (await (await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", actorId, secondStep: true }) })).json()).token as string;

class Features {}
await registerFeatures(Features);
const routes = controllerRoutes(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, Features) ?? [], new Reflector())
  .map((r) => ({ ...r, url: r.path.replace(/:[A-Za-z_]+/g, () => randomUUID()) }));
check(`R1.6 sweep reads the app's routes (${routes.length} under /api/platform and /api/front-office)`, routes.length >= 30, routes.length);
check("R1.6 every route declares its access (default deny at start-up)", routes.every((r) => r.access), routes.filter((r) => !r.access).map((r) => r.name));

const tO = await signIn("user-O"), tR = await signIn("user-R");
const meO = await call("GET", "/api/platform/me", tO), meR = await call("GET", "/api/platform/me", tR);
const keysO = new Set<string>(meO.body?.keys ?? []), keysR = new Set<string>(meR.body?.keys ?? []);
check("R1.6 user-O (Case Officer) and user-R (Owner) sign in; /me lists their keys", keysO.size > 0 && keysR.size > keysO.size, { o: keysO.size, r: keysR.size });

// S1
const leaksAnon: string[] = [];
for (const r of routes.filter((r) => r.access?.kind !== "sign-in")) { const a = await call(r.method, r.url); if (a.status !== 401) leaksAnon.push(`${r.method} ${r.path} → ${a.status}`); }
check(`R1.6 S1: no token on every guarded route (${routes.filter((r) => r.access?.kind !== "sign-in").length}) → 401`, leaksAnon.length === 0, leaksAnon);

// S2, S3
const lacking = routes.filter((r) => r.access?.kind === "keys" && r.access.keys.some((k) => !keysO.has(k)));
const leaksO: string[] = [], vague: string[] = [];
for (const r of lacking) {
  const a = await call(r.method, r.url, tO);
  if (a.status !== 403) leaksO.push(`${r.method} ${r.path} → ${a.status}`);
  else { const why = String(a.body?.detail ?? a.body?.message ?? ""); if (a.body?.code !== "MISSING_PERMISSION" || why.split(/\s+/).length < 5) vague.push(`${r.method} ${r.path}: ${a.body?.code ?? "no code"} "${why}"`); }
}
check(`R1.6 S2: a Case Officer on every route whose keys they lack (${lacking.length}) → 403, never data`, lacking.length >= 5 && leaksO.length === 0, leaksO);
check("R1.6 S2: each of those refusals is MISSING_PERMISSION with a sentence of at least five words (Problem Details detail)", vague.length === 0, vague);
const ownerHeld = lacking.filter((r) => r.access?.kind === "keys" && r.access.keys.every((k) => keysR.has(k)));
const ownerRefused: string[] = [];
for (const r of ownerHeld) { const a = await call(r.method, r.url, tR); if (a.status === 401 || (a.status === 403 && a.body?.code === "MISSING_PERMISSION")) ownerRefused.push(`${r.method} ${r.path} → ${a.status} ${a.body?.code ?? ""}`); }
check(`R1.6 S3: the Owner passes the key check on the same routes they hold the keys for (${ownerHeld.length}; not vacuous)`, ownerHeld.length >= 3 && ownerRefused.length === 0, ownerRefused);

// S4
// Money apart is PF-6b ruling 2: a money key is never handed out by a duty or bundle, only by a role that names it (the
// team's role table, SA-06 Appendix C, gives a Case Officer draft invoice and expense keys, so holding one is allowed).
const { classOf, LICENCE_KEYS } = await import("../../api/src/platform/identity/catalogue.ts");
const { DUTY_KEYS } = await import("../../api/src/platform/identity/keys.ts");
const dutyMoney = Object.entries(DUTY_KEYS as Record<string, readonly string[]>).flatMap(([d, ks]) => ks.filter((k) => classOf(k) === "MONEY").map((k) => `${d}: ${k}`));
check("R1.6 S4: no duty hands out a money key (money comes only with a role that names it)", dutyMoney.length === 0, dutyMoney);
check("R1.6 S4: the Case Officer (no licence record) holds no licence-class key", [...keysO].filter((k) => LICENCE_KEYS.includes(k)).length === 0, [...keysO].filter((k) => LICENCE_KEYS.includes(k)));
const licenceRoutes = routes.filter((r) => r.access?.kind === "keys" && r.access.keys.some((k) => LICENCE_KEYS.includes(k)));
console.log(`note: routes declaring a licence-class key in the running app: ${licenceRoutes.length} ${licenceRoutes.map((r) => r.path).join(", ")} (PF-6b DW5 proves the NOT_LICENSED refusal on a test route)`);

console.log(`${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
