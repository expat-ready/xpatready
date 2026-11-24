// FO-6ds (concept screens/FO-6ds/concept.md, approved by Lead 18 on #3220; AG-5-61; J-54 W9): the "Signature requests"
// section on the prospect page. Its list (BR-8: every request newest first, status in words, "n of m signed", each signer's
// dates, expiry, downloads) and "Send for signature" (BR-1: request-work, not on a Lost prospect), which opens a right panel:
// a PDF (BR-2, BR-3: the API's checks are final, their words on File), the title (BR-7), who signs (BR-4: people on the
// prospect; no email → disabled), an optional firm signer (BR-5: none by default), Send (BR-6: one request per click).
// BR-10: the request is "Recorded"; no one is emailed until FO-6 part 4's client signing page is live. The prospect page
// only: "from a client" and "from a document" are Not built (the case documents read port is missing).
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Field, Input, Notice, Panel, Pill, Select } from "@/components/ui/controls";
import { useToast } from "@/lib/api";
import { can } from "../sales/contract";
import { useStaff } from "../sales/sales-frame";
import { staffApi, StaffApiError, staffToken } from "../sales/session";
import { LIVE, MAX_MB, NOT_EMAILED, S_KEY, SignatureRequest, SignatureRequests, Signers, statusOf, titleOf } from "./contract";

const DAY = new Intl.DateTimeFormat("en-CA", { day: "numeric", month: "short", year: "numeric" });
const day = (iso: string) => DAY.format(new Date(iso));
const FIELDS = ["file", "title", "signerPersonIds", "firmSignerStaffId"] as const;
type FieldName = (typeof FIELDS)[number];
type Err = { field: FieldName | null; text: string; tone?: "danger" | "warn" };

export function SignatureRequestsSection({ prospectId, name, lost }: { prospectId: string; name: string; lost: boolean }) {
  const me = useStaff(), qc = useQueryClient(), toast = useToast();
  const listKey = ["fo", "signature-requests", prospectId];
  const rows = useQuery({ enabled: can(me, S_KEY.list), queryKey: listKey, retry: false, queryFn: async () => SignatureRequests.parse(await staffApi(`/front-office/signature-requests?prospectId=${encodeURIComponent(prospectId)}`)).requests });
  const [open, setOpen] = React.useState(false), [file, setFile] = React.useState<File | null>(null), [title, setTitle] = React.useState("");
  const [picked, setPicked] = React.useState<string[]>([]), [firm, setFirm] = React.useState(""), [error, setError] = React.useState<Err | null>(null);
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const lock = React.useRef(false), opener = React.useRef<HTMLButtonElement>(null), fileInput = React.useRef<HTMLInputElement>(null);
  const signers = useQuery({ enabled: open, queryKey: ["fo", "signers", prospectId], retry: false, queryFn: async () => Signers.parse(await staffApi(`/front-office/prospects/${prospectId}/signers`)) });
  const withEmail = (signers.data?.people ?? []).filter((p) => p.hasEmail);
  // BR-4: exactly one person with an email is pre-ticked.
  React.useEffect(() => { if (open && withEmail.length === 1) setPicked((x) => (x.length ? x : [withEmail[0].personId])); }, [open, signers.data]);   // eslint-disable-line react-hooks/exhaustive-deps -- once per answer
  React.useEffect(() => { if (focusId && rows.data?.some((r) => r.id === focusId)) { document.querySelector<HTMLElement>(`[data-request="${focusId}"]`)?.focus(); setFocusId(null); } }, [focusId, rows.data]);

  const send = useMutation({
    mutationFn: async () => {
      const f = new FormData();
      f.append("title", title.trim()); f.append("prospectId", prospectId); f.append("signerPersonIds", picked.join(","));
      if (firm) f.append("firmSignerStaffId", firm);
      f.append("file", file!, file!.name);
      return SignatureRequest.parse(await staffApi("/front-office/signature-requests", { method: "POST", form: f }));
    },
    onSuccess: (r) => {
      setOpen(false); setFocusId(r.id);
      toast.push({ tone: "ok", text: `Recorded for signature: ${r.title}. No one is emailed yet.` });
      void qc.invalidateQueries({ queryKey: listKey });
    },
    onError: (e) => {
      void qc.invalidateQueries({ queryKey: listKey });
      if (!(e instanceof StaffApiError)) return setError({ field: null, tone: "warn", text: "We could not confirm the send. Check the list below before sending again." });   // M4: no answer
      if (["SIGNER_NOT_ON_PROSPECT", "SIGNER_NO_EMAIL", "FIRM_SIGNER_NOT_IN_FIRM"].includes(e.problem.code ?? "")) void signers.refetch();
      const field = FIELDS.find((x) => e.field(x)) ?? null;
      if (field) return setError({ field, text: e.field(field)! });
      if (e.status === 403) return setError({ field: null, text: "You cannot send documents for signature. Ask your firm's Owner or Admin." });
      setError({ field: null, text: e.status >= 500 ? "Could not send. Nothing was sent; please try again." : e.message });
    },
    onSettled: () => { lock.current = false; },
  });

  const start = () => { setFile(null); setTitle(""); setPicked([]); setFirm(""); setError(null); setOpen(true); };
  const pick = (f: File | null) => {
    setFile(f); setError(null);
    if (f && f.size > MAX_MB * 1024 * 1024) setError({ field: "file", text: `This file is too large: at most ${MAX_MB} MB.` });
    if (f) setTitle(titleOf(f.name));
  };
  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (lock.current) return;   // BR-6: a double click makes one request
    if (!file) return setError({ field: "file", text: "Choose a PDF to send." });
    if (file.size > MAX_MB * 1024 * 1024) return setError({ field: "file", text: `This file is too large: at most ${MAX_MB} MB.` });
    if (!title.trim()) return setError({ field: "title", text: "Enter a title." });
    if (title.trim().length > 200) return setError({ field: "title", text: "The title has at most 200 characters." });
    if (!picked.length) return setError({ field: "signerPersonIds", text: "Pick at least one person to sign." });
    lock.current = true; setError(null); send.mutate();
  };
  const download = async (r: SignatureRequest, which: "original" | "signed") => {
    try {
      const l = await staffApi<{ url: string }>(`/front-office/signature-requests/${r.id}/download-link`, { method: "POST", json: { file: which } });
      const res = await fetch(l.url, { headers: { authorization: `Bearer ${staffToken()}` } });
      if (res.status === 410) throw new Error("This download link has expired. Try again.");
      if (!res.ok) throw new Error("Could not download the file. Please try again.");
      const a = document.createElement("a"); a.href = URL.createObjectURL(await res.blob()); a.download = `${r.title}${which === "signed" ? " (signed)" : ""}.pdf`; a.click(); URL.revokeObjectURL(a.href);
    } catch (e) { toast.push({ tone: "danger", text: e instanceof StaffApiError ? e.message : e instanceof Error && e.message ? e.message : "Could not download the file. Please try again." }); }
  };

  if (!can(me, S_KEY.list)) return null;
  const maySend = can(me, S_KEY.send) && !lost, mayDownload = can(me, S_KEY.download);
  const nobody = signers.isSuccess && withEmail.length === 0;
  const err = (f: FieldName) => (error?.field === f ? error.text : null);
  return (
    <section aria-labelledby="fo-signature-requests" data-signature-requests className="rounded-xl border border-border bg-surface-raised p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="fo-signature-requests" className="text-sm font-semibold">Signature requests</h2>
        {maySend ? <Button ref={opener} variant="outline" size="sm" className="max-sm:min-h-11" onClick={start}>Send for signature</Button> : null}
      </div>
      {rows.isPending ? <p className="mt-2 text-sm text-text-muted" data-loading>Loading signature requests…</p>
        : rows.isError ? (rows.error instanceof StaffApiError && rows.error.status === 404
          ? <p data-load-error className="mt-2 text-sm text-text-muted">You cannot see this prospect's signature requests.</p>
          : <div data-load-error className="mt-2 flex flex-wrap items-center gap-3 text-sm"><span className="text-text-muted">Could not load the signature requests.</span><Button variant="link" size="sm" onClick={() => void rows.refetch()}>Try again</Button></div>)
          : !rows.data.length ? <p className="mt-2 text-sm text-text-muted" data-empty>No documents sent for signature yet.{maySend ? " Upload a PDF such as an offer letter for this person to sign." : ""}</p>
            : <ul className="mt-3 flex flex-col gap-2">{rows.data.map((r) => <RequestRow key={r.id} r={r} mayDownload={mayDownload} download={download} />)}</ul>}
      <Panel open={open} onOpenChange={setOpen} title="Send for signature" description={`For ${name}. Nothing is recorded until you click Send.`}
        returnFocus={() => (focusId ? document.querySelector<HTMLElement>(`[data-request="${focusId}"]`) : null) ?? opener.current}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button busy={send.isPending} disabled={nobody} className="max-sm:min-h-11" onClick={submit}>{send.isPending ? "Recording…" : "Send"}</Button></>}>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Notice tone="info" title={NOT_EMAILED} />
          {error && !error.field ? <Notice tone={error.tone ?? "danger"} title={error.text} /> : null}
          <Field label="File" hint={file ? `${file.name}, ${(file.size / 1024 / 1024).toFixed(1)} MB` : `PDF, at most ${MAX_MB} MB.`} error={err("file")}>
            <Input ref={fileInput} type="file" accept="application/pdf,.pdf" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          </Field>
          <Field label="Title" error={err("title")}>
            <Input value={title} onChange={(e) => { setTitle(e.target.value.replace(/[\r\n]+/g, " ")); setError(null); }} />
          </Field>
          <fieldset className="flex flex-col gap-2" aria-describedby={err("signerPersonIds") ? "fo-who-error" : undefined}>
            <legend className="mb-1 text-sm font-medium">Who signs</legend>
            {signers.isPending ? <p className="text-sm text-text-muted">Loading the people on this prospect…</p>
              : signers.isError ? <p className="text-sm text-text-danger">Could not load the people on this prospect.</p>
                : signers.data.people.map((p) => (
                  <label key={p.personId} className={`flex min-h-11 items-center gap-2 text-sm ${p.hasEmail ? "" : "text-text-muted"}`}>
                    <input type="checkbox" className="size-4" disabled={!p.hasEmail} checked={picked.includes(p.personId)}
                      onChange={(e) => { setPicked((x) => (e.target.checked ? [...x, p.personId] : x.filter((y) => y !== p.personId))); setError(null); }} />
                    <span>{p.name}{p.hasEmail ? "" : <span className="ml-1 text-xs">No email: add an email first</span>}</span>
                  </label>))}
            {nobody ? <Notice tone="warn" title="No one on this prospect has an email. Add one to the person's record first." /> : null}
            {err("signerPersonIds") ? <p id="fo-who-error" role="alert" className="text-xs text-text-danger">{err("signerPersonIds")}</p> : null}
          </fieldset>
          <Field label="Firm signer (optional)" hint={firm ? "Signs after the clients." : undefined} error={err("firmSignerStaffId")}>
            <Select value={firm} onChange={(e) => { setFirm(e.target.value); setError(null); }}>
              <option value="">No firm signer</option>
              {(signers.data?.firmPeople ?? []).map((s) => <option key={s.staffId} value={s.staffId}>{s.name}</option>)}
            </Select>
          </Field>
          <p className="text-xs text-text-muted">Sending from a client's documents comes later; for now, upload the PDF.</p>
        </form>
      </Panel>
    </section>
  );
}

function RequestRow({ r, mayDownload, download }: { r: SignatureRequest; mayDownload: boolean; download: (r: SignatureRequest, w: "original" | "signed") => void }) {
  const s = statusOf(r), live = LIVE.includes(r.status), past = live && new Date(r.expiresAt).getTime() < Date.now();
  const step = (x: SignatureRequest["signers"][number]) => (x.signedAt ? `signed ${day(x.signedAt)}` : x.declinedAt ? `declined ${day(x.declinedAt)}` : x.viewedAt ? `opened ${day(x.viewedAt)}` : "not signed yet");
  return (
    <li data-request={r.id} tabIndex={-1} className="rounded-lg border border-border p-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_auto] lg:items-start lg:gap-4">
      <div className="min-w-0">
        <h3 className="font-medium [overflow-wrap:anywhere]">{r.title}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Pill tone={s.tone}><span data-status>{s.label}</span></Pill>
          {past ? <span data-expired className="text-xs text-text-warn">Expired on {day(r.expiresAt)}</span> : null}
          <span data-count className="text-xs text-text-muted">{r.signed}</span>
        </div>
        {s.tip ? <p data-tip className="mt-1 text-xs text-text-muted">{s.tip}</p> : null}
      </div>
      <ul className="mt-2 flex flex-col gap-0.5 text-xs lg:mt-0" aria-label={`Signers of ${r.title}`}>
        {r.signers.map((x, i) => <li key={i} className="[overflow-wrap:anywhere]">{x.name}{x.role === "FIRM" ? " (firm)" : ""}: {step(x)}</li>)}
      </ul>
      <p className="mt-2 text-xs text-text-muted lg:mt-0">Recorded {day(r.sentAt)}<br />{past ? null : live ? `Expires ${day(r.expiresAt)}` : r.endedAt ? `Ended ${day(r.endedAt)}` : null}</p>
      {mayDownload ? (
        <div className="mt-2 flex flex-wrap gap-x-3 lg:mt-0 lg:flex-col lg:items-end">
          <Button variant="link" size="sm" aria-label={`Download original: ${r.title}`} onClick={() => download(r, "original")}>Download original</Button>
          {r.status === "SIGNED" && r.evidence ? <Button variant="link" size="sm" aria-label={`Download signed copy: ${r.title}`} onClick={() => download(r, "signed")}>Download signed copy</Button> : null}
        </div>) : null}
    </li>
  );
}
