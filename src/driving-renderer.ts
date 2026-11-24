import * as THREE from "three";
import {
  CAR_CATALOG,
  RALLY_RIVALS,
  type CarProfile,
  type DrivingCar,
  type DrivingTrack,
  type TrackPoint,
} from "./driving";

const TERRAIN_SIZE = 1900;
const SCENE_FAR = 2200;
const WORLD_UP = new THREE.Vector3(0, 1, 0);

const ENVIRONMENT_COLORS: Record<
  DrivingTrack["environment"],
  { sky: string; fog: string; ground: string; water: string }
> = {
  coastal: { sky: "#9bc8d4", fog: "#9bc8d4", ground: "#8f9871", water: "#367f91" },
  canyon: { sky: "#d8a775", fog: "#d8a775", ground: "#9d6841", water: "#426c72" },
  alpine: { sky: "#9ec2dd", fog: "#9ec2dd", ground: "#788978", water: "#4b768b" },
  forest: { sky: "#87a98e", fog: "#87a98e", ground: "#405f42", water: "#39717a" },
  city: { sky: "#7b8fa6", fog: "#7b8fa6", ground: "#4c5a5d", water: "#3d727e" },
  desert: { sky: "#e1b877", fog: "#e1b877", ground: "#bd8b4e", water: "#54777a" },
  volcanic: { sky: "#655765", fog: "#655765", ground: "#493d3d", water: "#504d5a" },
};

function color(value: string): THREE.Color {
  return new THREE.Color(value);
}

function trackPosition(point: TrackPoint): THREE.Vector3 {
  return new THREE.Vector3(point.x, point.elevation ?? 0, point.y);
}

function trackTangent(track: DrivingTrack, index: number): THREE.Vector3 {
  const before = trackPosition(track.points[(index - 1 + track.points.length) % track.points.length]!);
  const after = trackPosition(track.points[(index + 1) % track.points.length]!);
  return after.sub(before).setY(0).normalize();
}

function trackSide(track: DrivingTrack, index: number): THREE.Vector3 {
  const tangent = trackTangent(track, index);
  return new THREE.Vector3(-tangent.z, 0, tangent.x);
}

function disposeGroup(group: THREE.Group): void {
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material.dispose();
  });
  group.clear();
}

function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  parent: THREE.Object3D,
  position: THREE.Vector3,
): THREE.Mesh {
  const result = new THREE.Mesh(geometry, material);
  result.position.copy(position);
  result.castShadow = true;
  result.receiveShadow = true;
  parent.add(result);
  return result;
}

export class DrivingRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(62, 1, 0.1, SCENE_FAR);
  private readonly terrainGroup = new THREE.Group();
  private readonly courseGroup = new THREE.Group();
  private readonly sceneryGroup = new THREE.Group();
  private readonly rivalGroup = new THREE.Group();
  private readonly carGroup = new THREE.Group();
  private readonly rivalCars: THREE.Group[] = [];
  private track: DrivingTrack | null = null;
  private profile: CarProfile = CAR_CATALOG[0]!;
  private paint = this.profile.paint;
  private cameraReady = false;

  constructor(canvas: HTMLCanvasElement) {
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
    this.renderer.toneMappingExposure = 1.15;

    this.scene.add(this.terrainGroup, this.courseGroup, this.sceneryGroup, this.rivalGroup, this.carGroup);
    this.scene.add(new THREE.HemisphereLight("#e7f7ff", "#334034", 2.15));
    const sun = new THREE.DirectionalLight("#fff1d2", 3);
    sun.position.set(-350, 520, 200);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -850;
    sun.shadow.camera.right = 850;
    sun.shadow.camera.top = 850;
    sun.shadow.camera.bottom = -850;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight("#87d3ff", 1.1);
    fill.position.set(450, 160, -450);
    this.scene.add(fill);

    this.camera.position.set(500, 35, 285);
    this.camera.lookAt(500, 0, 350);
    this.setCar(this.profile, this.paint);
  }

  setTrack(track: DrivingTrack): void {
    if (this.track?.id === track.id) return;
    this.track = track;
    this.cameraReady = false;
    disposeGroup(this.terrainGroup);
    disposeGroup(this.courseGroup);
    disposeGroup(this.sceneryGroup);
    disposeGroup(this.rivalGroup);
    this.rivalCars.length = 0;
    const palette = ENVIRONMENT_COLORS[track.environment];
    this.scene.background = color(palette.sky);
    this.scene.fog = new THREE.Fog(palette.fog, 650, SCENE_FAR);
    this.buildTerrain(palette);
    this.buildRoad(track);
    this.buildScenery(track);
    this.buildRivals();
  }

  setCar(profile: CarProfile, paint: string): void {
    disposeGroup(this.carGroup);
    this.profile = profile;
    this.paint = paint;
    this.carGroup.add(this.createCarModel(profile, paint));
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  render(
    car: DrivingCar,
    elapsed: number,
    racing: boolean,
    steering: number,
    drifting: boolean,
  ): void {
    if (!this.track) return;
    const index = this.track.points.reduce(
      (nearest, point, candidate) =>
        Math.hypot(point.x - car.x, point.y - car.y) <
        Math.hypot(
          this.track!.points[nearest]!.x - car.x,
          this.track!.points[nearest]!.y - car.y,
        )
          ? candidate
          : nearest,
      0,
    );
    const point = this.track.points[index]!;
    const forward = new THREE.Vector3(Math.cos(car.heading), 0, Math.sin(car.heading));
    const carPosition = new THREE.Vector3(car.x, (point.elevation ?? 0) + 1.2, car.y);
    this.carGroup.position.copy(carPosition);
    this.carGroup.rotation.y = Math.PI / 2 - car.heading;
    this.carGroup.rotation.z = drifting ? -steering * 0.055 : 0;

    this.rivalCars.forEach((rivalCar, rivalIndex) => {
      rivalCar.visible = racing;
      if (!racing) return;
      const rival = RALLY_RIVALS[rivalIndex]!;
      const progress = (elapsed * rival.progressRate + rivalIndex * 45) % this.track!.points.length;
      const rivalPoint = this.track!.points[Math.floor(progress)]!;
      const rivalNext = this.track!.points[(Math.floor(progress) + 1) % this.track!.points.length]!;
      const rivalHeading = Math.atan2(rivalNext.y - rivalPoint.y, rivalNext.x - rivalPoint.x);
      rivalCar.position.set(rivalPoint.x, (rivalPoint.elevation ?? 0) + 1.2, rivalPoint.y);
      rivalCar.rotation.y = Math.PI / 2 - rivalHeading;
    });

    const cameraTarget = carPosition.clone().add(new THREE.Vector3(0, 5, 0)).addScaledVector(forward, 13);
    const cameraPosition = carPosition
      .clone()
      .addScaledVector(forward, -42)
      .add(new THREE.Vector3(0, 19, 0));
    if (!this.cameraReady) {
      this.camera.position.copy(cameraPosition);
      this.cameraReady = true;
    } else {
      this.camera.position.lerp(cameraPosition, 0.12);
    }
    this.camera.lookAt(cameraTarget);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    disposeGroup(this.terrainGroup);
    disposeGroup(this.courseGroup);
    disposeGroup(this.sceneryGroup);
    disposeGroup(this.rivalGroup);
    disposeGroup(this.carGroup);
    this.renderer.dispose();
  }

  private buildTerrain(
    palette: (typeof ENVIRONMENT_COLORS)[DrivingTrack["environment"]],
  ): void {
    const geometry = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, 90, 90);
    const positions = geometry.getAttribute("position");
    const colors = new Float32Array(positions.count * 3);
    const baseColor = color(palette.ground);
    const highColor = color(palette.ground).lerp(new THREE.Color("#d0c8a9"), 0.2);
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const z = -positions.getY(index);
      const elevation =
        Math.sin(x * 0.007) * Math.cos(z * 0.009) * 4 +
        Math.sin((x + z) * 0.017) * 1.5;
      positions.setZ(index, elevation);
      const shade = Math.max(0, Math.min(1, (elevation + 7) / 15));
      const terrainColor = baseColor.clone().lerp(highColor, shade);
      colors[index * 3] = terrainColor.r;
      colors[index * 3 + 1] = terrainColor.g;
      colors[index * 3 + 2] = terrainColor.b;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.rotateX(-Math.PI / 2);
    geometry.computeVertexNormals();
    const ground = mesh(
      geometry,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
      this.terrainGroup,
      new THREE.Vector3(500, -8, 350),
    );
    ground.receiveShadow = true;

    if (this.track?.environment === "coastal") {
      const water = mesh(
        new THREE.PlaneGeometry(2100, 1900),
        new THREE.MeshStandardMaterial({
          color: palette.water,
          roughness: 0.32,
          metalness: 0.18,
          transparent: true,
          opacity: 0.92,
        }),
        this.terrainGroup,
        new THREE.Vector3(1450, -10, -450),
      );
      water.rotation.x = -Math.PI / 2;
      water.receiveShadow = false;
    }
  }

  private buildRoad(track: DrivingTrack): void {
    const halfWidth = track.roadWidth / 2;
    const road = this.createRibbon(track, -halfWidth, halfWidth, "#303740", 0.25);
    road.name = "continuous asphalt circuit";
    for (const side of [-1, 1]) {
      const curb = this.createRibbon(
        track,
        side * (halfWidth - 5),
        side * (halfWidth + 3),
        "#e5e3d8",
        0.42,
      );
      this.courseGroup.add(curb);
      const railCurve = new THREE.CatmullRomCurve3(
        track.points.map((_, index) =>
          trackPosition(track.points[index]!)
            .addScaledVector(trackSide(track, index), side * (halfWidth + 12))
            .add(new THREE.Vector3(0, 5, 0)),
        ),
        true,
      );
      const rail = mesh(
        new THREE.TubeGeometry(railCurve, track.points.length * 2, 1.25, 6, true),
        new THREE.MeshStandardMaterial({
          color: "#bac6ca",
          metalness: 0.68,
          roughness: 0.32,
        }),
        this.courseGroup,
        new THREE.Vector3(),
      );
      rail.castShadow = true;
      this.courseGroup.add(rail);
    }
    this.courseGroup.add(road);

    const stripeMaterial = new THREE.MeshStandardMaterial({
      color: track.accent,
      emissive: track.accent,
      emissiveIntensity: 0.18,
      roughness: 0.7,
    });
    const stripeGeometry = new THREE.BoxGeometry(3, 0.18, 8);
    for (let index = 0; index < track.points.length; index += 18) {
      const point = track.points[index]!;
      const tangent = trackTangent(track, index);
      const stripe = mesh(
        stripeGeometry,
        stripeMaterial,
        this.courseGroup,
        trackPosition(point).add(new THREE.Vector3(0, 0.48, 0)),
      );
      stripe.rotation.y = Math.atan2(tangent.x, tangent.z);
      stripe.castShadow = false;
    }

    const start = track.points[0]!;
    const startLine = mesh(
      new THREE.BoxGeometry(track.roadWidth * 0.86, 0.25, 4),
      new THREE.MeshStandardMaterial({ color: "#f4f4ed", roughness: 0.82 }),
      this.courseGroup,
      trackPosition(start).add(new THREE.Vector3(0, 0.62, 0)),
    );
    const startTangent = trackTangent(track, 0);
    startLine.rotation.y = Math.atan2(startTangent.x, startTangent.z);
    this.courseGroup.add(startLine);
  }

  private createRibbon(
    track: DrivingTrack,
    leftOffset: number,
    rightOffset: number,
    materialColor: string,
    lift: number,
  ): THREE.Mesh {
    const positions: number[] = [];
    const indices: number[] = [];
    for (let index = 0; index < track.points.length; index += 1) {
      const center = trackPosition(track.points[index]!);
      const normal = trackSide(track, index);
      const left = center.clone().addScaledVector(normal, leftOffset).add(new THREE.Vector3(0, lift, 0));
      const right = center.clone().addScaledVector(normal, rightOffset).add(new THREE.Vector3(0, lift, 0));
      positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
      const next = (index + 1) % track.points.length;
      const first = index * 2;
      const second = first + 1;
      const third = next * 2;
      const fourth = third + 1;
      indices.push(first, third, second, second, third, fourth);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const surface = mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: materialColor,
        roughness: materialColor === "#303740" ? 0.93 : 0.66,
        metalness: 0.06,
        side: THREE.DoubleSide,
      }),
      this.courseGroup,
      new THREE.Vector3(),
    );
    surface.receiveShadow = true;
    return surface;
  }

  private buildScenery(track: DrivingTrack): void {
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: ENVIRONMENT_COLORS[track.environment].ground,
      roughness: 1,
    });
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: "#4d3827", roughness: 1 });
    const leafMaterial = new THREE.MeshStandardMaterial({
      color: track.environment === "forest" ? "#3d744a" : "#50795a",
      roughness: 0.9,
    });
    const rockMaterial = new THREE.MeshStandardMaterial({
      color: track.environment === "volcanic" ? "#3b3234" : "#786e62",
      roughness: 1,
    });

    for (let index = 8; index < track.points.length; index += 7) {
      const point = trackPosition(track.points[index]!);
      const side = trackSide(track, index);
      for (const direction of [-1, 1]) {
        const offset = track.environment === "city" ? 245 + (index % 4) * 18 : 230 + (index % 3) * 22;
        const position = point.clone().addScaledVector(side, offset * direction);
        const scale = 0.75 + ((index * (direction + 4)) % 5) * 0.12;
        if (track.environment === "city" || (track.environment === "coastal" && index % 4 === 1)) {
          this.addBuilding(position, scale, index, track);
        } else if (track.environment === "alpine" || track.environment === "forest") {
          this.addTree(position, scale, trunkMaterial, leafMaterial);
        } else if (track.environment === "desert") {
          this.addCactus(position, scale, leafMaterial, trunkMaterial);
        } else {
          this.addRock(position, scale, rockMaterial, track.environment === "volcanic");
        }

        if (index % 28 === 8) {
          const post = mesh(
            new THREE.CylinderGeometry(1.2, 1.7, 11, 8),
            new THREE.MeshStandardMaterial({ color: track.accent, emissive: track.accent, emissiveIntensity: 0.28 }),
            this.sceneryGroup,
            position.clone().add(new THREE.Vector3(0, 5.5, 0)),
          );
          post.castShadow = false;
        }
      }
    }

    if (track.environment === "alpine" || track.environment === "canyon" || track.environment === "volcanic") {
      for (let index = 0; index < 18; index += 1) {
        const angle = (index / 18) * Math.PI * 2;
        const radius = 620 + (index % 3) * 65;
        const mountain = mesh(
          new THREE.ConeGeometry(80 + (index % 4) * 22, 180 + (index % 5) * 28, 7),
          groundMaterial,
          this.sceneryGroup,
          new THREE.Vector3(500 + Math.cos(angle) * radius, 45, 350 + Math.sin(angle) * radius),
        );
        mountain.scale.y = 1.25 + (index % 3) * 0.3;
        mountain.rotation.y = angle;
      }
    }
  }

  private addTree(
    position: THREE.Vector3,
    scale: number,
    trunkMaterial: THREE.Material,
    leafMaterial: THREE.Material,
  ): void {
    mesh(
      new THREE.CylinderGeometry(2.4 * scale, 3.2 * scale, 18 * scale, 7),
      trunkMaterial,
      this.sceneryGroup,
      position.clone().add(new THREE.Vector3(0, 9 * scale, 0)),
    );
    for (let tier = 0; tier < 3; tier += 1) {
      const crown = mesh(
        new THREE.ConeGeometry((15 - tier * 2.8) * scale, 24 * scale, 8),
        leafMaterial,
        this.sceneryGroup,
        position.clone().add(new THREE.Vector3(0, (25 + tier * 12) * scale, 0)),
      );
      crown.castShadow = true;
    }
  }

  private addCactus(
    position: THREE.Vector3,
    scale: number,
    cactusMaterial: THREE.Material,
    trunkMaterial: THREE.Material,
  ): void {
    mesh(
      new THREE.CylinderGeometry(4 * scale, 5 * scale, 22 * scale, 8),
      cactusMaterial,
      this.sceneryGroup,
      position.clone().add(new THREE.Vector3(0, 11 * scale, 0)),
    );
    for (const side of [-1, 1]) {
      mesh(
        new THREE.CylinderGeometry(2 * scale, 2 * scale, 9 * scale, 7),
        trunkMaterial,
        this.sceneryGroup,
        position.clone().add(new THREE.Vector3(side * 5 * scale, 12 * scale, 0)),
      );
    }
  }

  private addRock(
    position: THREE.Vector3,
    scale: number,
    material: THREE.Material,
    volcanic: boolean,
  ): void {
    const rock = mesh(
      new THREE.DodecahedronGeometry((volcanic ? 14 : 11) * scale, 0),
      material,
      this.sceneryGroup,
      position.clone().add(new THREE.Vector3(0, 6 * scale, 0)),
    );
    rock.scale.set(1.3, 0.8, 1);
    rock.rotation.set(scale, scale * 0.7, 0);
  }

  private addBuilding(
    position: THREE.Vector3,
    scale: number,
    index: number,
    track: DrivingTrack,
  ): void {
    const height = 50 + (index % 7) * 16;
    const building = mesh(
      new THREE.BoxGeometry((32 + (index % 3) * 8) * scale, height * scale, 30 * scale),
      new THREE.MeshStandardMaterial({
        color: index % 2 ? "#526577" : "#64717a",
        roughness: 0.78,
        metalness: 0.15,
      }),
      this.sceneryGroup,
      position.clone().add(new THREE.Vector3(0, (height * scale) / 2, 0)),
    );
    building.rotation.y = index * 0.14;
    if (index % 3 === 0) {
      const sign = mesh(
        new THREE.BoxGeometry(18 * scale, 3 * scale, 1),
        new THREE.MeshStandardMaterial({
          color: track.accent,
          emissive: track.accent,
          emissiveIntensity: 0.7,
        }),
        this.sceneryGroup,
        position.clone().add(new THREE.Vector3(0, height * scale * 0.72, 16 * scale)),
      );
      sign.rotation.y = building.rotation.y;
      sign.castShadow = false;
    }
  }

  private buildRivals(): void {
    for (const [index, rival] of RALLY_RIVALS.entries()) {
      const profile: CarProfile = {
        ...CAR_CATALOG[index + 1]!,
        id: `rival-${index}`,
        name: rival.name,
        paint: rival.color,
      };
      const model = this.createCarModel(profile, rival.color);
      model.visible = false;
      this.rivalGroup.add(model);
      this.rivalCars.push(model);
    }
  }

  private createCarModel(profile: CarProfile, paint: string): THREE.Group {
    const car = new THREE.Group();
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: paint,
      metalness: 0.62,
      roughness: 0.24,
    });
    const trimMaterial = new THREE.MeshStandardMaterial({
      color: "#111820",
      metalness: 0.34,
      roughness: 0.42,
    });
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: "#102434",
      metalness: 0.45,
      roughness: 0.13,
      clearcoat: 1,
    });
    const lightMaterial = new THREE.MeshStandardMaterial({
      color: "#fff3c2",
      emissive: "#ffd781",
      emissiveIntensity: 1.8,
    });
    const width = profile.width;
    const length = profile.length;
    const body = mesh(
      new THREE.BoxGeometry(width, 5.2, length),
      bodyMaterial,
      car,
      new THREE.Vector3(0, 5, 0),
    );
    body.scale.set(1, 0.78, 1);
    mesh(
      new THREE.BoxGeometry(width * 0.72, 4.5, length * 0.47),
      glassMaterial,
      car,
      new THREE.Vector3(0, 8.5, -length * 0.08),
    );
    mesh(
      new THREE.BoxGeometry(width * 0.8, 0.8, length * 0.22),
      bodyMaterial,
      car,
      new THREE.Vector3(0, 8.3, length * 0.26),
    );

    const wheelGeometry = new THREE.CylinderGeometry(3.1, 3.1, 2.8, 16);
    for (const x of [-width * 0.52, width * 0.52]) {
      for (const z of [-length * 0.31, length * 0.31]) {
        const wheel = mesh(
          wheelGeometry,
          trimMaterial,
          car,
          new THREE.Vector3(x, 3.2, z),
        );
        wheel.rotation.z = Math.PI / 2;
      }
    }
    for (const x of [-width * 0.31, width * 0.31]) {
      mesh(
        new THREE.BoxGeometry(width * 0.22, 1.4, 0.8),
        lightMaterial,
        car,
        new THREE.Vector3(x, 5.4, length * 0.51),
      );
    }
    const tailLightMaterial = new THREE.MeshStandardMaterial({
      color: "#f0445b",
      emissive: "#f51b3d",
      emissiveIntensity: 1.5,
    });
    for (const x of [-width * 0.33, width * 0.33]) {
      mesh(
        new THREE.BoxGeometry(width * 0.2, 1.4, 0.8),
        tailLightMaterial,
        car,
        new THREE.Vector3(x, 5.2, -length * 0.51),
      );
    }
    if (profile.body === "rally" || profile.body === "hyper") {
      mesh(
        new THREE.BoxGeometry(width * 0.95, 1.2, 2),
        trimMaterial,
        car,
        new THREE.Vector3(0, 8, -length * 0.47),
      );
      for (const x of [-width * 0.38, width * 0.38]) {
        mesh(
          new THREE.BoxGeometry(1.2, 3.5, 1.2),
          trimMaterial,
          car,
          new THREE.Vector3(x, 6.2, -length * 0.46),
        );
      }
    }
    if (profile.body === "hyper") {
      const splitter = mesh(
        new THREE.BoxGeometry(width * 1.08, 0.8, 3.5),
        trimMaterial,
        car,
        new THREE.Vector3(0, 3.1, length * 0.52),
      );
      splitter.castShadow = false;
    }
    return car;
  }
}
