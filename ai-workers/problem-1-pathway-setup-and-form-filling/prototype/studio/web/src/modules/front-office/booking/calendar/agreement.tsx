// FO-3c part 2 (R1.104; Lead 10, 23 Nov; J-104 W3, W4, W7): the consultation agreement on the staff screens.
//   * `BookingAgreement`, on the booking's panel: "Agreement signed" or "Agreement not signed yet" (GET by-booking: the
//     host, or the list key and the booking's record rule; else nothing is shown), and, while unsigned on a type that
//     needs it, why Attended and the consult record wait (the server refuses them: 409 AGREEMENT_NOT_SIGNED). An agreement
//     that ended unsigned still holds, and a fresh one is sent while the meeting is ahead (Lead 1's ruling on #3184); a
//     No-show, Attended or cancelled booking cannot be rescheduled nor sent a fresh one, so the panel says what can be done
//     instead (review r2-2, break P2R3-4; contracts/consultation-agreement-words.ts).
//   * `PersonAgreements`, on the lead's page: each agreement of the person's bookings the viewer sees (GET by-person, the
//     list key), with the signed copy as a link: a short-lived link for this person (POST …/signed-copy/download-link),
//     opened with the session's token, as the retainer page downloads its files.
// Every value is Sample. Legal reading (Code SOR/2022-128 s. 23 "signed"): Unconfirmed: no counsel.
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Pill } from "@/components/ui/controls";
import { staffApi, staffToken } from "@/modules/platform/session";
import { agreementNextStep, sendsFresh } from "../../../../../../contracts/consultation-agreement-words";

const Agreement = z.object({
  id: z.string().nullable(), bookingId: z.string(), status: z.string(), signed: z.boolean(), words: z.string(),
  required: z.boolean().optional(),
  clientSignedAt: z.string().nullable().optional(), sentAt: z.string().nullable().optional(),
  signatory: z.object({ name: z.string().nullable(), note: z.string().nullable() }).optional(),
  signedCopy: z.object({ sha256: z.string(), storedAt: z.string() }).nullable().optional(),
  meetingAt: z.string().nullable().optional(),
  why: z.string().optional(),   // QA-772: none sent yet on a type that needs one: held, and why (the server's words)
});
/** Still waiting for a signature (the server's gate.ts: these and an ended one both hold until a signed one). */
const LIVE = ["SENT", "VIEWED", "CLIENT_SIGNED"];
type Agreement = z.infer<typeof Agreement>;

const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" }) : "");

/** The booking's agreement line (nothing when the viewer may not read it, or no agreement is needed and none was sent). */
export function BookingAgreement({ bookingId, bookingStatus }: { bookingId: string; bookingStatus?: string }) {
  const q = useQuery({ queryKey: ["fo", "bookings", "agreement", bookingId], retry: false, queryFn: async () => Agreement.parse(await staffApi(`/front-office/consultation-agreements/by-booking/${encodeURIComponent(bookingId)}`)) });
  const a = q.data;
  if (!a || (a.status === "NONE" && !a.required)) return null;
  const ended = !a.signed && a.status !== "NONE" && !LIVE.includes(a.status), held = !a.signed && a.status !== "NONE" && a.required !== false;
  const next = agreementNextStep(bookingStatus);
  return (
    <section aria-labelledby="fo-agreement" className="border-t border-border pt-3" data-agreement={a.status}>
      <h3 id="fo-agreement" className="font-semibold">Consultation agreement</h3>
      <p className="flex flex-wrap items-center gap-2"><Pill tone={a.signed ? "ok" : (a.status === "NONE" && !a.why) || ended ? "neutral" : "warn"}>{a.words}</Pill>
        {a.signed && a.signedCopy ? <span className="text-text-muted">Signed copy stored {day(a.signedCopy.storedAt)}</span> : null}
        {!a.signed && a.clientSignedAt ? <span className="text-text-muted">The client signed {day(a.clientSignedAt)}: the firm signs next.</span> : null}</p>
      {held && !ended ? <p className="mt-1 text-text-muted" data-agreement-why>The consultation cannot start until it is signed: Attended and the consult record wait. The client signs from the link in their email, then {a.signatory?.name ?? "the firm"} signs. {next}</p> : null}
      {ended ? <p className="mt-1 text-text-muted" data-agreement-ended>This agreement was declined, withdrawn, has expired or was put back to draft, so it can no longer be signed.{held ? <> The consultation still cannot start.{sendsFresh(bookingStatus) ? " While the meeting is ahead, a new agreement is emailed to the client." : ""} {next}</> : null}</p> : null}
      {a.status === "NONE" ? <p className="mt-1 text-text-muted" data-agreement-none>{a.why ?? "No agreement was sent for this booking (the firm has no active consultation agreement template, the person has no email, nobody can sign for the firm, or sending has not succeeded yet)."}</p> : null}
      {a.signatory?.note ? <p className="mt-1 text-text-muted">{a.signatory.note}</p> : null}
    </section>
  );
}

/** The person's agreements, newest first, each with its signed copy when stored (nothing when the viewer may not list them). */
export function PersonAgreements({ personId }: { personId: string }) {
  const q = useQuery({ queryKey: ["fo", "people", "agreements", personId], retry: false,
    queryFn: async () => z.object({ agreements: z.array(Agreement) }).parse(await staffApi(`/front-office/consultation-agreements/by-person/${encodeURIComponent(personId)}`)).agreements });
  if (!q.data?.length) return null;
  return (
    <section aria-labelledby="fo-agreements" className="rounded-xl border border-border bg-surface-raised p-4" data-person-agreements>
      <h2 id="fo-agreements" className="text-sm font-semibold">Consultation agreements</h2>
      <ul className="mt-2 flex flex-col gap-2 text-sm">
        {q.data.map((a) => (
          <li key={a.id ?? a.bookingId} className="flex flex-wrap items-center gap-2">
            <Pill tone={a.signed ? "ok" : LIVE.includes(a.status) ? "warn" : "neutral"}>{a.words}</Pill>
            <span className="text-text-muted">{a.meetingAt ? `For the meeting on ${day(a.meetingAt)} · ` : ""}Sent {day(a.sentAt)}</span>
            {a.signed && a.signedCopy && a.id ? <SignedCopyLink agreementId={a.id} /> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Download the signed copy": a real link (a fresh short-lived one is asked for on each click and opened with the token). */
function SignedCopyLink({ agreementId }: { agreementId: string }) {
  const path = `/front-office/consultation-agreements/${encodeURIComponent(agreementId)}/signed-copy/download-link`;
  const q = useQuery({ queryKey: ["fo", "agreement-copy", agreementId], retry: false, staleTime: 60_000, queryFn: async () => staffApi<{ url: string }>(path, { method: "POST" }) });
  const [error, setError] = React.useState<string | null>(null);
  const open = async (e: React.MouseEvent) => {
    e.preventDefault(); setError(null);
    try {
      const l = await staffApi<{ url: string }>(path, { method: "POST" });
      const res = await fetch(l.url, { headers: { authorization: `Bearer ${staffToken()}` } });
      if (!res.ok) throw new Error();
      const a = document.createElement("a"); a.href = URL.createObjectURL(await res.blob()); a.download = "consultation-agreement-signed.pdf"; a.click(); URL.revokeObjectURL(a.href);
    } catch { setError("Could not download the signed copy. Please try again."); }
  };
  if (!q.data) return null;
  return (
    <>
      <a href={q.data.url} onClick={(e) => void open(e)} className="text-text-link hover:underline" data-signed-copy>Download the signed copy</a>
      {error ? <span role="alert" className="text-text-danger">{error}</span> : null}
    </>
  );
}
