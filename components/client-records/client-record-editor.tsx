"use client";

import { ChevronDown, Plus, Search, X } from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";

type RowValues = Record<string, string>;

// ---------------------------------------------------------------------------
// Tiny per-field form store. Each field component subscribes only to its own
// value/error, so typing in one field never re-renders the rest of the form.
// ---------------------------------------------------------------------------

type FormStore = {
  getError: (field: string) => string;
  getErrorCount: (fields: readonly string[]) => number;
  getValue: (field: string) => string;
  getValues: () => RowValues;
  setErrors: (errors: Record<string, string>) => void;
  setValue: (field: string, value: string) => void;
  subscribe: (field: string, listener: () => void) => () => void;
  subscribeAny: (listener: () => void) => () => void;
};

function createFormStore(initial: RowValues): FormStore {
  let values: RowValues = { ...initial };
  let errors: Record<string, string> = {};
  const fieldListeners = new Map<string, Set<() => void>>();
  const anyListeners = new Set<() => void>();

  function emit(field: string) {
    fieldListeners.get(field)?.forEach((listener) => listener());
    anyListeners.forEach((listener) => listener());
  }

  return {
    getError: (field) => errors[field] ?? "",
    getErrorCount: (fields) => fields.reduce((count, field) => count + (errors[field] ? 1 : 0), 0),
    getValue: (field) => values[field] ?? "",
    getValues: () => ({ ...values }),
    setErrors(next) {
      const touched = new Set([...Object.keys(errors), ...Object.keys(next)]);
      errors = { ...next };
      touched.forEach(emit);
    },
    setValue(field, value) {
      if ((values[field] ?? "") === value) return;
      values = { ...values, [field]: value };
      if (errors[field]) {
        const nextErrors = { ...errors };
        delete nextErrors[field];
        errors = nextErrors;
      }
      emit(field);
    },
    subscribe(field, listener) {
      const listeners = fieldListeners.get(field) ?? new Set();
      listeners.add(listener);
      fieldListeners.set(field, listeners);
      return () => listeners.delete(listener);
    },
    subscribeAny(listener) {
      anyListeners.add(listener);
      return () => anyListeners.delete(listener);
    }
  };
}

function useFieldValue(store: FormStore, field: string) {
  return useSyncExternalStore(
    useCallback((listener: () => void) => store.subscribe(field, listener), [field, store]),
    () => store.getValue(field),
    () => store.getValue(field)
  );
}

function useFieldError(store: FormStore, field: string) {
  return useSyncExternalStore(
    useCallback((listener: () => void) => store.subscribe(field, listener), [field, store]),
    () => store.getError(field),
    () => store.getError(field)
  );
}

function useSectionErrorCount(store: FormStore, fields: readonly string[]) {
  return useSyncExternalStore(
    useCallback((listener: () => void) => store.subscribeAny(listener), [store]),
    () => store.getErrorCount(fields),
    () => store.getErrorCount(fields)
  );
}

// ---------------------------------------------------------------------------
// Static lists - hardcoded so the dropdowns open with no fetch delay.
// ---------------------------------------------------------------------------

export const registrationTypes = [
  "Private Limited Company",
  "Public Limited Company",
  "One Person Company",
  "Section 8 Company",
  "LLP",
  "Partnership Firm",
  "Sole Proprietorship",
  "HUF",
  "Trust",
  "Society",
  "Government Body",
  "Foreign Company",
  "Other"
];

export const otherTerritoryOption = "Other Territory (Outside India)";

// GST state codes (first two digits of a GSTIN) to state names.
const gstStateCodeMap: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "25": "Daman and Diu",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "28": "Andhra Pradesh",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "96": otherTerritoryOption,
  "97": otherTerritoryOption
};

export const indianStates = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  otherTerritoryOption
];

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

const sections: Array<{ fields: string[]; key: string; title: string }> = [
  { fields: ["Group", "Particulars", "Registration Type"], key: "entity", title: "Entity Details" },
  { fields: ["POC Name", "POC Contact no.", "Email ID"], key: "poc", title: "Point of Contact" },
  { fields: ["Address", "State", "Country"], key: "address", title: "Address" },
  { fields: ["GSTIN/UIN", "PAN/IT No.", "GST-ID", "GST-PASS"], key: "tax", title: "Tax & Compliance" },
  { fields: ["Client Type", "Autobilling", "Billing Date", "Fixed Monthly Amount"], key: "billing", title: "Billing" }
];

const fieldLabels: Record<string, string> = {
  "Email ID": "POC Email",
  Particulars: "Entity Name"
};

function fieldLabel(field: string) {
  return fieldLabels[field] ?? field;
}

export function validateClientRecord(values: RowValues) {
  const errors: Record<string, string> = {};

  if (!String(values.Particulars ?? "").trim()) {
    errors.Particulars = "Entity name is required.";
  }

  const email = String(values["Email ID"] ?? "").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors["Email ID"] = "Enter a valid email address.";
  }

  const phoneDigits = String(values["POC Contact no."] ?? "").replace(/\D/g, "");
  if (String(values["POC Contact no."] ?? "").trim() && (phoneDigits.length < 7 || phoneDigits.length > 15)) {
    errors["POC Contact no."] = "Enter a valid contact number.";
  }

  const gstin = String(values["GSTIN/UIN"] ?? "").trim().toUpperCase();
  if (gstin && !/^[0-9]{2}[A-Z0-9]{13}$/.test(gstin)) {
    errors["GSTIN/UIN"] = "GSTIN must be 15 characters: 2-digit state code + 13 characters.";
  }

  const pan = String(values["PAN/IT No."] ?? "").trim().toUpperCase();
  if (pan && !/^[A-Z0-9]{10}$/.test(pan)) {
    errors["PAN/IT No."] = "PAN must be 10 characters.";
  }

  if (values["Client Type"] === "Retainer" && values.Autobilling === "Yes") {
    const day = Number(values["Billing Date"]);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      errors["Billing Date"] = "Enter a day of the month from 1 to 31.";
    }

    const amount = Number(String(values["Fixed Monthly Amount"] ?? "").replace(/[,\s₹]/g, ""));
    if (!(amount > 0)) {
      errors["Fixed Monthly Amount"] = "Enter the fixed monthly amount.";
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Searchable dropdown with debounce, virtualization, keyboard navigation and
// a 150ms open animation. Rendered through a portal so the scrolling modal
// body never clips it.
// ---------------------------------------------------------------------------

const optionItemHeight = 34;
const panelListHeight = 238;
const virtualizeThreshold = 60;

function SearchableSelect({
  allowAddNew = false,
  disabled = false,
  invalid = false,
  onAddNew,
  onChange,
  options,
  placeholder = "Select",
  value
}: {
  allowAddNew?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  onAddNew?: (value: string) => void;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  value: string;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [panelPos, setPanelPos] = useState<{ left: number; openUp: boolean; top: number; width: number } | null>(null);
  const [query, setQuery] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  // Debounce typing (~150ms) before filtering.
  useEffect(() => {
    const timer = window.setTimeout(() => setFilterQuery(query), 150);
    return () => window.clearTimeout(timer);
  }, [query]);

  const filtered = useMemo(() => {
    const needle = filterQuery.trim().toLowerCase();
    return needle ? options.filter((option) => option.toLowerCase().includes(needle)) : options;
  }, [filterQuery, options]);

  const trimmedQuery = query.trim();
  const showAddNew =
    allowAddNew && Boolean(trimmedQuery) && !options.some((option) => option.toLowerCase() === trimmedQuery.toLowerCase());
  const rowCount = filtered.length + (showAddNew ? 1 : 0);

  const openPanel = useCallback(() => {
    if (disabled) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.max(rect.width, 240);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < 320 && rect.top > 340;
    setPanelPos({ left, openUp, top: openUp ? rect.top - 6 : rect.bottom + 6, width });
    setQuery("");
    setFilterQuery("");
    setHighlight(0);
    setScrollTop(0);
    setIsOpen(true);
    requestAnimationFrame(() => setIsVisible(true));
  }, [disabled]);

  const closePanel = useCallback(() => {
    setIsOpen(false);
    setIsVisible(false);
    setPanelPos(null);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => searchRef.current?.focus(), 30);

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && (panelRef.current?.contains(target) || triggerRef.current?.contains(target))) return;
      closePanel();
    }

    function handleScroll(event: Event) {
      if (event.target instanceof Element && panelRef.current?.contains(event.target)) return;
      closePanel();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", closePanel);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", closePanel);
    };
  }, [closePanel, isOpen]);

  useEffect(() => {
    setHighlight((current) => Math.min(current, Math.max(0, rowCount - 1)));
  }, [rowCount]);

  function pickRow(index: number) {
    if (showAddNew && index === 0) {
      onAddNew?.(trimmedQuery);
      onChange(trimmedQuery);
      closePanel();
      triggerRef.current?.focus();
      return;
    }

    const option = filtered[showAddNew ? index - 1 : index];
    if (option === undefined) return;
    onChange(option);
    closePanel();
    triggerRef.current?.focus();
  }

  function moveHighlight(delta: number) {
    setHighlight((current) => {
      const next = Math.max(0, Math.min(rowCount - 1, current + delta));
      const list = listRef.current;
      if (list) {
        const rowTop = next * optionItemHeight;
        if (rowTop < list.scrollTop) list.scrollTop = rowTop;
        else if (rowTop + optionItemHeight > list.scrollTop + list.clientHeight) {
          list.scrollTop = rowTop + optionItemHeight - list.clientHeight;
        }
      }
      return next;
    });
  }

  function handlePanelKeyDown(event: ReactKeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveHighlight(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveHighlight(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      pickRow(highlight);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closePanel();
      triggerRef.current?.focus();
    }
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent) {
    if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
      event.preventDefault();
      openPanel();
    }
  }

  // Virtualize long lists: render only the rows in (and near) the viewport.
  const virtualized = rowCount > virtualizeThreshold;
  const visibleStart = virtualized ? Math.max(0, Math.floor(scrollTop / optionItemHeight) - 6) : 0;
  const visibleEnd = virtualized
    ? Math.min(rowCount, visibleStart + Math.ceil(panelListHeight / optionItemHeight) + 12)
    : rowCount;
  const rows: ReactNode[] = [];
  for (let index = visibleStart; index < visibleEnd; index += 1) {
    const isAddRow = showAddNew && index === 0;
    const option = isAddRow ? trimmedQuery : filtered[showAddNew ? index - 1 : index];
    if (option === undefined) continue;
    rows.push(
      <button
        className={`flex w-full items-center gap-2 truncate rounded-md px-2 text-left text-sm font-semibold ${
          index === highlight ? "bg-navy-700 text-white" : "text-slate-800 hover:bg-slate-100"
        } ${isAddRow ? "italic" : ""}`}
        key={isAddRow ? "__add_new__" : `${option}-${index}`}
        onClick={() => pickRow(index)}
        onMouseEnter={() => setHighlight(index)}
        style={{ height: optionItemHeight }}
        type="button"
      >
        {isAddRow ? (
          <>
            <Plus className="size-3.5 shrink-0" />
            <span className="truncate">Add &quot;{option}&quot;</span>
          </>
        ) : (
          <span className="truncate" title={option}>
            {option || "(Blank)"}
          </span>
        )}
      </button>
    );
  }

  return (
    <>
      <button
        className={`input mt-2 flex w-full items-center justify-between gap-2 text-left ${
          invalid ? "border-rose-400" : ""
        } ${disabled ? "cursor-not-allowed bg-slate-50 text-slate-400" : ""}`}
        disabled={disabled}
        onClick={() => (isOpen ? closePanel() : openPanel())}
        onKeyDown={handleTriggerKeyDown}
        ref={triggerRef}
        type="button"
      >
        <span className={`truncate ${value ? "text-slate-950" : "text-slate-400"}`}>{value || placeholder}</span>
        <ChevronDown className={`size-4 shrink-0 text-slate-400 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && panelPos && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed z-[1100] flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white p-2 shadow-2xl transition-[opacity,transform] duration-150 ease-out"
              onKeyDown={handlePanelKeyDown}
              ref={panelRef}
              style={{
                left: panelPos.left,
                opacity: isVisible ? 1 : 0,
                top: panelPos.openUp ? undefined : panelPos.top,
                bottom: panelPos.openUp ? window.innerHeight - panelPos.top : undefined,
                transform: isVisible ? "translateY(0) scale(1)" : `translateY(${panelPos.openUp ? 4 : -4}px) scale(0.98)`,
                width: panelPos.width
              }}
            >
              <div className="flex shrink-0 items-center gap-2 rounded-md border border-slate-200 px-2 py-1.5">
                <Search className="size-4 shrink-0 text-slate-400" />
                <input
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setHighlight(0);
                  }}
                  placeholder="Search"
                  ref={searchRef}
                  value={query}
                />
                {value ? (
                  <button
                    aria-label="Clear selection"
                    className="inline-flex size-5 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    onClick={() => {
                      onChange("");
                      closePanel();
                    }}
                    type="button"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </div>
              <div
                className="mt-2 overflow-y-auto"
                onScroll={(event) => {
                  if (virtualized) setScrollTop(event.currentTarget.scrollTop);
                }}
                ref={listRef}
                style={{ maxHeight: panelListHeight }}
              >
                {rowCount ? (
                  virtualized ? (
                    <div style={{ height: rowCount * optionItemHeight, position: "relative" }}>
                      <div style={{ position: "absolute", top: visibleStart * optionItemHeight, width: "100%" }}>{rows}</div>
                    </div>
                  ) : (
                    rows
                  )
                ) : (
                  <p className="py-6 text-center text-sm font-semibold text-slate-500">No matches found</p>
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Field components (memoized; subscribe to their own slice of the store)
// ---------------------------------------------------------------------------

function FieldShell({ children, error, field }: { children: ReactNode; error: string; field: string }) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase text-slate-500">{fieldLabel(field)}</span>
      {children}
      {error ? <span className="mt-1 block text-xs font-bold text-rose-600">{error}</span> : null}
    </label>
  );
}

const TextField = memo(function TextField({
  field,
  inputMode,
  placeholder,
  store,
  type = "text"
}: {
  field: string;
  inputMode?: "numeric" | "decimal";
  placeholder?: string;
  store: FormStore;
  type?: string;
}) {
  const value = useFieldValue(store, field);
  const error = useFieldError(store, field);

  return (
    <FieldShell error={error} field={field}>
      <input
        className={`input mt-2 ${error ? "border-rose-400" : ""}`}
        inputMode={inputMode}
        onChange={(event) => store.setValue(field, event.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </FieldShell>
  );
});

const SelectField = memo(function SelectField({
  allowAddNew,
  field,
  onAddNew,
  onPicked,
  options,
  store
}: {
  allowAddNew?: boolean;
  field: string;
  onAddNew?: (value: string) => void;
  onPicked?: (value: string, store: FormStore) => void;
  options: string[];
  store: FormStore;
}) {
  const value = useFieldValue(store, field);
  const error = useFieldError(store, field);

  return (
    <FieldShell error={error} field={field}>
      <SearchableSelect
        allowAddNew={allowAddNew}
        invalid={Boolean(error)}
        onAddNew={onAddNew}
        onChange={(next) => {
          store.setValue(field, next);
          onPicked?.(next, store);
        }}
        options={options}
        value={value}
      />
    </FieldShell>
  );
});

// GSTIN field: auto-fills PAN (characters 3-12) and State (first 2 digits).
const GstinField = memo(function GstinField({ store }: { store: FormStore }) {
  const field = "GSTIN/UIN";
  const value = useFieldValue(store, field);
  const error = useFieldError(store, field);

  return (
    <FieldShell error={error} field={field}>
      <input
        className={`input mt-2 uppercase ${error ? "border-rose-400" : ""}`}
        maxLength={15}
        onChange={(event) => {
          const gstin = event.target.value.toUpperCase();
          store.setValue(field, gstin);

          if (/^[0-9]{2}[A-Z0-9]{13}$/.test(gstin)) {
            store.setValue("PAN/IT No.", gstin.slice(2, 12));
            const stateName = gstStateCodeMap[gstin.slice(0, 2)];
            if (stateName) {
              store.setValue("State", stateName);
              store.setValue("Country", stateName === otherTerritoryOption ? store.getValue("Country") : "India");
            }
          }
        }}
        placeholder="15-character GSTIN"
        value={value}
      />
    </FieldShell>
  );
});

// Country stays locked to India unless "Other Territory" is picked as State.
const CountryField = memo(function CountryField({ store }: { store: FormStore }) {
  const field = "Country";
  const value = useFieldValue(store, field);
  const error = useFieldError(store, field);
  const state = useFieldValue(store, "State");
  const locked = Boolean(state) && state !== otherTerritoryOption;

  return (
    <FieldShell error={error} field={field}>
      <input
        className={`input mt-2 ${error ? "border-rose-400" : ""} ${locked ? "bg-slate-50 text-slate-500" : ""}`}
        disabled={locked}
        onChange={(event) => store.setValue(field, event.target.value)}
        placeholder={locked ? "India" : "Country"}
        title={locked ? "Defaults to India. Pick \"Other Territory (Outside India)\" as State to edit." : undefined}
        value={value}
      />
    </FieldShell>
  );
});

// Billing fields: Autobilling appears for Retainer clients, Billing Date when
// Autobilling is Yes, Fixed Monthly Amount once a billing date is entered.
const BillingFields = memo(function BillingFields({ store }: { store: FormStore }) {
  const clientType = useFieldValue(store, "Client Type");
  const autobilling = useFieldValue(store, "Autobilling");
  const billingDate = useFieldValue(store, "Billing Date");
  const clientTypeError = useFieldError(store, "Client Type");
  const autobillingError = useFieldError(store, "Autobilling");
  const isRetainer = clientType === "Retainer";
  const autobillingOn = isRetainer && autobilling === "Yes";

  return (
    <>
      <FieldShell error={clientTypeError} field="Client Type">
        <select
          className={`input mt-2 ${clientTypeError ? "border-rose-400" : ""}`}
          onChange={(event) => {
            const next = event.target.value;
            store.setValue("Client Type", next);
            if (next !== "Retainer") {
              store.setValue("Autobilling", "");
              store.setValue("Billing Date", "");
              store.setValue("Fixed Monthly Amount", "");
            }
          }}
          value={clientType}
        >
          <option value="">Select</option>
          <option value="One-Time">One-Time</option>
          <option value="Retainer">Retainer</option>
        </select>
      </FieldShell>
      {isRetainer ? (
        <FieldShell error={autobillingError} field="Autobilling">
          <select
            className={`input mt-2 ${autobillingError ? "border-rose-400" : ""}`}
            onChange={(event) => {
              const next = event.target.value;
              store.setValue("Autobilling", next);
              if (next !== "Yes") {
                store.setValue("Billing Date", "");
                store.setValue("Fixed Monthly Amount", "");
              }
            }}
            value={autobilling}
          >
            <option value="">Select</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>
        </FieldShell>
      ) : null}
      {autobillingOn ? (
        <TextField field="Billing Date" inputMode="numeric" placeholder="Day of month (1-31)" store={store} />
      ) : null}
      {autobillingOn && billingDate.trim() ? (
        <TextField field="Fixed Monthly Amount" inputMode="decimal" placeholder="Amount billed every month" store={store} />
      ) : null}
      {autobillingOn ? (
        <p className="text-xs font-semibold text-slate-500 md:col-span-2 xl:col-span-3">
          A billing entry is created automatically for this client on the chosen day every month. When a month is shorter
          than the chosen day, the entry is created on the month&apos;s last day.
        </p>
      ) : null}
    </>
  );
});

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------

function EditorSection({
  children,
  fields,
  store,
  title
}: {
  children: ReactNode;
  fields: readonly string[];
  store: FormStore;
  title: string;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const errorCount = useSectionErrorCount(store, fields);

  return (
    <section className="rounded-xl border border-slate-200">
      <button
        className="flex w-full items-center justify-between gap-2 rounded-xl px-4 py-3 text-left transition hover:bg-slate-50"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-700">
          {title}
          {!isOpen && errorCount ? (
            <span
              className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[11px] font-black text-white"
              title={`${errorCount} field${errorCount === 1 ? " needs" : "s need"} attention`}
            >
              {errorCount}
            </span>
          ) : null}
        </span>
        <ChevronDown className={`size-4 shrink-0 text-slate-400 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen ? <div className="grid gap-3 border-t border-slate-100 px-4 py-4 md:grid-cols-2 xl:grid-cols-3">{children}</div> : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// The modal
// ---------------------------------------------------------------------------

export function ClientRecordEditor({
  groupOptions,
  initialRow,
  isSaving,
  onAddGroup,
  onClose,
  onSave,
  title
}: {
  groupOptions: string[];
  initialRow: Record<string, string | number>;
  isSaving: boolean;
  onAddGroup: (group: string) => void;
  onClose: () => void;
  onSave: (values: RowValues) => void;
  title: string;
}) {
  const storeRef = useRef<FormStore | null>(null);
  if (!storeRef.current) {
    const initial: RowValues = {};
    for (const [key, value] of Object.entries(initialRow)) {
      initial[key] = String(value ?? "");
    }
    storeRef.current = createFormStore(initial);
  }
  const store = storeRef.current;

  function handleSave() {
    if (isSaving) return;
    const values = store.getValues();
    const errors = validateClientRecord(values);

    if (Object.keys(errors).length) {
      store.setErrors(errors);
      return;
    }

    store.setErrors({});
    onSave(values);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-700/45 p-3 sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <h3 className="text-xl font-black text-slate-950">{title}</h3>
          <button
            className="inline-flex h-9 items-center justify-center gap-2 rounded-2xl bg-white px-3 text-sm font-black text-slate-800 ring-1 ring-slate-200 transition hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            <X className="size-4" />
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <EditorSection fields={sections[0].fields} store={store} title={sections[0].title}>
            <SelectField allowAddNew field="Group" onAddNew={onAddGroup} options={groupOptions} store={store} />
            <TextField field="Particulars" placeholder="Legal name of the entity" store={store} />
            <SelectField field="Registration Type" options={registrationTypes} store={store} />
          </EditorSection>

          <EditorSection fields={sections[1].fields} store={store} title={sections[1].title}>
            <TextField field="POC Name" store={store} />
            <TextField field="POC Contact no." inputMode="numeric" store={store} />
            <TextField field="Email ID" store={store} />
          </EditorSection>

          <EditorSection fields={sections[2].fields} store={store} title={sections[2].title}>
            <TextField field="Address" store={store} />
            <SelectField
              field="State"
              onPicked={(next, formStore) => {
                if (next && next !== otherTerritoryOption) formStore.setValue("Country", "India");
                else if (next === otherTerritoryOption) formStore.setValue("Country", "");
              }}
              options={indianStates}
              store={store}
            />
            <CountryField store={store} />
          </EditorSection>

          <EditorSection fields={sections[3].fields} store={store} title={sections[3].title}>
            <GstinField store={store} />
            <TextField field="PAN/IT No." store={store} />
            <TextField field="GST-ID" store={store} />
            <TextField field="GST-PASS" store={store} />
          </EditorSection>

          <EditorSection fields={sections[4].fields} store={store} title={sections[4].title}>
            <BillingFields store={store} />
          </EditorSection>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3">
          <button
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-navy-700 px-5 text-sm font-black text-white transition hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSaving}
            onClick={handleSave}
            type="button"
          >
            {isSaving ? "Saving..." : "Save Client Record"}
          </button>
        </div>
      </div>
    </div>
  );
}
