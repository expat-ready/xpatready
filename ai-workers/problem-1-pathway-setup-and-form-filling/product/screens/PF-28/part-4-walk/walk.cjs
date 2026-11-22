// PF-28 part 4 walk at 1440 px on an isolated copy (argv: port, shots dir): a booker on the Sample firm's public page types
// a name the server refuses (only an invisible character) → 422, the words on Given names; puts it right → booked; opens
// the manage link and cancels with a reason; the only refused call is the one the walk provokes.
const { chromium } = require("playwright");
const [port, shots] = process.argv.slice(2), BASE = `http://localhost:${port}`;
const log = (ok, s) => { console.log(`${ok ? "PASS" : "FAIL"}  ${s}`); if (!ok) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "America/Toronto" }), p = await ctx.newPage(), bad = [];
  p.on("response", (r) => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/") && r.status() >= 400) bad.push(`${r.request().method()} ${u.pathname.replace(/bookings\/[^/]+/, "bookings/<link>")} ${r.status()}`); });
  const shot = (n) => p.screenshot({ path: `${shots}/${n}.png`, fullPage: true });
  // 1. The firm's page → its free consultation → the first day with times → the first time
  await p.goto(`${BASE}/book/sample-firm`); await p.locator("[data-type-card]").first().waitFor({ timeout: 30000 });
  await p.locator("[data-type-card] a").first().click(); await p.getByRole("heading", { name: "Choose a time" }).waitFor();
  for (let i = 0; i < 3 && !(await p.locator("[data-day-times] li").count()); i++) { await p.getByRole("button", { name: "Next month" }).click(); await p.waitForTimeout(800); }
  if (!(await p.locator("[data-day-times] li").count())) { const day = p.locator("button[aria-label$='times available'], [data-day]:not([disabled])").first(); if (await day.count()) await day.click(); }
  await p.locator("[data-day-times] li button").first().click(); await shot("1-time-chosen");
  // 2. A name of only an invisible character: the page's own check passes it (trim keeps U+200B); the server refuses it
  await p.getByLabel("Given names").fill("​"); await p.getByLabel("Family name").fill("A (Sample)"); await p.getByLabel("Email").fill("client.a.pf28@example.com");
  const r1 = p.waitForResponse((r) => /\/bookings$/.test(new URL(r.url()).pathname) && r.request().method() === "POST");
  await p.getByRole("button", { name: "Book this time" }).click(); const a1 = await r1; await p.waitForTimeout(500);
  const given = await p.locator("main").innerText(); await shot("2-name-refused");
  log(a1.status() === 422 && /given name/i.test(given), `Book with an invisible-only given name → POST bookings ${a1.status()}; the page shows the given-names words on the form, nothing booked`);
  // 3. Put it right → booked
  await p.getByLabel("Given names").fill("Client"); const r2 = p.waitForResponse((r) => /\/bookings$/.test(new URL(r.url()).pathname) && r.request().method() === "POST");
  await p.getByRole("button", { name: "Book this time" }).click(); const a2 = await r2; const j2 = await a2.json().catch(() => ({}));
  await p.locator('[data-public-state="booked"], [data-summary]').first().waitFor({ timeout: 20000 }); await shot("3-booked");
  log(a2.status() === 201 && !!j2.manageToken, `the same booking with "Client" → ${a2.status()}, booked`);
  // 4. The manage link → Cancel with a reason (the page drops control and invisible characters itself, so the server's 422
  // for a reason is reached only by API: check_fo3pa_public_answers DW10) → cancelled
  await p.goto("about:blank"); await p.goto(`${BASE}/book/sample-firm/manage#${j2.manageToken}`);
  await p.getByRole("button", { name: "Cancel", exact: true }).waitFor({ timeout: 20000 }); await shot("4-manage");
  await p.getByRole("button", { name: "Cancel", exact: true }).click(); await p.getByRole("dialog").waitFor();
  await p.getByLabel("Reason (optional)").fill("Plans changed (Sample)");
  const r3 = p.waitForResponse((r) => /\/cancel$/.test(new URL(r.url()).pathname)); await p.getByRole("button", { name: "Cancel booking" }).click(); const a3 = await r3; await p.waitForTimeout(800);
  const after = await p.locator("main").innerText(); await shot("5-cancelled");
  log(a3.status() === 200 && /cancel/i.test(after), `Cancel with a reason → POST cancel ${a3.status()}; the page says the booking is cancelled`);
  const unexpected = bad.filter((x) => !/^POST \/api\/public\/firms\/sample-firm\/book\/[^/]+\/bookings 422$/.test(x));
  log(unexpected.length === 0, `no other refused call: ${JSON.stringify(bad)}`);
  await b.close();
})().catch((e) => { console.log(`FAIL  ${e.message.split("\n")[0]}`); process.exit(1); });
