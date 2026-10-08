import type { ConfidenceState } from "@/lib/confidence";

export type DetailFieldKind = "text" | "number" | "json";

export type DetailFieldDef = {
  key: string;
  label: string;
  kind: DetailFieldKind;
  units?: string;
  placeholder?: string;
};

export type DetailSectionDef = {
  id: string;
  title: string;
  /** Match when entity type/category fits. */
  match: (entity: {
    type: string;
    category: string | null;
  }) => boolean;
  fields: DetailFieldDef[];
};

/**
 * Rich detail forms for the living-room vertical slice.
 * Empty sections are hidden in the UI when no matching attrs and no schema match.
 */
export const DETAIL_SECTIONS: DetailSectionDef[] = [
  {
    id: "floor_tiles",
    title: "Floor tiles",
    match: (e) =>
      e.type === "finish_region" &&
      (e.category === "tile_flooring" || e.category === "floor_tiles"),
    fields: [
      {
        key: "tile_size_nominal",
        label: "Tile size (nominal)",
        kind: "text",
        units: "cm",
        placeholder: "60x60",
      },
      { key: "brand", label: "Brand", kind: "text" },
      { key: "product_line", label: "Product line", kind: "text" },
      { key: "grout_color", label: "Grout color", kind: "text" },
      { key: "grout_width", label: "Grout width", kind: "number", units: "mm" },
      { key: "laying_pattern", label: "Laying pattern", kind: "text" },
      {
        key: "spare_location",
        label: "Spare tile location",
        kind: "text",
        placeholder: "Media cabinet / upper shelf",
      },
      {
        key: "receipt_reference",
        label: "Receipt reference",
        kind: "text",
      },
    ],
  },
  {
    id: "television",
    title: "Television",
    match: (e) =>
      e.type === "appliance" &&
      (e.category === "television" || e.category === "tv"),
    fields: [
      { key: "brand", label: "Brand", kind: "text" },
      { key: "model", label: "Model", kind: "text" },
      { key: "serial", label: "Serial", kind: "text" },
      {
        key: "screen_size",
        label: "Screen size",
        kind: "number",
        units: "in",
      },
      {
        key: "mount_type",
        label: "Mount type",
        kind: "text",
        placeholder: "wall / stand",
      },
      {
        key: "hdmi_inputs",
        label: "HDMI inputs",
        kind: "number",
      },
      {
        key: "power_draw_w",
        label: "Power draw",
        kind: "number",
        units: "W",
      },
      {
        key: "ha_entity_hint",
        label: "HA entity hint",
        kind: "text",
        placeholder: "media_player.living_room_tv",
      },
    ],
  },
  {
    id: "wall_tech",
    title: "Technical point",
    match: (e) => e.type === "technical_point",
    fields: [
      { key: "circuit", label: "Circuit / ID", kind: "text" },
      { key: "voltage", label: "Voltage", kind: "number", units: "V" },
      { key: "amperage", label: "Amperage", kind: "number", units: "A" },
      { key: "port_type", label: "Port type", kind: "text" },
      {
        key: "cable_run_note",
        label: "Cable run note",
        kind: "text",
      },
      {
        key: "install_date",
        label: "Install date",
        kind: "text",
        placeholder: "YYYY-MM-DD",
      },
    ],
  },
  {
    id: "wall_geometry",
    title: "Wall properties",
    match: (e) => e.type === "wall",
    fields: [
      { key: "length", label: "Length", kind: "number", units: "m" },
      { key: "height", label: "Height", kind: "number", units: "m" },
      { key: "thickness", label: "Thickness", kind: "number", units: "m" },
      {
        key: "finish",
        label: "Finish",
        kind: "text",
      },
      {
        key: "avoid_drilling_region",
        label: "Avoid-drilling region (JSON)",
        kind: "json",
      },
    ],
  },
  {
    id: "cabinet_inventory",
    title: "Cabinet / storage",
    match: (e) =>
      e.type === "built_in" ||
      e.type === "shelf" ||
      e.type === "container" ||
      e.type === "inventory_item",
    fields: [
      { key: "capacity_note", label: "Capacity note", kind: "text" },
      { key: "contents_summary", label: "Contents summary", kind: "text" },
      { key: "quantity", label: "Quantity", kind: "number" },
      { key: "sku", label: "SKU / part #", kind: "text" },
      { key: "condition", label: "Condition", kind: "text" },
      {
        key: "last_verified",
        label: "Last verified",
        kind: "text",
        placeholder: "YYYY-MM-DD",
      },
    ],
  },
  {
    id: "room_geometry",
    title: "Room plan",
    match: (e) => e.type === "room",
    fields: [
      { key: "plan_width", label: "Plan width", kind: "number", units: "m" },
      { key: "plan_depth", label: "Plan depth", kind: "number", units: "m" },
      {
        key: "ceiling_height",
        label: "Ceiling height",
        kind: "number",
        units: "m",
      },
      { key: "floor_finish_note", label: "Floor finish note", kind: "text" },
    ],
  },
  {
    id: "opening",
    title: "Opening",
    match: (e) => e.type === "opening",
    fields: [
      { key: "width", label: "Width", kind: "number", units: "m" },
      { key: "height", label: "Height", kind: "number", units: "m" },
      { key: "sill_height", label: "Sill height", kind: "number", units: "m" },
      { key: "swing", label: "Swing / notes", kind: "text" },
    ],
  },
  {
    id: "climate_sensor",
    title: "Climate sensor",
    match: (e) =>
      e.category === "temperature_sensor" || e.category === "humidity_sensor",
    fields: [
      {
        key: "unit",
        label: "Display unit",
        kind: "text",
        placeholder: "°C",
      },
      {
        key: "mount_location",
        label: "Mount location",
        kind: "text",
        placeholder: "North wall / 1.5 m AFFL",
      },
      {
        key: "reading_note",
        label: "Reading note",
        kind: "text",
        placeholder: "Typical range / calibration",
      },
      {
        key: "ha_entity_hint",
        label: "HA entity hint",
        kind: "text",
        placeholder: "sensor.living_room_temperature",
      },
    ],
  },
  {
    id: "occupancy_sensor",
    title: "Occupancy sensor",
    match: (e) => e.category === "occupancy_sensor",
    fields: [
      {
        key: "detection_mode",
        label: "Detection mode",
        kind: "text",
        placeholder: "motion / presence / mmWave",
      },
      {
        key: "mount_location",
        label: "Mount location",
        kind: "text",
        placeholder: "Ceiling near entry",
      },
      {
        key: "coverage_note",
        label: "Coverage note",
        kind: "text",
      },
      {
        key: "ha_entity_hint",
        label: "HA entity hint",
        kind: "text",
        placeholder: "binary_sensor.living_room_occupancy",
      },
    ],
  },
];

export function sectionsForEntity(entity: {
  type: string;
  category: string | null;
}): DetailSectionDef[] {
  return DETAIL_SECTIONS.filter((s) => s.match(entity));
}

/** Geometry attributes that must be strictly positive when set. */
export const POSITIVE_GEOMETRY_KEYS = new Set([
  "plan_width",
  "plan_depth",
  "ceiling_height",
  "length",
  "height",
  "thickness",
  "width",
]);

/** Throw if a positive-geometry key is set to a non-positive number. */
export function assertPositiveGeometryValue(
  key: string,
  value: unknown,
): void {
  if (!POSITIVE_GEOMETRY_KEYS.has(key)) return;
  if (value === null || value === undefined) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${key} must be a positive number`);
  }
}

export function parseFieldValue(
  kind: DetailFieldKind,
  raw: string,
): unknown {
  const trimmed = raw.trim();
  if (kind === "number") {
    if (trimmed === "") return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) throw new Error("Invalid number");
    return n;
  }
  if (kind === "json") {
    if (trimmed === "") return null;
    return JSON.parse(trimmed) as unknown;
  }
  return trimmed === "" ? null : trimmed;
}

export function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return JSON.stringify(value);
}

export type AttrRow = {
  key: string;
  value: unknown;
  units: string | null;
  confidence: ConfidenceState;
  provenance: string | null;
};

export function attrMap(attrs: AttrRow[]): Map<string, AttrRow> {
  return new Map(attrs.map((a) => [a.key, a]));
}
