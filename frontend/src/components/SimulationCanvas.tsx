import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import * as d3 from "d3";
import type { LabelSet } from "./LabelSetSelector";
import type { Flow, FlowInfluence, Meme, Stock } from "../types/oci-types";

export interface CapacityBreakdown {
  fossil: number;
  renewable: number;
  total: number;
}

export interface SimulationCanvasProps {
  stocks: Stock[];
  flows: Flow[];
  memes: Meme[];
  /** Custom / active run frames (alias: customData). */
  simulationData?: Array<Record<string, number>> | null;
  customData?: Array<Record<string, number>> | null;
  /** Optional baseline series for compare overlay (dashed rings). */
  baselineData?: Array<Record<string, number>> | null;
  currentFrameIndex: number;
  loading?: boolean;
  compareMode?: boolean;
  /** How stock labels are annotated on the canvas. */
  labelSet?: LabelSet;
  /** Grid demand threshold (GW), when scenario supports it. */
  gridDemand?: number | null;
  /** Drag bounds for grid demand (GW). */
  gridDemandRange?: [number, number];
  /** Called when the user drags the demand marker. */
  onGridDemandChange?: (value: number) => void;
  /** Total generation capacity for demand gauge (GW). */
  totalCapacity?: number | null;
  /** Fossil + renewable breakdown for hover math. */
  capacityBreakdown?: CapacityBreakdown | null;
  /** 0–1 blackout risk when capacity < demand. */
  blackoutRisk?: number;
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  kind: "stock" | "env" | "meme";
  label: string;
  stock?: Stock;
  meme?: Meme;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  id: string;
  flow?: Flow;
}

function stockHealthColor(value: number, stock: Stock): string {
  const min = stock.min_value ?? 0;
  const max = stock.max_value ?? Math.max(value, 1);
  const t = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
  if (t < 0.33) return "#DC2626"; // collapse / stress
  if (t < 0.66) return "#2563EB"; // equilibrium
  return "#16A34A"; // growth
}

function memeReplicationRate(meme: Meme): number {
  // Backend schema has no replication_rate; derive a display proxy from charge magnitude.
  return Math.max(0.15, Math.min(1, Math.abs(meme.emotional_charge)));
}

function truncateLabel(text: string, max = 18): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1) : "—";
}

function formatOuterValue(
  value: number,
  unit: string | undefined,
  labelSet: LabelSet,
): string {
  if (labelSet !== "full") return "";
  const num = formatNumber(value);
  return unit ? `${num} ${unit}` : num;
}

function relatedFlowInfluences(meme: Meme): FlowInfluence[] {
  return (meme.related_flows ?? []).map((entry) => {
    if (typeof entry === "string") {
      const charge = Math.abs(meme.emotional_charge);
      const mag = Math.round(40 + charge * 110);
      const signed =
        meme.influence === "-" || meme.emotional_charge < 0 ? -mag : mag;
      return { flowId: entry, modifier: signed };
    }
    return entry;
  });
}

/** Flows touched by a meme via explicit related_flows, else stocks/assumptions. */
function flowsInfluencedByMeme(meme: Meme, allFlows: Flow[]): Set<string> {
  const explicit = relatedFlowInfluences(meme);
  if (explicit.length) {
    return new Set(explicit.map((e) => e.flowId));
  }
  const relatedStocks = new Set(meme.related_stocks ?? []);
  const assumptions = meme.related_assumptions ?? [];
  const ids = new Set<string>();
  for (const flow of allFlows) {
    if (flow.from && relatedStocks.has(flow.from)) ids.add(flow.id);
    if (flow.to && relatedStocks.has(flow.to)) ids.add(flow.id);
    for (const key of assumptions) {
      if (key && flow.equation.includes(key)) {
        ids.add(flow.id);
        break;
      }
    }
  }
  return ids;
}

/** Quantitative hover label: e.g. "-85% retirement rate". */
function flowModifierLabel(meme: Meme, flow: Flow): string {
  const entry = relatedFlowInfluences(meme).find((e) => e.flowId === flow.id);
  if (entry) {
    const sign = entry.modifier > 0 ? "+" : "";
    const label =
      entry.label ??
      (flow.name.length > 20 ? `${flow.name.slice(0, 18)}…` : flow.name);
    return `${sign}${entry.modifier}% ${label}`;
  }
  const charge = Math.abs(meme.emotional_charge);
  const pct = Math.round(40 + charge * 110);
  const sign =
    meme.influence === "-" || meme.emotional_charge < 0 ? "-" : "+";
  const name =
    flow.name.length > 20 ? `${flow.name.slice(0, 18)}…` : flow.name;
  return `${sign}${pct}% ${name}`;
}

/**
 * D3 force-directed system map. Builds SVG once, then updates geometry on frame changes.
 */
export default function SimulationCanvas({
  stocks,
  flows,
  memes,
  simulationData = null,
  customData = null,
  baselineData = null,
  currentFrameIndex,
  loading = false,
  compareMode = false,
  labelSet = "full",
  gridDemand = null,
  gridDemandRange = [70, 120],
  onGridDemandChange,
  totalCapacity = null,
  capacityBreakdown = null,
  blackoutRisk = 0,
}: SimulationCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const simRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null);
  const builtKeyRef = useRef<string>("");
  const gaugeTrackRef = useRef<HTMLDivElement | null>(null);
  /** When set, frame updates must not overwrite meme→flow hover styles. */
  const activeMemeHighlightRef = useRef<string | null>(null);
  const [highlightCapacity, setHighlightCapacity] = useState(false);
  const [draggingDemand, setDraggingDemand] = useState(false);

  const activeData = customData ?? simulationData;

  const frame = useMemo(() => {
    if (!activeData || activeData.length === 0) {
      const initial: Record<string, number> = { time: 0 };
      for (const s of stocks) initial[s.id] = s.initial_value;
      return initial;
    }
    const idx = Math.max(0, Math.min(currentFrameIndex, activeData.length - 1));
    return activeData[idx];
  }, [activeData, currentFrameIndex, stocks]);

  const nextFrame = useMemo(() => {
    if (!activeData || activeData.length < 2) return frame;
    const idx = Math.max(0, Math.min(currentFrameIndex, activeData.length - 1));
    return activeData[Math.min(idx + 1, activeData.length - 1)];
  }, [activeData, currentFrameIndex, frame]);

  const baselineFrame = useMemo(() => {
    if (!baselineData || baselineData.length === 0) return null;
    const idx = Math.max(0, Math.min(currentFrameIndex, baselineData.length - 1));
    return baselineData[idx];
  }, [baselineData, currentFrameIndex]);

  // Build / rebuild graph structure when topology changes.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const topologyKey = JSON.stringify({
      stocks: stocks.map((s) => s.id),
      flows: flows.map((f) => [f.id, f.from, f.to]),
      memes: memes.map((m) => [m.id, m.influence, m.related_flows, m.related_stocks]),
    });

    const width = el.clientWidth || 800;
    const height = el.clientHeight || 600;
    const isCompact = width < 640;
    const padX = isCompact ? 36 : 48;
    const padYTop = isCompact ? 72 : 48;
    const padYBottom = isCompact ? 64 : 48;
    const memeLabelLen = isCompact ? 10 : 16;

    if (builtKeyRef.current === topologyKey && svgRef.current) {
      return;
    }
    builtKeyRef.current = topologyKey;

    d3.select(el).selectAll("*").remove();

    const svg = d3
      .select(el)
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");
    svgRef.current = svg.node();

    const defs = svg.append("defs");
    defs
      .append("marker")
      .attr("id", "flow-arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 18)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#2563EB");

    defs
      .append("marker")
      .attr("id", "meme-arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 10)
      .attr("refY", 0)
      .attr("markerWidth", 5)
      .attr("markerHeight", 5)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#F59E0B");

    const glow = defs
      .append("filter")
      .attr("id", "glow")
      .attr("x", "-50%")
      .attr("y", "-50%")
      .attr("width", "200%")
      .attr("height", "200%");
    glow
      .append("feGaussianBlur")
      .attr("stdDeviation", "4")
      .attr("result", "coloredBlur");
    const glowMerge = glow.append("feMerge");
    glowMerge.append("feMergeNode").attr("in", "coloredBlur");
    glowMerge.append("feMergeNode").attr("in", "SourceGraphic");

    const gRoot = svg.append("g").attr("class", "scene");

    const needsEnv = flows.some((f) => !f.from || !f.to);
    const nodes: SimNode[] = stocks.map((s, i) => ({
      id: s.id,
      kind: "stock",
      label: s.name,
      stock: s,
      x: width * (0.3 + (i % 2) * 0.35),
      y: height * (0.35 + Math.floor(i / 2) * 0.25),
    }));

    if (needsEnv) {
      nodes.push({
        id: "__environment__",
        kind: "env",
        label: "Environment",
        x: width * 0.5,
        y: height * 0.12,
      });
    }

    for (const meme of memes) {
      const anchorId = meme.related_stocks?.[0];
      const anchor = nodes.find((n) => n.id === anchorId);
      nodes.push({
        id: `meme:${meme.id}`,
        kind: "meme",
        label: meme.name,
        meme,
        // Bias toward a visible quadrant near the related stock (not off-canvas).
        x: Math.min(
          width - padX,
          Math.max(padX, (anchor?.x ?? width * 0.65) + (isCompact ? 40 : 70)),
        ),
        y: Math.max(
          padYTop,
          Math.min(
            height - padYBottom,
            (anchor?.y ?? height * 0.45) - (isCompact ? 40 : 80),
          ),
        ),
      });
    }

    const links: SimLink[] = [];
    for (const flow of flows) {
      const source = flow.from ?? "__environment__";
      const target = flow.to ?? "__environment__";
      if (!nodes.some((n) => n.id === source) || !nodes.some((n) => n.id === target)) {
        continue;
      }
      links.push({ id: flow.id, source, target, flow });
    }

    for (const meme of memes) {
      for (const stockId of meme.related_stocks ?? []) {
        if (!nodes.some((n) => n.id === stockId)) continue;
        links.push({
          id: `meme-link:${meme.id}:${stockId}`,
          source: `meme:${meme.id}`,
          target: stockId,
        });
      }
      for (const { flowId } of relatedFlowInfluences(meme)) {
        const flow = flows.find((f) => f.id === flowId);
        if (!flow) continue;
        const endpoint = flow.to ?? flow.from;
        if (!endpoint || !nodes.some((n) => n.id === endpoint)) continue;
        // Skip duplicate if already linked via related_stocks.
        const dupId = `meme-link:${meme.id}:${endpoint}`;
        if (links.some((l) => l.id === dupId)) continue;
        links.push({
          id: `meme-flow:${meme.id}:${flowId}`,
          source: `meme:${meme.id}`,
          target: endpoint,
        });
      }
    }

    const linkSel = gRoot
      .append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", (d) => (d.flow ? "#2563EB" : "rgba(245, 158, 11, 0.45)"))
      .attr("stroke-opacity", (d) => (d.flow ? 0.85 : 0.55))
      .attr("stroke-dasharray", (d) => (d.flow ? null : "5 4"))
      .attr("marker-end", (d) => (d.flow ? "url(#flow-arrow)" : null));

    const influenceMarks = gRoot
      .append("g")
      .attr("class", "influence-marks")
      .attr("pointer-events", "none");

    const glowPaths = gRoot
      .insert("g", ".links")
      .attr("class", "meme-glow-paths")
      .attr("pointer-events", "none");

    const nodeSel = gRoot
      .append("g")
      .attr("class", "nodes")
      .selectAll<SVGGElement, SimNode>("g")
      .data(nodes)
      .join("g")
      .attr("class", (d) => `node node-${d.kind}`);

    let activeMeme: Meme | null = null;

    const linkMidpoint = (d: SimLink, offset = 14) => {
      const s = d.source as SimNode;
      const t = d.target as SimNode;
      const mx = ((s.x ?? 0) + (t.x ?? 0)) / 2;
      const my = ((s.y ?? 0) + (t.y ?? 0)) / 2;
      const dx = (t.x ?? 0) - (s.x ?? 0);
      const dy = (t.y ?? 0) - (s.y ?? 0);
      const len = Math.hypot(dx, dy) || 1;
      const ox = (-dy / len) * offset;
      const oy = (dx / len) * offset;
      return `translate(${mx + ox},${my + oy})`;
    };

    const flowMidCoords = (d: SimLink) => {
      const s = d.source as SimNode;
      const t = d.target as SimNode;
      return {
        x: ((s.x ?? 0) + (t.x ?? 0)) / 2,
        y: ((s.y ?? 0) + (t.y ?? 0)) / 2,
      };
    };

    /** Curved glow from meme center → affected flow midpoint. */
    const syncGlowPaths = () => {
      if (!activeMeme) {
        glowPaths
          .selectAll("path.meme-flow-glow")
          .transition()
          .duration(200)
          .attr("opacity", 0)
          .remove();
        return;
      }
      const meme = activeMeme;
      const memeNode = nodes.find((n) => n.id === `meme:${meme.id}`);
      if (!memeNode) return;
      const flowIds = flowsInfluencedByMeme(meme, flows);
      const flowLinks = links.filter(
        (l) => l.flow && flowIds.has(l.flow.id),
      );

      const paths = glowPaths
        .selectAll<SVGPathElement, SimLink>("path.meme-flow-glow")
        .data(flowLinks, (d) => d.id)
        .join(
          (enter) =>
            enter
              .append("path")
              .attr("class", "meme-flow-glow")
              .attr("fill", "none")
              .attr("stroke", "#F59E0B")
              .attr("stroke-width", 2.75)
              .attr("stroke-linecap", "round")
              .attr("stroke-dasharray", "10 7")
              .attr("opacity", 0)
              .call((sel) =>
                sel.transition().duration(220).attr("opacity", 0.95),
              ),
          (update) => update,
          (exit) =>
            exit.transition().duration(200).attr("opacity", 0).remove(),
        );

      paths.attr("d", (d) => {
        const x1 = memeNode.x ?? 0;
        const y1 = memeNode.y ?? 0;
        const mid = flowMidCoords(d);
        const x2 = mid.x;
        const y2 = mid.y;
        const cx = (x1 + x2) / 2 + (y2 - y1) * 0.28;
        const cy = (y1 + y2) / 2 - (x2 - x1) * 0.28;
        return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
      });
    };

    const syncInfluenceMarks = () => {
      if (!activeMeme) {
        influenceMarks.selectAll("*").remove();
        syncGlowPaths();
        return;
      }
      const meme = activeMeme;
      const flowIds = flowsInfluencedByMeme(meme, flows);

      const memeLinks = links.filter(
        (l) =>
          !l.flow &&
          (String(l.id).startsWith(`meme-link:${meme.id}:`) ||
            String(l.id).startsWith(`meme-flow:${meme.id}:`)),
      );

      const signMarks = influenceMarks
        .selectAll<SVGGElement, SimLink>("g.influence-sign")
        .data(meme.influence ? memeLinks : [], (d) => d.id)
        .join((enter) => {
          const g = enter.append("g").attr("class", "influence-sign");
          g.append("circle")
            .attr("r", 9)
            .attr("fill", "#121820")
            .attr("stroke", "#F59E0B")
            .attr("stroke-width", 1.5);
          g.append("text")
            .attr("text-anchor", "middle")
            .attr("dy", "0.35em")
            .attr("fill", "#F59E0B")
            .attr("font-size", 12)
            .attr("font-weight", 700)
            .text(meme.influence ?? "");
          return g;
        });
      signMarks.attr("transform", (d) => linkMidpoint(d, 12));

      // Percentage modifiers on the specific flow arrows this meme affects.
      const flowLinks = links.filter(
        (l) => l.flow && flowIds.has(l.flow.id),
      );
      const pctMarks = influenceMarks
        .selectAll<SVGGElement, SimLink>("g.flow-modifier")
        .data(flowLinks, (d) => d.id)
        .join((enter) => {
          const g = enter
            .append("g")
            .attr("class", "flow-modifier")
            .style("opacity", 0);
          g.append("rect")
            .attr("rx", 6)
            .attr("ry", 6)
            .attr("fill", "#121820")
            .attr("stroke", "#F59E0B")
            .attr("stroke-width", 1.25);
          g.append("text")
            .attr("class", "flow-modifier-text")
            .attr("text-anchor", "middle")
            .attr("dy", "0.35em")
            .attr("fill", "#F59E0B")
            .attr("font-size", 10)
            .attr("font-weight", 700);
          g.transition().duration(200).style("opacity", 1);
          return g;
        },
        (update) => update,
        (exit) => {
          exit.transition().duration(280).style("opacity", 0).remove();
        },
        );

      pctMarks.each(function (d) {
        if (!d.flow) return;
        const label = flowModifierLabel(meme, d.flow);
        const text = d3
          .select(this)
          .select("text.flow-modifier-text")
          .attr("fill", "#E8EEF4")
          .text(label);
        const node = text.node() as SVGTextElement | null;
        const width = Math.max(72, (node?.getComputedTextLength() ?? 80) + 16);
        d3.select(this)
          .select("rect")
          .attr("x", -width / 2)
          .attr("y", -11)
          .attr("width", width)
          .attr("height", 22)
          .attr("fill", "rgba(18, 24, 32, 0.92)")
          .attr("fill-opacity", 0.95);
      });
      pctMarks.attr("transform", (d) => linkMidpoint(d, -18));
      syncGlowPaths();
    };

    const clearMemeHighlight = () => {
      activeMeme = null;
      activeMemeHighlightRef.current = null;
      syncGlowPaths();
      nodeSel
        .classed("is-dimmed", false)
        .classed("is-highlighted", false)
        .classed("meme-highlight", false)
        .style("opacity", null);
      nodeSel.select("circle.body").attr("filter", null);
      linkSel
        .classed("is-dimmed", false)
        .classed("is-highlighted", false)
        .classed("flow-influence", false)
        .classed("dash-animate", false)
        .style("opacity", null)
        .attr("stroke", (d) => (d.flow ? "#2563EB" : "rgba(245, 158, 11, 0.45)"))
        .attr("stroke-width", (d) => (d.flow ? null : 1.4))
        .attr("stroke-dasharray", (d) => (d.flow ? null : "5 4"))
        .attr("marker-end", (d) => (d.flow ? "url(#flow-arrow)" : null));
      influenceMarks.selectAll("*").remove();
    };

    const highlightMeme = (meme: Meme) => {
      activeMeme = meme;
      activeMemeHighlightRef.current = meme.id;
      const stockIds = new Set(meme.related_stocks ?? []);
      const flowIds = flowsInfluencedByMeme(meme, flows);
      const memeNodeId = `meme:${meme.id}`;

      const isRelatedMemeLink = (d: SimLink) =>
        !d.flow &&
        (String(d.id).startsWith(`meme-link:${meme.id}:`) ||
          String(d.id).startsWith(`meme-flow:${meme.id}:`));

      const isRelatedFlow = (d: SimLink) =>
        Boolean(d.flow && flowIds.has(d.flow.id));

      nodeSel
        .classed("is-highlighted", (d) => {
          if (d.id === memeNodeId) return true;
          return d.kind === "stock" && stockIds.has(d.id);
        })
        .classed("is-dimmed", (d) => {
          if (d.id === memeNodeId) return false;
          if (d.kind === "stock" && stockIds.has(d.id)) return false;
          return true;
        })
        .classed("meme-highlight", (d) => d.id === memeNodeId)
        .style("opacity", (d) => {
          if (d.id === memeNodeId) return "1";
          if (d.kind === "stock" && stockIds.has(d.id)) return "1";
          return "0.2";
        });

      nodeSel.select("circle.body").attr("filter", null);
      nodeSel
        .filter(
          (d) =>
            d.id === memeNodeId || (d.kind === "stock" && stockIds.has(d.id)),
        )
        .select("circle.body")
        .attr("filter", "url(#glow)");

      linkSel
        .classed("is-highlighted", (d) => isRelatedFlow(d) || isRelatedMemeLink(d))
        .classed("flow-influence", (d) => isRelatedFlow(d))
        .classed("is-dimmed", (d) => {
          if (isRelatedFlow(d) || isRelatedMemeLink(d)) return false;
          return true;
        })
        .classed(
          "dash-animate",
          (d) => isRelatedMemeLink(d) || isRelatedFlow(d),
        )
        .style("opacity", (d) => {
          if (isRelatedFlow(d) || isRelatedMemeLink(d)) return "1";
          return "0.2";
        })
        .attr("stroke", (d) => {
          if (isRelatedFlow(d) || isRelatedMemeLink(d)) return "#F59E0B";
          return d.flow ? "#2563EB" : "rgba(245, 158, 11, 0.45)";
        })
        .attr("stroke-width", (d) => {
          if (isRelatedFlow(d)) return 6;
          if (isRelatedMemeLink(d)) return 2.5;
          return d.flow ? 1.5 : 1.4;
        })
        .attr("stroke-dasharray", (d) => {
          if (isRelatedFlow(d)) return "7 4";
          if (!d.flow) return "5 4";
          return null;
        })
        .attr("marker-end", (d) => {
          if (isRelatedFlow(d) || isRelatedMemeLink(d)) return "url(#meme-arrow)";
          return d.flow ? "url(#flow-arrow)" : null;
        });

      syncInfluenceMarks();
    };

    nodeSel.call(
      d3
        .drag<SVGGElement, SimNode>()
        .on("start", (event, d) => {
          if (!event.active) simRef.current?.alphaTarget(0.25).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) simRef.current?.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }),
    );

    nodeSel
      .filter((d) => d.kind === "meme")
      .attr("tabindex", 0)
      .attr("role", "button")
      .attr(
        "aria-label",
        (d) =>
          `Meme: ${d.label}${d.meme?.influence ? `, influence ${d.meme.influence}` : ""}. Focus or hover to highlight related stocks and flows.`,
      )
      .style("cursor", "pointer")
      .on("mouseenter", (_event, d) => {
        if (d.meme) highlightMeme(d.meme);
      })
      .on("mouseleave", clearMemeHighlight)
      .on("focus", (_event, d) => {
        if (d.meme) highlightMeme(d.meme);
      })
      .on("blur", clearMemeHighlight)
      .on("keydown", (event, d) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (d.meme) highlightMeme(d.meme);
        }
        if (event.key === "Escape") clearMemeHighlight();
      });

    nodeSel
      .filter((d) => d.kind === "stock")
      .append("circle")
      .attr("class", "baseline-ring")
      .attr("r", 18)
      .attr("fill", "none")
      .attr("stroke", "#94A3B8")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "5 4")
      .attr("opacity", 0);

    nodeSel
      .append("circle")
      .attr("class", "body")
      .attr("r", 18)
      .attr("fill", "#121820")
      .attr("stroke", "#1E2A36")
      .attr("stroke-width", 2);

    // Stock: name above, value inside, unit/context below (driven by labelSet).
    const stockNodes = nodeSel.filter((d) => d.kind === "stock");
    stockNodes
      .append("text")
      .attr("class", "stock-name")
      .attr("text-anchor", "middle")
      .attr("y", -28)
      .attr("fill", "#E0E6ED")
      .attr("font-size", 12)
      .attr("font-weight", 600)
      .attr("pointer-events", "none")
      .text((d) => truncateLabel(d.label));

    stockNodes
      .append("text")
      .attr("class", "stock-inner")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("fill", "#E8EEF4")
      .attr("font-size", 11)
      .attr("font-weight", 600)
      .attr("pointer-events", "none")
      .text((d) => formatNumber(d.stock?.initial_value ?? 0));

    stockNodes
      .append("text")
      .attr("class", "stock-value")
      .attr("text-anchor", "middle")
      .attr("y", 34)
      .attr("fill", "#6B7D8F")
      .attr("font-size", 10)
      .attr("pointer-events", "none")
      .text((d) =>
        formatOuterValue(d.stock?.initial_value ?? 0, d.stock?.unit, "full"),
      );

    // Meme / env: compact glyph inside the circle.
    nodeSel
      .filter((d) => d.kind !== "stock")
      .append("text")
      .attr("class", "label")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("fill", "#E8EEF4")
      .attr("font-size", 10)
      .attr("pointer-events", "none")
      .text((d) => (d.kind === "meme" ? "◆" : "⌀"));

    // Always-visible meme name so newcomers see the gold-dot example.
    nodeSel
      .filter((d) => d.kind === "meme")
      .append("text")
      .attr("class", "meme-name")
      .attr("text-anchor", "middle")
      .attr("y", 28)
      .attr("fill", "#F59E0B")
      .attr("font-size", 10)
      .attr("font-weight", 600)
      .attr("pointer-events", "none")
      .text((d) => truncateLabel(d.label, memeLabelLen));

    nodeSel.append("title").text((d) => d.label);

    const simulation = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance((d) => (d.flow ? (isCompact ? 110 : 160) : isCompact ? 72 : 100))
          .strength(0.45),
      )
      .force("charge", d3.forceManyBody().strength(isCompact ? -280 : -480))
      .force("center", d3.forceCenter(width / 2, height / 2 + (isCompact ? 8 : 0)))
      .force("collide", d3.forceCollide<SimNode>().radius(isCompact ? 40 : 52))
      .on("tick", () => {
        for (const n of nodes) {
          n.x = Math.max(padX, Math.min(width - padX, n.x ?? width / 2));
          n.y = Math.max(padYTop, Math.min(height - padYBottom, n.y ?? height / 2));
        }
        linkSel
          .attr("x1", (d) => (d.source as SimNode).x ?? 0)
          .attr("y1", (d) => (d.source as SimNode).y ?? 0)
          .attr("x2", (d) => (d.target as SimNode).x ?? 0)
          .attr("y2", (d) => (d.target as SimNode).y ?? 0);

        nodeSel.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
        syncInfluenceMarks();
      });

    simRef.current = simulation;

    const onResize = () => {
      const w = el.clientWidth || 800;
      const h = el.clientHeight || 600;
      svg.attr("viewBox", `0 0 ${w} ${h}`);
      simulation.force("center", d3.forceCenter(w / 2, h / 2));
      simulation.alpha(0.2).restart();
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      simulation.stop();
      simRef.current = null;
      svgRef.current = null;
      builtKeyRef.current = "";
      d3.select(el).selectAll("*").remove();
    };
  }, [stocks, flows, memes]);

  // Efficient visual update when the time scrubber moves.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const root = d3.select(svg);
    const stockById = new Map(stocks.map((s) => [s.id, s]));

    root.selectAll<SVGGElement, SimNode>("g.node-stock").each(function (d) {
      const stock = stockById.get(d.id);
      if (!stock) return;
      const value = Number(frame[d.id] ?? stock.initial_value);
      const min = stock.min_value ?? 0;
      const max = stock.max_value ?? Math.max(value, 1);
      const t = Math.max(0.05, Math.min(1, (value - min) / (max - min || 1)));
      const radius = 16 + t * 28;
      const fill = stockHealthColor(value, stock);
      const isCollapse = fill === "#DC2626";
      const showBaseline =
        compareMode && baselineFrame != null && baselineFrame[d.id] != null;
      if (showBaseline) {
        const bVal = Number(baselineFrame[d.id]);
        const bt = Math.max(0.05, Math.min(1, (bVal - min) / (max - min || 1)));
        const bRadius = 16 + bt * 28;
        d3.select(this)
          .select("circle.baseline-ring")
          .attr("r", bRadius + 4)
          .attr("opacity", 0.5)
          .attr("stroke", "#64748B");
      } else {
        d3.select(this).select("circle.baseline-ring").attr("opacity", 0);
      }
      d3.select(this)
        .select("circle.body")
        .attr("r", radius)
        .attr("fill", fill)
        .attr("fill-opacity", 0.88)
        .attr("stroke", "#E8EEF4")
        .attr("stroke-opacity", 0.35)
        .attr("stroke-dasharray", isCollapse ? "4 3" : null);
      const showName = labelSet !== "value";
      const outer = formatOuterValue(value, stock.unit, labelSet);
      d3.select(this)
        .select("text.stock-name")
        .attr("y", -radius - 8)
        .attr("opacity", showName ? 1 : 0)
        .text(showName ? truncateLabel(stock.name) : "");
      d3.select(this)
        .select("text.stock-inner")
        .attr("font-size", radius > 28 ? 12 : 10)
        .text(formatNumber(value));
      d3.select(this)
        .select("text.stock-value")
        .attr("y", radius + 14)
        .attr("opacity", outer ? 1 : 0)
        .text(outer);
    });

    root.selectAll<SVGGElement, SimNode>("g.node-env").each(function () {
      d3.select(this)
        .select("circle.body")
        .attr("r", 14)
        .attr("fill", "#1E2A36")
        .attr("stroke", "#2563EB");
    });

    const memeById = new Map(memes.map((m) => [m.id, m]));
    const compactLabels = (containerRef.current?.clientWidth ?? 800) < 640;
    const memeMaxChars = compactLabels ? 10 : 16;
    root.selectAll<SVGGElement, SimNode>("g.node-meme").each(function (d) {
      const meme = (d.meme ? memeById.get(d.meme.id) : undefined) ?? d.meme;
      if (!meme) return;
      d.meme = meme;
      const charge = Math.abs(meme.emotional_charge);
      const replication = memeReplicationRate(meme);
      // Dominance scaling: size + opacity + glow track emotional charge.
      const radius = 10 + 20 * charge;
      const intensity =
        charge >= 0.75 ? "high" : charge >= 0.45 ? "mid" : "low";
      // Faster pulse = stronger narrative (1.8s → 0.9s).
      const pulseDuration = `${(2.1 - charge * 1.1).toFixed(2)}s`;
      const node = d3.select(this);
      const highlighted =
        node.classed("meme-highlight") || node.classed("is-highlighted");
      node
        .classed("meme-dominant", true)
        .classed("meme-dominant-low", intensity === "low")
        .classed("meme-dominant-mid", intensity === "mid")
        .classed("meme-dominant-high", intensity === "high")
        .style("--meme-pulse-duration", pulseDuration);
      node
        .select("circle.body")
        .attr("r", radius)
        .attr("fill", "#F59E0B")
        .attr("fill-opacity", 0.3 + replication * 0.65)
        .attr("stroke", "#F59E0B")
        .attr("stroke-width", 1.5 + charge * 2)
        .attr("stroke-opacity", 1);
      if (highlighted) {
        node.select("circle.body").style("filter", null);
      }
      node
        .select("text.meme-name")
        .attr("y", radius + 12)
        .attr("fill-opacity", 0.65 + replication * 0.35)
        .text(truncateLabel(d.label, memeMaxChars));
    });

    root.selectAll<SVGLineElement, SimLink>("g.links line").each(function (d) {
      // Preserve meme→flow hover styling while a meme is focused.
      if (activeMemeHighlightRef.current) return;
      if (!d.flow) {
        d3.select(this).attr("stroke-width", 1.4);
        return;
      }
      const fromId = d.flow.from;
      const toId = d.flow.to;
      let activity = 1.5;
      if (fromId && frame[fromId] != null && nextFrame[fromId] != null) {
        activity = Math.max(activity, Math.abs(Number(nextFrame[fromId]) - Number(frame[fromId])) * 2);
      }
      if (toId && frame[toId] != null && nextFrame[toId] != null) {
        activity = Math.max(activity, Math.abs(Number(nextFrame[toId]) - Number(frame[toId])) * 2);
      }
      d3.select(this)
        .attr("stroke-width", Math.min(8, 1.2 + activity))
        .attr("stroke-opacity", 0.55 + Math.min(0.4, activity / 10));
    });
  }, [frame, nextFrame, stocks, baselineFrame, compareMode, labelSet, memes]);

  // Soft glow on Fossil + Renewable when hovering Total Capacity.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const CAPACITY_IDS = new Set(["fossil_capacity", "renewable_capacity"]);
    d3.select(svg)
      .selectAll<SVGGElement, SimNode>("g.node-stock")
      .classed(
        "capacity-glow",
        (d) => highlightCapacity && CAPACITY_IDS.has(d.id),
      );
  }, [highlightCapacity, stocks, frame]);

  const demandFromPointer = useCallback(
    (clientX: number) => {
      const track = gaugeTrackRef.current;
      if (!track || gridDemand == null) return null;
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return null;
      const [min, max] = gridDemandRange;
      const gaugeMax = Math.max(max, gridDemand, totalCapacity ?? 0, 1);
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const raw = pct * gaugeMax;
      const snapped = Math.round(raw); // 1 GW snap
      return Math.max(min, Math.min(max, snapped));
    },
    [gridDemand, gridDemandRange, totalCapacity],
  );

  const onDemandPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!onGridDemandChange || gridDemand == null) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingDemand(true);
    const next = demandFromPointer(event.clientX);
    if (next != null) onGridDemandChange(next);
  };

  const onDemandPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingDemand || !onGridDemandChange) return;
    const next = demandFromPointer(event.clientX);
    if (next != null) onGridDemandChange(next);
  };

  const onDemandPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingDemand) return;
    setDraggingDemand(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

  const hasData = Boolean(activeData && activeData.length > 0);
  const inBlackout = blackoutRisk > 0;
  /** Any stock in the Low / stress band → subtle canvas red tint. */
  const inStress = useMemo(() => {
    return stocks.some((stock) => {
      const value = Number(frame[stock.id] ?? stock.initial_value);
      const min = stock.min_value ?? 0;
      const max = stock.max_value ?? Math.max(value, 1);
      const t = (value - min) / (max - min || 1);
      return t < 0.33;
    });
  }, [stocks, frame]);
  const showDemandGauge = gridDemand != null && totalCapacity != null;
  const [demandMin, demandMax] = gridDemandRange;
  const gaugeMax = showDemandGauge
    ? Math.max(demandMax, gridDemand, totalCapacity * 1.05, 1)
    : 1;
  const capacityPct = showDemandGauge
    ? Math.min(100, (totalCapacity / gaugeMax) * 100)
    : 0;
  const demandPct = showDemandGauge
    ? Math.min(100, (gridDemand / gaugeMax) * 100)
    : 0;

  const capacityTooltip =
    capacityBreakdown != null
      ? `Total Capacity: Fossil (${capacityBreakdown.fossil.toFixed(1)} GW) + Renewable (${capacityBreakdown.renewable.toFixed(1)} GW) = ${capacityBreakdown.total.toFixed(1)} GW`
      : null;

  const labelHint =
    labelSet === "full"
      ? "Name above · value inside · unit below"
      : labelSet === "name"
        ? "Name above · value inside"
        : "Value inside circle";

  return (
    <div
      className={`canvas-wrap${inBlackout ? " blackout-active" : ""}${inStress ? " stress-active" : ""}`}
    >
      <div className="simulation-canvas" ref={containerRef} />

      {inBlackout ? (
        <div className="blackout-banner" role="alert">
          ⚠️ Blackout Risk: Capacity below Demand
          <span className="blackout-meter">
            {Math.round(blackoutRisk * 100)}% shortfall pressure
          </span>
        </div>
      ) : null}

      {showDemandGauge ? (
        <div
          className={`demand-gauge${draggingDemand ? " dragging" : ""}`}
          aria-label={`Total capacity ${totalCapacity.toFixed(1)} GW versus grid demand ${gridDemand.toFixed(0)} GW. Drag the demand marker to adjust.`}
        >
          <div
            className={`demand-gauge-head${highlightCapacity ? " lit" : ""}`}
            onMouseEnter={() => setHighlightCapacity(true)}
            onMouseLeave={() => setHighlightCapacity(false)}
            onFocus={() => setHighlightCapacity(true)}
            onBlur={() => setHighlightCapacity(false)}
            tabIndex={0}
            role="button"
            aria-label={capacityTooltip ?? "Total capacity breakdown"}
            title={capacityTooltip ?? undefined}
          >
            <span>Total capacity</span>
            <strong>
              {totalCapacity.toFixed(1)} / {gridDemand.toFixed(0)} GW
            </strong>
            {highlightCapacity && capacityTooltip ? (
              <div className="capacity-tooltip" role="tooltip">
                {capacityTooltip}
              </div>
            ) : null}
          </div>
          <div
            className="demand-gauge-track"
            ref={gaugeTrackRef}
            onPointerDown={onDemandPointerDown}
            onPointerMove={onDemandPointerMove}
            onPointerUp={onDemandPointerUp}
            onPointerCancel={onDemandPointerUp}
          >
            <div
              className={`demand-gauge-fill${inBlackout ? " deficit" : ""}${highlightCapacity ? " lit" : ""}`}
              style={{ width: `${capacityPct}%` }}
              onMouseEnter={() => setHighlightCapacity(true)}
              onMouseLeave={() => setHighlightCapacity(false)}
            />
            <div
              className="demand-gauge-line"
              style={{ left: `${demandPct}%` }}
              title={`Grid Demand: ${gridDemand.toFixed(0)} GW (drag to adjust)`}
              role="slider"
              aria-valuemin={demandMin}
              aria-valuemax={demandMax}
              aria-valuenow={gridDemand}
              aria-label="Grid demand"
            >
              <span className="demand-gauge-handle" aria-hidden="true" />
              <span className="demand-gauge-value">
                Grid Demand: {gridDemand.toFixed(0)} GW
              </span>
            </div>
          </div>
          <div className="demand-gauge-readout" aria-hidden="true">
            Demand {gridDemand.toFixed(0)} GW · drag marker
          </div>
          <div className="demand-gauge-label">
            Drag the dashed marker to simulate demand shocks ({demandMin}–
            {demandMax} GW)
          </div>
        </div>
      ) : null}

      <aside className="graph-legend" aria-label="Color legend">
        <div className="legend-heading">Stock health</div>
        <div>
          <span className="status-dot growth" aria-hidden="true">
            ●
          </span>{" "}
          High / growth
        </div>
        <div>
          <span className="status-dot eq" aria-hidden="true">
            ●
          </span>{" "}
          Mid / equilibrium
        </div>
        <div>
          <span className="status-dot collapse" aria-hidden="true">
            ●
          </span>{" "}
          Low / stress
        </div>
        {showDemandGauge ? (
          <div>
            <span className="swatch demand-line" aria-hidden="true" /> Grid
            Demand (dashed)
          </div>
        ) : null}
        <div>
          <span className="swatch custom" aria-hidden="true" /> Custom (solid)
        </div>
        {compareMode ? (
          <div>
            <span className="swatch baseline" aria-hidden="true" /> Baseline
            (dashed)
          </div>
        ) : null}
      </aside>

      <aside className="element-legend" aria-label="Element legend">
        <div>
          <span className="swatch stock-shape" aria-hidden="true" /> Stock
          (circle)
        </div>
        <div className="legend-label-example">{labelHint}</div>
        <div>
          <span className="swatch flow-arrow" aria-hidden="true">
            ➜
          </span>{" "}
          Flow (arrow)
        </div>
        <div>
          <span className="swatch meme" aria-hidden="true" /> Meme (pulses with
          dominance)
        </div>
        <div>
          <span className="swatch flow-influence" aria-hidden="true" /> Flow
          arrow (meme influence)
        </div>
        <div>
          <span className="swatch glow-path" aria-hidden="true" /> Glow path
          (meme → flow)
        </div>
        <div>
          <span className="swatch modifier-label" aria-hidden="true">
            %
          </span>{" "}
          Flow modifier label
        </div>
        <div>
          <span className="swatch influence-plus" aria-hidden="true">
            +
          </span>
          <span className="swatch influence-minus" aria-hidden="true">
            −
          </span>
          Influence on hover
        </div>
      </aside>

      {loading && (
        <div className="canvas-loading" role="status" aria-live="polite">
          <div className="spinner" aria-hidden="true" />
          <p>
            Running simulation… First request after idle may take 30–60s while
            the engine wakes up.
          </p>
        </div>
      )}

      {!hasData && !loading && (
        <div className="empty-canvas">
          <p>
            <strong>Press “Run Simulation”</strong> to project this system
            forward in time.
          </p>
          <p>Circles = quantities (stocks). Arrows = change over time (flows).</p>
        </div>
      )}
    </div>
  );
}
