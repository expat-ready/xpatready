// PF-4bc (P-606 (8)): IdentityAdminPort's contract (api/src/platform/identity/session/provider.ts), run by
// LocalIdentityAdmin and CognitoIdentityAdmin (on the recorded fake Cognito, tests/fixtures/pf4bc-cognito) in
// tests/check_pf4bc_cognito_admin.ts. The port file's sentences: createUser creates the provider user, or reuses the one an
// earlier, rolled-back accept left, and returns its subject; handOff gives the set-password page; a sign-in code says who
// signs in, once, for 5 minutes; twoStep reads the person's second step and resetTwoStep clears it; signOutEverywhere
// ends the person's provider sessions. The port lives outside ports/ and this folder imports only its own files, so the
// shape is restated here (as identity-port.contract.ts does).
import { defineContract, expect, expectRefused } from "./contract.ts";

type ProviderUser = { staffId: string; subject: string | null; email: string };
/** IdentityAdminPort as callers use it (provider.ts). */
export type IdentityAdminPortShape = {
  readonly via: "local" | "cognito";
  createUser(email: string): Promise<{ subject: string }>;
  handOff(firmKey: string, email: string): Promise<{ kind: "set-password"; url: string }>;
  twoStep(u: ProviderUser): Promise<{ method: "TOTP" | "PASSKEY" | null }>;
  resetTwoStep(u: ProviderUser): Promise<void>;
  signOutEverywhere(u: ProviderUser): Promise<void>;
  redeem(code: string): Promise<{ firmKey: string; email: string }>;
};
/** What an adapter's test hands the contract. */
export type IdentityAdminHarness = {
  admin: IdentityAdminPortShape;
  /** Moves the adapter's clock on. */
  advance(ms: number): void;
  /** The person sets up an authenticator app at sign-in (the provider records it). */
  enrol(u: ProviderUser): void;
  /** How many provider sign-outs that person has had. */
  signOuts(u: ProviderUser): number;
};
/** The problem the port throws for a refused code (an HttpException with status 401 and code SIGN_IN_CODE_REFUSED). */
const refusedCode = (e: unknown) => { const x = e as { getStatus?: () => number; getResponse?: () => { code?: string } }; return x?.getStatus?.() === 401 && x.getResponse?.().code === "SIGN_IN_CODE_REFUSED"; };
const codeOf = (url: string) => /#code=([A-Za-z0-9_-]{20,})$/.exec(url)?.[1] ?? "";
let n = 0;
const person = (): ProviderUser & { email: string } => ({ staffId: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, subject: null, email: `contract.person${n}.${process.pid}@example.com` });

export const identityAdminPortContract = defineContract("IdentityAdminPort", (make: () => IdentityAdminHarness) => [
  { name: "createUser returns the provider's subject; a second call for the same email (a rolled-back accept) reuses it", async run() {
    const { admin } = make(), p = person();
    const a = await admin.createUser(p.email), b = await admin.createUser(p.email);
    expect(typeof a.subject === "string" && a.subject.length > 0 && a.subject === b.subject, "one subject, reused", { a, b });
    expect((await admin.createUser(person().email)).subject !== a.subject, "another email is another subject");
  } },
  { name: "the hand-off's code says who signs in, once", async run() {
    const { admin } = make(), p = person();
    await admin.createUser(p.email);
    const h = await admin.handOff("firm-a", p.email), code = codeOf(h.url);
    expect(h.kind === "set-password" && code, "a set-password hand-off with a one-time code", h);
    const who = await admin.redeem(code);
    expect(who.firmKey === "firm-a" && who.email === p.email, "who signs in", who);
    await expectRefused(() => admin.redeem(code), "the same code again", refusedCode);
  } },
  { name: "a code past 5 minutes, an unknown code and a non-string are refused (401 SIGN_IN_CODE_REFUSED)", async run() {
    const h = make(), p = person();
    await h.admin.createUser(p.email);
    const code = codeOf((await h.admin.handOff("firm-a", p.email)).url);
    h.advance(5 * 60_000 + 1);
    await expectRefused(() => h.admin.redeem(code), "an expired code", refusedCode);
    await expectRefused(() => h.admin.redeem("A".repeat(43)), "an unknown code", refusedCode);
    await expectRefused(() => h.admin.redeem({} as never), "a non-string", refusedCode);
  } },
  { name: "twoStep reads an enrolled authenticator app as TOTP; after resetTwoStep it is null (set up again at next sign-in)", async run() {
    const h = make(), p = person(), u = { ...p, subject: (await h.admin.createUser(p.email)).subject };
    h.enrol(u);
    expect((await h.admin.twoStep(u)).method === "TOTP", "TOTP once enrolled");
    await h.admin.resetTwoStep(u);
    expect((await h.admin.twoStep(u)).method === null, "null after the reset");
  } },
  { name: "signOutEverywhere ends that person's provider sessions, and nobody else's", async run() {
    const h = make(), p = person(), q = person();
    const u = { ...p, subject: (await h.admin.createUser(p.email)).subject }, v = { ...q, subject: (await h.admin.createUser(q.email)).subject };
    await h.admin.signOutEverywhere(u);
    expect(h.signOuts(u) === 1 && h.signOuts(v) === 0, "one sign-out, for that person only", [h.signOuts(u), h.signOuts(v)]);
  } },
]);
