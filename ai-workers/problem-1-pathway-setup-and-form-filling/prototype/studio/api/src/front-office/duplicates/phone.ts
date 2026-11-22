// FO-9a: a typed phone number in E.164 by libphonenumber-js (PF-L's gate entry), default region CA (Sample: the firms
// are Canadian, contracts §7 §1.1 country CA). "+1 (416) 555-0101", "416.555.0101" and "(416) 555 0101" are all
// +14165550101. A number that cannot be a phone number gives null, so it matches nothing.
import { parseIncompletePhoneNumber, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export const DEFAULT_REGION = "CA";

export function phoneE164(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const n = parsePhoneNumberFromString(v.trim(), DEFAULT_REGION);
  return n && n.isPossible() ? n.number : null;
}

/** FO-9a phone part (a staff edit, breaker F1-F3 and review M1-M2 on b6b6b3d4): E.164 only when it is a whole number,
 *  nothing typed is lost and the database can keep it, else null. On top of phoneE164's reading: possible with its
 *  country code alone (not a local-only length); no extension (it would be dropped); 7-15 digits, the shape
 *  fo_person's checks and phone_e164 take (a longer "possible" number gave a 500, a shorter one no duplicate key); and
 *  the digits typed are exactly the number, after an optional "+", international prefix (00, 011) or country code and
 *  one trunk "0" (libphonenumber drops digits from some over-long numbers: +86 1234567890123456 read as +8667890123456).
 *  FO-9b (QA-528, check_fo9b P0): "00" then a country code is international dialling ("0044 20 7946 0958"), read as
 *  "+"; with region CA libphonenumber never read it (no North American number starts with 0). */
export function phoneE164Exact(v: string): string | null {
  const t = v.trim().replace(/^00(?=[\s.()-]*[1-9])/, "+"), n = t ? parsePhoneNumberFromString(t, DEFAULT_REGION) : undefined;
  if (!n || !n.isPossible() || n.ext || !/^\+[1-9][0-9]{6,14}$/.test(n.number)) return null;
  // A local-only length is "possible" (555 0100 → +15550100): the number must be possible as dialled from anywhere,
  // with its country code and no default region (review M1 on b6b6b3d4).
  if (!parsePhoneNumberFromString(n.number)?.isPossible()) return null;
  // A North American number's area code and exchange each start with 2-9 (the NANP's NXX-NXX-XXXX): "possible" checks only
  // the length, so "000-000-0000" or "123 456 7890" was read as a whole number (review M1 on 4bdf017a; FO-2's old rule
  // kept them unreadable).
  if (n.countryCallingCode === "1" && !/^[2-9][0-9]{2}[2-9][0-9]{6}$/.test(n.nationalNumber)) return null;
  const typed = parseIncompletePhoneNumber(t), cc = n.countryCallingCode, nat = n.nationalNumber;
  const heads = typed.startsWith("+") ? [`+${cc}`] : ["", cc, `00${cc}`, `011${cc}`];
  return heads.some((h) => typed === `${h}${nat}` || typed === `${h}0${nat}`) ? n.number : null;
}

/** PF-30a: the typed phone in E.164 with the firm's country as default (phoneE164Exact for Canada, the Sample firms' country). */
export function phoneForFirm(text: string, country: string): string | null {
  if (country === DEFAULT_REGION) return phoneE164Exact(text);
  const n = parsePhoneNumberFromString(text, country as CountryCode);
  // as FO-9a's reader: a whole number, possible with its country code alone (not a local-only length), no extension
  return n && n.isPossible() && !n.ext && /^\+[1-9][0-9]{6,14}$/.test(n.number) && parsePhoneNumberFromString(n.number)?.isPossible() ? n.number : null;
}
