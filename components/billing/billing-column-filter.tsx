"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
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

// Windowed list: with thousands of values, only the rows in view are
// rendered, so typing in the search stays smooth.
const optionRowHeight = 30;
const optionListHeight = 340;

export function BillingColumnFilter({ label, anchor, options, selected, onApply, onSort, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState(() => selected ?? options);
  const [scrollTop, setScrollTop] = useState(0);
  const [highlight, setHighlight] = useState(-1);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Debounce typing (~120ms): the input echoes instantly, the list follows.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query), 120);
    return () => window.clearTimeout(timer);
  }, [query]);

  // Lowercase once per menu open instead of on every keystroke.
  const searchableOptions = useMemo(
    () => options.map((value) => ({ lower: (value || "(Blanks)").toLowerCase(), value })),
    [options]
  );
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const matched = needle ? searchableOptions.filter((option) => option.lower.includes(needle)) : searchableOptions;
    return matched.map((option) => option.value);
  }, [search, searchableOptions]);
  const draftSet = useMemo(() => new Set(draft), [draft]);
  const allSelected = visible.length > 0 && visible.every((value) => draftSet.has(value));
  const someSelected = !allSelected && visible.some((value) => draftSet.has(value));

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
    setScrollTop(0);
    setHighlight(-1);
  }, [search]);

  useEffect(() => {
    searchRef.current?.focus();
    function onPointer(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && !menuRef.current?.contains(target)) onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); return; }

      // Excel-style shortcut: C clears this column's filter, unless the user
      // is typing in the search box.
      const target = event.target;
      const isTyping = target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && target.type !== "checkbox");

      if ((event.key === "c" || event.key === "C") && !isTyping) {
        event.preventDefault();
        onApply(undefined);
      }
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
  }, [onApply, onClose]);

  if (typeof document === "undefined") return null;
  const top = Math.max(8, Math.min(anchor.bottom + 4, window.innerHeight - 560));
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - 328));
  const buttonClass = "w-full rounded-md px-2 py-2 text-left text-sm font-semibold hover:bg-slate-100";

  function toggleValue(value: string) {
    setDraft((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  function applyDraft() {
    onApply(options.every((value) => draftSet.has(value)) ? undefined : draft);
  }

  // Arrow keys walk the value list from anywhere in the menu (including the
  // search box); Space ticks the highlighted value, Enter applies.
  function moveHighlight(delta: number) {
    setHighlight((current) => {
      const next = Math.max(0, Math.min(visible.length - 1, (current < 0 ? -1 : current) + delta));
      const list = listRef.current;
      if (list) {
        const rowTop = next * optionRowHeight;
        if (rowTop < list.scrollTop) list.scrollTop = rowTop;
        else if (rowTop + optionRowHeight > list.scrollTop + list.clientHeight) {
          list.scrollTop = rowTop + optionRowHeight - list.clientHeight;
        }
      }
      return next;
    });
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveHighlight(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveHighlight(-1);
    } else if (event.key === " " && event.target !== searchRef.current && highlight >= 0 && visible[highlight] !== undefined) {
      event.preventDefault();
      toggleValue(visible[highlight]);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (highlight >= 0 && visible[highlight] !== undefined && event.target !== searchRef.current) {
        toggleValue(visible[highlight]);
      } else {
        applyDraft();
      }
    }
  }

  function toggleAll() {
    setDraft((current) => {
      if (allSelected) {
        const visibleSet = new Set(visible);
        return current.filter((value) => !visibleSet.has(value));
      }
      return Array.from(new Set([...current, ...visible]));
    });
  }

  const windowStart = Math.max(0, Math.floor(scrollTop / optionRowHeight) - 8);
  const windowEnd = Math.min(visible.length, windowStart + Math.ceil(optionListHeight / optionRowHeight) + 16);
  const windowed = visible.slice(windowStart, windowEnd);

  return createPortal(
    <div ref={menuRef} role="dialog" aria-label={`Filter ${label}`} className="fixed z-[1000] flex w-80 flex-col overflow-hidden rounded-lg border border-slate-300 bg-white p-2 text-slate-900 shadow-2xl" onKeyDown={handleMenuKeyDown} style={{ top, left, maxHeight: window.innerHeight - top - 8 }}>
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
        <input ref={searchRef} aria-label="Search filter values" className="min-w-0 flex-1 text-sm outline-none" placeholder="Search" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden border border-slate-200 bg-slate-50 p-2">
        <label className="flex shrink-0 items-center gap-2 text-sm font-semibold" style={{ height: optionRowHeight }}>
          <input type="checkbox" checked={allSelected} ref={(node) => { if (node) node.indeterminate = someSelected; }} onChange={toggleAll} />
          (Select All)
        </label>
        <div
          className="min-h-0 flex-1 overflow-auto"
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          ref={listRef}
          style={{ maxHeight: optionListHeight }}
        >
          {visible.length ? (
            <div style={{ height: visible.length * optionRowHeight, position: "relative" }}>
              <div style={{ position: "absolute", top: windowStart * optionRowHeight, width: "100%" }}>
                {windowed.map((value, windowIndex) => {
                  const optionIndex = windowStart + windowIndex;
                  return (
                    <label
                      key={value}
                      className={`flex items-center gap-2 rounded px-1 text-sm ${optionIndex === highlight ? "bg-navy-100 ring-1 ring-navy-300" : ""}`}
                      onMouseEnter={() => setHighlight(optionIndex)}
                      style={{ height: optionRowHeight }}
                    >
                      <input type="checkbox" checked={draftSet.has(value)} onChange={() => toggleValue(value)} />
                      <span className="truncate" title={value || "(Blanks)"}>{value || "(Blanks)"}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="py-3 text-sm text-slate-500">No values found</p>
          )}
        </div>
      </div>
      <div className="mt-2 flex shrink-0 justify-end gap-2">
        <button className="rounded-md border px-3 py-2 text-sm font-semibold" onClick={onClose} type="button">Cancel</button>
        <button className="rounded-md bg-navy-700 px-4 py-2 text-sm font-semibold text-white" onClick={applyDraft} type="button">Apply</button>
      </div>
    </div>, document.body
  );
}
