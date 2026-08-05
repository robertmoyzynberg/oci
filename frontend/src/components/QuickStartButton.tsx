export interface QuickStartButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

/**
 * One-click entry point: load the Energy Transition example and run it.
 */
export default function QuickStartButton({
  onClick,
  disabled = false,
}: QuickStartButtonProps) {
  return (
    <button
      type="button"
      className="quick-start-btn"
      onClick={onClick}
      disabled={disabled}
      title="Loads a pre-built scenario and runs the simulation."
    >
      🚀 Load Example Scenario
    </button>
  );
}
