import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import AssumptionControls from "./components/AssumptionControls";
import MemeList from "./components/MemeList";
import SimulationCanvas from "./components/SimulationCanvas";
import SystemStatus from "./components/SystemStatus";
import TimeSlider from "./components/TimeSlider";
import { defaultMap } from "./data/defaultMap";
import { runScenarioBranch } from "./services/api";
import type { SystemMap } from "./types/oci-types";

type Frame = Record<string, number>;

function applyOverridesToMap(
  map: SystemMap,
  overrides: Record<string, number>,
): SystemMap {
  const registry = { ...map.assumptions.registry };
  for (const [key, value] of Object.entries(overrides)) {
    const existing = registry[key];
    if (!existing) continue;
    registry[key] = { ...existing, value };
  }
  return {
    ...map,
    assumptions: {
      ...map.assumptions,
      registry,
    },
  };
}

function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (err.code === "ECONNABORTED") {
      return "Request timed out talking to the backend.";
    }
    if (!err.response) {
      return "Backend unreachable. Start it locally or check VITE_API_URL.";
    }
    const detail = err.response.data as { detail?: unknown };
    if (typeof detail?.detail === "string") return detail.detail;
    return `Backend error (${err.response.status})`;
  }
  if (err instanceof Error) return err.message;
  return "Unexpected simulation error.";
}

export default function App() {
  const [systemMap] = useState<SystemMap>(defaultMap);
  const [simulationData, setSimulationData] = useState<Frame[] | null>(null);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [assumptionOverrides, setAssumptionOverrides] = useState<
    Record<string, number>
  >({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const onOverrideChange = useCallback((key: string, value: number) => {
    setAssumptionOverrides((prev) => ({ ...prev, [key]: value }));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const currentFrame = useMemo(() => {
    if (!simulationData || simulationData.length === 0) {
      const initial: Frame = { time: systemMap.context.temporal?.start ?? 0 };
      for (const stock of systemMap.stocks) {
        initial[stock.id] = stock.initial_value;
      }
      return initial;
    }
    return simulationData[
      Math.max(0, Math.min(currentFrameIndex, simulationData.length - 1))
    ];
  }, [simulationData, currentFrameIndex, systemMap]);

  const yearLabel = useMemo(() => {
    const t = currentFrame.time;
    if (typeof t === "number") return Math.round(t);
    return currentFrameIndex;
  }, [currentFrame, currentFrameIndex]);

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    try {
      const mapForRun = applyOverridesToMap(systemMap, assumptionOverrides);
      const response = await runScenarioBranch(mapForRun, [
        { name: "active", overrides: assumptionOverrides },
      ]);
      const series =
        response.branches.active ?? Object.values(response.branches)[0];
      if (!series || series.length === 0) {
        throw new Error("Simulation returned no frames.");
      }
      setSimulationData(series);
      setCurrentFrameIndex(0);
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      setToast(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell">
      {toast ? (
        <div className="toast" role="alert">
          <p>{toast}</p>
          <button type="button" aria-label="Dismiss" onClick={() => setToast(null)}>
            ×
          </button>
        </div>
      ) : null}

      <aside className="sidebar">
        <header className="brand">
          <h1>OCI Converge</h1>
          <p>{systemMap.metadata.title}</p>
        </header>

        <AssumptionControls
          assumptions={systemMap.assumptions.registry}
          overrides={assumptionOverrides}
          onOverrideChange={onOverrideChange}
        />

        <MemeList memes={systemMap.memes ?? []} />

        <SystemStatus stocks={systemMap.stocks} stockValues={currentFrame} />

        {error ? <p className="status-banner error">{error}</p> : null}
        {loading ? <p className="status-banner info">Running simulation…</p> : null}

        <button
          className="run-btn"
          type="button"
          onClick={handleRun}
          disabled={loading}
        >
          {loading ? "Running…" : "Run Simulation"}
        </button>
      </aside>

      <main className="main-stage">
        <SimulationCanvas
          stocks={systemMap.stocks}
          flows={systemMap.flows}
          memes={systemMap.memes ?? []}
          simulationData={simulationData}
          currentFrameIndex={currentFrameIndex}
        />
        <TimeSlider
          max={Math.max(0, (simulationData?.length ?? 1) - 1)}
          value={currentFrameIndex}
          onChange={setCurrentFrameIndex}
          yearLabel={yearLabel}
        />
      </main>
    </div>
  );
}
