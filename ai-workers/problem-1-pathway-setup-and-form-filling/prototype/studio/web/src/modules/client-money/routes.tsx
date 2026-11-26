// FO-7s1 part 1 (concept screens/fo-7s-money): the Money area's pages through PF-1's seam, under /money/*. Later money rows add one
// line each here (FO-7s1 part 2 the builder, part 3 Getting paid; FO-7s2 to FO-7s5; FO-7m part 3); merge main on a conflict.
import type { ModuleRoute } from "@/modules";
import { InvoiceDetailPage } from "./invoices/detail";
import { InvoiceListPage } from "./invoices/list";
import { PaymentDetailPage } from "./payments/detail";
import { PaymentListPage } from "./payments/list";

export const routes: ModuleRoute[] = [
  { path: "/money/invoices", element: <InvoiceListPage /> },
  { path: "/money/invoices/:id", element: <InvoiceDetailPage /> },
  { path: "/money/payments", element: <PaymentListPage /> },   // FO-7s3a part 1
  { path: "/money/payments/:id", element: <PaymentDetailPage /> },
];
