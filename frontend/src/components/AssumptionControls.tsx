import type { AssumptionParam } from "../types/oci-types";

export interface AssumptionControlsProps {
  assumptions: Record<string, AssumptionParam>;
  onOverrideChange: (key: string, value: number) => void;
  overrides: Record<string, number>;
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
      {entries.map(([key, param]) => {
        const [min, max] = param.range;
        const value = numericValue(param, overrides[key]);
        const step = (max - min) / 200 || 0.001;
        const confidencePct = Math.round(param.confidence * 100);
        const disabled = param.mutable === false;

        return (
          <div className="assumption-row" key={key}>
            <div className="assumption-head">
              <span className="assumption-name">{key}</span>
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
              aria-label={`${key} assumption`}
            />
          </div>
        );
      })}
    </section>
  );
}
