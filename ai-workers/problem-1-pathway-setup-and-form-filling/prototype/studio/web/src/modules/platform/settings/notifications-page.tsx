// PF-18s part 3 (concept screens/PF-18s §4 board A, approved by Lead 19 on #2332 with the challenge's Majors; AG-16-10, AG-16 §3.3;
// R1.92): My account → Notifications, everyone's own. One row per group that can reach the person (the API filters them), each with its
// In-app and Email checkbox, and the security emails, always on with no control. One Save sends only the changed groups with the view's
// version (challenge m3: plain checkboxes, "Changes apply when you press Save"). A stale view (second tab) is 409: the latest is loaded
// and the person's own changes stay on top (m2). A refusal shows the server's words; a failed send keeps the changes. Leaving the page
// with unsaved changes asks once (beforeunload; an in-app menu click is not blocked: BrowserRouter has no blocker, m2).
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Notice, Table } from "@/components/ui/controls";
import { useToast } from "@/lib/api";
import { PlatformFrame } from "../frame";
import { NotificationTabs } from "../notifications/all-page";
import { staffApi, StaffApiError, useStaffToken } from "../session";
import { changedGroups, draftOf, isDefault, overlay, PrefsView, type Draft } from "./notifications-contract";

type Problem = { tone: "warn" | "danger"; title: string; text: string };
const KEY = (t: string | null) => ["pf", "notifications", "prefs", t];

function NotificationsBody() {
  const token = useStaffToken(), qc = useQueryClient(), toast = useToast();
  const q = useQuery({ queryKey: KEY(token), enabled: !!token, retry: false, queryFn: async () => PrefsView.parse(await staffApi("/platform/me/notifications")) });
  const [base, setBase] = React.useState<PrefsView | null>(null);   // the view the draft was made from (its version is sent)
  const [draft, setDraft] = React.useState<Draft>({});
  const [problem, setProblem] = React.useState<Problem | null>(null);
  const [sending, setSending] = React.useState(false);
  const busy = React.useRef(false), notice = React.useRef<HTMLDivElement>(null), heading = React.useRef<HTMLHeadingElement>(null);
  const changes = base ? changedGroups(base, draft) : [];
  const dirty = changes.length > 0;
  // The first view, and any newer one read in the background while nothing is unsaved (break m5: coming back to the page in the app).
  React.useEffect(() => { if (q.data && (!base || (!dirty && q.data.version !== base.version))) { setBase(q.data); setDraft(draftOf(q.data)); } }, [q.data, base, dirty]);
  React.useEffect(() => {
    if (!dirty) return;
    const ask = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", ask); return () => window.removeEventListener("beforeunload", ask);
  }, [dirty]);
  React.useEffect(() => { if (problem) notice.current?.focus(); }, [problem]);

  const header = (
    <header>
      <NotificationTabs />{/* PF-18ns: "Settings | All" (Lead 10 on #3279 Q2) */}
      <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold outline-none">Notifications</h1>
      <p className="mt-1 text-sm text-text-muted">Choose how you hear about your work. You only see the groups that can reach you.</p>
    </header>
  );
  const wrap = (body: React.ReactNode) => <div className="mx-auto flex max-w-4xl flex-col gap-5">{header}{body}</div>;
  if (q.isError) return wrap(<Notice tone="danger" title="Could not load your notification settings" action={<Button variant="outline" size="sm" onClick={() => void q.refetch()} data-prefs-retry>Try again</Button>}>
    <span data-prefs-load-error>{q.error instanceof StaffApiError ? q.error.message : "Please try again."}</span></Notice>);
  if (!base) return wrap(<p role="status" className="text-sm text-text-muted" data-loading>Loading your notification settings…</p>);

  const set = (group: string, field: "inApp" | "email", on: boolean) => { setProblem(null); setDraft((d) => ({ ...d, [group]: { ...d[group], [field]: on } })); };
  const save = async () => {
    if (busy.current || !dirty) return;   // one save in flight (Save is aria-disabled while it runs; it keeps focus, break m4)
    busy.current = true; setSending(true); setProblem(null);
    try {
      const saved = PrefsView.parse(await staffApi("/platform/me/notifications", { method: "PUT", json: { version: base.version, groups: changes } }));
      qc.setQueryData(KEY(token), saved); setBase(saved); setDraft(draftOf(saved));
      toast.push({ tone: "ok", text: "Notification settings saved" });
      heading.current?.focus();   // Save is now disabled (nothing to save): focus goes to the page's heading, not <body> (review m4)
    } catch (e) {
      if (e instanceof StaffApiError && (e.status === 409 || e.status === 422)) {
        // A stale view (409), or a refusal (422) that may come from a role change while the page was open (the version hashes only the
        // saved rows, so a role change is never a 409: break M1). Either way the latest view is read again (the shared Problem parser
        // keeps no `current`) and the person's own changes are laid on top; a group that no longer reaches them is dropped.
        const current = await staffApi("/platform/me/notifications").then((v) => PrefsView.safeParse(v)).catch(() => null);
        if (!current?.success) { setProblem({ tone: "danger", title: "Not saved", text: `${e.message} We could not load your latest settings: reload the page.` }); return; }
        const next = overlay(current.data, base, draft), left = changedGroups(current.data, next).length;
        const gone = changes.filter((c) => !current.data.groups.some((g) => g.group === c.group)).map((c) => base.groups.find((g) => g.group === c.group)?.label ?? c.group);
        setDraft(next); setBase(current.data); qc.setQueryData(KEY(token), current.data);
        const tail = left ? "We've loaded the latest; your unsaved changes are kept on top. Save again." : "We've loaded the latest; it already matches your changes, so there is nothing left to save.";
        if (gone.length) setProblem({ tone: "warn", title: "Your groups changed", text: `${gone.length === 1 ? "This group no longer reaches you" : "These groups no longer reach you"}, so ${gone.length === 1 ? "its" : "their"} changes were removed: ${gone.join(", ")}. ${tail}` });
        else if (e.status === 409) setProblem({ tone: "warn", title: "Changed elsewhere", text: `${e.message} ${tail}` });
        else setProblem({ tone: "danger", title: "Not saved", text: e.message });
      } else if (e instanceof StaffApiError && e.status >= 400 && e.status < 500) {
        setProblem({ tone: "danger", title: "Not saved", text: e.message });
      } else {
        setProblem({ tone: "danger", title: "Not saved", text: "Your changes are still here; try again." });
      }
    } finally { busy.current = false; setSending(false); }
  };

  const box = (g: PrefsView["groups"][number], field: "inApp" | "email", name: string) => (
    <input type="checkbox" className="size-4 accent-[var(--color-primary)]" aria-label={`${name} for ${g.label}`} checked={draft[g.group]?.[field] ?? false}
      onChange={(e) => set(g.group, field, e.currentTarget.checked)} disabled={sending} data-pref={`${g.group}.${field}`} />
  );
  return wrap(<>
    {problem ? <div ref={notice} tabIndex={-1} className="outline-none" data-prefs-problem={problem.tone}>
      <Notice tone={problem.tone} title={problem.title}><span data-prefs-problem-text>{problem.text}</span></Notice></div> : null}
    <Table label="Notification settings" head={["Group", "In app", "Email"]} headClass={[undefined, "w-20 text-center", "w-20 text-center"]}>
      {base.groups.map((g) => <tr key={g.group} data-pref-row={g.group}>
        <td className="[overflow-wrap:anywhere]"><span className="font-medium">{g.label}</span>
          {isDefault(g, draft[g.group]) ? <span className="ml-2 text-xs text-text-muted" data-pref-default>Default</span> : null}
          <span className="block text-sm text-text-muted">{g.whatIsInIt}</span></td>
        <td className="text-center">{box(g, "inApp", "In app")}</td>
        <td className="text-center">{box(g, "email", "Email")}</td>
      </tr>)}
      <tr data-pref-security>
        <td className="[overflow-wrap:anywhere]"><span className="font-medium">{base.security.label}</span></td>
        <td colSpan={2} className="text-center text-sm text-text-muted">Always on</td>
      </tr>
    </Table>
    <div className="flex flex-wrap items-center justify-end gap-3">
      <p className="text-sm text-text-muted" data-prefs-hint>{dirty ? `${changes.length} unsaved ${changes.length === 1 ? "change" : "changes"}. ` : ""}Changes apply when you press Save.</p>
      <Button onClick={() => void save()} disabled={!dirty} aria-disabled={sending || undefined} aria-busy={sending || undefined} data-prefs-save>{sending ? "Saving…" : "Save"}</Button>
    </div>
  </>);
}

export function NotificationsPage() {
  return <PlatformFrame crumbs={[{ label: "Notifications" }]}><NotificationsBody /></PlatformFrame>;
}
