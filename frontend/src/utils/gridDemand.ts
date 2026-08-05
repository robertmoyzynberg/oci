import type { Meme, SystemMap } from "../types/oci-types";

/** Resolve grid demand (GW) from map extras or assumption registry. */
export function resolveGridDemand(map: SystemMap): number | null {
  const fromExtras = map.visual_style?.extras?.grid_demand;
  if (typeof fromExtras === "number" && Number.isFinite(fromExtras)) {
    return fromExtras;
  }
  const fromAssumption = map.assumptions.registry.grid_demand?.value;
  if (typeof fromAssumption === "number" && Number.isFinite(fromAssumption)) {
    return fromAssumption;
  }
  return null;
}

export function computeBlackoutRisk(
  fossil: number | undefined,
  renewable: number | undefined,
  demand: number | null,
): number {
  if (demand == null || fossil == null || renewable == null) return 0;
  const total = fossil + renewable;
  if (total >= demand) return 0;
  return Math.min(1, (demand - total) / demand);
}

/**
 * Boost Blackout Anxiety (and gently dim Green Future) when capacity < demand.
 */
export function memesWithDominance(
  memes: Meme[],
  blackoutRisk: number,
): Meme[] {
  if (blackoutRisk <= 0) return memes;
  return memes.map((meme) => {
    if (meme.id === "meme_grid_anxiety") {
      const base = Math.abs(meme.emotional_charge);
      const boosted = Math.min(1, base + 0.25 + blackoutRisk * 0.55);
      const sign = meme.emotional_charge < 0 ? -1 : 1;
      return { ...meme, emotional_charge: sign * boosted };
    }
    if (meme.id === "meme_green_future") {
      const base = Math.abs(meme.emotional_charge);
      const dimmed = Math.max(0.2, base * (1 - blackoutRisk * 0.45));
      const sign = meme.emotional_charge < 0 ? -1 : 1;
      return { ...meme, emotional_charge: sign * dimmed };
    }
    return meme;
  });
}
