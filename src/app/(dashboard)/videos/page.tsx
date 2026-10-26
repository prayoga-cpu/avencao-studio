import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { sp } from "@/components/app/pagination";
import { TabLinks } from "@/components/app/tab-links";
import { Button } from "@/components/ui/button";
import { VideosKanban } from "@/features/production/videos-kanban";
import { VideosTable } from "@/features/production/videos-table";
import { PRIORITY, VIDEO_STATUS, VIDEO_TYPE_LABELS, enumOptions } from "@/lib/labels";
import { requirePagePermission } from "@/server/auth/session";
import { can } from "@/server/policies";
import { clientOptions, editorOptions, projectOptions } from "@/server/queries/options";
import { listVideos, type VideoView } from "@/server/queries/production";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Vidéos") };
}

const VIEWS: { value: VideoView; label: string }[] = [
  { value: "tableau", label: "Tableau" },
  { value: "kanban", label: "Kanban" },
  { value: "a-attribuer", label: "À attribuer" },
  { value: "a-valider", label: "À valider" },
  { value: "en-retard", label: "En retard" },
  { value: "bloquees", label: "Bloquées" },
  { value: "mes-videos", label: "Mes projets" },
];

export default async function VideosPage(props: PageProps<"/videos">) {
  const tr = await getT();
  const actor = await requirePagePermission("videos.readAll");
  const params = await props.searchParams;
  const view = (VIEWS.find((v) => v.value === params.vue)?.value ?? "tableau") as VideoView;
  const [{ rows }, clients, projects, editors] = await Promise.all([
    listVideos(actor, {
      view,
      q: sp(params.q),
      client: sp(params.client),
      project: sp(params.projet),
      editor: sp(params.monteur),
      type: sp(params.type),
      status: sp(params.statut),
      priority: sp(params.priorite),
      from: sp(params.du),
      to: sp(params.au),
    }),
    clientOptions(),
    projectOptions(),
    editorOptions(),
  ]);
  const keep: Record<string, string> = {};
  for (const k of ["q", "client", "projet", "monteur", "type", "statut", "priorite"]) {
    const v = sp(params[k]);
    if (v) keep[k] = v;
  }
  return (
    <>
      <PageHeader
        title={tr("Vidéos")}
        subtitle={tr("Chaque vidéo est une unité livrable ; ses versions ne sont pas de nouvelles vidéos facturées.")}
        actions={can(actor, "videos.write") ? <Button asChild><Link href="/videos/nouvelle"><Plus aria-hidden /> {" "}{tr("Nouvelle vidéo")}</Link></Button> : null}
      >
        <FilterBar
          searchPlaceholder={tr("Titre ou référence…")}
          filters={[
            { name: "client", label: tr("Client"), options: clients },
            { name: "projet", label: tr("Projet"), options: projects.map((p) => ({ value: p.value, label: tr(p.label) })) },
            { name: "monteur", label: tr("Monteur"), options: editors },
            { name: "type", label: tr("Type"), options: enumOptions(VIDEO_TYPE_LABELS) },
            { name: "statut", label: tr("Étape"), options: enumOptions(VIDEO_STATUS) },
            { name: "priorite", label: tr("Priorité"), options: enumOptions(PRIORITY) },
          ]}
        />
      </PageHeader>
      <TabLinks tabs={VIEWS} active={view} basePath="/videos" param="vue" extraParams={keep} />
      {rows.length === 0 ? (
        <EmptyState title={tr("Aucune vidéo dans cette vue")} description={tr("Modifiez les filtres ou ajoutez des vidéos depuis un projet.")} />
      ) : view === "kanban" ? (
        <VideosKanban rows={rows} showCancelled={sp(params.statut) === "CANCELLED"} />
      ) : (
        <VideosTable rows={rows} showFinance={can(actor, "margins.project")} canBulk={can(actor, "videos.write")} />
      )}
      {rows.length >= 500 ? <p className="mt-2 text-xs text-warning">{tr("Affichage limité à 500 vidéos : affinez les filtres.")}</p> : null}
    </>
  );
}
