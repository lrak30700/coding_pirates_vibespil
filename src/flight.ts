export type FlightPoint = { x: number; y: number };

export const FLIGHT_RING_COURSE: readonly FlightPoint[] = [
  { x: 0, y: 0 },
  { x: 1.15, y: 0.6 },
  { x: -1.2, y: 0.85 },
  { x: 1.45, y: -0.75 },
  { x: -0.85, y: -0.55 },
];

export const FLIGHT_RING_ALIGNMENT_RADIUS = 1.35;

export function isFlightRingAligned(player: FlightPoint, ring: FlightPoint): boolean {
  return Math.hypot(player.x - ring.x, player.y - ring.y) <= FLIGHT_RING_ALIGNMENT_RADIUS;
}
