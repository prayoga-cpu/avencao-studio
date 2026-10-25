"use client";

import { Loader2 } from "lucide-react";
import { Field, NativeSelect } from "@/components/app/field";
import { useServerForm } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { addActivityAction } from "@/features/clients/actions";
import { activitySchema } from "@/features/clients/schemas";
import { ACTIVITY_TYPE_LABELS } from "@/lib/labels";

export function ActivityForm({ opportunityId, clientId, today }: { opportunityId?: string; clientId?: string; today: string }) {
  const { form, onSubmit, pending, err } = useServerForm({
    schema: activitySchema,
    defaultValues: { opportunityId: opportunityId ?? "", clientId: clientId ?? "", type: "CALL", subject: "", body: "", occurredOn: today },
    action: addActivityAction,
    onSuccess: () => form.reset({ ...form.getValues(), subject: "", body: "" }),
  });
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type" htmlFor="a-type">
          <NativeSelect {...form.register("type")}>
            {Object.entries(ACTIVITY_TYPE_LABELS).filter(([v]) => v !== "STAGE_CHANGE").map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Date" htmlFor="a-date" error={err("occurredOn")}><Input type="date" {...form.register("occurredOn")} /></Field>
      </div>
      <Field label="Objet" htmlFor="a-subject"><Input {...form.register("subject")} /></Field>
      <Field label="Compte rendu" htmlFor="a-body"><Textarea rows={3} {...form.register("body")} /></Field>
      <Button type="submit" size="sm" disabled={pending} className="self-end">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Enregistrer l&apos;activité
      </Button>
    </form>
  );
}
