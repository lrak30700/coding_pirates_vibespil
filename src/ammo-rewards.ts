export type AmmoWeaponKind = "rifle" | "pistol" | "knife" | "grenade";
export type AmmoReward = { ammo: "rifle" | "pistol" | "grenade"; amount: number };

const KILL_REWARDS: Record<AmmoWeaponKind, AmmoReward> = {
  rifle: { ammo: "rifle", amount: 8 },
  pistol: { ammo: "pistol", amount: 5 },
  knife: { ammo: "rifle", amount: 6 },
  grenade: { ammo: "grenade", amount: 1 },
};

export function getKillAmmoReward(weapon: AmmoWeaponKind, grenadeCount = 0): AmmoReward {
  if (weapon === "grenade" && grenadeCount >= 6) return KILL_REWARDS.knife;
  return KILL_REWARDS[weapon];
}
