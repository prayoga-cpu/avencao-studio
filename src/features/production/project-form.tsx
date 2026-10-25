"use client";

import { useRouter } from "next/navigation";
import { Field, FormGrid, FormSection, NativeSelect } from "@/components/app/field";
import { FormActions, useServerForm } from "@/components/app/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PRIORITY, PROJECT_STATUS } from "@/lib/labels";
import { createProjectAction, updateProjectAction } from "./actions";
import { projectSchema, type ProjectInput } from "./schemas";

export function ProjectForm({
  projectId,
  defaults,
  clients,
  owners,
  templates,
}: {
  projectId?: string;
  defaults: ProjectInput;
  clients: { value: string; label: string }[];
  owners: { value: string; label: string }[];
  templates: { value: string; label: string; count: number }[];
}) {
  const router = useRouter();
  const { form, onSubmit, pending, err } = useServerForm({
    schema: projectSchema,
    defaultValues: defaults,
    action: (v) => (projectId ? updateProjectAction(projectId, v) : createProjectAction(v)),
    refresh: false,
    onSuccess: (data) => {
      router.push(`/projets/${data.id}`);
      router.refresh();
    },
  });
  const { register, watch, setValue } = form;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <FormSection title="Projet">
        <FormGrid>
          <Field label="Client" htmlFor="clientId" required error={err("clientId")}>
            <NativeSelect {...register("clientId")}>
              <option value="">— Choisir —</option>
              {clients.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Titre" htmlFor="title" required error={err("title")} hint="Ex. « Pack Reels novembre »">
            <Input {...register("title")} />
          </Field>
          <Field label="Responsable" htmlFor="ownerId">
            <NativeSelect {...register("ownerId")}>
              <option value="">—</option>
              {owners.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Statut" htmlFor="status">
            <NativeSelect {...register("status")}>
              {Object.entries(PROJECT_STATUS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Priorité" htmlFor="priority">
            <NativeSelect {...register("priority")}>
              {Object.entries(PRIORITY).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Date de début" htmlFor="startOn" error={err("startOn")}><Input type="date" {...register("startOn")} /></Field>
          <Field label="Deadline client" htmlFor="clientDeadline" error={err("clientDeadline")}><Input type="date" {...register("clientDeadline")} /></Field>
          <Field label="Dossier Drive / rushs" htmlFor="driveUrl" error={err("driveUrl")}><Input type="url" placeholder="https://" {...register("driveUrl")} /></Field>
          <Field label="Description" htmlFor="description" className="md:col-span-2"><Textarea rows={3} {...register("description")} /></Field>
          <Field label="Autres liens" htmlFor="otherLinks" className="md:col-span-2" hint="Un lien par ligne"><Textarea rows={2} {...register("otherLinks")} /></Field>
        </FormGrid>
      </FormSection>
      {!projectId ? (
        <FormSection title="Modèle de projet" description="Crée directement les vidéos avec formats, durées et retouches par défaut.">
          <FormGrid>
            <Field label="Modèle" htmlFor="templateId">
              <NativeSelect
                {...register("templateId", {
                  onChange: (e) => {
                    const t = templates.find((x) => x.value === e.target.value);
                    setValue("videoCount", t ? String(t.count) : "");
                  },
                })}
              >
                <option value="">Aucun (vidéos ajoutées ensuite)</option>
                {templates.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </NativeSelect>
            </Field>
            {watch("templateId") ? (
              <Field label="Nombre de vidéos" htmlFor="videoCount" error={err("videoCount")}><Input inputMode="numeric" {...register("videoCount")} /></Field>
            ) : null}
          </FormGrid>
        </FormSection>
      ) : null}
      <FormSection title="Allers-retours inclus" description="Défini par commande : nombre, définition d'un aller-retour et règle en cas d'erreur de production.">
        <FormGrid>
          <Field label="Nombre d'allers-retours inclus" htmlFor="includedRevisionRounds" error={err("includedRevisionRounds")}><Input inputMode="numeric" {...register("includedRevisionRounds")} /></Field>
          <Field label="Définition d'un aller-retour" htmlFor="revisionRoundDefinition"><Input {...register("revisionRoundDefinition")} /></Field>
          <Field label="Règle pour les erreurs de production" htmlFor="productionErrorPolicy" className="md:col-span-2"><Input {...register("productionErrorPolicy")} /></Field>
        </FormGrid>
      </FormSection>
      <FormActions pending={pending} submitLabel={projectId ? "Enregistrer" : "Créer le projet"} cancelHref={projectId ? `/projets/${projectId}` : "/projets"} />
    </form>
  );
}
