// One rule for how every Studio browser check starts Chromium (lab row LR-179, from qa #4083; the logic acceptance/lib/
// browser.ts has used since F6). Playwright's own Chromium is pinned to its release (1.64 wants revision 1248), and a
// cloud session's image ships another (1243), so a bare chromium.launch() fails there. The channel "chrome" works on
// every machine we run: the Mac's Google Chrome, GitHub's runners' Chrome, and in a cloud session the image's Chromium,
// which tools/cloud-setup.sh links to /opt/google/chrome/chrome. Revisions are never linked to each other.
//   chromiumOptions(extra) the older checks' order, kept (LR-182): Mac chrome, Playwright's own Chromium, the image's, chrome
//   launchOptions(extra)  extra plus { channel: "chrome" } where that Chrome exists; extra as given when it already names
//                          a channel or an executablePath (the caller chose)
//   videoGap()            null when this Playwright can record video, else why not: video needs Playwright's own ffmpeg
//                          of the same release (1.64: ffmpeg-1013), which `playwright install chromium` brings (CI) and a
//                          cloud image may not (it has 1011). A recorder skips video and says so; it never fails on it.
// CommonJS so the .cjs checks can require it and the .ts ones import it. Test: tests/check_launch_options.ts. US$0.
"use strict";
const { existsSync, readFileSync } = require("node:fs");
const { join, dirname, resolve } = require("node:path");
const { homedir } = require("node:os");

const CHROME = "/opt/google/chrome/chrome";

function chromeChannel(env = { platform: process.platform, exists: existsSync }) {
  return env.platform === "darwin" || env.exists(CHROME);
}

function launchOptions(extra = {}, env) {
  if (extra.channel || extra.executablePath) return { ...extra };
  return chromeChannel(env) ? { channel: "chrome", ...extra } : { ...extra };
}

// chromiumOptions(extra) (LR-182): the rule the older browser checks each wrote inline, in one place, in the order they
// already used, so CI and a cloud session open the same browser as before: (1) a caller's channel or executablePath as
// given; (2) the Mac: the channel chrome (the house rule, as the checks that name darwin already did); (3) Playwright's
// own Chromium when installed (CI runs `playwright install chromium`): nothing added; (4) the cloud image's
// /opt/pw-browsers/chromium (a link to whatever revision the image ships: never name a revision); (5) the channel chrome
// where that Chrome exists; (6) nothing (Playwright's own error, which says how to install). It differs from launchOptions() (chrome first) on purpose: moving ~250 checks from
// Playwright's Chromium to Chrome stable in CI is a change of its own, not this row's.
const PW_IMAGE = "/opt/pw-browsers/chromium";
function playwrightChromium() {
  try { return require("playwright").chromium.executablePath(); } catch { return ""; }
}
function chromiumOptions(extra = {}, env = { platform: process.platform, exists: existsSync, own: playwrightChromium() }) {
  if (extra.channel || extra.executablePath) return { ...extra };
  if (env.platform === "darwin") return { channel: "chrome", ...extra };
  if (env.own && env.exists(env.own)) return { ...extra };
  if (env.exists(PW_IMAGE)) return { executablePath: PW_IMAGE, ...extra };
  if (chromeChannel(env)) return { channel: "chrome", ...extra };
  return { ...extra };
}

// Where Playwright keeps its downloads: PLAYWRIGHT_BROWSERS_PATH ("0" = inside playwright-core), else its default cache.
function browsersPath(env = process.env, platform = process.platform) {
  // As Playwright 1.64 resolves it: a relative path against INIT_CWD (npm's) or the working directory.
  const p = env.PLAYWRIGHT_BROWSERS_PATH;
  if (p === "0") return join(dirname(require.resolve("playwright-core/package.json")), ".local-browsers");
  if (p) return resolve(env.INIT_CWD || process.cwd(), p);
  if (platform === "darwin") return join(homedir(), "Library", "Caches", "ms-playwright");
  if (platform === "win32") return join(env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "ms-playwright");
  return join(env.XDG_CACHE_HOME || join(homedir(), ".cache"), "ms-playwright");
}

function ffmpegRevision() {
  const f = join(dirname(require.resolve("playwright-core/package.json")), "browsers.json");
  const b = JSON.parse(readFileSync(f, "utf8")).browsers.find((x) => x.name === "ffmpeg");
  return b ? b.revision : null;
}

function videoGap(env = process.env, platform = process.platform, exists = existsSync) {
  const rev = ffmpegRevision();
  if (!rev) return "this Playwright names no ffmpeg";
  const exe = join(browsersPath(env, platform), `ffmpeg-${rev}`, platform === "darwin" ? "ffmpeg-mac" : platform === "win32" ? "ffmpeg-win64.exe" : "ffmpeg-linux");
  return exists(exe) ? null : `no video: Playwright's ffmpeg-${rev} is not installed (${exe})`;
}

module.exports = { CHROME, PW_IMAGE, chromeChannel, launchOptions, chromiumOptions, browsersPath, ffmpegRevision, videoGap };
