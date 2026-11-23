// FO-3w J-P1 (concept BR-1, BR-2; AG-4-16 rules 1-2, AG-4-17): /book/:firmKey (or /book on the firm's own address, QA-756), the firm's public booking types as
// cards, or the empty text with the firm's email. Nothing here carries an id (the answer has none).
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { buttonVariants } from "@/components/ui/controls";
import { cn } from "@/lib/utils";
import { List, MODE_WORDS, publicCall } from "./contract";
import { Gate, PublicFrame } from "./frame";
import { useBookingSite } from "./site-context";

export function BookingListPage() {
  const { firmKey, base } = useBookingSite();   // QA-756: from the path, or from a firm's own address
  const q = useQuery({ queryKey: ["public-book", firmKey], retry: false, refetchOnWindowFocus: false, queryFn: () => publicCall(`firms/${encodeURIComponent(firmKey)}/book`, List) });
  return (
    <Gate pending={q.isPending} error={q.error}>{() => {
      const { firm, types } = q.data!;
      return (
        <PublicFrame firm={firm.name} title={`Book a meeting with ${firm.name}`}>
          <h1 className="text-2xl font-semibold [overflow-wrap:anywhere]">Book a meeting with {firm.name}</h1>
          {types.length ? (
            <ul className="mt-5 grid gap-3 sm:grid-cols-2" aria-label="Booking types">
              {types.map((t) => (
                <li key={t.slug} data-type-card className="flex flex-col gap-1 rounded-xl border border-border bg-surface-raised p-4">
                  <h2 className="text-base font-semibold [overflow-wrap:anywhere]">{t.name} · {t.minutes} minutes</h2>
                  <p className="text-sm text-text-muted">{t.modes.map((m) => MODE_WORDS[m]).join(", ")}</p>
                  <Link to={`${base}/${encodeURIComponent(t.slug)}`} aria-label={`Choose ${t.name}`} className={cn(buttonVariants({ size: "lg" }), "mt-2 min-h-11 self-start")}>Choose</Link>
                </li>
              ))}
            </ul>
          ) : (
            <div data-public-state="empty" className="mt-5 rounded-xl border border-border bg-surface-raised p-5 text-sm">
              <p>No bookings are available online. Please contact the firm.</p>
              <a className="mt-2 inline-flex min-h-11 items-center text-text-link underline" href={`mailto:${firm.email}`}>Email {firm.email}</a>
            </div>
          )}
        </PublicFrame>
      );
    }}</Gate>
  );
}
