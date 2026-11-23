// QA-756 (R1.24; AG-04 S3): which firm a booking page is for and where its links go. On ExpatReady's own host both come
// from the path (`/book/<firm key>/…`); on a firm's own address (`<address>.expatready.com/book/…`) BookingEntry
// (site.tsx) gives them: the firm the Host names, and links under `/book`.
import * as React from "react";
import { useParams } from "react-router-dom";

export type BookingSite = { firmKey: string; slug: string; base: string };
export const BookingSiteContext = React.createContext<BookingSite | null>(null);

export function useBookingSite(): BookingSite {
  const given = React.useContext(BookingSiteContext);
  const { firmKey = "", slug = "" } = useParams();
  return given ?? { firmKey, slug, base: `/book/${encodeURIComponent(firmKey)}` };
}

/** Could this page be on a firm's own address (`<address>.<suffix>`)? ExpatReady's own host on a person's machine is a
 *  bare name or an IP (localhost, 127.0.0.1), so only a dotted name asks the server; its answer decides. */
export const mayBeFirmAddress = (host: string = window.location.hostname) => host.includes(".") && !/^\d{1,3}(\.\d{1,3}){3}$/.test(host);
