// PF-Fd: FilesPort.delete. The shared contract's delete cases (DW1 to DW4) on the fake and on LocalFiles, each with a
// broken adapter that must fail them; LocalFiles never removes anything outside the firm's folder (a symlink out of it is
// refused) and a crafted key cannot get past the tombstone; the port-contract guard (DW5). No database, no server, no
// model call (US$0).   tsx studio/tests/check_pffd_delete.ts
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runContract } from "../ports/contracts/contract.ts";
import { filesPortContract } from "../ports/contracts/files-port.contract.ts";
import { fakeFiles, FileKeyTaken, sha256Hex, type FilesPort } from "../ports/files.ts";
import { LocalFiles } from "../api/src/front-office/files.ts";

const STUDIO = join(import.meta.dirname, ".."), WORK = join(STUDIO, "var", `pffd-check-${process.pid}`);
const FIRM = "0c0c0c0c-0000-4000-8000-0000000000a1";
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const refused = async (f: () => unknown, test: (e: unknown) => boolean = () => true) => { try { await f(); return false; } catch (e) { return test(e); } };
const caseOf = (dw: string, names: string[]) => names.filter((n) => n.startsWith(`PF-Fd ${dw}:`)).length;
mkdirSync(WORK, { recursive: true });
try {
  // DW1 to DW4 pass: both adapters keep every delete case of the shared contract.
  const adapters: [string, () => FilesPort][] = [["fakeFiles", () => fakeFiles()], ["LocalFiles", () => new LocalFiles(join(WORK, "contract", crypto.randomUUID()))]];
  for (const [name, make] of adapters) {
    const r = await runContract(filesPortContract, name, make, null);
    for (const dw of ["DW1", "DW2", "DW3", "DW4"]) ok(`PF-Fd ${dw} pass: ${name} keeps the contract's ${dw} case`, caseOf(dw, r.passed) === 1 && caseOf(dw, r.failed) === 0, r.failed);
  }

  // DW1 to DW3 fail: an adapter that deletes nothing, one that ignores the firm wall, one that lets a deleted key be written again.
  const keepsBytes = (): FilesPort => { const f = fakeFiles(); return { put: f.put, get: f.get, exists: f.exists, delete: async () => ({ deleted: true }), usedBytes: f.usedBytes }; };
  const noWall = (): FilesPort => { const f = fakeFiles(); return { put: f.put, get: f.get, exists: f.exists, delete: async (_firm, key) => f.delete(FIRM, key), usedBytes: f.usedBytes }; };
  const reusable = (): FilesPort => { const live = new Map<string, Uint8Array>();
    return {
      async put(firm, key, bytes, contentType) { const k = `${firm}|${key}`, had = live.get(k), sha256 = await sha256Hex(bytes); if (had && await sha256Hex(had) !== sha256) throw new FileKeyTaken(key); live.set(k, new Uint8Array(bytes)); return { key, sha256 }; },
      async get(firm, key) { const b = live.get(`${firm}|${key}`); return b ? { key, bytes: new Uint8Array(b), contentType: "text/plain", sha256: await sha256Hex(b) } : null; },
      async exists(firm, key) { return live.has(`${firm}|${key}`); },
      async delete(firm, key) { return { deleted: live.delete(`${firm}|${key}`) }; },
      async usedBytes(firm) { let n = 0; for (const [k, b] of live) if (k.startsWith(`${firm}|`)) n += b.byteLength; return n; },   // PF-15: the port's new read
    }; };
  const fails = async (make: () => FilesPort, dw: string) => caseOf(dw, (await runContract(filesPortContract, "broken", make, null)).failed) === 1;
  ok("PF-Fd DW1 fail: an adapter whose delete answers true but keeps the bytes fails DW1", await fails(keepsBytes, "DW1"));
  ok("PF-Fd DW2 fail: an adapter that deletes another firm's key fails DW2", await fails(noWall, "DW2"));
  ok("PF-Fd DW3 fail: an adapter that lets a deleted key be written again fails DW3", await fails(reusable, "DW3"));

  // DW4: LocalFiles never removes anything outside the firm's folder; a symlink out of it is refused.
  const root = join(WORK, "walled"), store = new LocalFiles(root), outside = join(WORK, "outside");
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(outside, "x.txt"), "outside");
  await store.put(FIRM, "docs/real.txt", new TextEncoder().encode("inside"), "text/plain");
  const meta = JSON.stringify({ contentType: "text/plain", sha256: "0".repeat(64) });
  writeFileSync(join(outside, "x.txt.meta"), meta);
  symlinkSync(outside, join(root, FIRM, "out"));                                   // a folder on the way is a symlink out
  symlinkSync(join(outside, "x.txt"), join(root, FIRM, "docs", "link.txt"));          // the file itself is a symlink out
  writeFileSync(join(root, FIRM, "docs", "link.txt.meta"), meta);
  ok("PF-Fd DW4 pass: a symlinked folder out of the firm's folder is refused, the outside file kept", await refused(() => store.delete(FIRM, "out/x.txt")) && existsSync(join(outside, "x.txt")));
  ok("PF-Fd DW4 pass: a symlinked file out of the firm's folder is refused, the outside file kept", await refused(() => store.delete(FIRM, "docs/link.txt")) && existsSync(join(outside, "x.txt")));
  ok("PF-Fd DW4 fail: a real file inside the firm's folder is still deleted", (await store.delete(FIRM, "docs/real.txt")).deleted === true && !existsSync(join(root, FIRM, "docs", "real.txt")));

  // The reviewer's point: a crafted key cannot get past the tombstone (the key is canonical; .meta/.tmp keys are refused).
  for (const key of ["docs/real.txt.meta", "docs/real.txt.1.ab.tmp", "docs//real.txt", "docs/./real.txt", "docs/real.txt/", "Docs/Real.txt"]) ok(`PF-Fd DW3 fail: the crafted key ${key} is refused by put`, await refused(() => store.put(FIRM, key, new TextEncoder().encode("inside"), "text/plain")));
  ok("PF-Fd DW3 pass: the tombstone keeps the key retired for the same bytes (LocalFiles, a fresh instance on the same folder)", await refused(() => new LocalFiles(root).put(FIRM, "docs/real.txt", new TextEncoder().encode("inside"), "text/plain"), (e) => e instanceof FileKeyTaken) && !existsSync(join(root, FIRM, "docs", "real.txt")));

  // Review m3: a tombstone with the bytes still present (a delete that failed after retiring the key) reads as absent.
  const planted = new LocalFiles(join(WORK, "planted")), body = new TextEncoder().encode("left behind");
  const p = await planted.put(FIRM, "docs/left.txt", body, "text/plain");
  writeFileSync(join(WORK, "planted", FIRM, "docs", "left.txt.meta"), JSON.stringify({ contentType: "text/plain", sha256: p.sha256, deletedAt: "2026-11-16T00:00:00.000Z" }));
  ok("PF-Fd DW1 fail: a tombstone beside its bytes reads as absent (get null, exists false) and deletes as false", await planted.get(FIRM, "docs/left.txt") === null && await planted.exists(FIRM, "docs/left.txt") === false && (await planted.delete(FIRM, "docs/left.txt")).deleted === false);
  ok("PF-Fd DW3 fail: a tombstone beside its bytes still refuses put of the same bytes (FileKeyTaken)", await refused(() => planted.put(FIRM, "docs/left.txt", body, "text/plain"), (e) => e instanceof FileKeyTaken));

  // DW5: the port-contract guard passes (the FO-5 and PF-0p suites run in their own files, unchanged).
  const guard = spawnSync(process.execPath, [join(STUDIO, "tools/check-port-contracts.mjs")], { encoding: "utf8" });
  ok("PF-Fd DW5 pass: tools/check-port-contracts.mjs exits 0 and lists FilesPort", guard.status === 0 && /FilesPort/.test(guard.stdout), guard.stdout + guard.stderr);
} finally { rmSync(WORK, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
