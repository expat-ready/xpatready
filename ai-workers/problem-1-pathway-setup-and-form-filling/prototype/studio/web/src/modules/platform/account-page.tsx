// PF-6 part 1 (concept pf-6-staff r2 §4 "My account", read only): the person's own name, email, roles, licence line and
// two-step state from GET /api/platform/me/account. Editing the own licence and two-step is PF-6 part 2.
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Notice } from "@/components/ui/controls";
import { PlatformFrame } from "./frame";
import { staffApi, StaffApiError, useStaffToken } from "./session";

const Account = z.object({
  staffId: z.string(), displayName: z.string(), email: z.string(), roles: z.array(z.string()),
  twoStep: z.object({ method: z.string().nullable() }).passthrough().nullable(), twoStepRequired: z.boolean(),
  licence: z.object({ representativeType: z.string(), licensingBody: z.string(), licenceNumber: z.string().nullable() }).nullable(),
});
/** A stored code in plain words (EXPERIENCE §5): CASE_OFFICER → "Case officer". */
const words = (code: string) => (code.charAt(0) + code.slice(1).toLowerCase()).replace(/_/g, " ");
const TWO_STEP: Record<string, string> = { TOTP: "On (authenticator app)" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1 border-b border-border py-3 sm:grid-cols-[12rem_1fr]"><dt className="text-sm text-text-muted">{label}</dt><dd className="text-sm [overflow-wrap:anywhere]">{children}</dd></div>;
}

function Profile() {
  const token = useStaffToken();
  const q = useQuery({ queryKey: ["pf", "account", token], enabled: !!token, retry: false, queryFn: async () => Account.parse(await staffApi("/platform/me/account")) });
  if (q.isError) return <Notice tone="danger" title="Could not load your account">{q.error instanceof StaffApiError ? q.error.message : "Please try again."}</Notice>;
  const a = q.data;
  if (!a) return <p role="status" className="text-sm text-text-muted" data-loading>Loading your account…</p>;
  const l = a.licence;
  return (
    <dl className="max-w-3xl" data-account>
      <Row label="Name">{a.displayName}</Row>
      <Row label="Email">{a.email}</Row>
      <Row label="Roles">{a.roles.length ? a.roles.map(words).join(", ") : "No role"}</Row>
      <Row label="Licence">{l ? [words(l.representativeType), l.licensingBody, l.licenceNumber].filter(Boolean).join(" · ") : "No licence recorded."}</Row>
      <Row label="Two-step sign-in">{a.twoStep === null ? "Could not be read from the sign-in provider. Try again later." : a.twoStep.method ? TWO_STEP[a.twoStep.method] ?? `On (${words(a.twoStep.method)})` : "Not set up yet."}{a.twoStepRequired ? <span className="block text-text-muted">Two-step sign-in is required for everyone.</span> : null}</Row>
    </dl>
  );
}

export function AccountPage() {
  return (
    <PlatformFrame crumbs={[{ label: "Profile" }]}>
      <h1 className="mb-1 text-xl font-semibold">Profile</h1>
      <p className="mb-4 text-sm text-text-muted">Your own account, as your firm holds it. Change your licence under <Link className="text-text-link underline" to="/account/licence">Licence</Link>.</p>
      <Profile />
    </PlatformFrame>
  );
}
