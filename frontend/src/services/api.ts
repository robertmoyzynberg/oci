import axios from "axios";
import type {
  BranchSpec,
  ScenarioBranchResponse,
  SimulateResponse,
  SystemMap,
} from "../types/oci-types";

/**
 * API base URL.
 * - Local (npm run dev): defaults to `/api` via `.env.development` (Vite proxy → :8000).
 * - Production (Vercel): set `VITE_API_URL` to the Fly.io backend, e.g. https://oci-backend.fly.dev
 */
const baseURL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ||
  "/api";

const api = axios.create({
  baseURL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
});

/**
 * Run a baseline Euler simulation for the provided system map.
 */
export async function simulate(map: SystemMap): Promise<SimulateResponse> {
  const { data } = await api.post<SimulateResponse>("/simulate", map);
  return data;
}

/**
 * Compare one or more assumption-override branches.
 */
export async function runScenarioBranch(
  map: SystemMap,
  branches: BranchSpec[],
): Promise<ScenarioBranchResponse> {
  const { data } = await api.post<ScenarioBranchResponse>("/scenario-branch", {
    system_map: map,
    branches,
  });
  return data;
}

export default api;
