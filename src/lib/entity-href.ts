export function entityHref(
  projectId: string,
  entity: { id: string; type: string },
): string {
  if (entity.type === "wall") {
    return `/projects/${projectId}/walls/${entity.id}`;
  }
  if (entity.type === "room") {
    return `/projects/${projectId}/rooms/${entity.id}`;
  }
  return `/projects/${projectId}/entities/${entity.id}`;
}
