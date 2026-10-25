"use client";

import { useRouter } from "next/navigation";
import { Field, FormGrid, FormSection, NativeSelect } from "@/components/app/field";
import { FormActions, useServerForm } from "@/components/app/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PRIORITY, VIDEO_TYPE_LABELS } from "@/lib/labels";
import { createVideoAction, updateVideoAction } from "./actions";
import { RATIOS, videoSchema, type VideoInput } from "./schemas";

export function VideoForm({ videoId, defaults, projects, hasDeadline }: { videoId?: string; defaults: VideoInput; projects: { value: string; label: string }[]; hasDeadline?: boolean }) {
  const router = useRouter();
  const { form, onSubmit, pending, err } = useServerForm({
    schema: videoSchema,
    defaultValues: defaults,
    action: (v) => (videoId ? updateVideoAction(videoId, v) : createVideoAction(v)),
    refresh: false,
    onSuccess: (data) => {
      router.push(`/videos/${data.id}`);
      router.refresh();
    },
  });
  const { register } = form;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <FormSection title="Livrable">
        <FormGrid>
          <Field label="Projet" htmlFor="projectId" required error={err("projectId")}>
            <NativeSelect {...register("projectId")}>
              <option value="">— Choisir —</option>
              {projects.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Titre" htmlFor="title" required error={err("title")} hint="La référence stable (AV-AAAA-NNNN) ne change jamais.">
            <Input {...register("title")} />
          </Field>
          <Field label="Type" htmlFor="type">
            <NativeSelect {...register("type")}>
              {Object.entries(VIDEO_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Priorité" htmlFor="priority">
            <NativeSelect {...register("priority")}>
              {Object.entries(PRIORITY).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Ratio" htmlFor="ratio">
            <NativeSelect {...register("ratio")}>
              <option value="">—</option>
              {RATIOS.map((r) => <option key={r} value={r}>{r}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Format / résolution" htmlFor="format"><Input {...register("format")} placeholder="1080x1920" /></Field>
          <Field label="Langue" htmlFor="language"><Input {...register("language")} /></Field>
          <Field label="Heures de travail estimées" htmlFor="estimatedHours" error={err("estimatedHours")} hint="Sert à la planification (distinct des durées médias).">
            <Input inputMode="decimal" {...register("estimatedHours")} />
          </Field>
        </FormGrid>
      </FormSection>
      <FormSection title="Durées médias" description="Format « mm:ss » ou secondes.">
        <FormGrid className="md:grid-cols-3">
          <Field label="Durée des rushs" htmlFor="rushDuration" error={err("rushDuration")}><Input {...register("rushDuration")} placeholder="45:00" /></Field>
          <Field label="Durée finale attendue" htmlFor="expectedDuration" error={err("expectedDuration")}><Input {...register("expectedDuration")} placeholder="0:45" /></Field>
          <Field label="Durée finale réelle" htmlFor="finalDuration" error={err("finalDuration")} hint="Recalcule les coûts « à la minute » non validés."><Input {...register("finalDuration")} /></Field>
        </FormGrid>
      </FormSection>
      <FormSection title="Échéances">
        <FormGrid className="md:grid-cols-3">
          <Field label="Début prévu" htmlFor="plannedStartOn" error={err("plannedStartOn")}><Input type="date" {...register("plannedStartOn")} /></Field>
          <Field label="Deadline interne" htmlFor="internalDeadline" error={err("internalDeadline")}><Input type="date" {...register("internalDeadline")} /></Field>
          <Field label="Deadline client" htmlFor="clientDeadline" error={err("clientDeadline")}><Input type="date" {...register("clientDeadline")} /></Field>
          {hasDeadline ? (
            <Field label="Motif si une échéance est déplacée" htmlFor="deadlineReason" className="md:col-span-3" hint="Ancienne et nouvelle date sont consignées dans l'historique.">
              <Input {...register("deadlineReason")} />
            </Field>
          ) : null}
          <Field label="Allers-retours inclus" htmlFor="includedRevisionRounds" error={err("includedRevisionRounds")}><Input inputMode="numeric" {...register("includedRevisionRounds")} /></Field>
        </FormGrid>
      </FormSection>
      <FormSection title="Brief">
        <div className="grid gap-4">
          <Field label="Brief" htmlFor="brief"><Textarea rows={6} {...register("brief")} /></Field>
          <FormGrid>
            <Field label="Objectifs" htmlFor="objectives"><Textarea rows={3} {...register("objectives")} /></Field>
            <Field label="Audience" htmlFor="audience"><Textarea rows={3} {...register("audience")} /></Field>
            <Field label="Références" htmlFor="references"><Textarea rows={3} {...register("references")} /></Field>
            <Field label="Style de sous-titrage" htmlFor="subtitleStyle"><Textarea rows={3} {...register("subtitleStyle")} /></Field>
            <Field label="Contraintes de marque" htmlFor="brandConstraints"><Textarea rows={3} {...register("brandConstraints")} /></Field>
            <Field label="Instructions d'export" htmlFor="exportInstructions"><Textarea rows={3} {...register("exportInstructions")} /></Field>
          </FormGrid>
        </div>
      </FormSection>
      <FormActions pending={pending} submitLabel={videoId ? "Enregistrer" : "Créer la vidéo"} cancelHref={videoId ? `/videos/${videoId}` : "/videos"} />
    </form>
  );
}

