// FO-3v part 1 (brief lead-b-briefs/FO-3v.md; AG-4-58 rules 1-5, AG-4-59, AG-16-73): My account → Video inside PF-6's
// PlatformFrame. Everyone's own settings, no key: "My meeting link" (one https link) and "Use for my video bookings",
// which lists only the sources the person has. Connect Zoom is not shown until Zoom approves the app (rule 1; part 2);
// Meet and Teams come with the calendar connection (not built yet). Every rule is the server's; its refusals show on
// the field.
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Field, Input, Notice, Select } from "@/components/ui/controls";
import { Skeleton } from "@/components/ui/skeleton";
import { PlatformFrame } from "@/modules/platform/frame";
import { staffApi, StaffApiError, useStaffToken } from "@/modules/platform/session";
import { LINK_WORDS, linkLooksOk, MyVideo, SOURCE_WORDS } from "./contract";

const KEY = (token: string | null) => ["fo", "me", "video", token];
const why = (e: unknown) => (e instanceof StaffApiError ? e.message : "Something went wrong. Please try again.");

function VideoForm({ saved }: { saved: MyVideo }) {
  const qc = useQueryClient(), token = useStaffToken();
  const [link, setLink] = React.useState(saved.myMeetingLink ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [done, setDone] = React.useState("");
  const [busy, setBusy] = React.useState<"link" | "choice" | null>(null);
  const input = React.useRef<HTMLInputElement>(null);

  const put = async (what: "link" | "choice", json: Record<string, unknown>, words: string) => {
    setBusy(what); setProblem(null); setDone("");
    try {
      const next = MyVideo.parse(await staffApi("/front-office/me/video", { method: "PUT", json }));
      qc.setQueryData(KEY(token), next);
      setLink(next.myMeetingLink ?? ""); setError(null); setDone(words);
    } catch (e) {
      const f = e instanceof StaffApiError ? e.field("myMeetingLink") : null;
      if (f) { setError(f); input.current?.focus(); } else setProblem(why(e));
    } finally { setBusy(null); }
  };
  const saveLink = (e: React.FormEvent) => {
    e.preventDefault();
    const v = link.trim();
    if (v && !linkLooksOk(v)) { setError(LINK_WORDS); setDone(""); input.current?.focus(); return; }
    void put("link", { myMeetingLink: v || null }, v ? "Meeting link saved." : "Meeting link cleared.");
  };

  return (
    <div className="grid max-w-xl gap-6">
      <form onSubmit={saveLink} className="grid gap-3 rounded-lg border border-border p-4" aria-label="My meeting link" data-video-link-form noValidate>
        <h2 className="text-base font-semibold">My meeting link</h2>
        <p className="text-sm text-text-muted">A link you always use, such as your personal Zoom room. Your video bookings get it when you choose it below.</p>
        <Field label="Meeting link" hint="A full link starting with https://" error={error}>
          <Input ref={input} type="url" inputMode="url" autoComplete="url" value={link} onChange={(e) => { setLink(e.target.value); setError(null); }} placeholder="https://" maxLength={2048} data-video-link />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" busy={busy === "link"} data-video-save>Save link</Button>
          {saved.myMeetingLink ? <Button type="button" variant="ghost" busy={false} onClick={() => void put("link", { myMeetingLink: null }, "Meeting link cleared.")} data-video-clear>Clear link</Button> : null}
        </div>
      </form>

      <section className="grid gap-3 rounded-lg border border-border p-4" aria-labelledby="video-choice-h" data-video-choice>
        <h2 id="video-choice-h" className="text-base font-semibold">Use for my video bookings</h2>
        {saved.sources.length === 0 ? (
          <p className="text-sm text-text-muted" data-video-no-source>You have no video source yet. Your video bookings say "Your join link will follow", and you get a reminder to add one.</p>
        ) : (
          <Field label="Video source" hint="Your choice is used first; if it has no link, the next source you have.">
            <Select value={saved.sourceChoice ?? ""} disabled={busy === "choice"} onChange={(e) => void put("choice", { sourceChoice: e.target.value || null }, "Video choice saved.")} data-video-source>
              {saved.sources.map((s) => <option key={s} value={s}>{SOURCE_WORDS[s]}</option>)}
            </Select>
          </Field>
        )}
      </section>

      <p role="status" className="text-sm text-text-muted" data-video-status>{done}</p>
      {problem ? <Notice tone="danger" title="Not saved">{problem}</Notice> : null}
    </div>
  );
}

function VideoBody() {
  const token = useStaffToken();
  const q = useQuery({ queryKey: KEY(token), enabled: !!token, retry: false, queryFn: async () => MyVideo.parse(await staffApi("/front-office/me/video")) });
  return (
    <>
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Video</h1>
        <p className="mt-1 text-sm text-text-muted">How your video bookings get a join link. Only you can change this.</p>
      </div>
      {q.isError ? <Notice tone="danger" title="Could not load your video settings">{why(q.error)}</Notice>
        : !q.data ? <div role="status" aria-label="Loading your video settings…" data-loading className="grid gap-3"><span className="sr-only">Loading your video settings…</span><Skeleton className="h-24 w-full" /><Skeleton className="h-16 w-full" /></div>
          : <VideoForm saved={q.data} />}
    </>
  );
}

export function VideoPage() {
  return (
    <PlatformFrame crumbs={[{ label: "Video" }]}>
      <VideoBody />
    </PlatformFrame>
  );
}
