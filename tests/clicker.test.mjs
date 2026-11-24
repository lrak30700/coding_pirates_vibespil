import { describe, expect, it } from "vitest";
import {
  advanceClicker,
  buyClickUpgrade,
  buyGenerator,
  buyResearch,
  buyResearchLab,
  claimContract,
  createClickerSave,
  getClickYield,
  getClickUpgradeCost,
  getContracts,
  getGeneratorCost,
  getPrestigeGain,
  getProductionRate,
  getResearchRate,
  mineFlux,
  parseClickerSave,
  startNewExpedition,
} from "../src/clicker.ts";

describe("Voidworks clicker progression", () => {
  it("compounds generator output and preserves lifetime production", () => {
    const save = createClickerSave(100);
    expect(getGeneratorCost(save, "drones")).toBe(15);
    expect(buyGenerator(save, "drones")).toBe(true);
    expect(save.flux).toBe(10);
    expect(getProductionRate(save)).toBe(1);

    advanceClicker(save, 12);
    expect(save.flux).toBe(22);
    expect(save.lifetimeFlux).toBe(12);
    expect(buyGenerator(save, "drones")).toBe(true);
    expect(getProductionRate(save)).toBe(2);
  });

  it("uses research labs and one-time projects to improve extraction", () => {
    const save = createClickerSave();
    save.flux = 100;
    expect(buyResearchLab(save)).toBe(true);
    expect(getResearchRate(save)).toBeCloseTo(0.2);
    advanceClicker(save, 10);
    expect(save.data).toBeCloseTo(2);

    save.data = 12;
    expect(buyResearch(save, "deep-drills")).toBe(true);
    expect(getClickYield(save)).toBe(2);
    expect(mineFlux(save)).toBe(2);
    expect(buyResearch(save, "deep-drills")).toBe(false);
  });

  it("adds repeatable click augments and boosted production", () => {
    const save = createClickerSave();
    save.flux = 35;
    expect(getClickUpgradeCost(save, "flux-scoop")).toBe(35);
    expect(buyClickUpgrade(save, "flux-scoop")).toBe(true);
    expect(getClickYield(save)).toBe(2);
    save.data = 12;
    expect(buyClickUpgrade(save, "data-siphon")).toBe(true);
    mineFlux(save);
    expect(save.data).toBeCloseTo(0.06);

    save.generatorLevels.drones = 1;
    advanceClicker(save, 2, 3);
    expect(save.lifetimeFlux).toBeGreaterThan(2);
  });

  it("pays completed contracts and resets industry for permanent prestige", () => {
    const save = createClickerSave();
    save.generatorLevels.drones = 5;
    save.lifetimeFlux = 1_000_000;
    expect(getContracts(save).find(({ id }) => id === "fleet")?.complete).toBe(true);
    expect(claimContract(save, "fleet")).toBe(true);
    expect(save.data).toBe(8);
    expect(claimContract(save, "fleet")).toBe(false);
    expect(getPrestigeGain(save)).toBe(1);

    expect(startNewExpedition(save)).toBe(1);
    expect(save.prestige).toBe(1);
    expect(save.generatorLevels.drones).toBe(0);
    expect(save.lifetimeFlux).toBe(1_000_000);
    expect(getClickYield(save)).toBeCloseTo(1.2);
  });

  it("rejects malformed saves and filters unknown progression entries", () => {
    expect(parseClickerSave("{")).toBeNull();
    const restored = parseClickerSave(
      JSON.stringify({
        flux: -10,
        data: 4,
        lifetimeFlux: 20,
        lifetimeClicks: 2,
        prestige: 0,
        generatorLevels: { drones: 3, unknown: 99 },
        labLevel: 1,
        research: ["deep-drills", "unknown"],
        claimedContracts: ["fleet", "unknown"],
        lastSavedAt: 100,
      }),
    );
    expect(restored?.flux).toBe(0);
    expect(restored?.generatorLevels.drones).toBe(3);
    expect(restored?.research).toEqual(["deep-drills"]);
    expect(restored?.claimedContracts).toEqual(["fleet"]);
  });
});
