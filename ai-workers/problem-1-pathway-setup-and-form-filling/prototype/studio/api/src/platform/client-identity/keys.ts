// PF-4p part 1 (R1.62, map row 62; P-584 (4); AG-15-38): every route under /api/portal/ is a client's, and declares what it
// needs. The client guard (guard.ts) refuses anything it was not given (default deny). A route declares one of:
//   @PortalClient("why")   a signed-in client (their own account, their own firm, their own records);
//   @PortalSignIn("why")   no session yet: a sign-in door.
// A route under /api/portal/ with neither stops the start-up with its name, as does either of them on any other path, or a
// portal route that also declares a firm's or our own staff's access: the three planes never mix.
import { SetMetadata } from "@nestjs/common";
import { unauthorized } from "../identity/keys.ts";

export const PORTAL_ACCESS = "platform:portal-access";
export type PortalAccess = { kind: "client"; why: string } | { kind: "sign-in"; why: string };

/** The paths the client guard owns, in any letter case (Express routes ignore case). */
export const PORTAL_PATH = /^\/api\/portal(\/|$)/i;

export const PortalClient = (why: string) => SetMetadata(PORTAL_ACCESS, { kind: "client", why } satisfies PortalAccess);
export const PortalSignIn = (why: string) => SetMetadata(PORTAL_ACCESS, { kind: "sign-in", why } satisfies PortalAccess);

/** What the client guard puts on the request (req.portalClient). */
export type ClientContext = { accountId: string; firmId: string; firmKey: string; personId: string; email: string; authTime: number; via: "local" | "cognito" };
export const clientOf = (req: { portalClient?: ClientContext }): ClientContext => {
  if (!req.portalClient) return unauthorized("Sign in to your client portal first.", "NOT_SIGNED_IN");
  return req.portalClient;
};

/** The actor word of a client on audit lines: AUD-1a's trigger reads `person:<party id>` as CLIENT (AG-15-38). */
export const clientActorWord = (personId: string) => `person:${personId}`;
