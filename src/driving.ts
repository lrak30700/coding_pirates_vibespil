export type TrackPoint = { x: number; y: number; elevation?: number };
export type CarProfile = {
  id: string;
  name: string;
  category: string;
  price: number;
  acceleration: number;
  topSpeed: number;
  handling: number;
  width: number;
  length: number;
  body: "touring" | "rally" | "coupe" | "gt" | "hyper";
  paint: string;
};
export type TrackEnvironment = "coastal" | "canyon" | "alpine" | "forest" | "city" | "desert" | "volcanic";
export type DrivingTrack = {
  id: string;
  name: string;
  description: string;
  accent: string;
  roadWidth: number;
  unlockRank: number;
  environment: TrackEnvironment;
  points: TrackPoint[];
};
export type DrivingCar = {
  x: number;
  y: number;
  heading: number;
  speed: number;
  nitro: number;
  driftScore: number;
};
export type DrivingInput = {
  throttle: boolean;
  brake: boolean;
  steer: number;
  boost: boolean;
  drift: boolean;
};
export type DrivingUpgrades = { engine: number; tires: number; turbo: number };

export const CAR_CATALOG: CarProfile[] = [
  {
    id: "comet-gt",
    name: "Comet GT",
    category: "Club touring",
    price: 0,
    acceleration: 175,
    topSpeed: 300,
    handling: 1,
    width: 15,
    length: 31,
    body: "touring",
    paint: "#25c8af",
  },
  {
    id: "rally-sprinter",
    name: "Rally Sprinter",
    category: "Rally",
    price: 1400,
    acceleration: 188,
    topSpeed: 305,
    handling: 1.24,
    width: 16,
    length: 30,
    body: "rally",
    paint: "#ec814e",
  },
  {
    id: "velox-coupe",
    name: "Velox Coupe",
    category: "Sports",
    price: 2800,
    acceleration: 204,
    topSpeed: 335,
    handling: 1.08,
    width: 14,
    length: 33,
    body: "coupe",
    paint: "#5b98ef",
  },
  {
    id: "solstice-gt",
    name: "Solstice GT",
    category: "Grand touring",
    price: 4600,
    acceleration: 218,
    topSpeed: 350,
    handling: 0.96,
    width: 17,
    length: 36,
    body: "gt",
    paint: "#d0a04b",
  },
  {
    id: "hyperion-x",
    name: "Hyperion X",
    category: "Hypercar",
    price: 8500,
    acceleration: 250,
    topSpeed: 390,
    handling: 1.02,
    width: 15,
    length: 39,
    body: "hyper",
    paint: "#c75e8d",
  },
];

export const RALLY_RIVALS = [
  { name: "Nova", color: "#ff6c72", progressRate: 31 },
  { name: "Kite", color: "#5caaff", progressRate: 27 },
  { name: "Sol", color: "#ffc45e", progressRate: 23 },
];

const POINT_COUNT = 360;

function createTrack(
  id: string,
  name: string,
  description: string,
  accent: string,
  shape: (angle: number) => TrackPoint,
  environment: TrackEnvironment,
  unlockRank: number,
  elevation: (angle: number) => number = () => 0,
): DrivingTrack {
  return {
    id,
    name,
    description,
    accent,
    roadWidth: 150,
    unlockRank,
    environment,
    points: Array.from({ length: POINT_COUNT }, (_, index) =>
      {
        const angle = (index / POINT_COUNT) * Math.PI * 2;
        const point = shape(angle);
        return { ...point, elevation: elevation(angle) };
      },
    ),
  };
}

export const DRIVING_TRACKS: DrivingTrack[] = [
  createTrack(
    "apex",
    "Apex Circuit",
    "Wide high-speed bends and a forgiving first sector.",
    "#5cf1c7",
    (angle) => ({ x: 500 + 310 * Math.cos(angle), y: 350 + 220 * Math.sin(angle) }),
    "coastal",
    1,
  ),
  createTrack(
    "canyon",
    "Canyon Switchback",
    "Tight canyon bends with a fast central chicane.",
    "#ffb65c",
    (angle) => ({
      x: 500 + 290 * Math.cos(angle) + 32 * Math.sin(2 * angle),
      y: 350 + 198 * Math.sin(angle) + 30 * Math.sin(3 * angle),
    }),
    "canyon",
    2,
  ),
  createTrack(
    "aurora",
    "Aurora Ridge",
    "A flowing ridge route with a technical outer loop.",
    "#b894ff",
    (angle) => {
      const radius = 1 + 0.12 * Math.cos(5 * angle);
      return {
        x: 500 + 290 * radius * Math.cos(angle),
        y: 350 + 195 * radius * Math.sin(angle),
      };
    },
    "alpine",
    3,
    (angle) => 12 + 15 * Math.sin(2 * angle) + 8 * Math.sin(5 * angle),
  ),
  createTrack(
    "emerald-forest",
    "Emerald Forest",
    "A fast woodland loop with rolling elevation and narrow sightlines.",
    "#8be081",
    (angle) => ({
      x: 500 + 345 * Math.cos(angle) + 28 * Math.sin(3 * angle),
      y: 350 + 232 * Math.sin(angle) + 20 * Math.sin(4 * angle),
    }),
    "forest",
    3,
    (angle) => 5 + 9 * Math.sin(3 * angle) + 3 * Math.sin(7 * angle),
  ),
  createTrack(
    "harbor-run",
    "Harbor Run",
    "A technical waterfront course over bridges and container yards.",
    "#64c7ed",
    (angle) => ({
      x: 500 + 360 * Math.cos(angle) + 30 * Math.sin(5 * angle),
      y: 350 + 205 * Math.sin(angle) + 22 * Math.sin(2 * angle),
    }),
    "coastal",
    4,
    (angle) => 4 + 8 * Math.max(0, Math.sin(angle * 2)),
  ),
  createTrack(
    "metro-grand-prix",
    "Metro Grand Prix",
    "A high-speed city circuit threaded between illuminated towers.",
    "#f08cce",
    (angle) => ({
      x: 500 + 330 * Math.cos(angle) + 38 * Math.sin(2 * angle),
      y: 350 + 245 * Math.sin(angle) + 18 * Math.sin(5 * angle),
    }),
    "city",
    5,
  ),
  createTrack(
    "alpine-pass",
    "Alpine Pass",
    "A mountain pass with steep crests, tunnels and sweeping switchbacks.",
    "#b9d8ef",
    (angle) => ({
      x: 500 + 355 * Math.cos(angle) + 50 * Math.sin(3 * angle),
      y: 350 + 230 * Math.sin(angle) + 25 * Math.sin(5 * angle),
    }),
    "alpine",
    6,
    (angle) => 18 + 24 * Math.sin(angle) + 10 * Math.sin(4 * angle),
  ),
  createTrack(
    "red-dune",
    "Red Dune Rally",
    "A dusty desert route with broad drifts and a rugged canyon section.",
    "#e3a15e",
    (angle) => ({
      x: 500 + 380 * Math.cos(angle) + 44 * Math.sin(4 * angle),
      y: 350 + 220 * Math.sin(angle) + 32 * Math.sin(3 * angle),
    }),
    "desert",
    7,
    (angle) => 3 + 7 * Math.sin(2 * angle) + 3 * Math.sin(6 * angle),
  ),
  createTrack(
    "ember-caldera",
    "Ember Caldera",
    "A volcanic night race around lava-lit ridges and a long bridge.",
    "#ff7355",
    (angle) => ({
      x: 500 + 365 * Math.cos(angle) + 52 * Math.sin(3 * angle),
      y: 350 + 228 * Math.sin(angle) + 34 * Math.sin(5 * angle),
    }),
    "volcanic",
    8,
    (angle) => 14 + 17 * Math.sin(3 * angle) + 8 * Math.sin(6 * angle),
  ),
];

export function createDrivingCar(track: DrivingTrack): DrivingCar {
  const start = track.points[0]!;
  const next = track.points[1]!;
  return {
    x: start.x,
    y: start.y,
    heading: Math.atan2(next.y - start.y, next.x - start.x),
    speed: 0,
    nitro: 100,
    driftScore: 0,
  };
}

export function nearestTrackPointIndex(point: TrackPoint, track: DrivingTrack): number {
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < track.points.length; index += 1) {
    const candidate = track.points[index]!;
    const distance = Math.hypot(point.x - candidate.x, point.y - candidate.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }
  return nearestIndex;
}

export function distanceFromTrack(point: TrackPoint, track: DrivingTrack): number {
  const nearest = track.points[nearestTrackPointIndex(point, track)]!;
  return Math.hypot(point.x - nearest.x, point.y - nearest.y);
}

export function getRacePosition(progress: number, elapsedSeconds: number): number {
  const rivalsAhead = RALLY_RIVALS.filter(
    (_, index) => elapsedSeconds * RALLY_RIVALS[index]!.progressRate + index * 45 > progress,
  ).length;
  return rivalsAhead + 1;
}

export function getRaceReward(position: number, driftScore: number, elapsedSeconds: number): number {
  const podiumPrizes = [1000, 650, 350];
  const prize = podiumPrizes[position - 1];
  if (prize === undefined) return 0;
  const driftBonus = Math.floor(Math.max(0, driftScore) / 12);
  const timeBonus = Math.max(0, Math.floor((90 - elapsedSeconds) * 5));
  return prize + driftBonus + timeBonus;
}

export function stepDriving(
  car: DrivingCar,
  input: DrivingInput,
  elapsedSeconds: number,
  track: DrivingTrack,
  upgrades: DrivingUpgrades,
  profile: CarProfile = CAR_CATALOG[0]!,
): void {
  const dt = Math.max(0, Math.min(elapsedSeconds, 0.05));
  if (dt === 0) return;

  const boosting = input.boost && car.nitro > 0;
  const driftFactor = input.drift && Math.abs(car.speed) > 85 ? 1.45 : 1;
  const acceleration = profile.acceleration + upgrades.engine * 24;
  const maxSpeed =
    profile.topSpeed + upgrades.engine * 45 + (boosting ? 100 + upgrades.turbo * 18 : 0);

  if (input.throttle) car.speed += acceleration * (boosting ? 1.4 : 1) * dt;
  else if (input.brake) car.speed -= 310 * dt;
  else car.speed *= Math.max(0, 1 - dt * 0.52);
  car.speed = Math.max(-65, Math.min(maxSpeed, car.speed));

  const steeringAuthority = 0.25 + Math.min(Math.abs(car.speed) / 280, 0.8);
  car.heading +=
    input.steer *
    (1.8 + upgrades.tires * 0.1) *
    profile.handling *
    steeringAuthority *
    driftFactor *
    Math.sign(car.speed || 1) *
    dt;

  if (boosting) car.nitro = Math.max(0, car.nitro - (22 + upgrades.turbo * 2) * dt);
  else car.nitro = Math.min(100, car.nitro + (8 + upgrades.turbo) * dt);

  car.x += Math.cos(car.heading) * car.speed * dt;
  car.y += Math.sin(car.heading) * car.speed * dt;

  const distance = distanceFromTrack(car, track);
  const onRoad = distance <= track.roadWidth * 0.5;
  if (!onRoad) {
    car.speed *= Math.max(0, 1 - dt * 1.8);
    if (distance > track.roadWidth * 0.85) car.speed *= Math.max(0, 1 - dt * 2.4);
  } else if (input.drift && input.steer !== 0 && Math.abs(car.speed) > 85) {
    car.driftScore += Math.abs(car.speed * input.steer) * dt;
  }
}
