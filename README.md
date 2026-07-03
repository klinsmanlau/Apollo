# Apollo — Internal Test Case Management

A lightweight Zephyr replacement: author test cases, organize them into nested
suites, and (in later phases) execute runs and report. This is the **Phase 1
scaffold** — authentication, projects, suites, and full test-case authoring
(CRUD). Runs, executions, dashboard, and CSV import/export are modeled in the
schema and come next.

## Stack

| Layer | Choice |
|---|---|
| Frontend + API | Next.js 15 (App Router, Server Actions) |
| Database | PostgreSQL (Supabase) |
| ORM | Prisma |
| Auth | Clerk |
| Styling | Tailwind CSS v4 |

Identity lives in Clerk; a webhook (`/api/webhooks/clerk`) syncs users into the
local `User` table so `created_by` / `executed_by` are plain foreign keys.

## Prerequisites

- Node.js 18.18+ (tested on Node 22)
- A **Supabase** project (for the Postgres database)
- A **Clerk** application (for auth)

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
#    Fill in DATABASE_URL + DIRECT_URL (Supabase → Database → Connection string)
#    and the Clerk keys (Clerk → API Keys).

# 3. Create the database schema
npm run db:migrate      # or: npm run db:push  (no migration history)

# 4. (Optional) Seed demo data
npm run db:seed

# 5. Run
npm run dev             # http://localhost:3000
```

### Clerk webhook (user sync)

For production, add a Clerk webhook pointing at
`https://<your-app>/api/webhooks/clerk` subscribed to `user.created`,
`user.updated`, and `user.deleted`, and set `CLERK_WEBHOOK_SIGNING_SECRET`.

Locally the webhook is optional — `getCurrentUser()` provisions the local user
row on first sign-in as a fallback, so you can develop without a public tunnel.

## Project structure

```
prisma/
  schema.prisma        Full data model (Users, Projects, Suites, Cases, Runs,
                       Executions, AutomationResults)
  seed.ts              Demo project + suites + cases
src/
  middleware.ts        Clerk route protection
  lib/
    prisma.ts          Prisma client singleton
    auth.ts            getCurrentUser / requireUser / hasRole
    validation.ts      Zod schemas for forms
    suites.ts          Suite tree builder + <select> flattener
    actions/           Server actions (projects, suites, cases)
  components/          Shared UI (badges, submit button)
  app/
    page.tsx           Landing → redirects to /projects when signed in
    sign-in, sign-up   Clerk auth screens
    api/webhooks/clerk Clerk → DB user sync
    (app)/
      layout.tsx       Authed shell + nav
      projects/        List + create, detail (suite tree), case CRUD
```

## Roles

`admin > lead > tester > viewer` (see `hasRole` in `src/lib/auth.ts`). New users
default to `tester`. Role enforcement beyond membership is a Phase 1.x follow-up
— set roles directly in the DB (`npm run db:studio`) for now.

## Data model note (RLS)

Prisma connects with full privileges, so Postgres Row-Level Security is **not**
the enforcement layer here — authorization is done in Server Actions / queries
(every project query is scoped to `members: { some: { userId } }`). If you later
want defense-in-depth RLS, that's an additive step, not a rewrite.

## Roadmap (from the spec)

- **Phase 1 (this scaffold):** auth, projects, suites, case authoring ✅
  - Next up in Phase 1: run creation, execution screen, dashboard, CSV import/export
- **Phase 2:** Jira / GitHub issue linking, CI result webhook, Slack notifications
- **Phase 3:** trend charts, saved views, attachments, flaky-test flag
```
