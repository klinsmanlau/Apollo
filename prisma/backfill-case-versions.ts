import { prisma } from "../src/lib/prisma";
import { ensureInitialVersion } from "../src/lib/case-versions-db";

/**
 * One-off backfill: give every existing test case a version-1 snapshot from its
 * current content, so the History tab has a baseline. Idempotent — cases that
 * already have any version are skipped, so it's safe to re-run.
 *
 *   npx tsx prisma/backfill-case-versions.ts
 */
async function main() {
  const cases = await prisma.testCase.findMany({
    where: { versions: { none: {} } },
    select: { id: true },
  });
  console.log(`Backfilling ${cases.length} case(s) without a version…`);

  let created = 0;
  for (const c of cases) {
    if (await ensureInitialVersion(prisma, c.id)) created++;
  }
  console.log(`Done. Created ${created} initial version(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
