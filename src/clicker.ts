export type GeneratorId = "drones" | "extractors" | "foundries" | "reactors";

export const GENERATORS: {
  id: GeneratorId;
  name: string;
  baseCost: number;
  fluxPerSecond: number;
  description: string;
}[] = [
  {
    id: "drones",
    name: "Mining drones",
    baseCost: 15,
    fluxPerSecond: 1,
    description: "Autonomous scout ships harvest nearby asteroids.",
  },
  {
    id: "extractors",
    name: "Helium extractors",
    baseCost: 110,
    fluxPerSecond: 7,
    description: "Strip rare gases from a gas giant's upper atmosphere.",
  },
  {
    id: "foundries",
    name: "Orbital foundries",
    baseCost: 720,
    fluxPerSecond: 42,
    description: "Turn raw stellar matter into refined flux.",
  },
  {
    id: "reactors",
    name: "Quantum reactors",
    baseCost: 5100,
    fluxPerSecond: 260,
    description: "Tap a contained singularity for immense energy.",
  },
];

export const RESEARCH: {
  id: string;
  name: string;
  cost: number;
  description: string;
}[] = [
  { id: "deep-drills", name: "Deep-core drills", cost: 12, description: "Double click yield." },
  {
    id: "data-compression",
    name: "Data compression",
    cost: 25,
    description: "Double research data production.",
  },
  {
    id: "flux-conduits",
    name: "Flux conduits",
    cost: 55,
    description: "Increase all generator output by 50%.",
  },
  {
    id: "stellar-mapping",
    name: "Stellar mapping",
    cost: 120,
    description: "Click yield ×3 and generator output ×2.",
  },
  {
    id: "singularity-math",
    name: "Singularity mathematics",
    cost: 300,
    description: "Increase all production by 100%.",
  },
];

export type ClickerSave = {
  flux: number;
  data: number;
  lifetimeFlux: number;
  lifetimeClicks: number;
  prestige: number;
  generatorLevels: Record<GeneratorId, number>;
  labLevel: number;
  clickUpgradeLevel: number;
  dataSiphonLevel: number;
  research: string[];
  claimedContracts: string[];
  lastSavedAt: number;
};

const CONTRACTS = [
  { id: "fleet", name: "First fleet", reward: 8, description: "Own 5 mining drones." },
  {
    id: "survey",
    name: "Stellar survey",
    reward: 15,
    description: "Harvest 500 flux over the course of your expedition.",
  },
  {
    id: "industry",
    name: "Industrial era",
    reward: 30,
    description: "Build 12 generators across your fleet.",
  },
  {
    id: "breakthrough",
    name: "Breakthrough",
    reward: 45,
    description: "Complete 2 research projects.",
  },
] as const;

export function createClickerSave(now = Date.now()): ClickerSave {
  return {
    flux: 25,
    data: 0,
    lifetimeFlux: 0,
    lifetimeClicks: 0,
    prestige: 0,
    generatorLevels: { drones: 0, extractors: 0, foundries: 0, reactors: 0 },
    labLevel: 0,
    clickUpgradeLevel: 0,
    dataSiphonLevel: 0,
    research: [],
    claimedContracts: [],
    lastSavedAt: now,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function savedNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.min(value, 1e100)
    : fallback;
}

export function parseClickerSave(serialized: string | null): ClickerSave | null {
  if (!serialized) return null;
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    return null;
  }
  if (!isRecord(value) || !isRecord(value.generatorLevels)) return null;
  const savedLevels = value.generatorLevels;
  const generatorLevels: Record<GeneratorId, number> = {
    drones: Math.floor(savedNumber(savedLevels.drones)),
    extractors: Math.floor(savedNumber(savedLevels.extractors)),
    foundries: Math.floor(savedNumber(savedLevels.foundries)),
    reactors: Math.floor(savedNumber(savedLevels.reactors)),
  };
  const research = Array.isArray(value.research)
    ? value.research.filter(
        (id): id is string => typeof id === "string" && RESEARCH.some((item) => item.id === id),
      )
    : [];
  const claimedContracts = Array.isArray(value.claimedContracts)
    ? value.claimedContracts.filter(
        (id): id is string => typeof id === "string" && CONTRACTS.some((item) => item.id === id),
      )
    : [];

  return {
    flux: savedNumber(value.flux),
    data: savedNumber(value.data),
    lifetimeFlux: savedNumber(value.lifetimeFlux),
    lifetimeClicks: Math.floor(savedNumber(value.lifetimeClicks)),
    prestige: Math.floor(savedNumber(value.prestige)),
    generatorLevels,
    labLevel: Math.floor(savedNumber(value.labLevel)),
    clickUpgradeLevel: Math.floor(savedNumber(value.clickUpgradeLevel)),
    dataSiphonLevel: Math.floor(savedNumber(value.dataSiphonLevel)),
    research: [...new Set(research)],
    claimedContracts: [...new Set(claimedContracts)],
    lastSavedAt: savedNumber(value.lastSavedAt, Date.now()),
  };
}

export function getGeneratorCost(save: ClickerSave, id: GeneratorId): number {
  const generator = GENERATORS.find((item) => item.id === id);
  if (!generator) throw new Error(`Unknown generator: ${id}`);
  return Math.ceil(generator.baseCost * 1.17 ** (save.generatorLevels[id] ?? 0));
}

export function getLabCost(save: ClickerSave): number {
  return Math.ceil(100 * 1.2 ** save.labLevel);
}

export function getProductionRate(save: ClickerSave): number {
  const researchMultiplier =
    (save.research.includes("flux-conduits") ? 1.5 : 1) *
    (save.research.includes("stellar-mapping") ? 2 : 1) *
    (save.research.includes("singularity-math") ? 2 : 1);
  const prestigeMultiplier = 1 + save.prestige * 0.2;
  const generators = GENERATORS.reduce((sum, generator) => {
    return sum + generator.fluxPerSecond * save.generatorLevels[generator.id];
  }, 0);
  return generators * researchMultiplier * prestigeMultiplier;
}

export function getResearchRate(save: ClickerSave): number {
  return (
    save.labLevel *
    0.2 *
    (save.research.includes("data-compression") ? 2 : 1) *
    (1 + save.prestige * 0.2)
  );
}

export function getClickYield(save: ClickerSave): number {
  return (
    (1 +
      save.clickUpgradeLevel +
      (save.research.includes("deep-drills") ? 1 : 0) +
      (save.research.includes("stellar-mapping") ? 2 : 0)) *
    (1 + save.prestige * 0.2)
  );
}

export function advanceClicker(
  save: ClickerSave,
  elapsedSeconds: number,
  productionMultiplier = 1,
): void {
  const elapsed = Math.max(0, Math.min(elapsedSeconds, 3600));
  const flux = getProductionRate(save) * Math.max(1, productionMultiplier) * elapsed;
  save.flux += flux;
  save.lifetimeFlux += flux;
  save.data += getResearchRate(save) * Math.max(1, productionMultiplier) * elapsed;
}

export function mineFlux(save: ClickerSave, comboMultiplier = 1): number {
  const amount = getClickYield(save) * Math.max(1, comboMultiplier);
  save.flux += amount;
  save.lifetimeFlux += amount;
  save.lifetimeClicks += 1;
  save.data += amount * (0.02 + save.dataSiphonLevel * 0.01);
  return amount;
}

export function getClickUpgradeCost(save: ClickerSave, id: "flux-scoop" | "data-siphon"): number {
  return id === "flux-scoop"
    ? Math.ceil(35 * 1.8 ** save.clickUpgradeLevel)
    : Math.ceil(12 * 1.75 ** save.dataSiphonLevel);
}

export function buyClickUpgrade(save: ClickerSave, id: "flux-scoop" | "data-siphon"): boolean {
  const cost = getClickUpgradeCost(save, id);
  const balance = id === "flux-scoop" ? save.flux : save.data;
  if (balance < cost) return false;
  if (id === "flux-scoop") {
    save.flux -= cost;
    save.clickUpgradeLevel += 1;
  } else {
    save.data -= cost;
    save.dataSiphonLevel += 1;
  }
  return true;
}

export function buyGenerator(save: ClickerSave, id: GeneratorId): boolean {
  const cost = getGeneratorCost(save, id);
  if (save.flux < cost) return false;
  save.flux -= cost;
  save.generatorLevels[id] += 1;
  return true;
}

export function buyResearchLab(save: ClickerSave): boolean {
  const cost = getLabCost(save);
  if (save.flux < cost) return false;
  save.flux -= cost;
  save.labLevel += 1;
  return true;
}

export function buyResearch(save: ClickerSave, id: string): boolean {
  const project = RESEARCH.find((item) => item.id === id);
  if (!project) throw new Error(`Unknown research project: ${id}`);
  if (save.research.includes(id) || save.data < project.cost) return false;
  save.data -= project.cost;
  save.research.push(id);
  return true;
}

export function getContracts(save: ClickerSave): {
  id: string;
  name: string;
  reward: number;
  description: string;
  complete: boolean;
  claimed: boolean;
}[] {
  const totalGenerators = Object.values(save.generatorLevels).reduce(
    (sum, level) => sum + level,
    0,
  );
  const completed = new Set<string>();
  if (save.generatorLevels.drones >= 5) completed.add("fleet");
  if (save.lifetimeFlux >= 500) completed.add("survey");
  if (totalGenerators >= 12) completed.add("industry");
  if (save.research.length >= 2) completed.add("breakthrough");
  return CONTRACTS.map((contract) => ({
    ...contract,
    complete: completed.has(contract.id),
    claimed: save.claimedContracts.includes(contract.id),
  }));
}

export function claimContract(save: ClickerSave, id: string): boolean {
  const contract = getContracts(save).find((item) => item.id === id);
  if (!contract) throw new Error(`Unknown contract: ${id}`);
  if (!contract.complete || contract.claimed) return false;
  save.claimedContracts.push(id);
  save.data += contract.reward;
  return true;
}

export function getPrestigeGain(save: ClickerSave): number {
  return Math.max(0, Math.floor(Math.sqrt(save.lifetimeFlux / 1_000_000)) - save.prestige);
}

export function startNewExpedition(save: ClickerSave): number {
  const gain = getPrestigeGain(save);
  if (gain === 0) return 0;
  const fresh = createClickerSave(save.lastSavedAt);
  save.flux = fresh.flux;
  save.data = fresh.data;
  save.generatorLevels = fresh.generatorLevels;
  save.labLevel = fresh.labLevel;
  save.clickUpgradeLevel = fresh.clickUpgradeLevel;
  save.dataSiphonLevel = fresh.dataSiphonLevel;
  save.research = fresh.research;
  save.claimedContracts = fresh.claimedContracts;
  save.prestige += gain;
  return gain;
}
