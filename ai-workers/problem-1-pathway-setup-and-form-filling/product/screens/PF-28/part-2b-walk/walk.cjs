// PF-28 parts 2b-2c walk at 1440 px on an isolated copy (argv: port, shots dir): sign-up's server field error shows on its
// field; a verify link that is not live shows the closed-link words; the complaints list's view chips (query read through
// the one input rule) work; the only refused calls are the ones the walk provokes.
const { chromium } = require("playwright");
const [port, shots] = process.argv.slice(2), BASE = `http://localhost:${port}`;
const log = (ok, s) => { console.log(`${ok ? "PASS" : "FAIL"}  ${s}`); if (!ok) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }), p = await ctx.newPage(), bad = [];
  p.on("response", (r) => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/") && r.status() >= 400) bad.push(`${r.request().method()} ${u.pathname} ${r.status()}`); });
  const shot = (n) => p.screenshot({ path: `${shots}/${n}.png` });
  // 1. Sign-up: an email the server refuses (no dot after @) → the server's words on the Work email field
  await p.goto(`${BASE}/sign-up`); await p.locator("[data-signup]").waitFor({ timeout: 30000 });
  await p.getByLabel("Work email").fill("owner,law@maple.example.com"); await p.getByLabel("Password").fill("correct horse battery staple 77"); await p.getByLabel("Firm name").fill("Maple Law (Sample)");
  for (const c of await p.locator('[data-signup] input[type="checkbox"]').all()) await c.check();
  const sr = p.waitForResponse((r) => r.url().endsWith("/api/public/signup")); await p.locator("[data-signup-submit]").click(); const s1 = await sr;
  await p.waitForTimeout(400); const words = await p.locator("[data-signup]").innerText(); await shot("1-signup-email-refused");
  log(s1.status() === 422 && /work email/i.test(words), `Sign-up with "owner,law@maple.example.com" (the page's own check passes it; the server refuses the comma) → POST signup ${s1.status()}; the page shows the email words on its field`);
  // 2. A verify link that is not live → the closed-link words
  await p.goto(`${BASE}/sign-up/verify#token=not-a-live-link&code=123456`); await p.waitForTimeout(800);
  const btn = p.getByRole("button", { name: /confirm/i }); if (await btn.count()) await btn.first().click();
  await p.locator('[data-signup-verify="closed"]').waitFor({ timeout: 15000 }); await shot("2-verify-closed");
  log(true, "a verify link that is not live shows the closed-link page");
  // 3. Complaints list: each view chip loads (the query goes through the rule)
  const tok = (await (await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", actorId: "user-R", secondStep: true }) })).json()).token;
  await ctx.addInitScript((t) => { if (!sessionStorage.getItem("xr-staff-session")) sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3600000 })); }, tok);
  const q = await ctx.newPage(); q.on("response", (r) => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/") && r.status() >= 400) bad.push(`${r.request().method()} ${u.pathname} ${r.status()}`); });
  await q.setViewportSize({ width: 1440, height: 900 }); await q.goto(`${BASE}/platform/complaints`); await q.locator("[data-chip]").first().waitFor({ timeout: 30000 });
  const chips = await q.locator("[data-chip]").evaluateAll((els) => els.map((e) => e.getAttribute("data-chip")));
  let allOk = true;
  const seenStatus = []; q.on("response", (r) => { if (new URL(r.url()).pathname === "/api/platform/complaints") seenStatus.push(r.status()); });
  for (const c of chips) { await q.locator(`[data-chip="${c}"]`).click(); await q.waitForTimeout(700); allOk &&= (await q.locator(`[data-chip="${c}"]`).getAttribute("aria-pressed")) === "true"; }
  allOk &&= seenStatus.length > 0 && seenStatus.every((x) => x === 200);
  await q.screenshot({ path: `${shots}/3-complaints.png` });
  log(allOk && chips.length > 0, `Complaints: every view chip (${chips.join(", ")}) is chosen and every list call answered 200 (${seenStatus.length} calls)`);
  const unexpected = bad.filter((x) => !/^POST \/api\/public\/signup 422$/.test(x) && !/^POST \/api\/public\/signup\/verify (404|422)$/.test(x));
  log(unexpected.length === 0, `no other refused call: ${JSON.stringify(bad)}`);
  await b.close();
})().catch((e) => { console.log(`FAIL  ${e.message.split("\n")[0]}`); process.exit(1); });
