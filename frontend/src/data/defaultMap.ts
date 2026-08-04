import type { SystemMap } from "../types/oci-types";

/**
 * Default Renewable Energy Transition demo map.
 * Flow endpoints use wire keys `from` / `to` to match the backend Flow aliases.
 */
export const defaultMap: SystemMap = {
  metadata: {
    id: "renewable-energy-transition-v1",
    title: "Renewable Energy Transition",
    version: "1.0.0",
    description:
      "A stylized regional model of fossil vs renewable capacity adoption, including cultural memes and policy assumptions that shape the transition pace. OCI Converge schema v1 default demo.",
    author: "OCI Converge",
    tags: ["energy", "climate", "transition", "demo", "oci-schema-v1"],
    created_at: "2026-01-15T00:00:00Z",
    updated_at: "2026-08-04T00:00:00Z",
  },
  context: {
    domain: "energy",
    narrative:
      "A mid-sized region is shifting from fossil generation toward renewables. Adoption is reinforced by falling technology costs and public enthusiasm, but constrained by grid inertia, capital limits, and residual fossil lock-in.",
    stakeholders: [
      "municipal government",
      "utility operators",
      "household consumers",
      "renewable developers",
      "fossil industry workers",
    ],
    spatial: {
      type: "region",
      label: "Coastal Midland Region",
      coordinates: [-122.5, 37.0, -121.5, 38.0],
    },
    temporal: {
      start: 0.0,
      end: 40.0,
      dt: 1.0,
      unit: "years",
    },
    goals: [
      "Raise renewable share of installed capacity",
      "Avoid abrupt collapse of fossil-sector employment",
      "Keep total system cost within political feasibility",
    ],
  },
  stocks: [
    {
      id: "fossil_capacity",
      name: "Fossil Capacity",
      description:
        "Installed fossil-fuel generation capacity still online in the region.",
      initial_value: 80.0,
      min_value: 0.0,
      max_value: 200.0,
      unit: "GW",
      category: "infrastructure",
    },
    {
      id: "renewable_capacity",
      name: "Renewable Capacity",
      description:
        "Installed renewable generation capacity (solar, wind, storage-backed).",
      initial_value: 20.0,
      min_value: 0.0,
      max_value: 200.0,
      unit: "GW",
      category: "infrastructure",
    },
  ],
  flows: [
    {
      id: "retire_fossil",
      name: "Fossil Retirement",
      description:
        "Rate at which fossil plants are retired as renewables and policy pressure grow.",
      from: "fossil_capacity",
      to: null,
      equation:
        "fossil_capacity * retire_rate * (1 + tech_improvement * renewable_capacity / (fossil_capacity + renewable_capacity + 1e-9))",
      unit: "GW/year",
    },
    {
      id: "build_renewables",
      name: "Renewable Buildout",
      description:
        "Net addition of renewable capacity driven by demand growth, tech improvement, and remaining fossil share.",
      from: null,
      to: "renewable_capacity",
      equation:
        "pop_growth * renewable_capacity * tech_improvement + build_base * fossil_capacity / (fossil_capacity + renewable_capacity + 1e-9)",
      unit: "GW/year",
    },
  ],
  feedback_loops: [
    {
      id: "loop_r1",
      name: "Learning-by-Doing Acceleration",
      type: "reinforcing",
      description:
        "More renewable capacity improves technology learning, which increases buildout of still more renewables.",
      elements: ["renewable_capacity", "build_renewables", "tech_improvement"],
      polarity: "+",
    },
    {
      id: "loop_b1",
      name: "Grid Saturation Brake",
      type: "balancing",
      description:
        "As renewables displace fossils, the fossil-share term that seeds new renewable builds shrinks, slowing runaway growth.",
      elements: [
        "fossil_capacity",
        "retire_fossil",
        "build_renewables",
        "renewable_capacity",
      ],
      polarity: "-",
    },
  ],
  memes: [
    {
      id: "meme_green_future",
      name: "Green Future Pride",
      description:
        "A hopeful civic narrative that frames renewable adoption as regional identity and moral progress.",
      emotional_charge: 0.75,
      related_stocks: ["renewable_capacity"],
      related_assumptions: ["tech_improvement", "build_base"],
    },
    {
      id: "meme_grid_anxiety",
      name: "Blackout Anxiety",
      description:
        "A fearful narrative that equates fossil retirement with unreliable power and winter blackouts.",
      emotional_charge: -0.65,
      related_stocks: ["fossil_capacity"],
      related_assumptions: ["retire_rate"],
    },
  ],
  assumptions: {
    registry: {
      pop_growth: {
        value: 0.015,
        confidence: 0.7,
        range: [0.0, 0.05],
        source: "Regional census mid-scenario (2024)",
        mutable: true,
      },
      tech_improvement: {
        value: 0.04,
        confidence: 0.6,
        range: [0.0, 0.15],
        source: "IRENA learning-curve meta-estimate",
        mutable: true,
      },
      retire_rate: {
        value: 0.02,
        confidence: 0.55,
        range: [0.0, 0.1],
        source: "Utility decommissioning schedules",
        mutable: true,
      },
      build_base: {
        value: 1.5,
        confidence: 0.5,
        range: [0.0, 5.0],
        source: "Historical interconnection queue throughput",
        mutable: true,
      },
    },
    scenario_branches: [
      {
        name: "Accelerated Transition",
        description:
          "Aggressive tech learning and faster fossil retirement under strong policy support.",
        overrides: {
          tech_improvement: 0.1,
          retire_rate: 0.06,
        },
      },
      {
        name: "Stalled Transition",
        description:
          "Weak learning rates and slow retirement amid political resistance.",
        overrides: {
          tech_improvement: 0.01,
          retire_rate: 0.005,
          pop_growth: 0.02,
        },
      },
    ],
  },
  visual_style: {
    theme: "civic",
    stock_color: "#2E7D32",
    flow_color: "#1565C0",
    reinforcing_loop_color: "#C62828",
    balancing_loop_color: "#6A1B9A",
    layout: "force",
    extras: {
      background: "soft-topo",
      font: "Source Serif",
    },
  },
};
