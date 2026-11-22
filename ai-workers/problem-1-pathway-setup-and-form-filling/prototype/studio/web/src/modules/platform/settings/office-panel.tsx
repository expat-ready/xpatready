// PF-18s part 1 (concept §4 "Add / edit office", challenge M2): add or change an office, a right panel. Name; in Canada or abroad;
// province (the pack's codes from GET offices/provinces) or the country's two-letter code; the time zone shown pre-filled from the
// province as soon as one is picked and editable (AG-16-75 §10: the person confirms or edits it), sent only when the person changed
// it, so the audit keeps "pre-filled from the province". Saved only by Save. Field errors from the 422 on each field; a stale change
// (409) loads the latest and says so.
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Field, Input, Notice, Panel, Select } from "@/components/ui/controls";
import { useToast } from "@/lib/api";
import { allZones } from "@/modules/front-office/booking-public/time";
import { staffApi, StaffApiError } from "../session";
import { Added, fieldErrors, Office, prefill, type Province } from "./offices-contract";

type Form = { name: string; inCanada: boolean; province: string; country: string; zone: string; zoneTouched: boolean };
const blank: Form = { name: "", inCanada: true, province: "", country: "", zone: "", zoneTouched: false };
const fromOffice = (o: Office): Form => ({ name: o.name, inCanada: o.countryCode === "CA", province: o.province ?? "", country: o.countryCode === "CA" ? "" : o.countryCode, zone: o.timeZone, zoneTouched: false });
const FIRM_ZONE = "";

export function OfficePanel({ open, onOpenChange, office, provinces, returnFocus, onAdded }: { open: boolean; onOpenChange: (o: boolean) => void; /** null: add a new office. */ office: Office | null;
  provinces: readonly Province[]; returnFocus: () => HTMLElement | null; onAdded: (first: boolean) => void }) {
  const qc = useQueryClient(), toast = useToast();
  const [f, setF] = React.useState<Form>(blank), [start, setStart] = React.useState<Form>(blank);
  const [version, setVersion] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false), [errors, setErrors] = React.useState(fieldErrors(undefined)), [problem, setProblem] = React.useState<string | null>(null);
  const sending = React.useRef(false);
  React.useEffect(() => { if (!open) return; const s = office ? fromOffice(office) : blank; setF(s); setStart(s); setVersion(office?.version ?? null); setErrors(fieldErrors(undefined)); setProblem(null); }, [open, office]);
  const zones = React.useMemo(() => { const all = allZones(); return f.zone && !all.includes(f.zone) ? [f.zone, ...all] : all; }, [f.zone]);
  const set = (p: Partial<Form>) => setF((x) => {
    const n = { ...x, ...p };
    // On add, a new province (or moving abroad) pre-fills the zone again until the person picks one themselves (AG-1-74 rule 2);
    // on edit the zone is never pre-filled again (the service's rule).
    if (!office && !n.zoneTouched && ("province" in p || "inCanada" in p)) n.zone = prefill(provinces, n.inCanada, n.province) ?? FIRM_ZONE;
    return n;
  });
  const dirty = JSON.stringify({ ...f, zoneTouched: false }) !== JSON.stringify({ ...start, zoneTouched: false });
  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (sending.current) return;
    sending.current = true; setBusy(true); setErrors(fieldErrors(undefined)); setProblem(null);
    const where = f.inCanada ? { country: "CA", province: f.province || null } : { country: f.country.trim(), province: null };
    try {
      if (!office) {
        const a = Added.parse(await staffApi("/platform/offices", { method: "POST", json: { name: f.name, ...where, ...(f.zoneTouched && f.zone ? { timeZone: f.zone } : {}) } }));
        toast.push({ tone: "ok", text: `${a.office.name} added (time zone ${a.office.timeZone}).` });
        onAdded(!!a.first);
      } else {
        const body = { version, ...(f.name !== start.name ? { name: f.name } : {}), ...(f.inCanada !== start.inCanada || f.province !== start.province || f.country !== start.country ? where : {}), ...(f.zone !== start.zone ? { timeZone: f.zone } : {}) };
        const o = Office.parse(await staffApi(`/platform/offices/${office.id}`, { method: "PATCH", json: body }));
        toast.push({ tone: "ok", text: `${o.name} saved.` });
      }
      await qc.invalidateQueries({ queryKey: ["pf", "offices"] });
      onOpenChange(false);
    } catch (x) {
      if (x instanceof StaffApiError && x.status === 409 && (x.problem as { current?: unknown }).current) {
        const cur = Office.parse((x.problem as { current: unknown }).current);
        const s = fromOffice(cur); setF(s); setStart(s); setVersion(cur.version);
        setProblem(`${x.message} We've loaded the latest; make your change again and save.`);
        await qc.invalidateQueries({ queryKey: ["pf", "offices"] });
      } else if (x instanceof StaffApiError) { setErrors(fieldErrors(x.problem.fields)); setProblem(x.message); }
      else setProblem("Not saved. Please try again.");
    } finally { sending.current = false; setBusy(false); }
  };
  const fromProvince = !f.zoneTouched && !office && f.zone ? `Pre-filled from ${f.province}. Change it if this office keeps another time.` : null;
  return (
    <Panel open={open} onOpenChange={onOpenChange} returnFocus={returnFocus} confirmClose={() => !dirty || window.confirm("Discard your changes to this office?")}
      title={office ? `Edit ${office.name}` : "Add an office"} description={office ? "Changes apply when you press Save." : "The office keeps its own time zone. Its hours start as the firm's."}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button><Button type="submit" form="office-form" busy={busy} disabled={!dirty} data-office-save>{office ? "Save" : "Add office"}</Button></>}>
      <form id="office-form" className="flex flex-col gap-4" onSubmit={(e) => void save(e)} noValidate>
        {problem ? <Notice tone="danger" title="Not saved"><span data-office-problem>{problem}</span></Notice> : null}
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
        <Field label="Time zone" error={errors.timeZone} hint={fromProvince ?? (f.zone ? undefined : "Your firm's time zone is used unless you choose another.")}>
          <Select value={f.zone} onChange={(e) => setF((x) => ({ ...x, zone: e.target.value, zoneTouched: true }))} data-office-zone>
            {!office ? <option value={FIRM_ZONE}>Your firm's time zone</option> : null}
            {zones.map((z) => <option key={z} value={z}>{z}</option>)}
          </Select>
        </Field>
      </form>
    </Panel>
  );
}
