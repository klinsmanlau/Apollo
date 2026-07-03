import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { getCurrentUser } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Ensures the local User row exists for the signed-in Clerk user.
  const user = await getCurrentUser();

  return (
    <div className="min-h-screen">
      <header className="themed sticky top-0 z-40 border-b border-line bg-surface/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-6">
            <Link href="/projects" className="text-lg font-semibold text-fg">
              Apollo
            </Link>
            <nav className="flex items-center gap-4 text-sm text-muted">
              <Link href="/projects" className="transition-colors hover:text-fg">
                Projects
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <span className="hidden text-sm text-muted sm:inline">
                {user.name ?? user.email}
                <span className="ml-2 rounded bg-surface-muted px-1.5 py-0.5 text-xs font-medium text-muted">
                  {user.role}
                </span>
              </span>
            )}
            <ThemeToggle />
            <UserButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
