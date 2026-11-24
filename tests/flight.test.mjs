import { describe, expect, it } from "vitest";
import {
  FLIGHT_RING_ALIGNMENT_RADIUS,
  FLIGHT_RING_COURSE,
  isFlightRingAligned,
} from "../src/flight.ts";

describe("shuttle flight course", () => {
  it("requires the player to steer inside each ring's alignment radius", () => {
    expect(FLIGHT_RING_COURSE).toHaveLength(5);
    expect(isFlightRingAligned({ x: 0, y: 0 }, FLIGHT_RING_COURSE[0])).toBe(true);
    expect(isFlightRingAligned({ x: FLIGHT_RING_ALIGNMENT_RADIUS, y: 0 }, { x: 0, y: 0 })).toBe(
      true,
    );
    expect(isFlightRingAligned({ x: 1.36, y: 0 }, { x: 0, y: 0 })).toBe(false);
  });
});
