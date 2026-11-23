// PF-8b F2 and F2b (AWS preflight, 21 Nov; R1.24's per-firm page on staging): the domain firm addresses live under is ONE
// setting, PLATFORM_ADDRESS_SUFFIX (unset: expatready.com), with localhost always kept and the longest suffix matched
// first, so a firm host on any staging domain (a new one the founder registers in Route 53 included) resolves to the firm.
// Pure: rules.ts and PF-24's loader only, no database, no server, no model call (US$0). Each line has a passing and a
// failing case.
//   tsx studio/tests/check_pf8b_host_suffix.ts
import { ConfigRefused, DEFAULT_ADDRESS_SUFFIX, loadPlatformConfig } from "../api/src/platform/config/settings.ts";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { addressHostSuffixes, DEFAULT_HOST_SUFFIXES, readHost } from "../api/src/platform/web-address/rules.ts";
import { WebAddresses, type WebAddressDeps } from "../api/src/platform/web-address/service.ts";

let failed = 0, total = 0;
const check = (name: string, ok: boolean, got?: unknown) => {
  total++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `: got ${JSON.stringify(got)}`}`);
  if (!ok) failed++;
};
const under = (base: string) => addressHostSuffixes(base);
const read = (h: string, base?: string) => { const r = readHost(h, base === undefined ? undefined : under(base)); return r.kind === "label" ? `${r.address}@${r.suffix}` : r.kind; };
const refusedBy = (v: string) => { try { loadPlatformConfig({ PLATFORM_ENVIRONMENT: "local", PLATFORM_ADDRESS_SUFFIX: v }); return null; } catch (e) { return e instanceof ConfigRefused ? e.message : String(e); } };

// --- unset: expatready.com and localhost
check("unset: the suffixes are expatready.com and localhost (the default)", JSON.stringify(DEFAULT_HOST_SUFFIXES) === JSON.stringify(["expatready.com", "localhost"]) && DEFAULT_ADDRESS_SUFFIX === "expatready.com", DEFAULT_HOST_SUFFIXES);
check("unset: sample-firm.expatready.com → firm sample-firm", read("sample-firm.expatready.com") === "sample-firm@expatready.com", read("sample-firm.expatready.com"));
check("unset: a staging host is two labels deep, never a firm (production does not serve another estate's hosts; review m3)", read("sample-firm.staging.expatready.com") === "none", read("sample-firm.staging.expatready.com"));

// --- staging on today's domain
check("staging.expatready.com: sample-firm.staging.expatready.com → firm sample-firm",
  read("sample-firm.staging.expatready.com", "staging.expatready.com") === "sample-firm@staging.expatready.com", read("sample-firm.staging.expatready.com", "staging.expatready.com"));
check("staging.expatready.com: production's host and the bare staging host are ExpatReady's own site, never a firm",
  ["sample-firm.expatready.com", "expatready.com", "staging.expatready.com", "www.staging.expatready.com"].every((h) => read(h, "staging.expatready.com") === "main"));

// --- a new staging domain (not expatready's)
const NEW = "staging.example-test.com";
check(`${NEW}: sample-firm.${NEW} → firm sample-firm, also with upper case, a port and one trailing dot`,
  read(`sample-firm.${NEW}`, NEW) === `sample-firm@${NEW}` && read(`Sample-Firm.STAGING.example-test.com.:443`, NEW) === `sample-firm@${NEW}`, read(`sample-firm.${NEW}`, NEW));
check(`${NEW}: expatready hosts, other domains and look-alikes are never a firm`,
  ["sample-firm.expatready.com", "sample-firm.staging.expatready.com", "sample-firm.example-test.com", "sample-firm.xstaging.example-test.com", "sample-firm.staging.example-test.com.evil.com", NEW, `app.${NEW}`].every((h) => read(h, NEW) === "main"));
check(`${NEW}: two labels deep or a refused label is never a firm`, read(`a.sample-firm.${NEW}`, NEW) === "none" && read(`-x.${NEW}`, NEW) === "none");
check(`${NEW}: a redirect keeps the suffix it came in on (host.ts builds Location from it)`, (() => { const r = readHost(`old-name.${NEW}`, under(NEW)); return r.kind === "label" && r.suffix === NEW; })());

// --- localhost always kept, longest first
check("localhost is kept whatever the setting", [undefined, "staging.expatready.com", NEW].every((b) => read("sample-firm.localhost:4400", b) === "sample-firm@localhost"));
check("longest first: with dev.localhost as the setting, x.dev.localhost is firm x under it, never label x.dev under localhost",
  read("sample-firm.dev.localhost", "dev.localhost") === "sample-firm@dev.localhost" && JSON.stringify(under("dev.localhost")) === JSON.stringify(["dev.localhost", "localhost"]), under("dev.localhost"));

// --- the server passes the loaded setting (read once at start-up, PF-24w), never re-reading the environment
const deps = { db: null, audit: null, clock: null } as unknown as WebAddressDeps;
check("the service uses the suffixes it is given, else the default",
  new WebAddresses({ ...deps, hostSuffixes: under(NEW) }).hostSuffixes.join() === `${NEW},localhost` && new WebAddresses(deps).hostSuffixes === DEFAULT_HOST_SUFFIXES);
const src = (f: string) => readFileSync(join(import.meta.dirname, "..", "api", "src", "platform", "web-address", f), "utf8");
check("the app's wiring passes PLATFORM_ADDRESS_SUFFIX from the loader, and the host middleware and resolver read the service's list",
  /hostSuffixes: addressHostSuffixes\(platformConfig\(\)\.addressSuffix\)/.test(src("routes.ts")) && /readHost\(h, addresses\.hostSuffixes\)/.test(src("host.ts"))
  && /readHost\(hostHeader, this\.hostSuffixes\)/.test(src("service.ts")) && !/process\.env/.test(src("rules.ts")));

// review m2: the hostSuffixes input is optional, so a second service built elsewhere would quietly read expatready.com.
// The app builds exactly one, in routes.ts, with the loaded setting.
const builders = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? builders(join(dir, e.name))
  : /\.tsx?$/.test(e.name) && /new WebAddresses\(/.test(readFileSync(join(dir, e.name), "utf8")) ? [join(dir, e.name)] : []);
const built = builders(join(import.meta.dirname, "..", "api", "src")).map((f) => f.split("/api/src/")[1]);
check("the app builds the address service in one place only (routes.ts, with the setting)", JSON.stringify(built) === JSON.stringify(["platform/web-address/routes.ts"]), built);

// --- PF-24's loader: the setting is checked at start-up, never shown
check("the loader reads it (unset: expatready.com; set: the value)",
  loadPlatformConfig({ PLATFORM_ENVIRONMENT: "local" }).addressSuffix === "expatready.com" && loadPlatformConfig({ PLATFORM_ENVIRONMENT: "local", PLATFORM_ADDRESS_SUFFIX: NEW }).addressSuffix === NEW);
const bad = ["Staging.Example.com", "example", "*.example.com", "example.com.", "example.com:443", "-a.example.com", "https://example.com", "localhost", "a..example.com", "example.c0m"];
check("the loader refuses an invalid suffix, naming the setting and never the value (one message for every value)",
  new Set(bad.map(refusedBy)).size === 1 && (refusedBy(bad[0]) ?? "").includes("PLATFORM_ADDRESS_SUFFIX is set but not valid") && !(refusedBy("zz-unique-q.example.com:1") ?? "").includes("zz-unique"), bad.map((v) => [v, refusedBy(v)]));
check("rules.ts refuses an invalid suffix too (never a silent fallback)", bad.every((v) => { try { addressHostSuffixes(v); return false; } catch { return true; } }));

console.log(failed ? `${failed} failed` : `${total}/${total} passed`);
process.exit(failed ? 1 : 0);
