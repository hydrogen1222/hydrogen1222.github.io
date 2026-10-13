#!/usr/bin/env python3
"""Shared utilities for Materials Project/VASP phase-stability scripts."""

from __future__ import annotations

import argparse
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, NoReturn, Sequence


MP_API_KEY_ENV = "MP_API_KEY"
DEFAULT_THERMO_TYPES = ("GGA_GGA+U",)
DEFAULT_OPEN_ELEMENT = "Li"


@dataclass(frozen=True)
class Plateau:
    """One constant-product interval in an open-element voltage profile."""

    left_v: float
    right_v: float
    uptake: float
    products: str
    products_with_li: str

    def is_neutral(self, tol: float = 1e-6) -> bool:
        return abs(self.uptake) <= tol


def die(message: str) -> NoReturn:
    """Exit with a concise, user-facing error message."""
    raise SystemExit(f"error: {message}")


def import_runtime_stack() -> dict[str, Any]:
    """Import the optional Materials Project/pymatgen runtime dependencies."""
    try:
        from mp_api.client import MPRester
        from pymatgen.analysis.phase_diagram import PhaseDiagram
        from pymatgen.core import Composition, Element
        from pymatgen.entries.compatibility import MaterialsProject2020Compatibility
        from pymatgen.entries.computed_entries import ComputedEntry
        from pymatgen.io.vasp.outputs import Vasprun
    except ImportError as exc:
        die(
            f"missing Python dependency ({exc.name}); install mp-api and pymatgen "
            "in the active environment"
        )

    return {
        "MPRester": MPRester,
        "PhaseDiagram": PhaseDiagram,
        "Composition": Composition,
        "Element": Element,
        "MaterialsProject2020Compatibility": MaterialsProject2020Compatibility,
        "ComputedEntry": ComputedEntry,
        "Vasprun": Vasprun,
    }


def add_common_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--vasprun",
        required=False,
        default="vasprun.xml",
        help="VASP vasprun.xml for the relaxed target (default: ./vasprun.xml).",
    )
    parser.add_argument(
        "--target",
        default="Li10GeP2S12",
        help="Target composition (default: Li10GeP2S12, i.e. LGPS).",
    )
    parser.add_argument(
        "--api-key",
        default=None,
        help="Materials Project API key (prefer setting MP_API_KEY).",
    )
    parser.add_argument(
        "--thermo-types",
        nargs="+",
        default=list(DEFAULT_THERMO_TYPES),
        metavar="TYPE",
        help="MP thermo type(s); LGPS/PBE requires GGA_GGA+U (default).",
    )
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="Run offline helper tests; no API key or vasprun.xml is needed.",
    )


def resolve_api_key(args: argparse.Namespace) -> str:
    key = args.api_key or os.environ.get(MP_API_KEY_ENV) or os.environ.get("PMG_MAPI_KEY")
    if not key:
        die("Materials Project API key not found; set MP_API_KEY or pass --api-key")
    return key


def parse_thermo_types(values: str | Sequence[str]) -> list[str]:
    """Normalize comma- or space-separated MP thermo type arguments."""
    raw = [values] if isinstance(values, str) else list(values)
    result: list[str] = []
    for value in raw:
        result.extend(item.strip() for item in value.split(",") if item.strip())

    if not result:
        die("--thermo-types must contain at least one value")
    if set(result) != {"GGA_GGA+U"}:
        die(
            "this VASP workflow is PBE-based, so --thermo-types must be "
            "GGA_GGA+U; mixing PBE with r2SCAN would make the hull inconsistent"
        )
    return ["GGA_GGA+U"]


def chemsys_of(composition: Any) -> list[str]:
    return sorted(element.symbol for element in composition.elements)


def same_reduced_composition(left: Any, right: Any) -> bool:
    return left.reduced_composition == right.reduced_composition


def pull_mp_entries(
    stack: dict[str, Any],
    api_key: str,
    chemsys: Sequence[str],
    thermo_types: Sequence[str],
) -> list[Any]:
    """Fetch all compatible entries in a chemical system and its subsystems."""
    MPRester = stack["MPRester"]
    try:
        with MPRester(api_key, mute_progress_bars=True) as mpr:
            entries = mpr.get_entries_in_chemsys(
                list(chemsys),
                compatible_only=True,
                additional_criteria={"thermo_types": list(thermo_types)},
            )
    except Exception as exc:
        die(f"Materials Project query failed: {exc}")
    if not entries:
        die(f"Materials Project returned no entries for {'-'.join(chemsys)}")
    return entries


def split_target_competitors(entries: Sequence[Any], target: Any) -> tuple[list[Any], list[Any]]:
    """Remove every entry having the target's reduced composition from the hull."""
    target_entries: list[Any] = []
    competitors: list[Any] = []
    for entry in entries:
        destination = (
            target_entries
            if same_reduced_composition(entry.composition, target)
            else competitors
        )
        destination.append(entry)
    return target_entries, competitors


def load_my_entry(stack: dict[str, Any], vasprun_path: Path, target: Any) -> Any:
    """Parse a VASP run and apply MaterialsProject2020Compatibility corrections."""
    Vasprun = stack["Vasprun"]
    Compatibility = stack["MaterialsProject2020Compatibility"]

    try:
        run = Vasprun(
            str(vasprun_path),
            parse_dos=False,
            parse_eigen=False,
            parse_projected_eigen=False,
            parse_potcar_file=False,
        )
        entry = run.get_computed_entry(
            inc_structure=True,
            entry_id=f"user:{vasprun_path.parent.name}",
        )
    except Exception as exc:
        die(f"could not parse {vasprun_path}: {exc}")

    if not same_reduced_composition(entry.composition, target):
        die(
            f"vasprun composition is {entry.composition.reduced_formula}, "
            f"but --target is {target.reduced_formula}"
        )

    # Recent pymatgen Vasprun objects label plain PBE runs as "PBE", while
    # MaterialsProject2020Compatibility expects the synonymous label "GGA".
    run_type = entry.parameters.get("run_type")
    entry.parameters["run_type"] = {
        "PBE": "GGA",
        "PBE+U": "GGA+U",
    }.get(run_type, run_type)

    # MP2020 tries oxidation-state guessing with a 20-atom reduced-formula
    # limit.  LGPS has 25 atoms per reduced formula, so provide the same best
    # pymatgen guess explicitly and avoid a misleading size-limit warning.
    if "oxidation_states" not in entry.data:
        try:
            guesses = target.oxi_state_guesses(max_sites=-50)
        except ValueError:
            guesses = ()
        if guesses:
            entry.data["oxidation_states"] = guesses[0]

    try:
        processed = Compatibility(check_potcar=True).process_entry(
            entry,
            inplace=False,
            clean=True,
        )
    except Exception as exc:
        die(f"VASP entry is not MP2020-compatible: {exc}")
    if processed is None:
        die(
            "VASP entry was rejected by MaterialsProject2020Compatibility; "
            "check the POTCAR choices, Hubbard U values, and run type"
        )
    return processed


def build_phase_diagram(stack: dict[str, Any], entries: Sequence[Any]) -> Any:
    try:
        return stack["PhaseDiagram"](list(entries))
    except Exception as exc:
        die(f"could not build phase diagram: {exc}")


def compute_ehull(
    stack: dict[str, Any], competitors: Sequence[Any], target_entry: Any
) -> tuple[float, list[dict[str, Any]]]:
    """Compute target energy relative to a hull that excludes target stoichiometry."""
    phase_diagram = build_phase_diagram(stack, competitors)
    try:
        decomposition, ehull = phase_diagram.get_decomp_and_e_above_hull(
            target_entry,
            allow_negative=True,
        )
    except Exception as exc:
        die(f"could not evaluate target on the competitor hull: {exc}")

    products = [
        {
            "formula": entry.composition.reduced_formula,
            "amount": float(amount),
            "entry_id": str(entry.entry_id or "unknown"),
        }
        for entry, amount in decomposition.items()
    ]
    products.sort(key=lambda item: item["formula"])
    return float(ehull), products


def get_li_profile(
    stack: dict[str, Any], phase_diagram: Any, open_element: Any, target: Any
) -> list[dict[str, Any]]:
    """Return pymatgen's open-element profile for a target composition."""
    del stack  # Kept in the signature for compatibility with the analysis scripts.
    try:
        return phase_diagram.get_element_profile(open_element, target)
    except Exception as exc:
        die(f"could not build the {open_element} chemical-potential profile: {exc}")


def _format_coefficient(value: float) -> str:
    if abs(value - 1.0) < 1e-8:
        return ""
    if abs(value - round(value)) < 1e-8:
        return f"{round(value)} "
    return f"{value:.4g} "


def _reaction_products(reaction: Any, open_element: Any, include_open: bool) -> str:
    terms: list[str] = []
    for composition in reaction.products:
        is_open = (
            len(composition.elements) == 1
            and composition.elements[0] == open_element
        )
        if is_open and not include_open:
            continue
        coefficient = float(reaction.get_coeff(composition))
        if coefficient <= 1e-10:
            continue
        reduced_composition, reduction_factor = (
            composition.get_reduced_composition_and_factor()
        )
        coefficient *= float(reduction_factor)
        terms.append(
            f"{_format_coefficient(coefficient)}"
            f"{reduced_composition.reduced_formula}"
        )
    return " + ".join(terms) if terms else "(none)"


def make_plateaus(
    profile: Sequence[dict[str, Any]], xmax: float = 4.0
) -> list[Plateau]:
    """Convert pymatgen profile transitions into voltage intervals vs Li/Li+."""
    if xmax <= 0:
        die("--xmax must be positive")
    if not profile:
        return []

    points: list[tuple[float, dict[str, Any]]] = []
    for item in profile:
        reference_energy = float(item["element_reference"].energy_per_atom)
        voltage = -(float(item["chempot"]) - reference_energy)
        points.append((voltage, item))
    points.sort(key=lambda pair: pair[0])

    open_element = points[0][1]["element_reference"].composition.elements[0]
    plateaus: list[Plateau] = []
    for index, (voltage, item) in enumerate(points):
        next_voltage = points[index + 1][0] if index + 1 < len(points) else xmax
        left = max(0.0, voltage)
        right = min(xmax, next_voltage)
        if right - left <= 1e-9:
            continue

        reaction = item["reaction"]
        plateaus.append(
            Plateau(
                left_v=left,
                right_v=right,
                uptake=float(item["evolution"]),
                products=_reaction_products(reaction, open_element, False),
                products_with_li=_reaction_products(reaction, open_element, True),
            )
        )
        if right >= xmax:
            break
    return plateaus


def find_zero_window(
    plateaus: Sequence[Plateau], tol: float = 1e-6
) -> tuple[float, float] | None:
    """Return the widest contiguous interval with no open-element exchange."""
    groups: list[tuple[float, float]] = []
    start: float | None = None
    end: float | None = None
    for plateau in plateaus:
        if plateau.is_neutral(tol):
            if start is None or end is None or abs(plateau.left_v - end) > 1e-7:
                if start is not None and end is not None:
                    groups.append((start, end))
                start = plateau.left_v
            end = plateau.right_v
        elif start is not None and end is not None:
            groups.append((start, end))
            start = end = None
    if start is not None and end is not None:
        groups.append((start, end))
    return max(groups, key=lambda interval: interval[1] - interval[0]) if groups else None


def fmt_float(value: float, digits: int = 3) -> str:
    if abs(value) < 0.5 * 10 ** (-digits):
        value = 0.0
    return f"{value:.{digits}f}"


def latex_formula(formula: str) -> str:
    """Convert a plain chemical formula to simple matplotlib math text."""
    body = re.sub(r"([A-Z][a-z]?)", r"\\mathrm{\1}", formula)
    body = re.sub(r"(\d+(?:\.\d+)?)", r"_{\1}", body)
    return f"${body}$"


def set_nature_rcparams(plt: Any) -> None:
    plt.rcParams.update(
        {
            "font.family": "sans-serif",
            "font.size": 9,
            "axes.linewidth": 0.8,
            "xtick.direction": "in",
            "ytick.direction": "in",
            "savefig.transparent": False,
        }
    )


def style_axes(ax: Any) -> None:
    for spine in ax.spines.values():
        spine.set_linewidth(0.8)
    ax.tick_params(width=0.8, length=3)


def run_self_test() -> None:
    """Exercise composition matching and negative/positive hull energies offline."""
    stack = import_runtime_stack()
    Composition = stack["Composition"]
    ComputedEntry = stack["ComputedEntry"]

    target = Composition("Li10GeP2S12")
    assert chemsys_of(target) == ["Ge", "Li", "P", "S"]
    assert same_reduced_composition(target, Composition("Li20Ge2P4S24"))
    assert parse_thermo_types(["GGA_GGA+U"]) == ["GGA_GGA+U"]

    elemental = [
        ComputedEntry(symbol, 0.0, entry_id=f"test-{symbol}")
        for symbol in ("Li", "Ge", "P", "S")
    ]
    below_hull = ComputedEntry(target, -25.0, entry_id="test-LGPS")
    ehull, products = compute_ehull(stack, elemental, below_hull)
    assert abs(ehull + 1.0) < 1e-10
    assert len(products) == 4

    test_plateaus = [
        Plateau(0.0, 1.5, 2.0, "Li2S", "Li2S"),
        Plateau(1.5, 2.5, 0.0, "LGPS", "LGPS"),
        Plateau(2.5, 4.0, -1.0, "S", "S + Li"),
    ]
    assert find_zero_window(test_plateaus) == (1.5, 2.5)
    assert fmt_float(-1e-12, 3) == "0.000"
    print("self-test passed")
