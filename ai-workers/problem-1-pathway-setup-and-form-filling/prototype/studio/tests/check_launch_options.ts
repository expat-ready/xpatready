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

// The sweep. Exempt: the journey fixtures (tests/journeys/fixtures/), which record.ts loads first and whose
// chromium.launch it wraps with the same options, as it does for every journey.
const BARE = /chromium\.launch\((\)|\{ *headless:[^,}]*\}\))/;
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
const bare = files
  .filter((f) => !relative(STUDIO, f).startsWith(join("tests", "journeys", "fixtures")) && !f.endsWith("launch-options.cjs") && !f.endsWith("check_launch_options.ts"))
  .flatMap((f) => readFileSync(f, "utf8").split("\n").map((l, i) => [f, i + 1, l] as const))
  .filter(([, , l]) => BARE.test(l) && !/\.catch\(\(\) => chromium\.launch/.test(l) && !/chromium\.launch\(\)\.catch\(/.test(l))
  .map(([f, n]) => `${relative(STUDIO, f)}:${n}`);
ok(`S1: no bare chromium.launch() in the studio's ${files.length} script files (a fallback after a channel try is allowed)`, bare.length === 0, bare);
const fix = "fixtures";
ok("S2: the sweep is not empty-handed (it reads the journey fixtures it exempts)", files.some((f) => f.includes(fix)));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
