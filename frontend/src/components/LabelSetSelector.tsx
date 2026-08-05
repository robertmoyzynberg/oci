export type LabelSet = "full" | "name" | "value";

export interface LabelSetSelectorProps {
  value: LabelSet;
  onChange: (value: LabelSet) => void;
}

const OPTIONS: { value: LabelSet; label: string; hint: string }[] = [
  {
    value: "full",
    label: "Name + value + unit",
    hint: "Reservoir Level · 80.0 GL",
  },
  {
    value: "name",
    label: "Name + value",
    hint: "Reservoir Level · 80.0",
  },
  {
    value: "value",
    label: "Value only",
    hint: "80.0",
  },
];

/**
 * Controls how stock numbers are annotated on the canvas.
 */
export default function LabelSetSelector({
  value,
  onChange,
}: LabelSetSelectorProps) {
  return (
    <label className="label-set-selector">
      <span className="label-set-caption">Labels</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as LabelSet)}
        aria-label="Stock label set"
        title={OPTIONS.find((o) => o.value === value)?.hint}
      >
        {OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
