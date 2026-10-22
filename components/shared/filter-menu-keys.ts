"use client";

import { useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

// Excel-style keyboard navigation for a column filter menu, shared by every
// register: Arrow keys walk the value list (the highlighted row scrolls into
// view), Space ticks/unticks the highlighted value, Enter ticks it - or
// applies the filter when typing in the search box or nothing is highlighted.
// Typing (including spaces) in the search box keeps working normally.
export function useFilterMenuKeys({
  itemCount,
  onApply,
  onToggleIndex
}: {
  itemCount: number;
  onApply: () => void;
  onToggleIndex: (index: number) => void;
}) {
  const [highlight, setHighlight] = useState(-1);

  function moveHighlight(delta: number, root: HTMLElement) {
    setHighlight((current) => {
      const next = Math.max(0, Math.min(itemCount - 1, (current < 0 ? -1 : current) + delta));
      root.querySelector(`[data-filter-option="${next}"]`)?.scrollIntoView({ block: "nearest" });
      return next;
    });
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent) {
    const root = event.currentTarget as HTMLElement;
    const target = event.target;
    const typingInSearch = target instanceof HTMLInputElement && target.type !== "checkbox";
    const onCheckbox = target instanceof HTMLInputElement && target.type === "checkbox";

    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveHighlight(1, root);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveHighlight(-1, root);
    } else if (event.key === " " && !typingInSearch && !onCheckbox && highlight >= 0 && highlight < itemCount) {
      event.preventDefault();
      onToggleIndex(highlight);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (!typingInSearch && highlight >= 0 && highlight < itemCount) {
        onToggleIndex(highlight);
      } else {
        onApply();
      }
    }
  }

  return { handleMenuKeyDown, highlight, setHighlight };
}

// Class suffix for a filter option row so the highlighted row is visible.
export function filterOptionHighlightClass(isHighlighted: boolean) {
  return isHighlighted ? " rounded bg-navy-100 ring-1 ring-navy-300" : "";
}
