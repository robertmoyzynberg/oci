import { defaultMap } from "./defaultMap";
import type { SystemMap } from "../types/oci-types";

export type ScenarioId = "water" | "energy" | "pandemic";

export interface ScenarioTemplate {
  id: ScenarioId;
  label: string;
  map: SystemMap;
}

/** Deep-clone helper so scenario switches don't mutate templates. */
function cloneMap(map: SystemMap): SystemMap {
  return JSON.parse(JSON.stringify(map)) as SystemMap;
}

const waterCrisisMap: SystemMap = {
  metadata: {
    id: "water-crisis-v1",
    title: "Water Crisis",
    version: "1.0.0",
    description:
      "A regional water grid under drought pressure: reservoir storage vs agricultural and population demand.",
    author: "OCI Converge",
    tags: ["water", "drought", "demo"],
  },
  context: {
    domain: "water",
    narrative:
      "A drought-stressed basin must balance reservoir storage against agricultural demand and a growing population. Over-extraction empties the reservoir; efficiency and rainfall recharge stabilize it.",
    stakeholders: [
      "farmers",
      "city water utility",
      "environmental groups",
      "regional government",
    ],
    temporal: { start: 0, end: 40, dt: 1, unit: "years" },
    goals: [
      "Keep the reservoir above critical level",
      "Sustain agricultural livelihoods",
      "Serve a growing population",
    ],
  },
  stocks: [
    {
      id: "reservoir_level",
      name: "Reservoir Level",
      description: "Stored surface water available for use.",
      initial_value: 100,
      min_value: 0,
      max_value: 200,
      unit: "GL",
      category: "resource",
    },
    {
      id: "agricultural_demand",
      name: "Agricultural Demand",
      description: "Irrigation demand from farms in the basin.",
      initial_value: 50,
      min_value: 0,
      max_value: 150,
      unit: "GL/year",
      category: "demand",
    },
    {
      id: "population",
      name: "Population",
      description: "Regional population drawing municipal water.",
      initial_value: 1000,
      min_value: 100,
      max_value: 5000,
      unit: "people (scaled)",
      category: "social",
    },
  ],
  flows: [
    {
      id: "recharge",
      name: "Recharge",
      description: "Natural rainfall inflow to the reservoir.",
      from: null,
      to: "reservoir_level",
      equation: "12 * rainfall_variability",
      unit: "GL/year",
    },
    {
      id: "consumption",
      name: "Consumption",
      description: "Withdrawals for farms and cities.",
      from: "reservoir_level",
      to: null,
      equation:
        "agricultural_demand * (1 - efficiency_improvement) + population * 0.008",
      unit: "GL/year",
    },
  ],
  feedback_loops: [
    {
      id: "loop_r_water",
      name: "Demand Escalation",
      type: "reinforcing",
      description: "Higher demand increases extraction pressure.",
      elements: ["agricultural_demand", "population", "consumption"],
      polarity: "+",
    },
    {
      id: "loop_b_water",
      name: "Reservoir Constraint",
      type: "balancing",
      description: "Falling reservoir levels constrain the system.",
      elements: ["reservoir_level", "consumption"],
      polarity: "-",
    },
  ],
  memes: [
    {
      id: "meme_abundant",
      name: "Water is abundant",
      description: "Low-urgency belief that the basin will always refill.",
      emotional_charge: 0.35,
      related_stocks: ["reservoir_level"],
      related_flows: ["consumption"],
      related_assumptions: ["rainfall_variability"],
      influence: "+",
    },
    {
      id: "meme_drought",
      name: "Drought is coming",
      description: "High-urgency warning that scarcity is already here.",
      emotional_charge: -0.75,
      related_stocks: ["reservoir_level"],
      related_flows: ["consumption"],
      related_assumptions: ["efficiency_improvement"],
      influence: "-",
    },
  ],
  assumptions: {
    registry: {
      rainfall_variability: {
        value: 0.8,
        confidence: 0.55,
        range: [0.1, 1.5],
        source: "Basin rainfall index",
        mutable: true,
      },
      efficiency_improvement: {
        value: 0.05,
        confidence: 0.5,
        range: [0, 0.6],
        source: "Irrigation efficiency program",
        mutable: true,
      },
    },
    scenario_branches: [
      {
        name: "Dry Decade",
        overrides: { rainfall_variability: 0.35 },
      },
      {
        name: "Efficiency Push",
        overrides: { efficiency_improvement: 0.35 },
      },
    ],
  },
  visual_style: {
    theme: "civic",
    stock_color: "#1565C0",
    flow_color: "#0288D1",
    layout: "force",
  },
};

const pandemicMap: SystemMap = {
  metadata: {
    id: "pandemic-spread-v1",
    title: "Pandemic Spread",
    version: "1.0.0",
    description:
      "A stylized SIR-like contagion model with optional vaccine rollout.",
    author: "OCI Converge",
    tags: ["health", "pandemic", "demo"],
  },
  context: {
    domain: "health",
    narrative:
      "A novel pathogen spreads through a closed population. Transmission rises with contact; recovery and vaccines shrink the susceptible pool. Policy choices change the curve.",
    stakeholders: [
      "public health agencies",
      "hospitals",
      "schools",
      "general public",
    ],
    temporal: { start: 0, end: 120, dt: 1, unit: "days" },
    goals: [
      "Limit peak infections",
      "Protect hospital capacity",
      "Reach a stable recovered majority",
    ],
  },
  stocks: [
    {
      id: "susceptible",
      name: "Susceptible",
      description: "People who can still catch the pathogen.",
      initial_value: 990,
      min_value: 0,
      max_value: 1000,
      unit: "people",
      category: "epidemiology",
    },
    {
      id: "infected",
      name: "Infected",
      description: "Currently infectious cases.",
      initial_value: 10,
      min_value: 0,
      max_value: 1000,
      unit: "people",
      category: "epidemiology",
    },
    {
      id: "recovered",
      name: "Recovered",
      description: "People who recovered or were vaccinated out of risk.",
      initial_value: 0,
      min_value: 0,
      max_value: 1000,
      unit: "people",
      category: "epidemiology",
    },
  ],
  flows: [
    {
      id: "infection",
      name: "Infection",
      description: "Transmission from infected to susceptible.",
      from: "susceptible",
      to: "infected",
      equation:
        "transmission_rate * susceptible * infected / (susceptible + infected + recovered + 1e-9)",
      unit: "people/day",
    },
    {
      id: "recovery",
      name: "Recovery",
      description: "Infected people recovering.",
      from: "infected",
      to: "recovered",
      equation: "recovery_rate * infected",
      unit: "people/day",
    },
    {
      id: "vaccination",
      name: "Vaccine Rollout",
      description: "Susceptible people protected via vaccination.",
      from: "susceptible",
      to: "recovered",
      equation: "vaccine_rollout * susceptible",
      unit: "people/day",
    },
  ],
  feedback_loops: [
    {
      id: "loop_r_spread",
      name: "Contagion Cascade",
      type: "reinforcing",
      description: "More infected people accelerate new infections.",
      elements: ["infected", "infection", "susceptible"],
      polarity: "+",
    },
    {
      id: "loop_b_recovery",
      name: "Recovery Brake",
      type: "balancing",
      description: "Recovery and vaccines shrink the infectious pool.",
      elements: ["infected", "recovery", "recovered", "vaccination"],
      polarity: "-",
    },
  ],
  memes: [
    {
      id: "meme_flu",
      name: "It's just a flu",
      description: "Low-concern narrative that minimizes collective risk.",
      emotional_charge: 0.25,
      related_stocks: ["infected"],
      related_flows: ["infection"],
      related_assumptions: ["transmission_rate"],
      influence: "+",
    },
    {
      id: "meme_lockdown",
      name: "We need lockdown",
      description: "High-concern call for strong contact reduction.",
      emotional_charge: -0.7,
      related_stocks: ["susceptible", "infected"],
      related_flows: ["infection", "vaccination"],
      related_assumptions: ["transmission_rate", "vaccine_rollout"],
      influence: "-",
    },
  ],
  assumptions: {
    registry: {
      transmission_rate: {
        value: 0.3,
        confidence: 0.55,
        range: [0.05, 0.8],
        source: "Early R0 calibration",
        mutable: true,
      },
      recovery_rate: {
        value: 0.1,
        confidence: 0.6,
        range: [0.02, 0.4],
        source: "Mean infectious period ~10 days",
        mutable: true,
      },
      vaccine_rollout: {
        value: 0.02,
        confidence: 0.5,
        range: [0, 0.15],
        source: "Vaccination campaign pace",
        mutable: true,
      },
    },
    scenario_branches: [
      {
        name: "Lockdown",
        overrides: { transmission_rate: 0.12 },
      },
      {
        name: "Fast Vaccines",
        overrides: { vaccine_rollout: 0.08 },
      },
    ],
  },
  visual_style: {
    theme: "civic",
    stock_color: "#C62828",
    flow_color: "#EF6C00",
    layout: "force",
  },
};

export const SCENARIOS: ScenarioTemplate[] = [
  {
    id: "water",
    label: "🌊 Water Crisis",
    map: waterCrisisMap,
  },
  {
    id: "energy",
    label: "⚡ Energy Transition",
    map: defaultMap,
  },
  {
    id: "pandemic",
    label: "🦠 Pandemic Spread",
    map: pandemicMap,
  },
];

export function getScenarioById(id: ScenarioId): ScenarioTemplate {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[1];
}

export function cloneScenarioMap(id: ScenarioId): SystemMap {
  return cloneMap(getScenarioById(id).map);
}

/** Best-effort match of a loaded map to a known scenario template. */
export function matchScenarioId(map: SystemMap): ScenarioId {
  const id = map.metadata.id;
  if (id.includes("water")) return "water";
  if (id.includes("pandemic") || id.includes("sir")) return "pandemic";
  if (id.includes("renewable") || id.includes("energy")) return "energy";
  return "energy";
}
