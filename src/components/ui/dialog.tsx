"use client";

import type * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

/**
 * Ako vrstva prichádza a odchádza.
 *
 * - `dialog` — okno uprostred (predvolené).
 * - `sheet` — panel: na telefóne zospodu, od `md` sprava. Pre detaily,
 *   ktoré sa na počítači otvárajú pri pravom okraji.
 * - `none` — bez animácie. Pre vrstvy otvárané z klávesnice mnohokrát
 *   denne (paleta príkazov, zachytenie): každá animácia by ich spomalila.
 */
export type DialogMotion = "dialog" | "sheet" | "none";

export function DialogOverlay({
  className,
  animated = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay> & { animated?: boolean }) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        // Tmavý závoj musí byť tmavý v oboch režimoch: vo svetlom to je `fg`,
        // v tmavom `bg` — iný token, ktorý je tmavý v oboch, neexistuje.
        "fixed inset-0 z-50 bg-fg/25 backdrop-blur-[2px] dark:bg-bg/75",
        animated && "motion-overlay",
        className,
      )}
      {...props}
    />
  );
}

export function DialogContent({
  className,
  children,
  showClose = true,
  motion = "dialog",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showClose?: boolean;
  motion?: DialogMotion;
}) {
  return (
    <DialogPortal>
      <DialogOverlay animated={motion !== "none"} />
      <DialogPrimitive.Content
        className={cn(
          // Centrovanie cez `inset-0 + m-auto`, nie cez translate — inak by
          // ho prepísala vstupná animácia, ktorá hýbe transformom.
          "fixed inset-0 z-50 m-auto h-fit w-[calc(100%-2rem)] max-w-lg",
          motion === "dialog" && "motion-dialog",
          motion === "sheet" && "motion-sheet",
          "max-h-[calc(100dvh-4rem)] overflow-y-auto",
          "rounded border border-border bg-surface p-4 shadow-md outline-none",
          className,
        )}
        {...props}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close
            aria-label="Zavrieť"
            className={cn(
              "absolute right-3 top-3 inline-flex size-7 items-center justify-center rounded",
              "text-fg-subtle transition-colors duration-100 hover:bg-surface-2 hover:text-fg",
            )}
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

export function DialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div className={cn("mb-3 flex flex-col gap-1 pr-8", className)} {...props} />;
}

export function DialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("text-sm font-semibold tracking-tight text-fg", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-body leading-relaxed text-fg-muted", className)}
      {...props}
    />
  );
}
