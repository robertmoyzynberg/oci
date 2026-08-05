export interface CompareToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/**
 * Sliding pill toggle for overlaying baseline vs custom simulation runs.
 */
export default function CompareToggle({
  checked,
  onChange,
  disabled = false,
}: CompareToggleProps) {
  return (
    <label
      className={`compare-toggle${checked ? " on" : ""}${disabled ? " disabled" : ""}`}
    >
      <span className="compare-toggle-text">🔁 Compare with Baseline</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label="Compare with baseline"
        disabled={disabled}
        className="compare-switch"
        onClick={() => onChange(!checked)}
      >
        <span className="compare-knob" />
      </button>
    </label>
  );
}
