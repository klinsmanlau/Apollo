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
          className="btn btn-primary px-5 py-2.5"
        >
          Sign in
        </Link>
        <Link
          href="/sign-up"
          className="btn btn-secondary px-5 py-2.5"
        >
          Create account
        </Link>
      </div>
    </main>
  );
}
