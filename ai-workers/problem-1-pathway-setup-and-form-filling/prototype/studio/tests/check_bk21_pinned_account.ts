// BK-21 (fixes QA-397, R1.77; C11.6, C8.2; P-137, SA-01B v2.1 "Pin: the pack version a filing follows"): an open case
// files through the IRCC account its pinned release names (config_release.snapshot.combination.portal), never the live
// draft's (combination.portal_key). Before this row api/src/case-prepare.ts read the live account, so an author's
// unreleased change on the Forms tab reached every open case at once, and a submission recorded meanwhile stored it
// for good. On the configured checkpoint (P-322), the Visitor visa (vv.single, released on the APR Portal):
//   DW1  a draft account change (the Forms tab's picker route) does not reach an open case: Prepare's portal and words,
//        which the case page, the answer sheet and the Record the submission dialog all read; screen at 1440 px.
//   DW1 release  once the change is released, a case opened on the new release reads it; the old case keeps the old.
//   DW2  a submission recorded during the draft stores the released account; moving the draft back changes nothing
//        recorded.
//   DW3  IRCC's accepted channels on the case are checked against the released account: a draft "paper" account (which
//        would allow only Paper) never narrows them, and a channel change the released account accepts is saved.
// Each with a pass and a fail. Synthetic people (Sample); US$0, live AI off. Never :4400.
//   zsh studio/tools/isolated.sh runtime_bk21 4482 start && tsx studio/tests/check_bk21_pinned_account.ts 4482 xr_studio_runtime_bk21
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { APPROVER, AUTHOR, PORT, call, firms, inDays, main, needVisitorVisa, ok, openCase, prepare, readyToFile, sql, yearsAgo } from "../acceptance/lib/m3.ts";

const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "BK-21", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const APR = "Filed through APR Portal: set by the combination, not on the case";
type Item = { id: string; kind: string; form?: string; channel?: string; accepts?: string[] };
type Prep = { portal: string | null; portal_words: string | null; release_version: number; version: string; items: Item[]; filings: { id: string; status: string; applicants: { subject: string }[] }[]; groups: { id: string }[] };

await main("BK-21", "an open case keeps its released IRCC account until a release (QA-397; C11.6, C8.2; US$0)", async () => {
  if (!sql(`select r.id from config_release r join combination c on c.id=r.combination_id where c.combination_key='vv.single' and r.status='RELEASED'`)) {
    await call("POST", "/demo/reset", { confirm: "RESET" }, AUTHOR);
    const l = await call("POST", "/demo/load", { sample: "configured" }, AUTHOR);
    ok("setup: Demo › Load the configured checkpoint", l.status === 201 || l.status === 200, l.status);
  }
  const vv = needVisitorVisa(), f = await firms();
  const live = () => sql(`select coalesce(portal_key,'') from combination where id='${vv}'`) ?? "";
  const released = () => sql(`select coalesce(r.snapshot->'combination'->>'portal','') from config_release r where r.combination_id='${vv}' and r.status='RELEASED' order by r.version desc limit 1`) ?? "";
  ok("setup: the Visitor visa is released on the APR Portal, as its draft is", live() === "APR_PORTAL" && released() === "APR_PORTAL", { live: live(), released: released() });
  const pick = (account: string | null, from: string | null) => call("PATCH", `/combinations/${vv}/account`, { account, from }, AUTHOR);
  const prep = async (id: string) => (await prepare(id, f.officer!)).p as unknown as Prep | null;
  const team = { representative: f.rep!, caseOfficers: [f.officer!] };
  const browser = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
  try {
    // An open case, made Ready to file C7.6's own way, before any draft change.
    const a = await openCase(vv, [{ role: "principal", name: "Sample Client BK-21 A", dob: yearsAgo(40) }], team);
    await readyToFile(a.id, f.rep!);
    const p0 = await prep(a.id);
    const form0 = p0?.items.find((i) => i.kind === "form" && (i.accepts?.length ?? 0) > 1);
    ok("setup: case A is Ready to file on the APR Portal, with a form IRCC accepts in more than one way there", !!p0 && p0.portal === "APR_PORTAL" && p0.filings.every((x) => x.status === "ready_to_file") && !!form0, { portal: p0?.portal, statuses: p0?.filings.map((x) => x.status), accepts: p0?.items.map((i) => [i.form, i.accepts]) });
    if (!p0 || !form0) return;

    // Case B, opened on the same release and left open (DW3, DW1 release).
    const old = await openCase(vv, [{ role: "principal", name: "Sample Client BK-21 B", dob: yearsAgo(35) }], team);
    const v0 = (await prep(old.id))?.release_version;
    // ---------------------------------------------------------------- DW1: a draft change never reaches the open case
    const r = await pick("PR_PORTAL", "APR_PORTAL");
    ok("setup: the author picks the PR Portal on the Forms tab (a draft change; nothing released)", r.status < 300 && live() === "PR_PORTAL" && released() === "APR_PORTAL", { status: r.status, live: live(), released: released() });
    let p = await prep(a.id);
    ok("BK-21 DW1 pass: case A still reads the released account and its words (view, answer sheet and dialog read these)", p?.portal === "APR_PORTAL" && p.portal_words === APR, { portal: p?.portal, words: p?.portal_words });
    ok("BK-21 DW1 fail: the draft's account never reaches the open case", p?.portal !== "PR_PORTAL" && !/\bPR Portal/.test(p?.portal_words ?? ""), p?.portal_words);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(BASE); await page.evaluate((x) => localStorage.setItem("xr-actor", x), f.officer!);
    const settle = async () => { await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]') && !document.querySelector(".animate-spin"), null, { timeout: 30_000 }); await page.waitForTimeout(300); };
    await page.goto(`${BASE}/cases/${a.id}`);
    const head = page.locator("[data-item-channels] [data-portal]");
    await head.waitFor({ timeout: 30_000 }); await settle();
    const caseLine = await head.innerText();
    await page.screenshot({ path: join(SHOTS, "01-case-during-draft-1440.png") });
    ok("BK-21 DW1 pass (screen): the case page says \"Filed through APR Portal\" while the draft names the PR Portal", caseLine.includes(APR) && !/\bPR Portal/.test(caseLine), caseLine);
    const online = p?.items.find((i) => i.kind === "form" && i.channel === "ONLINE");
    if (online) {
      await page.goto(`${BASE}/cases/${a.id}/sheet/${online.id}`);
      const line = page.locator("[data-answer-sheet] [data-portal]");
      await line.waitFor({ timeout: 30_000 }); await settle();
      const sheetLine = await line.innerText();
      await page.screenshot({ path: join(SHOTS, "02-answer-sheet-during-draft-1440.png") });
      ok(`BK-21 DW1 pass (screen): the ${online.form} answer sheet says "Filed through APR Portal"`, sheetLine.includes(APR), sheetLine);
    }
    const panel = page.locator("[data-submission]");
    await page.goto(`${BASE}/cases/${a.id}`); await panel.locator("[data-submission-group]").first().waitFor({ timeout: 30_000 }); await settle();
    await panel.getByRole("button", { name: "Record the submission…" }).click();
    const dialog = page.getByRole("dialog"); await dialog.waitFor({ timeout: 10_000 }); await page.waitForTimeout(250);
    const said = await dialog.innerText();
    await page.screenshot({ path: join(SHOTS, "03-record-dialog-during-draft-1440.png") });
    ok("BK-21 DW1 pass (screen): the Record the submission dialog says \"through APR Portal\", never the draft's PR Portal", said.includes("as IRCC acknowledged it through APR Portal.") && !/\bPR Portal/.test(said), said.slice(0, 200));
    await page.keyboard.press("Escape"); await dialog.waitFor({ state: "detached", timeout: 10_000 });

    // ---------------------------------------------------------------- DW2: a submission recorded during the draft
    p = await prep(a.id);
    const fl = p!.filings[0], g = p!.groups[0];
    const rec = await call("PATCH", `/runtime/groups/${g.id}/record`, { filings: [{ filing: fl.id, our_reference: "SAMPLE-BK21", submitted_on: inDays(0), application_number: "V300000021", fee_receipt: "SAMPLE-RECEIPT" }], ucis: [{ subject: fl.applicants[0].subject, uci: "1111-0021" }], version: p!.version }, f.officer!);
    const stored = () => sql(`select portal from filing_record where filing_id='${fl.id}'`);
    ok("BK-21 DW2 pass: the submission recorded during the draft stores the released account (APR Portal)", rec.status < 300 && stored() === "APR_PORTAL", { status: rec.status, detail: rec.body?.detail, stored: stored() });
    ok("BK-21 DW2 fail: it never stores the draft's PR Portal", stored() !== "PR_PORTAL", stored());
    const recBack = await pick("APR_PORTAL", "PR_PORTAL");
    ok("BK-21 DW2 pass: moving the draft back changes nothing recorded", recBack.status < 300 && stored() === "APR_PORTAL" && sql(`select count(*) from filing_record where filing_id='${fl.id}'`) === "1", { status: recBack.status, stored: stored() });

    // ---------------------------------------------------------------- DW3: channels checked against the released account
    // On case B (opened on the APR Portal release, not Ready to file), so a channel change touches no recorded filing.
    const b0 = (await prep(old.id))?.items.find((i) => i.kind === "form" && (i.accepts?.length ?? 0) > 1)!;
    ok("setup: case B has a form IRCC accepts in more than one way on the APR Portal", !!b0, b0);
    const paper = await pick("PAPER", "APR_PORTAL");
    ok("setup: the draft now says paper filing (which would allow only Paper)", paper.status < 300 && live() === "PAPER", paper.status);
    p = await prep(old.id);
    const form = p?.items.find((i) => i.id === b0.id);
    ok("BK-21 DW3 pass: the case's accepted channels are still the released account's", JSON.stringify(form?.accepts) === JSON.stringify(b0.accepts), { now: form?.accepts, released: b0.accepts });
    ok("BK-21 DW3 fail: the draft's paper-only rule never narrows them", !!form?.accepts && !(form.accepts.length === 1 && form.accepts[0] === "PAPER"), form?.accepts);
    const other = b0.accepts!.find((x) => x !== b0.channel && x !== "PAPER" && x !== "NOT_NEEDED");
    if (other) {
      const ch = await call("PATCH", `/runtime/items/${b0.id}/channel`, { channel: other, reason: "BK-21 check (Sample)", version: p!.version }, f.officer!);
      ok(`BK-21 DW3 pass: moving ${b0.form} to ${other}, which the released account accepts, is saved (the draft's paper rule would refuse it)`, ch.status < 300, { status: ch.status, detail: ch.body?.detail });
      p = await prep(old.id);
      const back = await call("PATCH", `/runtime/items/${b0.id}/channel`, { channel: b0.channel, reason: "BK-21 check put back (Sample)", version: p!.version }, f.officer!);
      ok("setup: the channel is put back", back.status < 300, back.status);
    }
    const toApr = await pick("APR_PORTAL", "PAPER");
    ok("setup: the draft names the APR Portal again", toApr.status < 300 && live() === "APR_PORTAL", toApr.status);

    // ---------------------------------------------------------------- DW1 release: the change reaches cases by release
    const toPr2 = await pick("PR_PORTAL", "APR_PORTAL");
    const sub = await call("POST", `/combinations/${vv}/submit`, { note: "BK-21 check: the IRCC account moves to the PR Portal (Sample)" }, AUTHOR);
    const sme = (((await call("GET", `/combinations/${vv}/review`, undefined, AUTHOR)).body?.submission?.changeSummary ?? []) as { kind: string; key: string; needs_sme?: boolean }[]).filter((x) => x.needs_sme).map((x) => `${x.kind}|${x.key}`);
    if (sme.length) await call("POST", `/combinations/${vv}/signoff`, { items: sme, action: "signed" }, "user-C");
    const appr = await call("POST", `/combinations/${vv}/approve`, {}, APPROVER);
    ok("setup: the PR Portal is released", toPr2.status < 300 && sub.status < 300 && appr.status < 300 && released() === "PR_PORTAL", { pick: toPr2.status, submit: [sub.status, sub.body?.detail], approve: [appr.status, appr.body?.detail], released: released() });
    const fresh = await openCase(vv, [{ role: "principal", name: "Sample Client BK-21 C", dob: yearsAgo(30) }], team);
    const pf = await prep(fresh.id), po = await prep(old.id);
    ok("BK-21 DW1 release pass: a case opened on the new release reads the PR Portal", !!pf && (pf.release_version ?? 0) > (v0 ?? 0) && pf.portal === "PR_PORTAL" && pf.portal_words?.startsWith("Filed through PR Portal") === true, { version: pf?.release_version, portal: pf?.portal, words: pf?.portal_words });
    ok("BK-21 DW1 release fail: the case opened before keeps its release's APR Portal", po?.release_version === v0 && po?.portal === "APR_PORTAL" && po.portal_words === APR, { version: po?.release_version, portal: po?.portal });
    await ctx.close();
  } finally {
    if (live() !== "APR_PORTAL") await pick("APR_PORTAL", live() || null);
    ok("cleanup: the draft account is put back", live() === "APR_PORTAL", live());
    await browser.close();
  }
});
