#!/usr/bin/env python3
"""Recreate the three Li grand-potential diagrams in Mo et al. Figure 1.

Reference: Y. Mo, S. P. Ong, G. Ceder, Chem. Mater. 2012, 24, 15-17,
DOI: 10.1021/cm203303y.

Li is treated as an open component, so the Li-Ge-P-S quaternary system
projects onto a Ge-P-S ternary diagram.  The paper's three panels use Li
chemical potentials relative to metallic Li of 0, -1.8 and -2.5 eV.

Example
-------
export MP_API_KEY="your-key"
python3 LGPS_grand_potential_figure1.py \
  --vasprun conf_044093/vasprun.xml \
  --out-prefix LGPS_grand_potential_Figure1
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any, Optional, Sequence

import phase_stability_common as common


PAPER_MU_LI = (0.0, -1.8, -2.5)


def build_grand_diagrams(
    args: argparse.Namespace,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    vasprun_path = Path(args.vasprun).expanduser().resolve()
    if not vasprun_path.is_file():
        common.die(f"vasprun.xml not found: {vasprun_path}")

    stack = common.import_runtime_stack()
    Composition = stack["Composition"]
    Element = stack["Element"]
    try:
        from pymatgen.analysis.phase_diagram import (
            GrandPotentialPhaseDiagram,
            PDPlotter,
            triangular_coord,
        )
    except ImportError:
        common.die("pymatgen grand-potential plotting classes are unavailable")

    try:
        target = Composition(args.target)
        open_element = Element(args.open_element)
    except Exception as exc:
        common.die(f"invalid target/open element: {exc}")
    if open_element not in target.elements:
        common.die(f"{open_element} is not present in target {args.target}")
    if any(delta_mu > 1e-8 for delta_mu in args.mu_li):
        common.die("relative Li chemical potential cannot exceed metallic Li (0 eV)")

    target_label = args.target.replace(" ", "")
    chemsys = common.chemsys_of(target)
    thermo_types = common.parse_thermo_types(args.thermo_types)
    api_key = common.resolve_api_key(args)
    my_entry = common.load_my_entry(stack, vasprun_path, target)
    mp_entries = common.pull_mp_entries(
        stack, api_key, chemsys, thermo_types
    )
    mp_target, competitors = common.split_target_competitors(mp_entries, target)
    entries = competitors + [my_entry]

    ordinary_pd = common.build_phase_diagram(stack, entries)
    li_reference = float(ordinary_pd.el_refs[open_element].energy_per_atom)
    target_without_li = Composition(
        {
            element: amount
            for element, amount in target.items()
            if element != open_element
        }
    )

    print(f"[info] target             : {target_label}")
    print(f"[info] open element       : {open_element.symbol}")
    print(f"[info] projected ternary  : {'-'.join(str(x) for x in target_without_li.elements)}")
    print(f"[info] MP entries         : {len(mp_entries)}")
    print(f"[info] MP target removed  : {len(mp_target)}")
    print(f"[info] Li-metal reference : {li_reference:+.8f} eV/atom")

    panels: list[dict[str, Any]] = []
    for delta_mu in args.mu_li:
        absolute_mu = li_reference + float(delta_mu)
        grand_pd = GrandPotentialPhaseDiagram(
            entries,
            {open_element: absolute_mu},
        )
        plotter = PDPlotter(
            grand_pd,
            show_unstable=0,
            backend="matplotlib",
        )
        target_xy = triangular_coord(grand_pd.pd_coords(target_without_li))
        decomposition = grand_pd.get_decomposition(target_without_li)
        products = []
        for entry, amount in decomposition.items():
            original = entry.original_entry
            products.append(
                {
                    "formula": original.composition.reduced_formula,
                    "fraction_on_non_li_basis": float(amount),
                    "entry_id": str(original.entry_id or "unknown"),
                }
            )
        products.sort(key=lambda product: product["formula"])

        stable_phases = []
        for entry in grand_pd.stable_entries:
            original = entry.original_entry
            stable_phases.append(
                {
                    "formula": original.composition.reduced_formula,
                    "entry_id": str(original.entry_id or "unknown"),
                }
            )
        stable_phases.sort(key=lambda phase: (phase["formula"], phase["entry_id"]))

        print(
            f"\n[panel] Delta mu_Li={delta_mu:+.3f} eV "
            f"(V={max(0.0, -delta_mu):.3f} V vs Li/Li+)"
        )
        print(
            "        LGPS equilibrium: "
            + " + ".join(product["formula"] for product in products)
        )
        panels.append(
            {
                "delta_mu_li_ev": float(delta_mu),
                "absolute_mu_li_ev": absolute_mu,
                "voltage_vs_li_v": -float(delta_mu),
                "grand_pd": grand_pd,
                "plotter": plotter,
                "target_xy": [float(target_xy[0]), float(target_xy[1])],
                "target_products": products,
                "stable_phases": stable_phases,
            }
        )

    metadata = {
        "reference": "Mo, Ong, Ceder, Chem. Mater. 2012, DOI 10.1021/cm203303y",
        "target": target_label,
        "open_element": open_element.symbol,
        "chemical_system": chemsys,
        "projected_composition": target_without_li.reduced_formula,
        "vasprun": str(vasprun_path),
        "thermo_types": thermo_types,
        "mp_entries_pulled": len(mp_entries),
        "mp_target_entries_removed": len(mp_target),
        "competitors_retained": len(competitors),
        "li_metal_reference_energy_ev_per_atom": li_reference,
    }
    return panels, metadata


def _entry_label(entry: Any) -> str:
    return common.latex_formula(entry.original_entry.composition.reduced_formula)


def draw_panel(
    axis: Any,
    panel: dict[str, Any],
    panel_letter: str,
    target_label: str,
    args: argparse.Namespace,
) -> None:
    """Draw one Ge-P-S ternary grand-potential diagram."""
    from pymatgen.analysis.phase_diagram import triangular_coord

    grand_pd = panel["grand_pd"]
    lines, stable_entries, _ = panel["plotter"].pd_plot_data
    palette = ("#f4d6a0", "#d8e8f5", "#dcefd4", "#eadcf2", "#f5dddd")

    # Light facet coloring makes the equilibrium triangles explicit.
    for index, simplex in enumerate(grand_pd.simplexes):
        facet_xy = triangular_coord(simplex.coords)
        axis.fill(
            facet_xy[0],
            facet_xy[1],
            color=palette[index % len(palette)],
            alpha=0.60,
            zorder=0,
        )
    for x_values, y_values in lines:
        axis.plot(x_values, y_values, color="black", lw=0.9, zorder=2)

    center = (0.5, math.sqrt(3.0) / 6.0)
    right_edge = [
        (coordinates, entry)
        for coordinates, entry in stable_entries.items()
        if abs(coordinates[1] - math.sqrt(3.0) * (1.0 - coordinates[0])) < 0.015
        and 0.06 < coordinates[1] < 0.82
    ]
    right_edge.sort(key=lambda item: item[0][1], reverse=True)
    right_label_y = {
        coordinates: 0.70 - index * (0.56 / max(1, len(right_edge) - 1))
        for index, (coordinates, _) in enumerate(right_edge)
    }
    bottom_edge = [
        (coordinates, entry)
        for coordinates, entry in stable_entries.items()
        if coordinates[1] < 0.06 and 0.03 < coordinates[0] < 0.97
    ]
    bottom_edge.sort(key=lambda item: item[0][0])
    bottom_label_positions = {
        coordinates: (
            0.27 + index * (0.62 / max(1, len(bottom_edge) - 1)),
            0.075 + 0.075 * (index % 2),
        )
        for index, (coordinates, _) in enumerate(bottom_edge)
    }

    for (x_coord, y_coord), entry in stable_entries.items():
        axis.scatter(
            [x_coord], [y_coord], s=18, color="black", zorder=4
        )
        vector_x, vector_y = x_coord - center[0], y_coord - center[1]
        norm = math.hypot(vector_x, vector_y)
        rotation = 0.0
        coordinate_key = (x_coord, y_coord)
        if coordinate_key in right_label_y:
            axis.annotate(
                _entry_label(entry),
                (x_coord, y_coord),
                xytext=(1.06, right_label_y[coordinate_key]),
                textcoords="data",
                ha="left",
                va="center",
                fontsize=args.label_size,
                arrowprops={"arrowstyle": "-", "color": "#777777", "lw": 0.55},
                zorder=5,
            )
            continue
        if coordinate_key in bottom_label_positions:
            label_x, label_y = bottom_label_positions[coordinate_key]
            axis.annotate(
                _entry_label(entry),
                (x_coord, y_coord),
                xytext=(label_x, label_y),
                textcoords="data",
                ha="center",
                va="bottom",
                fontsize=args.label_size,
                arrowprops={"arrowstyle": "-", "color": "#777777", "lw": 0.55},
                zorder=5,
            )
            continue
        if y_coord < 0.06 and 0.03 < x_coord < 0.97:
            offset_x, offset_y = 2.0, 5.0
            horizontal_alignment = "left"
            vertical_alignment = "bottom"
        elif norm > 1e-12:
            offset_x = 8.0 * vector_x / norm
            offset_y = 8.0 * vector_y / norm
            horizontal_alignment = (
                "left" if offset_x > 1 else ("right" if offset_x < -1 else "center")
            )
            vertical_alignment = "bottom" if offset_y > 0 else "top"
        else:
            offset_x, offset_y = 0.0, 7.0
            horizontal_alignment = "center"
            vertical_alignment = "bottom"
        axis.annotate(
            _entry_label(entry),
            (x_coord, y_coord),
            xytext=(offset_x, offset_y),
            textcoords="offset points",
            ha=horizontal_alignment,
            va=vertical_alignment,
            fontsize=args.label_size,
            rotation=rotation,
            zorder=5,
        )

    target_x, target_y = panel["target_xy"]
    axis.scatter(
        [target_x],
        [target_y],
        marker="x",
        s=55,
        linewidths=1.8,
        color="#1f5aa6",
        zorder=7,
    )
    axis.annotate(
        "LGPS",
        (target_x, target_y),
        xytext=(5, 7),
        textcoords="offset points",
        ha="left",
        va="bottom",
        fontsize=args.label_size,
        color="#1f5aa6",
        fontweight="bold",
        zorder=7,
    )

    # Explicit projected-component labels help readers new to ternary plots.
    elements = list(grand_pd.elements)
    component_style = {"fontsize": 8, "color": "#6b6b6b", "fontweight": "bold"}
    axis.text(0.045, 0.025, f"{elements[0].symbol} axis", ha="left", va="bottom", **component_style)
    axis.text(0.955, 0.025, f"{elements[1].symbol} axis", ha="right", va="bottom", **component_style)
    axis.text(0.5, 0.79, f"{elements[2].symbol} axis", ha="center", va="top", **component_style)

    delta_mu = panel["delta_mu_li_ev"]
    voltage = max(0.0, -delta_mu)
    axis.set_title(
        rf"({panel_letter})  $\Delta\mu_{{\rm Li}}={delta_mu:g}$ eV"
        + "\n"
        + rf"$V={voltage:g}$ V vs Li/Li$^+$",
        fontsize=9,
        pad=7,
    )
    axis.set_aspect("equal")
    axis.set_xlim(-0.10, 1.28)
    axis.set_ylim(-0.10, 0.98)
    axis.axis("off")


def save_outputs(
    args: argparse.Namespace,
    panels: list[dict[str, Any]],
    metadata: dict[str, Any],
) -> None:
    try:
        import matplotlib.pyplot as plt
    except ImportError:
        common.die("matplotlib is required to create Figure 1")

    common.set_nature_rcparams(plt)
    output_prefix = Path(args.out_prefix).expanduser()
    output_prefix.parent.mkdir(parents=True, exist_ok=True)

    figure, axes = plt.subplots(
        1,
        len(panels),
        figsize=(5.0 * len(panels), 4.3),
        squeeze=False,
    )
    for index, panel in enumerate(panels):
        draw_panel(
            axes[0][index],
            panel,
            chr(ord("a") + index),
            metadata["target"],
            args,
        )
    figure.suptitle(
        "Li grand-potential phase diagrams of the Li-Ge-P-S system",
        fontsize=11,
        y=0.98,
    )
    figure.tight_layout(rect=(0, 0, 1, 0.94))
    combined_png = output_prefix.with_suffix(".png")
    combined_pdf = output_prefix.with_suffix(".pdf")
    figure.savefig(combined_png, dpi=args.dpi, bbox_inches="tight")
    figure.savefig(combined_pdf, bbox_inches="tight")
    plt.close(figure)

    individual_paths = []
    for index, panel in enumerate(panels):
        panel_figure, panel_axis = plt.subplots(figsize=(5.1, 4.4))
        letter = chr(ord("a") + index)
        draw_panel(
            panel_axis,
            panel,
            letter,
            metadata["target"],
            args,
        )
        panel_figure.tight_layout()
        suffix = f"_{letter}_dmu_{panel['delta_mu_li_ev']:g}eV.png"
        panel_path = Path(f"{output_prefix}{suffix}")
        panel_figure.savefig(panel_path, dpi=args.dpi, bbox_inches="tight")
        plt.close(panel_figure)
        individual_paths.append(panel_path)

    serializable_panels = []
    for panel in panels:
        serializable_panels.append(
            {
                key: value
                for key, value in panel.items()
                if key not in {"grand_pd", "plotter"}
            }
        )
    json_path = output_prefix.with_suffix(".json")
    with json_path.open("w", encoding="utf-8") as handle:
        json.dump(
            {**metadata, "panels": serializable_panels},
            handle,
            indent=2,
            ensure_ascii=False,
        )

    print(f"\n[saved] {combined_png}")
    print(f"[saved] {combined_pdf}")
    for path in individual_paths:
        print(f"[saved] {path}")
    print(f"[saved] {json_path}")


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Draw the three Li grand-potential Ge-P-S diagrams from "
            "Mo/Ong/Ceder Figure 1 using current MP entries and your LGPS energy."
        )
    )
    common.add_common_args(parser)
    parser.add_argument(
        "--open-element", default=common.DEFAULT_OPEN_ELEMENT, help="Default: Li."
    )
    parser.add_argument(
        "--mu-li",
        nargs="+",
        type=float,
        default=list(PAPER_MU_LI),
        metavar="EV",
        help="Li chemical potentials relative to Li metal (default: 0 -1.8 -2.5).",
    )
    parser.add_argument(
        "--out-prefix",
        default="LGPS_grand_potential_Figure1",
        help="Output prefix for combined/individual figures and JSON.",
    )
    parser.add_argument("--label-size", type=float, default=7.0)
    parser.add_argument("--dpi", type=int, default=600)
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    if args.self_test:
        common.run_self_test()
        return 0
    panels, metadata = build_grand_diagrams(args)
    save_outputs(args, panels, metadata)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
