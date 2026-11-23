// PF-F2 part 2 (R1.64; map row 64; AG-9-1 resumable, AG-9-3 per-file progress, AG-9-4 the same path on mobile): the
// browser side of the platform's one upload rail (tus at /api/platform/files/uploads, part 1), through tus-js-client
// (STANDARDS §1 gate entry 23). A dropped connection pauses the upload and it resumes from the server's offset (HEAD,
// then PATCH from there), never from the start. tus-js-client on its own gives up while the browser says it is offline;
// here a failed request is retried on its delays whatever the browser says, and if the delays run out while offline the
// upload waits for the browser's "online" and resumes. Words (CS-D2): "Upload paused: reconnecting", "Resumed, 62%".
// The upload's id is the server's; nothing is kept in the browser's storage (a reload starts the file again).
import { Upload, type DetailedError } from "tus-js-client";

export const UPLOADS_ENDPOINT = "/api/platform/files/uploads";
/** Sample: how long to wait before each retry of a failed request (ms); then wait for "online" if offline. */
export const RETRY_DELAYS = [0, 1000, 3000, 5000, 10000];
/** Sample: bytes per request; a cut loses at most this much. */
export const CHUNK_BYTES = 1024 * 1024;

export type UploadPhase = "uploading" | "paused" | "resumed" | "done" | "failed";
export type UploadState = { phase: UploadPhase; percent: number; fileId?: string; words: string };

/** The words for a state (CS-D2's two; plain progress otherwise; a failure says the server's own words). */
export function uploadWords(phase: UploadPhase, percent: number, failure?: string): string {
  if (phase === "paused") return "Upload paused: reconnecting";
  if (phase === "resumed") return `Resumed, ${percent}%`;
  if (phase === "failed") return failure || "The upload could not be finished.";
  return `${percent}%`;
}

export type ResumableUploadOptions = {
  /** The upload door (part 1's UploadDoors); a staff session uses STAFF. */
  door: "STAFF" | "CLIENT_LINK" | "CLIENT_PORTAL" | "SUPPORT";
  /** The door's own metadata (its authorize reads it), e.g. the case and checklist line. */
  meta?: Record<string, string>;
  /** The session's bearer token, read before every request (a refreshed token is used on resume). */
  token: () => string | null;
  onState: (s: UploadState) => void;
  endpoint?: string;
  chunkSize?: number;
  retryDelays?: number[] | null;
};

const statusOf = (e: unknown): number => (e as DetailedError)?.originalResponse?.getStatus?.() ?? 0;
/** A request that never got an answer, a server error, or a lock: worth retrying. A refusal (4xx) is final. */
const retryable = (status: number) => status === 0 || status >= 500 || status === 409 || status === 423;

/** Starts one file's upload; resolves with the stored file's id (the server's Upload-File-Id), rejects with its words. */
export function resumableUpload(file: File | Blob, o: ResumableUploadOptions): { done: Promise<string>; abort: () => void } {
  let percent = 0, paused = false, resumed = false, stopped = false;
  const tell = (phase: UploadPhase, extra: { fileId?: string; failure?: string } = {}) =>
    o.onState({ phase, percent, ...(extra.fileId ? { fileId: extra.fileId } : {}), words: uploadWords(phase, percent, extra.failure) });
  const name = (file as File).name ?? "upload";
  let upload!: Upload;
  const done = new Promise<string>((resolve, reject) => {
    upload = new Upload(file, {
      endpoint: o.endpoint ?? UPLOADS_ENDPOINT,
      metadata: { ...(o.meta ?? {}), door: o.door, filename: name, filetype: file.type || "application/octet-stream" },
      chunkSize: o.chunkSize ?? CHUNK_BYTES,
      retryDelays: o.retryDelays === undefined ? RETRY_DELAYS : o.retryDelays,
      storeFingerprintForResuming: false,
      onBeforeRequest: (req) => { const t = o.token(); if (t) req.setHeader("Authorization", `Bearer ${t}`); },
      onShouldRetry: (err) => { const r = retryable(statusOf(err)); if (r && !paused) { paused = true; tell("paused"); } return r; },
      onProgress: (sent, total) => {
        percent = total ? Math.floor((sent / total) * 100) : 0;
        if (paused) { paused = false; resumed = true; }
        tell(resumed ? "resumed" : "uploading");   // "Resumed, 62%" stays until the file is done
      },
      onSuccess: ({ lastResponse }) => {
        const fileId = lastResponse.getHeader("Upload-File-Id") ?? "";
        percent = 100; tell("done", { fileId }); resolve(fileId);
      },
      onError: (err) => {
        const status = statusOf(err);
        // Out of retries while the browser is offline: wait for the connection, then resume from the server's offset.
        if (!stopped && retryable(status) && typeof navigator !== "undefined" && navigator.onLine === false) {
          if (!paused) { paused = true; tell("paused"); }
          window.addEventListener("online", () => { if (!stopped) upload.start(); }, { once: true });
          return;
        }
        const failure = (err as DetailedError)?.originalResponse?.getBody?.()?.trim();
        tell("failed", { failure: status && failure ? failure : undefined });
        reject(new Error(uploadWords("failed", percent, status ? failure : undefined)));
      },
    });
    tell("uploading");
    upload.start();
  });
  return { done, abort: () => { stopped = true; void upload.abort(); } };
}
