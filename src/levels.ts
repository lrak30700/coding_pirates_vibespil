export type LevelDefinition = {
  name: string;
  map: readonly string[];
  floors: readonly LevelFloor[];
  roomFloors: readonly number[];
  palette: {
    background: number;
    fog: number;
    ground: number;
    wall: number;
    wallLight: number;
    cover: number;
    grid: number;
    accent: number;
  };
  playerSpawn: { x: number; y: number; angle: number };
  enemySpawn: { x: number; y: number };
  roomWidths: readonly number[];
  comms: { arrival: string; afterWave: string; clear: string };
};

export type LevelFloor = {
  name: string;
  map: readonly string[];
  entry: { x: number; y: number };
  stairsUp: readonly { x: number; y: number; targetFloor: number }[];
};

type Obstacle = readonly [x: number, y: number, tile?: "1" | "2" | "3" | "4"];
type BaseLevelDefinition = Omit<LevelDefinition, "floors" | "roomFloors">;

const ROOM_COUNT = 5;
export const FLOOR_HEIGHT = 4.2;
export const STAIR_RUN_LENGTH = 4.4;

function mapSize(levelIndex: number): { width: number; height: number } {
  const width = roomWidthsForLevel(levelIndex).reduce((sum, roomWidth) => sum + roomWidth, 6);
  return { width, height: 58 + levelIndex * 5 };
}

function roomWidthsForLevel(levelIndex: number): number[] {
  return [12, 16, 20, 24, 28].map((width) => width + levelIndex * 2);
}

function floorCountForLevel(levelIndex: number): number {
  return 2 + Math.floor(levelIndex / 3);
}

function roomFloorsForLevel(levelIndex: number): number[] {
  const floorCount = floorCountForLevel(levelIndex);
  return Array.from({ length: ROOM_COUNT }, (_, room) =>
    Math.floor((room * floorCount) / ROOM_COUNT),
  );
}

function roomDoorsForLevel(levelIndex: number): number[] {
  const doors: number[] = [];
  let x = 1;
  for (const width of roomWidthsForLevel(levelIndex).slice(0, ROOM_COUNT - 1)) {
    x += width;
    doors.push(x);
    x += 1;
  }
  return doors;
}

function createMap(
  obstacles: readonly Obstacle[],
  levelIndex: number,
  roomFloors: readonly number[] = roomFloorsForLevel(levelIndex),
  floorIndex = 0,
): readonly string[] {
  const { width, height } = mapSize(levelIndex);
  const rows: string[][] = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) =>
      x === 0 || y === 0 || x === width - 1 || y === height - 1 ? "1" : "0",
    ),
  );
  for (const [x, y, tile = "2"] of obstacles) {
    const scaledX = Math.max(1, Math.min(width - 2, 1 + Math.round(((x - 1) * (width - 3)) / 21)));
    const scaledY = Math.max(
      1,
      Math.min(height - 2, 1 + Math.round(((y - 1) * (height - 3)) / 15)),
    );
    rows[scaledY]![scaledX] = tile;
  }

  const roomDoors = roomDoorsForLevel(levelIndex);
  for (const doorX of roomDoors) {
    const doorY = Math.floor(height / 2);
    for (let y = 1; y < height - 1; y += 1) rows[y]![doorX] = "1";
    rows[doorY]![doorX] = "5";
  }

  const doorY = Math.floor(height / 2);
  const doorColumns = new Set(roomDoors);
  for (let room = 0; room < ROOM_COUNT - 1; room += 1) {
    if (roomFloors[room] !== floorIndex || roomFloors[room + 1] !== floorIndex + 1) continue;
    const stairX = roomDoors[room]! + 1;
    for (let y = doorY - 1; y <= doorY + 1; y += 1) {
      for (let x = stairX - 1; x <= stairX + 5; x += 1) {
        if (!doorColumns.has(x)) rows[y]![x] = "0";
      }
    }
    for (let step = 0; step < 5; step += 1) rows[doorY]![stairX + step] = "8";
  }
  const spawnX = Math.max(2, roomDoors[0]! - 2);
  const spawnY = Math.min(height - 3, doorY + 1);
  rows[spawnY]![spawnX] = "0";
  rows[doorY]![spawnX] = "0";
  rows[2]![2] = "0";
  rows[height - 3]![Math.floor(width / 2)] = "3";
  const featureRoom = 1 + (levelIndex % (ROOM_COUNT - 2));
  const roomStart = roomDoors[featureRoom - 1]! + 1;
  const roomEnd = roomDoors[featureRoom]!;
  const featureX = Math.floor((roomStart + roomEnd) / 2);
  const featureY = Math.max(2, height - 3 - (levelIndex % 4));
  rows[featureY]![featureX] = levelIndex % 2 === 0 ? "6" : "7";

  return rows.map((row) => row.join(""));
}

function addFloorLandmarks(
  rows: string[][],
  levelIndex: number,
  floorIndex: number,
  roomFloors: readonly number[],
): void {
  const doors = roomDoorsForLevel(levelIndex);
  const height = rows.length;
  for (let room = 0; room < ROOM_COUNT; room += 1) {
    const left = doors[room - 1] ?? 0;
    const right = doors[room] ?? rows[0]!.length - 1;
    const roomCenter = Math.floor((left + right) / 2);
    const hash = (seed: number) => {
      const value = Math.sin(seed * 127.1) * 43758.5453;
      return value - Math.floor(value);
    };
    const clusters = 2 + Math.floor(levelIndex / 3) + floorIndex;
    for (let cluster = 0; cluster < clusters; cluster += 1) {
      const seed =
        (levelIndex + 1) * 7919 + (floorIndex + 1) * 1049 + (room + 1) * 313 + cluster * 97;
      const width = Math.max(1, right - left - 6);
      const x = left + 3 + Math.floor(hash(seed) * width);
      const y = 4 + Math.floor(hash(seed + 11) * Math.max(1, height - 8));
      const tile = ["2", "3", "4", "6", "7"][Math.floor(hash(seed + 23) * 5)]!;
      rows[y]![x] = tile;
      if (hash(seed + 37) > 0.62 && x + 1 < right) {
        rows[y]![x + 1] = tile === "3" ? "2" : tile;
      }
    }

    const roomFloor = roomFloors[room] ?? 0;
    if (roomFloor === floorIndex) {
      const featureY = 3 + Math.floor((room * 7 + floorIndex * 5 + levelIndex) % (height - 6) || 1);
      rows[featureY]![roomCenter] = "3";
    }
  }
}

function createFloorMap(
  baseMap: readonly string[],
  levelIndex: number,
  floorIndex: number,
  roomFloors: readonly number[],
): Pick<LevelFloor, "map" | "entry" | "stairsUp"> {
  const rows = baseMap.map((row) => [...row]);
  const doors = roomDoorsForLevel(levelIndex);
  const doorColumns = new Set(doors);
  if (floorIndex > 0) {
    for (let y = 1; y < rows.length - 1; y += 1) {
      for (let x = 1; x < rows[y]!.length - 1; x += 1) {
        if (!doorColumns.has(x)) rows[y]![x] = "0";
      }
    }
    for (let room = 0; room < ROOM_COUNT; room += 1) {
      const left = doors[room - 1] ?? 0;
      const right = doors[room] ?? rows[0]!.length - 1;
      const mirrorX = (floorIndex + room) % 2 === 1;
      const mirrorY = (floorIndex + room) % 3 === 0;
      for (let y = 1; y < baseMap.length - 1; y += 1) {
        for (let x = left + 1; x < right; x += 1) {
          const tile = baseMap[y]?.[x];
          if (!tile || !["1", "2", "3", "4", "6", "7"].includes(tile)) continue;
          const targetX = mirrorX ? left + right - x : x;
          const targetY = mirrorY ? baseMap.length - 1 - y : y;
          if (targetX > left && targetX < right && targetY > 0 && targetY < rows.length - 1) {
            rows[targetY]![targetX] = tile;
          }
        }
      }
    }
  }

  addFloorLandmarks(rows, levelIndex, floorIndex, roomFloors);
  const doorY = Math.floor(rows.length / 2);
  const stairsUp: { x: number; y: number; targetFloor: number }[] = [];
  for (let room = 0; room < ROOM_COUNT - 1; room += 1) {
    if (roomFloors[room] === floorIndex && roomFloors[room + 1] === floorIndex + 1) {
      const stairX = doors[room]! + 1;
      for (let y = doorY - 1; y <= doorY + 1; y += 1) {
        for (let x = stairX - 1; x <= stairX + 5; x += 1) {
          if (!doorColumns.has(x)) rows[y]![x] = "0";
        }
      }
      for (let step = 0; step < 5; step += 1) rows[doorY]![stairX + step] = "8";
      stairsUp.push({ x: stairX, y: doorY, targetFloor: floorIndex + 1 });
    }
  }

  let entry: { x: number; y: number };
  if (floorIndex === 0) {
    rows[2]![2] = "0";
    entry = { x: standardSpawn.x, y: standardSpawn.y };
  } else {
    const entryRoom = roomFloors.indexOf(floorIndex);
    const entryDoor = doors[entryRoom - 1];
    if (entryDoor === undefined) throw new Error(`Floor ${floorIndex} has no entrance door.`);
    const stairX = entryDoor + 1;
    const entryX = stairX + STAIR_RUN_LENGTH + 0.6;
    for (let y = doorY - 1; y <= doorY + 1; y += 1) {
      for (let x = entryX - 1; x <= entryX + 1; x += 1) {
        if (!doorColumns.has(x)) rows[y]![x] = "0";
      }
    }
    entry = { x: entryX, y: doorY + 0.5 };
  }

  return { map: rows.map((row) => row.join("")), entry, stairsUp };
}

function createFloors(
  baseMap: readonly string[],
  levelIndex: number,
  roomFloors: readonly number[],
): LevelFloor[] {
  const floorNames = ["Ground deck", "Upper deck", "Skybridge", "Crown deck"];
  return Array.from({ length: floorCountForLevel(levelIndex) }, (_, floorIndex) => {
    return {
      name: floorNames[floorIndex] ?? `Deck ${floorIndex + 1}`,
      ...createFloorMap(baseMap, levelIndex, floorIndex, roomFloors),
    };
  });
}

const standardSpawn = { x: 2.5, y: 2.5, angle: Math.PI / 2 };
const enemySpawnForLevel = (levelIndex: number) => {
  const { height } = mapSize(levelIndex);
  return {
    x: roomDoorsForLevel(levelIndex)[0]! - 1.5,
    y: Math.floor(height / 2) + 0.5,
  };
};

const BASE_LEVELS: readonly BaseLevelDefinition[] = [
  {
    name: "Horizon Fall",
    roomWidths: roomWidthsForLevel(0),
    map: createMap(
      [
        [5, 4],
        [6, 4],
        [5, 5],
        [16, 4],
        [17, 4],
        [16, 5],
        [9, 8],
        [9, 9],
        [10, 9],
        [14, 10],
        [14, 11],
        [4, 12],
        [5, 12],
        [18, 12],
        [19, 12],
        [11, 14],
        [8, 6, "4"],
        [15, 13, "3"],
      ],
      0,
    ),
    palette: {
      background: 0x091725,
      fog: 0x142932,
      ground: 0x17292c,
      wall: 0x294457,
      wallLight: 0x66c6d3,
      cover: 0x6c654e,
      grid: 0x43a59e,
      accent: 0x62f5d2,
    },
    playerSpawn: standardSpawn,
    enemySpawn: enemySpawnForLevel(0),
    comms: {
      arrival:
        "Pilot Rook, Earth Control. Your lander missed the ridge by 400 meters. Nacre's relay is still broadcasting; follow its pulse.",
      afterWave:
        "That distress call is six hours old. The colony life-signs just changed direction—toward you.",
      clear:
        "The trace is bouncing through our relay, not the colony beacon. Reach the ridge repeater; we'll keep listening.",
    },
  },
  {
    name: "Relay Canyon",
    roomWidths: roomWidthsForLevel(1),
    map: createMap(
      [
        [5, 3],
        [5, 4],
        [5, 5],
        [5, 6],
        [5, 7],
        [5, 8],
        [11, 4],
        [12, 4],
        [13, 4],
        [14, 4],
        [14, 5],
        [14, 6],
        [8, 10],
        [8, 11],
        [8, 12],
        [16, 10],
        [17, 10],
        [18, 10],
        [19, 10],
        [19, 11],
        [19, 12],
        [10, 4, "1"],
        [10, 5, "1"],
        [10, 6, "1"],
        [10, 7, "1"],
        [10, 8, "1"],
        [21, 12, "3"],
      ],
      1,
    ),
    palette: {
      background: 0x241d19,
      fog: 0x51402c,
      ground: 0x302a22,
      wall: 0x64503b,
      wallLight: 0xe3aa64,
      cover: 0x756243,
      grid: 0xc48143,
      accent: 0xffc06d,
    },
    playerSpawn: standardSpawn,
    enemySpawn: enemySpawnForLevel(1),
    comms: {
      arrival:
        "Repeater confirms the colony beacon was powered down before impact. Someone rerouted the distress signal.",
      afterWave:
        "We found a maintenance log: Dr. Sato sealed the lower station from inside. The lock opened after your approach.",
      clear:
        "A second carrier is nested under our own. The source is below the crater; head for the research annex.",
    },
  },
  {
    name: "The Quiet Annex",
    roomWidths: roomWidthsForLevel(2),
    map: createMap(
      [
        [7, 3],
        [7, 4],
        [7, 5],
        [7, 6],
        [7, 7],
        [7, 8],
        [15, 3],
        [15, 4],
        [15, 5],
        [15, 6],
        [15, 7],
        [15, 8],
        [4, 10],
        [5, 10],
        [6, 10],
        [10, 11],
        [11, 11],
        [12, 11],
        [18, 12],
        [19, 12],
        [20, 12],
        [11, 5],
        [11, 4, "1"],
        [11, 6, "1"],
        [11, 7, "1"],
        [11, 8, "1"],
        [4, 6, "3"],
        [19, 6, "4"],
      ],
      2,
    ),
    palette: {
      background: 0x0b1528,
      fog: 0x182b48,
      ground: 0x151f32,
      wall: 0x394d69,
      wallLight: 0x8cbcf2,
      cover: 0x4d6374,
      grid: 0x4ba7cf,
      accent: 0x8cbcf2,
    },
    playerSpawn: standardSpawn,
    enemySpawn: enemySpawnForLevel(2),
    comms: {
      arrival:
        "Nacre research annex. The team studied a signal under the ice; no evacuation was ever logged.",
      afterWave:
        "Dr. Sato's recording says it copies voices, but only after hearing them. Keep your comms short.",
      clear:
        "We've heard our own transmissions played back with a delay. The transit hub can isolate the source.",
    },
  },
  {
    name: "Last Transit",
    roomWidths: roomWidthsForLevel(3),
    map: createMap(
      [
        [5, 4],
        [6, 4],
        [7, 4],
        [16, 4],
        [17, 4],
        [18, 4],
        [5, 5],
        [18, 5],
        [5, 6],
        [18, 6],
        [10, 7],
        [11, 7],
        [12, 7],
        [13, 7],
        [4, 10],
        [5, 10],
        [6, 10],
        [17, 10],
        [18, 10],
        [19, 10],
        [4, 11],
        [19, 11],
        [9, 6, "4"],
        [14, 6, "4"],
        [9, 11, "4"],
        [14, 11, "4"],
        [11, 12, "3"],
      ],
      3,
    ),
    palette: {
      background: 0x22131a,
      fog: 0x3c202a,
      ground: 0x281e21,
      wall: 0x5c3741,
      wallLight: 0xf58a70,
      cover: 0x696052,
      grid: 0xd46b71,
      accent: 0xff8a70,
    },
    playerSpawn: standardSpawn,
    enemySpawn: enemySpawnForLevel(3),
    comms: {
      arrival:
        "Transit hub ahead. The evacuation shuttle never launched. We're seeing movement in the tunnel cameras.",
      afterWave:
        "The copies are using your call sign now. It isn't the colony speaking—it's learning our chain of command.",
      clear:
        "You're close. Our uplink is being echoed from inside the spire. Disconnect it manually.",
    },
  },
  {
    name: "Signal Spire",
    roomWidths: roomWidthsForLevel(4),
    map: createMap(
      [
        [10, 3],
        [11, 3],
        [12, 3],
        [10, 4],
        [12, 4],
        [10, 5],
        [12, 5],
        [10, 6],
        [12, 6],
        [6, 8],
        [7, 8],
        [8, 8],
        [14, 8],
        [15, 8],
        [16, 8],
        [6, 9],
        [16, 9],
        [6, 10],
        [16, 10],
        [6, 11],
        [16, 11],
        [10, 13],
        [11, 13],
        [12, 13],
        [11, 7, "3"],
        [11, 8, "3"],
        [11, 9, "3"],
      ],
      4,
    ),
    palette: {
      background: 0x171326,
      fog: 0x28203f,
      ground: 0x211d30,
      wall: 0x403956,
      wallLight: 0xc297ff,
      cover: 0x655b78,
      grid: 0xa881e8,
      accent: 0xc297ff,
    },
    playerSpawn: standardSpawn,
    enemySpawn: enemySpawnForLevel(4),
    comms: {
      arrival:
        "Spire core. Your last transmission reached us before you sent it. We can't trust the return channel.",
      afterWave:
        "We traced the carrier to the core. It needs a live relay; destroy the resonator and the loop should collapse.",
      clear:
        "Carrier lost. Nacre is quiet. Extraction is inbound. Rook, Earth heard you this time.",
    },
  },
  {
    name: "Glass Prairie",
    roomWidths: roomWidthsForLevel(5),
    map: createMap(
      [
        [6, 4],
        [7, 4],
        [17, 4],
        [18, 4],
        [11, 6],
        [12, 6],
        [13, 6],
        [4, 8],
        [4, 9],
        [19, 8],
        [19, 9],
        [8, 12],
        [9, 12],
        [15, 12],
        [16, 12],
        [11, 14],
        [12, 14],
        [12, 4, "3"],
        [5, 11, "4"],
        [18, 11, "4"],
      ],
      5,
    ),
    palette: {
      background: 0x102325,
      fog: 0x31534a,
      ground: 0x203833,
      wall: 0x3c6257,
      wallLight: 0x94e6bd,
      cover: 0x6f8466,
      grid: 0x66d5a6,
      accent: 0x94e6bd,
    },
    playerSpawn: standardSpawn,
    enemySpawn: enemySpawnForLevel(5),
    comms: {
      arrival:
        "Rook, your signal came back from the prairie before we received it. We are switching to one-way bursts.",
      afterWave:
        "The field sensors show the copies moving between cover, not toward the relay. They are watching your route.",
      clear:
        "We found a second evacuation beacon in the western habitat. It may have a surviving power cell.",
    },
  },
  {
    name: "Flooded Hab",
    roomWidths: roomWidthsForLevel(6),
    map: createMap(
      [
        [5, 4],
        [5, 5],
        [5, 6],
        [5, 7],
        [9, 4],
        [10, 4],
        [11, 4],
        [14, 7],
        [14, 8],
        [14, 9],
        [14, 10],
        [18, 4],
        [18, 5],
        [18, 6],
        [8, 12],
        [9, 12],
        [10, 12],
        [16, 13],
        [17, 13],
        [18, 13],
        [12, 9],
        [12, 10],
        [12, 3, "1"],
        [12, 4, "1"],
        [12, 5, "1"],
        [12, 6, "1"],
        [12, 12, "4"],
        [20, 11, "3"],
      ],
      6,
    ),
    palette: {
      background: 0x10202b,
      fog: 0x1d4858,
      ground: 0x17323d,
      wall: 0x315b6a,
      wallLight: 0x70d7e5,
      cover: 0x476d71,
      grid: 0x48bfd0,
      accent: 0x70d7e5,
    },
    playerSpawn: standardSpawn,
    enemySpawn: enemySpawnForLevel(6),
    comms: {
      arrival:
        "Habitat pressure doors are cycling on their own. Keep to the dry maintenance path and watch the side rooms.",
      afterWave:
        "The power cell is still here, but the access log shows it was carried toward the crater after the breach.",
      clear:
        "We can hear the carrier through the cell now. It is not a voice recording; it is answering us in real time.",
    },
  },
  {
    name: "Ashen Crater",
    roomWidths: roomWidthsForLevel(7),
    map: createMap(
      [
        [11, 3],
        [12, 3],
        [13, 3],
        [8, 5],
        [9, 5],
        [10, 5],
        [14, 5],
        [15, 5],
        [16, 5],
        [6, 8],
        [7, 8],
        [17, 8],
        [18, 8],
        [8, 11],
        [9, 11],
        [10, 11],
        [14, 11],
        [15, 11],
        [16, 11],
        [11, 14],
        [12, 14],
        [13, 14],
        [12, 8, "3"],
        [7, 9, "4"],
        [17, 9, "4"],
      ],
      7,
    ),
    palette: {
      background: 0x291b17,
      fog: 0x68402c,
      ground: 0x39271f,
      wall: 0x694838,
      wallLight: 0xe59a57,
      cover: 0x786046,
      grid: 0xd07b45,
      accent: 0xe59a57,
    },
    playerSpawn: standardSpawn,
    enemySpawn: enemySpawnForLevel(7),
    comms: {
      arrival:
        "Crater perimeter. The power cell is feeding something below the impact shelf. We are losing the uplink again.",
      afterWave:
        "The carrier has stopped copying us. It is transmitting a location—deep inside the old signal vault.",
      clear:
        "Rook, do not trust any voice using our call signs. The vault door is open; proceed only on your own eyes.",
    },
  },
  {
    name: "Echo Vault",
    roomWidths: roomWidthsForLevel(8),
    map: createMap(
      [
        [6, 3],
        [7, 3],
        [8, 3],
        [15, 3],
        [16, 3],
        [17, 3],
        [6, 4],
        [17, 4],
        [6, 5],
        [17, 5],
        [6, 6],
        [17, 6],
        [10, 7],
        [11, 7],
        [12, 7],
        [13, 7],
        [10, 10],
        [13, 10],
        [10, 11],
        [13, 11],
        [10, 12],
        [11, 12],
        [12, 12],
        [13, 12],
        [11, 9, "3"],
        [12, 9, "3"],
        [11, 10, "3"],
        [12, 10, "3"],
      ],
      8,
    ),
    palette: {
      background: 0x171d29,
      fog: 0x303b50,
      ground: 0x202a36,
      wall: 0x414f62,
      wallLight: 0xb5c9db,
      cover: 0x596875,
      grid: 0x6ca7c5,
      accent: 0xb5c9db,
    },
    playerSpawn: standardSpawn,
    enemySpawn: enemySpawnForLevel(8),
    comms: {
      arrival:
        "Vault interior. Our instruments are receiving a perfect copy of the command channel from somewhere ahead.",
      afterWave:
        "We found the original colony distress burst. It ended before the lander arrived. Everything since then is an imitation.",
      clear:
        "The relay is connected to the spire core. Cut the loop and the signal should have nowhere left to hide.",
    },
  },
  {
    name: "Homebound",
    roomWidths: roomWidthsForLevel(9),
    map: createMap(
      [
        [5, 4],
        [6, 4],
        [7, 4],
        [16, 4],
        [17, 4],
        [18, 4],
        [5, 5],
        [18, 5],
        [5, 6],
        [18, 6],
        [9, 8],
        [10, 8],
        [11, 8],
        [12, 8],
        [13, 8],
        [14, 8],
        [7, 12],
        [8, 12],
        [9, 12],
        [14, 12],
        [15, 12],
        [16, 12],
        [11, 14],
        [12, 14],
        [9, 6, "4"],
        [14, 6, "4"],
        [9, 10, "4"],
        [14, 10, "4"],
        [11, 6, "3"],
        [12, 6, "3"],
      ],
      9,
    ),
    palette: {
      background: 0x10221f,
      fog: 0x28504b,
      ground: 0x1d3430,
      wall: 0x36554d,
      wallLight: 0x86d9b0,
      cover: 0x606d4d,
      grid: 0x52cfad,
      accent: 0x86d9b0,
    },
    playerSpawn: standardSpawn,
    enemySpawn: enemySpawnForLevel(9),
    comms: {
      arrival:
        "Final approach. The extraction beacon is live. Rook, Earth is listening—but only to your direct transmission.",
      afterWave:
        "Carrier activity is collapsing. Stay on the extraction path; the return channel is finally quiet.",
      clear:
        "Extraction confirmed. Nacre is silent, and your last message came through unchanged. Welcome home, Rook.",
    },
  },
];

export const LEVELS: readonly LevelDefinition[] = BASE_LEVELS.map((level, index) => {
  const roomFloors = roomFloorsForLevel(index);
  const floors = createFloors(level.map, index, roomFloors);
  return { ...level, map: floors[0]!.map, floors, roomFloors };
});
