// FO-13s part 1 (brief lead-b-briefs/FO-13s.md Part B; concept screens/FO-13s/concept.md): the shapes the Identity check
// panel reads, mirroring FO-13i's answers (api/src/front-office/compliance/identity/service.ts `list`), parsed at the edge.
import { z } from "zod";

export const IdentityCheck = z.object({
  id: z.string(), method: z.string(), methodDetail: z.string().nullable(), documentType: z.string().nullable(), issuingCountry: z.string().nullable(),
  documentExpiry: z.string().nullable(), documentNumberLast4: z.string().nullable(), details: z.array(z.string()), hasCopy: z.boolean(),
  checkedBy: z.object({ staffId: z.string(), name: z.string() }), checkedAt: z.string(),
});
export type IdentityCheck = z.infer<typeof IdentityCheck>;
export const IdentityChecks = z.object({ personId: z.string(), checks: z.array(IdentityCheck) });
export const DownloadLink = z.object({ url: z.string(), expiresAt: z.union([z.string(), z.number()]) });

/** The keys (FO-13i's routes): list with prospect:show, record with identity-check:record, the copy with document:show. */
export const ID_KEY = { record: "agent/identity-check:record", copy: "agent/document:show", show: "agent/prospect:show" } as const;

/** FO-13i's lists in plain words (Sample lists, the server's enums). */
export const METHODS: [string, string][] = [["IN_PERSON", "In person"], ["VIDEO", "Video call"], ["DOCUMENT_COPY", "Document copy"], ["OTHER", "Other"]];
export const DOCUMENT_TYPES: [string, string][] = [["PASSPORT", "Passport"], ["NATIONAL_IDENTITY_CARD", "National identity card"], ["DRIVERS_LICENCE", "Driver's licence"],
  ["PERMANENT_RESIDENT_CARD", "Permanent resident card"], ["OTHER_GOVERNMENT_PHOTO_ID", "Other government photo ID"]];
export const DETAILS: [string, string][] = [["NAME", "Name"], ["HOME_ADDRESS", "Home address"], ["PHONE", "Phone"], ["EMAIL", "Email"], ["BUSINESS_DETAILS", "Business details"]];
const label = (list: [string, string][]) => (code: string | null) => (code === null ? "" : list.find(([k]) => k === code)?.[1] ?? code);
export const methodLabel = label(METHODS), documentLabel = label(DOCUMENT_TYPES), detailLabel = label(DETAILS);

/** The copy's limit, the same as the server's (COPY_MAX_BYTES, Sample) and in its words. */
export const COPY_MAX_BYTES = 10 * 1024 * 1024;
export const COPY_TOO_LARGE = "At most 10 MB.";
/** The retainer Send's warning, word for word (retainers/service.ts), shown here while no check is recorded. */
export const noCheckLine = (name: string) => `No identity check is recorded for ${name || "the signer"}.`;
