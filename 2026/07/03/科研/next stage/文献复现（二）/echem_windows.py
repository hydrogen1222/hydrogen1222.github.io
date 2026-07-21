#!/usr/bin/env python3
"""Electrochemical stability window of LGPS (Li10GeP2S12).

The Ge-Li-P-S phase diagram is opened to Li.  Sweeping the Li chemical
potential gives voltage plateaus vs Li/Li+, the interval with no net Li
exchange, and the reduction/oxidation products immediately outside it.

The target VASP entry and Materials Project competitors use the same MP2020
compatible PBE GGA/GGA+U energy scheme as ``LGPS_phase_stability.py``.

Example
-------
export MP_API_KEY="your-key"
python3 echem_windows.py \
  --vasprun conf_044093/vasprun.xml \
  --out-prefix echem_window_LGPS
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from pathlib import Path
from typing import Any, Optional

import phase_stability_common as common


def build_window(
    args: argparse.Namespace,
) -> tuple[list[common.Plateau], Optional[tuple[float, float]], dict[str, Any]]:
    vasprun_path = Path(args.vasprun).expanduser().resolve()
    if not vasprun_path.is_file():
        common.die(f"vasprun.xml not found: {vasprun_path}")

    stack = common.import_runtime_stack()
    Composition = stack["Composition"]
    Element = stack["Element"]
    try:
        target = Composition(args.target)
        open_element = Element(args.open_element)
    except Exception as exc:
        common.die(f"invalid target/open element: {exc}")
    if open_element not in target.elements:
        common.die(f"open element {open_element} is not present in {args.target}")

    target_label = args.target.replace(" ", "")
    chemsys = common.chemsys_of(target)
    thermo_types = common.parse_thermo_types(args.thermo_types)
    api_key = common.resolve_api_key(args)

    print(f"[info] target          : {target_label}")
    print(f"[info] open element    : {open_element.symbol}")
    print(f"[info] chemical system : {'-'.join(chemsys)}")
    print(f"[info] vasprun         : {vasprun_path}")

    my_entry = common.load_my_entry(stack, vasprun_path, target)
    mp_entries = common.pull_mp_entries(
        stack, api_key, chemsys, thermo_types
    )
    mp_target, competitors = common.split_target_competitors(mp_entries, target)
    print(
        f"[info] MP entries      : {len(mp_entries)} "
        f"({', '.join(thermo_types)}, MP2020 corrected)"
    )
    print(
        f"[info] target entries  : {len(mp_target)} removed; "
        f"{len(competitors)} competitors retained"
    )

    ehull, phase_decomposition = common.compute_ehull(
        stack, competitors, my_entry
    )
    print(
        f"[phase] E_above_hull vs different-composition competitors "
        f"= {1000.0 * ehull:+.1f} meV/atom"
    )
    if ehull > args.zero_tol:
        print(
            "[note] The target is chemically metastable. The electrochemical "
            "window below means no net Li exchange, not zero neutral "
            "decomposition driving force."
        )

    phase_diagram = common.build_phase_diagram(stack, competitors + [my_entry])
    profile = common.get_li_profile(
        stack, phase_diagram, open_element, target
    )
    plateaus = common.make_plateaus(profile, xmax=args.xmax)
    window = common.find_zero_window(plateaus, tol=args.zero_tol)

    print(
        f"\n{'voltage interval':>19} | {'Li uptake':>10} | "
        f"{'regime':>9} | products"
    )
    print("-" * 105)
    for plateau in plateaus:
        if plateau.is_neutral(args.zero_tol):
            regime = "no Li"
        elif plateau.uptake > 0:
            regime = "reduction"
        else:
            regime = "oxidation"
        products = (
            plateau.products_with_li if args.show_li else plateau.products
        )
        interval = (
            f"{common.fmt_float(plateau.left_v, 3)}-"
            f"{common.fmt_float(plateau.right_v, 3)} V"
        )
        print(
            f"{interval:>19} | {common.fmt_float(plateau.uptake, 3):>10} | "
            f"{regime:>9} | {products}"
        )

    metadata = {
        "target": target_label,
        "pymatgen_reduced_formula": target.reduced_formula,
        "open_element": open_element.symbol,
        "chemical_system": chemsys,
        "vasprun": str(vasprun_path),
        "thermo_types": thermo_types,
        "mp_entries_pulled": len(mp_entries),
        "mp_target_entries_removed": len(mp_target),
        "competitors_retained": len(competitors),
        "phase_ehull_mev_per_atom": 1000.0 * ehull,
        "phase_decomposition": phase_decomposition,
        "window_v": list(window) if window else None,
    }
    return plateaus, window, metadata


def edge_products(
    plateaus: list[common.Plateau],
    window: Optional[tuple[float, float]],
    args: argparse.Namespace,
) -> tuple[str, str, Optional[float], Optional[float]]:
    """Return products immediately below and above the no-Li window."""
    if not window:
        return "(no no-Li window)", "(no no-Li window)", None, None

    low, high = window
    neutral_indices = [
        index
        for index, plateau in enumerate(plateaus)
        if plateau.is_neutral(args.zero_tol)
        and plateau.right_v > low - 1e-7
        and plateau.left_v < high + 1e-7
    ]
    if not neutral_indices:
        return "(not found)", "(not found)", low, high

    source = lambda plateau: (
        plateau.products_with_li if args.show_li else plateau.products
    )
    first, last = min(neutral_indices), max(neutral_indices)
    reduction = (
        source(plateaus[first - 1])
        if first > 0
        else "(stable against Li metal within plotted range)"
    )
    oxidation = (
        source(plateaus[last + 1])
        if last + 1 < len(plateaus)
        else "(none within plotted range)"
    )
    return reduction, oxidation, low, high


def plot_window(
    window: Optional[tuple[float, float]],
    reduction: str,
    oxidation: str,
    metadata: dict[str, Any],
    args: argparse.Namespace,
    png_path: Path,
    pdf_path: Path,
) -> None:
    """Render the no-Li-exchange interval as a banded figure."""
    try:
        import matplotlib.pyplot as plt
    except ImportError:
        common.die("matplotlib is required to write the PNG/PDF figure")

    common.set_nature_rcparams(plt)
    xmax = args.xmax
    fig, axis = plt.subplots(figsize=(7.6, 2.35))
    fig.subplots_adjust(left=0.07, right=0.97, top=0.86, bottom=0.23)

    if window:
        low, high = window
        axis.axvspan(0, low, color="#e74c3c", alpha=0.18)
        axis.axvspan(low, high, color="#2ecc71", alpha=0.30)
        axis.axvspan(high, xmax, color="#3498db", alpha=0.18)
        for voltage in (low, high):
            axis.axvline(voltage, color="black", ls="--", lw=0.8)
            axis.text(
                voltage,
                1.06,
                f"{voltage:.2f} V",
                ha="center",
                va="bottom",
                fontsize=8,
            )
        axis.text(
            (low + high) / 2,
            0.5,
            f"{common.latex_formula(metadata['target'])}\nno Li exchange\n"
            f"({high - low:.2f} V)",
            ha="center",
            va="center",
            fontsize=8.5,
            weight="bold",
        )
        axis.text(
            low / 2,
            0.5,
            f"reduction\n{reduction}",
            ha="center",
            va="center",
            fontsize=7.2,
        )
        axis.text(
            (high + xmax) / 2,
            0.5,
            f"oxidation\n{oxidation}",
            ha="center",
            va="center",
            fontsize=7.2,
        )
    else:
        axis.text(
            xmax / 2,
            0.5,
            "no zero-Li-exchange plateau found",
            ha="center",
            va="center",
            fontsize=9,
        )

    axis.set_xlim(0, xmax)
    axis.set_ylim(0, 1)
    axis.set_yticks([])
    axis.set_xlabel(r"Voltage vs Li/Li$^+$ (V)")
    if args.title:
        axis.set_title(args.title, pad=6)
    common.style_axes(axis)
    axis.spines["left"].set_visible(False)
    axis.spines["right"].set_visible(False)
    axis.tick_params(left=False)

    fig.savefig(png_path, dpi=args.dpi, bbox_inches="tight", pad_inches=0.03)
    fig.savefig(pdf_path, bbox_inches="tight", pad_inches=0.03)
    plt.close(fig)


def save_outputs(
    args: argparse.Namespace,
    plateaus: list[common.Plateau],
    window: Optional[tuple[float, float]],
    metadata: dict[str, Any],
) -> None:
    output_prefix = Path(args.out_prefix).expanduser()
    output_prefix.parent.mkdir(parents=True, exist_ok=True)
    reduction, oxidation, low, high = edge_products(plateaus, window, args)

    if window and low is not None and high is not None:
        print("\n" + "=" * 76)
        print(
            f"No-Li-exchange window of {metadata['target']}: "
            f"{low:.3f}-{high:.3f} V (width {high - low:.3f} V)"
        )
        print(f"  reduction below {low:.3f} V -> {reduction}")
        print(f"  oxidation above {high:.3f} V -> {oxidation}")
        print("=" * 76)
    else:
        print("\nNo zero-Li-exchange plateau found; inspect the full profile above.")

    png_path = output_prefix.with_suffix(".png")
    pdf_path = output_prefix.with_suffix(".pdf")
    json_path = output_prefix.with_suffix(".json")
    plot_window(
        window,
        reduction,
        oxidation,
        metadata,
        args,
        png_path,
        pdf_path,
    )
    summary = {
        **metadata,
        "reduction_products_below_window": reduction,
        "oxidation_products_above_window": oxidation,
        "plateaus": [asdict(plateau) for plateau in plateaus],
    }
    with json_path.open("w", encoding="utf-8") as handle:
        json.dump(summary, handle, indent=2, ensure_ascii=False)

    print(f"\n[saved] {png_path}")
    print(f"[saved] {pdf_path}")
    print(f"[saved] {json_path}")


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "LGPS Li10GeP2S12 electrochemical window vs Li/Li+ using "
            "MP GGA/GGA+U competitors and a VASP vasprun.xml."
        )
    )
    common.add_common_args(parser)
    parser.add_argument(
        "--open-element",
        default=common.DEFAULT_OPEN_ELEMENT,
        help="Open element (default: Li).",
    )
    parser.add_argument(
        "--out-prefix",
        default="echem_window_LGPS",
        help="Output prefix for PNG, PDF, and JSON.",
    )
    parser.add_argument(
        "--xmax",
        type=float,
        default=4.0,
        help="Maximum plotted voltage (default: 4.0 V).",
    )
    parser.add_argument(
        "--zero-tol",
        type=float,
        default=1e-6,
        help="Absolute Li-uptake tolerance for the no-exchange window.",
    )
    parser.add_argument(
        "--show-li",
        action="store_true",
        help="Include free Li in oxidation-product labels.",
    )
    parser.add_argument("--dpi", type=int, default=600, help="PNG resolution.")
    parser.add_argument("--title", default=None, help="Custom plot title.")
    return parser.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> int:
    args = parse_args(argv)
    if args.self_test:
        common.run_self_test()
        return 0
    plateaus, window, metadata = build_window(args)
    save_outputs(args, plateaus, window, metadata)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
