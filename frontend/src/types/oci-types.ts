/**
 * OCI Converge TypeScript types aligned with the backend Pydantic wire format.
 *
 * Flow endpoints MUST use JSON keys `from` and `to` (not `from_stock` / `to_stock`).
 * The Python backend maps those aliases onto internal attributes `from_stock` / `to_stock`.
 */

export interface MapMetadata {
  id: string;
  title: string;
  version?: string;
  description?: string;
  author?: string | null;
  tags?: string[];
  created_at?: string | null;
  updated_at?: string | null;
}

export interface SpatialExtent {
  type?: string;
  label: string;
  coordinates?: number[] | null;
}

export interface TemporalHorizon {
  start?: number;
  end?: number;
  dt?: number;
  unit?: string;
}

export interface MapContext {
  domain: string;
  narrative?: string;
  stakeholders?: string[];
  spatial?: SpatialExtent | null;
  temporal?: TemporalHorizon;
  goals?: string[];
}

export interface Stock {
  id: string;
  name: string;
  description?: string;
  initial_value: number;
  min_value?: number;
  max_value?: number;
  unit?: string;
  category?: string | null;
}

/**
 * Flow edge in the system map.
 * Wire keys: `from` (source stock id) and `to` (target stock id).
 * Use `null` for environment / exogenous endpoints.
 */
export interface Flow {
  id: string;
  name: string;
  description?: string;
  /** Source stock id — JSON key must be `from` (backend alias for from_stock). */
  from: string | null;
  /** Destination stock id — JSON key must be `to` (backend alias for to_stock). */
  to: string | null;
  equation: string;
  unit?: string;
}

export interface FeedbackLoop {
  id: string;
  name: string;
  type: "reinforcing" | "balancing";
  description?: string;
  elements?: string[];
  polarity?: string | null;
}

export interface Meme {
  id: string;
  name: string;
  description?: string;
  emotional_charge: number;
  related_stocks?: string[];
  related_assumptions?: string[];
}

export interface AssumptionParam {
  value: number | string | boolean;
  confidence: number;
  range: [number, number];
  source: string;
  mutable?: boolean;
}

export interface ScenarioBranch {
  name: string;
  description?: string;
  overrides?: Record<string, number | string | boolean>;
}

export interface Assumptions {
  registry: Record<string, AssumptionParam>;
  scenario_branches?: ScenarioBranch[];
}

export interface VisualStyle {
  theme?: string;
  stock_color?: string;
  flow_color?: string;
  reinforcing_loop_color?: string;
  balancing_loop_color?: string;
  layout?: string;
  extras?: Record<string, unknown>;
}

export interface SystemMap {
  metadata: MapMetadata;
  context: MapContext;
  stocks: Stock[];
  flows: Flow[];
  feedback_loops?: FeedbackLoop[];
  memes?: Meme[];
  assumptions: Assumptions;
  visual_style?: VisualStyle;
}

export interface BranchSpec {
  name: string;
  overrides: Record<string, number>;
}

export interface SimulateResponse {
  status: "success";
  data: Array<Record<string, number>>;
  assumptions_used: Record<string, number>;
}

export interface ScenarioBranchResponse {
  status: "success";
  branches: Record<string, Array<Record<string, number>>>;
  base_assumptions: Record<string, number>;
}
