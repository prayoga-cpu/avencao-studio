import Image from "next/image";

/** Pages publiques : fond Avencao (vagues fuchsia), carte centrée. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center px-4 py-10">
      <Image src="/brand/fond.jpg" alt="" fill priority className="object-cover opacity-70" sizes="100vw" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(8,8,8,0.55),rgba(8,8,8,0.92))]" aria-hidden />
      <main className="relative z-10 w-full max-w-md">{children}</main>
    </div>
  );
}
