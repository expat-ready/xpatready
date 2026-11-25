// FO-5 (contracts §0.3, §2.3, §7; rows rev 16): the real FilesPort (ports/files.ts) for the reference app, and short-lived
// checked download links. Every file belongs to one firm: it lives under the firm's own folder (`<root>/<firm id>/<key>`),
// so another firm's key reads as absent. A key is written once: the same bytes again are accepted (a retry), other bytes
// are refused (FileKeyTaken), so a stored document never changes under its key; the write goes to a temporary file first
// and is linked into place, so a crash never leaves half a file and two writers of one key cannot both win. In the test
// environment and production the adapter is S3 in Canada (PF-8); this port stays.
// A download link is a token naming the firm, the key and an expiry, signed with HMAC-SHA256: a link expires (Sample 5
// minutes), is refused for another firm or another person (404, so it leaks nothing) and cannot be altered. The signing key is
// FO_FILES_LINK_KEY, or a random one per process (links then end when the server restarts, which a 5-minute link tolerates).
// Nest's decorators are applied as calls (identity/keys.ts says why).
import { Injectable } from "@nestjs/common";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, linkSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { FileKey, FileKeyTaken, parseFilePut, sha256Hex, type FilesPort, type StoredFile } from "../../../ports/files.ts";
import { FirmId } from "../../../ports/audit.ts";

const STUDIO = resolve(import.meta.dirname, "..", "..", "..");
/** Sample: how long a download link works (BR-15 "short-lived links"). */
export const LINK_SECONDS = 5 * 60;

/** `deletedAt` is the tombstone (PF-Fd): the bytes are gone and the key is retired, never written again. */
type Meta = { contentType: string; sha256: string; deletedAt?: string };

/** The local-folder adapter. `root` defaults to FO_FILES_DIR or studio/var/front-office-files. */
export class LocalFiles implements FilesPort {
  readonly root: string;
  /** FO_FILES_DIR, else the copy's own var folder (STUDIO_VAR, set by tools/isolated.sh; break B-7), else studio/var. */
  constructor(root = process.env.FO_FILES_DIR ?? join(process.env.STUDIO_VAR ?? join(STUDIO, "var"), "front-office-files")) { this.root = resolve(root); }

  /** The file's path under its firm's folder; the key is checked first, so it can never leave that folder. */
  private pathOf(firmId: string, key: string): string {
    // The adapter keeps a `.meta` beside each file and writes through `.tmp` files: a key may not end so (review m6).
    if (/\.(meta|tmp)$/.test(key)) throw new Error("file key may not end in .meta or .tmp");
    const p = join(this.root, FirmId.parse(firmId).toLowerCase(), FileKey.parse(key));
    if (!p.startsWith(join(this.root, firmId.toLowerCase()) + "/")) throw new Error("file key leaves its firm's folder");
    return p;
  }

  async put(firmId: string, key: string, bytes: Uint8Array, contentType: string): Promise<{ key: string; sha256: string }> {
    const f = parseFilePut({ firmId, key, bytes, contentType });
    const sha256 = await sha256Hex(f.bytes), path = this.pathOf(f.firmId, f.key);
    const had = this.meta(path);
    if (had?.deletedAt) throw new FileKeyTaken(f.key);   // PF-Fd: a deleted key is retired, even for the same bytes
    if (had && (had.sha256 !== sha256 || had.contentType !== f.contentType)) throw new FileKeyTaken(f.key);   // the port's rule (m6)
    if (had && existsSync(path)) return { key: f.key, sha256 };   // the same bytes again: a retry
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
    writeFileSync(tmp, f.bytes, { flag: "wx" });
    writeFileSync(`${tmp}.meta`, JSON.stringify({ contentType: f.contentType, sha256 } satisfies Meta), { flag: "wx" });
    try {
      linkSync(`${tmp}.meta`, `${path}.meta`);   // the meta file is the write's claim: link fails if another writer has it
      linkSync(tmp, path);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      const now = this.meta(path);
      if (!now || now.deletedAt || now.sha256 !== sha256 || now.contentType !== f.contentType) throw new FileKeyTaken(f.key);
      if (!existsSync(path)) linkSync(tmp, path);
    } finally { for (const t of [tmp, `${tmp}.meta`]) try { unlinkSync(t); } catch { /* already gone */ } }
    // PF-Fd (review m2): a delete in another process may have retired the key while this retry linked its bytes back.
    if (this.meta(path)?.deletedAt) { try { unlinkSync(path); } catch { /* already gone */ } throw new FileKeyTaken(f.key); }
    return { key: f.key, sha256 };
  }

  async get(firmId: string, key: string): Promise<StoredFile | null> {
    const path = this.pathOf(firmId, key), m = this.meta(path);
    if (!m || m.deletedAt || !existsSync(path)) return null;
    return { key, bytes: new Uint8Array(readFileSync(path)), contentType: m.contentType, sha256: m.sha256 };
  }

  async exists(firmId: string, key: string): Promise<boolean> { const p = this.pathOf(firmId, key), m = this.meta(p); return !!m && !m.deletedAt && existsSync(p); }

  /** PF-Fd: the tombstone is written first (so the key is retired even if removing the bytes fails), then the bytes go.
   *  Only inside the firm's folder: a folder or file on the way that is a symlink out of it is refused. */
  async delete(firmId: string, key: string): Promise<{ deleted: boolean }> {
    const path = this.pathOf(firmId, key), firmDir = join(this.root, firmId.toLowerCase());
    const m = this.meta(path);
    if (!m || m.deletedAt || !existsSync(path)) return { deleted: false };
    const firmReal = realpathSync(firmDir);
    if (firmReal !== join(realpathSync(this.root), firmId.toLowerCase()) || !`${realpathSync(dirname(path))}/`.startsWith(`${firmReal}/`)
      || lstatSync(path).isSymbolicLink() || lstatSync(`${path}.meta`).isSymbolicLink()) throw new Error("file key leaves its firm's folder");
    const tmp = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp.meta`;
    writeFileSync(tmp, JSON.stringify({ contentType: m.contentType, sha256: m.sha256, deletedAt: new Date().toISOString() } satisfies Meta), { flag: "wx" });
    renameSync(tmp, `${path}.meta`);
    try { unlinkSync(path); } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return { deleted: false }; throw e; }   // review m1: another process won
    return { deleted: true };
  }

  /** PF-15 (SA-3-40): the bytes of the firm's live files (a key with its `.meta` and no tombstone); a retired key, a
   *  `.tmp` left by a crash and the `.meta` files themselves do not count. Symlinks are not followed. */
  async usedBytes(firmId: string): Promise<number> {
    const firmDir = join(this.root, FirmId.parse(firmId).toLowerCase());
    let total = 0;
    const walk = (dir: string) => {
      let names: string[];
      try { names = readdirSync(dir); } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return; throw e; }
      for (const name of names) {
        const p = join(dir, name), st = (() => { try { return lstatSync(p); } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; } })();   // another process's .tmp may go (break m1)
        if (!st) continue;
        if (st.isDirectory()) { walk(p); continue; }
        if (!st.isFile() || /\.(meta|tmp)$/.test(name)) continue;
        const m = this.meta(p);
        if (m && !m.deletedAt) total += st.size;
      }
    };
    walk(firmDir);
    return total;
  }

  /** PF-15: the key was ever written for the firm (live or retired): a put of it is a retry or a FileKeyTaken. */
  protected known(firmId: string, key: string): boolean { return this.meta(this.pathOf(firmId, key)) !== null; }

  private meta(path: string): Meta | null {
    try { return JSON.parse(readFileSync(`${path}.meta`, "utf8")) as Meta; } catch { return null; }
  }
}
Injectable()(LocalFiles);

/** Short-lived, checked download links for files in a FilesPort (BR-15; contracts §0.3). */
export class FileLinks {
  private readonly macKey: Buffer;
  constructor(keyText = process.env.FO_FILES_LINK_KEY) { this.macKey = keyText ? Buffer.from(keyText, "utf8") : randomBytes(32); }

  /** A token for the firm's key, for the person who asked for it (review m7), valid until now + seconds. */
  sign(firmId: string, staffId: string, key: string, nowMs: number, seconds = LINK_SECONDS): { token: string; expiresAt: string } {
    const exp = Math.floor(nowMs / 1000) + seconds;
    const body = Buffer.from(JSON.stringify({ f: FirmId.parse(firmId).toLowerCase(), s: staffId.toLowerCase(), k: FileKey.parse(key), e: exp })).toString("base64url");
    return { token: `${body}.${this.mac(body)}`, expiresAt: new Date(exp * 1000).toISOString() };
  }

  /** The key a token names, or why it is refused: "invalid" (altered, malformed, another firm's or another person's) or
   *  "expired". */
  check(token: string, firmId: string, staffId: string, nowMs: number): { key: string } | { refused: "invalid" | "expired" } {
    const m = /^([A-Za-z0-9_-]{1,800})\.([A-Za-z0-9_-]{43})$/.exec(token ?? "");
    if (!m) return { refused: "invalid" };
    const want = Buffer.from(this.mac(m[1])), got = Buffer.from(m[2]);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return { refused: "invalid" };
    let p: { f?: unknown; s?: unknown; k?: unknown; e?: unknown };
    try { p = JSON.parse(Buffer.from(m[1], "base64url").toString("utf8")); } catch { return { refused: "invalid" }; }
    if (typeof p.f !== "string" || typeof p.k !== "string" || typeof p.e !== "number" || p.f !== firmId.toLowerCase() || p.s !== staffId.toLowerCase()) return { refused: "invalid" };
    if (Math.floor(nowMs / 1000) >= p.e) return { refused: "expired" };
    return { key: p.k };
  }

  private mac(body: string) { return createHmac("sha256", this.macKey).update(`fo-file-link:${body}`).digest("base64url"); }
}
Injectable()(FileLinks);
