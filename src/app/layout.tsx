import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Montserrat } from "next/font/google";
import { LocaleRoot } from "@/components/shell/locale-root";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Avencao CRM", template: "%s · Avencao" },
  description: "CRM opérationnel de l'agence de montage vidéo Avencao.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#080808",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${montserrat.variable} dark h-full`}>
      <body className="min-h-full">
        {/* Langue (cookie) lue par requête : tout le contenu est rendu sous cette frontière. */}
        <Suspense fallback={null}>
          <LocaleRoot>
            <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
          </LocaleRoot>
        </Suspense>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
