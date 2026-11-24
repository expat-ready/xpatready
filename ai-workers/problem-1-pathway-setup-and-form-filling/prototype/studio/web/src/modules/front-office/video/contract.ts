// FO-3v part 1: the shape of GET/PUT /api/front-office/me/video (api/src/front-office/booking/video/service.ts).
import { z } from "zod";

export const SOURCE_WORDS = { CALENDAR: "Meet/Teams", ZOOM: "Zoom", MY_LINK: "My meeting link" } as const;
export const VideoSource = z.enum(["CALENDAR", "ZOOM", "MY_LINK"]);
export const MyVideo = z.object({
  myMeetingLink: z.string().nullable(),
  sourceChoice: VideoSource.nullable(),
  sources: z.array(VideoSource),
  zoomAvailable: z.boolean(),
  calendarAvailable: z.boolean(),
});
export type MyVideo = z.infer<typeof MyVideo>;
/** AG-4-58 rule 2, the same check as the server's: one https link with a host, no spaces, at most 2,048 characters. */
export const LINK_WORDS = "Enter a full link starting with https://";
export function linkLooksOk(s: string): boolean {
  if ([...s].length > 2048 || !/^https:\/\/\S+$/.test(s)) return false;
  try { return new URL(s).hostname.length > 0; } catch { return false; }
}
