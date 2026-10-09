import { describe, expect, it } from "vitest";
import {
  materialPresetFor,
  structuralFinishColor,
  WALKTHROUGH_LIGHTING,
} from "@/lib/walkthrough-materials";

describe("walkthrough-materials", () => {
  it("gives painted walls higher roughness than glass windows", () => {
    const wall = materialPresetFor("wall");
    const window = materialPresetFor("opening", "window");
    expect(wall.roughness).toBeGreaterThan(window.roughness);
    expect(window.envMapIntensity).toBeGreaterThan(wall.envMapIntensity);
  });

  it("makes television more metallic than media cabinet wood", () => {
    const tv = materialPresetFor("prop", "television");
    const cabinet = materialPresetFor("prop", "media_cabinet");
    expect(tv.metalness).toBeGreaterThan(cabinet.metalness);
    expect(cabinet.roughness).toBeGreaterThan(tv.roughness);
  });

  it("keeps floor tile matte and ceiling nearly diffuse", () => {
    const floor = materialPresetFor("floor");
    const ceiling = materialPresetFor("ceiling");
    expect(floor.metalness).toBeLessThan(0.1);
    expect(ceiling.roughness).toBeGreaterThan(0.9);
  });

  it("returns warmer structural finish colors than flat CAD greys", () => {
    expect(structuralFinishColor("floor")).toBe("#d9cfc3");
    expect(structuralFinishColor("wall")).toBe("#ebe4da");
    expect(structuralFinishColor("ceiling")).toBe("#f7f4ef");
  });

  it("exposes a coherent lighting preset for the viewer", () => {
    expect(WALKTHROUGH_LIGHTING.environmentIntensity).toBeGreaterThan(0);
    expect(WALKTHROUGH_LIGHTING.keyIntensity).toBeGreaterThan(
      WALKTHROUGH_LIGHTING.fillIntensity,
    );
    expect(WALKTHROUGH_LIGHTING.contactShadowOpacity).toBeGreaterThan(0);
    expect(WALKTHROUGH_LIGHTING.background).toMatch(/^#/);
  });
});
