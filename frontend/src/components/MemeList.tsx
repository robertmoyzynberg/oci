import type { Meme } from "../types/oci-types";

export interface MemeListProps {
  memes: Meme[];
}

function replicationRate(meme: Meme): number {
  return Math.max(0.15, Math.min(1, Math.abs(meme.emotional_charge)));
}

/**
 * Cultural meme list with emotional charge and derived replication rate.
 */
export default function MemeList({ memes }: MemeListProps) {
  return (
    <section className="panel">
      <h2>Memes</h2>
      {memes.length === 0 && <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.85rem" }}>No memes</p>}
      {memes.map((meme) => {
        const charge = Math.abs(meme.emotional_charge);
        const replication = replicationRate(meme);
        return (
          <div className="meme-item" key={meme.id}>
            <div className="meme-name">{meme.name}</div>
            <div className="meme-metrics">
              <span className="metric" title="Emotional charge">
                🔥
                <span className="charge-bar">
                  <span style={{ width: `${charge * 100}%` }} />
                </span>
              </span>
              <span className="metric" title="Replication rate">
                ⚡ {(replication * 100).toFixed(0)}%
              </span>
            </div>
            {meme.description ? <div className="meme-desc">{meme.description}</div> : null}
          </div>
        );
      })}
    </section>
  );
}
