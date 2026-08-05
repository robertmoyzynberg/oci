import { defaultMap } from "../data/defaultMap";
import type { SystemMap } from "../types/oci-types";

/**
 * Compress a SystemMap into a URL-safe base64 hash payload.
 */
export function encodeMap(map: SystemMap): string {
  const json = JSON.stringify(map);
  return btoa(encodeURIComponent(json));
}

/**
 * Decode a URL hash payload back into a SystemMap.
 * Returns null if the payload is empty or invalid.
 * Missing fields are filled from defaultMap for resilience.
 */
export function decodeMap(encoded: string): SystemMap | null {
  if (!encoded || !encoded.trim()) return null;
  try {
    const json = decodeURIComponent(atob(encoded.trim()));
    const parsed = JSON.parse(json) as Partial<SystemMap>;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.metadata || !parsed.stocks || !parsed.assumptions?.registry) {
      return null;
    }
    return mergeWithDefault(parsed);
  } catch {
    return null;
  }
}

/**
 * Read the current location hash (without `#`) and decode a SystemMap.
 */
export function loadMapFromLocationHash(): SystemMap | null {
  if (typeof window === "undefined") return null;
  const raw = window.location.hash.replace(/^#/, "");
  return decodeMap(raw);
}

function mergeWithDefault(partial: Partial<SystemMap>): SystemMap {
  return {
    ...defaultMap,
    ...partial,
    metadata: { ...defaultMap.metadata, ...partial.metadata },
    context: {
      ...defaultMap.context,
      ...partial.context,
      temporal: {
        ...defaultMap.context.temporal,
        ...partial.context?.temporal,
      },
      spatial: partial.context?.spatial ?? defaultMap.context.spatial,
    },
    stocks: partial.stocks?.length ? partial.stocks : defaultMap.stocks,
    flows: partial.flows ?? defaultMap.flows,
    feedback_loops: partial.feedback_loops ?? defaultMap.feedback_loops,
    memes: partial.memes ?? defaultMap.memes,
    assumptions: {
      registry: {
        ...defaultMap.assumptions.registry,
        ...partial.assumptions?.registry,
      },
      scenario_branches:
        partial.assumptions?.scenario_branches ??
        defaultMap.assumptions.scenario_branches,
    },
    visual_style: {
      ...defaultMap.visual_style,
      ...partial.visual_style,
      extras: {
        ...defaultMap.visual_style?.extras,
        ...partial.visual_style?.extras,
      },
    },
  };
}
