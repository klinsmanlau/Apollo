import { prisma } from "../src/lib/prisma";
import { syncCyclesFromZephyr } from "../src/lib/import/zephyr-cycles-sync";

/**
 * On-demand Zephyr Scale Cloud → Apollo TEST CYCLE sync (migration tool).
 *
 *   ZEPHYR_API_TOKEN=... npx tsx prisma/zephyr-sync-cycles.ts <apolloProjectId> <zephyrProjectKey>
 *   e.g.  npm run zephyr:sync-cycles -- rytbank-qa-team TS
 *
 * Pulls every test cycle and its executions from Zephyr, into a "Zephyr
 * (imported)" folder. Executions attach to Apollo cases by Zephyr key, so run
 * the CASE sync first. Idempotent on externalRunId="zephyr:<cycleKey>".
 */
async function main() {
  const [projectId, projectKey] = process.argv.slice(2);
  const token = process.env.ZEPHYR_API_TOKEN;

  if (!projectId || !projectKey) {
    console.error("Usage: npx tsx prisma/zephyr-sync-cycles.ts <apolloProjectId> <zephyrProjectKey>");
    process.exit(1);
  }
  if (!token) {
    console.error("Set ZEPHYR_API_TOKEN in your environment (or .env).");
    process.exit(1);
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });
  if (!project) {
    console.error(`Apollo project "${projectId}" not found.`);
    process.exit(1);
  }

  console.log(`Syncing Zephyr cycles ${projectKey} → Apollo "${project.name}"…`);
  let lastPhase = "";
  const summary = await syncCyclesFromZephyr({
    projectId,
    token,
    projectKey,
    onProgress: (phase, done, total) => {
      if (phase !== lastPhase) {
        process.stdout.write(`\n${phase === "fetch" ? "Fetching cycles" : "Saving cycles"}: `);
        lastPhase = phase;
      }
      if (done % 10 === 0 || done === total) process.stdout.write(`${done}/${total} `);
    },
  });

  console.log("\n\nDone.");
  console.table(summary);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("\nCycle sync failed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
