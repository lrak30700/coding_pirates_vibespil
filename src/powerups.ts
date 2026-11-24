export type PowerUpRarity = "rare" | "super-rare" | "epic" | "mythic" | "legendary";
export type PowerUpId =
  | "bulwark-shell"
  | "viper-rounds"
  | "adrenal-rush"
  | "clockwork-core"
  | "scavenger-drone"
  | "nano-mender"
  | "phase-weave"
  | "gravity-treads"
  | "targeting-suite"
  | "demolition-harness";

export type PowerUp = {
  id: PowerUpId;
  name: string;
  rarity: PowerUpRarity;
  rarityLabel: string;
  description: string;
};

export type PowerUpStats = {
  maxHealth: number;
  health: number;
  damageMultiplier: number;
  moveSpeedMultiplier: number;
  fireRateMultiplier: number;
  ammoRewardMultiplier: number;
  healthRegeneration: number;
  incomingDamageMultiplier: number;
  jumpMultiplier: number;
  weaponRangeMultiplier: number;
  grenadeDamageMultiplier: number;
  maxGrenades: number;
  rifleReserve: number;
  pistolReserve: number;
  grenades: number;
};

export const POWER_UP_RARITIES: readonly {
  id: PowerUpRarity;
  label: string;
  multiplier: number;
}[] = [
  { id: "rare", label: "Rare", multiplier: 1 },
  { id: "super-rare", label: "Super Rare", multiplier: 1.35 },
  { id: "epic", label: "Epic", multiplier: 1.7 },
  { id: "mythic", label: "Mythic", multiplier: 2.1 },
  { id: "legendary", label: "Legendary", multiplier: 2.6 },
];

export const POWER_UPS: readonly { id: PowerUpId; name: string }[] = [
  { id: "bulwark-shell", name: "Bulwark Shell" },
  { id: "viper-rounds", name: "Viper Rounds" },
  { id: "adrenal-rush", name: "Adrenal Rush" },
  { id: "clockwork-core", name: "Clockwork Core" },
  { id: "scavenger-drone", name: "Scavenger Drone" },
  { id: "nano-mender", name: "Nano-Mender" },
  { id: "phase-weave", name: "Phase-Weave" },
  { id: "gravity-treads", name: "Gravity Treads" },
  { id: "targeting-suite", name: "Targeting Suite" },
  { id: "demolition-harness", name: "Demolition Harness" },
];

export const DEFAULT_POWER_UP_STATS: Readonly<PowerUpStats> = {
  maxHealth: 100,
  health: 100,
  damageMultiplier: 1,
  moveSpeedMultiplier: 1,
  fireRateMultiplier: 1,
  ammoRewardMultiplier: 1,
  healthRegeneration: 0,
  incomingDamageMultiplier: 1,
  jumpMultiplier: 1,
  weaponRangeMultiplier: 1,
  grenadeDamageMultiplier: 1,
  maxGrenades: 6,
  rifleReserve: 90,
  pistolReserve: 36,
  grenades: 3,
};

function descriptionForPowerUp(id: PowerUpId, multiplier: number, rank: number): string {
  const percent = (base: number) => `${Math.round(base * multiplier)}%`;
  switch (id) {
    case "bulwark-shell": {
      const health = Math.round(20 * multiplier);
      return `Add ${health} max health (up to 250) and restore ${health} health.`;
    }
    case "viper-rounds":
      return `Deal ${percent(12)} more damage with every weapon.`;
    case "adrenal-rush":
      return `Move and sprint ${percent(8)} faster.`;
    case "clockwork-core":
      return `Fire and throw grenades ${percent(10)} faster.`;
    case "scavenger-drone":
      return `Gain ${percent(20)} more ammo from alien kills.`;
    case "nano-mender":
      return `Regenerate ${rank} health per second.`;
    case "phase-weave":
      return `Take ${percent(8)} less damage from alien attacks.`;
    case "gravity-treads":
      return `Jump ${percent(10)} higher.`;
    case "targeting-suite":
      return `Increase weapon range by ${percent(12)}.`;
    case "demolition-harness": {
      return `Grenades deal ${percent(15)} more damage and gain +${rank} max ammo.`;
    }
  }
}

export function getPowerUpOffers(completedLevelIndex: number): readonly PowerUp[] {
  const rarityIndex = Math.min(POWER_UP_RARITIES.length - 1, Math.floor(completedLevelIndex / 2));
  const rarity = POWER_UP_RARITIES[rarityIndex]!;
  const start = (completedLevelIndex * 3) % POWER_UPS.length;
  return Array.from({ length: 3 }, (_, index) => {
    const powerUp = POWER_UPS[(start + index) % POWER_UPS.length]!;
    return {
      ...powerUp,
      rarity: rarity.id,
      rarityLabel: rarity.label,
      description: descriptionForPowerUp(powerUp.id, rarity.multiplier, rarityIndex + 1),
    };
  });
}

export function applyPowerUp(stats: PowerUpStats, powerUp: PowerUp): PowerUpStats {
  const rarity = POWER_UP_RARITIES.find(({ id }) => id === powerUp.rarity);
  if (!rarity) throw new Error(`Unknown power-up rarity: ${powerUp.rarity}`);
  const tier = rarity.multiplier;
  const rank = POWER_UP_RARITIES.indexOf(rarity) + 1;
  switch (powerUp.id) {
    case "bulwark-shell": {
      const bonus = Math.round(20 * tier);
      const maxHealth = Math.min(250, stats.maxHealth + bonus);
      return { ...stats, maxHealth, health: Math.min(maxHealth, stats.health + bonus) };
    }
    case "viper-rounds":
      return { ...stats, damageMultiplier: stats.damageMultiplier * (1 + 0.12 * tier) };
    case "adrenal-rush":
      return { ...stats, moveSpeedMultiplier: stats.moveSpeedMultiplier * (1 + 0.08 * tier) };
    case "clockwork-core":
      return { ...stats, fireRateMultiplier: stats.fireRateMultiplier * (1 + 0.1 * tier) };
    case "scavenger-drone":
      return { ...stats, ammoRewardMultiplier: stats.ammoRewardMultiplier * (1 + 0.2 * tier) };
    case "nano-mender":
      return { ...stats, healthRegeneration: stats.healthRegeneration + rank };
    case "phase-weave":
      return {
        ...stats,
        incomingDamageMultiplier: Math.max(
          0.35,
          stats.incomingDamageMultiplier * (1 - 0.08 * tier),
        ),
      };
    case "gravity-treads":
      return { ...stats, jumpMultiplier: stats.jumpMultiplier * (1 + 0.1 * tier) };
    case "targeting-suite":
      return {
        ...stats,
        weaponRangeMultiplier: stats.weaponRangeMultiplier * (1 + 0.12 * tier),
      };
    case "demolition-harness":
      return {
        ...stats,
        grenadeDamageMultiplier: stats.grenadeDamageMultiplier * (1 + 0.15 * tier),
        maxGrenades: Math.min(18, stats.maxGrenades + rank),
      };
  }
}
