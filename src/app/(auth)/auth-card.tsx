import Image from "next/image";
import type { ReactNode } from "react";
import { useT } from "#i18n";
import { trNode } from "@/lib/i18n/translate";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  const tr = useT();
  return (
    <div className="av-panel px-6 py-8 sm:px-8">
      <div className="mb-6 flex flex-col items-center text-center">
        <Image src="/brand/logo-avencao.png" alt={tr("Avencao")} width={88} height={88} priority />
        <h1 className="mt-3 text-xl font-bold">{tr(title)}</h1>
        {subtitle ? <p className="mt-1 text-sm text-subtle">{trNode(tr, subtitle)}</p> : null}
      </div>
      {children}
    </div>
  );
}
