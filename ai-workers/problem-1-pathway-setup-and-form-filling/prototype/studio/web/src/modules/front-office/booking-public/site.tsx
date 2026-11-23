// QA-756 (R1.24; AG-04 S3 "https://maple.expatready.com/book/free-consultation"; AG-4-16, AG-4-17): /book and
// /book/:firmKey. On a firm's own address the server serves only `/book` and `/book/<one segment>` (PF-25's host
// routing, front-office/booking/public-paths.ts) and names the firm by its Host (/api/public/booking-site):
//   /book the firm's list · /book/manage the booker's own page · /book/<type slug> the type's page.
// On ExpatReady's own host nothing changes: /book/<firm key> is that firm's list; /book alone is the one not-found.
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { z } from "zod";
import { publicCall, type Problem } from "./contract";
import { Gate } from "./frame";
import { BookingListPage } from "./list-page";
import { BookingManagePage } from "./manage-page";
import { BookingSiteContext, mayBeFirmAddress } from "./site-context";
import { BookingTypePage } from "./type-page";

const Site = z.object({ firmKey: z.string() });
const NOT_FOUND: Problem = { status: 404, issues: [], slots: [] };

export function BookingEntry() {
  const { firmKey: segment } = useParams();
  const ask = mayBeFirmAddress();
  const q = useQuery({ queryKey: ["public-booking-site"], enabled: ask, retry: false, staleTime: Infinity, refetchOnWindowFocus: false, queryFn: () => publicCall("booking-site", Site) });
  if (ask && q.isPending) return <Gate pending error={null}>{() => null}</Gate>;
  // A firm's address that could not be read (a limit, a lost answer) says so; it never falls back to reading the path.
  if (ask && q.error && (q.error as unknown as Problem).status !== 404) return <Gate pending={false} error={q.error}>{() => null}</Gate>;
  if (ask && q.data) {
    const page = !segment ? <BookingListPage /> : segment === "manage" ? <BookingManagePage /> : <BookingTypePage />;
    return <BookingSiteContext.Provider value={{ firmKey: q.data.firmKey, slug: segment ?? "", base: "/book" }}>{page}</BookingSiteContext.Provider>;
  }
  return segment ? <BookingListPage /> : <Gate pending={false} error={NOT_FOUND}>{() => null}</Gate>;
}
