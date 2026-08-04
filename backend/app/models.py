"""Pydantic data models for Open Civilization Intelligence (OCI) Converge.

Defines the nested schema for a SystemMap: metadata, context, stocks, flows,
feedback loops, memes, assumptions (with registry and scenario branches), and
visual style. Flow edges use an alias for the reserved Python keyword ``from``.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class MapMetadata(BaseModel):
    """Top-level identifying information for a system map.

    Attributes:
        id: Unique map identifier.
        title: Human-readable map title.
        version: Schema or content version string.
        description: Optional longer description of the map purpose.
        author: Optional author or organization name.
        tags: Free-form tags for discovery and filtering.
        created_at: Optional ISO-8601 creation timestamp.
        updated_at: Optional ISO-8601 last-update timestamp.
    """

    id: str = Field(..., description="Unique map identifier.")
    title: str = Field(..., description="Human-readable map title.")
    version: str = Field(default="1.0.0", description="Schema or content version.")
    description: str = Field(default="", description="Longer description of the map.")
    author: Optional[str] = Field(default=None, description="Author or organization.")
    tags: List[str] = Field(default_factory=list, description="Discovery tags.")
    created_at: Optional[str] = Field(default=None, description="ISO-8601 created time.")
    updated_at: Optional[str] = Field(default=None, description="ISO-8601 updated time.")


class SpatialExtent(BaseModel):
    """Geographic or administrative extent of the system under study.

    Attributes:
        type: Geometry or jurisdiction type label.
        label: Human-readable place name.
        coordinates: Optional bounding box or centroid coordinates.
    """

    type: str = Field(default="region", description="Extent type (region, city, etc.).")
    label: str = Field(..., description="Human-readable place name.")
    coordinates: Optional[List[float]] = Field(
        default=None,
        description="Optional bounding box [west, south, east, north] or [lon, lat].",
    )


class TemporalHorizon(BaseModel):
    """Simulation time settings for the system map.

    Attributes:
        start: Simulation start time (model units, often years).
        end: Simulation end time.
        dt: Integration step size for Euler approximation.
        unit: Time unit label (e.g. 'years', 'months').
    """

    start: float = Field(default=0.0, description="Simulation start time.")
    end: float = Field(default=50.0, description="Simulation end time.")
    dt: float = Field(default=1.0, ge=1e-9, description="Euler step size.")
    unit: str = Field(default="years", description="Time unit label.")


class MapContext(BaseModel):
    """Narrative and situational framing for the system map.

    Attributes:
        domain: Problem domain (energy, water, conflict, etc.).
        narrative: Short situational narrative.
        stakeholders: Named stakeholder groups.
        spatial: Optional spatial extent.
        temporal: Simulation horizon settings.
        goals: Stated goals or success criteria.
    """

    domain: str = Field(..., description="Problem domain label.")
    narrative: str = Field(default="", description="Situational narrative.")
    stakeholders: List[str] = Field(default_factory=list, description="Stakeholder groups.")
    spatial: Optional[SpatialExtent] = Field(default=None, description="Spatial extent.")
    temporal: TemporalHorizon = Field(
        default_factory=TemporalHorizon,
        description="Simulation time settings.",
    )
    goals: List[str] = Field(default_factory=list, description="Goals / success criteria.")


class Stock(BaseModel):
    """A stock (accumulator) in the system dynamics model.

    Attributes:
        id: Unique stock identifier used in equations.
        name: Display name.
        description: Optional description.
        initial_value: Starting value at t=0.
        min_value: Lower clamp bound.
        max_value: Upper clamp bound.
        unit: Measurement unit.
        category: Optional grouping category.
    """

    id: str = Field(..., description="Unique stock identifier.")
    name: str = Field(..., description="Display name.")
    description: str = Field(default="", description="Stock description.")
    initial_value: float = Field(..., description="Value at simulation start.")
    min_value: float = Field(default=0.0, description="Lower clamp bound.")
    max_value: float = Field(default=1e12, description="Upper clamp bound.")
    unit: str = Field(default="", description="Measurement unit.")
    category: Optional[str] = Field(default=None, description="Grouping category.")


class Flow(BaseModel):
    """A flow that moves quantity between stocks (or from/to the environment).

    Wire-format JSON keys are ``from`` and ``to``. Internally these are stored
    as ``from_stock`` and ``to_stock`` because ``from`` is a Python keyword.
    Both the aliases and the internal names are accepted on input so older
    frontend payloads using ``from_stock`` / ``to_stock`` still validate.

    Attributes:
        id: Unique flow identifier.
        name: Display name.
        description: Optional description.
        from_stock: Source stock id (or None / 'environment' for exogenous inflow).
        to_stock: Destination stock id (or None / 'environment' for outflow).
        equation: Rate equation evaluated each time step (stock ids and
            assumption keys are substituted into a safe namespace).
        unit: Measurement unit for the flow rate.
    """

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    id: str = Field(..., description="Unique flow identifier.")
    name: str = Field(..., description="Display name.")
    description: str = Field(default="", description="Flow description.")
    from_stock: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("from", "from_stock"),
        serialization_alias="from",
        description="Source stock id (JSON key: 'from').",
    )
    to_stock: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("to", "to_stock"),
        serialization_alias="to",
        description="Destination stock id (JSON key: 'to').",
    )
    equation: str = Field(
        ...,
        description="Rate equation using stock ids and assumption keys.",
    )
    unit: str = Field(default="", description="Flow rate unit.")


class FeedbackLoop(BaseModel):
    """A reinforcing or balancing feedback loop linking stocks and flows.

    Attributes:
        id: Unique loop identifier.
        name: Display name.
        type: 'reinforcing' (R) or 'balancing' (B).
        description: Narrative description of the causal mechanism.
        elements: Ordered list of stock/flow ids participating in the loop.
        polarity: Optional signed polarity annotation.
    """

    id: str = Field(..., description="Unique loop identifier.")
    name: str = Field(..., description="Display name.")
    type: Literal["reinforcing", "balancing"] = Field(
        ...,
        description="Loop type: reinforcing or balancing.",
    )
    description: str = Field(default="", description="Causal mechanism narrative.")
    elements: List[str] = Field(
        default_factory=list,
        description="Ordered stock/flow ids in the loop.",
    )
    polarity: Optional[str] = Field(default=None, description="Polarity annotation.")


class Meme(BaseModel):
    """A cultural meme / narrative frame that influences the system.

    Attributes:
        id: Unique meme identifier.
        name: Short meme label.
        description: Narrative content of the meme.
        emotional_charge: Distinct emotional valence/intensity score in [-1, 1]
            (negative = fear/anger, positive = hope/pride).
        related_stocks: Stock ids this meme influences or is influenced by.
        related_assumptions: Assumption keys linked to this meme.
    """

    id: str = Field(..., description="Unique meme identifier.")
    name: str = Field(..., description="Short meme label.")
    description: str = Field(default="", description="Narrative content.")
    emotional_charge: float = Field(
        ...,
        ge=-1.0,
        le=1.0,
        description="Emotional valence/intensity in [-1, 1].",
    )
    related_stocks: List[str] = Field(
        default_factory=list,
        description="Related stock ids.",
    )
    related_assumptions: List[str] = Field(
        default_factory=list,
        description="Related assumption registry keys.",
    )


class AssumptionParam(BaseModel):
    """A single parameterized assumption in the registry.

    Attributes:
        value: Current numeric (or string-coerced numeric) value used in equations.
        confidence: Subjective confidence in [0, 1].
        range: Allowed [low, high] range for the parameter.
        source: Provenance / citation string.
        mutable: Whether scenario branches may override this value.
    """

    value: Union[float, int, str, bool] = Field(
        ...,
        description="Current assumption value used in equations.",
    )
    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Subjective confidence in [0, 1].",
    )
    range: List[float] = Field(
        ...,
        min_length=2,
        max_length=2,
        description="Allowed [low, high] numeric range.",
    )
    source: str = Field(..., description="Provenance or citation.")
    mutable: bool = Field(
        default=True,
        description="Whether scenario branches may override this value.",
    )


class ScenarioBranch(BaseModel):
    """A named what-if branch that overrides assumption registry values.

    Attributes:
        name: Branch display name.
        description: Optional narrative for the branch.
        overrides: Mapping of assumption registry keys to override values.
    """

    name: str = Field(..., description="Branch display name.")
    description: str = Field(default="", description="Branch narrative.")
    overrides: Dict[str, Any] = Field(
        default_factory=dict,
        description="Assumption key -> override value.",
    )


class Assumptions(BaseModel):
    """Assumption registry and optional predefined scenario branches.

    Attributes:
        registry: Dict of assumption key -> AssumptionParam.
        scenario_branches: Predefined ScenarioBranch objects.
    """

    registry: Dict[str, AssumptionParam] = Field(
        ...,
        description="Assumption key -> AssumptionParam.",
    )
    scenario_branches: List[ScenarioBranch] = Field(
        default_factory=list,
        description="Predefined scenario branches.",
    )


class VisualStyle(BaseModel):
    """Presentation hints for frontend rendering of the system map.

    Attributes:
        theme: Theme name (e.g. 'light', 'dark', 'civic').
        stock_color: Default stock node color.
        flow_color: Default flow edge color.
        reinforcing_loop_color: Color for reinforcing loops.
        balancing_loop_color: Color for balancing loops.
        layout: Preferred layout algorithm hint.
        extras: Arbitrary additional style tokens.
    """

    theme: str = Field(default="civic", description="Theme name.")
    stock_color: str = Field(default="#2E7D32", description="Stock node color.")
    flow_color: str = Field(default="#1565C0", description="Flow edge color.")
    reinforcing_loop_color: str = Field(
        default="#C62828",
        description="Reinforcing loop accent color.",
    )
    balancing_loop_color: str = Field(
        default="#6A1B9A",
        description="Balancing loop accent color.",
    )
    layout: str = Field(default="force", description="Layout algorithm hint.")
    extras: Dict[str, Any] = Field(
        default_factory=dict,
        description="Additional style tokens.",
    )


class SystemMap(BaseModel):
    """Complete OCI Converge system map document.

    Contains metadata, situational context, stocks, flows, feedback loops,
    memes, assumptions (registry + scenario branches), and visual style.

    Attributes:
        metadata: Map identity and versioning.
        context: Domain narrative, stakeholders, and temporal horizon.
        stocks: List of Stock accumulators.
        flows: List of Flow rates between stocks.
        feedback_loops: Reinforcing and balancing loops.
        memes: Cultural / narrative frames with emotional charge.
        assumptions: Registry of AssumptionParam plus scenario branches.
        visual_style: Frontend rendering hints.
    """

    metadata: MapMetadata = Field(..., description="Map identity and versioning.")
    context: MapContext = Field(..., description="Situational framing.")
    stocks: List[Stock] = Field(..., min_length=1, description="Stock accumulators.")
    flows: List[Flow] = Field(default_factory=list, description="Flow rates.")
    feedback_loops: List[FeedbackLoop] = Field(
        default_factory=list,
        description="Feedback loops.",
    )
    memes: List[Meme] = Field(default_factory=list, description="Cultural memes.")
    assumptions: Assumptions = Field(
        ...,
        description="Assumption registry and scenario branches.",
    )
    visual_style: VisualStyle = Field(
        default_factory=VisualStyle,
        description="Frontend rendering hints.",
    )
