import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { getCurrentUser } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Ensures the local User row exists for the signed-in Clerk user.
  const user = await getCurrentUser();

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-6">
            <Link href="/projects" className="text-lg font-semibold">
              Apollo
            </Link>
            <nav className="flex items-center gap-4 text-sm text-gray-600">
              <Link href="/projects" className="hover:text-gray-900">
                Projects
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <span className="hidden text-sm text-gray-500 sm:inline">
                {user.name ?? user.email}
                <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
                  {user.role}
                </span>
              </span>
            )}
            <UserButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
