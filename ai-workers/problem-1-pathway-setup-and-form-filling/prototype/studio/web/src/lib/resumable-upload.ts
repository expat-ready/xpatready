// PF-F2 part 2 (R1.64; map row 64; AG-9-1 resumable, AG-9-3 per-file progress, AG-9-4 the same path on mobile): the
// browser side of the platform's one upload rail (tus at /api/platform/files/uploads, part 1), through tus-js-client
// (STANDARDS §1 gate entry 23). Words (CS-D2): "Upload paused: reconnecting", "Resumed, 62%".
// The rules (review and break round 1 on #3303):
// 1. This file owns the retry loop; tus-js-client makes one attempt at a time (no retries of its own: its own give up
//    while the browser says offline, and its retry count does not reset). A request that got no answer, a 5xx or a
//    423 is tried again on RETRY_DELAYS. A request that got no answer keeps trying every last delay until it works or
//    abort(), whatever navigator.onLine says (the browser's "online" only tries again at once); a server that keeps
//    answering with an error is given the whole list, then its words are shown and the upload kept for retry(). The
//    delays start again only when the server has accepted a chunk (tus-js-client's onChunkComplete, after a 2xx PATCH):
//    bytes the browser sent are not bytes the server kept (review rounds 2 and 3). A request with no progress for
//    STALL_MS is cut and tried again. A request with no answer first checks the file can still be read: a file moved,
//    deleted or changed on disk is said in words, never retried for ever.
// 2. Every attempt after the first resumes the same upload (HEAD, then PATCH from the server's offset), never a new one:
//    a 404 or 410 then is said in words ("expired", "no longer on the server"), never a silent start from 0.
// 3. Done only with the stored file's id (Upload-File-Id). An answer without it (a lost final answer: tus-js-client then
//    reads HEAD) is confirmed with part 1's empty PATCH at the end, which answers with the same file's id or the
//    server's refusal. A refusal (4xx) is final and said in the server's own words (problem+json's detail, or plain text).
// 4. A 401 or 403 keeps the upload: retry() resumes it from its offset once the person has signed in again.
// The upload's address is the server's; nothing is kept in the browser's storage (a reload starts the file again).
import { Upload, type DetailedError } from "tus-js-client";

export const UPLOADS_ENDPOINT = "/api/platform/files/uploads";
/** Sample: wait before each retry (ms); the last is repeated until the upload works or is stopped. */
export const RETRY_DELAYS = [0, 1000, 3000, 5000, 10000];
/** Sample: bytes per request (a cut loses at most this much), and how long a request may make no progress. */
export const CHUNK_BYTES = 1024 * 1024, STALL_MS = 30_000;

export type UploadPhase = "uploading" | "paused" | "resumed" | "done" | "failed";
export type UploadState = { phase: UploadPhase; percent: number; fileId?: string; words: string };

/** The words for a state (CS-D2's two; plain progress otherwise; a failure in the server's own words). */
export function uploadWords(phase: UploadPhase, percent: number, failure?: string): string {
  if (phase === "paused") return "Upload paused: reconnecting";
  if (phase === "resumed") return `Resumed, ${percent}%`;
  if (phase === "failed") return failure || "The upload could not be finished.";
  return `${percent}%`;
}

/** A refusal's words: problem+json's detail (else title), a plain-text body, else words for its status. Never markup. */
export function refusalWords(status: number, body: string | undefined, type: string | null | undefined): string {
  const t = (type ?? "").toLowerCase(), b = (body ?? "").trim();
  if (status === 404) return "This upload is no longer on the server. Start it again.";   // the rail's bare "Not found" says too little
  if (status === 410 && !b) return "This upload expired: it was not finished within 24 hours. Start it again.";   // a HEAD's 410 has no body (break r2-m3)
  if (t.includes("json")) { try { const p = JSON.parse(b) as { detail?: unknown; title?: unknown }; const w = typeof p.detail === "string" ? p.detail : typeof p.title === "string" ? p.title : ""; if (w) return w; } catch { /* below */ } }
  if (t.startsWith("text/plain") && b && b.length <= 500) return b;
  if (status === 401 || status === 403) return "Your session has ended. Sign in again, then try the upload again.";
  return "The upload could not be finished.";
}

export type ResumableUploadOptions = {
  /** The upload door (part 1's UploadDoors); a staff session uses STAFF. */
  door: "STAFF" | "CLIENT_LINK" | "CLIENT_PORTAL" | "SUPPORT";
  /** The door's own metadata (its authorize reads it), e.g. the case and checklist line. */
  meta?: Record<string, string>;
  /** The session's bearer token, read before every request (a new token is used on resume). */
  token: () => string | null;
  onState: (s: UploadState) => void;
  endpoint?: string;
  chunkSize?: number;
  retryDelays?: number[];
  stallMs?: number;
};
/** `done` is the first try's answer; after a refusal, `retry()` resumes the same upload and answers anew. */
export type ResumableUploadHandle = { done: Promise<string>; abort: () => void; retry: () => Promise<string> };

const answered = (status: number) => status > 0;
/** No answer, a server error, a lock, or tus's own offset conflict (a plain-text 409; our refusals are problem+json):
 *  try again. Any other answer is the server's decision. */
const tryAgain = (status: number, type?: string | null) => status === 0 || status >= 500 || status === 423 || (status === 409 && !(type ?? "").includes("json"));

/** Starts one file's upload; `done` resolves with the stored file's id, or rejects with the words shown. */
export function resumableUpload(file: File | Blob, o: ResumableUploadOptions): ResumableUploadHandle {
  const delays = o.retryDelays?.length ? o.retryDelays : RETRY_DELAYS, stallMs = o.stallMs ?? STALL_MS;
  const name = (file as File).name ?? "upload";
  let percent = 0, failures = 0, paused = false, resumed = false, stopped = false, settled = false, succeeded = false;
  let confirming: AbortController | null = null;   // the offset this attempt started from (its first progress): the delays restart only past it
  let url: string | null = null, current: Upload | null = null, timer: ReturnType<typeof setTimeout> | undefined, stall: ReturnType<typeof setTimeout> | undefined;
  let resolve!: (id: string) => void, reject!: (e: Error) => void;
  const answer = () => new Promise<string>((res, rej) => { resolve = res; reject = rej; });
  const done = answer();
  let latest = done;
  const tell = (phase: UploadPhase, extra: { fileId?: string; failure?: string } = {}) =>
    o.onState({ phase, percent, ...(extra.fileId ? { fileId: extra.fileId } : {}), words: uploadWords(phase, percent, extra.failure) });
  const quiet = () => { clearTimeout(timer); clearTimeout(stall); window.removeEventListener("online", now); };
  const finish = (id: string) => { if (settled) return; settled = true; succeeded = true; quiet(); percent = 100; tell("done", { fileId: id }); resolve(id); };
  const refuse = (failure: string) => { if (settled) return; settled = true; quiet(); tell("failed", { failure }); reject(new Error(uploadWords("failed", percent, failure))); };
  const auth = (): Record<string, string> => { const t = o.token(); return t ? { Authorization: `Bearer ${t}` } : {}; };

  /** Rule 1: one more try after the next delay (or at once on "online"). */
  function later() {
    if (settled || stopped) return;
    const wait = delays[Math.min(failures, delays.length - 1)]; failures++;
    clearTimeout(timer); timer = setTimeout(now, wait);
    window.addEventListener("online", now, { once: true });
  }
  function now() { clearTimeout(timer); window.removeEventListener("online", now); if (!settled && !stopped) attempt(); }
  const watch = () => { clearTimeout(stall); stall = setTimeout(() => { if (current && !settled) { void current.abort(); lost(0); } }, stallMs); };

  /** An attempt that ended without the file: try again, or say why not. */
  function lost(status: number, res?: { body?: string; type?: string | null }) {
    current = null; clearTimeout(stall);
    if (settled || stopped) return;
    const words = () => refusalWords(status, res?.body, res?.type);
    if (tryAgain(status, res?.type)) {
      if (answered(status) && failures >= delays.length) return refuse(words());   // rule 1: a lasting server error is said; the upload is kept for retry()
      if (answered(status)) return later();
      if (!paused) { paused = true; tell("paused"); }
      // No answer: the network, or the file itself? A file that cannot be read fails the same way (break R3-m1).
      void file.slice(0, 1).arrayBuffer().then(later, () => refuse("The file could not be read. Choose it again."));
      return;
    }
    refuse(words());   // rule 3, rule 4 (url kept)
  }

  /** Rule 3: the upload is complete but the answer named no file: the empty PATCH at the end asks the server for it. */
  async function confirm() {
    try {
      // One controller and a timer (break R3-M1: AbortSignal.any is missing in part of the build target).
      const ctl = new AbortController(); confirming = ctl;
      const cut = setTimeout(() => ctl.abort(), stallMs);
      const r = await fetch(url!, { method: "PATCH", signal: ctl.signal, headers: { ...auth(), "Tus-Resumable": "1.0.0", "Upload-Offset": String(file.size), "Content-Type": "application/offset+octet-stream" } });
      const body = await r.text().finally(() => clearTimeout(cut));
      const id = r.headers.get("Upload-File-Id");
      if (r.ok && id) return finish(id);
      lost(r.status, { body, type: r.headers.get("Content-Type") });
    } catch (e) {
      // Only a network failure (fetch's TypeError) or our own cut (AbortError) is "no answer"; anything else is a fault said in words.
      if (e instanceof TypeError || (e as { name?: string })?.name === "AbortError") lost(0); else refuse("The upload could not be finished.");
    }
  }

  function attempt() {
    const up = new Upload(file, {
      // Rule 2: once the server has given the upload an address, every attempt resumes it (no endpoint: a 404 or 410
      // on HEAD is an error, never a new upload).
      ...(url ? { uploadUrl: url } : { endpoint: o.endpoint ?? UPLOADS_ENDPOINT }),
      metadata: { ...(o.meta ?? {}), door: o.door, filename: name, filetype: file.type || "application/octet-stream" },
      chunkSize: o.chunkSize ?? CHUNK_BYTES,
      retryDelays: null,   // rule 1: the loop is ours
      storeFingerprintForResuming: false,
      onBeforeRequest: (req) => { for (const [k, v] of Object.entries(auth())) req.setHeader(k, v); },
      onUploadUrlAvailable: () => { url = up.url; },
      onProgress: (sent, total) => {
        watch();
        percent = total ? Math.floor((sent / total) * 100) : 0;
        if (paused) { paused = false; resumed = true; }
        tell(resumed ? "resumed" : "uploading");   // "Resumed, 62%" stays until the file is done
      },
      onChunkComplete: () => { failures = 0; },   // rule 1: the server accepted a chunk (a 2xx PATCH), so the delays start again
      onSuccess: ({ lastResponse }) => {
        clearTimeout(stall); current = null; url = up.url ?? url;
        const id = lastResponse.getHeader("Upload-File-Id");
        if (id) finish(id); else void confirm();
      },
      onError: (err) => {
        const e = err as DetailedError, res = e.originalResponse;
        // No request behind the error: the browser could not read the file (moved, deleted, permission). Not a network fault.
        if (!e.originalRequest) return refuse("The file could not be read. Choose it again.");
        lost(res?.getStatus?.() ?? 0, res ? { body: res.getBody?.(), type: res.getHeader?.("Content-Type") } : undefined);
      },
    });
    current = up; watch(); up.start();
  }

  tell("uploading");
  attempt();
  return {
    done,
    abort: () => { if (settled) return; stopped = true; quiet(); void current?.abort(); confirming?.abort(); refuse("Upload stopped."); },   // break r2-m1: a confirm in flight too
    retry: () => {
      if (stopped || !settled || succeeded) return latest;   // running, stopped, or done: the answer already in hand
      latest = answer(); settled = false; paused = false; failures = 0; attempt();
      return latest;
    },
  };
}
