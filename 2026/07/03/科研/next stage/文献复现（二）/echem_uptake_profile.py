#!/usr/bin/env python3
"""Plot the Li-uptake profile of LGPS (Li10GeP2S12).

The Li chemical potential is converted to voltage vs Li/Li+, and each
constant-equilibrium interval is plotted as Li uptake per LGPS formula unit.
This complements (but is not the same figure as) the three grand-potential
phase diagrams in Mo, Ong and Ceder, Chem. Mater. 2012, 24, 15-17,
DOI: 10.1021/cm203303y.

Example
-------
export MP_API_KEY="your-key"
python3 echem_uptake_profile.py \
  --vasprun conf_044093/vasprun.xml \
  --out-prefix echem_uptake_LGPS
"""

from __future__ import annotations

import argparse
import csv
import json
import textwrap
from dataclasses import asdict
from pathlib import Path
from typing import Any, Optional

import phase_stability_common as common


def wrap_products_for_plot(text: str, max_chars: int) -> str:
    """Wrap product lists at plus signs without breaking chemical formulae."""
    terms = [term.strip() for term in text.split(" + ")]
    lines: list[str] = []
    current = ""
    for term in terms:
        candidate = term if not current else f"{current} + {term}"
        if current and len(candidate) > max_chars:
            lines.append(current)
            current = term
        else:
            current = candidate
    if current:
        lines.append(current)
    return "\n".join(lines) if lines else textwrap.fill(text, max_chars)


def place_callout_labels(
    axis: Any,
    figure: Any,
    plateaus: list[common.Plateau],
    args: argparse.Namespace,
) -> None:
    """Place non-overlapping product labels above their voltage plateaus."""
    if not plateaus:
        return

    neutral_color = "#2f6b3e"
    items: list[dict[str, Any]] = []
    for plateau in plateaus:
        source = (
            plateau.products_with_li if args.show_li else plateau.products
        )
        neutral = plateau.is_neutral(args.zero_tol)
        midpoint = 0.5 * (plateau.left_v + plateau.right_v)
        artist = axis.text(
            midpoint,
            plateau.uptake,
            wrap_products_for_plot(source, args.label_chars),
            fontsize=args.label_size,
            ha="center",
            va="bottom",
            color=neutral_color if neutral else "#1a1a1a",
            fontweight="bold" if neutral else "normal",
            linespacing=1.1,
            zorder=6,
            clip_on=False,
        )
        items.append(
            {
                "text": artist,
                "plateau": plateau,
                "midpoint": midpoint,
                "neutral": neutral,
            }
        )

    figure.canvas.draw()
    renderer = figure.canvas.get_renderer()
    transform = axis.transData
    inverse = transform.inverted()
    for item in items:
        bounds = item["text"].get_window_extent(renderer=renderer)
        item["width_px"] = bounds.width
        item["height_px"] = bounds.height

    row_height = max(item["height_px"] for item in items) + 10.0
    axis_bounds = axis.get_window_extent(renderer=renderer)
    rows: list[list[tuple[float, float]]] = []

    for item in items:
        width = item["width_px"]
        anchor = transform.transform(
            (item["midpoint"], item["plateau"].uptake)
        )
        center_x = min(
            max(anchor[0], axis_bounds.x0 + 4.0 + width / 2.0),
            axis_bounds.x1 - 4.0 - width / 2.0,
        )
        left, right = center_x - width / 2.0 - 6.0, center_x + width / 2.0 + 6.0

        row_index = -1
        for index, intervals in enumerate(rows):
            if all(right <= old_left or left >= old_right for old_left, old_right in intervals):
                intervals.append((left, right))
                row_index = index
                break
        if row_index < 0:
            row_index = len(rows)
            rows.append([(left, right)])

        label_y = axis_bounds.y1 + (row_index + 1) * row_height
        label_position = inverse.transform((center_x, label_y))
        item["text"].set_position(label_position)
        leader_color = neutral_color if item["neutral"] else "#9aa0a6"
        line_start = inverse.transform((anchor[0], anchor[1] + 2.0))
        line_end = inverse.transform((center_x, label_y - 2.0))
        axis.plot(
            [line_start[0], line_end[0]],
            [line_start[1], line_end[1]],
            color=leader_color,
            lw=0.6,
            zorder=4,
            clip_on=False,
        )


def plot_figure(
    plateaus: list[common.Plateau],
    window: Optional[tuple[float, float]],
    args: argparse.Namespace,
    png_path: Path,
    pdf_path: Path,
) -> None:
    try:
        import matplotlib.pyplot as plt
    except ImportError:
        common.die("matplotlib is required to create the uptake figure")

    common.set_nature_rcparams(plt)
    figure, axis = plt.subplots(figsize=(7.5, 4.6))
    figure.subplots_adjust(left=0.12, right=0.97, top=0.78, bottom=0.16)

    y_values = [plateau.uptake for plateau in plateaus]
    y_min = min(y_values + [0.0])
    y_max = max(y_values + [0.0])
    y_span = max(1.0, y_max - y_min)

    if window:
        axis.axvspan(
            window[0], window[1], facecolor="#cfe3d6", alpha=0.55, zorder=0
        )
        for voltage in window:
            axis.axvline(
                voltage, color="#3d6b4d", linestyle="--", linewidth=0.8
            )
            axis.text(
                voltage,
                y_max + 0.10 * y_span,
                f"{voltage:.2f} V",
                ha="center",
                va="bottom",
                fontsize=8,
                color="#3d6b4d",
            )
    axis.axhline(0.0, color="#777777", linewidth=0.7, zorder=1)

    neutral_color = "#2f6b3e"
    for index, plateau in enumerate(plateaus):
        color = neutral_color if plateau.is_neutral(args.zero_tol) else "black"
        axis.plot(
            [plateau.left_v, plateau.right_v],
            [plateau.uptake, plateau.uptake],
            color=color,
            linewidth=1.8,
            solid_capstyle="butt",
        )
        if index + 1 < len(plateaus):
            next_plateau = plateaus[index + 1]
            axis.plot(
                [plateau.right_v, plateau.right_v],
                [plateau.uptake, next_plateau.uptake],
                color="black",
                linewidth=1.8,
                solid_capstyle="butt",
            )

    axis.set_xlim(args.xmin, args.xmax)
    axis.set_ylim(y_min - 0.15 * y_span, y_max + 0.20 * y_span)
    axis.set_xlabel(r"Voltage vs Li/Li$^+$ (V)")
    axis.set_ylabel("Li uptake per LGPS formula unit")
    if args.title:
        axis.set_title(args.title, pad=8)
    common.style_axes(axis)

    labels = [
        plateau
        for plateau in plateaus
        if plateau.width >= args.min_label_width or args.label_all
    ]
    place_callout_labels(axis, figure, labels, args)
    figure.savefig(
        png_path, dpi=args.dpi, bbox_inches="tight", pad_inches=0.03
    )
    figure.savefig(pdf_path, bbox_inches="tight", pad_inches=0.03)
    plt.close(figure)


def build_profile(
    args: argparse.Namespace,
) -> tuple[list[dict[str, Any]], list[common.Plateau], dict[str, Any]]:
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
        f"[info] MP entries      : {len(mp_entries)}; "
        f"{len(mp_target)} target entries removed; "
        f"{len(competitors)} competitors retained"
    )

    phase_diagram = common.build_phase_diagram(stack, competitors + [my_entry])
    li_reference = float(phase_diagram.el_refs[open_element].energy_per_atom)

    sanity: dict[str, Any] = {}
    if mp_target:
        reference_pd = common.build_phase_diagram(
            stack, competitors + mp_target + [my_entry]
        )
        best_mp = min(mp_target, key=lambda entry: entry.energy_per_atom)
        mine_formation = float(reference_pd.get_form_energy_per_atom(my_entry))
        mp_formation = float(reference_pd.get_form_energy_per_atom(best_mp))
        sanity = {
            "my_formation_energy_ev_per_atom": mine_formation,
            "mp_formation_energy_ev_per_atom": mp_formation,
            "delta_mev_per_atom": 1000.0 * (mine_formation - mp_formation),
            "mp_entry_id": str(best_mp.entry_id),
        }
        print(
            f"[sanity] formation-energy delta vs MP target = "
            f"{sanity['delta_mev_per_atom']:+.2f} meV/atom"
        )

    ehull, decomposition = common.compute_ehull(stack, competitors, my_entry)
    print(f"[phase] E_above_hull = {1000.0 * ehull:+.1f} meV/atom")
    profile = common.get_li_profile(
        stack, phase_diagram, open_element, target
    )
    plateaus = common.make_plateaus(profile, xmax=args.xmax)
    if not plateaus:
        common.die("no Li-uptake plateaus were generated")

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
        "li_metal_reference_energy_ev_per_atom": li_reference,
        "sanity": sanity,
        "phase_ehull_mev_per_atom": 1000.0 * ehull,
        "phase_decomposition": decomposition,
    }
    return profile, plateaus, metadata


def save_outputs(
    args: argparse.Namespace,
    profile: list[dict[str, Any]],
    plateaus: list[common.Plateau],
    metadata: dict[str, Any],
) -> None:
    output_prefix = Path(args.out_prefix).expanduser()
    output_prefix.parent.mkdir(parents=True, exist_ok=True)
    csv_path = output_prefix.with_suffix(".csv")
    json_path = output_prefix.with_suffix(".json")
    png_path = output_prefix.with_suffix(".png")
    pdf_path = output_prefix.with_suffix(".pdf")

    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "V_left",
                "V_right",
                "width",
                "Li_uptake_per_LGPS_fu",
                "no_Li_exchange",
                "products",
                "products_with_Li",
                "reaction",
            ],
        )
        writer.writeheader()
        for plateau in plateaus:
            writer.writerow(
                {
                    "V_left": plateau.left_v,
                    "V_right": plateau.right_v,
                    "width": plateau.width,
                    "Li_uptake_per_LGPS_fu": plateau.uptake,
                    "no_Li_exchange": plateau.is_neutral(args.zero_tol),
                    "products": plateau.products,
                    "products_with_Li": plateau.products_with_li,
                    "reaction": plateau.reaction,
                }
            )

    raw_profile = []
    for item in profile:
        reference = float(item["element_reference"].energy_per_atom)
        raw_profile.append(
            {
                "voltage_v": -(float(item["chempot"]) - reference),
                "chempot_ev": float(item["chempot"]),
                "Li_evolution_per_LGPS_fu": float(item["evolution"]),
                "reaction": str(item["reaction"]),
                "entry_ids": [str(entry.entry_id) for entry in item["entries"]],
            }
        )

    window = common.find_zero_window(plateaus, tol=args.zero_tol)
    with json_path.open("w", encoding="utf-8") as handle:
        json.dump(
            {
                "metadata": metadata,
                "no_Li_exchange_window_v": list(window) if window else None,
                "profile_breakpoints": raw_profile,
                "plateaus": [asdict(plateau) for plateau in plateaus],
            },
            handle,
            indent=2,
            ensure_ascii=False,
        )

    print("\nLGPS Li-uptake plateaus:")
    print(f"{'V interval':>19} | {'Li uptake':>10} | products")
    print("-" * 100)
    for plateau in plateaus:
        products = (
            plateau.products_with_li if args.show_li else plateau.products
        )
        print(
            f"{plateau.left_v:7.3f}-{plateau.right_v:<7.3f} V | "
            f"{plateau.uptake:10.3f} | {products}"
        )
    if window:
        print(
            f"\nNo-net-Li-exchange interval: {window[0]:.3f}-"
            f"{window[1]:.3f} V"
        )
        print(
            "This interval does not erase the ordinary-hull decomposition "
            "driving force reported above."
        )

    plot_figure(plateaus, window, args, png_path, pdf_path)
    for path in (png_path, pdf_path, csv_path, json_path):
        print(f"[saved] {path}")


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Plot the Li-uptake profile of LGPS vs Li/Li+."
    )
    common.add_common_args(parser)
    parser.add_argument(
        "--open-element", default=common.DEFAULT_OPEN_ELEMENT, help="Default: Li."
    )
    parser.add_argument(
        "--out-prefix",
        default="echem_uptake_LGPS",
        help="Output prefix for PNG/PDF/CSV/JSON.",
    )
    parser.add_argument("--xmin", type=float, default=0.0)
    parser.add_argument("--xmax", type=float, default=4.0)
    parser.add_argument("--zero-tol", type=float, default=1e-6)
    parser.add_argument("--min-label-width", type=float, default=0.12)
    parser.add_argument("--label-all", action="store_true")
    parser.add_argument("--show-li", action="store_true")
    parser.add_argument("--label-size", type=float, default=7.5)
    parser.add_argument("--label-chars", type=int, default=30)
    parser.add_argument("--dpi", type=int, default=600)
    parser.add_argument("--title", default=None)
    return parser.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> int:
    args = parse_args(argv)
    if args.self_test:
        common.run_self_test()
        return 0
    profile, plateaus, metadata = build_profile(args)
    save_outputs(args, profile, plateaus, metadata)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
