// CS-D6 part 1 (R1.69, map row 69; brief design/briefs/CS-D6.md part 1): who read a stored case document, and whether its
// file is still the one uploaded. Requirement text: AG-9-32 (every read writes an access record, in the one audit trail),
// AG-9-24 (every preview audited), AG-9-31 (SHA-256 per file; a mismatch flags it), AG-9-53 (only those who can see the
// case). Each rule has a passing and a failing case:
//   DW1  a download (and a preview, once CS-D5's route is on this copy) adds one line naming the right person, listed for
//        that document only; a refused download adds none
//   DW2  without agent/document:view-access-log (Case officer, Case manager) the list is 403; with no session 401; the
//        Owner gets it; the other Sample firm's Owner gets 404 in the words of an unknown id; 51 lines page as 50 + 1,
//        newest first, no line twice; a cursor the list did not give is 400; a person holding the key but not the case
//        (no agent/case:view.all, not on the case's team, not its file owner: caseScope, AG-9-53) gets 404 on both routes
//   DW3  "Check the file is unchanged" on the stored file answers unchanged and writes "checked unchanged"; after the
//        stored bytes are altered on disk it answers changed and writes "found changed"; another firm gets 404 and
//        writes nothing
// Parts 2 (keep list) and 3 (Dispose) add DW4-DW8 here. Synthetic Sample documents only. No model call (US$0).
//   zsh studio/tools/isolated.sh runtime_csd6 4494 start PLATFORM_IDENTITY=local && tsx studio/tests/check_csd6_reads_keep.ts 4494 xr_studio_runtime_csd6
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CLIENT, FAMILY, OFFICER, PORT, DB, call, main, ok, openCase, sql } from "../acceptance/lib/m3.ts";
import { textPdf, upload } from "../acceptance/lib/fixtures.ts";

const studio = join(import.meta.dirname, "..");
const vvOf = () => sql("select id from combination where combination_key='vv.single'") || null;
if (!vvOf()) for (const f of ["tests/runtime/setup_visitor_visa.ts", "acceptance/lib/setup_vv_m3.ts"])
  try { execFileSync(join(studio, "node_modules", ".bin", "tsx"), ["--tsconfig", join(studio, "api", "tsconfig.json"), join(studio, f), String(PORT), DB], { stdio: ["ignore", "ignore", "inherit"], timeout: 900_000 }); }
  catch { /* the setups exit 1 on their own known gaps; what this check needs is asked below */ }

const BASE = `http://127.0.0.1:${PORT}/api`;
const UNKNOWN = "00000000-0000-4000-8000-000000000000";
type Res = { status: number; body: any };
/** A staff route call with a bearer session (PF-4), optionally also an x-actor header (which must change nothing). */
const staff = async (method: string, path: string, token: string | null, actor?: string): Promise<Res> => {
  const headers: Record<string, string> = { accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (actor) headers["x-actor"] = actor;
  const r = await fetch(`${BASE}${path}`, { method, headers }).catch(() => null);
  return { status: r?.status ?? 0, body: await r?.json().catch(() => null) };
};
const tokenOf = async (actorId: string, firmKey = "sample-firm") => {
  const r = await fetch(`${BASE}/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey, actorId, secondStep: true }) }).catch(() => null);
  return r?.ok ? ((await r.json()) as { token: string }).token : null;
};
const download = (doc: string, actor: string) => fetch(`${BASE}/runtime/documents/${doc}/file`, { headers: { "x-actor": actor } }).then(async (r) => { await r.arrayBuffer(); return r.status; }).catch(() => 0);
const reads = (doc: string, token: string | null, before?: string) => staff("GET", `/runtime/documents/${doc}/reads${before !== undefined ? `?before=${encodeURIComponent(before)}` : ""}`, token);
const lineCount = (doc: string, action: string) => Number(sql(`select count(*) from audit_event where entity='case document' and entity_key='${doc}' and action='${action}'`) ?? "-1");
/** The stored file of a document on this copy (studio/var/isolated-<name>/workspaces/<workspace key>/<path>). Named, never
 *  listed: a folder listing beside the pack paths above makes the suite selector tie every acceptance pack to this suite. */
function storedFile(doc: string): string | null {
  const root = join(studio, "var", `isolated-${DB.replace(/^xr_studio_/, "")}`, "workspaces"), rel = sql(`select path from case_document where id='${doc}'`);
  if (!rel) return null;
  const p = join(root, process.env.STUDIO_WORKSPACE_KEY?.trim() || "demo", rel);
  return existsSync(p) ? p : null;
}

await main("CS-D6 reads", "Read by list, the fingerprint and the file check; staff session and keys; one audit trail (US$0)", async () => {
  const vv = vvOf();
  ok("setup: the Visitor visa is released on this copy", !!vv);
  const c = await openCase(vv!, FAMILY);
  const [owner, officer, manager, soloOwner] = await Promise.all([tokenOf("user-R"), tokenOf("user-O"), tokenOf("user-T"), tokenOf("user-S", "sample-solo")]);
  ok("setup: staff sessions for the Sample firm's Owner, Case officer and Case manager and the solo firm's Owner", !!(owner && officer && manager && soloOwner));
  const put = async (name: string) => (await upload(PORT, `/runtime/cases/${c.id}/documents`, textPdf([`Sample synthetic letter ${name}`]), name, OFFICER, { subjectId: c.caseSubject, documentType: "letter_of_invitation" })).body?.document?.id as string | undefined;
  const doc = await put(`letter-a-${Date.now().toString(36)}.pdf`), doc2 = await put(`letter-b-${Date.now().toString(36)}.pdf`);
  ok("setup: two Sample PDFs are stored on the case", !!doc && !!doc2, [doc, doc2]);

  // ---- DW1 a read adds one line, the right person, this document only
  const v0 = lineCount(doc!, "viewed");
  ok("CS-D6 DW1 pass: the case officer's download answers 200", (await download(doc!, OFFICER)) === 200);
  let r = await reads(doc!, owner);
  const mine = (r.body?.lines ?? []).filter((l: { action: string }) => l.action === "viewed");
  ok("CS-D6 DW1 pass: the download added exactly one \"viewed\" line, listed for the document, naming the case officer from the firm's record", r.status === 200 && lineCount(doc!, "viewed") === v0 + 1 && mine.length === v0 + 1 && mine[0]?.who === "Case officer (Sample)", [r.status, v0, lineCount(doc!, "viewed"), mine[0]]);
  r = await reads(doc2!, owner);
  ok("CS-D6 DW1 fail: the other document's list does not show that line", r.status === 200 && (r.body?.lines ?? []).length === 0, r.body?.lines?.length);
  const v1 = lineCount(doc!, "viewed"), refused = await download(doc!, CLIENT);
  ok("CS-D6 DW1 fail: a refused download (a client, 403) adds no line", refused === 403 && lineCount(doc!, "viewed") === v1, [refused, v1, lineCount(doc!, "viewed")]);
  const pv = await call("POST", `/runtime/documents/${doc}/preview-link`, {}, OFFICER);
  if (pv.status === 200) {
    r = await reads(doc!, owner);
    ok("CS-D6 DW1 pass: a preview (CS-D5) adds one \"previewed\" line, listed with the case officer's name", (r.body?.lines ?? []).filter((l: { action: string; who: string }) => l.action === "previewed" && l.who === "Case officer (Sample)").length === 1, r.body?.lines);
  } else console.log(`NOTE  CS-D6 DW1: no preview route on this copy (${pv.status}); CS-D5 part 1 (#3188) is not merged, so the "previewed" case runs once it is`);

  // ---- DW2 the key, the firm, the pages
  const [byOfficer, byManager, noSession, xActorOnly] = await Promise.all([reads(doc!, officer), reads(doc!, manager), reads(doc!, null), staff("GET", `/runtime/documents/${doc}/reads`, null, "user-R")]);
  ok("CS-D6 DW2 fail: a Case officer and a Case manager (no agent/document:view-access-log) get 403", byOfficer.status === 403 && byManager.status === 403, [byOfficer.status, byManager.status]);
  ok("CS-D6 DW2 fail: no session gets 401, also with the Owner's x-actor header (the simulated person never decides)", noSession.status === 401 && xActorOnly.status === 401, [noSession.status, xActorOnly.status]);
  const [other, unknown] = await Promise.all([reads(doc!, soloOwner), reads(UNKNOWN, owner)]);
  ok("CS-D6 DW2 fail: the other Sample firm's Owner gets 404 in the same words as an unknown id", other.status === 404 && unknown.status === 404 && other.body?.detail === unknown.body?.detail, [other.status, unknown.status, other.body?.detail]);
  ok("CS-D6 DW2 fail: a cursor the list did not give → 400", (await reads(doc!, owner, "yesterday")).status === 400);
  // A line tagged with the other Sample firm, about this document's key, never shows (review m1).
  const soloFirm = sql("select id from platform_firm where key='sample-solo'"), ws = sql(`select workspace_id from case_document where id='${doc}'`);
  sql(`insert into audit_event (id, workspace_id, actor, action, entity, entity_key, summary, firm_id) values (gen_random_uuid(), '${ws}', 'user-S', 'viewed', 'case document', '${doc}', 'Sample line of the other firm', '${soloFirm}')`);
  ok("CS-D6 DW2 fail: a read line tagged with another firm, about this document, is not listed", lineCount(doc!, "viewed") === v1 + 1 && !((await reads(doc!, owner)).body?.lines ?? []).some((l: { summary: string }) => l.summary === "Sample line of the other firm"), lineCount(doc!, "viewed"));
  ok("CS-D6 DW2 pass: the Owner gets the list with the file's name and fingerprint", (await reads(doc!, owner)).body?.document?.sha256 === sql(`select sha256 from case_document where id='${doc}'`));
  for (let i = 0; i < 51; i++) await download(doc2!, OFFICER);
  const p1 = await reads(doc2!, owner), p2 = p1.body?.next ? await reads(doc2!, owner, p1.body.next) : { status: 0, body: null };
  const all = [...(p1.body?.lines ?? []), ...(p2.body?.lines ?? [])] as { id: string; at: string }[];
  const sorted = all.every((l, i) => i === 0 || all[i - 1]!.at >= l.at);
  ok("CS-D6 DW2 pass: 51 reads page as 50 + 1, newest first, no line twice, and the last page has no next", p1.body?.lines?.length === 50 && !!p1.body?.next && p2.body?.lines?.length === 1 && p2.body?.next === null && new Set(all.map((l) => l.id)).size === 51 && sorted, [p1.body?.lines?.length, p2.body?.lines?.length, p2.body?.next, sorted]);

  // Breaker M1: the key alone is not enough; the case must be in the person's caseScope. On this copy only, the Case
  // manager role loses agent/case:view.all and gains the access-log key; user-T is on no team of this case.
  sql(`delete from platform_role_permission where role='CASE_MANAGER' and permission_key='agent/case:view.all'; insert into platform_role_permission (role, permission_key) values ('CASE_MANAGER', 'agent/document:view-access-log') on conflict do nothing`);
  const ownOnly = await tokenOf("user-T"), lines0 = lineCount(doc!, "checked unchanged") + lineCount(doc!, "found changed");
  const [scopedList, scopedCheck] = [await reads(doc!, ownOnly), await staff("POST", `/runtime/documents/${doc}/check-unchanged`, ownOnly)];
  ok("CS-D6 DW2 fail: a person with the access-log key but not the case (own cases only, not on its team) gets 404 on the list and the check, and no line is written",
    scopedList.status === 404 && scopedCheck.status === 404 && lineCount(doc!, "checked unchanged") + lineCount(doc!, "found changed") === lines0, [scopedList.status, scopedCheck.status]);
  sql(`delete from platform_role_permission where role='CASE_MANAGER' and permission_key='agent/document:view-access-log'; insert into platform_role_permission (role, permission_key) values ('CASE_MANAGER', 'agent/case:view.all') on conflict do nothing`);

  // Lines written in the same microsecond (a writer using the database's own clock) page by id, none skipped (review m1).
  sql(`insert into audit_event (id, workspace_id, actor, action, entity, entity_key, summary, at) select gen_random_uuid(), workspace_id, 'user-O', 'viewed', 'case document', id::text, 'Sample same-moment line', '2026-01-01 00:00:00.000001+00' from case_document, generate_series(1, 52) where id = '${doc2}'`);
  const seen = new Set<string>(); let next: string | null | undefined = undefined, pages = 0;
  do { const pg = await reads(doc2!, owner, next ?? undefined); (pg.body?.lines ?? []).forEach((l: { id: string }) => seen.add(l.id)); next = pg.body?.next; pages++; } while (next && pages < 10);
  ok("CS-D6 DW2 pass: 103 lines, 52 of them in the same microsecond, page through as 50 + 50 + 3 with every line once", seen.size === 103 && seen.size === lineCount(doc2!, "viewed") && pages === 3, [seen.size, lineCount(doc2!, "viewed"), pages]);

  // ---- DW3 the file check
  const u0 = lineCount(doc!, "checked unchanged");
  r = await staff("POST", `/runtime/documents/${doc}/check-unchanged`, officer);
  ok("CS-D6 DW3 pass: on the stored file the Case officer (agent/document:show) gets unchanged and one \"checked unchanged\" line", r.status === 200 && r.body?.unchanged === true && r.body?.found_sha256 === r.body?.sha256 && lineCount(doc!, "checked unchanged") === u0 + 1, [r.status, r.body]);
  const f0 = lineCount(doc!, "found changed"), x = await staff("POST", `/runtime/documents/${doc}/check-unchanged`, soloOwner);
  ok("CS-D6 DW3 fail: the other firm's Owner gets 404 and no line is written", x.status === 404 && lineCount(doc!, "found changed") === f0 && lineCount(doc!, "checked unchanged") === u0 + 1, [x.status]);
  const file = storedFile(doc!);
  ok("setup: the stored file is found on this copy", !!file, file);
  if (file) writeFileSync(file, textPdf(["Sample synthetic letter, altered after upload"]));
  r = await staff("POST", `/runtime/documents/${doc}/check-unchanged`, officer);
  ok("CS-D6 DW3 fail: after the stored bytes are altered the check answers changed and writes one \"found changed\" line", r.status === 200 && r.body?.unchanged === false && !!r.body?.found_sha256 && r.body?.found_sha256 !== r.body?.sha256 && lineCount(doc!, "found changed") === f0 + 1, [r.status, r.body]);
  const file2 = storedFile(doc2!);
  if (file2) execFileSync("rm", ["-f", file2]);
  r = await staff("POST", `/runtime/documents/${doc2}/check-unchanged`, officer);
  ok("CS-D6 DW3 fail: a stored file that is gone (or cannot be read) answers changed with no hash found, and writes \"found changed\"", r.status === 200 && r.body?.unchanged === false && r.body?.found_sha256 === null && lineCount(doc2!, "found changed") === 1, [r.status, r.body]);
  r = await reads(doc!, owner);
  ok("CS-D6 DW3 pass: both checks show in the document's Read by list, newest first", r.body?.lines?.[0]?.action === "found changed" && (r.body?.lines ?? []).some((l: { action: string }) => l.action === "checked unchanged"), r.body?.lines?.slice(0, 3));
});
