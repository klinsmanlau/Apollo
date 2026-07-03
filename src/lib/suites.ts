import type { TestSuite } from "@prisma/client";

export type SuiteNode = TestSuite & { children: SuiteNode[] };

/** Build a nested tree from a flat list of suites. */
export function buildSuiteTree(suites: TestSuite[]): SuiteNode[] {
  const byId = new Map<string, SuiteNode>();
  for (const s of suites) byId.set(s.id, { ...s, children: [] });

  const roots: SuiteNode[] = [];
  for (const node of byId.values()) {
    if (node.parentSuiteId && byId.has(node.parentSuiteId)) {
      byId.get(node.parentSuiteId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortRec = (nodes: SuiteNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

/** Flatten the tree into indented options for a <select>. */
export function flattenForSelect(
  nodes: SuiteNode[],
  depth = 0
): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  for (const n of nodes) {
    out.push({ id: n.id, label: `${"  ".repeat(depth)}${n.name}` });
    out.push(...flattenForSelect(n.children, depth + 1));
  }
  return out;
}
