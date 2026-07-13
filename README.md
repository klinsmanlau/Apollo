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

Roles are **per project**, on `ProjectMember.role`: `admin > lead > tester > viewer`
(enforced server-side by `requireProjectRole` in `src/lib/auth.ts`).

| Role | Can do |
|---|---|
| `viewer` | Read everything, export |
| `tester` | + record execution results (Test Player) |
| `lead` | + author cases/suites/cycles, clone, archive, import |
| `admin` | + delete suites/cases/cycles/folders, manage members |

Manage members and roles in the project's **Members** tab (project admins only;
people must sign in once before they can be added). The project creator becomes
its admin automatically. `User.role == admin` is a global-admin bypass that
grants admin in every project.

## Data model note (RLS)

Prisma connects with full privileges, so Postgres Row-Level Security is **not**
the enforcement layer here — authorization is done in Server Actions / queries
(every project query is scoped to `members: { some: { userId } }`). If you later
want defense-in-depth RLS, that's an additive step, not a rewrite.

## Zephyr import

Project detail page → **Import .xlsx** (`/projects/<id>/import`). Upload a
**Zephyr Scale** test-case export (`.xlsx`) and it will:

- Turn the `Folder` path (`/E2E/Rewards/Bonus Interest`) into **nested suites**
- Map `Priority` (`High→high`, `Normal→medium`, …), `Status`, `Labels→tags`,
  `Coverage (Issues)→coverage`
- Reconstruct **step-by-step** scripts (Step / Test Data / Expected) from
  Zephyr's packed numbered cells; import Plain Text / BDD scripts as-is
- Store any **unrecognized columns** (Language, POD, Remarks, …) losslessly in
  each case's `customFields`
- Be **idempotent**: re-importing updates cases matched by their Zephyr `Key`
  (`sourceKey`) instead of duplicating

Parser: `src/lib/import/zephyr.ts` · action: `src/lib/actions/import.ts`.
Uses `exceljs` to read the workbook server-side.

## DeviceCloud CI integration (webhook)

When a DeviceCloud run finishes, it can POST an `upload.completed` webhook to
Apollo, which turns the run into a **test cycle** automatically.

**Configure it:**
1. Set `DEVICECLOUD_WEBHOOK_SECRET` in `.env` (any strong string).
2. In the DeviceCloud console → Webhooks, add an endpoint:
   `https://<your-app>/api/webhooks/devicecloud/<projectId>` and set its secret
   to the same value (DeviceCloud sends it as `X-DeviceCloud-Secret`).

**What Apollo does on receipt** (`src/app/api/webhooks/devicecloud/[projectId]`):
- Verifies the secret, then creates a cycle (`TS-R#`, status Done) under an
  **Automated** folder, named/environment from the device + date, linking the
  `console_url`.
- Creates one execution per flow in `results[]`: **Pass/Fail** from its status,
  with the **`failReason` saved as the execution note**. Flows are matched to a
  case by the key in the flow name (e.g. `TS-T7060 …`); unmatched flows are
  auto-created under an **Automated** suite. Idempotent on `upload_id`.

## Roadmap (from the spec)

- **Phase 1 (this scaffold):** auth, projects, suites, case authoring, Zephyr .xlsx import ✅
  - Also done: per-project roles + Members tab, cycle results export
    (.xlsx/.csv from the cycle detail header), execution **attachments**
    (screenshots/logs in the Test Player — drop, paste, or browse; max 5 MB
    per file, stored in Postgres, served via
    `/api/projects/<id>/attachments/<id>`), real **assignment**
    (`TestExecution.assignedToId` FK; the Test Player assignee picker is
    keyed by user), a **My Work** tab (open executions assigned to you,
    grouped by cycle), per-case **execution history** (Execution tab on the
    case detail) and a **Last result** column in the case library
- **Phase 2:** Jira / GitHub issue linking, CI result webhook, Slack notifications
- **Phase 3:** trend charts, saved views, attachments, flaky-test flag
```
