import {
  CAR_CATALOG,
  createDrivingCar,
  DRIVING_TRACKS,
  getRacePosition,
  getRaceReward,
  nearestTrackPointIndex,
  RALLY_RIVALS,
  stepDriving,
  type CarProfile,
  type DrivingCar,
  type DrivingInput,
  type DrivingTrack,
  type DrivingUpgrades,
} from "./driving";
import { DrivingRenderer } from "./driving-renderer";

type DrivingSave = {
  credits: number;
  wins: number;
  upgrades: DrivingUpgrades;
  bestTimes: Record<string, number>;
  ownedCars: string[];
  activeCar: string;
  carUpgrades: Record<string, DrivingUpgrades>;
  paints: Record<string, string>;
  careerXp: number;
};

const SAVE_KEY = "starfall-arcade-rally-v1";
const LAP_COUNT = 3;
const BASE_UPGRADES: DrivingUpgrades = { engine: 0, tires: 0, turbo: 0 };

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text = "",
): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  result.className = className;
  result.textContent = text;
  return result;
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = (seconds % 60).toFixed(2).padStart(5, "0");
  return `${minutes}:${remainder}`;
}

function defaultSave(): DrivingSave {
  return {
    credits: 500,
    wins: 0,
    upgrades: { ...BASE_UPGRADES },
    bestTimes: {},
    ownedCars: ["comet-gt"],
    activeCar: "comet-gt",
    carUpgrades: { "comet-gt": { ...BASE_UPGRADES } },
    paints: {},
    careerXp: 0,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function savedLevel(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function savedUpgrades(value: unknown, fallback: DrivingUpgrades = BASE_UPGRADES): DrivingUpgrades {
  const upgrades = isRecord(value) ? value : {};
  return {
    engine: savedLevel(upgrades.engine ?? fallback.engine),
    tires: savedLevel(upgrades.tires ?? fallback.tires),
    turbo: savedLevel(upgrades.turbo ?? fallback.turbo),
  };
}

function careerRank(xp: number): number {
  return 1 + Math.floor(xp / 300);
}

export class DrivingGame {
  readonly element: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: DrivingRenderer;
  private readonly trackSelect: HTMLSelectElement;
  private readonly carSelect: HTMLSelectElement;
  private readonly paintPicker: HTMLInputElement;
  private readonly carStore: HTMLElement;
  private readonly startButton: HTMLButtonElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly status: HTMLElement;
  private readonly speedValue: HTMLElement;
  private readonly lapValue: HTMLElement;
  private readonly positionValue: HTMLElement;
  private readonly timerValue: HTMLElement;
  private readonly nitroFill: HTMLElement;
  private readonly driftValue: HTMLElement;
  private readonly garageStats: HTMLElement;
  private readonly garage: HTMLElement;
  private readonly garageTitle: HTMLElement;
  private readonly upgradeButtons: HTMLButtonElement[] = [];
  private readonly keys = new Set<string>();
  private save: DrivingSave;
  private saveWarning = "";
  private track: DrivingTrack = DRIVING_TRACKS[0]!;
  private car: DrivingCar = createDrivingCar(this.track);
  private active = false;
  private racing = false;
  private paused = false;
  private frameQueued = false;
  private lastFrame = 0;
  private raceElapsed = 0;
  private raceProgress = 0;
  private previousTrackIndex = 0;
  private lastCheckpoint = 0;
  private bestTime = 0;

  constructor(private readonly onBack: () => void) {
    this.save = this.loadSave();
    this.element = node("section", "driving-screen");
    const header = node("header", "driving-header");
    const title = node("div", "driving-heading");
    title.append(
      node("p", "hub-eyebrow", "STARFALL ARCADE · RALLY SERIES"),
      node("h2", "driving-title", "Nebula Rally"),
    );
    const backButton = node("button", "arcade-button", "← GAME LIBRARY");
    backButton.type = "button";
    backButton.addEventListener("click", this.onBack);
    header.append(title, backButton);

    const raceBar = node("div", "race-toolbar");
    const trackLabel = node("label", "track-select-label", "ROUTE");
    this.trackSelect = node("select", "track-select");
    this.trackSelect.setAttribute("aria-label", "Choose rally route");
    for (const track of DRIVING_TRACKS) {
      const option = node("option", "", track.name);
      option.value = track.id;
      this.trackSelect.append(option);
    }
    this.trackSelect.addEventListener("change", () => this.selectTrack(this.trackSelect.value));
    trackLabel.append(this.trackSelect);
    this.startButton = node("button", "race-action-button", "START 3-LAP RACE");
    this.startButton.type = "button";
    this.startButton.addEventListener("click", () => this.startRace());
    this.pauseButton = node("button", "race-action-button race-pause", "PAUSE");
    this.pauseButton.type = "button";
    this.pauseButton.disabled = true;
    this.pauseButton.addEventListener("click", () => this.togglePause());
    this.status = node("p", "race-status", "Choose a route, tune your car, then race.");
    if (this.saveWarning) this.status.textContent = this.saveWarning;
    raceBar.append(trackLabel, this.startButton, this.pauseButton, this.status);

    const stats = node("div", "race-stats");
    this.speedValue = this.addStat(stats, "SPEED", "0 km/h");
    this.lapValue = this.addStat(stats, "LAP", "—");
    this.positionValue = this.addStat(stats, "POSITION", "—");
    this.timerValue = this.addStat(stats, "TIME / BEST", "0:00.00");
    const nitroPanel = node("div", "race-stat nitro-stat");
    nitroPanel.append(node("span", "race-stat-label", "NITRO"));
    const nitroTrack = node("span", "nitro-track");
    this.nitroFill = node("span", "nitro-fill");
    nitroTrack.append(this.nitroFill);
    nitroPanel.append(nitroTrack);
    this.driftValue = this.addStat(stats, "DRIFT SCORE", "0");
    stats.append(nitroPanel);

    this.canvas = node("canvas", "rally-canvas");
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute(
      "aria-label",
      "Third-person Nebula Rally driving view. Drive with WASD or arrow keys, boost with Shift, and drift with Space.",
    );
    const raceView = node("div", "race-view");
    raceView.append(this.canvas, stats);

    const controls = node("div", "driving-controls");
    controls.append(node("span", "controls-caption", "DRIVE"));
    const controlButtons: [string, string][] = [
      ["ArrowLeft", "◀ STEER"],
      ["ArrowUp", "▲ THROTTLE"],
      ["ArrowDown", "▼ BRAKE"],
      ["ArrowRight", "STEER ▶"],
      ["Shift", "BOOST"],
      [" ", "DRIFT"],
    ];
    for (const [key, label] of controlButtons) {
      const button = node("button", "drive-control-button", label);
      button.type = "button";
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        this.keys.add(key);
        button.setPointerCapture(event.pointerId);
      });
      const release = () => this.keys.delete(key);
      button.addEventListener("pointerup", release);
      button.addEventListener("pointercancel", release);
      button.addEventListener("lostpointercapture", release);
      controls.append(button);
    }

    this.garage = node("section", "rally-garage");
    const garageHeader = node("div", "garage-heading");
    this.garageTitle = node("div", "garage-title", "ENGINEER BAY");
    garageHeader.append(
      this.garageTitle,
      node("div", "garage-description", "Earn race credits and install upgrades in the pit lane."),
    );
    this.garageStats = node("div", "garage-stats", "");
    const upgrades = node("div", "rally-upgrades");
    const upgradeOptions: { key: keyof DrivingUpgrades; name: string; description: string }[] = [
      { key: "engine", name: "Ion motor", description: "+45 km/h top speed and stronger launch." },
      { key: "tires", name: "Mag-grip wheels", description: "Sharper steering and more control." },
      { key: "turbo", name: "Flux turbocharger", description: "Longer boost and faster nitro recovery." },
    ];
    for (const option of upgradeOptions) {
      const card = node("div", "upgrade-card");
      card.append(
        node("strong", "upgrade-title", option.name),
        node("span", "upgrade-description", option.description),
      );
      const button = node("button", "upgrade-buy", "");
      button.type = "button";
      button.addEventListener("click", () => this.buyUpgrade(option.key));
      card.append(button);
      upgrades.append(card);
      this.upgradeButtons.push(button);
    }
    this.garage.append(garageHeader, this.garageStats, upgrades);
    this.element.append(header, raceBar, raceView, controls, this.garage);
    const context = this.canvas.getContext("2d");
    if (!context) throw new Error("The browser could not create the rally canvas context.");
    this.context = context;

    window.addEventListener("keydown", (event) => this.onKeyDown(event));
    window.addEventListener("keyup", (event) => this.keys.delete(event.key.toLowerCase()));
    window.addEventListener("resize", () => this.resize());
    this.resize();
    this.renderGarage();
    this.draw();
  }

  activate(): void {
    this.active = true;
    this.lastFrame = 0;
    this.resize();
    this.canvas.focus();
    if (!this.frameQueued) {
      this.frameQueued = true;
      window.requestAnimationFrame((time) => this.loop(time));
    }
  }

  deactivate(): void {
    this.active = false;
    this.keys.clear();
    this.paused = false;
    this.racing = false;
    this.pauseButton.disabled = true;
    this.pauseButton.textContent = "PAUSE";
  }

  private addStat(parent: HTMLElement, label: string, value: string): HTMLElement {
    const stat = node("div", "race-stat");
    stat.append(node("span", "race-stat-label", label));
    const valueElement = node("strong", "race-stat-value", value);
    stat.append(valueElement);
    parent.append(stat);
    return valueElement;
  }

  private loadSave(): DrivingSave {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return defaultSave();
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed)) {
        this.saveWarning = "Rally career save was invalid. A new career has started.";
        return defaultSave();
      }
      const upgrades = isRecord(parsed.upgrades) ? parsed.upgrades : {};
      const bestTimes: Record<string, number> = {};
      if (isRecord(parsed.bestTimes)) {
        for (const track of DRIVING_TRACKS) {
          const time = parsed.bestTimes[track.id];
          if (typeof time === "number" && Number.isFinite(time) && time > 0) {
            bestTimes[track.id] = time;
          }
        }
      }
      return {
        credits:
          typeof parsed.credits === "number" && Number.isFinite(parsed.credits)
            ? Math.max(0, parsed.credits)
            : 500,
        wins: savedLevel(parsed.wins),
        upgrades: {
          engine: savedLevel(upgrades.engine),
          tires: savedLevel(upgrades.tires),
          turbo: savedLevel(upgrades.turbo),
        },
        bestTimes,
      };
    } catch (error) {
      this.saveWarning =
        error instanceof Error
          ? `Rally career save could not be read: ${error.message}`
          : "Rally career save could not be read.";
      return defaultSave();
    }
  }

  private saveProgress(): void {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(this.save));
    } catch (error) {
      this.status.textContent =
        error instanceof Error
          ? `Career save unavailable: ${error.message}`
          : "Career save unavailable.";
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (!this.active) return;
    const key = event.key.toLowerCase();
    if (
      [
        "w",
        "a",
        "s",
        "d",
        "arrowup",
        "arrowdown",
        "arrowleft",
        "arrowright",
        "shift",
        " ",
      ].includes(key)
    ) {
      event.preventDefault();
      this.keys.add(key === " " ? " " : key);
    }
    if (key === "escape" && this.racing) {
      this.togglePause();
      event.preventDefault();
    }
  }

  private selectTrack(id: string): void {
    const selected = DRIVING_TRACKS.find((item) => item.id === id);
    if (!selected) return;
    this.track = selected;
    this.car = createDrivingCar(this.track);
    this.bestTime = this.save.bestTimes[this.track.id] ?? 0;
    this.draw();
  }

  private startRace(): void {
    this.track =
      DRIVING_TRACKS.find((item) => item.id === this.trackSelect.value) ?? DRIVING_TRACKS[0]!;
    this.car = createDrivingCar(this.track);
    this.raceElapsed = 0;
    this.raceProgress = 0;
    this.previousTrackIndex = nearestTrackPointIndex(this.car, this.track);
    this.lastCheckpoint = 0;
    this.racing = true;
    this.paused = false;
    this.pauseButton.disabled = false;
    this.pauseButton.textContent = "PAUSE";
    this.trackSelect.disabled = true;
    this.startButton.disabled = true;
    this.garage.hidden = true;
    this.startButton.textContent = "RACE IN PROGRESS";
    this.status.textContent = "Three laps. Hit every checkpoint and push for a clean run.";
    this.canvas.focus();
  }

  private togglePause(): void {
    if (!this.racing) return;
    this.paused = !this.paused;
    this.keys.clear();
    this.pauseButton.textContent = this.paused ? "RESUME" : "PAUSE";
    this.status.textContent = this.paused ? "Race paused · take a breather." : "Race resumed.";
  }

  private buyUpgrade(key: keyof DrivingUpgrades): void {
    const level = this.save.upgrades[key];
    const baseCost = key === "engine" ? 250 : key === "tires" ? 200 : 300;
    const cost = Math.ceil(baseCost * 1.8 ** level);
    if (this.save.credits < cost) return;
    this.save.credits -= cost;
    this.save.upgrades[key] += 1;
    this.saveProgress();
    this.renderGarage();
  }

  private input(): DrivingInput {
    return {
      throttle: this.keys.has("w") || this.keys.has("arrowup"),
      brake: this.keys.has("s") || this.keys.has("arrowdown"),
      steer:
        Number(this.keys.has("d") || this.keys.has("arrowright")) -
        Number(this.keys.has("a") || this.keys.has("arrowleft")),
      boost: this.keys.has("shift"),
      drift: this.keys.has(" "),
    };
  }

  private loop(timestamp: number): void {
    this.frameQueued = false;
    if (!this.active) return;
    const dt = this.lastFrame === 0 ? 0 : Math.min((timestamp - this.lastFrame) / 1000, 0.05);
    this.lastFrame = timestamp;
    if (dt > 0 && this.racing && !this.paused) this.update(dt);
    this.draw();
    this.frameQueued = true;
    window.requestAnimationFrame((nextTime) => this.loop(nextTime));
  }

  private update(dt: number): void {
    this.raceElapsed += dt;
    stepDriving(this.car, this.input(), dt, this.track, this.save.upgrades);
    const nearest = nearestTrackPointIndex(this.car, this.track);
    const count = this.track.points.length;
    const forwardDelta = (nearest - this.previousTrackIndex + count) % count;
    if (forwardDelta <= 8) this.raceProgress += forwardDelta;
    this.previousTrackIndex = nearest;

    const lapProgress = this.raceProgress % count;
    const checkpoint = Math.floor(lapProgress / (count / 4));
    if (checkpoint !== this.lastCheckpoint) {
      this.lastCheckpoint = checkpoint;
      if (checkpoint > 0) this.status.textContent = "Checkpoint passed · keep pushing!";
    }
    if (this.raceProgress >= count * LAP_COUNT) this.finishRace();
    this.renderRaceStats();
  }

  private finishRace(): void {
    this.racing = false;
    this.trackSelect.disabled = false;
    this.startButton.disabled = false;
    this.pauseButton.disabled = true;
    this.pauseButton.textContent = "PAUSE";
    const position = getRacePosition(this.raceProgress, this.raceElapsed);
    const reward = getRaceReward(position, this.car.driftScore, this.raceElapsed);
    this.save.credits += reward;
    if (position === 1) this.save.wins += 1;
    const best = this.save.bestTimes[this.track.id] ?? Number.POSITIVE_INFINITY;
    if (this.raceElapsed < best) this.save.bestTimes[this.track.id] = this.raceElapsed;
    this.bestTime = this.save.bestTimes[this.track.id] ?? this.raceElapsed;
    this.status.textContent =
      reward > 0
        ? `P${position} FINISH · ${formatTime(this.raceElapsed)} · +${reward} credits`
        : `P${position} FINISH · no payout this time. Tune your car and race again.`;
    this.garageTitle.textContent = `POST-RACE PIT STOP · P${position}`;
    this.garage.hidden = false;
    this.startButton.textContent = "RACE AGAIN";
    this.saveProgress();
    this.renderGarage();
  }

  private resize(): void {
    const bounds = this.canvas.getBoundingClientRect();
    const width = Math.max(320, bounds.width);
    const height = Math.max(300, bounds.height);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * pixelRatio);
    this.canvas.height = Math.round(height * pixelRatio);
    this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    this.draw();
  }

  private projectTrackPoint(
    point: { x: number; y: number },
    heading: number,
  ): { x: number; y: number; scale: number; depth: number } | null {
    const dx = point.x - this.car.x;
    const dy = point.y - this.car.y;
    const forward = dx * Math.cos(heading) + dy * Math.sin(heading);
    const lateral = -dx * Math.sin(heading) + dy * Math.cos(heading);
    const depth = forward + 90;
    if (depth <= 18) return null;
    const scale = 390 / depth;
    return { x: 500 + lateral * scale, y: 205 + 90 * scale, scale, depth };
  }

  private drawRivalCar(
    point: { x: number; y: number; scale: number },
    angle: number,
    color: string,
  ): void {
    const ctx = this.context;
    const size = Math.max(0.35, Math.min(1.7, point.scale));
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(angle);
    ctx.scale(size, size);
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.beginPath();
    ctx.ellipse(0, 3, 27, 38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#090e15";
    ctx.fillRect(-25, -25, 10, 24);
    ctx.fillRect(15, -25, 10, 24);
    ctx.fillRect(-25, 14, 10, 24);
    ctx.fillRect(15, 14, 10, 24);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-20, 34);
    ctx.lineTo(-25, 4);
    ctx.lineTo(-18, -30);
    ctx.lineTo(-11, -38);
    ctx.lineTo(11, -38);
    ctx.lineTo(18, -30);
    ctx.lineTo(25, 4);
    ctx.lineTo(20, 34);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#172434";
    ctx.beginPath();
    ctx.moveTo(-13, -12);
    ctx.lineTo(-9, -29);
    ctx.lineTo(9, -29);
    ctx.lineTo(13, -12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffb2a1";
    ctx.fillRect(-17, 24, 7, 4);
    ctx.fillRect(10, 24, 7, 4);
    ctx.restore();
  }

  private drawPlayerCar(steering: number, drifting: boolean): void {
    const ctx = this.context;
    ctx.save();
    ctx.translate(500 + steering * 10, 598);
    ctx.rotate(-steering * 0.035);
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.beginPath();
    ctx.ellipse(0, 23, 112, 62, 0, 0, Math.PI * 2);
    ctx.fill();
    if (drifting) {
      ctx.fillStyle = "rgba(204, 225, 233, 0.28)";
      for (let index = 0; index < 5; index += 1) {
        ctx.beginPath();
        ctx.arc(-65 + index * 32, 54 + (index % 2) * 9, 8 + index * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = "#070c12";
    ctx.fillRect(-94, -21, 24, 77);
    ctx.fillRect(70, -21, 24, 77);
    ctx.fillStyle = "#182532";
    ctx.fillRect(-97, -27, 26, 19);
    ctx.fillRect(71, -27, 26, 19);
    ctx.fillStyle = "#159a91";
    ctx.beginPath();
    ctx.moveTo(-73, 72);
    ctx.lineTo(-85, 20);
    ctx.lineTo(-72, -45);
    ctx.lineTo(-54, -78);
    ctx.lineTo(54, -78);
    ctx.lineTo(72, -45);
    ctx.lineTo(85, 20);
    ctx.lineTo(73, 72);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#42ebc6";
    ctx.beginPath();
    ctx.moveTo(-62, 42);
    ctx.lineTo(-71, 2);
    ctx.lineTo(-60, -43);
    ctx.lineTo(-45, -64);
    ctx.lineTo(45, -64);
    ctx.lineTo(60, -43);
    ctx.lineTo(71, 2);
    ctx.lineTo(62, 42);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#102332";
    ctx.beginPath();
    ctx.moveTo(-44, -30);
    ctx.lineTo(-34, -56);
    ctx.lineTo(34, -56);
    ctx.lineTo(44, -30);
    ctx.lineTo(37, -2);
    ctx.lineTo(-37, -2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#d9fff6";
    ctx.fillRect(-64, 46, 26, 9);
    ctx.fillRect(38, 46, 26, 9);
    ctx.fillStyle = "#f44e6a";
    ctx.fillRect(-73, 31, 14, 18);
    ctx.fillRect(59, 31, 14, 18);
    ctx.fillStyle = "#c8faff";
    ctx.fillRect(-26, 55, 52, 5);
    ctx.restore();
  }

  private draw(): void {
    if (!this.context) return;
    const width = this.canvas.clientWidth || 900;
    const height = this.canvas.clientHeight || 520;
    const ctx = this.context;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = ROAD_BACKGROUND;
    ctx.fillRect(0, 0, width, height);
    const ratio = Math.min(width / 1000, height / 700);
    const offsetX = (width - 1000 * ratio) / 2;
    const offsetY = (height - 700 * ratio) / 2;
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(ratio, ratio);
    const horizon = 205;
    const landscape = ctx.createLinearGradient(0, 0, 0, horizon);
    landscape.addColorStop(0, "#10243b");
    landscape.addColorStop(0.66, "#6a8492");
    landscape.addColorStop(1, "#c2a983");
    ctx.fillStyle = landscape;
    ctx.fillRect(0, 0, 1000, horizon);
    const grass = ctx.createLinearGradient(0, horizon, 0, 700);
    grass.addColorStop(0, "#40593c");
    grass.addColorStop(1, "#0b201c");
    ctx.fillStyle = grass;
    ctx.fillRect(0, horizon, 1000, 700 - horizon);
    ctx.fillStyle = "rgba(240, 218, 164, 0.42)";
    ctx.beginPath();
    ctx.arc(815, 118, 42, 0, Math.PI * 2);
    ctx.fill();

    const nearestIndex = nearestTrackPointIndex(this.car, this.track);
    ctx.fillStyle = "rgba(13, 29, 34, 0.82)";
    for (let index = 0; index < 13; index += 1) {
      const buildingX = index * 84 + 12;
      const buildingHeight = 16 + ((index * 47) % 40);
      ctx.fillRect(buildingX, horizon - buildingHeight, 48, buildingHeight);
      ctx.fillStyle = "rgba(198, 222, 164, 0.5)";
      for (let window = 0; window < 3; window += 1) {
        ctx.fillRect(buildingX + 8 + window * 13, horizon - buildingHeight + 7, 5, 4);
      }
      ctx.fillStyle = "rgba(13, 29, 34, 0.82)";
    }

    const roadEdges: { left: { x: number; y: number }[]; right: { x: number; y: number }[] } = {
      left: [],
      right: [],
    };
    const roadSurface: typeof roadEdges = { left: [], right: [] };
    for (let step = 0; step < 135; step += 1) {
      const index = (nearestIndex + step) % this.track.points.length;
      const point = this.track.points[index]!;
      const previous =
        this.track.points[(index - 1 + this.track.points.length) % this.track.points.length]!;
      const next = this.track.points[(index + 1) % this.track.points.length]!;
      const tangentX = next.x - previous.x;
      const tangentY = next.y - previous.y;
      const tangentLength = Math.hypot(tangentX, tangentY) || 1;
      const normalX = -tangentY / tangentLength;
      const normalY = tangentX / tangentLength;
      const outerLeft = this.projectTrackPoint(
        {
          x: point.x + normalX * this.track.roadWidth * 0.68,
          y: point.y + normalY * this.track.roadWidth * 0.68,
        },
        this.car.heading,
      );
      const outerRight = this.projectTrackPoint(
        {
          x: point.x - normalX * this.track.roadWidth * 0.68,
          y: point.y - normalY * this.track.roadWidth * 0.68,
        },
        this.car.heading,
      );
      const innerLeft = this.projectTrackPoint(
        {
          x: point.x + normalX * this.track.roadWidth * 0.5,
          y: point.y + normalY * this.track.roadWidth * 0.5,
        },
        this.car.heading,
      );
      const innerRight = this.projectTrackPoint(
        {
          x: point.x - normalX * this.track.roadWidth * 0.5,
          y: point.y - normalY * this.track.roadWidth * 0.5,
        },
        this.car.heading,
      );
      if (!outerLeft || !outerRight || !innerLeft || !innerRight) {
        if (step > 0) break;
        continue;
      }
      roadEdges.left.push(outerLeft);
      roadEdges.right.push(outerRight);
      roadSurface.left.push(innerLeft);
      roadSurface.right.push(innerRight);
    }

    const fillRoad = (edges: typeof roadEdges, color: string): void => {
      if (edges.left.length < 2 || edges.right.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(edges.left[0]!.x, edges.left[0]!.y);
      for (const point of edges.left.slice(1)) ctx.lineTo(point.x, point.y);
      for (const point of [...edges.right].reverse()) ctx.lineTo(point.x, point.y);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    };
    fillRoad(roadEdges, "#171d25");
    fillRoad(roadSurface, "#343b45");

    for (let step = 7; step < 130; step += 14) {
      const index = (nearestIndex + step) % this.track.points.length;
      const point = this.track.points[index]!;
      const next = this.track.points[(index + 3) % this.track.points.length]!;
      const projection = this.projectTrackPoint(point, this.car.heading);
      const nextProjection = this.projectTrackPoint(next, this.car.heading);
      if (!projection || !nextProjection) continue;
      ctx.strokeStyle = this.track.accent;
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = Math.max(1, projection.scale * 3);
      ctx.beginPath();
      ctx.moveTo(projection.x, projection.y);
      ctx.lineTo(nextProjection.x, nextProjection.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    for (let step = 5; step < 125; step += 9) {
      const index = (nearestIndex + step) % this.track.points.length;
      const point = this.track.points[index]!;
      const previous =
        this.track.points[(index - 1 + this.track.points.length) % this.track.points.length]!;
      const next = this.track.points[(index + 1) % this.track.points.length]!;
      const tangentX = next.x - previous.x;
      const tangentY = next.y - previous.y;
      const tangentLength = Math.hypot(tangentX, tangentY) || 1;
      const normalX = -tangentY / tangentLength;
      const normalY = tangentX / tangentLength;
      for (const side of [-1, 1]) {
        const prop = this.projectTrackPoint(
          { x: point.x + normalX * 255 * side, y: point.y + normalY * 255 * side },
          this.car.heading,
        );
        if (!prop || prop.y > 690 || prop.x < -30 || prop.x > 1030) continue;
        const size = Math.min(3.2, prop.scale);
        ctx.fillStyle = "#352b22";
        ctx.fillRect(prop.x - 3 * size, prop.y - 20 * size, 6 * size, 20 * size);
        ctx.fillStyle = this.track.accent;
        ctx.beginPath();
        ctx.arc(prop.x, prop.y - 22 * size, 14 * size, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(211, 255, 202, 0.65)";
        ctx.beginPath();
        ctx.arc(prop.x - 4 * size, prop.y - 27 * size, 5 * size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    RALLY_RIVALS.forEach((rival, index) => {
      if (!this.racing && this.raceProgress === 0) return;
      const progress =
        (this.raceElapsed * rival.progressRate + index * 45) % this.track.points.length;
      const rivalIndex = Math.floor(progress);
      const rivalPoint = this.track.points[rivalIndex]!;
      const next = this.track.points[(rivalIndex + 1) % this.track.points.length]!;
      const projection = this.projectTrackPoint(rivalPoint, this.car.heading);
      const nextProjection = this.projectTrackPoint(next, this.car.heading);
      if (!projection || !nextProjection || projection.y > 620) return;
      this.drawRivalCar(
        projection,
        Math.atan2(nextProjection.y - projection.y, nextProjection.x - projection.x) + Math.PI / 2,
        rival.color,
      );
    });

    const steer = this.input().steer;
    this.drawPlayerCar(steer, this.input().drift && Math.abs(this.car.speed) > 85);
    if (this.paused) {
      ctx.fillStyle = "rgba(4, 10, 18, 0.74)";
      ctx.fillRect(300, 290, 400, 90);
      ctx.fillStyle = "#eaf7ff";
      ctx.font = "800 26px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("RACE PAUSED", 500, 345);
    }
    ctx.restore();
    this.renderRaceStats();
  }

  private renderRaceStats(): void {
    this.speedValue.textContent = `${Math.max(0, Math.round(Math.abs(this.car.speed) * 0.68))} km/h`;
    if (this.racing) {
      const completedLaps = Math.floor(this.raceProgress / this.track.points.length);
      const lapNumber = Math.min(LAP_COUNT, completedLaps + 1);
      this.lapValue.textContent = `${lapNumber} / ${LAP_COUNT}`;
      this.positionValue.textContent =
        `${getRacePosition(this.raceProgress, this.raceElapsed)} / 4`;
    } else {
      this.lapValue.textContent = this.save.wins > 0 ? `${this.save.wins} FINISHES` : "READY";
      this.positionValue.textContent = "—";
    }
    this.timerValue.textContent = `${formatTime(this.raceElapsed)} / ${
      this.bestTime ? formatTime(this.bestTime) : "—"
    }`;
    this.nitroFill.style.width = `${this.car.nitro}%`;
    this.driftValue.textContent = formatNumber(this.car.driftScore);
  }

  private renderGarage(): void {
    this.garageStats.textContent = `${formatNumber(this.save.credits)} CREDITS  ·  ${
      this.save.wins
    } RACE WINS  ·  ENGINE ${this.save.upgrades.engine} / TIRES ${
      this.save.upgrades.tires
    } / TURBO ${this.save.upgrades.turbo}`;
    (["engine", "tires", "turbo"] as const).forEach((key, index) => {
      const level = this.save.upgrades[key];
      const baseCost = key === "engine" ? 250 : key === "tires" ? 200 : 300;
      const cost = Math.ceil(baseCost * 1.8 ** level);
      const button = this.upgradeButtons[index];
      if (!button) return;
      button.textContent = `UPGRADE ${level} → ${level + 1} · ${cost} C`;
      button.disabled = this.save.credits < cost;
    });
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(value);
}
