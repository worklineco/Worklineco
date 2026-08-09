"use client";

import { useEffect, useRef, useState } from "react";

export const viewOnlyRegisterMessage =
  "View-only access: Article Assistants can view this register but not edit it. Ask a Senior Manager or Partner for the Admin role if you need editing rights.";

/**
 * Client-side mirror of the server-side register permissions: Article
 * Assistants without the Admin role are view-only on TaskLine, GSTAT, and
 * Client Records. The server enforces this independently - this hook only
 * improves the experience by disabling edit affordances up front.
 */
export function useRegisterEditAccess() {
  const [canEditRegister, setCanEditRegister] = useState(true);
  const canEditRegisterRef = useRef(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/me", { cache: "no-store" });
        const result = (await response.json().catch(() => null)) as { canEditRegisters?: boolean } | null;

        if (!cancelled && response.ok && result?.canEditRegisters === false) {
          setCanEditRegister(false);
          canEditRegisterRef.current = false;
        }
      } catch {
        // Default to editable UI; the server still blocks disallowed writes.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { canEditRegister, canEditRegisterRef };
}
