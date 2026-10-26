"use client";

import { useState } from "react";
import { ListPlus } from "lucide-react";
import { Field, FormGrid, NativeSelect } from "@/components/app/field";
import { FormActions, useServerForm } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PRIORITY, VIDEO_TYPE_LABELS } from "@/lib/labels";
import { createVideosBulkAction } from "./actions";
import { RATIOS, bulkVideosSchema } from "./schemas";
import { useT } from "#i18n";

/** « Ajouter six Reels » : création groupée avec lien de rushs commun. */
export function BulkVideosDialog({ projectId, clientDeadline }: { projectId: string; clientDeadline: string }) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <ListPlus aria-hidden /> {" "}{tr("Ajouter des vidéos")}</Button>
      </DialogTrigger>
      <DialogContent size="2xl">
        <DialogHeader>
          <DialogTitle>{tr("Ajouter des vidéos au projet")}</DialogTitle>
          <DialogDescription>{tr("Chaque vidéo reçoit sa référence stable et la checklist qualité. Avec un lien de rushs, elles passent directement « À attribuer ».")}</DialogDescription>
        </DialogHeader>
        {open ? <BulkForm projectId={projectId} clientDeadline={clientDeadline} onDone={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function BulkForm({ projectId, clientDeadline, onDone }: { projectId: string; clientDeadline: string; onDone: () => void }) {
  const tr = useT();
  const { form, onSubmit, pending, err } = useServerForm({
    schema: bulkVideosSchema,
    defaultValues: {
      projectId, count: "6", type: "REEL", titlePattern: "{type} {n}", format: "1080x1920", ratio: "9:16", expectedDuration: "0:45",
      internalDeadline: "", clientDeadline, estimatedHours: "2", priority: "NORMAL", rushesUrl: "", brief: "",
    },
    action: createVideosBulkAction,
    onSuccess: onDone,
  });
  const { register } = form;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormGrid>
        <Field label={tr("Nombre de vidéos")} htmlFor="count" required error={err("count")}><Input inputMode="numeric" {...register("count")} /></Field>
        <Field label={tr("Type")} htmlFor="b-type">
          <NativeSelect {...register("type")}>{Object.entries(VIDEO_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}</NativeSelect>
        </Field>
        <Field label={tr("Modèle de titre")} htmlFor="titlePattern" required error={err("titlePattern")} hint={tr("{type} et {n} sont remplacés")}><Input {...register("titlePattern")} /></Field>
        <Field label={tr("Priorité")} htmlFor="b-priority">
          <NativeSelect {...register("priority")}>{Object.entries(PRIORITY).map(([v, s]) => <option key={v} value={v}>{tr(s.label)}</option>)}</NativeSelect>
        </Field>
        <Field label={tr("Ratio")} htmlFor="b-ratio">
          <NativeSelect {...register("ratio")}><option value="">—</option>{RATIOS.map((r) => <option key={r} value={r}>{r}</option>)}</NativeSelect>
        </Field>
        <Field label={tr("Format")} htmlFor="b-format"><Input {...register("format")} /></Field>
        <Field label={tr("Durée finale attendue")} htmlFor="b-exp" error={err("expectedDuration")}><Input {...register("expectedDuration")} /></Field>
        <Field label={tr("Heures estimées / vidéo")} htmlFor="b-hours" error={err("estimatedHours")}><Input inputMode="decimal" {...register("estimatedHours")} /></Field>
        <Field label={tr("Deadline interne")} htmlFor="b-int" error={err("internalDeadline")}><Input type="date" {...register("internalDeadline")} /></Field>
        <Field label={tr("Deadline client")} htmlFor="b-cli" error={err("clientDeadline")}><Input type="date" {...register("clientDeadline")} /></Field>
        <Field label={tr("Lien des rushs (Drive / Dropbox)")} htmlFor="b-rush" error={err("rushesUrl")} className="md:col-span-2"><Input type="url" placeholder={tr("https://")} {...register("rushesUrl")} /></Field>
        <Field label={tr("Brief commun")} htmlFor="b-brief" className="md:col-span-2"><Textarea rows={3} {...register("brief")} /></Field>
      </FormGrid>
      <FormActions pending={pending} submitLabel={tr("Créer les vidéos")} onCancel={onDone} />
    </form>
  );
}
