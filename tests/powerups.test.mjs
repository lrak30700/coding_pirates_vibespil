import { describe, expect, it } from "vitest";
import {
  applyPowerUp,
  DEFAULT_POWER_UP_STATS,
  getPowerUpOffers,
  POWER_UPS,
  POWER_UP_RARITIES,
} from "../src/powerups.ts";

function offer(id, rarity) {
  return { id, rarity, rarityLabel: rarity, name: id, description: id };
}

describe("campaign power-ups", () => {
  it("offers three unique upgrades and advances rarity every two levels", () => {
    const offeredIds = new Set();
    const offeredRarities = new Set();
    const expectedRarities = [
      "rare",
      "rare",
      "super-rare",
      "super-rare",
      "epic",
      "epic",
      "mythic",
      "mythic",
      "legendary",
      "legendary",
    ];

    for (let level = 0; level < 10; level += 1) {
      const offers = getPowerUpOffers(level);
      expect(offers).toHaveLength(3);
      expect(new Set(offers.map(({ id }) => id)).size).toBe(3);
      expect(offers.every(({ name, description }) => name && description)).toBe(true);
      expect(offers.every(({ rarity }) => rarity === expectedRarities[level])).toBe(true);
      offers.forEach(({ id, rarity }) => {
        offeredIds.add(id);
        offeredRarities.add(rarity);
      });
    }

    expect(POWER_UPS).toHaveLength(10);
    expect(offeredIds).toEqual(new Set(POWER_UPS.map(({ id }) => id)));
    expect(offeredRarities).toEqual(new Set(POWER_UP_RARITIES.map(({ id }) => id)));
  });

  it("scales every upgrade with rarity and respects defensive caps", () => {
    const expectedIncreasedStat = {
      "bulwark-shell": "maxHealth",
      "viper-rounds": "damageMultiplier",
      "adrenal-rush": "moveSpeedMultiplier",
      "clockwork-core": "fireRateMultiplier",
      "scavenger-drone": "ammoRewardMultiplier",
      "nano-mender": "healthRegeneration",
      "phase-weave": "incomingDamageMultiplier",
      "gravity-treads": "jumpMultiplier",
      "targeting-suite": "weaponRangeMultiplier",
      "demolition-harness": "maxGrenades",
    };
    for (const [id, stat] of Object.entries(expectedIncreasedStat)) {
      const tierValues = POWER_UP_RARITIES.map(({ id: rarity }) => {
        return applyPowerUp(DEFAULT_POWER_UP_STATS, offer(id, rarity))[stat];
      });
      if (id === "phase-weave") {
        expect(tierValues[0]).toBeLessThan(1);
        expect(
          tierValues.every((value, index) => index === 0 || value < tierValues[index - 1]),
        ).toBe(true);
      } else {
        expect(tierValues[0]).toBeGreaterThan(DEFAULT_POWER_UP_STATS[stat]);
        expect(
          tierValues.every((value, index) => index === 0 || value > tierValues[index - 1]),
        ).toBe(true);
      }
    }

    expect(
      applyPowerUp(
        { ...DEFAULT_POWER_UP_STATS, maxHealth: 250 },
        offer("bulwark-shell", "legendary"),
      ).maxHealth,
    ).toBe(250);
    expect(
      applyPowerUp(
        { ...DEFAULT_POWER_UP_STATS, incomingDamageMultiplier: 0.35 },
        offer("phase-weave", "legendary"),
      ).incomingDamageMultiplier,
    ).toBe(0.35);
  });
});
