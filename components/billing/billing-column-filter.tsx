"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";

type Props = {
  label: string;
  anchor: { left: number; bottom: number };
  options: string[];
  selected?: string[];
  onApply: (values: string[] | undefined) => void;
  onSort: (direction: "asc" | "desc" | null) => void;
  onClose: () => void;
};

export function BillingColumnFilter({ label, anchor, options, selected, onApply, onSort, onClose }: Props) {
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState(() => selected ?? options);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const visible = useMemo(() => options.filter((value) => (value || "(Blanks)").toLowerCase().includes(search.toLowerCase())), [options, search]);
  const allSelected = visible.length > 0 && visible.every((value) => draft.includes(value));

  useEffect(() => {
    searchRef.current?.focus();
    function onPointer(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && !menuRef.current?.contains(target)) onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
    }
    function onResize() { onClose(); }
    function onScroll(event: Event) {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      onClose();
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;
  const top = Math.max(8, Math.min(anchor.bottom + 4, window.innerHeight - 420));
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - 296));
  const buttonClass = "w-full rounded-md px-2 py-2 text-left text-sm font-semibold hover:bg-slate-100";

  return createPortal(
    <div ref={menuRef} role="dialog" aria-label={`Filter ${label}`} className="fixed z-[1000] flex w-72 flex-col overflow-hidden rounded-lg border border-slate-300 bg-white p-2 text-slate-900 shadow-2xl" style={{ top, left, maxHeight: window.innerHeight - top - 8 }}>
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 pb-2">
        <span className="truncate text-sm font-bold" title={label}>{label}</span>
        <button aria-label="Close filter" onClick={onClose} type="button"><X className="size-4" /></button>
      </div>
      <button className={buttonClass} onClick={() => onSort("asc")} type="button">Sort ascending (A–Z / smallest first)</button>
      <button className={buttonClass} onClick={() => onSort("desc")} type="button">Sort descending (Z–A / largest first)</button>
      <button className={buttonClass} onClick={() => onSort(null)} type="button">Clear sorting</button>
      <button className={buttonClass} onClick={() => onApply(undefined)} type="button">Clear column filter</button>
      <div className="my-2 flex shrink-0 items-center gap-2 rounded-md border border-slate-300 px-2 py-1.5">
        <Search className="size-4 text-slate-400" />
        <input ref={searchRef} aria-label="Search filter values" className="min-w-0 flex-1 text-sm outline-none" placeholder="Search" value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto border border-slate-200 bg-slate-50 p-2" style={{ maxHeight: 220 }}>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={allSelected} ref={(node) => { if (node) node.indeterminate = !allSelected && visible.some((value) => draft.includes(value)); }} onChange={() => setDraft((current) => allSelected ? current.filter((value) => !visible.includes(value)) : Array.from(new Set([...current, ...visible])))} />
          (Select All)
        </label>
        {visible.map((value) => <label key={value} className="mt-1 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.includes(value)} onChange={() => setDraft((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])} />
          <span className="truncate" title={value || "(Blanks)"}>{value || "(Blanks)"}</span>
        </label>)}
        {!visible.length && <p className="py-3 text-sm text-slate-500">No values found</p>}
      </div>
      <div className="mt-2 flex shrink-0 justify-end gap-2">
        <button className="rounded-md border px-3 py-2 text-sm font-semibold" onClick={onClose} type="button">Cancel</button>
        <button className="rounded-md bg-navy-700 px-4 py-2 text-sm font-semibold text-white" onClick={() => onApply(options.every((value) => draft.includes(value)) ? undefined : draft)} type="button">Apply</button>
      </div>
    </div>, document.body
  );
}
