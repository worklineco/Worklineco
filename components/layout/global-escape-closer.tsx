"use client";

import { useEffect, useRef } from "react";

const escapeEventName = "workline:escape";

export function GlobalEscapeCloser() {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      const activeElement = document.activeElement;

      if (activeElement instanceof HTMLElement) {
        activeElement.blur();
      }

      window.dispatchEvent(new Event(escapeEventName));

      document.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((details) => {
        details.open = false;
      });

      document.querySelectorAll<HTMLDialogElement>("dialog[open]").forEach((dialog) => {
        dialog.close();
      });

      window.requestAnimationFrame(() => {
        const body = document.body;

        body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
        body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        body.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        const overlay = topVisibleOverlay();

        if (!overlay) {
          return;
        }

        const dismissButton = findDismissButton(overlay);

        if (dismissButton) {
          dismissButton.click();
          return;
        }

        overlay.click();
      });
    }

    document.addEventListener("keydown", closeOnEscape, true);
    return () => document.removeEventListener("keydown", closeOnEscape, true);
  }, []);

  return null;
}

export function useWorklineEscape(onEscape: () => void, enabled = true) {
  const callbackRef = useRef(onEscape);

  useEffect(() => {
    callbackRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    function handleEscape() {
      callbackRef.current();
    }

    window.addEventListener(escapeEventName, handleEscape);
    return () => window.removeEventListener(escapeEventName, handleEscape);
  }, [enabled]);
}

function topVisibleOverlay() {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[role="dialog"], [aria-modal="true"], dialog[open], [class*="fixed"][class*="inset-0"], [class*="absolute"][class*="inset-0"]'
    )
  ).filter((element) => {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.pointerEvents !== "none" &&
      rect.width > 0 &&
      rect.height > 0 &&
      effectiveZIndex(element) >= 0
    );
  });

  const sorted = candidates.sort((first, second) => {
    const zDifference = effectiveZIndex(first) - effectiveZIndex(second);

    if (zDifference !== 0) {
      return zDifference;
    }

    return first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING
      ? -1
      : 1;
  });

  return sorted[sorted.length - 1];
}

function effectiveZIndex(element: HTMLElement) {
  let current: HTMLElement | null = element;
  let highest = 0;

  while (current) {
    const parsed = Number.parseInt(window.getComputedStyle(current).zIndex, 10);

    if (Number.isFinite(parsed)) {
      highest = Math.max(highest, parsed);
    }

    current = current.parentElement;
  }

  return highest;
}

function findDismissButton(container: HTMLElement) {
  const direct = container.querySelector<HTMLButtonElement>(
    'button[data-workline-popup-close], button[aria-label*="close" i], button[title*="close" i], button[aria-label*="dismiss" i], button[title*="dismiss" i]'
  );

  if (direct && isVisible(direct)) {
    return direct;
  }

  return Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => {
    const label = button.textContent?.trim().toLowerCase();

    return (
      isVisible(button) &&
      (label === "close" ||
        label === "cancel" ||
        label === "remind me later" ||
        label === "back")
    );
  });
}

function isVisible(element: HTMLElement) {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();

  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    rect.width > 0 &&
    rect.height > 0
  );
}
