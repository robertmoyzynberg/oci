import type { Stock } from "../types/oci-types";

export interface SystemStatusProps {
  stocks: Stock[];
  stockValues: Record<string, number>;
}

/**
 * Compact readout of current stock levels for the selected frame.
 */
export default function SystemStatus({ stocks, stockValues }: SystemStatusProps) {
  return (
    <section className="panel">
      <h2>System Status</h2>
      <ul className="status-list">
        {stocks.map((stock) => {
          const value = stockValues[stock.id] ?? stock.initial_value;
          return (
            <li key={stock.id}>
              <span>{stock.name}</span>
              <span className="value">
                {value.toFixed(2)}
                {stock.unit ? ` ${stock.unit}` : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
