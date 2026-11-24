// PF-18s part 1 (concept §4 "Add / edit office", challenge M2): add or change an office, a right panel. Name; in Canada or abroad;
// province (the pack's codes from GET offices/provinces) or the country's two-letter code; the time zone shown pre-filled from the
// province as soon as one is picked and editable (AG-16-75 §10: the person confirms or edits it), sent only when the person changed
// it, so the audit keeps "pre-filled from the province". Saved only by Save. Field errors from the 422 on each field; a stale change
// (409) loads the latest and says so.
// PF-31 (EXPERIENCE §2.13): an office's edit is its own address (/platform/offices/:id) and its one shared draft: what is typed
// shows in every view of the office (another workspace tab's list cannot open it twice; another window mirrors it), survives a
// reload, and is saved once with If-Match. Someone else's save first is the conflict state: both values, take theirs or keep mine.
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Field, Input, Notice, Panel, Select } from "@/components/ui/controls";
import { useTabDirty } from "@/components/workspace";
import { ConflictNotice } from "@/lib/sync/conflict";
import { DraftLine, useSharedDraft } from "@/lib/sync/drafts";
import { useToast } from "@/lib/api";
import { allZones } from "@/modules/front-office/booking-public/time";
import { staffApi, StaffApiError } from "../session";
import { Added, fieldErrors, Office, OfficeList, prefill, whereLine, type Province } from "./offices-contract";

type Form = { name: string; inCanada: boolean; province: string; country: string; zone: string; zoneTouched: boolean };
const blank: Form = { name: "", inCanada: true, province: "", country: "", zone: "", zoneTouched: false };
const fromOffice = (o: Office): Form => ({ name: o.name, inCanada: o.countryCode === "CA", province: o.province ?? "", country: o.countryCode === "CA" ? "" : o.countryCode, zone: o.timeZone, zoneTouched: false });
const FIRM_ZONE = "";
/** "Where" is one choice (in Canada + province, or a country): keep mine moves it whole (break M1). */
const WHERE_GROUP = [["inCanada", "province", "country"]] as const;

export function OfficePanel({ open, onOpenChange, office, provinces, returnFocus, onAdded }: { open: boolean; onOpenChange: (o: boolean) => void; /** null: add a new office. */ office: Office | null;
  provinces: readonly Province[]; returnFocus: () => HTMLElement | null; onAdded: (first: boolean) => void }) {
  const qc = useQueryClient(), toast = useToast();
  const base = React.useMemo(() => (office ? fromOffice(office) : undefined), [office]);
  const draft = useSharedDraft<Form>(office ? `platform-office:${office.id}` : null, base, office?.version, ["pf", "offices"]);
  const [local, setLocal] = React.useState<Form>(blank);   // a new office lives in this panel only
  const f = office ? draft.values ?? blank : local, start = office ? draft.base ?? blank : blank, version = draft.version;
  const setF = office ? draft.set : setLocal;
  const mine = office ? draft.mine() : [];   // the details I changed: only these show as "Yours" in a conflict (review M1)
  const [conflict, setConflict] = React.useState<{ latest: Office; message: string } | null>(null);
  const [busy, setBusy] = React.useState(false), [errors, setErrors] = React.useState(fieldErrors(undefined)), [problem, setProblem] = React.useState<string | null>(null);
  const sending = React.useRef(false);
  /** Break m4: after a refusal, focus goes to the first field in error, else to the "Not saved" notice. */
  const focusError = () => requestAnimationFrame(() => { const box = document.getElementById("office-form"); (box?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? box?.querySelector<HTMLElement>("[data-office-problem-box]"))?.focus(); });
  React.useEffect(() => { if (!open) return; if (!office) setLocal(blank); setErrors(fieldErrors(undefined)); setProblem(null); setConflict(null); }, [open, office?.id]);   // eslint-disable-line react-hooks/exhaustive-deps -- a new office, not a new read of it
  const zones = React.useMemo(() => { const all = allZones(); return f.zone && !all.includes(f.zone) ? [f.zone, ...all] : all; }, [f.zone]);
  const set = (p: Partial<Form>) => setF((x) => {
    const n = { ...x, ...p };
    // On add, a new province (or moving abroad) pre-fills the zone again until the person picks one themselves (AG-1-74 rule 2);
    // on edit the zone is never pre-filled again (the service's rule).
    if (!office && (!n.zoneTouched || n.zone === FIRM_ZONE) && ("province" in p || "inCanada" in p)) { n.zone = prefill(provinces, n.inCanada, n.province) ?? FIRM_ZONE; n.zoneTouched = false; }
    return n;
  });
  const dirty = JSON.stringify({ ...f, zoneTouched: false }) !== JSON.stringify({ ...start, zoneTouched: false });
  useTabDirty(open && dirty, () => { if (office) draft.discard(); });
  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (sending.current) return;
    sending.current = true; setBusy(true); setErrors(fieldErrors(undefined)); setProblem(null);
    if (!f.inCanada && /^(ca|canada)$/i.test(f.country.trim())) {   // break m3: Canada typed as a country abroad
      setErrors({ ...fieldErrors(undefined), country: "For an office in Canada, choose In Canada and its province." }); setProblem("Please check the highlighted details.");
      sending.current = false; setBusy(false); focusError(); return;
    }
    const where = f.inCanada ? { country: "CA", province: f.province || null } : { country: f.country.trim(), province: null };
    try {
      if (!office) {
        const a = Added.parse(await staffApi("/platform/offices", { method: "POST", json: { name: f.name, ...where, ...(f.zoneTouched && f.zone ? { timeZone: f.zone } : {}) } }));
        toast.push({ tone: "ok", text: `${a.office.name} added (time zone ${a.office.timeZone}).` });
        onAdded(!!a.first);
      } else {
        const body = { ...(f.name !== start.name ? { name: f.name } : {}), ...(f.inCanada !== start.inCanada || f.province !== start.province || f.country !== start.country ? where : {}), ...(f.zone !== start.zone ? { timeZone: f.zone } : {}) };
        const o = Office.parse(await staffApi(`/platform/offices/${office.id}`, { method: "PATCH", json: body, headers: { "if-match": `"${version}"` } }));
        draft.saved();
        toast.push({ tone: "ok", text: `${o.name} saved.` });
      }
      await qc.invalidateQueries({ queryKey: ["pf", "offices"] });
      onOpenChange(false);
    } catch (x) {
      // A stale change (409): the latest office is read again (the staff client keeps only a problem's plain fields, not its `current`).
      const cur = office && x instanceof StaffApiError && x.status === 409
        ? await staffApi("/platform/offices").then((r) => OfficeList.parse(r)).then((l) => (l.multipleOffices ? l.offices.find((o) => o.id === office.id) ?? null : null)).catch(() => null) : null;
      if (cur && cur.version !== version) {
        setConflict({ latest: cur, message: (x as StaffApiError).message });
        await qc.invalidateQueries({ queryKey: ["pf", "offices"] });
        return;
      } else if (x instanceof StaffApiError && x.status === 409) { setErrors({ ...fieldErrors(undefined), name: x.message }); setProblem(x.message); }   // review m-2: a name in use, on the name field
      else if (x instanceof StaffApiError) { setErrors(fieldErrors(x.problem.fields)); setProblem(x.message); }
      else setProblem("Not saved. Please try again.");
      focusError();
    } finally { sending.current = false; setBusy(false); }
  };
  // Break M1: "Your firm's time zone" is offered only while no province gives a zone; the server would pre-fill the province's zone
  // over an empty choice, so once a province is picked the person confirms its zone or picks a named one.
  const pre = office ? null : prefill(provinces, f.inCanada, f.province);
  const fromProvince = !f.zoneTouched && !office && f.zone ? `Pre-filled from ${f.province}. Change it if this office keeps another time.` : null;
  return (
    <Panel open={open} onOpenChange={onOpenChange} returnFocus={returnFocus} confirmClose={() => { if (!dirty) return true; if (!window.confirm("Discard your changes to this office?")) return false; if (office) draft.discard(); return true; }}
      title={office ? "Edit office" : "Add an office"} description={office ? "Changes apply when you press Save." : "The office keeps its own time zone. Its hours start as the firm's."}
      footer={<><Button variant="ghost" onClick={() => { if (office && dirty) { if (!window.confirm("Discard your changes to this office?")) return; draft.discard(); } onOpenChange(false); }} data-office-close>Close</Button><Button type="submit" form="office-form" busy={busy} disabled={!dirty} data-office-save>{office ? "Save" : "Add office"}</Button></>}>
      <form id="office-form" className="flex flex-col gap-4" onSubmit={(e) => void save(e)} noValidate>
        {conflict ? <ConflictNotice message={conflict.message} onSaved={() => { draft.discard(); setConflict(null); }} onMine={() => { draft.rebase(fromOffice(conflict.latest), conflict.latest.version, WHERE_GROUP); setConflict(null); }}
          rows={[
            ...(mine.includes("name") ? [{ label: "Office name", saved: conflict.latest.name, mine: f.name }] : []),
            ...(mine.some((k) => k === "inCanada" || k === "province" || k === "country") ? [{ label: "Where", saved: whereLine(conflict.latest), mine: whereLine({ countryCode: f.inCanada ? "CA" : f.country.trim().toUpperCase(), province: f.inCanada ? f.province || null : null }) }] : []),
            ...(mine.includes("zone") ? [{ label: "Time zone", saved: conflict.latest.timeZone, mine: f.zone }] : [])]} /> : null}
        {problem ? <div tabIndex={-1} data-office-problem-box className="rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"><Notice tone="danger" title="Not saved"><span data-office-problem>{problem}</span></Notice></div> : null}
        <Field label="Office name" error={errors.name}><Input value={f.name} maxLength={200} onChange={(e) => set({ name: e.target.value })} data-office-name /></Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs font-medium">Where is it?</legend>
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="office-where" checked={f.inCanada} onChange={() => set({ inCanada: true })} data-office-in-canada /> In Canada</label>
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="office-where" checked={!f.inCanada} onChange={() => set({ inCanada: false })} data-office-abroad /> Outside Canada</label>
        </fieldset>
        {f.inCanada ? (
          <Field label="Province or territory" error={errors.province} hint="Canada Post's two-letter code.">
            <Select value={f.province} onChange={(e) => set({ province: e.target.value })} data-office-province>
              <option value="">Not set</option>{provinces.map((p) => <option key={p.code} value={p.code}>{p.code}</option>)}
            </Select>
          </Field>
        ) : (
          <Field label="Country (two-letter code, for example GB)" error={errors.country}><Input value={f.country} maxLength={10} onChange={(e) => set({ country: e.target.value })} data-office-country /></Field>
        )}
        <Field label="Time zone" error={errors.timeZone} hint={fromProvince ?? (f.zone ? undefined : f.inCanada && !f.province ? "Pick a province to pre-fill its time zone, or choose one. Otherwise your firm's time zone is used." : "Choose this office's own time zone. Otherwise your firm's time zone is used.")}>
          <Select value={f.zone} onChange={(e) => setF((x) => ({ ...x, zone: e.target.value, zoneTouched: true }))} data-office-zone>
            {!office && !pre ? <option value={FIRM_ZONE}>Your firm's time zone</option> : null}
            {zones.map((z) => <option key={z} value={z}>{z}</option>)}
          </Select>
        </Field>
        {office ? <DraftLine draft={draft} what="this office" /> : null}
      </form>
    </Panel>
  );
}
