"use client";

import { ChevronDown, Search } from "lucide-react";
import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type SelectOption = { value: string; label: string };

const renderLimit = 200;

/** A themed, searchable picker that escapes scrolling dialogs and respects page zoom. */
export function SearchableSelect({ value, options, onChange, placeholder, disabled = false, allowCustom = false }: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  allowCustom?: boolean;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, height: 300 });
  const selected = options.find((option) => option.value === value);
  const visible = useMemo(() => options.filter((option) => option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [options, query]);
  // Render at most a window of matches — huge lists (hundreds of clients) stay
  // smooth to open and type into; the search narrows to anything beyond it.
  const shown = useMemo(() => visible.slice(0, renderLimit), [visible]);
  const custom = allowCustom && query.trim() && !options.some((option) => option.value.toLocaleLowerCase() === query.trim().toLocaleLowerCase());

  function close() { setOpen(false); }
  function choose(next: string) { onChange(next); close(); trigger.current?.focus({ preventScroll: true }); }

  useLayoutEffect(() => {
    if (!open) return;
    const anchor = trigger.current;
    const overlay = host.current;
    if (!anchor || !overlay) return;
    function placeMenu() {
      if (!anchor || !overlay) return;
      const rect = anchor.getBoundingClientRect();
      const bounds = overlay.getBoundingClientRect();
      const scale = bounds.width / overlay.clientWidth || 1;
      const availableBelow = (window.innerHeight - rect.bottom - 12) / scale;
      const availableAbove = (rect.top - 12) / scale;
      const below = availableBelow >= 240 || availableBelow >= availableAbove;
      const height = Math.max(100, Math.min(320, below ? availableBelow : availableAbove));
      const width = Math.min(Math.max(rect.width / scale, 280), (window.innerWidth - 24) / scale);
      setPosition({
        left: Math.max(8 / scale, Math.min((rect.left - bounds.left) / scale, (window.innerWidth - 12 - bounds.left) / scale - width)),
        top: below ? (rect.bottom - bounds.top) / scale + 4 : (rect.top - bounds.top) / scale - height - 4,
        width, height
      });
    }
    // Measure before paint, then focus only after the menu is positioned.
    // Native autofocus may scroll an overflow dialog and immediately dismiss
    // a freshly opened menu, particularly with browser/page zoom enabled.
    placeMenu();
    const focusFrame = window.requestAnimationFrame(() => searchInput.current?.focus({ preventScroll: true }));
    let positionFrame = 0;
    function reposition() {
      window.cancelAnimationFrame(positionFrame);
      positionFrame = window.requestAnimationFrame(placeMenu);
    }
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !menu.current?.contains(event.target) && !anchor?.contains(event.target)) close();
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopImmediatePropagation(); close(); anchor?.focus({ preventScroll: true });
      }
    }
    function scroll(event: Event) {
      if (event.target instanceof Node && menu.current?.contains(event.target)) return;
      reposition();
    }
    document.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", escape, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", escape, true);
      window.cancelAnimationFrame(focusFrame);
      window.cancelAnimationFrame(positionFrame);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [open]);

  return <div className="mt-1 normal-case tracking-normal">
    <button ref={trigger} type="button" disabled={disabled} aria-label={placeholder} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined}
      title={selected?.label || value || placeholder}
      className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-navy-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
      onClick={() => { setQuery(""); setActive(0); setPosition((current) => ({ ...current, width: 0 })); setOpen(!open); }}>
      <span className="min-w-0 flex-1 truncate">{selected?.label || value || placeholder}</span><ChevronDown className="size-4 shrink-0" />
    </button>
    {open ? createPortal(<div ref={host} className="pointer-events-none fixed inset-0 z-[150]">
      <div ref={menu} className="pointer-events-auto absolute flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white text-slate-900 shadow-2xl" style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.height, visibility: position.width ? "visible" : "hidden" }}>
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 p-2"><Search className="size-4 text-slate-400" />
          <input ref={searchInput} role="combobox" aria-label={`Search ${placeholder.replace(/^Select /i, "")}`} aria-expanded="true" aria-controls={id} aria-activedescendant={shown[active] ? `${id}-${active}` : undefined}
            className="min-w-0 flex-1 bg-white p-1 text-sm text-slate-900 outline-none" placeholder="Search…" value={query}
            onChange={(event) => { setQuery(event.target.value); setActive(0); }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault(); const next = Math.max(0, Math.min(shown.length - 1, active + (event.key === "ArrowDown" ? 1 : -1))); setActive(next);
                document.getElementById(`${id}-${next}`)?.scrollIntoView({ block: "nearest" });
              } else if (event.key === "Enter") { event.preventDefault(); if (shown[active]) choose(shown[active].value); else if (custom) choose(query.trim()); }
              else if (event.key === "Tab") close();
            }} />
        </div>
        <div id={id} role="listbox" aria-label={placeholder} className="min-h-0 overflow-y-auto p-1">
          {value ? <button type="button" className="w-full rounded px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-100" onClick={() => choose("")}>Clear selection</button> : null}
          {custom ? <button type="button" className="w-full break-words rounded bg-emerald-50 px-3 py-2 text-left text-sm text-emerald-800" onClick={() => choose(query.trim())}>Use “{query.trim()}”</button> : null}
          {shown.map((option, index) => <button key={option.value} id={`${id}-${index}`} type="button" role="option" aria-selected={option.value === value} title={option.label}
            className={`block w-full whitespace-normal break-words rounded px-3 py-2 text-left text-sm font-semibold ${option.value === value ? "bg-navy-700 text-white" : index === active ? "bg-slate-100 text-slate-900" : "text-slate-900 hover:bg-slate-100"}`}
            onClick={() => choose(option.value)}>{option.label}</button>)}
          {visible.length > shown.length ? <p className="px-3 py-2 text-xs font-semibold text-slate-500">{(visible.length - shown.length).toLocaleString("en-IN")} more — keep typing to narrow down.</p> : null}
          {!visible.length ? <p className="px-3 py-3 text-sm text-slate-500">No matching options.</p> : null}
        </div>
      </div>
    </div>, document.body) : null}
  </div>;
}

