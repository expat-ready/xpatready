// FO-6ds (concept screens/FO-6ds/concept.md §5, §6; AG-5-61): the shapes the "Signature requests" section reads, mirroring
// FO-6d's answers (api/src/front-office/signing/any-document/service.ts `signersFor`, `shape`, and the download link).
// Parsed at the edge. The status words say "Recorded", never "Sent", until FO-6 part 4's client signing page is live (BR-10).
import { z } from "zod";

export const S_KEY = { send: "agent/portal:request-work", list: "agent/prospect:show", download: "agent/document:show" } as const;
export const MAX_MB = 25;   // the API's limit (MAX_BYTES, Sample)

export const Signers = z.object({
  people: z.array(z.object({ personId: z.string(), name: z.string(), hasEmail: z.boolean() })),
  firmPeople: z.array(z.object({ staffId: z.string(), name: z.string() })),
});
export type Signers = z.infer<typeof Signers>;
const Signer = z.object({ role: z.string(), name: z.string(), personId: z.string().nullable(), staffId: z.string().nullable(), viewedAt: z.string().nullable(), signedAt: z.string().nullable(), declinedAt: z.string().nullable() });
export const SignatureRequest = z.object({
  id: z.string(), title: z.string(), status: z.string(), sentAt: z.string(), expiresAt: z.string(), endedAt: z.string().nullable(),
  signed: z.string(), signedCount: z.number(), signerCount: z.number(), signers: z.array(Signer),
  evidence: z.object({ sealedSha256: z.string() }).passthrough().nullable(),
});
export type SignatureRequest = z.infer<typeof SignatureRequest>;
export const SignatureRequests = z.object({ requests: z.array(SignatureRequest) });

/** BR-10's notice (concept §5): goes when FO-6 part 4 lands. */
export const NOT_EMAILED = "Signing emails are not switched on yet: the request is recorded, but no one is emailed until the client signing page is live.";
/** Each status in words with its tooltip (concept §5); CLIENT_SIGNED reads by whether a firm signer is still to sign. */
export function statusOf(r: Pick<SignatureRequest, "status" | "signers">): { label: string; tip: string; tone: string } {
  const firm = r.signers.some((s) => s.role === "FIRM");
  switch (r.status) {
    case "SENT": return { label: "Recorded", tip: "Recorded. No one is emailed until the client signing page is live.", tone: "info" };
    case "VIEWED": return { label: "Viewed", tip: "Opened, not signed yet.", tone: "info" };
    case "CLIENT_SIGNED": return firm ? { label: "Client signed", tip: "The clients signed; the firm signer signs next.", tone: "info" } : { label: "Signed, being filed", tip: "Everyone signed; the signed copy is being filed.", tone: "info" };
    case "SIGNED": return { label: "Signed", tip: "Everyone signed. The signed copy is filed on each signer.", tone: "ok" };
    case "DECLINED": return { label: "Declined", tip: "A signer declined. Send a new request if needed.", tone: "danger" };
    case "EXPIRED": return { label: "Expired", tip: "Not signed in time (14 days, Sample).", tone: "warn" };
    case "CANCELLED": return { label: "Cancelled", tip: "It can no longer be signed.", tone: "neutral" };
    default: return { label: r.status, tip: "", tone: "neutral" };
  }
}
export const LIVE = ["SENT", "VIEWED", "CLIENT_SIGNED"];
/** The title a file gives (BR-7): its name without ".pdf", trimmed, at most 200 characters. */
/** Cut by whole characters (never half an emoji, break m3) to 200 UTF-16 units, the unit the API's limit counts (review mn-4). */
export function titleOf(fileName: string): string {
  let out = "";
  for (const ch of fileName.replace(/\.pdf$/i, "").trim()) { if (out.length + ch.length > 200) break; out += ch; }
  return out.trim();
}
