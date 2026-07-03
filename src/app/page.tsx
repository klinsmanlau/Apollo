import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/projects");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 text-center">
      <h1 className="animate-rise text-4xl font-bold tracking-tight text-fg">
        Apollo
      </h1>
      <p className="animate-rise mt-3 text-lg text-muted" style={{ animationDelay: "60ms" }}>
        Internal test case management — author, run, and report.
      </p>
      <div className="animate-rise mt-8 flex gap-3" style={{ animationDelay: "120ms" }}>
        <Link
          href="/sign-in"
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg transition-all hover:opacity-90 active:scale-[0.98]"
        >
          Sign in
        </Link>
        <Link
          href="/sign-up"
          className="rounded-md border border-line bg-surface px-5 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-surface-muted"
        >
          Create account
        </Link>
      </div>
    </main>
  );
}
