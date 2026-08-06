import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import AssumptionControls from "./components/AssumptionControls";
import CompareToggle from "./components/CompareToggle";
import FeedbackButton from "./components/FeedbackButton";
import LabelSetSelector, {
  type LabelSet,
} from "./components/LabelSetSelector";
import MemeList from "./components/MemeList";
import ModeIndicator, { type AppMode } from "./components/ModeIndicator";
import OnboardingTooltip from "./components/OnboardingTooltip";
import QuickStartButton from "./components/QuickStartButton";
import ScenarioSelector from "./components/ScenarioSelector";
import ShareChallengeButton from "./components/ShareChallengeButton";
import SimulationCanvas from "./components/SimulationCanvas";
import SystemStatus from "./components/SystemStatus";
import TimeSlider from "./components/TimeSlider";
import Toast, { type ToastTone } from "./components/Toast";
import {
  cloneScenarioMap,
  matchScenarioId,
  type ScenarioId,
} from "./data/scenarios";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { runScenarioBranch } from "./services/api";
import type { SystemMap } from "./types/oci-types";
import {
  computeBlackoutRisk,
  memesWithDominance,
  resolveGridDemand,
  resolveGridDemandRange,
} from "./utils/gridDemand";
import {
  encodeMap,
  loadMapFromLocationHash,
} from "./utils/urlEncoder";

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

function bootstrapState(): { map: SystemMap; scenario: ScenarioId } {
  const fromHash = loadMapFromLocationHash();
  if (fromHash) {
    return { map: fromHash, scenario: matchScenarioId(fromHash) };
  }
  return { map: cloneScenarioMap("energy"), scenario: "energy" };
}

function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (err.code === "ECONNABORTED") {
      return "Request timed out waking the backend. Please try again.";
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
  const boot = useMemo(() => bootstrapState(), []);
  const [systemMap, setSystemMap] = useState<SystemMap>(boot.map);
  const [selectedScenario, setSelectedScenario] = useState<ScenarioId>(
    boot.scenario,
  );
  const [compareMode, setCompareMode] = useState(false);
  const [simulationData, setSimulationData] = useState<Frame[] | null>(null);
  const [baselineData, setBaselineData] = useState<Frame[] | null>(null);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [assumptionOverrides, setAssumptionOverrides] = useState<
    Record<string, number>
  >({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<ToastTone>("error");
  const [linkCopied, setLinkCopied] = useState(false);
  const [appMode, setAppMode] = useState<AppMode>("simulate");
  const [labelSet, setLabelSet] = useLocalStorage<LabelSet>(
    "oci-label-set-v1",
    "full",
  );
  const [isNarrow, setIsNarrow] = useState(false);
  const hasAutoRun = useRef(false);
  const skipNextAutoScenarioRun = useRef(true);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const apply = () => setIsNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const shareableMap = useMemo(
    () => applyOverridesToMap(systemMap, assumptionOverrides),
    [systemMap, assumptionOverrides],
  );

  const onOverrideChange = useCallback((key: string, value: number) => {
    setAssumptionOverrides((prev) => ({ ...prev, [key]: value }));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const encoded = encodeMap(shareableMap);
      const nextHash = `#${encoded}`;
      if (window.location.hash === nextHash) return;
      const url = `${window.location.pathname}${window.location.search}${nextHash}`;
      window.history.replaceState(null, "", url);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [shareableMap]);

  useEffect(() => {
    if (!toast) return;
    const ms = toastTone === "success" || toastTone === "info" ? 3000 : 6000;
    const id = window.setTimeout(() => setToast(null), ms);
    return () => window.clearTimeout(id);
  }, [toast, toastTone]);

  useEffect(() => {
    if (!linkCopied) return;
    const id = window.setTimeout(() => setLinkCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [linkCopied]);

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

  const gridDemand = useMemo(
    () => resolveGridDemand(shareableMap),
    [shareableMap],
  );

  const gridDemandRange = useMemo(
    () => resolveGridDemandRange(systemMap),
    [systemMap],
  );

  const capacityBreakdown = useMemo(() => {
    const fossil = currentFrame.fossil_capacity;
    const renewable = currentFrame.renewable_capacity;
    if (typeof fossil !== "number" || typeof renewable !== "number") {
      return null;
    }
    return { fossil, renewable, total: fossil + renewable };
  }, [currentFrame]);

  const totalCapacity = capacityBreakdown?.total ?? null;

  const blackoutRisk = useMemo(
    () =>
      computeBlackoutRisk(
        currentFrame.fossil_capacity,
        currentFrame.renewable_capacity,
        gridDemand,
      ),
    [currentFrame, gridDemand],
  );

  const displayMemes = useMemo(
    () => memesWithDominance(systemMap.memes ?? [], blackoutRisk),
    [systemMap.memes, blackoutRisk],
  );

  const handleRun = useCallback(async () => {
    setLoading(true);
    setError(null);
    setToastTone("success");
    setToast(
      "Waking the simulation engine (first run can take up to a minute)…",
    );
    try {
      // Pass the base map so baseline branch uses registry defaults.
      const branches = compareMode
        ? [
            { name: "baseline", overrides: {} },
            { name: "custom", overrides: assumptionOverrides },
          ]
        : [{ name: "custom", overrides: assumptionOverrides }];

      const response = await runScenarioBranch(systemMap, branches);
      const custom =
        response.branches.custom ?? Object.values(response.branches)[0];
      if (!custom || custom.length === 0) {
        throw new Error("Simulation returned no frames.");
      }
      setSimulationData(custom);
      setBaselineData(
        compareMode ? (response.branches.baseline ?? null) : null,
      );
      setCurrentFrameIndex(0);
      setToast(null);
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      setToastTone("error");
      setToast(message);
    } finally {
      setLoading(false);
    }
  }, [systemMap, assumptionOverrides, compareMode]);

  // Auto-run once on first visit.
  useEffect(() => {
    if (hasAutoRun.current) return;
    hasAutoRun.current = true;
    void handleRun();
  }, [handleRun]);

  // Re-run when the user picks a new scenario template (not on every handleRun identity change).
  useEffect(() => {
    if (skipNextAutoScenarioRun.current) {
      skipNextAutoScenarioRun.current = false;
      return;
    }
    void handleRun();
    // Intentionally only selectedScenario — avoid re-running on slider drags.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedScenario]);

  const handleScenarioChange = (id: ScenarioId) => {
    setSelectedScenario(id);
    setSystemMap(cloneScenarioMap(id));
    setAssumptionOverrides({});
    setSimulationData(null);
    setBaselineData(null);
    setCompareMode(false);
    setCurrentFrameIndex(0);
    setError(null);
  };

  const handleQuickStart = () => {
    setAppMode("simulate");
    if (selectedScenario === "energy") {
      // Already on the example — re-run so the graph animates immediately.
      void handleRun();
      return;
    }
    // Scenario-change effect auto-runs the simulation.
    handleScenarioChange("energy");
  };

  const handleCompareChange = (checked: boolean) => {
    setCompareMode(checked);
    if (!checked) setBaselineData(null);
  };

  const buildShareUrl = useCallback(() => {
    const encoded = encodeMap(shareableMap);
    const nextHash = `#${encoded}`;
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}${nextHash}`;
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}${nextHash}`,
    );
    return url;
  }, [shareableMap]);

  const handleCopyLink = async () => {
    try {
      const url = buildShareUrl();
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setToastTone("success");
      setToast("Link copied!");
    } catch {
      setToastTone("error");
      setToast("Could not copy link — copy the URL from the address bar.");
    }
  };

  const timeUnit = systemMap.context.temporal?.unit ?? "years";
  const hasRunSimulation = Boolean(simulationData && simulationData.length > 0);

  return (
    <div className="app-shell">
      {toast ? (
        <Toast
          message={toast}
          tone={toastTone}
          onDismiss={() => setToast(null)}
        />
      ) : null}

      <aside className="sidebar">
        <header className="brand">
          <h1>OCI Converge</h1>
          <p className="mission">
            Stop arguing about who is right. Start seeing what is true.
          </p>
          <ScenarioSelector
            value={selectedScenario}
            onChange={handleScenarioChange}
            disabled={loading}
          />
          <p className="scenario-title">{systemMap.metadata.title}</p>
          {systemMap.context.narrative ? (
            <p className="narrative">{systemMap.context.narrative}</p>
          ) : null}
        </header>

        <AssumptionControls
          assumptions={systemMap.assumptions.registry}
          overrides={assumptionOverrides}
          onOverrideChange={onOverrideChange}
        />

        <MemeList memes={displayMemes} />

        <SystemStatus stocks={systemMap.stocks} stockValues={currentFrame} />

        {error ? <p className="status-banner error">{error}</p> : null}
        {loading ? (
          <p className="status-banner info">Running simulation…</p>
        ) : null}

        <div className="action-row">
          <QuickStartButton
            onClick={handleQuickStart}
            disabled={loading}
          />
          <CompareToggle
            checked={compareMode}
            onChange={handleCompareChange}
            disabled={loading}
          />
          <button
            className="run-btn"
            type="button"
            onClick={() => void handleRun()}
            disabled={loading}
          >
            {loading ? "Running…" : "Run Simulation"}
          </button>
          {hasRunSimulation ? (
            <ShareChallengeButton
              systemMap={shareableMap}
              getShareUrl={buildShareUrl}
              disabled={loading}
              onCopied={() => {
                setToastTone("success");
                setToast(
                  "Challenge copied to clipboard! Share it with your students.",
                );
              }}
              onError={(message) => {
                setToastTone("error");
                setToast(message);
              }}
            />
          ) : null}
          <button
            className="copy-link-btn"
            type="button"
            onClick={() => void handleCopyLink()}
            title="Copy shareable simulation link"
          >
            {linkCopied ? "Link copied!" : "Copy Link"}
          </button>
        </div>
      </aside>

      <main className="main-stage">
        <div className="stage-toolbar">
          <ModeIndicator mode={appMode} onChange={setAppMode} />
          {appMode === "simulate" && !isNarrow ? (
            <LabelSetSelector value={labelSet} onChange={setLabelSet} />
          ) : null}
        </div>

        <OnboardingTooltip />

        {appMode === "build" ? (
          <div className="build-mode-panel" role="status">
            <h2>🛠️ Build Mode</h2>
            <p>
              Construct Mode — drag-to-connect stocks, flows, and memes — is
              next. For now you are in a preview shell so the mode boundary is
              clear.
            </p>
            <button
              type="button"
              className="onboarding-got-it"
              onClick={() => setAppMode("simulate")}
            >
              Back to Simulation Mode
            </button>
          </div>
        ) : (
          <>
            <SimulationCanvas
              stocks={systemMap.stocks}
              flows={systemMap.flows}
              memes={displayMemes}
              customData={simulationData}
              baselineData={baselineData}
              currentFrameIndex={currentFrameIndex}
              loading={loading}
              compareMode={compareMode}
              labelSet={isNarrow ? "value" : labelSet}
              gridDemand={gridDemand}
              gridDemandRange={gridDemandRange}
              onGridDemandChange={(value) =>
                onOverrideChange("grid_demand", value)
              }
              totalCapacity={totalCapacity}
              capacityBreakdown={capacityBreakdown}
              blackoutRisk={blackoutRisk}
            />
            <TimeSlider
              max={Math.max(0, (simulationData?.length ?? 1) - 1)}
              value={currentFrameIndex}
              onChange={setCurrentFrameIndex}
              yearLabel={yearLabel}
            />
            <p className="time-unit-hint" aria-hidden="true">
              Time unit: {timeUnit}
            </p>
          </>
        )}
      </main>

      <FeedbackButton
        systemMap={shareableMap}
        assumptionOverrides={assumptionOverrides}
        onSent={(mode) => {
          setToastTone("success");
          if (mode === "clipboard") {
            setToast(
              `Copy this feedback and email us at rizim13@gmail.com.`,
            );
          } else if (mode === "pending_activation") {
            setToast(
              "Almost there — check rizim13@gmail.com for a FormSubmit activation email (one-time), then try again.",
            );
          } else if (mode === "mailto") {
            setToast(
              "Opened your mail app — hit Send there to finish.",
            );
          } else {
            setToast("Feedback emailed! Thank you.");
          }
        }}
        onError={(message) => {
          setToastTone("error");
          setToast(message);
        }}
      />
    </div>
  );
}
