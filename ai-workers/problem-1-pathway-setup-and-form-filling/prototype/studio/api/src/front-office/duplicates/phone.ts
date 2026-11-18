// FO-9a: a typed phone number in E.164 by libphonenumber-js (PF-L's gate entry), default region CA (Sample: the firms
// are Canadian, contracts §7 §1.1 country CA). "+1 (416) 555-0101", "416.555.0101" and "(416) 555 0101" are all
// +14165550101. A number that cannot be a phone number gives null, so it matches nothing.
import { parsePhoneNumberFromString } from "libphonenumber-js";

export const DEFAULT_REGION = "CA";

export function phoneE164(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const n = parsePhoneNumberFromString(v.trim(), DEFAULT_REGION);
  return n && n.isPossible() ? n.number : null;
}
