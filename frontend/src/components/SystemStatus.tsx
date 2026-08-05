import type { Stock } from "../types/oci-types";

export interface SystemStatusProps {
  stocks: Stock[];
  stockValues: Record<string, number>;
}

type HealthStatus = "High / growth" | "Mid / equilibrium" | "Low / stress";

const STATUS_COLOR: Record<HealthStatus, string> = {
  "High / growth": "#16A34A",
  "Mid / equilibrium": "#2563EB",
  "Low / stress": "#DC2626",
};

function stockHealthStatus(value: number, stock: Stock): HealthStatus {
  const min = stock.min_value ?? 0;
  const max = stock.max_value ?? Math.max(value, 1);
  const t = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
  if (t < 0.33) return "Low / stress";
  if (t < 0.66) return "Mid / equilibrium";
  return "High / growth";
}

/**
 * Compact readout of current stock levels with color-matched health status.
 */
export default function SystemStatus({ stocks, stockValues }: SystemStatusProps) {
  return (
    <section className="panel">
      <h2>System Status</h2>
      <ul className="status-list">
        {stocks.map((stock) => {
          const value = stockValues[stock.id] ?? stock.initial_value;
          const status = stockHealthStatus(value, stock);
          const color = STATUS_COLOR[status];
          return (
            <li key={stock.id}>
              <div className="status-row-main">
                <span>{stock.name}</span>
                <span className="value">
                  {value.toFixed(2)}
                  {stock.unit ? ` ${stock.unit}` : ""}
                </span>
              </div>
              <span className="status-health" title={status}>
                <span
                  className="status-dot"
                  style={{ color }}
                  aria-hidden="true"
                >
                  ●
                </span>
                <span style={{ color }}>{status}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
