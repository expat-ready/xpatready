Tests: `tests/journeys/j_100.ts` (R1.100: sign-up → accept → confirm by the inbox email → a new version asks again at the next sign-in), `tests/check_pf5v_signup_mail.ts` part 2 (the sign-up emails through MESSAGES_MAIL, QA-481)
Entry points: `runtimeSignUpPorts(config, identity, env, mail)` (mail: the app MailPort, MESSAGES_MAIL), `new LocalSignUp(now, mail?)`
