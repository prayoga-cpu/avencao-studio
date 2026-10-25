import { Suspense } from "react";
import { Sidebar, SidebarSkeleton } from "@/components/shell/sidebar";

/**
 * Coquille de l'application. La barre latérale lit la session derrière <Suspense> ;
 * chaque page revérifie elle-même la session et ses droits (requireActor/requirePagePermission).
 */
export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh lg:flex">
      <Suspense fallback={<SidebarSkeleton />}>
        <Sidebar />
      </Suspense>
      <main id="contenu" className="min-w-0 flex-1 px-4 pb-16 pt-4 sm:px-6 lg:px-8 lg:pt-6">
        {children}
      </main>
    </div>
  );
}
