// FO-6 part 3 and part 4a: retainer signing on the fake vendor (api/src/front-office/signing/): the state read and the provider's
// webhook door; the platform's MailPort for "Your signed agreement"; the file store is the retainer feature's
// (LocalFiles, front-office-retainers.ts) and the clock the platform's. The send step is called from FO-5's Send.
// Part 4c: the firm signer's link (on the state read's controller), and on a lane copy only (PLATFORM_ENVIRONMENT=local) the
// stand-in signing page with the fake's links pointing at it; anywhere else the page is not registered, and a start that
// registers it fails (`assertStandInPageAllowed`, Lead 29 on #3490).
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import type { MailPort } from "../../../ports/mail.ts";
import { LocalFiles } from "../front-office/files.ts";
import "../front-office/signing/email-code.ts";   // part 4a: registers the firm's email-code setting (P-564) at start
import { SigningDoorController } from "../front-office/signing/door.controller.ts";
import { SigningDoor } from "../front-office/signing/door.ts";
import { assertStandInPageAllowed, FakeSigningPageController } from "../front-office/signing/fake-page.ts";
import { useSigningMail, useSigningPort } from "../front-office/signing/handlers.ts";
import { SigningHooksController } from "../front-office/signing/hooks.ts";
import { signingPublicBase } from "../front-office/signing/link-mail.ts";
import { fakeSigning } from "../front-office/signing/port.ts";
import { SigningController } from "../front-office/signing/routes.ts";
import { Signing } from "../front-office/signing/service.ts";
import { ConfigRefused, platformConfig } from "../platform/config/settings.ts";
import { PlatformClock } from "../platform/identity/port.ts";
import { MESSAGES_MAIL } from "./platform-messages.ts";

/** The feature for one environment (plan challenge m6: testable without a start). */
export function signingFeatureFor(env: string | undefined) {
  const local = env === "local";
  const feature = {
    controllers: [SigningController, SigningHooksController, SigningDoorController, ...(local ? [FakeSigningPageController] : [])],   // 4b: the public door; 4c: the stand-in page (local only)
    providers: [{ provide: Signing, useFactory: (db: Db, files: LocalFiles, clock: PlatformClock, mail: MailPort) => {
      useSigningMail(mail);
      const now = () => new Date(clock.now());
      // Part 4c: on a lane copy the fake's embedded links open the copy's own stand-in page (else signing.fake.invalid).
      if (local) useSigningPort(fakeSigning({ now, linkBase: signingPublicBase }));
      return new Signing(db, files, { now });
    }, inject: [Db, LocalFiles, PlatformClock, MESSAGES_MAIL] },
    { provide: SigningDoor, useFactory: (db: Db, clock: PlatformClock) => new SigningDoor(db, { now: () => new Date(clock.now()) }), inject: [Db, PlatformClock] }],
  } satisfies Feature;
  assertStandInPageAllowed(feature.controllers, env);
  return feature;
}

/** PF-24w: PLATFORM_ENVIRONMENT is read once per process, by the one loader (config/settings.ts), never from process.env
 *  again (#3490's merge batch: check_pf24w_environment counted this module's read). Unset (an app of this feature alone, as
 *  the tests build) is not local, as platform/files/choose.ts treats it; any other configuration fault stops here. */
function loadedEnvironment(): string | undefined {
  try { return platformConfig().environment; }
  catch (e) { if (e instanceof ConfigRefused && e.environment === "unset") return undefined; throw e; }
}

export default signingFeatureFor(loadedEnvironment());
