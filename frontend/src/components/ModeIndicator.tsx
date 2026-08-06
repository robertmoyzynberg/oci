export type AppMode = "simulate" | "build";

export interface ModeIndicatorProps {
  mode: AppMode;
  onChange: (mode: AppMode) => void;
}

/**
 * Makes it explicit whether the user is simulating or constructing.
 * Build Mode is a forward-looking shell until Construct Mode ships.
 */
export default function ModeIndicator({ mode, onChange }: ModeIndicatorProps) {
  return (
    <div
      className="mode-indicator"
      role="group"
      aria-label="Application mode"
    >
      <button
        type="button"
        className={`mode-pill${mode === "simulate" ? " active" : ""}`}
        aria-pressed={mode === "simulate"}
        onClick={() => onChange("simulate")}
      >
        <span className="mode-pill-full">🔬 Simulation Mode</span>
        <span className="mode-pill-short" aria-hidden="true">
          🔬 Sim
        </span>
      </button>
      <button
        type="button"
        className={`mode-pill${mode === "build" ? " active" : ""}`}
        aria-pressed={mode === "build"}
        onClick={() => onChange("build")}
        title="Construct your own system map — coming soon"
      >
        <span className="mode-pill-full">🛠️ Build Mode</span>
        <span className="mode-pill-short" aria-hidden="true">
          🛠️ Build
        </span>
      </button>
    </div>
  );
}
