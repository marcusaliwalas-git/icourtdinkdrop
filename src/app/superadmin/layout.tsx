import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdmin();

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <nav className="mx-auto flex max-w-5xl items-center gap-3 p-4 text-sm">
          <Link href="/superadmin" className="flex items-center gap-2">
            <span className="text-sm font-semibold">Platform</span>
            <span className="font-mono text-[0.65rem] tracking-[0.15em] text-muted-foreground uppercase">
              Super admin
            </span>
          </Link>
          <Link href="/" className="ml-auto text-muted-foreground hover:text-foreground">
            Back to site
          </Link>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 p-4">{children}</main>
    </div>
  );
}
