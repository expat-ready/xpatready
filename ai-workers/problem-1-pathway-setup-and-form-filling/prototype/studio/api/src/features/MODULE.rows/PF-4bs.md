Entry points: PF-4bs part 2a: `platform-staff-read.ts` registers SignInDoor, SIGN_IN_PORT (the stand-in when PLATFORM_IDENTITY=local, else 503 SIGN_IN_NOT_SET_UP until part 2b) and SIGN_IN_BOX (the server's key ring; a key for this run on a local server without one).
Tests: tests/check_pf4bs_sign_in.ts
