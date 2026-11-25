// PF-6 part 2b (concept pf-6-staff r2 §4 "Security", BR-9 option (a); founder question 3, P-567): for
// agent/security-policy:manage, only the read-only line. GET /api/platform/settings/two-step answers the fixed setting;
// there is no switch. A person without the key sees the server's refusal.
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Notice } from "@/components/ui/controls";
import { PlatformFrame } from "../frame";
import { staffApi, StaffApiError, useStaffToken } from "../session";

const Setting = z.object({ required: z.boolean(), changeable: z.boolean() }).passthrough();

function Body() {
  const token = useStaffToken();
  const q = useQuery({ queryKey: ["pf", "security", token], enabled: !!token, retry: false, queryFn: async () => Setting.parse(await staffApi("/platform/settings/two-step")) });
  if (q.isError) return <Notice tone="danger" title="Not available"><span data-security-refused>{q.error instanceof StaffApiError ? q.error.message : "Could not load the setting. Please try again."}</span></Notice>;
  if (!q.data) return <p role="status" className="text-sm text-text-muted" data-loading>Loading…</p>;
  return <p className="rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm" data-security-line>{q.data.required ? "Two-step sign-in is required for everyone." : "Two-step sign-in is not required."}</p>;
}

export function SecurityPage() {
  return (
    <PlatformFrame crumbs={[{ label: "Security" }]}>
      <h1 className="mb-4 text-xl font-semibold">Security</h1>
      <Body />
    </PlatformFrame>
  );
}
