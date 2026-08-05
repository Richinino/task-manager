import type * as React from "react";

/**
 * Jedna klávesa: `<Kbd>Ctrl</Kbd><Kbd>K</Kbd>`.
 * Vzhľad drží utilita `.kbd` v globals.css, aby bol všade rovnaký.
 */
export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}
