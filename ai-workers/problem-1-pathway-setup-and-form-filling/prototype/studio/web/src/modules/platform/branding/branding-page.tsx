// PF-13 part 2 (concept screens/PF-13, challenged; AG-1-6, AG-1-9, AG-16-2; P-574 (1); R1.23): My account → Branding, for Owner
// and Admin (agent/settings:edit). Logo, one brand colour, sender name, favicon and banner, with a live preview beside them drawn
// from the values on the form. Nothing is sent while choosing or typing: a chosen image is held in the browser until Save. Save
// sends the changed text values in one request, then each changed image; a refusal is shown on its field in the server's words,
// and what was saved before it is said. Everyone else who opens the address sees a plain refusal and no values.
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Field, Input, Notice } from "@/components/ui/controls";
import { PlatformFrame, usePlatformStaff } from "../frame";
import { endSession, staffApi, StaffApiError, staffToken, useStaffToken } from "../session";
import { Branding, BRANDING_KEY, colourProblem, colourValue, contrastLine, fileProblem, IMAGE_KINDS, IMAGE_LIMITS, KIND_WORDS, listWords, NOT_AN_IMAGE, PublicBranding, sameOrigin, senderProblem, senderValue, SENDER_NAME_MAX, sizeWords, sniff, type ImageKind } from "./contract";
import { BrandingPreview } from "./preview";

/** An image change waiting for Save: a chosen file (held here, with its preview address) or a removal. */
type Pending = { file: File; url: string; mediaType: string } | "removed";
type Draft = { colour?: string; senderName?: string; images: Partial<Record<ImageKind, Pending>> };
type Errors = Partial<Record<"colour" | "senderName" | ImageKind, string>>;
const NONE: Draft = { images: {} };

/** One image by multipart, with the staff token (staffApi sends JSON only). The server's refusal in its own words. */
async function sendImage(kind: ImageKind, p: Pending): Promise<string | null> {
  const token = staffToken();
  const headers: Record<string, string> = { accept: "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) };
  let body: FormData | undefined;
  if (p !== "removed") { body = new FormData(); body.append("file", new Blob([p.file], { type: p.mediaType }), kind); }
  const res = await fetch(`/api/platform/branding/${kind}`, { method: p === "removed" ? "DELETE" : "PUT", headers, body });
  if (res.ok) return null;
  if (res.status === 401 && staffToken() === token) endSession("NOT_SIGNED_IN");
  const data: unknown = await res.json().catch(() => null);
  const detail = data && typeof data === "object" && typeof (data as { detail?: unknown }).detail === "string" ? (data as { detail: string }).detail : null;
  return (detail ?? (res.status >= 500 ? "Something went wrong on our side. Please try again." : `The request was refused (${res.status}).`)).replace(/ Allowed here: PNG and JPEG\. Nothing was stored\.$/, "");
}
/** Whether the browser can draw the file (a file that starts like a PNG but is not one is refused before it is shown). */
const draws = (url: string) => { const i = new Image(); i.src = url; return i.decode().then(() => i.naturalWidth > 0, () => false); };

function ImageField({ kind, saved, pending, error, onChoose, onRemove, onUndo }: { kind: ImageKind; saved: string | null; pending: Pending | undefined; error: string | undefined;
  onChoose: (f: File) => void; onRemove: () => void; onUndo: () => void }) {
  const id = React.useId(), input = React.useRef<HTMLInputElement>(null), w = KIND_WORDS[kind], low = w.label.toLowerCase();
  const shown = pending === "removed" ? null : pending ? pending.url : saved;
  const state = pending === "removed" ? `The ${low} will be removed when you save.` : pending ? `New: ${pending.file.name} (${sizeWords(pending.file.size)}), not saved yet.` : saved ? null : `No ${low} yet.`;
  return (
    <div role="group" aria-labelledby={`${id}-l`} className="flex flex-col gap-1.5" data-image-field={kind}>
      <span id={`${id}-l`} className="text-xs font-medium text-text">{w.label}</span>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white">
          {shown ? <img data-image-thumb src={shown} alt={`${w.label} now on the form`} className="max-h-full max-w-full object-contain" /> : <span aria-hidden className="text-xs text-[#52606d]">None</span>}
        </div>
        <input ref={input} type="file" hidden accept="image/png,image/jpeg" data-image-input={kind}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onChoose(f); }} />
        <Button type="button" variant="outline" size="sm" aria-describedby={error ? `${id}-n ${id}-e` : `${id}-n`} aria-invalid={error ? true : undefined} onClick={() => input.current?.click()} data-image-choose={kind}>Choose a {low} file</Button>
        {pending ? <Button type="button" variant="ghost" size="sm" aria-label={`Undo the ${low} change`} onClick={onUndo} data-image-undo={kind}>Undo</Button>
          : saved ? <Button type="button" variant="ghost" size="sm" aria-label={`Remove the ${low}`} onClick={onRemove} data-image-remove={kind}>Remove</Button> : null}
      </div>
      <p id={`${id}-n`} className="text-xs text-text-muted [overflow-wrap:anywhere]">{w.hint}{state ? <> <span data-image-state={kind}>{state}</span></> : null}</p>
      {error ? <p id={`${id}-e`} role="alert" className="text-xs text-text-danger" data-image-error={kind}>{error}</p> : null}
    </div>
  );
}

function BrandingBody() {
  const me = usePlatformStaff(), token = useStaffToken();
  const allowed = me.keys.includes(BRANDING_KEY);
  const read = useQuery({ queryKey: ["pf", "branding", token], enabled: !!token && allowed, retry: false, queryFn: async () => Branding.parse(await staffApi("/platform/branding")) });
  const firm = useQuery({ queryKey: ["pf", "branding", "firm", me.firmKey], enabled: allowed, retry: false, staleTime: Infinity, queryFn: async () => {
    // The open door, asked as a client's page asks it: no token (it refuses a staff session's).
    const r = await fetch(`/api/public/firms/${encodeURIComponent(me.firmKey)}/branding`, { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(`${r.status}`);
    return PublicBranding.parse(await r.json()).name;
  } });
  const [draft, setDraft] = React.useState<Draft>(NONE), [errors, setErrors] = React.useState<Errors>({});
  const [busy, setBusy] = React.useState(false), [said, setSaid] = React.useState<{ tone: "ok" | "danger" | "info"; text: string } | null>(null);
  const [goodColour, setGoodColour] = React.useState<{ colour: string | null } | null>(null);   // the last colour typed that may be saved, null inside it: the neutral one (the preview keeps it)
  const sending = React.useRef(false), form = React.useRef<HTMLFormElement>(null), urls = React.useRef(new Set<string>());
  React.useEffect(() => { const all = urls.current; return () => { for (const u of all) URL.revokeObjectURL(u); }; }, []);
  const d = read.data;
  const dirty = !!d && ((draft.colour !== undefined && colourValue(draft.colour) !== d.colour) || (draft.senderName !== undefined && senderValue(draft.senderName) !== d.senderName) || Object.keys(draft.images).length > 0);
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const header = (
    <header><h1 className="text-2xl font-semibold">Branding</h1>
      <p className="mt-1 text-sm text-text-muted">How clients see your firm on its pages, emails and documents.</p></header>
  );
  if (!allowed) return <div className="mx-auto flex max-w-5xl flex-col gap-4">{header}<Notice tone="info" title="Not available"><span data-branding-refused>Only an Owner or Admin can change the firm's branding.</span></Notice></div>;
  if (read.error && !d) return <div className="mx-auto flex max-w-5xl flex-col gap-4">{header}<Notice tone="danger" title="Could not load the branding"><span data-branding-error>{read.error instanceof StaffApiError ? read.error.message : "Please reload the page."}</span></Notice></div>;
  if (!d) return <div className="mx-auto flex max-w-5xl flex-col gap-4">{header}<p role="status" className="text-sm text-text-muted" data-loading>Loading the branding…</p></div>;

  const colourTyped = draft.colour ?? d.colour ?? "", senderTyped = draft.senderName ?? d.senderName ?? "";
  const colourNow = colourProblem(colourTyped) ? null : colourValue(colourTyped);
  const previewColour = (colourProblem(colourTyped) ? (goodColour ? goodColour.colour : d.colour) : colourNow) ?? d.neutral.colour;
  const firmName = firm.data ?? "Your firm";
  const savedLink = (k: ImageKind) => (d.images[k] ? sameOrigin(d.images[k]!.link) : null);
  const shown = (k: ImageKind) => { const p = draft.images[k]; return p === "removed" ? null : p ? p.url : savedLink(k); };
  const clearError = (k: keyof Errors) => setErrors((e) => { const n = { ...e }; delete n[k]; return n; });
  const drop = (p: Pending | undefined) => { if (p && p !== "removed") { URL.revokeObjectURL(p.url); urls.current.delete(p.url); } };
  const setImage = (k: ImageKind, p: Pending | undefined) => setDraft((x) => { drop(x.images[k]); const images = { ...x.images }; if (p) images[k] = p; else delete images[k]; return { ...x, images }; });
  const focusError = () => requestAnimationFrame(() => (form.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? form.current?.querySelector<HTMLElement>("[data-branding-said]"))?.focus());

  const typeColour = (v: string) => {
    setDraft((x) => ({ ...x, colour: v })); setSaid(null);
    const why = colourProblem(v);
    if (why) setErrors((e) => ({ ...e, colour: why })); else { clearError("colour"); setGoodColour({ colour: colourValue(v) }); }
  };
  const typeSender = (v: string) => {
    setDraft((x) => ({ ...x, senderName: v })); setSaid(null);
    const why = senderProblem(v);
    if (why) setErrors((e) => ({ ...e, senderName: why })); else clearError("senderName");
  };
  const choose = async (k: ImageKind, f: File) => {
    setSaid(null);
    // Over its limit, the first bytes are enough to refuse it; within it, the whole file is read so its header's size is checked
    // before anything is drawn (challenge M2).
    const bytes = new Uint8Array(await (f.size > IMAGE_LIMITS[k].bytes ? f.slice(0, 12) : f).arrayBuffer());
    let why = fileProblem(k, f.size, bytes);
    const mediaType = sniff(bytes);
    // The preview address is built from the checked bytes with the type read from them, never the file's own, and is used only
    // as an <img> source (challenge m1).
    const url = !why && mediaType ? URL.createObjectURL(new Blob([bytes], { type: mediaType })) : null;
    if (url && !(await draws(url))) { URL.revokeObjectURL(url); why = NOT_AN_IMAGE; }
    if (why || !url || !mediaType) { setErrors((e) => ({ ...e, [k]: why ?? NOT_AN_IMAGE })); return; }   // the form keeps what it had
    urls.current.add(url); clearError(k); setImage(k, { file: f, url, mediaType });
  };
  const discard = () => { for (const k of IMAGE_KINDS) drop(draft.images[k]); setDraft(NONE); setErrors({}); setGoodColour(null); setSaid({ tone: "info", text: "Changes discarded. Nothing was saved." }); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending.current) return;
    const now: Errors = { ...errors };
    const cw = colourProblem(colourTyped), sw = senderProblem(senderTyped);
    if (cw) now.colour = cw; if (sw) now.senderName = sw;
    if (cw || sw) { setErrors(now); setSaid({ tone: "danger", text: "Not saved. Please check the highlighted details." }); focusError(); return; }
    if (!dirty) { setSaid({ tone: "info", text: "Nothing has changed." }); return; }
    sending.current = true; setBusy(true); setSaid(null);
    // Challenge M1: the text values in one request, only when one changed; then each changed image, one after another, carrying
    // on past a refusal; always one read at the end, which is the new starting point. A request whose answer never came may or
    // may not be stored: then the form drops every change and shows what the read holds.
    const done: string[] = [], failed: string[] = [], errs: Errors = {};
    let next: Draft = draft, lost = false;
    try {
      const values: Record<string, string | null> = {};
      if (colourValue(colourTyped) !== d.colour) values.colour = colourValue(colourTyped);
      if (senderValue(senderTyped) !== d.senderName) values.senderName = senderValue(senderTyped);
      const names = Object.keys(values).map((f) => (f === "colour" ? "brand colour" : "sender name"));
      if (names.length) {
        try { await staffApi("/platform/branding", { method: "PUT", json: values }); done.push(...names); next = { images: next.images }; }
        catch (x) {
          if (!(x instanceof StaffApiError)) lost = true;
          else {
            failed.push(...names);
            const fields = x.problem.fields;
            if (fields?.colour) errs.colour = fields.colour;
            if (fields?.senderName) errs.senderName = fields.senderName;
            if (!errs.colour && !errs.senderName) errs[values.colour !== undefined ? "colour" : "senderName"] = x.message;
          }
        }
      } else next = { images: next.images };
      for (const k of IMAGE_KINDS) {
        const p = draft.images[k];
        if (!p) continue;
        if (!staffToken()) { failed.push(k); continue; }   // break: the session ended during the save (a 401): nothing more is sent
        let why: string | null = null;
        try { why = await sendImage(k, p); } catch { lost = true; continue; }
        if (why) { failed.push(k); errs[k] = why; } else { done.push(k); const images = { ...next.images }; delete images[k]; next = { ...next, images }; }
      }
      const fresh = await read.refetch();
      if (lost || fresh.isError) {
        for (const k of IMAGE_KINDS) drop(draft.images[k]);
        setDraft(NONE); setErrors({}); setGoodColour(null);
        setSaid({ tone: "danger", text: fresh.isError ? "Could not confirm every change. Please reload the page to see what is stored." : "Could not confirm every change; the form shows what is stored now." });
        focusError(); return;
      }
      for (const k of IMAGE_KINDS) if (draft.images[k] && !next.images[k]) drop(draft.images[k]);
      setDraft(next); setErrors(errs);
      if (!failed.length) { setGoodColour(null); setSaid({ tone: "ok", text: "Branding saved." }); }
      else { setSaid({ tone: "danger", text: `${done.length ? `Saved: ${listWords(done)}. ` : ""}Not saved: ${listWords(failed)}.` }); focusError(); }
    } finally { sending.current = false; setBusy(false); }
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      {header}
      <div className="grid gap-8 lg:grid-cols-2">
        <form ref={form} className="flex flex-col gap-5" onSubmit={(e) => void save(e)} noValidate data-branding-form>
          {/* Review m5: nothing can be typed or chosen while a Save is on its way (Save itself stays outside, so it keeps focus). */}
          <fieldset disabled={busy} className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0" data-branding-fields>
          {IMAGE_KINDS.slice(0, 1).map((k) => <ImageField key={k} kind={k} saved={savedLink(k)} pending={draft.images[k]} error={errors[k]} onChoose={(f) => void choose(k, f)} onRemove={() => { clearError(k); setSaid(null); setImage(k, "removed"); }} onUndo={() => { clearError(k); setImage(k, undefined); }} />)}
          <div className="flex items-end gap-3">
            <Field label="Brand colour" className="min-w-0 flex-1" error={errors.colour} hint={colourNow ? <span data-colour-line>{contrastLine(colourNow)} At least 4.5:1 is needed.</span> : <span data-colour-line>Not set: the neutral colour {d.neutral.colour} is used. Write a colour as #rrggbb.</span>}>
              <Input value={colourTyped} maxLength={40} spellCheck={false} autoComplete="off" placeholder={d.neutral.colour} onChange={(e) => typeColour(e.target.value)} data-colour-text />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-medium text-text">Pick a colour
              <input type="color" value={colourNow ?? previewColour} onChange={(e) => typeColour(e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-border-strong bg-surface-raised p-0.5" data-colour-pick /></label>
            {colourTyped ? <Button type="button" variant="ghost" size="sm" onClick={() => typeColour("")} data-colour-neutral>Use the neutral colour</Button> : null}
          </div>
          <Field label="Sender name" error={errors.senderName} hint={`The name clients see on your firm's emails, at most ${SENDER_NAME_MAX} characters. Not set: ${firmName}.`}>
            <Input value={senderTyped} maxLength={200} autoComplete="off" onChange={(e) => typeSender(e.target.value)} data-sender-name />
          </Field>
          {IMAGE_KINDS.slice(1).map((k) => <ImageField key={k} kind={k} saved={savedLink(k)} pending={draft.images[k]} error={errors[k]} onChoose={(f) => void choose(k, f)} onRemove={() => { clearError(k); setSaid(null); setImage(k, "removed"); }} onUndo={() => { clearError(k); setImage(k, undefined); }} />)}
          </fieldset>
          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <Button type="submit" busy={busy} data-branding-save>Save</Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => { if (!dirty) setSaid({ tone: "info", text: "Nothing to discard." }); else if (window.confirm("Discard your unsaved branding changes?")) discard(); }} data-branding-discard>Discard changes</Button>
            {dirty ? <span className="text-xs font-medium text-text" data-branding-unsaved>Unsaved changes</span> : null}
          </div>
          <div tabIndex={-1} data-branding-said className="rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" aria-live="polite">
            {said ? <Notice tone={said.tone === "danger" ? "danger" : said.tone === "ok" ? "ok" : "info"}><span data-branding-said-text>{said.text}</span></Notice> : null}
          </div>
        </form>
        <div className="lg:sticky lg:top-4 lg:self-start">
          <BrandingPreview v={{ firmName, senderName: senderValue(senderTyped) ?? firmName, colour: previewColour, logo: shown("logo"), favicon: shown("favicon"), banner: shown("banner") }} />
        </div>
      </div>
    </div>
  );
}

export function BrandingPage() {
  return <PlatformFrame crumbs={[{ label: "Branding" }]}><BrandingBody /></PlatformFrame>;
}
