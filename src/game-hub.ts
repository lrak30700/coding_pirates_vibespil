import {
  advanceClicker,
  buyClickUpgrade,
  buyGenerator,
  buyResearch,
  buyResearchLab,
  claimContract,
  createClickerSave,
  GENERATORS,
  getClickYield,
  getClickUpgradeCost,
  getContracts,
  getGeneratorCost,
  getLabCost,
  getPrestigeGain,
  getProductionRate,
  getResearchRate,
  mineFlux,
  parseClickerSave,
  RESEARCH,
  startNewExpedition,
  type ClickerSave,
  type GeneratorId,
} from "./clicker";
import { DrivingGame } from "./driving-game";

const SAVE_KEY = "starfall-arcade-clicker-v1";
const MAX_COMBO = 25;

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function formatAmount(value: number): string {
  if (value >= 1_000_000) {
    return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 }).format(
      value,
    );
  }
  if (value >= 1000) return new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(value);
  return value >= 100 ? value.toFixed(0) : value.toFixed(value < 10 && value % 1 !== 0 ? 1 : 0);
}

export class GameHub {
  readonly element: HTMLElement;
  private readonly picker: HTMLElement;
  private readonly clickerScreen: HTMLElement;
  private readonly fluxValue: HTMLElement;
  private readonly dataValue: HTMLElement;
  private readonly researchRateLabel: HTMLElement;
  private readonly productionValue: HTMLElement;
  private readonly lifetimeValue: HTMLElement;
  private readonly clickerMessage: HTMLElement;
  private readonly comboValue: HTMLElement;
  private readonly generatorList: HTMLElement;
  private readonly researchList: HTMLElement;
  private readonly augmentList: HTMLElement;
  private readonly contractList: HTMLElement;
  private readonly researchLabButton: HTMLButtonElement;
  private readonly prestigeButton: HTMLButtonElement;
  private readonly coreButton: HTMLButtonElement;
  private readonly overdriveButton: HTMLButtonElement;
  private readonly overdriveStatus: HTMLElement;
  private drivingGame: DrivingGame | null = null;
  private save: ClickerSave;
  private saveWarning = "";
  private lastTick = Date.now();
  private lastSaved = Date.now();
  private lastClick = 0;
  private combo = 0;
  private overdriveRemaining = 0;
  private overdriveCooldown = 0;

  constructor(
    host: HTMLElement,
    onSelectNeonSiege: () => void,
    private readonly onOpenLibrary: () => void,
  ) {
    this.element = element("section", "game-hub");
    this.element.setAttribute("aria-label", "Game library");
    this.picker = element("div", "hub-screen");
    this.clickerScreen = element("section", "clicker-screen");
    this.clickerScreen.hidden = true;
    this.save = this.loadSave();

    const hubHeader = element("header", "hub-header");
    hubHeader.append(
      element("p", "hub-eyebrow", "STARFALL ARCADE"),
      element("h2", "hub-title", "Choose your game"),
      element(
        "p",
        "hub-intro",
        "Drop into a full alien campaign or build a stellar industry from a single click.",
      ),
    );
    const cards = element("div", "hub-game-grid");
    const siegeCard = element("button", "hub-game-card siege-card");
    siegeCard.type = "button";
    siegeCard.append(
      element("span", "hub-card-icon", "⚔"),
      element("span", "hub-card-tag", "ACTION · CAMPAIGN"),
      element("strong", "hub-card-title", "Neon Siege"),
      element(
        "span",
        "hub-card-description",
        "Fight through ten evolving alien worlds, earn upgrades, and escape through the rings.",
      ),
      element("span", "hub-card-cta", "ENTER CAMPAIGN →"),
    );
    siegeCard.addEventListener("click", () => {
      this.hide();
      onSelectNeonSiege();
    });

    const clickerCard = element("button", "hub-game-card clicker-card");
    clickerCard.type = "button";
    clickerCard.append(
      element("span", "hub-card-icon", "✦"),
      element("span", "hub-card-tag", "IDLE · STRATEGY"),
      element("strong", "hub-card-title", "Voidworks: Stellar Tycoon"),
      element(
        "span",
        "hub-card-description",
        "Mine flux, automate a fleet, research new physics, complete contracts, and launch new expeditions.",
      ),
      element("span", "hub-card-cta", "OPEN VOIDWORKS →"),
    );
    clickerCard.addEventListener("click", () => this.showClicker());
    cards.append(siegeCard, clickerCard);
    const drivingCard = element("button", "hub-game-card driving-card");
    drivingCard.type = "button";
    drivingCard.append(
      element("span", "hub-card-icon", "⌁"),
      element("span", "hub-card-tag", "RACING · CAREER"),
      element("strong", "hub-card-title", "Nebula Rally"),
      element(
        "span",
        "hub-card-description",
        "Master three circuits, beat rival drivers, build drift score, and tune your car between races.",
      ),
      element("span", "hub-card-cta", "START YOUR CAREER →"),
    );
    drivingCard.addEventListener("click", () => this.showDriving());
    cards.append(drivingCard);
    this.picker.append(hubHeader, cards);

    const clickerHeader = element("header", "clicker-header");
    const clickerHeading = element("div", "clicker-title-group");
    clickerHeading.append(
      element("p", "hub-eyebrow", "VOIDWORKS · SECTOR 01"),
      element("h2", "clicker-title", "Stellar Tycoon"),
    );
    const backButton = element("button", "arcade-button", "← GAME LIBRARY");
    backButton.type = "button";
    backButton.addEventListener("click", () => this.showPicker());
    clickerHeader.append(clickerHeading, backButton);

    const resources = element("div", "clicker-resources");
    const fluxPanel = element("div", "clicker-resource");
    fluxPanel.append(element("span", "resource-label", "STELLAR FLUX"));
    this.fluxValue = element("strong", "resource-value", "0");
    fluxPanel.append(this.fluxValue);
    const dataPanel = element("div", "clicker-resource");
    this.researchRateLabel = element("span", "resource-label", "RESEARCH DATA");
    dataPanel.append(this.researchRateLabel);
    this.dataValue = element("strong", "resource-value", "0");
    dataPanel.append(this.dataValue);
    const productionPanel = element("div", "clicker-resource");
    productionPanel.append(element("span", "resource-label", "FLUX / SEC"));
    this.productionValue = element("strong", "resource-value", "0");
    productionPanel.append(this.productionValue);
    const lifetimePanel = element("div", "clicker-resource");
    lifetimePanel.append(element("span", "resource-label", "LIFETIME HARVEST"));
    this.lifetimeValue = element("strong", "resource-value", "0");
    lifetimePanel.append(this.lifetimeValue);
    resources.append(fluxPanel, dataPanel, productionPanel, lifetimePanel);

    const factory = element("div", "clicker-layout");
    const harvestPanel = element("section", "clicker-panel harvest-panel");
    harvestPanel.append(
      element("h3", "clicker-section-title", "MANUAL EXTRACTION"),
      element(
        "p",
        "clicker-muted",
        "Tap the unstable star core to harvest flux. Rapid taps build a combo multiplier.",
      ),
    );
    this.comboValue = element("p", "combo-display", "COMBO ×1.00");
    this.coreButton = element("button", "stellar-core");
    this.coreButton.type = "button";
    this.coreButton.setAttribute("aria-label", "Harvest stellar flux");
    this.coreButton.append(
      element("span", "core-rings", ""),
      element("span", "core-star", "✦"),
      element("span", "core-action", "HARVEST FLUX"),
    );
    this.coreButton.addEventListener("click", () => this.harvest());
    this.clickerMessage = element("p", "clicker-message", "Your first fleet is ready to build.");
    if (this.saveWarning) this.clickerMessage.textContent = this.saveWarning;
    harvestPanel.append(this.comboValue, this.coreButton, this.clickerMessage);

    const industryPanel = element("section", "clicker-panel industry-panel");
    industryPanel.append(
      element("h3", "clicker-section-title", "INDUSTRY"),
      element(
        "p",
        "clicker-muted",
        "Each structure compounds your output. Costs rise as your fleet expands.",
      ),
    );
    this.generatorList = element("div", "generator-list");
    this.researchLabButton = element("button", "industry-button");
    this.researchLabButton.type = "button";
    this.researchLabButton.addEventListener("click", () => {
      if (buyResearchLab(this.save)) {
        this.setMessage("Research lab commissioned. Data production is online.");
        this.saveProgress();
        this.render();
      } else {
        this.setMessage("Not enough flux to build a research lab.");
      }
    });
    industryPanel.append(this.generatorList, this.researchLabButton);
    factory.append(harvestPanel, industryPanel);

    const progression = element("div", "clicker-progression");
    const researchPanel = element("section", "clicker-panel research-panel");
    researchPanel.append(
      element("h3", "clicker-section-title", "RESEARCH TREE"),
      element("p", "clicker-muted", "Research data comes from extraction and research labs."),
    );
    this.researchList = element("div", "research-list");
    researchPanel.append(this.researchList);

    const augmentPanel = element("section", "clicker-panel augment-panel");
    augmentPanel.append(
      element("h3", "clicker-section-title", "PILOT AUGMENTS"),
      element(
        "p",
        "clicker-muted",
        "Install repeatable mining hardware or trigger a temporary production overdrive.",
      ),
    );
    this.augmentList = element("div", "augment-list");
    this.overdriveButton = element("button", "industry-button overdrive-button");
    this.overdriveButton.type = "button";
    this.overdriveButton.addEventListener("click", () => this.activateOverdrive());
    this.overdriveStatus = element("p", "overdrive-status", "");
    augmentPanel.append(this.augmentList, this.overdriveButton, this.overdriveStatus);

    const contractPanel = element("section", "clicker-panel contract-panel");
    contractPanel.append(
      element("h3", "clicker-section-title", "SECTOR CONTRACTS"),
      element("p", "clicker-muted", "Claim each milestone for a one-time data cache."),
    );
    this.contractList = element("div", "contract-list");
    contractPanel.append(this.contractList);

    const prestigePanel = element("section", "clicker-panel prestige-panel");
    prestigePanel.append(
      element("h3", "clicker-section-title", "NEW EXPEDITION"),
      element(
        "p",
        "clicker-muted",
        "Reset your current industry for permanent prestige and faster future production.",
      ),
    );
    this.prestigeButton = element("button", "industry-button prestige-button");
    this.prestigeButton.type = "button";
    this.prestigeButton.addEventListener("click", () => this.ascend());
    prestigePanel.append(this.prestigeButton);
    progression.append(researchPanel, augmentPanel, contractPanel, prestigePanel);

    this.clickerScreen.append(clickerHeader, resources, factory, progression);
    this.element.append(this.picker, this.clickerScreen);
    host.append(this.element);
    this.render();
    window.setInterval(() => this.tick(), 500);
    window.addEventListener("beforeunload", () => this.saveProgress());
  }

  show(): void {
    this.onOpenLibrary();
    this.element.hidden = false;
    this.showPicker();
  }

  private hide(): void {
    this.element.hidden = true;
  }

  private showPicker(): void {
    this.drivingGame?.deactivate();
    this.picker.hidden = false;
    this.clickerScreen.hidden = true;
    if (this.drivingGame) this.drivingGame.element.hidden = true;
    this.element.hidden = false;
  }

  private showClicker(): void {
    this.drivingGame?.deactivate();
    this.picker.hidden = true;
    this.clickerScreen.hidden = false;
    if (this.drivingGame) this.drivingGame.element.hidden = true;
    this.element.hidden = false;
    this.render();
  }

  private showDriving(): void {
    if (!this.drivingGame) {
      this.drivingGame = new DrivingGame(() => this.showPicker());
      this.element.append(this.drivingGame.element);
    }
    this.picker.hidden = true;
    this.clickerScreen.hidden = true;
    this.drivingGame.element.hidden = false;
    this.element.hidden = false;
    this.drivingGame.activate();
  }

  private loadSave(): ClickerSave {
    let restored: ClickerSave | null;
    try {
      const serialized = window.localStorage.getItem(SAVE_KEY);
      restored = parseClickerSave(serialized);
      if (serialized && !restored) {
        this.saveWarning = "Save data was invalid. A new expedition has started.";
      }
    } catch (error) {
      this.saveWarning =
        error instanceof Error
          ? `Saved progression could not be read: ${error.message}`
          : "Saved progression could not be read.";
      return createClickerSave();
    }
    const save = restored ?? createClickerSave();
    const awaySeconds = Math.max(0, Math.min((Date.now() - save.lastSavedAt) / 1000, 3600));
    if (awaySeconds > 1) {
      advanceClicker(save, awaySeconds);
      this.lastSaved = Date.now();
    }
    return save;
  }

  private saveProgress(): void {
    this.save.lastSavedAt = Date.now();
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(this.save));
      this.lastSaved = this.save.lastSavedAt;
    } catch {
      this.setMessage("Local saving is unavailable in this browser session.");
    }
  }

  private tick(): void {
    const now = Date.now();
    const elapsed = Math.max(0, (now - this.lastTick) / 1000);
    if (this.overdriveRemaining > 0) {
      const boostedSeconds = Math.min(elapsed, this.overdriveRemaining);
      advanceClicker(this.save, boostedSeconds, 3);
      advanceClicker(this.save, elapsed - boostedSeconds);
      this.overdriveRemaining -= boostedSeconds;
      if (this.overdriveRemaining === 0) {
        this.overdriveCooldown = Math.max(0, 30 - (elapsed - boostedSeconds));
      }
    } else {
      advanceClicker(this.save, elapsed);
      this.overdriveCooldown = Math.max(0, this.overdriveCooldown - elapsed);
    }
    this.lastTick = now;
    if (now - this.lastSaved >= 5000) this.saveProgress();
    if (!this.clickerScreen.hidden) this.render();
  }

  private harvest(): void {
    const now = Date.now();
    this.combo = now - this.lastClick < 1500 ? Math.min(MAX_COMBO, this.combo + 1) : 0;
    this.lastClick = now;
    const multiplier = 1 + this.combo * 0.04;
    const amount = mineFlux(this.save, multiplier);
    this.comboValue.textContent = `COMBO ×${multiplier.toFixed(2)} · +${formatAmount(amount)} FLUX`;
    this.setMessage("Manual extraction complete.");
    this.saveProgress();
    this.render();
  }

  private ascend(): void {
    const gain = startNewExpedition(this.save);
    if (gain === 0) return;
    this.setMessage(`Expedition launched. +${gain} prestige · permanent production boost secured.`);
    this.saveProgress();
    this.render();
  }

  private activateOverdrive(): void {
    if (this.overdriveRemaining > 0 || this.overdriveCooldown > 0 || this.save.data < 25) return;
    this.save.data -= 25;
    this.overdriveRemaining = 20;
    this.setMessage("Overdrive engaged · all production tripled for 20 seconds.");
    this.saveProgress();
    this.render();
  }

  private setMessage(message: string): void {
    this.clickerMessage.textContent = message;
  }

  private render(): void {
    this.fluxValue.textContent = formatAmount(this.save.flux);
    this.dataValue.textContent = formatAmount(this.save.data);
    this.researchRateLabel.textContent = `RESEARCH DATA · ${formatAmount(getResearchRate(this.save))}/S`;
    this.productionValue.textContent = formatAmount(getProductionRate(this.save));
    this.lifetimeValue.textContent = formatAmount(this.save.lifetimeFlux);
    if (this.lastClick === 0 || Date.now() - this.lastClick >= 1500) {
      this.combo = 0;
      this.comboValue.textContent = `COMBO ×1.00 · CLICK YIELD ${formatAmount(getClickYield(this.save))}`;
    }

    this.generatorList.replaceChildren();
    for (const generator of GENERATORS) {
      const card = element("div", "generator-card");
      const details = element("div", "generator-details");
      details.append(
        element("strong", "generator-name", generator.name),
        element("span", "generator-description", generator.description),
        element(
          "span",
          "generator-output",
          `${formatAmount(generator.fluxPerSecond)} flux/s each · owned ${this.save.generatorLevels[generator.id]}`,
        ),
      );
      const button = element("button", "industry-button");
      button.type = "button";
      const cost = getGeneratorCost(this.save, generator.id);
      button.textContent = `BUILD · ${formatAmount(cost)} FLUX`;
      button.disabled = this.save.flux < cost;
      button.addEventListener("click", () => this.purchaseGenerator(generator.id));
      card.append(details, button);
      this.generatorList.append(card);
    }

    const labCost = getLabCost(this.save);
    this.researchLabButton.textContent = `RESEARCH LAB · ${formatAmount(labCost)} FLUX · OWNED ${this.save.labLevel}`;
    this.researchLabButton.disabled = this.save.flux < labCost;

    this.researchList.replaceChildren();
    for (const research of RESEARCH) {
      const purchased = this.save.research.includes(research.id);
      const card = element("div", "research-card");
      const copy = element("div", "generator-details");
      copy.append(
        element("strong", "generator-name", research.name),
        element("span", "generator-description", research.description),
        element(
          "span",
          "generator-output",
          purchased ? "RESEARCH COMPLETE" : `${research.cost} DATA`,
        ),
      );
      const button = element("button", "industry-button");
      button.type = "button";
      button.textContent = purchased ? "COMPLETE" : "RESEARCH";
      button.disabled = purchased || this.save.data < research.cost;
      button.addEventListener("click", () => {
        if (!buyResearch(this.save, research.id)) return;
        this.setMessage(`${research.name} research completed.`);
        this.saveProgress();
        this.render();
      });
      card.append(copy, button);
      this.researchList.append(card);
    }

    this.augmentList.replaceChildren();
    const augments = [
      {
        id: "flux-scoop" as const,
        name: "Resonance gauntlet",
        description: `Click yield +1 · level ${this.save.clickUpgradeLevel}`,
        balance: this.save.flux,
        currency: "FLUX",
      },
      {
        id: "data-siphon" as const,
        name: "Data siphon",
        description: `Research data per click +50% · level ${this.save.dataSiphonLevel}`,
        balance: this.save.data,
        currency: "DATA",
      },
    ];
    for (const augment of augments) {
      const card = element("div", "augment-card");
      const copy = element("div", "generator-details");
      copy.append(
        element("strong", "generator-name", augment.name),
        element("span", "generator-description", augment.description),
      );
      const cost = getClickUpgradeCost(this.save, augment.id);
      const button = element("button", "industry-button");
      button.type = "button";
      button.textContent = `INSTALL · ${formatAmount(cost)} ${augment.currency}`;
      button.disabled = augment.balance < cost;
      button.addEventListener("click", () => {
        if (!buyClickUpgrade(this.save, augment.id)) return;
        this.setMessage(`${augment.name} installed.`);
        this.saveProgress();
        this.render();
      });
      card.append(copy, button);
      this.augmentList.append(card);
    }
    this.overdriveButton.textContent =
      this.overdriveRemaining > 0
        ? `OVERDRIVE · ${Math.ceil(this.overdriveRemaining)} SEC`
        : this.overdriveCooldown > 0
          ? `OVERDRIVE RECHARGING · ${Math.ceil(this.overdriveCooldown)} SEC`
          : "ACTIVATE OVERDRIVE · 25 DATA";
    this.overdriveButton.disabled =
      this.overdriveRemaining > 0 || this.overdriveCooldown > 0 || this.save.data < 25;
    this.overdriveStatus.textContent =
      this.overdriveRemaining > 0
        ? "Production ×3"
        : this.overdriveCooldown > 0
          ? "Overdrive becomes available after a short cooldown."
          : "A 20-second burst of triple production.";

    this.contractList.replaceChildren();
    for (const contract of getContracts(this.save)) {
      const card = element("div", "contract-card");
      const copy = element("div", "generator-details");
      copy.append(
        element("strong", "generator-name", contract.name),
        element("span", "generator-description", contract.description),
      );
      const button = element("button", "industry-button");
      button.type = "button";
      button.textContent = contract.claimed
        ? "CLAIMED"
        : contract.complete
          ? `CLAIM +${contract.reward} DATA`
          : "IN PROGRESS";
      button.disabled = !contract.complete || contract.claimed;
      button.addEventListener("click", () => {
        if (!claimContract(this.save, contract.id)) return;
        this.setMessage(`${contract.name} reward claimed.`);
        this.saveProgress();
        this.render();
      });
      card.append(copy, button);
      this.contractList.append(card);
    }

    const prestigeGain = getPrestigeGain(this.save);
    this.prestigeButton.textContent = prestigeGain
      ? `LAUNCH EXPEDITION · +${prestigeGain} PRESTIGE`
      : `NEED ${formatAmount(Math.max(0, 1_000_000 - this.save.lifetimeFlux))} MORE LIFETIME FLUX`;
    this.prestigeButton.disabled = prestigeGain === 0;
  }

  private purchaseGenerator(id: GeneratorId): void {
    if (!buyGenerator(this.save, id)) return;
    const generator = GENERATORS.find((item) => item.id === id);
    this.setMessage(`${generator?.name ?? "Generator"} commissioned.`);
    this.saveProgress();
    this.render();
  }
}
