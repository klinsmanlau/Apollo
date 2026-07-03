import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/projects");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight">Apollo</h1>
      <p className="mt-3 text-lg text-gray-600">
        Internal test case management — author, run, and report.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/sign-in"
          className="rounded-md bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-700"
        >
          Sign in
        </Link>
        <Link
          href="/sign-up"
          className="rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-50"
        >
          Create account
        </Link>
      </div>
    </main>
  );
}
