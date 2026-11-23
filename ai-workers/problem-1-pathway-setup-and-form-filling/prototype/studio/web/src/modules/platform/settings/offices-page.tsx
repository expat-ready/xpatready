// PF-18s part 1 (concept screens/PF-18s §4 boards B and C, approved by Lead 19 on #2332 with the challenge's Majors; AG-16-68,
// AG-16-75 rule 1, AG-1-74; R1.92): My account → Offices, for Owner and Admin (agent/settings:edit, challenge M1). With one office the
// firm never sees an office list or a zone: only "Add an office" and what it does. From two offices: the list (name, where, time
// zone, hours) with Edit, and "Who works where" (each person's office, Change in a right panel). Hours and closed days per office are
// AG-16-75's, not built here (read-only summary). Everyone else who opens the address sees a plain refusal.
// PF-31 (EXPERIENCE §2.12): each office's edit has its own address, /platform/offices/:id; its Edit is a real link, so a click
// opens it in a workspace tab (or focuses the tab that has it) and Ctrl/Cmd-click opens it in the background.
import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, buttonVariants, Notice, Table } from "@/components/ui/controls";
import { useTabTitle } from "@/components/workspace";
import { PlatformFrame, usePlatformStaff } from "../frame";
import { staffApi, StaffApiError, useStaffToken } from "../session";
import { OfficePanel } from "./office-panel";
import { hoursLine, OFFICES_KEY, OfficeList, People, PLACE_KEY, Provinces, whereLine, type Office, type Person } from "./offices-contract";
import { PlacePanel } from "./place-panel";

const Empty = ({ children }: { children: React.ReactNode }) => <p data-empty className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-text-muted">{children}</p>;

function WhoWorksWhere({ offices }: { offices: Office[] }) {
  const token = useStaffToken();
  // Its own cache entry (break B1): Team, Licences and the booking pages keep a wider shape of the same read under ["pf","staff","list"].
  const people = useQuery({ queryKey: ["pf", "staff", "placements", token], enabled: !!token, retry: false, queryFn: async () => People.parse(await staffApi("/platform/staff")) });
  const [placing, setPlacing] = React.useState<Person | null>(null);
  const opener = React.useRef<HTMLElement | null>(null);
  if (people.isError) return <Notice tone="danger" title="Could not load your team">{people.error instanceof StaffApiError ? people.error.message : "Please reload the page."}</Notice>;
  if (!people.data) return <p role="status" className="text-sm text-text-muted">Loading who works where…</p>;
  const active = people.data.staff.filter((p) => p.status !== "DEACTIVATED"), unplaced = active.filter((p) => !p.officeId).length;
  const officeName = (id: string | null) => (id ? offices.find((o) => o.id === id)?.name ?? "An office" : "No office");
  return (
    <section aria-labelledby="who-where-h" className="flex flex-col gap-3" data-who-works-where>
      <div><h2 id="who-where-h" className="text-lg font-semibold">Who works where</h2>
        <p className="text-sm text-text-muted">A person's deadlines, reminders and bookings show in their office's time zone.</p></div>
      {unplaced ? <Notice tone="warn" title={`${unplaced} ${unplaced === 1 ? "person has" : "people have"} no office yet`}><span data-unplaced>Their times use the firm's time zone until you place them.</span></Notice> : null}
      {!active.length ? <Empty>No active staff yet.</Empty> : (
        <Table label="Who works where" head={["Person", "Office", <span key="a" className="sr-only">Change</span>]}>
          {active.map((p) => <tr key={p.id} data-place-row={p.displayName}>
            <td className="font-medium [overflow-wrap:anywhere]">{p.displayName}</td><td data-place-office-name className="[overflow-wrap:anywhere]">{officeName(p.officeId)}</td>
            <td className="text-right"><Button variant="outline" size="sm" aria-label={`Change office for ${p.displayName}`} onClick={(e) => { opener.current = e.currentTarget; setPlacing(p); }} data-place-open>Change</Button></td>
          </tr>)}
        </Table>
      )}
      <PlacePanel person={placing} offices={offices} onClose={() => setPlacing(null)} returnFocus={() => opener.current} />
    </section>
  );
}

function OfficesBody() {
  const me = usePlatformStaff(), token = useStaffToken();
  const allowed = me.keys.includes(OFFICES_KEY);
  const list = useQuery({ queryKey: ["pf", "offices", token], enabled: !!token && allowed, retry: false, queryFn: async () => OfficeList.parse(await staffApi("/platform/offices")) });
  const provinces = useQuery({ queryKey: ["pf", "offices", "provinces", token], enabled: !!token && allowed, retry: false, staleTime: Infinity, queryFn: async () => Provinces.parse(await staffApi("/platform/offices/provinces")).provinces });
  const [adding, setAdding] = React.useState(false);
  const { id } = useParams(), navigate = useNavigate();
  const shown = id && list.data?.multipleOffices ? list.data.offices.find((o) => o.id === id) ?? null : null;
  const editing: Office | "new" | null = adding ? "new" : shown;
  useTabTitle(shown ? `Office: ${shown.name}` : null);
  const setEditing = (o: "new" | null) => { if (o === "new") setAdding(true); else { setAdding(false); if (id) navigate("/platform/offices"); } };
  const [firstAdded, setFirstAdded] = React.useState(false);
  const opener = React.useRef<HTMLElement | null>(null), heading = React.useRef<HTMLHeadingElement>(null);
  const open = (o: "new") => (e: React.MouseEvent<HTMLElement>) => { opener.current = e.currentTarget; setEditing(o); };
  const header = (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold outline-none">Offices</h1>
        <p className="mt-1 text-sm text-text-muted">In Settings: Advanced → Offices. Each office keeps its own time zone once you have more than one.</p></div>
      {allowed && list.data && provinces.data ? <Button onClick={open("new")} data-office-add>Add an office</Button> : null}
    </header>
  );
  if (!allowed) return <div className="mx-auto flex max-w-5xl flex-col gap-4">{header}<Notice tone="info" title="Not available"><span data-offices-refused>Only an Owner or Admin can manage the firm's offices.</span></Notice></div>;
  const failed = list.error ?? provinces.error;
  if (failed) return <div className="mx-auto flex max-w-5xl flex-col gap-4">{header}<Notice tone="danger" title="Could not load the offices"><span data-offices-error>{failed instanceof StaffApiError ? failed.message : "Please reload the page."}</span></Notice></div>;
  if (!list.data || !provinces.data) return <div className="mx-auto flex max-w-5xl flex-col gap-4">{header}<p role="status" className="text-sm text-text-muted" data-loading>Loading the offices…</p></div>;
  const l = list.data;
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      {header}
      {!l.multipleOffices ? (
        <section className="rounded-xl border border-border bg-surface-raised p-5" data-one-office>
          <h2 className="text-base font-semibold">Your firm works from one place</h2>
          <p className="mt-1 text-sm text-text-muted">Times, hours and closed days are the firm's own. If you open a second office, add it here: it gets its own time zone, and each person keeps the firm's time zone until you place them in an office.</p>
        </section>
      ) : (
        <>
          {firstAdded ? <Notice tone="ok" title="Your firm now has offices"><span data-first-added>Your current office was written from the firm's own time zone, hours and closed days.</span></Notice> : null}
          <Table label="Offices" head={["Name", "Where", "Time zone", "Hours", <span key="e" className="sr-only">Edit</span>]} headClass={[undefined, "hidden sm:table-cell", undefined, "hidden md:table-cell"]}>
            {l.offices.map((o) => <tr key={o.id} data-office-row={o.name}>
              <td className="min-w-32 font-medium [overflow-wrap:anywhere]">{o.name}{o.isFirst ? <span className="block text-xs font-normal text-text-muted">First office</span> : null}<span className="block text-xs font-normal text-text-muted sm:hidden">{whereLine(o)}</span></td>
              <td className="hidden sm:table-cell">{whereLine(o)}</td><td data-office-zone-cell>{o.timeZone.split("/").map((part, i) => <React.Fragment key={i}>{i ? <>/<wbr /></> : null}{part}</React.Fragment>)}</td><td className="hidden text-sm md:table-cell">{hoursLine(o.businessHours)}</td>
              <td className="text-right"><Link to={`/platform/offices/${o.id}`} className={buttonVariants({ variant: "outline", size: "sm" })} aria-label={`Edit ${o.name}`} onClick={(e) => { opener.current = e.currentTarget; }} data-office-edit data-workspace-open>Edit</Link></td>
            </tr>)}
          </Table>
          {me.keys.includes(PLACE_KEY) ? <WhoWorksWhere offices={l.offices} /> : null}
        </>
      )}
      <OfficePanel open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }} office={editing === "new" ? null : editing} provinces={provinces.data}
        returnFocus={() => (opener.current?.isConnected ? opener.current : heading.current)} onAdded={(first) => setFirstAdded(first)} />
    </div>
  );
}

export function OfficesPage() {
  return <PlatformFrame crumbs={[{ label: "Offices" }]}><OfficesBody /></PlatformFrame>;
}
