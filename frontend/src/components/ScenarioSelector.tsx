import type { ScenarioId, ScenarioTemplate } from "../data/scenarios";
import { SCENARIOS } from "../data/scenarios";
import type { SystemMap } from "../types/oci-types";

export interface ScenarioSelectorProps {
  value: ScenarioId;
  /** Preferred: receive scenario id when selection changes. */
  onChange?: (id: ScenarioId) => void;
  /** Alternate: receive the selected map (per feature prompt). */
  onSelect?: (map: SystemMap, scenario: ScenarioTemplate) => void;
  disabled?: boolean;
}

/**
 * Dropdown to load a pre-baked system map template.
 */
export default function ScenarioSelector({
  value,
  onChange,
  onSelect,
  disabled = false,
}: ScenarioSelectorProps) {
  return (
    <label className="scenario-selector">
      <span className="scenario-selector-label">Scenario</span>
      <select
        value={value}
        disabled={disabled}
        aria-label="Select scenario template"
        onChange={(e) => {
          const id = e.target.value as ScenarioId;
          const scenario = SCENARIOS.find((s) => s.id === id);
          onChange?.(id);
          if (scenario) onSelect?.(scenario.map, scenario);
        }}
      >
        {SCENARIOS.map((scenario) => (
          <option key={scenario.id} value={scenario.id}>
            {scenario.label}
          </option>
        ))}
      </select>
    </label>
  );
}
