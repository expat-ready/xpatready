// One rule for how every Studio browser check starts Chromium (lab row LR-179, from qa #4083; the logic acceptance/lib/
// browser.ts has used since F6). Playwright's own Chromium is pinned to its release (1.64 wants revision 1248), and a
// cloud session's image ships another (1243), so a bare chromium.launch() fails there. The channel "chrome" works on
// every machine we run: the Mac's Google Chrome, GitHub's runners' Chrome, and in a cloud session the image's Chromium,
// which tools/cloud-setup.sh links to /opt/google/chrome/chrome. Revisions are never linked to each other.
//   launchOptions(extra)  extra plus { channel: "chrome" } where that Chrome exists; extra as given when it already names
//                          a channel or an executablePath (the caller chose)
//   videoGap()            null when this Playwright can record video, else why not: video needs Playwright's own ffmpeg
//                          of the same release (1.64: ffmpeg-1013), which `playwright install chromium` brings (CI) and a
//                          cloud image may not (it has 1011). A recorder skips video and says so; it never fails on it.
// CommonJS so the .cjs checks can require it and the .ts ones import it. Test: tests/check_launch_options.ts. US$0.
"use strict";
const { existsSync, readFileSync } = require("node:fs");
const { join, dirname } = require("node:path");
const { homedir } = require("node:os");

const CHROME = "/opt/google/chrome/chrome";

function chromeChannel(env = { platform: process.platform, exists: existsSync }) {
  return env.platform === "darwin" || env.exists(CHROME);
}

function launchOptions(extra = {}, env) {
  if (extra.channel || extra.executablePath) return { ...extra };
  return chromeChannel(env) ? { channel: "chrome", ...extra } : { ...extra };
}

// Where Playwright keeps its downloads: PLAYWRIGHT_BROWSERS_PATH ("0" = inside playwright-core), else its default cache.
function browsersPath(env = process.env, platform = process.platform) {
  const p = env.PLAYWRIGHT_BROWSERS_PATH;
  if (p === "0") return join(dirname(require.resolve("playwright-core/package.json")), ".local-browsers");
  if (p) return p;
  if (platform === "darwin") return join(homedir(), "Library", "Caches", "ms-playwright");
  if (platform === "win32") return join(env.LOCALAPPDATA || homedir(), "ms-playwright");
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

module.exports = { CHROME, chromeChannel, launchOptions, browsersPath, ffmpegRevision, videoGap };
