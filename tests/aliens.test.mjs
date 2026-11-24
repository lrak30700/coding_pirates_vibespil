import { describe, expect, it } from "vitest";
import { ALIEN_PROFILES, alienForSpawn, receiveAlienHit } from "../src/aliens.ts";

describe("alien roles", () => {
  it("uses distinct health, speed, damage, and range profiles", () => {
    expect(ALIEN_PROFILES.damage.bodyColor).toBe(0xa5354a);
    expect(ALIEN_PROFILES.damage.speed).toBeLessThan(ALIEN_PROFILES.speedy.speed);
    expect(ALIEN_PROFILES.damage.damage).toBeGreaterThan(ALIEN_PROFILES.speedy.damage);
    expect(ALIEN_PROFILES.speedy.bodyColor).toBe(0x2466a9);
    expect(ALIEN_PROFILES.speedy.speed).toBeGreaterThan(2);
    expect(ALIEN_PROFILES.shooter.bodyColor).toBe(0xb28a28);
    expect(ALIEN_PROFILES.shooter.range).toBeGreaterThan(ALIEN_PROFILES.damage.range);
    expect(ALIEN_PROFILES.shooter.damage).toBeLessThan(ALIEN_PROFILES.damage.damage);
    expect(ALIEN_PROFILES.tanky.bodyColor).toBe(0x713db0);
    expect(ALIEN_PROFILES.tanky.healthMultiplier).toBeGreaterThan(2);
    expect(ALIEN_PROFILES.tanky.damage).toBeGreaterThan(ALIEN_PROFILES.damage.damage);
    expect(ALIEN_PROFILES.tanky.speed).toBeLessThan(ALIEN_PROFILES.damage.speed);
  });

  it("introduces shooter and tank roles later in the campaign", () => {
    expect(alienForSpawn(0, 0)).toBe("damage");
    expect(alienForSpawn(0, 1)).toBe("speedy");
    expect(alienForSpawn(2, 2)).toBe("shooter");
    expect(alienForSpawn(4, 3)).toBe("tanky");
  });

  it("prevents simultaneous alien hits from stacking into an instant defeat", () => {
    const firstHit = receiveAlienHit(100, ALIEN_PROFILES.damage.damage, 1, 0);
    const overlappingHit = receiveAlienHit(
      firstHit.health,
      ALIEN_PROFILES.tanky.damage,
      1,
      firstHit.damageCooldown,
    );

    expect(firstHit.health).toBe(72);
    expect(firstHit.wasDamaged).toBe(true);
    expect(overlappingHit.health).toBe(firstHit.health);
    expect(overlappingHit.wasDamaged).toBe(false);
    expect(receiveAlienHit(overlappingHit.health, ALIEN_PROFILES.tanky.damage, 1, 0).health).toBe(
      36,
    );
  });
});
