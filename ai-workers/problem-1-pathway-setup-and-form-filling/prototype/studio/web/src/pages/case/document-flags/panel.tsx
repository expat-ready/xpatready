// CS-D7 (map row 70; AG-9-64): the small panel on a case document where staff set and change its language, translation,
// notarisation and expiry date (api/src/case-document-flags.ts). Every rule is the server's: what a flag reads when not set
// (the document type's cited default), the translation line and the warnings come back from it; a refusal shows the
// server's own words. Keyboard only works: a dialog with native controls, focus back on the line's menu when it closes.
import * as React from "react";
import { api, ApiError, useApi } from "@/lib/api";
import { Button, Dialog, Field, Input, Notice, Select } from "@/components/ui/controls";
import { Skeleton } from "@/components/ui/skeleton";

type FlagState = "NOT_REQUIRED" | "REQUIRED" | "PROVIDED";
export type DocFlags = { language: string | null; language_name: string; translation: FlagState | null; translation_detail: string | null; translation_from: "staff" | "type" | "not_set"; translation_words: string;
  notarisation: FlagState | null; notarisation_detail: string | null; notarisation_from: "staff" | "type" | "not_set"; expires_on: string | null; warnings: string[]; version: number };
type View = { document: { id: string; name: string; file_name: string }; flags: DocFlags; defaults: { source_quote: string | null; source_file: string | null } | null; languages: { code: string; name: string }[];
  translation_line: { label: string; state: string; words: string } | null };
const WORDS: Record<FlagState, string> = { NOT_REQUIRED: "Not required", REQUIRED: "Required", PROVIDED: "Provided" };
const from = (f: "staff" | "type" | "not_set") => (f === "type" ? " (from the document type)" : f === "staff" ? " (set by staff)" : "");

/** The flags dialog for one document. `own` is what staff set (the API's stored values): a select left on "From the
 *  document type" sends null, so the type's default applies again. */
export function DocumentFlagsDialog({ documentId, label, close, done }: { documentId: string; label: string; close: () => void; done: () => Promise<unknown> }) {
  const q = useApi<View>(["runtime", "document-flags", documentId], `/runtime/documents/${documentId}/flags`);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) close(); }} title={`Document flags: ${label}`} description="Language, translation, notarisation and expiry. A flag you leave on the document type's default follows it. Warnings never block.">
      {q.isLoading ? <Skeleton className="h-40 w-full" /> : q.isError ? <Notice tone="danger" title="The flags could not be loaded">{(q.error as Error).message}</Notice>
        : <Form v={q.data!} close={close} done={async () => { await q.refetch(); await done(); }} />}
    </Dialog>
  );
}

function Form({ v, close, done }: { v: View; close: () => void; done: () => Promise<unknown> }) {
  const f = v.flags;
  const own = (x: FlagState | null, src: string) => (src === "staff" && x ? x : "");
  const [language, setLanguage] = React.useState(f.language ?? "");
  const [translation, setTranslation] = React.useState<string>(own(f.translation, f.translation_from));
  const [tDetail, setTDetail] = React.useState(f.translation_detail ?? "");
  const [notarisation, setNotarisation] = React.useState<string>(own(f.notarisation, f.notarisation_from));
  const [nDetail, setNDetail] = React.useState(f.notarisation_detail ?? "");
  const [expires, setExpires] = React.useState(f.expires_on ?? "");
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const sending = React.useRef(false);
  const known = v.languages.some((l) => l.code === language);
  const save = async () => {
    if (sending.current) return; // Enter twice sends one request
    sending.current = true; setBusy(true); setErr(null);
    try {
      await api(`/runtime/documents/${v.document.id}/flags`, { method: "POST", json: { version: f.version, language: language || null, translation: translation || null, translation_detail: tDetail || null,
        notarisation: notarisation || null, notarisation_detail: nDetail || null, expires_on: expires || null } });
      await done(); close();
    } catch (e) { setErr((e as Error).message); if (e instanceof ApiError && e.status === 409) await done(); }
    finally { sending.current = false; setBusy(false); }
  };
  return (
    <form className="space-y-3 text-sm" onSubmit={(e) => { e.preventDefault(); void save(); }} data-flags-form>
      <p className="text-xs text-text-muted [overflow-wrap:anywhere]">{v.document.name} · {v.document.file_name}</p>
      <Field label="Language of the document" hint="Picked by staff. A suggestion from reading the document stays a suggestion.">
        <Select value={known || !language ? language : "__other"} onChange={(e) => setLanguage(e.target.value === "__other" ? language : e.target.value)} data-flag-language>
          <option value="">Not set</option>
          {v.languages.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
          {language && !known ? <option value="__other">{language}</option> : null}
        </Select>
      </Field>
      <fieldset className="space-y-2"><legend className="text-sm font-medium">Translation</legend>
        <p className="text-xs text-text-muted [overflow-wrap:anywhere]" data-flag-translation-now>Now: {f.translation ? WORDS[f.translation] : "not set"}{from(f.translation_from)}. {f.translation_words}</p>
        <Field label="Translation"><Select value={translation} onChange={(e) => setTranslation(e.target.value)} data-flag-translation>
          <option value="">From the document type</option>{(Object.keys(WORDS) as FlagState[]).map((k) => <option key={k} value={k}>{WORDS[k]}</option>)}</Select></Field>
        <Field label="Translation detail" hint="Needed when Provided: who translated it and the affidavit."><Input value={tDetail} onChange={(e) => setTDetail(e.target.value)} maxLength={300} data-flag-translation-detail /></Field>
      </fieldset>
      <fieldset className="space-y-2"><legend className="text-sm font-medium">Notarisation</legend>
        <p className="text-xs text-text-muted" data-flag-notarisation-now>Now: {f.notarisation ? WORDS[f.notarisation] : "not set"}{from(f.notarisation_from)}.</p>
        <Field label="Notarisation"><Select value={notarisation} onChange={(e) => setNotarisation(e.target.value)} data-flag-notarisation>
          <option value="">From the document type</option>{(Object.keys(WORDS) as FlagState[]).map((k) => <option key={k} value={k}>{WORDS[k]}</option>)}</Select></Field>
        <Field label="Notarisation detail" hint="Needed when Provided: who notarised it and when."><Input value={nDetail} onChange={(e) => setNDetail(e.target.value)} maxLength={300} data-flag-notarisation-detail /></Field>
      </fieldset>
      <Field label="Expiry date on the document"><Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} data-flag-expires /></Field>
      {f.warnings.length ? <ul className="space-y-1" data-flag-warnings>{f.warnings.map((w) => <li key={w} className="text-xs font-medium text-text-warn [overflow-wrap:anywhere]">{w}</li>)}</ul> : null}
      {v.defaults?.source_quote ? <p className="text-xs text-text-muted [overflow-wrap:anywhere]" data-flag-source>The document type's defaults: “{v.defaults.source_quote}” ({v.defaults.source_file})</p> : null}
      {err ? <p role="alert" className="text-sm text-text-danger [overflow-wrap:anywhere]" data-flags-error>{err}</p> : null}
      <div className="flex justify-end gap-2 pt-1"><Button type="button" variant="secondary" onClick={close}>Cancel</Button><Button type="submit" busy={busy} data-flags-save>Save flags</Button></div>
    </form>
  );
}
