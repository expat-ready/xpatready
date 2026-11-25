// CS-D1u (R1.64 part 4): a person's documents with no checklist line (a letter of invitation, Sample) on the Documents
// panel, and the staff member's upload of one, on the platform's upload rail (web/src/lib/resumable-upload.ts, door STAFF;
// api/src/documents/staff-door.ts): a dropped connection pauses and resumes from the server's offset, in CS-D2's words
// ("Upload paused: reconnecting", "Resumed, 62%"); a refusal is the server's own words. The rail takes the firm staff
// sign-in (PF-4's bearer session), so with none the sign-in shows inline. The kinds and every rule are the server's.
import { cn } from "@/lib/utils";
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/controls";
import { FoldOut } from "@/components/fold-out";
import { resumableUpload, type ResumableUploadHandle, type UploadState } from "@/lib/resumable-upload";
import { staffToken, useStaffToken } from "@/modules/platform/session";
import { SignInCard } from "@/modules/platform/frame";
import type { StoredDocument } from "../../../contracts/documents";

export type OtherDocument = StoredDocument & { document_type: string; document_name: string };
export type CaseKind = { key: string; name: string };
const when = (at: string) => new Date(at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function OtherDocuments({ caseId, subject, label, docs, kinds, nameOf }: { caseId: string; subject: string; label: string; docs: OtherDocument[]; kinds: CaseKind[]; nameOf: (id: string) => string }) {
  const qc = useQueryClient();
  const token = useStaffToken();
  const input = React.useRef<HTMLInputElement>(null), kind = React.useRef<CaseKind | null>(null), handle = React.useRef<ResumableUploadHandle | null>(null);
  const [state, setState] = React.useState<(UploadState & { kind: string }) | null>(null);
  const [asked, setAsked] = React.useState(false);   // "Add" pressed while signed out: the sign-in shows
  React.useEffect(() => () => handle.current?.abort(), []);
  const busy = state?.phase === "uploading" || state?.phase === "paused" || state?.phase === "resumed";
  // Review m4 on #3698 (WCAG 2.4.3): focus goes back to the Add button after the inline sign-in and when an upload ends;
  // the button stays focusable while busy (aria-disabled, not disabled).
  const buttons = React.useRef(new Map<string, HTMLButtonElement>());
  const back = () => requestAnimationFrame(() => { if (kind.current) buttons.current.get(kind.current.key)?.focus(); });
  React.useEffect(() => { if (token && asked) { setAsked(false); back(); } }, [token, asked]);
  const start = (f: File) => {
    const k = kind.current!;
    handle.current = resumableUpload(f, { door: "STAFF", token: staffToken, meta: { caseId, subjectId: subject, documentType: k.key, filename: f.name, filetype: f.type || "application/octet-stream" },
      onState: (s) => setState({ ...s, kind: k.name }) });
    handle.current.done.then(() => qc.invalidateQueries({ queryKey: ["runtime", "view", caseId] }), () => undefined).finally(back);   // the words say why
  };
  // Review m7 / B9: the current one marked; earlier versions folded, each with when it was replaced.
  const current = docs.filter((d) => d.current), earlier = docs.filter((d) => !d.current);
  const row = (d: OtherDocument) => (
    <li key={d.id} className="px-3 py-2 text-[13px] [overflow-wrap:anywhere]" data-other-document={d.id} data-current={d.current || undefined}>
      <span className="font-medium">{d.document_name}</span> · {d.file_name} · {Math.max(1, Math.round(d.size_bytes / 1024))} KB · {when(d.uploaded_at)} by {nameOf(d.uploaded_by)}{d.current ? " · current" : ` · replaced ${d.superseded_at ? when(d.superseded_at) : ""}`}
    </li>);
  if (!kinds.length && !docs.length) return null;
  return (
    <div className="mt-2" data-other-documents={subject}>
      <p className="text-xs font-medium text-text-muted">Other documents (no checklist line)</p>
      {current.length ? <ul className="mt-1 divide-y divide-border rounded-lg border border-border">{current.map(row)}</ul> : null}
      {earlier.length ? <FoldOut className="mt-1" summaryClassName="inline-flex min-h-6 items-center text-xs text-text-link" summary={`${earlier.length} earlier version${earlier.length === 1 ? "" : "s"}`} data-other-earlier>
        <ul className="mt-1 divide-y divide-border rounded-lg border border-border">{earlier.map(row)}</ul></FoldOut> : null}
      <input ref={input} type="file" className="sr-only" tabIndex={-1} aria-hidden accept="application/pdf,image/jpeg,image/png" data-other-upload-input
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) start(f); }} />
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {kinds.map((k) => <Button key={k.key} size="sm" variant="secondary" className={cn("h-auto min-h-8 max-w-full shrink whitespace-normal py-1 text-left", busy && "cursor-not-allowed opacity-60")} aria-disabled={busy || undefined} data-other-upload={k.key}
          ref={(e) => { if (e) buttons.current.set(k.key, e); else buttons.current.delete(k.key); }}
          onClick={() => { if (busy) return; kind.current = k; if (!staffToken()) { setAsked(true); return; } input.current?.click(); }}>Add {k.name} for {label}…</Button>)}
        {/* Review m5: a refusal is said once, by the alert below; the status stays empty then. */}
        <span role="status" className="text-xs text-text-muted" data-upload-words={state?.phase ?? ""}>{!state || state.phase === "failed" ? "" : state.phase === "done" ? `${state.kind}: uploaded` : `${state.kind}: ${state.words}`}</span>
        {state?.phase === "failed" ? <p role="alert" className="text-xs text-text-danger" data-upload-refused>{state.words}</p> : null}
      </div>
      {asked && !token ? <div className="mt-2 rounded-lg border border-border p-3" data-other-sign-in><p className="mb-2 text-xs text-text-muted">Uploads take your firm staff sign-in.</p><SignInCard embedded /></div> : null}
    </div>
  );
}
