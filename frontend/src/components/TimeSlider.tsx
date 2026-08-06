export interface TimeSliderProps {
  max: number;
  value: number;
  onChange: (index: number) => void;
  yearLabel?: number;
}

/**
 * Bottom scrubber for stepping through simulation frames (+ years).
 */
export default function TimeSlider({
  max,
  value,
  onChange,
  yearLabel,
}: TimeSliderProps) {
  const safeMax = Math.max(0, max);
  const year = yearLabel ?? value;

  return (
    <div className="time-slider">
      <div className="time-slider-label">
        <span className="time-slider-title-full">Time scrubber</span>
        <span className="time-slider-title-short" aria-hidden="true">
          Time
        </span>
        <strong>Year {year}</strong>
      </div>
      <input
        type="range"
        min={0}
        max={safeMax}
        step={1}
        value={Math.min(value, safeMax)}
        disabled={safeMax <= 0}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Simulation year"
      />
    </div>
  );
}
