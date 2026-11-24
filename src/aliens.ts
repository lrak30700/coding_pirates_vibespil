export type AlienKind = "damage" | "speedy" | "shooter" | "tanky";

const PLAYER_DAMAGE_GRACE_SECONDS = 0.65;

export function receiveAlienHit(
  health: number,
  damage: number,
  incomingDamageMultiplier: number,
  damageCooldown: number,
): { health: number; damageCooldown: number; wasDamaged: boolean } {
  if (damageCooldown > 0) return { health, damageCooldown, wasDamaged: false };
  return {
    health: Math.max(0, health - damage * incomingDamageMultiplier),
    damageCooldown: PLAYER_DAMAGE_GRACE_SECONDS,
    wasDamaged: true,
  };
}

type AlienProfile = {
  name: string;
  healthMultiplier: number;
  speed: number;
  damage: number;
  range: number;
  cooldown: number;
  windup: number;
  bodyColor: number;
  highlightColor: number;
  eyeColor: number;
  accentColor: number;
};

export const ALIEN_PROFILES: Record<AlienKind, AlienProfile> = {
  damage: {
    name: "Damage alien",
    healthMultiplier: 1.1,
    speed: 0.56,
    damage: 28,
    range: 1.25,
    cooldown: 2,
    windup: 0.86,
    bodyColor: 0xa5354a,
    highlightColor: 0xff7185,
    eyeColor: 0xffd2a8,
    accentColor: 0xff405d,
  },
  speedy: {
    name: "Speedy alien",
    healthMultiplier: 0.65,
    speed: 2.25,
    damage: 7,
    range: 1.05,
    cooldown: 0.92,
    windup: 0.42,
    bodyColor: 0x2466a9,
    highlightColor: 0x79c4ff,
    eyeColor: 0xc7f6ff,
    accentColor: 0x3da8ff,
  },
  shooter: {
    name: "Shooter alien",
    healthMultiplier: 0.8,
    speed: 0.72,
    damage: 8,
    range: 10,
    cooldown: 2.25,
    windup: 0.95,
    bodyColor: 0xb28a28,
    highlightColor: 0xffe083,
    eyeColor: 0xfff6bd,
    accentColor: 0xffc936,
  },
  tanky: {
    name: "Tank alien",
    healthMultiplier: 2.4,
    speed: 0.42,
    damage: 36,
    range: 1.5,
    cooldown: 2.3,
    windup: 1.05,
    bodyColor: 0x713db0,
    highlightColor: 0xc39aff,
    eyeColor: 0xf2daff,
    accentColor: 0xa66aff,
  },
};

export function alienForSpawn(levelIndex: number, spawnIndex: number): AlienKind {
  const available: AlienKind[] = ["damage", "speedy"];
  if (levelIndex >= 2) available.push("shooter");
  if (levelIndex >= 4) available.push("tanky");
  return available[spawnIndex % available.length]!;
}
