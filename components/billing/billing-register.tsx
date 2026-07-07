"use client";

import { Download, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
type BillingField = keyof BillingRecord;
type BillingColumn = {
  field: BillingField | "gstat_matter" | "tax" | "actions";
  label: string;
  type?: "date" | "money" | "select" | "text";
  width: number;
};
type InlineEditor = { field: BillingField; recordId: string; value: string };

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
const billingColumns: BillingColumn[] = [
  { field: "invoice_number", label: "Invoice", type: "text", width: 150 },
  { field: "invoice_date", label: "Date", type: "date", width: 135 },
  { field: "gstat_matter", label: "GSTAT Matter", width: 320 },
  { field: "client", label: "Client", type: "text", width: 230 },
  { field: "gstin", label: "GSTIN", type: "text", width: 160 },
  { field: "matter_description", label: "Description", type: "text", width: 280 },
  { field: "professional_fee", label: "Fee", type: "money", width: 120 },
  { field: "cgst", label: "CGST", type: "money", width: 105 },
  { field: "sgst", label: "SGST", type: "money", width: 105 },
  { field: "igst", label: "IGST", type: "money", width: 105 },
  { field: "total", label: "Total", width: 125 },
  { field: "billing_status", label: "Billing", type: "select", width: 130 },
  { field: "payment_status", label: "Payment", type: "select", width: 130 },
  { field: "payment_date", label: "Paid On", type: "date", width: 135 },
  { field: "remarks", label: "Remarks", type: "text", width: 230 },
  { field: "actions", label: "Actions", width: 84 }
];
const tableWidth = billingColumns.reduce((total, column) => total + column.width, 0);

export function BillingRegister() {
  const [records, setRecords] = useState<BillingRecord[]>([]);
  const [matters, setMatters] = useState<GstatMatter[]>([]);
  const [inlineEditor, setInlineEditor] = useState<InlineEditor | null>(null);
  const [savingCell, setSavingCell] = useState<InlineEditor | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
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
        record.payment_status,
        getMatterLabel(record, matters)
      ].some((field) => String(field ?? "").toLowerCase().includes(value))
    );
  }, [matters, records, search]);
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

  async function addBlankRecord() {
    setIsAdding(true);
    setMessage("Adding billing row...");

    try {
      const saved = await saveRecord(emptyRecord);
      setRecords((currentRecords) => [saved, ...currentRecords]);
      setMessage("Billing row added. Click any cell to edit.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add billing row.");
    } finally {
      setIsAdding(false);
    }
  }

  async function saveInlineEditor(valueOverride?: string) {
    if (!inlineEditor || savingCell) {
      return;
    }

    const record = records.find((item) => item.id === inlineEditor.recordId);

    if (!record) {
      setInlineEditor(null);
      return;
    }

    const rawValue = valueOverride ?? inlineEditor.value;
    const nextRecord = prepareRecordUpdate(record, inlineEditor.field, rawValue);

    if (String(record[inlineEditor.field] ?? "") === String(nextRecord[inlineEditor.field] ?? "")) {
      setInlineEditor(null);
      return;
    }

    setSavingCell(inlineEditor);
    setInlineEditor(null);
    setRecords((currentRecords) =>
      currentRecords.map((item) => (item.id === record.id ? nextRecord : item))
    );

    try {
      const saved = await saveRecord(nextRecord);
      setRecords((currentRecords) =>
        currentRecords.map((item) => (item.id === saved.id ? saved : item))
      );
      setMessage(`Saved ${getColumnLabel(inlineEditor.field)}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save billing cell.");
      await loadBilling();
    } finally {
      setSavingCell(null);
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
    setMessage("Billing record deleted.");
  }

  async function saveRecord(record: BillingRecord) {
    const response = await fetch("/api/billing", {
      body: JSON.stringify({ record }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const result = (await response.json()) as { error?: string; record?: BillingRecord };

    if (!response.ok || !result.record) {
      throw new Error(result.error ?? "Could not save billing record.");
    }

    return result.record;
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
        <div className="grid gap-2 text-sm font-black text-slate-700 sm:grid-cols-4">
          <Summary label="Paid" value={formatMoney(totals.paid)} />
          <Summary label="Unpaid" value={formatMoney(totals.unpaid)} />
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-lime-700 px-4 text-white transition hover:bg-lime-800 disabled:opacity-50"
            disabled={isAdding}
            onClick={addBlankRecord}
            type="button"
          >
            <Plus className="size-4" />
            Add Row
          </button>
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
        <table className="table-fixed border-collapse text-left text-sm" style={{ minWidth: tableWidth, width: tableWidth }}>
          <colgroup>
            {billingColumns.map((column) => (
              <col key={column.field} style={{ width: column.width }} />
            ))}
          </colgroup>
          <thead className="bg-slate-950 text-xs font-black uppercase text-white">
            <tr>
              {billingColumns.map((column) => (
                <th className="border-r border-white/10 px-3 py-3 last:border-r-0" key={column.field}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td className="px-4 py-8 font-bold text-slate-500" colSpan={billingColumns.length}>Loading billing records...</td></tr>
            ) : filteredRecords.length ? (
              filteredRecords.map((record) => (
                <tr className="border-b border-slate-100 last:border-b-0" key={record.id}>
                  {billingColumns.map((column) => (
                    <BillingCell
                      column={column}
                      inlineEditor={inlineEditor}
                      key={`${record.id}-${column.field}`}
                      matters={matters}
                      onDelete={() => deleteRecord(record)}
                      onEdit={(field, value) => setInlineEditor({ field, recordId: record.id!, value })}
                      onEditorChange={(value) =>
                        setInlineEditor((currentEditor) => (currentEditor ? { ...currentEditor, value } : currentEditor))
                      }
                      onSave={saveInlineEditor}
                      record={record}
                      savingCell={savingCell}
                    />
                  ))}
                </tr>
              ))
            ) : (
              <tr><td className="px-4 py-8 font-bold text-slate-500" colSpan={billingColumns.length}>No billing records yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BillingCell({
  column,
  inlineEditor,
  matters,
  onDelete,
  onEdit,
  onEditorChange,
  onSave,
  record,
  savingCell
}: {
  column: BillingColumn;
  inlineEditor: InlineEditor | null;
  matters: GstatMatter[];
  onDelete: () => void;
  onEdit: (field: BillingField, value: string) => void;
  onEditorChange: (value: string) => void;
  onSave: (valueOverride?: string) => void;
  record: BillingRecord;
  savingCell: InlineEditor | null;
}) {
  const isReadOnly = column.field === "gstat_matter" || column.field === "tax" || column.field === "total";
  const isActions = column.field === "actions";
  const field = column.field as BillingField;
  const isEditing = Boolean(inlineEditor && inlineEditor.recordId === record.id && inlineEditor.field === field);
  const isSaving = Boolean(savingCell && savingCell.recordId === record.id && savingCell.field === field);
  const editorValue = isEditing ? inlineEditor?.value ?? "" : "";
  const displayValue = getDisplayValue(record, column, matters);

  if (isActions) {
    return (
      <td className="border-r border-slate-100 px-3 py-2 last:border-r-0">
        <button
          className="inline-flex size-8 items-center justify-center rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50"
          onClick={onDelete}
          title="Delete bill"
          type="button"
        >
          <Trash2 className="size-4" />
        </button>
      </td>
    );
  }

  return (
    <td className="border-r border-slate-100 px-2 py-2 font-semibold text-slate-700 last:border-r-0">
      {isEditing && column.type === "select" ? (
        <select
          autoFocus
          className="h-8 w-full rounded-md border border-teal-300 bg-white px-2 text-xs font-bold outline-none ring-2 ring-teal-100"
          onBlur={() => onSave()}
          onChange={(event) => {
            onEditorChange(event.target.value);
            onSave(event.target.value);
          }}
          value={editorValue}
        >
          {(field === "billing_status" ? billingStatuses : paymentStatuses).map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>
      ) : isEditing ? (
        <input
          autoFocus
          className="h-8 w-full rounded-md border border-teal-300 bg-white px-2 text-xs font-bold outline-none ring-2 ring-teal-100"
          onBlur={() => onSave()}
          onChange={(event) => onEditorChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSave();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              onEditorChange(String(record[field] ?? ""));
              onSave(String(record[field] ?? ""));
            }
          }}
          type={column.type === "date" ? "date" : column.type === "money" ? "number" : "text"}
          value={editorValue}
        />
      ) : (
        <button
          className={`block h-8 w-full min-w-0 truncate rounded px-1.5 text-left ${
            isReadOnly ? "cursor-default" : "cursor-text hover:bg-slate-50 hover:ring-1 hover:ring-teal-200"
          }`}
          disabled={isReadOnly || isSaving}
          onClick={() => {
            if (!isReadOnly && record.id) {
              onEdit(field, String(record[field] ?? ""));
            }
          }}
          title={String(displayValue || "")}
          type="button"
        >
          {isSaving ? "Saving..." : displayValue || "-"}
        </button>
      )}
    </td>
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

function prepareRecordUpdate(record: BillingRecord, field: BillingField, rawValue: string): BillingRecord {
  const nextRecord = {
    ...record,
    [field]: isMoneyField(field) ? toNumber(rawValue) : rawValue
  };

  return recalc(nextRecord);
}

function getDisplayValue(record: BillingRecord, column: BillingColumn, matters: GstatMatter[]) {
  if (column.field === "gstat_matter") {
    return getMatterLabel(record, matters);
  }

  if (column.field === "tax") {
    return formatMoney(toNumber(record.cgst) + toNumber(record.sgst) + toNumber(record.igst));
  }

  if (column.field === "actions") {
    return "";
  }

  const value = record[column.field];

  if (column.type === "money" || column.field === "total") {
    return formatMoney(value as number);
  }

  return String(value ?? "");
}

function getMatterLabel(record: BillingRecord, matters: GstatMatter[]) {
  return matters.find((matter) => matter.id === record.gstat_appeal_id)?.label ?? "";
}

function getColumnLabel(field: BillingField) {
  return billingColumns.find((column) => column.field === field)?.label ?? field;
}

function isMoneyField(field: BillingField) {
  return field === "professional_fee" || field === "cgst" || field === "sgst" || field === "igst" || field === "total";
}

function recalc(record: BillingRecord): BillingRecord {
  return {
    ...record,
    total: toNumber(record.professional_fee) + toNumber(record.cgst) + toNumber(record.sgst) + toNumber(record.igst)
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
