import type { SystemMap } from "../types/oci-types";

export interface ShareChallengeButtonProps {
  systemMap: SystemMap;
  /** Builds (and syncs) the current shareable URL including hash state. */
  getShareUrl: () => string;
  disabled?: boolean;
  onCopied: () => void;
  onError: (message: string) => void;
}

function challengeGoal(map: SystemMap): string {
  const domain = map.context.domain;
  if (domain === "energy") {
    return "Balance this grid so Fossil Capacity is largely retired by Year 30 without triggering Blackout Anxiety (keep total capacity above Grid Demand).";
  }
  if (domain === "water") {
    return "Keep Reservoir Level healthy through Year 40 without collapsing under agricultural and population demand.";
  }
  if (domain === "epidemiology" || domain === "health") {
    return "Flatten the infection curve — keep Infected from peaking catastrophically while recovering the population.";
  }
  const fromContext = map.context.goals?.[0];
  return fromContext ?? "Balance this system without triggering collapse.";
}

export function buildChallengeMessage(map: SystemMap, url: string): string {
  return [
    "🧠 OCI Converge Challenge",
    `System: ${map.metadata.title}`,
    `Goal: ${challengeGoal(map)}`,
    `URL: ${url}`,
    "Instructions: Open the link, run the simulation, and adjust the assumptions to achieve the goal. Share your solution!",
  ].join("\n");
}

/**
 * One-click classroom assignment: copies URL + challenge prompt.
 */
export default function ShareChallengeButton({
  systemMap,
  getShareUrl,
  disabled = false,
  onCopied,
  onError,
}: ShareChallengeButtonProps) {
  const handleClick = async () => {
    try {
      const url = getShareUrl();
      const message = buildChallengeMessage(systemMap, url);
      await navigator.clipboard.writeText(message);
      onCopied();
    } catch {
      onError(
        "Could not copy challenge — copy the URL from the address bar instead.",
      );
    }
  };

  return (
    <button
      type="button"
      className="share-challenge-btn"
      onClick={() => void handleClick()}
      disabled={disabled}
      title="Copy a classroom challenge with this simulation link"
    >
      📤 Share Challenge
    </button>
  );
}
