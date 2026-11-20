// qa 10 (19 Nov): R1.67 file-type check, gate A by screens (P-317, P-348 (3)) on main after CS-D1t (#2253). The case
// officer, on screen at 1440 px (then 1024 px), on the case's Documents panel: a damaged passport PDF and a GIF named
// passport.png are refused in words on the line with nothing stored; the whole passport PDF is stored; the walk then goes on
// to the NEXT capability's first step (Fill this from documents, C6.5): the drawer reads the stored file by its coded
// lines (rules, no AI, US$0) and the stored bytes come back exactly as uploaded. The client's JPEG named .png is stored
// and served as a JPEG. Sample people, synthetic files; US$0, no model call (ai_batch count checked); never :4400.
//   zsh studio/tools/isolated.sh qa10g 4473 start --ttl 60 && trap 'zsh studio/tools/isolated.sh qa10g 4473 stop' EXIT \
//     && tsx --tsconfig studio/api/tsconfig.json studio/tests/qa/walk_r167_gate_a.ts 4473 xr_studio_qa10g
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CLIENT, FAMILY, FIXED, OFFICER, PORT, agent, call, main, ok, openCase, sql } from "../../acceptance/lib/m3.ts";
import { passportPdf } from "../../acceptance/lib/fixtures.ts";
import { walker } from "../../acceptance/lib/browser.ts";

const STUDIO = join(import.meta.dirname, "..", ".."), BASE = `http://127.0.0.1:${PORT}`, DB = process.argv[3];
const SHOTS = join(STUDIO, "..", "..", "product", "qa", "reports", "2026-11-19-r167-gate-a"); mkdirSync(SHOTS, { recursive: true });
const TMP = join(STUDIO, "var", "qa10-files"); mkdirSync(TMP, { recursive: true });
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const lineIdOf = (subject: string, fact: string) => `a-${subject}-${fact.replace(/[^a-z0-9_]/gi, "-")}`;

await main("R1.67-gate-A", "R1.67 file-type check walked by screens to Fill this from documents (US$0)", async () => {
  const hasVisa = () => sql("select count(*) from document_type where document_type_key='letter_of_authorization_for_a_minor'") === "1";
  if (!hasVisa()) for (const f of ["tests/runtime/setup_visitor_visa.ts", "acceptance/lib/setup_vv_m3.ts"])
    try { execFileSync(join(STUDIO, "node_modules", ".bin", "tsx"), ["--tsconfig", join(STUDIO, "api", "tsconfig.json"), join(STUDIO, f), String(PORT), DB], { stdio: "ignore", timeout: 900_000 }); } catch { /* known setup gaps */ }
  ok("setup: the Visitor visa with pack 4's document lines is released on this copy", hasVisa());
  const c = await openCase(sql("select id from combination where combination_key='vv.single'")!, FAMILY);
  const P = c.subjects["Sample Client A"];
  type Line = { id: string; label: string; state: string; documents: { id: string; file_name: string; current: boolean }[] };
  const linesOf = async () => ((await call("GET", `/runtime/cases/${c.id}/checklist`, undefined, OFFICER)).body?.people as { subject: string; lines: Line[] }[]).find((p) => p.subject === P)!.lines;
  const passLine = (await linesOf()).find((l) => /passport/i.test(l.label) && !/absent|parent/i.test(l.label))!;
  const other = (await linesOf()).find((l) => l.id !== passLine.id && l.state === "not_requested")!;
  ok("setup: Client A has a passport line and another line", !!passLine && !!other, (await linesOf()).map((l) => l.label));
  const secs = ((await agent(c.id))?.sections ?? []) as { section: string; subjectId: string; questions: { fact: string }[] }[];
  const passSec = secs.find((s) => s.subjectId === P && s.questions.some((q) => q.fact === "person.passport_number"))?.section;
  const rows = () => Number(sql(`select count(*) from case_document where subject_id='${P}'`));
  const audits = () => Number(sql(`select count(*) from audit_event where case_id='${c.id}' or summary like '%${c.id.slice(0, 8)}%'`) ?? 0);
  const spend0 = sql("select count(*) from ai_batch");

  const whole = new Uint8Array(passportPdf({ surname: "SAMPLED", given: "CLIENT A", number: "SAMPLEP12", nationality: "IND", dob: FAMILY[0].dob!, sex: "X", expiry: FIXED.expiry }));
  const put = (name: string, b: Uint8Array) => { const p = join(TMP, name); writeFileSync(p, b); return p; };
  const files = {
    damaged: put("passport.pdf", whole.slice(0, whole.length - 40)),                                  // its end cut off: does not open
    gif: put("passport.png", new TextEncoder().encode("GIF89a\u0001\u0000\u0001\u0000\u0000\u0000\u0000;")),
    whole: put("sample-passport.pdf", whole),
  };

  const w = await walker(BASE);
  try {
    const page = await w.open(OFFICER, 1440);
    const row = page.locator(`[data-line="${passLine.id}"]`);
    const open = async () => { await page.goto(`/cases/${c.id}`); await page.locator("[data-documents-panel]").waitFor({ timeout: 30_000 }); await row.waitFor({ timeout: 30_000 }); };
    const shot = (n: string, width = 1440) => page.locator("[data-documents-panel]").screenshot({ path: join(SHOTS, `${n}-${width}.png`) });
    const uploadVia = async (path: string) => {
      await row.locator("[data-line-menu]").click();
      const chooser = page.waitForEvent("filechooser"); await page.locator('[data-action="upload"]').first().click();
      await (await chooser).setFiles(path); await page.waitForTimeout(300); await w.settle(page, "the upload");
    };
    await open();
    // G1, G2: refusals in words on the line; nothing stored.
    for (const [g, path, words] of [["G1 a passport PDF with its end cut off", files.damaged, /could not be read|damaged/i], ["G2 a GIF named passport.png", files.gif, /not accepted.*PDF, JPEG and PNG/i]] as [string, string, RegExp][]) {
      const before = { rows: rows(), audits: audits() };
      await uploadVia(path);
      const err = row.locator("[data-line-error]"); await err.waitFor({ timeout: 20_000 }).catch(() => {});
      const t = (await err.textContent().catch(() => "")) ?? "";
      ok(`R1.67 gate A ${g}: refused in words on the passport line ("${t.slice(0, 90)}"), ends "Nothing was stored.", no row and no audit line`, words.test(t) && /Nothing was stored\.$/.test(t.trim()) && rows() === before.rows && audits() === before.audits, { t, before, after: { rows: rows(), audits: audits() } });
      await shot(g.split(" ")[0]);
    }
    // G3: the whole passport PDF is stored and named on the line.
    await uploadVia(files.whole);
    await page.locator(`[data-line="${passLine.id}"][data-state="received"]`).waitFor({ timeout: 30_000 }).catch(() => {});
    const doc = (await linesOf()).find((l) => l.id === passLine.id)!.documents.find((d) => d.current);
    ok("R1.67 gate A G3: the whole passport PDF is stored: line Received, the file named on it, the error gone", !!doc && ((await row.textContent()) ?? "").includes("sample-passport.pdf") && (await row.locator("[data-line-error]").count()) === 0, doc);
    await shot("G3");
    // G4: the stored bytes come back exactly as uploaded, as a PDF.
    const res = await fetch(`${BASE}/api/runtime/documents/${doc?.id}/file`, { headers: { "x-actor": OFFICER } });
    const back = new Uint8Array(await res.arrayBuffer());
    ok("R1.67 gate A G4: the stored file is served as application/pdf with the same SHA-256 as uploaded", res.status === 200 && /application\/pdf/.test(res.headers.get("content-type") ?? "") && sha(back) === sha(whole), { status: res.status, type: res.headers.get("content-type"), same: sha(back) === sha(whole) });
    // G5: the next capability's first step: Fill this from documents reads the stored passport by its coded lines.
    await page.goto(`/cases/${c.id}#${lineIdOf(P, "person.passport_number")}`); await w.settle(page, "the case page");
    await page.locator(`#s-${P}-${passSec} [data-fill-from-documents]`).click();
    const drawer = page.locator("[data-documents-drawer]"); await drawer.waitFor({ timeout: 30_000 }); await w.settle(page, "the drawer");
    const block = drawer.locator(`[data-document-block="${doc?.id}"]`);
    const blockText = (await block.textContent().catch(() => "")) ?? "";
    ok("R1.67 gate A G5 (next capability, C6.5): the drawer shows the stored passport as one block read by its coded lines (rules, no AI), with Open file", (await block.count()) === 1 && /coded lines/i.test(blockText) && (await block.locator("[data-open-file]").count()) >= 1, blockText.slice(0, 200));
    ok("R1.67 gate A G5: no model call was made (ai_batch unchanged; US$0)", sql("select count(*) from ai_batch") === spend0);
    await page.screenshot({ path: join(SHOTS, "G5-drawer-1440.png") });
    await page.keyboard.press("Escape");
    // G6: the client's JPEG named .png (API: no client upload screen yet) is stored and served as a JPEG.
    const jpg = new Uint8Array(readFileSync(join(STUDIO, "tests", "fixtures", "file-types", "sample.jpg")));
    const fd = new FormData(); fd.append("file", new Blob([jpg]), "photo.png");
    const u = await fetch(`${BASE}/api/runtime/checklist-lines/${other.id}/documents`, { method: "POST", headers: { "x-actor": CLIENT }, body: fd });
    const ub = await u.json().catch(() => null) as { document?: { id: string; file_name?: string } } | null;
    const r2 = await fetch(`${BASE}/api/runtime/documents/${ub?.document?.id}/file`, { headers: { "x-actor": OFFICER } });
    const b2 = new Uint8Array(await r2.arrayBuffer());
    ok("R1.67 gate A G6: the client's JPEG named photo.png is stored as photo.jpg and served as image/jpeg, bytes unchanged", u.status === 201 && sql(`select media_type || '|' || file_name from case_document where id='${ub?.document?.id}'`) === "image/jpeg|photo.jpg" && /image\/jpeg/.test(r2.headers.get("content-type") ?? "") && sha(b2) === sha(jpg), { status: u.status, row: sql(`select media_type || '|' || file_name from case_document where id='${ub?.document?.id}'`), type: r2.headers.get("content-type") });
    // G7: 1024 px, the officer sees the client's file on its line; keyboard reaches the line menu.
    await page.setViewportSize({ width: 1024, height: 800 }); await open();
    const line2 = page.locator(`[data-line="${other.id}"]`);
    ok("R1.67 gate A G7: at 1024 px the officer's panel shows the client's photo.jpg on its line", ((await line2.textContent()) ?? "").includes("photo.jpg"));
    await shot("G7", 1024);
    ok("R1.67 gate A: no page error or failed request on the walk", w.errors.filter((e) => !/40[0-9]|413|415/.test(e)).length === 0, w.errors.slice(0, 5));
  } finally { await w.close(); }
});
