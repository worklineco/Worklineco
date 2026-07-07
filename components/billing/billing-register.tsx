"use client";

import { Download, Plus, ReceiptText, Save, Search, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx-js-style";

type BillingRecord = {
  billing_status: string;
  cgst: number;
  client: string;
  gstin: string;
  gstat_appeal_id: string | null;
  id?: string;
  igst: number;
  invoice_date: string | null;
  invoice_number: string;
  matter_description: string;
  payment_date: string | null;
  payment_status: string;
  professional_fee: number;
  remarks: string;
  sgst: number;
  total: number;
};
type GstatMatter = {
  client: string;
  gstin: string;
  id: string;
  label: string;
  matter_description: string;
  row_number: number;
};

const emptyRecord: BillingRecord = {
  billing_status: "Draft",
  cgst: 0,
  client: "",
  gstin: "",
  gstat_appeal_id: null,
  igst: 0,
  invoice_date: "",
  invoice_number: "",
  matter_description: "",
  payment_date: "",
  payment_status: "Unpaid",
  professional_fee: 0,
  remarks: "",
  sgst: 0,
  total: 0
};
const billingStatuses = ["Draft", "Raised", "Cancelled"];
const paymentStatuses = ["Unpaid", "Part Paid", "Paid"];

export function BillingRegister() {
  const [records, setRecords] = useState<BillingRecord[]>([]);
  const [matters, setMatters] = useState<GstatMatter[]>([]);
  const [draft, setDraft] = useState<BillingRecord>(emptyRecord);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");

  const filteredRecords = useMemo(() => {
    const value = search.trim().toLowerCase();

    if (!value) {
      return records;
    }

    return records.filter((record) =>
      [
        record.invoice_number,
        record.client,
        record.gstin,
        record.matter_description,
        record.billing_status,
        record.payment_status
      ].some((field) => String(field ?? "").toLowerCase().includes(value))
    );
  }, [records, search]);
  const totals = useMemo(
    () =>
      records.reduce(
        (summary, record) => ({
          billed: summary.billed + toNumber(record.total),
          paid: summary.paid + (record.payment_status === "Paid" ? toNumber(record.total) : 0),
          unpaid: summary.unpaid + (record.payment_status !== "Paid" ? toNumber(record.total) : 0)
        }),
        { billed: 0, paid: 0, unpaid: 0 }
      ),
    [records]
  );

  useEffect(() => {
    void loadBilling();
  }, []);

  async function loadBilling() {
    setIsLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/billing", { cache: "no-store" });
      const result = (await response.json()) as { error?: string; matters?: GstatMatter[]; records?: BillingRecord[] };

      if (!response.ok) {
        setMessage(result.error ?? "Could not load billing records.");
        return;
      }

      setMatters(result.matters ?? []);
      setRecords(result.records ?? []);
    } catch (error) {
      console.error("Billing load error:", error);
      setMessage("Could not load billing records.");
    } finally {
      setIsLoading(false);
    }
  }

  function selectMatter(matterId: string) {
    const matter = matters.find((item) => item.id === matterId);

    setDraft((current) => ({
      ...current,
      client: matter?.client || current.client,
      gstin: matter?.gstin || current.gstin,
      gstat_appeal_id: matterId || null,
      matter_description: matter?.matter_description || current.matter_description
    }));
  }

  async function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage("Saving billing record...");

    try {
      const response = await fetch("/api/billing", {
        body: JSON.stringify({ record: draft }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const result = (await response.json()) as { error?: string; record?: BillingRecord };

      if (!response.ok || !result.record) {
        setMessage(result.error ?? "Could not save billing record.");
        return;
      }

      setRecords((currentRecords) => {
        const nextRecords = draft.id
          ? currentRecords.map((record) => (record.id === result.record!.id ? result.record! : record))
          : [result.record!, ...currentRecords];

        return nextRecords;
      });
      setDraft(emptyRecord);
      setMessage("Billing record saved. GSTAT Bill raised column will show Yes for the linked matter.");
    } catch (error) {
      console.error("Billing save error:", error);
      setMessage("Could not save billing record.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteRecord(record: BillingRecord) {
    if (!record.id || !window.confirm(`Delete invoice ${record.invoice_number || record.client || "record"}?`)) {
      return;
    }

    setMessage("Deleting billing record...");
    const response = await fetch(`/api/billing?id=${encodeURIComponent(record.id)}`, { method: "DELETE" });
    const result = (await response.json()) as { error?: string };

    if (!response.ok) {
      setMessage(result.error ?? "Could not delete billing record.");
      return;
    }

    setRecords((currentRecords) => currentRecords.filter((item) => item.id !== record.id));
    if (draft.id === record.id) {
      setDraft(emptyRecord);
    }
    setMessage("Billing record deleted.");
  }

  function exportExcel() {
    const rows = records.map((record, index) => ({
      "S.no.": index + 1,
      "Invoice Number": record.invoice_number,
      Date: record.invoice_date ?? "",
      "GSTAT Matter": matters.find((matter) => matter.id === record.gstat_appeal_id)?.label ?? "",
      Client: record.client,
      GSTIN: record.gstin,
      Description: record.matter_description,
      "Professional Fee": record.professional_fee,
      CGST: record.cgst,
      SGST: record.sgst,
      IGST: record.igst,
      Total: record.total,
      "Billing Status": record.billing_status,
      "Payment Status": record.payment_status,
      "Payment Date": record.payment_date ?? "",
      Remarks: record.remarks
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ "S.no.": "", Client: "" }]);

    worksheet["!cols"] = Array.from({ length: 16 }, () => ({ wch: 18 }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Billing");
    XLSX.writeFile(workbook, "workline-gstat-billing-register.xlsx");
    setMessage(records.length ? `Exported ${records.length} billing records.` : "Exported a blank billing template.");
  }

  return (
    <section className="rounded-[24px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-lime-700">Linked billing</p>
          <h2 className="mt-2 text-2xl font-black text-slate-950">GSTAT Billing Records</h2>
          <p className="mt-2 text-sm font-bold text-slate-500">
            {isLoading ? "Loading" : `${records.length} records`} - total billed {formatMoney(totals.billed)}
          </p>
        </div>
        <div className="grid gap-2 text-sm font-black text-slate-700 sm:grid-cols-3">
          <Summary label="Paid" value={formatMoney(totals.paid)} />
          <Summary label="Unpaid" value={formatMoney(totals.unpaid)} />
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-white transition hover:bg-slate-800"
            onClick={exportExcel}
            type="button"
          >
            <Download className="size-4" />
            Export
          </button>
        </div>
      </div>

      <form className="mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-12" onSubmit={saveRecord}>
        <select
          className="input lg:col-span-4"
          onChange={(event) => selectMatter(event.target.value)}
          value={draft.gstat_appeal_id ?? ""}
        >
          <option value="">Select GSTAT matter</option>
          {matters.map((matter) => (
            <option key={matter.id} value={matter.id}>
              {matter.label}
            </option>
          ))}
        </select>
        <input
          className="input lg:col-span-2"
          onChange={(event) => setDraft((current) => ({ ...current, invoice_number: event.target.value }))}
          placeholder="Invoice number"
          value={draft.invoice_number}
        />
        <input
          className="input lg:col-span-2"
          onChange={(event) => setDraft((current) => ({ ...current, invoice_date: event.target.value }))}
          type="date"
          value={draft.invoice_date ?? ""}
        />
        <input
          className="input lg:col-span-4"
          onChange={(event) => setDraft((current) => ({ ...current, client: event.target.value }))}
          placeholder="Client"
          value={draft.client}
        />
        <input
          className="input lg:col-span-2"
          onChange={(event) => setDraft((current) => ({ ...current, gstin: event.target.value }))}
          placeholder="GSTIN"
          value={draft.gstin}
        />
        <input
          className="input lg:col-span-4"
          onChange={(event) => setDraft((current) => ({ ...current, matter_description: event.target.value }))}
          placeholder="Matter description"
          value={draft.matter_description}
        />
        <MoneyInput label="Professional fee" onChange={(value) => setDraft((current) => recalc({ ...current, professional_fee: value }))} value={draft.professional_fee} />
        <MoneyInput label="CGST" onChange={(value) => setDraft((current) => recalc({ ...current, cgst: value }))} value={draft.cgst} />
        <MoneyInput label="SGST" onChange={(value) => setDraft((current) => recalc({ ...current, sgst: value }))} value={draft.sgst} />
        <MoneyInput label="IGST" onChange={(value) => setDraft((current) => recalc({ ...current, igst: value }))} value={draft.igst} />
        <input className="input lg:col-span-2" readOnly value={formatMoney(draft.total)} />
        <select
          className="input lg:col-span-2"
          onChange={(event) => setDraft((current) => ({ ...current, billing_status: event.target.value }))}
          value={draft.billing_status}
        >
          {billingStatuses.map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>
        <select
          className="input lg:col-span-2"
          onChange={(event) => setDraft((current) => ({ ...current, payment_status: event.target.value }))}
          value={draft.payment_status}
        >
          {paymentStatuses.map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>
        <input
          className="input lg:col-span-2"
          onChange={(event) => setDraft((current) => ({ ...current, payment_date: event.target.value }))}
          type="date"
          value={draft.payment_date ?? ""}
        />
        <input
          className="input lg:col-span-3"
          onChange={(event) => setDraft((current) => ({ ...current, remarks: event.target.value }))}
          placeholder="Remarks"
          value={draft.remarks}
        />
        <button
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-lime-700 px-4 text-sm font-black text-white transition hover:bg-lime-800 disabled:opacity-50 lg:col-span-3"
          disabled={isSaving}
          type="submit"
        >
          {draft.id ? <Save className="size-4" /> : <Plus className="size-4" />}
          {isSaving ? "Saving..." : draft.id ? "Update Bill" : "Add Bill"}
        </button>
      </form>

      <div className="mt-5 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3">
        <Search className="size-4 text-slate-400" />
        <input
          className="h-11 min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold outline-none"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search billing records"
          value={search}
        />
      </div>

      {message ? (
        <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">
          {message}
        </p>
      ) : null}

      <div className="mt-5 overflow-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1380px] border-collapse text-left text-sm">
          <thead className="bg-slate-950 text-xs font-black uppercase text-white">
            <tr>
              {["Invoice", "Date", "GSTAT Matter", "Client", "Fee", "Tax", "Total", "Billing", "Payment", "Actions"].map((column) => (
                <th className="border-r border-white/10 px-3 py-3 last:border-r-0" key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td className="px-4 py-8 font-bold text-slate-500" colSpan={10}>Loading billing records...</td></tr>
            ) : filteredRecords.length ? (
              filteredRecords.map((record) => (
                <tr className="border-b border-slate-100 last:border-b-0" key={record.id}>
                  <td className="px-3 py-3 font-black text-slate-900">{record.invoice_number || "-"}</td>
                  <td className="px-3 py-3 font-semibold text-slate-700">{record.invoice_date || "-"}</td>
                  <td className="px-3 py-3 font-semibold text-slate-700">{matters.find((matter) => matter.id === record.gstat_appeal_id)?.label || "-"}</td>
                  <td className="px-3 py-3 font-semibold text-slate-700">{record.client || "-"}</td>
                  <td className="px-3 py-3 font-semibold text-slate-700">{formatMoney(record.professional_fee)}</td>
                  <td className="px-3 py-3 font-semibold text-slate-700">{formatMoney(toNumber(record.cgst) + toNumber(record.sgst) + toNumber(record.igst))}</td>
                  <td className="px-3 py-3 font-black text-slate-900">{formatMoney(record.total)}</td>
                  <td className="px-3 py-3 font-semibold text-slate-700">{record.billing_status}</td>
                  <td className="px-3 py-3 font-semibold text-slate-700">{record.payment_status}</td>
                  <td className="px-3 py-3">
                    <div className="flex gap-2">
                      <button className="inline-flex size-8 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50" onClick={() => setDraft(normalizeDraft(record))} title="Edit bill" type="button">
                        <ReceiptText className="size-4" />
                      </button>
                      <button className="inline-flex size-8 items-center justify-center rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => deleteRecord(record)} title="Delete bill" type="button">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr><td className="px-4 py-8 font-bold text-slate-500" colSpan={10}>No billing records yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-2">
      <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm text-slate-950">{value}</p>
    </div>
  );
}

function MoneyInput({ label, onChange, value }: { label: string; onChange: (value: number) => void; value: number }) {
  return (
    <input
      className="input lg:col-span-1"
      min="0"
      onChange={(event) => onChange(toNumber(event.target.value))}
      placeholder={label}
      type="number"
      value={value || ""}
    />
  );
}

function recalc(record: BillingRecord): BillingRecord {
  return {
    ...record,
    total: toNumber(record.professional_fee) + toNumber(record.cgst) + toNumber(record.sgst) + toNumber(record.igst)
  };
}

function normalizeDraft(record: BillingRecord): BillingRecord {
  return {
    ...emptyRecord,
    ...record,
    invoice_date: record.invoice_date ?? "",
    payment_date: record.payment_date ?? ""
  };
}

function formatMoney(value: number | string) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency"
  }).format(toNumber(value));
}

function toNumber(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}
