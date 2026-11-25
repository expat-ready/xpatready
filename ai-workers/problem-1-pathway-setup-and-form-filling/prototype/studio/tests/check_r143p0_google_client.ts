// R1.43 part 0 (P-821; FO-3s2's OAuth client): the Google OAuth web client in PF-24's loader. Both or neither (half of it
// would send people to a consent page that can never finish); a shape check for each; the secret held as a `Secret` and
// redacted like every other. Every value here is made by this run, never a real one. No server, no network, US$0.
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_r143p0_google_client.ts
import { randomBytes } from "node:crypto";
import { format } from "node:util";
import { ConfigRefused, loadPlatformConfig, SCRUBBED_FROM_ENV, SECRET_SETTING_NAMES } from "../api/src/platform/config/settings.ts";

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${String(detail)}` : ""}`); };
const refused = (env: Record<string, string>) => { try { loadPlatformConfig(env); return null; } catch (e) { return e instanceof ConfigRefused ? e : null; } };
const hex = (n: number) => randomBytes(n).toString("hex").slice(0, n);
const ID = `${100000000000 + randomBytes(4).readUInt32BE()}-${hex(32)}.apps.googleusercontent.com`, SECRET = `GOCSPX-${hex(28)}`;
const local = { PLATFORM_ENVIRONMENT: "local" };

const both = loadPlatformConfig({ ...local, PLATFORM_GOOGLE_CLIENT_ID: ID, PLATFORM_GOOGLE_CLIENT_SECRET: SECRET });
ok("R1.43p0 pass: both set loads the client; the secret is a Secret", both.google.clientId === ID && both.google.clientSecret?.reveal() === SECRET);
const none = loadPlatformConfig(local);
ok("R1.43p0 pass: neither set loads with Google off (both null)", none.google.clientId === null && none.google.clientSecret === null);
const noSecret = refused({ ...local, PLATFORM_GOOGLE_CLIENT_ID: ID });
ok("R1.43p0 fail: the id without the secret stops the start, naming the secret", noSecret?.missing.join() === "PLATFORM_GOOGLE_CLIENT_SECRET", noSecret?.message);
const noId = refused({ ...local, PLATFORM_GOOGLE_CLIENT_SECRET: SECRET });
ok("R1.43p0 fail: the secret without the id stops the start, naming the id, never the value", noId?.missing.join() === "PLATFORM_GOOGLE_CLIENT_ID" && !noId.message.includes(SECRET), noId?.message);
for (const [what, id] of [["capitals", ID.toUpperCase()], ["another domain", ID.replace("googleusercontent.com", "example.com")], ["no number", ID.replace(/^[0-9]+/, "")]] as const) {
  const r = refused({ ...local, PLATFORM_GOOGLE_CLIENT_ID: id, PLATFORM_GOOGLE_CLIENT_SECRET: SECRET });
  ok(`R1.43p0 fail: a client id with ${what} is refused by its shape`, r?.invalid.some((i) => i.name === "PLATFORM_GOOGLE_CLIENT_ID"));
}
for (const [what, sec] of [["too short", "GOCSPX-abc"], ["a space", `GOCSPX-${hex(20)} x`], ["JSON (CDK's placeholder)", '{"placeholder":"supplied at deploy","random":"abcdefgh12345678"}']] as const) {
  const r = refused({ ...local, PLATFORM_GOOGLE_CLIENT_ID: ID, PLATFORM_GOOGLE_CLIENT_SECRET: sec });
  ok(`R1.43p0 fail: a client secret with ${what} is refused, its value never repeated`, r?.invalid.some((i) => i.name === "PLATFORM_GOOGLE_CLIENT_SECRET") && !r.message.includes(sec));
}
ok("R1.43p0 pass: optional in test and production too (a stack without Google still starts)", (() => { try { loadPlatformConfig({ PLATFORM_ENVIRONMENT: "production" }); return false; } catch (e) { return e instanceof ConfigRefused && !e.missing.some((n) => n.startsWith("PLATFORM_GOOGLE_")); } })());
ok("R1.43p0 pass: the secret is on PF-23's redaction list and scrubbed from the environment; the id is not", SECRET_SETTING_NAMES.includes("PLATFORM_GOOGLE_CLIENT_SECRET") && SCRUBBED_FROM_ENV.includes("PLATFORM_GOOGLE_CLIENT_SECRET") && !SECRET_SETTING_NAMES.includes("PLATFORM_GOOGLE_CLIENT_ID"));
const printed = format("%s %o %j", both, both.google, both);
ok("R1.43p0 pass: printing the configuration shows [secret PLATFORM_GOOGLE_CLIENT_SECRET], never its value", printed.includes("[secret PLATFORM_GOOGLE_CLIENT_SECRET]") && !printed.includes(SECRET));
ok("R1.43p0 fail: the leak check is not blind (the revealed value is found)", format("%s", both.google.clientSecret!.reveal()).includes(SECRET));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
