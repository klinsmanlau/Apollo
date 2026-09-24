/**
 * Mint an API key for the public read API (`/api/v1/*`).
 *
 * The raw key is printed ONCE here and never stored — only its SHA-256 hash
 * goes to the DB. Copy it into the consuming app's secret store immediately.
 *
 * Usage (tsx does not auto-load .env, so pass --env-file):
 *
 *   npx tsx --env-file=.env prisma/create-api-key.ts \
 *     --name "qa-dashboard (prod)" \
 *     --scopes cases:read,executions:read \
 *     [--project <projectId>]
 *
 * Omit --project for an all-projects key.
 */
import { randomBytes, createHash } from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const name = arg("--name");
  const scopesRaw = arg("--scopes");
  const projectId = arg("--project") ?? null;

  if (!name || !scopesRaw) {
    console.error(
      'Required: --name "<label>" --scopes cases:read,executions:read [--project <id>]'
    );
    process.exit(1);
  }

  const scopes = scopesRaw.split(",").map((s) => s.trim()).filter(Boolean);
  const VALID = new Set(["cases:read", "executions:read", "cycles:read"]);
  const bad = scopes.filter((s) => !VALID.has(s));
  if (bad.length) {
    console.error(`Unknown scope(s): ${bad.join(", ")}. Valid: ${[...VALID].join(", ")}`);
    process.exit(1);
  }

  if (projectId) {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) {
      console.error(`No project with id "${projectId}".`);
      process.exit(1);
    }
  }

  // A URL-safe, high-entropy key with a recognizable prefix.
  const raw = `apollo_${randomBytes(32).toString("base64url")}`;
  const hashedKey = createHash("sha256").update(raw).digest("hex");

  const key = await prisma.apiKey.create({
    data: { name, hashedKey, scopes, projectId },
    select: { id: true, name: true, scopes: true, projectId: true },
  });

  console.log("\nAPI key created — copy the raw key now; it will not be shown again:\n");
  console.log(`  ${raw}\n`);
  console.log(`  id:       ${key.id}`);
  console.log(`  name:     ${key.name}`);
  console.log(`  scopes:   ${key.scopes.join(", ")}`);
  console.log(`  project:  ${key.projectId ?? "(all projects)"}\n`);
  console.log("Use it as:  Authorization: Bearer <raw key>\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
