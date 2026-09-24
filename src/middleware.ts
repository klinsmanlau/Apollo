import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Public routes: auth screens, signature-verified webhooks, and the public
// read API (`/api/v1/*`), which does its own per-request API-key auth
// (see src/lib/api-auth.ts) instead of a Clerk session.
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks/clerk",
  "/api/webhooks/devicecloud(.*)",
  "/api/v1(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
