import type { entities } from "@/db/schema";

export type EntityRow = typeof entities.$inferSelect;

export type EntityTreeNode = EntityRow & { children: EntityTreeNode[] };

export function buildEntityTree(rows: EntityRow[]): EntityTreeNode[] {
  const map = new Map<string, EntityTreeNode>();
  for (const row of rows) {
    map.set(row.id, { ...row, children: [] });
  }
  const roots: EntityTreeNode[] = [];
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRecursive = (nodes: EntityTreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const n of nodes) sortRecursive(n.children);
  };
  sortRecursive(roots);
  return roots;
}

export function findFirstRoom(rows: EntityRow[]): EntityRow | null {
  return rows.find((r) => r.type === "room") ?? null;
}

export function filterEntitiesByQuery<
  T extends { name: string; type: string; category: string | null },
>(rows: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (e) =>
      e.name.toLowerCase().includes(q) ||
      e.type.toLowerCase().includes(q) ||
      (e.category?.toLowerCase().includes(q) ?? false),
  );
}
