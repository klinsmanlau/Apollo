import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Apollo — Test Case Management",
  description: "Internal test case authoring, execution, and reporting.",
};

// Runs before first paint to set the theme class, avoiding a flash of the
// wrong theme. Prefers the persisted cookie (also read server-side below, so a
// fresh tab is correct from the first byte regardless of the OS setting), then
// a legacy localStorage value, then the system preference. `toggle` keeps the
// class authoritative in both directions.
const themeScript = `
(function () {
  try {
    var m = document.cookie.match(/(?:^|; )theme=(dark|light)/);
    var t = m ? m[1] : localStorage.getItem('theme');
    var dark = t ? t === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {}
})();
`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-render the theme class from the cookie so every fresh tab/reload
  // matches the chosen theme immediately — independent of client storage or OS.
  const theme = (await cookies()).get("theme")?.value;
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={theme === "dark" ? "dark" : undefined}
        suppressHydrationWarning
      >
        <head>
          <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        </head>
        <body className="min-h-screen antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}
