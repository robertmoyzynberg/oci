import { useLocalStorage } from "../hooks/useLocalStorage";

const STORAGE_KEY = "oci-onboarding-dismissed-v1";

/**
 * Dismissible first-visit explainer for stocks, flows, and memes.
 */
export default function OnboardingTooltip() {
  const [dismissed, setDismissed] = useLocalStorage(STORAGE_KEY, false);

  if (dismissed) return null;

  return (
    <div className="onboarding-tooltip" role="dialog" aria-label="Welcome tip">
      <button
        type="button"
        className="onboarding-close"
        aria-label="Dismiss welcome tip"
        onClick={() => setDismissed(true)}
      >
        ×
      </button>
      <h3>🧭 Welcome to OCI Converge</h3>
      <ul>
        <li>
          <strong>Circles (Stocks)</strong> = Resources or quantities (e.g.,
          water, energy).
        </li>
        <li>
          <strong>Arrows (Flows)</strong> = Changes over time (e.g.,
          consumption, recharge).
        </li>
        <li>
          <strong>Gold dots (Memes)</strong> = Beliefs or narratives that
          influence the system. Hover one to see glow, dimming, and a{" "}
          <strong>+ / −</strong> influence sign.
        </li>
        <li>
          <strong>Labels</strong> = Use the Labels dropdown to show name + value
          + unit (e.g. Fossil Capacity · 80.0 GW).
        </li>
        <li>
          <strong>Mode badge</strong> = You are in Simulation Mode. Build Mode
          is a preview for constructing your own maps later.
        </li>
        <li>
          <strong>Grid Demand</strong> = Keep total capacity above the dashed
          demand marker. If capacity falls below demand, the system enters a
          blackout state and Blackout Anxiety grows.
        </li>
      </ul>
      <p className="onboarding-footer">
        Click <strong>🚀 Load Example Scenario</strong> to see a simulation in
        action. Drag the time slider to watch it evolve.
      </p>
      <button
        type="button"
        className="onboarding-got-it"
        onClick={() => setDismissed(true)}
      >
        Got it
      </button>
    </div>
  );
}
