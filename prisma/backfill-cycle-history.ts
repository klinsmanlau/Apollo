import { prisma } from "../src/lib/prisma";

/**
 * One-off backfill: seed a "Created" history event for existing test cycles
 * that predate the History feature, dated at the cycle's own creation time so
 * the log has a baseline. Past field edits can't be reconstructed. Idempotent —
 * cycles that already have any change row are skipped, so it's safe to re-run.
 *
 *   npx tsx prisma/backfill-cycle-history.ts
 */
async function main() {
  const cycles = await prisma.testRun.findMany({
    where: { changes: { none: {} } },
    select: { id: true, ownerName: true, createdAt: true },
  });
  console.log(`Seeding "Created" history for ${cycles.length} cycle(s)…`);

  let created = 0;
  for (const c of cycles) {
    await prisma.cycleChange.create({
      data: {
        runId: c.id,
        changedById: null,
        changedByName: c.ownerName ?? "System",
        field: "__created__",
        label: "Created",
        createdAt: c.createdAt,
      },
    });
    created++;
  }
  console.log(`Done. Seeded ${created} event(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
