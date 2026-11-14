import type { ReactNode } from "react";

/** Route enter transition (fade + rise 12px, 0.4s) via CSS so it works without JS; see `.page-enter`. */
export function PageTransition({ children }: { children: ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
