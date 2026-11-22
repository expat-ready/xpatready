// FO-5f2 item 2 (rows rev 16.15, P-502): the one place docxtemplater runs. docx.ts starts this file as a worker_threads
// worker with resourceLimits and a 5 s timeout per job, so a template built to exhaust memory or time kills this worker
// only; the API process never compiles. docx.ts has already read the zip under its size caps and checked every part
// against the allowlist (item 1) before a job is sent here.
// Item 3: the placeholders come from docxtemplater's own parse: the `postparsed` of every part it compiled (the same
// structure InspectModule's getAllTags reads; InspectModule itself needs lodash, which is not installed, STANDARDS §1).
// Item 4: delimiters are fixed to { } and the change-delimiter syntax is off, so `{=<< >>=}` is an ordinary tag
// (`=<< >>=`) that no placeholder list knows.
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { parentPort } from "node:worker_threads";
import { TAG, UnreadableDocx, scanParts } from "./docx.ts";

export type Job = { id: number; op: "tags" | "render"; bytes: Uint8Array; data?: Record<string, unknown> };
export type Refusal = { code: string; why: string; says?: string };
export type Reply = { id: number; tags?: string[]; bytes?: Uint8Array; error?: Refusal };
type Part = { type: string; value?: string; module?: string; subparsed?: Part[] };

const OPTIONS = {
  paragraphLoop: true, linebreaks: true, errorLogging: false, nullGetter: () => "",
  delimiters: { start: "{", end: "}" }, syntax: { changeDelimiterPrefix: null },
};

const refusal = (code: string, why: string, says?: string): Refusal => ({ code, why: why.slice(0, 300), says });

function compile(bytes: Uint8Array): Docxtemplater {
  try {
    return new Docxtemplater(new PizZip(bytes), OPTIONS);
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (/size mismatch|corrupted|end of data/i.test(msg)) throw refusal("DAMAGED_FILE", msg);   // FO-5f B-20
    const errs = (e as { properties?: { errors?: { properties?: { explanation?: string } }[] } }).properties?.errors ?? [];
    throw refusal("UNREADABLE_FILE", errs.map((x) => x.properties?.explanation).filter(Boolean).join("; ") || msg);
  }
}

/** Flattened like FO-5's list: `client.name`; a loop's name and `<loop>.<field>`; inside a loop `{fees.label}` names the
 *  same field as `{label}` (review m4); a fee field outside the fee loop is marked (it prints nothing there). A raw-XML
 *  tag is `@name` and any other module's tag `module:name`, so neither ever matches a known placeholder. */
function names(parts: Part[], stack: string[], out: Set<string>): void {
  const field = (n: string) => (stack.length && n.startsWith(`${stack.join(".")}.`) ? n : [...stack, n].join("."));
  for (const p of parts) {
    if (p.type !== "placeholder") continue;
    const t = (p.value ?? "").trim();
    if (p.module === "loop") { out.add(field(t)); names(p.subparsed ?? [], [...stack, t], out); continue; }
    if (p.module === "rawxml") out.add(field(`@${t}`));
    else if (p.module) out.add(field(`${p.module}:${t}`));
    else if (t && !stack.length && /^fees\.(label|amount|when|due_on)$/.test(t)) out.add(`${t}-outside-the-fee-loop`);
    else if (t) out.add(field(t));
    if (p.subparsed) names(p.subparsed, stack, out);
  }
}

/** FO-5f's text scan (equations and drawings refused, the tags of each part's text), then docxtemplater's own tags. */
function tags(bytes: Uint8Array): string[] {
  const texts = scanParts(new PizZip(bytes), true);
  const doc = compile(bytes);   // a malformed tag is refused here, after the cheap checks
  const out = new Set<string>();
  const compiled = (doc as unknown as { compiled: Record<string, { postparsed: Part[] }> }).compiled;
  for (const part of Object.values(compiled)) names(part.postparsed, [], out);
  for (const text of texts) {
    const stack: string[] = [];
    for (const m of text.matchAll(TAG)) {
      const t = m[1].trim(), sigil = t[0];
      const field = (n: string) => (stack.length && n.startsWith(`${stack.join(".")}.`) ? n : [...stack, n].join("."));
      if (sigil === "#" || sigil === "^") { const n = t.slice(1).trim(); out.add(n === "conflict.disclosure" || n.startsWith("code.s24_") ? `${n}-as-a-section` : field(n)); stack.push(n); }   // FO-13c (break R2-M1): the disclosure is printed, never a condition; FO-5b: a clause marker is never a section (it would hide the clause)
      else if (sigil === "/") stack.pop();
      else if (t && !stack.length && /^fees\.(label|amount|when|due_on)$/.test(t)) out.add(`${t}-outside-the-fee-loop`);   // prints nothing there (m4)
      else if (t) out.add(field(t));
    }
  }
  return [...out].sort();
}

function handle(job: Job): Reply {
  if (job.op === "tags") return { id: job.id, tags: tags(job.bytes) };
  const doc = compile(job.bytes);
  try { doc.render(job.data ?? {}); } catch (e) { throw refusal("UNREADABLE_FILE", `render: ${(e as Error).message}`); }
  return { id: job.id, bytes: new Uint8Array(doc.getZip().generate({ type: "uint8array", compression: "DEFLATE" })) };
}

if (parentPort) {
  const port = parentPort;
  port.on("message", (job: Job) => {
    let reply: Reply;
    try { reply = handle(job); } catch (e) {
      const r = e as Partial<Refusal>;
      reply = { id: job.id, error: e instanceof UnreadableDocx ? refusal(e.code ?? "UNREADABLE_FILE", e.why, e.says) : r?.code && r.why ? (r as Refusal) : refusal("UNREADABLE_FILE", String((e as Error)?.message ?? e)) };
    }
    if (reply.bytes) port.postMessage(reply, [reply.bytes.buffer as ArrayBuffer]); else port.postMessage(reply);
  });
  port.postMessage({ ready: true });
}
