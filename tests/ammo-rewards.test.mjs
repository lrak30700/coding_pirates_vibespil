import { describe, expect, it } from "vitest";
import { getKillAmmoReward } from "../src/ammo-rewards.ts";

describe("kill ammo rewards", () => {
  it("rewards the weapon used and gives knife kills rifle ammo", () => {
    expect(getKillAmmoReward("rifle")).toEqual({ ammo: "rifle", amount: 8 });
    expect(getKillAmmoReward("pistol")).toEqual({ ammo: "pistol", amount: 5 });
    expect(getKillAmmoReward("knife")).toEqual({ ammo: "rifle", amount: 6 });
    expect(getKillAmmoReward("grenade", 0)).toEqual({ ammo: "grenade", amount: 1 });
  });

  it("turns grenade rewards into rifle ammo when the grenade limit is reached", () => {
    expect(getKillAmmoReward("grenade", 6)).toEqual({ ammo: "rifle", amount: 6 });
  });
});
