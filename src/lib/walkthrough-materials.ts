/**
 * Lean photoreal material presets for the walkthrough.
 * Parametric boxes stay; PBR params + lighting make finishes read as paint,
 * tile, glass, metal, and wood instead of flat CAD colors.
 */

/** Mirrors WalkthroughMeshKind — kept local to avoid circular imports. */
export type MaterialMeshKind =
  | "floor"
  | "ceiling"
  | "wall"
  | "opening"
  | "prop"
  | "fixture";

export type WalkthroughMaterialPreset = {
  roughness: number;
  metalness: number;
  /** Soft IBL response when an environment map is present. */
  envMapIntensity: number;
};

export type WalkthroughLightingPreset = {
  background: string;
  ambientIntensity: number;
  hemisphereSky: string;
  hemisphereGround: string;
  hemisphereIntensity: number;
  keyIntensity: number;
  keyPosition: [number, number, number];
  fillIntensity: number;
  fillPosition: [number, number, number];
  contactShadowOpacity: number;
  contactShadowBlur: number;
  /** drei Environment preset intensity (apartment IBL). */
  environmentIntensity: number;
};

/** Default room lighting — warm key + cool fill, soft contact shadow. */
export const WALKTHROUGH_LIGHTING: WalkthroughLightingPreset = {
  background: "#ebe6df",
  ambientIntensity: 0.22,
  hemisphereSky: "#f5f0e8",
  hemisphereGround: "#8a8178",
  hemisphereIntensity: 0.55,
  keyIntensity: 1.05,
  keyPosition: [3.5, 7.5, 2.2],
  fillIntensity: 0.35,
  fillPosition: [-2.5, 3.5, -1.5],
  contactShadowOpacity: 0.45,
  contactShadowBlur: 2.2,
  environmentIntensity: 0.45,
};

/**
 * PBR preset for a mesh kind. Category refines props/fixtures
 * (television metal, cabinet wood, window glass).
 */
export function materialPresetFor(
  kind: MaterialMeshKind,
  category?: string | null,
): WalkthroughMaterialPreset {
  const cat = (category ?? "").toLowerCase();

  switch (kind) {
    case "floor":
      // Matte ceramic / large-format tile
      return { roughness: 0.72, metalness: 0.04, envMapIntensity: 0.35 };
    case "ceiling":
      return { roughness: 0.96, metalness: 0, envMapIntensity: 0.15 };
    case "wall":
      // Painted plaster
      return { roughness: 0.88, metalness: 0, envMapIntensity: 0.25 };
    case "opening":
      if (cat === "window") {
        return { roughness: 0.12, metalness: 0.15, envMapIntensity: 1.1 };
      }
      // Door leaf / frame
      return { roughness: 0.55, metalness: 0.08, envMapIntensity: 0.45 };
    case "fixture":
      if (cat.includes("network") || cat === "socket" || cat === "outlet") {
        return { roughness: 0.4, metalness: 0.35, envMapIntensity: 0.7 };
      }
      return { roughness: 0.5, metalness: 0.2, envMapIntensity: 0.55 };
    case "prop":
      if (cat === "television") {
        return { roughness: 0.22, metalness: 0.65, envMapIntensity: 1.0 };
      }
      if (
        cat === "media_cabinet" ||
        cat.includes("cabinet") ||
        cat.includes("wood")
      ) {
        return { roughness: 0.58, metalness: 0.05, envMapIntensity: 0.4 };
      }
      if (cat === "fan") {
        return { roughness: 0.35, metalness: 0.45, envMapIntensity: 0.75 };
      }
      if (cat === "blind" || cat === "blind_motor") {
        return { roughness: 0.7, metalness: 0.05, envMapIntensity: 0.3 };
      }
      return { roughness: 0.55, metalness: 0.12, envMapIntensity: 0.5 };
    default:
      return { roughness: 0.65, metalness: 0.05, envMapIntensity: 0.4 };
  }
}

/** Slightly warmer structural base colors vs flat CAD greys. */
export function structuralFinishColor(
  kind: Extract<MaterialMeshKind, "floor" | "ceiling" | "wall">,
): string {
  switch (kind) {
    case "floor":
      return "#d9cfc3";
    case "ceiling":
      return "#f7f4ef";
    case "wall":
      return "#ebe4da";
  }
}
