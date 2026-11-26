// FO-5s part 3a (R1.55; concept screens/fo-5s-retainer-signing r2 §4 S5 actions, S6 panels, §5 copy; BR-10, BR-11; AG-5-34,
// AG-5-39): the two panels that end a sent retainer from its page, each naming what happens and confirmed by a button that
// names the action.
//   * Withdraw (key agent/retainer:void; Sent, Viewed or Client signed): a reason (1-200, the server's rule). "The signing
//     link stops working. This cannot be undone." The client is emailed "Agreement withdrawn" by the server (QA-770).
//   * Signed offline (key agent/retainer:offline-sign; Draft to Client signed): the signed PDF (at most 10 MB) and a reason;
//     which version was signed when more than one was sent (FO-5f item 3; default the current one; only the current one
//     once the client signed electronically, AG-5-65). A retainer "makes <client> a client"; a consultation agreement
//     does not (it never makes a client), and the toast follows the server's `prospectWon`.
// Review round 1 (Blocker B1 / Major M1): a panel keeps the version and status it opened on and sends those (the server's
// stale check, break B-24), resets only when it opens, and after a refusal keeps the server's words, the file, the reason
// and the version pick; once the page shows the retainer changed meanwhile, the confirm button is off and the panel says
// to close and open it again. Every rule stays in the API (FO-5's withdraw and signed-offline routes): each refusal is
// shown on its field (focus moves there) or at the top of the panel in the server's words. Typed work is never thrown
// away without asking (Escape, the X, the overlay). Sample words.
import * as React from "react";
import { Button, Field, Notice, Panel, Select, Textarea } from "@/components/ui/controls";
import { problemOf } from "../sales/contract";
import { staffApi, StaffApiError, staffToken } from "../sales/session";
import { Retainer } from "./contract";

export const WITHDRAWABLE = ["SENT", "VIEWED", "CLIENT_SIGNED"];
export const OFFLINE_FROM = ["DRAFT", "SENT", "VIEWED", "CLIENT_SIGNED"];
const REASON_MAX = 200, PDF_MAX = 10 * 1024 * 1024;
const WRAP = "[overflow-wrap:anywhere]";   // a long unbroken name never pushes the panel sideways (break m7)
type Failure = { field: string | null; text: string };
const failureOf = (e: unknown): Failure => e instanceof StaffApiError
  ? { field: Object.keys(e.problem.fields ?? {})[0] ?? null, text: Object.values(e.problem.fields ?? {})[0] ?? e.message }
  : { field: null, text: "Could not save. Please try again." };

/** A multipart call with the bearer token (staffApi sends JSON only); a refusal is a StaffApiError as everywhere. */
async function postForm(path: string, form: FormData): Promise<unknown> {
  const res = await fetch(`/api${path}`, { method: "POST", headers: { authorization: `Bearer ${staffToken()}`, accept: "application/json" }, body: form });
  const text = await res.text(); const data: unknown = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) throw new StaffApiError(res.status, problemOf(data, res.status));
  return data;
}

type Common = { r: Retainer; client: string; open: boolean; onOpenChange: (o: boolean) => void; onDone: (x: Retainer, text: string) => void; onStale: () => void; returnFocus: () => HTMLElement | null };

/** What the panel opened on, kept until it closes; `stale` once the page shows another version or status. */
function useOpenedOn(r: Retainer, open: boolean) {
  const [on, setOn] = React.useState<{ n: number; status: string } | null>(null);
  React.useEffect(() => { setOn(open ? { n: r.version.n, status: r.status } : null); }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps -- only when it opens
  const stale = !!on && (on.n !== r.version.n || on.status !== r.status);
  return { on: on ?? { n: r.version.n, status: r.status }, stale };
}
// Review round 2 m3: the words fit both kinds and do not guess who changed it (a colleague, the client signing, the provider).
const staleWords = (consult: boolean) => `This ${consult ? "agreement" : "retainer"} changed meanwhile (it was saved, sent, signed or ended elsewhere). Close this panel and open it again to see what it is now.`;

export function WithdrawPanel({ r, client, open, onOpenChange, onDone, onStale, returnFocus }: Common) {
  const [reason, setReason] = React.useState(""), [error, setError] = React.useState<Failure | null>(null), [busy, setBusy] = React.useState(false);
  const reasonRef = React.useRef<HTMLTextAreaElement>(null);
  const { on, stale } = useOpenedOn(r, open);
  React.useEffect(() => { if (open) { setReason(""); setError(null); } }, [open]);
  const consult = r.kind === "CONSULTATION";
  const submit = async () => {
    if (!reason.trim()) { setError({ field: "reason", text: "Give a reason for withdrawing." }); reasonRef.current?.focus(); return; }
    setBusy(true);
    try {
      const x = Retainer.parse(await staffApi(`/front-office/retainers/${r.id}/withdraw`, { method: "POST", json: { expectedVersion: on.n, expectedStatus: on.status, reason: reason.trim() } }));
      onOpenChange(false); onDone(x, "Withdrawn. The signing link no longer works.");
    } catch (e) {
      const f = failureOf(e); setError(f);
      if (f.field === "reason") reasonRef.current?.focus();
      if (e instanceof StaffApiError && e.status === 409) onStale();
    } finally { setBusy(false); }
  };
  return (
    <Panel open={open} onOpenChange={onOpenChange} returnFocus={returnFocus} title={consult ? "Withdraw this agreement" : "Withdraw this retainer"} description={`Version ${on.n}, sent to ${client}.`}
      confirmClose={() => !busy && (!reason.trim() || window.confirm("Discard the reason you typed?"))}   // r2 m4: stays open while its request runs
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="destructive" busy={busy} disabled={stale} onClick={() => void submit()} data-confirm-withdraw>Withdraw {consult ? "agreement" : "retainer"}</Button></>}>
      <div className={`flex flex-col gap-3 text-sm ${WRAP}`}>
        <p data-withdraw-says>The signing link stops working. This cannot be undone. {client} is emailed that it was withdrawn{consult ? "." : "; to go on, prepare a new retainer from the prospect."}</p>
        {stale ? <Notice tone="warn" title={staleWords(consult)} /> : null}
        {error && error.field !== "reason" ? <Notice tone="danger" title={error.text} /> : null}
        <Field label="Reason" hint={`Kept with the ${consult ? "agreement" : "retainer"}, at most ${REASON_MAX} characters. ${client} does not see it.`} error={error?.field === "reason" ? error.text : null}>
          <Textarea ref={reasonRef} value={reason} maxLength={REASON_MAX} rows={3} onChange={(e) => { setReason(e.target.value); setError(null); }} />
        </Field>
      </div>
    </Panel>
  );
}

export function SignedOfflinePanel({ r, client, open, onOpenChange, onDone, onStale, returnFocus }: Common) {
  const [reason, setReason] = React.useState(""), [file, setFile] = React.useState<File | null>(null), [error, setError] = React.useState<Failure | null>(null), [busy, setBusy] = React.useState(false);
  const { on, stale } = useOpenedOn(r, open);
  const consult = r.kind === "CONSULTATION";
  // Once the client signed electronically only that version can be recorded (AG-5-65; the server refuses another).
  const choices = on.status === "CLIENT_SIGNED" ? [on.n] : r.versions.filter((v) => (v.sentAt || v.n === on.n) && v.n <= on.n).map((v) => v.n);
  const [signedVersion, setSignedVersion] = React.useState(String(r.version.n));
  const fileRef = React.useRef<HTMLInputElement>(null), reasonRef = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => { if (open) { setReason(""); setFile(null); setError(null); setSignedVersion(String(r.version.n)); if (fileRef.current) fileRef.current.value = ""; } }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps -- only when it opens (review B1)
  const focusOf = (field: string | null) => (field === "file" ? fileRef.current : field === "reason" ? reasonRef.current : null);
  const submit = async () => {
    const stop = (f: Failure) => { setError(f); focusOf(f.field)?.focus(); };
    if (!file) return stop({ field: "file", text: "Upload the signed PDF." });
    if (file.size > PDF_MAX) return stop({ field: "file", text: "At most 10 MB." });
    if (!reason.trim()) return stop({ field: "reason", text: "Give a reason, for example \"Signed at the office\"." });
    setBusy(true);
    try {
      const f = new FormData();
      f.set("expectedVersion", String(on.n)); f.set("reason", reason.trim());
      if (signedVersion !== String(on.n)) f.set("signedVersion", signedVersion);
      f.set("file", file, file.name);
      const data = await postForm(`/front-office/retainers/${r.id}/signed-offline`, f);
      const x = Retainer.parse(data), won = (data as { prospectWon?: unknown })?.prospectWon === true;
      onOpenChange(false); onDone(x, won ? `Recorded as signed on paper. ${client} is now a client.` : "Recorded as signed on paper.");
    } catch (e) {
      const fl = failureOf(e); setError(fl); focusOf(fl.field)?.focus();
      if (e instanceof StaffApiError && e.status === 409) onStale();
    } finally { setBusy(false); }
  };
  const dirty = !!file || !!reason.trim();
  return (
    <Panel open={open} onOpenChange={onOpenChange} returnFocus={returnFocus} title="Record as signed on paper" description={`${consult ? "Consultation agreement" : "Retainer"} for ${client}.`}
      confirmClose={() => !busy && (!dirty || window.confirm("Discard the file and reason you entered?"))}   // r2 m4: stays open while its request runs
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button busy={busy} disabled={stale} onClick={() => void submit()} data-confirm-offline>Record as signed on paper</Button></>}>
      <div className={`flex flex-col gap-3 text-sm ${WRAP}`}>
        <p data-offline-says>{consult
          ? "Marks the consultation agreement Signed offline. No email is sent. This cannot be undone."
          : `Marks the retainer Signed offline and makes ${client} a client. No email is sent. This cannot be undone.`}</p>
        {stale ? <Notice tone="warn" title={staleWords(consult)} /> : null}
        {error && error.field !== "reason" && error.field !== "file" ? <Notice tone="danger" title={error.text} /> : null}
        <Field label="Signed PDF" hint="The scan or file of the signed agreement: a PDF, at most 10 MB." error={error?.field === "file" ? error.text : null}>
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }} />
        </Field>
        {choices.length > 1 ? (
          <Field label="Version signed" hint="The version on the paper. An earlier one is filed as a copy of it; the newer ones stay, marked not signed.">
            <Select value={signedVersion} onChange={(e) => setSignedVersion(e.target.value)}>
              {choices.slice().reverse().map((n) => <option key={n} value={String(n)}>Version {n}{n === on.n ? " (current)" : ""}</option>)}
            </Select>
          </Field>
        ) : null}
        <Field label="Reason" hint={`Kept with the ${consult ? "agreement" : "retainer"}, at most ${REASON_MAX} characters.`} error={error?.field === "reason" ? error.text : null}>
          <Textarea ref={reasonRef} value={reason} maxLength={REASON_MAX} rows={3} onChange={(e) => { setReason(e.target.value); setError(null); }} />
        </Field>
      </div>
    </Panel>
  );
}
