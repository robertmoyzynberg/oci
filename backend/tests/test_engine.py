"""Unit tests for the OCI Converge SimulationEngine."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict

import pytest

from app.engine import SimulationEngine
from app.models import SystemMap

SCHEMA_PATH = (
    Path(__file__).resolve().parents[1] / "app" / "schemas" / "oci-schema-v1.json"
)


def _load_demo_map() -> SystemMap:
    """Load the Renewable Energy Transition demo map from the default schema."""
    raw = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    return SystemMap.model_validate(raw)


def test_baseline_simulation_stocks_stay_within_bounds() -> None:
    """Baseline run should keep every stock within its min/max at all times."""
    system_map = _load_demo_map()
    engine = SimulationEngine(system_map)
    series = engine.run()

    assert len(series) > 1
    assert series[0]["time"] == pytest.approx(system_map.context.temporal.start)

    bounds: Dict[str, Dict[str, float]] = {
        s.id: {"min": s.min_value, "max": s.max_value} for s in system_map.stocks
    }

    for frame in series:
        for stock_id, limits in bounds.items():
            assert stock_id in frame
            value = frame[stock_id]
            assert value >= limits["min"] - 1e-9
            assert value <= limits["max"] + 1e-9


def test_scenario_branch_override_changes_final_stock() -> None:
    """Overriding tech_improvement should change final renewable_capacity."""
    system_map = _load_demo_map()
    engine = SimulationEngine(system_map)

    branches = [
        {"name": "baseline", "overrides": {}},
        {
            "name": "high_tech",
            "overrides": {"tech_improvement": 0.12},
        },
    ]
    results = engine.run_comparison(branches)

    assert "baseline" in results
    assert "high_tech" in results

    baseline_final = results["baseline"][-1]["renewable_capacity"]
    high_tech_final = results["high_tech"][-1]["renewable_capacity"]

    assert high_tech_final != pytest.approx(baseline_final)
    assert high_tech_final > baseline_final
