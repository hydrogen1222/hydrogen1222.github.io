#!/usr/bin/env python3
"""
Draw the Li-uptake electrochemical profile for Li6PS5Cl, i.e. the
Figure-4-style step plot in Deng/Zhu/Chu/Ong, Chem. Mater. 2017.

What it does
------------
1. Reads YOUR relaxed target structure from vasprun.xml as a ComputedEntry.
2. Applies MaterialsProject2020Compatibility to your entry.
3. Pulls MP GGA/GGA+U entries in the target chemical system.
4. Removes MP entries with the same reduced formula as the target, then adds
   your entry, so your enumerated ordering defines the target composition.
5. Uses PhaseDiagram.get_element_profile(open_element, target_composition) to
   scan the open Li chemical potential.
6. Converts mu_Li to voltage vs Li/Li+ and plots Li uptake per formula unit.
7. Saves a PNG, PDF, CSV, and JSON summary.

The shared data recipe (entry loading, MP pull, phase diagram, Li profile)
lives in lpsc_common.py; this script owns only the Figure-4 step plot.

Example
-------
python echem_uptake_profile.py \
  --api-key "$MP_API_KEY" \
  --vasprun /home/storm/Paper/MP/vasprun.xml \
  --out-prefix echem_uptake_LPSC

Test without mp-api/pymatgen/network
------------------------------------
python echem_uptake_profile.py --self-test
"""

from __future__ import annotations

import argparse
import csv
import json
import math
from pathlib import Path
from typing import Any, Optional

import lpsc_common as lc


def place_callout_labels(ax: Any, fig: Any, plateaus: list[lc.Plateau], args: argparse.Namespace) -> None:
    """Annotate each plateau with a staggered callout label + leader line.

    Labels are greedily packed into horizontal rows above the plot so that no
    two labels overlap, even when many narrow plateaus sit close together in
    voltage. Each label is connected to its plateau by a thin leader line,
    which keeps the curve itself uncluttered. Charge-neutral plateaus (no Li
    exchange) are drawn in green/bold so they are visually distinct from
    electrochemical-boundary plateaus that merely share the same non-Li products.
    """
    if not plateaus:
        return
    renderer = fig.canvas.get_renderer()
    trans = ax.transData
    inv = trans.inverted()
    neutral_color = "#2f6b3e"
    electro_color = "#1a1a1a"

    # Create text artists provisionally at the anchor so we can measure them.
    items: list[dict[str, Any]] = []
    for p in plateaus:
        source = p.products_with_li if args.show_li else p.products
        label = lc.wrap_products_for_plot(source, max_chars=args.label_chars)
        is_neut = p.is_neutral(args.zero_tol)
        x_mid = 0.5 * (p.left_v + p.right_v)
        t = ax.text(
            x_mid,
            p.uptake,
            label,
            fontsize=args.label_size,
            ha="center",
            va="bottom",
            color=neutral_color if is_neut else electro_color,
            fontweight="bold" if is_neut else "normal",
            linespacing=1.1,
            zorder=6,
            clip_on=False,
        )
        items.append({"text": t, "p": p, "x_mid": x_mid, "is_neut": is_neut})
    fig.canvas.draw()

    # Measure each label's display extent (size is position-independent at rot=0).
    for it in items:
        bb = it["text"].get_window_extent(renderer=renderer)
        it["w"] = bb.width
        it["h"] = bb.height
    row_height = max(it["h"] for it in items) + 10.0  # px vertical gap between rows
    pad_x = 6.0  # px horizontal gap between labels in the same row

    ax_bb = ax.get_window_extent(renderer=renderer)
    x0, x1, top = ax_bb.x0, ax_bb.x1, ax_bb.y1
    margin = 4.0  # px keep labels inside the axes horizontally

    rows: list[list[tuple[float, float]]] = []
    leader_gray = "#9aa0a6"

    for it in items:
        w = it["w"]
        anchor = trans.transform((it["x_mid"], it["p"].uptake))
        cx = anchor[0]
        # Keep the whole label box inside the axes.
        cx = min(max(cx, x0 + margin + w / 2.0), x1 - margin - w / 2.0)
        left, right = cx - w / 2.0 - pad_x, cx + w / 2.0 + pad_x

        # Greedily pick the lowest row without an x-overlap.
        placed_row = -1
        for ri, intervals in enumerate(rows):
            if all(right <= l or left >= r for (l, r) in intervals):
                intervals.append((left, right))
                placed_row = ri
                break
        if placed_row < 0:
            placed_row = len(rows)
            rows.append([(left, right)])

        label_y = top + (placed_row + 1) * row_height  # display px, above the axes
        data_pos = inv.transform((cx, label_y))
        it["text"].set_position((data_pos[0], data_pos[1]))
        it["text"].set_ha("center")
        it["text"].set_va("bottom")

        # Thin leader line from the plateau to the label.
        leader_color = neutral_color if it["is_neut"] else leader_gray
        a0 = inv.transform((anchor[0], anchor[1] + 2.0))
        a1 = inv.transform((cx, label_y - 2.0))
        ax.plot(
            [a0[0], a1[0]],
            [a0[1], a1[1]],
            color=leader_color,
            lw=0.6,
            zorder=4,
            clip_on=False,
        )
        ax.scatter([a0[0]], [a0[1]], s=5, color=leader_color, zorder=4, clip_on=False)


def plot_figure(
    stack: dict[str, Any],
    plateaus: list[lc.Plateau],
    metadata: dict[str, Any],
    win: Optional[tuple[float, float]],
    args: argparse.Namespace,
    png_path: Path,
    pdf_path: Path,
) -> None:
    """Render the Figure-4-style Li-uptake step plot to PNG + PDF."""
    plt = stack["plt"]
    lc.set_nature_rcparams(plt)

    fig, ax = plt.subplots(figsize=(7.2, 4.5))
    fig.subplots_adjust(left=0.12, right=0.96, top=0.95, bottom=0.16)

    # Build step arrays so the rightmost extension is included.
    xs = [plateaus[0].left_v]
    ys = [plateaus[0].uptake]
    for p in plateaus:
        if xs[-1] != p.left_v:
            xs.append(p.left_v)
            ys.append(p.uptake)
        xs.append(p.right_v)
        ys.append(p.uptake)

    y_vals = [p.uptake for p in plateaus]
    y_min = min(y_vals + [0.0])
    y_max = max(y_vals + [0.0])
    y_span = max(1.0, y_max - y_min)

    # Electrochemically stable (zero net Li uptake) window.
    if win:
        ax.axvspan(win[0], win[1], facecolor="#cfe3d6", alpha=0.55, zorder=0)
        for v in win:
            ax.axvline(v, color="#3d6b4d", linestyle="--", linewidth=0.8, zorder=1)

    # Zero-uptake reference line.
    ax.axhline(0.0, color="#7a7a7a", linewidth=0.7, zorder=1)

    neutral_color = "#2f6b3e"

    # The Li-uptake step profile. Neutral segments (no Li exchange) are drawn
    # in green directly within the step, so they are perfectly coincident with
    # the black line -- matching the visual style of Deng 2017 Fig. 4.
    for i, p in enumerate(plateaus):
        color = neutral_color if p.is_neutral(args.zero_tol) else "black"
        # Horizontal segment of the step (covers [left_v, right_v) at uptake)
        ax.plot([p.left_v, p.right_v], [p.uptake, p.uptake],
                color=color, linewidth=1.8, solid_capstyle="butt")
        # Vertical connecting step to next plateau
        if i + 1 < len(plateaus):
            next_p = plateaus[i + 1]
            ax.plot([p.right_v, p.right_v], [p.uptake, next_p.uptake],
                    color="black", linewidth=1.8, solid_capstyle="butt")

    ax.set_xlim(args.xmin, max(args.xmax or max(xs), max(xs)))
    ax.set_ylim(y_min - 0.18 * y_span, y_max + 0.22 * y_span)
    ax.set_xlabel(r"Voltage vs Li/Li$^+$ (V)")
    ax.set_ylabel("Li uptake per f.u.")
    if args.title:
        ax.set_title(args.title, pad=8)
    lc.style_axes(ax)

    # Voltage labels at the edges of the stable window.
    if win:
        for v in win:
            ax.text(
                v,
                y_max + 0.10 * y_span,
                f"{v:.2f} V",
                ha="center",
                va="bottom",
                fontsize=8,
                color="#3d6b4d",
            )

    # Legend: the charge-neutral green segment is part of the step profile itself.
    from matplotlib.lines import Line2D

    handles = [
        Line2D([0], [0], color="black", lw=1.8, label="Li uptake"),
        Line2D([0], [0], color=neutral_color, lw=1.8, label="charge-neutral (no Li exchange)"),
    ]
    ax.legend(handles=handles, loc="best", frameon=False, handlelength=1.6)

    # Non-overlapping product callouts (narrow plateaus skipped unless --label-all).
    labels = [p for p in plateaus if (p.width >= args.min_label_width or args.label_all)]
    place_callout_labels(ax, fig, labels, args)

    fig.savefig(png_path, dpi=args.dpi, bbox_inches="tight", pad_inches=0.03)
    fig.savefig(pdf_path, bbox_inches="tight", pad_inches=0.03)
    plt.close(fig)


def build_profile(args: argparse.Namespace) -> tuple[list[dict[str, Any]], list[lc.Plateau], dict[str, Any]]:
    # Validate the two most common user-side problems before importing heavy
    # packages, so failures are readable even outside the pymatgen environment.
    vasprun_path = Path(args.vasprun).expanduser()
    if not vasprun_path.exists():
        lc.die(f"vasprun.xml not found: {vasprun_path}")
    api_key = lc.resolve_api_key(args)

    stack = lc.import_runtime_stack()
    Composition = stack["Composition"]
    Element = stack["Element"]

    target = Composition(args.target)
    open_el = Element(args.open_element)
    chemsys = lc.chemsys_of(target)

    print(f"[info] target          : {target.reduced_formula}")
    print(f"[info] open element    : {open_el.symbol}")
    print(f"[info] chemical system : {'-'.join(chemsys)}")
    print(f"[info] vasprun         : {vasprun_path}")

    my_entry = lc.load_my_entry(stack, vasprun_path, target.reduced_formula)

    thermo_types = lc.parse_thermo_types(args.thermo_types)
    mp_entries = lc.pull_mp_entries(stack, api_key, chemsys, thermo_types)
    if not mp_entries:
        lc.die(f"MP returned zero entries for chemical system {'-'.join(chemsys)}")

    mp_target_entries, competitors = lc.split_target_competitors(mp_entries, target.reduced_formula)
    print(f"[info] pulled MP entries: {len(mp_entries)} ({', '.join(thermo_types)})")
    print(f"[info] MP target entries removed: {len(mp_target_entries)}")
    print(f"[info] competitor entries kept : {len(competitors)}")

    pd_full = lc.build_phase_diagram(stack, competitors + [my_entry])
    v_ref = pd_full.el_refs[open_el].energy_per_atom

    # Optional sanity: formation energy shift vs MP's own target.
    sanity: dict[str, Any] = {}
    if mp_target_entries:
        try:
            pd_ref = lc.build_phase_diagram(stack, competitors + mp_target_entries + [my_entry])
            best_mp = min(mp_target_entries, key=lambda e: e.energy_per_atom)
            e_mine = pd_ref.get_form_energy_per_atom(my_entry)
            e_mp = pd_ref.get_form_energy_per_atom(best_mp)
            delta_mev = 1000 * (e_mine - e_mp)
            sanity = {
                "my_form_e_per_atom": e_mine,
                "mp_best_form_e_per_atom": e_mp,
                "delta_mev_per_atom": delta_mev,
                "mp_best_entry_id": str(best_mp.entry_id),
            }
            print(
                f"[sanity] E_form/atom MP={e_mp:+.4f} eV, "
                f"yours={e_mine:+.4f} eV, Delta={delta_mev:+.1f} meV/atom"
            )
        except Exception as exc:
            print(f"[warn] sanity check vs MP target failed, continuing: {exc}")

    # Optional Ehull vs competitors only, useful for reporting.
    ehull_info: dict[str, Any] = {}
    try:
        ehull, decomp = lc.compute_ehull(stack, competitors, my_entry)
        ehull_info = {"ehull_mev_per_atom": 1000 * ehull, "decomposition": decomp}
        print(f"[phase] E_above_hull vs competitors = {1000 * ehull:+.1f} meV/atom")
        print("[phase] decomposition:")
        for d in ehull_info["decomposition"]:
            print(f"        {d['amount']:7.4f} x {d['formula']:12s} ({d['entry_id']})")

        # Reproduction diagnostic: Deng 2017 Fig. 4 assumes Li6PS5Cl is metastable
        # (sits ABOVE the competitor hull), so its zero-uptake plateau IS the
        # neutral Li3PS4 + Li2S + LiCl decomposition. If your DFT energy places
        # Li6PS5Cl on/inside the hull, the zero-uptake plateau becomes "Li6PS5Cl"
        # itself and the figure will not match the literature.
        if ehull <= args.zero_tol:
            print(
                "[warn] Your target is on/inside the competitor convex hull "
                f"(Ehull = {1000 * ehull:+.1f} meV/atom <= 0). The zero-uptake\n"
                "       plateau will therefore be labelled 'Li6PS5Cl' itself, NOT the neutral\n"
                "       Li3PS4 + Li2S + LiCl decomposition in Deng 2017 Fig. 4 (which assumes\n"
                "       Li6PS5Cl is metastable, i.e. ABOVE the hull). To reproduce that figure\n"
                "       your relaxed energy must place Li6PS5Cl slightly above the hull."
            )
    except Exception as exc:
        print(f"[warn] Ehull calculation failed, continuing profile plot: {exc}")

    # Element profile: the actual Figure-4 data.
    profile = lc.get_li_profile(stack, pd_full, open_el, target)

    xmax = args.xmax
    if xmax is None:
        xmax = max(4.0, math.ceil((max(float(s["V"]) for s in profile) + 0.2) * 10) / 10)
    plateaus = lc.make_plateaus(profile, xmax=xmax)
    if not plateaus:
        lc.die("No non-degenerate plateaus were generated from the profile.")

    metadata = {
        "target": target.reduced_formula,
        "open_element": open_el.symbol,
        "chemsys": chemsys,
        "vasprun": str(vasprun_path),
        "thermo_types": thermo_types,
        "mp_entries_pulled": len(mp_entries),
        "mp_target_entries_removed": len(mp_target_entries),
        "competitors_kept": len(competitors),
        "li_metal_reference_energy_per_atom": float(v_ref),
        "sanity": sanity,
        "phase_stability": ehull_info,
    }
    return profile, plateaus, metadata


def save_outputs(args: argparse.Namespace, profile: list[dict[str, Any]], plateaus: list[lc.Plateau], metadata: dict[str, Any]) -> None:
    stack = lc.import_runtime_stack()

    out_prefix = Path(args.out_prefix).expanduser()
    out_prefix.parent.mkdir(parents=True, exist_ok=True)

    # CSV: plateau table, easiest to inspect/replot.
    csv_path = out_prefix.with_suffix(".csv")
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "V_left",
                "V_right",
                "width",
                "Li_uptake_per_fu",
                "charge_neutral",
                "products",
                "products_with_Li",
                "reaction",
            ],
        )
        writer.writeheader()
        for p in plateaus:
            writer.writerow(
                {
                    "V_left": lc.fmt_float(p.left_v, 6),
                    "V_right": lc.fmt_float(p.right_v, 6),
                    "width": lc.fmt_float(p.width, 6),
                    "Li_uptake_per_fu": lc.fmt_float(p.uptake, 6),
                    "charge_neutral": str(p.is_neutral(args.zero_tol)),
                    "products": p.products,
                    "products_with_Li": p.products_with_li,
                    "reaction": p.reaction,
                }
            )

    # JSON: detailed metadata and raw profile, but with non-serializable objects removed.
    json_path = out_prefix.with_suffix(".json")
    raw_profile_json = [
        {
            "V": float(s["V"]),
            "chempot": float(s["chempot"]),
            "evolution": float(s["evolution"]),
            "products": str(s["products"]),
            "products_with_Li": str(s.get("products_with_li", "")),
            "reaction": str(s["reaction_str"]),
        }
        for s in profile
    ]
    with json_path.open("w", encoding="utf-8") as f:
        json.dump(
            {
                "metadata": metadata,
                "profile_breakpoints": raw_profile_json,
                "plateaus": [p.__dict__ for p in plateaus],
            },
            f,
            indent=2,
            ensure_ascii=False,
        )

    # Print table.
    print("\nFigure-4-style Li uptake plateaus:")
    print(f"{'V range / V':>21} | {'Li ups':>7} | {'kind':>6} | products (coeffs shown; Li hidden unless --show-li)")
    print("-" * 110)
    for p in plateaus:
        kind = "neut" if p.is_neutral(args.zero_tol) else ("Li-in" if p.uptake > 0 else "Li-out")
        label = p.products_with_li if args.show_li else p.products
        print(
            f"{lc.fmt_float(p.left_v, 3):>8} - {lc.fmt_float(p.right_v, 3):<8} | "
            f"{lc.fmt_float(p.uptake, 3):>7} | {kind:>6} | {label}"
        )

    win = lc.find_zero_window(plateaus, tol=args.zero_tol)
    if win:
        lo, hi = win
        print("\n" + "=" * 72)
        print(f"No-net-Li-uptake/loss window: {lo:.3f} - {hi:.3f} V, width {hi - lo:.3f} V")
        print("Note: this is NOT proof that the Li6PS5Cl phase lies on the ordinary hull.")
        print("=" * 72)
    else:
        print("\n[warn] No |Li uptake| ~= 0 plateau found. Try increasing --zero-tol slightly.")

    # Plot: clean, publication-quality step figure with non-overlapping callouts.
    png_path = out_prefix.with_suffix(".png")
    pdf_path = out_prefix.with_suffix(".pdf")
    plot_figure(stack, plateaus, metadata, win, args, png_path, pdf_path)
    print(f"\n[saved] {png_path}")
    print(f"[saved] {pdf_path}")
    print(f"[saved] {csv_path}")
    print(f"[saved] {json_path}")


def self_test() -> None:
    # All pure-helper assertions live in the shared module; just run them.
    lc.run_self_test()


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Draw a Figure-4-style Li uptake electrochemical profile using MP entries + your vasprun.xml."
    )
    lc.add_common_args(p)
    p.add_argument("--open-element", default=lc.DEFAULT_OPEN_ELEMENT, help="Open element, default Li.")
    p.add_argument("--out-prefix", default="echem_uptake_LPSC", help="Output prefix for PNG/PDF/CSV/JSON.")
    p.add_argument("--xmin", type=float, default=0.0, help="Minimum x-axis voltage.")
    p.add_argument("--xmax", type=float, default=4.0, help="Maximum x-axis voltage.")
    p.add_argument("--min-label-width", type=float, default=0.12, help="Only annotate plateaus wider than this voltage width unless --label-all.")
    p.add_argument("--label-all", action="store_true", help="Annotate all plateaus, including very narrow ones.")
    p.add_argument("--show-li", action="store_true", help="Include free Li in product labels when it is a reaction product (delithiation plateaus). Lithiation plateaus consume Li as a reactant; their Li exchange is read off the y-axis instead. The full balanced reaction is always in the CSV/JSON 'reaction' column.")
    p.add_argument("--label-size", type=float, default=8.0, help="Matplotlib font size for product callout labels.")
    p.add_argument("--label-chars", type=int, default=30, help="Wrap product labels after roughly this many characters.")
    p.add_argument("--dpi", type=int, default=600, help="PNG dpi.")
    p.add_argument("--title", default=None, help="Custom plot title.")
    return p.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> int:
    args = parse_args(argv)
    if args.self_test:
        self_test()
        return 0
    profile, plateaus, metadata = build_profile(args)
    save_outputs(args, profile, plateaus, metadata)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
