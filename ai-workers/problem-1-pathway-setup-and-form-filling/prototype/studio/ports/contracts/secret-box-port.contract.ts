// PF-0c: SecretBoxPort's contract (ports/secret-box.ts). Run by fakeSecretBox and by aesGcmSecretBox
// (api/src/platform/secret-box/aes-gcm.ts). The port file's "What every adapter promises": a sealed value names its key
// version; it opens only for the same owner (firm, person, purpose), so firm A's credentials never open for firm B and
// "zoom" never opens as "calendar"; a tampered value, or one whose key version is no longer held, is refused
// (SecretRefused), never half-read; reseal opens then seals with the current key, the same value back when current.
import { defineContract, expect, expectRefused } from "./contract.ts";
import { SealedSecret, SecretRefused, type SecretBoxPort, type SecretOwner } from "../secret-box.ts";

/** `make({ current, held })` gives a box sealing with version `current` and holding the key versions `held` (current
 *  included); two boxes made with the same version hold the same key for it. */
export type SecretBoxMaker = (o: { current: number; held: number[] }) => Promise<SecretBoxPort> | SecretBoxPort;

const FIRM_A = "0c0c0c0c-0000-4000-8000-0000000000a1", FIRM_B = "0c0c0c0c-0000-4000-8000-0000000000b2";
const zoom = (firmId = FIRM_A, personId: string | null = null): SecretOwner => ({ firmId, personId, purpose: "zoom" });
const refused = (code?: string) => (e: unknown) => e instanceof SecretRefused && (code === undefined || e.code === code);
const PLAIN = "sample-zoom-credential-0123";   // a made-up value, never a real credential

export const secretBoxPortContract = defineContract("SecretBoxPort", (make: SecretBoxMaker) => [
  {
    name: "a sealed value opens for its owner and names the current key version",
    async run() {
      const box = await make({ current: 1, held: [1] }), sealed = box.seal(zoom(), PLAIN);
      expect(SealedSecret.safeParse(sealed).success && !sealed.includes(PLAIN), "a sealed string that does not hold the value", sealed.slice(0, 12));
      expect(box.open(zoom(), sealed) === PLAIN, "opens for its owner");
      expect(box.versionOf(sealed) === 1 && box.currentVersion() === 1, "names version 1");
    },
  },
  {
    name: "another firm, another person or another purpose is refused",
    async run() {
      const box = await make({ current: 1, held: [1] }), sealed = box.seal(zoom(FIRM_A, "staff-r"), PLAIN);
      await expectRefused(() => box.open(zoom(FIRM_B, "staff-r"), sealed), "firm B", refused("TAMPERED_OR_OTHER_OWNER"));
      await expectRefused(() => box.open(zoom(FIRM_A, "staff-o"), sealed), "another person", refused("TAMPERED_OR_OTHER_OWNER"));
      await expectRefused(() => box.open(zoom(FIRM_A, null), sealed), "the firm-wide owner", refused("TAMPERED_OR_OTHER_OWNER"));
      await expectRefused(() => box.open({ firmId: FIRM_A, personId: "staff-r", purpose: "calendar" }, sealed), "another purpose", refused("TAMPERED_OR_OTHER_OWNER"));
    },
  },
  {
    name: "a firm id is compared in lower case (one firm is one key)",
    async run() {
      const box = await make({ current: 1, held: [1] }), sealed = box.seal(zoom(FIRM_A.toUpperCase()), PLAIN);
      expect(box.open(zoom(FIRM_A), sealed) === PLAIN, "sealed with the upper-case id, opened with the lower-case one");
    },
  },
  {
    name: "a changed value is refused, never half-read",
    async run() {
      const box = await make({ current: 1, held: [1] }), sealed = box.seal(zoom(), PLAIN);
      const last = sealed.slice(-1), changed = sealed.slice(0, -1) + (last === "A" ? "B" : "A");
      await expectRefused(() => box.open(zoom(), changed), "the last character changed", refused());
      await expectRefused(() => box.open(zoom(), sealed.slice(0, -6)), "cut short", refused());
      await expectRefused(() => box.versionOf("plain text"), "not a sealed value", refused("NOT_SEALED"));
    },
  },
  {
    name: "a value of a key version no longer held is refused (KEY_RETIRED)",
    async run() {
      const old = await make({ current: 1, held: [1] }), sealed = old.seal(zoom(), PLAIN);
      const rotated = await make({ current: 2, held: [2] });
      await expectRefused(() => rotated.open(zoom(), sealed), "version 1 after it was retired", refused("KEY_RETIRED"));
    },
  },
  {
    name: "after a rotation an older value still opens while its key is held, and reseal moves it to the current version",
    async run() {
      const old = await make({ current: 1, held: [1] }), sealed = old.seal(zoom(), PLAIN);
      const box = await make({ current: 2, held: [1, 2] });
      expect(box.open(zoom(), sealed) === PLAIN, "version 1 opens while held");
      const moved = box.reseal(zoom(), sealed);
      expect(box.versionOf(moved) === 2 && box.open(zoom(), moved) === PLAIN, "reseal gives a version-2 value of the same credential", moved.slice(0, 8));
      expect(box.reseal(zoom(), moved) === moved, "resealing a current value gives the same value back");
      await expectRefused(() => box.reseal(zoom(FIRM_B), sealed), "reseal for another owner", refused("TAMPERED_OR_OTHER_OWNER"));
    },
  },
]);
