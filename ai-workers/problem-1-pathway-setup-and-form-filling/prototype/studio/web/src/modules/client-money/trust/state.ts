// FO-7s3b part 1 (R1.58; concept.md BR-1, concept-invoices.md (a) "Trust shows"; AG-6-59 r4-6): the one trust-state probe the
// Money menu and Money → Trust share. FO-7v's shortfall read answers 404 while trust does not show (Unanswered, or No with
// nothing held), so a success means trust shows; one cached answer for the menu and the page.
import { useQuery } from "@tanstack/react-query";
import { staffApi, useStaffToken } from "@/modules/platform/session";
import { Shortfall } from "./contract";

export function useShortfall(enabled = true) {
  const token = useStaffToken();
  return useQuery({ queryKey: ["fo", "money", "trust", "shortfall", token], enabled: !!token && enabled, retry: false, staleTime: 30_000,
    queryFn: async () => Shortfall.parse(await staffApi("/front-office/money/trust/shortfall")) });
}
