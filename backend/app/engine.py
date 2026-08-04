"""Safe Euler simulation engine for OCI Converge system maps.

Evaluates flow equations in a restricted namespace (no imports or system
calls) and integrates stock levels over a configurable time horizon.
"""

from __future__ import annotations

import ast
import math
import operator
from copy import deepcopy
from typing import Any, Dict, List, Mapping, MutableMapping, Optional, Sequence

import numpy as np

from app.models import AssumptionParam, SystemMap


# Operators allowed inside flow equations (AST-level whitelist).
_SAFE_BINOPS: Dict[type, Any] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}

_SAFE_UNARYOPS: Dict[type, Any] = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
}

# Names exposed to equation evaluation (numpy/math helpers only).
_SAFE_FUNCS: Dict[str, Any] = {
    "np": np,
    "abs": abs,
    "min": min,
    "max": max,
    "round": round,
    "pow": pow,
    "sqrt": math.sqrt,
    "log": math.log,
    "log10": math.log10,
    "exp": math.exp,
    "sin": math.sin,
    "cos": math.cos,
    "tan": math.tan,
    "pi": math.pi,
    "e": math.e,
}


class SafeEvalError(ValueError):
    """Raised when an equation contains disallowed constructs."""


def _safe_eval(expression: str, variables: Mapping[str, Any]) -> float:
    """Evaluate a numeric expression with a restricted AST whitelist.

    Disallows attribute access except on the ``np`` module, subscripting of
    anything other than simple names, imports, calls to unknown callables,
    comprehensions, lambdas, and any dunder names.

    Args:
        expression: Source string of the rate equation.
        variables: Mapping of names (stocks, assumptions, time) to values.

    Returns:
        The evaluated numeric result as a float.

    Raises:
        SafeEvalError: If the expression is empty or uses unsafe constructs.
        TypeError / ZeroDivisionError: Propagated from arithmetic evaluation.
    """
    if not expression or not expression.strip():
        raise SafeEvalError("Flow equation must be a non-empty string.")

    try:
        tree = ast.parse(expression.strip(), mode="eval")
    except SyntaxError as exc:
        raise SafeEvalError(f"Invalid equation syntax: {exc}") from exc

    def _eval_node(node: ast.AST) -> Any:
        if isinstance(node, ast.Expression):
            return _eval_node(node.body)

        if isinstance(node, ast.Constant):
            if isinstance(node.value, (int, float, bool)):
                return node.value
            raise SafeEvalError(f"Disallowed constant type: {type(node.value)!r}")

        if isinstance(node, ast.Name):
            if node.id.startswith("__"):
                raise SafeEvalError(f"Disallowed name: {node.id}")
            if node.id in variables:
                return variables[node.id]
            if node.id in _SAFE_FUNCS:
                return _SAFE_FUNCS[node.id]
            raise SafeEvalError(f"Unknown name in equation: {node.id}")

        if isinstance(node, ast.BinOp):
            op_type = type(node.op)
            if op_type not in _SAFE_BINOPS:
                raise SafeEvalError(f"Disallowed operator: {op_type.__name__}")
            return _SAFE_BINOPS[op_type](_eval_node(node.left), _eval_node(node.right))

        if isinstance(node, ast.UnaryOp):
            op_type = type(node.op)
            if op_type not in _SAFE_UNARYOPS:
                raise SafeEvalError(f"Disallowed unary operator: {op_type.__name__}")
            return _SAFE_UNARYOPS[op_type](_eval_node(node.operand))

        if isinstance(node, ast.Call):
            func = _eval_node(node.func)
            if not callable(func):
                raise SafeEvalError("Attempted to call a non-callable.")
            # Only allow callables that are in our safe funcs or numpy ufuncs.
            allowed_callables = set(_SAFE_FUNCS.values())
            # Permit numpy module functions reached via Attribute on np.
            if func not in allowed_callables and not isinstance(
                func, (np.ufunc, type(np.sin), type(np.clip))
            ):
                # numpy functions are typically numpy.ufunc or builtin wrappers
                if not getattr(func, "__module__", "").startswith("numpy"):
                    raise SafeEvalError(f"Disallowed function call: {func!r}")
            args = [_eval_node(a) for a in node.args]
            if node.keywords:
                raise SafeEvalError("Keyword arguments are not allowed in equations.")
            return func(*args)

        if isinstance(node, ast.Attribute):
            # Only allow attribute access on the np module (e.g. np.clip).
            if not isinstance(node.value, ast.Name) or node.value.id != "np":
                raise SafeEvalError("Attribute access is only allowed on 'np'.")
            if node.attr.startswith("_"):
                raise SafeEvalError(f"Disallowed numpy attribute: {node.attr}")
            value = _eval_node(node.value)
            return getattr(value, node.attr)

        if isinstance(node, ast.Compare):
            left = _eval_node(node.left)
            result = True
            for op, comparator in zip(node.ops, node.comparators):
                right = _eval_node(comparator)
                if isinstance(op, ast.Eq):
                    result = result and (left == right)
                elif isinstance(op, ast.NotEq):
                    result = result and (left != right)
                elif isinstance(op, ast.Lt):
                    result = result and (left < right)
                elif isinstance(op, ast.LtE):
                    result = result and (left <= right)
                elif isinstance(op, ast.Gt):
                    result = result and (left > right)
                elif isinstance(op, ast.GtE):
                    result = result and (left >= right)
                else:
                    raise SafeEvalError(f"Disallowed comparison: {type(op).__name__}")
                left = right
            return result

        if isinstance(node, ast.IfExp):
            return _eval_node(node.body) if _eval_node(node.test) else _eval_node(node.orelse)

        if isinstance(node, ast.BoolOp):
            if isinstance(node.op, ast.And):
                value: Any = True
                for v in node.values:
                    value = _eval_node(v)
                    if not value:
                        return value
                return value
            if isinstance(node.op, ast.Or):
                value = False
                for v in node.values:
                    value = _eval_node(v)
                    if value:
                        return value
                return value
            raise SafeEvalError("Disallowed boolean operator.")

        raise SafeEvalError(f"Disallowed expression node: {type(node).__name__}")

    result = _eval_node(tree)
    try:
        return float(result)
    except (TypeError, ValueError) as exc:
        raise SafeEvalError(f"Equation did not evaluate to a number: {result!r}") from exc


class SimulationEngine:
    """Euler-method simulator for an OCI :class:`~app.models.SystemMap`.

    Flow equations are evaluated each step in a restricted namespace that
    exposes stock levels, assumption values, the current time ``t``, and a
    curated set of math/numpy helpers. Stock values are clamped to their
    configured ``min_value`` / ``max_value`` after every update.
    """

    def __init__(self, system_map: SystemMap) -> None:
        """Initialize the engine with a validated system map.

        Args:
            system_map: Fully validated :class:`SystemMap` instance.
        """
        self.system_map: SystemMap = system_map
        self._stock_index: Dict[str, Any] = {s.id: s for s in system_map.stocks}
        self._assumption_values: Dict[str, float] = self._extract_assumption_values(
            system_map.assumptions.registry
        )

    @staticmethod
    def _extract_assumption_values(
        registry: Mapping[str, AssumptionParam],
    ) -> Dict[str, float]:
        """Convert assumption registry entries to numeric values for equations.

        Args:
            registry: Mapping of assumption key -> AssumptionParam.

        Returns:
            Dict of assumption key -> float value (bools become 0/1).
        """
        values: Dict[str, float] = {}
        for key, param in registry.items():
            raw = param.value
            if isinstance(raw, bool):
                values[key] = 1.0 if raw else 0.0
            elif isinstance(raw, (int, float)):
                values[key] = float(raw)
            else:
                values[key] = float(raw)
        return values

    def _build_namespace(
        self,
        stock_values: Mapping[str, float],
        time: float,
        assumption_overrides: Optional[Mapping[str, float]] = None,
    ) -> Dict[str, Any]:
        """Build the variable namespace for one equation evaluation.

        Args:
            stock_values: Current stock id -> value.
            time: Current simulation time.
            assumption_overrides: Optional per-call assumption overrides.

        Returns:
            Combined namespace dict of stocks, assumptions, and ``t``.
        """
        assumptions = dict(self._assumption_values)
        if assumption_overrides:
            assumptions.update(assumption_overrides)
        namespace: Dict[str, Any] = {**stock_values, **assumptions, "t": time}
        return namespace

    def _clamp_stock(self, stock_id: str, value: float) -> float:
        """Clamp a stock value to its configured bounds.

        Args:
            stock_id: Stock identifier.
            value: Proposed new value.

        Returns:
            Value clamped to [min_value, max_value].
        """
        stock = self._stock_index[stock_id]
        return float(np.clip(value, stock.min_value, stock.max_value))

    def run(
        self,
        horizon: Optional[float] = None,
        assumption_overrides: Optional[Mapping[str, float]] = None,
    ) -> List[Dict[str, float]]:
        """Run an Euler integration of the system map.

        Args:
            horizon: Optional end time override. Defaults to
                ``system_map.context.temporal.end``.
            assumption_overrides: Optional mapping of assumption key -> value
                applied for the duration of this run only.

        Returns:
            A list of dictionaries, one per time step::

                [{"time": 0.0, "<stock_id>": <value>, ...}, ...]
        """
        temporal = self.system_map.context.temporal
        start = float(temporal.start)
        end = float(horizon) if horizon is not None else float(temporal.end)
        dt = float(temporal.dt)

        if end < start:
            raise ValueError("Simulation horizon end must be >= start.")
        if dt <= 0:
            raise ValueError("Simulation dt must be positive.")

        stock_values: Dict[str, float] = {
            s.id: float(s.initial_value) for s in self.system_map.stocks
        }
        # Clamp initial conditions as well.
        for sid in list(stock_values.keys()):
            stock_values[sid] = self._clamp_stock(sid, stock_values[sid])

        timeseries: List[Dict[str, float]] = []
        t = start
        # Include the terminal step when (end - start) is an exact multiple of dt.
        steps = int(math.floor((end - start) / dt + 1e-12)) + 1

        for _ in range(steps):
            snapshot: Dict[str, float] = {"time": float(t), **stock_values}
            timeseries.append(snapshot)

            if t >= end - 1e-12:
                break

            namespace = self._build_namespace(stock_values, t, assumption_overrides)
            deltas: Dict[str, float] = {sid: 0.0 for sid in stock_values}

            for flow in self.system_map.flows:
                rate = _safe_eval(flow.equation, namespace)
                amount = rate * dt
                if flow.from_stock and flow.from_stock in deltas:
                    deltas[flow.from_stock] -= amount
                if flow.to_stock and flow.to_stock in deltas:
                    deltas[flow.to_stock] += amount

            for sid, delta in deltas.items():
                stock_values[sid] = self._clamp_stock(sid, stock_values[sid] + delta)

            t += dt

        return timeseries

    def run_comparison(
        self,
        branches: Sequence[Mapping[str, Any]],
    ) -> Dict[str, List[Dict[str, float]]]:
        """Run the simulation once per scenario branch with temporary overrides.

        For each branch, assumption values from the registry are temporarily
        overridden, the simulation is run, then original values are restored.

        Args:
            branches: Sequence of dicts with keys::

                {"name": str, "overrides": dict[str, numeric]}

        Returns:
            Mapping of ``branch_name`` -> timeseries list.
        """
        results: Dict[str, List[Dict[str, float]]] = {}
        original = deepcopy(self._assumption_values)

        try:
            for branch in branches:
                name = str(branch.get("name", "unnamed"))
                overrides_raw = branch.get("overrides") or {}
                if not isinstance(overrides_raw, MutableMapping):
                    raise TypeError(
                        f"Branch '{name}' overrides must be a mapping, got "
                        f"{type(overrides_raw)!r}."
                    )

                # Respect mutability flags on the registry.
                applied: Dict[str, float] = {}
                for key, value in overrides_raw.items():
                    param = self.system_map.assumptions.registry.get(key)
                    if param is not None and not param.mutable:
                        continue
                    applied[key] = float(value)

                self._assumption_values = {**original, **applied}
                results[name] = self.run()
                self._assumption_values = deepcopy(original)
        finally:
            self._assumption_values = original

        return results

    def assumptions_used(self) -> Dict[str, Any]:
        """Return a serializable snapshot of currently active assumption values.

        Returns:
            Dict of assumption key -> current numeric value.
        """
        return dict(self._assumption_values)
