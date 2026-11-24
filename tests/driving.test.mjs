import { describe, expect, it } from "vitest";
import {
  createDrivingCar,
  distanceFromTrack,
  DRIVING_TRACKS,
  getRacePosition,
  getRaceReward,
  stepDriving,
} from "../src/driving.ts";

describe("Nebula Rally driving model", () => {
  it("provides distinct circuits and starts the car on the selected route", () => {
    expect(DRIVING_TRACKS).toHaveLength(3);
    expect(new Set(DRIVING_TRACKS.map(({ name }) => name)).size).toBe(3);
    const track = DRIVING_TRACKS[1];
    const car = createDrivingCar(track);
    expect(distanceFromTrack(car, track)).toBeLessThan(1);
    expect(car.nitro).toBe(100);
  });

  it("accelerates, steers, boosts, and recovers nitro while off throttle", () => {
    const track = DRIVING_TRACKS[0];
    const car = createDrivingCar(track);
    const upgrades = { engine: 0, tires: 0, turbo: 0 };
    stepDriving(
      car,
      { throttle: true, brake: false, steer: 0, boost: true, drift: false },
      0.05,
      track,
      upgrades,
    );
    expect(car.speed).toBeGreaterThan(0);
    expect(car.nitro).toBeLessThan(100);

    const startingHeading = car.heading;
    stepDriving(
      car,
      { throttle: true, brake: false, steer: 1, boost: false, drift: true },
      0.05,
      track,
      upgrades,
    );
    expect(car.heading).toBeGreaterThan(startingHeading);
    expect(car.nitro).toBeGreaterThan(0);
  });

  it("reduces speed when the car leaves the road", () => {
    const track = DRIVING_TRACKS[0];
    const car = { ...createDrivingCar(track), x: 70, y: 80, speed: 220 };
    stepDriving(
      car,
      { throttle: false, brake: false, steer: 0, boost: false, drift: false },
      0.05,
      track,
      { engine: 0, tires: 0, turbo: 0 },
    );
    expect(car.speed).toBeLessThan(220);
  });

  it("calculates race placement and pays podium finishes with performance bonuses", () => {
    expect(getRacePosition(200, 0)).toBe(1);
    expect(getRacePosition(200, 5)).toBe(2);
    expect(getRaceReward(1, 24, 80)).toBe(1052);
    expect(getRaceReward(3, 0, 120)).toBe(350);
    expect(getRaceReward(4, 5000, 10)).toBe(0);
  });
});
