"use client";

import { LogOut } from "lucide-react";

import { SignOutForm } from "@/components/shell/sign-out-form";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Button } from "@/components/ui/button";

/** Téma a odhlásenie — na telefóne nemajú inde miesto (bočný panel je skrytý). */
export function LibraryAccount({
  signOutAction,
}: {
  signOutAction: () => Promise<void>;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
      <ThemeToggle />
      <SignOutForm action={signOutAction}>
        <Button type="submit" variant="ghost" className="gap-2">
          <LogOut aria-hidden="true" className="size-[18px]" />
          Odhlásiť sa
        </Button>
      </SignOutForm>
    </div>
  );
}
