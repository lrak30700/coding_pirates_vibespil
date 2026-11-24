import { describe, expect, it } from "vitest";
import { ARMORY_WEAPONS, getCoinDrop, STARTING_WEAPONS } from "../src/armory.ts";

describe("alien coin drops and replacement armory", () => {
  it("rewards coins for every alien type, with tougher aliens worth more", () => {
    const rewards = ["damage", "speedy", "shooter", "tanky"].map(getCoinDrop);
    expect(rewards.every((amount) => amount > 0)).toBe(true);
    expect(getCoinDrop("tanky")).toBeGreaterThan(getCoinDrop("speedy"));
  });

  it("offers one purchasable replacement for each weapon slot", () => {
    expect(ARMORY_WEAPONS).toHaveLength(4);
    expect(new Set(ARMORY_WEAPONS.map(({ category }) => category))).toEqual(
      new Set(STARTING_WEAPONS.map(({ category }) => category)),
    );
    expect(ARMORY_WEAPONS.every(({ cost, damage }) => cost > 0 && damage > 0)).toBe(true);
    expect(
      ARMORY_WEAPONS.every(
        (weapon) =>
          weapon.name !==
          STARTING_WEAPONS.find((start) => start.category === weapon.category)?.name,
      ),
    ).toBe(true);
  });
});
