// FO-4 part 1 (BR-5, AG-2-86): Take it, shared by the Leads list and one lead's screen. Someone who took the lead first
// wins; the second person hears "<name> already has this lead." and the lists and the lead are read again.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/lib/api";
import { LeadChanged } from "./contract";
import { staffApi, StaffApiError } from "./session";
export function useTakeIt() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: async (lead: { id: string; number: string }) => ({ lead, r: LeadChanged.parse(await staffApi(`/front-office/leads/${lead.id}/take`, { method: "POST" })) }),
    onSuccess: ({ lead }) => toast.push({ tone: "ok", text: `You have lead ${lead.number}.` }),
    onError: (e) => toast.push({ tone: "danger", text: e instanceof StaffApiError ? e.message : "Could not take the lead. Please try again." }),
    // Refused or not, the rows are read again so the screen shows who has it now (BR-5).
    onSettled: () => qc.invalidateQueries({ queryKey: ["fo", "leads"] }),
  });
}
