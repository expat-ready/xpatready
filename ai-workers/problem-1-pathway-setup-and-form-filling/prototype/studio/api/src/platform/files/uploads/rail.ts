// PF-F2 part 1 (map row 64; R1.64; AG-9-1, AG-9-3, AG-9-4; SA-8-58; batch 5): the platform's one upload rail, on the tus
// protocol (tus.io 1.0.0, P-502) through @tus/server (STANDARDS §1 gate entries 20-21). A dropped connection resumes from
// the server's offset (HEAD, then PATCH at that offset only; a chunk sent at any other offset answers 409, so a repeated
// chunk is stored once). The rules this file keeps:
// 1. The upload id is made here (32 random hex characters) and the firm, door, person and target are kept in the upload's
//    own record (metadata keys xr_*, which a client may never send). Every request but the creation is checked against the
//    session before tus sees it: another firm's or another person's id, a malformed id, or an unknown one answers 404.
// 2. At creation PF-F4 checks the declared Upload-Length and type, then the door's authorize runs; a refusal stages nothing.
// 3. Staged bytes are never served: GET answers 404 (tus serves a staged upload once its last byte is in, before PF-F4 and
//    the scan have judged it) and DELETE too. Bytes reach FilesPort and plat_file only when all have arrived and PF-F4 has
//    passed them (finish), so no stored file is ever half-finished.
// 4. Finish runs once per upload: a retry (an empty PATCH at the end, a lost answer) gets the same file back, never a
//    second file or a second onComplete. A finished upload's record stays until the cleanup, so a HEAD after a lost
//    answer reads "complete" and the client does not send the file again.
// 5. An upload expires 24 hours after it was created (Sample; on this rail's clock): a later request answers 410. The hourly
//    cleanup removes expired ones, finished or not, asking LegalHoldPort first in the firm's transaction (SA-11 BR-7: a
//    hold beats any deletion); a held one is kept and listed.
// Staging: @tus/file-store in a folder of the server's own (PLATFORM_UPLOADS_DIR, else <var>/upload-staging) and tus's
// in-process lock, so it is right only for one API process. The deployment runs two tasks behind a load balancer with no
// stickiness (deploy/cdk/lib/service.ts MIN_TASKS = 2): there (PLATFORM_FILES=s3) the rail is off, every request 503,
// until S3 staging with a shared lock lands (review M1; gate entry 22).
import { randomBytes, createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { AsyncLocalStorage } from "node:async_hooks";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { Server } from "@tus/server";
import { FileStore } from "@tus/file-store";
import type { Upload } from "@tus/utils";
import { HttpException } from "@nestjs/common";
import { FileKeyTaken, type FilesPort } from "../../../../../ports/files.ts";
import type { JobPort } from "../../../../../ports/jobs.ts";
import type { LegalHoldPort } from "../../../../../ports/legal-hold.ts";
import { withFirm } from "../../firm-scope.ts";
import { logPort } from "../../observability/log.ts";
import { checkDeclared, checkFile, correctedName, KINDS, type FileKind, type RefusalReason } from "../file-type.ts";
import { holdSubjectsOf, type UploadContext, type UploadDoor, type UploadDoors, type UploadedFile, type UploadTarget } from "./doors.ts";

export const UPLOADS_PATH = "/api/platform/files/uploads";
/** Sample: an upload (finished or not) is kept in staging for 24 hours after it was created (the row; no source). */
export const UPLOAD_EXPIRY_MS = 24 * 60 * 60 * 1000;
export const UPLOAD_CLEANUP_QUEUE = "platform.files.upload_cleanup", UPLOAD_CLEANUP_CRON = "17 * * * *";
export const RAIL_OFF_WORDS = "Uploads that resume after a dropped connection are not switched on here yet.";
export const EXPIRED_WORDS = "This upload expired: it was not finished within 24 hours. Start it again.";
const ID = /^[0-9a-f]{32}$/;
/** PF-F4's refusal reasons as HTTP statuses (the case doors' table, case-checklist.ts). */
const REFUSAL_STATUS: Record<RefusalReason, number> = { TOO_LARGE: 413, TOO_MANY_PIXELS: 413, NOT_ALLOWED_TYPE: 415, ZIP: 415, MACROS: 415, EMPTY: 400, DAMAGED: 400 };

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
type Refusal = { status_code: number; body: string };
const refusal = (status_code: number, body: string): Refusal => ({ status_code, body: `${body}\n` });
const actorWord = (c: UploadContext) => `${c.door}:${c.actorId}`;
/** The status a thrown answer carries (a refusal, an HttpException), else 500. */
const statusOf = (e: unknown) => e instanceof HttpException ? e.getStatus() : typeof (e as Refusal)?.status_code === "number" ? (e as Refusal).status_code : 500;
const tooLarge = (max: number) => `This file is too large: at most ${Math.round(max / (1024 * 1024))} MB here. Nothing was stored.`;

export type UploadRailDeps = { db: PrismaClient; files: FilesPort; doors: UploadDoors; holds: LegalHoldPort<Tx>; now: () => number; dir?: string; expiryMs?: number; off?: boolean };
export type SweepResult = { removed: number; kept: { uploadId: string; firmId: string; holdIds: string[] }[] };

export class UploadRail {
  readonly store: FileStore;
  readonly tus: Server;
  readonly dir: string;
  readonly expiryMs: number;
  /** Finishes running in this process, by upload id (rule 4: a second finish waits for the first and gets its file). */
  readonly #finishing = new Map<string, Promise<UploadedFile>>();
  /** One request: the session and the upload id the rail checked (the only id tus may act on, break F1). */
  readonly #ctx = new AsyncLocalStorage<{ ctx: UploadContext; id: string | null; headRes?: ServerResponse }>();

  constructor(private readonly d: UploadRailDeps) {
    this.dir = d.dir ?? process.env.PLATFORM_UPLOADS_DIR ?? join(process.env.STUDIO_VAR ?? join(import.meta.dirname, "..", "..", "..", "..", "..", "var"), "upload-staging");
    this.expiryMs = d.expiryMs ?? UPLOAD_EXPIRY_MS;
    this.store = new FileStore({ directory: this.dir, expirationPeriodInMilliseconds: this.expiryMs });
    // Rule 4 (review m4, part 1b): a HEAD of an upload whose bytes are all in finishes it inside tus's own read, under tus's
    // lock (review M1 of #3640: a check before tus raced the last chunk and let tus answer "complete" with no file). Only a
    // HEAD's tus.handle carries headRes, so the rail's own reads and every other method are unchanged. A failure answers its
    // status (a HEAD has no body; the words were the PATCH's), never 200 "complete"; a success names the file.
    const read = this.store.getUpload.bind(this.store);
    this.store.getUpload = async (uploadId: string) => {
      const up = await read(uploadId), res = this.#ctx.getStore()?.headRes;
      if (res && up.size !== undefined && up.offset === up.size) {
        const f = await this.finish(up).catch((e: unknown) => { throw this.#words(e as Error) ?? e; });
        res.setHeader("Upload-File-Id", f.id);
      }
      return up;
    };
    this.tus = new Server({
      path: UPLOADS_PATH, datastore: this.store, relativeLocation: true,   // no maxSize: PF-F4 judges the declared size, in its words; tus refuses bytes past Upload-Length
      allowedOrigins: () => false,   // same origin only: no Access-Control-Allow-Origin
      exposedHeaders: ["Upload-File-Id"],
      namingFunction: () => randomBytes(16).toString("hex"),
      // Break F1: tus reads the id off the whole URL, query included; it acts only on the id the rail checked.
      getFileIdFromRequest: () => this.#ctx.getStore()?.id ?? undefined,
      onResponseError: (_req, err) => this.#words(err),
      onUploadCreate: (_req, upload) => this.#create(upload),
      // No status: tus answers 204 to the last PATCH and 201 (with Location) to a creation that carried every byte.
      onUploadFinish: async (_req, upload) => ({ headers: { "Upload-File-Id": (await this.finish(upload)).id } }),
    });
  }

  /** The route's one call: the session's context, then rule 1 and rule 3, then tus. */
  async handle(ctx: UploadContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = (req.method ?? "").toUpperCase(), path = (req.url ?? "").split("?")[0].replace(/\/+$/, "");
    const id = path === UPLOADS_PATH ? null : path.startsWith(`${UPLOADS_PATH}/`) ? path.slice(UPLOADS_PATH.length + 1) : undefined;
    const answer = (status: number, words: string) => { res.statusCode = status; res.setHeader("Tus-Resumable", "1.0.0"); res.setHeader("Content-Type", "text/plain; charset=utf-8"); res.end(`${words}\n`); };
    // Break F1: no rail URL carries a query string (tus would take an id from it).
    if (this.d.off) return answer(503, RAIL_OFF_WORDS);
    if (id === undefined || (req.url ?? "").includes("?") || method === "GET" || method === "DELETE") return answer(404, "Not found");
    if (method === "POST" ? id !== null : method !== "OPTIONS" && (id === null || !ID.test(id))) return answer(404, "Not found");
    if (id && method !== "OPTIONS") {
      const up = await this.store.getUpload(id).catch(() => null);
      if (!up || up.metadata?.xr_firm !== ctx.firmId.toLowerCase() || up.metadata?.xr_actor !== actorWord(ctx)) return answer(404, "Not found");
      if (this.#expired(up)) return answer(410, EXPIRED_WORDS);
    }
    // A HEAD without Tus-Resumable is tus's 412 and finishes nothing (review n1 of #3640).
    const headRes = method === "HEAD" && id && req.headers["tus-resumable"] ? res : undefined;
    await this.#ctx.run({ ctx, id: id && method !== "OPTIONS" ? id : null, headRes }, () => this.tus.handle(req, res));
  }

  /** Break F3: an answer in plain words, never an internal message. The rail's refusals and tus's own answers (each with a
   *  status) stand; a stored key, a plan limit (PF-15's 409) and anything else are said here, the cause logged. */
  #words(err: Error | { status_code: number; body: string }): Refusal | undefined {
    if ("status_code" in err && typeof err.status_code === "number" && typeof err.body === "string") return undefined;
    if (err instanceof FileKeyTaken) return refusal(409, "This file is already stored.");
    if (err instanceof HttpException) {
      const r = err.getResponse() as { detail?: unknown } | string;
      return refusal(err.getStatus(), typeof r === "object" && typeof r?.detail === "string" ? r.detail : "The upload could not be finished.");
    }
    logPort.error("upload_failed", err, { firmId: this.#ctx.getStore()?.ctx.firmId });
    return refusal(500, "The upload could not be finished. Try again in a moment; what you sent so far is kept.");
  }

  /** Born at xr_born (this rail's clock, kept at creation; tus's own creation_date is the machine's clock). */
  #expired(up: Upload): boolean {
    const born = Number(up.metadata?.xr_born);
    return !Number.isFinite(born) || this.d.now() - born > this.expiryMs;
  }

  /** Rule 2: PF-F4's check on the declared size and type, then the door; the kept metadata is the server's. */
  async #create(upload: Upload) {
    const ctx = this.#ctx.getStore()?.ctx;
    const meta = upload.metadata ?? {};
    if (!ctx) throw refusal(404, "Not found");
    if (Object.keys(meta).some((k) => k.toLowerCase().startsWith("xr_"))) throw refusal(400, "Metadata names starting xr_ are the server's.");
    if (meta.door !== ctx.door) throw refusal(404, "Not found");
    const door = this.d.doors.get(meta.door);
    if (!door) throw refusal(404, "Not found");
    if (upload.sizeIsDeferred || upload.size === undefined) throw refusal(400, "Say the file's size when the upload starts (Upload-Length).");
    const declared = checkDeclared({ size: upload.size, name: meta.filename ?? undefined, mediaType: meta.filetype ?? undefined }, door.allowedKinds);
    if (!declared.ok) throw refusal(REFUSAL_STATUS[declared.reason], declared.message);
    if (door.maxBytes !== undefined && upload.size > door.maxBytes) throw refusal(413, tooLarge(door.maxBytes));
    const target = await door.authorize(ctx, meta);
    if (!target) throw refusal(404, "Not found");
    return { metadata: { ...meta, xr_firm: ctx.firmId.toLowerCase(), xr_door: ctx.door, xr_actor: actorWord(ctx), xr_target: JSON.stringify(target), xr_born: String(this.d.now()) } };
  }

  /** Every byte has arrived: PF-F4 checks them, FilesPort stores them under the door's key, plat_file is written SCANNING
   *  (PF-F3's scan job reads every SCANNING row: the table is its queue) with the door's onComplete in the same transaction,
   *  and the upload's record stays until the cleanup (rule 4). A refusal stores nothing and removes the staging copy (tus
   *  reads nothing of a refused upload after the hook). */
  finish(upload: Upload): Promise<UploadedFile> {
    const running = this.#finishing.get(upload.id);
    if (running) return running;
    const p = this.#finishOnce(upload).finally(() => this.#finishing.delete(upload.id));
    this.#finishing.set(upload.id, p);
    return p;
  }

  async #finishOnce(upload: Upload): Promise<UploadedFile> {
    const meta = upload.metadata ?? {};
    const firmId = meta.xr_firm!, doorName = meta.xr_door as UploadDoor, door = this.d.doors.get(doorName);
    if (!firmId || !door) throw refusal(404, "Not found");
    const target = JSON.parse(meta.xr_target ?? "{}") as UploadTarget;
    const key = this.d.doors.keyFor(doorName, target, upload.id);
    // Rule 4: finished before (a retry, a HEAD): the same file, no second onComplete, and no second read of the bytes.
    const before = await this.#stored(firmId, key, doorName, target, meta.filename ?? undefined);
    if (before) return before;
    const chunks: Buffer[] = [];
    for await (const c of this.store.read(upload.id)) chunks.push(c as Buffer);
    const bytes = new Uint8Array(Buffer.concat(chunks));
    const checked = checkFile({ bytes, name: meta.filename ?? undefined, mediaType: meta.filetype ?? undefined }, door.allowedKinds);
    if (!checked.ok) { await this.store.remove(upload.id); throw refusal(REFUSAL_STATUS[checked.reason], checked.message); }
    if (door.maxBytes !== undefined && bytes.length > door.maxBytes) { await this.store.remove(upload.id); throw refusal(413, tooLarge(door.maxBytes)); }
    const name = checked.name;
    // The door's own checks, before any byte is stored and outside the transaction (review round 1 on #3698): a refusal
    // removes the staging copy; a 5xx keeps it, so a retry checks again.
    if (door.check) {
      try { await door.check(bytes, { firmId, name, mediaType: checked.mediaType, target }); }
      catch (e) { if (statusOf(e) < 500) await this.store.remove(upload.id); throw e; }
    }
    const already = await this.#stored(firmId, key, doorName, target, meta.filename ?? undefined);
    if (already) return already;   // rule 4: finished before (a retry); the same file, no second onComplete
    await this.d.files.put(firmId, key, bytes, checked.mediaType);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    try {
      return await withFirm(firmId, () => this.d.db.$transaction(async (tx) => {
        const row = await tx.platFile.create({ data: { firmId, key, door: doorName, sha256, sizeBytes: bytes.length, mediaType: checked.mediaType }, select: { id: true } });
        const f: UploadedFile = { id: row.id, firmId, key, door: doorName, sha256, sizeBytes: bytes.length, mediaType: checked.mediaType, target, name };
        await door.onComplete?.(tx, f);
        return f;
      }));
    } catch (e) {
      // Another process finished the same upload first (the unique key): its file is this one.
      const other = (e as { code?: string })?.code === "P2002" ? await this.#stored(firmId, key, doorName, target, meta.filename ?? undefined) : null;
      if (other) return other;
      // The bytes are stored but no row names them. A refusal (4xx: the door said no) is final: the key and the staging
      // copy go, so "Nothing was stored." is true. Anything else keeps both for a retry, which stores the same bytes under
      // the same key; an upload never finished is removed with its key by the expiry cleanup (sweep).
      if (statusOf(e) < 500) { await this.d.files.delete(firmId, key).catch(() => undefined); await this.store.remove(upload.id).catch(() => undefined); }
      throw e;
    }
  }

  /** The upload's file if it was stored before (plat_file by its firm and key). */
  /** The name is the client's, corrected from the stored bytes' kind as the first finish did (review m1 of #3640). */
  async #stored(firmId: string, key: string, door: UploadDoor, target: UploadTarget, clientName: string | undefined): Promise<UploadedFile | null> {
    const r = await withFirm(firmId, () => this.d.db.platFile.findUnique({ where: { firmId_key: { firmId, key } }, select: { id: true, sha256: true, sizeBytes: true, mediaType: true } }));
    if (!r) return null;
    const kind = (Object.keys(KINDS) as FileKind[]).find((k) => KINDS[k].mediaType === r.mediaType);
    const name = kind ? correctedName(clientName, kind) : (clientName ?? "document");
    return { id: r.id, firmId, key, door, sha256: r.sha256, sizeBytes: r.sizeBytes, mediaType: r.mediaType, target, name };
  }


  /** Registers the hourly cleanup on PF-14's runner (before it starts). A job of no firm: it reads only the staging folder,
   *  then works as each upload's own firm (withFirm), so it needs no bypass use. */
  async register(jobs: Pick<JobPort, "handle" | "recurring">) {
    await jobs.handle(UPLOAD_CLEANUP_QUEUE, async () => { await this.sweep(); });
    await jobs.recurring(UPLOAD_CLEANUP_QUEUE, UPLOAD_CLEANUP_CRON, "UTC");
  }

  /** The hourly cleanup (rule 5): every expired upload, finished or not, removed unless LegalHoldPort says its firm, person or
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
          // Bytes a failed finish stored that no plat_file row names go with the upload (review round 1 on #3698).
          const door = this.d.doors.get(up.metadata?.xr_door), key = door ? this.d.doors.keyFor(up.metadata!.xr_door as UploadDoor, target, id) : null;
          if (key && !(await tx.platFile.findUnique({ where: { firmId_key: { firmId, key } }, select: { id: true } }))) await this.d.files.delete(firmId, key);
          await this.store.remove(id); out.removed++;
        }));
      } catch (e) { logPort.error("upload_cleanup_failed", e, { firmId }); }
    }
    for (const k of out.kept) logPort.warn("upload_cleanup_kept_held", { firmId: k.firmId, holds: k.holdIds.length });
    return out;
  }
}
