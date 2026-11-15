// PF-0c: IdentityPort's contract (api/src/platform/identity/port.ts; Lead B ruling 2, 15 Nov). Run by LocalIdentity (in
// CI) and CognitoIdentity (NOT TESTED without AWS credentials, never counted green, P-405; PF-4b's proof runs it for
// real). The port file's sentences: verify(token) says who a verified token is (the adapter's `via`, a lookup by staff
// id or identity subject, the sign-in time in seconds, whether the second step was done); a token the port refuses is
// always an IdentityRefused (401) with a reason a person can act on; an ended session says TOKEN_EXPIRED.
// The port lives outside ports/, and this folder imports only its own files, so the shape is restated here; if the port
// moves into ports/, this contract moves with it and imports it.
import { defineContract, expect, expectRefused } from "./contract.ts";

/** IdentityPort as callers use it (port.ts). */
export type IdentityPortShape = {
  readonly via: "local" | "cognito";
  verify(token: string): Promise<{ via: "local" | "cognito"; lookup: { staffId: string } | { identitySubject: string }; authTime: number; secondStep: boolean }>;
};

/** What an identity adapter's test hands the contract. */
export type IdentityHarness = {
  identity: IdentityPortShape;
  /** A token the adapter accepts for one staff member, with or without the second step. */
  token(o: { secondStep: boolean }): Promise<string> | string;
  /** Who that token names: { staffId } or { identitySubject }. */
  who: { staffId: string } | { identitySubject: string };
  /** A token the adapter issued whose session has ended. */
  expiredToken(): Promise<string> | string;
};

/** IdentityRefused (port.ts) without importing it: an Error with the reason (`detail`) and a code. */
const isRefusal = (code?: string) => (e: unknown) => e instanceof Error && typeof (e as { detail?: unknown }).detail === "string" && typeof (e as { code?: unknown }).code === "string" && (code === undefined || (e as { code: string }).code === code);

export const identityPortContract = defineContract("IdentityPort", (make: () => Promise<IdentityHarness> | IdentityHarness) => [
  {
    name: "a token the adapter accepts says who it is: its via, the lookup, the sign-in time in seconds and the second step",
    async run() {
      const h = await make(), v = await h.identity.verify(await h.token({ secondStep: true }));
      expect(v.via === h.identity.via, "via is the adapter's", v.via);
      expect(JSON.stringify(v.lookup) === JSON.stringify(h.who), "the lookup names the staff member", v.lookup);
      expect(typeof v.authTime === "number" && v.authTime > 946_684_800 && v.authTime < 32_503_680_000, "authTime is seconds since 1970", v.authTime);
      expect(v.secondStep === true, "the second step was done", v.secondStep);
    },
  },
  {
    name: "a sign-in without the second step says so (secondStep false)",
    async run() {
      const h = await make();
      if (h.identity.via === "cognito") return;   // the pool requires the second step for everyone (P-567): no such token exists
      const v = await h.identity.verify(await h.token({ secondStep: false }));
      expect(v.secondStep === false, "secondStep false", v);
    },
  },
  {
    name: "an altered token, a token of nothing and an empty token are refused (IdentityRefused, with a reason)",
    async run() {
      const h = await make(), t = await h.token({ secondStep: true });
      const parts = t.split("."), body = parts[1] ?? "", flipped = body.slice(0, -1) + (body.endsWith("A") ? "B" : "A");
      await expectRefused(() => h.identity.verify([parts[0], flipped, ...parts.slice(2)].join(".")), "a token whose body was changed", isRefusal());
      await expectRefused(() => h.identity.verify("not-a-token"), "not a token", isRefusal());
      await expectRefused(() => h.identity.verify(""), "an empty token", isRefusal());
    },
  },
  {
    name: "a token whose session has ended is refused (TOKEN_EXPIRED)",
    async run() {
      const h = await make();
      await expectRefused(async () => h.identity.verify(await h.expiredToken()), "an ended session", isRefusal("TOKEN_EXPIRED"));
    },
  },
]);
