// FO-4 part 2a (concept r2 §4 screen 3; BR-8, BR-10; AG-2-26 rules 2-3): what the board, the list and one prospect's
// screen share. "Move to…" is the app's own dropdown (keyboard and mouse; no drag library, STANDARDS §1) and offers only
// the open stages: Won is never offered (it comes from a signature or Convert to client), Lost is Mark lost's. A move
// names the version the screen read; when someone moved the prospect first, nothing changes and the rows are read again.
import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/controls";
import { useToast } from "@/lib/api";
import { Prospect } from "./contract";
import { assigneesQuery, useStaff } from "./sales-frame";
import { staffApi, StaffApiError } from "./session";
export type StageRef = { id: string; label: string; kind: string };
/** Who owns what, in words. Names come from `leads/assignees` (people who may assign get every active colleague);
 *  anyone else sees their own name and "A colleague". A one-user firm shows no owner anywhere (BR-10, X-4). */
export function useOwners() {
  const me = useStaff();
  const q = useQuery(assigneesQuery), a = q.data;
  const name = (id: string | null) => id === null ? "Nobody" : a?.assignees.find((x) => x.staffId === id)?.displayName ?? (id === me.staffId ? me.displayName : "A colleague");
  // Until the answer is in (or when it fails) no owner is shown: a one-user firm never sees an owner flash by (break m8).
  // `settled`: the answer is in, or failed (R1.32: Leads waits for it, so its chips never change under the person).
  // A failed answer is not a one-user firm (break 9): the owner lines and buttons stay, the picker says it has nobody.
  return { oneUser: a?.oneUser ?? !q.isError, choices: a?.assignees ?? [], name, settled: !q.isPending };
}
/** One request at a time (review M1): a second click before the first answer is dropped, also before React has drawn
 *  the button as busy. `take()` is true for the click that may send; `free()` when the answer is in. */
export function useLock() {
  const busy = React.useRef(false);
  return React.useMemo(() => ({ take: () => (busy.current ? false : (busy.current = true)), free: () => { busy.current = false; } }), []);
}
/** Where focus goes when a panel, a dialog or a move is over (review M2, WCAG 2.4.3): `mark()` remembers the button in
 *  use; `back()` returns to it, or to `selector` when given, or to the page's heading when that button is gone. */
export function useReturnFocus() {
  const from = React.useRef<HTMLElement | null>(null);
  return React.useMemo(() => ({
    mark: () => { from.current = document.activeElement as HTMLElement | null; },
    back: (selector?: string) => setTimeout(() => {
      const h = document.querySelector<HTMLElement>("main h1") ?? document.querySelector<HTMLElement>("h1");
      const el = (selector ? document.querySelector<HTMLElement>(selector) : null) ?? (from.current?.isConnected && !(from.current as HTMLButtonElement).disabled ? from.current : null);
      if (!el) h?.setAttribute("tabindex", "-1");
      (el ?? h)?.focus();
    }, 60),
  }), []);
}
export const STALE_NOTE = "Nothing was changed. The page shows where it is now.";
export function useMove() {
  const qc = useQueryClient();
  const toast = useToast(), focus = useReturnFocus();
  return useMutation({
    mutationFn: async (v: { id: string; number: string; from: string; to: StageRef; version?: string }) => {
      // The board and the list carry no version, so the prospect is read first: a stage other than the one shown
      // means someone moved it since (BR-8), and that is refused here exactly as the server refuses a stale version.
      const now = v.version === undefined ? Prospect.parse(await staffApi(`/front-office/prospects/${v.id}`)) : null;
      if (now && now.stage.id !== v.from) throw new StaffApiError(409, { status: 409, code: "STALE", detail: `Someone moved ${v.number} to ${now.stage.label}.` });
      return Prospect.parse(await staffApi(`/front-office/prospects/${v.id}/move`, { method: "POST", json: { stageId: v.to.id, cause: "PERSON", version: v.version ?? now!.version } }));
    },
    onSuccess: (p) => toast.push({ tone: "ok", text: `${p.number} is now in ${p.stage.label}.` }),
    onError: (e) => toast.push({ tone: "danger", text: !(e instanceof StaffApiError) ? "Could not move the prospect. Please try again." : e.problem.code === "STALE" ? `${e.message.replace(/ Reload it\.$/, "")} ${STALE_NOTE}` : e.message }),
    // Moved or refused, everything shown about prospects is read again, so the screen is never left stale.
    // The card or row is drawn again in its new place: focus follows it to the same prospect's "Move to…".
    onSettled: async (_r, _e, v) => { await qc.invalidateQueries({ queryKey: ["fo", "prospects"] }); focus.back(`[data-move="${v.number}"]`); },
  });
}
const ITEM = "flex min-h-9 cursor-pointer items-center rounded-md px-2 text-sm outline-none data-[highlighted]:bg-text/5";
/** "Move to…" for one prospect in an open stage: the other open stages of its pipeline. */
export function MoveMenu({ prospect, from, stages, version, move }: { prospect: { id: string; number: string; name: string }; from: string; stages: StageRef[]; version?: string; move: ReturnType<typeof useMove> }) {
  const to = stages.filter((s) => s.kind === "ACTIVE" && s.id !== from);
  if (!to.length) return null;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild><Button size="sm" variant="outline" busy={move.isPending && move.variables?.id === prospect.id} aria-label={`Move to…: ${prospect.name}, ${prospect.number}`} data-move={prospect.number}>Move to…</Button></DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-56 rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
          {to.map((s) => <DropdownMenu.Item key={s.id} className={ITEM} data-move-to={s.label} onSelect={() => move.mutate({ id: prospect.id, number: prospect.number, from, to: s, version })}>{s.label}</DropdownMenu.Item>)}
          <DropdownMenu.Label className="max-w-64 px-2 py-1.5 text-xs text-text-muted">Won is set when the retainer is signed, or by Convert to client.</DropdownMenu.Label>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
