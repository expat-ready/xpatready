// LR-179 (qa #4083): every Studio browser check starts Chromium by one rule (acceptance/lib/launch-options.cjs), so a cloud
// session whose image ships another Chromium revision than Playwright pins (1243 against 1.64's 1248) still runs them, and
// a recorder without Playwright's own ffmpeg records no video instead of crashing. Proves the rule on fake machines, then
// sweeps the studio for a bare chromium.launch() (no channel, no executablePath, no shared options), which fails there.
// Starts nothing (no browser, no server, no database); US$0. Run from prototype/:
//   tsx studio/tests/check_launch_options.ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import lib from "../acceptance/lib/launch-options.cjs";

const STUDIO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, detail?: unknown) => {
  if (cond) { pass++; console.log(`PASS  ${name}`); } else { fail++; console.log(`FAIL  ${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`); }
};
const machine = (platform: string, chrome: boolean) => ({ platform, exists: (p: string) => chrome && p === lib.CHROME });

// launchOptions: the channel where that Chrome exists; the caller's choice kept.
ok("L1: Linux with /opt/google/chrome/chrome (CI runners; a cloud session after cloud-setup.sh) uses the channel chrome",
  JSON.stringify(lib.launchOptions({ headless: true }, machine("linux", true))) === JSON.stringify({ channel: "chrome", headless: true }));
ok("L2: the Mac uses the channel chrome even before the check for the file", lib.launchOptions({}, machine("darwin", false)).channel === "chrome");
ok("L3: Linux without that Chrome falls back to Playwright's own Chromium (no channel, nothing added)",
  JSON.stringify(lib.launchOptions({ headless: false }, machine("linux", false))) === JSON.stringify({ headless: false }));
ok("L4: a caller's executablePath is kept as given (no channel added beside it)",
  JSON.stringify(lib.launchOptions({ executablePath: "/x/chrome" }, machine("linux", true))) === JSON.stringify({ executablePath: "/x/chrome" }));
ok("L5: a caller's own channel is kept", lib.launchOptions({ channel: "msedge" }, machine("linux", true)).channel === "msedge");
const given = { headless: true };
lib.launchOptions(given, machine("linux", true));
ok("L6: the caller's object is not changed", JSON.stringify(given) === JSON.stringify({ headless: true }));

// videoGap: Playwright's ffmpeg of its own release, where Playwright keeps its downloads.
const rev = lib.ffmpegRevision();
ok("V1: the installed Playwright names its ffmpeg revision (browsers.json)", typeof rev === "string" && /^\d+$/.test(rev), rev);
ok("V2: PLAYWRIGHT_BROWSERS_PATH is where it looks (a cloud image: /opt/pw-browsers)",
  lib.browsersPath({ PLAYWRIGHT_BROWSERS_PATH: "/opt/pw-browsers" }, "linux") === "/opt/pw-browsers");
ok("V3: without it, Linux looks in ~/.cache/ms-playwright and the Mac in ~/Library/Caches/ms-playwright",
  lib.browsersPath({}, "linux").endsWith(join(".cache", "ms-playwright")) && lib.browsersPath({}, "darwin").endsWith(join("Library", "Caches", "ms-playwright")));
ok("V3b: a relative PLAYWRIGHT_BROWSERS_PATH resolves against INIT_CWD, as Playwright does; Windows without LOCALAPPDATA uses ~/AppData/Local",
  lib.browsersPath({ PLAYWRIGHT_BROWSERS_PATH: "pw", INIT_CWD: "/w" }, "linux") === join("/w", "pw")
  && lib.browsersPath({}, "win32").endsWith(join("AppData", "Local", "ms-playwright")));
const want = join("/b", `ffmpeg-${rev}`, "ffmpeg-linux");
ok("V4: video is possible when that ffmpeg is there", lib.videoGap({ PLAYWRIGHT_BROWSERS_PATH: "/b" }, "linux", (p: string) => p === want) === null);
const gap = lib.videoGap({ PLAYWRIGHT_BROWSERS_PATH: "/b" }, "linux", (p: string) => p === join("/b", "ffmpeg-1011", "ffmpeg-linux"));
ok("V5: an older ffmpeg only (the cloud image's 1011) is a gap that names the missing one", typeof gap === "string" && gap.includes(`ffmpeg-${rev}`) && gap.includes(want), gap);
ok("V6: the Mac's ffmpeg file is ffmpeg-mac", lib.videoGap({ PLAYWRIGHT_BROWSERS_PATH: "/b" }, "darwin", (p: string) => p === join("/b", `ffmpeg-${rev}`, "ffmpeg-mac")) === null);

// The recorder and the walker use the rule.
const record = readFileSync(join(STUDIO, "tests/journeys/record.ts"), "utf8");
ok("R1: tests/journeys/record.ts takes its launch options and its video decision from launch-options.cjs",
  /launchOptions\(\)/.test(record) && /videoGap\(\)/.test(record) && !record.includes('"/opt/pw-browsers/chromium"'));
ok("R2: record.ts adds recordVideo only when there is no video gap", /noVideo \? opts : \{ \.\.\.opts, recordVideo:/.test(record));
ok("R3: acceptance/lib/browser.ts launches with launchOptions", /chromium\.launch\(launchOptions\(/.test(readFileSync(join(STUDIO, "acceptance/lib/browser.ts"), "utf8")));
ok("R4: no revision is linked to another in cloud-setup.sh (the chrome channel link is the only browser link)",
  !/ln -s[f]* [^\n]*chromium[-_][^\n]*chromium[-_]\d/.test(readFileSync(join(STUDIO, "..", "..", "product", "tools", "cloud-setup.sh"), "utf8")));

// The sweep, turned round (review of #4099, Important 1): every chromium.launch( call is read with its arguments (up to the
// call's closing parenthesis, across lines) and passes only when they name the shared options, a channel or an
// executablePath (a caller's own exe object counts). Exempt by name: the journey fixtures (tests/journeys/fixtures/), which
// record.ts loads first and whose launch it wraps with the same options, as it does for every journey.
const GOOD = /launchOptions\(|chromiumOptions\(|channel|executablePath|\bexe\b/;   // chromiumOptions: LR-183
function launchCalls(text: string): { line: number; args: string }[] {
  const out: { line: number; args: string }[] = [];
  for (let i = text.indexOf("chromium.launch("); i >= 0; i = text.indexOf("chromium.launch(", i + 1)) {
    let depth = 0, k = i + "chromium.launch".length;
    for (; k < text.length; k++) { if (text[k] === "(") depth++; else if (text[k] === ")" && --depth === 0) break; }
    out.push({ line: text.slice(0, i).split("\n").length, args: text.slice(i + "chromium.launch(".length, k) });
  }
  return out;
}
const bareIn = (text: string) => launchCalls(text).filter((c) => !GOOD.test(c.args)).map((c) => c.line);
ok("S0: the sweep's own examples: bare launch(), launch(opts), launch({ headless, args }) over two lines are caught; launchOptions, a channel, an executablePath and an exe spread pass",
  JSON.stringify(bareIn("a = chromium.launch();\nb = chromium.launch(opts);\nc = chromium.launch({ headless: true,\n  args: [\"--x\"] });")) === "[1,2,3]"
  && bareIn("chromium.launch(chromiumOptions({ headless: true }));\nchromium.launch(launchOptions({ headless: true }));\nchromium.launch({ channel: \"chrome\" });\nchromium.launch({\n  executablePath: p });\nchromium.launch({ headless: true, ...exe });").length === 0);
const files: string[] = [];
const walk = (d: string) => {
  for (const n of readdirSync(d)) {
    if (n === "node_modules" || n.startsWith(".")) continue;
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx|cjs|mjs|js)$/.test(n)) files.push(p);
  }
};
for (const d of ["tests", "acceptance", "tools", "evidence"]) walk(join(STUDIO, d));
const exempt = (f: string) => relative(STUDIO, f).startsWith(join("tests", "journeys", "fixtures")) || f.endsWith("launch-options.cjs") || f.endsWith("check_launch_options.ts");
const bare = files.filter((f) => !exempt(f)).flatMap((f) => bareIn(readFileSync(f, "utf8")).map((n) => `${relative(STUDIO, f)}:${n}`));
ok(`S1: every chromium.launch( in the studio's ${files.length} script files names the shared options (launchOptions, chromiumOptions), a channel or an executablePath`, bare.length === 0, bare);
const fixtures = files.filter((f) => relative(STUDIO, f).startsWith(join("tests", "journeys", "fixtures")));
ok("S2: the only exempt launches are the journey fixtures record.ts wraps (and the sweep does see them)", fixtures.length > 0 && fixtures.flatMap((f) => bareIn(readFileSync(f, "utf8"))).length >= 3);

// LR-183: chromiumOptions(), the older checks' own order kept in one place (Mac chrome, Playwright's own Chromium, the
// image's /opt/pw-browsers/chromium, the channel chrome), and no check names a Chromium revision.
const OWN = "/pw/chromium-1248/chrome-linux64/chrome";
const box = (platform: string, have: string[]) => ({ platform, own: OWN, exists: (p: string) => have.includes(p) });
const co = (env: ReturnType<typeof box>, extra: Record<string, unknown> = { headless: true }) => JSON.stringify(lib.chromiumOptions(extra, env));
ok("C1: CI (Playwright's own Chromium installed, runner Chrome present): nothing added, Playwright's own Chromium as before",
  co(box("linux", [OWN, lib.CHROME])) === JSON.stringify({ headless: true }));
ok("C1b: Playwright's own Chromium and the image's both present (a cloud session after playwright install): Playwright's own comes first",
  co(box("linux", [OWN, lib.PW_IMAGE, lib.CHROME])) === JSON.stringify({ headless: true }));
ok("C2: a cloud session (no Playwright Chromium of this release, the image's link present): the image's /opt/pw-browsers/chromium",
  co(box("linux", [lib.PW_IMAGE, lib.CHROME])) === JSON.stringify({ executablePath: lib.PW_IMAGE, headless: true }));
ok("C3: the Mac: the channel chrome, whatever is installed", co(box("darwin", [OWN])) === JSON.stringify({ channel: "chrome", headless: true }));
ok("C4: Linux with neither Playwright's Chromium nor the image's but Google Chrome: the channel chrome (no bare launch)",
  co(box("linux", [lib.CHROME])) === JSON.stringify({ channel: "chrome", headless: true }));
ok("C5: nothing installed: nothing added (Playwright's own error says how to install)", co(box("linux", [])) === JSON.stringify({ headless: true }));
ok("C6: a caller's executablePath or channel is kept as given", co(box("linux", [lib.PW_IMAGE]), { executablePath: "/x" }) === JSON.stringify({ executablePath: "/x" })
  && co(box("linux", [OWN]), { channel: "msedge" }) === JSON.stringify({ channel: "msedge" }));
ok("C7: the image path is the link, never a revision folder", lib.PW_IMAGE === "/opt/pw-browsers/chromium");
const REV = /pw-browsers\/chromium[-_]\d+/;
const pinned = files.filter((f) => !f.endsWith("check_launch_options.ts")).filter((f) => REV.test(readFileSync(f, "utf8"))).map((f) => relative(STUDIO, f));
ok("S3: no script names a Chromium revision folder (/opt/pw-browsers/chromium-<n>): the image's revision changes under us", pinned.length === 0, pinned);
// S4, a ratchet: checks that still write their own /opt/pw-browsers rule inline. 252 before LR-183; each later part lowers
// MAX to its new count, so a new inline rule fails here and points at chromiumOptions().
const MAX_INLINE = 146;   // part 2 (tests/*.cjs): 206 -> 146
const inline = files.filter((f) => !f.endsWith("launch-options.cjs") && !f.endsWith("check_launch_options.ts")).filter((f) => readFileSync(f, "utf8").includes("/opt/pw-browsers"));
ok(`S4: at most ${MAX_INLINE} scripts still write their own /opt/pw-browsers rule (252 before LR-183; use chromiumOptions())`, inline.length <= MAX_INLINE, `${inline.length}: ${inline.slice(0, 5).map((f) => relative(STUDIO, f)).join(", ")}`);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
