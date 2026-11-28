// FO-7s2 part 1 (concept screens/fo-7s-money/concept-settings.md; AG-6-82): Money → Getting paid, the money settings on one page.
// Every staff member who can see invoices opens it; each section edits only with its own key. This part builds the Card
// payments section; Payment details, Tax and Advanced are FO-7s1 part 3's and FO-7s3a part 2's (their write routes are not on
// main yet, concept gap G1), each added here as one line.
import { PlatformFrame, usePlatformStaff } from "@/modules/platform/frame";
import { MONEY_AREA, MoneyMenuSmall } from "../area";
import { CardPaymentsSection } from "./card-payments/section";

function Body() {
  const me = usePlatformStaff();
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <header className="flex flex-col gap-2"><MoneyMenuSmall keys={me.keys} />
        <div><h1 className="text-2xl font-semibold">Getting paid</h1><p className="mt-1 text-sm text-text-muted">How clients pay your firm.</p></div>
      </header>
      <CardPaymentsSection />
    </div>
  );
}

export function GettingPaidPage() {
  return <PlatformFrame area={MONEY_AREA} crumbs={[{ label: "Getting paid" }]}><Body /></PlatformFrame>;
}
