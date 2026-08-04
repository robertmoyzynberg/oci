"""FastAPI application entrypoint for OCI Converge.

Exposes simulation, scenario-branch comparison, schema, and health endpoints
with permissive CORS for the MVP frontend (Vercel + local Vite).

On Render, the process is started via:
  uvicorn app.main:app --host 0.0.0.0 --port $PORT
so the app itself does not hardcode a bind port.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, List

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from app.engine import SafeEvalError, SimulationEngine
from app.models import SystemMap

SCHEMA_PATH = Path(__file__).resolve().parent / "schemas" / "oci-schema-v1.json"

app = FastAPI(
    title="Open Civilization Intelligence (OCI) Converge",
    description=(
        "Backend API for system-dynamics simulation, assumption registries, "
        "and scenario-branch comparison."
    ),
    version="1.0.0",
)

# MVP: allow all origins (Vercel + local). Restrict later via CORS_ORIGINS if needed.
_cors_raw = os.getenv("CORS_ORIGINS", "*").strip()
_cors_origins = (
    ["*"]
    if _cors_raw == "*"
    else [origin.strip() for origin in _cors_raw.split(",") if origin.strip()]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,  # For MVP; restrict to your Vercel URL later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class BranchSpec(BaseModel):
    """A single scenario branch override specification.

    Attributes:
        name: Branch display / result key name.
        overrides: Assumption registry key -> override value.
    """

    name: str = Field(..., description="Branch name used as the result key.")
    overrides: Dict[str, Any] = Field(
        default_factory=dict,
        description="Assumption key -> override value.",
    )


class ScenarioBranchRequest(BaseModel):
    """Request body for ``POST /scenario-branch``.

    Attributes:
        system_map: Full SystemMap document to simulate.
        branches: List of named override branches to compare.
    """

    system_map: SystemMap = Field(..., description="System map to simulate.")
    branches: List[BranchSpec] = Field(
        ...,
        min_length=1,
        description="Named branches with assumption overrides.",
    )


@app.get("/health")
def health() -> Dict[str, str]:
    """Liveness probe.

    Returns:
        ``{"status": "healthy", "version": "1.0.0"}`` when the process is up.
    """
    return {"status": "healthy", "version": "1.0.0"}


@app.get("/schema")
def get_schema() -> FileResponse:
    """Serve the default OCI schema / demo system map JSON.

    Returns:
        The contents of ``schemas/oci-schema-v1.json`` as a file response.

    Raises:
        HTTPException: 404 if the schema file is missing on disk.
    """
    if not SCHEMA_PATH.is_file():
        raise HTTPException(status_code=404, detail="Schema file not found.")
    return FileResponse(
        path=SCHEMA_PATH,
        media_type="application/json",
        filename="oci-schema-v1.json",
    )


@app.post("/simulate")
def simulate(system_map: SystemMap) -> JSONResponse:
    """Run a baseline Euler simulation for the provided system map.

    Args:
        system_map: Validated SystemMap JSON body.

    Returns:
        JSON payload::

            {
              "status": "success",
              "data": [<timeseries frames>],
              "assumptions_used": {<key>: <value>, ...}
            }
    """
    try:
        engine = SimulationEngine(system_map)
        data = engine.run()
        return JSONResponse(
            content={
                "status": "success",
                "data": data,
                "assumptions_used": engine.assumptions_used(),
            }
        )
    except SafeEvalError as exc:
        raise HTTPException(status_code=400, detail=f"Unsafe or invalid equation: {exc}") from exc
    except (ValueError, TypeError, ZeroDivisionError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/scenario-branch")
def scenario_branch(request: ScenarioBranchRequest) -> JSONResponse:
    """Compare multiple assumption-override branches against one system map.

    Args:
        request: Body containing ``system_map`` and ``branches``.

    Returns:
        JSON payload::

            {
              "status": "success",
              "branches": { "<name>": [<timeseries>], ... },
              "base_assumptions": {<key>: <value>, ...}
            }
    """
    try:
        engine = SimulationEngine(request.system_map)
        branch_payload = [
            {"name": b.name, "overrides": b.overrides} for b in request.branches
        ]
        results = engine.run_comparison(branch_payload)
        return JSONResponse(
            content={
                "status": "success",
                "branches": results,
                "base_assumptions": engine.assumptions_used(),
            }
        )
    except SafeEvalError as exc:
        raise HTTPException(status_code=400, detail=f"Unsafe or invalid equation: {exc}") from exc
    except (ValueError, TypeError, ZeroDivisionError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


if __name__ == "__main__":
    # Local convenience only. Render uses startCommand with $PORT.
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=False)
