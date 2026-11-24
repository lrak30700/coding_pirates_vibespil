import * as THREE from "three";
import { ALIEN_PROFILES, type AlienKind } from "./aliens";
import type { FlightPoint } from "./flight";
import { FLOOR_HEIGHT, type LevelFloor } from "./levels";

export type SceneEnemy = {
  kind: AlienKind;
  x: number;
  y: number;
  floor: number;
  hp: number;
  maxHp: number;
  bob: number;
  attackWindup: number;
  dropHeight: number;
};
export type ScenePalette = {
  background: number;
  fog: number;
  ground: number;
  wall: number;
  wallLight: number;
  cover: number;
  grid: number;
  accent: number;
};
export type SceneGrenade = {
  x: number;
  y: number;
  floor: number;
  height: number;
  fuse: number;
};
export type SceneCoin = {
  x: number;
  y: number;
  floor: number;
  amount: number;
};
export type ScenePlayer = {
  x: number;
  y: number;
  floor: number;
  angle: number;
  pitch: number;
  jumpHeight: number;
  stairHeight: number;
};
export type SceneFlight = {
  playerX: number;
  playerY: number;
  ring: FlightPoint | null;
  distance: number;
};

type AlienRig = {
  group: THREE.Group;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  healthFill: THREE.Mesh;
  warningLight: THREE.PointLight;
};

type AlienStyle = {
  body: THREE.MeshStandardMaterial;
  highlight: THREE.MeshStandardMaterial;
  eye: THREE.MeshStandardMaterial;
  accent: number;
};

type DoorRig = { group: THREE.Group; leaf: THREE.Group };

function material(color: number, options: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.72, ...options });
}

function alienStyle(kind: AlienKind): AlienStyle {
  const profile = ALIEN_PROFILES[kind];
  return {
    body: material(profile.bodyColor, { roughness: 0.4, metalness: 0.12 }),
    highlight: material(profile.highlightColor, {
      roughness: 0.32,
      emissive: profile.accentColor,
      emissiveIntensity: 0.35,
    }),
    eye: material(profile.eyeColor, {
      emissive: profile.accentColor,
      emissiveIntensity: 1.15,
    }),
    accent: profile.accentColor,
  };
}

function box(
  parent: THREE.Object3D,
  size: [number, number, number],
  position: [number, number, number],
  surface: THREE.Material,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), surface);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function sphere(
  parent: THREE.Object3D,
  size: [number, number, number],
  position: [number, number, number],
  surface: THREE.Material,
) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), surface);
  mesh.scale.set(...size);
  mesh.position.set(...position);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function cylinder(
  parent: THREE.Object3D,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  position: [number, number, number],
  surface: THREE.Material,
  rotation: [number, number, number] = [0, 0, 0],
) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 12),
    surface,
  );
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

export class GameScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly flightBackground = new THREE.Color(0x040a18);
  private readonly deckTexture: THREE.CanvasTexture;
  private readonly arenaGroup = new THREE.Group();
  private readonly beaconGroup = new THREE.Group();
  private readonly extractionGroup = new THREE.Group();
  private readonly ufoGroup = new THREE.Group();
  private readonly flightGroup = new THREE.Group();
  private readonly flightRingGroup = new THREE.Group();
  private readonly flightCockpitGroup = new THREE.Group();
  private readonly camera = new THREE.PerspectiveCamera(72, 1, 0.08, 90);
  private readonly sun = new THREE.DirectionalLight(0xffe6bf, 3.2);
  private readonly beaconMaterial = new THREE.MeshBasicMaterial({ color: 0x91fff1 });
  private readonly coinMaterial = new THREE.MeshBasicMaterial({ color: 0xffc857 });
  private readonly coinHighlightMaterial = new THREE.MeshBasicMaterial({ color: 0xfff0a3 });
  private readonly aliens = new Map<SceneEnemy, AlienRig>();
  private readonly grenades = new Map<SceneGrenade, THREE.Group>();
  private readonly coins = new Map<SceneCoin, THREE.Group>();
  private readonly doors = new Map<string, DoorRig>();
  private readonly weapon = new THREE.Group();
  private readonly muzzle: THREE.PointLight;
  private readonly flightRingMaterial = new THREE.MeshBasicMaterial({
    color: 0x5df4e0,
    side: THREE.DoubleSide,
  });
  private readonly flightRingHighlightMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd77b,
    side: THREE.DoubleSide,
  });
  private flightStars: THREE.Points | null = null;
  private lastFlightTime = 0;
  private readonly weaponMaterials = {
    dark: material(0x172b3a, { metalness: 0.65, roughness: 0.34 }),
    steel: material(0x7d9bac, { metalness: 0.78, roughness: 0.25 }),
    grip: material(0x151c24, { roughness: 0.88 }),
    panel: material(0x29495a, { metalness: 0.48, roughness: 0.4 }),
    edge: material(0xc0d4d7, { metalness: 0.82, roughness: 0.22 }),
    glow: material(0x44f0d0, { emissive: 0x16a995, emissiveIntensity: 1.8 }),
    glass: new THREE.MeshBasicMaterial({ color: 0x6cf8ed }),
    grenade: material(0x77865a, { metalness: 0.38, roughness: 0.52 }),
  };
  private weaponKind = "";
  private mapWidth = 16;
  private mapHeight = 12;
  private floorCount = 1;
  private levelAccent = 0x62f5d2;
  private readonly materials = {
    wall: material(0x294457, { roughness: 0.78 }),
    wallLight: material(0x66c6d3, { emissive: 0x17606b, emissiveIntensity: 0.75 }),
    wallPanel: material(0x355c6c, {
      metalness: 0.62,
      roughness: 0.35,
      emissive: 0x14505f,
      emissiveIntensity: 0.5,
    }),
    cover: material(0x6c654e, { roughness: 0.9 }),
    landmark: material(0x62f5d2, {
      metalness: 0.35,
      emissive: 0x1b8c76,
      emissiveIntensity: 1.1,
    }),
    rail: material(0x233d48, { metalness: 0.55, roughness: 0.4 }),
    grid: new THREE.LineBasicMaterial({ color: 0x43a59e, transparent: true, opacity: 0.22 }),
    metal: material(0xc29d53, { metalness: 0.75, roughness: 0.28 }),
    ground: material(0x17292c, { roughness: 0.88, side: THREE.DoubleSide }),
    roof: material(0x1a303d, {
      metalness: 0.64,
      roughness: 0.42,
      emissive: 0x0d1d2c,
      emissiveIntensity: 0.55,
    }),
    stairTread: material(0x263e49, { metalness: 0.66, roughness: 0.42 }),
    stairEdge: material(0x56dccc, {
      metalness: 0.35,
      emissive: 0x1c9f8c,
      emissiveIntensity: 1.1,
    }),
    door: material(0x325d6b, { metalness: 0.7, roughness: 0.3 }),
    doorGlow: material(0x39e3dc, { emissive: 0x147f7a, emissiveIntensity: 1.2 }),
    ship: material(0x314858, { metalness: 0.76, roughness: 0.27 }),
    canopy: material(0x62d9ef, { metalness: 0.28, roughness: 0.16, emissive: 0x0d5365 }),
  };
  private readonly alienStyles: Record<AlienKind, AlienStyle> = {
    damage: alienStyle("damage"),
    speedy: alienStyle("speedy"),
    shooter: alienStyle("shooter"),
    tanky: alienStyle("tanky"),
  };

  constructor(canvas: HTMLCanvasElement) {
    this.deckTexture = this.createDeckTexture();
    this.materials.ground.map = this.deckTexture;
    this.materials.ground.needsUpdate = true;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.scene.background = new THREE.Color(0x091725);
    this.scene.fog = new THREE.Fog(0x142932, 12, 31);

    this.camera.rotation.order = "YXZ";
    this.scene.add(
      this.camera,
      this.arenaGroup,
      this.beaconGroup,
      this.extractionGroup,
      this.ufoGroup,
      this.flightGroup,
    );
    this.flightGroup.visible = false;
    this.buildFlightDisplay();
    this.buildLighting();
    this.buildUfo();
    this.buildWeapon("rifle");
    this.muzzle = new THREE.PointLight(0xffc475, 0, 3.4, 2);
    this.muzzle.position.set(0.08, -0.02, -0.82);
    this.camera.add(this.muzzle);
    this.resize(canvas.clientWidth || 1280, canvas.clientHeight || 720);
  }

  private createDeckTexture(): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The browser could not create the floor texture canvas.");
    context.fillStyle = "#edf2ef";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "rgba(12, 31, 44, 0.32)";
    context.lineWidth = 3;
    context.strokeRect(3, 3, 122, 122);
    context.beginPath();
    context.moveTo(64, 3);
    context.lineTo(64, 125);
    context.moveTo(3, 64);
    context.lineTo(125, 64);
    context.stroke();
    context.fillStyle = "rgba(12, 31, 44, 0.44)";
    for (const [x, y] of [
      [10, 10],
      [118, 10],
      [10, 118],
      [118, 118],
      [71, 71],
    ] as const) {
      context.beginPath();
      context.arc(x, y, 2.2, 0, Math.PI * 2);
      context.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  loadLevel(floors: readonly LevelFloor[], palette: ScenePalette): void {
    const firstFloor = floors[0];
    if (!firstFloor) throw new Error("Cannot load a level without at least one floor.");
    const map = firstFloor.map;
    this.mapWidth = map[0]?.length ?? 0;
    this.mapHeight = map.length;
    if (
      this.mapWidth === 0 ||
      floors.some(
        (floor) =>
          floor.map.length !== this.mapHeight ||
          floor.map.some((row) => row.length !== this.mapWidth),
      )
    ) {
      throw new Error("Cannot load floors with empty, uneven, or mismatched maps.");
    }
    this.floorCount = floors.length;
    this.deckTexture.repeat.set(this.mapWidth / 4, this.mapHeight / 4);
    this.deckTexture.needsUpdate = true;
    this.disposeGroup(this.arenaGroup);
    this.disposeGroup(this.extractionGroup);
    this.doors.clear();
    this.scene.background = new THREE.Color(palette.background);
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.setHex(palette.fog);
    this.materials.ground.color.setHex(palette.ground);
    this.materials.wall.color.setHex(palette.wall);
    this.materials.wallLight.color.setHex(palette.wallLight);
    this.materials.wallPanel.color.setHex(palette.wallLight);
    this.materials.wallPanel.emissive.setHex(palette.accent);
    this.materials.cover.color.setHex(palette.cover);
    this.materials.grid.color.setHex(palette.grid);
    this.materials.roof.color.setHex(palette.wall);
    this.materials.roof.emissive.setHex(palette.background);
    this.materials.stairEdge.color.setHex(palette.accent);
    this.materials.stairEdge.emissive.setHex(palette.accent);
    this.materials.landmark.color.setHex(palette.accent);
    this.materials.landmark.emissive.setHex(palette.accent);
    this.beaconMaterial.color.setHex(palette.accent);
    this.levelAccent = palette.accent;
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near = Math.min(this.mapWidth, this.mapHeight) * 0.75;
      this.scene.fog.far = Math.max(this.mapWidth, this.mapHeight) * 2.6;
    }
    this.sun.position.set(this.mapWidth * 0.35, 18, this.mapHeight * 0.25);
    this.sun.shadow.camera.left = -this.mapWidth / 2;
    this.sun.shadow.camera.right = this.mapWidth / 2;
    this.sun.shadow.camera.top = this.mapHeight / 2;
    this.sun.shadow.camera.bottom = -this.mapHeight / 2;
    this.sun.shadow.camera.updateProjectionMatrix();
    this.lastFlightTime = 0;
    this.buildBeacons();
    this.buildArena(floors);
    this.buildShuttle();
  }

  private buildFlightDisplay(): void {
    const outerRing = new THREE.Mesh(
      new THREE.TorusGeometry(2.15, 0.12, 12, 64),
      this.flightRingMaterial,
    );
    const innerRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.86, 0.035, 8, 64),
      this.flightRingHighlightMaterial,
    );
    this.flightRingGroup.add(outerRing, innerRing);
    this.flightGroup.add(this.flightRingGroup);

    const positions = new Float32Array(180 * 3);
    for (let index = 0; index < 180; index += 1) {
      positions[index * 3] = ((index * 73) % 400) / 10 - 20;
      positions[index * 3 + 1] = ((index * 127) % 300) / 10 - 15;
      positions[index * 3 + 2] = -10 - ((index * 47) % 900) / 10;
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.flightStars = new THREE.Points(
      starGeometry,
      new THREE.PointsMaterial({
        color: 0xb9e8ff,
        size: 0.075,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
      }),
    );
    this.flightGroup.add(this.flightStars);

    const cockpitPanel = material(0x142632, { metalness: 0.72, roughness: 0.36 });
    const cockpitGlow = new THREE.MeshBasicMaterial({ color: 0x48dfcf });
    box(this.flightCockpitGroup, [1.32, 0.18, 0.3], [0, -0.69, -1.02], cockpitPanel);
    box(this.flightCockpitGroup, [0.11, 0.76, 0.15], [-0.82, -0.26, -0.92], cockpitPanel);
    box(this.flightCockpitGroup, [0.11, 0.76, 0.15], [0.82, -0.26, -0.92], cockpitPanel);
    box(this.flightCockpitGroup, [0.36, 0.025, 0.018], [0, -0.67, -0.85], cockpitGlow);
    this.camera.add(this.flightCockpitGroup);
    this.flightCockpitGroup.visible = false;
  }

  private disposeGroup(group: THREE.Group): void {
    group.traverse((object) => {
      if (
        (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) &&
        object.geometry instanceof THREE.BufferGeometry
      ) {
        object.geometry.dispose();
      }
    });
    group.clear();
  }

  private buildLighting(): void {
    this.scene.add(new THREE.HemisphereLight(0x9acfff, 0x1b2c2d, 2.2));
    this.sun.position.set(-5, 12, 7);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.scene.add(this.sun);
  }

  private buildBeacons(): void {
    this.disposeGroup(this.beaconGroup);
    const lightDistance = Math.min(this.mapWidth, this.mapHeight) * 0.8;
    for (const [x, z] of [
      [this.mapWidth * 0.25, this.mapHeight * 0.25],
      [this.mapWidth * 0.75, this.mapHeight * 0.25],
      [this.mapWidth * 0.25, this.mapHeight * 0.75],
      [this.mapWidth * 0.75, this.mapHeight * 0.75],
    ] as [number, number][]) {
      const beacon = new THREE.PointLight(this.levelAccent, 11, lightDistance, 2);
      beacon.position.set(x, 2.7, z);
      this.beaconGroup.add(beacon);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), this.beaconMaterial);
      lamp.position.copy(beacon.position);
      this.beaconGroup.add(lamp);
    }
  }

  private buildArena(floors: readonly LevelFloor[]): void {
    for (const [floorIndex, floorDefinition] of floors.entries()) {
      const layer = new THREE.Group();
      layer.position.y = floorIndex * FLOOR_HEIGHT;
      this.arenaGroup.add(layer);

      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(this.mapWidth, this.mapHeight),
        this.materials.ground,
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(this.mapWidth / 2, -0.03, this.mapHeight / 2);
      floor.receiveShadow = true;
      layer.add(floor);

      const gridPoints: number[] = [];
      for (let x = 0; x <= this.mapWidth; x += 1) {
        gridPoints.push(x, 0.006, 0, x, 0.006, this.mapHeight);
      }
      for (let z = 0; z <= this.mapHeight; z += 1) {
        gridPoints.push(0, 0.006, z, this.mapWidth, 0.006, z);
      }
      const gridGeometry = new THREE.BufferGeometry();
      gridGeometry.setAttribute("position", new THREE.Float32BufferAttribute(gridPoints, 3));
      layer.add(new THREE.LineSegments(gridGeometry, this.materials.grid));
      const floorLight = new THREE.PointLight(
        this.levelAccent,
        12,
        Math.max(this.mapWidth, this.mapHeight) * 0.85,
        2,
      );
      floorLight.position.set(this.mapWidth / 2, 3, this.mapHeight / 2);
      layer.add(floorLight);

      const walls: [number, number, number][] = [];
      const wallLights: [number, number, number][] = [];
      const wallPanelsFront: [number, number, number][] = [];
      const wallPanelsSide: [number, number, number][] = [];
      const lowCover: [number, number, number][] = [];
      const lowCoverTops: [number, number, number][] = [];
      const tallCover: [number, number, number][] = [];
      const tallCoverStripes: [number, number, number][] = [];
      for (let y = 0; y < floorDefinition.map.length; y += 1) {
        for (let x = 0; x < (floorDefinition.map[y]?.length ?? 0); x += 1) {
          const tile = floorDefinition.map[y]?.[x];
          if (tile === "1") {
            walls.push([x + 0.5, 1.15, y + 0.5]);
            wallLights.push([x + 0.5, 2.34, y + 0.5]);
            if ((x + y + floorIndex) % 3 === 0) {
              wallPanelsFront.push([x + 0.5, 1.18, y + 0.485], [x + 0.5, 1.18, y + 0.515]);
              wallPanelsSide.push([x + 0.485, 1.18, y + 0.5], [x + 0.515, 1.18, y + 0.5]);
            }
          } else if (tile === "2") {
            lowCover.push([x + 0.5, 0.37, y + 0.5]);
            lowCoverTops.push([x + 0.5, 0.75, y + 0.5]);
          } else if (tile === "3") {
            this.buildLandmark(layer, x, y);
          } else if (tile === "4") {
            tallCover.push([x + 0.5, 0.46, y + 0.5]);
            tallCoverStripes.push([x + 0.5, 0.49, y + 0.5]);
          } else if (tile === "5") {
            this.buildDoor(x, y, floorIndex, layer);
          } else if (tile === "6") {
            this.buildStairs(x, y, layer);
          } else if (tile === "7") {
            this.buildLadder(x, y, layer);
          }
        }
      }
      this.addBoxInstances(layer, [1, 2.4, 1], this.materials.wall, walls);
      this.addBoxInstances(layer, [0.86, 0.045, 0.86], this.materials.wallLight, wallLights);
      this.addBoxInstances(layer, [0.72, 0.62, 0.035], this.materials.wallPanel, wallPanelsFront);
      this.addBoxInstances(layer, [0.035, 0.62, 0.72], this.materials.wallPanel, wallPanelsSide);
      this.addBoxInstances(layer, [0.88, 0.74, 0.88], this.materials.cover, lowCover);
      this.addBoxInstances(layer, [0.9, 0.08, 0.9], this.materials.metal, lowCoverTops);
      this.addBoxInstances(layer, [1.12, 0.92, 0.88], this.materials.cover, tallCover);
      this.addBoxInstances(layer, [0.12, 0.98, 0.92], this.materials.metal, tallCoverStripes);
      for (const stair of floorDefinition.stairsUp)
        this.buildInterfloorStairs(stair.x, stair.y, layer);
      this.buildRoof(layer, floorIndex, floorDefinition.stairsUp);
      if (floorIndex > 0) this.buildStairLanding(floorDefinition.entry, layer);

      for (const x of [0.5, this.mapWidth - 0.5]) {
        box(
          layer,
          [0.08, 1.25, this.mapHeight - 2],
          [x, 0.62, this.mapHeight / 2],
          this.materials.rail,
        );
      }
      for (const z of [0.5, this.mapHeight - 0.5]) {
        box(
          layer,
          [this.mapWidth - 2, 1.25, 0.08],
          [this.mapWidth / 2, 0.62, z],
          this.materials.rail,
        );
      }
    }
  }

  private addBoxInstances(
    parent: THREE.Object3D,
    size: [number, number, number],
    surface: THREE.Material,
    positions: readonly [number, number, number][],
  ): void {
    if (positions.length === 0) return;
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(...size), surface, positions.length);
    const transform = new THREE.Object3D();
    positions.forEach(([x, y, z], index) => {
      transform.position.set(x, y, z);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
  }

  private buildLandmark(parent: THREE.Group, x: number, y: number): void {
    const landmark = new THREE.Group();
    landmark.position.set(x + 0.5, 0, y + 0.5);
    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.56, 0.2, 8),
      this.materials.metal,
    );
    plinth.position.y = 0.1;
    landmark.add(plinth);
    const spire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.32, 2.45, 8),
      this.materials.landmark,
    );
    spire.position.y = 1.38;
    landmark.add(spire);
    sphere(landmark, [0.3, 0.3, 0.3], [0, 2.75, 0], this.materials.landmark);
    const signal = new THREE.PointLight(this.levelAccent, 4, 5, 2);
    signal.position.y = 2.65;
    landmark.add(signal);
    parent.add(landmark);
  }

  private buildDoor(x: number, y: number, floor: number, parent: THREE.Group): void {
    const group = new THREE.Group();
    group.position.set(x + 0.5, 0, y + 0.5);
    box(group, [0.16, 2.45, 0.12], [0, 1.2, -0.52], this.materials.door);
    box(group, [0.16, 2.45, 0.12], [0, 1.2, 0.52], this.materials.door);
    box(group, [0.18, 0.12, 1.12], [0, 2.38, 0], this.materials.door);
    const leaf = new THREE.Group();
    leaf.position.set(0, 0, -0.46);
    box(leaf, [0.1, 2.18, 0.9], [0, 1.09, 0.45], this.materials.door);
    box(leaf, [0.035, 1.72, 0.055], [-0.06, 1.09, 0.45], this.materials.doorGlow);
    group.add(leaf);
    parent.add(group);
    this.doors.set(`${floor}:${x},${y}`, { group, leaf });
  }

  private buildInterfloorStairs(x: number, y: number, parent: THREE.Group): void {
    const stairs = new THREE.Group();
    stairs.position.set(x, 0, y + 0.5);
    const run = 4.4;
    const rise = FLOOR_HEIGHT;
    const steps = 14;
    const treadDepth = run / steps;
    for (let step = 0; step < steps; step += 1) {
      const height = (rise * (step + 1)) / steps;
      const centerX = 0.5 + (step + 0.5) * treadDepth;
      box(
        stairs,
        [treadDepth + 0.025, height, 1.15],
        [centerX, height / 2, 0],
        step % 2 === 0 ? this.materials.cover : this.materials.metal,
      );
      box(
        stairs,
        [treadDepth + 0.025, 0.035, 1.17],
        [centerX, height + 0.018, 0],
        this.materials.stairEdge,
      );
      if (step % 2 === 0) {
        box(stairs, [0.025, 0.018, 0.78], [centerX, height + 0.045, 0], this.materials.wallLight);
      }
    }

    const railAngle = Math.atan2(rise, run);
    for (const z of [-0.68, 0.68]) {
      const rail = box(
        stairs,
        [run + 0.2, 0.09, 0.09],
        [0.5 + run / 2, rise / 2 + 0.92, z],
        this.materials.metal,
      );
      rail.rotation.z = railAngle;
      box(stairs, [0.035, 0.035, 0.035], [0.55, 0.34, z], this.materials.stairEdge);
      box(stairs, [0.035, 0.035, 0.035], [0.5 + run, rise + 0.92, z], this.materials.stairEdge);
    }

    box(stairs, [0.95, 0.14, 1.55], [0.35, 0.07, 0], this.materials.metal);
    box(stairs, [1.15, 0.14, 1.55], [0.5 + run + 0.38, rise - 0.02, 0], this.materials.metal);
    const lowerGuide = new THREE.PointLight(this.levelAccent, 2.4, 5, 2);
    lowerGuide.position.set(0.7, 1.65, 0);
    stairs.add(lowerGuide);
    parent.add(stairs);
  }

  private buildStairLanding(entry: { x: number; y: number }, parent: THREE.Group): void {
    const landing = new THREE.Group();
    landing.position.set(entry.x - 0.05, 0, entry.y);
    box(landing, [1.45, 0.12, 1.75], [0.72, 0.02, 0], this.materials.metal);
    for (const z of [-0.78, 0.78]) {
      box(landing, [1.45, 0.06, 0.07], [0.72, 0.11, z], this.materials.stairEdge);
    }
    parent.add(landing);
  }

  private buildRoof(
    parent: THREE.Group,
    floorIndex: number,
    stairsUp: LevelFloor["stairsUp"],
  ): void {
    const panels: [number, number, number][] = [];
    for (let x = 0; x + 8 <= this.mapWidth; x += 8) {
      for (let z = 0; z + 8 <= this.mapHeight; z += 8) {
        const coversStairwell = stairsUp.some(
          (stair) =>
            x < stair.x + 6 && x + 8 > stair.x && z < stair.y + 3.5 && z + 8 > stair.y - 3.5,
        );
        if (!coversStairwell && (x / 8 + z / 8 + floorIndex) % 5 !== 0) {
          panels.push([x + 4, 3.78, z + 4]);
        }
      }
    }
    this.addBoxInstances(parent, [7.75, 0.16, 7.75], this.materials.roof, panels);

    const beamsAlongZ: [number, number, number][] = [];
    for (let x = 4; x < this.mapWidth; x += 8) {
      if (stairsUp.some((stair) => Math.abs(x - (stair.x + 3)) < 1.6)) continue;
      beamsAlongZ.push([x, 3.62, this.mapHeight / 2]);
    }
    const beamsAlongX: [number, number, number][] = [];
    for (let z = 4; z < this.mapHeight; z += 8) {
      if (stairsUp.some((stair) => Math.abs(z - (stair.y + 0.5)) < 1.6)) continue;
      beamsAlongX.push([this.mapWidth / 2, 3.62, z]);
    }
    this.addBoxInstances(parent, [0.12, 0.12, this.mapHeight], this.materials.metal, beamsAlongZ);
    this.addBoxInstances(parent, [this.mapWidth, 0.12, 0.12], this.materials.metal, beamsAlongX);

    const skylights: [number, number, number][] = [];
    for (let x = 8; x + 8 <= this.mapWidth; x += 16) {
      for (let z = 8; z + 8 <= this.mapHeight; z += 16) {
        if (!stairsUp.some((stair) => Math.abs(stair.x + 3 - x) < 5 && Math.abs(stair.y - z) < 5)) {
          skylights.push([x, 3.66, z]);
        }
      }
    }
    this.addBoxInstances(parent, [1.5, 0.035, 1.5], this.materials.wallPanel, skylights);
  }

  private buildStairs(x: number, y: number, parent: THREE.Group): void {
    const stairs = new THREE.Group();
    stairs.position.set(x + 0.5, 0, y + 0.5);
    for (let step = 0; step < 8; step += 1) {
      const height = 0.12 + step * 0.12;
      box(
        stairs,
        [0.24, height, 0.88],
        [-0.42 + step * 0.12, height / 2, 0],
        step % 2 === 0 ? this.materials.cover : this.materials.door,
      );
      box(stairs, [0.24, 0.035, 0.91], [-0.42 + step * 0.12, height, 0], this.materials.stairEdge);
    }
    box(stairs, [0.055, 1.15, 0.055], [-0.42, 0.5, -0.5], this.materials.metal);
    box(stairs, [0.055, 1.15, 0.055], [0.42, 0.5, -0.5], this.materials.metal);
    box(stairs, [0.055, 1.15, 0.055], [-0.42, 0.5, 0.5], this.materials.metal);
    box(stairs, [0.055, 1.15, 0.055], [0.42, 0.5, 0.5], this.materials.metal);
    parent.add(stairs);
  }

  private buildLadder(x: number, y: number, parent: THREE.Group): void {
    const ladder = new THREE.Group();
    ladder.position.set(x + 0.5, 0, y + 0.5);
    box(ladder, [0.055, 2.1, 0.055], [-0.22, 1.05, 0.18], this.materials.door);
    box(ladder, [0.055, 2.1, 0.055], [0.22, 1.05, 0.18], this.materials.door);
    for (let rung = 0; rung < 8; rung += 1) {
      box(ladder, [0.47, 0.045, 0.055], [0, 0.2 + rung * 0.24, 0.18], this.materials.wallLight);
    }
    parent.add(ladder);
  }

  private buildUfo(): void {
    cylinder(this.ufoGroup, 0.55, 1.55, 0.28, [0, 0, 0], this.materials.ship);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.34, 0.08, 8, 32), this.materials.doorGlow);
    rim.rotation.x = Math.PI / 2;
    this.ufoGroup.add(rim);
    sphere(this.ufoGroup, [0.62, 0.37, 0.62], [0, 0.2, 0], this.materials.canopy);
    for (let light = 0; light < 8; light += 1) {
      const angle = (light / 8) * Math.PI * 2;
      sphere(
        this.ufoGroup,
        [0.09, 0.07, 0.09],
        [Math.cos(angle) * 1.15, -0.03, Math.sin(angle) * 1.15],
        this.materials.doorGlow,
      );
    }
    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(1.6, 1, 18, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x5be8ff,
        transparent: true,
        opacity: 0.1,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    beam.position.y = -0.5;
    beam.userData.isBeam = true;
    this.ufoGroup.add(beam);
    const light = new THREE.PointLight(0x54dfff, 20, 20, 2);
    light.position.y = -0.25;
    this.ufoGroup.add(light);
  }

  private buildShuttle(): void {
    const shuttle = new THREE.Group();
    shuttle.position.set(
      this.mapWidth - 3.2,
      (this.floorCount - 1) * FLOOR_HEIGHT,
      this.mapHeight / 2,
    );
    shuttle.rotation.y = -Math.PI / 2;
    box(shuttle, [0.78, 0.68, 2.2], [0, 0.72, 0], this.materials.ship);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.43, 0.9, 8), this.materials.door);
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, 0.72, -1.42);
    shuttle.add(nose);
    sphere(shuttle, [0.35, 0.25, 0.5], [0, 1.1, -0.35], this.materials.canopy);
    box(shuttle, [2.4, 0.12, 0.68], [0, 0.62, 0.1], this.materials.ship);
    for (const side of [-1, 1]) {
      cylinder(shuttle, 0.2, 0.26, 0.34, [side * 0.47, 0.72, 0.87], this.materials.door);
      cylinder(shuttle, 0.12, 0.15, 0.04, [side * 0.47, 0.72, 1.06], this.materials.doorGlow);
      box(shuttle, [0.35, 0.08, 0.9], [side * 0.85, 0.72, 0.55], this.materials.door);
    }
    this.extractionGroup.add(shuttle);
    this.extractionGroup.visible = false;
  }

  private buildAlien(kind: AlienKind): AlienRig {
    const style = this.alienStyles[kind];
    const group = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.44, 4, 8), style.body);
    torso.position.y = 0.85;
    torso.castShadow = true;
    group.add(torso);

    sphere(group, [0.34, 0.27, 0.29], [0, 1.43, 0], style.highlight);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.2, 10), style.body);
    neck.position.y = 1.26;
    group.add(neck);
    for (const side of [-1, 1]) {
      sphere(group, [0.115, 0.067, 0.055], [side * 0.145, 1.45, 0.235], style.eye);
    }

    const limbGeometry = new THREE.CapsuleGeometry(0.085, 0.39, 3, 7);
    const leftArm = new THREE.Mesh(limbGeometry, style.body);
    const rightArm = new THREE.Mesh(limbGeometry, style.body);
    leftArm.position.set(-0.31, 0.91, 0);
    rightArm.position.set(0.31, 0.91, 0);
    group.add(leftArm, rightArm);

    const legGeometry = new THREE.CapsuleGeometry(0.09, 0.39, 3, 7);
    const leftLeg = new THREE.Mesh(legGeometry, style.body);
    const rightLeg = new THREE.Mesh(legGeometry, style.body);
    leftLeg.position.set(-0.13, 0.35, 0);
    rightLeg.position.set(0.13, 0.35, 0);
    group.add(leftLeg, rightLeg);
    const barBack = box(group, [0.62, 0.06, 0.04], [0, 1.82, 0], this.weaponMaterials.grip);
    barBack.castShadow = false;
    const healthFill = box(
      group,
      [0.6, 0.035, 0.05],
      [0, 1.82, 0.03],
      material(style.accent, { emissive: style.accent }),
    );
    healthFill.castShadow = false;
    const warningLight = new THREE.PointLight(style.accent, 0, 2.4, 2);
    warningLight.position.set(0, 1.45, 0.28);
    group.add(warningLight);
    this.scene.add(group);
    return { group, leftLeg, rightLeg, leftArm, rightArm, healthFill, warningLight };
  }

  private buildGrenade(): THREE.Group {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 14, 12),
      material(0x75875b, { metalness: 0.45 }),
    );
    body.scale.set(0.83, 1.05, 0.83);
    body.castShadow = true;
    group.add(body);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.075, 0.08, 10),
      this.materials.metal,
    );
    cap.position.y = 0.17;
    group.add(cap);
    this.scene.add(group);
    return group;
  }

  private buildCoin(): THREE.Group {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.045, 8, 18), this.coinMaterial);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    const center = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.035, 12),
      this.coinHighlightMaterial,
    );
    group.add(center);
    const glow = new THREE.PointLight(0xffc857, 0.5, 1.8, 2);
    glow.position.y = 0.08;
    group.add(glow);
    this.scene.add(group);
    return group;
  }

  private buildRifle(): void {
    const { dark, steel, grip, panel, edge, glow, glass } = this.weaponMaterials;
    box(this.weapon, [0.19, 0.17, 0.42], [0, 0.005, -0.19], dark);
    box(this.weapon, [0.16, 0.11, 0.28], [0, 0.005, 0.13], panel);
    box(this.weapon, [0.2, 0.12, 0.22], [0, 0.015, -0.5], panel);
    box(this.weapon, [0.125, 0.1, 0.24], [0, -0.015, 0.32], grip);
    box(this.weapon, [0.2, 0.07, 0.1], [0, 0.015, 0.43], edge);
    cylinder(this.weapon, 0.034, 0.04, 0.47, [0, 0.02, -0.79], steel, [Math.PI / 2, 0, 0]);
    cylinder(this.weapon, 0.059, 0.053, 0.12, [0, 0.02, -1.07], dark, [Math.PI / 2, 0, 0]);
    cylinder(this.weapon, 0.036, 0.036, 0.012, [0, 0.02, -1.135], glow, [Math.PI / 2, 0, 0]);

    box(this.weapon, [0.13, 0.24, 0.14], [0, -0.17, -0.11], grip).rotation.x = -0.12;
    box(this.weapon, [0.115, 0.18, 0.12], [0, -0.115, 0.08], dark);
    box(this.weapon, [0.1, 0.1, 0.22], [0, -0.045, -0.36], dark);
    box(this.weapon, [0.025, 0.025, 0.34], [0, 0.105, -0.27], edge);
    for (let notch = 0; notch < 5; notch += 1) {
      box(this.weapon, [0.014, 0.025, 0.035], [0, 0.105, -0.4 + notch * 0.065], grip);
    }

    box(this.weapon, [0.055, 0.12, 0.1], [0, 0.17, -0.22], dark);
    cylinder(this.weapon, 0.055, 0.055, 0.21, [0, 0.235, -0.22], panel, [Math.PI / 2, 0, 0]);
    cylinder(this.weapon, 0.04, 0.04, 0.012, [0, 0.235, -0.335], glass, [Math.PI / 2, 0, 0]);
    box(this.weapon, [0.16, 0.045, 0.06], [0, 0.19, -0.22], dark);

    for (const z of [-0.38, -0.2, -0.02]) {
      box(this.weapon, [0.014, 0.055, 0.08], [0.102, 0.015, z], edge);
    }
    box(this.weapon, [0.035, 0.12, 0.12], [0.12, 0, -0.52], glow);
  }

  private buildPistol(): void {
    const { dark, steel, grip, panel, edge, glow } = this.weaponMaterials;
    box(this.weapon, [0.16, 0.115, 0.42], [0, 0.055, -0.19], steel);
    box(this.weapon, [0.125, 0.07, 0.32], [0, 0.105, -0.21], dark);
    box(this.weapon, [0.13, 0.13, 0.16], [0, -0.015, 0.055], panel);
    box(this.weapon, [0.12, 0.24, 0.15], [0, -0.16, 0.035], grip).rotation.x = -0.16;
    box(this.weapon, [0.125, 0.025, 0.18], [0, -0.16, 0.12], dark).rotation.x = -0.16;
    box(this.weapon, [0.035, 0.18, 0.12], [0, -0.13, -0.015], dark);
    cylinder(this.weapon, 0.025, 0.025, 0.25, [0, 0.04, -0.52], edge, [Math.PI / 2, 0, 0]);
    box(this.weapon, [0.06, 0.035, 0.1], [0, -0.105, -0.055], steel);
    box(this.weapon, [0.09, 0.14, 0.035], [0, -0.045, -0.115], grip);
    box(this.weapon, [0.045, 0.035, 0.07], [0, 0.166, -0.12], glow);
    box(this.weapon, [0.04, 0.035, 0.07], [0, 0.166, -0.37], dark);
    for (let notch = 0; notch < 4; notch += 1) {
      box(this.weapon, [0.014, 0.018, 0.035], [0.087, 0.06, -0.32 + notch * 0.055], edge);
    }
    box(this.weapon, [0.045, 0.075, 0.08], [0.11, 0.04, -0.27], glow);
    box(this.weapon, [0.018, 0.15, 0.1], [0.077, -0.16, 0.045], panel);
  }

  private buildKnife(): void {
    const { steel, grip, panel, edge, glow } = this.weaponMaterials;
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(-0.035, 0);
    bladeShape.lineTo(0.035, 0);
    bladeShape.lineTo(0.025, 0.26);
    bladeShape.lineTo(0, 0.43);
    bladeShape.lineTo(-0.026, 0.26);
    bladeShape.closePath();
    const blade = new THREE.Mesh(
      new THREE.ExtrudeGeometry(bladeShape, {
        depth: 0.035,
        bevelEnabled: true,
        bevelSegments: 1,
        bevelSize: 0.008,
        bevelThickness: 0.008,
      }),
      steel,
    );
    blade.rotation.x = -Math.PI / 2;
    blade.position.set(0, -0.015, -0.08);
    blade.castShadow = true;
    this.weapon.add(blade);
    box(this.weapon, [0.17, 0.045, 0.055], [0, -0.02, -0.08], edge);
    box(this.weapon, [0.21, 0.055, 0.07], [0, -0.015, -0.035], glow);
    box(this.weapon, [0.085, 0.095, 0.2], [0, -0.075, 0.09], grip).rotation.x = 0.14;
    for (let groove = 0; groove < 3; groove += 1) {
      box(
        this.weapon,
        [0.09, 0.012, 0.025],
        [0, -0.04 - groove * 0.025, 0.08 + groove * 0.045],
        panel,
      );
    }
    box(this.weapon, [0.035, 0.045, 0.09], [0, -0.09, 0.2], edge);
  }

  private buildHandGrenade(): void {
    const { grenade, steel, panel, glow } = this.weaponMaterials;
    sphere(this.weapon, [0.16, 0.22, 0.16], [0, -0.035, -0.04], grenade);
    cylinder(this.weapon, 0.055, 0.055, 0.045, [0, 0.17, -0.04], steel);
    box(this.weapon, [0.2, 0.035, 0.035], [0.09, 0.12, -0.04], steel).rotation.z = -0.16;
    box(this.weapon, [0.04, 0.12, 0.04], [0.17, 0.08, -0.04], panel);
    for (const y of [-0.1, -0.03, 0.04]) {
      box(this.weapon, [0.31, 0.025, 0.17], [0, y, -0.04], panel);
    }
    box(this.weapon, [0.045, 0.045, 0.035], [0, 0.205, -0.04], glow);
  }

  private buildWeapon(kind: string): void {
    this.weapon.children.forEach((object) => {
      if (object instanceof THREE.Mesh && object.geometry instanceof THREE.BufferGeometry) {
        object.geometry.dispose();
      }
    });
    this.weapon.clear();
    this.weaponKind = kind;
    if (kind === "knife") this.buildKnife();
    else if (kind === "grenade") this.buildHandGrenade();
    else if (kind === "pistol") this.buildPistol();
    else this.buildRifle();
    this.weapon.position.set(0.38, -0.31, -0.68);
    this.weapon.rotation.set(-0.06, -0.08, -0.04);
    this.camera.add(this.weapon);
  }

  resize(width: number, height: number): void {
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    this.camera.aspect = safeWidth / safeHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(safeWidth, safeHeight, false);
  }

  render(
    player: ScenePlayer,
    enemies: readonly SceneEnemy[],
    grenades: readonly SceneGrenade[],
    weaponKind: string,
    recoil: number,
    muzzleFlash: number,
    time: number,
    deathProgress: number,
    aiming: boolean,
    openDoors: ReadonlySet<string>,
    extractionReady: boolean,
    ufo: { x: number; y: number; z: number },
    flight: SceneFlight | null,
    coins: readonly SceneCoin[],
  ): void {
    if (flight) {
      this.renderFlight(flight, time);
      return;
    }
    this.flightGroup.visible = false;
    this.flightCockpitGroup.visible = false;
    this.arenaGroup.visible = true;
    this.beaconGroup.visible = true;
    this.ufoGroup.visible = true;
    this.weapon.visible = true;
    this.camera.position.set(
      player.x,
      player.floor * FLOOR_HEIGHT +
        player.stairHeight +
        1.62 +
        player.jumpHeight -
        deathProgress * 0.85,
      player.y,
    );
    this.camera.rotation.set(-player.pitch, -player.angle - Math.PI / 2, deathProgress * 0.28);
    const desiredFov = aiming ? 52 : 72;
    if (this.camera.fov !== desiredFov) {
      this.camera.fov = desiredFov;
      this.camera.updateProjectionMatrix();
    }
    if (this.weaponKind !== weaponKind) this.buildWeapon(weaponKind);
    this.weapon.position.x = aiming ? 0.04 : 0.38;
    this.weapon.position.y =
      (aiming ? -0.29 : -0.31) + recoil * 0.08 + Math.sin(time * 0.006) * 0.008;
    this.muzzle.intensity = muzzleFlash > 0 ? 14 : 0;
    this.ufoGroup.position.set(ufo.x, ufo.y, ufo.z);
    this.ufoGroup.rotation.y = time * 0.00015;
    const beam = this.ufoGroup.children.find((object) => object.userData.isBeam);
    if (beam) {
      beam.scale.y = Math.max(0.1, ufo.y);
      beam.position.y = -ufo.y / 2;
    }
    this.extractionGroup.visible = extractionReady;
    for (const [key, door] of this.doors) {
      door.leaf.rotation.y = openDoors.has(key) ? -Math.PI / 2 : 0;
    }

    enemies.forEach((enemy) => {
      let rig = this.aliens.get(enemy);
      if (!rig) {
        rig = this.buildAlien(enemy.kind);
        this.aliens.set(enemy, rig);
      }
      rig.group.visible = true;
      rig.group.position.set(enemy.x, enemy.floor * FLOOR_HEIGHT + enemy.dropHeight, enemy.y);
      rig.group.rotation.y = Math.atan2(player.x - enemy.x, player.y - enemy.y);
      const walk = Math.sin(time * 0.009 + enemy.bob) * 0.34;
      rig.leftLeg.rotation.x = walk;
      rig.rightLeg.rotation.x = -walk;
      const attackPose = enemy.attackWindup > 0;
      rig.leftArm.rotation.x = attackPose ? -1.1 : -walk * 0.65;
      rig.rightArm.rotation.x = attackPose ? -1.1 : walk * 0.65;
      rig.warningLight.intensity = attackPose ? 3.5 + Math.sin(time * 0.025) * 1.5 : 0;
      const health = THREE.MathUtils.clamp(enemy.hp / enemy.maxHp, 0, 1);
      rig.healthFill.scale.x = health;
      rig.healthFill.position.x = -0.3 * (1 - health);
    });
    this.removeMissing(this.aliens, enemies, (rig) => this.scene.remove(rig.group));

    grenades.forEach((grenade) => {
      let model = this.grenades.get(grenade);
      if (!model) {
        model = this.buildGrenade();
        this.grenades.set(grenade, model);
      }
      model.visible = true;
      model.position.set(grenade.x, grenade.floor * FLOOR_HEIGHT + grenade.height, grenade.y);
      model.rotation.z = time * 0.004;
    });
    this.removeMissing(this.grenades, grenades, (model) => this.scene.remove(model));

    coins.forEach((coin) => {
      let model = this.coins.get(coin);
      if (!model) {
        model = this.buildCoin();
        this.coins.set(coin, model);
      }
      model.visible = coin.floor === player.floor;
      model.position.set(
        coin.x,
        coin.floor * FLOOR_HEIGHT + 0.22 + Math.sin(time * 0.004 + coin.x + coin.y) * 0.045,
        coin.y,
      );
      model.rotation.y = time * 0.0015;
    });
    this.removeMissing(this.coins, coins, (model) => this.scene.remove(model));

    this.renderer.render(this.scene, this.camera);
  }

  private renderFlight(flight: SceneFlight, time: number): void {
    this.flightGroup.visible = true;
    this.flightCockpitGroup.visible = true;
    this.arenaGroup.visible = false;
    this.beaconGroup.visible = false;
    this.extractionGroup.visible = false;
    this.ufoGroup.visible = false;
    this.weapon.visible = false;
    for (const rig of this.aliens.values()) rig.group.visible = false;
    for (const model of this.grenades.values()) model.visible = false;
    for (const model of this.coins.values()) model.visible = false;

    if (this.scene.background !== this.flightBackground) {
      this.scene.background = this.flightBackground;
    }
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.setHex(0x040a18);
      this.scene.fog.near = 70;
      this.scene.fog.far = 150;
    }
    this.camera.position.set(flight.playerX, flight.playerY, 0);
    this.camera.rotation.set(0, 0, 0);
    if (this.camera.fov !== 72) {
      this.camera.fov = 72;
      this.camera.updateProjectionMatrix();
    }

    this.flightRingGroup.visible = flight.ring !== null;
    if (flight.ring) {
      this.flightRingGroup.position.set(
        flight.ring.x - flight.playerX,
        flight.ring.y - flight.playerY,
        -flight.distance,
      );
      this.flightRingGroup.rotation.z = Math.sin(time * 0.0015) * 0.045;
    }

    if (this.flightStars) {
      const positions = this.flightStars.geometry.getAttribute("position");
      const elapsed = this.lastFlightTime
        ? Math.min(Math.max((time - this.lastFlightTime) / 1000, 0), 0.05)
        : 0;
      for (let index = 0; index < positions.count; index += 1) {
        const nextZ = positions.getZ(index) + elapsed * 18;
        positions.setZ(index, nextZ > -3 ? nextZ - 90 : nextZ);
      }
      positions.needsUpdate = true;
    }
    this.lastFlightTime = time;
    this.renderer.render(this.scene, this.camera);
  }

  private removeMissing<T extends object, M>(
    models: Map<T, M>,
    active: readonly T[],
    removeModel: (model: M) => void,
  ): void {
    const activeModels = new Set(active);
    for (const [entity, model] of models) {
      if (activeModels.has(entity)) continue;
      removeModel(model);
      models.delete(entity);
    }
  }
}
