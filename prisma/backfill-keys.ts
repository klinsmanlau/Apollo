import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const KEY_RE = /^([A-Za-z][A-Za-z0-9]*)-T(\d+)$/;

function parseKey(k: string) {
  const m = KEY_RE.exec(k.trim());
  return m ? { prefix: m[1].toUpperCase(), num: Number(m[2]) } : null;
}
function deriveDefaultPrefix(name: string) {
  return name.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 3) || "TC";
}

/**
 * Assign a unique key to every existing case and seed each project's prefix +
 * sequence. Imported cases (with a sourceKey) reuse it; others get generated
 * keys. Safe to re-run: cases that already have a key are skipped.
 */
async function main() {
  const projects = await prisma.project.findMany({
    select: { id: true, name: true, keyPrefix: true, caseSeq: true },
  });

  for (const proj of projects) {
    const cases = await prisma.testCase.findMany({
      where: { suite: { projectId: proj.id } },
      select: { id: true, key: true, sourceKey: true },
      orderBy: { createdAt: "asc" },
    });

    const allKeys = cases
      .flatMap((c) => [c.key, c.sourceKey])
      .filter((k): k is string => !!k);

    const counts = new Map<string, number>();
    for (const k of allKeys) {
      const p = parseKey(k);
      if (p) counts.set(p.prefix, (counts.get(p.prefix) ?? 0) + 1);
    }
    const prefix =
      proj.keyPrefix ??
      (counts.size
        ? [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
        : deriveDefaultPrefix(proj.name));

    let maxNum = 0;
    for (const k of allKeys) {
      const p = parseKey(k);
      if (p && p.prefix === prefix) maxNum = Math.max(maxNum, p.num);
    }

    let seq = Math.max(proj.caseSeq, maxNum);
    let assigned = 0;
    for (const c of cases) {
      if (c.key) continue;
      const key = c.sourceKey ?? `${prefix}-T${++seq}`;
      await prisma.testCase.update({ where: { id: c.id }, data: { key } });
      assigned++;
    }

    await prisma.project.update({
      where: { id: proj.id },
      data: { keyPrefix: prefix, caseSeq: seq },
    });
    console.log(
      `Project "${proj.name}": prefix=${prefix}, caseSeq=${seq}, assigned ${assigned} keys (${cases.length} cases)`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
