import type { AssumptionParam } from "../types/oci-types";

export interface AssumptionControlsProps {
  assumptions: Record<string, AssumptionParam>;
  onOverrideChange: (key: string, value: number) => void;
  overrides: Record<string, number>;
}

const LABELS: Record<string, string> = {
  pop_growth: "Population growth rate",
  tech_improvement: "Technology improvement",
  retire_rate: "Fossil retirement rate",
  build_base: "Renewable build rate",
  grid_demand: "Grid demand (baseline)",
  rainfall_variability: "Rainfall variability",
  efficiency_improvement: "Water efficiency improvement",
  transmission_rate: "Transmission rate",
  recovery_rate: "Recovery rate",
  vaccine_rollout: "Vaccine rollout",
};

function humanLabel(key: string): string {
  return LABELS[key] ?? key.replace(/_/g, " ");
}

function numericValue(param: AssumptionParam, override?: number): number {
  if (override != null) return override;
  if (typeof param.value === "number") return param.value;
  if (typeof param.value === "boolean") return param.value ? 1 : 0;
  const parsed = Number(param.value);
  return Number.isFinite(parsed) ? parsed : param.range[0];
}

/**
 * Sidebar sliders for mutable assumption registry parameters.
 */
export default function AssumptionControls({
  assumptions,
  onOverrideChange,
  overrides,
}: AssumptionControlsProps) {
  const entries = Object.entries(assumptions);

  return (
    <section className="panel">
      <h2>Assumptions</h2>
      <p className="panel-hint">
        What you believe about the world — drag to explore other futures.
      </p>
      {entries.map(([key, param]) => {
        const [min, max] = param.range;
        const value = numericValue(param, overrides[key]);
        const step = (max - min) / 200 || 0.001;
        const confidencePct = Math.round(param.confidence * 100);
        const disabled = param.mutable === false;
        const label = humanLabel(key);

        return (
          <div className="assumption-row" key={key}>
            <div className="assumption-head">
              <span className="assumption-name" title={key}>
                {label}
              </span>
              <span className="assumption-value">{value.toFixed(3)}</span>
            </div>
            <span className="confidence-badge">{confidencePct}% confidence</span>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={value}
              disabled={disabled}
              onChange={(e) => onOverrideChange(key, Number(e.target.value))}
              aria-label={`${label} assumption`}
            />
          </div>
        );
      })}
    </section>
  );
}
