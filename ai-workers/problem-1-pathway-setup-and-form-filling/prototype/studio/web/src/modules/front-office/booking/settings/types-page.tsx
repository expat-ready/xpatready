// FO-3st3 part 1 (brief lead-b-briefs/FO-3st3.md with P-626-order.md A3; concept fo-3-booking r2 §4 Library list +
// drawer, §5 Booking types; AG-4-9, C5): Booking types, inside PF-6's PlatformFrame (A3), its menu entry one line in
// ACCOUNT_SECTIONS for `agent/booking-event-type:list`. The list (Name, Length, Hosts, On booking page; a case type
// "Never (case type)"), New booking type for `:edit`, and a row opens the drawer (?type= in the address). A person
// without `:list` who opens the address sees the server's refusal.
import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, Notice, Table } from "@/components/ui/controls";
import { Skeleton } from "@/components/ui/skeleton";
import { PlatformFrame, usePlatformStaff } from "@/modules/platform/frame";
import { staffApi, StaffApiError, useStaffToken } from "@/modules/platform/session";
import { isCaseType, KEYS, TypeList, W } from "./contract";
import { TypePanel } from "./type-panel";

type Staff = { id: string; displayName: string; status: string };

function TypesBody() {
  const me = usePlatformStaff(), token = useStaffToken(), edit = me.keys.includes(KEYS.edit);
  const list = useQuery({ queryKey: ["fo", "booking-types", token], enabled: !!token, retry: false, queryFn: async () => TypeList.parse(await staffApi("/front-office/booking-types")).types });
  // Host names for those who may read the team (Owner, Admin); others see the number of hosts.
  const staff = useQuery({ queryKey: ["pf", "staff", "list", token], enabled: !!token && me.keys.includes(KEYS.staff), retry: false,
    queryFn: async () => (await staffApi<{ staff: Staff[] }>("/platform/staff")).staff });
  const [params, setParams] = useSearchParams();
  const opener = React.useRef<HTMLElement | null>(null), addButton = React.useRef<HTMLButtonElement>(null);
  const open = (id: string | null) => { const p = new URLSearchParams(params); if (id) p.set("type", id); else p.delete("type"); setParams(p, { replace: !id }); };
  const typeId = params.get("type");
  if (list.isError) return <Notice tone="danger" title="Not available"><span data-types-refused>{list.error instanceof StaffApiError ? list.error.message : "Could not load the booking types. Please try again."}</span></Notice>;
  const names = staff.data ?? null, hostWords = (ids: string[]) => !ids.length ? "None" : names ? ids.map((id) => names.find((s) => s.id === id)?.displayName ?? "Former staff").join(", ") : String(ids.length);
  return (
    <section aria-labelledby="types-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 id="types-title" className="text-xl font-semibold">{W.title}</h1><p className="text-sm text-text-muted">{W.sub}</p></div>
        {edit ? <Button ref={addButton} data-new-type onClick={(e) => { opener.current = e.currentTarget; open("new"); }}>{W.add}</Button> : null}
      </div>
      {!list.data ? <div role="status" aria-label="Loading booking types" data-loading data-types-loading className="flex flex-col gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        : !list.data.length ? <p className="rounded-xl border border-dashed border-border p-6 text-sm text-text-muted" data-types-empty>{W.empty}</p>
          : <Table head={["Name", "Length", "Hosts", "On booking page"]} label="Booking types">
            {list.data.map((t) => <tr key={t.id} data-type-row={t.slug}>
              <td><button type="button" className="text-left font-medium text-text-link underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" onClick={(e) => { opener.current = e.currentTarget; open(t.id); }}>{t.name}</button>
                {!t.active ? <span className="ml-2 text-xs text-text-muted">Retired</span> : null}</td>
              <td>{t.minutes} min</td><td>{hostWords(t.hostStaffIds)}</td>
              <td data-on-page>{isCaseType(t) ? W.caseCell : t.onBookingPage ? "Yes" : "No"}</td>
            </tr>)}
          </Table>}
      {typeId && (typeId !== "new" || edit) ? <TypePanel key={typeId} me={me} typeId={typeId} staff={names} onClose={() => open(null)} onOpen={(id) => open(id)}
        returnFocus={() => (opener.current?.isConnected ? opener.current : addButton.current)} /> : null}
    </section>
  );
}

export function BookingTypesPage() {
  return <PlatformFrame crumbs={[{ label: W.title }]}><TypesBody /></PlatformFrame>;
}
