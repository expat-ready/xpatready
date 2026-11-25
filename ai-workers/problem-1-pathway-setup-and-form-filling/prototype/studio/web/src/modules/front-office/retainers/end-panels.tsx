// FO-5s part 3a (R1.55; concept screens/fo-5s-retainer-signing r2 §4 S5 actions, S6 panels, §5 copy; BR-10, BR-11; AG-5-34,
// AG-5-39): the two panels that end a sent retainer from its page, each naming what happens and confirmed by a button that
// names the action.
//   * Withdraw (key agent/retainer:void; Sent, Viewed or Client signed): a reason (1-200, the server's rule). "The signing
//     link stops working. This cannot be undone." The client is emailed "Agreement withdrawn" by the server (QA-770).
//   * Signed offline (key agent/retainer:offline-sign; Draft to Client signed): the signed PDF (at most 10 MB) and a reason;
//     which version was signed when more than one was sent (FO-5f item 3; default the current one). "Marks the retainer
//     Signed offline and makes <client> a client. No email is sent."
// Every rule stays in the API (FO-5's withdraw and signed-offline routes): each refusal is shown on its field or at the top
// of the panel in the server's words, and a 409 re-reads the retainer (a colleague changed it). Sample words.
import * as React from "react";
import { Button, Field, Notice, Panel, Select, Textarea } from "@/components/ui/controls";
import { problemOf } from "../sales/contract";
import { staffApi, StaffApiError, staffToken } from "../sales/session";
import { Retainer } from "./contract";

export const WITHDRAWABLE = ["SENT", "VIEWED", "CLIENT_SIGNED"];
export const OFFLINE_FROM = ["DRAFT", "SENT", "VIEWED", "CLIENT_SIGNED"];
const REASON_MAX = 200, PDF_MAX = 10 * 1024 * 1024;
type Failure = { field: string | null; text: string };
const failureOf = (e: unknown): Failure => e instanceof StaffApiError
  ? { field: Object.keys(e.problem.fields ?? {})[0] ?? null, text: Object.values(e.problem.fields ?? {})[0] ?? e.message }
  : { field: null, text: "Could not save. Please try again." };

/** A multipart call with the bearer token (staffApi sends JSON only); a refusal is a StaffApiError as everywhere. */
async function postForm(path: string, form: FormData) {
  const res = await fetch(`/api${path}`, { method: "POST", headers: { authorization: `Bearer ${staffToken()}`, accept: "application/json" }, body: form });
  const text = await res.text(); const data: unknown = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) throw new StaffApiError(res.status, problemOf(data, res.status));
  return data;
}

type Common = { r: Retainer; client: string; open: boolean; onOpenChange: (o: boolean) => void; onDone: (x: Retainer, text: string) => void; onStale: () => void; returnFocus: () => HTMLElement | null };

export function WithdrawPanel({ r, client, open, onOpenChange, onDone, onStale, returnFocus }: Common) {
  const [reason, setReason] = React.useState(""), [error, setError] = React.useState<Failure | null>(null), [busy, setBusy] = React.useState(false);
  const reasonRef = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => { if (open) { setReason(""); setError(null); } }, [open]);
  const submit = async () => {
    if (!reason.trim()) { setError({ field: "reason", text: "Give a reason for withdrawing." }); reasonRef.current?.focus(); return; }
    setBusy(true);
    try {
      const x = Retainer.parse(await staffApi(`/front-office/retainers/${r.id}/withdraw`, { method: "POST", json: { expectedVersion: r.version.n, expectedStatus: r.status, reason: reason.trim() } }));
      onOpenChange(false); onDone(x, "Withdrawn. The signing link no longer works.");
    } catch (e) {
      setError(failureOf(e));
      if (e instanceof StaffApiError && e.status === 409) onStale();
    } finally { setBusy(false); }
  };
  return (
    <Panel open={open} onOpenChange={onOpenChange} returnFocus={returnFocus} title="Withdraw this retainer" description={`Version ${r.version.n}, sent to ${client}.`}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="destructive" busy={busy} onClick={() => void submit()} data-confirm-withdraw>Withdraw retainer</Button></>}>
      <div className="flex flex-col gap-3 text-sm">
        <p data-withdraw-says>The signing link stops working. This cannot be undone. {client} is emailed that it was withdrawn; to go on, prepare a new retainer from the prospect.</p>
        {error && error.field !== "reason" ? <Notice tone="danger" title={error.text} /> : null}
        <Field label="Reason" hint={`Kept with the retainer, at most ${REASON_MAX} characters. ${client} does not see it.`} error={error?.field === "reason" ? error.text : null}>
          <Textarea ref={reasonRef} value={reason} maxLength={REASON_MAX} rows={3} onChange={(e) => { setReason(e.target.value); setError(null); }} />
        </Field>
      </div>
    </Panel>
  );
}

export function SignedOfflinePanel({ r, client, open, onOpenChange, onDone, onStale, returnFocus }: Common) {
  const [reason, setReason] = React.useState(""), [file, setFile] = React.useState<File | null>(null), [error, setError] = React.useState<Failure | null>(null), [busy, setBusy] = React.useState(false);
  const sent = r.versions.filter((v) => v.sentAt || v.n === r.version.n).map((v) => v.n);
  const [signedVersion, setSignedVersion] = React.useState(String(r.version.n));
  const fileRef = React.useRef<HTMLInputElement>(null), reasonRef = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => { if (open) { setReason(""); setFile(null); setError(null); setSignedVersion(String(r.version.n)); if (fileRef.current) fileRef.current.value = ""; } }, [open, r.version.n]);
  const submit = async () => {
    const stop = (f: Failure, el: HTMLElement | null) => { setError(f); el?.focus(); };
    if (!file) return stop({ field: "file", text: "Upload the signed PDF." }, fileRef.current);
    if (file.size > PDF_MAX) return stop({ field: "file", text: "At most 10 MB." }, fileRef.current);
    if (!reason.trim()) return stop({ field: "reason", text: "Give a reason, for example \"Signed at the office\"." }, reasonRef.current);
    setBusy(true);
    try {
      const f = new FormData();
      f.set("expectedVersion", String(r.version.n)); f.set("reason", reason.trim());
      if (signedVersion !== String(r.version.n)) f.set("signedVersion", signedVersion);
      f.set("file", file, file.name);
      const x = Retainer.parse(await postForm(`/front-office/retainers/${r.id}/signed-offline`, f));
      onOpenChange(false); onDone(x, `Recorded as signed on paper. ${client} is now a client.`);
    } catch (e) {
      setError(failureOf(e));
      if (e instanceof StaffApiError && e.status === 409) onStale();
    } finally { setBusy(false); }
  };
  return (
    <Panel open={open} onOpenChange={onOpenChange} returnFocus={returnFocus} title="Record as signed on paper" description={`Retainer for ${client}.`}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button busy={busy} onClick={() => void submit()} data-confirm-offline>Record as signed on paper</Button></>}>
      <div className="flex flex-col gap-3 text-sm">
        <p data-offline-says>Marks the retainer Signed offline and makes {client} a client. No email is sent. This cannot be undone.</p>
        {error && error.field !== "reason" && error.field !== "file" ? <Notice tone="danger" title={error.text} /> : null}
        <Field label="Signed PDF" hint="The scan or file of the signed agreement: a PDF, at most 10 MB." error={error?.field === "file" ? error.text : null}>
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }} />
        </Field>
        {sent.length > 1 ? (
          <Field label="Version signed" hint="The version on the paper. An earlier one is filed as a copy of it; the newer ones stay, marked not signed.">
            <Select value={signedVersion} onChange={(e) => setSignedVersion(e.target.value)}>
              {sent.slice().reverse().map((n) => <option key={n} value={String(n)}>Version {n}{n === r.version.n ? " (current)" : ""}</option>)}
            </Select>
          </Field>
        ) : null}
        <Field label="Reason" hint={`Kept with the retainer, at most ${REASON_MAX} characters.`} error={error?.field === "reason" ? error.text : null}>
          <Textarea ref={reasonRef} value={reason} maxLength={REASON_MAX} rows={3} onChange={(e) => { setReason(e.target.value); setError(null); }} />
        </Field>
      </div>
    </Panel>
  );
}
