// PF-8b F2 (AWS preflight, 21 Nov; R1.24's per-firm page on staging): a staging host resolves to the firm, not to a
// two-label "x.staging" that is refused. Pure: rules.ts only, no database, no server, no model call (US$0). Each line
// has a passing and a failing case.
//   tsx studio/tests/check_pf8b_host_suffix.ts
import { ADDRESS_HOST_SUFFIXES, readHost } from "../api/src/platform/web-address/rules.ts";

let failed = 0;
const check = (name: string, ok: boolean, got?: unknown) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `: got ${JSON.stringify(got)}`}`);
  if (!ok) failed++;
};
const label = (h: string) => { const r = readHost(h); return r.kind === "label" ? `${r.address}@${r.suffix}` : r.kind; };

check("sample-firm.staging.expatready.com → firm sample-firm under staging.expatready.com",
  label("sample-firm.staging.expatready.com") === "sample-firm@staging.expatready.com", readHost("sample-firm.staging.expatready.com"));
check("sample-firm.expatready.com → firm sample-firm under expatready.com",
  label("sample-firm.expatready.com") === "sample-firm@expatready.com", readHost("sample-firm.expatready.com"));
check("upper case, a port and one trailing dot on staging still resolve",
  label("Sample-Firm.STAGING.expatready.com.:443") === "sample-firm@staging.expatready.com", readHost("Sample-Firm.STAGING.expatready.com.:443"));
check("an unknown suffix is never a firm (ExpatReady's own site, never a firm page)",
  ["sample-firm.example.com", "sample-firm.staging.example.com", "sample-firm.expatready.co", "sample-firm.stagingexpatready.com"].every((h) => readHost(h).kind === "main"));
check("the staging estate's bare host and its reserved names are ExpatReady's own site",
  ["staging.expatready.com", "www.staging.expatready.com", "app.staging.expatready.com:443"].every((h) => readHost(h).kind === "main"));
check("two labels deep under staging is never a firm",
  readHost("a.sample-firm.staging.expatready.com").kind === "none", readHost("a.sample-firm.staging.expatready.com"));
check("localhost still resolves (a person's own machine)",
  label("sample-firm.localhost:4400") === "sample-firm@localhost", readHost("sample-firm.localhost:4400"));
// The failing case the order guards: with the shorter suffix tried first the staging host is refused, as on main b04f84f1e.
const shortFirst = [...ADDRESS_HOST_SUFFIXES].sort((a, b) => a.length - b.length);
const host = "sample-firm.staging.expatready.com", s = shortFirst.find((x) => host.endsWith(`.${x}`));
check("the suffixes are tried longest first (shortest first would give the refused label sample-firm.staging)",
  ADDRESS_HOST_SUFFIXES[0] === "staging.expatready.com" && host.slice(0, -(s!.length + 1)) === "sample-firm.staging", ADDRESS_HOST_SUFFIXES);

console.log(failed ? `${failed} failed` : "8/8 passed");
process.exit(failed ? 1 : 0);
