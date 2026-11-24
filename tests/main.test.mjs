import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LEVELS } from "../src/levels.ts";

const sceneMock = vi.hoisted(() => ({
  render: vi.fn(),
  resize: vi.fn(),
  loadLevel: vi.fn(),
}));

vi.mock("../src/game-scene.ts", () => ({
  GameScene: class {
    resize = sceneMock.resize;
    render = sceneMock.render;
    loadLevel = sceneMock.loadLevel;
  },
}));

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe("fps shooter entry point", () => {
  it("renders a heading, intro copy, and the game shell into the main landmark", async () => {
    const children = [];
    const eventListeners = new Map();
    const createdElements = [];
    let pointerLockDocument;
    const shell = { clientWidth: 1280 };
    const canvasContext = {
      setTransform: vi.fn(),
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      fillStyle: "",
    };
    const canvas = {
      id: "",
      style: {},
      width: 0,
      height: 0,
      clientWidth: 1280,
      clientHeight: 720,
      parentElement: shell,
      getContext: vi.fn(() => canvasContext),
      getBoundingClientRect: vi.fn(() => ({
        left: 0,
        top: 0,
        right: 1280,
        bottom: 720,
      })),
      requestPointerLock: vi.fn(() => Promise.resolve()),
      addEventListener: vi.fn((name, callback) => eventListeners.set(`canvas:${name}`, callback)),
      setAttribute: vi.fn(),
    };
    const app = {
      append: (...elements) => children.push(...elements),
      requestFullscreen: vi.fn(async () => {
        pointerLockDocument.fullscreenElement = app;
        eventListeners.get("document:fullscreenchange")();
      }),
    };
    const querySelector = vi.fn(() => app);
    const createElement = vi.fn((tagName) => {
      const element = {
        tagName,
        textContent: "",
        className: "",
        style: {},
        hidden: false,
        listeners: new Map(),
        classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
        append: vi.fn((...elements) => element.children.push(...elements)),
        replaceChildren: vi.fn((...elements) => {
          element.children = [...elements];
        }),
        querySelector: vi.fn(() => element.children[0] ?? { focus: vi.fn() }),
        focus: vi.fn(),
        addEventListener: vi.fn((name, callback) => {
          element.listeners.set(name, callback);
          eventListeners.set(`${tagName}:${name}`, callback);
        }),
        setAttribute: vi.fn(),
        children: [],
      };
      if (tagName === "canvas") return canvas;
      createdElements.push(element);
      return element;
    });
    pointerLockDocument = {
      querySelector,
      createElement,
      addEventListener: vi.fn((name, callback) => eventListeners.set(`document:${name}`, callback)),
      pointerLockElement: null,
      fullscreenElement: null,
      exitFullscreen: vi.fn(async () => {
        pointerLockDocument.fullscreenElement = null;
        eventListeners.get("document:fullscreenchange")();
      }),
      body: { style: {} },
    };
    let nextFrame;

    vi.stubGlobal("document", pointerLockDocument);
    vi.stubGlobal("window", {
      addEventListener: vi.fn((name, callback) => eventListeners.set(name, callback)),
      requestAnimationFrame: vi.fn((callback) => {
        nextFrame = callback;
      }),
      setInterval: vi.fn(),
      innerWidth: 1280,
      innerHeight: 720,
      devicePixelRatio: 1,
    });

    await import("../src/main.ts");

    expect(querySelector).toHaveBeenCalledWith("#app");
    expect(children[0]).toMatchObject({ tagName: "h1", textContent: "Neon Siege" });
    expect(children[1]).toMatchObject({
      tagName: "p",
      textContent:
        "10-level campaign · choose an upgrade after each level · collect alien coins to buy replacement weapons · WASD move · right-click aim · left-click fire/throw · 1-4 or scroll to switch · Shift sprint · Ctrl crouch · Space jump · E shuttle · A/D steer and W/S climb through flight rings · R reload · beat the UFO timer.",
    });
    expect(children[2].className).toBe("game-shell");
    expect(canvas.setAttribute).toHaveBeenCalledWith(
      "aria-label",
      expect.stringContaining("shuttle extraction and ring flight"),
    );

    const hud = children[2].append.mock.calls[0][1];
    const loadout = hud.append.mock.calls[3][0];
    const wave = hud.append.mock.calls[4][0];
    const crosshair = hud.append.mock.calls[6][0];
    const equippedWeapon = loadout.append.mock.calls[0][1];
    const ammo = hud.append.mock.calls[2][0].append.mock.calls[0][1];
    const menu = hud.append.mock.calls[12][0];
    const menuActions = menu.append.mock.calls[0][2];
    const startButton = createdElements.find((element) => element.textContent === "Start game");
    const fullscreenButton = createdElements.find(
      (element) => element.className === "fullscreen-button",
    );
    const lookControl = hud.append.mock.calls[14][0];
    const lookInput = lookControl.append.mock.calls[0][1];
    const lookValue = lookControl.append.mock.calls[0][2];
    expect(wave.append.mock.calls[0][1].textContent).toBe("L1 · 01 · F1/2");
    expect(lookInput.value).toBe("0.7");
    expect(sceneMock.loadLevel).toHaveBeenCalledWith(LEVELS[0].floors, LEVELS[0].palette);
    expect(menu.className).toBe("game-menu");
    expect(menu.classList.add).toHaveBeenCalledWith("active");
    expect(startButton).toBeDefined();
    expect(fullscreenButton).toBeDefined();
    expect(fullscreenButton.setAttribute).toHaveBeenCalledWith("aria-label", "Enter fullscreen");
    fullscreenButton.listeners.get("click")();
    expect(app.requestFullscreen).toHaveBeenCalledOnce();
    expect(fullscreenButton.textContent).toBe("EXIT FULLSCREEN");
    fullscreenButton.listeners.get("click")();
    expect(pointerLockDocument.exitFullscreen).toHaveBeenCalledOnce();
    expect(fullscreenButton.textContent).toBe("FULLSCREEN");
    const gameHub = children.find((element) => element.className === "game-hub");
    const clickerCard = createdElements.find(
      (element) => element.className === "hub-game-card clicker-card",
    );
    const clickerScreen = createdElements.find((element) => element.className === "clicker-screen");
    const libraryButton = createdElements.find(
      (element) => element.textContent === "← GAME LIBRARY",
    );
    const siegeCard = createdElements.find(
      (element) => element.className === "hub-game-card siege-card",
    );
    expect(gameHub.hidden).toBe(false);
    clickerCard.listeners.get("click")();
    expect(clickerScreen.hidden).toBe(false);
    libraryButton.listeners.get("click")();
    expect(clickerScreen.hidden).toBe(true);
    siegeCard.listeners.get("click")();
    expect(gameHub.hidden).toBe(true);
    expect(children[0].hidden).toBe(false);
    createdElements
      .find((element) => element.textContent === "Play other game")
      .listeners.get("click")();
    expect(gameHub.hidden).toBe(false);
    siegeCard.listeners.get("click")();
    lookInput.value = "2";
    eventListeners.get("input:input")();
    expect(lookValue.textContent).toBe("2.0×");
    eventListeners.get("keydown")({
      key: "]",
      code: "BracketRight",
      preventDefault: vi.fn(),
    });
    expect(lookValue.textContent).toBe("2.1×");
    eventListeners.get("keydown")({
      key: "2",
      code: "Digit2",
      preventDefault: vi.fn(),
    });

    expect(equippedWeapon.textContent).toBe("SECONDARY · Kestrel pistol");
    expect(ammo.textContent).toBe("12 / 36");
    const preventDefault = vi.fn();
    eventListeners.get("wheel")({ deltaY: 100, preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(equippedWeapon.textContent).toBe("SECONDARY · Kestrel pistol");
    const pointerMove = eventListeners.get("pointermove");
    pointerMove({ clientX: 640, clientY: 360, buttons: 0, movementX: 0 });
    pointerMove({ clientX: 640, clientY: 460, buttons: 0, movementX: 0, movementY: 0 });
    nextFrame(1000);
    expect(sceneMock.render.mock.lastCall?.[0].pitch).toBeGreaterThan(0);
    startButton.listeners.get("click")();
    expect(menu.classList.remove).toHaveBeenCalledWith("active");
    expect(canvas.requestPointerLock).toHaveBeenCalledOnce();
    const activeWheelPrevent = vi.fn();
    eventListeners.get("wheel")({ deltaY: 100, preventDefault: activeWheelPrevent });
    expect(activeWheelPrevent).toHaveBeenCalledOnce();
    expect(equippedWeapon.textContent).toBe("MELEE · Combat knife");
    expect(ammo.textContent).toBe("∞");
    pointerLockDocument.pointerLockElement = canvas;
    expect(sceneMock.render.mock.lastCall?.[1]).toHaveLength(5);
    expect(sceneMock.render.mock.lastCall?.[1].map(({ kind }) => kind)).toEqual([
      "damage",
      "speedy",
      "damage",
      "speedy",
      "damage",
    ]);
    const startingEnemyPositions = sceneMock.render.mock.lastCall?.[1].map(({ x, y }) => ({
      x,
      y,
    }));
    eventListeners.get("canvas:pointerdown")({ button: 0 });
    expect(canvas.requestPointerLock).toHaveBeenCalledOnce();
    expect(canvas.style.cursor).toBe("none");
    expect(pointerLockDocument.body.style.cursor).toBe("none");
    eventListeners.get("keydown")({ key: "Control" });
    expect(crosshair.hidden).toBe(true);
    eventListeners.get("keyup")({ key: "Control" });
    expect(crosshair.hidden).toBe(false);
    pointerLockDocument.pointerLockElement = canvas;
    pointerMove({ clientX: 640, clientY: 460, movementX: 0, movementY: 100 });
    nextFrame(1040);
    expect(sceneMock.render.mock.lastCall?.[0].pitch).toBeGreaterThan(0.3);
    for (let time = 1080; time <= 2400; time += 40) nextFrame(time);
    expect(
      sceneMock.render.mock.lastCall?.[1].some((enemy, index) => {
        const start = startingEnemyPositions?.[index];
        return start && (enemy.x !== start.x || enemy.y !== start.y);
      }),
    ).toBe(true);

    const escape = { key: "Escape", repeat: false, preventDefault: vi.fn() };
    eventListeners.get("keydown")(escape);
    expect(escape.preventDefault).toHaveBeenCalledOnce();
    expect(menu.classList.add).toHaveBeenLastCalledWith("active");
    expect(menuActions.children.map(({ textContent }) => textContent)).toEqual([
      "Start game",
      "Play other game",
      "Resume",
      "Restart",
      "Main menu",
    ]);
    const resumeButton = createdElements.find((element) => element.textContent === "Resume");
    resumeButton.listeners.get("click")();
    expect(menu.classList.remove).toHaveBeenLastCalledWith("active");

    eventListeners.get("canvas:pointerdown")({ button: 2 });
    nextFrame(2440);
    expect(sceneMock.render.mock.lastCall?.[8]).toBe(true);
    eventListeners.get("pointerup")({ button: 2 });
    nextFrame(2480);
    expect(sceneMock.render.mock.lastCall?.[8]).toBe(false);
    eventListeners.get("keydown")({ key: "4", code: "Digit4" });
    eventListeners.get("canvas:pointerdown")({ button: 0 });
    nextFrame(2520);
    expect(sceneMock.render.mock.lastCall?.[2]).toHaveLength(1);
    expect(sceneMock.render.mock.lastCall?.[2][0]).toMatchObject({
      height: expect.any(Number),
      verticalVelocity: expect.any(Number),
    });
  });

  it("explains a missing main element instead of silently rendering nothing", async () => {
    vi.stubGlobal("document", { querySelector: () => null });
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      requestAnimationFrame: vi.fn(),
      innerWidth: 1280,
      innerHeight: 720,
      devicePixelRatio: 1,
    });

    await expect(import("../src/main.ts")).rejects.toThrow(
      "The page is missing its #app main element.",
    );
  });
});
