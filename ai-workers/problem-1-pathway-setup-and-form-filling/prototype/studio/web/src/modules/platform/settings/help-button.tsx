// PF-18s part 2 (concept screens/PF-18s §4 board D, challenge M3 and m4, m6, m7; AG-16-63; R1.92): the "?" in PF-6's frame on every
// staff page, and the "Ask for help" right panel it opens (also opened by Help & support's "Raise a ticket"). One text box, up to three
// files, no priority; the line "We'll note the page you're on: <path>" shows exactly what is noted (the path only, never its query,
// fragment, title or any field). Send is guarded (#2064, challenge M3): a `sending` ref set before the request stops a second click,
// a second Enter on the focused Send or a second submit in the same moment; a failure keeps the text and lets the person try again.
// Plain Enter in the box is a new line, never a send. Hidden by the frame while terms are pending (m6: every route answers 428 there).
import * as React from "react";
import { Link, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Field, Notice, Panel, Textarea } from "@/components/ui/controls";
import { staffApi, StaffApiError } from "../session";
import { BODY_MAX, FILE_TYPES, fieldOf, MAX_FILES, pageOf, Raised } from "./support-contract";

export function RaisePanel({ open, onOpenChange, returnFocus }: { open: boolean; onOpenChange: (o: boolean) => void; returnFocus: () => HTMLElement | null }) {
  const qc = useQueryClient(), loc = useLocation();
  const page = pageOf(loc.pathname);
  const [body, setBody] = React.useState(""), [files, setFiles] = React.useState<File[]>([]);
  const [busy, setBusy] = React.useState(false), [problem, setProblem] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<{ body?: string; files?: string }>({}), [sent, setSent] = React.useState<string | null>(null);
  const sending = React.useRef(false), fileInput = React.useRef<HTMLInputElement>(null), done = React.useRef<HTMLDivElement>(null), box = React.useRef<HTMLTextAreaElement>(null);
  // Break m3: reopened while a send is still on its way, the panel keeps that message and its busy Send.
  React.useEffect(() => { if (open && !sending.current) { setBody(""); setFiles([]); setProblem(null); setErrors({}); setSent(null); } }, [open]);
  React.useEffect(() => { if (sent) done.current?.focus(); }, [sent]);
  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (sending.current) return;   // the double-send guard (#2064, challenge M3): one request in flight per form
    sending.current = true; setBusy(true); setProblem(null); setErrors({});
    const form = new FormData(); form.set("body", body); form.set("page", page); for (const f of files) form.append("files", f);
    try {
      const t = Raised.parse(await staffApi("/platform/support/tickets", { method: "POST", form }));
      setSent(t.id);
      await qc.invalidateQueries({ queryKey: ["pf", "support"] });
    } catch (x) {
      const fields = x instanceof StaffApiError ? x.problem.fields : undefined;
      // Break m7: an upload over the server's limit (413) is the files' problem, said on the field.
      setErrors({ body: fieldOf(fields, "body"), files: fieldOf(fields, "files") ?? (x instanceof StaffApiError && x.status === 413 ? "A file is too large: attach files of 10 MB or less." : undefined) });
      setProblem(x instanceof StaffApiError && x.status < 500 && x.status !== 404 ? x.message : "Not sent. Your message is still here; try again.");
      requestAnimationFrame(() => box.current?.focus());   // m4: Send was disabled while sending, so focus goes back to the box
    } finally { sending.current = false; setBusy(false); }
  };
  const dirty = !sent && (!!body.trim() || files.length > 0);
  const close = () => { if (!dirty || window.confirm("Discard your message?")) onOpenChange(false); };   // break m2: the footer's Close asks too
  return (
    <Panel open={open} onOpenChange={onOpenChange} returnFocus={returnFocus} confirmClose={() => !dirty || window.confirm("Discard your message?")}
      title="Ask for help" description="Tell us what you need. We answer in Help & support."
      footer={sent ? <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        : <><Button variant="ghost" onClick={close}>Close</Button><Button type="submit" form="raise-form" busy={busy} disabled={!body.trim()} data-raise-send>Send</Button></>}>
      {sent ? (
        <div ref={done} tabIndex={-1} className="outline-none" data-raise-sent>
          <Notice tone="ok" title="Ticket sent">We'll answer in Help & support. <Link className="text-text-link underline" to={`/platform/support/${sent}`} onClick={() => onOpenChange(false)} data-raise-open-ticket>Open your ticket</Link></Notice>
        </div>
      ) : (
        <form id="raise-form" className="flex flex-col gap-4" onSubmit={(e) => void send(e)} noValidate>
          {problem ? <Notice tone="danger" title="Not sent"><span data-raise-problem>{problem}</span></Notice> : null}
          <Field label="What do you need help with?" error={errors.body} hint={`At most ${BODY_MAX.toLocaleString("en-CA")} characters. Enter starts a new line.`}>
            <Textarea ref={box} rows={6} value={body} maxLength={BODY_MAX} onChange={(e) => setBody(e.target.value)} aria-invalid={!!errors.body || undefined} data-raise-body />
          </Field>
          <Field label="Attach files (optional)" error={errors.files} hint={`Up to ${MAX_FILES}: PDF, PNG, JPEG or plain text, 10 MB each (Sample limit).`}>
            <input ref={fileInput} type="file" multiple accept={FILE_TYPES} className="text-sm" onChange={(e) => setFiles([...(e.target.files ?? [])])} data-raise-files />
          </Field>
          <p className="text-sm text-text-muted" data-raise-page-line>We'll note the page you're on: <code className="[overflow-wrap:anywhere]" data-raise-page>{page}</code></p>
        </form>
      )}
    </Panel>
  );
}

/** The "?" in the frame's header: a ghost icon button named "Get help with this page". */
export function HelpButton() {
  const [open, setOpen] = React.useState(false), btn = React.useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button ref={btn} variant="ghost" size="sm" aria-label="Get help with this page" title="Get help with this page" onClick={() => setOpen(true)} data-help-button>
        <span aria-hidden className="text-base font-semibold">?</span>
      </Button>
      <RaisePanel open={open} onOpenChange={setOpen} returnFocus={() => btn.current} />
    </>
  );
}
