import type { AmmoWeaponKind } from "./ammo-rewards";
import type { AlienKind } from "./aliens";

export type Weapon = {
  category: "PRIMARY" | "SECONDARY" | "MELEE" | "EXTRA";
  name: string;
  damage: number;
  cooldown: number;
  magazine: number;
  kind: AmmoWeaponKind;
};

export type ArmoryWeapon = Weapon & {
  cost: number;
};

export const STARTING_WEAPONS: readonly Weapon[] = [
  {
    category: "PRIMARY",
    name: "Viper rifle",
    damage: 34,
    cooldown: 0.12,
    magazine: 30,
    kind: "rifle",
  },
  {
    category: "SECONDARY",
    name: "Kestrel pistol",
    damage: 52,
    cooldown: 0.28,
    magazine: 12,
    kind: "pistol",
  },
  {
    category: "MELEE",
    name: "Combat knife",
    damage: 78,
    cooldown: 0.42,
    magazine: 0,
    kind: "knife",
  },
  {
    category: "EXTRA",
    name: "Frag grenade",
    damage: 110,
    cooldown: 0.8,
    magazine: 3,
    kind: "grenade",
  },
];

export const ARMORY_WEAPONS: readonly ArmoryWeapon[] = [
  {
    category: "PRIMARY",
    name: "Tempest SMG",
    damage: 25,
    cooldown: 0.072,
    magazine: 42,
    kind: "rifle",
    cost: 85,
  },
  {
    category: "SECONDARY",
    name: "Longshot hand cannon",
    damage: 86,
    cooldown: 0.42,
    magazine: 8,
    kind: "pistol",
    cost: 75,
  },
  {
    category: "MELEE",
    name: "Arc cleaver",
    damage: 118,
    cooldown: 0.58,
    magazine: 0,
    kind: "knife",
    cost: 65,
  },
  {
    category: "EXTRA",
    name: "Shard launcher",
    damage: 155,
    cooldown: 1.05,
    magazine: 3,
    kind: "grenade",
    cost: 125,
  },
];

const COIN_DROPS: Record<AlienKind, number> = {
  damage: 12,
  speedy: 8,
  shooter: 10,
  tanky: 20,
};

export function getCoinDrop(kind: AlienKind): number {
  return COIN_DROPS[kind];
}
