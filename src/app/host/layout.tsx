import Image from "next/image";
import Link from "next/link";

// The host area is its own focused surface (like /admin), used courtside on a phone or tablet.
// Individual pages own their access checks (requireSessionHost / the landing's own guard).
export default function HostLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <nav className="mx-auto flex max-w-4xl items-center gap-3 p-4 text-sm">
          <Link href="/host" className="flex items-center gap-2" aria-label="Host home">
            <Image src="/icourt-social-logo.png" alt="" width={903} height={438} className="h-6 w-auto" priority />
            <span className="font-mono text-[0.65rem] tracking-[0.15em] text-muted-foreground uppercase">Host</span>
          </Link>
          <Link href="/" className="ml-auto text-muted-foreground hover:text-foreground">
            Back to site
          </Link>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 p-4">{children}</main>
    </div>
  );
}
