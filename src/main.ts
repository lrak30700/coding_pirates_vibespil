import "./style.css";
import { getKillAmmoReward, type AmmoWeaponKind } from "./ammo-rewards";
import { ALIEN_PROFILES, alienForSpawn, receiveAlienHit } from "./aliens";
import {
  ARMORY_WEAPONS,
  getCoinDrop,
  STARTING_WEAPONS,
  type ArmoryWeapon,
  type Weapon,
} from "./armory";
import { FLIGHT_RING_COURSE, isFlightRingAligned, type FlightPoint } from "./flight";
import { GameScene, type SceneEnemy, type SceneFlight } from "./game-scene";
import {
  applyPowerUp,
  DEFAULT_POWER_UP_STATS,
  getPowerUpOffers,
  type PowerUp,
  type PowerUpStats,
} from "./powerups";
import { FLOOR_HEIGHT, LEVELS, STAIR_RUN_LENGTH, type LevelDefinition } from "./levels";
import { GameHub } from "./game-hub";

type Enemy = SceneEnemy & {
  attackCooldown: number;
  dropTimer: number;
  dropDuration: number;
};
type Grenade = {
  x: number;
  y: number;
  floor: number;
  height: number;
  vx: number;
  vy: number;
  verticalVelocity: number;
  fuse: number;
};
type Coin = {
  x: number;
  y: number;
  floor: number;
  amount: number;
};
const WEAPONS: Weapon[] = STARTING_WEAPONS.map((weapon) => ({ ...weapon }));

const PLAYER_SPEED = 2.5;
const MAX_HEALTH = 100;
const LOOK_LIMIT = Math.PI / 2 - 0.01;
const WAVES_PER_LEVEL = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeAngle(angle: number): number {
  let next = angle;
  while (next < -Math.PI) next += Math.PI * 2;
  while (next > Math.PI) next -= Math.PI * 2;
  return next;
}

function tileAt(map: readonly string[], x: number, y: number): string {
  return map[Math.floor(y)]?.[Math.floor(x)] ?? "1";
}

class NeonShooter {
  private readonly canvas: HTMLCanvasElement;
  private readonly fullscreenTarget: HTMLElement;
  private readonly scene: GameScene;
  private readonly minimap: HTMLCanvasElement;
  private readonly mapContext: CanvasRenderingContext2D;
  private readonly deathOverlay: HTMLElement;
  private readonly crosshair: HTMLElement;
  private readonly damageOverlay: HTMLElement;
  private readonly commsPanel: HTMLElement;
  private readonly commsText: HTMLElement;
  private readonly resultOverlay: HTMLElement;
  private readonly menuOverlay: HTMLElement;
  private readonly menuTitle: HTMLElement;
  private readonly menuDescription: HTMLElement;
  private readonly menuActions: HTMLElement;
  private readonly powerUpOverlay: HTMLElement;
  private readonly powerUpDescription: HTMLElement;
  private readonly powerUpGrid: HTMLElement;
  private readonly powerUpShop: HTMLElement;
  private readonly ufoTimerValue: HTMLElement;
  private readonly creditsValue: HTMLElement;
  private readonly lookSensitivityInput: HTMLInputElement;
  private readonly lookSensitivityValue: HTMLElement;
  private readonly healthValue: HTMLElement;
  private readonly scoreValue: HTMLElement;
  private readonly waveValue: HTMLElement;
  private readonly ammoValue: HTMLElement;
  private readonly weaponValue: HTMLElement;
  private readonly statusText: HTMLElement;
  private readonly fullscreenButton: HTMLButtonElement;
  private readonly keys = new Set<string>();
  private readonly enemies: Enemy[] = [];
  private readonly grenades: Grenade[] = [];
  private readonly coins: Coin[] = [];
  private readonly doorPositions: { x: number; y: number }[] = [];
  private readonly openDoors = new Set<string>();
  private readonly ammo = [30, 12, 0, 3];
  private readonly reserveAmmo = [90, 36];
  private readonly player = {
    x: 2.5,
    y: 2.5,
    floor: 0,
    angle: Math.PI / 2,
    pitch: 0,
    velocityX: 0,
    velocityY: 0,
    jumpHeight: 0,
    jumpVelocity: 0,
    stairHeight: 0,
    walkPhase: 0,
    health: MAX_HEALTH,
  };
  private score = 0;
  private credits = 0;
  private state:
    | "ready"
    | "playing"
    | "flight"
    | "dying"
    | "game-over"
    | "transition"
    | "paused"
    | "powerup"
    | "victory" = "ready";
  private levelIndex = 0;
  private currentRoom = 0;
  private spawnIndex = 0;
  private lookSensitivity = 0.7;
  private weaponIndex = 0;
  private wave = 0;
  private waveCompleteHandled = false;
  private waitingForNextRoom = false;
  private waitingForExtractionRoom = false;
  private extractionReady = false;
  private aiming = false;
  private missionDuration = 240;
  private missionRemaining = 240;
  private ufoHeight = 24;
  private shotCooldown = 0;
  private reloadTimer = 0;
  private recoil = 0;
  private muzzleFlash = 0;
  private lastTime = 0;
  private lastPointerX: number | null = null;
  private lastPointerY: number | null = null;
  private hitMarkerTimer = 0;
  private damageFlashTimer = 0;
  private damageCooldown = 0;
  private statusTimer = 0;
  private deathTimer = 0;
  private deathCause: "alien" | "ufo" = "alien";
  private commsTimer = 0;
  private transitionTimer = 0;
  private flightRingIndex = 0;
  private flightDistance = 20;
  private flightPlayer: FlightPoint = { x: 0, y: 0 };
  private flightSequenceActive = false;
  private pausedState: "playing" | "flight" = "playing";
  private powerUpStats: PowerUpStats = { ...DEFAULT_POWER_UP_STATS };

  constructor(
    canvas: HTMLCanvasElement,
    hud: HTMLElement,
    private readonly playOtherGame: () => void = () => {},
    fullscreenTarget: HTMLElement = canvas.parentElement ?? canvas,
  ) {
    this.canvas = canvas;
    this.fullscreenTarget = fullscreenTarget;
    this.scene = new GameScene(canvas);
    this.healthValue = this.createHudBlock(hud, "VITALS", String(this.player.health));
    this.scoreValue = this.createHudBlock(hud, "ELIMS", String(this.score));
    this.ammoValue = this.createHudBlock(hud, "AMMO", "");
    this.weaponValue = this.createHudBlock(hud, "LOADOUT · SCROLL / 1-4", "");
    this.weaponValue.parentElement?.classList.add("loadout-block");
    this.waveValue = this.createHudBlock(hud, "WAVE", "1");
    this.waveValue.parentElement?.classList.add("wave-block");
    this.statusText = document.createElement("div");
    this.statusText.className = "status-text";
    this.statusText.textContent = "Click to deploy";
    hud.append(this.statusText);

    this.crosshair = document.createElement("div");
    this.crosshair.className = "crosshair";
    this.crosshair.setAttribute("aria-hidden", "true");
    hud.append(this.crosshair);

    this.damageOverlay = document.createElement("div");
    this.damageOverlay.className = "damage-overlay";
    this.damageOverlay.setAttribute("aria-hidden", "true");
    hud.append(this.damageOverlay);

    this.minimap = document.createElement("canvas");
    this.minimap.className = "minimap";
    this.minimap.width = 160;
    this.minimap.height = 120;
    this.minimap.setAttribute("aria-label", "Arena minimap");
    hud.append(this.minimap);
    const mapContext = this.minimap.getContext("2d");
    if (!mapContext) throw new Error("The browser could not create the minimap context.");
    this.mapContext = mapContext;

    this.deathOverlay = document.createElement("div");
    this.deathOverlay.className = "death-overlay";
    this.deathOverlay.setAttribute("aria-live", "assertive");
    this.deathOverlay.textContent = "SIGNAL LOST";
    hud.append(this.deathOverlay);

    this.commsPanel = document.createElement("section");
    this.commsPanel.className = "comms-panel";
    this.commsPanel.setAttribute("aria-live", "polite");
    const commsSender = document.createElement("strong");
    commsSender.className = "comms-sender";
    commsSender.textContent = "INCOMING · EARTH CONTROL";
    this.commsText = document.createElement("p");
    this.commsText.className = "comms-message";
    this.commsPanel.append(commsSender, this.commsText);
    hud.append(this.commsPanel);

    this.resultOverlay = document.createElement("div");
    this.resultOverlay.className = "result-overlay";
    this.resultOverlay.setAttribute("aria-live", "assertive");
    this.resultOverlay.textContent = "CAMPAIGN COMPLETE";
    hud.append(this.resultOverlay);

    this.menuOverlay = document.createElement("section");
    this.menuOverlay.className = "game-menu";
    this.menuOverlay.setAttribute("role", "dialog");
    this.menuOverlay.setAttribute("aria-modal", "true");
    this.menuOverlay.setAttribute("aria-labelledby", "game-menu-title");
    this.menuOverlay.setAttribute("aria-describedby", "game-menu-description");
    this.menuTitle = document.createElement("h2");
    this.menuTitle.id = "game-menu-title";
    this.menuDescription = document.createElement("p");
    this.menuDescription.id = "game-menu-description";
    this.menuActions = document.createElement("div");
    this.menuActions.className = "game-menu-actions";
    this.menuOverlay.append(this.menuTitle, this.menuDescription, this.menuActions);
    hud.append(this.menuOverlay);

    this.powerUpOverlay = document.createElement("section");
    this.powerUpOverlay.className = "powerup-overlay";
    this.powerUpOverlay.setAttribute("role", "dialog");
    this.powerUpOverlay.setAttribute("aria-modal", "true");
    this.powerUpOverlay.setAttribute("aria-labelledby", "powerup-title");
    this.powerUpOverlay.setAttribute("aria-describedby", "powerup-description");
    const powerUpTitle = document.createElement("h2");
    powerUpTitle.id = "powerup-title";
    powerUpTitle.textContent = "MISSION COMPLETE";
    this.powerUpDescription = document.createElement("p");
    this.powerUpDescription.id = "powerup-description";
    this.powerUpDescription.textContent = "Choose one upgrade for your next deployment";
    this.powerUpGrid = document.createElement("div");
    this.powerUpGrid.className = "powerup-grid";
    this.powerUpShop = document.createElement("div");
    this.powerUpShop.className = "powerup-shop";
    this.powerUpOverlay.append(
      powerUpTitle,
      this.powerUpDescription,
      this.powerUpGrid,
      this.powerUpShop,
    );
    hud.append(this.powerUpOverlay);

    const lookControl = document.createElement("label");
    lookControl.className = "look-control";
    const lookLabel = document.createElement("span");
    lookLabel.textContent = "MOUSE LOOK";
    this.lookSensitivityInput = document.createElement("input");
    this.lookSensitivityInput.type = "range";
    this.lookSensitivityInput.min = "0.3";
    this.lookSensitivityInput.max = "2.5";
    this.lookSensitivityInput.step = "0.1";
    this.lookSensitivityInput.value = String(this.lookSensitivity);
    this.lookSensitivityInput.setAttribute("aria-label", "Mouse look sensitivity");
    this.lookSensitivityValue = document.createElement("output");
    this.lookSensitivityValue.textContent = `${this.lookSensitivity.toFixed(1)}×`;
    this.lookSensitivityInput.addEventListener("input", () => {
      this.setLookSensitivity(Number(this.lookSensitivityInput.value));
    });
    lookControl.append(lookLabel, this.lookSensitivityInput, this.lookSensitivityValue);
    hud.append(lookControl);

    this.ufoTimerValue = document.createElement("div");
    this.ufoTimerValue.className = "mission-timer";
    this.ufoTimerValue.setAttribute("aria-label", "Time until the UFO reaches the ground");
    this.ufoTimerValue.setAttribute("aria-live", "polite");
    this.ufoTimerValue.textContent = "UFO ETA · 04:00";
    hud.append(this.ufoTimerValue);
    this.creditsValue = this.createHudBlock(hud, "CREDITS", String(this.credits));
    this.creditsValue.parentElement?.classList.add("credits-block");

    this.fullscreenButton = document.createElement("button");
    this.fullscreenButton.className = "fullscreen-button";
    this.fullscreenButton.type = "button";
    this.fullscreenButton.textContent = "FULLSCREEN";
    this.fullscreenButton.setAttribute("aria-label", "Enter fullscreen");
    this.fullscreenButton.addEventListener("click", () => void this.toggleFullscreen());
    hud.append(this.fullscreenButton);

    this.updateWeaponHud();
    this.resize();
    this.bindInput();
    this.loadLevel(0);
    this.showMenu("NEON SIEGE", "WASD move · Mouse look · Click to fire · Survive the campaign", [
      { label: "Start game", action: () => this.startGame() },
      { label: "Play other game", action: this.playOtherGame },
    ]);
  }

  private createHudBlock(hud: HTMLElement, label: string, value: string): HTMLElement {
    const block = document.createElement("div");
    block.className = "hud-block";
    const labelElement = document.createElement("span");
    labelElement.className = "hud-label";
    labelElement.textContent = label;
    const valueElement = document.createElement("strong");
    valueElement.textContent = value;
    block.append(labelElement, valueElement);
    hud.append(block);
    return valueElement;
  }

  private get weapon(): Weapon {
    return WEAPONS[this.weaponIndex] ?? WEAPONS[0]!;
  }

  private get level(): LevelDefinition {
    return LEVELS[this.levelIndex]!;
  }

  private get currentMap(): readonly string[] {
    const floor = this.level.floors[this.player.floor];
    if (!floor)
      throw new Error(`Level ${this.levelIndex + 1} has no floor ${this.player.floor + 1}.`);
    return floor.map;
  }

  private floorForRoom(room: number): number {
    return this.level.roomFloors[room] ?? 0;
  }

  private updateWeaponHud(): void {
    this.weaponValue.textContent = `${this.weapon.category} · ${this.weapon.name}`;
    if (this.weapon.kind === "knife") {
      this.ammoValue.textContent = "∞";
    } else if (this.weapon.kind === "grenade") {
      this.ammoValue.textContent = `${this.ammo[this.weaponIndex] ?? 0}`;
    } else {
      this.ammoValue.textContent = `${this.ammo[this.weaponIndex] ?? 0} / ${this.reserveAmmo[this.weaponIndex] ?? 0}`;
    }
  }

  private awardKillAmmo(weaponKind: AmmoWeaponKind): string {
    const grenadeCount = this.ammo[3] ?? 0;
    const reward =
      weaponKind === "grenade" && grenadeCount >= this.powerUpStats.maxGrenades
        ? getKillAmmoReward("knife")
        : getKillAmmoReward(weaponKind, Math.min(grenadeCount, 5));
    const amount = Math.max(1, Math.round(reward.amount * this.powerUpStats.ammoRewardMultiplier));

    if (reward.ammo === "rifle") {
      this.reserveAmmo[0] = (this.reserveAmmo[0] ?? 0) + amount;
    } else if (reward.ammo === "pistol") {
      this.reserveAmmo[1] = (this.reserveAmmo[1] ?? 0) + amount;
    } else {
      this.ammo[3] = Math.min(this.powerUpStats.maxGrenades, grenadeCount + amount);
    }
    this.updateWeaponHud();
    return `+${amount} ${reward.ammo} ammo`;
  }

  private bindInput(): void {
    window.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      if (key === "escape" && !event.repeat) {
        event.preventDefault();
        if (this.state === "paused") this.resumeGame();
        else if (this.state === "playing" || this.state === "flight") this.pauseGame();
        return;
      }
      if (this.state === "paused" || this.state === "game-over") return;
      if (this.state === "ready") {
        if (key === "[" || key === "]") {
          event.preventDefault();
          this.setLookSensitivity(this.lookSensitivity + (key === "]" ? 0.1 : -0.1));
        }
        if (["1", "2", "3", "4"].includes(key)) this.selectWeapon(Number(key) - 1);
        return;
      }
      if (this.state !== "playing" && this.state !== "flight" && this.state !== "dying") return;
      this.keys.add(key);
      if (key === "control" && this.state === "playing") this.crosshair.hidden = true;
      if (key === "[" || key === "]") {
        event.preventDefault();
        this.setLookSensitivity(this.lookSensitivity + (key === "]" ? 0.1 : -0.1));
      }
      if (event.code === "Space") {
        event.preventDefault();
        if (this.state === "playing" && this.player.jumpHeight === 0) {
          this.player.jumpVelocity = 5.2 * this.powerUpStats.jumpMultiplier;
        }
      }
      if (key === "r") this.reload();
      if (key === "e" && !event.repeat) this.tryBoardShip();
      if (["1", "2", "3", "4"].includes(key)) this.selectWeapon(Number(key) - 1);
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
        event.preventDefault();
      }
    });

    window.addEventListener("keyup", (event) => {
      const key = event.key.toLowerCase();
      this.keys.delete(key);
      if (key === "control") this.crosshair.hidden = this.state === "flight";
    });
    this.canvas.addEventListener("pointerdown", (event) => {
      if (event.button === 2) {
        if (this.state === "playing") {
          this.capturePointerLock();
          this.aiming = true;
          this.crosshair.classList.add("aiming");
        }
        return;
      }
      if (event.button !== 0) return;
      if (this.state !== "playing") return;
      this.capturePointerLock();
      this.fireWeapon();
    });
    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    window.addEventListener("pointerup", (event) => {
      if (event.button === 2) {
        this.aiming = false;
        this.crosshair.classList.remove("aiming");
      }
    });
    window.addEventListener("blur", () => {
      this.aiming = false;
      this.crosshair.classList.remove("aiming");
    });
    window.addEventListener("pointermove", (event) => {
      if (document.pointerLockElement === this.canvas) {
        this.lastPointerX = null;
        this.player.angle = normalizeAngle(
          this.player.angle + event.movementX * 0.003 * this.lookSensitivity,
        );
        this.player.pitch = clamp(
          this.player.pitch + event.movementY * 0.0026 * this.lookSensitivity,
          -LOOK_LIMIT,
          LOOK_LIMIT,
        );
        return;
      }
      if (this.state === "playing" || this.state === "dying" || this.state === "paused") return;
      const bounds = this.canvas.getBoundingClientRect();
      const inside =
        event.clientX >= bounds.left &&
        event.clientX <= bounds.right &&
        event.clientY >= bounds.top &&
        event.clientY <= bounds.bottom;
      if (!inside) {
        this.lastPointerX = null;
        this.lastPointerY = null;
        return;
      }
      if (this.lastPointerX !== null) {
        this.player.angle = normalizeAngle(
          this.player.angle + (event.clientX - this.lastPointerX) * 0.003 * this.lookSensitivity,
        );
        this.player.pitch = clamp(
          this.player.pitch +
            (event.clientY - (this.lastPointerY ?? event.clientY)) * 0.003 * this.lookSensitivity,
          -LOOK_LIMIT,
          LOOK_LIMIT,
        );
      }
      this.lastPointerX = event.clientX;
      this.lastPointerY = event.clientY;
    });
    document.addEventListener("pointerlockchange", () => {
      if (document.pointerLockElement === this.canvas) {
        this.canvas.style.cursor = "none";
        document.body.style.cursor = "none";
        this.setStatus("Mouse locked · click to fire", 2);
      } else if (this.state === "playing") {
        this.aiming = false;
        this.crosshair.classList.remove("aiming");
        this.canvas.style.cursor = "crosshair";
        document.body.style.cursor = "";
        this.setStatus("Mouse unlocked · click to recapture", 2);
      }
    });
    window.addEventListener(
      "wheel",
      (event) => {
        if (this.state !== "playing") return;
        event.preventDefault();
        const direction = event.deltaY > 0 ? 1 : -1;
        this.selectWeapon((this.weaponIndex + direction + WEAPONS.length) % WEAPONS.length);
      },
      { passive: false },
    );
    window.addEventListener("resize", () => this.resize());
    document.addEventListener("fullscreenchange", () => {
      const isFullscreen = document.fullscreenElement === this.fullscreenTarget;
      this.fullscreenButton.textContent = isFullscreen ? "EXIT FULLSCREEN" : "FULLSCREEN";
      this.fullscreenButton.setAttribute(
        "aria-label",
        isFullscreen ? "Exit fullscreen" : "Enter fullscreen",
      );
      this.resize();
    });
  }

  private async toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement === this.fullscreenTarget) {
        await document.exitFullscreen();
      } else if (typeof this.fullscreenTarget.requestFullscreen === "function") {
        await this.fullscreenTarget.requestFullscreen();
      } else {
        this.setStatus("Fullscreen is not supported by this browser");
      }
    } catch (error) {
      this.setStatus(
        error instanceof Error
          ? `Fullscreen unavailable: ${error.message}`
          : "Fullscreen unavailable",
      );
    }
  }

  private capturePointerLock(): void {
    if (document.pointerLockElement === this.canvas) return;
    void this.canvas.requestPointerLock().catch(() => {
      if (this.state === "playing") this.setStatus("Mouse look enabled", 2);
    });
  }

  private startGame(): void {
    if (this.state !== "ready") return;
    this.menuOverlay.classList.remove("active");
    this.state = "playing";
    this.canvas.style.cursor = "none";
    document.body.style.cursor = "none";
    this.capturePointerLock();
    this.showComms(this.level.comms.arrival);
    this.setStatus(`${this.level.name} · clear the rooms before the UFO lands`, 4);
  }

  private showMenu(
    title: string,
    description: string,
    actions: readonly { label: string; action: () => void }[],
  ): void {
    this.menuTitle.textContent = title;
    this.menuDescription.textContent = description;
    this.menuActions.innerHTML = "";
    for (const { label, action } of actions) {
      const button = document.createElement("button");
      button.className = "game-menu-button";
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", action);
      this.menuActions.append(button);
    }
    this.menuOverlay.classList.add("active");
    this.menuActions.querySelector<HTMLElement>("button")?.focus();
  }

  private pauseGame(): void {
    if (this.state !== "playing" && this.state !== "flight") return;
    const previousState = this.state;
    this.state = "paused";
    this.keys.clear();
    this.aiming = false;
    this.crosshair.classList.remove("aiming");
    this.canvas.style.cursor = "crosshair";
    document.body.style.cursor = "";
    document.exitPointerLock?.();
    this.showMenu("PAUSED", "The mission is on hold.", [
      { label: "Resume", action: () => this.resumeGame() },
      { label: "Restart", action: () => this.restartGame() },
      { label: "Main menu", action: () => this.returnToMainMenu() },
    ]);
    this.pausedState = previousState;
  }

  private resumeGame(): void {
    if (this.state !== "paused") return;
    this.menuOverlay.classList.remove("active");
    this.state = this.pausedState;
    if (this.state === "playing") {
      this.canvas.style.cursor = "none";
      document.body.style.cursor = "none";
      this.capturePointerLock();
    }
  }

  private restartGame(): void {
    this.menuOverlay.classList.remove("active");
    this.resetGame();
    this.startGame();
  }

  private returnToMainMenu(): void {
    this.menuOverlay.classList.remove("active");
    this.resetGame();
  }

  private updateMissionTimerHud(): void {
    const seconds = Math.max(0, Math.ceil(this.missionRemaining));
    const minutes = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const remainder = (seconds % 60).toString().padStart(2, "0");
    this.ufoTimerValue.textContent = `UFO ETA · ${minutes}:${remainder}`;
    this.ufoTimerValue.classList.toggle("urgent", seconds < 60);
  }

  private tryBoardShip(): void {
    if (this.state !== "playing" || !this.extractionReady) return;
    if (this.distanceToShuttle() > 4.5) {
      this.setStatus("Shuttle is in the final room · move closer");
      return;
    }
    this.launchShuttle();
  }

  private distanceToShuttle(): number {
    const x = (this.currentMap[0]?.length ?? 0) - 3.2;
    const y = this.currentMap.length / 2;
    return Math.hypot(this.player.x - x, this.player.y - y);
  }

  private launchShuttle(): void {
    this.aiming = false;
    this.crosshair.classList.remove("aiming");
    this.crosshair.hidden = true;
    this.keys.clear();
    this.flightRingIndex = 0;
    this.flightDistance = 20;
    this.flightPlayer = { x: 0, y: 0 };
    this.flightSequenceActive = true;
    this.state = "flight";
    this.minimap.hidden = true;
    this.ufoTimerValue.setAttribute("aria-label", "Shuttle flight ring progress");
    this.ufoTimerValue.textContent = `RING COURSE · 0/${FLIGHT_RING_COURSE.length}`;
    this.ufoTimerValue.classList.remove("urgent");
    this.setStatus(this.flightInstructions(), 100000);
  }

  private flightInstructions(): string {
    return `Flight · A/D steer · W/S climb · ring ${this.flightRingIndex + 1}/${FLIGHT_RING_COURSE.length}`;
  }

  private updateFlight(dt: number): void {
    const horizontal =
      Number(this.keys.has("d") || this.keys.has("arrowright")) -
      Number(this.keys.has("a") || this.keys.has("arrowleft"));
    const vertical =
      Number(this.keys.has("w") || this.keys.has("arrowup")) -
      Number(this.keys.has("s") || this.keys.has("arrowdown"));
    this.flightPlayer.x = clamp(this.flightPlayer.x + horizontal * dt * 3, -2.5, 2.5);
    this.flightPlayer.y = clamp(this.flightPlayer.y + vertical * dt * 2.5, -2.2, 2.2);
    this.flightDistance = Math.max(0, this.flightDistance - dt * 12);
    if (this.flightDistance > 0) return;

    const ring = FLIGHT_RING_COURSE[this.flightRingIndex];
    if (!ring) throw new Error("The shuttle flight course has no active ring.");
    if (isFlightRingAligned(this.flightPlayer, ring)) {
      this.flightRingIndex += 1;
      this.ufoTimerValue.textContent = `RING COURSE · ${this.flightRingIndex}/${FLIGHT_RING_COURSE.length}`;
      if (this.flightRingIndex === FLIGHT_RING_COURSE.length) {
        this.state = "transition";
        this.transitionTimer = 1.8;
        this.setStatus("Flight path cleared · preparing next deployment", 2);
        return;
      }
      this.setStatus(this.flightInstructions(), 100000);
    } else {
      this.setStatus(`Missed ring ${this.flightRingIndex + 1} · realign and try again`, 2);
    }
    this.flightDistance = 20;
  }

  private showPowerUpSelection(): void {
    this.state = "powerup";
    this.powerUpDescription.textContent =
      this.levelIndex < LEVELS.length - 1
        ? `Choose one upgrade for your next deployment. Spend credits below to replace weapons.`
        : "Choose your final campaign reward. Spend any remaining credits below.";
    this.keys.clear();
    this.crosshair.hidden = true;
    this.minimap.hidden = true;
    this.canvas.style.cursor = "crosshair";
    document.body.style.cursor = "";
    document.exitPointerLock?.();
    this.powerUpGrid.replaceChildren();
    for (const powerUp of getPowerUpOffers(this.levelIndex)) {
      const button = document.createElement("button");
      button.className = "powerup-choice";
      button.type = "button";
      button.setAttribute("data-rarity", powerUp.rarity);
      button.setAttribute(
        "aria-label",
        `Choose ${powerUp.rarityLabel} ${powerUp.name}. ${powerUp.description}`,
      );
      const rarity = document.createElement("span");
      rarity.className = "powerup-rarity";
      rarity.textContent = powerUp.rarityLabel;
      const title = document.createElement("strong");
      title.textContent = powerUp.name;
      const description = document.createElement("span");
      description.textContent = powerUp.description;
      const action = document.createElement("span");
      action.className = "powerup-action";
      action.textContent = "SELECT UPGRADE";
      button.append(rarity, title, description, action);
      button.addEventListener("click", () => this.choosePowerUp(powerUp));
      this.powerUpGrid.append(button);
    }
    this.renderArmory();
    this.powerUpOverlay.classList.add("active");
    this.ufoTimerValue.setAttribute("aria-label", "Mission complete");
    this.ufoTimerValue.textContent = "MISSION COMPLETE";
    this.ufoTimerValue.classList.remove("urgent");
    this.setStatus("Choose one upgrade to continue", 100000);
    this.powerUpGrid.querySelector("button")?.focus();
  }

  private renderArmory(): void {
    this.powerUpShop.innerHTML = "";
    const heading = document.createElement("h3");
    heading.textContent = `ARMORY · ${this.credits} CREDITS`;
    const description = document.createElement("p");
    description.textContent = "Purchases replace the weapon in that slot.";
    const weapons = document.createElement("div");
    weapons.className = "armory-grid";
    for (const armoryWeapon of ARMORY_WEAPONS) {
      const slot = WEAPONS.findIndex(({ category }) => category === armoryWeapon.category);
      const owned = WEAPONS[slot]?.name === armoryWeapon.name;
      const button = document.createElement("button");
      button.className = "armory-choice";
      button.type = "button";
      button.disabled = owned || this.credits < armoryWeapon.cost;
      button.setAttribute(
        "aria-label",
        `${owned ? "Owned" : this.credits < armoryWeapon.cost ? "Not enough credits for" : "Buy"} ${armoryWeapon.name}, ${armoryWeapon.cost} credits, replaces ${armoryWeapon.category.toLowerCase()}`,
      );
      const name = document.createElement("strong");
      name.textContent = `${armoryWeapon.name} · ${armoryWeapon.cost} credits`;
      const details = document.createElement("span");
      details.textContent = owned
        ? `Owned · replaces ${armoryWeapon.category.toLowerCase()}`
        : `DMG ${armoryWeapon.damage} · ${armoryWeapon.magazine || "∞"} rounds · replaces ${armoryWeapon.category.toLowerCase()}`;
      button.append(name, details);
      button.addEventListener("click", () => this.buyWeapon(armoryWeapon));
      weapons.append(button);
    }
    this.powerUpShop.append(heading, description, weapons);
  }

  private buyWeapon(armoryWeapon: ArmoryWeapon): void {
    if (this.state !== "powerup") return;
    const slot = WEAPONS.findIndex(({ category }) => category === armoryWeapon.category);
    if (slot < 0 || this.credits < armoryWeapon.cost) return;
    if (WEAPONS[slot]?.name === armoryWeapon.name) return;
    this.credits -= armoryWeapon.cost;
    WEAPONS[slot] = {
      category: armoryWeapon.category,
      name: armoryWeapon.name,
      damage: armoryWeapon.damage,
      cooldown: armoryWeapon.cooldown,
      magazine: armoryWeapon.magazine,
      kind: armoryWeapon.kind,
    };
    if (armoryWeapon.kind === "rifle" || armoryWeapon.kind === "pistol") {
      this.ammo[slot] = armoryWeapon.magazine;
    } else if (armoryWeapon.kind === "grenade") {
      this.ammo[slot] = Math.min(this.powerUpStats.maxGrenades, armoryWeapon.magazine);
    }
    this.creditsValue.textContent = String(this.credits);
    this.updateWeaponHud();
    this.renderArmory();
    this.setStatus(`${armoryWeapon.name} purchased · weapon slot replaced`, 4);
  }

  private choosePowerUp(powerUp: PowerUp): void {
    if (this.state !== "powerup") return;
    this.applyPowerUp(powerUp);
    this.powerUpOverlay.classList.remove("active");

    if (this.levelIndex < LEVELS.length - 1) {
      this.loadLevel(this.levelIndex + 1);
      this.state = "playing";
      this.showComms(this.level.comms.arrival);
      this.setStatus(
        `${powerUp.rarityLabel} ${powerUp.name} acquired · ${this.level.name} · survive all four rooms before impact`,
        5,
      );
      return;
    }

    this.state = "victory";
    this.resultOverlay.classList.add("active");
    this.setStatus(`${powerUp.rarityLabel} ${powerUp.name} acquired · campaign complete`, 100000);
  }

  private applyPowerUp(powerUp: PowerUp): void {
    this.powerUpStats = applyPowerUp(
      {
        ...this.powerUpStats,
        health: this.player.health,
        rifleReserve: this.reserveAmmo[0] ?? 0,
        pistolReserve: this.reserveAmmo[1] ?? 0,
        grenades: this.ammo[3] ?? 0,
      },
      powerUp,
    );
    this.player.health = this.powerUpStats.health;
    this.reserveAmmo[0] = this.powerUpStats.rifleReserve;
    this.reserveAmmo[1] = this.powerUpStats.pistolReserve;
    this.ammo[3] = this.powerUpStats.grenades;
    this.updateWeaponHud();
  }

  private dropCoins(enemy: Pick<Enemy, "x" | "y" | "floor" | "kind">): void {
    this.coins.push({
      x: enemy.x,
      y: enemy.y,
      floor: enemy.floor,
      amount: getCoinDrop(enemy.kind),
    });
  }

  private updateCoins(): void {
    for (let index = this.coins.length - 1; index >= 0; index -= 1) {
      const coin = this.coins[index];
      if (!coin || coin.floor !== this.player.floor) continue;
      if (Math.hypot(coin.x - this.player.x, coin.y - this.player.y) > 0.8) continue;
      this.credits += coin.amount;
      this.coins.splice(index, 1);
      this.creditsValue.textContent = String(this.credits);
      this.setStatus(`Credits collected · +${coin.amount}`, 1.5);
    }
  }

  private checkShuttleProximity(): void {
    if (!this.extractionReady || this.state !== "playing") return;
    const distance = this.distanceToShuttle();
    if (distance <= 1.35) {
      this.launchShuttle();
    } else if (distance <= 4.5 && this.statusTimer === 0) {
      this.setStatus("Shuttle in range · press E or move closer", 1.5);
    }
  }

  private loadLevel(index: number): void {
    const level = LEVELS[index];
    if (!level) throw new Error(`Campaign level ${index + 1} is not defined.`);
    this.levelIndex = index;
    this.player.floor = 0;
    this.flightSequenceActive = false;
    this.crosshair.hidden = false;
    this.minimap.hidden = false;
    this.scene.loadLevel(level.floors, level.palette);
    this.minimap.setAttribute("aria-label", `${level.name} map and nearby hostiles`);
    this.ufoTimerValue.setAttribute("aria-label", "Time until the UFO reaches the ground");
    this.doorPositions.splice(0);
    for (let y = 0; y < level.map.length; y += 1) {
      for (let x = 0; x < (level.map[y]?.length ?? 0); x += 1) {
        if (level.map[y]?.[x] === "5") this.doorPositions.push({ x, y });
      }
    }
    this.openDoors.clear();
    this.currentRoom = 0;
    this.waveCompleteHandled = false;
    this.waitingForNextRoom = false;
    this.waitingForExtractionRoom = false;
    this.extractionReady = false;
    this.aiming = false;
    this.damageCooldown = 0;
    this.missionDuration = 240 + index * 18;
    this.missionRemaining = this.missionDuration;
    this.ufoHeight = Math.max(22, this.currentMap.length * 1.1);
    this.updateMissionTimerHud();
    this.player.x = level.playerSpawn.x;
    this.player.y = level.playerSpawn.y;
    this.player.angle = level.playerSpawn.angle;
    this.player.pitch = 0;
    this.player.velocityX = 0;
    this.player.velocityY = 0;
    this.player.jumpHeight = 0;
    this.player.jumpVelocity = 0;
    this.enemies.splice(0);
    this.grenades.splice(0);
    this.coins.splice(0);
    this.beginWave(1, false);
  }

  private showComms(message: string): void {
    this.commsText.textContent = message;
    this.commsPanel.classList.add("active");
    this.commsTimer = 6.5;
  }

  private setLookSensitivity(value: number): void {
    this.lookSensitivity = Math.round(clamp(value, 0.3, 2.5) * 10) / 10;
    this.lookSensitivityInput.value = String(this.lookSensitivity);
    this.lookSensitivityValue.textContent = `${this.lookSensitivity.toFixed(1)}×`;
    if (this.state === "playing")
      this.setStatus(`Mouse look · ${this.lookSensitivity.toFixed(1)}×`);
  }

  private resetGame(): void {
    this.player.health = MAX_HEALTH;
    this.powerUpStats = { ...DEFAULT_POWER_UP_STATS };
    WEAPONS.splice(0, WEAPONS.length, ...STARTING_WEAPONS.map((weapon) => ({ ...weapon })));
    this.player.walkPhase = 0;
    this.score = 0;
    this.credits = 0;
    this.weaponIndex = 0;
    this.shotCooldown = 0;
    this.reloadTimer = 0;
    this.recoil = 0;
    this.muzzleFlash = 0;
    this.hitMarkerTimer = 0;
    this.damageFlashTimer = 0;
    this.damageCooldown = 0;
    this.damageOverlay.style.opacity = "0";
    this.crosshair.hidden = false;
    this.aiming = false;
    this.crosshair.classList.remove("aiming");
    this.keys.clear();
    this.ammo.splice(0, this.ammo.length, 30, 12, 0, 3);
    this.reserveAmmo.splice(0, this.reserveAmmo.length, 90, 36);
    this.loadLevel(0);
    this.healthValue.textContent = String(MAX_HEALTH);
    this.scoreValue.textContent = "0";
    this.creditsValue.textContent = "0";
    this.updateWeaponHud();
    this.deathOverlay.classList.remove("active");
    this.deathOverlay.textContent = "SIGNAL LOST";
    this.resultOverlay.classList.remove("active");
    this.powerUpOverlay.classList.remove("active");
    this.commsPanel.classList.remove("active");
    this.commsTimer = 0;
    document.body.style.cursor = "";
    this.state = "ready";
    this.showMenu("NEON SIEGE", "WASD move · Mouse look · Click to fire · Survive the campaign", [
      { label: "Start game", action: () => this.startGame() },
      { label: "Play other game", action: this.playOtherGame },
    ]);
  }

  private setStatus(message: string, duration = 2.4): void {
    this.statusText.textContent = message;
    this.statusTimer = duration;
  }

  private selectWeapon(index: number): void {
    if (index < 0 || index >= WEAPONS.length || index === this.weaponIndex) return;
    this.weaponIndex = index;
    this.reloadTimer = 0;
    this.updateWeaponHud();
    if (this.state === "playing") this.setStatus(`Equipped · ${this.weapon.category}`);
  }

  private resize(): void {
    const isFullscreen = document.fullscreenElement === this.fullscreenTarget;
    const availableWidth = this.canvas.parentElement?.clientWidth ?? window.innerWidth - 32;
    const width = Math.max(240, isFullscreen ? availableWidth : Math.min(availableWidth, 1200));
    const pageChromeHeight = isFullscreen ? 0 : width <= 600 ? 320 : 200;
    const height = isFullscreen
      ? window.innerHeight
      : Math.max(300, Math.min(window.innerHeight - pageChromeHeight, 720));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.scene.resize(width, height);
  }

  private reload(): void {
    if (this.weapon.kind === "knife" || this.weapon.kind === "grenade" || this.reloadTimer > 0)
      return;
    const reserve = this.reserveAmmo[this.weaponIndex] ?? 0;
    if (this.ammo[this.weaponIndex] === this.weapon.magazine || reserve <= 0) return;
    this.reloadTimer = this.weapon.kind === "rifle" ? 1.15 : 0.8;
    this.setStatus("Reloading");
  }

  private fireWeapon(): void {
    if (this.state !== "playing" || this.shotCooldown > 0 || this.reloadTimer > 0) return;
    const weapon = this.weapon;
    if (weapon.kind === "grenade") {
      if ((this.ammo[this.weaponIndex] ?? 0) <= 0) {
        this.setStatus("No grenades · earn them by eliminating aliens");
        return;
      }
      this.ammo[this.weaponIndex] = (this.ammo[this.weaponIndex] ?? 1) - 1;
      const throwSpeed = 4.5;
      const horizontalSpeed = Math.cos(this.player.pitch) * throwSpeed;
      this.grenades.push({
        x: this.player.x + Math.cos(this.player.angle) * 0.35,
        y: this.player.y + Math.sin(this.player.angle) * 0.35,
        floor: this.player.floor,
        height: 1.15 + this.player.jumpHeight,
        vx: Math.cos(this.player.angle) * horizontalSpeed,
        vy: Math.sin(this.player.angle) * horizontalSpeed,
        verticalVelocity: 2.2 - Math.sin(this.player.pitch) * throwSpeed,
        fuse: 1.5,
      });
      this.shotCooldown = weapon.cooldown / this.powerUpStats.fireRateMultiplier;
      this.updateWeaponHud();
      return;
    }

    if (weapon.kind !== "knife" && (this.ammo[this.weaponIndex] ?? 0) <= 0) {
      this.reload();
      if (this.reloadTimer === 0) this.setStatus("Empty · earn ammo by eliminating aliens");
      return;
    }
    if (weapon.kind !== "knife") {
      this.ammo[this.weaponIndex] = (this.ammo[this.weaponIndex] ?? 1) - 1;
      this.updateWeaponHud();
      this.muzzleFlash = 0.08;
      this.recoil = 1;
    }
    this.shotCooldown = weapon.cooldown / this.powerUpStats.fireRateMultiplier;

    let target: Enemy | null = null;
    let nearest = (weapon.kind === "knife" ? 1.5 : 14) * this.powerUpStats.weaponRangeMultiplier;
    const cone = weapon.kind === "knife" ? 0.42 : this.aiming ? 0.055 : 0.12;
    for (const enemy of this.enemies) {
      if (enemy.floor !== this.player.floor) continue;
      const dx = enemy.x - this.player.x;
      const dy = enemy.y - this.player.y;
      const horizontalDistance = Math.hypot(dx, dy);
      const targetHeight = 1.38 + enemy.dropHeight;
      const verticalDistance = 1.62 + this.player.jumpHeight - targetHeight;
      const distance = Math.hypot(horizontalDistance, verticalDistance);
      const yawError = Math.abs(normalizeAngle(Math.atan2(dy, dx) - this.player.angle));
      const targetPitch = Math.atan2(verticalDistance, horizontalDistance);
      const pitchError = Math.abs(targetPitch - this.player.pitch);
      if (
        distance >= nearest ||
        Math.hypot(yawError, pitchError) > cone ||
        !this.hasLineOfSight(enemy.x, enemy.y, 0.28, targetHeight)
      )
        continue;
      nearest = distance;
      target = enemy;
    }

    if (!target) return;
    target.hp -= weapon.damage * this.powerUpStats.damageMultiplier;
    this.hitMarkerTimer = 0.18;
    if (target.hp <= 0) {
      this.score += 100;
      this.scoreValue.textContent = String(this.score);
      this.dropCoins(target);
      const index = this.enemies.indexOf(target);
      if (index >= 0) this.enemies.splice(index, 1);
      this.setStatus(`Alien down · +100 · ${this.awardKillAmmo(weapon.kind)}`);
    } else {
      this.setStatus("Hit confirmed");
    }
  }

  private beginWave(wave: number, announce = true): void {
    this.wave = wave;
    this.spawnIndex = 0;
    this.waveCompleteHandled = false;
    this.waveValue.textContent = `L${this.levelIndex + 1} · ${String(wave).padStart(2, "0")} · F${this.player.floor + 1}/${this.level.floors.length}`;
    const count = 5 + this.levelIndex * 2 + Math.floor(wave / 2);
    if (wave === 1 && this.enemies.length === 0) this.spawnEnemy(this.level.enemySpawn);
    for (let remaining = count - this.enemies.length; remaining > 0; remaining -= 1) {
      if (!this.spawnEnemy()) break;
    }
    if (announce) this.setStatus(`Wave ${wave}/${WAVES_PER_LEVEL} · UFO deployment incoming`, 3);
  }

  private roomBounds(room: number): { minX: number; maxX: number; centerX: number } {
    const width = this.currentMap[0]?.length ?? 0;
    const left = this.doorPositions[room - 1]?.x ?? 0;
    const right = this.doorPositions[room]?.x ?? width - 1;
    return {
      minX: left + 1.5,
      maxX: right - 1.5,
      centerX: (left + right) / 2 + 0.5,
    };
  }

  private spawnEnemy(position?: { x: number; y: number }): boolean {
    const mapHeight = this.currentMap.length;
    const kind = alienForSpawn(this.levelIndex, this.spawnIndex);
    const profile = ALIEN_PROFILES[kind];
    const room = this.roomBounds(this.currentRoom);
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const x = position?.x ?? room.minX + Math.random() * (room.maxX - room.minX);
      const y = position?.y ?? 1.5 + Math.random() * (mapHeight - 3);
      if (this.isBlocked(x, y) || Math.hypot(x - this.player.x, y - this.player.y) < 4) continue;
      const maxHp = Math.min(
        600,
        Math.round((90 + (this.levelIndex + this.wave) * 8) * profile.healthMultiplier),
      );
      const dropDuration = 1.05 + (this.spawnIndex % 4) * 0.14;
      this.enemies.push({
        kind,
        x,
        y,
        floor: this.player.floor,
        hp: maxHp,
        maxHp,
        bob: Math.random() * Math.PI * 2,
        attackCooldown: 0.7 + Math.random() * 0.8,
        attackWindup: 0,
        dropHeight: this.ufoHeight,
        dropTimer: dropDuration,
        dropDuration,
      });
      this.spawnIndex += 1;
      return true;
    }
    return false;
  }

  private isBlocked(x: number, y: number, jumpHeight = 0, floorIndex = this.player.floor): boolean {
    const mapX = Math.floor(x);
    const mapY = Math.floor(y);
    const map = this.level.floors[floorIndex]?.map;
    if (!map) throw new Error(`Level ${this.levelIndex + 1} has no floor ${floorIndex + 1}.`);
    const tile = tileAt(map, x, y);
    if (tile === "0" || tile === "6" || tile === "7" || tile === "8") return false;
    if (tile === "5") return !this.openDoors.has(`${floorIndex}:${mapX},${mapY}`);
    if (tile === "2") return jumpHeight < 0.82;
    if (tile === "4") return jumpHeight < 0.96;
    return true;
  }

  private hasLineOfSight(x: number, y: number, tolerance = 0.28, targetHeight = 1.38): boolean {
    return !this.lineBlocked(
      this.player.x,
      this.player.y,
      x,
      y,
      tolerance,
      1.62 + this.player.jumpHeight,
      targetHeight,
    );
  }

  private lineBlocked(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    tolerance = 0.1,
    startHeight = 1.62 + this.player.jumpHeight,
    endHeight = 1.38,
    floorIndex = this.player.floor,
  ) {
    const map = this.level.floors[floorIndex]?.map;
    if (!map) throw new Error(`Level ${this.levelIndex + 1} has no floor ${floorIndex + 1}.`);
    const dx = endX - startX;
    const dy = endY - startY;
    const distance = Math.hypot(dx, dy);
    const steps = Math.ceil(Math.max(0, distance - tolerance) * 12);
    for (let step = 1; step < steps; step += 1) {
      const t = step / Math.max(steps, 1);
      const x = startX + dx * t;
      const y = startY + dy * t;
      const tile = tileAt(map, x, y);
      const height = startHeight + (endHeight - startHeight) * t;
      if (tile === "0" || tile === "6" || tile === "7" || tile === "8") continue;
      if (tile === "5" && this.openDoors.has(`${floorIndex}:${Math.floor(x)},${Math.floor(y)}`))
        continue;
      if (tile === "2" && height >= 0.82) continue;
      if (tile === "4" && height >= 0.96) continue;
      return true;
    }
    return false;
  }

  private detonate(grenade: Grenade): void {
    const rewards = new Map<string, number>();
    for (const enemy of this.enemies) {
      if (enemy.floor !== grenade.floor) continue;
      const distance = Math.hypot(enemy.x - grenade.x, enemy.y - grenade.y);
      if (
        distance <= 2.6 &&
        !this.lineBlocked(grenade.x, grenade.y, enemy.x, enemy.y, 0.2, 0.8, 0.8, grenade.floor)
      ) {
        enemy.hp -=
          110 * this.powerUpStats.damageMultiplier * this.powerUpStats.grenadeDamageMultiplier;
      }
    }
    for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
      if ((this.enemies[index]?.hp ?? 1) <= 0) {
        const enemy = this.enemies[index];
        if (enemy) this.dropCoins(enemy);
        this.enemies.splice(index, 1);
        this.score += 100;
        const reward = this.awardKillAmmo("grenade");
        rewards.set(reward, (rewards.get(reward) ?? 0) + 1);
      }
    }
    this.scoreValue.textContent = String(this.score);
    if (rewards.size === 0) {
      this.setStatus("Grenade detonated");
      return;
    }
    const rewardSummary = [...rewards]
      .map(([reward, count]) => (count > 1 ? `${count}× ${reward}` : reward))
      .join(" · ");
    const killCount = [...rewards.values()].reduce((sum, count) => sum + count, 0);
    this.setStatus(`Grenade · ${killCount} alien kills · ${rewardSummary}`);
  }

  private handleWaveClear(): void {
    if (this.waveCompleteHandled) return;
    this.waveCompleteHandled = true;
    const door = this.doorPositions[this.wave - 1];
    if (!door)
      throw new Error(`Level ${this.levelIndex + 1} is missing the wave ${this.wave} door.`);
    this.openDoors.add(`${this.player.floor}:${door.x},${door.y}`);
    if (this.wave < WAVES_PER_LEVEL) {
      this.waitingForNextRoom = true;
      this.setStatus(`Door open · cross into room ${this.wave + 1}`);
      if (this.wave === 1) this.showComms(this.level.comms.afterWave);
      return;
    }

    this.extractionReady = true;
    this.waitingForNextRoom = false;
    this.waitingForExtractionRoom = true;
    this.showComms(this.level.comms.clear);
    this.setStatus("Final door open · cross into the shuttle lift", 8);
  }

  private checkNextRoomDoor(): void {
    if (!this.waitingForNextRoom && !this.waitingForExtractionRoom) return;
    const door = this.doorPositions[this.currentRoom];
    const extractionRoom = this.waitingForExtractionRoom;
    const nextFloor = this.floorForRoom(this.currentRoom + 1);
    const floorChanged = nextFloor !== this.player.floor;
    const stair =
      floorChanged && door
        ? this.level.floors[this.player.floor]?.stairsUp.find(({ x }) => x === door.x + 1)
        : undefined;
    if (floorChanged && !stair) {
      throw new Error(
        `Level ${this.levelIndex + 1} is missing the stairs to floor ${nextFloor + 1}.`,
      );
    }
    if (
      !door ||
      this.player.x <= (stair ? stair.x + STAIR_RUN_LENGTH + 0.15 : door.x + 0.78) ||
      Math.abs(this.player.y - (door.y + 0.5)) >= 0.75
    ) {
      return;
    }
    this.currentRoom += 1;
    this.waitingForNextRoom = false;
    this.waitingForExtractionRoom = false;
    if (floorChanged) {
      this.player.floor = nextFloor;
      this.player.stairHeight = 0;
      const entry = this.level.floors[nextFloor]?.entry;
      if (!entry)
        throw new Error(`Level ${this.levelIndex + 1} has no entry for floor ${nextFloor + 1}.`);
      this.player.x = entry.x;
      this.player.y = entry.y;
      this.player.velocityX = 0;
      this.player.velocityY = 0;
      const floorName = this.level.floors[nextFloor]?.name ?? `Floor ${nextFloor + 1}`;
      this.minimap.setAttribute(
        "aria-label",
        `${this.level.name}, ${floorName} map and nearby hostiles`,
      );
    }
    if (extractionRoom) {
      this.setStatus("Shuttle lift reached · shuttle ready · press E to launch", 5);
      return;
    }
    this.beginWave(this.wave + 1, !floorChanged);
    if (floorChanged) {
      this.setStatus(
        `${this.level.floors[nextFloor]?.name ?? `Floor ${nextFloor + 1}`} · wave ${this.wave}`,
        3,
      );
    }
  }

  private update(dt: number, timestamp: number): void {
    if (this.state === "paused") dt = 0;
    if (this.commsTimer > 0) {
      this.commsTimer = Math.max(0, this.commsTimer - dt);
      if (this.commsTimer === 0) this.commsPanel.classList.remove("active");
    }
    if (this.statusTimer > 0) {
      this.statusTimer = Math.max(0, this.statusTimer - dt);
      if (this.statusTimer === 0 && this.state === "playing") {
        this.statusText.textContent = this.waitingForNextRoom
          ? `Door open · proceed to room ${this.wave + 1}`
          : this.extractionReady
            ? "Shuttle ready · reach it and press E"
            : `${this.level.name} · Wave ${this.wave}/${WAVES_PER_LEVEL} · ${this.enemies.length} remaining`;
      }
      if (this.statusTimer === 0 && this.state === "flight") {
        this.statusText.textContent = this.flightInstructions();
      }
    }
    if (this.shotCooldown > 0) this.shotCooldown = Math.max(0, this.shotCooldown - dt);
    this.hitMarkerTimer = Math.max(0, this.hitMarkerTimer - dt);
    this.crosshair.classList.toggle("hit", this.hitMarkerTimer > 0);
    this.damageFlashTimer = Math.max(0, this.damageFlashTimer - dt);
    this.damageCooldown = Math.max(0, this.damageCooldown - dt);
    this.damageOverlay.style.opacity = String(this.damageFlashTimer * 1.6);
    if (this.reloadTimer > 0) {
      this.reloadTimer = Math.max(0, this.reloadTimer - dt);
      if (this.reloadTimer === 0) {
        const needed = this.weapon.magazine - (this.ammo[this.weaponIndex] ?? 0);
        const loaded = Math.min(needed, this.reserveAmmo[this.weaponIndex] ?? 0);
        this.ammo[this.weaponIndex] = (this.ammo[this.weaponIndex] ?? 0) + loaded;
        this.reserveAmmo[this.weaponIndex] = (this.reserveAmmo[this.weaponIndex] ?? 0) - loaded;
        this.updateWeaponHud();
        this.setStatus("Reload complete", 1.2);
      }
    }
    this.recoil = Math.max(0, this.recoil - dt * 5);
    this.muzzleFlash = Math.max(0, this.muzzleFlash - dt);

    let deathProgress = 0;
    if (this.state === "playing") {
      this.missionRemaining = Math.max(0, this.missionRemaining - dt);
      this.updateMissionTimerHud();
      if (this.player.health > 0 && this.powerUpStats.healthRegeneration > 0) {
        this.player.health = Math.min(
          this.powerUpStats.maxHealth,
          this.player.health + this.powerUpStats.healthRegeneration * dt,
        );
      }
      const startingHeight = Math.max(22, this.currentMap.length * 1.1);
      this.ufoHeight =
        2.8 + (startingHeight - 2.8) * (this.missionRemaining / this.missionDuration);
      if (this.missionRemaining === 0) {
        this.state = "dying";
        this.deathCause = "ufo";
        this.deathTimer = 0;
        this.deathOverlay.textContent = "UFO IMPACT · MISSION LOST";
        this.deathOverlay.classList.add("active");
        this.setStatus("The UFO reached the ground", 2);
      } else {
        this.updatePlayer(dt);
        this.updateEnemies(dt);
        this.updateGrenades(dt);
        this.updateCoins();
        this.checkNextRoomDoor();
        this.checkShuttleProximity();
        if (this.enemies.length === 0) this.handleWaveClear();
        if (this.player.health <= 0) {
          this.state = "dying";
          this.deathCause = "alien";
          this.deathTimer = 0;
          this.deathOverlay.textContent = "ALIEN BREACH · MISSION LOST";
          this.deathOverlay.classList.add("active");
          this.setStatus("Critical damage", 2);
        }
      }
    } else if (this.state === "dying") {
      this.deathTimer += dt;
      deathProgress = Math.min(1, this.deathTimer / 1.8);
      if (deathProgress === 1) {
        this.state = "game-over";
        this.canvas.style.cursor = "crosshair";
        document.body.style.cursor = "";
        document.exitPointerLock?.();
        this.showMenu(
          this.deathCause === "ufo" ? "UFO IMPACT" : "ALIEN BREACH",
          this.deathCause === "ufo"
            ? "The UFO reached the ground before extraction."
            : "Alien attacks overwhelmed you. Move and use cover to dodge incoming hits.",
          [
            { label: "Restart", action: () => this.restartGame() },
            { label: "Main menu", action: () => this.returnToMainMenu() },
          ],
        );
        this.setStatus("Signal lost", 100000);
      }
    } else if (this.state === "flight") {
      this.updateFlight(dt);
    } else if (this.state === "transition") {
      this.transitionTimer = Math.max(0, this.transitionTimer - dt);
      if (this.transitionTimer === 0) {
        this.showPowerUpSelection();
      }
    }
    this.healthValue.textContent = String(Math.ceil(this.player.health));
    this.creditsValue.textContent = String(this.credits);
    this.drawMinimap();
    const flightRing = FLIGHT_RING_COURSE[this.flightRingIndex] ?? null;
    const flight: SceneFlight | null = this.flightSequenceActive
      ? {
          playerX: this.flightPlayer.x,
          playerY: this.flightPlayer.y,
          ring: flightRing,
          distance: this.flightDistance,
        }
      : null;
    this.scene.render(
      this.player,
      this.enemies,
      this.grenades,
      this.weapon.kind,
      this.recoil,
      this.muzzleFlash,
      timestamp,
      deathProgress,
      this.aiming,
      this.openDoors,
      this.extractionReady,
      {
        x: this.roomBounds(this.currentRoom).centerX,
        y: this.player.floor * FLOOR_HEIGHT + this.ufoHeight,
        z: this.currentMap.length / 2,
      },
      flight,
      this.coins,
    );
  }

  private updatePlayer(dt: number): void {
    let forward =
      (this.keys.has("w") || this.keys.has("arrowup") ? 1 : 0) -
      (this.keys.has("s") || this.keys.has("arrowdown") ? 1 : 0);
    let strafe =
      (this.keys.has("d") || this.keys.has("arrowright") ? 1 : 0) -
      (this.keys.has("a") || this.keys.has("arrowleft") ? 1 : 0);
    const inputLength = Math.hypot(forward, strafe);
    if (inputLength > 1) {
      forward /= inputLength;
      strafe /= inputLength;
    }
    const crouching = this.keys.has("control");
    const speed =
      PLAYER_SPEED *
      this.powerUpStats.moveSpeedMultiplier *
      (this.keys.has("shift") && !crouching ? 1.7 : crouching ? 0.55 : 1);
    const targetX =
      (Math.cos(this.player.angle) * forward - Math.sin(this.player.angle) * strafe) * speed;
    const targetY =
      (Math.sin(this.player.angle) * forward + Math.cos(this.player.angle) * strafe) * speed;
    const acceleration = Math.min(1, dt * 10);
    this.player.velocityX += (targetX - this.player.velocityX) * acceleration;
    this.player.velocityY += (targetY - this.player.velocityY) * acceleration;
    const radius = 0.2;
    const nextX = this.player.x + this.player.velocityX * dt;
    const nextY = this.player.y + this.player.velocityY * dt;
    if (
      !this.isBlocked(nextX - radius, this.player.y, this.player.jumpHeight) &&
      !this.isBlocked(nextX + radius, this.player.y, this.player.jumpHeight)
    ) {
      this.player.x = nextX;
    } else {
      this.player.velocityX = 0;
    }
    if (
      !this.isBlocked(this.player.x, nextY - radius, this.player.jumpHeight) &&
      !this.isBlocked(this.player.x, nextY + radius, this.player.jumpHeight)
    ) {
      this.player.y = nextY;
    } else {
      this.player.velocityY = 0;
    }
    this.updateStairElevation();
    this.player.walkPhase += Math.hypot(this.player.velocityX, this.player.velocityY) * dt * 5;
    this.player.jumpHeight = Math.max(0, this.player.jumpHeight + this.player.jumpVelocity * dt);
    this.player.jumpVelocity -= 11 * dt;
    if (this.player.jumpHeight === 0 && this.player.jumpVelocity < 0) this.player.jumpVelocity = 0;
  }

  private updateStairElevation(): void {
    const stair = this.level.floors[this.player.floor]?.stairsUp.find(
      ({ x, y }) =>
        this.player.x >= x + 0.2 &&
        this.player.x <= x + STAIR_RUN_LENGTH &&
        Math.abs(this.player.y - (y + 0.5)) < 1.1,
    );
    if (!stair) {
      this.player.stairHeight = 0;
      return;
    }
    this.player.stairHeight =
      (Math.min(this.player.x - (stair.x + 0.2), STAIR_RUN_LENGTH - 0.2) /
        (STAIR_RUN_LENGTH - 0.2)) *
      FLOOR_HEIGHT;
  }

  private updateEnemies(dt: number): void {
    for (const enemy of this.enemies) {
      if (enemy.floor !== this.player.floor) continue;
      if (enemy.dropTimer > 0) {
        enemy.dropTimer = Math.max(0, enemy.dropTimer - dt);
        enemy.dropHeight = this.ufoHeight * (enemy.dropTimer / enemy.dropDuration);
        continue;
      }
      enemy.dropHeight = 0;
      const profile = ALIEN_PROFILES[enemy.kind];
      const dx = this.player.x - enemy.x;
      const dy = this.player.y - enemy.y;
      const distance = Math.hypot(dx, dy);
      const hasSight = !this.lineBlocked(
        enemy.x,
        enemy.y,
        this.player.x,
        this.player.y,
        0.1,
        1.38 + enemy.dropHeight,
        1.62 + this.player.jumpHeight,
        enemy.floor,
      );
      enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);

      if (enemy.attackWindup > 0) {
        enemy.attackWindup = Math.max(0, enemy.attackWindup - dt);
        if (enemy.attackWindup === 0) {
          if (distance <= profile.range && hasSight) {
            const hit = receiveAlienHit(
              this.player.health,
              profile.damage,
              this.powerUpStats.incomingDamageMultiplier,
              this.damageCooldown,
            );
            this.player.health = hit.health;
            this.damageCooldown = hit.damageCooldown;
            if (hit.wasDamaged) {
              this.damageFlashTimer = 0.45;
              this.setStatus(`${profile.name} attack · dodge`, 1.1);
            }
          }
          enemy.attackCooldown = profile.cooldown;
        }
        continue;
      }

      if (distance <= profile.range && hasSight && enemy.attackCooldown === 0) {
        enemy.attackWindup = profile.windup;
        continue;
      }
      if (enemy.kind === "shooter" && distance <= profile.range && hasSight) continue;

      if (distance <= 0.01) continue;
      const waypoint = hasSight ? this.player : this.findPathWaypoint(enemy);
      if (!waypoint) continue;
      const moveX = waypoint.x - enemy.x;
      const moveY = waypoint.y - enemy.y;
      const moveDistance = Math.hypot(moveX, moveY);
      if (moveDistance <= 0.01) continue;
      const speed = profile.speed + Math.min(this.levelIndex, 8) * 0.025;
      const step = Math.min(speed * dt, moveDistance);
      const nextX = enemy.x + (moveX / moveDistance) * step;
      const nextY = enemy.y + (moveY / moveDistance) * step;
      if (!this.isBlocked(nextX, enemy.y, 0, enemy.floor)) enemy.x = nextX;
      if (!this.isBlocked(enemy.x, nextY, 0, enemy.floor)) enemy.y = nextY;
    }
  }

  private findPathWaypoint(enemy: Enemy): { x: number; y: number } | null {
    const map = this.level.floors[enemy.floor]?.map;
    if (!map) throw new Error(`Level ${this.levelIndex + 1} has no floor ${enemy.floor + 1}.`);
    const width = map[0]?.length ?? 0;
    const height = map.length;
    const startX = Math.floor(enemy.x);
    const startY = Math.floor(enemy.y);
    const targetX = Math.floor(this.player.x);
    const targetY = Math.floor(this.player.y);
    if (startX === targetX && startY === targetY) return null;

    const start = startY * width + startX;
    const target = targetY * width + targetX;
    const previous = new Map<number, number>();
    const queue = [start];
    previous.set(start, -1);
    for (let cursor = 0; cursor < queue.length && !previous.has(target); cursor += 1) {
      const current = queue[cursor];
      if (current === undefined) continue;
      const x = current % width;
      const y = Math.floor(current / width);
      const neighbors: [number, number][] = [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ];
      for (const [nextX, nextY] of neighbors) {
        if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
        const next = nextY * width + nextX;
        if (previous.has(next) || this.isBlocked(nextX + 0.5, nextY + 0.5, 0, enemy.floor))
          continue;
        previous.set(next, current);
        queue.push(next);
      }
    }
    if (!previous.has(target)) return null;

    let waypoint = target;
    while (previous.get(waypoint) !== start) {
      const parent = previous.get(waypoint);
      if (parent === undefined || parent < 0) return null;
      waypoint = parent;
    }
    return { x: (waypoint % width) + 0.5, y: Math.floor(waypoint / width) + 0.5 };
  }

  private updateGrenades(dt: number): void {
    for (let index = this.grenades.length - 1; index >= 0; index -= 1) {
      const grenade = this.grenades[index];
      if (!grenade) continue;
      const nextX = grenade.x + grenade.vx * dt;
      const nextY = grenade.y + grenade.vy * dt;
      const nextHeight = grenade.height + grenade.verticalVelocity * dt;
      if (this.isBlocked(nextX, grenade.y, Math.max(0, nextHeight), grenade.floor))
        grenade.vx *= -0.28;
      else grenade.x = nextX;
      if (this.isBlocked(grenade.x, nextY, Math.max(0, nextHeight), grenade.floor))
        grenade.vy *= -0.28;
      else grenade.y = nextY;
      grenade.verticalVelocity -= 9.8 * dt;
      if (nextHeight <= 0) {
        grenade.height = 0;
        grenade.verticalVelocity =
          Math.abs(grenade.verticalVelocity) > 1 ? Math.abs(grenade.verticalVelocity) * 0.32 : 0;
      } else {
        grenade.height = nextHeight;
      }
      const drag = grenade.height > 0 ? 0.25 : 1.8;
      grenade.vx *= Math.max(0, 1 - dt * drag);
      grenade.vy *= Math.max(0, 1 - dt * drag);
      grenade.fuse -= dt;
      if (grenade.fuse <= 0) {
        this.detonate(grenade);
        this.grenades.splice(index, 1);
      }
    }
  }

  private drawMinimap(): void {
    const ctx = this.mapContext;
    const width = this.minimap.width;
    const height = this.minimap.height;
    const map = this.currentMap;
    const mapWidth = map[0]?.length ?? 1;
    const mapHeight = map.length;
    const cellWidth = width / mapWidth;
    const cellHeight = height / mapHeight;
    const markerRadius = Math.max(1.5, Math.min(cellWidth, cellHeight) * 0.3);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(5, 15, 23, 0.82)";
    ctx.fillRect(0, 0, width, height);
    for (let y = 0; y < mapHeight; y += 1) {
      for (let x = 0; x < (map[y]?.length ?? 0); x += 1) {
        const tile = map[y]?.[x];
        if (tile === "0") continue;
        ctx.fillStyle =
          tile === "1"
            ? "#38586a"
            : tile === "2"
              ? "#b39a69"
              : tile === "3"
                ? `#${this.level.palette.accent.toString(16).padStart(6, "0")}`
                : "#8ca18d";
        ctx.fillRect(x * cellWidth, y * cellHeight, cellWidth, cellHeight);
      }
    }
    for (const enemy of this.enemies) {
      ctx.fillStyle = `#${ALIEN_PROFILES[enemy.kind].accentColor.toString(16).padStart(6, "0")}`;
      ctx.beginPath();
      ctx.arc(enemy.x * cellWidth, enemy.y * cellHeight, markerRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const door of this.doorPositions) {
      ctx.fillStyle = this.openDoors.has(`${this.player.floor}:${door.x},${door.y}`)
        ? "#5df3d7"
        : "#f7b95e";
      ctx.fillRect(door.x * cellWidth - 2, door.y * cellHeight - 2, 4, 4);
    }
    for (const coin of this.coins) {
      if (coin.floor !== this.player.floor) continue;
      ctx.fillStyle = "#ffd45f";
      ctx.beginPath();
      ctx.arc(coin.x * cellWidth, coin.y * cellHeight, markerRadius * 0.75, 0, Math.PI * 2);
      ctx.fill();
    }
    if (this.extractionReady) {
      ctx.fillStyle = "#70e8ff";
      ctx.beginPath();
      ctx.arc(
        (width - 3.2) * cellWidth,
        (mapHeight / 2) * cellHeight,
        markerRadius * 1.7,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.fillStyle = "#62f6d2";
    ctx.beginPath();
    ctx.arc(
      this.player.x * cellWidth,
      this.player.y * cellHeight,
      markerRadius * 1.4,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.strokeStyle = "#62f6d2";
    ctx.beginPath();
    ctx.moveTo(this.player.x * cellWidth, this.player.y * cellHeight);
    ctx.lineTo(
      (this.player.x + Math.cos(this.player.angle) * 0.75) * cellWidth,
      (this.player.y + Math.sin(this.player.angle) * 0.75) * cellHeight,
    );
    ctx.stroke();
  }

  public loop(timestamp: number): void {
    if (!this.lastTime) this.lastTime = timestamp;
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
    this.lastTime = timestamp;
    this.update(dt, timestamp);
    window.requestAnimationFrame((nextTime) => this.loop(nextTime));
  }
}

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("The page is missing its #app main element.");

const heading = document.createElement("h1");
heading.textContent = "Neon Siege";
const introduction = document.createElement("p");
introduction.textContent =
  "10-level campaign · choose an upgrade after each level · collect alien coins to buy replacement weapons · WASD move · right-click aim · left-click fire/throw · 1-4 or scroll to switch · Shift sprint · Ctrl crouch · Space jump · E shuttle · A/D steer and W/S climb through flight rings · R reload · beat the UFO timer.";
const shell = document.createElement("div");
shell.className = "game-shell";
const canvas = document.createElement("canvas");
canvas.id = "game-canvas";
canvas.setAttribute(
  "aria-label",
  "Neon Siege ten-level 3D first-person alien shooter campaign with expanding rooms, UFO deployments, shuttle extraction and ring flight, aiming, grenades, and alien ammo rewards",
);
const hud = document.createElement("div");
hud.className = "hud";
shell.append(canvas, hud);
app.append(heading, introduction, shell);

heading.hidden = true;
introduction.hidden = true;
const gameHub = new GameHub(
  app,
  () => {
    heading.hidden = false;
    introduction.hidden = false;
  },
  () => {
    heading.hidden = true;
    introduction.hidden = true;
  },
);
const shooter = new NeonShooter(canvas, hud, () => gameHub.show(), app);
window.requestAnimationFrame((time) => shooter.loop(time));
