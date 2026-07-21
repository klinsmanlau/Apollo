import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { getCurrentUser } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Ensures the local User row exists for the signed-in Clerk user.
  const user = await getCurrentUser();

  return (
    <div className="flex h-dvh flex-col">
      <header className="themed z-40 shrink-0 border-b border-line bg-surface/85 backdrop-blur-xl">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-7">
            <Link
              href="/projects"
              className="rounded-md transition-opacity hover:opacity-80"
            >
              <Logo />
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link
                href="/projects"
                className="rounded-md px-2.5 py-1.5 font-medium text-muted transition-colors hover:bg-surface-muted hover:text-fg"
              >
                Projects
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <span className="hidden items-center gap-2 text-sm text-muted sm:flex">
                {user.name ?? user.email}
                <span className="rounded-md border border-line bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium capitalize text-subtle">
                  {user.role}
                </span>
              </span>
            )}
            <ThemeToggle />
            <UserButton />
          </div>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="h-full px-6 py-6">{children}</div>
      </main>
    </div>
  );
}
