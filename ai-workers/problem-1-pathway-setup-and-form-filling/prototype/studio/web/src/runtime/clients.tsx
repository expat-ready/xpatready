// CS-K1s (R1.72, QA-593, P-560; brief design/build-lead-c-briefs/CS-K1s.md): the firm's clients on screen, so a won
// prospect's case opens on a person's click, never only through the API. /clients lists the firm's clients (search by
// name or client code, "Show more"); /clients/:id is one client: its header, the "Open a case?" card while FO-8's offer
// is open (program, principal applicant and representative of record, read-only, and one button), and its cases.
// These are staff routes (PF-4's bearer session and keys, as the case page's Decision and closing panel): every call goes
// through `staffApi`, never the Studio's simulated person. The server decides: agent/case:show to see, agent/case:create
// to open; another firm's client is 404. The menu entry is the case area's "Clients", beside "Cases".
// FO-13s part 2 (QA-610, R1.110): a person client's identity checks, read-only (they are recorded on the lead or prospect
// page, before the retainer is sent; FO-13s concept).
import * as React from "react";
import { Link, NavLink, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { ArrowRight } from "lucide-react";
import { getActor, setActor, useToast } from "@/lib/api";
import { isFirmStaff, personOf } from "@/lib/simulated-people";
import { cn } from "@/lib/utils";
import { Button, Field, Input, Notice, Pill, Table } from "@/components/ui/controls";
import { Skeleton } from "@/components/ui/skeleton";
import { Frame, PersonPicker, useWhere } from "@/components/frame";
import { staffApi, StaffApiError, useMe, useSessionEnd, useStaffToken } from "@/modules/platform/session";
import { SignInCard } from "@/modules/platform/frame";
import { SignedInElsewhere } from "@/modules/platform/signed-in-elsewhere";
import type { Me } from "@/modules/front-office/sales/contract";
import { ClientOfferView } from "../../../contracts/runtime";
import { IdentityCheckPanel } from "@/modules/front-office/compliance/identity/identity-panel";
import { Timeline } from "./case-notes"; // CS-NT1t

const SHOW = "agent/case:show", CREATE = "agent/case:create";
/** The simulated client login that answers the questionnaire (the opening asks for one; the case dialog's default). */
const QUESTIONNAIRE_LOGIN = "user-P";
const KIND: Record<string, string> = { PERSON: "Person", COMPANY: "Company" };
const WON_VIA: Record<string, string> = { CONVERTED: "Convert to client", SIGNED_OFFLINE: "Retainer signed offline", E_SIGNED: "Retainer signed online" };
const SEARCH_HELP = "A name, or a client code such as CL-00012";
/** The search as the API takes it: no control or invisible characters (breaker m4), at most 200 characters (m3). */
const searchOf = (v: string) => v.replace(/[\p{Cc}\p{Cf}]/gu, "").trim().slice(0, 200);
/** Breaker M1: the case pages read the simulated person, so before a case of this client opens, the browser acts as the
 *  signed-in staff member's own case-side person (BK-4a's notice says the change). No such person: nothing changes. */
const actAs = (actorId: string | null) => { if (actorId && isFirmStaff(actorId) && getActor() !== actorId) setActor(actorId); };

const Line = z.object({ id: z.string(), number: z.string(), display_name: z.string(), display_kind: z.string() });
const ClientList = z.object({ clients: z.array(Line.extend({ cases: z.number() })), page: z.number(), page_size: z.number(), total: z.number() });
type ClientRow = z.infer<typeof ClientList>["clients"][number];
const ClientView = Line.extend({ fo_person_id: z.string().nullable().optional(), file_owner: z.object({ staff_id: z.string(), name: z.string() }).nullable(), viewer_actor_id: z.string().nullable(), cases: z.array(z.object({ id: z.string(), case_number: z.string() })) });

/** The case area's own menu: "Cases" and, for a person who may see cases, "Clients". Hidden from a signed-in staff member
 *  without agent/case:show (the server refuses them anyway); before sign-in it shows, and the page asks to sign in. */
export function CaseAreaNav() {
  const token = useStaffToken();
  const me = useMe();
  if (token && me.data && !me.data.keys.includes(SHOW)) return null;
  const item = ({ isActive }: { isActive: boolean }) => cn("inline-flex min-h-8 items-center rounded-md px-2.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", isActive ? "bg-primary/10 font-medium text-text-link" : "text-text hover:bg-text/5");
  return (
    <nav aria-label="Case area" className="flex shrink-0 items-center gap-1" data-case-area-nav>
      <NavLink to="/cases" className={item} data-nav="cases">Cases</NavLink>
      <NavLink to="/clients" className={item} data-nav="clients">Clients</NavLink>
    </nav>
  );
}

const MeCtx = React.createContext<Me | null>(null);

/** /clients/*: the case area's frame around the staff pages. */
export function ClientsApp() {
  return (
    <Frame area="cases" title="Cases" home="/cases" staff controls={<><CaseAreaNav /><PersonPicker area="cases" /></>}>
      <StaffOnly>
        <Routes>
          <Route index element={<ClientListPage />} />
          <Route path=":id" element={<ClientPage />} />
          <Route path="*" element={<Notice title="Page not found"><Link className="text-text-link underline" to="/clients">Back to clients</Link></Notice>} />
        </Routes>
      </StaffOnly>
    </Frame>
  );
}

/** A signed-in staff member who may see cases, else the sign-in card or the no-access page (never a blank one). */
function StaffOnly({ children }: { children: React.ReactNode }) {
  const token = useStaffToken();
  const because = useSessionEnd();
  const me = useMe();
  if (!token) return because === "SIGNED_IN_ELSEWHERE" ? <SignedInElsewhere /> : <SignInCard />;
  if (me.isError && !me.data) return <SignInCard failed={me.error instanceof StaffApiError ? me.error.message : "Could not check who is signed in."} />;
  if (!me.data) return <p role="status" className="text-sm text-text-muted" data-loading>Checking who is signed in…</p>;
  if (!me.data.keys.includes(SHOW)) return (
    <div className="mx-auto max-w-5xl space-y-4" data-no-access>
      <h1 className="text-2xl font-semibold">Clients</h1>
      <Notice tone="warn" title="Clients are for staff who can see cases" action={<Link className="whitespace-nowrap text-text-link underline" to="/cases">Back to cases</Link>}>
        Your role at your firm does not include seeing cases. Ask your firm's admin if you need it.
      </Notice>
    </div>
  );
  return <MeCtx.Provider value={me.data}>{children}</MeCtx.Provider>;
}

// ------------------------------------------------------------------ the list

function ClientListPage() {
  const token = useStaffToken();
  const [sp, setSp] = useSearchParams();
  // As the case list (A24-2): the search is kept in the address (?q=), so Back and a reload keep it; sent once typing stops.
  const q = searchOf(sp.get("q") ?? "");
  const [typed, setTyped] = React.useState(q);
  const wrote = React.useRef(q);
  React.useEffect(() => { if (q !== wrote.current) { wrote.current = q; setTyped(q); } }, [q]);
  React.useEffect(() => {
    const t = setTimeout(() => { const w = searchOf(typed); wrote.current = w; setSp((p) => { const n = new URLSearchParams(p); if (w) n.set("q", w); else n.delete("q"); return n; }, { replace: true }); }, 300);
    return () => clearTimeout(t);
  }, [typed, setSp]);
  const path = (page: number) => `/runtime/clients?${q ? `query=${encodeURIComponent(q)}&` : ""}page=${page}`;
  const first = useQuery({ queryKey: ["pf", "clients", token, q], retry: false, queryFn: async () => ClientList.parse(await staffApi(path(1))) });
  // Later pages belong to the session and the search they were loaded for; a new search or person drops them.
  const owner = `${token}|${q}`;
  const [kept, setKept] = React.useState<{ owner: string; rows: ClientRow[]; page: number; total: number } | null>(null);
  const more = kept?.owner === owner ? kept : null;
  const [loading, setLoading] = React.useState(false);
  const [moreError, setMoreError] = React.useState<string | null>(null);
  // Each client once, even when a client made meanwhile moves a row onto the next page.
  const rows = [...(first.data?.clients ?? []), ...(more?.rows ?? [])].filter((c, i, all) => all.findIndex((x) => x.id === c.id) === i);
  // The newest page's count (breaker m2): clients made meanwhile count, never a stale "55 of 55".
  const total = Math.max(first.data?.total ?? 0, more?.total ?? 0);
  const lastPage = more?.page ?? 1;
  const hasMore = !!first.data && lastPage * first.data.page_size < total;
  async function showMore() {
    if (!hasMore || loading) return;
    setLoading(true); setMoreError(null);
    try { const page = ClientList.parse(await staffApi(path(lastPage + 1))); setKept((m) => ({ owner, rows: [...(m?.owner === owner ? m.rows : []), ...page.clients], page: lastPage + 1, total: page.total })); }
    catch (e) { setMoreError(e instanceof Error ? e.message : "Try again."); } finally { setLoading(false); }
  }
  const clear = () => { setTyped(""); setSp((p) => { const n = new URLSearchParams(p); n.delete("q"); return n; }, { replace: true }); };
  return (
    <div className="mx-auto max-w-5xl space-y-4" data-clients-list>
      <div><h1 className="text-2xl font-semibold">Clients</h1><p className="text-sm text-text-muted">Your firm's clients. A client is made when a prospect is won; open its case from the client's page.</p></div>
      <form role="search" className="max-w-md" onSubmit={(e) => e.preventDefault()}>
        <Field label="Search clients" hint={SEARCH_HELP}><Input type="search" value={typed} maxLength={200} onChange={(e) => setTyped(e.target.value)} placeholder="CL-00012" data-client-search /></Field>
      </form>
      {first.isLoading ? <Skeleton className="h-40 w-full" data-loading />
        : first.isError ? <Notice tone="danger" title={q ? "The search could not be run" : "Clients could not be loaded"} action={q ? <Button size="sm" variant="secondary" onClick={clear}>Clear search</Button> : <Button size="sm" variant="secondary" busy={first.isFetching} onClick={() => void first.refetch()}>Try again</Button>}>{first.error instanceof StaffApiError ? first.error.field("query") ?? first.error.message : "Try again in a moment."}</Notice>
        : !rows.length ? (q ? <Notice title={`No client matches "${q}"`} action={<Button size="sm" variant="secondary" onClick={clear}>Clear search</Button>}>Search looks at the client's name and client code.</Notice>
          : <Notice title="No clients yet">A client appears when a prospect is won.</Notice>)
        : <Table head={["Client code", "Name", "Person or Company", "Cases"]} label="Clients">{rows.map((c) => (
          <tr key={c.id} data-client-row={c.number}>
            <td className="whitespace-nowrap tabular-nums">{c.number}</td>
            <td><Link className="inline-flex min-h-6 items-center font-medium text-text-link [overflow-wrap:anywhere] hover:underline" to={`/clients/${c.id}`}>{c.display_name}</Link></td>
            <td>{KIND[c.display_kind] ?? c.display_kind}</td>
            <td className="tabular-nums" data-client-cases={c.cases}>{c.cases ? c.cases : <span className="whitespace-nowrap text-text-muted">None yet</span>}</td>
          </tr>))}</Table>}
      {moreError ? <Notice tone="danger" title="More clients could not be loaded">{moreError}</Notice> : null}
      {rows.length ? <div className="flex flex-wrap items-center gap-3 text-[13px] text-text-muted"><span role="status" data-client-count>{rows.length} of {total} client{total === 1 ? "" : "s"} shown{q ? ` for "${q}"` : ""}</span>{hasMore ? <Button size="sm" variant="secondary" busy={loading} onClick={() => void showMore()} data-show-more>Show more</Button> : null}</div> : null}
    </div>
  );
}

// ------------------------------------------------------------------ one client

function ClientPage() {
  const { id = "" } = useParams();
  const token = useStaffToken();
  const me = React.useContext(MeCtx)!;
  const client = useQuery({ queryKey: ["pf", "client", token, id], retry: false, queryFn: async () => ClientView.parse(await staffApi(`/runtime/clients/${encodeURIComponent(id)}`)) });
  const offer = useQuery({ queryKey: ["pf", "client-offer", token, id], retry: false, queryFn: async () => ClientOfferView.parse(await staffApi(`/runtime/clients/${encodeURIComponent(id)}/offer`)) });
  useWhere(client.data ? [{ label: "Clients", to: "/clients" }, { label: client.data.display_name }] : null);
  if (client.isLoading) return <div className="mx-auto max-w-5xl space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-40 w-full" /></div>;
  if (client.error instanceof StaffApiError && client.error.status === 404) return (
    <div className="mx-auto max-w-5xl space-y-4" data-no-client><h1 className="text-2xl font-semibold">No such client</h1>
      <Notice title="This client is not one of your firm's">It may have been typed wrongly, or belong to another firm. <Link className="text-text-link underline" to="/clients">Back to clients</Link></Notice></div>
  );
  if (client.isError || !client.data) return <Notice tone="danger" title="This client could not be loaded" action={<Button size="sm" variant="secondary" busy={client.isFetching} onClick={() => void client.refetch()}>Try again</Button>}>{client.error instanceof Error ? client.error.message : "Try again."}</Notice>;
  const c = client.data;
  const o = offer.data;
  return (
    <div className="mx-auto max-w-5xl space-y-5" data-client-page={c.number}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold [overflow-wrap:anywhere]">{c.display_name}</h1>
        <p className="text-sm text-text-muted" data-client-line><span className="tabular-nums">{c.number}</span> · {KIND[c.display_kind] ?? c.display_kind} · File owner: {c.file_owner ? c.file_owner.name : "not set"}</p>
      </div>
      {offer.isLoading ? <Skeleton className="h-32 w-full max-w-2xl" />
        : offer.isError ? <Notice tone="danger" title="Whether a case is waiting to be opened could not be checked" action={<Button size="sm" variant="secondary" busy={offer.isFetching} onClick={() => void offer.refetch()}>Try again</Button>}>{offer.error instanceof Error ? offer.error.message : "Try again."}</Notice>
        : o?.offer ? <OfferCard clientId={c.id} viewer={c.viewer_actor_id} offer={o.offer} canOpen={me.keys.includes(CREATE)} reread={() => { void offer.refetch(); void client.refetch(); }} refreshCases={() => void client.refetch()} />
        : o && (o.reason === "WITHDRAWN" || o.reason === "CHANGED") ? <Notice tone="warn" title="No case to open from this client now" className="max-w-2xl"><span data-offer-gone={o.reason}>{o.detail}</span></Notice>
        : null}
      {c.fo_person_id ? <div className="max-w-2xl"><IdentityCheckPanel personId={c.fo_person_id} name={c.display_name} me={me} readOnly /></div> : null}
      <section aria-labelledby="client-cases" className="space-y-2">
        <h2 id="client-cases" className="text-lg font-semibold">Cases</h2>
        {c.cases.length ? <ul className="space-y-1" aria-label={`${c.display_name}'s cases`}>{c.cases.map((k) => (
          <li key={k.id}><Link className="inline-flex min-h-6 items-center font-semibold tabular-nums text-text-link hover:underline" to={`/cases/${k.id}`} onClick={() => actAs(c.viewer_actor_id)} data-client-case={k.case_number}>{k.case_number}</Link></li>))}</ul>
          : <p className="text-sm text-text-muted" data-no-cases>{o && !o.offer && o.reason === "NO_OFFER" ? "This client has no cases yet, and no case waiting to be opened from a won prospect." : "No cases yet."}</p>}
      </section>
      {/* CS-NT1t (R1.76): the person's own timeline: their notes, their cases' lines, their won prospect's. */}
      <section aria-labelledby="client-timeline" className="rounded-xl border border-border bg-surface-raised" data-client-timeline><Timeline path={`/runtime/clients/${c.id}/timeline`} heading={2} /></section>
    </div>
  );
}

type Offer = NonNullable<ClientOfferView["offer"]>;

/** "Open a case?": what the opening pre-fills, read-only, and one button. The server pre-fills from the same offer (the
 *  body names only the questionnaire login, which the offer cannot know); a second click sends nothing. */
function OfferCard({ clientId, viewer, offer, canOpen, reread, refreshCases }: { clientId: string; viewer: string | null; offer: Offer; canOpen: boolean; reread: () => void; refreshCases: () => void }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const sending = React.useRef(false);
  const [busy, setBusy] = React.useState(false);
  const [refusal, setRefusal] = React.useState<{ code: string | null; text: string } | null>(null);
  // A refusal that pressing again cannot change turns the button off (breaker m6: NO_CASE_USER too).
  const done = refusal?.code === "OFFER_USED" || refusal?.code === "OFFER_WITHDRAWN" || refusal?.code === "NO_CASE_USER";
  const alertRef = React.useRef<HTMLParagraphElement>(null);
  // Breaker m1: the refusal takes the focus, so a keyboard user is not left on <body> when the button turns off.
  React.useEffect(() => { if (refusal) alertRef.current?.focus(); }, [refusal]);
  const login = personOf(QUESTIONNAIRE_LOGIN)?.name ?? "the Sample client";
  const blocked = !offer.combination ? "The prospect named no program a case can open on, so this case cannot be opened from here."
    : !offer.principalName ? "The client's name is too short or too long for a principal applicant, so this case cannot be opened from here." : null;
  async function open() {
    if (sending.current || done) return;
    sending.current = true; setBusy(true); setRefusal(null);
    try {
      const made = await staffApi<{ id: string; case_number: string }>(`/runtime/clients/${encodeURIComponent(clientId)}/open-case`, { method: "POST", json: { clientActor: QUESTIONNAIRE_LOGIN } });
      for (const queryKey of [["runtime"], ["pf", "clients"], ["pf", "client"], ["pf", "client-offer"]]) void qc.invalidateQueries({ queryKey });
      toast.push({ tone: "ok", text: `Case ${made.case_number} opened` });
      actAs(viewer);
      nav(`/cases/${made.id}`);
      return;   // leaving the page: the button stays off, so nothing more is sent
    } catch (e) {
      const code = e instanceof StaffApiError ? e.problem.code ?? null : null;
      setRefusal({ code, text: e instanceof Error && e.message ? e.message : "The case could not be opened. Try again." });
      if (code === "OFFER_CHANGED") reread();
      else if (code === "OFFER_USED") refreshCases();
    }
    sending.current = false; setBusy(false);
  }
  return (
    <section aria-labelledby="open-a-case" className="max-w-2xl rounded-xl border border-border border-l-4 border-l-primary bg-surface-raised p-4 shadow-sm" data-offer-card>
      <h2 id="open-a-case" className="text-lg font-semibold">Open a case?</h2>
      <p className="text-sm text-text-muted">This client was won{offer.prospectNumber ? <> from prospect <span className="tabular-nums">{offer.prospectNumber}</span></> : null} by {WON_VIA[offer.wonVia] ?? "a win"}. The case opens with these details.</p>
      <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
        <dt className="text-text-muted">Program</dt><dd data-offer-program>{offer.combination?.label ?? <span className="text-text-muted">Not chosen on the prospect</span>}</dd>
        <dt className="text-text-muted">Principal applicant</dt><dd className="[overflow-wrap:anywhere]" data-offer-principal>{offer.principalName ?? <span className="text-text-muted">Not set</span>}</dd>
        <dt className="text-text-muted">Representative of record</dt><dd data-offer-representative>{offer.representative?.name ?? <span className="text-text-muted">Your firm's representative of record (the retainer names none)</span>}</dd>
        {/* Demo chrome, not for porting (review m2): the prototype's simulated client login the opening asks for. */}
        <dt className="text-text-muted">Client questionnaire login</dt><dd className="text-text-muted" data-demo-chrome>{login} <Pill>Simulated</Pill></dd>
      </dl>
      <div className="mt-4 flex flex-wrap items-start gap-3">
        {!canOpen ? <p className="text-sm" data-offer-ask>Ask someone who can open cases.</p>
          : blocked ? <p className="text-sm text-text-muted" data-offer-blocked>{blocked}</p>
          : <Button onClick={() => void open()} busy={busy} disabled={done} data-open-case>Open the case <ArrowRight aria-hidden /></Button>}
        {refusal ? <p ref={alertRef} tabIndex={-1} role="alert" className="min-w-0 flex-1 text-sm text-text-danger outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" data-offer-refusal={refusal.code ?? "ERROR"}>{refusal.text}</p> : null}
      </div>
    </section>
  );
}
