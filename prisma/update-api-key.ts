/**
 * Manage an existing API key for the public read API (`/api/v1/*`) — without
 * re-minting (the raw key is unchanged; only its metadata is updated).
 *
 * Identify the key by --id or --name, then apply one of:
 *   --add-scopes <csv>   add scopes to the existing set
 *   --set-scopes <csv>   replace the scope set entirely
 *   --revoke             disable the key (sets revokedAt)
 *   --unrevoke           re-enable a revoked key
 *
 * Usage (tsx does not auto-load .env):
 *   npx tsx --env-file=.env prisma/update-api-key.ts \
 *     --name "qa-dashboard (prod)" --add-scopes cycles:read
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function has(flag: string): boolean {
  return process.argv.includes(flag);
}

const VALID = new Set(["cases:read", "executions:read", "cycles:read"]);

function parseScopes(csv: string | undefined): string[] {
  if (!csv) return [];
  const scopes = csv.split(",").map((s) => s.trim()).filter(Boolean);
  const bad = scopes.filter((s) => !VALID.has(s));
  if (bad.length) {
    console.error(`Unknown scope(s): ${bad.join(", ")}. Valid: ${[...VALID].join(", ")}`);
    process.exit(1);
  }
  return scopes;
}

async function main() {
  const id = arg("--id");
  const name = arg("--name");
  if (!id && !name) {
    console.error("Identify the key with --id <id> or --name <label>.");
    process.exit(1);
  }

  const key = id
    ? await prisma.apiKey.findUnique({ where: { id } })
    : await prisma.apiKey.findFirst({ where: { name } });
  if (!key) {
    console.error(`No API key found for ${id ? `id "${id}"` : `name "${name}"`}.`);
    process.exit(1);
  }

  const data: { scopes?: string[]; revokedAt?: Date | null } = {};

  const addScopes = parseScopes(arg("--add-scopes"));
  const setScopes = has("--set-scopes") ? parseScopes(arg("--set-scopes")) : null;
  if (setScopes) {
    data.scopes = [...new Set(setScopes)];
  } else if (addScopes.length) {
    data.scopes = [...new Set([...key.scopes, ...addScopes])];
  }
  if (has("--revoke")) data.revokedAt = new Date();
  if (has("--unrevoke")) data.revokedAt = null;

  if (Object.keys(data).length === 0) {
    console.error("Nothing to do. Pass --add-scopes, --set-scopes, --revoke, or --unrevoke.");
    process.exit(1);
  }

  const updated = await prisma.apiKey.update({
    where: { id: key.id },
    data,
    select: { id: true, name: true, scopes: true, projectId: true, revokedAt: true },
  });

  console.log("\nUpdated API key:\n");
  console.log(`  id:       ${updated.id}`);
  console.log(`  name:     ${updated.name}`);
  console.log(`  scopes:   ${updated.scopes.join(", ") || "(none)"}`);
  console.log(`  project:  ${updated.projectId ?? "(all projects)"}`);
  console.log(`  revoked:  ${updated.revokedAt ? updated.revokedAt.toISOString() : "no"}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
