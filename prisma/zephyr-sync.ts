import { prisma } from "../src/lib/prisma";
import { syncFromZephyr } from "../src/lib/import/zephyr-sync";

/**
 * On-demand Zephyr Scale Cloud → Apollo sync (temporary migration tool).
 *
 *   ZEPHYR_API_TOKEN=... npx tsx prisma/zephyr-sync.ts <apolloProjectId> <zephyrProjectKey>
 *
 * e.g.  npx tsx prisma/zephyr-sync.ts rytbank-qa-team RB
 *
 * Pulls every test case for the Jira project <zephyrProjectKey> and upserts them
 * into the Apollo project <apolloProjectId>, matched by the Zephyr key. Existing
 * cases are updated (Zephyr is source of truth); nested folders become suites.
 */
async function main() {
  const [projectId, projectKey] = process.argv.slice(2);
  const token = process.env.ZEPHYR_API_TOKEN;

  if (!projectId || !projectKey) {
    console.error(
      "Usage: npx tsx prisma/zephyr-sync.ts <apolloProjectId> <zephyrProjectKey>"
    );
    process.exit(1);
  }
  if (!token) {
    console.error("Set ZEPHYR_API_TOKEN in your environment (or .env).");
    process.exit(1);
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, members: { select: { userId: true }, take: 1 } },
  });
  if (!project) {
    console.error(`Apollo project "${projectId}" not found.`);
    process.exit(1);
  }
  const userId = project.members[0]?.userId;
  if (!userId) {
    console.error(`Project "${projectId}" has no members; can't attribute created cases.`);
    process.exit(1);
  }

  console.log(`Syncing Zephyr project ${projectKey} → Apollo "${project.name}" (${projectId})…`);

  let lastPhase = "";
  const summary = await syncFromZephyr({
    projectId,
    userId,
    token,
    projectKey,
    onProgress: (phase, done, total) => {
      if (phase !== lastPhase) {
        process.stdout.write(`\n${phase === "fetch" ? "Fetching" : "Saving"} cases: `);
        lastPhase = phase;
      }
      if (done % 25 === 0 || done === total) process.stdout.write(`${done}/${total} `);
    },
  });

  console.log("\n\nDone.");
  console.table(summary);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("\nSync failed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
