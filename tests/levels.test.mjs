import { describe, expect, it } from "vitest";
import { LEVELS } from "../src/levels.ts";

function isWalkable(map, x, y) {
  return ["0", "5", "6", "7", "8"].includes(map[Math.floor(y)]?.[Math.floor(x)]);
}

function reachable(map, start, target) {
  const width = map[0].length;
  const queue = [[Math.floor(start.x), Math.floor(start.y)]];
  const visited = new Set([`${queue[0][0]},${queue[0][1]}`]);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const [x, y] = queue[cursor];
    if (x === Math.floor(target.x) && y === Math.floor(target.y)) return true;
    for (const [nextX, nextY] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      const key = `${nextX},${nextY}`;
      if (
        nextX >= 0 &&
        nextY >= 0 &&
        nextX < width &&
        nextY < map.length &&
        isWalkable(map, nextX, nextY) &&
        !visited.has(key)
      ) {
        visited.add(key);
        queue.push([nextX, nextY]);
      }
    }
  }
  return false;
}

describe("campaign levels", () => {
  it("defines ten connected, room-based maps that grow through the campaign", () => {
    expect(LEVELS).toHaveLength(10);
    expect(new Set(LEVELS.map((level) => level.map.join("\n"))).size).toBe(10);
    expect(new Set(LEVELS.map((level) => JSON.stringify(level.palette))).size).toBe(10);

    for (const [index, level] of LEVELS.entries()) {
      expect(level.map).toHaveLength(58 + index * 5);
      expect(
        level.map.every(
          (row) => row.length === level.roomWidths.reduce((sum, width) => sum + width, 6),
        ),
      ).toBe(true);
      expect(level.floors).toHaveLength(2 + Math.floor(index / 3));
      expect(level.floors[0].map).toEqual(level.map);
      expect(
        level.floors.every(
          (floor) =>
            floor.map.length === level.map.length &&
            floor.map.every((row) => row.length === level.map[0].length),
        ),
      ).toBe(true);
      expect(level.roomWidths).toHaveLength(5);
      expect(
        level.roomWidths.every((width, room) => room === 0 || width > level.roomWidths[room - 1]),
      ).toBe(true);
      if (index > 0) {
        expect(
          level.roomWidths.every((width, room) => width > LEVELS[index - 1].roomWidths[room]),
        ).toBe(true);
      }
      expect(level.map.every((row) => /^[0-8]+$/.test(row))).toBe(true);
      expect(level.map.some((row) => row.includes("3"))).toBe(true);
      expect(
        level.map.flatMap((row) => [...row]).filter((tile) => tile === "5"),
        level.name,
      ).toHaveLength(4);
      const doorXs = [...level.map[0]]
        .map((_, x) => x)
        .filter((x) => level.map.some((row) => row[x] === "5"));
      const measuredRoomWidths = [
        doorXs[0] - 1,
        ...doorXs.slice(1).map((doorX, room) => doorX - doorXs[room] - 1),
        level.map[0].length - 2 - doorXs.at(-1),
      ];
      expect(measuredRoomWidths).toEqual(level.roomWidths);
      expect(level.map.some((row) => /[67]/.test(row))).toBe(true);
      expect(isWalkable(level.map, level.playerSpawn.x, level.playerSpawn.y)).toBe(true);
      expect(isWalkable(level.map, level.enemySpawn.x, level.enemySpawn.y)).toBe(true);
      expect(reachable(level.map, level.playerSpawn, level.enemySpawn)).toBe(true);
      for (const [floorIndex, floor] of level.floors.entries()) {
        expect(floor.map.every((row) => /^[0-8]+$/.test(row))).toBe(true);
        expect(isWalkable(floor.map, floor.entry.x, floor.entry.y)).toBe(true);
        if (floorIndex < level.floors.length - 1) {
          expect(floor.stairsUp.some((stair) => stair.targetFloor === floorIndex + 1)).toBe(true);
        }
        for (const stair of floor.stairsUp) {
          expect(stair.targetFloor).toBe(floorIndex + 1);
          expect(floor.map[Math.floor(stair.y)]?.[Math.floor(stair.x) - 1]).toBe("5");
          expect(
            Array.from(
              { length: 5 },
              (_, step) => floor.map[Math.floor(stair.y)]?.[stair.x + step],
            ),
          ).toEqual(["8", "8", "8", "8", "8"]);
          expect(reachable(floor.map, floor.entry, { x: stair.x + 0.5, y: stair.y + 0.5 })).toBe(
            true,
          );
          const nextFloor = level.floors[stair.targetFloor];
          expect(nextFloor).toBeDefined();
          expect(isWalkable(nextFloor.map, nextFloor.entry.x, nextFloor.entry.y)).toBe(true);
        }
      }
      expect(Object.values(level.comms).every((message) => message.length > 0)).toBe(true);
    }
  });
});
