import Image from "next/image";
import type { ReactNode } from "react";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="av-panel px-6 py-8 sm:px-8">
      <div className="mb-6 flex flex-col items-center text-center">
        <Image src="/brand/logo-avencao.png" alt="Avencao" width={88} height={88} priority />
        <h1 className="mt-3 text-xl font-bold">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-subtle">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}
