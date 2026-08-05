import type { ReactNode } from "react";
import { CircleCheck } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Prázdny stav. Prázdny inbox nie je chyba — je to odmena,
 * preto je tón pokojný a zelený, nie varovný.
 */
export interface TaskEmptyProps {
  title: string;
  description?: string;
  /** Voliteľné tlačidlo alebo odkaz pod textom. */
  action?: ReactNode;
  /** Vlastná ikona; default je zelené odškrtnutie. */
  icon?: ReactNode;
  className?: string;
}

export function TaskEmpty({ title, description, action, icon, className }: TaskEmptyProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded border border-dashed border-border",
        "bg-surface px-6 py-10 text-center",
        className,
      )}
    >
      <span aria-hidden="true" className="text-success">
        {icon ?? <CircleCheck size={26} strokeWidth={1.75} />}
      </span>
      <p className="text-sm font-medium text-fg">{title}</p>
      {description ? <p className="max-w-xs text-sm text-fg-muted">{description}</p> : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
