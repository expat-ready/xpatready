// PF-F2 part 1 (map row 64; R1.64; AG-9-1, AG-9-3, AG-9-4; SA-8-58; batch 5): the platform's one upload rail, on the tus
// protocol (tus.io 1.0.0, P-502) through @tus/server (STANDARDS §1 gate entries 20-21). A dropped connection resumes from
// the server's offset (HEAD, then PATCH at that offset only; a chunk sent at any other offset answers 409, so a repeated
// chunk is stored once). The rules this file keeps:
// 1. The upload id is made here (32 random hex characters) and the firm, door, person and target are kept in the upload's
//    own record (metadata keys xr_*, which a client may never send). Every request but the creation is checked against the
//    session before tus sees it: another firm's or another person's id, a malformed id, or an unknown one answers 404.
// 2. At creation PF-F4 checks the declared Upload-Length and type, then the door's authorize runs; a refusal stages nothing.
// 3. A staged upload is never served: GET (tus would stream the staged bytes) and DELETE answer 404. Bytes reach FilesPort
//    and plat_file only when all have arrived and PF-F4 has passed them (finish), so no stored file is ever half-finished.
// 4. An unfinished upload expires 24 hours after it was created (Sample; tus's expiration extension, read on this
//    clock): a later request answers 410. The hourly cleanup removes expired ones, asking LegalHoldPort first in the
//    firm's transaction (SA-11 BR-7: a hold beats any deletion); a held one is kept and listed.
// Staging: @tus/file-store in a folder of the server's own (PLATFORM_UPLOADS_DIR, else <var>/upload-staging); one API task,
// tus's in-process lock. @tus/s3-store (gate entry 22) comes with a shared lock before the API runs a second task.
import { randomBytes, createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { AsyncLocalStorage } from "node:async_hooks";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { Server } from "@tus/server";
import { FileStore } from "@tus/file-store";
import type { Upload } from "@tus/utils";
import type { FilesPort } from "../../../../../ports/files.ts";
import type { JobPort } from "../../../../../ports/jobs.ts";
import type { LegalHoldPort } from "../../../../../ports/legal-hold.ts";
import { withFirm } from "../../firm-scope.ts";
import { logPort } from "../../observability/log.ts";
import { checkDeclared, checkFile, type RefusalReason } from "../file-type.ts";
import { holdSubjectsOf, type UploadContext, type UploadDoor, type UploadDoors, type UploadedFile, type UploadTarget } from "./doors.ts";

export const UPLOADS_PATH = "/api/platform/files/uploads";
/** Sample: an unfinished upload is kept for 24 hours (the row; no source). */
export const UPLOAD_EXPIRY_MS = 24 * 60 * 60 * 1000;
export const UPLOAD_CLEANUP_QUEUE = "platform.files.upload_cleanup", UPLOAD_CLEANUP_CRON = "17 * * * *";
export const EXPIRED_WORDS = "This upload expired: it was not finished within 24 hours. Start it again.";
const ID = /^[0-9a-f]{32}$/;
/** PF-F4's refusal reasons as HTTP statuses (the case doors' table, case-checklist.ts). */
const REFUSAL_STATUS: Record<RefusalReason, number> = { TOO_LARGE: 413, TOO_MANY_PIXELS: 413, NOT_ALLOWED_TYPE: 415, ZIP: 415, MACROS: 415, EMPTY: 400, DAMAGED: 400 };

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
type Refusal = { status_code: number; body: string };
const refusal = (status_code: number, body: string): Refusal => ({ status_code, body: `${body}\n` });
const actorWord = (c: UploadContext) => `${c.door}:${c.actorId}`;

export type UploadRailDeps = { db: PrismaClient; files: FilesPort; doors: UploadDoors; holds: LegalHoldPort<Tx>; now: () => number; dir?: string; expiryMs?: number };
export type SweepResult = { removed: number; kept: { uploadId: string; firmId: string; holdIds: string[] }[] };

export class UploadRail {
  readonly store: FileStore;
  readonly tus: Server;
  readonly dir: string;
  readonly expiryMs: number;
  readonly #ctx = new AsyncLocalStorage<UploadContext>();

  constructor(private readonly d: UploadRailDeps) {
    this.dir = d.dir ?? process.env.PLATFORM_UPLOADS_DIR ?? join(process.env.STUDIO_VAR ?? join(import.meta.dirname, "..", "..", "..", "..", "..", "var"), "upload-staging");
    this.expiryMs = d.expiryMs ?? UPLOAD_EXPIRY_MS;
    this.store = new FileStore({ directory: this.dir, expirationPeriodInMilliseconds: this.expiryMs });
    this.tus = new Server({
      path: UPLOADS_PATH, datastore: this.store, relativeLocation: true,   // no maxSize: PF-F4 judges the declared size, in its words; tus refuses bytes past Upload-Length
      allowedOrigins: () => false,   // same origin only: no Access-Control-Allow-Origin
      exposedHeaders: ["Upload-File-Id"],
      namingFunction: () => randomBytes(16).toString("hex"),
      onUploadCreate: (_req, upload) => this.#create(upload),
      onUploadFinish: async (_req, upload) => ({ status_code: 204, headers: { "Upload-File-Id": (await this.finish(upload)).id } }),
    });
  }

  /** The route's one call: the session's context, then rule 1 and rule 3, then tus. */
  async handle(ctx: UploadContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = (req.method ?? "").toUpperCase(), path = (req.url ?? "").split("?")[0].replace(/\/+$/, "");
    const id = path === UPLOADS_PATH ? null : path.startsWith(`${UPLOADS_PATH}/`) ? path.slice(UPLOADS_PATH.length + 1) : undefined;
    const answer = (status: number, words: string) => { res.statusCode = status; res.setHeader("Tus-Resumable", "1.0.0"); res.setHeader("Content-Type", "text/plain; charset=utf-8"); res.end(`${words}\n`); };
    if (id === undefined || method === "GET" || method === "DELETE") return answer(404, "Not found");
    if (method === "POST" ? id !== null : method !== "OPTIONS" && (id === null || !ID.test(id))) return answer(404, "Not found");
    if (id && method !== "OPTIONS") {
      const up = await this.store.getUpload(id).catch(() => null);
      if (!up || up.metadata?.xr_firm !== ctx.firmId.toLowerCase() || up.metadata?.xr_actor !== actorWord(ctx)) return answer(404, "Not found");
      if (this.#expired(up)) return answer(410, EXPIRED_WORDS);
    }
    await this.#ctx.run(ctx, () => this.tus.handle(req, res));
  }

  /** Born at xr_born (this rail's clock, kept at creation; tus's own creation_date is the machine's clock). */
  #expired(up: Upload): boolean {
    const born = Number(up.metadata?.xr_born);
    return !Number.isFinite(born) || this.d.now() - born > this.expiryMs;
  }

  /** Rule 2: PF-F4's check on the declared size and type, then the door; the kept metadata is the server's. */
  async #create(upload: Upload) {
    const ctx = this.#ctx.getStore();
    const meta = upload.metadata ?? {};
    if (!ctx) throw refusal(404, "Not found");
    if (Object.keys(meta).some((k) => k.toLowerCase().startsWith("xr_"))) throw refusal(400, "Metadata names starting xr_ are the server's.");
    if (meta.door !== ctx.door) throw refusal(404, "Not found");
    const door = this.d.doors.get(meta.door);
    if (!door) throw refusal(404, "Not found");
    if (upload.sizeIsDeferred || upload.size === undefined) throw refusal(400, "Say the file's size when the upload starts (Upload-Length).");
    const declared = checkDeclared({ size: upload.size, name: meta.filename ?? undefined, mediaType: meta.filetype ?? undefined }, door.allowedKinds);
    if (!declared.ok) throw refusal(REFUSAL_STATUS[declared.reason], declared.message);
    const target = await door.authorize(ctx, meta);
    if (!target) throw refusal(404, "Not found");
    return { metadata: { ...meta, xr_firm: ctx.firmId.toLowerCase(), xr_door: ctx.door, xr_actor: actorWord(ctx), xr_target: JSON.stringify(target), xr_born: String(this.d.now()) } };
  }

  /** Every byte has arrived: PF-F4 checks them, FilesPort stores them under the door's key, plat_file is written SCANNING
   *  (PF-F3's scan job reads every SCANNING row: the table is its queue) with the door's onComplete in the same transaction,
   *  and the staging copy is removed. A refusal removes the staging copy and stores nothing. */
  async finish(upload: Upload): Promise<UploadedFile> {
    const meta = upload.metadata ?? {};
    const firmId = meta.xr_firm!, doorName = meta.xr_door as UploadDoor, door = this.d.doors.get(doorName);
    if (!firmId || !door) throw refusal(404, "Not found");
    const target = JSON.parse(meta.xr_target ?? "{}") as UploadTarget;
    const chunks: Buffer[] = [];
    for await (const c of this.store.read(upload.id)) chunks.push(c as Buffer);
    const bytes = new Uint8Array(Buffer.concat(chunks));
    const checked = checkFile({ bytes, name: meta.filename ?? undefined, mediaType: meta.filetype ?? undefined }, door.allowedKinds);
    if (!checked.ok) { await this.store.remove(upload.id); throw refusal(REFUSAL_STATUS[checked.reason], checked.message); }
    const key = this.d.doors.keyFor(doorName, target, upload.id);
    await this.d.files.put(firmId, key, bytes, checked.mediaType);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const file = await withFirm(firmId, () => this.d.db.$transaction(async (tx) => {
      const row = await tx.platFile.create({ data: { firmId, key, door: doorName, sha256, sizeBytes: bytes.length, mediaType: checked.mediaType }, select: { id: true } });
      const f: UploadedFile = { id: row.id, firmId, key, door: doorName, sha256, sizeBytes: bytes.length, mediaType: checked.mediaType, target, name: checked.name };
      await door.onComplete?.(tx, f);
      return f;
    }));
    await this.store.remove(upload.id);
    return file;
  }

  /** Registers the hourly cleanup on PF-14's runner (before it starts). A job of no firm: it reads only the staging folder,
   *  then works as each upload's own firm (withFirm), so it needs no bypass use. */
  async register(jobs: Pick<JobPort, "handle" | "recurring">) {
    await jobs.handle(UPLOAD_CLEANUP_QUEUE, async () => { await this.sweep(); });
    await jobs.recurring(UPLOAD_CLEANUP_QUEUE, UPLOAD_CLEANUP_CRON, "UTC");
  }

  /** The hourly cleanup (rule 4): every expired unfinished upload, removed unless LegalHoldPort says its firm, person or
   *  case is held, each asked in its own firm's transaction (the hold's lock is held until the staging copy is gone). */
  async sweep(): Promise<SweepResult> {
    const out: SweepResult = { removed: 0, kept: [] };
    const ids = (await readdir(this.dir).catch(() => [] as string[])).map((f) => /^([0-9a-f]{32})\.json$/.exec(f)?.[1]).filter((x): x is string => !!x);
    for (const id of ids.sort()) {
      const up = await this.store.getUpload(id).catch(() => null);
      if (!up || !this.#expired(up)) continue;
      const firmId = up.metadata?.xr_firm;
      try {
        if (!firmId) { await this.store.remove(id); out.removed++; continue; }   // never one of ours: no firm, so no hold can name it
        const target = JSON.parse(up.metadata?.xr_target ?? "{}") as UploadTarget;
        await withFirm(firmId, () => this.d.db.$transaction(async (tx) => {
          const held = await this.d.holds.isHeld(tx, firmId, holdSubjectsOf(target));
          if (held.held) { out.kept.push({ uploadId: id, firmId, holdIds: held.holds.map((h) => h.holdId) }); return; }
          await this.store.remove(id); out.removed++;
        }));
      } catch (e) { logPort.error("upload_cleanup_failed", e, { firmId }); }
    }
    for (const k of out.kept) logPort.warn("upload_cleanup_kept_held", { firmId: k.firmId, holds: k.holdIds.length });
    return out;
  }
}
