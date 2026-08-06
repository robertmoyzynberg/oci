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
          <strong>Circles</strong> = stocks (quantities).
        </li>
        <li>
          <strong>Arrows</strong> = flows (change over time).
        </li>
        <li>
          <strong>Gold dots</strong> = memes (beliefs). Tap one to see what
          they influence.
        </li>
        <li className="onboarding-extra">
          <strong>Labels</strong> = name + value + unit on each stock.
        </li>
        <li className="onboarding-extra">
          <strong>Grid Demand</strong> = drag the marker; below demand =
          blackout.
        </li>
      </ul>
      <p className="onboarding-footer">
        Tap <strong>🚀 Load Example</strong>, then scrub time below.
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
