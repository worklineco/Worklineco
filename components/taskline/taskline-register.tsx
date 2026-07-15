"use client";

import { Download, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";

type TaskLineColumn = {
  key: string;
  label: string;
  type?: "date" | "money" | "number" | "select" | "text";
  width: number;
};
type TaskLineRow = Record<string, string>;

const taskLineColumns: TaskLineColumn[] = [
  { key: "team", label: "Team", width: 120 },
  { key: "serial_no", label: "S. No.", width: 82 },
  { key: "name", label: "Name", width: 160 },
  { key: "resource", label: "Resource", width: 150 },
  { key: "entity_group", label: "Entity Group", width: 170 },
  { key: "entity", label: "Entity", width: 190 },
  { key: "state_name", label: "State Name", width: 140 },
  { key: "task", label: "Task", width: 230 },
  { key: "due_date", label: "Due Date", type: "date", width: 135 },
  { key: "stage", label: "Stage", width: 140 },
  { key: "status_open_close", label: "Status Open/Close", type: "select", width: 170 },
  { key: "remarks", label: "Remarks", width: 220 },
  { key: "ref_date", label: "Order/SCN,etc. Ref. Date", type: "date", width: 200 },
  { key: "ref_no", label: "Order/SCN,etc. Ref. No", width: 200 },
  { key: "period", label: "Period", width: 120 },
  { key: "section", label: "Section (73/74/75)", width: 160 },
  { key: "issue", label: "Issue", width: 220 },
  { key: "refer_other_task", label: "Refer other Task", width: 170 },
  { key: "appeal_no", label: "Appeal No.", width: 150 },
  { key: "order_type", label: "Order Type", width: 150 },
  { key: "court_location", label: "Court Location", width: 170 },
  { key: "engaged_counsel", label: "Engaged Counsel", width: 180 },
  { key: "printing", label: "Printing", width: 120 },
  { key: "billing_status", label: "Billing Status", width: 160 },
  { key: "el_reference", label: "EL Reference No. and Document Link", width: 270 },
  { key: "tax_invoice_no", label: "Tax Invoice No.", width: 165 },
  { key: "realisation_status", label: "Realisation Status", width: 170 },
  { key: "reminder_days", label: "Reminder Days", type: "number", width: 150 },
  { key: "reminder_email", label: "Reminder Email", width: 210 },
  { key: "remaining_days", label: "Remaining Days", width: 150 },
  { key: "status", label: "Status", width: 130 },
  { key: "entry_date", label: "Entry Date", type: "date", width: 135 },
  { key: "completion_date", label: "Completion Date", type: "date", width: 160 },
  { key: "poc", label: "POC", width: 150 },
  { key: "pending_from", label: "Pending From", width: 160 },
  { key: "document_link", label: "Document Link", width: 220 },
  { key: "total_agreed_fee", label: "Total Agreed Fee", type: "money", width: 165 },
  { key: "amount_raised", label: "Amount Raised", type: "money", width: 150 },
  { key: "amount_realised", label: "Amount Realised", type: "money", width: 165 },
  { key: "counsel_fee", label: "Counsel Fee", type: "money", width: 145 },
  { key: "referral_fee", label: "Referral Fee", type: "money", width: 145 },
  { key: "fee_comments", label: "Fee Comments", width: 210 },
  { key: "any_other", label: "Any Other", width: 160 },
  { key: "any_other_1", label: "Any Other 1", width: 160 }
];

const statusOptions = ["", "Open", "Close"];
const defaultRows = Array.from({ length: 8 }, (_, index) => createEmptyRow(`initial-${index + 1}`));

export function TaskLineRegister() {
  const [rows, setRows] = useState<TaskLineRow[]>(defaultRows);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const tableWidth = useMemo(() => taskLineColumns.reduce((total, column) => total + column.width, 0), []);
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesSearch = !query || taskLineColumns.some((column) => String(row[column.key] ?? "").toLowerCase().includes(query));
      const matchesStatus = !statusFilter || row.status_open_close === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [rows, search, statusFilter]);

function addRow() {
    setRows((current) => [createEmptyRow(`draft-${crypto.randomUUID()}`), ...current]);
  }

  function updateRow(rowIndex: number, key: string, value: string) {
    setRows((current) => current.map((row, index) => (index === rowIndex ? { ...row, [key]: value } : row)));
  }

  return (
    <section className="w-full rounded-lg border border-slate-200 bg-white p-4 shadow-[0_18px_60px_rgba(15,23,42,0.10)]">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-rose-700">TaskLine register</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">Task Register</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">
            {filteredRows.length} visible of {rows.length} task rows
          </p>
        </div>
        <div className="grid gap-2 text-sm font-black text-slate-700 sm:grid-cols-3 xl:min-w-[520px]">
          <Summary label="Open" value={String(rows.filter((row) => row.status_open_close !== "Close").length)} />
          <Summary label="Closed" value={String(rows.filter((row) => row.status_open_close === "Close").length)} />
          <Summary label="Columns" value={String(taskLineColumns.length)} />
        </div>
      </div>

      <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(280px,1fr)_180px_auto]">
        <label className="flex h-11 items-center gap-2 rounded-md border border-slate-200 bg-white px-3">
          <Search className="size-4 text-slate-400" />
          <input
            className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold outline-none"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search task, entity, owner, document, invoice"
            value={search}
          />
        </label>
        <select
          aria-label="Status Open/Close"
          className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none"
          onChange={(event) => setStatusFilter(event.target.value)}
          value={statusFilter}
        >
          <option value="">Status: All</option>
          <option value="Open">Open</option>
          <option value="Close">Close</option>
        </select>
        <div className="flex flex-wrap gap-2">
          <button className={buttonClass("primary")} onClick={addRow} type="button">
            <Plus className="size-4" />
            Add
          </button>
          <button className={buttonClass("dark")} type="button">
            <Download className="size-4" />
            Export View
          </button>
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-sm font-bold text-slate-600">
          Showing 1-{filteredRows.length} of {filteredRows.length} matching task rows
        </p>
        <div className="max-h-[calc(100vh-260px)] overflow-auto rounded-md border border-slate-200 bg-white">
          <table className="table-fixed border-collapse text-left text-sm" style={{ minWidth: tableWidth, width: tableWidth }}>
            <colgroup>
              {taskLineColumns.map((column) => (
                <col key={column.key} style={{ width: column.width }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-slate-950 text-xs font-black uppercase text-white">
              <tr>
                {taskLineColumns.map((column) => (
                  <th className="border-r border-white/10 px-3 py-3 last:border-r-0" key={column.key}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, rowIndex) => (
                <tr className="border-b border-slate-100 last:border-b-0" key={row.__id}>
                  {taskLineColumns.map((column) => (
                    <td className="border-r border-slate-100 px-2 py-2 last:border-r-0" key={`${row.__id}-${column.key}`}>
                      {column.key === "serial_no" ? (
                        <span className="block h-8 px-1.5 py-1.5 font-semibold text-slate-700">{rowIndex + 1}</span>
                      ) : column.type === "select" ? (
                        <select
                          className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-bold outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                          onChange={(event) => updateRow(rows.indexOf(row), column.key, event.target.value)}
                          value={row[column.key] ?? ""}
                        >
                          {statusOptions.map((option) => (
                            <option key={option} value={option}>{option || "-"}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="h-8 w-full rounded-md border border-transparent bg-transparent px-1.5 text-xs font-semibold text-slate-700 outline-none hover:border-slate-200 hover:bg-slate-50 focus:border-rose-300 focus:bg-white focus:ring-2 focus:ring-rose-100"
                          onChange={(event) => updateRow(rows.indexOf(row), column.key, event.target.value)}
                          type={column.type === "date" ? "date" : column.type === "number" || column.type === "money" ? "number" : "text"}
                          value={row[column.key] ?? ""}
                        />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm text-slate-950">{value}</p>
    </div>
  );
}

function buttonClass(tone: "dark" | "primary") {
  const base = "inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50";
  if (tone === "primary") {
    return `${base} bg-teal-700 text-white hover:bg-teal-800`;
  }

  return `${base} bg-slate-950 text-white hover:bg-slate-800`;
}

function createEmptyRow(id: string): TaskLineRow {
  return taskLineColumns.reduce<TaskLineRow>(
    (row, column) => {
      row[column.key] = "";
      return row;
    },
    { __id: id }
  );
}
