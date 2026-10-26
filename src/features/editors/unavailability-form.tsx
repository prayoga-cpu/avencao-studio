"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addUnavailabilityAction } from "./actions";
import { useT } from "#i18n";

export function UnavailabilityForm({ editorId }: { editorId: string }) {
  const tr = useT();
  const [v, setV] = useState({ startsOn: "", endsOn: "", reason: "" });
  const { pending, run } = useAction();
  return (
    <form
      className="grid grid-cols-2 items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addUnavailabilityAction({ editorId, ...v }), { onSuccess: () => setV({ startsOn: "", endsOn: "", reason: "" }) });
      }}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor="ua-start" className="text-xs text-subtle">{tr("Du")}</Label>
        <Input id="ua-start" type="date" required value={v.startsOn} onChange={(e) => setV({ ...v, startsOn: e.target.value })} />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor="ua-end" className="text-xs text-subtle">{tr("Au")}</Label>
        <Input id="ua-end" type="date" required value={v.endsOn} onChange={(e) => setV({ ...v, endsOn: e.target.value })} />
      </div>
      <div className="col-span-2 flex flex-col gap-1">
        <Label htmlFor="ua-reason" className="text-xs text-subtle">{tr("Motif")}</Label>
        <Input id="ua-reason" value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} placeholder={tr("Congés, autre client…")} />
      </div>
      <Button type="submit" variant="outline" disabled={pending} className="col-span-2 justify-self-start">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {tr("Ajouter")}</Button>
    </form>
  );
}
