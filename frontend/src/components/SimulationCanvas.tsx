import { useEffect, useMemo, useRef } from "react";
import * as d3 from "d3";
import type { Flow, Meme, Stock } from "../types/oci-types";

export interface SimulationCanvasProps {
  stocks: Stock[];
  flows: Flow[];
  memes: Meme[];
  simulationData: Array<Record<string, number>> | null;
  currentFrameIndex: number;
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
  if (t < 0.33) return "#DC2626";
  if (t < 0.66) return "#F59E0B";
  return "#16A34A";
}

function memeReplicationRate(meme: Meme): number {
  // Backend schema has no replication_rate; derive a display proxy from charge magnitude.
  return Math.max(0.15, Math.min(1, Math.abs(meme.emotional_charge)));
}

/**
 * D3 force-directed system map. Builds SVG once, then updates geometry on frame changes.
 */
export default function SimulationCanvas({
  stocks,
  flows,
  memes,
  simulationData,
  currentFrameIndex,
}: SimulationCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const simRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null);
  const builtKeyRef = useRef<string>("");

  const frame = useMemo(() => {
    if (!simulationData || simulationData.length === 0) {
      const initial: Record<string, number> = { time: 0 };
      for (const s of stocks) initial[s.id] = s.initial_value;
      return initial;
    }
    const idx = Math.max(0, Math.min(currentFrameIndex, simulationData.length - 1));
    return simulationData[idx];
  }, [simulationData, currentFrameIndex, stocks]);

  const nextFrame = useMemo(() => {
    if (!simulationData || simulationData.length < 2) return frame;
    const idx = Math.max(0, Math.min(currentFrameIndex, simulationData.length - 1));
    return simulationData[Math.min(idx + 1, simulationData.length - 1)];
  }, [simulationData, currentFrameIndex, frame]);

  // Build / rebuild graph structure when topology changes.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const topologyKey = JSON.stringify({
      stocks: stocks.map((s) => s.id),
      flows: flows.map((f) => [f.id, f.from, f.to]),
      memes: memes.map((m) => m.id),
    });

    const width = el.clientWidth || 800;
    const height = el.clientHeight || 600;

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
        x: (anchor?.x ?? width * 0.7) + 40,
        y: (anchor?.y ?? height * 0.5) - 50,
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
    }

    const linkSel = gRoot
      .append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", (d) => (d.flow ? "#2563EB" : "rgba(245, 158, 11, 0.35)"))
      .attr("stroke-opacity", (d) => (d.flow ? 0.85 : 0.45))
      .attr("marker-end", (d) => (d.flow ? "url(#flow-arrow)" : null));

    const nodeSel = gRoot
      .append("g")
      .attr("class", "nodes")
      .selectAll<SVGGElement, SimNode>("g")
      .data(nodes)
      .join("g")
      .attr("class", (d) => `node node-${d.kind}`);

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
      .append("circle")
      .attr("class", "body")
      .attr("r", 18)
      .attr("fill", "#121820")
      .attr("stroke", "#1E2A36")
      .attr("stroke-width", 2);

    nodeSel
      .append("text")
      .attr("class", "label")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("fill", "#E8EEF4")
      .attr("font-size", 10)
      .attr("pointer-events", "none")
      .text((d) => (d.kind === "meme" ? "◆" : d.kind === "env" ? "⌀" : d.label.slice(0, 10)));

    nodeSel
      .append("title")
      .text((d) => d.label);

    const simulation = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance((d) => (d.flow ? 160 : 90))
          .strength(0.45),
      )
      .force("charge", d3.forceManyBody().strength(-420))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide<SimNode>().radius(36))
      .on("tick", () => {
        linkSel
          .attr("x1", (d) => (d.source as SimNode).x ?? 0)
          .attr("y1", (d) => (d.source as SimNode).y ?? 0)
          .attr("x2", (d) => (d.target as SimNode).x ?? 0)
          .attr("y2", (d) => (d.target as SimNode).y ?? 0);

        nodeSel.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
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
      d3.select(this)
        .select("circle.body")
        .attr("r", radius)
        .attr("fill", stockHealthColor(value, stock))
        .attr("fill-opacity", 0.88)
        .attr("stroke", "#E8EEF4")
        .attr("stroke-opacity", 0.35);
      d3.select(this)
        .select("text.label")
        .text(`${value.toFixed(1)}`);
    });

    root.selectAll<SVGGElement, SimNode>("g.node-env").each(function () {
      d3.select(this)
        .select("circle.body")
        .attr("r", 14)
        .attr("fill", "#1E2A36")
        .attr("stroke", "#2563EB");
    });

    root.selectAll<SVGGElement, SimNode>("g.node-meme").each(function (d) {
      const meme = d.meme;
      if (!meme) return;
      const charge = Math.abs(meme.emotional_charge);
      const replication = memeReplicationRate(meme);
      d3.select(this)
        .select("circle.body")
        .attr("r", 8 + charge * 16)
        .attr("fill", "#F59E0B")
        .attr("fill-opacity", 0.25 + replication * 0.65)
        .attr("stroke", "#F59E0B")
        .attr("stroke-opacity", 0.9);
    });

    root.selectAll<SVGLineElement, SimLink>("g.links line").each(function (d) {
      if (!d.flow) {
        d3.select(this).attr("stroke-width", 1);
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
  }, [frame, nextFrame, stocks]);

  const hasData = Boolean(simulationData && simulationData.length > 0);

  return (
    <div className="canvas-wrap">
      <div className="simulation-canvas" ref={containerRef} />
      {!hasData && (
        <div className="empty-canvas">
          Run a simulation to animate stock levels across the system map.
        </div>
      )}
    </div>
  );
}
