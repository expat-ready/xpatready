// PF-4p part 1 routes (R1.62, map row 62). Each declares its access (keys.ts); the client guard does the rest. Activation
// by invitation and sign-in by password are part 2's; the stand-in's door below exists only on a local copy.
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from "@nestjs/common";
import { PortalClient, PortalSignIn, clientOf, type ClientContext } from "./keys.ts";
import { ClientIdentity } from "./service.ts";

type R = { portalClient?: ClientContext };

@Controller("api/portal")
export class PortalController {
  constructor(@Inject(ClientIdentity) private readonly id: ClientIdentity) {}

  /** The local stand-in's sign-in: refused unless PLATFORM_IDENTITY=local (which is refused in test and production). */
  @Post("session/local") @HttpCode(200) @PortalSignIn("the sign-in door: there is no session yet")
  local(@Body() b: unknown) { return this.id.localSignIn(b); }

  @Post("session/end") @HttpCode(200) @PortalClient("a client ends their own sessions")
  end(@Req() r: R) { return this.id.signOut(clientOf(r)); }

  @Get("me") @PortalClient("a client's own account")
  me(@Req() r: R) { return this.id.me(clientOf(r)); }

  @Get("cases") @PortalClient("a client's own cases only")
  cases(@Req() r: R) { return this.id.cases(clientOf(r)); }

  @Get("cases/:id") @PortalClient("one of a client's own cases; any other id is the one 404")
  case(@Req() r: R, @Param("id") id: string) { return this.id.case(clientOf(r), id); }
}
