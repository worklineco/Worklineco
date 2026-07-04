import { ArrowLeft, ReceiptText } from "lucide-react";
import Link from "next/link";
import { SpreadsheetRegister } from "@/components/shared/spreadsheet-register";

const billingColumns = [
  "Date",
  "Invoice Number",
  "Voucher Type",
  "Sales Ledger",
  "Cost Center",
  "Group",
  "Client",
  "GSTIN",
  "Description",
  "Amount",
  "CGST",
  "SGST",
  "IGST",
  "Total",
  "State",
  "Place of Supply",
  "Registration Type",
  "Address",
  "State Code"
];

export default function BillingPage() {
  return (
    <main className="min-h-screen bg-[#fbf7ef] px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_20%_15%,rgba(132,204,22,0.16),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(14,165,233,0.14),transparent_28%),radial-gradient(circle_at_50%_86%,rgba(245,158,11,0.16),transparent_34%)]" />

      <section className="mx-auto max-w-[1540px]">
        <header className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-lime-100 px-3 py-1.5 text-xs font-black uppercase text-lime-800">
                <ReceiptText className="size-3.5" />
                Billing
              </div>
              <h1 className="mt-4 text-4xl font-black leading-tight text-slate-950">
                Billing Register
              </h1>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
                Invoice and GST billing columns are ready. Data entry, import,
                export, and approval workflow can be added next.
              </p>
            </div>

            <Link
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white"
              href="/"
            >
              <ArrowLeft className="size-4" />
              Workspace
            </Link>
          </div>
        </header>

        <div className="mt-5">
          <SpreadsheetRegister
            columns={billingColumns}
            emptyMessage="No billing entries yet."
            filename="workline-billing-register.xlsx"
            minWidth={2200}
            title="Billing Table"
            tone="text-lime-700"
          />
        </div>
      </section>
    </main>
  );
}
