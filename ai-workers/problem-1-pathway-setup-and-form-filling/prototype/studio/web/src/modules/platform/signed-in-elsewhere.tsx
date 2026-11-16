// PF-6 part 1 (AG-1-55; concept pf-6-staff r2 §4): one session at a time. A tab whose session a newer sign-in ended says
// so in these words, and "Sign in again here" opens the sign-in card (which ends the other device's session in turn).
import * as React from "react";
import { Button } from "@/components/ui/controls";
import { clearSessionEnd } from "./session";

export function SignedInElsewhere() {
  const heading = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => { heading.current?.focus(); }, []);
  return (
    <section aria-labelledby="pf-elsewhere" className="mx-auto mt-6 max-w-md rounded-xl border border-border bg-surface-raised p-6 shadow-sm" data-signed-in-elsewhere>
      <h1 id="pf-elsewhere" ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">Signed in elsewhere</h1>
      <p className="mt-2 text-sm">You signed in on another device.</p>
      <p className="mt-1 text-sm text-text-muted">One session at a time: signing in here ends the session on the other device.</p>
      <Button className="mt-4" onClick={clearSessionEnd}>Sign in again here</Button>
    </section>
  );
}
