// PF-6 part 2b (concept pf-6-staff r2 §4 "My account"; BR-8; AG-1-30, -31): My account → Licence, everyone's own licence
// record: read from GET /api/platform/me/account, saved by PUT /api/platform/me/account (the server's rules and audit
// line). The two-step state is shown with it. The saved toast never holds the number (BR-8).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Notice } from "@/components/ui/controls";
import { useToast } from "@/lib/api";
import { PlatformFrame } from "../frame";
import { staffApi, StaffApiError, useStaffToken } from "../session";
import { Licence, LicenceConflict, LicenceForm, sameLicence } from "./licence-form";

const Mine = z.object({ staffId: z.string(), twoStep: z.object({ method: z.string().nullable() }).passthrough().nullable(), twoStepRequired: z.boolean(), licence: Licence.nullable(), warning: z.string().optional() });
/** The same words as Profile (account-page.tsx; review m4). */
const METHOD: Record<string, string> = { TOTP: "On (authenticator app)" };
export const TWO_STEP_LINE = (t: z.infer<typeof Mine>["twoStep"]) => (t === null ? "Could not be read from the sign-in provider. Try again later." : t.method ? METHOD[t.method] ?? `On (${t.method.toLowerCase()})` : "Not set up yet. The sign-in provider asks you to set it up when you next sign in.");

function MyLicence() {
  const token = useStaffToken(), qc = useQueryClient(), toast = useToast();
  const q = useQuery({ queryKey: ["pf", "account", token], enabled: !!token, retry: false, queryFn: async () => Mine.parse(await staffApi("/platform/me/account")) });
  if (q.isError) return <Notice tone="danger" title="Could not load your licence">{q.error instanceof StaffApiError ? q.error.message : "Please try again."}</Notice>;
  if (!q.data) return <p role="status" className="text-sm text-text-muted" data-loading>Loading your licence…</p>;
  const a = q.data;
  const save = async (l: unknown) => {
    // Review MJ-1 / break M1: the PUT replaces the whole record, so a form opened before someone else's save must not undo it.
    const fresh = Mine.parse(await staffApi("/platform/me/account"));
    if (!sameLicence(fresh.licence, a.licence)) { qc.setQueryData(["pf", "account", token], fresh); throw new LicenceConflict(fresh.licence); }
    const saved = Mine.parse(await staffApi("/platform/me/account", { method: "PUT", json: { licence: l } }));
    qc.setQueryData(["pf", "account", token], saved);
    toast.push({ tone: "ok", text: "Your licence record was saved." });
    return saved.warning ? { warning: saved.warning } : undefined;   // PF-4c part 2: shown on the number field
  };
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="my-licence"><h2 id="my-licence" className="mb-1 text-base font-semibold">Your licence</h2>
        <p className="mb-3 text-sm text-text-muted" data-licence-now>{a.licence ? "Change it here if it is wrong." : "No licence recorded. Add yours if you are licensed to represent clients."}</p>
        <LicenceForm key={a.staffId} start={a.licence} save={save} /></section>
      <section aria-labelledby="my-two-step"><h2 id="my-two-step" className="mb-1 text-base font-semibold">Two-step sign-in</h2>
        <p className="text-sm" data-two-step-state>{TWO_STEP_LINE(a.twoStep)}</p>
        {a.twoStepRequired ? <p className="text-sm text-text-muted">Two-step sign-in is required for everyone.</p> : null}</section>
    </div>
  );
}

export function LicencePage() {
  return (
    <PlatformFrame crumbs={[{ label: "Licence" }]}>
      <h1 className="mb-1 text-xl font-semibold">Licence</h1>
      <p className="mb-4 text-sm text-text-muted">Your own licence record and two-step sign-in. Only you, and people who manage licences, can see the number.</p>
      <MyLicence />
    </PlatformFrame>
  );
}
