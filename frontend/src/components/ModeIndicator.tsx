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
        🔬 Simulation Mode
      </button>
      <button
        type="button"
        className={`mode-pill${mode === "build" ? " active" : ""}`}
        aria-pressed={mode === "build"}
        onClick={() => onChange("build")}
        title="Construct your own system map — coming soon"
      >
        🛠️ Build Mode
      </button>
    </div>
  );
}
