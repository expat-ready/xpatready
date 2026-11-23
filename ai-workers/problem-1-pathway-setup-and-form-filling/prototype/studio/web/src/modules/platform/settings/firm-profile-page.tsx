// PF-5s S5 (R1.92; AG-01 §3.1 "language and timezone pickers", AG01-29(7), AG-1-65; Lead 6's ruling: the IANA zone picker): My account
// → Firm profile, over PF-5fp's `GET|PUT /api/platform/firm/profile`. Every role holding agent/settings:list reads it.
//   * The firm (legal name, trading name, country, web address): read-only, changed by ExpatReady support.
//   * Contact and defaults (public phone, public email, website, language, time zone, currency): Owner and Admin edit on the page;
//     everyone else reads them.
//   * Billing email: the Owner edits it; an Admin reads it; others never see it (the API sends null to them).
//   * Business address: shown to Owner and Admin, changed on Plan and billing (one place, used for tax).
// One form and one Save: the profile has one version, so one save sends it with only the changed fields. A stale version (409)
// reloads the latest into the form and says so; a refusal (422) shows each field's words on its field.
// Deviation from the concept (screens/pf-5s-saas/concept.md S5, "edit in a right panel per section"; accepted by the reviewer):
// EXPERIENCE §2.3's drawer keeps a page's scroll, filters and selection; this page has one record and seven fields, none of that to
// keep, so one inline form with one Save is fewer steps. The concept's trial summary line is Plan and billing's (recorded in the PR).
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button, Field, Input, Notice, Select } from "@/components/ui/controls";
import { useToast } from "@/lib/api";
import { allZones } from "@/modules/front-office/booking-public/time";
import { PlatformFrame, usePlatformStaff } from "../frame";
import { staffApi, StaffApiError, useStaffToken } from "../session";
import { addressLines, changedWords, changesOf, countryName, CURRENCIES, currencyWord, fieldErrors, formOf, isDirty, keepEdits, LABELS, LANGUAGES, languageWord, otherErrors, Profile, PROFILE_ADMIN_KEY, PROFILE_READ_KEY, Saved, WORDS, type FieldName, type Form } from "./firm-profile-contract";

const BILLING_KEY = "agent/subscription-invoice:view";

function Section({ id, title, note, children }: { id: string; title: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-3 rounded-xl border border-border bg-surface-raised p-5" data-profile-section={id}>
      <div><h2 id={`${id}-h`} className="text-base font-semibold">{title}</h2>{note ? <p className="mt-0.5 text-sm text-text-muted">{note}</p> : null}</div>
      {children}
    </section>
  );
}
const Facts = ({ rows }: { rows: [string, React.ReactNode, string?][] }) => (
  <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
    {rows.map(([k, v, data]) => <div key={k} className="min-w-0"><dt className="text-xs font-medium text-text-muted">{k}</dt><dd className="text-sm [overflow-wrap:anywhere]" data-profile-value={data ?? k}>{v}</dd></div>)}
  </dl>
);
const none = (v: string | null | undefined, word = "Not set") => (v ? v : <span className="text-text-muted">{word}</span>);

function ProfileBody() {
  const me = usePlatformStaff(), token = useStaffToken(), qc = useQueryClient(), toast = useToast();
  const allowed = me.keys.includes(PROFILE_READ_KEY), admin = me.keys.includes(PROFILE_ADMIN_KEY);
  const key = ["pf", "firm-profile", token];
  const q = useQuery({ queryKey: key, enabled: !!token && allowed, retry: false, queryFn: async () => Profile.parse(await staffApi("/platform/firm/profile")) });
  const [start, setStart] = React.useState<Form | null>(null), [f, setF] = React.useState<Form | null>(null), [version, setVersion] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Partial<Record<FieldName, string>>>({}), [problem, setProblem] = React.useState<{ tone: "danger" | "warn"; title: string; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const sending = React.useRef(false), problemBox = React.useRef<HTMLDivElement>(null), saveButton = React.useRef<HTMLButtonElement>(null);
  /** The form as it is now, for a save that returns while the person keeps typing. */
  const now = React.useRef<Form | null>(null); now.current = f;
  const dirtyNow = !!f && !!start && isDirty(start, f);
  // Break m2: leaving or reloading with unsaved changes asks first (as Branding and Notifications do).
  React.useEffect(() => {
    if (!dirtyNow) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyNow]);
  /** Load a profile into the form (first read, after a save, after a 409). */
  const load = React.useCallback((p: Profile) => { const s = formOf(p); setStart(s); setF(s); setVersion(p.version); }, []);
  React.useEffect(() => { if (q.data && version === null) load(q.data); }, [q.data, version, load]);
  const zones = React.useMemo(() => { const all = allZones(); return f?.timeZone && !all.includes(f.timeZone) ? [f.timeZone, ...all] : all; }, [f?.timeZone]);
  // Where the focus goes once a save has answered, run after the render that shows the answer (an effect on a counter): a
  // requestAnimationFrame asked before that render could run first, while Save was still disabled and the refused fields
  // not yet marked, and leave the focus on the page (FP3 red on a busy machine: CI shard 18, and 3 of 3 at 30x CPU throttle).
  // "problem": the first refused field, else the notice. "save": back on Save when the busy button dropped it (break m7).
  const [focusAsk, setFocusAsk] = React.useState<{ n: number; to: "problem" | "save" }>({ n: 0, to: "save" });
  React.useEffect(() => {
    if (!focusAsk.n) return;
    if (focusAsk.to === "save") { if (document.activeElement === document.body || document.activeElement === null) saveButton.current?.focus(); return; }
    const box = document.getElementById("profile-form");
    (box?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? problemBox.current)?.focus();
  }, [focusAsk]);

  const header = (
    <header>
      <h1 tabIndex={-1} className="text-2xl font-semibold outline-none">Firm profile</h1>
      <p className="mt-1 text-sm text-text-muted">{WORDS.intro}</p>
    </header>
  );
  const wrap = (body: React.ReactNode) => <div className="mx-auto flex max-w-3xl flex-col gap-5">{header}{body}</div>;
  if (!allowed) return wrap(<Notice tone="info" title="Not available"><span data-profile-refused>Your role does not include the firm's settings.</span></Notice>);
  if (q.isError) return wrap(<Notice tone="danger" title="Could not load the firm profile"><span data-profile-error>{q.error instanceof StaffApiError ? q.error.message : "Please reload the page."}</span></Notice>);
  if (!q.data || !f || !start || !version) return wrap(<p role="status" className="text-sm text-text-muted" data-loading>Loading the firm profile…</p>);
  const p = q.data, editDetails = p.canChange.details, editOwner = p.canChange.ownerOnly;
  const seesBilling = admin || editOwner;
  const set = (k: FieldName) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { const v = e.target.value; setF((x) => (x ? { ...x, [k]: v } : x)); setErrors((x) => ({ ...x, [k]: undefined })); };
  const dirty = dirtyNow;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending.current) return;
    if (!dirty) { setProblem({ tone: "warn", title: "Nothing saved", text: WORDS.nothing }); return; }
    sending.current = true; setBusy(true); setErrors({}); setProblem(null);
    const sent = f;
    try {
      const r = Saved.parse(await staffApi("/platform/firm/profile", { method: "PUT", json: changesOf(start, f, version) }));
      qc.setQueryData(key, r.profile);
      // Break m3: what was typed while the save ran is kept, on top of what was saved.
      const saved = formOf(r.profile); setStart(saved); setF(keepEdits(saved, sent, now.current ?? sent)); setVersion(r.profile.version);
      toast.push({ tone: "ok", text: WORDS.saved });
      // Break m7: Save was disabled while busy, which drops keyboard focus to the page; it goes back to Save.
      setFocusAsk((a) => ({ n: a.n + 1, to: "save" }));
    } catch (x) {
      if (x instanceof StaffApiError && x.status === 409) {
        // The staff client keeps only a problem's plain fields, not its `latest`: read the profile again and load it.
        const latest = await staffApi("/platform/firm/profile").then((d) => Profile.parse(d)).catch(() => null);
        if (latest) {
          // Break M1 (STANDARDS §4, BIC-13): the latest becomes the starting point, this person's own changes stay on top, and the
          // fields someone else changed are named.
          const fresh = formOf(latest), mine = now.current ?? sent, theirs = changedWords(start, fresh);
          qc.setQueryData(key, latest); setStart(fresh); setF(keepEdits(fresh, start, mine)); setVersion(latest.version);
          setProblem({ tone: "danger", title: "Not saved", text: `Someone else saved the firm profile while you were editing${theirs ? `: they changed the ${theirs}` : ""}. Your changes are kept: check them and press Save again.` });
        } else setProblem({ tone: "danger", title: "Not saved", text: `${x.message} We could not load the latest details: please reload the page.` });
      } else if (x instanceof StaffApiError) {
        const fe = fieldErrors(x.problem.fields);
        setErrors(fe);
        // Review m3 (BIC-13): the notice names each refused field with its words, not only the summary.
        const named = (Object.keys(fe) as FieldName[]).map((k) => `${LABELS[k][0].toUpperCase()}${LABELS[k].slice(1)}: ${fe[k]}.`);
        setProblem({ tone: "danger", title: "Not saved", text: [x.message, ...named, ...otherErrors(x.problem.fields)].join(" ") });
      } else setProblem({ tone: "danger", title: "Not saved", text: "Please try again." });
      setFocusAsk((a) => ({ n: a.n + 1, to: "problem" }));
    } finally { sending.current = false; setBusy(false); }
  };

  const addr = addressLines(p.ownerOnly.businessAddress);
  return wrap(
    <>
      <Section id="firm" title="Your firm" note={WORDS.supportOnly}>
        <Facts rows={[["Legal name", none(p.firm.legalName, "Not recorded yet"), "legalName"], ["Trading name", p.firm.operatingName, "operatingName"], ["Country", countryName(p.firm.countryCode), "countryCode"], ["Web address", p.firm.key, "key"]]} />
      </Section>
      <form id="profile-form" className="flex flex-col gap-5" onSubmit={(e) => void save(e)} noValidate>
        {problem ? <div ref={problemBox} tabIndex={-1} data-profile-problem-box className="rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"><Notice tone={problem.tone} title={problem.title}><span data-profile-problem>{problem.text}</span></Notice></div> : null}
        <Section id="details" title="Contact and defaults" note={editDetails ? "Shown to your clients and used for new work." : WORDS.readOnlyDetails}>
          {editDetails ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Public phone" error={errors.publicPhone} hint="For example +1 416 555-0100. Leave empty for none."><Input type="tel" autoComplete="tel" maxLength={30} value={f.publicPhone} onChange={set("publicPhone")} data-profile-field="publicPhone" /></Field>
              <Field label="Public email" error={errors.publicEmail} hint="Leave empty for none."><Input type="email" autoComplete="email" maxLength={254} value={f.publicEmail} onChange={set("publicEmail")} data-profile-field="publicEmail" /></Field>
              <Field label="Website" error={errors.website} hint="Starting https://. Leave empty for none." className="sm:col-span-2"><Input type="url" inputMode="url" maxLength={500} value={f.website} onChange={set("website")} data-profile-field="website" /></Field>
              <Field label="Language" error={errors.language}><Select value={f.language} onChange={set("language")} data-profile-field="language">{LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</Select></Field>
              <Field label="Currency" error={errors.currency} hint="Your firm's default currency."><Select value={f.currency} onChange={set("currency")} data-profile-field="currency">{CURRENCIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select></Field>
              <Field label="Time zone" error={errors.timeZone} hint="Deadlines, reminders and bookings use this unless an office has its own." className="sm:col-span-2"><Select value={f.timeZone} onChange={set("timeZone")} data-profile-field="timeZone">{zones.map((z) => <option key={z} value={z}>{z}</option>)}</Select></Field>
            </div>
          ) : (
            <Facts rows={[["Public phone", none(p.details.publicPhone), "publicPhone"], ["Public email", none(p.details.publicEmail), "publicEmail"], ["Website", none(p.details.website), "website"], ["Language", languageWord(p.details.language), "language"], ["Currency", currencyWord(p.details.currency), "currency"], ["Time zone", p.details.timeZone, "timeZone"]]} />
          )}
        </Section>
        {seesBilling ? (
          <Section id="billing" title="Billing" note={editOwner ? "Where we send your firm's invoices and receipts." : WORDS.ownerOnly}>
            {editOwner
              ? <Field label="Billing email" error={errors.billingEmail} hint="Needed: invoices and receipts from ExpatReady go here."><Input type="email" autoComplete="email" maxLength={254} value={f.billingEmail} onChange={set("billingEmail")} data-profile-field="billingEmail" /></Field>
              : <Facts rows={[["Billing email", none(p.ownerOnly.billingEmail), "billingEmail"]]} />}
            <div className="flex flex-col gap-1" data-profile-address>
              <span className="text-xs font-medium text-text-muted">Business address</span>
              {addr ? <p className="text-sm [overflow-wrap:anywhere]">{addr[0]}<br />{addr[1]}</p> : <p className="text-sm text-text-muted" data-profile-address-missing>{WORDS.addressMissing}</p>}
              <p className="text-xs text-text-muted">{WORDS.addressHere}{me.keys.includes(BILLING_KEY) ? <> <Link to="/settings/billing" className="text-text-link underline underline-offset-2" data-profile-billing-link>Go to Plan and billing</Link></> : null}</p>
            </div>
          </Section>
        ) : null}
        {editDetails || editOwner ? (
          <div className="flex flex-wrap items-center justify-end gap-3">
            {dirty ? <span className="text-sm text-text-muted" data-profile-unsaved>You have unsaved changes.</span> : null}
            <Button type="button" variant="ghost" disabled={!dirty || busy} onClick={() => { setF(start); setErrors({}); setProblem(null); }} data-profile-reset>Undo changes</Button>
            <Button ref={saveButton} type="submit" busy={busy} className="max-sm:h-11 max-sm:px-6" data-profile-save>Save</Button>
          </div>
        ) : null}
      </form>
    </>,
  );
}

export function FirmProfilePage() {
  return <PlatformFrame crumbs={[{ label: "Firm profile" }]}><ProfileBody /></PlatformFrame>;
}
