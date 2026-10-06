export const RELATIONSHIP_TYPES = [
  "located_in",
  "attached_to",
  "installed_on",
  "stored_inside",
  "connected_to",
  "powered_by",
  "controlled_by",
  "replaces",
  "same_product_as",
  "covered_by_document",
  "supplied_by",
  "installed_by",
  "uses_consumable",
  "spare_part_for",
  "represented_in_ha_by",
] as const;

export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export function isRelationshipType(value: unknown): value is RelationshipType {
  return (
    typeof value === "string" &&
    (RELATIONSHIP_TYPES as readonly string[]).includes(value)
  );
}

export function assertRelationshipType(value: unknown): RelationshipType {
  if (!isRelationshipType(value)) {
    throw new Error(`Invalid relationship type: ${String(value)}`);
  }
  return value;
}
