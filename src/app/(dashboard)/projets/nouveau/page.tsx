import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { ProjectForm } from "@/features/production/project-form";
import { requirePagePermission } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { clientOptions, staffOptions } from "@/server/queries/options";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Nouveau projet" };

export default async function NewProjectPage(props: PageProps<"/projets/nouveau">) {
  const actor = await requirePagePermission("projects.write");
  const params = await props.searchParams;
  const [clients, owners, templates, settings] = await Promise.all([
    clientOptions(),
    staffOptions(),
    prisma.projectTemplate.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    getSettings(),
  ]);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Nouveau projet" subtitle="Un modèle crée directement les vidéos (ex. pack de 12 Reels) avec leurs paramètres par défaut." />
      <ProjectForm
        clients={clients}
        owners={owners}
        templates={templates.map((t) => ({ value: t.id, label: `${t.name} (${t.defaultVideoCount} vidéo·s)`, count: t.defaultVideoCount }))}
        defaults={{
          clientId: typeof params.client === "string" ? params.client : "",
          title: "", description: "", ownerId: actor.id, startOn: "", clientDeadline: "", status: "ACTIVE", priority: "NORMAL",
          driveUrl: "", otherLinks: "", includedRevisionRounds: String(settings.defaultIncludedRevisions),
          revisionRoundDefinition: settings.revisionRoundDefinition, productionErrorPolicy: settings.productionErrorPolicy, templateId: "", videoCount: "",
        }}
      />
    </div>
  );
}
