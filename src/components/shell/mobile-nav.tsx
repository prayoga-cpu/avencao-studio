"use client";

import Image from "next/image";
import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NavLinks } from "./nav-links";
import type { NavIcon } from "./nav-config";
import { useT } from "#i18n";

/** Navigation en tiroir sur mobile. */
export function MobileNav({
  items,
  footer,
  agencyName,
}: {
  items: { href: string; label: string; icon: NavIcon }[];
  footer: React.ReactNode;
  agencyName: string;
}) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={tr("Ouvrir le menu")}>
          <Menu aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[290px] border-r border-brand-border bg-sidebar p-0">
        <SheetHeader className="border-b border-border px-4 py-4">
          <SheetTitle className="flex items-center gap-3">
            <Image src="/brand/logo-avencao.png" alt="" width={36} height={36} className="opacity-90" />
            <span className="text-base font-bold">{agencyName}</span>
          </SheetTitle>
        </SheetHeader>
        <div className="flex h-full flex-col gap-4 overflow-y-auto p-3">
          <NavLinks items={items} onNavigate={() => setOpen(false)} />
          <div className="mt-auto pb-16">{footer}</div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
