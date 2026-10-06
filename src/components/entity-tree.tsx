import Link from "next/link";
import { entityHref } from "@/lib/entity-href";
import type { EntityTreeNode } from "@/lib/entity-tree";

function NodeList({
  nodes,
  projectId,
  selectedId,
  depth = 0,
}: {
  nodes: EntityTreeNode[];
  projectId: string;
  selectedId?: string;
  depth?: number;
}) {
  return (
    <ul className="space-y-0.5" style={{ paddingLeft: depth ? 12 : 0 }}>
      {nodes.map((node) => {
        const href = entityHref(projectId, node);
        const active = selectedId === node.id;
        return (
          <li key={node.id}>
            <Link
              href={href}
              className={`block rounded px-2 py-1 text-sm hover:bg-zinc-100 ${
                active ? "bg-zinc-200 font-medium" : "text-zinc-800"
              }`}
            >
              <span className="text-zinc-500">{node.type}</span> · {node.name}
            </Link>
            {node.children.length > 0 ? (
              <NodeList
                nodes={node.children}
                projectId={projectId}
                selectedId={selectedId}
                depth={depth + 1}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function EntityTree({
  projectId,
  tree,
  selectedId,
}: {
  projectId: string;
  tree: EntityTreeNode[];
  selectedId?: string;
}) {
  if (tree.length === 0) {
    return <p className="text-sm text-zinc-500">No entities yet.</p>;
  }
  return (
    <NodeList nodes={tree} projectId={projectId} selectedId={selectedId} />
  );
}
